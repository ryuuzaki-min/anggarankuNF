# AnggarankuNF

AnggarankuNF adalah aplikasi web keuangan keluarga berbasis Google Apps Script (GAS) dan Google Sheets. Source GAS terbaru berada di [`gas/`](gas/).

## Struktur

- `gas/` — backend GAS, UI `Index.html`, konfigurasi dan manifest.
- `android-webview/` — wrapper Android native ringan yang membuka deployment GAS melalui WebView.
- `audit/` — laporan audit statis update branding, UI, warning bar, dan wrapper APK.

## Menjalankan GAS

1. Buat atau pilih project Google Apps Script yang terhubung ke Google Sheets.
2. Salin isi folder `gas/` ke project Apps Script.
3. Periksa `gas/Config.gs` dan sesuaikan `spreadsheetId` sesuai spreadsheet Anda.
4. Jalankan fungsi instalasi sesuai dokumentasi source, lalu deploy sebagai Web app.
5. Set URL deployment pada `android-webview/app/build.gradle` melalui `ANGGARANKU_WEB_URL` atau lewat `-PANGGARANKU_WEB_URL=...`.

## Build APK

Jalur yang dipilih untuk rilis awal adalah WebView karena mempertahankan satu codebase GAS/Sheets dan membutuhkan perubahan minimal. Android SDK/Gradle diperlukan untuk menghasilkan APK; lihat [`android-webview/README.md`](android-webview/README.md).

Update visual terbaru memakai nama **Anggaranku 7.0**, logo keluarga yang sama pada sidebar/topbar dan ikon APK, transisi antar-modul, serta suppression warning bar host Apps Script pada source GAS dan runtime WebView. Laporan audit tersedia di [`audit/AUDIT_REPORT.md`](audit/AUDIT_REPORT.md).

> Jangan commit token, PIN, kredensial Google, atau URL deployment privat ke repository publik. `spreadsheetId` di source hanya merupakan identifier; akses data tetap dikendalikan oleh Apps Script dan Google Sheets.
