export type LogLevel = "info" | "warn" | "error";

export function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  const payload = data ? { ...data } : undefined;
  const output = payload ? JSON.stringify(payload) : "";
  // 结构化输出，避免写入敏感信息
  console[level](`[${level}] ${message}`, output);
}
