# Security Notes

Admin endpoints in this plugin perform indexing and template management. Protect them in production.

## Recommendations
- Gate `/admin/*` routes with your backend’s auth/permissions middleware.
- Use HTTPS and valid TLS when pointing to OpenSearch in non-dev environments.
- Keep `search.ai.privacy.redact*` enabled to reduce outbound exposure in prompts.
- Prefer `bearer` tokens or AWS/Azure auth integrations for OpenSearch instead of basic auth.
- Restrict allowed outbound fields to AI providers (when implemented) to a minimal allowlist.
- Monitor and alert on AI error rates; auto-disable via feature flags if SLOs degrade.
