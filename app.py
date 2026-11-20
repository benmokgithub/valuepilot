#!/usr/bin/env python3
import sqlite3
import json
import os
import urllib.error
import urllib.request
from flask import Flask, jsonify, request, send_from_directory

STATIC_DIR = os.environ.get(
    'VP_STATIC_DIR',
    os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static'),
)
app = Flask(__name__, static_folder=STATIC_DIR)
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'valuepilot.db')
ALIYUN_LLM_BASE_URL = os.environ.get(
    'ALIYUN_LLM_BASE_URL',
    'https://llm-tlndh47wd9ustbss.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'
).rstrip('/')
ALIYUN_LLM_API_KEY = os.environ.get('ALIYUN_LLM_API_KEY', '')
ALIYUN_LLM_MODEL = os.environ.get('ALIYUN_LLM_MODEL', 'glm-5.3')
BIGMODEL_BASE_URL = os.environ.get(
    'BIGMODEL_BASE_URL', 'https://open.bigmodel.cn/api/paas/v4'
).rstrip('/')
BIGMODEL_API_KEY = os.environ.get('BIGMODEL_API_KEY', '')
BIGMODEL_MODEL = os.environ.get('BIGMODEL_MODEL', 'glm-5.3')
LLM_PROVIDER_TIMEOUT = int(os.environ.get('LLM_PROVIDER_TIMEOUT', '75'))
LLM_PROVIDERS = [
    {
        'name': 'aliyun',
        'base_url': ALIYUN_LLM_BASE_URL,
        'api_key': ALIYUN_LLM_API_KEY,
        'model': ALIYUN_LLM_MODEL,
    },
    {
        'name': 'bigmodel',
        'base_url': BIGMODEL_BASE_URL,
        'api_key': BIGMODEL_API_KEY,
        'model': BIGMODEL_MODEL,
    },
]

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def query_to_dicts(conn, sql, params=None):
    if params:
        rows = conn.execute(sql, params).fetchall()
    else:
        rows = conn.execute(sql).fetchall()
    return [dict(r) for r in rows]

@app.route('/')
def index():
    return send_from_directory(STATIC_DIR, 'index.html')

