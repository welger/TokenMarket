import { Alert } from "antd";

import type { PlatformError } from "../api/client";

export function PlatformErrorAlert({
  error,
}: {
  error: PlatformError | null;
}) {
  if (!error) {
    return null;
  }
  return (
    <Alert
      type="error"
      showIcon
      title={error.message}
      description={
        error.requestId
          ? `错误码：${error.code} · 请求 ID：${error.requestId}`
          : `错误码：${error.code}`
      }
    />
  );
}
