import type { RouteDefinition } from './router';

export const telegramBindRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/telegram/bind',
    handler: async () => {
      return { bind_id: '', bind_url: '', status: 'pending' };
    },
  },
];
