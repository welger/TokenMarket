import { API_ALLOWED_HOSTS } from '../miniprogram/config/api';
import {
  createHomePageOptions,
} from '../miniprogram/pages/home/index';
import {
  loadHomeDashboard,
  mapHomeDashboard,
} from '../miniprogram/pages/home/data';
import {
  requestSuccess,
  seedStorage,
  wxRequestMock,
  wxSwitchTabMock,
} from './wx.mock';
import { ACCESS_TOKEN_STORAGE_KEY } from '../miniprogram/services/http';

function requestTask(): WechatMiniprogram.RequestTask {
  return {} as WechatMiniprogram.RequestTask;
}

describe('home dashboard data', () => {
  beforeEach(() => {
    API_ALLOWED_HOSTS.develop.splice(
      0,
      API_ALLOWED_HOSTS.develop.length,
      'localhost',
      '127.0.0.1',
    );
  });

  test('maps real API data without invented month-over-month numbers', () => {
    const dashboard = mapHomeDashboard({
      compliance: {
        operatorName: '北京示例科技有限公司',
        productionEnabled: false,
      },
      models: [
        {
          displayName: '通义千问',
          name: 'qwen-turbo',
          status: 'AVAILABLE',
        },
        {
          displayName: 'DeepSeek',
          name: 'deepseek-chat',
          status: 'AVAILABLE',
        },
        {
          displayName: '备用模型',
          name: 'backup-model',
          status: 'AVAILABLE',
        },
      ],
      plans: { items: [{ id: 'plan-1' }], total: 1 },
      usage: {
        callCount: 12680,
        chargedUnits: 98000,
        inputCharacters: 864000,
        outputCharacters: 125000,
        periodEnd: '2026-06-01T00:00:00.000Z',
        periodStart: '2026-05-01T00:00:00.000Z',
        remainingUnits: 43000,
      },
    });

    expect(dashboard.operatorText).toBe('北京示例科技有限公司');
    expect(dashboard.operatorWarning).toBe(true);
    expect(dashboard.periodText).toBe('统计周期：5.1 - 5.31');
    expect(dashboard.usage.callCount).toBe('12,680');
    expect(dashboard.usage.inputCharacters).toBe('86.4 万字符');
    expect(dashboard.usage.outputCharacters).toBe('12.5 万字符');
    expect(dashboard.usage.remainingUnits).toBe('4.3 万');
    expect(dashboard.usage.trendText).toBe('');
    expect(dashboard.hasPlans).toBe(true);
    expect(dashboard.models).toHaveLength(2);
    expect(dashboard.models[0]).toMatchObject({
      displayName: '通义千问',
      name: 'qwen-turbo',
      statusText: '运行中',
    });
  });

  test('uses explicit empty states when business data, plans or models are absent', () => {
    const dashboard = mapHomeDashboard({
      compliance: null,
      models: [],
      plans: { items: [], total: 0 },
      usage: undefined,
    });

    expect(dashboard.operatorText).toBe('经营主体待完善');
    expect(dashboard.operatorWarning).toBe(true);
    expect(dashboard.hasPlans).toBe(false);
    expect(dashboard.planEmptyText).toBe('暂无可用套餐');
    expect(dashboard.modelEmptyText).toBe('暂无可用模型');
    expect(dashboard.usage.callCount).toBe('0');
  });

  test('loads sections independently and preserves successful data when usage fails', async () => {
    seedStorage(ACCESS_TOKEN_STORAGE_KEY, 'test-token');
    wxRequestMock.mockImplementation((options) => {
      if (options.url.endsWith('/public/models')) {
        options.success?.(
          requestSuccess([
            {
              displayName: '通义千问',
              name: 'qwen-turbo',
              status: 'AVAILABLE',
            },
          ]),
        );
        return requestTask();
      }
      if (options.url.endsWith('/public/compliance')) {
        options.success?.(
          requestSuccess({
            operatorName: '北京示例科技有限公司',
            productionEnabled: true,
          }),
        );
        return requestTask();
      }
      if (options.url.endsWith('/me/plans?page=1&pageSize=1')) {
        options.success?.(requestSuccess({ items: [], total: 0 }));
        return requestTask();
      }

      options.success?.(requestSuccess({ userMessage: '不可展示' }, 500));
      return requestTask();
    });

    const dashboard = await loadHomeDashboard();

    expect(dashboard.models).toHaveLength(1);
    expect(dashboard.operatorText).toBe('北京示例科技有限公司');
    expect(dashboard.usageError).toBe('用量暂时无法加载');
    expect(dashboard.modelError).toBe('');
  });
});

describe('home page interactions', () => {
  test('quick entries switch to the service tab', () => {
    const page = createHomePageOptions();

    page.goServices();

    expect(wxSwitchTabMock).toHaveBeenCalledWith({
      url: '/pages/services/index',
    });
  });

  test('retry reloads dashboard data', async () => {
    const page = createHomePageOptions();
    const setData = jest.fn();
    const context = { setData } as unknown as WechatMiniprogram.Page.Instance<
      Record<string, unknown>,
      Record<string, unknown>
    >;

    seedStorage(ACCESS_TOKEN_STORAGE_KEY, 'test-token');
    wxRequestMock.mockImplementation((options) => {
      options.success?.(requestSuccess([], 200));
      return requestTask();
    });

    await page.reload.call(context);

    expect(setData).toHaveBeenCalledWith({ loading: true, pageError: '' });
    expect(setData).toHaveBeenLastCalledWith(
      expect.objectContaining({ loading: false }),
    );
  });
});
