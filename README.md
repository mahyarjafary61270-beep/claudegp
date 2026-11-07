<div dir="rtl">

# 🌸 مهیار گپ (Mahyar Gap)

گپ صوتی و متنی خصوصی به سبک Discord — برای دوستان نزدیک، با رادیو ۲۴/۷، اشتراک صفحه و تم‌های نئونی.

یک سرویس واحد Node.js: **REST API + WebSocket + وب‌اپ React** — همه در یک پروسه. رسانه (صدا/ویدیو/اشتراک صفحه) از طریق **LiveKit Cloud** رد می‌شود و از Railway عبور نمی‌کند.

## ✨ امکانات

- 🎙️ **صدا/ویدیو/اشتراک صفحه** با LiveKit — نوار صوت دائمی، انتخاب میکروفون/بلندگو، PTT، حذف نویز، کیفیت‌های 720p30 / 1080p30 / 1080p60، تئاتر/تمام‌صفحه/PiP، حلقه نورانی هنگام صحبت
- 🔊 **کنترل ولوم دیسکوردی** — اسلایدر ۰ تا ۲۰۰٪ برای هر نفر (کلیک راست/بقل)، ولوم کلی، ذخیره در localStorage
- 📻 **بات رادیو** — دستور `/mp` (کارت انتخاب ایستگاه)، `/stop`، `/np`، `/radios` — پخش ۲۴/۷ با Ingress یا rtc-node، قطع خودکار بعد از ۶۰ ثانیه خلوتی
- 💬 **چت متنی** — ارسال خوش‌بینانه، ویرایش/حذف، پاسخ، ری‌اکشن، سنجاق، تایپینگ، آنبیلد و منشن، جستجوی متنی Postgres، مارک‌داون امن (بولد/کد/اسپویلر/لینک)، آپلود عکس تا ۸MB
- ✉️ **پیام خصوصی (DM)** ۱ به ۱
- 👥 **سرور/کانال/نقش** — مالک/ادمین/عضو، اخراج/بن، دعوت‌نامه، ترتیب کانال‌ها
- 🌙 **ظاهر** — ۳ تم (شب شکوفه، نئون توکیو، شفق)، رنگ تاکیدی، ذرات شکوفه، پس‌زمینه شفق، فونت وزیرمتن، تاریخ شمسی، حالت کارایی خودکار، PWA نصب‌شدنی
- 🌐 **دو زبانه** — فارسی (پیش‌فرض، RTL) و English

## 🗂 ساختار

```
packages/shared   → تایپ‌ها، اسکیمای Zod، ایونت‌های WS، لیست رادیوها، رندرر مارک‌داون امن
apps/server       → Fastify + WebSocket + Prisma + LiveKit (توکن، وب‌هوک، رادیو)
apps/web          → React 18 + Vite + Tailwind + Zustand + TanStack Query + livekit-client
```

## 🚀 اجرای محلی (Local Dev)

پیش‌نیاز: Node 20+ و Docker (برای دیتابیس).

```bash
# 1) نصب (یک‌بار)
npm install

# 2) دیتابیس محلی
docker compose up -d postgres

# 3) تنظیمات محیطی
cp .env.example apps/server/.env
#   مقدارها را پر کن (دیتابیس محلی: postgresql://postgres:postgres@localhost:5432/railway)

# 4) مهاجرت + کلاینت Prisma
npm run db:migrate
npx prisma generate --schema apps/server/prisma/schema.prisma

# 5) اجرا (دو ترمینال)
npm run dev:server   # API + WS روی :3000
npm run dev:web      # Vite روی :5173 (پروکسی به :3000)
```

اولین کاربری که ثبت‌نام می‌کند → **مالک** سرور پیش‌فرض «مهیار گپ» می‌شود و ادمین کل می‌شود. برای ثبت‌نام‌های بعدی `INVITE_CODE` یا دعوت‌نامه‌ای که ادمین می‌سازد لازم است.

اجرای بدون Vite (بیلد تولیدی محلی):

```bash
npm run build
docker compose --profile full up --build   # اپ کامل روی :3000
```

## ☁️ دیپلوی روی Railway

۱. **پوش به GitHub:**

```bash
git init && git add -A && git commit -m "Mahyar Gap"
git remote add origin https://github.com/USER/mahyar-gap.git
git push -u origin main
```

۲. **Railway → New Project → Deploy from GitHub repo** → ریپو را انتخاب کن. Railway خودش `Dockerfile` را می‌سازد (`railway.json`).

۳. **افزودن PostgreSQL:** در همان پروژه: `New → Database → PostgreSQL`. Railway متغیر `DATABASE_URL` را می‌سازد؛ در سرویس اپ مطمئن شو از **`DATABASE_URL` با هاست `postgres.railway.internal`** استفاده می‌شود (Reference را وصل کن).

۴. **متغیرهای سرویس اپ** (جدول پایین) — حداقل: `JWT_ACCESS_SECRET`، `JWT_REFRESH_SECRET`، `LIVEKIT_*`، `INVITE_CODE`.

۵. **Volume:** سرویس اپ → `Settings → Volumes → Create`، مسیر ماونت: **`/data`** (و متغیر `UPLOAD_DIR=/data/uploads`).

۶. **دامنه عمومی:** `Settings → Networking → Generate Domain`.

