import { UnauthorizedException } from '@nestjs/common';

import type { NodeEnvironment } from '../common/config/env.schema.js';

export const WECHAT_CODE_EXCHANGE = Symbol('WECHAT_CODE_EXCHANGE');

export interface WechatCodeExchangeResult {
  openId: string;
}

export interface WechatCodeExchange {
  exchange(code: string): Promise<WechatCodeExchangeResult>;
}

const genericLoginError = (): UnauthorizedException =>
  new UnauthorizedException('WeChat login unavailable');

export class TestWechatCodeExchange implements WechatCodeExchange {
  async exchange(code: string): Promise<WechatCodeExchangeResult> {
    const match = /^test:([A-Za-z0-9_-]{1,128})$/.exec(code);
    if (!match) {
      throw genericLoginError();
    }

    return { openId: `openid_test_${match[1]}` };
  }
}

class FailClosedWechatCodeExchange implements WechatCodeExchange {
  async exchange(): Promise<WechatCodeExchangeResult> {
    throw genericLoginError();
  }
}

interface WechatCode2SessionResponse {
  openid?: unknown;
  errcode?: unknown;
  errmsg?: unknown;
}

export class ProductionWechatCodeExchange
implements WechatCodeExchange {
  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
  ) {}

  async exchange(code: string): Promise<WechatCodeExchangeResult> {
    try {
      const url = new URL(
        'https://api.weixin.qq.com/sns/jscode2session',
      );
      url.search = new URLSearchParams({
        appid: this.appId,
        secret: this.appSecret,
        js_code: code,
        grant_type: 'authorization_code',
      }).toString();

      const response = await fetch(url, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        throw genericLoginError();
      }

      const rawBody = (await response.json()) as
        WechatCode2SessionResponse;
      const body: WechatCode2SessionResponse = {
        openid: rawBody.openid,
        errcode: rawBody.errcode,
        errmsg: rawBody.errmsg,
      };
      if (
        body.errcode !== undefined ||
        typeof body.openid !== 'string' ||
        body.openid.length === 0
      ) {
        throw genericLoginError();
      }

      return { openId: body.openid };
    } catch {
      throw genericLoginError();
    }
  }
}

export function createWechatCodeExchange(
  environment: NodeEnvironment,
  appId?: string,
  appSecret?: string,
  testLoginEnabled = false,
): WechatCodeExchange {
  if (environment === 'production') {
    if (!appId || !appSecret) {
      throw new Error('Invalid WeChat login configuration');
    }

    return new ProductionWechatCodeExchange(appId, appSecret);
  }
  if (testLoginEnabled) {
    return new TestWechatCodeExchange();
  }

  return new FailClosedWechatCodeExchange();
}
