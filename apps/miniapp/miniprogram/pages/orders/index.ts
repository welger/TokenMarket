import {
  loadOrders,
  type OrderRow,
} from '../../services/billing';

type OrdersPageData = {
  errorText: string;
  hasItems: boolean;
  items: OrderRow[];
  loading: boolean;
};

export function createOrdersPageOptions(): WechatMiniprogram.Page.Options<
  OrdersPageData,
  {
    goInvoices(): void;
    goRefunds(): void;
    onLoad(): Promise<void>;
    openDetail(event: WechatMiniprogram.TouchEvent<{ id?: string }>): void;
    reload(): Promise<void>;
  }
> {
  return {
    data: {
      errorText: '',
      hasItems: false,
      items: [],
      loading: true,
    },
    goInvoices() {
      wx.navigateTo({ url: '/pages/invoices/index' });
    },
    goRefunds() {
      wx.navigateTo({ url: '/pages/refunds/index' });
    },
    async onLoad() {
      await this.reload();
    },
    openDetail(event) {
      const id = event.currentTarget.dataset.id;
      if (typeof id === 'string' && id.length > 0) {
        wx.navigateTo({ url: `/pages/order-detail/index?id=${id}` });
      }
    },
    async reload() {
      this.setData({ errorText: '', loading: true });
      try {
        const items = await loadOrders();
        this.setData({
          hasItems: items.length > 0,
          items,
          loading: false,
        });
      } catch {
        this.setData({
          errorText: '订单暂时无法加载',
          hasItems: false,
          items: [],
          loading: false,
        });
      }
    },
  };
}

if (typeof Page === 'function') {
  Page(createOrdersPageOptions());
}
