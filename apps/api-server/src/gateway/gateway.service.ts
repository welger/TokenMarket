import { createHmac, randomUUID } from 'node:crypto';

import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApiKeysService } from '../api-keys/api-keys.service.js';
import { ContentPolicyService } from '../compliance/content-policy.service.js';
import type { EnvironmentVariables } from '../common/config/env.schema.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import {
  ModelStatus,
  ProviderStatus,
} from '../generated/prisma/client.js';
import {
  calculateCharge,
  multiplyUnits,
} from '../metering/charge-calculator.js';
import { MeteringCompensationService } from '../metering/metering-compensation.service.js';
import {
  MeteringService,
  QuotaExhaustedException,
  StreamSettlementException,
} from '../metering/metering.service.js';
import {
  countMessageCharacters,
  countUnicodeCodePoints,
} from '../metering/unicode-counter.js';
import type {
  ProviderChatRequest,
  ProviderClient,
  ProviderMessage,
} from '../providers/provider-client.js';
import { OpenAiCompatibleClient } from '../providers/openai-compatible.client.js';
import { TestProviderClient } from '../providers/test-provider.client.js';
import {
  RateLimitedException,
  RateLimitService,
} from '../risk/rate-limit.service.js';

export interface GatewayHttpContext {
  authorization?: string;
  requestId?: string;
  ip?: string;
}

export interface GatewayChatInput {
  model?: unknown;
  messages?: unknown;
  temperature?: unknown;
  max_tokens?: unknown;
  stream?: unknown;
}

