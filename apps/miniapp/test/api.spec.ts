import {
  API_ALLOWED_HOSTS,
  API_BASE_URLS,
  DEVELOP_API_BASE_URL,
  resolveApiBaseUrl,
} from '../miniprogram/config/api';
import { setAccountEnvVersion } from './wx.mock';

describe('API 地址配置', () => {
  test('develop 默认使用本机 API 地址', () => {
    setAccountEnvVersion('develop');

    expect(resolveApiBaseUrl()).toBe(DEVELOP_API_BASE_URL);
  });

  test('release 未配置地址时抛出固定错误且不回退 localhost', () => {
    setAccountEnvVersion('release');

    expect(() => resolveApiBaseUrl()).toThrow('服务地址未配置');
  });

  test('trial 使用体验环境 HTTPS API 地址', () => {
    setAccountEnvVersion('trial');

    expect(resolveApiBaseUrl()).toBe(
      'https://api-staging.yourtoken.work',
    );
  });

  test('trial 和 release 拒绝非 HTTPS 地址', () => {
    setAccountEnvVersion('release');

    expect(() =>
      resolveApiBaseUrl({
        ...API_BASE_URLS,
        release: 'http://api.example.test',
      }, {
        ...API_ALLOWED_HOSTS,
        release: ['api.example.test'],
      }),
    ).toThrow('服务地址未配置');
  });

  test.each([
    'https://localhost:3000',
    'https://127.0.0.1:3000',
    'https://127.1',
    'https://0177.0.0.1',
    'https://0x7f.0.0.1',
    'https://user:password@api.example.com',
    'https://api.example.com:70000',
    'https://api',
    'https://api..example.com',
  ])('trial 和 release 拒绝非公开或畸形地址 %s', (release) => {
    setAccountEnvVersion('release');

    expect(() =>
      resolveApiBaseUrl({
        ...API_BASE_URLS,
        release,
      }, {
        ...API_ALLOWED_HOSTS,
        release: [new RegExp('^https://([^/:]+)').exec(release)?.[1] ?? ''],
      }),
    ).toThrow('服务地址未配置');
  });

  test('release 接受带路径的公开 HTTPS 地址', () => {
    setAccountEnvVersion('release');

    expect(
      resolveApiBaseUrl({
        ...API_BASE_URLS,
        release: 'https://api.example.com/v1/',
      }, {
        ...API_ALLOWED_HOSTS,
        release: ['api.example.com'],
      }),
    ).toBe('https://api.example.com/v1/');
  });

  test.each([
    'https://api.local',
    'https://service.home.arpa',
    'https://metadata.google.internal',
  ])('release 即使白名单误配也拒绝特殊用途域名 %s', (release) => {
    setAccountEnvVersion('release');
    const hostname =
      new RegExp('^https://([^/:]+)').exec(release)?.[1] ?? '';

    expect(() =>
      resolveApiBaseUrl(
        {
          ...API_BASE_URLS,
          release,
        },
        {
          ...API_ALLOWED_HOSTS,
          release: [hostname],
        },
      ),
    ).toThrow('服务地址未配置');
  });

  test('release 拒绝未列入当前环境白名单的公开 HTTPS 地址', () => {
    setAccountEnvVersion('release');

    expect(() =>
      resolveApiBaseUrl(
        {
          ...API_BASE_URLS,
          release: 'https://other.example.com',
        },
        {
          ...API_ALLOWED_HOSTS,
          release: ['api.example.com'],
        },
      ),
    ).toThrow('服务地址未配置');
  });
});
