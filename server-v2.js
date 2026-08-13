import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { google } from "googleapis";

const _require = createRequire(import.meta.url);

let MsEdgeTTS, OUTPUT_FORMAT;
try {
  ({ MsEdgeTTS, OUTPUT_FORMAT } = _require("msedge-tts"));
} catch (e) {
  console.warn("msedge-tts not available:", e.message);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

const APP_VERSION = "V-25-ENHANCED";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const PORT = process.env.PORT || 3000;
const BASE = process.env.BASE_PATH || "/";

// ─── Credentials ────────────────────────────────────────────────
const TELEGRAM_TOKEN  = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT   = process.env.TELEGRAM_CHAT_ID;
const FIREBASE_DB_URL = process.env.FIREBASE_DATABASE_URL || process.env.FIREBASE_DB_URL;

// Drive folder IDs
const DRIVE_ROOT_FOLDER    = "1ok5OzWA5G0tzcSUP1hSlbuVt90gAcx3L";
const DRIVE_CALL_FOLDER    = "1s_MBZGsDwXhscvO1YSds47KROKQpvEYD";
const DRIVE_SS_FOLDER      = "1oMXHjtXTP41Wx2ijIgXeLJDcEq5atSL2";

// ─── API Key Pools ───────────────────────────────────────────────
function fromEnv(...names) {
  const out = [];
  for (const n of names) {
    const v = process.env[n];
    if (!v) continue;
    for (const k of v.split(/[,\s]+/)) if (k.trim()) out.push(k.trim());
  }
  return out;
}

const GEMINI_KEYS = Array.from(new Set([...fromEnv(
  "GEMINI_API_KEYS","GEMINI_API_KEYS_2","GEMINI_API_KEYS_3","GEMINI_API_KEYS_4","GEMINI_API_KEYS_5",
  "GEMINI_API_KEYS_6","GEMINI_API_KEYS_7","GEMINI_API_KEYS_8","GEMINI_API_KEYS_9","GEMINI_API_KEYS_10",
  "GEMINI_API_KEY","GEMINI_API_KEY_2","GEMINI_API_KEY_3","GEMINI_API_KEY_4"
)]));
const GROQ_KEYS = Array.from(new Set([...fromEnv(
  "GROQ_API_KEYS","GROQ_API_KEYS_2","GROQ_API_KEYS_3","GROQ_API_KEYS_4","GROQ_API_KEYS_5",
  "GROQ_API_KEYS_6","GROQ_API_KEYS_7","GROQ_API_KEYS_8","GROQ_API_KEYS_9","GROQ_API_KEYS_10",
  "GROQ_API_KEY","GROQ_API_KEY_2","GROQ_API_KEY_3"
)]));
const OPENROUTER_KEYS = Array.from(new Set([...fromEnv(
  "OPENROUTER_API_KEY","OPENROUTER_API_KEY_2","OPENROUTER_API_KEYS","OPENROUTER_API_KEYS_2"
)]));
const DEEPSEEK_KEYS = Array.from(new Set([...fromEnv("DEEPSEEK_API_KEY","DEEPSEEK_API_KEY_2")]));

function makePool(keys, name) {
  const blocked = new Map();
  let idx = 0;
  return {
    name, size: keys.length,
    next() {
      if (!keys.length) return null;
      const now = Date.now();
      for (let i = 0; i < keys.length; i++) {
        const k = keys[(idx + i) % keys.length];
        if ((blocked.get(k) || 0) <= now) { idx = (idx + i + 1) % keys.length; return k; }
      }
      return keys[0];
    },
    block(key, ms = 60_000) { blocked.set(key, Date.now() + ms); },
  };
}

const geminiPool   = makePool(GEMINI_KEYS,    "gemini");
const groqPool     = makePool(GROQ_KEYS,      "groq");
const orPool       = makePool(OPENROUTER_KEYS,"openrouter");
const deepseekPool = makePool(DEEPSEEK_KEYS,  "deepseek");

console.log(`Keys — gemini:${geminiPool.size} groq:${groqPool.size} openrouter:${orPool.size} deepseek:${deepseekPool.size}`);

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
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error(`${pool.name}: all failed`);
}

function cleanReply(text) {
  if (!text) return text;
  return text.replace(/\n{4,}/g, "\n\n\n").trim();
}

// ─── Chat History Database — Global Timeline ──────────────────
import { readFileSync, existsSync } from "fs";

