import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { WechatAuthController } from './wechat-auth.controller.js';
import type { WechatAuthService } from './wechat-auth.service.js';

describe('WechatAuthController', () => {
  it('exposes POST /auth/wechat/login', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, WechatAuthController),
    ).toBe('auth/wechat');
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        WechatAuthController.prototype.login,
      ),
    ).toBe('login');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        WechatAuthController.prototype.login,
      ),
    ).toBe(RequestMethod.POST);
  });

  it('checks the request IP before passing the body code to the authentication service', async () => {
    const service = {
      login: jest.fn().mockResolvedValue({
        accessToken: 'miniapp-access-token',
        userId: 'user_1',
      }),
    } as unknown as WechatAuthService;
    const throttle = {
      check: jest.fn().mockResolvedValue(undefined),
    };
    const controller = Reflect.construct(WechatAuthController, [
      service,
      throttle,
    ]) as WechatAuthController;

    await expect(
      Reflect.apply(controller.login, controller, [
        { code: 'test:safe-id' },
        { ip: '203.0.113.10' },
      ]),
    ).resolves.toEqual({
      accessToken: 'miniapp-access-token',
      userId: 'user_1',
    });
    expect(throttle.check).toHaveBeenCalledWith('203.0.113.10');
    expect(service.login).toHaveBeenCalledWith('test:safe-id');
    expect(throttle.check.mock.invocationCallOrder[0]).toBeLessThan(
      service.login.mock.invocationCallOrder[0]!,
    );
  });

  it.each([
    ['too many requests', 429],
    ['Redis unavailable', 503],
  ])('does not exchange the code when throttling reports %s', async (
    _label,
    status,
  ) => {
    const privateIp = '203.0.113.11';
    const privateCode = 'test:private-login-code';
    const service = {
      login: jest.fn(),
    } as unknown as WechatAuthService;
    const throttle = {
      check: jest.fn().mockRejectedValue(
        new HttpException('WeChat login unavailable', status),
      ),
    };
    const controller = Reflect.construct(WechatAuthController, [
      service,
      throttle,
    ]) as WechatAuthController;

    const operation = Promise.resolve().then(() =>
      Reflect.apply(controller.login, controller, [
        { code: privateCode },
        { ip: privateIp },
      ]),
    );

    await expect(operation).rejects.toMatchObject({ status });
    expect(service.login).not.toHaveBeenCalled();
    let error: unknown;
    try {
      await operation;
    } catch (caught) {
      error = caught;
    }
    expect(JSON.stringify(error)).not.toContain(privateIp);
    expect(JSON.stringify(error)).not.toContain(privateCode);
  });
});
