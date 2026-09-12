#!/usr/bin/env bash
set -Eeuo pipefail

ACTION="${1:-start}"
containers=(
  ticketty-prometheus
  ticketty-alertmanager
  ticketty-postgres-exporter
  ticketty-node-exporter
  ticketty-blackbox-exporter
)

stop_all() {
  docker rm -f "${containers[@]}" >/dev/null 2>&1 || true
}

if [[ "$ACTION" == "stop" ]]; then
  stop_all
  exit 0
fi
if [[ "$ACTION" != "start" ]]; then
  echo "Usage: $0 [start|stop]" >&2
  exit 2
fi

for file in \
  /etc/ticketty/prometheus-host.yml \
  /etc/ticketty/alertmanager.yml \
  /etc/ticketty/alert-rules.yml \
  /etc/ticketty/alertmanager-webhook-url \
  /etc/ticketty/monitoring-exporter.env; do
  [[ -r "$file" ]] || { echo "Missing required monitoring file: $file" >&2; exit 2; }
done

mkdir -p /var/lib/ticketty/metrics
docker volume create ticketty-prometheus >/dev/null
docker volume create ticketty-alertmanager >/dev/null
stop_all

docker run -d --name ticketty-alertmanager --restart unless-stopped \
  --network host \
  -v /etc/ticketty/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro \
  -v /etc/ticketty/alertmanager-webhook-url:/run/secrets/alertmanager_webhook_url:ro \
  -v ticketty-alertmanager:/alertmanager \
  prom/alertmanager:v0.28.1 \
  --config.file=/etc/alertmanager/alertmanager.yml \
  --storage.path=/alertmanager \
  --web.listen-address=127.0.0.1:9093 >/dev/null

docker run -d --name ticketty-postgres-exporter --restart unless-stopped \
  --network host --env-file /etc/ticketty/monitoring-exporter.env \
  prometheuscommunity/postgres-exporter:v0.17.1 \
  --web.listen-address=127.0.0.1:9187 >/dev/null

docker run -d --name ticketty-node-exporter --restart unless-stopped \
  --network host --pid host \
  -v /:/host:ro,rslave \
  -v /var/lib/ticketty/metrics:/textfile:ro \
  prom/node-exporter:v1.9.1 \
  --path.rootfs=/host \
  --collector.textfile.directory=/textfile \
  --web.listen-address=127.0.0.1:9100 >/dev/null

docker run -d --name ticketty-blackbox-exporter --restart unless-stopped \
  --network host \
  -v /etc/ticketty/blackbox.yml:/etc/blackbox_exporter/config.yml:ro \
  prom/blackbox-exporter:v0.27.0 \
  --config.file=/etc/blackbox_exporter/config.yml \
  --web.listen-address=127.0.0.1:9115 >/dev/null

docker run -d --name ticketty-prometheus --restart unless-stopped \
  --network host \
  -v /etc/ticketty/prometheus-host.yml:/etc/prometheus/prometheus.yml:ro \
  -v /etc/ticketty/alert-rules.yml:/etc/prometheus/rules/ticketty.yml:ro \
  -v ticketty-prometheus:/prometheus \
  prom/prometheus:v3.5.0 \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/prometheus \
  --storage.tsdb.retention.time=30d \
  --web.listen-address=127.0.0.1:9090 >/dev/null

echo "Ticketty monitoring containers started on loopback/private host networking."
