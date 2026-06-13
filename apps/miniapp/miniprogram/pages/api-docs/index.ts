import {
  createApiDocsView,
  type ApiDocsView,
} from '../../services/catalog';

type ApiDocsPageData = {
  docs: ApiDocsView | null;
  errorText: string;
};

export function createApiDocsPageOptions(): WechatMiniprogram.Page.Options<
  ApiDocsPageData,
  { onLoad(): void }
> {
  return {
    data: {
      docs: null,
      errorText: '',
    },
    onLoad() {
      try {
        this.setData({ docs: createApiDocsView(), errorText: '' });
      } catch {
        this.setData({ docs: null, errorText: '服务地址未配置' });
      }
    },
  };
}

if (typeof Page === 'function') {
  Page(createApiDocsPageOptions());
}
