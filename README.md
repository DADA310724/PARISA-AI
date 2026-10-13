# PARISA-AI — PARISA Memory Portal

> একটি প্রিমিয়াম-কোয়ালিটির ইনভেস্টিগেটিভ অ্যাপ — চ্যাট আর্কাইভ, ডিজিটাল প্রমাণ ও স্মৃতি বিশ্লেষণের জন্য বাংলা-প্রথম এআই সার্ভার

**সংস্করণ:** V-29  ·  Node server · Express

---

## সারসংক্ষেপ
PARISA-AI হলো একটি সরকারি-ধাঁচের (investigative) স্মৃতি/আর্কাইভ পোর্টাল (Backend server) যা সংরক্ষিত চ্যাট আর্কাইভ, স্ক্রিনশট এবং ড্রাইভ-ভিত্তিক ডিজিটাল প্রমাণ ব্যবহার করে তদন্ত ও বিশ্লেষণ করে। এটি বাংলা ভাষায় কাজ করার জন্য টিউন করা এবং ব্যবহারকারী প্রশ্ন অনুযায়ী নির্ভুল, হুবহু ডাটাবেস উদ্ধৃতি প্রদান করার উদ্দেশ্যে তৈরি।

এই প্রোজেক্টটি মূলত:
- খুব বড় চ্যাট ডাটাবেস থেকে দ্রুত সার্চ/ফিল্ট করে আসল মেসেজ রিট্রাইভ করে
- সময়ভিত্তিক আচরণ বিশ্লেষণ (Behavior pattern stats) তৈরি করে
- Google Drive-এ রাখা স্ক্রিনশট/প্রুফ লিস্ট করে ও প্রাসঙ্গিক ছবি প্রদর্শন করে
- ফাইল/ইমেজ আপলোড বিশ্লেষণ করার জন্য (Gemini/LLM) ইন্টারফেস দেয়
- বাংলা TTS (Microsoft Edge TTS) সমর্থন করে
- Telegram ও Firebase-এ লগ/অ্যালার্ট পাঠাতে পারে

---

## এই অ্যাপ কী করতে পারে (Capabilities)

1. Chat history সার্চ ও রিট্রাইভ
   - বড় JSON-ভিত্তিক chat_database.json থেকে natural-language সার্চ করে সম্পর্কিত মেসেজ খুঁজে বের করে।
   - তারিখ/মাস/বছর, প্ল্যাটফর্ম (WhatsApp/Telegram/Facebook Messenger) অথবা সেন্টার অনুযায়ী ফিল্টার করা যায়।
   - history request হলে সার্ভার exact database rows তুলে দেয় (AI কখনো ডাটাবেস-রো বানায়/মডিফাই করে না)।

2. Behavior pattern analysis
   - ডাটাবেসের উপর ভিত্তি করে মাসভিত্তিক উষ্ণ/শীতল (warm/cold) মেসেজ ক্যালকুলেট করে, শিফট পয়েন্ট ও পিক মূহুর্ত চিহ্নিত করে।

3. Google Drive integration (readonly)
   - নির্দিষ্ট Drive ফোল্ডার (screenshots) স্ক্যান করে screenshot ইনডেক্স তৈরি করে।
   - Drive-file proxy (`/image/:fileId`) দিয়ে স্ক্রিনশট সরাসরি সার্ভার থেকে সার্ভ করে।
   - সার্ভার Drive থেকে ছবি এনে Telegram-এ প্রেরণ করতে পারে (sendTelegramDriveImage)।

4. ফাইল ও ছবি বিশ্লেষণ (LLM-enabled)
   - /analyze endpoint-এ ফাইল (image, pdf, audio ইত্যাদি) আপলোড করে Gemini/GROQ/OpenRouter/Deepseek-এর মাধ্যমে বিশ্লেষণ করানো যায়।
   - Gemini inline multimedia সমর্থন থাকলে inline data পাঠানো যায়; নয়তো fallback text-prompt পাঠানো হয়।

5. Screenshot evidence handling
   - explicit history/screenshot search করলে filename ও pixel-evidence মিলিয়ে screenshot-এ থাকা date/text যাচাই করা যায় (পিক্সেল-স্ক্যান সীমাবদ্ধ এবং আলাদা রুটিন আছে)।
   - সাধারণভাবে সার্ভার স্বয়ংক্রিয়ভাবে screenshot OCR করে না — শুধুমাত্র explicit অনুমোদিত ফ্লোতে সীমিতভাবে ব্যবহার করা হয়।

6. Voice (TTS)
   - Microsoft Edge TTS মডিউল (msedge-tts) দিয়ে বাংলা ভয়েস রেন্ডারিং; আবেগভিত্তিক SSML প্রোসোডি প্রয়োগ করে।

7. Notifications & Logging
   - Telegram এ অনুৎপাতিত লগ/আলার্ট পাঠায়।
   - Firebase Realtime DB তে লগ সংরক্ষণ করে (optional)।

---

## প্রধান API রুট (সংক্ষেপ)

- POST /chat
  - payload: { messages: [{ role, text }], userName?, historyContext?, image? }
  - ব্যবহার: সাধারণ প্রশ্ন, ইতিহাস খোঁজা, এবং সরাসরি ডায়ালগ
  - history-query হলে সার্ভার deterministicভাবে database rows ফেরত দেয় এবং প্রয়োজনীয় screenshot তালিকা যোগ করে।

- POST /analyze
  - payload: { prompt, file (base64), mime }
  - ব্যবহার: আপলোড করা ফাইল (image/pdf/audio/video) LLM দিয়ে বিশ্লেষণ করাতে

- POST /voice
  - payload: { text, gender }
  - ব্যবহার: সার্ভার-সাইড TTS রেন্ডার (audio/mpeg)

