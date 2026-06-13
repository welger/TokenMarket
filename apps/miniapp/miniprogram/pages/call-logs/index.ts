import {
  loadCallLogs,
  type ApiCallRow,
} from '../../services/billing';

type CallLogsPageData = {
  errorText: string;
  filterModel: string;
  hasItems: boolean;
  items: ApiCallRow[];
  loading: boolean;
  visibleItems: ApiCallRow[];
};

export function createCallLogsPageOptions(): WechatMiniprogram.Page.Options<
  CallLogsPageData,
  {
    onFilterInput(event: WechatMiniprogram.Input<{ value?: string }>): void;
    onLoad(): Promise<void>;
    reload(): Promise<void>;
  }
> {
  return {
    data: {
      errorText: '',
      filterModel: '',
      hasItems: false,
      items: [],
      loading: true,
      visibleItems: [],
    },
    onFilterInput(event) {
      const filterModel =
        typeof event.detail.value === 'string' ? event.detail.value : '';
      this.setData({
        filterModel,
        visibleItems: filterByModel(this.data.items, filterModel),
      });
    },
    async onLoad() {
      await this.reload();
    },
    async reload() {
      this.setData({ errorText: '', loading: true });
      try {
        const items = await loadCallLogs();
        this.setData({
          hasItems: items.length > 0,
          items,
          loading: false,
          visibleItems: filterByModel(items, this.data.filterModel),
        });
      } catch {
        this.setData({
          errorText: '调用日志暂时无法加载',
          hasItems: false,
          items: [],
          loading: false,
          visibleItems: [],
        });
      }
    },
  };
}

function filterByModel(items: ApiCallRow[], filterModel: string): ApiCallRow[] {
  const keyword = filterModel.trim().toLowerCase();
  if (!keyword) {
    return items;
  }
  return items.filter((item) =>
    item.modelName.toLowerCase().includes(keyword),
  );
}

if (typeof Page === 'function') {
  Page(createCallLogsPageOptions());
}
