import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';

import {
  GatewayService,
  type GatewayChatInput,
} from './gateway.service.js';

interface GatewayRequest {
  ip?: string;
}

interface GatewayResponse {
  setHeader(name: string, value: string): void;
  flushHeaders?(): void;
  write(chunk: string): boolean;
  end(): void;
  status(code: number): GatewayResponse;
  json(body: unknown): void;
}

@Controller('v1')
export class GatewayController {
  constructor(private readonly gatewayService: GatewayService) {}

  @Post('chat/completions')
  @HttpCode(200)
  async chat(
    @Body() body: GatewayChatInput,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-request-id') suppliedRequestId: string | undefined,
    @Req() request: GatewayRequest,
    @Res() response: GatewayResponse,
  ) {
    const requestId =
      this.gatewayService.createRequestId(suppliedRequestId);
    response.setHeader('x-request-id', requestId);
    const context = {
      authorization,
      requestId,
      ip: request.ip,
    };
    if (body.stream === true) {
      let started = false;
      const created = Math.floor(Date.now() / 1000);
      const model =
        typeof body.model === 'string' ? body.model : '';
      const start = () => {
        if (started) {
          return;
        }
        started = true;
        response.setHeader(
          'content-type',
          'text/event-stream; charset=utf-8',
        );
        response.setHeader('cache-control', 'no-cache');
        response.setHeader('connection', 'keep-alive');
        response.flushHeaders?.();
      };
      const writeData = (data: unknown) => {
        start();
        response.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      try {
        const outcome = await this.gatewayService.chatStream(
          body,
          context,
          (content) => {
            writeData({
              id: `chatcmpl-${requestId}`,
              object: 'chat.completion.chunk',
              created,
              model,
              choices: [
                {
                  index: 0,
                  delta: { content },
                  finish_reason: null,
                },
              ],
            });
          },
        );
        if (outcome.errorCode) {
          start();
          response.write(
            `event: error\ndata: ${JSON.stringify({
              error: {
                code: outcome.errorCode,
                message:
                  outcome.errorCode === 'QUOTA_EXHAUSTED'
                    ? '套餐额度不足'
                    : '上游模型响应失败',
                requestId,
              },
            })}\n\n`,
          );
        } else {
          writeData({
            id: `chatcmpl-${requestId}`,
            object: 'chat.completion.chunk',
            created,
            model,
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: 'stop',
              },
            ],
          });
          response.write('data: [DONE]\n\n');
        }
        response.end();
        return;
      } catch (error) {
        if (!started) {
          throw error;
        }
        response.write(
          `event: error\ndata: ${JSON.stringify({
            error: {
              code: 'INTERNAL_ERROR',
              message: '服务暂时不可用',
              requestId,
            },
          })}\n\n`,
        );
        response.end();
        return;
      }
    }

    const result = await this.gatewayService.chat(body, context);
    response.status(200).json(result);
  }
}
