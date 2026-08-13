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

const APP_VERSION = "V-26-PROD";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const PORT = process.env.PORT || 3000;
const BASE = process.env.BASE_PATH || "/";

const TELEGRAM_TOKEN  = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT   = process.env.TELEGRAM_CHAT_ID;
const FIREBASE_DB_URL = process.env.FIREBASE_DATABASE_URL || process.env.FIREBASE_DB_URL;

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

// ─── Chat History Database ──────────────────────────────────────
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

// ─── IMPROVED CHAT SEARCH ───────────────────────────────────────
function improvedSearchChatDB(query) {
  if (!GLOBAL_TIMELINE.length) return [];

  const bnToAr = s => s.replace(/[০-৯]/g, d => String("0123456789".charAt("০१२३४५६७८९".indexOf(d))));
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

  // ISO format: 2025-01-04
  const isoMatch = q.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if (isoMatch) {
    targetDate = `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  // DD/MM/YYYY
  if (!targetDate) {
    const dmyMatch = q.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if (dmyMatch) {
      const yr = dmyMatch[3].length === 2 ? '20' + dmyMatch[3] : dmyMatch[3];
      targetDate = `${yr}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    }
  }

  // "৪ জানুয়ারি ২०२५"
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
    'চ্যাট', 'হিস্টরি', 'মেসেজ', 'দেখাও', 'দাও', 'বলো', 'show', 'chat', 'message', 'history']);
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

// ─── Format Chat Messages for Table ─────────────────────────────
function formatChatTable(messages) {
  if (!messages || messages.length === 0) return "কোনো মেসেজ পাওয়া যায়নি।";

  const limitedMsgs = messages.slice(0, 10);
  let table = "| তারিখ ও সময় | প্রেরক | মেসেজ | প্ল্যাটফর্ম | বিশ্লেষণ |\n";
  table += "|---|---|---|---|---|\n";

  for (const msg of limitedMsgs) {
    const ts = (msg.ts || msg.timestamp || '').replace(/T/, ' ');
    const snd = msg.snd || msg.sender || 'Unknown';
    const txt = (msg.txt || msg.message || '').replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, 80);
    const platform = msg.platform || 'Unknown';
    
    let analysis = "বার্তা সংরক্ষিত";
    if (txt.toLowerCase().includes('ভালোবাসি') || txt.toLowerCase().includes('love')) {
      analysis = "ইতিবাচক";
    } else if (txt.toLowerCase().includes('কষ্ট') || txt.toLowerCase().includes('ব্লক') || txt.toLowerCase().includes('hate')) {
      analysis = "নেতিবাচক";
    }

    table += `| ${ts} | ${snd} | ${txt} | ${platform} | ${analysis} |\n`;
  }

  return table;
}

// ─── Google Drive ───────────────────────────────────────────────
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
      date: f.createdTime ? f.createdTime.slice(0, 10) : null
    }));

    driveLastFetch = Date.now();
    console.log(`✅ Drive loaded — screenshots:${driveFileList.length}`);
  } catch (e) {
    console.warn("Drive fetch error:", e.message);
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
  console.warn("⚠️ parisa-history.txt load failed — using inline fallback");
  RUBEL_HISTORY = `
=== রুবেল ও পারিসার সম্পর্কের সম্পূর্ণ ইতিহাস ===

এই ইতিহাস ডাটাবেস-ভিত্তিক এবং সম্পূর্ণভাবে প্রমাণ-সমর্থিত।
চ্যাট ডাটাবেস থেকে যেকোনো তারিখের বার্তা অ্যাক্সেস করুন।
  `;
}

// ─── System Prompt ──────────────────────────────────────────────
function buildSystemPrompt(userName = "আপনি", userQuery = "") {
  const dbResults = improvedSearchChatDB(userQuery);
  const dbLineCount = dbResults.length;

  const dbFoundLabel = dbLineCount > 0
    ? `\n\n🟢 DATABASE FOUND: ${dbLineCount}টি মেসেজ পাওয়া গেছে।\nতারিখ: ${dbResults[0]?.ts?.slice(0, 10) || 'N/A'}`
    : `\n\n🔴 DATABASE NOT FOUND: এই তারিখ/বিষয়ের মেসেজ ডাটাবেসে পাওয়া যায়নি।`;

  const screenshotList = driveFileList
    .filter(f => f.category === "screenshot")
    .slice(0, 10)
    .map(f => `• ${f.name} [DATE:${f.date || 'Unknown'}]`)
    .join("\n");

  return `[SYSTEM OVERRIDE — সর্বোচ্চ অগ্রাধিকার]

তুমি PARISA — মেমোরি পোর্টালের AI।
মূলমন্ত্র: "Data is Truth. No Hallucination. Original Database Only."

তোমার কাজ:
✓ চ্যাট ডাটাবেস থেকে হুবহু মেসেজ দেখানো
✓ টেবিল ফরম্যাটে শুধুমাত্র চ্যাট মেসেজ (বাকি সব বুলেট/প্যারাগ্রাফ)
✓ কোনো ভুল মেসেজ বানা��ো নয় — শুধু DB ডেটা
✓ DATABASE FOUND হলে তথ্য দেখাও, না হলে স্পষ্ট বলো

কঠোর নিয়ম:
- VERBATIM: কোনো পরিবর্তন, অনুবাদ নয়
- টেবিলে শুধু চ্যাট হিস্টরি দেখাও (৫-১০ মেসেজ)
- কোনো emoji, disclaimer যোগ করবে না
- ৩য় পক্ষ ভাষা ব্যবহার করো

চ্যাট ডেটাবেস: ১২টি ফাইল, ৬৮,০০০+ মেসেজ
ব্যক্তি: কালাচাঁন=রুবেল, Parisa/পারিসা=পারিসা

${RUBEL_HISTORY}

${dbFoundLabel}

--- স্ক্রিনশট (${driveFileList.length}টি) ---
${screenshotList || "স্ক্রিনশট লোড হচ্ছে..."}
`;
}

