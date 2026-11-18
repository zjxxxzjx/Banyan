import { api } from '../api.js';
import { esc, toast, pill } from '../util.js';
import { icon } from '../icons.js';
import { t, setLang } from '../i18n.js';

export function render(state) {
  const s = state.settings;
  return `
    <div class="page">
      <div class="page-label micro"><b>[06]</b> Settings</div>
      <div class="page-head">
        <div class="page-title display">${t('设置')}</div>
      </div>
      <div class="page-desc">${t('偏好与 AI 接口配置，保存在 ~/.banyan/settings.json。')}</div>
      <div class="form-card">
        <div class="card form-card">
          <div class="form-field">
            <label>${t('外观主题')}</label>
            <div class="seg" style="align-self:flex-start">
              <button data-theme="dark" class="${s.theme === 'dark' ? 'active' : ''}">${icon('moon', 13)} ${t('深色')}</button>
              <button data-theme="light" class="${s.theme === 'light' ? 'active' : ''}">${icon('sun', 13)} ${t('浅色')}</button>
            </div>
          </div>
        </div>
        <div class="card form-card">
          <div class="form-field">
            <label>${t('界面语言')}</label>
            <div class="seg" style="align-self:flex-start">
              <button data-lang="zh" class="${(s.lang || 'zh') === 'zh' ? 'active' : ''}">${t('中文')}</button>
              <button data-lang="en" class="${s.lang === 'en' ? 'active' : ''}">${t('English')}</button>
            </div>
          </div>
        </div>
        <div class="card form-card">
          <div style="font-weight:700;display:flex;align-items:center;gap:8px">${icon('sparkles', 15)} ${t('AI 提交信息')}</div>
          <div class="form-hint">${t('填写任意 OpenAI 兼容接口（官方 / 中转站均可）。接口需支持 POST /chat/completions。')}</div>
          <div class="form-field">
            <label>${t('接口地址（Base URL）')}</label>
            <input type="text" id="ai-url" placeholder="https://api.openai.com/v1" value="${esc(s.aiBaseUrl || '')}">
          </div>
          <div class="form-field">
            <label>API Key</label>
            <input type="password" id="ai-key" placeholder="sk-..." value="${esc(s.aiApiKey || '')}">
          </div>
          <div class="form-field">
            <label>${t('模型名称')}</label>
            <input type="text" id="ai-model" placeholder="gpt-4o-mini / deepseek-chat / ..." value="${esc(s.aiModel || '')}">
          </div>
          <div class="form-row">
            ${pill(t('保存 AI 配置'), { attrs: 'data-act="save-ai"', ic: 'check' })}
            <button class="btn" data-act="test-ai">${t('测试连接')}</button>
          </div>
        </div>
        <div class="card form-card">
          <div style="font-weight:700;display:flex;align-items:center;gap:8px">${icon('tree', 15)} ${t('关于 Banyan')}</div>
          <div class="form-hint">
            ${t('零依赖本地 Git 客户端 · Node 内置服务 + 原生 Web 界面<br>')}
            ${t('融合 SourceGit 的全功能操作与 GitButler 的现代体验：并行工作区 / AI 提交 / 可撤销操作日志<br>')}
            ${t('所有数据仅存本机，服务只监听 127.0.0.1')}
          </div>
        </div>
      </div>
    </div>`;
}

export function bind(root, ctx) {
  const { state } = ctx;

  root.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', async () => {
    state.settings = await api.saveSettings({ lang: b.dataset.lang });
    setLang(state.settings.lang);
    document.title = t('Banyan · Git 客户端');
    ctx.renderAll();
  }));

  root.querySelectorAll('[data-theme]').forEach((b) => b.addEventListener('click', async () => {
    const theme = b.dataset.theme;
    state.settings = await api.saveSettings({ theme });
    document.documentElement.dataset.theme = theme;
    ctx.renderAll();
  }));

  const readAi = () => ({
    aiBaseUrl: root.querySelector('#ai-url').value.trim(),
    aiApiKey: root.querySelector('#ai-key').value.trim(),
    aiModel: root.querySelector('#ai-model').value.trim(),
  });

  root.querySelector('[data-act="save-ai"]')?.addEventListener('click', async () => {
    state.settings = await api.saveSettings(readAi());
    toast(t('AI 配置已保存'), 'success');
  });

  root.querySelector('[data-act="test-ai"]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> ' + t('测试中');
    try {
      state.settings = await api.saveSettings(readAi());
      const r = await api.aiTest(readAi());
      toast(t('连接成功：{0}', r.sample), 'success');
    } catch (err) {
      toast(t('连接失败：{0}', err.message), 'error');
    }
    btn.disabled = false;
    btn.textContent = t('测试连接');
  });
}