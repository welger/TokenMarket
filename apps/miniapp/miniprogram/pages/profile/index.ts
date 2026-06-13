const PROFILE_SECTIONS = [
  {
    desc: '说明模型供应商、服务器地区、保存期限和删除方式。',
    title: '隐私与数据说明',
    url: '/pages/privacy/index',
  },
  {
    desc: '禁止违法内容、诈骗、攻击、侵权和批量滥用。',
    title: '内容安全规则',
    url: '/pages/content-safety/index',
  },
  {
    desc: '展示真实客服电话或在线客服入口。',
    title: '客服和投诉入口',
    url: '/pages/support/index',
  },
];

type ProfilePageData = {
  sections: typeof PROFILE_SECTIONS;
};

type ProfilePageMethods = {
  openSection(
    event: WechatMiniprogram.TouchEvent<{ url?: string }>,
  ): void;
};

export function createProfilePageOptions(): WechatMiniprogram.Page.Options<
  ProfilePageData,
  ProfilePageMethods
> {
  return {
    data: {
      sections: PROFILE_SECTIONS,
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
  Page(createProfilePageOptions());
}
