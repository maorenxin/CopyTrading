import type { RouteDefinition } from './router';
import { query, withTransaction } from '../db/postgres';

/**
 * 解析下单参数。
 * @param body - 请求体。
 * @returns 解析后的字段。
 */
function parseCopyOrder(body: Record<string, any>) {
  return {
    walletAddress: body.wallet_address ?? body.walletAddress,
    traderId: body.trader_id ?? body.traderId,
    amountUsdc: Number(body.amount_usdc ?? body.amountUsdc ?? 0),
    language: body.language ?? 'cn',
  };
}

/**
 * 获取或创建用户钱包。
 * @param walletAddress - 钱包地址。
 * @param language - 语言偏好。
 * @returns 钱包 ID。
 */
async function ensureWallet(walletAddress: string, language: string) {
  const { rows } = await query<{ id: string }>(
    'select id from user_wallets where wallet_address = $1',
    [walletAddress],
  );
  if (rows[0]?.id) return rows[0].id;

  const walletId = crypto.randomUUID();
  await query(
    `insert into user_wallets (id, wallet_address, language, created_at, updated_at)
     values ($1, $2, $3, now(), now())`,
    [walletId, walletAddress, language],
  );
  return walletId;
}

/**
 * 处理创建跟单指令。
 * @param request - 路由请求对象。
 * @returns 下单响应。
 */
async function handleCreateCopyOrder(request: unknown) {
  const body = (request as any)?.body ?? {};
  const { walletAddress, traderId, amountUsdc, language } = parseCopyOrder(body);

  if (!walletAddress || !traderId || !Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    return { error: '参数不完整' };
  }

  // 事务写入订单与钱包
  const result = await withTransaction(async () => {
    const walletId = await ensureWallet(walletAddress, language);
    const feeUsdc = Math.round(amountUsdc * 0.001 * 100) / 100;
    const orderId = crypto.randomUUID();

    await query(
      `insert into copy_orders (id, user_wallet_id, trader_id, amount_usdc, fee_usdc, status, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, now(), now())`,
      [orderId, walletId, traderId, amountUsdc, feeUsdc, 'pending'],
    );

    return { id: orderId, status: 'pending', fee_usdc: feeUsdc };
  });

  return result;
}

/**
 * 处理取消跟单指令。
 * @param request - 路由请求对象。
 * @returns 取消结果。
 */
async function handleCancelCopyOrder(request: unknown) {
  const params = (request as any)?.params ?? {};
  const orderId = params.orderId;

  if (!orderId) {
    return { error: '缺少订单 ID' };
  }

  await query('update copy_orders set status = $1, updated_at = now() where id = $2', [
    'cancelled',
    orderId,
  ]);

  return { id: orderId, status: 'cancelled' };
}

export const copyOrderRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/copy-orders',
    handler: handleCreateCopyOrder,
  },
  {
    method: 'POST',
    path: '/copy-orders/:orderId/cancel',
    handler: handleCancelCopyOrder,
  },
];
