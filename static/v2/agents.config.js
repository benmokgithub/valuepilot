/* ==========================================================
   agents.config.js —— 四个健康检查 Agent 的唯一配置点
   ==========================================================
   后期接入真实 API 时，只需修改本文件，业务代码无需改动。

   使用方式：
   1. 为每个 Agent 填好 endpoint（接口地址）与 apiKey（鉴权密钥）。
   2. 将 enabled 由 false 改为 true。
   3. 若接口为「纯后端聚合服务」，也可只保留 orchestrator 一个
      endpoint，其余四个走同一网关。
   4. apiKey 建议从环境变量/后端下发，不要明文提交到仓库。
   ========================================================== */

window.AGENT_RULES = {
  risk: [
    {
      id: 'R-GROUP-PRICE-01',
      name: '同集团价格一致性',
      logic: '同集团、同产品、相近规模客户的价格差异超过50%，且无审批或合理备注时提示复核',
      severity: 'HIGH',
      onMatch: 'REVIEW',
      threshold: { priceDifferencePct: 50 },
    },
    {
      id: 'R-MISSING-RATIONALE-02',
      name: '定价依据完整性',
      logic: '价格偏离集团或历史基准，但remark/审批依据缺失',
      severity: 'HIGH',
      onMatch: 'REVIEW',
    },
    {
      id: 'R-JUSTIFIED-EXCEPTION-03',
      name: '合理例外识别',
      logic: '已审批且有量价承诺的差异不计为异常',
      severity: 'INFO',
      onMatch: 'NO_ALERT',
    },
    {
      id: 'R-APPROVAL-04',
      name: '优惠审批完整性',
      logic: '优惠代码生效但审批状态缺失',
      severity: 'HIGH',
      onMatch: 'REVIEW',
    },
    {
      id: 'R-REVIEW-AGE-05',
      name: '长期未复核',
      logic: '优惠生效超过24个月且未见复核记录',
      severity: 'MEDIUM',
      onMatch: 'REVIEW',
      threshold: { reviewAgeMonths: 24 },
    },
    {
      id: 'R-STANDARD-CAP-06',
      name: '不高于标准费率',
      logic: '任意模拟金额下实际收费不得高于对应标准收费',
      severity: 'CRITICAL',
      onMatch: 'REVIEW',
    },
  ],
  value: [
    {
      id: 'V-PEER-BENCHMARK-01',
      name: '同业同规模基准偏离',
      logic: '与同业和相近规模客户中位数比较，识别显著折让',
      severity: 'MEDIUM',
      onMatch: 'OPPORTUNITY',
    },
    {
      id: 'V-VALUE-SHARE-02',
      name: '优惠与贡献匹配',
      logic: '优惠幅度较大但交易量、资金沉淀或综合贡献未兑现',
      severity: 'MEDIUM',
      onMatch: 'OPPORTUNITY',
    },
    {
      id: 'V-MULTI-DISCOUNT-03',
      name: '多产品优惠叠加',
      logic: '同一客户在多个产品均处于高折让区间，评估组合收益',
      severity: 'MEDIUM',
      onMatch: 'OPPORTUNITY',
    },
  ],
  growth: [
    {
      id: 'G-VOLUME-TIER-01',
      name: '量价联动机会',
      logic: '跨境活跃客户可通过阶梯定价换取新增交易量或业务迁移',
      severity: 'OPPORTUNITY',
      onMatch: 'OPPORTUNITY',
    },
    {
      id: 'G-CROSS-SELL-02',
      name: '产品组合机会',
      logic: '客户交易模式显示相邻产品需求，生成组合定价建议',
      severity: 'OPPORTUNITY',
      onMatch: 'OPPORTUNITY',
    },
    {
      id: 'G-WINBACK-03',
      name: '业务回流机会',
      logic: '客户有规模但本行交易占比较低，模拟更贴合的价格与承诺条件',
      severity: 'OPPORTUNITY',
      onMatch: 'OPPORTUNITY',
    },
  ],
};

window.SAME_NAME_KEYWORD_CATEGORIES = {
  payroll: {
    category: 'Payroll', label: '工资',
    keywords: ['工资', '薪资', '薪酬', '代发工资', '奖金', '年终奖', '绩效'],
    englishKeywords: ['Salary', 'Payroll', 'Wages', 'Bonus'],
  },
  reimbursement: {
    category: 'Reimbursement', label: '报销',
    keywords: ['报销', '费用报销', '差旅费', '员工报销', '备用金'],
    englishKeywords: ['Reimbursement', 'Expense', 'Travel Expense'],
  },
  tax: {
    category: 'Tax', label: '税款',
    keywords: ['税款', '缴税', '代扣税', '个税', '企业所得税', '增值税'],
    englishKeywords: ['Tax', 'VAT', 'IIT', 'CIT'],
  },
  supplier: {
    category: 'Supplier Payment', label: '供应商付款',
    keywords: ['货款', '采购款', '供应商付款', '合同款', '服务费'],
    englishKeywords: ['Supplier Payment', 'Purchase', 'Invoice', 'Settlement'],
  },
};

