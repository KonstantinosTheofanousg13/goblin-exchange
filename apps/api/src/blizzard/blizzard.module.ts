import { Module } from '@nestjs/common';
import { BlizzardAuthService } from './blizzard-auth.service';

@Module({
  providers: [BlizzardAuthService],
  exports: [BlizzardAuthService],
})
export class BlizzardModule {}
