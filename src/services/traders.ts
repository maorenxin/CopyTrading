import type { SortOption, Trader, ViewMode } from '../types/trader';

export interface TraderListParams {
  view: ViewMode;
  sort: SortOption;
  order?: 'asc' | 'desc';
  lang: 'en' | 'cn';
}

/**
 * 拉取交易员列表。
 * @param params - 查询参数。
 * @returns 交易员列表（无数据时返回空数组）。
 */
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
    if (Array.isArray(data.items)) {
      return data.items;
    }
    return [];
  } catch {
    return [];
  }
}
