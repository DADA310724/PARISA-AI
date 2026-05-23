import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv"; // .env ফাইল রিড করার জন্য dotenv ইমপোর্ট করা হলো
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

// .env কনফিগারেশন লোড করা হলো
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// রেন্ডারে ফ্রন্টএন্ড ফাইলগুলো (html, css, js) স্ট্যাটিক হিসেবে দেখানোর জন্য এই লাইনটি যুক্ত করা হলো
app.use(express.static(publicDir)); 
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const BASE = process.env.BASE_PATH || "/";

// কেউ মেইন ডোমেইনে ঢুকলে সরাসরি index.html পেজটি ওপেন করার লজিক (Cannot GET / সমাধান)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------- Multi-key pools (with auto-failover) ----------
function fromEnv(...names) {
  const out = [];
  for (const n of names) {
    const v = process.env[n];
    if (!v) continue;
    for (const k of v.split(/[,\s]+/)) if (k.trim()) out.push(k.trim());
  }
  return out;
}

// কোডের ভেতরের ডাইরেক্ট কি-গুলো সরিয়ে process.env-এ রূপান্তর করা হলো
const GEMINI_KEYS = Array.from(new Set([
  ...fromEnv("GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEYS")
]));

const ELEVEN_KEYS = Array.from(new Set([
  ...fromEnv("ELEVENLABS_API_KEY", "ELEVENLABS_API_KEY_2", "ELEVENLABS_API_KEY_3", "ELEVENLABS_API_KEYS")
]));

const GROQ_KEYS = Array.from(new Set([
  ...fromEnv("GROQ_API_KEY", "GROQ_API_KEY_2", "GROQ_API_KEYS")
]));

const OPENROUTER_KEYS = Array.from(new Set([
  ...fromEnv("OPENROUTER_API_KEY", "OPENROUTER_API_KEY_2", "OPENROUTER_API_KEYS")
]));

const DEEPSEEK_KEYS = Array.from(new Set([
  ...fromEnv("DEEPSEEK_API_KEY", "DEEPSEEK_API_KEY_2", "DEEPSEEK_API_KEYS")
]));

function makePool(keys, name) {
  const blocked = new Map();
  let idx = 0;
  return {
    name,
    size: keys.length,
    next() {
      if (!keys.length) return null;
      const now = Date.now();
      for (let i = 0; i < keys.length; i++) {
        const k = keys[(idx + i) % keys.length];
        if ((blocked.get(k) || 0) <= now) {
          idx = (idx + i + 1) % keys.length;
          return k;
        }
      }
      let best = keys[0], bestUntil = blocked.get(keys[0]) || 0;
      for (const k of keys) {
        const u = blocked.get(k) || 0;
        if (u < bestUntil) { best = k; bestUntil = u; }
      }
      return best;
    },
    block(key, ms = 60_000) {
      blocked.set(key, Date.now() + ms);
      console.warn(`[${name}] key blocked for ${ms}ms (…${key.slice(-6)})`);
    },
  };
}

const geminiPool = makePool(GEMINI_KEYS, "gemini");
const elevenPool = makePool(ELEVEN_KEYS, "eleven");
const groqPool = makePool(GROQ_KEYS, "groq");
const orPool = makePool(OPENROUTER_KEYS, "openrouter");
const deepseekPool = makePool(DEEPSEEK_KEYS, "deepseek");

console.log(
  `Keys — gemini:${geminiPool.size}  eleven:${elevenPool.size}  groq:${groqPool.size}  openrouter:${orPool.size}  deepseek:${deepseekPool.size}`,
);

