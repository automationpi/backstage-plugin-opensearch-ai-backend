# Observability (Prometheus + OpenTelemetry)

This plugin exposes Prometheus metrics and emits OpenTelemetry spans for rewrite, search, rerank, and indexing.

## Prometheus Metrics
- Endpoint: `GET /api/opensearch-ai/metrics`
- Metrics:
  - `opensearch_ai_query_latency_ms_bucket|sum|count{stage}`: Histogram per stage (`rewrite`, `search`, `rerank`, `total`). Buckets in ms.
  - `opensearch_ai_query_total{outcome}`: Counter of queries by outcome (`success`, `failure`).
  - `opensearch_ai_ai_usage_total{stage,outcome}`: Counter for AI stages (rewrite/rerank) by outcome.
  - `opensearch_ai_errors_total{stage}`: Counter for errors.
  - `opensearch_ai_indexed_total{source}`: Counter for indexed documents.

Example Prometheus scrape config:
```yaml
scrape_configs:
  - job_name: backstage-opensearch-ai
    metrics_path: /api/opensearch-ai/metrics
    static_configs:
      - targets: ['backstage-backend:7007']
```

## OpenTelemetry Traces
- Emits spans with tracer name `opensearch-ai` for `search.query`, `indexing.batch`, and error spans `error.<stage>`.
- Attach this service to your existing OTel exporter by configuring it in the hosting backend. The code uses `@opentelemetry/api` only, so it integrates with your global SDK if present.

## Grafana Dashboard
A starter Grafana dashboard JSON is included at `grafana/dashboards/opensearch-ai.json` with panels:
- QPS: `sum(rate(opensearch_ai_query_total{outcome="success"}[5m]))`
- p95 latency per stage: `histogram_quantile(0.95, sum(rate(opensearch_ai_query_latency_ms_bucket[5m])) by (le, stage))`
- AI fallback rate: `sum(rate(opensearch_ai_ai_usage_total{outcome="failure"}[5m])) / sum(rate(opensearch_ai_ai_usage_total[5m]))`
- Indexing throughput by source: `sum by (source) (rate(opensearch_ai_indexed_total[5m]))`

Import the JSON into Grafana and point panels at your Prometheus datasource.

