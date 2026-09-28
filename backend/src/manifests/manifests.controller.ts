import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { SubscriptionPolicy } from '../common/decorators/subscription-policy.decorator';
import { GenerateManifestDto } from './dto';
import { ManifestsService } from './manifests.service';

@SubscriptionPolicy({
  mode: 'exempt',
  reason: 'كشف الرحلة لما بِيع — خدمة ما بِيع',
})
@Controller('manifests')
export class ManifestsController {
  constructor(private readonly manifestsService: ManifestsService) {}

  @Post('generate')
  @Permissions('manifests.write')
  generate(@CurrentUser() user: AuthUser, @Body() dto: GenerateManifestDto) {
    return this.manifestsService.generate(user, dto);
  }

  @Post('trip/:tripId/depart')
  @Permissions('manifests.write')
  departTrip(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    return this.manifestsService.departTrip(user, tripId);
  }

  @Get('trip/:tripId')
  @Permissions('manifests.read')
  findByTrip(@CurrentUser() user: AuthUser, @Param('tripId') tripId: string) {
    return this.manifestsService.findByTrip(user, tripId);
  }

  @Get(':id')
  @Permissions('manifests.read')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.manifestsService.findOne(user, id);
  }

  @Post(':id/lock')
  @Permissions('manifests.write')
  lock(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.manifestsService.lock(user, id);
  }
}
