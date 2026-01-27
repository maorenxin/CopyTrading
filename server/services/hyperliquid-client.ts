import { fetch, ProxyAgent } from "undici";
import { log } from "./logger";

// === 常量 ===
const DEFAULT_BASE_URL = "https://api-ui.hyperliquid.xyz";
const STATS_DATA_BASE_URL = "https://stats-data.hyperliquid.xyz";
const DEFAULT_STATS_CHAIN = "Mainnet";

// === 代理工具 ===
/**
 * 从环境变量创建代理实例。
 * @returns 代理实例，失败则返回 undefined。
 */
function resolveProxyAgent(): any | undefined {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (!proxyUrl) return undefined;
  try {
    return new ProxyAgent(proxyUrl);
  } catch (error) {
    log("warn", "proxy agent unavailable", { message: (error as Error).message });
    return undefined;
  }
}

/**
 * 规范化 stats 链名称。
 * @param input - 原始链名称。
 * @returns 规范化后的链名称。
 */
function normalizeStatsChain(input?: string) {
  if (!input) return DEFAULT_STATS_CHAIN;
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_STATS_CHAIN;
  const lower = trimmed.toLowerCase();
  if (lower === "mainnet") return "Mainnet";
  if (lower === "testnet") return "Testnet";
  return trimmed;
}

function normalizeAddress(input: string) {
  return String(input).toLowerCase();
}

// === 客户端 ===
export class HyperliquidClient {
  private baseUrl: string;
  private dispatcher?: any;

