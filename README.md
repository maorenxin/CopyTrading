
  # CopyTradingCodex

  前端使用 Vite + React，后端为 Node/TS 的 API 服务，数据持久化在本地 PostgreSQL。

  ## 环境依赖

  - Node.js 20+
  - 本地 PostgreSQL（默认连接 `postgresql://localhost:5432/postgres`）

  ## 安装

  ```bash
  npm i
  ```

  ## 启动开发环境

  需要同时启动前端与 API 服务（两个终端）：

  ```bash
  # 终端 1：API 服务（默认 http://localhost:4000）
  npm run api:dev
  ```

  ```bash
  # 终端 2：前端（默认 http://localhost:3000）
  npm run dev
  ```

  ## 环境变量（可选）

  - `DATABASE_URL` 或 `POSTGRES_URL`：覆盖默认 PostgreSQL 连接地址
  - `HYPERLIQUID_API_KEY`：需要访问 Hyperliquid 相关接口时配置
  
