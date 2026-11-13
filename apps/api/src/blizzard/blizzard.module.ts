import { Module } from '@nestjs/common';
import { BlizzardAuthService } from './blizzard-auth.service';
import { BlizzardClient } from './blizzard.client';
import {
  BLIZZARD_RESILIENCE_OPTIONS,
  blizzardResilienceOptions,
} from './blizzard.resilience';

@Module({
  providers: [
    BlizzardAuthService,
    BlizzardClient,
    { provide: BLIZZARD_RESILIENCE_OPTIONS, useValue: blizzardResilienceOptions },
  ],
  // Only the client is public; token handling is an internal detail of this module.
  exports: [BlizzardClient],
})
export class BlizzardModule {}
