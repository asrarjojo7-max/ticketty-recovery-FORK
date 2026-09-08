import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { MetricsRegistryService } from './metrics-registry.service';

/**
 * GET /api/metrics — نقطة نهاية Prometheus (Phase 6).
 *
 * الحماية: @Public (لا يستهلك دور tenant) + قيد شبكة النشر —
 * compose يفتح منفذ الـ backend على الشبكة الداخلية فقط؛ الوصول
 * الخارجي يمر عبر المنصة التي لا توجّه /metrics (مراجعة النشر:
 * عقد الهندسة §12.1 — "network-internal"). لا يوجد أي بيانات
 * أعمال في المخرجات — عدادات ومقاييس فقط.
 *
 * نستخدم passthrough + Header بدل إرجاع string مباشرة كي لا
 * يحوّلها Nest/Express إلى text/html — Prometheus يتطلب text/plain
 * (بلا charset اصطلاحًا؛ الإضافة آمنة ومعيارية).
 */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsRegistryService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async prometheus(@Res({ passthrough: true }) res: Response): Promise<void> {
    res.type('text/plain');
    res.send(await this.metrics.render());
  }
}
