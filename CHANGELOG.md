# Changelog

All notable changes to Banyan are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## [0.2.1] - 2026-11-18

### Changed
- Local macOS builds signed with a stable self-signed identity (`Banyan Local Signer`, certificate outside the repo) so TCC folder-access grants persist across rebuilds on the build machine; CI falls back to ad-hoc (or Developer ID when secrets provided).

## [0.2.0] - 2026-11-18

### Added
- Full English / Simplified Chinese UI with a language switch in Settings (`settings.lang`), shared i18n dictionary across frontend, server and git/AI layers.
- Open-source readiness: font OFL license texts, CHANGELOG, architecture doc, sidecar fetch script, CI + release workflows, community files.

## [0.1.3] - 2026-11-18

### Fixed
- Commit graph: dot-to-dot edges hugging lanes (no dangling stubs, no long sweeping diagonals); HEAD commit double-ring marker; no stray incoming line on the first row.
- Refs rendered as overlapping colored tag clusters after the subject, full names on hover (PyCharm-style).
- Narrow-window layout: subject column min-width, author column yields below 900px, no overlap of badges into adjacent columns.
- AI "test connection" now runs server-side (browser CORS previously faked failures); reasoning-model token budget raised so commit messages are not empty.

### Changed
- `amend` checkbox labelled in Chinese with the English term in parentheses.

## [0.1.2] - 2026-11-17

### Fixed
- Bundled Node sidecar signed with JIT entitlements (`allow-jit`, `allow-unsigned-executable-memory`); without them V8 failed to reserve CodeRange memory under hardened runtime and the backend died at startup.

## [0.1.1] - 2026-11-17

### Fixed
- Bundle-level ad-hoc code signature (sealed resources + bound Info.plist); previously only linker-level adhoc signature existed, which macOS Gatekeeper reported as "damaged".

### Added
- README Gatekeeper / quarantine troubleshooting (`xattr -cr`).

## [0.1.0] - 2026-11-17

### Added
- Initial release: local-first Git client. Changes (stage/unstage/discard, diff viewer, commit & amend, AI commit messages), branch tree + colored commit graph + full right-click branch operations (checkout / rebase / compare / worktree diff / merge / worktree / push / rename / delete), stash, parallel worktrees, undoable reflog, dark/light themes, settings.
- Tauri 2 desktop shell with bundled Node sidecar, unified title bar, macOS `.dmg` bundle.
- Zero runtime dependencies: Node built-in http server + vanilla ES-module frontend.