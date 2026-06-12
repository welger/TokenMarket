import { jest } from '@jest/globals';

import { MeteringCompensationService } from './metering-compensation.service.js';
import type { RedisService } from '../risk/redis.service.js';

describe('MeteringCompensationService', () => {
  it('queues only sanitized settlement metadata', async () => {
    const redis = {
      rPush: jest.fn().mockResolvedValue(1),
    } as unknown as RedisService;
    const service = new MeteringCompensationService(redis);

    await service.enqueue({
      requestId: 'req_1',
      userId: 'user_1',
      apiKeyId: 'key_1',
      modelId: 'model_1',
      inputCharacters: 20,
      outputCharacters: 5,
      inputChargedUnits: 20n,
      outputChargedUnits: 5n,
      ipHash: 'hashed-ip',
    });

    expect(redis.rPush).toHaveBeenCalledWith(
      'gateway:metering:compensation',
      expect.any(String),
    );
    const payload = JSON.parse(
      (redis.rPush as unknown as jest.Mock).mock.calls[0]![1] as string,
    ) as Record<string, unknown>;
    expect(payload).toMatchObject({
      requestId: 'req_1',
      userId: 'user_1',
      apiKeyId: 'key_1',
      modelId: 'model_1',
      inputCharacters: 20,
      outputCharacters: 5,
      inputChargedUnits: '20',
      outputChargedUnits: '5',
      ipHash: 'hashed-ip',
      reason: 'STREAM_SETTLEMENT_FAILED',
    });
    expect(JSON.stringify(payload)).not.toContain('sk-gw_');
    expect(JSON.stringify(payload)).not.toContain('private');
  });
});
