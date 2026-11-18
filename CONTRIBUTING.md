# Contributing to Banyan

Thanks for considering a contribution! Banyan is a local-first Git client with a
zero-runtime-dependency philosophy: Node built-ins on the server, vanilla ES modules
in the browser, Tauri 2 for the desktop shell. Please keep it that way.

## Development setup

```bash
git clone git@github.com:zjxxxzjx/Banyan.git
cd Banyan
npm start                 # web mode → http://127.0.0.1:7788 (same UI the desktop embeds)
npm test                  # node:test smoke tests (git lib + REST API)
```

Desktop builds additionally need Rust stable and a Node sidecar binary:

```bash
bash scripts/fetch-sidecar.sh
cd desktop && npm install && npm run build
```

## Ground rules

- **No runtime dependencies.** Server: Node built-ins only. Frontend: no framework, no build step.
- **Conventional Commits**: `feat(scope): …`, `fix(scope): …`, `docs: …`, `chore(release): …`.
  Scopes in use: `core`, `desktop`, `graph`, `ui`, `ai`, `branch`.
- **Bilingual UI**: every user-facing string goes through `t()` in `public/js/i18n.js`
  (Chinese source key + English translation). Server/lib errors too.
- **Bilingual docs**: README.md (English) and README.zh-CN.md (Chinese) stay in sync.
- **Tests**: add/extend `test/*.test.js` (node:test) for any lib/API behavior change.
- **Privacy**: never introduce telemetry or non-loopback listeners; all state stays in `~/.banyan`.
- **macOS signing**: keep `entitlements.plist` (JIT) in the signing path; do not remove
  `remote.urls` from capabilities (IPC + window dragging depend on it).

## Workflow

1. Fork / branch from `master`.
2. Make changes with tests; run `npm test` and `node --check` on touched JS.
3. For UI changes, verify in a browser at desktop width and 390px, both themes.
4. Open a PR using the template; link issues where relevant.
5. Version bumps happen only in release commits (`chore(release): x.y.z`) touching
   `package.json`, `desktop/package.json`, `desktop/src-tauri/tauri.conf.json`,
   `desktop/src-tauri/Cargo.toml` together, plus CHANGELOG.md.

## Reporting bugs / requesting features

Use the issue templates. For security issues, **do not open a public issue** —
see [SECURITY.md](SECURITY.md).