#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Gắn ID chuẩn vào providerProvinces / providerDistricts / providerWards
Dùng RapidFuzz. Dùng đúng tên cột DB của bạn.
"""

import os
from dotenv import load_dotenv
import mysql.connector
from rapidfuzz import fuzz, process

load_dotenv()

# ─────────── DB connect ───────────
cnx = mysql.connector.connect(
    host     = os.getenv("DB_HOST"),
    port     = int(os.getenv("DB_PORT", 3306)),
    user     = os.getenv("DB_USER"),
    password = os.getenv("DB_PASS"),
    database = os.getenv("DB_NAME"),
    charset  = "utf8mb4",
)
cur = cnx.cursor(dictionary=True)

PROVIDER_ID = 3  # thay ID đúng với provider VTP của bạn

# ─────────── helpers ───────────
def clean_prefix(name: str) -> str:
    prefixes = [
        "TT ", "TX ", "KCN ", "KCN -", "KHU CÔNG NGHIỆP ",
        "KHU CN ", "ẤP ", "CHỢ ", "PHƯỜNG ", "XÃ ", "THỊ TRẤN "
    ]
    u = name.upper()
    for p in prefixes:
        if u.startswith(p):
            return name[len(p):].strip()
    return name.strip()

def match_one(needle, pool, threshold):
    _m, score, idx = process.extractOne(needle, pool, scorer=fuzz.ratio)
    return (idx, score) if score >= threshold else (None, score)

# ─────────── Xoá dữ liệu cũ ───────────
print("🧹 Xoá dữ liệu provider* trước khi mapping...")
cur.execute("DELETE FROM providerProvinces")
cur.execute("DELETE FROM providerDistricts")
cur.execute("DELETE FROM providerWards")
cnx.commit()

# ─────────── Giả lập dữ liệu provider* (tuỳ hệ thống bạn thì thay đoạn này) ───────────
# Ở đây nên import lại dữ liệu từ API ViettelPost hoặc file backup

# ─────────── Mapping Province ───────────
print("🔍 Mapping province...")
cur.execute("SELECT id, name FROM provinces")
provinces = cur.fetchall()
prov_names = [p["name"] for p in provinces]

cur.execute("SELECT providerProvinceName FROM providerProvinces")

prov_rows = cur.fetchall()

for r in prov_rows:
    idx, score = match_one(r["providerProvinceName"], prov_names, 70)
    if idx is not None:
        cur.execute("UPDATE providerProvinces SET provinceId=%s WHERE id=%s", (provinces[idx]["id"], r["id"]))
    else:
        print(f"[❌ Province] {r['providerProvinceName']} ({score})")

# ─────────── Mapping District ───────────
print("🔍 Mapping district...")
cur.execute("SELECT id, name FROM districts")
districts = cur.fetchall()
dist_names = [d["name"] for d in districts]

cur.execute("SELECT providerId, districtId, providerDistrictName FROM providerDistricts WHERE providerId = %s", (PROVIDER_ID,))
dist_rows = cur.fetchall()

for r in dist_rows:
    idx, score = match_one(r["providerDistrictName"], dist_names, 75)
    if idx is not None:
        cur.execute("""
            UPDATE providerDistricts
            SET localDistrictId = %s
            WHERE providerId = %s AND districtId = %s
        """, (districts[idx]["id"], r["providerId"], r["districtId"]))
    else:
        print(f"[❌ District] {r['providerDistrictName']} ({score})")

# ─────────── Mapping Ward ───────────
print("🔍 Mapping ward...")
cur.execute("SELECT id, name FROM wards")
wards = cur.fetchall()
ward_names = [clean_prefix(w["name"]).upper() for w in wards]

cur.execute("SELECT providerId, wardId, providerWardName FROM providerWards WHERE providerId = %s", (PROVIDER_ID,))
ward_rows = cur.fetchall()

for r in ward_rows:
    cleaned = clean_prefix(r["providerWardName"]).upper()
    idx, score = match_one(cleaned, ward_names, 83)
    if idx is not None:
        cur.execute("""
            UPDATE providerWards
            SET localWardId = %s
            WHERE providerId = %s AND wardId = %s
        """, (wards[idx]["id"], r["providerId"], r["wardId"]))
    else:
        print(f"[❌ Ward] {r['providerWardName']} ({score})")

# ─────────── Done ───────────
cnx.commit()
cur.close()
cnx.close()
print("🎉 Mapping hoàn tất không lỗi duplicate!")
