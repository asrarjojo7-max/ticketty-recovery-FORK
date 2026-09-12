# Ticketty production monitoring

This directory contains the private Prometheus and Alertmanager configuration for the controlled pilot, including PostgreSQL, host, backup, worker, and web availability probes.

## Security boundary

- Prometheus and Alertmanager bind to loopback only in `compose.yaml`.
- The backend metrics endpoint is scraped over the private Compose network.
- The public BFF blocks `/api/proxy/metrics` and backend health paths.
- The notification URL is never stored in Git. Put the approved HTTPS webhook URL, and only that URL, in `/etc/ticketty/alertmanager-webhook-url`, owned by `root:nogroup` with mode `0640` so the non-root Alertmanager container (UID/GID 65534) can read only this mounted file.
- `POSTGRES_EXPORTER_DSN` is injected at deployment and must use a dedicated monitoring login. Do not use the migration/admin credential.

## Required deployment values

```text
POSTGRES_EXPORTER_DSN=postgresql://ticketty_monitor:<secret>@postgres:5432/ticketty?sslmode=disable
ALERTMANAGER_WEBHOOK_URL_FILE=/etc/ticketty/alertmanager-webhook-url
NODE_EXPORTER_TEXTFILE_DIR=/var/lib/ticketty/metrics
```

Use TLS (`sslmode=require` or stricter) when PostgreSQL is not confined to the private host network. The webhook URL file must contain one company-approved receiver URL. No alert channel secret is committed by this repository.

## Validation

```bash
docker run --rm -v "$PWD/ops/monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
  -v "$PWD/ops/alert-rules.yml:/etc/prometheus/rules/ticketty.yml:ro" \
  prom/prometheus:v3.5.0 promtool check config /etc/prometheus/prometheus.yml

docker run --rm -v "$PWD/ops/monitoring/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro" \
  -v /etc/ticketty/alertmanager-webhook-url:/run/secrets/alertmanager_webhook_url:ro \
  prom/alertmanager:v0.28.1 amtool check-config /etc/alertmanager/alertmanager.yml
```

A controlled alert-delivery test must prove both hops: Prometheus/`amtool` to Alertmanager, and Alertmanager to the owned external receiver. A local receiver proves routing only and must not be recorded as real delivery.

## Host deployment

`run-host-monitoring.sh start` runs pinned, restartable containers on host networking while binding every monitoring listener to loopback. It is used by `ops/systemd/ticketty-monitoring.service` for deployments where the application itself runs as host systemd services. `prometheus-host.yml` monitors backend `:4000`, web liveness through blackbox-exporter, PostgreSQL, and node-exporter textfile/host metrics.

`local-alert-sink.mjs` is an optional journald evidence sink. It is useful to prove Alertmanager routing while an approved external receiver is unavailable, but it is not paging and must never be cited as external notification delivery. Replace the content of `/etc/ticketty/alertmanager-webhook-url` with an approved receiver URL and repeat the controlled test to close that deferred gate.
