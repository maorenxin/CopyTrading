# Chrome MCP 验收记录

**日期**: 2026-01-22
**环境**: 本地

## 运行前提

- 本地 PostgreSQL 已启动并完成 `server/db/schema.sql` 初始化
- 已完成一次数据同步并写入数据库
- 前端与 API 服务已启动

## 验收步骤

1. 打开 vault 列表页面，记录网络请求与响应
2. 打开任一 vault 详情页面，记录网络请求与响应
3. 确认页面数据与数据库查询结果一致
4. 确认页面无 mock 数据回退

## 记录模板

### Vault 列表

- 页面 URL: http://localhost:3000/
- Network 请求: GET `/api/vaults?limit=200`（200）
- 响应摘要: 返回 20 条，示例首条 id=170952b8-18b5-4775-b269-a7a9d08b2221，name=Hyperliquidity Trader (HLT)，tvl_usdc=1121109.741069，annualized_return=3.994380709770472
- 数据库查询摘要: `select id,vault_address,name,tvl_usdc,annualized_return,last_sync_run_id from vaults order by annualized_return desc limit 1;`
  返回 `170952b8-18b5-4775-b269-a7a9d08b2221|0x5a733b25a17dc0f26b862ca9e32b439801b1a8c7|Hyperliquidity Trader (HLT)|1121109.741069|3.994380709770472|522261f2-d3d4-4a66-8835-cf68fdf61750`
- 结论: 列表展示数值与数据库一致（TVL 与年化回报匹配）

### Vault 详情

- 页面 URL: http://localhost:3000/
- Network 请求: GET `/api/vaults/848b911a-fe9e-4e6f-82ac-8ad1a72dcca8`（200）
- 响应摘要: name=maxwin，tvl_usdc=1031699.905554，annualized_return=1.3640429294236953，status=active，last_sync_run_id=522261f2-d3d4-4a66-8835-cf68fdf61750
- 数据库查询摘要: `select id,vault_address,name,tvl_usdc,annualized_return,status,last_sync_run_id from vaults where id='848b911a-fe9e-4e6f-82ac-8ad1a72dcca8';`
  返回 `848b911a-fe9e-4e6f-82ac-8ad1a72dcca8|0x957fec7e7db4cec37cca9fbdb2a98185a9e9ee60|maxwin|1031699.905554|1.3640429294236953|active|522261f2-d3d4-4a66-8835-cf68fdf61750`
- 结论: 详情页展示与数据库一致

### Mock 数据检查

- 检查点: Network 面板仅看到 `/api/vaults` 与 `/api/vaults/{id}` 相关请求，无 mock 数据接口；前端列表与详情均由 API 返回
- 结果: 未发现 mock 数据回退，展示数据来自数据库
