import { Injectable } from '@nestjs/common';

import type {
  ProviderChatRequest,
  ProviderChatResponse,
  ProviderChunk,
  ProviderClient,
} from './provider-client.js';

@Injectable()
export class TestProviderClient implements ProviderClient {
  private failBeforeOutput = false;
  private failStreamAfterFirstChunk = false;

  failNextBeforeOutput(): void {
    this.failBeforeOutput = true;
  }

  failNextStreamAfterFirstChunk(): void {
    this.failStreamAfterFirstChunk = true;
  }

  async chat(
    request: ProviderChatRequest,
  ): Promise<ProviderChatResponse> {
    if (this.failBeforeOutput) {
      this.failBeforeOutput = false;
      throw new Error('TEST_PROVIDER_FAILURE_BEFORE_OUTPUT');
    }
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
    if (this.failBeforeOutput) {
      this.failBeforeOutput = false;
      throw new Error('TEST_PROVIDER_FAILURE_BEFORE_OUTPUT');
    }
    const content = request.messages.at(-1)?.content ?? '';
    yield { content: '测试响应：', done: false };
    if (this.failStreamAfterFirstChunk) {
      this.failStreamAfterFirstChunk = false;
      throw new Error('TEST_PROVIDER_STREAM_FAILURE');
    }
    if (content) {
      yield { content, done: false };
    }
    yield { content: '', done: true };
  }

  async health(): Promise<'UP'> {
    return 'UP';
  }
}
