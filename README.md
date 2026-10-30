# RuangChat React → Android APK (GitHub Actions)

ZIP ini khusus frontend React/Vite dan workflow untuk membangun APK Android. Server API/WebSocket ada di ZIP terpisah `RuangChat-server-cloudflare.zip`.

## Cara build APK
1. Buat repository GitHub baru dan upload isi ZIP ini (folder `.github/workflows` harus ikut ter-upload).
2. Jalankan ZIP server di Pterodactyl/Linux dengan `npm install`, lalu startup `npm start`. Tunggu sampai console menampilkan URL `https://....trycloudflare.com`.
3. Di GitHub repository, buka **Actions → Build RuangChat APK → Run workflow**.
4. Isi `api_base_url` dengan URL HTTPS yang muncul dari server, contoh `https://nama-acak.trycloudflare.com`. Jangan tambahkan `/ws` atau garis miring di belakang.
5. Jalankan workflow. Setelah selesai, buka run workflow → **Artifacts** → **RuangChat-APK** untuk mengunduh `app-debug.apk`.

## Penting
- APK memakai URL server yang diisi saat build. Jika Quick Tunnel berganti URL setelah server restart, APK lama tidak otomatis berubah; jalankan workflow lagi dengan URL terbaru.
- Server harus tetap hidup. APK menghubungi API di URL HTTPS dan WebSocket melalui WSS.
- Workflow membangun APK debug untuk pengujian, bukan APK release bertanda tangan untuk Play Store.
- Jangan taruh `config.json`, session secret, password, database, atau credential Cloudflare ke repository APK.
- Aplikasi menggunakan session cookie lintas origin. Backend mengizinkan origin native Capacitor yang dibutuhkan dan mengaktifkan cookie Secure pada production.

## Pengembangan web lokal
Jalankan `npm install`, lalu `npm run dev`. Untuk build web lokal tanpa backend remote, `VITE_API_BASE_URL` dapat dibiarkan kosong.
