import { fetch } from "undici";
import { query } from "../db/postgres";
import { log } from "./logger";

const AI_TAG_POOL = {
  en: [
    "Trend Following",
    "Low Drawdown",
    "High Sharpe",
    "Risk Managed",
    "Swing Trading",
    "Mean Reversion",
    "Multi-Asset",
    "Low Volatility",
    "Momentum Bias",
    "Stable Returns",
    "High Win Rate",
    "Long Horizon",
  ],
  cn: [
    "趋势跟随",
    "低回撤",
    "高夏普",
    "风控稳健",
    "波段交易",
    "均值回归",
    "多币种",
    "低波动",
    "动量偏好",
    "稳健收益",
    "高胜率",
    "长周期",
  ],
};

interface VaultBaseInfo {
  vaultAddress: string;
  description?: string | null;
  annualizedReturn?: number;
  sharpe?: number;
  mdd?: number;
  winRate?: number;
  avgHoldDays?: number;
  avgTradesPerDay?: number;
  timeInMarket?: number;
  traderAgeHours?: number;
}

interface TradeSummary {
  totalTrades: number;
  uniqueCoins: number;
  topCoins: string[];
  winRate?: number;
  firstTradeAt?: string;
  lastTradeAt?: string;
}

/**
 * 解析数值字段。
 * @param value - 原始值。
 * @returns 数值或 undefined。
 */
function toNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * 拉取 vault 基础指标信息。
 * @param vaultAddresses - vault 地址列表。
 * @returns vault 基础信息列表。
 */
async function loadVaultBaseInfo(vaultAddresses: string[]): Promise<VaultBaseInfo[]> {
  const { rows } = await query(
    `select vault_address, description, annualized_return, sharpe, mdd, win_rate,
            avg_hold_days, avg_trades_per_day, time_in_market, trader_age_hours
     from vault_info
     where lower(vault_address) = any($1)`,
    [vaultAddresses.map((addr) => addr.toLowerCase())],
  );
  return rows.map((row: Record<string, any>) => ({
    vaultAddress: String(row.vault_address).toLowerCase(),
    description: row.description ?? null,
    annualizedReturn: toNumber(row.annualized_return),
    sharpe: toNumber(row.sharpe),
    mdd: toNumber(row.mdd),
    winRate: toNumber(row.win_rate),
    avgHoldDays: toNumber(row.avg_hold_days),
    avgTradesPerDay: toNumber(row.avg_trades_per_day),
    timeInMarket: toNumber(row.time_in_market),
    traderAgeHours: toNumber(row.trader_age_hours),
  }));
}

/**
 * 汇总 vault 的成交信息。
 * @param vaultAddress - vault 地址。
 * @returns 成交摘要。
 */
async function buildTradeSummary(vaultAddress: string): Promise<TradeSummary> {
  const { rows } = await query(
    `select
        coin,
        count(*)::int as trade_count,
        sum(case when pnl > 0 then 1 else 0 end)::int as win_count,
        sum(case when pnl is not null then 1 else 0 end)::int as pnl_count,
        min(coalesce(utc_time, timestamp)) as first_time,
        max(coalesce(utc_time, timestamp)) as last_time
     from vault_trades
     where lower(vault_address) = $1
     group by coin
     order by trade_count desc nulls last`,
    [vaultAddress.toLowerCase()],
  );

  let totalTrades = 0;
  let totalWins = 0;
  let totalWithPnl = 0;
  let firstTradeAt: string | undefined;
  let lastTradeAt: string | undefined;

  const topCoins: string[] = [];
  rows.forEach((row: Record<string, any>, index: number) => {
    const count = Number(row.trade_count ?? 0);
    totalTrades += Number.isFinite(count) ? count : 0;
    totalWins += Number(row.win_count ?? 0);
    totalWithPnl += Number(row.pnl_count ?? 0);
    if (index < 3 && row.coin) {
      topCoins.push(String(row.coin));
    }
    const first = row.first_time ? new Date(row.first_time).toISOString() : undefined;
    const last = row.last_time ? new Date(row.last_time).toISOString() : undefined;
    if (first && (!firstTradeAt || first < firstTradeAt)) firstTradeAt = first;
    if (last && (!lastTradeAt || last > lastTradeAt)) lastTradeAt = last;
  });

  const winRate = totalWithPnl > 0 ? totalWins / totalWithPnl : undefined;

  return {
    totalTrades,
    uniqueCoins: rows.length,
    topCoins,
    winRate,
    firstTradeAt,
    lastTradeAt,
  };
}

/**
 * 基于指标与描述生成标签（本地规则）。
 * @param info - vault 基础信息。
 * @param summary - 交易摘要。
 * @returns 中英文标签数组。
 */
function buildHeuristicTags(info: VaultBaseInfo, summary: TradeSummary) {
  const picks = new Set<number>();
  const desc = String(info.description ?? "").toLowerCase();

  if (summary.uniqueCoins >= 3) picks.add(6);
  if (info.mdd !== undefined && Math.abs(info.mdd) <= 0.05) picks.add(1);
  if (info.sharpe !== undefined && info.sharpe >= 2) picks.add(2);
  if (summary.winRate !== undefined && summary.winRate >= 0.6) picks.add(10);
  if (info.avgHoldDays !== undefined) {
    if (info.avgHoldDays >= 7) picks.add(11);
    else if (info.avgHoldDays >= 1) picks.add(4);
  }
  if (info.annualizedReturn !== undefined && info.annualizedReturn >= 30) picks.add(9);
  if (desc.includes("trend")) picks.add(0);
  if (desc.includes("momentum")) picks.add(8);
  if (desc.includes("mean") || desc.includes("reversion")) picks.add(5);
  if (picks.size < 3) picks.add(3);

  const indices = Array.from(picks).slice(0, 5);
  return {
    en: indices.map((index) => AI_TAG_POOL.en[index]),
    cn: indices.map((index) => AI_TAG_POOL.cn[index]),
  };
}

