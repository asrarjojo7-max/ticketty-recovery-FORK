import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { SubscriptionPolicy } from '../common/decorators/subscription-policy.decorator';
import { QueryReportDto } from './dto';
import { ReportsService } from './reports.service';

@SubscriptionPolicy({
  mode: 'exempt',
  reason: 'تقارير وقراءة — البيانات ملك الشركة (عقد §1: exports متاحة)',
})
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @Permissions('reports.read')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.reportsService.dashboard(user);
  }

  @Get('sales')
  @Permissions('reports.read')
  sales(@CurrentUser() user: AuthUser, @Query() query: QueryReportDto) {
    return this.reportsService.sales(user, query);
  }

  @Get('financial')
  @Permissions('reports.read')
  financial(@CurrentUser() user: AuthUser, @Query() query: QueryReportDto) {
    return this.reportsService.financial(user, query);
  }

  @Get('occupancy')
  @Permissions('reports.read')
  occupancy(@CurrentUser() user: AuthUser, @Query() query: QueryReportDto) {
    return this.reportsService.occupancy(user, query);
  }
}