- GET /image/:fileId
  - ব্যবহার: Drive-এ থাকা ফাইল সরাসরি সার্ভ থেকে stream করার জন্য

- GET /healthz
  - সার্ভিস স্ট্যাটাস, version, TTS available, drive files count ইত্যাদি রিটার্ন করে

- POST /refresh-drive
  - Drive-memory force refresh

- GET /drive
  - Drive-এর ইনডেক্সড ফাইল তালিকা (chatFiles, callRecords, screenshots)

---

## আর্কিটেকচার সারসংক্ষেপ

- Node.js + Express server (server.js) — একটি একক-process backend
- Chat DB: chat_database.json (স্থানীয় বড় JSON) — সার্চ/ইনডেক্সের সোর্স
- Google Drive (readonly) — screenshots ও প্রমাণ ফাইল ইন্ডেক্সিং
- AI Providers pool: Gemini, GROQ, OpenRouter, Deepseek (API key pool + failover)
- TTS: msedge-tts (optional dependency)
- Notifications: Telegram (bot) ও Firebase (realtime DB)

---

## প্রয়োজনীয় Environment variables

(একই পরিবেশে চলানোর আগে .env.example-এ থাকা ভেরিয়েবলগুলো সেট করুন)

- PORT — সার্ভার পোর্ট (ডিফল্ট 3000)
- BASE_PATH — অপশনাল base path
- TELEGRAM_BOT_TOKEN — Telegram bot token (optional, notification-এর জন্য)
- TELEGRAM_CHAT_ID — Telegram chat id
- FIREBASE_DATABASE_URL অথবা FIREBASE_DB_URL — Firebase Realtime DB URL (optional)

- GOOGLE_SERVICE_ACCOUNT_JSON — Google service account JSON (base64 বা raw JSON string) — Drive readonly access
- DRIVE_ROOT_FOLDER, DRIVE_CALL_FOLDER, DRIVE_SS_FOLDER — Drive folder IDs (server.js-এ ডিফল্ট আছে; প্রয়োজনে পরিবর্তন করুন)

- GEMINI_API_KEYS / GEMINI_API_KEY[_n] — Gemini API key pool (কমা বা স্পেস দিয়ে একাধিক কিপাস করুন)
- GROQ_API_KEYS / GROQ_API_KEY[_n]
- OPENROUTER_API_KEYS / OPENROUTER_API_KEY[_n]
- DEEPSEEK_API_KEY[_n]

- (Optional) MsEdgeTTS requires native bindings — ensure server environment supports `msedge-tts` ও প্রয়োজনীয় প্যাকেজ

---

## লোকালি চালানোর নির্দেশ

1. ডিপস ইনস্টল করুন

```bash
npm install
```

2. পরিবেশ ভেরিয়েবল কনফিগার করুন

- `.env` বা পরিবেশে উপরের ভেরিয়েবলগুলো যোগ করুন।
- Gemini/GROQ/OpenRouter ইত্যাদি provider না থাকলে সেগুলো অন করলে AI provider pool খালি থাকবে; many deterministic flows তখনও কাজ করবে (greeting, history-search)।

3. সার্ভার চালান

```bash
npm run dev
# অথবা
npm start
```

4. ডিফল্টভাবে সার্ভিস http://localhost:3000 এ চলবে — /healthz চেক করে স্ট্যাটাস দেখুন

---

## নিরাপত্তা ও গোপনীয়তা

- এই অ্যাপ সংবেদনশীল পার্সোনাল ডাটা (চ্যাট, স্ক্রিনশট, আইডেন্টিফায়িং তথ্য) হোস্ট করে; প্রোডাকশনে চালানোর আগে অবশ্যই:
  - সার্ভার-অ্যাকসেস সীমাবদ্ধ করুন (VPN/Private VPC)
  - GOOGLE_SERVICE_ACCOUNT_JSON ও AI API keys গোপনে রাখুন
  - chat_database.json ফাইল ও Drive access-কে সুরক্ষিত রাখুন

- ডাটাবেস থেকে রিট্রাইভ করা মেসেজ কখনো AI দ্বারা মোডিফাই করা হয় না — সার্ভার deterministic ভাবে আসল rows প্রদান করে।

---

## ডিবাগ/ট্রাবলশুটিং

- `GET /healthz` সার্ভার স্ট্যাটাস, TTS availability, driveFiles এবং কনফিগ সম্পর্কিত তথ্য দেওয়ার জন্য উপযোগী।
- বড় chat_database.json ফাইলের কারণে স্টার্টআপে RAM বেশি লাগতে পারে — প্রয়োজনে node memory flag বাড়ান (প্রোজেক্টে already ব্যবহার: `--max-old-space-size=350`).

---

## ফাইল ও রেফারেন্স

- server.js — সার্ভারের মূল লজিক (search, drive, providers, TTS, endpoints)
- chat_database.json — লোকাল আর্কাইভ ডাটাবেস (আপনার ডাটার আকার বড় হতে পারে)
- parisa-history.txt — ইনলাইন প্রকৃত ইতিহাস/বুয়ী-সংক্রান্ত রিফারেন্স
- public/ — static UI assets (যদি থাকে)

---

## কন্ট্রিবিউশন ও লাইসেন্স

- আপনি চাইলে Contributions welcome — প্রথমে ইস্যু খুলুন বা PR পাঠান।
- LICENSE: এই রিপোজিটরিতে কোন লাইসেন্স ফাইল নেই — প্রজেক্ট প্রাইভেট বা সংবেদনশীল হলে internal use-এ রাখুন এবং প্রয়োজনীয় আইনি পরামর্শ নিন।

---

Made with care — PARISA Memory Portal

