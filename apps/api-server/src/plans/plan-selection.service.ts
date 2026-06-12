export interface SelectableUserPlan {
  id: string;
  status: string;
  expiresAt: Date | null;
  activatedAt: Date | null;
  createdAt: Date;
  applicableModelIds: string[];
  remainingInputQuota: bigint | null;
  remainingOutputQuota: bigint | null;
  remainingUnifiedQuota: bigint | null;
}

export function selectPlan<T extends SelectableUserPlan>(
  plans: T[],
  modelId: string,
  now = new Date(),
): T | undefined {
  return plans
    .filter(
      (plan) =>
        plan.status === 'ACTIVE' &&
        plan.applicableModelIds.includes(modelId) &&
        (plan.expiresAt === null ||
          plan.expiresAt.getTime() > now.getTime()) &&
        hasRemainingQuota(plan),
    )
    .sort((left, right) => {
      const expiryDifference =
        (left.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (right.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER);
      if (expiryDifference !== 0) {
        return expiryDifference;
      }

      const activationDifference =
        (left.activatedAt?.getTime() ?? left.createdAt.getTime()) -
        (right.activatedAt?.getTime() ?? right.createdAt.getTime());
      if (activationDifference !== 0) {
        return activationDifference;
      }
      return left.createdAt.getTime() - right.createdAt.getTime();
    })[0];
}

function hasRemainingQuota(plan: SelectableUserPlan): boolean {
  if (plan.remainingUnifiedQuota !== null) {
    return plan.remainingUnifiedQuota > 0n;
  }

  return (
    (plan.remainingInputQuota ?? 0n) > 0n ||
    (plan.remainingOutputQuota ?? 0n) > 0n
  );
}
