# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Confirmed Design Context

- Visual source: `docs/superpowers/specs/assets/wechat-service-desk-home.png`.
- Adapt the source's white surfaces, WeChat green accent, light borders, low shadow, and trustworthy tone to a denser desktop operations console.
- Use Ant Design and Ant Design Icons. Do not draw custom icons or use promotional visual patterns.
- All pages must call real `/admin/*` endpoints. Do not show invented successful business data.
- Production switching, provider/model changes, plan changes, refunds, and invoice decisions require explicit confirmation.