@Injectable()
export class GatewayService {
  private readonly environment: EnvironmentVariables['NODE_ENV'];
  private readonly ipHashSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly apiKeysService: ApiKeysService,
    private readonly contentPolicy: ContentPolicyService,
    private readonly metering: MeteringService,
    private readonly compensation: MeteringCompensationService,
    private readonly rateLimit: RateLimitService,
    private readonly testProvider: TestProviderClient,
    private readonly openAiProvider: OpenAiCompatibleClient,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.environment = config.get('NODE_ENV', { infer: true });
    this.ipHashSecret = config.get('AUDIT_IP_HASH_SECRET', {
      infer: true,
    });
  }

  createRequestId(candidate?: string): string {
    if (
      candidate &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        candidate,
      )
    ) {
      return candidate;
    }
    return randomUUID();
  }

  async chat(
    input: GatewayChatInput,
    context: GatewayHttpContext,
  ) {
    const prepared = await this.prepareRequest(input, context, false);
    const {
      requestId,
      identity,
      parsed,
      model,
      inputCharacters,
      inputChargedUnits,
      ipHash,
      startedAt,
    } = prepared;

    try {
      const provider = this.providerFor(model.provider.configRef);
      return await this.metering.runMetered(
        {
          requestId,
          userId: identity.userId,
          apiKeyId: identity.apiKeyId,
          modelId: model.id,
          inputCharacters,
          inputChargedUnits,
          ipHash,
        },
        async () => {
          const upstream = await provider.chat({
            model: model.upstreamModel,
            messages: parsed.messages,
            temperature: parsed.temperature,
            maxTokens: parsed.maxTokens,
          });
          const outputCharacters = countUnicodeCodePoints(
            upstream.content,
          );
          const charge = calculateCharge({
            inputCharacters,
            outputCharacters,
            inputMultiplier: model.inputMultiplier,
            outputMultiplier: model.outputMultiplier,
          });
          return {
            value: {
              id: `chatcmpl-${requestId}`,
              object: 'chat.completion',
              created: Math.floor(Date.now() / 1000),
              model: model.name,
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content: upstream.content,
                  },
                  finish_reason: 'stop',
                },
              ],
              usage: {
                prompt_characters: inputCharacters,
                completion_characters: outputCharacters,
                total_characters:
                  inputCharacters + outputCharacters,
              },
            },
            outputCharacters,
            outputChargedUnits: charge.outputChargedUnits,
            upstreamRequestId: upstream.upstreamRequestId,
          };
        },
      );
    } catch (error) {
      if (error instanceof QuotaExhaustedException) {
        await this.metering.recordFailure({
          requestId,
          userId: identity.userId,
          apiKeyId: identity.apiKeyId,
          modelId: model.id,
          inputCharacters,
          httpStatus: 409,
          errorCode: 'QUOTA_EXHAUSTED',
          durationMs: Date.now() - startedAt,
          ipHash,
        });
        throw error;
      }

      await this.metering.recordFailure({
        requestId,
        userId: identity.userId,
        apiKeyId: identity.apiKeyId,
        modelId: model.id,
        inputCharacters,
        httpStatus: 502,
        errorCode: 'UPSTREAM_TIMEOUT',
        durationMs: Date.now() - startedAt,
        ipHash,
      });
      throw new BadGatewayException({
        code: 'UPSTREAM_TIMEOUT',
        message: '上游模型响应失败',
      });
    }
  }

  async chatStream(
    input: GatewayChatInput,
    context: GatewayHttpContext,
    emit: (content: string) => Promise<void> | void,
  ) {
    const prepared = await this.prepareRequest(input, context, true);
    const {
      requestId,
      identity,
      parsed,
      model,
      inputCharacters,
      inputChargedUnits,
      ipHash,
      startedAt,
    } = prepared;

    try {
      const provider = this.providerFor(model.provider.configRef);
      const outcome = await this.metering.runStreamMetered(
        {
          requestId,
          userId: identity.userId,
          apiKeyId: identity.apiKeyId,
          modelId: model.id,
          inputCharacters,
          inputChargedUnits,
          ipHash,
        },
        model.outputMultiplier,
        provider.chatStream({
          model: model.upstreamModel,
          messages: parsed.messages,
          temperature: parsed.temperature,
          maxTokens: parsed.maxTokens,
        }),
        emit,
      );
      return {
        requestId,
        model: model.name,
        ...outcome,
      };
    } catch (error) {
      if (error instanceof StreamSettlementException) {
        await this.compensation.enqueue({
          requestId,
          userId: identity.userId,
          apiKeyId: identity.apiKeyId,
          modelId: model.id,
          inputCharacters,
          outputCharacters: error.settlement.outputCharacters,
          inputChargedUnits,
          outputChargedUnits:
            error.settlement.outputChargedUnits,
          ipHash,
        });
        throw error;
      }
      if (error instanceof QuotaExhaustedException) {
        await this.metering.recordFailure({
          requestId,
          userId: identity.userId,
          apiKeyId: identity.apiKeyId,
          modelId: model.id,
          inputCharacters,
          httpStatus: 409,
          errorCode: 'QUOTA_EXHAUSTED',
          durationMs: Date.now() - startedAt,
          ipHash,
        });
        throw error;
      }

      await this.metering.recordFailure({
        requestId,
        userId: identity.userId,
        apiKeyId: identity.apiKeyId,
        modelId: model.id,
        inputCharacters,
        httpStatus: 502,
        errorCode: 'UPSTREAM_TIMEOUT',
        durationMs: Date.now() - startedAt,
        ipHash,
      });
      throw new BadGatewayException({
        code: 'UPSTREAM_TIMEOUT',
        message: '上游模型响应失败',
      });
    }
  }

  private async prepareRequest(
    input: GatewayChatInput,
    context: GatewayHttpContext,
    allowStreaming: boolean,
  ) {
    const requestId = this.createRequestId(context.requestId);
    const plaintextKey = this.bearerToken(context.authorization);
    const identity = await this.apiKeysService.authenticate(plaintextKey);
    const parsed = this.parseInput(input, allowStreaming);
    const model = await this.prisma.model.findFirst({
      where: {
        name: parsed.model,
        status: ModelStatus.AVAILABLE,
        provider: { status: ProviderStatus.ACTIVE },
      },
      include: { provider: true },
    });
    if (!model) {
      throw new NotFoundException({
        code: 'MODEL_UNAVAILABLE',
        message: '模型暂不可用',
      });
    }

    const inputCharacters = countMessageCharacters(parsed.messages);
    const inputChargedUnits = multiplyUnits(
      inputCharacters,
      model.inputMultiplier,
    );
    const ipHash = this.hashIp(context.ip ?? '<unknown>');
    const startedAt = Date.now();
    try {
      await this.rateLimit.check({
        ipHash,
        userId: identity.userId,
        apiKeyId: identity.apiKeyId,
      });
    } catch (error) {
      if (!(error instanceof RateLimitedException)) {
        throw error;
      }
      await this.metering.recordFailure({
        requestId,
        userId: identity.userId,
        apiKeyId: identity.apiKeyId,
        modelId: model.id,
        inputCharacters,
        httpStatus: 429,
        errorCode: 'RATE_LIMITED',
        durationMs: Date.now() - startedAt,
        ipHash,
      });
      throw error;
    }

    const inspection = await this.contentPolicy.inspect(
      parsed.messages.map((message) => message.content).join('\n'),
      requestId,
    );
    if (!inspection.allowed) {
      await this.metering.recordFailure({
        requestId,
        userId: identity.userId,
        apiKeyId: identity.apiKeyId,
        modelId: model.id,
        inputCharacters,
        httpStatus: 403,
        errorCode: 'CONTENT_REJECTED',
        durationMs: Date.now() - startedAt,
        ipHash,
      });
      throw new ForbiddenException({
        code: 'CONTENT_REJECTED',
        message: '请求违反内容安全规则',
      });
    }

    return {
      requestId,
      identity,
      parsed,
      model,
      inputCharacters,
      inputChargedUnits,
      ipHash,
      startedAt,
    };
  }

  private parseInput(
    input: GatewayChatInput,
    allowStreaming: boolean,
  ): {
    model: string;
    messages: ProviderMessage[];
    temperature?: number;
    maxTokens?: number;
    stream: boolean;
  } {
    if (
      input.stream !== undefined &&
      typeof input.stream !== 'boolean'
    ) {
      throw new BadRequestException('Invalid stream');
    }
    if (input.stream === true && !allowStreaming) {
      throw new BadRequestException(
        'Streaming is not enabled in this endpoint version',
      );
    }
    const model = this.text(input.model, 'model', 200);
    if (
      !Array.isArray(input.messages) ||
      input.messages.length === 0 ||
      input.messages.length > 100
    ) {
      throw new BadRequestException('Invalid messages');
    }
    const messages = input.messages.map((value) => {
      if (
        typeof value !== 'object' ||
        value === null ||
        !('role' in value) ||
        !('content' in value)
      ) {
        throw new BadRequestException('Invalid message');
      }
      const role = value.role;
      if (
        role !== 'system' &&
        role !== 'user' &&
        role !== 'assistant'
      ) {
        throw new BadRequestException('Invalid message role');
      }
      return {
        role,
        content: this.text(value.content, 'message content', 100_000),
      };
    });
    const temperature = this.optionalNumber(
      input.temperature,
      'temperature',
      0,
      2,
    );
    const maxTokens = this.optionalInteger(
      input.max_tokens,
      'max_tokens',
      1,
      1_000_000,
    );
    return {
      model,
      messages,
      temperature,
      maxTokens,
      stream: input.stream === true,
    };
  }

  private providerFor(configRef: string): ProviderClient {
    if (
      configRef === 'env:TEST_PROVIDER' &&
      this.environment === 'test'
    ) {
      return this.testProvider;
    }
    return this.openAiProvider;
  }

  private bearerToken(authorization?: string): string {
    if (!authorization) {
      throw new UnauthorizedException('Missing Authorization header');
    }
    const [scheme, token, extra] = authorization.trim().split(/\s+/);
    if (scheme !== 'Bearer' || !token || extra) {
      throw new UnauthorizedException('Invalid Authorization header');
    }
    return token;
  }

  private text(
    value: unknown,
    field: string,
    maximum: number,
  ): string {
    if (
      typeof value !== 'string' ||
      value.length === 0 ||
      value.length > maximum
    ) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return value;
  }

  private optionalNumber(
    value: unknown,
    field: string,
    minimum: number,
    maximum: number,
  ): number | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < minimum ||
      value > maximum
    ) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return value;
  }

  private optionalInteger(
    value: unknown,
    field: string,
    minimum: number,
    maximum: number,
  ): number | undefined {
    const number = this.optionalNumber(
      value,
      field,
      minimum,
      maximum,
    );
    if (number !== undefined && !Number.isInteger(number)) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return number;
  }

  private hashIp(ip: string): string {
    return createHmac('sha256', this.ipHashSecret)
      .update(`gateway-api-call-ip:v1:${ip}`)
      .digest('hex');
  }
}
