import { Injectable } from '@nestjs/common';

import type {
  ProviderChatRequest,
  ProviderChatResponse,
  ProviderChunk,
  ProviderClient,
} from './provider-client.js';

@Injectable()
export class TestProviderClient implements ProviderClient {
  async chat(
    request: ProviderChatRequest,
  ): Promise<ProviderChatResponse> {
    const content = request.messages.at(-1)?.content ?? '';
    return {
      content: `测试响应：${content}`,
      model: request.model ?? 'test-model',
      upstreamRequestId: 'test-provider-request',
    };
  }

  async *chatStream(
    request: ProviderChatRequest,
  ): AsyncIterable<ProviderChunk> {
    const response = await this.chat(request);
    yield { content: response.content, done: false };
    yield { content: '', done: true };
  }

  async health(): Promise<'UP'> {
    return 'UP';
  }
}