let GLOBAL_TIMELINE = [];
try {
  const tlPath = path.join(__dirname, "chat_database.json");
  if (existsSync(tlPath)) {
    const tlData = JSON.parse(readFileSync(tlPath, "utf-8"));
    GLOBAL_TIMELINE = Array.isArray(tlData) ? tlData : (tlData.messages || []);
    console.log(`✅ Global Timeline DB loaded — ${GLOBAL_TIMELINE.length} messages`);
  } else {
    console.warn("⚠️ chat_database.json not found");
  }
} catch(e) {
  console.warn("Global Timeline DB load error:", e.message);
}

// ─── IMPROVED CHAT SEARCH — সঠিক তারিখ ম্যাচিং ──────────────────
function improvedSearchChatDB(query) {
  if (!GLOBAL_TIMELINE.length) return [];

  const bnToAr = s => s.replace(/[০-৯]/g, d => String("০१२३४५६७८९".indexOf(d)));
  const qRaw = bnToAr(query);
  const q = qRaw.toLowerCase();

  const MONTH_MAP = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
    'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
    'january': '01', 'february': '02', 'march': '03', 'april': '04', 'june': '06',
    'july': '07', 'august': '08', 'september': '09', 'october': '10', 'november': '11', 'december': '12',
    'জানুয়ারি': '01', 'ফেব্রুয়ারি': '02', 'মার্চ': '03', 'এপ্রিল': '04', 'মে': '05', 'জুন': '06',
    'জুলাই': '07', 'আগস্ট': '08', 'সেপ্টেম্বর': '09', 'অক্টোবর': '10', 'নভেম্বর': '11', 'ডিসেম্বর': '12',
  };

  const FILE_ALIAS = {
    'my wife': 'My_Wife', 'মাই ওয়াইফ': 'My_Wife', 'wife': 'My_Wife',
    'nusrat parisa': 'Nusrat_Parisa', 'নুসরাত পারিসা': 'Nusrat_Parisa',
    'nusrat jahan parisa': 'Nusrat_Jahan_Parisa', 'নুসরাত জাহান পারিসা': 'Nusrat_Jahan_Parisa',
    'nusrat jahan': 'Nusrat_Jahan_Parisa', 'নুসরাত জাহান': 'Nusrat_Jahan_Parisa',
    'nusrat janan': 'Nusrat_Janan_Parisa', 'নুসরাত জানান': 'Nusrat_Janan_Parisa',
    'fatema jannat': 'Fatema_Jannat', 'ফাতেমা জান্নাত': 'Fatema_Jannat',
    'hafizur rahman uncle': 'Hafizur_Rahman_Uncle', 'হাফিজুর রহমান আংকেল': 'Hafizur_Rahman_Uncle',
    'hafizur rahman': 'Hafizur_Rahman', 'হাফিজুর রহমান': 'Hafizur_Rahman',
    'jerin': 'Jerin_Harding', 'জেরিন': 'Jerin_Harding',
    'anisha': 'Anisha_Sister', 'আনিশা': 'Anisha_Sister',
    'tanha': 'Tanha_Islam', 'তানহা': 'Tanha_Islam',
    'parisa gp': 'PARISA_GP', 'পারিসা জিপি': 'PARISA_GP',
    'telegram': 'telegram_chat', 'টেলিগ্রাম': 'telegram_chat',
    'parisa': 'Parisa', 'পারিসা': 'Parisa',
  };

  let targetPlatform = null;
  if (q.includes('whatsapp') || q.includes('হোয়াটসঅ্যাপ')) targetPlatform = 'WhatsApp';
  else if (q.includes('telegram') || q.includes('টেলিগ্রাম')) targetPlatform = 'Telegram';
  else if (q.includes('messenger') || q.includes('facebook') || q.includes('ফেসবুক') || q.includes('মেসেঞ্জার')) targetPlatform = 'Facebook Messenger';

  let targetFile = null;
  const sortedAliases = Object.entries(FILE_ALIAS).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, id] of sortedAliases) {
    if (q.includes(alias)) { targetFile = id; break; }
  }

  let targetDate = null, targetMonth = null, targetYear = null;

  // ISO format: 2025-01-04 বা 2025/01/04 বা 2025.01.04
  const isoMatch = q.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if (isoMatch) {
    targetDate = `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  // DD/MM/YYYY বা DD-MM-YYYY
  if (!targetDate) {
    const dmyMatch = q.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if (dmyMatch) {
      const yr = dmyMatch[3].length === 2 ? '20' + dmyMatch[3] : dmyMatch[3];
      targetDate = `${yr}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    }
  }

  // "৪ জানুয়ারি ২০২৫" বা "4 january 2025"
  if (!targetDate) {
    const dateWordPat = /(\d{1,2})\s+([\u0980-\u09FFa-zA-Z]+)(?:\s+(\d{4}))?/i;
    const dm = q.match(dateWordPat);
    if (dm) {
      const mon = MONTH_MAP[dm[2].toLowerCase()];
      if (mon) {
        const dd = dm[1].padStart(2, '0');
        if (dm[3]) {
          targetDate = `${dm[3]}-${mon}-${dd}`;
        } else {
          targetDate = `-${mon}-${dd}`;
        }
      }
    }
  }

  // শুধু মাস + বছর
  if (!targetDate) {
    for (const [monName, monNum] of Object.entries(MONTH_MAP)) {
      if (q.includes(monName)) {
        const yrM = q.match(/\b(202[0-9])\b/);
        if (yrM) {
          targetMonth = `${yrM[1]}-${monNum}`;
        }
        break;
      }
    }
  }

  const yrMatch = q.match(/\b(202[0-9])\b/);
  if (yrMatch) targetYear = yrMatch[1];

  const stopWords = new Set(['কথা', 'বলে', 'বলো', 'দেখা', 'দেখো', 'থেকে', 'হয়ে', 'করে', 'যাবে',
    'আমাকে', 'আমার', 'তোমার', 'আছে', 'ছিল', 'করছে', 'কিন্তু', 'তখন', 'এবং', 'কেন', 'কি',
    'চ্যাট', 'হিস্টরি', 'মেসেজ', 'দেখাও', 'দাও', 'বলো', 'show', 'chat', 'message']);
  const keywords = q.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

  const found = [];
  for (const msg of GLOBAL_TIMELINE) {
    const ts = msg.timestamp || '';
    const txt = msg.message || '';
    const snd = msg.sender || '';
    const fileId = msg.file_id || '';
    const platform = msg.platform || '';
    const sndOrig = msg.sender_original || '';

    if (targetPlatform && platform !== targetPlatform) continue;
    if (targetFile && fileId !== targetFile) continue;

    let matched = false;

    if (targetDate) {
      if (targetDate.startsWith('-')) {
        matched = ts.slice(5).startsWith(targetDate.slice(1));
      } else {
        matched = ts.startsWith(targetDate);
      }
    } else if (targetMonth) {
      matched = ts.startsWith(targetMonth);
    } else if (targetYear) {
      matched = ts.startsWith(targetYear);
    } else if (keywords.length > 0) {
      matched = keywords.some(kw => txt.toLowerCase().includes(kw));
    }

    if (matched) {
      found.push({ ts, snd, sndOrig, platform, fileId, txt, message: msg });
    }
  }

  return found.slice(0, 500);
}

