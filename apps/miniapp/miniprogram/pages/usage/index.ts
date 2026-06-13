import {
  loadUsageDashboard,
  type UsageDashboard,
} from '../../services/billing';

type UsagePageData = {
  dashboard: UsageDashboard | null;
  errorText: string;
  loading: boolean;
};

export function createUsagePageOptions(): WechatMiniprogram.Page.Options<
  UsagePageData,
  {
    goCallLogs(): void;
    onLoad(): Promise<void>;
    reload(): Promise<void>;
  }
> {
  return {
    data: {
      dashboard: null,
      errorText: '',
      loading: true,
    },
    goCallLogs() {
      wx.navigateTo({ url: '/pages/call-logs/index' });
    },
    async onLoad() {
      await this.reload();
    },
    async reload() {
      this.setData({ errorText: '', loading: true });
      try {
        this.setData({
          dashboard: await loadUsageDashboard(),
          loading: false,
        });
      } catch {
        this.setData({
          dashboard: null,
          errorText: '用量统计暂时无法加载',
          loading: false,
        });
      }
    },
  };
}

if (typeof Page === 'function') {
  Page(createUsagePageOptions());
}
