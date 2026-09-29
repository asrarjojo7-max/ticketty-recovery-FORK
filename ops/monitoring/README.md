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


## Telegram Operations Assistant

The production Telegram assistant is an isolated Node service under
`ops/telegram-assistant/`.

It has no public host port. It receives Alertmanager notifications over the
private Compose network and reads operational status from Prometheus and
Alertmanager. It does not access PostgreSQL directly and does not proxy
arbitrary backend requests.

### First-time setup

Generate two different secrets on the server:

```bash
openssl rand -hex 24
openssl rand -hex 32
```

Use the first value as `TELEGRAM_PAIRING_CODE`. Store it only in the
production environment file or secret store.

Use the second value as the contents of
`/etc/ticketty/telegram-alert-webhook-token`, owned by the deployment
operator and readable only by the Alertmanager and Telegram assistant
containers.

Create a Telegram bot with BotFather and put its token in
`TELEGRAM_BOT_TOKEN`.

For the Alertmanager webhook URL file, the Compose service name is reachable
only inside the private network. The file should contain:

```text
http://telegram-assistant:8090/alerts
```

Alertmanager authenticates the request with a Bearer token read from
`/etc/ticketty/telegram-alert-webhook-token`; the token is not placed in the
URL.

Because this file is also used by the existing Alertmanager deployment
mechanism, never commit its contents. On the VPS it should remain protected
with restrictive ownership and permissions.

After the stack is running, send the bot:

```text
/start REPLACE_WITH_TELEGRAM_PAIRING_CODE
```

The pairing is stored in the persistent `ticketty-telegram` volume and binds
the Telegram chat to the Telegram user that performed the pairing.

### Supported read-only questions

Examples:

- `حالة النظام`
- `كيف وضع المحاسبة؟`
- `كم عملية معلقة؟`
- `هل توجد مشاكل؟`
- `هل أخذ النظام نسخة احتياطية؟`
- `ماذا حدث اليوم؟`

Unknown or ambiguous requests are not executed. The assistant asks the user to
use one of the supported questions instead.

### Alert language

Alertmanager remains the technical source of alert state. The Telegram
assistant translates known alert types into human Arabic, for example:

```text
🔴 مهم جدًا — خدمة المحاسبة

خدمة المحاسبة توقفت عن الاستجابة.
قد تستمر المبيعات، لكن تسجيلها المحاسبي متأخر.
الإجراء: فحص خدمة المحاسبة.
```

A resolved alert is reported as a normal-language recovery message.

### Telegram Remote Operations

The Telegram assistant is connected to the host Deployment Manager through the
private Unix socket `/run/ticketty/ops.sock`. The host accepts only allowlisted
status/update-plan/cancel/execute-plan operations with HMAC, timestamp, nonce,
and audit logging.

A deployment plan expires after 10 minutes and is executed once. The bot never
receives shell commands, SQL, arbitrary URLs, or unrestricted release refs.

### Safety boundary

The first release is read-only. No Telegram message can:

- execute shell commands;
- send SQL;
- choose an arbitrary HTTP endpoint;
- change bookings, payments, accounting entries, users, or other business data.

Administrative actions are intentionally deferred until a separate signed
operations API and confirmation workflow have been reviewed.
