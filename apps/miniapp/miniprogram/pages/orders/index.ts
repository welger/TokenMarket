import {
  loadOrders,
  payWechatOrder,
  type OrderRow,
} from '../../services/billing';

type OrdersPageData = {
  errorText: string;
  hasItems: boolean;
  items: OrderRow[];
  loading: boolean;
  payingOrderId: string;
};

export function createOrdersPageOptions(): WechatMiniprogram.Page.Options<
  OrdersPageData,
  {
    goInvoices(): void;
    goRefunds(): void;
    onLoad(): Promise<void>;
    openDetail(event: WechatMiniprogram.TouchEvent<{ id?: string }>): void;
    payWechat(event: WechatMiniprogram.TouchEvent<{ id?: string }>): Promise<void>;
    reload(): Promise<void>;
  }
> {
  return {
    data: {
      errorText: '',
      hasItems: false,
      items: [],
      loading: true,
      payingOrderId: '',
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
    async payWechat(event) {
      const id = event.currentTarget.dataset.id;
      if (
        typeof id !== 'string' ||
        id.length === 0 ||
        this.data.payingOrderId === id
      ) {
        return;
      }

      this.setData({ payingOrderId: id });
      try {
        await payWechatOrder(id);
        this.setData({ payingOrderId: '' });
        await this.reload();
      } catch (error) {
        this.setData({ payingOrderId: '' });
        wx.showModal({
          content:
            error instanceof Error
              ? error.message
              : '微信支付未完成，请稍后重试或联系客服',
          confirmText: '知道了',
          showCancel: false,
          title: '支付未完成',
        });
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
