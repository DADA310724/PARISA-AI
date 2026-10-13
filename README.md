<h1><span style="color:#ff4d6d">PARISA-AI</span> — <span style="color:#00aaff">চ্যাট আর্কাইভ · প্রমাণ বিশ্লেষণ · বাংলা ইনভেস্টিগেটিভ এআই</span></h1>

<p><em>একটি প্রিমিয়াম‑কোয়ালিটির ব্যাকএন্ড সার্ভার — দ্রুত চ্যাট সার্চ, টাইমলাইন বিশ্লেষণ, Google Drive স্ক্রিনশট প্রমাণ এবং বাংলা TTS সহ</em></p>

---

## দ্রুত ধারণা
- উদ্দেশ্য: সংরক্ষিত চ্যাট ও ডিজিটাল প্রমাণ থেকে নির্ভুল, উৎসভিত্তিক তদন্তমূলক তথ্য ও বিশ্লেষণ প্রদান করা।
- কে তৈরি করেছে: DADA310724 (@DADA310724)
- মূল প্রযুক্তি: Node.js, Express, Google Drive API, LLM providers (Gemini/GROQ/OpenRouter/Deepseek), msedge-tts

---

## কি করে (Capabilities) — সংক্ষิป্ত ও স্পষ্ট
- Natural-language ভিত্তিক চ্যাট সার্চ (chat_database.json থেকে) — তারিখ/প্ল্যাটফর্ম/প্রেরক অনুযায়ী ফিল্টার।
- ইতিহাস‑কোয়ারি হলে সার্ভার deterministic ভাবে exact database rows রিটার্ন করে।
- মাসভিত্তিক আচরণ বিশ্লেষণ (warm/cold stats) ও পরিবর্তন‑বিন্দু চিহ্নিত করা।
- Google Drive থেকে screenshot ইনডেক্সিং ও [IMAGE:FILE_ID] ফরম্যাটে ছবি প্রদর্শন।
- ফাইল/চিত্র/অডিও আপলোড বিশ্লেষণ (LLM‑powered)।
- বাংলা TTS (msedge-tts) দিয়ে emotion-aware ভয়েস আউটপুট।
- Telegram নোটিফিকেশন ও Firebase লগিং সমর্থন।

---

## কিভাবে কাজ করে — ৩ ধাপে সহজ ব্যাখ্যা
1. ইনডেক্সিং: স্টার্টআপে local chat_database.json লোড করে এবং Google Drive থেকে screenshots ইনডেক্স করে।
2. সার্চ/ফ্লো: ইউজারের NL প্রশ্ন → সার্ভার থেকে search-context তৈরী → যদি history‑intent পাওয়া যায় → exact DB rows ফেরত।
3. বিশ্লেষণ/LLM: প্রয়োজনে LLM provider‑pool (Gemini→GROQ→Deepseek→OpenRouter) কলে পাঠিয়ে বিশ্লেষণ আনা; images হলে সীমাবদ্ধ ফ্লো অনুসরণ।

---

## প্রধান API (সংক্ষেপ)
- POST /chat — চ্যাট প্রশ্ন/ইতিহাস রিকোয়েস্ট
- POST /analyze — base64 ফাইল পাঠিয়ে LLM বিশ্লেষণ
- POST /voice — text → audio/mpeg (msedge-tts)
- GET /image/:fileId — Drive image proxy
- GET /healthz — সার্ভিস স্ট্যাটাস
- POST /refresh-drive — Drive ইনডেক্স রিফ্রেশ

---

## দ্রুত সেটআপ
1) ডিপেন্ডেন্সি ইনস্টল

```bash
npm install
```

2) .env কনফিগার (মুল ভেরিয়েবল)
- PORT, BASE_PATH
- GOOGLE_SERVICE_ACCOUNT_JSON (Drive readonly)
- TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (optional)
- FIREBASE_DATABASE_URL (optional)
- GEMINI_API_KEYS / GROQ_API_KEYS / OPENROUTER_API_KEYS / DEEPSEEK_API_KEY(S)

3) চালানো

```bash
npm run dev
# অথবা
npm start
```

---

## নোট (সিকিউরিটি ও কার্যকারিতা)
- chat_database.json ও Drive অ্যাক্সেস সংবেদনশীল; প্রোডাকশনে সীমাবদ্ধ নেটওয়ার্ক ও নিরাপদ কী ম্যানেজমেন্ট ব্যবহার করুন।
- স্ক্রিনশট OCR/পিক্সেল‑ইনস্পেকশন শুধুমাত্র explicit history/screenshot ফ্লোতে সীমাবদ্ধ।
- msedge-tts ইনস্টল না থাকলে TTS ফিচার disable থাকবে — সার্ভার আগের deterministic ফ্লোতে কাজ করবে।

---

## কার জন্য উপযোগী
- আইনি/পরিচয় যাচাইকারী ইনভেস্টিগেটর্স
- ডিজিটাল প্রমাণ সাজানো ও উপস্থাপন করা দলের জন্য
- বাংলা‑ফার্স্ট চ্যাট বিশ্লেষণ প্ল্যাটফর্ম নির্মাতাদের জন্য

---

## সংক্ষিপ্ত অবশেষ
PARISA‑AI তৈরির উদ্দেশ্য — সংরক্ষিত কথোপকথন ও ডিজিটাল প্রমাণকে সংগঠিত করে, নির্ভুল উৎসভিত্তিক (verbatim) তথ্য প্রদান ও তদন্ত‑সহায়তা করা।

আরও উন্নত, ভিজ্যুয়াল README (ব্যান্ডডেস/ডায়াগ্রাম/বায়লিংগুয়াল সংস্করণ) চাইলে বলুন — আমি সেটাও প্রিমিয়াম স্টাইলিং সহ তৈরি করে দেব।

---

Made with care by DADA310724 — PARISA Memory Portal
