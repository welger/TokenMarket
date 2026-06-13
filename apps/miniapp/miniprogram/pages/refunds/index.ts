import {
  loadRefunds,
  type RefundRow,
} from '../../services/billing';

type RefundsPageData = {
  errorText: string;
  hasItems: boolean;
  items: RefundRow[];
  loading: boolean;
};

type RefundsPageMethods = {
  onLoad(): Promise<void>;
  reload(): Promise<void>;
};

const options: WechatMiniprogram.Page.Options<
  RefundsPageData,
  RefundsPageMethods
> = {
  data: {
    errorText: '',
    hasItems: false,
    items: [] as RefundRow[],
    loading: true,
  },
  async onLoad() {
    await this.reload();
  },
  async reload() {
    this.setData({ errorText: '', loading: true });
    try {
      const items = await loadRefunds();
      this.setData({ hasItems: items.length > 0, items, loading: false });
    } catch {
      this.setData({
        errorText: '退款记录暂时无法加载',
        hasItems: false,
        items: [],
        loading: false,
      });
    }
  },
};

if (typeof Page === 'function') {
  Page(options);
}
