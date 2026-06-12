export interface PayableOrder {
  id: string;
  amountMinor: number;
  currency: string;
}

export interface PaymentContext {
  isAdmin: boolean;
}

export interface PaymentResult {
  driver: 'test' | 'wechat';
  paymentReference: string;
  displayLabel: string;
}

export interface PaymentDriver {
  pay(
    order: PayableOrder,
    context: PaymentContext,
  ): Promise<PaymentResult>;
}
