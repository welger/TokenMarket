import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  ProviderChatRequest,
  ProviderChatResponse,
  ProviderChunk,
  ProviderClient,
} from './provider-client.js';
import type { EnvironmentVariables } from '../common/config/env.schema.js';

interface OpenAiChatResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: { content?: string };
  }>;
}

@Injectable()
export class OpenAiCompatibleClient implements ProviderClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly defaultModel: string;

  constructor(
    configService: ConfigService<EnvironmentVariables, true>,
  ) {
    this.baseUrl = configService
      .get('UPSTREAM_BASE_URL', { infer: true })
      .replace(/\/+$/, '');
    this.apiKey = configService.get('UPSTREAM_API_KEY', { infer: true });
    this.defaultModel = configService.get('UPSTREAM_DEFAULT_MODEL', {
      infer: true,
    });
  }

  async chat(
    request: ProviderChatRequest,
  ): Promise<ProviderChatResponse> {
    const model = request.model ?? this.defaultModel;
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
      }),
    });
    if (!response.ok) {
      throw new Error(`Upstream request failed with ${response.status}`);
    }

    const body = (await response.json()) as OpenAiChatResponse;
    return {
      content: body.choices?.[0]?.message?.content ?? '',
      model: body.model ?? model,
      upstreamRequestId:
        response.headers.get('x-request-id') ?? body.id,
    };
  }

  async *chatStream(
    request: ProviderChatRequest,
  ): AsyncIterable<ProviderChunk> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: request.model ?? this.defaultModel,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: true,
      }),
    });
    if (!response.ok || !response.body) {
      throw new Error(`Upstream stream failed with ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';
      for (const event of events) {
        const data = event
          .split('\n')
          .find((line) => line.startsWith('data:'))
          ?.slice(5)
          .trim();
        if (!data) {
          continue;
        }
        if (data === '[DONE]') {
          yield { content: '', done: true };
          return;
        }
        const parsed = JSON.parse(data) as {
          choices?: Array<{
            delta?: { content?: string };
            finish_reason?: string | null;
          }>;
        };
        const choice = parsed.choices?.[0];
        yield {
          content: choice?.delta?.content ?? '',
          done: choice?.finish_reason != null,
        };
      }
      if (done) {
        return;
      }
    }
  }

  async health(): Promise<'UP' | 'DOWN'> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: this.headers(),
      });
      return response.ok ? 'UP' : 'DOWN';
    } catch {
      return 'DOWN';
    }
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.apiKey
        ? { Authorization: `Bearer ${this.apiKey}` }
        : {}),
    };
  }
}
