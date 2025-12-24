export interface CopyOrderRequest {
  walletAddress: string;
  traderId: string;
  amountUsdc: number;
}

export async function createCopyOrder(payload: CopyOrderRequest) {
  const response = await fetch('/api/copy-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('跟单下单失败');
  }

  return response.json();
}

export async function cancelCopyOrder(orderId: string) {
  const response = await fetch(`/api/copy-orders/${orderId}/cancel`, { method: 'POST' });
  if (!response.ok) {
    throw new Error('撤单失败');
  }
  return response.json();
}
