import type { RouteDefinition } from './router';

export const telegramWebhookRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/telegram/webhook',
    handler: async () => {
      return { ok: true };
    },
  },
];
