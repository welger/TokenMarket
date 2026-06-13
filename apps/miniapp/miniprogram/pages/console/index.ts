const CONSOLE_SECTIONS = [
  {
    desc: '创建、停用平台 API Key，密钥只在创建后完整显示一次。',
    title: '密钥管理',
    url: '/pages/api-keys/index',
  },
  {
    desc: '查看调用次数、输入输出量、套餐消耗和调用日志。',
    title: '用量统计',
    url: '/pages/usage/index',
  },
  {
    desc: '查看订单、付款状态、发票和退款记录。',
    title: '订单中心',
    url: '/pages/orders/index',
  },
];

type ConsolePageData = {
  sections: typeof CONSOLE_SECTIONS;
};

type ConsolePageMethods = {
  openSection(
    event: WechatMiniprogram.TouchEvent<{ url?: string }>,
  ): void;
};

export function createConsolePageOptions(): WechatMiniprogram.Page.Options<
  ConsolePageData,
  ConsolePageMethods
> {
  return {
    data: {
      sections: CONSOLE_SECTIONS,
    },
    openSection(event) {
      const url = event.currentTarget.dataset.url;
      if (typeof url === 'string' && url.length > 0) {
        wx.navigateTo({ url });
      }
    },
  };
}

const options = createConsolePageOptions();

if (typeof Page === 'function') {
  Page(options);
}
