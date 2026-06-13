import {
  createApiDocsView,
  mapCompliance,
  mapContentRules,
  mapModels,
  mapPlans,
} from '../miniprogram/services/catalog';

describe('service catalog mapping', () => {
  test('maps public models with billing units, capabilities and provider disclosure', () => {
    const models = mapModels([
      {
        capabilities: ['chat', 'function-call'],
        contextWindow: 128000,
        description: '通用对话模型',
        displayName: '通义千问',
        inputUnit: 'CHARACTER',
        name: 'qwen-turbo',
        outputUnit: 'CHARACTER',
        provider: {
          displayName: '阿里云',
          disclosurePurpose: '模型推理',
          region: '中国大陆',
        },
        status: 'AVAILABLE',
      },
    ]);

    expect(models[0]).toMatchObject({
      billingText: '输入：字符；输出：字符',
      capabilitiesText: 'chat、function-call',
      contextText: '上下文 128,000',
      providerText: '阿里云 / 中国大陆 / 模型推理',
      statusText: '运行中',
    });
  });

  test('maps public plans with price, quota, validity and refund policy', () => {
    const plans = mapPlans([
      {
        activationMode: 'IMMEDIATE',
        currency: 'CNY',
        description: '开发测试使用',
        models: [{ displayName: 'DeepSeek' }],
        name: '开发测试套餐',
        priceMinor: 9900,
        purchaseNotice: '测试支付不代表真实付款',
        refundPolicy: '未使用可申请退款',
        unifiedQuota: 1000000,
        validityDays: 30,
      },
    ]);

    expect(plans[0]).toMatchObject({
      applicableModelText: 'DeepSeek',
      priceText: '¥99.00',
      purchaseNotice: '测试支付不代表真实付款',
      quotaText: '100 万通用字符',
      refundPolicy: '未使用可申请退款',
      validityText: '有效期 30 天',
    });
  });

  test('maps compliance profile and explicit incomplete states', () => {
    const complete = mapCompliance({
      accountCancellationMethod: '在线提交注销申请',
      businessDataRetentionDays: 30,
      complaintChannel: 'complaint@example.com',
      customerServiceContact: '400-000-0000',
      dataDeletionMethod: '联系客服删除',
      dataExportMethod: '控制台导出',
      logRetentionDays: 180,
      operatorName: '北京示例科技有限公司',
      productionEnabled: true,
      providers: [
        {
          name: 'DeepSeek',
          purpose: '模型推理',
          region: '中国大陆',
        },
      ],
      serverRegion: '中国大陆',
    });

    expect(complete.operatorName).toBe('北京示例科技有限公司');
    expect(complete.isProductionReady).toBe(true);
    expect(complete.providerRows[0]).toMatchObject({
      name: 'DeepSeek',
      purpose: '模型推理',
      region: '中国大陆',
    });

    const incomplete = mapCompliance(null);
    expect(incomplete.operatorName).toBe('经营主体待完善');
    expect(incomplete.isProductionReady).toBe(false);
    expect(incomplete.customerServiceContact).toBe('客服联系方式待完善');
  });

  test('maps content safety rules without exposing raw patterns', () => {
    const rules = mapContentRules([
      { action: 'BLOCK', category: 'FRAUD', name: '诈骗引流' },
      { action: 'REVIEW', category: 'ABUSE', name: '批量滥用' },
    ]);

    expect(rules).toEqual([
      {
        actionText: '阻断请求',
        categoryText: '诈骗内容',
        name: '诈骗引流',
      },
      {
        actionText: '人工复核或限制',
        categoryText: '批量滥用',
        name: '批量滥用',
      },
    ]);
  });

  test('documents gateway request shape with masked API key only', () => {
    const docs = createApiDocsView('https://api.example.com/base/');

    expect(docs.chatUrl).toBe(
      'https://api.example.com/base/v1/chat/completions',
    );
    expect(docs.authText).toContain('sk-gw_xxx');
    expect(docs.authText).not.toContain('sk-gw_secret');
    expect(docs.requestExample).toContain('"stream": false');
  });
});