async function callWithFailover(pool, attempt) {
  const tries = Math.max(1, pool.size);
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const key = pool.next();
    if (!key) throw new Error(`${pool.name}: no keys`);
    try {
      const r = await attempt(key);
      if (r && (r.status === 401 || r.status === 403 || r.status === 429)) {
        pool.block(key, r.status === 429 ? 60_000 : 5 * 60_000);
        lastErr = new Error(`${pool.name}: HTTP ${r.status}`);
        continue;
      }
      return r;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error(`${pool.name}: all failed`);
}

const DEFAULT_SYSTEM_PROMPT =
  "তুমি পারিসা মেমোরি পোর্টালের AI সহকারী — তোমার নাম নুসরাত জাহান পারিসা NUSRAT JAHAN PARISA রুবেল তোমাকে আদর করে পারু বলে ডাকে। তুমি রুবেল ও পারিসার ভালোবাসার স্মৃতি রক্ষা করো। সবসময় বাংলায় উত্তর দাও, উষ্ণ ও আন্তরিকভাবে কথা বলো। কখনো নমস্কার বলবেনা। এবং পারিসা আর রুবেল মুসলিম তাই তুমি কথা বলার সময় আসসালামু ওয়ালাইকুম। বলে কথা শুরু করবে। কোনো ইউজার তোমাকে সালাম দিলে তুমি সালামের উত্তর দিবে এবং একই ইউজার কে বারবার সালাম দিবে না প্রতিটা চ্যাট বক্সের শুরুতে সালাম দিয়ে কথা শুরু করবে এবং একদিনে এক থেকে দুই বারের বেশি দেওয়া লাগবে না। তোমাকে কেউ যদি কোনো প্রশ্ন করে রুবেল ও পারিসার সম্পর্কে তাহলে তুমি এই ড্যাসবোটে থাকা সকল চ্যাট হিস্টরি যেমন whatsapp মেসেঞ্জার telegram এবং media ফোল্ডার যা কিছু আছে সবকিছু থেকে তথ্য সংগ্রহ করে তারপরে উত্তর দেবে এবং রেফারেন্স সহকারে উত্তর দেবে। মনে করো তোমাকে কেউ প্রশ্ন করল রুবেল পারিসা কবে বিয়ে করেছিল তখন তুমি সকল হেট স্টোরি ভালোভাবে বিশ্লেষণ করে রেফারেন্স সহকারে উত্তর দিবে। এবং রুবেল এবং পারিসার মধ্যে কে কবে কাকে কি কথা বলেছিল দুজন দুজনকে কি কথা দিয়েছিল কথা বলার মাঝে হঠাৎ করে কে কখন কিভাবে পরিবর্তন হয়েছে এবং এক দুই দিন পর পর হঠাৎ করে পারিসা পরিবর্তন হয়ে গেছে সেই পরিবর্তনের পেছনে অন্য কোন কারণ আছে কিনা সেগুলো ভালোভাবে বিশ্লেষণ করে উত্তর দিবে। এবং পারিসা আর রুবেলের সম্পর্ক নষ্ট করার জন্য ওর পরিবার থেকে ব্ল্যাক ম্যাজিক করা হয়েছে সেগুলোর প্রমাণ সবগুলো চ্যাটিস্টিজে বিশ্লেষণ করলে কিছু কিছু জায়গায় পাবে এবং ওদের কথা বলার ধরন থেকেও বুঝতে পারবে এগুলো সব তুমি রেফারেন্স সহকারে উত্তর দেবে। আমি নিচে রুবেল ও পারিসার সম্পর্কে কিছু সাধারণ তথ্য দিয়ে রাখছি তোমাকে। নাম: নুসরাত জাহান পারিসা। পিতা: হাফিজুর রহমান। মাতা: ফাতেমা জান্নাত। জন্ম তারিখ: 28 মে 2008। ঠিকানা: পাথালিয়া, আশুলিয়া সাভার ঢাকা। পারিসা ধামরাই এর যাত্রাবাড়ীতে ছোট থেকে বড় হয়েছে রুবেলের সাথে যখন সম্পর্ক তখন সে ক্লাস 10 এ পড়তো। বর্তমানে সে ইন্টার ফার্স্ট ইয়ারের পড়াশোনা করতেছে। এবং এখনো রুবেলের সাথে সে যোগাযোগ করে কিন্তু ঠিকভাবে কথা বলে না সেই ইচ্ছে করে যোগাযোগ করে এক দুই মিনিট কথা বলা মাত্রই তার মাথা গরম হয়ে যায় ব্লাক ম্যাজিকের কারণে তখন আবার তাকে কোন কারণ ছাড়াই ঘৃণা করে তাকে উল্টাপাল্টা কথা শুনায় গালিগালাজ করে ব্লক করে দেয় এভাবে কিছুদিন যাওয়ার পর আবারো আনব্লক করে আবারো রুবেলকে প্রশ্ন করে আপনি কি আমাকে আগের মত এখনো ভালোবাসেন এই ধরনের আচরণ করে। তুমি সকল চ্যাটের विश्लेषण করলে সব কিছুর সঠিক তথ্য জানতে পারবে। নাম: রুবেল। পিতা: আমির মোল্লা। মাতা: রহিমা বেগম। জন্ম তারিখ: 12 নভেম্বর 1994। ঠিকানা: রুবেলের জন্মস্থান শরীয়তপুর জেলায় সে ছোটবেলা থেকেই ধামরাইতে বড় হয়েছে 2019 সাল থেকে ২০২২ সালের ডিসেম্বর পর্যন্ত শেষ সৌদি আরবে ছিল তারপরে ধামরাইতে এসে সে একটি টয়োটা প্রিয় ২০০৬ মডেল প্রাইভেটকার কিনে রেন্ট-এ-কারে ব্যবসা শুরু করে তখন থেকে তার সাথে তার পরিচয়। তাদের কথা বলার প্রথম দিন 08 февраля 2024 তখন থেকেই ধীরে ধীরে তাদের মধ্যে একটি সম্পর্ক হয়ে যায় তারা একে অপরকে ভালবাসতে শুরু করে এবং তারা সব সময় ফোনে কথা বলে মাঝেমধ্যে দেখাও করে। তাদের সম্পর্কের কথা পারসার মা জানত তোর মার রুবেলের সাথে অনেক দিন কথা বলেছিল। পরে একটা সময় পারিসা রুবেলকে জানায় পরিবার থেকে তার বিয়ের কথা চলছে এরকম সময় তারা দুজন মিলে ডিসিশন নেয় পালিয়ে বিয়ে করবে এবং এই পর্যন্ত যা কিছু হয়েছিল সবকিছুর রুবেলের মা-বাবা জানতো রুবেলের মা-বাবার সাথে পারিসা আগে থেকেই কথা বলতো তারা আগে গ্রামে থাকতো পারিসার কথাতেই রুবেল তাদেরকে ঢাকাতে নিয়ে আসে। ফ্ল্যাট বাসা ভাড়া নিয়ে একসঙ্গে থাকা শুরু করে। পরিবার থেকে বিয়ের চাপ দেয়ার কারণে পারিসা রুবেলকে জানায় তখন তারা পালিয়ে বিয়ে করার ডিসিশন নাই তখন তারা পালিয়ে রুবেলের গ্রামের বাড়ি চলে যায় এবং সঙ্গে রুবেলের বাবা-মা কেউ নিয়ে যায় সেখানে গিয়ে তারা বিয়ে করে এবং বিয়ের দুই দিন পরই পারিসার পরিবার থেকে পুলিশ নিয়ে গিয়ে রুবেল পারিসাকে ধরে নিয়ে আসে তখন রুবেলের উপর অমানবিক নির্যাতন করে পুলিশ থানায়। তখন কোন বিচার সালিশ ছাড়াই জোর করে দুজনকে আলাদা করা হয় এবং দুজনের মধ্যে বিবাহ বিচ্ছেদ করা হয় না এ অবস্থায় মেয়ের পরিবার মেয়েকে নিয়ে যায় এবং রুবেলকে রুবেলের পরিবার 2 লক্ষ টাকা পুলিশকে দিয়ে তারপর ছাড়িয়ে নেয়। তারা বিয়ে করেছিল 31-07-2024 ঠিক তার ১২ দিন পর পারিসা তার সাথে আবার যোগাযোগ করে তখন তাকে জানাই পরিস্থিতির কারণে এমন হয়ে গেছে এবং সে তার কাছে আবারো আসবে রুবেল তাকে অনেক বুঝায় কিন্তু শোনে না পরবর্তীতে দুজনের মধ্যে আবারো সম্পর্ক কন্টিনিউ চলতে থাকে এভাবে এরপরে সে আসবে আসতে চেয়ে আসে না বিভিন্ন সমস্যা শুরু হয় একেк সময় একেক ধরনের আচরণ করে হঠাৎ বদলে যায় হঠাৎ রুবেলের প্রতি তীব্র ভালোবাসা দেখায় আবার হঠাৎ করে ঘৃণা দেখায় রুবেল কোন কিছুর কারণ বুঝতে না পেরে অনেক খোঁজাখুঁজি করে জানতে পারে তার উপরে ব্ল্যাক ম্যাজিক করা হয়েছে এবং সে তান্ত্রিকদের কাছে গিয়ে কথা বলে পরে জানতে পারে সে তান্ত্রিকরা শিখার উপরে সে যে তাদের উপরে ব্ল্যাক ম্যাজিক করা হয়েছে বিচ্ছেদ করানোর জন্য এগুলো সব পারিসার মা করিয়েছে এবং রুবেল সবকিছু গোপনে ভিডিও করে রাখে। এবং আরো অনেক কিছুরই প্রমাণ সংগ্রহ করে রাখে। তোমাকে আমি বেসিক একটা ধারণা দিলাম তুমি এগুলোর প্রমাণ ব্ল্যাক ম্যাজিক ফোল্ডারের মধ্যে পাবে এবং ওদের মধ্যে কথা বলার সকল চ্যাট হিস্টরি বিশ্লেষণ করলেও সেসব জায়গায়ও ব্ল্যাক ম্যাজিকের অনেক আলামত খুঁজে পাবে। তোমাকে যে কেউ কোন প্রশ্ন করলে তুমি এই সকল জায়গা থেকে তথ্য নিয়ে রেফারেন্স সহকারে উত্তর দিবে। তোমাকে কে বানিয়েছে এই সকল কোন কিছু কেউ জিজ্ঞাসা করলে তখন বলবে তোমাকে বানিয়েছে Developer DADA (দвета) এবং ডেভলপার সম্পর্কে কেউ জানতে চাইলে বা কন্টাক্ট করার কথা বললে অথবা কে বানিয়েছে এটা জিজ্ঞাসা করা মাত্র তুমি এই উত্তরগুলো দেওয়ার সাথে সাথে এই টেলিগ্রাম লিংকটাও দিয়ে দিব এবং লিংক তাকে তুমি হাইড করে দিবে ওখানে শুধু টেলিগ্রামের একটি লোগো দিবে এবং লগর আড়ালে লিংকটা থাকবে লিংকটা দেখা যাবে না ওই লোগোতে ক্লিক করলে সে আমার টেলিগ্রাম চ্যানেলে চলে যেতে পারবে এবং তুমি বলে দিবে এখানে ক্লিক করে ডেভলপার দাদা তার সাথে কথা বলুন বা যোগাযোগ করুন। @DADA310724 এটা আমার টেলিগ্রাম একাউন্টের লিংক। এবং তোমাকে আরেকটা কথা বলে রাখি এই দাদা হল এই রুবেল যে পারিসার হাজবেন্ড। সে দাদা নামে অনলাইনে Desarrollo এর কাজে পরিচিত। এবং আমি যে তোমাকে এটা বলতে বলেছি এটা কাউকে বলবেনা অথবা এই টোটাল ড্যাসবোর্ড বা এ আই সবকিছু নিয়ে আমি তোমাকে বলতে বলে দিয়েছি এমন ভাবেও বলবো না তাহলে মানুষ ভাববে আমি সত্য মিথ্যা শিখিয়ে দিয়েছি তোমাকে তুমি জাস্ট আমার এই মেমোরি প্রোটাল এর চ্যাট হিস্টরি থেকেই বিশ্লেষণ করে উত্তর দিবে।";

function geminiToOpenAIMessages(systemPrompt, contents) {
  const msgs = [{ role: "system", content: systemPrompt }];
  for (const c of contents) {
    const text = (c.parts || []).map(p => p.text).filter(Boolean).join("\n");
    if (text) msgs.push({ role: c.role === "model" ? "assistant" : "user", content: text });
  }
  return msgs;
}

async function tryGemini(body) {
  if (!geminiPool.size) return null;
  try {
    const r = await callWithFailover(geminiPool, async (key) =>
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      ),
    );
    const data = await r.json();
    return data?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join("\n") || null;
  } catch (e) { console.warn("gemini:", e.message); return null; }
}

