import { type INestApplication, StandardSchemaValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * App-wide HTTP setup, shared by main.ts and the e2e tests,
 * so tests exercise exactly what production serves.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  // Validates every @Body/@Query/@Param that declares { schema } (Zod here); 400 on failure.
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  // Run onModuleDestroy hooks (e.g. closing the DB pool) on SIGTERM/SIGINT.
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('Goblin Exchange API')
    .setDescription('WoW EU commodity prices: item search, OHLC candles, top movers.')
    .setVersion('1')
    .build();
  // UI at /docs, JSON at /docs-json. The factory builds the document on first request.
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config));
}
