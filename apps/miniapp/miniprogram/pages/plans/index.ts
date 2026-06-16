import {
  loadPlans,
  type PlanCard,
} from '../../services/catalog';
import { createPlanOrder } from '../../services/billing';

type PlansPageData = {
  accepted: boolean;
  errorText: string;
  hasItems: boolean;
  items: PlanCard[];
  loading: boolean;
  purchasing: boolean;
  selectedPlanId: string;
};

type PlansPageMethods = {
  createOrder(): Promise<void>;
  onLoad(): Promise<void>;
  reload(): Promise<void>;
  selectPlan(event: WechatMiniprogram.TouchEvent<{ id?: string }>): void;
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
      purchasing: false,
      selectedPlanId: '',
    },
    async onLoad() {
      await this.reload();
    },
    async reload() {
      this.setData({ errorText: '', loading: true });
      try {
        const items = await loadPlans();
        const selectedPlanId =
          items.some((item) => item.id === this.data.selectedPlanId)
            ? this.data.selectedPlanId
            : items[0]?.id ?? '';
        this.setData({
          hasItems: items.length > 0,
          items,
          loading: false,
          selectedPlanId,
        });
      } catch {
        this.setData({
          errorText: '服务套餐暂时无法加载',
          hasItems: false,
          items: [],
          loading: false,
          selectedPlanId: '',
        });
      }
    },
    selectPlan(event) {
      const planId = event.currentTarget.dataset.id;
      if (typeof planId === 'string' && planId.length > 0) {
        this.setData({ selectedPlanId: planId });
      }
    },
    toggleAccepted(event) {
      this.setData({
        accepted: event.detail.value.includes('accepted'),
      });
    },
    async createOrder() {
      if (
        !this.data.accepted ||
        !this.data.selectedPlanId ||
        this.data.purchasing
      ) {
        return;
      }
      this.setData({ purchasing: true });
      try {
        await createPlanOrder(this.data.selectedPlanId);
        wx.navigateTo({ url: '/pages/orders/index' });
      } catch (error) {
        wx.showModal({
          content:
            error instanceof Error
              ? error.message
              : '订单创建失败，请稍后重试或联系客服',
          showCancel: false,
          title: '暂时无法购买',
        });
      } finally {
        this.setData({ purchasing: false });
      }
    },
  };
}

if (typeof Page === 'function') {
  Page(createPlansPageOptions());
}
