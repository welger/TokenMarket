import { Module } from '@nestjs/common';

import { GatewayController } from './gateway.controller.js';
import { GatewayService } from './gateway.service.js';
import { ApiKeysModule } from '../api-keys/api-keys.module.js';
import { ComplianceModule } from '../compliance/compliance.module.js';
import { MeteringCompensationService } from '../metering/metering-compensation.service.js';
import { MeteringService } from '../metering/metering.service.js';
import { ProvidersModule } from '../providers/providers.module.js';
import { RiskModule } from '../risk/risk.module.js';

@Module({
  imports: [
    ApiKeysModule,
    ComplianceModule,
    ProvidersModule,
    RiskModule,
  ],
  controllers: [GatewayController],
  providers: [
    GatewayService,
    MeteringService,
    MeteringCompensationService,
  ],
})
export class GatewayModule {}