  /**
   * 创建 Hyperliquid 客户端。
   * @param baseUrl - 可选的 base URL 覆盖值。
   * @returns 客户端实例。
   */
  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.HYPERLIQUID_API_URL ?? DEFAULT_BASE_URL;
    this.dispatcher = resolveProxyAgent();
  }

  /**
   * 调用 /info 接口。
   * @param type - info 请求类型。
   * @param payload - 请求参数。
   * @returns 解析后的 JSON 响应。
   */
  async postInfo(type: string, payload: Record<string, unknown> = {}) {
    const response = await fetch(`${this.baseUrl}/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, ...payload }),
      dispatcher: this.dispatcher,
    } as any);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`hyperliquid info error: ${response.status} ${text}`);
    }

    return response.json();
  }

  /**
   * 获取 vault 汇总信息。
   * @param throwOnError - 是否在失败时抛错。
   * @returns vault 汇总信息，失败则返回 null。
   */
  async fetchVaults(throwOnError = false) {
    try {
      return await this.postInfo("vaultSummaries");
    } catch (error) {
      log("warn", "fetchVaultSummaries failed", { message: (error as Error).message });
      if (throwOnError) {
        throw error;
      }
      return null;
    }
  }

  /**
   * 从 stats-data 获取 vault 列表。
   * @param chain - 可选链名称覆盖。
   * @returns vault 列表与原始数据。
   */
  async fetchVaultsFromStats(chain?: string) {
    const resolvedChain = normalizeStatsChain(chain ?? process.env.HYPERLIQUID_STATS_CHAIN);
    const url = `${STATS_DATA_BASE_URL}/${resolvedChain}/vaults`;
    const response = await fetch(url, {
      dispatcher: this.dispatcher,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://app.hyperliquid.xyz/",
      },
    } as any);
    if (!response.ok) {
      throw new Error(`stats vaults request failed: ${response.status}`);
    }
    const data: any = await response.json();
    const vaults = Array.isArray(data) ? data : Array.isArray(data?.vaults) ? data.vaults : [];
    return { vaults, raw: data };
  }

  /**
   * 获取 vault 详情。
   * @param vaultAddress - vault 地址。
   * @param throwOnError - 是否在失败时抛错。
   * @returns vault 详情，失败则返回 null。
   */
  async fetchVaultDetails(vaultAddress: string, throwOnError = false) {
    const address = normalizeAddress(vaultAddress);
    try {
      return await this.postInfo("vaultDetails", { vaultAddress: address });
    } catch (error) {
      log("warn", "fetchVaultDetails failed", { message: (error as Error).message, vaultAddress });
      if (throwOnError) {
        throw error;
      }
      return null;
    }
  }

  /**
   * 获取 vault 交易记录。
   * @param vaultAddress - vault 地址。
   * @param throwOnError - 是否在失败时抛错。
   * @returns 交易记录，失败则返回 null。
   */
  async fetchVaultTrades(vaultAddress: string, throwOnError = false) {
    const address = normalizeAddress(vaultAddress);
    try {
      return await this.postInfo("vaultTrades", { vaultAddress: address });
    } catch (error) {
      log("warn", "fetchVaultTrades failed", { message: (error as Error).message, vaultAddress });
      if (throwOnError) {
        throw error;
      }
      return null;
    }
  }

  /**
   * 获取 vault 持仓信息。
   * @param vaultAddress - vault 地址。
   * @param throwOnError - 是否在失败时抛错。
   * @returns 持仓信息，失败则返回 null。
   */
  async fetchVaultPositions(vaultAddress: string, throwOnError = false) {
    const address = normalizeAddress(vaultAddress);
    try {
      return await this.postInfo("vaultPositions", { vaultAddress: address });
    } catch (error) {
      log("warn", "fetchVaultPositions failed", { message: (error as Error).message, vaultAddress });
      if (throwOnError) {
        throw error;
      }
      return null;
    }
  }

  /**
   * 获取 vault 出资人列表。
   * @param vaultAddress - vault 地址。
   * @param throwOnError - 是否在失败时抛错。
   * @returns 出资人列表，失败则返回 null。
   */
  async fetchVaultDepositors(vaultAddress: string, throwOnError = false) {
    const address = normalizeAddress(vaultAddress);
    try {
      return await this.postInfo("vaultDepositors", { vaultAddress: address });
    } catch (error) {
      log("warn", "fetchVaultDepositors failed", { message: (error as Error).message, vaultAddress });
      if (throwOnError) {
        throw error;
      }
      return null;
    }
  }

  /**
   * 获取用户在时间范围内的成交记录。
   * @param user - 用户地址。
   * @param startTime - 起始时间戳。
   * @param endTime - 可选的结束时间戳。
   * @param aggregateByTime - 是否按时间聚合。
   * @param throwOnError - 是否在失败时抛错。
   * @returns 成交记录，失败则返回 null。
   */
  async fetchUserFillsByTime(
    user: string,
    startTime: number,
    endTime?: number,
    aggregateByTime = false,
    throwOnError = false,
  ) {
    const address = normalizeAddress(user);
    try {
      return await this.postInfo("userFillsByTime", {
        user: address,
        startTime,
        endTime,
        aggregateByTime,
      });
    } catch (error) {
      log("warn", "fetchUserFillsByTime failed", { message: (error as Error).message, user });
      if (throwOnError) {
        throw error;
      }
      return null;
    }
  }

  /**
   * 获取非 funding 账本更新。
   * @param user - 用户地址。
   * @param startTime - 起始时间戳。
   * @param endTime - 可选的结束时间戳。
   * @param throwOnError - 是否在失败时抛错。
   * @returns 账本更新，失败则返回 null。
   */
  async fetchUserNonFundingLedgerUpdates(
    user: string,
    startTime: number,
    endTime?: number,
    throwOnError = false,
  ) {
    const address = normalizeAddress(user);
    try {
      return await this.postInfo("userNonFundingLedgerUpdates", {
        user: address,
        startTime,
        endTime,
      });
    } catch (error) {
      log("warn", "fetchUserNonFundingLedgerUpdates failed", {
        message: (error as Error).message,
        user,
      });
      if (throwOnError) {
        throw error;
      }
      return null;
    }
  }

  /**
   * 获取 funding 更新。
   * @param user - 用户地址。
   * @param startTime - 起始时间戳。
   * @param endTime - 可选的结束时间戳。
   * @param throwOnError - 是否在失败时抛错。
   * @returns funding 更新，失败则返回 null。
   */
  async fetchUserFunding(
    user: string,
    startTime: number,
    endTime?: number,
    throwOnError = false,
  ) {
    const address = normalizeAddress(user);
    try {
      return await this.postInfo("userFunding", {
        user: address,
        startTime,
        endTime,
      });
    } catch (error) {
      log("warn", "fetchUserFunding failed", { message: (error as Error).message, user });
      if (throwOnError) {
        throw error;
      }
      return null;
    }
  }
}

// === 命令行入口 ===
// 如果直接运行此文件，执行主函数
if (require.main === module) {
  // scrapeHLVaults().catch(() => {
  //   process.exitCode = 1;
  // });
}