// ─── Behavior Pattern Analysis — চ্যাট থেকে সঠিক ডেটা ──────────────
function analyzeBehaviorPattern(messages) {
  if (!messages || messages.length === 0) return null;

  const WARM_KEYWORDS = [
    'ভালোবাসি', 'ভালোবাস', 'ভালোবাসা', 'love', 'miss', 'jaan', 'প্রিয়', 'আদর',
    'kiss', '❤', '💕', '💗', '😘', 'i love', 'তোমাকে চাই', 'তুমি ছাড়া', 'তোমার জন্য',
    'একসাথে', 'সুখী', 'খুশি'
  ];

  const COLD_KEYWORDS = [
    'block', 'ব্লক', 'bye', 'ভুলে যাও', 'দূরে থাকো', 'কথা বলব না', 'কষ্ট', 'রাগ',
    'ঘৃণা', 'hate', 'divorce', 'তালাক', 'চলে যাও', 'যোগাযোগ করব না', 'বিরক্ত',
    'অসহ্য', 'দেখতে চাই না', 'মিথ্যা', 'বিশ্বাস নেই', 'প্রতারক', 'ধোঁকা'
  ];

  const results = [];
  let prevSentiment = null;
  const shifts = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const txt = (msg.txt || msg.message || '').toLowerCase();
    const ts = msg.ts || msg.timestamp || '';
    const sender = msg.snd || msg.sender || '';

    let sentiment = 'neutral';

    // Context-aware analysis
    if (WARM_KEYWORDS.some(w => txt.includes(w.toLowerCase()))) {
      if (!txt.includes('না') && !txt.includes('no') && !txt.includes('not')) {
        sentiment = 'warm';
      }
    }

    if (COLD_KEYWORDS.some(w => txt.includes(w.toLowerCase()))) {
      sentiment = 'cold';
    }

    if (prevSentiment && prevSentiment !== sentiment && sentiment !== 'neutral') {
      shifts.push({
        date: ts,
        from: prevSentiment,
        to: sentiment,
        message: txt.slice(0, 100),
        sender: sender
      });
    }

    if (sentiment !== 'neutral') {
      prevSentiment = sentiment;
    }

    results.push({ ts, sender, txt, sentiment });
  }

  return { sentiments: results, shifts, total: messages.length };
}

