# Architecture

Banyan is a local-first Git client with three layers and zero runtime dependencies.

```
┌────────────────────────── macOS window (Tauri 2 / WKWebView) ──────────────────────────┐
│  unified title bar (traffic lights overlay) + web UI                                    │
│  public/  vanilla ES modules: app.js shell, views/*, graph.js, i18n.js                   │
└───────────────▲────────────────────────────────────────────────────────────────────────┘
                │ HTTP on 127.0.0.1:<free port> (loopback only)
┌───────────────┴────────────────────────────────────────────────────────────────────────┐
│  server.js   Node built-in http: REST /api/* + static public/                            │
│  lib/git.js  execFile('git', …) — all repository operations                              │
│  lib/store.js  ~/.banyan/{repos.json,settings.json}                                      │
│  lib/ai.js   optional OpenAI-compatible commit-message generation (server-side fetch)    │
└───────────────▲────────────────────────────────────────────────────────────────────────┘
                │ spawned as sidecar with PORT env
┌───────────────┴────────────────────────────────────────────────────────────────────────┐
│  desktop/src-tauri  Rust shell: free port → spawn node sidecar → wait ready →            │
│  WebviewWindow(External URL); kills sidecar on exit; macOS title-bar overlay +           │
│  traffic-light inset; capabilities grant IPC to the loopback origin (remote.urls)        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

## Key decisions

- **Zero runtime deps.** The backend uses only Node built-ins (`http`, `child_process`, `fs`); the frontend is plain ES modules with no build step. `npm start` serves the same UI the desktop shell embeds, which makes browser-based development and testing trivial.
- **Sidecar, not embedded JS runtime.** The desktop shell bundles an official Node binary (`desktop/src-tauri/binaries/node-<target-triple>`, fetched by `scripts/fetch-sidecar.sh`, not committed). The shell picks a free loopback port, passes it via `PORT`, waits for readiness, then loads the UI. On window close / app exit the sidecar is killed to avoid orphan processes.
- **Loopback-only server.** `server.js` binds `127.0.0.1`; no telemetry, no accounts. All state lives in `~/.banyan/`.
- **Git via CLI.** `lib/git.js` shells out to `git` with `LC_ALL=C` and parses machine-readable output (`--format` with field separators, `for-each-ref`, `status --porcelain`). Errors surface as `GitError` with the original stderr.
- **Shared i18n.** `public/js/i18n.js` holds a zh→en dictionary keyed by the Chinese source string with `{n}` placeholders; frontend, server and lib all call `t()`. Language persists in `settings.lang`; the server applies it at startup and on settings save.
- **Commit graph.** `public/js/graph.js` assigns lanes while walking commits in log order, then renders one absolute-positioned SVG overlay: each parent edge is drawn dot-to-dot (vertical when same lane, one-row curve into the parent lane then vertical down to the parent dot), so lines never dangle or sweep across lanes.
- **macOS chrome.** `TitleBarStyle::Overlay` + hidden title; traffic lights positioned by inset into a 28px lights-only strip above the 48px app bar. Window dragging uses explicit `start_dragging` IPC because `data-tauri-drag-region` injection requires the capability `remote.urls` grant for loopback origins.
- **Signing.** Builds are ad-hoc signed with JIT entitlements (`desktop/src-tauri/entitlements.plist`) so the bundled V8 can reserve executable memory under hardened runtime. Not notarized: recipients may need `xattr -cr /Applications/Banyan.app` (see README). Notarization hooks exist in the release workflow and activate when Apple credentials are provided as secrets.

## Repository map

| Path | Role |
| --- | --- |
| `server.js` | HTTP server, REST routes, static hosting |
| `lib/git.js` | git operations & parsing |
| `lib/store.js` | repos/settings persistence |
| `lib/ai.js` | AI commit messages + connection test |
| `public/js/app.js` | shell: sidebar/topbar/view routing, state |
| `public/js/views/*` | one module per view (changes, history, stash, worktrees, reflog, settings) + shared branch tree |
| `public/js/graph.js` | lane assignment + SVG commit graph |
| `public/js/i18n.js` | shared zh/en dictionary |
| `desktop/src-tauri/src/main.rs` | Tauri shell & sidecar lifecycle |
| `desktop/make_icon.py`, `desktop/extract_silhouette.py` | same-source brand mark pipeline (photo → flat silhouette → SVG/favicon/app icons) |
| `test/` | node:test smoke tests (git lib + API) |
| `.github/workflows/` | CI (tests) + tag-triggered release builds |