#!/usr/bin/env python3
import sqlite3
import openpyxl
import os
import sys

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'valuepilot.db')
XLSX_PATH = os.environ.get('XLSX_PATH', '/tmp/ValuePilot-Mock-Data.xlsx')

def import_sheet(ws, conn, table_name, headers=None):
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return 0
    if headers is None:
        headers = rows[0]
        data_rows = rows[1:]
    else:
        data_rows = rows

    headers = [str(h).strip().replace(' ', '_').replace('&', '_').replace('/', '_') if h else f'col_{i}' for i, h in enumerate(headers)]
    col_defs = ', '.join(f'"{h}" TEXT' for h in headers)
    conn.execute(f'DROP TABLE IF EXISTS "{table_name}"')
    conn.execute(f'CREATE TABLE "{table_name}" ({col_defs})')

    placeholders = ', '.join('?' for _ in headers)
    insert_sql = f'INSERT INTO "{table_name}" VALUES ({placeholders})'

    count = 0
    for row in data_rows:
        if all(v is None for v in row):
            continue
        values = []
        for v in row:
            if v is None:
                values.append(None)
            elif hasattr(v, 'strftime'):
                values.append(v.strftime('%Y-%m-%d'))
            else:
                values.append(str(v))
        conn.execute(insert_sql, values)
        count += 1

    conn.commit()
    print(f"  {table_name}: {count} rows imported")
    return count

def main():
    print(f"Importing {XLSX_PATH} into {DB_PATH}")
    wb = openpyxl.load_workbook(XLSX_PATH, read_only=True)
    conn = sqlite3.connect(DB_PATH)

    sheet_table_map = {
        'Customers': 'customers',
        'Accounts': 'accounts',
        'VA & RMS': 'va_rms',
        'LCY Schemes': 'lcy_schemes',
        'LCY Assignments': 'lcy_assignments',
        'FX Schemes': 'fx_schemes',
        'FX Assignments': 'fx_assignments',
        'Omni Plans': 'omni_plans',
        'Omni Assignments': 'omni_assignments',
        'Tariff Catalog': 'tariff_catalog',
        'Other Pricing': 'other_pricing',
        'RMB Simulations': 'rmb_simulations',
        'FX Simulations': 'fx_simulations',
        'Omni Simulations': 'omni_simulations',
        'AI Features': 'ai_features',
        'Eval Ground Truth': 'eval_ground_truth',
    }

    for sheet_name, table_name in sheet_table_map.items():
        if sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            import_sheet(ws, conn, table_name)

    if 'AI Rules & Handoffs' in wb.sheetnames:
        ws = wb['AI Rules & Handoffs']
        rows = list(ws.iter_rows(values_only=True))
        header_row_idx = None
        for i, row in enumerate(rows):
            if row and row[0] == 'step':
                header_row_idx = i
                break
        if header_row_idx is not None:
            headers = rows[header_row_idx]
            data_rows = [r for r in rows[header_row_idx+1:] if any(v is not None for v in r)]
            headers = [str(h).strip().replace(' ', '_').replace('&', '_') if h else f'col_{i}' for i, h in enumerate(headers)]
            col_defs = ', '.join(f'"{h}" TEXT' for h in headers)
            conn.execute('DROP TABLE IF EXISTS "ai_rules_handoffs"')
            conn.execute(f'CREATE TABLE "ai_rules_handoffs" ({col_defs})')
            placeholders = ', '.join('?' for _ in headers)
            for row in data_rows:
                values = [str(v) if v is not None else None for v in row]
                conn.execute(f'INSERT INTO "ai_rules_handoffs" VALUES ({placeholders})', values)
            conn.commit()
            print(f"  ai_rules_handoffs: {len(data_rows)} rows imported")

    conn.close()
    wb.close()
    print(f"\nDone. Database: {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
    print(f"\nTables ({len(tables)}):")
    for (tname,) in tables:
        count = conn.execute(f'SELECT COUNT(*) FROM "{tname}"').fetchone()[0]
        print(f"  {tname}: {count} rows")
    conn.close()

if __name__ == '__main__':
    main()