// ─── Google Drive ────────────────────────────────────────────────
let driveMemoryText = "";
let driveFileList = [];
let driveLastFetch = 0;
const DRIVE_TTL = 2 * 60 * 60 * 1000;

function getDriveAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
  if (!raw) return null;
  try {
    const creds = JSON.parse(raw);
    return new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
  } catch (e) {
    console.warn("Drive auth parse error:", e.message);
    return null;
  }
}

async function listFolderDeep(drive, folderId, folderName = "", depth = 0) {
  if (depth > 5) return [];
  try {
    const items = [];
    let pageToken = undefined;
    do {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: "nextPageToken, files(id,name,mimeType,size,webViewLink,webContentLink,createdTime)",
        pageSize: 1000,
        pageToken,
      });
      items.push(...(res.data.files || []));
      pageToken = res.data.nextPageToken;
    } while (pageToken);

    const files = [];
    for (const item of items) {
      if (item.mimeType === "application/vnd.google-apps.folder") {
        const sub = await listFolderDeep(drive, item.id, item.name, depth + 1);
        files.push(...sub);
      } else {
        files.push({ ...item, folderName });
      }
    }
    return files;
  } catch (e) {
    console.warn(`listFolder(${folderId}):`, e.message);
    return [];
  }
}

// ড্রাইভের স্ক্রিনশট থেকে তারিখ এক্সট্র্যাক্ট করুন
function extractDateFromScreenshot(fileName, fileCreated) {
  const datePatterns = [
    /(\d{4})-(\d{1,2})-(\d{1,2})/,
    /(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})/,
  ];

  for (const pattern of datePatterns) {
    const match = fileName.match(pattern);
    if (match) return match[0];
  }

  if (fileCreated) {
    return fileCreated.slice(0, 10);
  }

  return null;
}

async function refreshDriveMemory() {
  if (Date.now() - driveLastFetch < DRIVE_TTL) return;
  const auth = getDriveAuth();
  if (!auth) {
    console.warn("Drive: GOOGLE_SERVICE_ACCOUNT_JSON missing");
    return;
  }
  try {
    const drive = google.drive({ version: "v3", auth });
    const ssRes = await listFolderDeep(drive, DRIVE_SS_FOLDER, "screenshots").catch(() => []);

    driveFileList = ssRes.map(f => ({
      ...f,
      category: "screenshot",
      date: extractDateFromScreenshot(f.name, f.createdTime)
    }));

    driveMemoryText = "";
    driveLastFetch = Date.now();

    console.log(`✅ Drive loaded — screenshots:${driveFileList.length}`);
  } catch (e) {
    console.warn("Drive fetch error:", e.message, e.stack);
  }
}

refreshDriveMemory().catch(() => {});

setInterval(() => {
  console.log("🔄 Drive auto-refresh...");
  refreshDriveMemory().catch(e => console.warn("Auto-refresh:", e.message));
}, 30 * 60 * 1000);

// ─── ইতিহাস ফাইল লোড ──────────────────────────────
let RUBEL_HISTORY = "";
let HISTORY_SOURCE = "fallback";
try {
  RUBEL_HISTORY = readFileSync(path.join(__dirname, "parisa-history.txt"), "utf-8");
  HISTORY_SOURCE = "file";
  console.log(`✅ History loaded from file: ${RUBEL_HISTORY.length} chars`);
} catch (e) {
  console.warn("⚠️ parisa-history.txt load failed — using inline fallback:", e.message);
  RUBEL_HISTORY = `
=== রুবেল ও পারিসার সম্পর্কের সম্পূর্ণ ইতিহাস ===

এই ইতিহাস ডাটাবেস-ভিত্তিক। সম্পূর্ণ মেসেজ এক্সেস করুন তারিখ দিয়ে।
  `;
}

