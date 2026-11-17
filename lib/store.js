import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const DATA_DIR = path.join(os.homedir(), '.banyan');
const REPOS_FILE = path.join(DATA_DIR, 'repos.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const DEFAULT_SETTINGS = {
  theme: 'dark',
  aiBaseUrl: '',
  aiApiKey: '',
  aiModel: '',
  logAll: true,
};

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

export async function listRepos() {
  return readJson(REPOS_FILE, []);
}

export async function addRepo(repoPath, name) {
  const repos = await listRepos();
  const existing = repos.find((r) => r.path === repoPath);
  if (existing) return existing;
  const repo = { id: randomUUID().slice(0, 8), path: repoPath, name, addedAt: Date.now() };
  repos.push(repo);
  await writeJson(REPOS_FILE, repos);
  return repo;
}

export async function removeRepo(id) {
  const repos = await listRepos();
  await writeJson(REPOS_FILE, repos.filter((r) => r.id !== id));
}

export async function getRepo(id) {
  const repos = await listRepos();
  const repo = repos.find((r) => r.id === id);
  if (!repo) throw new Error('仓库不存在，请重新添加');
  return repo;
}

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await readJson(SETTINGS_FILE, {})) };
}

export async function saveSettings(patch) {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  await writeJson(SETTINGS_FILE, next);
  return next;
}