window.SAME_NAME_KEYWORD_PLAN = {
  CUST000001: ['supplier', 'payroll', 'tax'],
  CUST000002: ['payroll', 'reimbursement', 'supplier'],
  CUST000003: ['supplier', 'payroll', 'tax'],
  CUST000004: ['supplier', 'reimbursement', 'payroll'],
  CUST000005: ['payroll', 'reimbursement', 'supplier'],
  CUST000006: ['supplier', 'payroll', 'tax'],
  CUST000007: ['reimbursement', 'supplier', 'payroll'],
  CUST000008: ['supplier', 'payroll', 'tax'],
  CUST000009: ['payroll', 'reimbursement', 'supplier'],
  CUST000010: ['supplier', 'tax', 'payroll'],
  CUST000011: ['supplier', 'reimbursement', 'payroll'],
  CUST000012: ['supplier', 'payroll', 'tax'],
  CUST000013: ['supplier', 'payroll', 'tax'],
  CUST000014: ['payroll', 'reimbursement', 'supplier'],
  CUST000015: ['supplier', 'payroll', 'reimbursement'],
  CUST000016: ['supplier', 'payroll', 'tax'],
  CUST000017: ['supplier', 'payroll', 'tax'],
  CUST000018: ['supplier', 'payroll', 'reimbursement'],
  CUST000019: ['supplier', 'payroll', 'tax'],
  CUST000020: ['supplier', 'payroll', 'tax'],
};

window.AGENT_WORKFLOW = [
  {
    step: 1,
    agent: 'integrate',
    name: 'Data Stitcher',
    input: 'VA/RMS/LCY/FX/Omni定价、客户、集团、账户',
    output: '客户定价全景与统一客户主键',
    nextAgent: 'risk',
  },
  {
    step: 2,
    agent: 'risk',
    name: 'Risk Referee',
    input: '定价全景、审批和规则库',
    output: '需复核事项与合理例外',
    nextAgent: 'value',
  },
  {
    step: 3,
    agent: 'value',
    name: 'Value Detective',
    input: '风险结果、同业同规模基准、客户贡献',
    output: '收益差距与价值份额线索',
    nextAgent: 'growth',
  },
  {
    step: 4,
    agent: 'growth',
    name: 'Growth Strategist',
    input: '客户全景、收益线索、交易模式',
    output: '阶梯定价、组合定价与业务迁移建议',
    nextAgent: 'coverage_team',
  },
];

window.AGENT_CONFIG = {
  rulesSource: 'ValuePilot-Mock-Data.xlsx / AI Rules & Handoffs',
  workflow: window.AGENT_WORKFLOW,
  /* ---- 全局开关 ---- */
  // mock: true 时走本地 data.js 的预聚合结果（现状），不发起真实请求
  mock: true,

  /* ---- 大模型调用配置（全局，供四个 Agent 共用） ---- */
  llm: {
    provider: 'openai',          // OpenAI 兼容协议，服务端优先阿里云、备用智谱
    endpoint: '/api/llm',        // 同源 Flask 代理，自动补全 /chat/completions
    apiKey: '',                  // 密钥由服务端 BIGMODEL_API_KEY 保管，不下发到浏览器
    model: 'glm-5.3',
  },

  /* ---- 编排层（可选） ---- */
  // 若后端已有一个统一的健康检查编排接口，填这里；否则留空，
  // 前端按 agents 顺序逐个调用。
  orchestrator: {
    endpoint: '',
    apiKey: '',
    timeoutMs: 60000,
  },

  /* ---- 四个 Agent ---- */
  // 每个 Agent 的 request 会带上客户上下文（见 agents.js 的 buildContext）
  agents: {
    /* ① 资料整合：实时交易数据 + 大模型分析 */
    integrate: {
      name: '资料整合',
      enabled: true,
      realtimeLlm: true,
      demo: true,
      transactionEndpoint: '/api/transactions/query',  // 独立模拟流水表，最近 3 个月
      endpoint: '',            // 通用 Agent 网关；realtimeLlm=true 时不使用
      apiKey: '',
      method: 'POST',
      model: '',
      timeoutMs: 180000,
      order: 1,
      rules: [],
    },
    /* ② 风险判断：识别风险类发现项 */
    risk: {
      name: '风险判断',
      enabled: false,
      endpoint: '',            // 例: https://api.example.com/agents/risk
      apiKey: '',
      method: 'POST',
      model: '',
      timeoutMs: 30000,
      order: 2,
      rules: window.AGENT_RULES.risk,
    },
    /* ③ 价值探索：挖掘价值与机会 */
    value: {
      name: '价值探索',
      enabled: false,
      endpoint: '',            // 例: https://api.example.com/agents/value
      apiKey: '',
      method: 'POST',
      model: '',
      timeoutMs: 30000,
      order: 3,
      rules: window.AGENT_RULES.value,
    },
    /* ④ 增长策略：生成行动建议 */
    growth: {
      name: '增长策略',
      enabled: false,
      endpoint: '',            // 例: https://api.example.com/agents/growth
      apiKey: '',
      method: 'POST',
      model: '',
      timeoutMs: 30000,
      order: 4,
      rules: window.AGENT_RULES.growth,
    },
  },

  /* ---- 请求头（可选，全局附加） ---- */
  defaultHeaders: {
    'Content-Type': 'application/json',
    // 'X-Tenant-Id': 'your-tenant',
  },
};