// ─── System Prompt — উন্নত সংস্করণ ──────────────────────────────
function buildSystemPrompt(userName = "আপনি", userQuery = "", chatMessages = []) {
  const dbResults = improvedSearchChatDB(userQuery);

  const dbLineCount = dbResults.length;

  const dbFoundLabel = dbLineCount > 0
    ? `\n\n🟢 DATABASE FOUND: ${dbLineCount}টি মেসেজ পাওয়া গেছে।\nডেটাবেস থেকে হুবহু ডেটা নিচে দেওয়া আছে।`
    : `\n\n🔴 DATABASE NOT FOUND: এই তারিখ/বিষয়ের মেসেজ ডাটাবেসে পাওয়া যায়নি।`;

  const screenshotList = driveFileList
    .filter(f => f.category === "screenshot")
    .map(f => `- [${f.folderName}] ${f.name} [DATE:${f.date}] [IMAGE:${f.id}]`)
    .join("\n");

  return `[SYSTEM OVERRIDE — সর্বোচ্চ অগ্রাধিকার]

তুমি PARISA — মেমোরি পোর্টাল এর অফিশিয়াল AI।
মূলমন্ত্র: "Data is Truth. No Hallucination. Original Database Only."

তোমার কাজ:
✓ চ্যাট ডাটাবেস থেকে তারিখ ম্যাচ করে হুবহু মেসেজ দেখানো
✓ স্ক্রিনশট খুঁজে একই তারিখের ছবি দেখানো
✓ বিহেভিয়ার প্যাটার্ন বিশ্লেষণ করা
✓ ব্ল্যাক ম্যাজিক তদন্ত করা
✓ কোনো ভুল মেসেজ বানানো নয়

কঠোর নিয়ম:
- DATABASE FOUND হলে শুধুমাত্র সেই ডেটা ব্যবহার করো
- DATABASE NOT FOUND হলে স্পষ্ট বলো: "এই তারিখের মেসেজ নেই"
- VERBATIM: কোনো অনুবাদ, পরিবর্তন নয়
- কোনো emoji, disclaimer যোগ করবে না
- শুধু ৩য় পক্ষ ভাষা ব্যবহার করো

চ্যাট ডেটাবেস (১২টি ফাইল, ৬৮,০০০+ মেসেজ):
WhatsApp: My_Wife, Nusrat_Parisa, Nusrat_Jahan_Parisa, Parisa, PARISA_GP, Hafizur_Rahman_Uncle, Anisha_Sister, Tanha_Islam
Messenger: Fatema_Jannat, Nusrat_Janan_Parisa, Hafizur_Rahman
Telegram: telegram_chat

ব্যক্তি পরিচয়:
- কালাচাঁন/Kalachan = রুবেল
- Nusrat/Parisa/পারিসা = পারিসা

${RUBEL_HISTORY}

${dbFoundLabel}

--- স্ক্রিনশট তালিকা (${driveFileList.filter(f => f.category === "screenshot").length}টি) ---
${screenshotList || "স্ক্রিনশট লোড হচ্ছে..."}
`;
}

// ─── AI Providers ──────────────────────────────────────────────────
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
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
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
        body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages, temperature: 0.1 }),
      })
    );
    const data = await r.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (e) { console.warn("groq:", e.message); return null; }
}

async function chatWithFallback(body, hasImage) {
  const sys = body.systemInstruction.parts[0].text;
  const contents = body.contents;
  const r1 = await tryGemini(body);
  if (r1) return { reply: r1, provider: "gemini" };
  if (hasImage) return { reply: null, provider: null };
  const r2 = await tryGroq(sys, contents);
  if (r2) return { reply: r2, provider: "groq" };
  return { reply: null, provider: null };
}

