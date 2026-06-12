import { Module } from '@nestjs/common';

import { UsageController } from './usage.controller.js';
import { UsageService } from './usage.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [UsageController],
  providers: [UsageService],
})
export class UsageModule {}
