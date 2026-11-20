# Anggaranku 7.0 — Modernized Modular Source

Source ini disusun dari 9 referensi pengguna pada 19 Oktober 2026. File referensi asli tidak ditimpa.

## File

- `Code.gs`: controller, routing, dashboard, modul, dan mutasi finansial.
- `Config.gs`: konfigurasi, katalog, schema, dan module map.
- `Core_Audit.gs`: audit append-only.
- `Core_Auth.gs`: hash PIN dan session.
- `Core_Utils.gs`: spreadsheet access, cache, normalisasi, locking, dan formatter server.
- `Install.gs`: menu spreadsheet dan first-run setup.
- `Branding.gs`: logo base64.
- `Index.html`: frontend SPA responsive.
- `appsscript.json`: manifest V8 + Drive Advanced Service v2.

## Deployment

1. Buat atau buka project Google Apps Script yang terhubung ke spreadsheet keluarga.
2. Salin semua file `.gs`, `Index.html`, dan `appsscript.json` ke project.
3. Jalankan `installAnggaranku()` sekali dari Apps Script Editor.
4. Dari menu spreadsheet, jalankan **Set Ayah & Bunda PINs**.
5. Deploy sebagai Web app dengan execute as **User deploying** dan akses sesuai kebutuhan keluarga.
6. Uji login, dashboard, setiap modul, audit trail, Void, export, upload OCR, harga emas, dan mobile layout sebelum memakai data produksi.

## Prinsip kompatibilitas

Nama sheet dan kolom dipertahankan. Record tidak dihapus secara fisik; perubahan memakai status VOID atau status lifecycle terkait. Perubahan berikutnya sebaiknya dilakukan melalui migrasi idempotent dan tetap diaudit.