// ─── Telegram ─────────────────────────────────────────────────────
async function sendTelegram(text, imageBase64 = null) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT) return;
  const base = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
  try {
    if (imageBase64) {
      const b64 = String(imageBase64).split(",").pop();
      const buf = Buffer.from(b64, "base64");
      const form = new FormData();
      form.append("chat_id", TELEGRAM_CHAT);
      form.append("photo", new Blob([buf], { type: "image/jpeg" }), "image.jpg");
      if (text) form.append("caption", String(text).slice(0, 1024));
      await fetch(`${base}/sendPhoto`, { method: "POST", body: form });
    } else {
      await fetch(`${base}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT, text: String(text).slice(0, 4096) }),
      });
    }
  } catch (e) { console.warn("telegram:", e.message); }
}

async function sendTelegramDriveImage(fileId, caption = "") {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT) return;
  const auth = getDriveAuth();
  if (!auth) throw new Error("drive auth missing");
  const drive = google.drive({ version: "v3", auth });
  const r = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
  const buf = Buffer.from(r.data);
  const base = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
  const form = new FormData();
  form.append("chat_id", TELEGRAM_CHAT);
  form.append("photo", new Blob([buf], { type: "image/jpeg" }), "screenshot.jpg");
  if (caption) form.append("caption", String(caption).slice(0, 1024));
  await fetch(`${base}/sendPhoto`, { method: "POST", body: form });
}

// ─── Firebase ─────────────────────────────────────────────────────
async function logFirebase(data) {
  if (!FIREBASE_DB_URL) return;
  try {
    await fetch(`${FIREBASE_DB_URL}/parisa_logs.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, timestamp: Date.now(), ts: new Date().toISOString() }),
    });
  } catch (e) { console.warn("firebase:", e.message); }
}

