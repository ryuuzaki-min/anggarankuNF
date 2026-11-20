# AnggarankuNF Android WebView

Wrapper Android ini membuka deployment Google Apps Script AnggarankuNF menggunakan WebView. Pendekatan ini dipilih sebagai build APK pertama karena UI dan backend tetap bersumber dari deployment GAS/Google Sheets.

## Konfigurasi URL

Set URL deployment sebelum build:

```bash
./gradlew :app:assembleRelease -PANGGARANKU_WEB_URL="https://script.google.com/macros/s/DEPLOYMENT_ID/exec"
```

Atau ubah nilai default `ANGGARANKU_WEB_URL` di `app/build.gradle` untuk build internal. Jangan memasukkan URL dengan credential atau token.

## Build lokal

Prasyarat: JDK 17+, Android SDK, Android Build Tools, dan Gradle wrapper. Di komputer yang memiliki Android SDK:

```bash
./gradlew :app:assembleDebug -PANGGARANKU_WEB_URL="https://script.google.com/macros/s/DEPLOYMENT_ID/exec"
```

APK debug akan berada di `app/build/outputs/apk/debug/`.

## Catatan rilis

- APK ini tidak mengandung backend atau data; ia hanya mengakses deployment GAS.
- Pastikan deployment GAS memakai HTTPS dan aksesnya sesuai kebijakan aplikasi.
- Untuk rilis Play Store, tambahkan signing key melalui secret store/CI, jangan commit ke repository.
- Jalur Expo/React Native tetap dapat dibuat sebagai fase berikutnya jika dibutuhkan akses native atau offline; untuk kebutuhan saat ini WebView menjaga kompatibilitas penuh dengan source GAS terbaru.