۷. **وب‌هوک LiveKit:** در داشبورد LiveKit Cloud → پروژه → **Settings → Webhooks** → آدرس را بگذار:

```
https://<your-app>.up.railway.app/api/livekit/webhook
```

(این وب‌هوک منبع اصلی وضعیت حضور صوتی و رادیوست؛ بدون آن هم سیستم هر ۳۰ ثانیه با `RoomService` خودش را تطبیق می‌دهد، ولی وب‌هوک را حتماً ست کن.)

### جدول متغیرهای محیطی

| متغیر | الزامی | پیش‌فرض | توضیح |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | کانکشن Postgres (داخل Railway: هاست `*.railway.internal`) |
| `DATABASE_PUBLIC_URL` | — | — | فقط برای توسعه محلی روی دیتابیس Railway |
| `JWT_ACCESS_SECRET` | ✅ | — | ۳۲+ کاراکتر تصادفی |
| `JWT_REFRESH_SECRET` | ✅ | — | ۳۲+ کاراکتر تصادفی |
| `LIVEKIT_URL` | ✅ | — | `wss://....livekit.cloud` |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | ✅ | — | از Project Settings → Keys |
| `NODE_ENV` | ✅ | production | روی Railway خودکار |
| `PORT` | ✅ | 3000 | Railway خودش تزریق می‌کند |
| `REGISTRATION_MODE` | — | invite | `invite` یا `open` |
| `INVITE_CODE` | — | — | کد دعوت ثابت برای ثبت‌نام |
| `UPLOAD_DIR` | — | /data/uploads | ماونت Volume |
| `MAX_CONCURRENT_RADIOS` | — | 2 | سقف رادیوهای هم‌زمان |
| `RADIO_MODE` | — | auto | `auto` (Ingress → fallback به rtc-node) / `ingress` / `rtc` |
| `LOG_LEVEL` | — | info | pino |

## 🧯 عیب‌یابی

- **میکروفون کار نمی‌کند:** مرورگر فقط روی **HTTPS** (یا localhost) دسترسی میکروفون می‌دهد — Railway دامنه https می‌دهد، پس مشکل نباید باشد؛ دسترسی سایت را در تنظیمات مرورگر چک کن.
- **صدا پخش نمی‌شود (اتوپلی):** اولین join باید با کلیک باشد؛ اپ خودش `room.startAudio()` را بعد از تعامل کاربر صدا می‌زند.
- **وب‌هوک فایر نمی‌شود:** آدرس دقیق + `https` را در LiveKit ست کن؛ در لاگ‌های Railway رد شدن امضا را ببین (`livekit webhook rejected`). حضار صوتی با سوئیپ ۳۰ ثانیه‌ای هم همگام می‌شوند.
- **رادیو به ویس نمی‌پیوندد:** اگر `RADIO_MODE=auto` و پلن LiveKit اینگرس نداشته باشد، خودکار به حالت rtc-node و ffmpeg برمی‌گردد — لاگ `ingress unavailable, falling back to rtc-node` یعنی fallback سالم بوده.
- **«همه جایگاه‌های رادیو اشغاله»:** `MAX_CONCURRENT_RADIOS` را بالا ببر یا با `/stop` یکی را آزاد کن.
- **آپلود خطا می‌دهد:** Volume در `/data` ماونت نشده یا `UPLOAD_DIR` با آن هم‌خوان نیست.
- **مهاجرت در استارت fails:** `DATABASE_URL` باید از داخل شبکه Railway قابل دسترس باشد (هاست internal).

## 🧪 تست و CI

```bash
npm test          # ۳۷ تست واحد (auth، دسترسی‌ها، تایمر قطع خودکار رادیو، مارک‌داون امن)
npm run typecheck # هر سه پکیج
npm run build     # بیلد کامل
```

GitHub Actions روی هر push: نصب → Prisma generate → typecheck → build → test.

## 🔐 نکات امنیتی

رمزها argon2id • access token پانزده‌دقیقه‌ای + refresh چرخشی با تشخیص استفاده مجدد (کوکی httpOnly) • rate limit روی لاگین/ثبت‌نام/پیام/آپلود/توکن • اعتبارسنجی Zod روی همه ورودی‌ها • CSP سخت‌گیرانه + هلمت • مارک‌داون escape-first • MIME با magic bytes • امضای وب‌هوک LiveKit • هیچ سرری به کلاینت نمی‌رود.

---

<div dir="ltr">

## English (short)

**Mahyar Gap** — a private Discord-like chat for ~5–25 friends. One Node process serves REST + WebSocket + the built React SPA; media flows through LiveKit Cloud.

**Deploy:** push to GitHub → Railway "Deploy from GitHub" → add PostgreSQL → set env vars (see table above) → mount Volume at `/data` → generate domain → set LiveKit webhook to `https://<app>.up.railway.app/api/livekit/webhook`. First registered user becomes owner. Registration is invite-only.

**Dev:** `docker compose up -d postgres` → `npm install` → `npm run db:migrate` → `npm run dev:server` + `npm run dev:web`.

Commands: `/mp` `/stop` `/np` `/radios`. Shortcuts: `Ctrl+K` switcher, `Ctrl+Shift+M` mute, `Ctrl+Shift+D` deafen.

</div>

</div>