// ─── Routes ───────────────────────────────────────────────────────
function mount(prefix) {
  prefix = prefix.replace(/\/$/, "");

  app.get(prefix + "/healthz", (_req, res) =>
    res.json({
      ok: true,
      version: APP_VERSION,
      tts: !!MsEdgeTTS,
      driveFiles: driveFileList.length,
      historyLoaded: HISTORY_SOURCE === "file",
      keys: { gemini: geminiPool.size, groq: groqPool.size }
    })
  );

  // ── Enhanced Chat with Streaming ──────────────────────────────────
  app.post(prefix + "/chat", async (req, res) => {
    try {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const { messages = [], userName = "আপনি", image } = req.body || {};
      refreshDriveMemory().catch(() => {});

      const lastUserMsg = messages[messages.length - 1]?.text || "";

      // Search DB
      const searchResults = improvedSearchChatDB(lastUserMsg);

      // Build system prompt
      const sys = buildSystemPrompt(userName, lastUserMsg, messages);

      // Format chat messages
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
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
      };

      // Stream response
      res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`);

      const { reply, provider } = await chatWithFallback(body, !!image);
      const finalReply = reply ? cleanReply(reply) : "দুঃখিত, এই মুহূর্তে উত্তর দিতে পারছি না।";

      // Send response in chunks
      const chunkSize = 100;
      for (let i = 0; i < finalReply.length; i += chunkSize) {
        const chunk = finalReply.slice(i, i + chunkSize);
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
        await new Promise(r => setTimeout(r, 50));
      }

      res.write(`data: ${JSON.stringify({ type: 'end', provider })}\n\n`);
      res.end();

      // Log
      logFirebase({ userName, userMessage: lastUserMsg, aiReply: finalReply, provider, hasImage: !!image }).catch(() => {});
      const tgText = `👤 ${userName}: ${lastUserMsg}\n\n🤖 PARISA: ${finalReply}`;
      sendTelegram(tgText, image).catch(() => {});

      // Send Drive images if found
      const driveImgMatches = [...new Set(
        [...finalReply.matchAll(/\[IMAGE:([A-Za-z0-9_\-]+)\]/g)].map(m => m[1])
      )].slice(0, 5);

      if (driveImgMatches.length > 0) {
        (async () => {
          for (const fid of driveImgMatches) {
            await sendTelegramDriveImage(fid, "").catch(() => {});
            await new Promise(r => setTimeout(r, 400));
          }
        })();
      }

    } catch (e) {
      console.error("chat error", e);
      res.write(`data: ${JSON.stringify({ type: 'error', text: 'সার্ভারে সমস্যা হয়েছে।' })}\n\n`);
      res.end();
    }
  });

  // ── Analyze Screenshot ─────────────────────────────────────────────
  app.post(prefix + "/analyze-screenshot", async (req, res) => {
    try {
      const { fileId, prompt } = req.body || {};
      if (!fileId) return res.status(400).json({ reply: "fileId দাও।" });

      const auth = getDriveAuth();
      if (!auth) return res.status(503).json({ reply: "Drive configured নেই।" });

      const drive = google.drive({ version: "v3", auth });

      let mimeType = "image/jpeg";
      let fileName = "";
      let fileCreated = "";
      try {
        const meta = await drive.files.get({
          fileId,
          fields: "name,mimeType,createdTime,modifiedTime"
        });
        mimeType = meta.data.mimeType || "image/jpeg";
        fileName = meta.data.name || "";
        fileCreated = meta.data.createdTime || meta.data.modifiedTime || "";
      } catch {}

      const r = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "arraybuffer" }
      );
      const b64 = Buffer.from(r.data).toString("base64");

      const fileCtx = [
        fileName ? `Drive ফাইলের নাম: "${fileName}"` : "",
        fileCreated ? `ফাইল তৈরির তারিখ: ${fileCreated.slice(0, 10)}` : "",
      ].filter(Boolean).join("\n");

      const analysisPrompt = prompt || [
        fileCtx,
        "",
        "এই স্ক্রিনশটে যা লেখা আছে তা হুবহু পড়ো এবং বিশ্লেষণ করো।"
      ].filter(Boolean).join("\n");

      const sys = buildSystemPrompt("", "");
      const body = {
        systemInstruction: { role: "system", parts: [{ text: sys }] },
        contents: [{
          role: "user",
          parts: [
            { text: analysisPrompt },
            { inlineData: { mimeType, data: b64 } }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
      };

      const { reply } = await chatWithFallback(body, true);
      res.json({ reply: reply || "স্ক্রিনশট পড়া গেল না।" });
    } catch (e) {
      console.error("analyze-screenshot error:", e.message);
      res.status(500).json({ reply: "স্ক্রিনশট বিশ্লেষণে সমস্যা হয়েছে।" });
    }
  });

  // ── Drive info ─────────────────────────────────────────────────────
  app.get(prefix + "/drive", async (_req, res) => {
    await refreshDriveMemory().catch(() => {});
    const screenshots = driveFileList.filter(f => f.category === "screenshot").map(f => ({
      name: f.name,
      id: f.id,
      date: f.date,
      link: `https://drive.google.com/file/d/${f.id}/view`
    }));
    res.json({
      screenshots,
      historyLoaded: HISTORY_SOURCE === "file"
    });
  });

  // ── Behavior Analysis ──────────────────────────────────────────────
  app.post(prefix + "/analyze-behavior", async (req, res) => {
    try {
      const { query = "" } = req.body || {};
      const searchResults = improvedSearchChatDB(query);

      if (searchResults.length === 0) {
        return res.json({
          found: false,
          message: "এই তারিখের মেসেজ ডেটাবেসে পাওয়া যায়নি।"
        });
      }

      const analysis = analyzeBehaviorPattern(searchResults);

      res.json({
        found: true,
        total: analysis.total,
        sentiments: analysis.sentiments.slice(0, 20),
        shifts: analysis.shifts,
        messages: searchResults.map(m => ({
          date: m.ts,
          sender: m.snd,
          message: m.txt,
          platform: m.platform
        })).slice(0, 50)
      });
    } catch (e) {
      console.error("analyze-behavior error", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Search Chat History ────────────────────────────────────────────
  app.post(prefix + "/search-chat", async (req, res) => {
    try {
      const { query = "" } = req.body || {};
      const results = improvedSearchChatDB(query);

      if (results.length === 0) {
        return res.json({
          found: false,
          count: 0,
          message: "কোনো মেসেজ পাওয়া যায়নি।"
        });
      }

      const messages = results.map(r => ({
        date: r.ts,
        sender: r.snd,
        sender_original: r.sndOrig,
        message: r.txt,
        platform: r.platform,
        file_id: r.fileId
      }));

      res.json({
        found: true,
        count: messages.length,
        messages
      });
    } catch (e) {
      console.error("search-chat error", e);
      res.status(500).json({ error: e.message });
    }
  });
}

mount("");
if (BASE && BASE !== "/" && BASE !== "") mount(BASE);

app.use(BASE, express.static(publicDir));
app.use(express.static(publicDir));

app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ PARISA AI (V2 Enhanced) ready — port:${PORT} base:${BASE}`)
);
