import {
  ACCESS_TOKEN_STORAGE_KEY,
  createHttpClient,
} from '../miniprogram/services/http';
import { API_ALLOWED_HOSTS } from '../miniprogram/config/api';
import {
  requestFailure,
  requestSuccess,
  setAccountEnvVersion,
  seedStorage,
  wxGetAccountInfoSyncMock,
  wxLoginMock,
  wxRemoveStorageSyncMock,
  wxRequestMock,
  wxSetStorageSyncMock,
} from './wx.mock';

const BASE_URL = 'http://127.0.0.1:3000';

function requestTask(): WechatMiniprogram.RequestTask {
  return {} as WechatMiniprogram.RequestTask;
}

describe('HTTP client', () => {
  test('有 token 时自动携带 Bearer token 和唯一 x-request-id', async () => {
    seedStorage(ACCESS_TOKEN_STORAGE_KEY, 'stored-token');
    const requestIds: string[] = [];

    wxRequestMock.mockImplementation((options) => {
      requestIds.push(String(options.header?.['x-request-id']));
      options.success?.(requestSuccess({ ok: true }));
      return requestTask();
    });

    const client = createHttpClient({ baseUrl: BASE_URL });

    await client.request({ url: '/orders' });
    await client.request({ url: '/orders/next' });

    expect(wxRequestMock).toHaveBeenCalledTimes(2);
    expect(wxRequestMock.mock.calls[0][0].header).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer stored-token',
        'x-request-id': expect.any(String),
      }),
    );
    expect(requestIds[0]).toBeTruthy();
    expect(requestIds[1]).toBeTruthy();
    expect(requestIds[0]).not.toBe(requestIds[1]);
  });

  test('401 后调用一次 wx.login，保存新 token 并重试原请求', async () => {
    seedStorage(ACCESS_TOKEN_STORAGE_KEY, 'expired-token');
    wxLoginMock.mockImplementation((options) => {
      options.success?.({ code: 'temporary-code', errMsg: 'login:ok' });
    });
    wxRequestMock
      .mockImplementationOnce((options) => {
        options.success?.(requestSuccess({ message: '登录已过期' }, 401));
        return requestTask();
      })
      .mockImplementationOnce((options) => {
        options.success?.(requestSuccess({ accessToken: 'fresh-token' }));
        return requestTask();
      })
      .mockImplementationOnce((options) => {
        options.success?.(requestSuccess({ id: 'order-1' }));
        return requestTask();
      });

    const client = createHttpClient({ baseUrl: BASE_URL });
    await expect(client.request({ url: '/orders/order-1' })).resolves.toEqual({
      id: 'order-1',
    });

    expect(wxLoginMock).toHaveBeenCalledTimes(1);
    expect(wxSetStorageSyncMock).toHaveBeenCalledWith(
      ACCESS_TOKEN_STORAGE_KEY,
      'fresh-token',
    );
    expect(wxRequestMock).toHaveBeenCalledTimes(3);
    expect(wxRequestMock.mock.calls[2][0].header).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer fresh-token',
      }),
    );
  });

  test('重试仍为 401 时公开报错且不再登录', async () => {
    seedStorage(ACCESS_TOKEN_STORAGE_KEY, 'expired-token');
    wxLoginMock.mockImplementation((options) => {
      options.success?.({ code: 'temporary-code', errMsg: 'login:ok' });
    });
    wxRequestMock
      .mockImplementationOnce((options) => {
        options.success?.(requestSuccess({}, 401));
        return requestTask();
      })
      .mockImplementationOnce((options) => {
        options.success?.(requestSuccess({ accessToken: 'fresh-token' }));
        return requestTask();
      })
      .mockImplementationOnce((options) => {
        options.success?.(requestSuccess({}, 401));
        return requestTask();
      });

    const client = createHttpClient({ baseUrl: BASE_URL });

    await expect(client.request({ url: '/private' })).rejects.toThrow(
      '请求失败，请稍后重试',
    );
    expect(wxLoginMock).toHaveBeenCalledTimes(1);
    expect(wxRequestMock).toHaveBeenCalledTimes(3);
    expect(wxRemoveStorageSyncMock).toHaveBeenCalledWith(
      ACCESS_TOKEN_STORAGE_KEY,
    );
    expect(wxRemoveStorageSyncMock).toHaveBeenCalledTimes(1);
  });

  test('登录请求自身返回 401 时不触发递归登录', async () => {
    wxLoginMock.mockImplementation((options) => {
      options.success?.({ code: 'temporary-code', errMsg: 'login:ok' });
    });
    wxRequestMock
      .mockImplementationOnce((options) => {
        options.success?.(requestSuccess({}, 401));
        return requestTask();
      })
      .mockImplementationOnce((options) => {
        options.success?.(
          requestSuccess(
            {
              message:
                'token=private-token; SELECT * FROM private_users',
            },
            401,
          ),
        );
        return requestTask();
      });

    const client = createHttpClient({ baseUrl: BASE_URL });
    const request = client.request({ url: '/private' });

    await expect(request).rejects.toThrow(
      '登录失败，请稍后重试',
    );
    await expect(request).rejects.not.toThrow(/private-token|SELECT/);
    expect(wxLoginMock).toHaveBeenCalledTimes(1);
    expect(wxRequestMock).toHaveBeenCalledTimes(2);
  });

  test('体验版登录 code 只放在请求 body 中', async () => {
    setAccountEnvVersion('trial');
    API_ALLOWED_HOSTS.trial.push('api.example.com');
    wxLoginMock.mockImplementation((options) => {
      options.success?.({ code: 'private-login-code', errMsg: 'login:ok' });
    });
    wxRequestMock
      .mockImplementationOnce((options) => {
        options.success?.(requestSuccess({}, 401));
        return requestTask();
      })
      .mockImplementationOnce((options) => {
        options.success?.(requestSuccess({ accessToken: 'fresh-token' }));
        return requestTask();
      })
      .mockImplementationOnce((options) => {
        options.success?.(requestSuccess({ ok: true }));
        return requestTask();
      });

    const client = createHttpClient({
      baseUrl: 'https://api.example.com',
    });
    await client.request({ url: '/private' });

    const loginRequest = wxRequestMock.mock.calls[1][0];
    expect(loginRequest.url).toBe(
      'https://api.example.com/auth/wechat/login',
    );
    expect(loginRequest.url).not.toContain('private-login-code');
    expect(loginRequest.data).toEqual({ code: 'private-login-code' });
    expect(JSON.stringify(loginRequest.header)).not.toContain(
      'private-login-code',
    );
    API_ALLOWED_HOSTS.trial.splice(0);
  });

  test('开发版登录使用本地测试 code 兼容测试登录后端', async () => {
    wxLoginMock.mockImplementation((options) => {
      options.success?.({ code: 'real-devtools-code', errMsg: 'login:ok' });
    });
    wxRequestMock
      .mockImplementationOnce((options) => {
        options.success?.(requestSuccess({}, 401));
        return requestTask();
      })
      .mockImplementationOnce((options) => {
        options.success?.(requestSuccess({ accessToken: 'fresh-token' }));
        return requestTask();
      })
      .mockImplementationOnce((options) => {
        options.success?.(requestSuccess({ ok: true }));
        return requestTask();
      });

    const client = createHttpClient({ baseUrl: BASE_URL });
    await client.request({ url: '/private' });

    expect(wxRequestMock.mock.calls[1][0].data).toEqual({
      code: 'test:test-miniapp',
    });
  });

  test('无 token 请求用户接口时先登录再请求，避免首个 401 噪音', async () => {
    wxLoginMock.mockImplementation((options) => {
      options.success?.({ code: 'real-devtools-code', errMsg: 'login:ok' });
    });
    wxRequestMock
      .mockImplementationOnce((options) => {
        options.success?.(requestSuccess({ accessToken: 'fresh-token' }));
        return requestTask();
      })
      .mockImplementationOnce((options) => {
        options.success?.(requestSuccess({ remainingUnits: 1000 }));
        return requestTask();
      });

    const client = createHttpClient({ baseUrl: BASE_URL });
    await expect(
      client.request({ url: '/me/usage/summary' }),
    ).resolves.toEqual({ remainingUnits: 1000 });

    expect(wxRequestMock).toHaveBeenCalledTimes(2);
    expect(wxRequestMock.mock.calls[0][0].url).toBe(
      `${BASE_URL}/auth/wechat/login`,
    );
    expect(wxRequestMock.mock.calls[1][0].url).toBe(
      `${BASE_URL}/me/usage/summary`,
    );
    expect(wxRequestMock.mock.calls[1][0].header).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer fresh-token',
      }),
    );
  });

  test('网络失败使用稳定中文消息且不泄漏原始对象', async () => {
    const privateFailure = requestFailure(
      'request:fail socket secret-internal-detail must-not-leak',
    );
    wxRequestMock.mockImplementation((options) => {
      options.fail?.(privateFailure);
      return requestTask();
    });

    const client = createHttpClient({ baseUrl: BASE_URL });

    await expect(client.request({ url: '/orders' })).rejects.toThrow(
      '网络连接失败，请稍后重试',
    );
    await expect(client.request({ url: '/orders' })).rejects.not.toThrow(
      /secret-internal-detail|must-not-leak/,
    );
  });

  test('任意 message 即使长度合理也回退且不泄漏 token 或 SQL', async () => {
    wxRequestMock.mockImplementation((options) => {
      options.success?.(
        requestSuccess(
          {
            message:
              'token=private-token; SELECT * FROM payment_secrets',
            privateDebug: 'database-secret',
          },
          404,
          {
            Authorization: 'Bearer leaked-token',
          },
        ),
      );
      return requestTask();
    });

    const client = createHttpClient({ baseUrl: BASE_URL });
    const request = client.request({ url: '/orders/missing' });

    await expect(request).rejects.toThrow(
      '请求失败，请稍后重试',
    );
    await expect(request).rejects.not.toThrow(
      /private-token|SELECT|payment_secrets|database-secret|leaked-token/,
    );
  });

  test('长度不超过 200 的 userMessage 可作为公开错误', async () => {
    wxRequestMock.mockImplementation((options) => {
      options.success?.(
        requestSuccess({ userMessage: '订单不存在' }, 404),
      );
      return requestTask();
    });

    const client = createHttpClient({ baseUrl: BASE_URL });

    await expect(
      client.request({ url: '/orders/missing' }),
    ).rejects.toThrow('订单不存在');
  });

  test.each([
    ['RATE_LIMITED', '操作过于频繁，请稍后重试'],
    ['RATE_LIMIT_UNAVAILABLE', '服务暂不可用，请稍后重试'],
  ])('已知公开 code %s 映射为固定中文消息', async (code, message) => {
    wxRequestMock.mockImplementation((options) => {
      options.success?.(requestSuccess({ code }, 429));
      return requestTask();
    });

    const client = createHttpClient({ baseUrl: BASE_URL });

    await expect(client.request({ url: '/orders' })).rejects.toThrow(
      message,
    );
  });

  test('未知 code 即使与对象原型属性同名也回退通用消息', async () => {
    wxRequestMock.mockImplementation((options) => {
      options.success?.(requestSuccess({ code: 'toString' }, 500));
      return requestTask();
    });

    const client = createHttpClient({ baseUrl: BASE_URL });

    await expect(client.request({ url: '/orders' })).rejects.toThrow(
      '请求失败，请稍后重试',
    );
  });

  test('超长 userMessage 回退为稳定通用消息', async () => {
    wxRequestMock.mockImplementation((options) => {
      options.success?.(
        requestSuccess({ userMessage: 'x'.repeat(201) }, 500),
      );
      return requestTask();
    });

    const client = createHttpClient({ baseUrl: BASE_URL });

    await expect(client.request({ url: '/orders' })).rejects.toThrow(
      '请求失败，请稍后重试',
    );
  });

  test('两个客户端遇到同一过期 token 时只刷新一次并分别重试', async () => {
    seedStorage(ACCESS_TOKEN_STORAGE_KEY, 'expired-token');
    wxLoginMock.mockImplementation((options) => {
      options.success?.({ code: 'temporary-code', errMsg: 'login:ok' });
    });
    wxRequestMock.mockImplementation((options) => {
      const authorization = options.header?.Authorization;

      if (options.url.endsWith('/auth/wechat/login')) {
        options.success?.(
          requestSuccess({ accessToken: 'fresh-token' }),
        );
      } else if (authorization === 'Bearer expired-token') {
        options.success?.(requestSuccess({}, 401));
      } else {
        options.success?.(
          requestSuccess({ url: options.url, authorization }),
        );
      }

      return requestTask();
    });

    const firstClient = createHttpClient({ baseUrl: BASE_URL });
    const secondClient = createHttpClient({ baseUrl: BASE_URL });

    await expect(
      Promise.all([
        firstClient.request({ url: '/orders/one' }),
        secondClient.request({ url: '/orders/two' }),
      ]),
    ).resolves.toEqual([
      {
        authorization: 'Bearer fresh-token',
        url: `${BASE_URL}/orders/one`,
      },
      {
        authorization: 'Bearer fresh-token',
        url: `${BASE_URL}/orders/two`,
      },
    ]);
    expect(wxLoginMock).toHaveBeenCalledTimes(1);
    expect(
      wxRequestMock.mock.calls.filter(
        ([options]) =>
          options.url === `${BASE_URL}/auth/wechat/login`,
      ),
    ).toHaveLength(1);
    expect(wxSetStorageSyncMock).toHaveBeenCalledTimes(1);
  });

  test('刷新失败时只清理仍然匹配的过期 token', async () => {
    seedStorage(ACCESS_TOKEN_STORAGE_KEY, 'expired-token');
    wxLoginMock.mockImplementation((options) => {
      options.success?.({ code: 'temporary-code', errMsg: 'login:ok' });
    });
    wxRequestMock
      .mockImplementationOnce((options) => {
        options.success?.(requestSuccess({}, 401));
        return requestTask();
      })
      .mockImplementationOnce((options) => {
        seedStorage(ACCESS_TOKEN_STORAGE_KEY, 'newer-token');
        options.success?.(requestSuccess({}, 500));
        return requestTask();
      });

    const client = createHttpClient({ baseUrl: BASE_URL });

    await expect(client.request({ url: '/private' })).rejects.toThrow(
      '登录失败，请稍后重试',
    );
    expect(wxRemoveStorageSyncMock).not.toHaveBeenCalled();
  });

  test('刷新失败时清理未被其他请求替换的过期 token', async () => {
    seedStorage(ACCESS_TOKEN_STORAGE_KEY, 'expired-token');
    wxLoginMock.mockImplementation((options) => {
      options.success?.({ code: 'temporary-code', errMsg: 'login:ok' });
    });
    wxRequestMock
      .mockImplementationOnce((options) => {
        options.success?.(requestSuccess({}, 401));
        return requestTask();
      })
      .mockImplementationOnce((options) => {
        options.success?.(requestSuccess({}, 500));
        return requestTask();
      });

    const client = createHttpClient({ baseUrl: BASE_URL });

    await expect(client.request({ url: '/private' })).rejects.toThrow(
      '登录失败，请稍后重试',
    );
    expect(wxRemoveStorageSyncMock).toHaveBeenCalledWith(
      ACCESS_TOKEN_STORAGE_KEY,
    );
    expect(wxRemoveStorageSyncMock).toHaveBeenCalledTimes(1);
  });

  test('收到 401 时 storage token 已更新则直接用新 token 重试', async () => {
    seedStorage(ACCESS_TOKEN_STORAGE_KEY, 'expired-token');
    let firstRequest:
      | WechatMiniprogram.RequestOption
      | undefined;

    wxLoginMock.mockImplementation(() => {
      throw new Error('storage token 已更新时不应调用 wx.login');
    });
    wxRequestMock.mockImplementation((options) => {
      if (!firstRequest) {
        firstRequest = options;
      } else {
        options.success?.(requestSuccess({ ok: true }));
      }

      return requestTask();
    });

    const client = createHttpClient({ baseUrl: BASE_URL });
    const request = client.request({ url: '/private' });

    seedStorage(ACCESS_TOKEN_STORAGE_KEY, 'already-fresh-token');
    firstRequest?.success?.(requestSuccess({}, 401));

    await expect(request).resolves.toEqual({ ok: true });
    expect(wxLoginMock).not.toHaveBeenCalled();
    expect(wxRequestMock).toHaveBeenCalledTimes(2);
    expect(wxRequestMock.mock.calls[1][0].header).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer already-fresh-token',
      }),
    );
  });

  test('刷新失败后清理 single-flight，下一请求可再次刷新', async () => {
    seedStorage(ACCESS_TOKEN_STORAGE_KEY, 'expired-token');
    let loginRequestCount = 0;

    wxLoginMock.mockImplementation((options) => {
      options.success?.({ code: 'temporary-code', errMsg: 'login:ok' });
    });
    wxRequestMock.mockImplementation((options) => {
      if (options.url.endsWith('/auth/wechat/login')) {
        loginRequestCount += 1;
        options.success?.(
          loginRequestCount === 1
            ? requestSuccess({ message: 'private SQL detail' }, 500)
            : requestSuccess({ accessToken: 'fresh-token' }),
        );
      } else if (
        options.header?.Authorization === 'Bearer fresh-token'
      ) {
        options.success?.(requestSuccess({ ok: true }));
      } else {
        options.success?.(requestSuccess({}, 401));
      }

      return requestTask();
    });

    const client = createHttpClient({ baseUrl: BASE_URL });

    await expect(client.request({ url: '/private' })).rejects.toThrow(
      '登录失败，请稍后重试',
    );
    await expect(client.request({ url: '/private' })).resolves.toEqual({
      ok: true,
    });
    expect(wxLoginMock).toHaveBeenCalledTimes(2);
    expect(loginRequestCount).toBe(2);
  });

  test('release 环境拒绝注入 HTTP localhost 地址', async () => {
    setAccountEnvVersion('release');
    wxRequestMock.mockImplementation((options) => {
      options.success?.(requestSuccess({ ok: true }));
      return requestTask();
    });
    const client = createHttpClient({ baseUrl: BASE_URL });

    expect(wxGetAccountInfoSyncMock).not.toHaveBeenCalled();
    await expect(client.request({ url: '/health' })).rejects.toThrow(
      '服务地址未配置',
    );
    expect(wxGetAccountInfoSyncMock).toHaveBeenCalledTimes(1);
    expect(wxRequestMock).not.toHaveBeenCalled();
  });

  test('release 环境接受注入公开 HTTPS 地址', async () => {
    setAccountEnvVersion('release');
    API_ALLOWED_HOSTS.release.push('api.example.com');
    wxRequestMock.mockImplementation((options) => {
      options.success?.(requestSuccess({ ok: true }));
      return requestTask();
    });
    const client = createHttpClient({
      baseUrl: 'https://api.example.com/v1',
    });

    await expect(client.request({ url: '/health' })).resolves.toEqual({
      ok: true,
    });
    expect(wxRequestMock.mock.calls[0][0].url).toBe(
      'https://api.example.com/v1/health',
    );
    API_ALLOWED_HOSTS.release.splice(0);
  });

  test('release 环境拒绝不在编译期白名单的注入地址', async () => {
    setAccountEnvVersion('release');
    API_ALLOWED_HOSTS.release.push('api.example.com');
    const client = createHttpClient({
      baseUrl: 'https://other.example.com/v1',
    });

    await expect(client.request({ url: '/health' })).rejects.toThrow(
      '服务地址未配置',
    );
    expect(wxRequestMock).not.toHaveBeenCalled();
    API_ALLOWED_HOSTS.release.splice(0);
  });
});
