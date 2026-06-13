import {
  createApiKey,
  disableApiKey,
  loadApiKeys,
  type ApiKeyListItem,
} from '../../services/api-keys';

type ApiKeysPageData = {
  createdSecret: string;
  creating: boolean;
  errorText: string;
  hasItems: boolean;
  items: ApiKeyListItem[];
  keyName: string;
  loading: boolean;
};

type ApiKeysPageMethods = {
  acknowledgeSecret(): void;
  createKey(): Promise<void>;
  disableKey(
    event: WechatMiniprogram.TouchEvent<{ id?: string }>,
  ): Promise<void>;
  onLoad(): Promise<void>;
  onNameInput(
    event: WechatMiniprogram.Input<{ value?: string }>,
  ): void;
  reload(): Promise<void>;
};

export function createApiKeysPageOptions(): WechatMiniprogram.Page.Options<
  ApiKeysPageData,
  ApiKeysPageMethods
> {
  return {
    data: {
      createdSecret: '',
      creating: false,
      errorText: '',
      hasItems: false,
      items: [],
      keyName: '',
      loading: true,
    },
    acknowledgeSecret() {
      this.setData({ createdSecret: '' });
    },
    async createKey() {
      const name = this.data.keyName.trim();
      if (!name) {
        this.setData({ errorText: '请输入 Key 名称' });
        return;
      }

      this.setData({ creating: true, errorText: '' });
      try {
        const created = await createApiKey(name);
        const items = [created.item, ...this.data.items];
        this.setData({
          createdSecret: created.plaintext,
          creating: false,
          hasItems: items.length > 0,
          items,
          keyName: '',
        });
      } catch {
        this.setData({
          creating: false,
          errorText: '创建 API Key 失败，请稍后重试',
        });
      }
    },
    async disableKey(event) {
      const id = event.currentTarget.dataset.id;
      if (typeof id !== 'string' || id.length === 0) {
        return;
      }

      const confirmed = await confirmDisable();
      if (!confirmed) {
        return;
      }

      try {
        const disabled = await disableApiKey(id);
        const items = this.data.items.map((item) =>
          item.id === id ? disabled : item,
        );
        this.setData({ items });
      } catch {
        this.setData({ errorText: '停用 API Key 失败，请稍后重试' });
      }
    },
    async onLoad() {
      await this.reload();
    },
    onNameInput(event) {
      const value = event.detail.value;
      this.setData({
        keyName: typeof value === 'string' ? value : '',
      });
    },
    async reload() {
      this.setData({ errorText: '', loading: true });
      try {
        const items = await loadApiKeys();
        this.setData({
          hasItems: items.length > 0,
          items,
          loading: false,
        });
      } catch {
        this.setData({
          errorText: 'API Key 列表暂时无法加载',
          hasItems: false,
          items: [],
          loading: false,
        });
      }
    },
  };
}

function confirmDisable(): Promise<boolean> {
  return new Promise((resolve) => {
    wx.showModal({
      cancelText: '取消',
      confirmText: '停用',
      content: '停用后该 Key 将不能继续调用 API，且不能恢复。',
      fail: () => resolve(false),
      success: (result) => resolve(result.confirm === true),
      title: '确认停用 API Key',
    });
  });
}

if (typeof Page === 'function') {
  Page(createApiKeysPageOptions());
}
