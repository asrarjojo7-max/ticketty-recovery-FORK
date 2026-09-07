import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantDatabaseStore {
  client: Prisma.TransactionClient;
  organizationId: string;
}

@Injectable()
export class TenantDatabaseContext {
  private readonly storage = new AsyncLocalStorage<TenantDatabaseStore>();

  current(): TenantDatabaseStore | undefined {
    return this.storage.getStore();
  }

  run<T>(store: TenantDatabaseStore, callback: () => Promise<T>): Promise<T> {
    return this.storage.run(store, callback);
  }
}
