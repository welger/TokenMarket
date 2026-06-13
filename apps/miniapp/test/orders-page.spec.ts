import {
  loadOrders,
  payWechatOrder,
  type OrderRow,
} from '../miniprogram/services/billing';
import { createOrdersPageOptions } from '../miniprogram/pages/orders/index';
import { wxShowModalMock } from './wx.mock';

jest.mock('../miniprogram/services/billing', () => ({
  loadOrders: jest.fn(),
  payWechatOrder: jest.fn(),
}));

const loadOrdersMock = jest.mocked(loadOrders);
const payWechatOrderMock = jest.mocked(payWechatOrder);

function orderRow(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    amountText: '¥99.00',
    canPayWechat: true,
    createdAtText: '2026-06-14',
    id: 'order_1',
    orderNumber: 'ord_1',
    paymentText: '微信支付',
    planName: '开发测试套餐',
    statusText: '待支付',
    ...overrides,
  };
}

function touchEvent(
  id: string,
): WechatMiniprogram.TouchEvent<{ id?: string }> {
  return {
    currentTarget: { dataset: { id } },
  } as unknown as WechatMiniprogram.TouchEvent<{ id?: string }>;
}

function createPageContext() {
  const page = createOrdersPageOptions();
  const context = {
    data: { ...page.data },
    reload: page.reload,
    setData: jest.fn((update: Record<string, unknown>) => {
      Object.assign(context.data, update);
    }),
  } as unknown as WechatMiniprogram.Page.Instance<
    Record<string, unknown>,
    Record<string, unknown>
  >;

  return { context, page };
}

describe('orders page WeChat payment', () => {
  test('starts WeChat payment for the selected order', async () => {
    const { context, page } = createPageContext();
    loadOrdersMock.mockResolvedValue([orderRow()]);
    payWechatOrderMock.mockResolvedValue();

    await page.payWechat.call(context, touchEvent('order_1'));

    expect(payWechatOrderMock).toHaveBeenCalledWith('order_1');
  });

  test('refreshes orders after a successful WeChat payment', async () => {
    const { context, page } = createPageContext();
    loadOrdersMock.mockResolvedValue([orderRow({ statusText: '已发放' })]);
    payWechatOrderMock.mockResolvedValue();

    await page.payWechat.call(context, touchEvent('order_1'));

    expect(loadOrdersMock).toHaveBeenCalledTimes(1);
    expect(context.setData).toHaveBeenLastCalledWith({
      hasItems: true,
      items: [expect.objectContaining({ statusText: '已发放' })],
      loading: false,
    });
  });

  test('shows a modal when WeChat payment fails', async () => {
    const { context, page } = createPageContext();
    payWechatOrderMock.mockRejectedValue(
      new Error('微信支付未完成，请稍后重试或联系客服'),
    );

    await page.payWechat.call(context, touchEvent('order_1'));

    expect(wxShowModalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '微信支付未完成，请稍后重试或联系客服',
        showCancel: false,
        title: '支付未完成',
      }),
    );
  });
});
