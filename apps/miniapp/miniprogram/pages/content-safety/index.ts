import {
  loadContentRules,
  type RuleRow,
} from '../../services/catalog';

type ContentSafetyPageData = {
  errorText: string;
  hasItems: boolean;
  items: RuleRow[];
  loading: boolean;
};

export function createContentSafetyPageOptions(): WechatMiniprogram.Page.Options<
  ContentSafetyPageData,
  { onLoad(): Promise<void>; reload(): Promise<void> }
> {
  return {
    data: {
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
        const items = await loadContentRules();
        this.setData({
          hasItems: items.length > 0,
          items,
          loading: false,
        });
      } catch {
        this.setData({
          errorText: '内容安全规则暂时无法加载',
          hasItems: false,
          items: [],
          loading: false,
        });
      }
    },
  };
}

if (typeof Page === 'function') {
  Page(createContentSafetyPageOptions());
}
