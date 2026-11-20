#!/usr/bin/env python3
"""Add more mock data to the ValuePilot database for demo purposes."""
import sqlite3
import random
from datetime import datetime, timedelta

DB_PATH = '/opt/valuepilot/valuepilot.db'

def add_more_customers(conn):
    """Add 50 more customers with diverse profiles."""
    industries = ['金融科技', '生物医药', '智能制造', '新能源', '消费升级', '企业服务', '教育科技', '现代农业']
    regions = ['上海', '北京', '广东', '浙江', '江苏', '四川', '湖北', '山东']
    size_bands = ['小型', '中型', '大型', '超大型']

    customers = []
    for i in range(50):
        cust_id = f'AAX-{200000 + i}'
        group_id = f'GRP-{(i // 5) + 100:06d}'
        industry = random.choice(industries)
        region = random.choice(regions)
        size = random.choice(size_bands)
        capital = round(random.uniform(10, 5000), 1)
        revenue = round(capital * random.uniform(3, 15), 1)
        cross_border = random.choice([0, 1])
        peer_cluster = f'{industry}-{size}'
        data_date = '2026-10-14'

        name = f'{region}{random.choice(["浦东","南山","高新","天河","滨江","光谷","前海","江北"])}{random.choice(["远帆","新澜","辰光","启岳","恒川","瀚宇","青禾","锐程"])}{random.choice(["贸易","科技","制造","物流","医药","电子","能源","咨询"])}有限公司'

        customers.append((cust_id, group_id, name, industry, size, region, capital, revenue, cross_border, peer_cluster, data_date))

    conn.executemany('''
        INSERT INTO customers (customer_id, group_id, client_name, industry, size_band, region,
                              registered_capital_mn_cny, annual_revenue_mn_cny, cross_border_flag,
                              peer_cluster, data_as_of)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', customers)
    print(f"Added {len(customers)} customers")

def add_more_accounts(conn):
    """Add 100 more accounts."""
    currencies = ['CNY', 'USD', 'HKD', 'EUR', 'SGD']
    statuses = ['ACTIVE', 'ACTIVE', 'ACTIVE', 'SUSPENDED']

    # Get existing customer IDs
    customers = conn.execute('SELECT customer_id FROM customers ORDER BY RANDOM() LIMIT 100').fetchall()
    accounts = []
    for i, (cust_id,) in enumerate(customers):
        acc_num = f'{200 + i}-{800000000 + i * 7919}'
        acc_name = f'账户{i+1}'
        currency = random.choice(currencies)
        status = random.choice(statuses)
        open_date = (datetime(2020, 1, 1) + timedelta(days=i*3)).strftime('%Y-%m-%d')
        accounts.append((acc_num, cust_id, acc_name, currency, status, open_date))

    conn.executemany('''
        INSERT INTO accounts (account_number, customer_id, account_name, currency, account_status, open_date)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', accounts)
    print(f"Added {len(accounts)} accounts")

def add_more_simulations(conn):
    """Add 200 more RMB, FX, and Omni simulations."""
    # RMB simulations
    accounts = conn.execute('SELECT account_number FROM accounts ORDER BY RANDOM() LIMIT 200').fetchall()
    lcy_schemes = conn.execute('SELECT list_id FROM lcy_schemes').fetchall()

    rmb_sims = []
    for i, (acc_num,) in enumerate(accounts):
        tx_id = f'LCYTX-{300000 + i}'
        list_id = random.choice(lcy_schemes)[0] if lcy_schemes else 'ABC LCY01'
        tx_date = (datetime(2026, 7, 1) + timedelta(days=i)).strftime('%Y-%m-%d')
        amount = round(random.uniform(1000, 500000), 2)
        std_fee = round(amount * 0.001, 2)
        applied_fee = round(std_fee * random.uniform(0.5, 1.0), 2)
        discount = round(std_fee - applied_fee, 2)
        within_std = 1 if applied_fee <= std_fee else 0
        rmb_sims.append((tx_id, acc_num, list_id, tx_date, amount, std_fee, applied_fee, discount, within_std))

    conn.executemany('''
        INSERT INTO rmb_simulations (transaction_id, account_number, list_id, transaction_date,
                                    amount_cny, standard_fee, applied_fee, discount_amount, fee_within_standard)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', rmb_sims)
    print(f"Added {len(rmb_sims)} RMB simulations")

    # FX simulations
    customers = conn.execute('SELECT customer_id FROM customers ORDER BY RANDOM() LIMIT 200').fetchall()
    fx_codes = conn.execute('SELECT price_code FROM fx_schemes').fetchall()

    fx_sims = []
    for i, (cust_id,) in enumerate(customers):
        tx_id = f'FXTX-{300000 + i}'
        acc_num = f'{200 + i}-{800000000 + i * 7919}'
        price_code = random.choice(fx_codes)[0] if fx_codes else 'A0'
        direction = random.choice(['IN', 'OUT'])
        tx_date = (datetime(2026, 7, 1) + timedelta(days=i)).strftime('%Y-%m-%d')
        amount = round(random.uniform(10000, 1000000), 2)
        std_comm = round(amount * 0.001, 2)
        std_total = round(std_comm + random.uniform(50, 200), 2)
        applied_total = round(std_total * random.uniform(0.6, 1.0), 2)
        within_std = 1 if applied_total <= std_total else 0
        fx_sims.append((tx_id, cust_id, acc_num, price_code, direction, tx_date, amount, std_comm, std_total, applied_total, within_std))

    conn.executemany('''
        INSERT INTO fx_simulations (transaction_id, customer_id, account_number, price_code, direction,
                                   transaction_date, amount_cny_equivalent, standard_commission,
                                   standard_total_fee, applied_total_fee, fee_within_standard)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', fx_sims)
    print(f"Added {len(fx_sims)} FX simulations")

    # Omni simulations
    merchants = conn.execute('SELECT merchant_id, customer_id FROM omni_assignments ORDER BY RANDOM() LIMIT 200').fetchall()
    omni_plans = conn.execute('SELECT plan_code FROM omni_plans').fetchall()

    omni_sims = []
    for i, (merch_id, cust_id) in enumerate(merchants):
        usage_month = (datetime(2026, 1, 1) + timedelta(days=i*30)).strftime('%Y-%m-%d')
        plan_code = random.choice(omni_plans)[0] if omni_plans else '0.0.0.1'
        tx_count = random.randint(10, 500)
        std_fee = round(tx_count * 5, 2)
        applied_fee = round(std_fee * random.uniform(0.4, 0.9), 2)
        within_std = 1 if applied_fee <= std_fee else 0
        omni_sims.append((usage_month, merch_id, cust_id, plan_code, tx_count, std_fee, applied_fee, within_std))

    conn.executemany('''
        INSERT INTO omni_simulations (usage_month, merchant_id, customer_id, plan_code,
                                     transaction_count, standard_fee, applied_fee, fee_within_standard)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', omni_sims)
    print(f"Added {len(omni_sims)} Omni simulations")

def main():
    conn = sqlite3.connect(DB_PATH)
    print(f"Adding more mock data to {DB_PATH}...")

    add_more_customers(conn)
    add_more_accounts(conn)
    add_more_simulations(conn)

    conn.commit()

    # Print summary
    tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
    print(f"\nDatabase summary ({len(tables)} tables):")
    for (tname,) in tables:
        count = conn.execute(f'SELECT COUNT(*) FROM "{tname}"').fetchone()[0]
        print(f"  {tname}: {count} rows")

    conn.close()

if __name__ == '__main__':
    main()
