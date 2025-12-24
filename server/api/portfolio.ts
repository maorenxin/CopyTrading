import type { RouteDefinition } from './router';

export const portfolioRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/portfolio',
    handler: async () => {
      return { wallet_address: '', total_value: 0, active_orders: 0, pnl: 0 };
    },
  },
];