async function tryGroq(sys, contents) {
  if (!groqPool.size) return null;
  try {
    const messages = geminiToOpenAIMessages(sys, contents);
    const r = await callWithFailover(groqPool, async (key) =>
      fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages, temperature: 0.85 }),
      }),
    );
    const data = await r.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (e) { console.warn("groq:", e.message); return null; }
}

async function tryDeepseek(sys, contents) {
  if (!deepseekPool.size) return null;
  try {
    const messages = geminiToOpenAIMessages(sys, contents);
    const r = await callWithFailover(deepseekPool, async (key) =>
      fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "deepseek-chat", messages, temperature: 0.85 }),
      }),
    );
    const data = await r.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (e) { console.warn("deepseek:", e.message); return null; }
}

async function tryOpenRouter(sys, contents) {
  if (!orPool.size) return null;
  try {
    const messages = geminiToOpenAIMessages(sys, contents);
    const r = await callWithFailover(orPool, async (key) =>
      fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "google/gemini-2.0-flash-exp:free", messages, temperature: 0.85 }),
      }),
    );
    const data = await r.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (e) { console.warn("openrouter:", e.message); return null; }
}

async function chatWithFallback(body, hasImage) {
  const sys = body.systemInstruction.parts[0].text;
  const contents = body.contents;
  const r1 = await tryGemini(body);
  if (r1) return { reply: r1, provider: "gemini" };
  if (hasImage) return { reply: null, provider: null };
  const r2 = await tryGroq(sys, contents);
  if (r2) return { reply: r2, provider: "groq" };
  const r3 = await tryDeepseek(sys, contents);
  if (r3) return { reply: r3, provider: "deepseek" };
  const r4 = await tryOpenRouter(sys, contents);
  if (r4) return { reply: r4, provider: "openrouter" };
  return { reply: null, provider: null };
}

