# 快速开始: 跟单平台多端交互与跟单流程

**日期**: 2025-12-24

## 目标

在本地启动 Web 前端，并准备 API/Telegram 服务所需的环境变量。

## 前端启动

```bash
npm install
npm run dev
```

## 服务端准备（占位）

> 服务端目录为 `server/`，在计划阶段先完成接口契约与数据模型，
> 实现阶段再补充启动脚本与部署说明。

## 必需环境变量（示例）

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `TELEGRAM_BOT_TOKEN`
- `HYPERLIQUID_API_KEY`（如需）

**注意**: 所有密钥仅通过环境变量提供，不写入代码或文档。
