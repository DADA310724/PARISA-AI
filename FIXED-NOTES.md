# PARISA AI — Fix Notes (v2)

## ঠিক করা হয়েছে
1. **সাইডবার ওপেন হচ্ছিল না** — JS body class টগল করছিল কিন্তু CSS `.sidebar.open` চাইছিল। এখন সঠিক ক্লাস টগল করে।
2. **মেসেজ পাঠানোর পর ব্ল্যাঙ্ক স্ক্রীন / ড্যাশবোর্ড দেখাচ্ছিল না** — `.messages { display:none }` ছিল এবং `.show` ক্লাস কখনো যোগ হতো না। এছাড়া bot বাবল-এর CSS ক্লাস mismatch (`.assistant` vs `.bot`)। দুটোই ঠিক হয়েছে।
3. **typing loader / image preview** এর CSS যোগ করা হয়েছে।

## "এই মুহূর্তে উত্তর দিতে পারছি না" সমাধান
এটা সার্ভারের fallback মেসেজ — Render-এ কোনো AI API key সেট করা নেই বলে। ভয়েস (Microsoft Edge TTS) কোনো key ছাড়াই কাজ করে, তাই সেটা চলছে।

**Render Dashboard → Environment → এই variable-গুলোর যেকোনো একটা যোগ করুন:**
- `GEMINI_API_KEY` (সুপারিশকৃত — Google AI Studio থেকে ফ্রি)
- `GROQ_API_KEY`
- `OPENROUTER_API_KEY`
- `DEEPSEEK_API_KEY`

একাধিক key (failover) দিতে চাইলে কমা দিয়ে: `GEMINI_API_KEY=key1,key2,key3`

key সেট করে Render redeploy করলে চ্যাট কাজ করবে।
