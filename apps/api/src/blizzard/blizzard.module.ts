import { Module } from '@nestjs/common';
import { BlizzardAuthService } from './blizzard-auth.service';
import { BlizzardClient } from './blizzard.client';

@Module({
  providers: [BlizzardAuthService, BlizzardClient],
  // Only the client is public; token handling is an internal detail of this module.
  exports: [BlizzardClient],
})
export class BlizzardModule {}
