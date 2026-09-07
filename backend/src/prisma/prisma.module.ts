import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantDatabaseContext } from './tenant-database-context';

@Global()
@Module({
  providers: [TenantDatabaseContext, PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