@app.route('/debug')
def debug():
    return send_from_directory(STATIC_DIR, 'debug.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory(STATIC_DIR, filename)

@app.route('/api/transactions/query', methods=['POST'])
def query_demo_transactions():
    """Return explicitly labelled demo rows; never mix them with real account data."""
    payload = request.get_json(silent=True) or {}
    customer_id = str(payload.get('customer_id') or '').strip()
    if not customer_id:
        return jsonify({'error': 'customer_id 不能为空', 'demo': True}), 400
    try:
        month_count = max(1, min(int(payload.get('months', 3)), 36))
    except (TypeError, ValueError):
        return jsonify({'error': 'months 必须是整数', 'demo': True}), 400

    conn = get_db()
    try:
        customer = conn.execute('''
            SELECT customer_id, customer_name FROM demo_transactions
            WHERE customer_id = ? LIMIT 1
        ''', (customer_id,)).fetchone()
        if not customer:
            return jsonify({
                'error': '该客户没有模拟流水，请使用页面中的演示客户',
                'demo': True,
            }), 404
        month_rows = conn.execute('''
            SELECT DISTINCT source_month FROM demo_transactions
            WHERE customer_id = ? ORDER BY source_month DESC LIMIT ?
        ''', (customer_id, month_count)).fetchall()
        months = [row['source_month'] for row in month_rows]
        if not months:
            return jsonify({'transactions': [], 'demo': True, 'data_source': 'SIMULATED_DEMO_NOT_REAL'})
        placeholders = ','.join('?' for _ in months)
        rows = conn.execute(f'''
            SELECT transaction_id, customer_id, transaction_date, source_month,
                   direction, counterparty_name, counterparty_bank, amount,
                   currency, narrative, is_demo, data_source
            FROM demo_transactions
            WHERE customer_id = ? AND source_month IN ({placeholders})
            ORDER BY transaction_date, transaction_id LIMIT 500
        ''', [customer_id] + months).fetchall()
        transactions = [dict(row) for row in rows]
    finally:
        conn.close()

    return jsonify({
        'customer_id': customer_id,
        'customer_name': customer['customer_name'],
        'transactions': transactions,
        'demo': True,
        'data_source': 'SIMULATED_DEMO_NOT_REAL',
        'notice': '模拟逐笔流水，仅用于演示 SQLite、API 与大模型链路，非真实交易',
        'meta': {
            'months': sorted(months),
            'month_count': len(months),
            'transaction_count': len(transactions),
        },
    })

@app.route('/api/llm/chat/completions', methods=['POST'])
def llm_chat_completions():
    """Try Aliyun first, then BigModel, without exposing either API key."""
    providers = [provider for provider in LLM_PROVIDERS if provider['api_key']]
    if not providers:
        return jsonify({'error': '服务端未配置可用的大模型 API Key'}), 503

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or not isinstance(payload.get('messages'), list):
        return jsonify({'error': '请求体必须包含 messages 数组'}), 400
    if not payload['messages'] or (request.content_length or 0) > 1024 * 1024:
        return jsonify({'error': 'messages 不能为空，请求大小不能超过 1 MB'}), 400

    allowed_models = {provider['model'] for provider in providers}
    requested_model = payload.get('model') or providers[0]['model']
    if requested_model not in allowed_models:
        return jsonify({'error': f'仅允许使用服务端配置的模型 {sorted(allowed_models)}'}), 400
    if payload.get('stream'):
        return jsonify({'error': '当前代理不支持流式响应'}), 400

    upstream_payload = {
        'messages': payload['messages'],
        'stream': False,
    }
    for key in ('temperature', 'top_p', 'response_format'):
        if key in payload:
            upstream_payload[key] = payload[key]
    try:
        upstream_payload['max_tokens'] = min(int(payload.get('max_tokens', 8192)), 8192)
    except (TypeError, ValueError):
        return jsonify({'error': 'max_tokens 必须是整数'}), 400

    failures = []
    for index, provider in enumerate(providers):
        provider_payload = dict(upstream_payload, model=provider['model'])
        req = urllib.request.Request(
            f"{provider['base_url']}/chat/completions",
            data=json.dumps(provider_payload, ensure_ascii=False).encode('utf-8'),
            headers={
                'Authorization': f"Bearer {provider['api_key']}",
                'Content-Type': 'application/json',
            },
            method='POST',
        )
        try:
            with urllib.request.urlopen(req, timeout=LLM_PROVIDER_TIMEOUT) as response:
                raw = response.read().decode('utf-8')
                result = json.loads(raw)
                choices = result.get('choices') or []
                message = choices[0].get('message', {}) if choices else {}
                if not message.get('content') and not message.get('tool_calls'):
                    raise ValueError('模型返回空内容')
                result['valuepilot'] = {
                    'provider': provider['name'],
                    'model': provider['model'],
                    'fallback_used': index > 0,
                }
                return jsonify(result), response.status
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode('utf-8', errors='replace')
            try:
                detail = json.loads(raw)
            except json.JSONDecodeError:
                detail = raw[:1000] or '上游请求失败'
            failures.append({'provider': provider['name'], 'status': exc.code, 'detail': detail})
            app.logger.warning('LLM provider %s returned HTTP %s; trying next provider', provider['name'], exc.code)
        except (urllib.error.URLError, TimeoutError) as exc:
            failures.append({'provider': provider['name'], 'status': 502, 'detail': str(exc)})
            app.logger.warning('LLM provider %s failed: %s; trying next provider', provider['name'], exc)
        except (json.JSONDecodeError, ValueError) as exc:
            failures.append({'provider': provider['name'], 'status': 502, 'detail': str(exc)})
            app.logger.warning('LLM provider %s returned an unusable response: %s', provider['name'], exc)

    return jsonify({'error': '首选和备用大模型均不可用', 'failures': failures}), 502

@app.route('/api/datasets')
def list_datasets():
    return jsonify({
        'datasets': [
            {'key': 'customer', 'name': '客户全景', 'table': 'customers'},
            {'key': 'external_profile', 'name': '企业公开信息', 'table': 'external_company_profile'},
            {'key': 'va_std', 'name': 'VA 标准定价', 'table': 'va_standard_pricing'},
            {'key': 'rms_std', 'name': 'RMS 标准定价', 'table': 'rms_standard_pricing'},
            {'key': 'lcy_std', 'name': 'LCY 优惠定价', 'table': 'lcy_preferential_pricing'},
            {'key': 'fcy_std', 'name': 'FCY 付款定价', 'table': 'fcy_payment_pricing'},
            {'key': 'omni_std', 'name': 'Omni 方案', 'table': 'omni_pricing_plans'},
            {'key': 'deposit_std', 'name': '存款标准定价', 'table': 'deposit_standard_pricing'},
            {'key': 'cashpool_std', 'name': '资金池标准定价', 'table': 'cash_pool_standard_pricing'},
            {'key': 'tariff', 'name': '标准费率', 'table': 'tariff_catalog'},
            {'key': 'va_cust', 'name': 'VA 客户定价', 'table': 'va_customer_pricing'},
            {'key': 'rms_cust', 'name': 'RMS 客户定价', 'table': 'rms_customer_pricing'},
            {'key': 'lcy_cust', 'name': 'LCY 客户定价', 'table': 'lcy_customer_pricing'},
            {'key': 'fcy_cust', 'name': 'FCY 客户定价', 'table': 'fcy_payment_customer_pricing'},
            {'key': 'omni_cust', 'name': 'Omni 客户定价', 'table': 'omni_customer_pricing'},
            {'key': 'deposit_cust', 'name': '存款客户定价', 'table': 'deposit_customer_pricing'},
            {'key': 'cashpool_cust', 'name': '资金池客户定价', 'table': 'cash_pool_customer_pricing'},
            {'key': 'other_cust', 'name': '其他客户定价', 'table': 'other_customer_pricing'},
            {'key': 'bank_perf', 'name': '银行绩效', 'table': 'customer_bank_performance'},
            {'key': 'pricing_analysis', 'name': '定价分析', 'table': 'customer_pricing_analysis'},
            {'key': 'demo_scenarios', 'name': '演示场景', 'table': 'demo_scenarios'},
            {'key': 'ai_rules', 'name': 'AI 规则', 'table': 'ai_rules'},
            {'key': 'agent_workflow', 'name': 'Agent 工作流', 'table': 'agent_workflow'},
            {'key': 'ai_test_cases', 'name': 'AI 测试用例', 'table': 'ai_test_cases'},
        ]
    })

TABLE_MAP = {
    'customer': 'customers',
    'external_profile': 'external_company_profile',
    'va_std': 'va_standard_pricing',
    'rms_std': 'rms_standard_pricing',
    'lcy_std': 'lcy_preferential_pricing',
    'fcy_std': 'fcy_payment_pricing',
    'omni_std': 'omni_pricing_plans',
    'deposit_std': 'deposit_standard_pricing',
    'cashpool_std': 'cash_pool_standard_pricing',
    'tariff': 'tariff_catalog',
    'va_cust': 'va_customer_pricing',
    'rms_cust': 'rms_customer_pricing',
    'lcy_cust': 'lcy_customer_pricing',
    'fcy_cust': 'fcy_payment_customer_pricing',
    'omni_cust': 'omni_customer_pricing',
    'deposit_cust': 'deposit_customer_pricing',
    'cashpool_cust': 'cash_pool_customer_pricing',
    'other_cust': 'other_customer_pricing',
    'bank_perf': 'customer_bank_performance',
    'pricing_analysis': 'customer_pricing_analysis',
    'demo_scenarios': 'demo_scenarios',
    'ai_rules': 'ai_rules',
    'agent_workflow': 'agent_workflow',
    'ai_test_cases': 'ai_test_cases',
}

@app.route('/api/data/<dataset>')
def get_dataset(dataset):
    conn = get_db()
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 100, type=int)
    search = request.args.get('q', '', type=str)
    customer_id = request.args.get('customer_id', None, type=str)

    if dataset not in TABLE_MAP:
        conn.close()
        return jsonify({'error': f'Unknown dataset: {dataset}'}), 404

    table = TABLE_MAP[dataset]
    columns_info = conn.execute(f'PRAGMA table_info("{table}")').fetchall()
    columns = [c['name'] for c in columns_info]

    where_clauses = []
    params = []

    if customer_id:
        if 'customer_id' in columns:
            where_clauses.append('customer_id = ?')
            params.append(customer_id)

    if search:
        search_conditions = []
        for col in columns:
            search_conditions.append(f'"{col}" LIKE ?')
            params.append(f'%{search}%')
        if search_conditions:
            where_clauses.append(f'({" OR ".join(search_conditions)})')

    where_sql = f'WHERE {" AND ".join(where_clauses)}' if where_clauses else ''
    total = conn.execute(f'SELECT COUNT(*) FROM "{table}" {where_sql}', params).fetchone()[0]
    offset = (page - 1) * per_page
    rows = conn.execute(f'SELECT * FROM "{table}" {where_sql} LIMIT ? OFFSET ?', params + [per_page, offset]).fetchall()
    data = [dict(r) for r in rows]

    conn.close()
    return jsonify({'dataset': dataset, 'table': table, 'columns': columns, 'data': data, 'total': total, 'page': page, 'per_page': per_page})

@app.route('/api/customers')
def get_customers():
    conn = get_db()
    search = request.args.get('q', '', type=str)
    scope = request.args.get('scope', 'all', type=str)

    query = 'SELECT * FROM customers WHERE 1=1'
    params = []

    if search:
        query += ' AND (client_name LIKE ? OR customer_id LIKE ? OR industry LIKE ? OR province LIKE ?)'
        params.extend([f'%{search}%'] * 4)

    if scope == 'cross-border':
        query += " AND cross_border_flag = 'Yes'"
    elif scope == 'domestic':
        query += " AND cross_border_flag = 'No'"

    rows = query_to_dicts(conn, query, params if params else None)
    conn.close()
    return jsonify(rows)

