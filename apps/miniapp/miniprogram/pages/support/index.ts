import {
  loadCompliance,
  type ComplianceView,
} from '../../services/catalog';

type SupportPageData = {
  errorText: string;
  loading: boolean;
  profile: ComplianceView | null;
};

export function createSupportPageOptions(): WechatMiniprogram.Page.Options<
  SupportPageData,
  { onLoad(): Promise<void>; reload(): Promise<void> }
> {
  return {
    data: {
      errorText: '',
      loading: true,
      profile: null,
    },
    async onLoad() {
      await this.reload();
    },
    async reload() {
      this.setData({ errorText: '', loading: true });
      try {
        this.setData({
          loading: false,
          profile: await loadCompliance(),
        });
      } catch {
        this.setData({
          errorText: '客服和投诉入口暂时无法加载',
          loading: false,
          profile: null,
        });
      }
    },
  };
}

if (typeof Page === 'function') {
  Page(createSupportPageOptions());
}
