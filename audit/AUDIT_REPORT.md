# Anggaranku 7.0 Update Audit

Generated: 2026-11-20

## Scope

Static audit of GAS source, UI branding, Android WebView wrapper, warning-bar suppression, build configuration, and basic secret hygiene.

## Results

- **PASS** — GAS manifest JSON: gas/appsscript.json valid
- **PASS** — Android manifest XML: Manifest valid XML
- **PASS** — App title: Title marker present
- **PASS** — Warning bar suppression: CSS + MutationObserver suppression present
- **PASS** — Professional navigation transition: Content animation and reduced-motion fallback present
- **PASS** — Topbar logo: Brand logo present in topbar
- **PASS** — Android app label: Android label matches brand
- **PASS** — Android app icon: Logo asset referenced and present
- **PASS** — WebView warning suppression: Runtime suppression present
- **PASS** — Secret scan: No private key/API token patterns found
- **PASS** — Deployment configured: APK default points to configured GAS deployment
- **PASS** — Brand asset: Branding.gs base64 is PNG

## Build status

- Local sandbox does not contain Android SDK/Gradle/JDK compiler tooling.
- Hosted GitHub Actions build passed for commit `817549ae2d55bbf75b940e93efda5d2e316a624f` in run [44672658496](https://github.com/ryuuzaki-min/anggarankuNF/actions/runs/44672658496).
- The APK loads the configured GAS deployment and applies a runtime CSS/JS suppression for the host warning bar.

## Known deployment requirement

The GAS source changes affect the live web deployment only after the updated source is copied into the Apps Script project and redeployed. The Android wrapper independently suppresses the warning bar after page load, including when the remote deployment has not yet been updated.

## Files reviewed

- `.github/workflows/build-apk.yml`
- `.gitignore`
- `README.md`
- `android-webview/README.md`
- `android-webview/app/build.gradle`
- `android-webview/app/proguard-rules.pro`
- `android-webview/app/src/main/AndroidManifest.xml`
- `android-webview/app/src/main/java/id/anggaranku/nf/MainActivity.java`
- `android-webview/app/src/main/res/drawable/anggaranku_logo.png`
- `android-webview/app/src/main/res/values/colors.xml`
- `android-webview/app/src/main/res/values/styles.xml`
- `android-webview/build.gradle`
- `android-webview/gradle.properties`
- `android-webview/gradle.properties.example`
- `android-webview/settings.gradle`
- `artifacts/app-debug.apk`
- `gas/Branding.gs`
- `gas/Code.gs`
- `gas/Config.gs`
- `gas/Core_Audit.gs`
- `gas/Core_Auth.gs`
- `gas/Core_Utils.gs`
- `gas/Index.html`
- `gas/Install.gs`
- `gas/README.md`
- `gas/appsscript.json`
