import {
  loadHomeDashboard,
  type HomeDashboard,
} from './data';

const EMPTY_DASHBOARD: HomeDashboard = {
  hasModels: false,
  hasPlans: false,
  modelEmptyText: '',
  modelError: '',
  models: [],
  operatorText: '经营主体待完善',
  operatorTone: 'warning',
  operatorWarning: true,
  pageError: '',
  periodText: '',
  planEmptyText: '',
  serviceStatusText: '服务状态待确认',
  usage: {
    callCount: '0',
    inputCharacters: '0 字符',
    outputCharacters: '0 字符',
    remainingUnits: '0',
    trendText: '',
  },
  usageError: '',
};

type HomePageData = HomeDashboard & {
  loading: boolean;
};

type HomePageMethods = {
  goConsole(): void;
  goProfile(): void;
  goServices(): void;
  onLoad(): Promise<void>;
  reload(): Promise<void>;
};

export function createHomePageOptions(): WechatMiniprogram.Page.Options<
  HomePageData,
  HomePageMethods
> {
  return {
    data: {
      ...EMPTY_DASHBOARD,
      loading: true,
    },
    async onLoad() {
      await this.reload();
    },
    async reload() {
      this.setData({ loading: true, pageError: '' });
      try {
        this.setData({
          ...(await loadHomeDashboard()),
          loading: false,
        });
      } catch {
        this.setData({
          loading: false,
          pageError: '首页暂时无法加载',
        });
      }
    },
    goServices() {
      wx.switchTab({ url: '/pages/services/index' });
    },
    goConsole() {
      wx.switchTab({ url: '/pages/console/index' });
    },
    goProfile() {
      wx.switchTab({ url: '/pages/profile/index' });
    },
  };
}

if (typeof Page === 'function') {
  Page(createHomePageOptions());
}
