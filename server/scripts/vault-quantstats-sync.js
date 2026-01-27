"use strict";

require("ts-node/register/transpile-only");

const { loadVaultQuantstatsToDb } = require("../services/vault-quantstat-loader");

/**
 * 解析命令行与环境变量中的 vault 地址列表。
 * @returns {string[]} vault 地址数组。
 */
function parseTargets() {
  const targetsEnv = process.env.VAULT_QUANTSTAT_TARGETS || "";
  const args = process.argv.slice(2);
  const argTargets = [];
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i];
    if (value === "--vault" && args[i + 1]) {
      argTargets.push(args[i + 1]);
      i += 1;
      continue;
    }
    if (value && !value.startsWith("-")) {
      argTargets.push(value);
    }
  }
  const combined = [...targetsEnv.split(","), ...argTargets]
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(combined));
}

/**
 * 执行 quantstats CSV 到数据库同步。
 * @returns {Promise<void>} 异步执行结果。
 */
async function run() {
  const targets = parseTargets();
  const count = await loadVaultQuantstatsToDb({
    vaultAddresses: targets.length > 0 ? targets : undefined,
  });
  console.log("[quantstats-sync] loaded", { count, targets: targets.length });
}

run().catch((error) => {
  console.error("[quantstats-sync]", error?.message ?? error);
  process.exitCode = 1;
});
