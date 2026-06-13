import {
  loadModels,
  type ModelListItem,
} from '../../services/catalog';

type ModelsPageData = {
  errorText: string;
  hasItems: boolean;
  items: ModelListItem[];
  loading: boolean;
};

type ModelsPageMethods = {
  onLoad(): Promise<void>;
  reload(): Promise<void>;
};

export function createModelsPageOptions(): WechatMiniprogram.Page.Options<
  ModelsPageData,
  ModelsPageMethods
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
        const items = await loadModels();
        this.setData({
          hasItems: items.length > 0,
          items,
          loading: false,
        });
      } catch {
        this.setData({
          errorText: '模型列表暂时无法加载',
          hasItems: false,
          items: [],
          loading: false,
        });
      }
    },
  };
}

if (typeof Page === 'function') {
  Page(createModelsPageOptions());
}
