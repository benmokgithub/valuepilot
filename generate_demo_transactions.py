#!/usr/bin/env python3
"""Generate explicitly labelled demo transactions from ValuePilot monthly totals."""
import json
import random
import sqlite3
from decimal import Decimal
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / 'valuepilot.db'
DATA_PATH = BASE_DIR / 'static' / 'v2' / 'data.js'
DATA_PREFIX = 'window.VP_DATA='
DATA_SOURCE = 'SIMULATED_DEMO_NOT_REAL'
KEYWORD_PLAN = {
    'CUST000001': ['supplier', 'payroll', 'tax'],
    'CUST000002': ['payroll', 'reimbursement', 'supplier'],
    'CUST000003': ['payroll', 'reimbursement', 'tax'],
    'CUST000004': ['supplier', 'reimbursement', 'payroll'],
    'CUST000005': ['payroll', 'supplier', 'tax'],
    'CUST000006': ['reimbursement', 'supplier', 'payroll'],
    'CUST000007': ['reimbursement', 'supplier', 'payroll'],
    'CUST000008': ['supplier', 'payroll', 'tax'],
    'CUST000009': ['reimbursement', 'supplier', 'payroll'],
    'CUST000010': ['supplier', 'tax', 'payroll'],
    'CUST000011': ['reimbursement', 'supplier', 'payroll'],
    'CUST000012': ['supplier', 'payroll', 'tax'],
    'CUST000013': ['supplier', 'payroll', 'tax'],
    'CUST000014': ['supplier', 'payroll', 'tax'],
    'CUST000015': ['supplier', 'reimbursement', 'payroll'],
    'CUST000016': ['supplier', 'payroll', 'tax'],
    'CUST000017': ['supplier', 'payroll', 'tax'],
    'CUST000018': ['supplier', 'payroll', 'reimbursement'],
    'CUST000019': ['supplier', 'payroll', 'tax'],
    'CUST000020': ['supplier', 'payroll', 'tax'],
}
NARRATIVES = {
    'payroll': '工资（模拟演示）',
    'reimbursement': '报销（模拟演示）',
    'tax': '税款（模拟演示）',
    'supplier': '货款（模拟演示）',
}


def split_amount(total, count, rng):
    total_cents = int((Decimal(str(total)) * 100).to_integral_value())
    if total_cents < count:
        raise ValueError('Monthly amount is too small to create positive demo rows')
    weights = [rng.uniform(0.5, 1.5) for _ in range(count)]
    weight_sum = sum(weights)
    raw_shares = [total_cents * weight / weight_sum for weight in weights]
    shares = [int(value) for value in raw_shares]
    remainder = total_cents - sum(shares)
    order = sorted(range(count), key=lambda i: raw_shares[i] - shares[i], reverse=True)
    for index in order[:remainder]:
        shares[index] += 1
    return [value / 100 for value in shares]


def load_customers():
    text = DATA_PATH.read_text(encoding='utf-8').strip()
    if not text.startswith(DATA_PREFIX):
        raise ValueError('Unexpected data.js format')
    payload = json.loads(text[len(DATA_PREFIX):].rstrip(';'))
    return payload['customers']


def main():
    customers = load_customers()
    conn = sqlite3.connect(DB_PATH)
    conn.execute('DROP TABLE IF EXISTS demo_transactions')
    conn.execute('''
        CREATE TABLE demo_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id TEXT NOT NULL UNIQUE,
            customer_id TEXT NOT NULL,
            customer_name TEXT NOT NULL,
            transaction_date TEXT NOT NULL,
            source_month TEXT NOT NULL,
            direction TEXT NOT NULL,
            counterparty_name TEXT NOT NULL,
            counterparty_bank TEXT NOT NULL,
            amount REAL NOT NULL,
            currency TEXT NOT NULL,
            narrative TEXT NOT NULL,
            is_demo INTEGER NOT NULL DEFAULT 1 CHECK (is_demo = 1),
            data_source TEXT NOT NULL DEFAULT 'SIMULATED_DEMO_NOT_REAL'
        )
    ''')
    conn.execute('CREATE INDEX idx_demo_transactions_customer_month ON demo_transactions(customer_id, source_month)')

    total_rows = 0
    for customer_index, customer in enumerate(customers):
        templates = customer.get('cp') or []
        if not templates:
            templates = [{'name': '模拟供应商', 'bank': '模拟银行'}]
        purposes = KEYWORD_PLAN.get(customer['id'], ['supplier'])
        customer_rows = 0
        for month_index, month_row in enumerate(customer.get('pay') or []):
            month = month_row['month']
            count = int(month_row.get('cnt') or 0)
            if count <= 0 or float(month_row.get('amt') or 0) <= 0:
                continue
            rng = random.Random(f"{customer['id']}-{month}")
            amounts = split_amount(month_row['amt'], count, rng)
            for index, amount in enumerate(amounts):
                template = templates[(index + month_index) % len(templates)]
                counterparty = f"{template.get('name') or '模拟供应商'}（模拟）"
                bank = f"{template.get('bank') or '模拟银行'}（模拟）"
                narrative = '货款（模拟演示）'
                if index == 0:
                    counterparty = customer['name']
                    bank = f"模拟他行{customer_index % 5 + 1}"
                    purpose = purposes[(month_index + customer_index) % len(purposes)]
                    narrative = NARRATIVES[purpose]
                day = (index * 7 + customer_index + month_index) % 28 + 1
                transaction_id = f"SIM-{customer['id']}-{month.replace('-', '')}-{index + 1:04d}"
                conn.execute('''
                    INSERT INTO demo_transactions (
                        transaction_id, customer_id, customer_name, transaction_date,
                        source_month, direction, counterparty_name, counterparty_bank,
                        amount, currency, narrative, is_demo, data_source
                    ) VALUES (?, ?, ?, ?, ?, 'OUT', ?, ?, ?, ?, ?, 1, ?)
                ''', (
                    transaction_id, customer['id'], customer['name'],
                    f'{month}-{day:02d}', month, counterparty, bank, amount,
                    month_row.get('ccy') or 'CNY', narrative, DATA_SOURCE,
                ))
                customer_rows += 1
        total_rows += customer_rows
        print(f"{customer['id']}: {customer_rows} demo rows")

    conn.commit()
    count = conn.execute('SELECT COUNT(*) FROM demo_transactions').fetchone()[0]
    conn.close()
    print(f'Total: {count} explicitly labelled demo rows in {DB_PATH}')


if __name__ == '__main__':
    main()
