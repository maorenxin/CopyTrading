import type { RouteDefinition } from "./router";

/**
 * 返回资产概览数据。
 * @returns 资产汇总与持仓列表（当前为空，等待真实数据接入）。
 */
async function getPortfolioOverview(): Promise<{ summary: null; positions: unknown[]; updatedAt: null }> {
  // 当前无对应数据库表，返回空结构以避免 mock 数据。
  return {
    summary: null,
    positions: [],
    updatedAt: null,
  };
}

/**
 * 资产概览相关路由定义。
 */
export const portfolioRoutes: RouteDefinition[] = [
  {
    method: "GET",
    path: "/portfolio",
    handler: async () => {
      return getPortfolioOverview();
    },
  },
];
