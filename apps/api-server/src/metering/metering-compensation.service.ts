import { Injectable, Logger } from '@nestjs/common';

import { RedisService } from '../risk/redis.service.js';

export interface MeteringCompensationInput {
  requestId: string;
  userId: string;
  apiKeyId: string;
  modelId: string;
  inputCharacters: number;
  outputCharacters: number;
  inputChargedUnits: bigint;
  outputChargedUnits: bigint;
  ipHash?: string;
}

@Injectable()
export class MeteringCompensationService {
  private readonly logger = new Logger(
    MeteringCompensationService.name,
  );

  constructor(private readonly redis: RedisService) {}

  async enqueue(input: MeteringCompensationInput): Promise<void> {
    await this.redis.rPush(
      'gateway:metering:compensation',
      JSON.stringify({
        requestId: input.requestId,
        userId: input.userId,
        apiKeyId: input.apiKeyId,
        modelId: input.modelId,
        inputCharacters: input.inputCharacters,
        outputCharacters: input.outputCharacters,
        inputChargedUnits: input.inputChargedUnits.toString(),
        outputChargedUnits: input.outputChargedUnits.toString(),
        ipHash: input.ipHash,
        reason: 'STREAM_SETTLEMENT_FAILED',
        queuedAt: new Date().toISOString(),
      }),
    );
    this.logger.error('Stream settlement queued for compensation');
  }
}
