import {
  loadPlans,
  type PlanCard,
} from '../../services/catalog';

type PlansPageData = {
  accepted: boolean;
  errorText: string;
  hasItems: boolean;
  items: PlanCard[];
  loading: boolean;
};

type PlansPageMethods = {
  onLoad(): Promise<void>;
  reload(): Promise<void>;
  toggleAccepted(
    event: WechatMiniprogram.CheckboxGroupChange<{ value: string[] }>,
  ): void;
};

export function createPlansPageOptions(): WechatMiniprogram.Page.Options<
  PlansPageData,
  PlansPageMethods
> {
  return {
    data: {
      accepted: false,
      errorText: '',
      hasItems: false,
      items: [],
      loading: true,
    },
    async onLoad() {
      await this.reload();
    },
    async reload() {
      this.setData({ errorText: '', loading: true });
      try {
        const items = await loadPlans();
        this.setData({
          hasItems: items.length > 0,
          items,
          loading: false,
        });
      } catch {
        this.setData({
          errorText: '服务套餐暂时无法加载',
          hasItems: false,
          items: [],
          loading: false,
        });
      }
    },
    toggleAccepted(event) {
      this.setData({
        accepted: event.detail.value.includes('accepted'),
      });
    },
  };
}

if (typeof Page === 'function') {
  Page(createPlansPageOptions());
}
