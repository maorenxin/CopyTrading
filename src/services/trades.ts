export async function fetchTraderTrades(traderId: string, limit = 50) {
  const response = await fetch(`/api/traders/${traderId}/trades?limit=${limit}`);
  if (!response.ok) {
    throw new Error('交易历史加载失败');
  }
  return response.json();
}
