import {
  loadCompliance,
  type ComplianceView,
} from '../../services/catalog';

type PrivacyPageData = {
  errorText: string;
  loading: boolean;
  profile: ComplianceView | null;
};

export function createPrivacyPageOptions(): WechatMiniprogram.Page.Options<
  PrivacyPageData,
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
          errorText: '隐私与数据说明暂时无法加载',
          loading: false,
          profile: null,
        });
      }
    },
  };
}

if (typeof Page === 'function') {
  Page(createPrivacyPageOptions());
}
