import { jest } from '@jest/globals';

import { OpenAiCompatibleClient } from './openai-compatible.client.js';
import type { EnvironmentVariables } from '../common/config/env.schema.js';
import type { ConfigService } from '@nestjs/config';

describe('OpenAiCompatibleClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads upstream credentials from configuration and never from the request', async () => {
    const values: Partial<EnvironmentVariables> = {
      UPSTREAM_BASE_URL: 'https://upstream.example.test/v1/',
      UPSTREAM_API_KEY: 'local-test-upstream-secret',
      UPSTREAM_DEFAULT_MODEL: 'default-model',
    };
    const config = {
      get: jest.fn((key: keyof EnvironmentVariables) => values[key]),
    } as unknown as ConfigService<EnvironmentVariables, true>;
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'upstream-request',
          model: 'default-model',
          choices: [{ message: { content: 'ok' } }],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    const client = new OpenAiCompatibleClient(config);

    await expect(
      client.chat({
        messages: [{ role: 'user', content: 'hello' }],
      }),
    ).resolves.toMatchObject({
      content: 'ok',
      model: 'default-model',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://upstream.example.test/v1/chat/completions',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer local-test-upstream-secret',
        },
      }),
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).not.toContain(
      'local-test-upstream-secret',
    );
  });
});
