import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { MetricsRegistryService } from '../../monitoring/metrics-registry.service';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function normalizeRequestId(value: unknown): string {
  return typeof value === 'string' && SAFE_REQUEST_ID.test(value)
    ? value
    : randomUUID();
}

export interface RequestWithId extends Request {
  requestId?: string;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly metrics: MetricsRegistryService) {}

  use(request: RequestWithId, response: Response, next: NextFunction): void {
    const requestId = normalizeRequestId(request.headers['x-request-id']);
    const startedAt = process.hrtime.bigint();
    request.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);

    response.once('finish', () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.logger.log(
        JSON.stringify({
          requestId,
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          clientIp: request.ip,
          durationMs: Math.round(durationMs * 100) / 100,
        }),
      );

      // Phase 6 observability — توسعة، لا استبدال (عقد §12).
      // التطبيع يحفظ cardinality الليبلات عند حد معقول.
      const route = MetricsRegistryService.normalizeRoute(
        request.baseUrl + request.path,
      );
      const labels = {
        method: request.method,
        route,
        status: String(response.statusCode),
      };
      this.metrics.httpRequestsTotal.inc(labels);
      this.metrics.httpRequestDuration.observe(labels, durationMs / 1000);
      if (response.statusCode === 402) {
        this.metrics.subscriptionBlocksTotal.inc({ route });
      }
    });

    next();
  }
}
