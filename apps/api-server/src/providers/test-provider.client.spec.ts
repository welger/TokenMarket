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

  it('can fail exactly one request before output for gateway tests', async () => {
    const client = new TestProviderClient();
    client.failNextBeforeOutput();

    await expect(
      client.chat({
        model: 'test-model',
        messages: [{ role: 'user', content: 'private input' }],
      }),
    ).rejects.toThrow('TEST_PROVIDER_FAILURE_BEFORE_OUTPUT');
    await expect(
      client.chat({
        model: 'test-model',
        messages: [{ role: 'user', content: 'retry' }],
      }),
    ).resolves.toMatchObject({
      content: '测试响应：retry',
    });
  });

  it('streams deterministic chunks without external access', async () => {
    const client = new TestProviderClient();
    const chunks = [];

    for await (const chunk of client.chatStream({
      model: 'test-model',
      messages: [{ role: 'user', content: '你好' }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { content: '测试响应：', done: false },
      { content: '你好', done: false },
      { content: '', done: true },
    ]);
  });

  it('can fail a stream after emitting exactly one chunk', async () => {
    const client = new TestProviderClient();
    client.failNextStreamAfterFirstChunk();
    const chunks = [];

    await expect(async () => {
      for await (const chunk of client.chatStream({
        model: 'test-model',
        messages: [{ role: 'user', content: 'private input' }],
      })) {
        chunks.push(chunk);
      }
    }).rejects.toThrow('TEST_PROVIDER_STREAM_FAILURE');
    expect(chunks).toEqual([
      { content: '测试响应：', done: false },
    ]);
  });
});
