import { getSettings } from './store.js';
import { git } from './git.js';
import { t, getLang } from '../public/js/i18n.js';

const SYSTEM_PROMPT_ZH = `你是 Git 提交信息生成器。根据给出的 git diff 生成一条提交信息。
格式遵循 Conventional Commits：type(scope): 中文描述。
type 取值 feat/fix/refactor/docs/style/test/chore/perf。scope 用简短英文模块名，可省略。
描述用简体中文，一句话说清改了什么、为什么，不超过 60 字。
只输出提交信息本身，不要任何解释、引号或代码块。`;
const SYSTEM_PROMPT_EN = `You are a Git commit message generator. Produce one commit message from the given git diff.
Follow Conventional Commits: type(scope): description.
types: feat/fix/refactor/docs/style/test/chore/perf. scope: short English module name, optional.
Description in English, one sentence, <= 60 chars, what changed and why.
Output only the commit message itself, no explanations, quotes or code blocks.`;
const systemPrompt = () => (getLang() === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_ZH);

export async function generateCommitMessage(cwd, { amend = false } = {}) {
  const settings = await getSettings();
  if (!settings.aiBaseUrl || !settings.aiModel) {
    throw new Error(t('未配置 AI 接口，请先到「设置」填写 OpenAI 兼容端点与模型'));
  }
  const staged = await git(cwd, ['diff', '--cached', '--no-color'], { allowFail: true });
  let diff = staged.stdout;
  if (!diff.trim()) {
    const unstaged = await git(cwd, ['diff', '--no-color'], { allowFail: true });
    diff = unstaged.stdout;
  }
  if (!diff.trim()) throw new Error(t('没有可分析的变更'));
  if (diff.length > 14000) diff = diff.slice(0, 14000) + '\n' + t('…（diff 过长已截断）');

  const base = settings.aiBaseUrl.replace(/\/+$/, '');
  const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.aiApiKey ? { Authorization: `Bearer ${settings.aiApiKey}` } : {}),
    },
    body: JSON.stringify({
      model: settings.aiModel,
      messages: [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: t('生成提交信息：') + `\n\n${diff}` },
      ],
      temperature: 0.3,
      // 推理模型的思考链也消耗 token，给足额度保证最终 content 非空
      max_tokens: 2000,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(t('AI 接口返回 {0}：{1}', resp.status, text.slice(0, 200)));
  }
  const data = await resp.json();
  const msg = data.choices?.[0]?.message?.content?.trim();
  if (!msg) throw new Error(t('AI 未返回内容'));
  return msg.replace(/^```[^\n]*\n?|```$/g, '').trim();
}

// 测试连接走服务端，避免浏览器跨域拦截；只验证可达与鉴权
export async function testConnection({ aiBaseUrl, aiApiKey, aiModel }) {
  if (!aiBaseUrl || !aiModel) throw new Error(t('请先填写接口地址与模型名称'));
  const base = aiBaseUrl.replace(/\/+$/, '');
  const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(aiApiKey ? { Authorization: `Bearer ${aiApiKey}` } : {}),
    },
    body: JSON.stringify({ model: aiModel, messages: [{ role: 'user', content: t('回复"连接成功"四个字') }], max_tokens: 200 }),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}：${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  const m = data.choices?.[0]?.message || {};
  return { ok: true, sample: (m.content || '').trim() || t('（推理模型，思考链占满额度但连接正常）') };
}