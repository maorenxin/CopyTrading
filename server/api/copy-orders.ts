import type { RouteDefinition } from './router';
import { getSupabaseClient } from '../services/supabase';

export const copyOrderRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/copy-orders',
    handler: async (request) => {
      const body = (request as any)?.body ?? {};
      const walletAddress = body.wallet_address;
      const traderId = body.trader_id;
      const amountUsdc = Number(body.amount_usdc ?? 0);

      if (!walletAddress || !traderId || !Number.isFinite(amountUsdc) || amountUsdc <= 0) {
        return { error: '参数不完整' };
      }

      const supabase = getSupabaseClient();
      const { data: walletRow } = await supabase
        .from('user_wallets')
        .select('*')
        .eq('wallet_address', walletAddress)
        .single();

      const walletId = walletRow?.id ?? crypto.randomUUID();

      if (!walletRow) {
        await supabase.from('user_wallets').insert({
          id: walletId,
          wallet_address: walletAddress,
          language: body.language ?? 'cn',
        });
      }

      const feeUsdc = Math.round(amountUsdc * 0.001 * 100) / 100;
      const orderId = crypto.randomUUID();

      await supabase.from('copy_orders').insert({
        id: orderId,
        user_wallet_id: walletId,
        trader_id: traderId,
        amount_usdc: amountUsdc,
        fee_usdc: feeUsdc,
        status: 'pending',
      });

      return { id: orderId, status: 'pending', fee_usdc: feeUsdc };
    },
  },
  {
    method: 'POST',
    path: '/copy-orders/:orderId/cancel',
    handler: async (request) => {
      const params = (request as any)?.params ?? {};
      const orderId = params.orderId;
      const supabase = getSupabaseClient();

      await supabase.from('copy_orders').update({ status: 'cancelled' }).eq('id', orderId);

      return { id: orderId, status: 'cancelled' };
    },
  },
];
