export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ProviderChatRequest {
  model?: string;
  messages: ProviderMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderChatResponse {
  content: string;
  model: string;
  upstreamRequestId?: string;
}

export interface ProviderChunk {
  content: string;
  done: boolean;
}

export interface ProviderClient {
  chat(request: ProviderChatRequest): Promise<ProviderChatResponse>;
  chatStream(request: ProviderChatRequest): AsyncIterable<ProviderChunk>;
  health(): Promise<'UP' | 'DOWN'>;
}
