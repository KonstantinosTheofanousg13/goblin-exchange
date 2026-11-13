import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { BlizzardModule } from '../blizzard/blizzard.module';
import { INGESTION_QUEUE } from './ingestion.constants';
import { IngestionProcessor } from './ingestion.processor';
import { IngestionScheduler } from './ingestion.scheduler';
import { IngestionService } from './ingestion.service';

@Module({
  imports: [BlizzardModule, BullModule.registerQueue({ name: INGESTION_QUEUE })],
  providers: [IngestionService, IngestionProcessor, IngestionScheduler],
  exports: [IngestionService],
})
export class IngestionModule {}
