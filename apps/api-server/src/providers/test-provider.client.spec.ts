import { TestProviderClient } from './test-provider.client.js';

describe('TestProviderClient', () => {
  it('returns deterministic local responses without external access', async () => {
    const client = new TestProviderClient();

    await expect(
      client.chat({
        model: 'test-model',
        messages: [{ role: 'user', content: '你好' }],
      }),
    ).resolves.toEqual({
      content: '测试响应：你好',
      model: 'test-model',
      upstreamRequestId: 'test-provider-request',
    });
    await expect(client.health()).resolves.toBe('UP');
  });
});
