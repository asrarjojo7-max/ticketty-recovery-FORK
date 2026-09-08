import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { SubscriptionPolicy } from '../common/decorators/subscription-policy.decorator';
import { requireOrgId } from '../common/org';
import { AgentsService } from './agents.service';
import {
  CreateAgentDto,
  QueryAgentDto,
  QueryCommissionDto,
  UpdateAgentDto,
} from './dto';

@SubscriptionPolicy({
  mode: 'exempt',
  reason: 'إدارة الوكلاء — بيانات تشغيلية، ليست بيعاً جديداً',
})
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Post()
  @Permissions('agents.write')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAgentDto) {
    return this.agentsService.create(user, dto);
  }

  @Get()
  @Permissions('agents.read', 'agents.read.own')
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryAgentDto) {
    return this.agentsService.findAll(user, query);
  }

  @Get('me')
  @Permissions('agents.read', 'agents.read.own')
  findMe(@CurrentUser() user: AuthUser) {
    return this.agentsService.findMe(requireOrgId(user), user.sub);
  }

  @Get(':id')
  @Permissions('agents.read', 'agents.read.own')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.agentsService.findOne(user, id);
  }

  @Get(':id/commissions')
  @Permissions('agents.read', 'agents.read.own')
  commissions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: QueryCommissionDto,
  ) {
    return this.agentsService.commissions(user, id, query);
  }

  @Patch(':id')
  @Permissions('agents.write')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.agentsService.update(user, id, dto);
  }

  @Delete(':id')
  @Permissions('agents.write')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.agentsService.remove(user, id);
  }
}
