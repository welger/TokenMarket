import { UnauthorizedException } from '@nestjs/common';
import { jest } from '@jest/globals';

import {
  createWechatCodeExchange,
  ProductionWechatCodeExchange,
  TestWechatCodeExchange,
} from './wechat-code-exchange.js';

describe('TestWechatCodeExchange', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps a safe test code deterministically', async () => {
    const exchange = new TestWechatCodeExchange();

    await expect(exchange.exchange('test:safe-id_123')).resolves.toEqual({
      openId: 'openid_test_safe-id_123',
    });
  });

  it.each([
    'random-code',
    'test:',
    'test:contains space',
    'test:contains/slash',
    ' test:safe-id ',
  ])('rejects non-test or unsafe code %s', async (code) => {
    const exchange = new TestWechatCodeExchange();

    await expect(exchange.exchange(code)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('is selected in test only when explicitly enabled', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    const exchange = createWechatCodeExchange(
      'test',
      undefined,
      undefined,
      true,
    );

    await expect(exchange.exchange('test:safe-id')).resolves.toEqual({
      openId: 'openid_test_safe-id',
    });
    expect(exchange).toBeInstanceOf(TestWechatCodeExchange);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed in test when test login is explicitly disabled', async () => {
    const exchange = createWechatCodeExchange(
      'test',
      undefined,
      undefined,
      false,
    );

    await expect(exchange.exchange('test:safe-id')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(exchange).not.toBeInstanceOf(TestWechatCodeExchange);
  });

  it('fails closed in development when test login is not explicitly enabled', async () => {
    const exchange = createWechatCodeExchange(
      'development',
      undefined,
      undefined,
      false,
    );

    await expect(exchange.exchange('test:safe-id')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(exchange).not.toBeInstanceOf(TestWechatCodeExchange);
  });

  it('allows the test exchange in development when explicitly enabled', async () => {
    const exchange = createWechatCodeExchange(
      'development',
      undefined,
      undefined,
      true,
    );

    await expect(exchange.exchange('test:safe-id')).resolves.toEqual({
      openId: 'openid_test_safe-id',
    });
    expect(exchange).toBeInstanceOf(TestWechatCodeExchange);
  });

  it('uses the production exchange outside production when real WeChat credentials are configured and test login is disabled', () => {
    const exchange = createWechatCodeExchange(
      'development',
      'staging-placeholder-app-id',
      'staging-placeholder-app-secret',
      false,
    );

    expect(exchange).toBeInstanceOf(ProductionWechatCodeExchange);
  });
});

describe('ProductionWechatCodeExchange', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls code2Session with the required parameters and returns only openId', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          openid: 'wx-open-id',
          session_key: 'must-never-leave-adapter',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    const exchange = new ProductionWechatCodeExchange(
      'local-placeholder-app-id',
      'local-placeholder-secret',
    );

    await expect(exchange.exchange('private-login-code')).resolves.toEqual({
      openId: 'wx-open-id',
    });

    const requestUrl = new URL(
      String(fetchMock.mock.calls[0]?.[0]),
    );
    expect(`${requestUrl.origin}${requestUrl.pathname}`).toBe(
      'https://api.weixin.qq.com/sns/jscode2session',
    );
    expect(Object.fromEntries(requestUrl.searchParams)).toEqual({
      appid: 'local-placeholder-app-id',
      secret: 'local-placeholder-secret',
      js_code: 'private-login-code',
      grant_type: 'authorization_code',
    });
  });

  it('uses a five-second abort signal for the WeChat request', async () => {
    const controller = new AbortController();
    const timeoutMock = jest
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(controller.signal);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ openid: 'wx-open-id' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const exchange = new ProductionWechatCodeExchange(
      'local-placeholder-app-id',
      'local-placeholder-secret',
    );

    await exchange.exchange('private-login-code');

    expect(timeoutMock).toHaveBeenCalledWith(5_000);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('sanitizes abort errors as a generic unauthorized response', async () => {
    const privateAbortDetail = 'private-login-code timed out';
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new DOMException(privateAbortDetail, 'AbortError'));
    const exchange = new ProductionWechatCodeExchange(
      'local-placeholder-app-id',
      'local-placeholder-secret',
    );

    let error: unknown;
    try {
      await exchange.exchange('private-login-code');
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(JSON.stringify(error)).not.toContain(privateAbortDetail);
    expect(JSON.stringify(error)).not.toContain('private-login-code');
  });

  it('returns a generic error without leaking the WeChat response or credentials', async () => {
    const sensitiveValues = [
      'private-login-code',
      'local-placeholder-secret',
      'sensitive-session-key',
      'wechat-sensitive-error-message',
    ];
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          errcode: 40029,
          errmsg: sensitiveValues[3],
          session_key: sensitiveValues[2],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    const exchange = new ProductionWechatCodeExchange(
      'local-placeholder-app-id',
      sensitiveValues[1]!,
    );

    let error: unknown;
    try {
      await exchange.exchange(sensitiveValues[0]!);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(UnauthorizedException);
    const errorText = JSON.stringify(error);
    for (const sensitiveValue of sensitiveValues) {
      expect(errorText).not.toContain(sensitiveValue);
    }
  });

  it('always selects the production exchange in production', () => {
    const exchange = createWechatCodeExchange(
      'production',
      'production-placeholder-app-id',
      'production-placeholder-app-secret',
      true,
    );

    expect(exchange).toBeInstanceOf(ProductionWechatCodeExchange);
  });
});
