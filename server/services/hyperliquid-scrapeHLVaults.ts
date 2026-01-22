import { log } from "./logger";
import * as Papa from 'papaparse';
import { HyperliquidClient } from "./hyperliquid-client";

// === 类型 ===
interface VaultData {
  vaults: any[];
  raw: any;
}

// === 抓取逻辑 ===
/**
 * 从 stats 接口获取 vault 列表数据。
 * @returns 含原始数据的 vault 结果。
 */
export async function scrapeVaults(): Promise<VaultData> {
  const client = new HyperliquidClient();
  return client.fetchVaultsFromStats();
}

/**
 * 抓取 vault 列表、记录摘要日志并写入 VAULTS.csv。
 * @returns 输出完成的异步结果。
 */
export async function scrapeHLVaults(): Promise<void> {
  try {
    // 抓取 vault 列表
    const result = await scrapeVaults();
    const vaults = Array.isArray(result.vaults) ? result.vaults : [];
    const pageSize = Number(process.env.VAULT_SCRAPER_PAGE_SIZE ?? 50);
    const maxPages = Number(process.env.VAULT_SCRAPER_MAX_PAGES ?? 0);
    const outputPath = process.env.VAULT_SCRAPER_OUTPUT || "vaults.json"; // 默认输出 vaults.json

    // 将 vault 转换为摘要结构
    const summary = vaults.map((item: any) => {
      // 优先从 summary 读取字段
      const summaryData = item?.summary;
      const relationship = summaryData?.relationship ?? item?.relationship;
      return {
        name: item?.name ?? summaryData?.name,
        vaultAddress: item?.vaultAddress ?? item?.vault_address ?? item?.address ?? summaryData?.vaultAddress ?? summaryData?.address,
        leader: item?.managerAddress ?? item?.manager ?? summaryData?.leader ?? summaryData?.manager,
        tvl: summaryData?.tvl ?? item?.tvl,
        isClosed: summaryData?.isClosed ?? item?.isClosed,
        relationshipType: relationship?.type, // 展平 relationship 字段
        createTimeMillis: summaryData?.createTimeMillis ?? item?.createTimeMillis,
        description:
          item?.description ??
          item?.desc ??
          summaryData?.description ??
          summaryData?.desc ??
          summaryData?.strategy,
        apr: item?.apr,
        // 注意：pnls 字段刻意忽略
      };
    });
    const cleaned = summary.filter((item) => item.vaultAddress);
    const uniqueMap = new Map<string, (typeof cleaned)[number]>();
    cleaned.forEach((item) => {
      if (!uniqueMap.has(item.vaultAddress)) {
        uniqueMap.set(item.vaultAddress, item);
      }
    });
    const unique = Array.from(uniqueMap.values());
    const totalPages = pageSize > 0 ? Math.ceil(unique.length / pageSize) : 1;
    const limitPages = maxPages > 0 ? Math.min(totalPages, maxPages) : totalPages;

    for (let page = 1; page <= limitPages; page += 1) {
      const start = (page - 1) * pageSize;
      const end = pageSize > 0 ? start + pageSize : unique.length;
      const items = unique.slice(start, end);
      log("info", "vault scraper page", { page, totalPages, count: items.length });
      items.forEach((item) => {
        log("info", "vault", item);
      });
    }

    // 按 TVL 从大到小排序
    const sortedByTvl = [...unique].sort((a, b) => {
      const tvlA = parseFloat(a.tvl) || 0;
      const tvlB = parseFloat(b.tvl) || 0;
      return tvlB - tvlA; // 降序（最大在前）
    });

    // 写入项目根目录 CSV 文件
    const fs = await import("fs/promises");
    const csvOutputPath = "VAULTS.csv"; // 保存到项目根目录
    const csv = Papa.unparse(sortedByTvl);
    await fs.writeFile(csvOutputPath, csv, "utf-8");
    log("info", "vault scraper CSV output written", { path: csvOutputPath, count: sortedByTvl.length });

    log("info", "vault scraper run complete", { count: sortedByTvl.length });
  } catch (error) {
    log("error", "vault scraper failed", { message: (error as Error).message });
    throw error;
  }
}

// === CLI entrypoint ===
// 如果直接运行此文件，执行主函数
if (require.main === module) {
  scrapeHLVaults().catch(() => {
    process.exitCode = 1;
  });
}
