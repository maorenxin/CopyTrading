import type { RouteDefinition } from './router';

export const telegramBindConfirmRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/telegram/bind/confirm',
    handler: async () => {
      return { bind_id: '', status: 'verified' };
    },
  },
];