/**
 * 生成模型提示词。
 * @param info - vault 基础信息。
 * @param summary - 成交摘要。
 * @returns 提示词文本。
 */
function buildPrompt(info: VaultBaseInfo, summary: TradeSummary): string {
  const allowed = AI_TAG_POOL.en.map((tag, index) => `${tag} / ${AI_TAG_POOL.cn[index]}`).join(", ");
  return [
    "You are a quantitative strategist. Pick 3-5 tags from the allowed list.",
    "Return JSON only in the format: {\"en\": [..], \"cn\": [..]}",
    `Allowed tags: ${allowed}`,
    `Vault description: ${info.description ?? ""}`,
    `Trade summary: totalTrades=${summary.totalTrades}, uniqueCoins=${summary.uniqueCoins}, topCoins=${summary.topCoins.join(
      "|",
    )}, winRate=${summary.winRate ?? "n/a"}, firstTradeAt=${summary.firstTradeAt ?? "n/a"}, lastTradeAt=${
      summary.lastTradeAt ?? "n/a"
    }`,
    `Stats: annualizedReturn=${info.annualizedReturn ?? "n/a"}, sharpe=${info.sharpe ?? "n/a"}, mdd=${
      info.mdd ?? "n/a"
    }, avgHoldDays=${info.avgHoldDays ?? "n/a"}, avgTradesPerDay=${info.avgTradesPerDay ?? "n/a"}, timeInMarket=${
      info.timeInMarket ?? "n/a"
    }`,
  ].join("\n");
}

/**
 * 请求大模型生成标签。
 * @param info - vault 基础信息。
 * @param summary - 成交摘要。
 * @returns 中英文标签，失败时返回 null。
 */
async function requestModelTags(
  info: VaultBaseInfo,
  summary: TradeSummary,
): Promise<{ en: string[]; cn: string[] } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const prompt = buildPrompt(info, summary);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
    });
    if (!response.ok) {
      log("warn", "ai tag model response failed", { status: response.status });
      return null;
    }
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content);
    if (!parsed || !Array.isArray(parsed.en) || !Array.isArray(parsed.cn)) return null;
    return {
      en: parsed.en.filter((item: unknown) => typeof item === "string"),
      cn: parsed.cn.filter((item: unknown) => typeof item === "string"),
    };
  } catch (error) {
    log("warn", "ai tag model request error", { message: (error as Error).message });
    return null;
  }
}

/**
 * 生成并写入 AI 标签。
 * @param options - 运行参数。
 * @returns 写入条数。
 */
export async function runAiInvestmentTagging(options?: {
  vaultAddresses?: string[];
  limit?: number;
  overwrite?: boolean;
}): Promise<number> {
  const overwrite = options?.overwrite ?? String(process.env.AI_TAG_OVERWRITE ?? "1") !== "0";
  const limit = options?.limit ?? Number(process.env.AI_TAG_LIMIT ?? 0);
  const addressFilter = options?.vaultAddresses?.map((addr) => addr.toLowerCase()) ?? [];

  let addressQuery = "select vault_address, ai_tags from vault_info";
  const params: string[] = [];
  if (addressFilter.length > 0) {
    params.push(addressFilter);
    addressQuery += ` where lower(vault_address) = any($${params.length})`;
  }
  if (!overwrite) {
    addressQuery += addressFilter.length > 0 ? " and ai_tags is null" : " where ai_tags is null";
  }
  if (limit > 0) {
    addressQuery += ` limit ${limit}`;
  }

  const { rows } = await query(addressQuery, params);
  const addresses = rows.map((row: Record<string, any>) => String(row.vault_address).toLowerCase());
  if (addresses.length === 0) return 0;

  const baseInfoList = await loadVaultBaseInfo(addresses);
  const baseInfoMap = new Map(baseInfoList.map((info) => [info.vaultAddress, info]));
  const { rows: tradeVaultRows } = await query<{ vault_address: string }>(
    "select distinct vault_address from vault_trades",
  );
  const tradeVaultSet = new Set(
    tradeVaultRows.map((row) => String(row.vault_address).toLowerCase()),
  );

  let updated = 0;
  for (const vaultAddress of addresses) {
    const info = baseInfoMap.get(vaultAddress);
    if (!info) continue;
    const summary = tradeVaultSet.has(vaultAddress)
      ? await buildTradeSummary(vaultAddress)
      : {
          totalTrades: 0,
          uniqueCoins: 0,
          topCoins: [],
        };
    const modelTags = await requestModelTags(info, summary);
    const tags = modelTags ?? buildHeuristicTags(info, summary);

    await query(
      "update vault_info set ai_tags = $1, updated_at = $2 where vault_address = $3",
      [JSON.stringify(tags), new Date().toISOString(), vaultAddress],
    );
    updated += 1;
  }

  return updated;
}

if (require.main === module) {
  runAiInvestmentTagging()
    .then((count) => {
      console.log(`[ai-tags] updated ${count} vaults`);
    })
    .catch((error) => {
      console.error(`[ai-tags] failed: ${(error as Error).message}`);
      process.exitCode = 1;
    });
}
