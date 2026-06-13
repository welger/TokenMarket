type OrderDetailPageData = {
  orderId: string;
};

type OrderDetailPageMethods = {
  onLoad(query: { id?: string }): void;
};

const options: WechatMiniprogram.Page.Options<
  OrderDetailPageData,
  OrderDetailPageMethods
> = {
  data: {
    orderId: '',
  },
  onLoad(query: { id?: string }) {
    this.setData({ orderId: query.id ?? '' });
  },
};

if (typeof Page === 'function') {
  Page(options);
}
