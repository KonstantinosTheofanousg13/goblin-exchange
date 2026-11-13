import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { blizzardConfig } from './config/blizzard.config';
import { envSchema } from './config/env.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // npm runs workspace scripts from apps/api, but .env lives at the repo root.
      envFilePath: ['.env', '../../.env'],
      validationSchema: envSchema,
      load: [blizzardConfig],
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
