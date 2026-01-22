import { ApiRouter } from "./router";
import { tradersRoutes } from "./traders";
import { traderDetailRoutes } from "./trader-detail";
import { copyOrderRoutes } from "./copy-orders";
import { telegramWebhookRoutes } from "./telegram";
import { telegramBindRoutes } from "./telegram-bind";
import { telegramBindConfirmRoutes } from "./telegram-bind-confirm";
import { portfolioRoutes } from "./portfolio";
import { vaultRoutes } from "./vaults";
import { syncRunRoutes } from "./sync-runs";

export function buildApiRouter(): ApiRouter {
  const router = new ApiRouter();

  [
    ...tradersRoutes,
    ...traderDetailRoutes,
    ...copyOrderRoutes,
    ...telegramWebhookRoutes,
    ...telegramBindRoutes,
    ...telegramBindConfirmRoutes,
    ...portfolioRoutes,
    ...vaultRoutes,
    ...syncRunRoutes,
  ].forEach((route) => router.register(route));

  return router;
}
