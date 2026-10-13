<!-- Hero badges and colorful header (badges provide visible color on GitHub) -->

<p align="center">
  <img alt="PARISA-AI hero" src="https://img.shields.io/badge/PARISA--AI-%F0%9F%92%96%20Memory%20Portal-ff4d6d?style=for-the-badge&logo=ghost" />
</p>

# PARISA‑AI — চ্যাট আর্কাইভ · প্রমাণ বিশ্লেষণ · বাংলা ইনভেস্টিগেটিভ এআই

<p><em>প্রিমিয়াম‑কোয়ালিটির ব্যাকএন্ড: দ্রুত চ্যাট সার্চ, টাইমলাইন বিশ্লেষণ, Google Drive প্রমাণ ও বাংলা TTS</em></p>

<!-- Badges -->
<p>
  <img src="https://img.shields.io/badge/version-V--29-00aaff.svg" alt="version" />
  <img src="https://img.shields.io/badge/Node.js-%3E%3D14-339933" alt="node" />
  <img src="https://img.shields.io/badge/lang-Bengali%20%26%20English-ff4d6d" alt="bilingual" />
  <img src="https://img.shields.io/badge/status-INVESTIGATIVE-orange" alt="status" />
</p>

---

## ১ লাইনে (Styled summary)

<span style="font-weight:700">PARISA‑AI</span> — সংরক্ষিত কথোপকথন ও ডিজিটাল প্রমাণকে উৎসভিত্তিকভাবে (verbatim) সংগঠিত করে তদন্ত‑সহায়তা দেয়।

(English: PARISA‑AI organizes archived conversations and digital evidence verbatim to assist investigative workflows.)

---

## দ্রুত সারসংক্ষেপ • Quick Overview

- উদ্দেশ্য (Purpose): সংরক্ষিত চ্যাট ও স্ক্রিনশট থেকে পরীক্ষানির্ভর প্রমাণ ও টাইমলাইন বিশ্লেষণ প্রদান করা।
- নির্মাতা (Author): DADA310724 (@DADA310724)
- প্রযুক্তি (Tech): Node.js, Express, Google Drive API, Gemini/GROQ/OpenRouter/Deepseek, msedge-tts
- সংস্করণ: V-29

---

## কী করে — Capabilities (সংক্ষিপ্ত)

- NL (natural-language) সার্চ ও exact DB retrieval (chat_database.json থেকে)
- মাসভিত্তিক আচরণ বিশ্লেষণ (warm/cold stats) ও শিফট‑পয়েন্ট ডিটেকশন
- Google Drive screenshot ইনডেক্সিং ও [IMAGE:FILE_ID] প্রমাণ প্রদর্শন
- ফাইল/ইমেজ/অডিও আপলোড বিশ্লেষণ (LLM‑powered, provider‑pool + failover)
- বাংলা TTS (msedge-tts) — আবেগবিবেচিত SSML
- Telegram নোটিফিকেশন ও Firebase লগিং

(English bullets: NL search & exact DB retrieval, monthly behavior analytics, Drive screenshot indexing, LLM file analysis, Bengali TTS, Telegram & Firebase integration)

---

## কি আপডেট করা হয়েছে (What I updated for you)

- README.md কে premium‑styled করে আপডেট করেছি — badges, hero badge, স্পষ্ট শিরোনাম ও bilingual summary।
- প্রয়োজন হলে আরো ভিজ্যুয়াল অংশ (hero‑image file, SVG logo) যোগ করবো।

---

## কিভাবে কাজ করে — How it works (3 steps)

1. ইনডেক্সিং: সার্ভার স্টার্টআপে local chat_database.json লোড, Drive screenshots ইনডেক্স করে।
2. সার্চ/ডিটারমিনিস্টিক রিটার্ন: ইউজারের NL কুয়েরি → search-context নির্মাণ → যদি history intent → exact DB rows রিটার্ন (AI ম্যানিপুলেশন নেই)।
3. বিশ্লেষণ: প্রয়োজনে LLM pool‑এ পাঠিয়ে বিস্তারিত বিশ্লেষণ/সারাংশ আনা হয় (images: explicit flow)।

(English: indexing → deterministic history retrieval → LLM-enabled analysis)

---

## প্রধান API (Main endpoints)

- POST /chat — NL প্রশ্ন / history-requests
- POST /analyze — base64 ফাইল পাঠিয়ে LLM বিশ্লেষণ
- POST /voice — { text, gender } → audio/mpeg (msedge-tts)
- GET /image/:fileId — Drive image proxy
- GET /healthz — সার্ভিস স্ট্যাটাস
- POST /refresh-drive — Drive ইনডেক্স রিফ্রেশ

---

## ভিজ্যুয়াল আর্কিটেকচার (Architecture)

```mermaid
flowchart LR
  A[User (UI / API)] -->|/chat, /analyze| B[Express Server (server.js)]
  B --> C[Local: chat_database.json]
  B --> D[Google Drive (screenshots)]
  B --> E[LLM Provider Pool]
  B --> F[msedge-tts]
  B --> G[Telegram / Firebase]
  style B fill:#00aaff,stroke:#002b5c,color:#fff
  style C fill:#ffefc2,stroke:#d4a017
  style D fill:#ffd1dc,stroke:#c02f4a
  style E fill:#e6f7ff,stroke:#0088cc
  style G fill:#e8ffe6,stroke:#00a859
```

> Mermaid diagram visualizes request flow: User → Server → DB/Drive/LLM/TTS/Notifications.

---

## দ্রুত সেটআপ — Quick Start

1. ইন্সটল

```bash
npm install
```

2. পরিবেশ ভেরিয়েবল (minimum)

- PORT (default 3000)
- GOOGLE_SERVICE_ACCOUNT_JSON — Drive readonly credentials
- GEMINI_API_KEYS / GROQ_API_KEYS / OPENROUTER_API_KEYS / DEEPSEEK_API_KEYS
- TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (optional)
- FIREBASE_DATABASE_URL (optional)

3. চালান

```bash
npm run dev
# অথবা
npm start
```

---

## নিরাপত্তা ও প্রাইভেসি (Security)

- chat_database.json ও Drive ক্রেডেনশিয়াল সংবেদনশীল; production‑এ সিক্রেট ম্যানেজার, VPC/Firewall ব্যবহার করুন।
- সার্ভার history‑rows কখনো AI দ্বারা মডিফাই করে না — database rows হুবহু সরবরাহ করা হয়।

---

## bilingual summary (সংক্ষিপ্ত — BN / EN)

- BN: PARISA‑AI — চ্যাট ও প্রমাণ বিশ্লেষণের জন্য একটি বাংলা‑প্রথম ইনভেস্টিগেটিভ সার্ভার।
- EN: PARISA‑AI — A Bengali‑first investigative backend for chat & evidence analysis.

---

## Want more premium visuals?

I can:
- add an SVG hero/logo file (assets/hero.svg) and update README to use it
- add badges for CI, license, downloads
- expand bilingual docs & deploy guides

বলুন, আমি assets (SVG hero) আপলোড করে README‑কে hero image‑সহ আবার আপডেট করে দেব।

---

Made with care by DADA310724 — PARISA Memory Portal
