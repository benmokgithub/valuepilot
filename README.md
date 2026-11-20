# ValuePilot AI · 客户套餐适配体检

多智能体定价体检系统。通过数据拼接、风险裁判、价值侦探、增长策略四个 AI Agent 协作，对客户跨境综合定价做健康度评估，输出全景报告、风险诊断、收益机会与增长方案。

> 本仓库是线上部署版本的完整代码快照：Flask 后端、前端 SPA、数据导入与演示数据生成脚本、Nginx / systemd 部署配置。

## 功能概览

- **AI 体检报告**：全景 / 诊断 / 收益 / 增长四个 Tab，评分、风险项、收益机会与增长建议全部由确定性公式和规则库产出
- **四 Agent 流水线**：`Data Stitcher → Risk Referee → Value Detective → Growth Strategist`，每一步返回输入数据、逻辑步骤、规则评估与证据
- **实时大模型分析**：可接入阿里云 MaaS / 智谱 BigModel（OpenAI 兼容接口），实时分析 Top 10 付款对手方与同名转账资金用途
- **Agent 调试台**：`/debug` 提供工作流图、Agent 运行器、测试用例执行器
- **数据与费率库**：26 个数据集浏览、搜索与 CSV 导出
- **组合管理视图**：全局指标、价值份额 vs 价格竞争力散点图、重点客户列表

## 技术架构

```
浏览器
  │
  ▼
Nginx (80) ── /static/ ──▶ 静态文件 (static/)
  │
  │ 反向代理
  ▼
Flask (5000) ──▶ SQLite (valuepilot.db)
  │
  └──▶ 大模型 Provider（阿里云 MaaS / 智谱 BigModel）
```

| 组件 | 技术 |
|------|------|
| 前端 | HTML + CSS + Vanilla JS（无框架） |
| 后端 | Python 3.12 / Flask 3 |
| 数据库 | SQLite（由 Excel 导入生成） |
| 部署 | Nginx + systemd |

## 目录结构

```
.
├── app.py                          # Flask API 后端（含 Agent 逻辑与 LLM 代理）
├── static/
│   ├── index.html                  # 体检主页面
│   ├── debug.html                  # Agent 调试台
│   ├── app.js                      # 主页面脚本
│   └── v2/
│       ├── app.js                  # 确定性计算引擎与页面逻辑
│       ├── agents.js               # 健康检查 Agent 调用与结果合并
│       ├── agents.config.js        # Agent 配置（mock 开关、候选词库等）
│       └── data.js                 # 预聚合演示数据（mock 模式使用）
├── index.html                      # 旧版单文件页面（历史遗留，线上未使用）
├── import_data.py                  # Excel → SQLite 导入脚本
├── add_more_data.py                # 补充演示数据脚本
├── generate_demo_transactions.py   # 演示流水生成脚本
├── deploy/
│   ├── valuepilot.service          # systemd 服务单元
│   ├── valuepilot.service.d-bigmodel.conf  # 注入 /etc/valuepilot.env 的 drop-in
│   └── nginx-valuepilot.conf       # Nginx 反向代理配置
├── requirements.txt
└── .env.example
```

## 快速开始

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env   # 填入至少一个大模型的 API Key（可选）
export $(grep -v '^#' .env | xargs)
python app.py          # 默认 http://127.0.0.1:5000
```

`app.py` 默认从仓库内 `static/` 提供前端；可用 `VP_STATIC_DIR` 覆盖。

## 数据导入

数据库不入库，需从 Excel 重新生成：

```bash
XLSX_PATH=./ValuePilot-Mock-Data-v2.xlsx python import_data.py
```

`import_data.py` 会在脚本同目录生成 `valuepilot.db`，包含 26 张业务表；`reports` 表在首次调用 API 时自动创建。

## 配置项

| 环境变量 | 说明 |
|----------|------|
| `ALIYUN_LLM_BASE_URL` / `ALIYUN_LLM_API_KEY` / `ALIYUN_LLM_MODEL` | 阿里云 MaaS 兼容接口 |
| `BIGMODEL_BASE_URL` / `BIGMODEL_API_KEY` / `BIGMODEL_MODEL` | 智谱 BigModel |
| `LLM_PROVIDER_TIMEOUT` | 单 Provider 超时秒数，默认 75 |
| `VP_STATIC_DIR` | 静态文件目录，默认仓库内 `static/` |
| `XLSX_PATH` | `import_data.py` 读取的 Excel 路径 |

配置了 API Key 后，前端会实时请求大模型；未配置时可在 `static/v2/agents.config.js` 保持 `mock: true` 使用 `data.js` 预聚合结果。

## 主要 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/datasets` | 数据集列表 |
| GET | `/api/data/<dataset>` | 数据集分页查询（`page`, `per_page`, `q`, `customer_id`） |
| GET | `/api/customers` | 客户列表 |
| GET | `/api/customers/<id>` | 客户详情 |
| GET | `/api/stats` | 全局统计 |
| GET | `/api/ai-rules` | 规则库 |
| POST | `/api/agents/<agent_name>/run` | 运行指定 Agent，body: `{customer_id}` |
| POST | `/api/test-case/run` | 执行规则测试用例 |
| POST | `/api/transactions/query` | 实时流水查询（演示数据接口） |
| POST | `/api/llm/chat/completions` | 大模型代理（Provider 顺序故障转移） |
| GET/POST | `/api/reports` | 体检记录列表 / 新建 |
| GET | `/api/reports/<id>` | 单条体检记录 |

Agent 名称：`Data Stitcher`、`Risk Referee`、`Value Detective`、`Growth Strategist`。

## 服务器部署

```bash
# 应用目录与虚拟环境
mkdir -p /opt/valuepilot/static
python3 -m venv /opt/venv
/opt/venv/bin/pip install -r requirements.txt

# 上传代码
rsync -av ./app.py ./static/ root@<server>:/opt/valuepilot/

# 导入数据
XLSX_PATH=/tmp/ValuePilot-Mock-Data-v2.xlsx /opt/venv/bin/python /opt/valuepilot/import_data.py

# 系统服务与 Nginx
cp deploy/valuepilot.service /etc/systemd/system/
mkdir -p /etc/systemd/system/valuepilot.service.d
cp deploy/valuepilot.service.d-bigmodel.conf /etc/systemd/system/valuepilot.service.d/bigmodel.conf
cp deploy/nginx-valuepilot.conf /etc/nginx/sites-enabled/valuepilot
systemctl daemon-reload && systemctl enable --now valuepilot
nginx -t && systemctl reload nginx
```

API Key 放在 `/etc/valuepilot.env`（权限 600），不要提交到仓库。

## 安全约定

- 不提交 `.env`、`/etc/valuepilot.env`、`valuepilot.db` 与 `backups/`
- 大模型 Key 只通过环境变量注入
- 模型输出在前端以 `innerText` 渲染，避免 XSS
