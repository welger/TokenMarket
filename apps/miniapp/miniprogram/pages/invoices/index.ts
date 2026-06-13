import {
  loadInvoices,
  type InvoiceRow,
} from '../../services/billing';

type InvoicesPageData = {
  errorText: string;
  hasItems: boolean;
  items: InvoiceRow[];
  loading: boolean;
};

type InvoicesPageMethods = {
  onLoad(): Promise<void>;
  reload(): Promise<void>;
};

const options: WechatMiniprogram.Page.Options<
  InvoicesPageData,
  InvoicesPageMethods
> = {
  data: {
    errorText: '',
    hasItems: false,
    items: [] as InvoiceRow[],
    loading: true,
  },
  async onLoad() {
    await this.reload();
  },
  async reload() {
    this.setData({ errorText: '', loading: true });
    try {
      const items = await loadInvoices();
      this.setData({ hasItems: items.length > 0, items, loading: false });
    } catch {
      this.setData({
        errorText: '发票记录暂时无法加载',
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