// ─── AI Providers ──────────────────────────────────────────────
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

// ─── Telegram ──────────────────────────────────────────────────
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

// ─── Firebase ──────────────────────────────────────────────────
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

// ─── Routes ──────────────────────────────────────────────────────
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

  // ── Chat with Streaming ─────────────────────────────────────────
  app.post(prefix + "/chat", async (req, res) => {
    try {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const { messages = [], userName = "আপনি", image } = req.body || {};
      refreshDriveMemory().catch(() => {});

      const lastUserMsg = messages[messages.length - 1]?.text || "";
      const searchResults = improvedSearchChatDB(lastUserMsg);

      const sys = buildSystemPrompt(userName, lastUserMsg);

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

      res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`);

      const { reply, provider } = await chatWithFallback(body, !!image);
      let finalReply = reply ? cleanReply(reply) : "দুঃখিত, এই মুহূর্তে উত্তর দিতে পারছি না।";

      // Add chat table if messages found
      if (searchResults.length > 0) {
        const chatTable = formatChatTable(searchResults);
        finalReply = `${finalReply}\n\n### চ্যাট হিস্টরি\n\n${chatTable}`;
      }

      // Stream response
      const chunkSize = 150;
      for (let i = 0; i < finalReply.length; i += chunkSize) {
        const chunk = finalReply.slice(i, i + chunkSize);
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
        await new Promise(r => setTimeout(r, 50));
      }

      res.write(`data: ${JSON.stringify({ type: 'end', provider, found: searchResults.length > 0 })}\n\n`);
      res.end();

      // Logging
      logFirebase({ userName, userMessage: lastUserMsg, aiReply: finalReply, provider, found: searchResults.length > 0 }).catch(() => {});
      const tgText = `👤 ${userName}: ${lastUserMsg}\n\n🤖 PARISA: ${finalReply.slice(0, 500)}`;
      sendTelegram(tgText, image).catch(() => {});

    } catch (e) {
      console.error("chat error", e);
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/json');
        res.status(500).json({ error: "Server error" });
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', text: 'সার্ভারে সমস্যা হয়েছে।' })}\n\n`);
        res.end();
      }
    }
  });

  // ── Analyze Screenshot ──────────────────────────────────────────
  app.post(prefix + "/analyze-screenshot", async (req, res) => {
    try {
      const { fileId, prompt } = req.body || {};
      if (!fileId) return res.status(400).json({ reply: "fileId দাও।" });

      const auth = getDriveAuth();
      if (!auth) return res.status(503).json({ reply: "Drive configured নেই।" });

      const drive = google.drive({ version: "v3", auth });

      let mimeType = "image/jpeg", fileName = "", fileCreated = "";
      try {
        const meta = await drive.files.get({
          fileId,
          fields: "name,mimeType,createdTime,modifiedTime"
        });
        mimeType = meta.data.mimeType || "image/jpeg";
        fileName = meta.data.name || "";
        fileCreated = meta.data.createdTime || meta.data.modifiedTime || "";
      } catch {}

      const r = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
      const b64 = Buffer.from(r.data).toString("base64");

      const fileCtx = [
        fileName ? `Drive ফাইলের নাম: "${fileName}"` : "",
        fileCreated ? `তারিখ: ${fileCreated.slice(0, 10)}` : "",
      ].filter(Boolean).join("\n");

      const analysisPrompt = prompt || `${fileCtx}\n\nএই স্ক্রিনশটে যা লেখা আছে তা হুবহু পড়ো এবং বিশ্লেষণ করো।`;

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

  // ── Drive Info ──────────────────────────────────────────────────
  app.get(prefix + "/drive", async (_req, res) => {
    await refreshDriveMemory().catch(() => {});
    const screenshots = driveFileList.filter(f => f.category === "screenshot").map(f => ({
      name: f.name,
      id: f.id,
      date: f.date,
      link: `https://drive.google.com/file/d/${f.id}/view`
    }));
    res.json({ screenshots, total: screenshots.length });
  });

  // ── Search Chat ─────────────────────────────────────────────────
  app.post(prefix + "/search-chat", async (req, res) => {
    try {
      const { query = "" } = req.body || {};
      const results = improvedSearchChatDB(query);

      if (results.length === 0) {
        return res.json({ found: false, count: 0 });
      }

      const messages = results.map(r => ({
        date: r.ts,
        sender: r.snd,
        message: r.txt,
        platform: r.platform,
        file_id: r.fileId
      }));

      res.json({ found: true, count: messages.length, messages });
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
  console.log(`✅ PARISA AI (V26-PROD) ready — port:${PORT} base:${BASE}`)
);