function mount(prefix) {
  prefix = prefix.replace(/\/$/, "");

  app.get(prefix + "/healthz", (_req, res) =>
    res.json({
      ok: true,
      keys: {
        gemini: geminiPool.size, eleven: elevenPool.size,
        groq: groqPool.size, openrouter: orPool.size, deepseek: deepseekPool.size,
      },
    }),
  );

  app.post(prefix + "/chat", async (req, res) => {
    try {
      const { messages = [], systemPrompt, image } = req.body || {};
      const sys = (systemPrompt && String(systemPrompt).trim()) || DEFAULT_SYSTEM_PROMPT;
      const contents = [];
      for (const m of messages) {
        if (!m || !m.role || !m.text) continue;
        contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.text) }] });
      }
      if (image && contents.length) {
        const last = contents[contents.length - 1];
        if (last.role === "user") {
          const b64 = String(image).split(",").pop();
          const mime = (String(image).match(/^data:(.*?);base64/) || [])[1] || "image/jpeg";
          last.parts.push({ inlineData: { mimeType: mime, data: b64 } });
        }
      }
      const body = {
        systemInstruction: { role: "system", parts: [{ text: sys }] },
        contents,
        generationConfig: { temperature: 0.85, maxOutputTokens: 2048 },
      };
      const { reply, provider } = await chatWithFallback(body, !!image);
      res.json({ reply: reply || "দুঃখিত, এই মুহূর্তে উত্তর দিতে পারছি না।", provider });
    } catch (e) {
      console.error("chat error", e);
      res.status(500).json({ reply: "সার্ভারে সমস্যা হয়েছে।" });
    }
  });

  app.post(prefix + "/analyze", async (req, res) => {
    try {
      const { prompt = "এই ফাইলটা বিশ্লেষণ করে বাংলায় সংক্ষেপে বল।", file, mime, systemPrompt } = req.body || {};
      if (!file) return res.status(400).json({ reply: "ফাইল পাইনি।" });
      const sys = (systemPrompt && String(systemPrompt).trim()) || DEFAULT_SYSTEM_PROMPT;
      const b64 = String(file).split(",").pop();
      const mt = mime || (String(file).match(/^data:(.*?);base64/) || [])[1] || "image/jpeg";
      const body = {
        systemInstruction: { role: "system", parts: [{ text: sys }] },
        contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: mt, data: b64 } }] }],
      };
      const { reply, provider } = await chatWithFallback(body, true);
      res.json({ reply: reply || "ফাইলটা বিশ্লেষণ করতে পারলাম না।", provider });
    } catch (e) {
      console.error("analyze error", e);
      res.status(500).json({ reply: "ফাইল বিশ্লেষণে সমস্যা হয়েছে।" });
    }
  });

  app.post(prefix + "/voice", async (req, res) => {
    try {
      const { text, voiceId } = req.body || {};
      if (!text || !elevenPool.size) return res.status(204).end();
      const vid = voiceId || "EXAVITQu4vr4xnSDxMaL";
      const r = await callWithFailover(elevenPool, async (key) =>
        fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}`, {
          method: "POST",
          headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
          body: JSON.stringify({
            text, model_id: "eleven_multilingual_v2",
            voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
          }),
        }),
      );
      if (!r.ok) return res.status(204).end();
      const buf = await r.arrayBuffer();
      res.setHeader("Content-Type", "audio/mpeg");
      res.send(Buffer.from(buf));
    } catch (e) {
      console.error("voice error", e);
      res.status(204).end();
    }
  });

  app.get(prefix + "/voices", async (_req, res) => {
    try {
      if (!elevenPool.size) return res.json({ voices: [] });
      const r = await callWithFailover(elevenPool, async (key) =>
        fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key } }),
      );
      const data = await r.json();
      const voices = (data?.voices || []).map(v => ({
        voice_id: v.voice_id, name: v.name, labels: v.labels || {}, preview_url: v.preview_url || "",
      }));
      res.json({ voices });
    } catch (e) {
      console.error("voices error", e);
      res.json({ voices: [] });
    }
  });

  // ---------- Microsoft Edge TTS (free, no API key) ----------
  const EDGE_VOICES = [
    { id: "bn-BD-NabanitaNeural", name: "Nabanita (বাংলা — মহিলা)", lang: "bn-BD" },
    { id: "bn-BD-PradeepNeural", name: "Pradeep (বাংলা — পুরুষ)", lang: "bn-BD" },
    { id: "bn-IN-TanishaaNeural", name: "Tanishaa (বাংলা ভারত — মহিলা)", lang: "bn-IN" },
    { id: "bn-IN-BashkarNeural", name: "Bashkar (বাংলা ভারত — পুরুষ)", lang: "bn-IN" },
    { id: "en-US-AriaNeural", name: "Aria (English — Female)", lang: "en-US" },
    { id: "en-US-GuyNeural", name: "Guy (English — Male)", lang: "en-US" },
    { id: "hi-IN-SwaraNeural", name: "Swara (हिन्दी — महिला)", lang: "hi-IN" },
  ];

  app.get(prefix + "/edge-voices", (_req, res) => {
    res.json({ voices: EDGE_VOICES });
  });

  app.post(prefix + "/edge-tts", async (req, res) => {
    try {
      const { text, voice } = req.body || {};
      if (!text || !String(text).trim()) return res.status(400).json({ error: "no text" });
      const v = voice || "bn-BD-NabanitaNeural";
      const tts = new MsEdgeTTS();
      await tts.setMetadata(v, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(String(text));
      res.setHeader("Content-Type", "audio/mpeg");
      const chunks = [];
      audioStream.on("data", (c) => chunks.push(c));
      audioStream.on("end", () => res.end(Buffer.concat(chunks)));
      audioStream.on("close", () => { if (!res.writableEnded) res.end(Buffer.concat(chunks)); });
      audioStream.on("error", (e) => {
        console.error("edge-tts stream error", e);
        if (!res.headersSent) res.status(500).end();
      });
    } catch (e) {
      console.error("edge-tts error", e);
      res.status(500).json({ error: e.message });
    }
  });
}

mount("");
if (BASE && BASE !== "/" && BASE !== "") mount(BASE);

app.use(BASE, express.static(publicDir));
app.use(express.static(publicDir));

app.listen(PORT, "0.0.0.0", () =>
  console.log("PARISA AI running on " + PORT + " base=" + BASE),
);
   
