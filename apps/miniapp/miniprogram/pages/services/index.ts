const SERVICE_SECTIONS = [
  {
    desc: '展示支持的模型、功能、计费单位和服务状态。',
    title: '模型列表',
    url: '/pages/models/index',
  },
  {
    desc: '展示调用包、开发测试套餐、有效期和退款条件。',
    title: '服务套餐',
    url: '/pages/plans/index',
  },
  {
    desc: '展示请求地址、鉴权方式、参数、错误码和示例。',
    title: 'API 文档',
    url: '/pages/api-docs/index',
  },
];

type ServicesPageData = {
  sections: typeof SERVICE_SECTIONS;
};

type ServicesPageMethods = {
  openSection(
    event: WechatMiniprogram.TouchEvent<{ url?: string }>,
  ): void;
};

export function createServicesPageOptions(): WechatMiniprogram.Page.Options<
  ServicesPageData,
  ServicesPageMethods
> {
  return {
    data: {
      sections: SERVICE_SECTIONS,
    },
    openSection(event) {
      const url = event.currentTarget.dataset.url;
      if (typeof url === 'string' && url.length > 0) {
        wx.navigateTo({ url });
      }
    },
  };
}

if (typeof Page === 'function') {
  Page(createServicesPageOptions());
}
