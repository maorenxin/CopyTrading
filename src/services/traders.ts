import type { SortOption, Trader, ViewMode } from '../types/trader';
import { mockTraders } from '../utils/mockData';

export interface TraderListParams {
  view: ViewMode;
  sort: SortOption;
  order?: 'asc' | 'desc';
  lang: 'en' | 'cn';
}

export async function fetchTraders(params: TraderListParams): Promise<Trader[]> {
  const query = new URLSearchParams({
    view: params.view,
    sort: params.sort,
    order: params.order ?? 'desc',
    lang: params.lang,
  });

  try {
    const response = await fetch(`/api/traders?${query.toString()}`);
    if (!response.ok) {
      throw new Error('交易员数据加载失败');
    }

    const data = await response.json();
    if (Array.isArray(data.items) && data.items.length > 0) {
      return data.items;
    }
    return mockTraders;
  } catch {
    return mockTraders;
  }
}
