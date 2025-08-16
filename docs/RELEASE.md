# Release Guide

This guide covers preparing and releasing a new version of the OpenSearch AI-enhanced Backend Plugin.

## Versioning
- Use semantic versioning. Example: bump to `0.2.0` for adding re-ranking.

## Pre-release Checklist
- [ ] All TypeScript builds pass: `npm install && npm run build` under `plugins/opensearch-ai-backend`.
- [ ] Docs updated: `docs/README.md`, `docs/AI.md`, `docs/USAGE.md`, `docs/MILESTONES.md`.
- [ ] Example config validated against local OpenSearch via `dev/docker-compose.yml`.
- [ ] Admin routes gated by your backend’s auth/permissions (see Security Notes).
- [ ] CHANGELOG updated with notable changes.

## Release Steps
1. Bump version in `plugins/opensearch-ai-backend/package.json`.
2. Update `CHANGELOG.md` with changes and date.
3. Build: `npm run build`.
4. Publish (optional): `npm publish` (ensure registry and access configured), or include in your internal registry.

## Post-release
- Monitor latency and error rates when enabling `rewrite` then `rerank`.
- Gradually roll out features via config flags per environment.

