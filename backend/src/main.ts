import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap/configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  configureApp(app);
  app.enableShutdownHooks();

  await app.listen(
    config.getOrThrow<number>('PORT'),
    config.getOrThrow<string>('API_BIND_HOST'),
  );
}
void bootstrap();