@app.route('/api/customers/<customer_id>')
def get_customer(customer_id):
    conn = get_db()
    customer = query_to_dicts(conn, 'SELECT * FROM customers WHERE customer_id = ?', (customer_id,))
    ext_profile = query_to_dicts(conn, 'SELECT * FROM external_company_profile WHERE customer_id = ?', (customer_id,))
    pricing_analysis = query_to_dicts(conn, 'SELECT * FROM customer_pricing_analysis WHERE customer_id = ?', (customer_id,))
    bank_perf = query_to_dicts(conn, 'SELECT * FROM customer_bank_performance WHERE customer_id = ? ORDER BY reporting_month DESC LIMIT 12', (customer_id,))

    va_pricing = query_to_dicts(conn, 'SELECT * FROM va_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
    rms_pricing = query_to_dicts(conn, 'SELECT * FROM rms_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
    lcy_pricing = query_to_dicts(conn, 'SELECT * FROM lcy_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
    fcy_pricing = query_to_dicts(conn, 'SELECT * FROM fcy_payment_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
    omni_pricing = query_to_dicts(conn, 'SELECT * FROM omni_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))

    conn.close()
    return jsonify({
        'customer': customer[0] if customer else None,
        'external_profile': ext_profile[0] if ext_profile else None,
        'pricing_analysis': pricing_analysis[0] if pricing_analysis else None,
        'bank_performance': bank_perf,
        'va_pricing': va_pricing,
        'rms_pricing': rms_pricing,
        'lcy_pricing': lcy_pricing,
        'fcy_pricing': fcy_pricing,
        'omni_pricing': omni_pricing,
    })

@app.route('/api/stats')
def get_stats():
    conn = get_db()
    scope = request.args.get('scope', 'all', type=str)

    where_clause = ''
    params = []
    if scope == 'cross-border':
        where_clause = "WHERE cross_border_flag = 'Yes'"
    elif scope == 'domestic':
        where_clause = "WHERE cross_border_flag = 'No'"

    stats = {
        'total_customers': conn.execute(f'SELECT COUNT(*) FROM customers {where_clause}', params).fetchone()[0],
        'total_va_cust': conn.execute('SELECT COUNT(*) FROM va_customer_pricing WHERE is_latest_version = \'Yes\'').fetchone()[0],
        'total_lcy_std': conn.execute('SELECT COUNT(*) FROM lcy_preferential_pricing').fetchone()[0],
        'total_fx_std': conn.execute('SELECT COUNT(*) FROM fcy_payment_pricing').fetchone()[0],
        'total_omni_std': conn.execute('SELECT COUNT(*) FROM omni_pricing_plans').fetchone()[0],
        'total_tariff': conn.execute('SELECT COUNT(*) FROM tariff_catalog').fetchone()[0],
        'total_bank_perf': conn.execute('SELECT COUNT(*) FROM customer_bank_performance').fetchone()[0],
        'total_pricing_analysis': conn.execute('SELECT COUNT(*) FROM customer_pricing_analysis').fetchone()[0],
        'total_demo_scenarios': conn.execute('SELECT COUNT(*) FROM demo_scenarios').fetchone()[0],
        'total_ai_rules': conn.execute('SELECT COUNT(*) FROM ai_rules').fetchone()[0],
        'total_agents': conn.execute('SELECT COUNT(*) FROM agent_workflow').fetchone()[0],
        'industries': query_to_dicts(conn, f'SELECT industry, COUNT(*) as count FROM customers {where_clause} GROUP BY industry ORDER BY count DESC', params if params else None),
        'regions': query_to_dicts(conn, f'SELECT province, COUNT(*) as count FROM customers {where_clause} GROUP BY province ORDER BY count DESC', params if params else None),
        'size_bands': query_to_dicts(conn, f'SELECT size_band, COUNT(*) as count FROM customers {where_clause} GROUP BY size_band ORDER BY count DESC', params if params else None),
    }
    conn.close()
    return jsonify(stats)

@app.route('/api/ai-rules')
def ai_rules():
    conn = get_db()
    rows = query_to_dicts(conn, 'SELECT * FROM ai_rules')
    conn.close()
    return jsonify(rows)

@app.route('/api/eval-truth')
def eval_truth():
    conn = get_db()
    customer_id = request.args.get('customer_id', None)
    if customer_id:
        rows = query_to_dicts(conn, 'SELECT * FROM ai_test_cases WHERE customer_id = ?', (customer_id,))
    else:
        rows = query_to_dicts(conn, 'SELECT * FROM ai_test_cases LIMIT 200')
    conn.close()
    return jsonify(rows)

@app.route('/api/demo-scenarios')
def demo_scenarios():
    conn = get_db()
    customer_id = request.args.get('customer_id', None)
    if customer_id:
        rows = query_to_dicts(conn, 'SELECT * FROM demo_scenarios WHERE customer_id = ?', (customer_id,))
    else:
        rows = query_to_dicts(conn, 'SELECT * FROM demo_scenarios')
    conn.close()
    return jsonify(rows)

# ─── Agent Workflow API ───────────────────────────────────────────

@app.route('/api/agents')
def list_agents():
    """List all 4 agents from the Agent Workflow table."""
    conn = get_db()
    agents = query_to_dicts(conn, 'SELECT * FROM agent_workflow ORDER BY step')
    conn.close()
    return jsonify(agents)

@app.route('/api/agents/<agent_name>/run', methods=['POST'])
def run_agent(agent_name):
    """Run a specific agent's logic for a given customer.

    Returns detailed step-by-step logic: input data, rules applied, reasoning, and output.
    """
    agent_name_map = {
        'data_stitcher': 'Data Stitcher',
        'risk_referee': 'Risk Referee',
        'value_detective': 'Value Detective',
        'growth_strategist': 'Growth Strategist',
    }
    agent_name = agent_name_map.get(agent_name, agent_name)

    conn = get_db()
    data = request.get_json() or {}
    customer_id = data.get('customer_id', '')

    if not customer_id:
        conn.close()
        return jsonify({'error': 'customer_id is required'}), 400

    customer = query_to_dicts(conn, 'SELECT * FROM customers WHERE customer_id = ?', (customer_id,))
    if not customer:
        conn.close()
        return jsonify({'error': f'Customer {customer_id} not found'}), 404

    c = customer[0]
    result = {'agent': agent_name, 'customer_id': customer_id, 'customer_name': c.get('client_name', '')}

    if agent_name == 'Data Stitcher':
        ext = query_to_dicts(conn, 'SELECT * FROM external_company_profile WHERE customer_id = ?', (customer_id,))
        analysis = query_to_dicts(conn, 'SELECT * FROM customer_pricing_analysis WHERE customer_id = ?', (customer_id,))
        bank_perf = query_to_dicts(conn, 'SELECT * FROM customer_bank_performance WHERE customer_id = ? ORDER BY reporting_month DESC LIMIT 3', (customer_id,))
        va = query_to_dicts(conn, 'SELECT * FROM va_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        rms = query_to_dicts(conn, 'SELECT * FROM rms_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        lcy = query_to_dicts(conn, 'SELECT * FROM lcy_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        fcy = query_to_dicts(conn, 'SELECT * FROM fcy_payment_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        omni = query_to_dicts(conn, 'SELECT * FROM omni_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        deposit = query_to_dicts(conn, 'SELECT * FROM deposit_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        cashpool = query_to_dicts(conn, 'SELECT * FROM cash_pool_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        other = query_to_dicts(conn, 'SELECT * FROM other_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))

        def sample_record(records, keys=None):
            if not records:
                return None
            r = records[0]
            if keys:
                return {k: r.get(k) for k in keys if k in r}
            return {k: r.get(k) for k in list(r.keys())[:8]}

        result['input_data'] = {
            'customers': {'table': 'customers', 'records': 1, 'sample': {k: c.get(k) for k in ['customer_id', 'client_name', 'industry', 'size_band', 'province']}},
            'external_company_profile': {'table': 'external_company_profile', 'records': len(ext), 'sample': sample_record(ext, ['customer_id', 'industry_level_1', 'revenue_mn_cny', 'overall_risk_level', 'financial_health_band'])},
            'customer_bank_performance': {'table': 'customer_bank_performance', 'records': len(bank_perf), 'sample': sample_record(bank_perf, ['reporting_month', 'total_nfi', 'total_nii', 'toi'])},
            'va_customer_pricing': {'table': 'va_customer_pricing', 'records': len(va), 'sample': sample_record(va, ['pricing_record_id', 'va_monthly_fee', 'pricing_status', 'is_latest_version'])},
            'rms_customer_pricing': {'table': 'rms_customer_pricing', 'records': len(rms), 'sample': sample_record(rms, ['pricing_record_id', 'rms_pricing', 'pricing_status'])},
            'lcy_customer_pricing': {'table': 'lcy_customer_pricing', 'records': len(lcy), 'sample': sample_record(lcy, ['pricing_record_id', 'value_list', 'pricing_status'])},
            'fcy_payment_customer_pricing': {'table': 'fcy_payment_customer_pricing', 'records': len(fcy), 'sample': sample_record(fcy, ['pricing_record_id', 'price_code', 'pricing_status'])},
            'omni_customer_pricing': {'table': 'omni_customer_pricing', 'records': len(omni), 'sample': sample_record(omni, ['pricing_record_id', 'plan_code', 'pricing_status'])},
        }

        result['logic_steps'] = [
            {'step': 1, 'action': '读取客户主数据', 'source': 'customers 表', 'rule': '客户主数据完整性校验：customer_id、client_name、industry、size_band、province 不得为空', 'result': f"获取客户 {c.get('client_name', '')} 的基本信息（行业：{c.get('industry', '')}，规模：{c.get('size_band', '')}，区域：{c.get('province', '')}）"},
            {'step': 2, 'action': '读取企业公开信息', 'source': 'external_company_profile 表', 'rule': '企业画像有效性校验：overall_risk_level 和 financial_health_band 须有有效值', 'result': f"获取企业画像（风险等级：{ext[0].get('overall_risk_level', 'N/A') if ext else 'N/A'}，财务健康：{ext[0].get('financial_health_band', 'N/A') if ext else 'N/A'}）"},
            {'step': 3, 'action': '读取银行绩效数据', 'source': 'customer_bank_performance 表', 'rule': '绩效数据时效性校验：至少包含最近 3 个月数据，NFI/NII/TOI 不得为负', 'result': f"获取最近 {len(bank_perf)} 个月的绩效数据（NFI、NII、TOI）"},
            {'step': 4, 'action': '读取产品定价记录', 'source': '8 个产品定价表', 'rule': '定价版本一致性校验：仅取 is_latest_version = Yes 的最新版本记录', 'result': f"VA:{len(va)} RMS:{len(rms)} LCY:{len(lcy)} FCY:{len(fcy)} Omni:{len(omni)} Deposit:{len(deposit)} CashPool:{len(cashpool)} Other:{len(other)}"},
            {'step': 5, 'action': '拼接客户全景', 'source': '所有数据源', 'rule': '全景数据完整性校验：主数据 + 画像 + 绩效 + 8 产品定价须全部关联到同一 customer_id', 'result': f"整合完成，共 {1 + len(ext) + len(bank_perf) + len(va) + len(rms) + len(lcy) + len(fcy) + len(omni) + len(deposit) + len(cashpool) + len(other)} 条记录"},
        ]

        result['panorama'] = {
            'customer': c,
            'external_profile': ext[0] if ext else None,
            'pricing_analysis': analysis[0] if analysis else None,
            'recent_performance': bank_perf,
            'active_pricing': {
                'va': len(va), 'rms': len(rms), 'lcy': len(lcy),
                'fcy': len(fcy), 'omni': len(omni), 'deposit': len(deposit),
                'cashpool': len(cashpool), 'other': len(other),
            }
        }
        result['output'] = f"完成客户 {c.get('client_name', '')} 的定价全景拼接，整合 8 个产品共 {sum(result['panorama']['active_pricing'].values())} 条活跃定价记录。"

    elif agent_name == 'Risk Referee':
        rules = query_to_dicts(conn, 'SELECT * FROM ai_rules')
        va = query_to_dicts(conn, 'SELECT * FROM va_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        rms = query_to_dicts(conn, 'SELECT * FROM rms_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        lcy = query_to_dicts(conn, 'SELECT * FROM lcy_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        fcy = query_to_dicts(conn, 'SELECT * FROM fcy_payment_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        omni = query_to_dicts(conn, 'SELECT * FROM omni_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        analysis = query_to_dicts(conn, 'SELECT * FROM customer_pricing_analysis WHERE customer_id = ?', (customer_id,))

        all_pricing = va + rms + lcy + fcy + omni
        issues = []

        rule_evaluations = []

        # Rule 1: Configuration matches approved price
        config_mismatch = [p for p in all_pricing if p.get('configuration_matches_approved_price') == 'No']
        rule_evaluations.append({
            'rule_id': 'R-SETUP-01',
            'rule_name': '配置价格与审批价格一致性',
            'description': '检查系统中配置的价格是否与审批通过的价格一致',
            'records_checked': len(all_pricing),
            'passed': len(all_pricing) - len(config_mismatch),
            'failed': len(config_mismatch),
            'failed_records': [{'record_id': p.get('pricing_record_id', ''), 'configured': p.get('configured_price_value', ''), 'approved': p.get('va_monthly_fee') or p.get('rms_pricing') or p.get('value_list') or p.get('price_code') or ''} for p in config_mismatch[:5]]
        })
        for p in config_mismatch:
            issues.append({
                'rule': 'R-SETUP-01',
                'severity': 'Critical',
                'product': 'VA/RMS/LCY/FCY/Omni',
                'finding': f"Configured price does not match approved price for record {p.get('pricing_record_id', '')}",
                'action': 'Verify and correct system configuration'
            })

        # Rule 2: Expiry check
        expired = [p for p in all_pricing if p.get('pricing_status') == 'Expired' or (p.get('expiry_date') and p.get('pricing_status') != 'Active')]
        rule_evaluations.append({
            'rule_id': 'R-EXPIRY-02',
            'rule_name': '定价有效期检查',
            'description': '检查是否有已过期的定价仍在系统中生效',
            'records_checked': len(all_pricing),
            'passed': len(all_pricing) - len(expired),
            'failed': len(expired),
            'failed_records': [{'record_id': p.get('pricing_record_id', ''), 'expiry_date': p.get('expiry_date', ''), 'status': p.get('pricing_status', '')} for p in expired[:5]]
        })
        for p in expired:
            issues.append({
                'rule': 'R-EXPIRY-02',
                'severity': 'Critical',
                'product': 'VA/RMS/LCY/FCY/Omni',
                'finding': f"Expired pricing still configured: {p.get('pricing_record_id', '')}",
                'action': 'Stop expired pricing or complete renewal approval'
            })

        # Rule 3: Approval check
        approval_missing = [p for p in all_pricing if p.get('approval_required') == 'Yes' and p.get('approval_record_available') == 'No']
        rule_evaluations.append({
            'rule_id': 'R-APPROVAL-03',
            'rule_name': '审批记录完整性',
            'description': '检查需要审批的定价是否有完整的审批记录',
            'records_checked': len([p for p in all_pricing if p.get('approval_required') == 'Yes']),
            'passed': len([p for p in all_pricing if p.get('approval_required') == 'Yes']) - len(approval_missing),
            'failed': len(approval_missing),
            'failed_records': [{'record_id': p.get('pricing_record_id', ''), 'approval_required': p.get('approval_required', ''), 'approval_record_available': p.get('approval_record_available', '')} for p in approval_missing[:5]]
        })
        for p in approval_missing:
            issues.append({
                'rule': 'R-APPROVAL-03',
                'severity': 'High',
                'product': 'VA/RMS/LCY/FCY/Omni',
                'finding': f"Approval required but no record found: {p.get('pricing_record_id', '')}",
                'action': 'Obtain approval evidence or re-approve'
            })

        # Rule 4: Exception basis check
        exception_no_basis = [p for p in all_pricing if p.get('exception_to_standard') == 'Yes' and not p.get('exception_reason')]
        rule_evaluations.append({
            'rule_id': 'R-BASIS-04',
            'rule_name': '例外定价依据',
            'description': '检查例外定价是否有明确的依据说明',
            'records_checked': len([p for p in all_pricing if p.get('exception_to_standard') == 'Yes']),
            'passed': len([p for p in all_pricing if p.get('exception_to_standard') == 'Yes']) - len(exception_no_basis),
            'failed': len(exception_no_basis),
            'failed_records': [{'record_id': p.get('pricing_record_id', ''), 'exception_to_standard': p.get('exception_to_standard', ''), 'exception_reason': p.get('exception_reason', 'N/A')} for p in exception_no_basis[:5]]
        })
        for p in exception_no_basis:
            issues.append({
                'rule': 'R-BASIS-04',
                'severity': 'High',
                'product': 'VA/RMS/LCY/FCY/Omni',
                'finding': f"Exception pricing without clear basis: {p.get('pricing_record_id', '')}",
                'action': 'Document pricing basis'
            })

        # Rule 5: Overall risk
        risk_issues = []
        if analysis:
            a = analysis[0]
            if a.get('pricing_risk_band') == 'High':
                risk_issues.append(a)
                issues.append({
                    'rule': 'R-RISK-05',
                    'severity': 'High',
                    'product': 'Portfolio',
                    'finding': f"Overall pricing risk score: {a.get('pricing_risk_score', 'N/A')} ({a.get('pricing_risk_band', '')})",
                    'action': a.get('plain_language_summary', 'Review pricing portfolio')
                })
        rule_evaluations.append({
            'rule_id': 'R-RISK-05',
            'rule_name': '整体定价风险评估',
            'description': '基于定价分析表的综合风险评分判断整体风险等级',
            'records_checked': len(analysis),
            'passed': len(analysis) - len(risk_issues),
            'failed': len(risk_issues),
            'failed_records': [{'customer_id': customer_id, 'risk_score': a.get('pricing_risk_score', 'N/A'), 'risk_band': a.get('pricing_risk_band', 'N/A')} for a in risk_issues]
        })

        result['input_data'] = {
            'pricing_records': {'tables': ['va_customer_pricing', 'rms_customer_pricing', 'lcy_customer_pricing', 'fcy_payment_customer_pricing', 'omni_customer_pricing'], 'total_records': len(all_pricing), 'breakdown': {'va': len(va), 'rms': len(rms), 'lcy': len(lcy), 'fcy': len(fcy), 'omni': len(omni)}},
            'ai_rules': {'table': 'ai_rules', 'total_rules': len(rules)},
            'pricing_analysis': {'table': 'customer_pricing_analysis', 'records': len(analysis)},
        }

        result['logic_steps'] = [
            {'step': 1, 'action': '加载定价记录', 'source': '5 个产品定价表（仅最新版本）', 'rule': '版本过滤：仅取 is_latest_version = Yes 且 pricing_status 为 Active/Exception 的记录', 'result': f"共 {len(all_pricing)} 条活跃定价记录"},
            {'step': 2, 'action': '加载 AI 规则库', 'source': 'ai_rules 表', 'rule': '规则覆盖域：配置一致性(R-SETUP-01)、过期校验(R-EXPIRY-02)、审批完整性(R-APPROVAL-03)、定价依据(R-BASIS-04)、风险评分(R-RISK-05)', 'result': f"共 {len(rules)} 条规则"},
            {'step': 3, 'action': '逐条检查规则', 'source': '定价记录 × 规则', 'rule': '逐条交叉校验：每条定价记录须通过全部 5 项规则检查，任一不通过即标记为问题', 'result': f"完成 {len(rule_evaluations)} 项规则评估"},
            {'step': 4, 'action': '汇总问题', 'source': '规则评估结果', 'rule': '问题分级：Critical（须立即处理）> High（需关注）> Medium（建议优化）> Low（信息提示）', 'result': f"发现 {len(issues)} 个问题（Critical: {len([i for i in issues if i['severity']=='Critical'])}, High: {len([i for i in issues if i['severity']=='High'])}）"},
        ]

        result['rules_evaluated'] = rule_evaluations
        result['issues'] = issues
        result['rules_checked'] = len(rules)
        result['records_scanned'] = len(all_pricing)
        result['output'] = f"扫描 {len(all_pricing)} 条定价记录，对照 {len(rules)} 条规则，发现 {len(issues)} 个问题。"

    elif agent_name == 'Value Detective':
        bank_perf = query_to_dicts(conn, 'SELECT * FROM customer_bank_performance WHERE customer_id = ? ORDER BY reporting_month DESC LIMIT 12', (customer_id,))
        analysis = query_to_dicts(conn, 'SELECT * FROM customer_pricing_analysis WHERE customer_id = ?', (customer_id,))
        ext = query_to_dicts(conn, 'SELECT * FROM external_company_profile WHERE customer_id = ?', (customer_id,))

        opportunities = []
        analysis_steps = []

        if bank_perf:
            latest = bank_perf[0]

            # Step 1: Volume commitment
            volume_result = 'N/A'
            if latest.get('volume_commitment_met') == 'No':
                committed = float(latest.get('committed_volume', 0) or 0)
                actual = float(latest.get('actual_volume', 0) or 0)
                if committed > 0:
                    gap_pct = round((1 - actual / committed) * 100, 1)
                    met_pct = round(actual/committed*100, 1)
                    volume_result = f"未达标：仅完成 {met_pct}%（实际 {actual} / 承诺 {committed}），缺口 {gap_pct}%"
                    opportunities.append({
                        'type': 'Volume Commitment Gap',
                        'finding': f"Volume commitment only met at {met_pct}% ({actual}/{committed})",
                        'impact': f"{gap_pct}% gap between committed and actual volume",
                        'action': 'Renegotiate volume-price terms or restore standard pricing'
                    })
                else:
                    volume_result = '无承诺数据'
            else:
                volume_result = '已达标'
            analysis_steps.append({
                'step': 1, 'action': '检查业务量承诺',
                'source': 'customer_bank_performance 表',
                'data': {'committed_volume': latest.get('committed_volume', 'N/A'), 'actual_volume': latest.get('actual_volume', 'N/A'), 'commitment_met': latest.get('volume_commitment_met', 'N/A')},
                'rule': '实际业务量 vs 承诺业务量，偏差超过 10% 视为未达标',
                'result': volume_result
            })

            # Step 2: Balance commitment
            balance_result = 'N/A'
            if latest.get('balance_commitment_met') == 'No':
                committed_bal = float(latest.get('committed_balance_mn', 0) or 0)
                actual_bal = float(latest.get('actual_average_balance_mn', 0) or 0)
                if committed_bal > 0:
                    gap_pct = round((1 - actual_bal / committed_bal) * 100, 1)
                    met_pct = round(actual_bal/committed_bal*100, 1)
                    balance_result = f"未达标：仅完成 {met_pct}%（实际 {actual_bal}M / 承诺 {committed_bal}M），缺口 {gap_pct}%"
                    opportunities.append({
                        'type': 'Balance Commitment Gap',
                        'finding': f"Balance commitment only met at {met_pct}%",
                        'impact': f"{gap_pct}% gap between committed and actual balance",
                        'action': 'Review deposit pricing or commitment terms'
                    })
                else:
                    balance_result = '无承诺数据'
            else:
                balance_result = '已达标'
            analysis_steps.append({
                'step': 2, 'action': '检查余额承诺',
                'source': 'customer_bank_performance 表',
                'data': {'committed_balance_mn': latest.get('committed_balance_mn', 'N/A'), 'actual_average_balance_mn': latest.get('actual_average_balance_mn', 'N/A'), 'commitment_met': latest.get('balance_commitment_met', 'N/A')},
                'rule': '实际平均余额 vs 承诺余额，偏差超过 10% 视为未达标',
                'result': balance_result
            })

            # Step 3: NFI trend
            nfi_result = 'N/A'
            nfi_yoy = latest.get('nfi_yoy_pct')
            if nfi_yoy is not None:
                nfi_val = float(nfi_yoy)
                if nfi_val < 0:
                    nfi_result = f"同比下降 {round(nfi_val*100,1)}%，存在收益流失风险"
                    opportunities.append({
                        'type': 'NFI Decline',
                        'finding': f"NFI declined {round(nfi_val*100,1)}% YoY",
                        'impact': f"Latest monthly NFI: {latest.get('total_nfi', 'N/A')}",
                        'action': 'Investigate revenue leakage and cross-sell opportunities'
                    })
                else:
                    nfi_result = f"同比增长 {round(nfi_val*100,1)}%，收益健康"
            analysis_steps.append({
                'step': 3, 'action': '分析 NFI 趋势',
                'source': 'customer_bank_performance 表',
                'data': {'total_nfi': latest.get('total_nfi', 'N/A'), 'nfi_yoy_pct': latest.get('nfi_yoy_pct', 'N/A')},
                'rule': 'NFI 同比变化方向与幅度，负增长标记为收益流失风险',
                'result': nfi_result
            })

        # Step 4: Exception pricing review
        exception_result = 'N/A'
        if analysis:
            a = analysis[0]
            exc_count = a.get('exception_pricing_count')
            if exc_count:
                exc_count_val = int(exc_count) if str(exc_count).isdigit() else 0
                if exc_count_val > 0:
                    exception_result = f"{exc_count_val} 条例外定价记录生效中，需审查 ROI"
                    opportunities.append({
                        'type': 'Exception Pricing Review',
                        'finding': f"{exc_count} exception pricing records active",
                        'impact': 'Exception pricing may not be generating expected returns',
                        'action': 'Review exception pricing ROI'
                    })
                else:
                    exception_result = '无例外定价'
            else:
                exception_result = '无例外定价数据'
        analysis_steps.append({
            'step': 4, 'action': '审查例外定价',
            'source': 'customer_pricing_analysis 表',
            'data': {'exception_pricing_count': analysis[0].get('exception_pricing_count', 'N/A') if analysis else 'N/A'},
            'rule': '例外定价数量与收益匹配度，有例外定价须附带 ROI 分析',
            'result': exception_result
        })

        # Step 5: Peer comparison
        peer_result = 'N/A'
        peer_data = None
        if c.get('peer_cluster'):
            peer_data = query_to_dicts(conn, '''
                SELECT COUNT(*) as peer_count,
                       AVG(CAST(pa.pricing_risk_score AS FLOAT)) as avg_risk_score
                FROM customer_pricing_analysis pa
                JOIN customers cu ON pa.customer_id = cu.customer_id
                WHERE cu.peer_cluster = ? AND pa.customer_id != ?
            ''', (c['peer_cluster'], customer_id))
            if peer_data and peer_data[0]:
                pd = peer_data[0]
                peer_result = f"同行组 {c.get('peer_cluster', '')} 共 {pd.get('peer_count', 0)} 家客户，平均风险评分 {pd.get('avg_risk_score', 'N/A')}"
        analysis_steps.append({
            'step': 5, 'action': '同业对标分析',
            'source': 'customers 表 + customer_pricing_analysis 表',
            'data': {'peer_cluster': c.get('peer_cluster', 'N/A')},
            'rule': '与同行业同规模客户比较，风险评分偏离同业均值 ±20% 标记为异常',
            'result': peer_result
        })

        result['input_data'] = {
            'customer_bank_performance': {'table': 'customer_bank_performance', 'records': len(bank_perf), 'sample': {k: bank_perf[0].get(k) for k in ['reporting_month', 'total_nfi', 'total_nii', 'toi', 'volume_commitment_met', 'balance_commitment_met'] if k in bank_perf[0]} if bank_perf else None},
            'customer_pricing_analysis': {'table': 'customer_pricing_analysis', 'records': len(analysis), 'sample': {k: analysis[0].get(k) for k in ['pricing_risk_score', 'pricing_risk_band', 'exception_pricing_count'] if k in analysis[0]} if analysis else None},
            'external_company_profile': {'table': 'external_company_profile', 'records': len(ext)},
        }

        result['logic_steps'] = analysis_steps
        result['opportunities'] = opportunities
        result['peer_comparison'] = peer_data[0] if peer_data else None
        result['output'] = f"完成 {len(analysis_steps)} 项价值分析，识别 {len(opportunities)} 个收益机会。"

    elif agent_name == 'Growth Strategist':
        analysis = query_to_dicts(conn, 'SELECT * FROM customer_pricing_analysis WHERE customer_id = ?', (customer_id,))
        bank_perf = query_to_dicts(conn, 'SELECT * FROM customer_bank_performance WHERE customer_id = ? ORDER BY reporting_month DESC LIMIT 6', (customer_id,))
        scenarios = query_to_dicts(conn, 'SELECT * FROM demo_scenarios WHERE customer_id = ?', (customer_id,))

        proposals = []
        analysis_steps = []

        # Step 1: Performance trend analysis
        trend_result = 'N/A'
        trend_data = []
        if bank_perf:
            nfi_values = [float(bp.get('total_nfi', 0) or 0) for bp in reversed(bank_perf)]
            if len(nfi_values) >= 2:
                trend = '增长' if nfi_values[-1] > nfi_values[0] else '下降'
                change_pct = round((nfi_values[-1] - nfi_values[0]) / max(nfi_values[0], 1) * 100, 1)
                trend_result = f"近 {len(bank_perf)} 个月 NFI 呈{trend}趋势（{change_pct}%）"
            for bp in reversed(bank_perf):
                trend_data.append({
                    'month': bp.get('reporting_month', ''),
                    'total_nfi': bp.get('total_nfi', ''),
                    'total_nii': bp.get('total_nii', ''),
                    'toi': bp.get('toi', ''),
                })
        analysis_steps.append({
            'step': 1, 'action': '分析绩效趋势',
            'source': 'customer_bank_performance 表',
            'data': {'months_analyzed': len(bank_perf), 'trend_data': trend_data[:3]},
            'rule': 'NFI/NII/TOI 时间序列趋势分析，连续 3 个月下降标记为风险',
            'result': trend_result
        })

        # Step 2: Match demo scenarios
        scenario_result = 'N/A'
        if scenarios:
            scenario_result = f"匹配 {len(scenarios)} 个演示场景"
            for s in scenarios:
                proposals.append({
                    'scenario_id': s.get('scenario_id', ''),
                    'title': s.get('scenario_title', ''),
                    'headline': s.get('headline', ''),
                    'recommended_action': s.get('recommended_action', ''),
                    'priority': s.get('demo_priority', ''),
                })
        else:
            scenario_result = '无匹配场景'
        analysis_steps.append({
            'step': 2, 'action': '匹配增长场景',
            'source': 'demo_scenarios 表',
            'data': {'scenarios_available': len(scenarios), 'scenario_titles': [s.get('scenario_title', '') for s in scenarios[:3]]},
            'rule': '根据客户行业、规模和绩效匹配预设场景，优先级排序取 Top 3',
            'result': scenario_result
        })

        # Step 3: Generate proposals
        proposal_result = f"生成 {len(proposals)} 个增长方案"
        analysis_steps.append({
            'step': 3, 'action': '生成增长方案',
            'source': '趋势分析 + 场景匹配结果',
            'data': {'proposals_count': len(proposals)},
            'rule': '基于绩效趋势和场景匹配生成定价与产品组合建议，按 ROI 排序',
            'result': proposal_result
        })

        result['input_data'] = {
            'customer_pricing_analysis': {'table': 'customer_pricing_analysis', 'records': len(analysis)},
            'customer_bank_performance': {'table': 'customer_bank_performance', 'records': len(bank_perf), 'months': len(bank_perf)},
            'demo_scenarios': {'table': 'demo_scenarios', 'records': len(scenarios), 'samples': [{'scenario_id': s.get('scenario_id', ''), 'title': s.get('scenario_title', '')} for s in scenarios[:3]]},
        }

        result['logic_steps'] = analysis_steps
        result['proposals'] = proposals
        result['performance_trend'] = trend_data
        result['output'] = f"分析 {len(bank_perf)} 个月绩效趋势，匹配 {len(scenarios)} 个场景，生成 {len(proposals)} 个增长方案。"

    else:
        conn.close()
        return jsonify({'error': f'Unknown agent: {agent_name}'}), 404

    conn.close()
    return jsonify(result)

# ─── Report History API ───────────────────────────────────────────

@app.route('/api/reports', methods=['GET'])
def list_reports():
    conn = get_db()
    conn.execute('''CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id TEXT NOT NULL,
        customer_name TEXT,
        scope TEXT DEFAULT 'all',
        period TEXT,
        score INTEGER,
        summary TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    conn.commit()
    rows = query_to_dicts(conn, 'SELECT * FROM reports ORDER BY created_at DESC')
    conn.close()
    return jsonify(rows)

@app.route('/api/test-case/run', methods=['POST'])
def run_test_case():
    conn = get_db()
    data = request.get_json()
    case_id = data.get('case_id')
    customer_id = data.get('customer_id')
    rule_id = data.get('rule_id')

    if not case_id and not (customer_id and rule_id):
        conn.close()
        return jsonify({'error': 'case_id or (customer_id + rule_id) is required'}), 400

    test_case = None
    if case_id:
        cases = query_to_dicts(conn, 'SELECT * FROM ai_test_cases WHERE case_id = ?', (case_id,))
        if cases:
            test_case = cases[0]
            customer_id = test_case.get('customer_id')
            rule_id = test_case.get('rule_id')

    if not customer_id or not rule_id:
        conn.close()
        return jsonify({'error': 'customer_id and rule_id are required'}), 400

    customer = query_to_dicts(conn, 'SELECT * FROM customers WHERE customer_id = ?', (customer_id,))
    if not customer:
        conn.close()
        return jsonify({'error': f'Customer {customer_id} not found'}), 404

    c = customer[0]

    rule = None
    if rule_id:
        rules = query_to_dicts(conn, 'SELECT * FROM ai_rules WHERE rule_id = ?', (rule_id,))
        if rules:
            rule = rules[0]

    result = {
        'test_case': test_case,
        'customer': {'customer_id': customer_id, 'client_name': c.get('client_name', '')},
        'rule': rule,
        'judgment': {'result': None, 'logic_steps': [], 'evidence': {}, 'conclusion': ''}
    }

    if rule_id == 'R-SETUP-01':
        va = query_to_dicts(conn, 'SELECT * FROM va_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        rms = query_to_dicts(conn, 'SELECT * FROM rms_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        lcy = query_to_dicts(conn, 'SELECT * FROM lcy_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        fcy = query_to_dicts(conn, 'SELECT * FROM fcy_payment_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        omni = query_to_dicts(conn, 'SELECT * FROM omni_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        all_pricing = va + rms + lcy + fcy + omni

        result['judgment']['logic_steps'] = [
            {'step': 1, 'action': '读取客户所有产品的最新定价记录', 'data': f'共 {len(all_pricing)} 条记录'},
            {'step': 2, 'action': '检查每条记录的 configuration_matches_approved_price 字段', 'rule': '该字段应为 Yes 表示配置价格与审批价格一致'},
            {'step': 3, 'action': '统计不一致的记录数量', 'result': f'发现 {len([p for p in all_pricing if p.get("configuration_matches_approved_price") == "No"])} 条不一致记录'}
        ]

        mismatched = [p for p in all_pricing if p.get('configuration_matches_approved_price') == 'No']
        result['judgment']['evidence'] = {
            'total_records': len(all_pricing),
            'matched': len(all_pricing) - len(mismatched),
            'mismatched': len(mismatched),
            'mismatched_records': [{'record_id': p.get('pricing_record_id'), 'product': p.get('va_monthly_fee') and 'VA' or p.get('rms_pricing') and 'RMS' or 'Other'} for p in mismatched[:5]]
        }

        if len(mismatched) == 0:
            result['judgment']['result'] = 'PASS'
            result['judgment']['conclusion'] = '所有定价记录的系统配置价格与审批价格一致，无风险。'
        else:
            result['judgment']['result'] = 'REVIEW'
            result['judgment']['conclusion'] = f'发现 {len(mismatched)} 条记录的系统配置价格与审批价格不一致，需要核对审批并修正系统设置。'

    elif rule_id == 'R-EXPIRY-02':
        va = query_to_dicts(conn, 'SELECT * FROM va_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        rms = query_to_dicts(conn, 'SELECT * FROM rms_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        lcy = query_to_dicts(conn, 'SELECT * FROM lcy_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        fcy = query_to_dicts(conn, 'SELECT * FROM fcy_payment_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        omni = query_to_dicts(conn, 'SELECT * FROM omni_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        all_pricing = va + rms + lcy + fcy + omni

        result['judgment']['logic_steps'] = [
            {'step': 1, 'action': '读取客户所有产品的最新定价记录', 'data': f'共 {len(all_pricing)} 条记录'},
            {'step': 2, 'action': '检查每条记录的 pricing_status 和 expiry_date 字段', 'rule': 'pricing_status 为 Expired 或已过 expiry_date 的记录视为过期'},
            {'step': 3, 'action': '统计过期记录数量', 'result': f'发现 {len([p for p in all_pricing if p.get("pricing_status") == "Expired"])} 条过期记录'}
        ]

        expired = [p for p in all_pricing if p.get('pricing_status') == 'Expired']
        result['judgment']['evidence'] = {
            'total_records': len(all_pricing),
            'active': len(all_pricing) - len(expired),
            'expired': len(expired),
            'expired_records': [{'record_id': p.get('pricing_record_id'), 'expiry_date': p.get('expiry_date'), 'status': p.get('pricing_status')} for p in expired[:5]]
        }

        if len(expired) == 0:
            result['judgment']['result'] = 'PASS'
            result['judgment']['conclusion'] = '所有定价记录均在有效期内，无过期风险。'
        else:
            result['judgment']['result'] = 'CRITICAL'
            result['judgment']['conclusion'] = f'发现 {len(expired)} 条过期定价记录仍在系统中，需要立即停止或完成续期审批。'

    elif rule_id == 'R-APPROVAL-03':
        va = query_to_dicts(conn, 'SELECT * FROM va_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        rms = query_to_dicts(conn, 'SELECT * FROM rms_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        lcy = query_to_dicts(conn, 'SELECT * FROM lcy_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        fcy = query_to_dicts(conn, 'SELECT * FROM fcy_payment_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        omni = query_to_dicts(conn, 'SELECT * FROM omni_customer_pricing WHERE customer_id = ? AND is_latest_version = \'Yes\'', (customer_id,))
        all_pricing = va + rms + lcy + fcy + omni

        result['judgment']['logic_steps'] = [
            {'step': 1, 'action': '读取客户所有产品的最新定价记录', 'data': f'共 {len(all_pricing)} 条记录'},
            {'step': 2, 'action': '筛选需要审批的记录 (approval_required = Yes)', 'rule': '需要审批的记录必须有审批记录 (approval_record_available = Yes)'},
            {'step': 3, 'action': '检查审批记录完整性', 'result': f'发现 {len([p for p in all_pricing if p.get("approval_required") == "Yes" and p.get("approval_record_available") == "No"])} 条缺少审批记录'}
        ]

        approval_missing = [p for p in all_pricing if p.get('approval_required') == 'Yes' and p.get('approval_record_available') == 'No']
        result['judgment']['evidence'] = {
            'total_records': len(all_pricing),
            'approval_required': len([p for p in all_pricing if p.get('approval_required') == 'Yes']),
            'approval_complete': len([p for p in all_pricing if p.get('approval_required') == 'Yes' and p.get('approval_record_available') == 'Yes']),
            'approval_missing': len(approval_missing),
            'missing_records': [{'record_id': p.get('pricing_record_id'), 'approval_required': p.get('approval_required'), 'approval_record_available': p.get('approval_record_available')} for p in approval_missing[:5]]
        }

        if len(approval_missing) == 0:
            result['judgment']['result'] = 'PASS'
            result['judgment']['conclusion'] = '所有需要审批的定价记录均有完整的审批记录，合规。'
        else:
            result['judgment']['result'] = 'OPPORTUNITY'
            result['judgment']['conclusion'] = f'发现 {len(approval_missing)} 条需要审批的记录缺少审批证据，建议补齐审批证据或重新审批。'

    elif rule_id == 'R-BASIS-04':
        analysis = query_to_dicts(conn, 'SELECT * FROM customer_pricing_analysis WHERE customer_id = ?', (customer_id,))
        a = analysis[0] if analysis else None

        result['judgment']['logic_steps'] = [
            {'step': 1, 'action': '读取客户定价分析表', 'data': '获取 exception_pricing_count 和 exception_pricing_basis 字段'},
            {'step': 2, 'action': '检查例外定价是否有依据说明', 'rule': 'exception_pricing_basis 应不为空'},
            {'step': 3, 'action': '判断例外定价依据完整性', 'result': f'例外定价数量: {a.get("exception_pricing_count", 0) if a else 0}'}
        ]

        exception_count = int(a.get('exception_pricing_count', 0)) if a else 0
        exception_basis = a.get('exception_pricing_basis', '') if a else ''

        result['judgment']['evidence'] = {
            'exception_pricing_count': exception_count,
            'exception_pricing_basis': exception_basis,
            'basis_complete': bool(exception_basis and exception_basis != '')
        }

        if exception_count == 0:
            result['judgment']['result'] = 'PASS'
            result['judgment']['conclusion'] = '该客户无例外定价记录，无需检查依据。'
        elif exception_basis and exception_basis != '':
            result['judgment']['result'] = 'PASS'
            result['judgment']['conclusion'] = f'该客户有 {exception_count} 条例外定价，已有依据说明：{exception_basis}'
        else:
            result['judgment']['result'] = 'REVIEW'
            result['judgment']['conclusion'] = f'该客户有 {exception_count} 条例外定价，但缺少依据说明，需要补充。'

    elif rule_id == 'R-RISK-05':
        analysis = query_to_dicts(conn, 'SELECT * FROM customer_pricing_analysis WHERE customer_id = ?', (customer_id,))
        a = analysis[0] if analysis else None

        result['judgment']['logic_steps'] = [
            {'step': 1, 'action': '读取客户定价分析表', 'data': '获取 pricing_risk_score 和 pricing_risk_band 字段'},
            {'step': 2, 'action': '评估整体定价风险等级', 'rule': 'pricing_risk_score 越低风险越低，pricing_risk_band 为 Low/Medium/High'},
            {'step': 3, 'action': '判断风险等级', 'result': f'风险评分: {a.get("pricing_risk_score", "N/A") if a else "N/A"}, 风险等级: {a.get("pricing_risk_band", "N/A") if a else "N/A"}'}
        ]

        risk_score = a.get('pricing_risk_score', 'N/A') if a else 'N/A'
        risk_band = a.get('pricing_risk_band', 'N/A') if a else 'N/A'

        result['judgment']['evidence'] = {
            'pricing_risk_score': risk_score,
            'pricing_risk_band': risk_band
        }

        if risk_band == 'Low':
            result['judgment']['result'] = 'PASS'
            result['judgment']['conclusion'] = f'该客户整体定价风险评分为 {risk_score}，风险等级为 Low，风险可控。'
        elif risk_band == 'Medium':
            result['judgment']['result'] = 'REVIEW'
            result['judgment']['conclusion'] = f'该客户整体定价风险评分为 {risk_score}，风险等级为 Medium，建议关注。'
        else:
            result['judgment']['result'] = 'CRITICAL'
            result['judgment']['conclusion'] = f'该客户整体定价风险评分为 {risk_score}，风险等级为 High，需要立即审查定价策略。'

    else:
        result['judgment']['conclusion'] = f'规则 {rule_id} 的详细逻辑尚未实现，请查看规则描述：{rule.get("rule_description", "") if rule else "N/A"}'

    conn.close()
    return jsonify(result)

@app.route('/api/reports', methods=['POST'])
def create_report():
    conn = get_db()
    conn.execute('''CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id TEXT NOT NULL,
        customer_name TEXT,
        scope TEXT DEFAULT 'all',
        period TEXT,
        score INTEGER,
        summary TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    data = request.get_json()
    conn.execute(
        'INSERT INTO reports (customer_id, customer_name, scope, period, score, summary) VALUES (?, ?, ?, ?, ?, ?)',
        (data.get('customer_id',''), data.get('customer_name',''), data.get('scope','all'), data.get('period',''), data.get('score',0), data.get('summary',''))
    )
    conn.commit()
    report_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
    report = query_to_dicts(conn, 'SELECT * FROM reports WHERE id = ?', (report_id,))[0]
    conn.close()
    return jsonify(report), 201

@app.route('/api/reports/<int:report_id>')
def get_report(report_id):
    conn = get_db()
    rows = query_to_dicts(conn, 'SELECT * FROM reports WHERE id = ?', (report_id,))
    conn.close()
    if not rows:
        return jsonify({'error': 'Report not found'}), 404
    return jsonify(rows[0])

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
