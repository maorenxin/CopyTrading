import { log } from "./logger";
import * as Papa from "papaparse";
import { HyperliquidClient } from "./hyperliquid-client";
import { upsertVaults, VaultUpsertInput } from "./vault-repository";
import { toNumber } from "./hyperliquid-utils";

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
 * 兼容旧调用方式的抓取入口。
 * @returns 含原始数据的 vault 结果。
 */
export async function scrapeVaultsFromPage(): Promise<VaultData> {
  return scrapeVaults();
}

/**
 * 抓取 vault 列表、记录摘要日志并写入 VAULTS.csv。
 * @returns 输出完成的异步结果。
 */
export async function scrapeHLVaults(): Promise<void> {
  try {
    /**
     * 标准化描述字段，避免 CSV 中出现换行导致断行。
     * @param input - 原始描述内容。
     * @returns 替换为 \\n 的描述文本。
     */
    const normalizeDescription = (input: unknown): string => {
      if (input == null) return "";
      return String(input).replace(/\r\n|\r|\n/g, "\\n");
    };
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
      const vaultAddress =
        item?.vaultAddress ??
        item?.vault_address ??
        item?.address ??
        summaryData?.vaultAddress ??
        summaryData?.address;
      return {
        name: item?.name ?? summaryData?.name,
        vaultAddress,
        leader: item?.managerAddress ?? item?.manager ?? summaryData?.leader ?? summaryData?.manager,
        tvl: summaryData?.tvl ?? item?.tvl,
        isClosed: summaryData?.isClosed ?? item?.isClosed,
        relationshipType: relationship?.type, // 展平 relationship 字段
        createTimeMillis: summaryData?.createTimeMillis ?? item?.createTimeMillis,
        description:
          normalizeDescription(
            item?.description ??
              item?.desc ??
              summaryData?.description ??
              summaryData?.desc ??
              summaryData?.strategy,
          ),
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

    // 获取每个vault的详细信息，包括description
    const client = new HyperliquidClient();
    const detailedVaults: any[] = new Array(unique.length);

    for (let current = 0; current < unique.length; current += 1) {
      const vault = unique[current];

      // 实现带重试的请求（串行，避免限频）
      let success = false;
      let retries = 0;
      const maxRetries = 3;

      while (!success && retries <= maxRetries) {
        try {
          // 添加延迟以避免速率限制
          await new Promise((resolve) => setTimeout(resolve, 1000)); // 1000ms 延迟

          const details: any = await client.fetchVaultDetails(vault.vaultAddress, true);
          const description = details?.description; // 从详细信息中获取描述

          detailedVaults[current] = {
            ...vault,
            description: normalizeDescription(description || vault.description), // 优先使用详细信息中的描述
          };

          success = true; // 请求成功

          if ((current + 1) % 50 === 0 || current === unique.length - 1) {
            log("info", "vault detail fetch progress", { current: current + 1, total: unique.length });
          }
        } catch (error) {
          retries += 1;
          const message = (error as Error).message;

          if (retries <= maxRetries) {
            log("warn", "vault detail fetch attempt failed, retrying", {
              vaultAddress: vault.vaultAddress,
              attempt: retries,
              maxRetries,
              message,
            });

            // 指数退避延迟
            const delay = 2000 * Math.pow(2, retries); // 4s, 8s, 16s...
            await new Promise((resolve) => setTimeout(resolve, delay));
          } else {
            // 如果所有重试都失败，使用原始数据
            detailedVaults[current] = vault;
            log("warn", "vault detail fetch failed after retries", {
              vaultAddress: vault.vaultAddress,
              message,
            });
          }
        }
      }
    }

    // 读取历史 CSV，做增量覆盖合并
    const fs = await import("fs/promises");
    const csvOutputPath = "VAULTS.csv"; // 保存到项目根目录
    let existingRows: Array<Record<string, any>> = [];
    try {
      const existingText = await fs.readFile(csvOutputPath, "utf-8");
      const parsed = Papa.parse<Record<string, any>>(existingText, { header: true });
      existingRows = Array.isArray(parsed.data) ? (parsed.data as Array<Record<string, any>>) : [];
    } catch {
      existingRows = [];
    }

    const normalizeRow = (row: Record<string, any>) => {
      const vaultAddress =
        row?.vaultAddress ?? row?.vault_address ?? row?.address ?? row?.vault ?? row?.vaultAddr;
      if (!vaultAddress) return null;
      const rawIsClosed = row?.isClosed ?? row?.is_closed ?? false;
      const isClosed =
        typeof rawIsClosed === "string"
          ? rawIsClosed.trim().toLowerCase() === "true"
          : Boolean(rawIsClosed);
      return {
        name: row?.name ?? "",
        vaultAddress: String(vaultAddress).toLowerCase(),
        leader: row?.leader ?? row?.manager ?? row?.leader_address ?? "",
        tvl: row?.tvl ?? row?.tvl_usdc ?? "",
        isClosed,
        relationshipType: row?.relationshipType ?? row?.relationship_type ?? "",
        createTimeMillis: row?.createTimeMillis ?? row?.create_time_millis ?? "",
        description: normalizeDescription(row?.description ?? ""),
        apr: row?.apr ?? "",
      };
    };

    const mergedMap = new Map<string, ReturnType<typeof normalizeRow>>();
    existingRows.forEach((row) => {
      const normalized = normalizeRow(row);
      if (normalized) mergedMap.set(normalized.vaultAddress, normalized);
    });
    detailedVaults.forEach((row) => {
      const normalized = normalizeRow(row);
      if (normalized) mergedMap.set(normalized.vaultAddress, normalized);
    });
    const mergedRows = Array.from(mergedMap.values()).filter(
      (row): row is NonNullable<ReturnType<typeof normalizeRow>> => Boolean(row),
    );

    // 按 TVL 从大到小排序
    const sortedByTvl = [...mergedRows].sort((a, b) => {
      const tvlA = parseFloat(a.tvl as string) || 0;
      const tvlB = parseFloat(b.tvl as string) || 0;
      return tvlB - tvlA; // 降序（最大在前）
    });

    // 写入项目根目录 CSV 文件
    const csv = Papa.unparse(sortedByTvl);
    await fs.writeFile(csvOutputPath, csv, "utf-8");
    log("info", "vault scraper CSV output written", { path: csvOutputPath, count: sortedByTvl.length });

    const dbInputs: VaultUpsertInput[] = sortedByTvl
      .filter((item) => item.vaultAddress)
      .map((item) => {
        const isClosed = Boolean(item.isClosed);
        const status = isClosed ? "closed" : "active";
        return {
          vaultAddress: String(item.vaultAddress).toLowerCase(),
          name: item.name ?? "",
          leaderAddress: item.leader ?? "",
          managerAddress: item.leader ?? "",
          creatorAddress: item.leader ?? "",
          status,
          isClosed,
          relationshipType: item.relationshipType ?? "",
          createTimeMillis: toNumber(item.createTimeMillis),
          description: item.description ?? "",
          tvlUsdc: toNumber(item.tvl),
          apr: toNumber(item.apr),
        };
      });
    if (dbInputs.length > 0) {
      await upsertVaults(dbInputs);
      log("info", "vault scraper DB upsert complete", { count: dbInputs.length });
    }

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
