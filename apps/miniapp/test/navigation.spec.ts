import appConfig from '../miniprogram/app.json';
import { createConsolePageOptions } from '../miniprogram/pages/console/index';
import { createProfilePageOptions } from '../miniprogram/pages/profile/index';
import { createServicesPageOptions } from '../miniprogram/pages/services/index';
import { wxNavigateToMock } from './wx.mock';

describe('miniapp navigation', () => {
  test('registers four main tabs, detail pages and native tabBar', () => {
    expect(appConfig.pages.slice(0, 4)).toEqual([
      'pages/home/index',
      'pages/services/index',
      'pages/console/index',
      'pages/profile/index',
    ]);
    expect(appConfig.pages).toEqual(
      expect.arrayContaining([
        'pages/models/index',
        'pages/plans/index',
        'pages/api-docs/index',
        'pages/privacy/index',
        'pages/content-safety/index',
        'pages/support/index',
        'pages/api-keys/index',
        'pages/usage/index',
        'pages/call-logs/index',
        'pages/orders/index',
        'pages/order-detail/index',
        'pages/invoices/index',
        'pages/refunds/index',
      ]),
    );
    expect(appConfig.tabBar).toMatchObject({
      color: '#8a8f99',
      selectedColor: '#07C160',
    });
    expect(appConfig.tabBar.list.map((item) => item.text)).toEqual([
      '首页',
      '服务',
      '控制台',
      '我的',
    ]);
    expect(
      appConfig.tabBar.list.every(
        (item) =>
          item.iconPath.endsWith('.png') &&
          item.selectedIconPath.endsWith('.png'),
      ),
    ).toBe(true);
  });

  test('service and profile cards open their real detail pages', () => {
    const servicesPage = createServicesPageOptions();
    const consolePage = createConsolePageOptions();
    const profilePage = createProfilePageOptions();
    const event = (url: string) =>
      ({
        currentTarget: { dataset: { url } },
      }) as unknown as WechatMiniprogram.TouchEvent<{
        url?: string;
      }>;

    servicesPage.openSection(event('/pages/models/index'));
    consolePage.openSection(event('/pages/api-keys/index'));
    consolePage.openSection(event('/pages/usage/index'));
    consolePage.openSection(event('/pages/orders/index'));
    profilePage.openSection(event('/pages/privacy/index'));

    expect(wxNavigateToMock).toHaveBeenCalledWith({
      url: '/pages/models/index',
    });
    expect(wxNavigateToMock).toHaveBeenCalledWith({
      url: '/pages/api-keys/index',
    });
    expect(wxNavigateToMock).toHaveBeenCalledWith({
      url: '/pages/usage/index',
    });
    expect(wxNavigateToMock).toHaveBeenCalledWith({
      url: '/pages/orders/index',
    });
    expect(wxNavigateToMock).toHaveBeenCalledWith({
      url: '/pages/privacy/index',
    });
  });
});
