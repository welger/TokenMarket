# Admin Web Design QA

- Source visual truth: `docs/superpowers/specs/assets/wechat-service-desk-home.png`
- Login screenshot: `apps/admin-web/qa/login-desktop.png`
- Models screenshot: `apps/admin-web/qa/models-desktop.png`
- Plans screenshot: `apps/admin-web/qa/plans-desktop.png`
- Orders screenshot: `apps/admin-web/qa/orders-desktop.png`
- Compliance screenshot: `apps/admin-web/qa/compliance-desktop.png`
- Narrow desktop screenshot: `apps/admin-web/qa/models-1024.png`
- Viewports: 1440 x 900, 1024 x 768, and login at 390 x 844
- Data: synthetic local QA records only

## Comparison Result

The implementation preserves the source visual's white surfaces, WeChat
green accent, thin borders, restrained shadows, and clear service status
language while adapting the mobile reference into a desktop operations
console with a dark navigation sidebar and denser tables.

The login page changes from a two-column desktop layout to a single-column
mobile layout without horizontal overflow. At 1024 x 768, the authenticated
shell and model table remain within the viewport.

## Interaction Checks

- Empty login submission shows both required-field messages.
- Synthetic local login redirects to `/models`.
- Models, providers, plans, orders, refunds, invoices, and compliance data
  render from their real `/admin/*` client paths.
- Model status, test payment, refund, invoice, and production enable actions
  show confirmation dialogs before sending a request.
- Editing a model uses a `保存修改` primary action.
- Complete compliance data enables the production switch; the unit test
  separately verifies that missing data disables it.
- A fresh browser session reports no console warnings or errors.

## Findings And Fixes

- [P2] Finance statuses used backend enum values.
  Fixed by mapping statuses to Chinese labels.
- [P2] Finance timestamps followed the browser's US locale.
  Fixed with a stable China Standard Time display.
- [P2] Finance tables did not enforce newest-first ordering.
  Fixed by sorting on `createdAt` descending.
- [P2] Edit dialogs used create-oriented primary button labels.
  Fixed with `保存修改` labels.
- [P2] Static Ant Design modal/message APIs emitted context warnings.
  Fixed by using the application context instances.
- [P2] Modal forms could be updated before mounting.
  Fixed by keeping forms mounted and resetting values before each open.

## Follow-up Polish

- The shared Ant Design production chunk remains larger than Vite's default
  500 kB warning threshold. This is a performance optimization opportunity,
  not a functional or visual blocker for phase one.

final result: passed
