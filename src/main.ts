import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // <-- strips unknown properties
      transform: true, // <-- auto-transforms plain objects to DTO class instances
    }),
  );
  app.enableCors();
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
