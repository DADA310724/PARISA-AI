(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const BASE = (() => { const p = location.pathname.replace(/\/$/, ""); return p || ""; })();
  const api = (path) => `${BASE}${path}`;
  const uid = () => Math.random().toString(36).slice(2, 10);

  // ── LocalStorage keys ────────────────────────────────────────────
  const LS_SETTINGS = "parisa.settings.v2";
  const LS_CHATS    = "parisa.chats.v1";
  const LS_ACTIVE   = "parisa.active.v1";
  const LS_WELCOMED = "parisa.welcomed.v1";

  const WELCOME_TEXT = `আসসালামু ওয়ালাইকুম।
PARISA MEMORY PORTAL এ আপনাকে স্বাগতম।

আমি এই সিস্টেমের অফিশিয়াল এআই রিপ্রেজেন্টেটিভ (PARISA)।
আমাকে তৈরী করেছেন আমার ডেভলপার।

আমার কাজ হল পারিসা মেমোরি পোর্টালের এআই সহকারী হিসেবে "পারিসা ও রুবেল" — তাদের বৈবাহিক সম্পর্ক, তাদের জীবনের দীর্ঘ এই আড়াই বছরের ঘটনা ও অজানা বাস্তব প্রমাণ সহকারে তুলে ধরা। পারিসার পরিবারের বিভিন্ন পদক্ষেপ এবং এর পেছনের যাবতীয় আইনি ধারা ও ব্ল্যাক ম্যাজিক সম্পর্কিত নিখুঁত তদন্তের রিপোর্ট বিশ্লেষণ করার দায়িত্ব আমার।

আমার কাছে রুবেল ও পারিসার ভালোবাসা, বিবাহ, জীবনের সকল স্মৃতি এবং প্রমাণ সংরক্ষিত আছে।

আমি যা করতে পারি:
• তাদের সম্পর্কের গল্প ও ইতিহাস বলতে পারি
• চ্যাট হিস্টরি, ছবি, স্ক্রিনশট বিশ্লেষণ করে সত্যতা প্রমাণ করতে পারি
• বাংলাদেশের বিবাহ আইন, ডিভোর্স আইন সম্পর্কে বিস্তারিত আইনি ধারা বলতে পারি
• ব্ল্যাক ম্যাজিকের ভয়াবহ প্রভাব সম্পর্কে বিশ্লেষণ করে বলতে পারি

বলুন, আজ আপনাকে কীভাবে সহযোগিতা করতে পারি?`;

  // ── Settings ─────────────────────────────────────────────────────
  const defaultSettings = { voiceGender: "female", userName: "" };

  let settings = loadSettings();
  let chats    = loadChats();
  let activeId = localStorage.getItem(LS_ACTIVE) || null;
  let pendingAttachment = null;

  function loadSettings() {
    try { return { ...defaultSettings, ...(JSON.parse(localStorage.getItem(LS_SETTINGS) || "{}")) }; }
    catch { return { ...defaultSettings }; }
  }
  function saveSettings() { localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); }

  function loadChats() {
    try { return JSON.parse(localStorage.getItem(LS_CHATS) || "{}"); } catch { return {}; }
  }
  function persistChats() { localStorage.setItem(LS_CHATS, JSON.stringify(chats)); }

  function newChat() {
    const id = uid();
    chats[id] = { id, title: "নতুন চ্যাট", messages: [], pinned: false, updatedAt: Date.now() };
    activeId = id;
    localStorage.setItem(LS_ACTIVE, id);
    persistChats();
    renderChat();
    renderSidebar();
  }
  function getActive() {
    if (!activeId || !chats[activeId]) return null;
    return chats[activeId];
  }

  // ── Rendering ────────────────────────────────────────────────────
  const messagesEl = $("#messages");
  const welcomeEl  = $("#welcome");

  function renderChat() {
    const c = getActive();
    messagesEl.innerHTML = "";
    if (!c || c.messages.length === 0) {
      welcomeEl.style.display = "flex";
      messagesEl.classList.remove("show");
      return;
    }
    welcomeEl.style.display = "none";
    messagesEl.classList.add("show");
    for (const m of c.messages) appendMessage(m, false);
    scrollToBottom();
  }

  function appendMessage(m, animate = true) {
    const row = document.createElement("div");
    row.className = "msg-row " + (m.role === "user" ? "user" : "assistant");
    const bubble = document.createElement("div");
    bubble.className = "msg " + (m.role === "user" ? "user" : "assistant");
    if (m.image) {
      const img = document.createElement("img");
      img.className = "attached"; img.src = m.image;
      bubble.appendChild(img);
    }
    const body = document.createElement("div");
    body.className = "msg-body";
    if (m.role === "assistant") {
      body.innerHTML = renderMarkdown(m.text || "");
    } else {
      body.textContent = m.text || "";
    }
    bubble.appendChild(body);
    if (m.role === "assistant" && m.text) bubble.appendChild(makeMsgActions(m.text, bubble));
    row.appendChild(bubble);
    messagesEl.appendChild(row);
    if (animate) scrollToBottom();
    return { row, bubble, body };
  }

  function makeMsgActions(text, bubble) {
    const acts = document.createElement("div");
    acts.className = "msg-actions";
    const copyBtn = document.createElement("button");
    copyBtn.innerHTML = `<svg class="ic"><use href="#i-copy"/></svg> কপি`;
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(text);
      copyBtn.innerHTML = `<svg class="ic"><use href="#i-copy"/></svg> হয়েছে`;
      setTimeout(() => (copyBtn.innerHTML = `<svg class="ic"><use href="#i-copy"/></svg> কপি`), 1200);
    };
    const speakBtn = document.createElement("button");
    speakBtn.innerHTML = `<svg class="ic"><use href="#i-volume"/></svg> ভয়েস`;
    speakBtn.onclick = () => speak(text, speakBtn);
    acts.append(copyBtn, speakBtn);
    return acts;
  }

  function renderMarkdown(text) {
    const imgBase = api("/image/");
    text = text.replace(/\[IMAGE:([A-Za-z0-9_\-]+)\]/g,
      `<img src="${imgBase}$1" class="drive-img" alt="স্ক্রিনশট" loading="lazy" onerror="this.style.display='none'">`);

    // ── WhatsApp-style chat log rendering ──────────────────────────
    // Detect blocks between ━━━ separators containing [HH:MM] sender: msg lines
    if (/━+/.test(text) && /\[\d{1,2}:\d{2}\]/.test(text)) {
      const lines = text.split("\n");
      let html = "";
      let inChat = false;
      for (const line of lines) {
        const trimmed = line.trim();
        // Header line (📱 or platform name before first separator)
        if (/━{3,}/.test(trimmed)) {
          if (!inChat) {
            html += `<div class="chat-log">`;
            inChat = true;
          }
          continue;
        }
        // Chat message line: [HH:MM] Name: text
        const m = trimmed.match(/^\[(\d{1,2}:\d{2})\]\s*([^:]+?)\s*:\s*([\s\S]*)$/);
        if (m && inChat) {
          const [, time, sender, msg] = m;
          const sLower = sender.trim().toLowerCase();
          const isRight = sLower === "রুবেল" || sLower === "rubel" || sLower === "kalachan" || sLower === "কালাচাঁন" || sLower === "কালাচাঁদ";
          const side = isRight ? "right" : "left";
          const sName = isRight ? "রুবেল" : sender.trim();
          const escapedMsg = msg.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
          html += `<div class="cl-row ${side}"><div class="cl-bubble"><div class="cl-name">${sName}</div><div>${escapedMsg}</div><div class="cl-time">${time}</div></div></div>`;
        } else if (inChat && trimmed && !/^\s*$/.test(trimmed) && !m) {
          // Non-message text inside chat block (header/footer lines)
          html += `<div class="cl-header">${trimmed.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>`;
        }
      }
      if (inChat) html += `</div>`;
      if (html) {
        // Render any non-chat portions with markdown
        const beforeChat = text.split(/━{3,}/)[0].trim();
        let prefix = "";
        if (beforeChat) {
          try { prefix = DOMPurify.sanitize(marked.parse(beforeChat, { breaks: true, gfm: true })); }
          catch { prefix = beforeChat.replace(/\n/g, "<br/>"); }
        }
        return DOMPurify.sanitize(prefix + html, {
          ADD_TAGS: ["img", "div"], ADD_ATTR: ["src", "class", "alt", "loading", "onerror"]
        });
      }
    }

    try {
      return DOMPurify.sanitize(
        marked.parse(text, { breaks: true, gfm: true }),
        { ADD_TAGS: ["img"], ADD_ATTR: ["src", "class", "alt", "loading", "onerror"] }
      );
    }
    catch { return text.replace(/\n/g, "<br/>"); }
  }
  function scrollToBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  }

  // ── Sidebar ──────────────────────────────────────────────────────
  function renderSidebar() {
    const pinned = $("#pinnedList"), recent = $("#recentList");
    pinned.innerHTML = ""; recent.innerHTML = "";
    const list = Object.values(chats).sort((a, b) => b.updatedAt - a.updatedAt);
    for (const c of list) (c.pinned ? pinned : recent).appendChild(makeChatItem(c));
    if (!pinned.children.length) pinned.innerHTML = `<div style="opacity:.45;font-size:12px;padding:6px 4px;">কিছুই পিন করা নেই</div>`;
    if (!recent.children.length) recent.innerHTML = `<div style="opacity:.45;font-size:12px;padding:6px 4px;">সাম্প্রতিক কোনো চ্যাট নেই</div>`;
  }
  function makeChatItem(c) {
    const el = document.createElement("div");
    el.className = "chat-item" + (c.id === activeId ? " active" : "");
    el.innerHTML = `<div class="ci-title">${escapeHtml(c.title || "নতুন চ্যাট")}</div>
      <div class="ci-act">
        <button title="পিন"><svg class="ic"><use href="#i-pin"/></svg></button>
        <button title="রিনেম"><svg class="ic"><use href="#i-edit"/></svg></button>
        <button title="ডিলিট"><svg class="ic"><use href="#i-trash"/></svg></button>
      </div>`;
    const [pinBtn, renameBtn, delBtn] = el.querySelectorAll(".ci-act button");
    el.querySelector(".ci-title").onclick = () => {
      activeId = c.id; localStorage.setItem(LS_ACTIVE, c.id);
      renderChat(); renderSidebar(); closeSidebar();
    };
    pinBtn.onclick = (e) => { e.stopPropagation(); c.pinned = !c.pinned; persistChats(); renderSidebar(); };
    renameBtn.onclick = (e) => {
      e.stopPropagation();
      const t = prompt("নতুন নাম:", c.title);
      if (t != null) { c.title = t.trim() || c.title; persistChats(); renderSidebar(); }
    };
    delBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm("চ্যাট ডিলিট করবেন?")) {
        delete chats[c.id];
        if (activeId === c.id) activeId = null;
        persistChats(); renderSidebar(); renderChat();
      }
    };
    return el;
  }

  // ── Sidebar open/close ───────────────────────────────────────────
  function openSidebar()  { $("#sidebar").classList.add("open"); $("#sidebarScrim").classList.add("show"); }
  function closeSidebar() { $("#sidebar").classList.remove("open"); $("#sidebarScrim").classList.remove("show"); }
  $("#openSidebar").onclick  = openSidebar;
  $("#closeSidebar").onclick = closeSidebar;
  $("#sidebarScrim").onclick = closeSidebar;
  $("#newChatBtn").onclick   = () => { newChat(); closeSidebar(); };

  // ── Settings modal ───────────────────────────────────────────────
  const settingsModal = $("#settingsModal");
  const settingsScrim = $("#settingsScrim");

  function openSettings() {
    const g = settings.voiceGender || "female";
    document.querySelector(`input[name="voiceGender"][value="${g}"]`).checked = true;
    $("#userName").value = settings.userName || "";
    settingsModal.classList.add("show");
    settingsScrim.classList.add("show");
  }

  function closeSettings() {
    settingsModal.classList.remove("show");
    settingsScrim.classList.remove("show");
  }
  $("#openSettings").onclick  = openSettings;
  $("#closeSettings").onclick = closeSettings;
  settingsScrim.onclick       = closeSettings;

  $("#saveSettings").onclick = () => {
    const sel = document.querySelector('input[name="voiceGender"]:checked');
    settings.voiceGender = sel ? sel.value : "female";
    settings.userName    = $("#userName").value.trim();
    saveSettings();
    closeSettings();
  };
  $("#resetSettings").onclick = () => {
    if (confirm("সব সেটিংস রিসেট করবেন?")) {
      settings = { ...defaultSettings };
      saveSettings();
      openSettings();
    }
  };
  const refreshDriveBtn = $("#refreshDrive");
  if (refreshDriveBtn) refreshDriveBtn.onclick = async () => {
    const el = $("#refreshStatus");
    if (el) el.textContent = "আপডেট হচ্ছে...";
    try {
      const r = await fetch(api("/refresh-drive"), { method: "POST" });
      const d = await r.json();
      if (el) el.textContent = d.ok ? "✅ আপডেট হয়েছে" : "❌ সমস্যা হয়েছে";
    } catch { if (el) el.textContent = "❌ সংযোগ সমস্যা"; }
    setTimeout(() => { if (el) el.textContent = ""; }, 3000);
  };

  $("#testVoice").onclick = () => {
    const sel = document.querySelector('input[name="voiceGender"]:checked');
    const testGender = sel ? sel.value : (settings.voiceGender || "female");
    const prevGender = settings.voiceGender;
    settings.voiceGender = testGender;
    speak("আসসালামু ওয়ালাইকুম। পারিসা মেমোরি পোর্টালে আপনাকে স্বাগতম।");
    settings.voiceGender = prevGender;
  };

  // ── Voice System ─────────────────────────────────────────────────
  let currentAudio = null;
  let currentUtter = null;
  let currentSpeakBtn = null;

  // Text পরিষ্কার করো — TTS-এর আগে
  function stripForTTS(str) {
    if (!str) return "";
    // English শব্দ — Microsoft TTS নিজেই পড়তে পারে, তাই রাখছি (বানান করবে না)
    // ইমোজি বাদ
    str = str.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, "");
    // markdown বাদ
    str = str
      .replace(/\[IMAGE:[^\]]*\]/g, "")
      .replace(/#{1,6}\s*/g, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/`[^`]+`/g, "")
      .replace(/^[-*•]\s+/gm, "")
      .replace(/^\d+\.\s+/gm, "")
      .replace(/^>\s*/gm, "")
      .replace(/---+/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    // line breaks
    str = str.replace(/\n{2,}/g, "। ").replace(/\n/g, " ");
    return str.replace(/\s+/g, " ").trim();
  }

  function _resetSpeakBtn(btn) {
    if (btn) btn.innerHTML = `<svg class="ic"><use href="#i-volume"/></svg> ভয়েস`;
  }

  function _stopAll() {
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    if (currentUtter) { speechSynthesis.cancel(); currentUtter = null; }
    if (currentSpeakBtn) { _resetSpeakBtn(currentSpeakBtn); currentSpeakBtn = null; }
  }

  // ── Audio unlock (mobile autoplay policy fix) ─────────────────────
  let _audioCtx = null;
  function _ensureAudioCtx() {
    if (_audioCtx) return;
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  }
  // Call on every user gesture to keep audio context alive
  document.addEventListener("touchstart", _ensureAudioCtx, { once: false, passive: true });
  document.addEventListener("click", _ensureAudioCtx, { once: false, passive: true });

  // ── Show "tap to play" toast when autoplay is blocked ────────────
  function _showPlayToast(audioEl, url, btn) {
    let toast = document.getElementById("_play_toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "_play_toast";
      toast.style.cssText = "position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:rgba(0,200,255,.18);backdrop-filter:blur(12px);border:1px solid rgba(0,200,255,.35);color:#d8f8ff;padding:12px 20px;border-radius:40px;font-size:15px;z-index:999;cursor:pointer;box-shadow:0 4px 24px rgba(0,0,0,.3)";
      document.body.appendChild(toast);
    }
    toast.textContent = "🔊 ট্যাপ করুন — ভয়েস শুনুন";
    toast.style.display = "block";
    const play = () => {
      toast.style.display = "none";
      toast.removeEventListener("click", play);
      audioEl.play().then(() => {
        if (btn) btn.innerHTML = `<svg class="ic"><use href="#i-volume"/></svg> চলছে`;
      }).catch(() => {
        currentAudio = null; currentSpeakBtn = null; URL.revokeObjectURL(url); _resetSpeakBtn(btn);
      });
    };
    toast.addEventListener("click", play);
    setTimeout(() => { toast.style.display = "none"; toast.removeEventListener("click", play); if (currentAudio === audioEl) { currentAudio = null; currentSpeakBtn = null; URL.revokeObjectURL(url); _resetSpeakBtn(btn); } }, 15000);
  }

  // ── Microsoft Edge TTS (server) → browser fallback ────────────────
  async function speak(text, btn = null) {
    if (!text || !text.trim()) return;
    _ensureAudioCtx();

    const wasBtn = currentSpeakBtn;
    _stopAll();
    if (wasBtn && wasBtn === btn) return; // toggle off

    if (btn) btn.innerHTML = `<svg class="ic"><use href="#i-volume"/></svg> <span class="tts-dots"><span></span><span></span><span></span></span>`;
    const clean = stripForTTS(text);
    if (!clean) { _resetSpeakBtn(btn); return; }

    currentSpeakBtn = btn;

    // ── PRIMARY: Server Microsoft Edge TTS (NabanitaNeural / PradeepNeural) ──
    try {
      const r = await fetch(api("/voice"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean.slice(0, 3000), gender: settings.voiceGender || "female" }),
      });
      if (r.ok && r.status !== 204) {
        const blob = await r.blob();
        if (blob.size > 100) {
          const url = URL.createObjectURL(blob);
          currentAudio = new Audio(url);
          currentAudio.onended = () => { currentAudio = null; currentSpeakBtn = null; URL.revokeObjectURL(url); _resetSpeakBtn(btn); };
          currentAudio.onerror = () => { currentAudio = null; currentSpeakBtn = null; URL.revokeObjectURL(url); _resetSpeakBtn(btn); };
          try {
            if (_audioCtx) await _audioCtx.resume();
            await currentAudio.play();
            if (btn) btn.innerHTML = `<svg class="ic"><use href="#i-volume"/></svg> চলছে`;
          } catch (playErr) {
            if (playErr.name === "NotAllowedError" || playErr.name === "NotSupportedError") {
              _showPlayToast(currentAudio, url, btn);
            } else {
              currentAudio = null; currentSpeakBtn = null; URL.revokeObjectURL(url); _resetSpeakBtn(btn);
            }
          }
          return;
        }
      }
    } catch { /* network error → browser fallback */ }

    // ── FALLBACK: Browser speechSynthesis ──
    if (!("speechSynthesis" in window)) { currentSpeakBtn = null; _resetSpeakBtn(btn); return; }
    const doUtter = () => {
      const utter = new SpeechSynthesisUtterance(clean);
      utter.lang  = "bn-BD";
      utter.rate  = 1.0;
      utter.pitch = settings.voiceGender === "male" ? 0.72 : 1.15;
      const voices = speechSynthesis.getVoices();
      const bn = voices.find(v => v.lang === "bn-BD") ||
                 voices.find(v => v.lang === "bn-IN") ||
                 voices.find(v => v.lang.startsWith("bn"));
      if (bn) utter.voice = bn;
      if (btn) btn.innerHTML = `<svg class="ic"><use href="#i-volume"/></svg> চলছে`;
      utter.onend  = () => { currentUtter = null; currentSpeakBtn = null; _resetSpeakBtn(btn); };
      utter.onerror = () => { currentUtter = null; currentSpeakBtn = null; _resetSpeakBtn(btn); };
      currentUtter = utter;
      speechSynthesis.speak(utter);
    };
    if (speechSynthesis.getVoices().length > 0) { doUtter(); }
    else {
      let _fired = false;
      speechSynthesis.onvoiceschanged = () => { speechSynthesis.onvoiceschanged = null; if (!_fired) { _fired = true; doUtter(); } };
      setTimeout(() => { if (!_fired) { _fired = true; doUtter(); } }, 300);
    }
  }

  async function speakAndWait(text, statusEl = null) {
    if (!text || !text.trim()) return;
    _stopAll();
    const clean = stripForTTS(text);
    if (!clean) return;
    if (statusEl) statusEl.innerHTML = `বলছি… <span class="tts-dots"><span></span><span></span><span></span></span>`;
    // ── PRIMARY: Server Microsoft Edge TTS ──
    try {
      const r = await fetch(api("/voice"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean.slice(0, 3000), gender: settings.voiceGender || "female" }),
      });
      if (r.ok && r.status !== 204) {
        const blob = await r.blob();
        if (blob.size > 100) {
          const url = URL.createObjectURL(blob);
          currentAudio = new Audio(url);
          await new Promise(res => {
            currentAudio.onended = () => { currentAudio = null; URL.revokeObjectURL(url); res(); };
            currentAudio.onerror = () => { currentAudio = null; URL.revokeObjectURL(url); res(); };
            currentAudio.play();
          });
          return;
        }
      }
    } catch { /* server unreachable → browser fallback */ }

    // ── FALLBACK: Browser speechSynthesis ──
    if (!("speechSynthesis" in window)) return;
    await new Promise(res => {
      const doUtter = () => {
        const utter = new SpeechSynthesisUtterance(clean);
        utter.lang  = "bn-BD";
        utter.rate  = 1.0;
        utter.pitch = settings.voiceGender === "male" ? 0.72 : 1.15;
        const voices = speechSynthesis.getVoices();
        const bn = voices.find(v => v.lang === "bn-BD") ||
                   voices.find(v => v.lang === "bn-IN") ||
                   voices.find(v => v.lang.startsWith("bn"));
        if (bn) utter.voice = bn;
        utter.onend  = () => { currentUtter = null; res(); };
        utter.onerror = () => { currentUtter = null; res(); };
        currentUtter = utter;
        speechSynthesis.speak(utter);
      };
      if (speechSynthesis.getVoices().length > 0) { doUtter(); }
      else {
        let _f2 = false;
        speechSynthesis.onvoiceschanged = () => { speechSynthesis.onvoiceschanged = null; if (!_f2) { _f2 = true; doUtter(); } };
        setTimeout(() => { if (!_f2) { _f2 = true; doUtter(); } }, 300);
      }
    });
  }

  // ── Composer ─────────────────────────────────────────────────────
  const composerInput = $("#composerInput");
  composerInput.addEventListener("input", () => {
    composerInput.style.height = "auto";
    composerInput.style.height = Math.min(composerInput.scrollHeight, 180) + "px";
  });
  composerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); const p = composerInput.selectionStart; composerInput.value = composerInput.value.slice(0,p) + "\n" + composerInput.value.slice(p); composerInput.selectionStart = composerInput.selectionEnd = p+1; composerInput.dispatchEvent(new Event("input")); }
  });
  $("#sendBtn").onclick  = sendMessage;
  $("#attachBtn").onclick = () => $("#fileInput").click();
  $("#fileInput").addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const dataUrl = await fileToDataUrl(f);
    pendingAttachment = { dataUrl, mime: f.type || "application/octet-stream", name: f.name };
    renderAttachedBar();
    e.target.value = "";
  });
  function renderAttachedBar() {
    const bar = $("#attachedBar");
    bar.innerHTML = "";
    if (!pendingAttachment) return;
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `📎 ${escapeHtml(pendingAttachment.name)} <button title="বাদ দিন">✕</button>`;
    chip.querySelector("button").onclick = () => { pendingAttachment = null; renderAttachedBar(); };
    bar.appendChild(chip);
  }
  function fileToDataUrl(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  // Suggestion buttons
  $$(".sugg").forEach(b => b.addEventListener("click", () => {
    composerInput.value = b.textContent.trim();
    sendMessage();
  }));

  // ── Send message ─────────────────────────────────────────────────
  async function sendMessage() {
    const text = composerInput.value.trim();
    if (!text && !pendingAttachment) return;
    if (!getActive()) newChat();
    const c = getActive();

    const userMsg = { role: "user", text: text || "এই ফাইলটা দেখো", image: pendingAttachment?.dataUrl };
    c.messages.push(userMsg);
    if (c.messages.length === 1) c.title = (text || "ফাইল").slice(0, 36);
    c.updatedAt = Date.now();
    persistChats(); renderSidebar();

    welcomeEl.style.display = "none";
    messagesEl.classList.add("show");
    appendMessage(userMsg);

    composerInput.value = "";
    composerInput.style.height = "auto";

    const typing = document.createElement("div");
    typing.className = "msg-row assistant";
    typing.innerHTML = `<div class="msg assistant"><div class="typing"><span></span><span></span><span></span></div></div>`;
    messagesEl.appendChild(typing);
    scrollToBottom();

    const attachment = pendingAttachment;
    pendingAttachment = null;
    renderAttachedBar();

    try {
      let reply, chatHistory = null;
      if (attachment && !attachment.mime.startsWith("image/")) {
        const r = await fetch(api("/analyze"), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: text || "এই ফাইলটা বিশ্লেষণ করে বাংলায় বল।",
            file: attachment.dataUrl, mime: attachment.mime,
            userName: settings.userName,
          }),
        });
        reply = (await r.json()).reply;
      } else {
        const allMsgs = c.messages.map(m => ({ role: m.role, text: m.text }));
        const msgs = allMsgs.length > 12 ? allMsgs.slice(-12) : allMsgs;
        const r = await fetch(api("/chat"), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: msgs,
            userName: settings.userName,
            image: attachment?.dataUrl,
          }),
        });
        const chatData = await r.json();
        reply = chatData.reply;
        chatHistory = chatData.chatHistory || null;
      }

      typing.remove();
      const botMsg = { role: "assistant", text: reply || "(কোনো উত্তর নেই)" };
      c.messages.push(botMsg);
      c.updatedAt = Date.now();
      persistChats(); renderSidebar();

      // Typing animation + chat history bubbles
      typeOut(botMsg, () => {
        if (chatHistory && chatHistory.length > 0) appendChatHistory(chatHistory);
      });
      speak(botMsg.text);

    } catch {
      typing.remove();
      const botMsg = { role: "assistant", text: "দুঃখিত, এই মুহূর্তে যোগাযোগ করতে পারছি না।" };
      c.messages.push(botMsg);
      persistChats();
      appendMessage(botMsg);
      speak(botMsg.text);
    }
  }

  // ── Typing animation ─────────────────────────────────────────────
  function typeOut(m, onDone = () => {}) {
    const { body, bubble } = appendMessage({ role: "assistant", text: "" });
    const full = m.text;
    let i = 0;
    const step = Math.max(1, Math.floor(full.length / 200));
    const iv = setInterval(() => {
      i = Math.min(full.length, i + step);
      body.innerHTML = renderMarkdown(full.slice(0, i));
      scrollToBottom();
      if (i >= full.length) {
        clearInterval(iv);
        bubble.appendChild(makeMsgActions(full, bubble));
        onDone();
      }
    }, 18);
  }

  // ── Speech-to-text ────────────────────────────────────────────────
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizer = null, recOn = false;
  function makeRecognizer(lang = "bn-BD", continuous = false) {
    if (!SR) return null;
    const r = new SR();
    r.lang = lang; r.interimResults = true; r.continuous = continuous;
    return r;
  }

  // ── Caption animation (typing effect for call screens) ────────
  function updateCaption(el, text) {
    if (!el) return;
    if (!text || !text.trim()) {
      el.style.transition = "opacity 0.25s ease";
      el.style.opacity = "0";
      setTimeout(() => { if (el.style.opacity === "0") { el.innerHTML = ""; el.style.opacity = "1"; } }, 280);
      return;
    }
    el.style.transition = "opacity 0.2s ease";
    el.style.opacity = "0";
    setTimeout(() => {
      const words = text.trim().split(/\s+/).filter(Boolean);
      el.innerHTML = words.map((w, i) =>
        `<span class="cap-word" style="animation-delay:${i * 32}ms">${escapeHtml(w)} </span>`
      ).join("");
      el.style.opacity = "1";
    }, 150);
  }

  $("#micBtn").onclick = () => {
    if (!SR) { alert("আপনার ব্রাউজার ভয়েস ইনপুট সাপোর্ট করে না।"); return; }
    if (recOn && recognizer) { recognizer.stop(); return; }
    recognizer = makeRecognizer();
    recOn = true;
    $("#micBtn").classList.add("active");
    let finalText = "";
    recognizer.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interim += t;
      }
      composerInput.value = finalText || interim;
    };
    recognizer.onend = () => {
      recOn = false; $("#micBtn").classList.remove("active");
      if (composerInput.value.trim()) sendMessage();
    };
    recognizer.onerror = () => { recOn = false; $("#micBtn").classList.remove("active"); };
    recognizer.start();
  };

  // ── Camera mode ───────────────────────────────────────────────────
  let camStream = null, camFacing = "environment";
  async function startCam(view, video, facing) {
    try {
      if (camStream) camStream.getTracks().forEach(t => t.stop());
      camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
      video.srcObject = camStream; view.classList.add("is-open");
    } catch (e) { alert("ক্যামেরা চালু করা যাচ্ছে না: " + e.message); }
  }
  function stopCam() { if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; } }
  function snapshot(video, canvas) {
    canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  }
  $("#cameraBtn").onclick = () => startCam($("#cameraView"), $("#camVideo"), camFacing);
  $("#closeCam").onclick  = () => { stopCam(); $("#cameraView").classList.remove("is-open"); };
  $("#flipCam").onclick   = () => { camFacing = camFacing === "environment" ? "user" : "environment"; startCam($("#cameraView"), $("#camVideo"), camFacing); };

  async function askAboutCamera(promptText) {
    const cap = $("#camCaption");
    cap.textContent = "দেখছি…";
    const img = snapshot($("#camVideo"), $("#camCanvas"));
    try {
      const r = await fetch(api("/analyze"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText || "এই ছবিতে কী দেখা যাচ্ছে? বাংলায় সংক্ষেপে বল।", file: img, mime: "image/jpeg", userName: settings.userName }),
      });
      const data = await r.json();
      cap.textContent = data.reply || "কিছু বুঝতে পারলাম না।";
      speak(cap.textContent);
    } catch { cap.textContent = "নেটওয়ার্ক সমস্যা।"; }
  }
  $("#askCamBtn").onclick = () => askAboutCamera();
  $("#camMicBtn").onclick = () => {
    if (!SR) { askAboutCamera(); return; }
    const r = makeRecognizer();
    $("#camCaption").textContent = "শুনছি…";
    let finalText = "";
    r.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) finalText += e.results[i][0].transcript; $("#camCaption").textContent = finalText; };
    r.onend = () => askAboutCamera(finalText.trim() || "এটা কী?");
    r.start();
  };

  // ── Audio call ─────────────────────────────────────────────────────
  let callOn = false, callRecognizer = null;
  $("#audioCallBtn").onclick  = () => startAudioCall();
  $("#endAudioCall").onclick  = () => endAudioCall();
  $("#muteAudioCall").onclick = () => { if (callRecognizer) callRecognizer.stop(); };

  function setWave(state, id = "audioWave") {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("idle", "listening", "talking");
    el.classList.add(state);
  }

  async function startAudioCall() {
    if (!SR) { alert("ব্রাউজার ভয়েস কল সাপোর্ট করে না।"); return; }
    callOn = true;
    $("#audioCallView").classList.add("is-open");
    $("#audioCallStatus").textContent = "শুনছি…";
    $("#audioCallCaption").textContent = "";
    setWave("listening");
    callLoop();
  }
  function endAudioCall() {
    callOn = false;
    if (callRecognizer) { try { callRecognizer.stop(); } catch {} }
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    setWave("idle");
    $("#audioCallView").classList.remove("is-open");
    // Call history চ্যাটে দেখাও
    const ac = getActive();
    if (ac && ac.messages.length) {
      welcomeEl.style.display = "none";
      renderChat();
    }
  }
  let _callSeq = 0;
  function callLoop() {
    if (!callOn) return;
    const mySeq = ++_callSeq;
    callRecognizer = makeRecognizer("bn-BD", true);
    if (!callRecognizer) return;

    let buffer = "", silenceTimer = null, aiReplying = false;

    const handleSend = async () => {
      const said = buffer.trim();
      buffer = "";
      if (!said || !callOn || _callSeq !== mySeq) return;
      aiReplying = true;
      setWave("talking");
      $("#audioCallStatus").textContent = "ভাবছি…";
      const reply = await callChat(said);
      if (!callOn || _callSeq !== mySeq) { aiReplying = false; return; }
      updateCaption($("#audioCallCaption"), reply);
      setWave("talking");
      await speakAndWait(reply, $("#audioCallStatus"));
      aiReplying = false;
      if (!callOn || _callSeq !== mySeq) return;
      setWave("listening");
      $("#audioCallStatus").textContent = "শুনছি…";
      setTimeout(() => { if (callOn && _callSeq === mySeq) updateCaption($("#audioCallCaption"), ""); }, 2500);
    };

    callRecognizer.onstart = () => {
      if (currentAudio || currentUtter) { _stopAll(); aiReplying = false; }
      setWave("listening");
      $("#audioCallStatus").textContent = "শুনছি…";
    };
    callRecognizer.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) buffer += t; else interim += t;
      }
      if (interim.trim() && (currentAudio || currentUtter)) {
        _stopAll(); aiReplying = false;
        setWave("listening");
        $("#audioCallStatus").textContent = "শুনছি…";
      }
      updateCaption($("#audioCallCaption"), buffer + interim);
      if (silenceTimer) clearTimeout(silenceTimer);
      if (buffer.trim() || interim.trim()) silenceTimer = setTimeout(handleSend, 1500);
    };
    callRecognizer.onerror = (e) => {
      if (e.error === "aborted") return;
      if (callOn && _callSeq === mySeq && !aiReplying) setTimeout(callLoop, 600);
    };
    callRecognizer.onend = () => {
      if (callOn && _callSeq === mySeq && !aiReplying) setTimeout(callLoop, 200);
    };
    try { callRecognizer.start(); } catch { if (callOn) setTimeout(callLoop, 500); }
  }
  async function callChat(text) {
    if (!getActive()) newChat();
    const c = getActive();
    c.messages.push({ role: "user", text }); c.updatedAt = Date.now(); persistChats();
    try {
      const r = await fetch(api("/chat"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: c.messages.map(m => ({ role: m.role, text: m.text })), userName: settings.userName }),
      });
      const data = await r.json();
      const reply = data.reply || "...";
      c.messages.push({ role: "assistant", text: reply }); persistChats();
      return reply;
    } catch { return "দুঃখিত, যোগাযোগ করতে পারছি না।"; }
  }

  // ── Video call ─────────────────────────────────────────────────────
  let vcStream = null, vcFacing = "user", vcOn = false, vcRecognizer = null;
  $("#videoCallBtn").onclick   = () => startVideoCall();
  $("#endVideoCall").onclick   = () => endVideoCall();
  $("#flipVideoCall").onclick  = async () => { vcFacing = vcFacing === "user" ? "environment" : "user"; await openVcCam(); };
  $("#muteVideoCall").onclick  = () => { if (vcRecognizer) vcRecognizer.stop(); };

  async function openVcCam() {
    try {
      if (vcStream) vcStream.getTracks().forEach(t => t.stop());
      vcStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: vcFacing }, audio: false });
      $("#videoCallVideo").srcObject = vcStream;
    } catch (e) { alert("ক্যামেরা চালু করা যাচ্ছে না: " + e.message); }
  }
  async function startVideoCall() {
    if (!SR) { alert("ব্রাউজার ভয়েস ইনপুট সাপোর্ট করে না।"); return; }
    vcOn = true;
    $("#videoCallView").classList.add("is-open");
    $("#videoCallStatus").textContent = "কানেক্টেড";
    $("#videoCallCaption").textContent = "";
    await openVcCam();
    videoCallLoop();
  }
  function endVideoCall() {
    vcOn = false;
    if (vcRecognizer) { try { vcRecognizer.stop(); } catch {} }
    if (vcStream) { vcStream.getTracks().forEach(t => t.stop()); vcStream = null; }
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    $("#videoCallView").classList.remove("is-open");
    // Video call history চ্যাটে দেখাও
    const vc = getActive();
    if (vc && vc.messages.length) {
      welcomeEl.style.display = "none";
      renderChat();
    }
  }
  let _vcSeq = 0;
  function videoCallLoop() {
    if (!vcOn) return;
    const mySeq = ++_vcSeq;
    vcRecognizer = makeRecognizer("bn-BD", true);
    if (!vcRecognizer) return;

    let buffer = "", silenceTimer = null, aiReplying = false;

    const handleSend = async () => {
      const said = buffer.trim();
      buffer = "";
      if (!said || !vcOn || _vcSeq !== mySeq) return;
      aiReplying = true;
      $("#videoCallStatus").textContent = "ভাবছি…";
      const img = snapshot($("#videoCallVideo"), $("#videoCallCanvas"));
      try {
        const r = await fetch(api("/analyze"), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: said, file: img, mime: "image/jpeg", userName: settings.userName }),
        });
        const data = await r.json();
        const reply = data.reply || "কিছু বুঝতে পারলাম না।";
        if (!vcOn || _vcSeq !== mySeq) { aiReplying = false; return; }
        updateCaption($("#videoCallCaption"), reply);
        await speakAndWait(reply, $("#videoCallStatus"));
      } catch {
        updateCaption($("#videoCallCaption"), "নেটওয়ার্ক সমস্যা");
      }
      aiReplying = false;
      if (!vcOn || _vcSeq !== mySeq) return;
      $("#videoCallStatus").textContent = "কানেক্টেড";
      setTimeout(() => { if (vcOn && _vcSeq === mySeq) updateCaption($("#videoCallCaption"), ""); }, 2500);
    };

    vcRecognizer.onstart = () => {
      if (currentAudio || currentUtter) { _stopAll(); aiReplying = false; }
      $("#videoCallStatus").textContent = "কানেক্টেড";
    };
    vcRecognizer.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) buffer += t; else interim += t;
      }
      if (interim.trim() && (currentAudio || currentUtter)) {
        _stopAll(); aiReplying = false;
        $("#videoCallStatus").textContent = "কানেক্টেড";
      }
      updateCaption($("#videoCallCaption"), buffer + interim);
      if (silenceTimer) clearTimeout(silenceTimer);
      if (buffer.trim() || interim.trim()) silenceTimer = setTimeout(handleSend, 1500);
    };
    vcRecognizer.onerror = (e) => {
      if (e.error === "aborted") return;
      if (vcOn && _vcSeq === mySeq && !aiReplying) setTimeout(videoCallLoop, 600);
    };
    vcRecognizer.onend = () => {
      if (vcOn && _vcSeq === mySeq && !aiReplying) setTimeout(videoCallLoop, 200);
    };
    try { vcRecognizer.start(); } catch { if (vcOn) setTimeout(videoCallLoop, 500); }
  }

  // ── Welcome message (one-time) ────────────────────────────────────
  function showWelcomeIfFirst() {
    if (localStorage.getItem(LS_WELCOMED)) return;
    localStorage.setItem(LS_WELCOMED, "1");
    // প্রথমবার শুধু হোমপেজ দেখাও — chat-এ message যোগ করো না
    // #welcome div স্বয়ংক্রিয়ভাবে দেখা যাবে (কোনো message নেই বলে)
    setTimeout(() => speak("আস্সালামু ওয়ালাইকুম। পারিসা মেমোরি পোর্টালে আপনাকে স্বাগতম।"), 1800);
  }

  // ── Chat History WhatsApp Bubble Renderer ─────────────────────────
  function isRubelSender(s) {
    const n = (s || "").toLowerCase().replace(/\s/g, "");
    return ["kalachan","kalachand","কালাচাঁন","কালাচাঁদ","rubel","রুবেল"].some(k => n.includes(k));
  }

  function appendChatHistory(messages) {
    if (!messages || !messages.length) return;
    const wrap = document.createElement("div");
    wrap.className = "msg-row assistant";
    const outer = document.createElement("div");
    outer.className = "msg assistant chat-history-block";
    const first = messages[0];
    const hdr = document.createElement("div");
    hdr.className = "ch-header";
    hdr.textContent = `📱 ${first.platform || "Chat"} — ${first.chatName || ""} — ${(first.ts || "").slice(0, 10)}`;
    outer.appendChild(hdr);
    const log = document.createElement("div");
    log.className = "chat-log";
    for (const m of messages) {
      const isMe = isRubelSender(m.snd);
      const row = document.createElement("div");
      row.className = `cl-row ${isMe ? "right" : "left"}`;
      const bub = document.createElement("div");
      bub.className = "cl-bubble";
      const nm = document.createElement("div");
      nm.className = "cl-name";
      nm.textContent = isMe ? "রুবেল" : (m.snd || "পারিসা");
      const txt = document.createElement("div");
      txt.className = "cl-msg";
      txt.textContent = m.txt || "";
      const ts = document.createElement("div");
      ts.className = "cl-time";
      ts.textContent = (m.ts || "").slice(11, 16);
      bub.append(nm, txt, ts);
      row.appendChild(bub);
      log.appendChild(row);
    }
    outer.appendChild(log);
    const ftr = document.createElement("div");
    ftr.className = "ch-footer";
    ftr.textContent = `মোট ${messages.length}টি মেসেজ`;
    outer.appendChild(ftr);
    wrap.appendChild(outer);
    messagesEl.appendChild(wrap);
    scrollToBottom();
  }

  // ── PWA service worker ────────────────────────────────────────────
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  // ── Init — force hide all fullscreen views (PWA cache safety) ────
  ["audioCallView","videoCallView","cameraView"].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.remove("is-open"); el.hidden = false; }
  });
  callOn = false; vcOn = false;

  if (Object.keys(chats).length === 0) newChat();
  else { renderChat(); renderSidebar(); }
  showWelcomeIfFirst();
})();
