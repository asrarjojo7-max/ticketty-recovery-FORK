import { createServer } from "node:http";

const host = process.env.ALERT_SINK_HOST ?? "127.0.0.1";
const port = Number(process.env.ALERT_SINK_PORT ?? "19094");

const server = createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/alerts") {
    response.writeHead(404).end();
    return;
  }

  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
    if (body.length > 1_048_576) request.destroy();
  });
  request.on("end", () => {
    try {
      const payload = JSON.parse(body);
      const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];
      for (const alert of alerts) {
        const record = {
          receivedAt: new Date().toISOString(),
          status: alert.status,
          alertname: alert.labels?.alertname,
          severity: alert.labels?.severity,
          summary: alert.annotations?.summary,
        };
        process.stdout.write(`${JSON.stringify(record)}\n`);
      }
      response.writeHead(204).end();
    } catch {
      response.writeHead(400).end();
    }
  });
});

server.listen(port, host, () => {
  process.stdout.write(`Ticketty local alert evidence sink listening on ${host}:${port}\n`);
});
