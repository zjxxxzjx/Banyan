# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.2.x | ✅ |
| < 0.2 | ❌ |

## Reporting a vulnerability

Please **do not** open public issues for security problems.

Email: zjxxxzjx@163.com (subject prefix `[banyan-security]`).
Include reproduction steps, affected version, and impact assessment.
You will receive an acknowledgement within 7 days; fixes ship in the next
patch release with credit (unless you prefer anonymity).

## Scope notes

- Banyan binds `127.0.0.1` only and stores all state in `~/.banyan/`.
- The desktop shell loads the UI from the loopback sidecar; capabilities grant
  IPC to `http://127.0.0.1:*` only.
- Builds are ad-hoc signed with JIT entitlements and **not notarized**;
  Gatekeeper/quarantine friction is expected and documented in README.
- AI commit messages send your staged diff to the endpoint **you configure**;
  no default external service is contacted.