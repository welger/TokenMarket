import { createPlanOrder } from '../miniprogram/services/billing';
import {
  loadPlans,
  type PlanCard,
} from '../miniprogram/services/catalog';
import { createPlansPageOptions } from '../miniprogram/pages/plans/index';
import {
  wxNavigateToMock,
  wxShowModalMock,
} from './wx.mock';

jest.mock('../miniprogram/services/catalog', () => ({
  loadPlans: jest.fn(),
}));

jest.mock('../miniprogram/services/billing', () => ({
  createPlanOrder: jest.fn(),
}));

const loadPlansMock = jest.mocked(loadPlans);
const createPlanOrderMock = jest.mocked(createPlanOrder);

function plan(overrides: Partial<PlanCard> = {}): PlanCard {
  return {
    activationText: '购买后立即生效',
    applicableModelText: '阶段一固定测试模型',
    description: '仅用于测试',
    id: 'plan_1',
    name: '阶段一固定测试套餐',
    priceText: '¥1.00',
    purchaseNotice: '测试支付不产生真实扣款',
    quotaText: '100 万通用字符',
    refundPolicy: '测试套餐不涉及真实退款',
    validityText: '有效期 30 天',
    ...overrides,
  };
}

function createPageContext() {
  const page = createPlansPageOptions();
  const context = {
    data: { ...page.data },
    setData: jest.fn((update: Record<string, unknown>) => {
      Object.assign(context.data, update);
    }),
  } as unknown as WechatMiniprogram.Page.Instance<
    Record<string, unknown>,
    Record<string, unknown>
  >;

  return { context, page };
}

function checkboxEvent(
  value: string[],
): WechatMiniprogram.CheckboxGroupChange<{ value: string[] }> {
  return {
    detail: { value },
  } as unknown as WechatMiniprogram.CheckboxGroupChange<{ value: string[] }>;
}

function touchEvent(
  id: string,
): WechatMiniprogram.TouchEvent<{ id?: string }> {
  return {
    currentTarget: { dataset: { id } },
  } as unknown as WechatMiniprogram.TouchEvent<{ id?: string }>;
}

describe('plans page purchase flow', () => {
  test('selects the first loaded plan by default', async () => {
    const { context, page } = createPageContext();
    loadPlansMock.mockResolvedValue([plan({ id: 'plan_1' })]);

    await page.reload.call(context);

    expect(context.setData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        hasItems: true,
        selectedPlanId: 'plan_1',
      }),
    );
  });

  test('lets the user select another plan card', () => {
    const { context, page } = createPageContext();

    page.selectPlan.call(context, touchEvent('plan_2'));

    expect(context.setData).toHaveBeenCalledWith({
      selectedPlanId: 'plan_2',
    });
  });

  test('creates an order and navigates to order center after acceptance', async () => {
    const { context, page } = createPageContext();
    page.toggleAccepted.call(context, checkboxEvent(['accepted']));
    page.selectPlan.call(context, touchEvent('plan_1'));
    createPlanOrderMock.mockResolvedValue({
      amountText: '¥1.00',
      canPayWechat: true,
      createdAtText: '2026-06-16',
      id: 'order_1',
      orderNumber: 'ord_1',
      paymentText: '微信支付',
      planName: '阶段一固定测试套餐',
      statusText: '待支付',
    });

    await page.createOrder.call(context);

    expect(createPlanOrderMock).toHaveBeenCalledWith('plan_1');
    expect(wxNavigateToMock).toHaveBeenCalledWith({
      url: '/pages/orders/index',
    });
  });

  test('does not create an order before acceptance', async () => {
    const { context, page } = createPageContext();
    page.selectPlan.call(context, touchEvent('plan_1'));

    await page.createOrder.call(context);

    expect(createPlanOrderMock).not.toHaveBeenCalled();
  });

  test('shows a modal when order creation fails', async () => {
    const { context, page } = createPageContext();
    page.toggleAccepted.call(context, checkboxEvent(['accepted']));
    page.selectPlan.call(context, touchEvent('plan_1'));
    createPlanOrderMock.mockRejectedValue(new Error('登录已过期'));

    await page.createOrder.call(context);

    expect(wxShowModalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '登录已过期',
        showCancel: false,
        title: '暂时无法购买',
      }),
    );
  });
});
