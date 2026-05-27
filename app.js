/* PARISA AI — frontend
 * Fixes:
 *  - Correct /chat payload shape ({messages, image, systemPrompt})
 *  - Real Microsoft Edge TTS via /edge-tts (no API key needed)
 *  - Voice list = Edge TTS + ElevenLabs (if keys) + browser voices
 *  - Working sidebar, settings (save/load/reset), logo URL
 *  - Working file attach, camera, mic-to-text
 *  - Stable audio call & video call with continuous speech recognition
 *    (Gemini-live style: listen → reply → speak → listen again)
 *  - [IMAGE: ID] parsing — Google Drive images shown inline
 *  - Echo cancellation & noise suppression in calls
 *  - All buttons wired, no broken handlers
 *  - Design, colors, Bangla text untouched
 */
(() => {
  // ---------- Helpers ----------
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const BASE = (() => { const p = location.pathname.replace(/\/$/, ""); return p || ""; })();
  const api = (p) => `${BASE}${p}`;
  const uid = () => Math.random().toString(36).slice(2, 10);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function escapeHtml(str) {
    return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ---------- [IMAGE: ID] পার্সিং ----------
  function parseImagesInReply(text) {
    if (!text) return text;
    return text.replace(
      /\[IMAGE:\s*([a-zA-Z0-9_-]+)\]/g,
      (match, id) => {
        return `<br><img src="https://drive.google.com/uc?export=view&id=${id}" style="max-width:100%; max-height:400px; border-radius:12px; margin:8px 0; box-shadow:0 0 20px rgba(0,255,200,0.4);" alt="Drive Image" loading="lazy" onerror="this.style.display='none'" />`;
      }
    );
  }

  // ---------- Persistence ----------
  const LS_SETTINGS = "parisa.settings.v2";
  const LS_CHATS    = "parisa.chats.v1";
  const LS_ACTIVE   = "parisa.active.v1";

  const DEFAULT_PROMPT =
    "তুমি পারিসা মেমোরি পোর্টালের AI সহকারী। সবসময় বাংলায় উষ্ণ, আন্তরিক ও সংক্ষিপ্ত উত্তর দাও।";

  let settings = {
    voice: "edge:bn-BD-NabanitaNeural",
    userName: "দাদা",
    prompt: "",
    logoUrl: "",
  };

  let chats = {};
  let activeId = null;

  function loadSettings() {
    try {
      const raw = localStorage.getItem(LS_SETTINGS);
      if (raw) settings = { ...settings, ...JSON.parse(raw) };
    } catch (e) { console.warn("settings load", e); }
    applyLogo();
  }
  function saveSettings() {
    try { localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); } catch {}
  }
  function applyLogo() {
    if (!settings.logoUrl) return;
    $$(".logo-img, #brandLogoImg, #parisaAvatar").forEach(img => { img.src = settings.logoUrl; });
  }

  function loadChats() {
    try {
      const c = localStorage.getItem(LS_CHATS);
      if (c) chats = JSON.parse(c);
      activeId = localStorage.getItem(LS_ACTIVE) || null;
    } catch (e) { console.warn("chats load", e); }
    if (!chats || Object.keys(chats).length === 0) createNewChat();
    else if (!chats[activeId]) activeId = Object.keys(chats)[0];
  }
  function saveChats() {
    try {
      localStorage.setItem(LS_CHATS, JSON.stringify(chats));
      localStorage.setItem(LS_ACTIVE, activeId || "");
    } catch {}
  }

  // ---------- Chat list ----------
  function closeSidebarUI() {
    document.body.classList.remove("sidebar-open");
    $("#sidebar")?.classList.remove("open");
    $("#sidebarScrim")?.classList.remove("show");
  }
  function openSidebarUI() {
    document.body.classList.add("sidebar-open");
    $("#sidebar")?.classList.add("open");
    $("#sidebarScrim")?.classList.add("show");
  }
  function toggleSidebarUI() {
    const isOpen = $("#sidebar")?.classList.contains("open");
    if (isOpen) closeSidebarUI(); else openSidebarUI();
  }
  function createNewChat() {
    const id = uid();
    chats[id] = { id, title: "নতুন চ্যাট " + (Object.keys(chats).length + 1), messages: [] };
    activeId = id;
    saveChats();
    renderChatList();
    renderMessages();
    closeSidebarUI();
  }
  function deleteChat(id) {
    if (!chats[id]) return;
    delete chats[id];
    if (activeId === id) activeId = Object.keys(chats)[0] || null;
    if (!activeId) { createNewChat(); return; }
    saveChats(); renderChatList(); renderMessages();
  }
  function selectChat(id) {
    if (!chats[id]) return;
    activeId = id;
    saveChats(); renderChatList(); renderMessages();
    closeSidebarUI();
  }
  function renderChatList() {
    const list = $("#chatList"); if (!list) return;
    list.innerHTML = "";
    Object.values(chats).forEach(c => {
      const el = document.createElement("div");
      el.className = "chat-item" + (c.id === activeId ? " active" : "");
      el.innerHTML = `
        <svg class="ic"><use href="#i-chat"/></svg>
        <span class="chat-title">${escapeHtml(c.title)}</span>
        <button class="delete-chat" data-id="${c.id}" title="মুছুন"><svg class="ic"><use href="#i-trash"/></svg></button>`;
      el.addEventListener("click", (e) => {
        if (e.target.closest(".delete-chat")) { e.stopPropagation(); deleteChat(c.id); }
        else selectChat(c.id);
      });
      list.appendChild(el);
    });
  }

  // ---------- Messages ----------
  function renderMessages() {
    const container = $("#messagesContainer"); if (!container) return;
    const chat = chats[activeId];
    const welcome = $("#welcome");
    if (!chat || chat.messages.length === 0) {
      container.innerHTML = "";
      if (welcome) welcome.hidden = false;
      return;
    }
    if (welcome) welcome.hidden = true;
    container.innerHTML = "";
    chat.messages.forEach((m, idx) => {
      const d = document.createElement("div");
      d.className = "msg " + (m.role === "user" ? "user" : "bot");
      let html = "";
      if (m.image) html += `<div class="msg-img-wrapper"><img src="${m.image}" class="msg-img" alt=""/></div>`;
      if (m.text) {
        // 🔥 বট মেসেজ হলে [IMAGE: ID] পার্সিং করবে
        let textToRender = m.text;
        if (m.role !== "user") {
          textToRender = parseImagesInReply(textToRender);
        }
        const parsed = (typeof marked !== "undefined") ? marked.parse(textToRender) : textToRender;
        const clean  = (typeof DOMPurify !== "undefined") ? DOMPurify.sanitize(parsed) : parsed;
        html += `<div class="msg-text markdown-body">${clean}</div>`;
      }
      if (m.role !== "user" && m.text) {
        html += `
          <div class="msg-actions">
            <button class="ic-btn copy-btn" data-idx="${idx}" title="কপি"><svg class="ic"><use href="#i-copy"/></svg></button>
            <button class="ic-btn speak-btn" data-idx="${idx}" title="শুনুন"><svg class="ic"><use href="#i-volume"/></svg></button>
          </div>`;
      }
      d.innerHTML = html;
      container.appendChild(d);
    });
    // wire copy / speak
    $$(".copy-btn", container).forEach(b => b.addEventListener("click", e => {
      const i = +e.currentTarget.getAttribute("data-idx");
      const t = chat.messages[i]?.text || "";
      navigator.clipboard?.writeText(t).then(() => flash("কপি হয়েছে"));
    }));
    $$(".speak-btn", container).forEach(b => b.addEventListener("click", e => {
      const i = +e.currentTarget.getAttribute("data-idx");
      const t = chat.messages[i]?.text || "";
      if (t) speak(t);
    }));
    container.scrollTop = container.scrollHeight;
  }

  function flash(msg) {
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText = "position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:rgba(0,0,0,.8);color:#00ffc8;padding:8px 14px;border-radius:12px;z-index:9999;font-size:13px;";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  // ---------- TTS ----------
  let currentAudio = null;
  let isMuted = false;

  function stopAllTTS() {
    try { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); } catch {}
    if (currentAudio) { try { currentAudio.pause(); currentAudio.src = ""; } catch {} currentAudio = null; }
  }

  async function speak(text) {
    if (isMuted || !text) return;
    stopAllTTS();
    const v = settings.voice || "";
    try {
      if (v.startsWith("edge:")) {
        if (await playRemote("/edge-tts", { text, voice: v.slice(5) })) return;
      } else if (v.startsWith("eleven:")) {
        if (await playRemote("/voice", { text, voiceId: v.slice(7) })) return;
      }
      if (await playRemote("/edge-tts", { text, voice: "bn-BD-NabanitaNeural" })) return;
      if (await playRemote("/voice", { text })) return;
    } catch (e) { console.warn("tts remote failed", e); }
    browserSpeak(text);
  }

  async function playRemote(path, body) {
    try {
      const r = await fetch(api(path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok || r.status === 204) return false;
      const buf = await r.arrayBuffer();
      if (!buf || buf.byteLength < 100) return false;
      const blob = new Blob([buf], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      currentAudio = new Audio(url);
      await currentAudio.play().catch(() => {});
      return true;
    } catch { return false; }
  }

  function browserSpeak(text) {
    if (!("speechSynthesis" in window)) return;
    const clean = String(text).replace(/[*_`#~]/g, "");
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = "bn-BD";
    const v = settings.voice || "";
    if (v.startsWith("browser:")) {
      const wanted = v.slice(8);
      const found = speechSynthesis.getVoices().find(x => x.name === wanted);
      if (found) { u.voice = found; u.lang = found.lang; }
    }
    speechSynthesis.speak(u);
  }

  // ---------- File attach ----------
  let attachedFile = null;
  function handleAttachment(e) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      attachedFile = ev.target.result;
      const bar = $("#attachmentBar");
      if (bar) {
        bar.innerHTML = `<span>📎 ${escapeHtml(file.name)}</span><button id="clearAttach" class="ic-btn"><svg class="ic"><use href="#i-close"/></svg></button>`;
        bar.hidden = false;
        $("#clearAttach")?.addEventListener("click", () => {
          attachedFile = null; bar.hidden = true; $("#fileInput").value = "";
        });
      }
    };
    reader.readAsDataURL(file);
  }

  // ---------- Send ----------
  async function handleSend(forcedText) {
    const input = $("#chatInput");
    const text = (forcedText ?? input?.value ?? "").trim();
    if (!text && !attachedFile) return;
    if (input && !forcedText) { input.value = ""; input.style.height = "auto"; }

    const chat = chats[activeId]; if (!chat) return;
    chat.messages.push({ role: "user", text, image: attachedFile });
    if (chat.title.startsWith("নতুন চ্যাট") && text) {
      chat.title = text.slice(0, 20) + (text.length > 20 ? "…" : "");
    }
    const imgForServer = attachedFile;
    attachedFile = null;
    const bar = $("#attachmentBar"); if (bar) bar.hidden = true;
    renderMessages(); renderChatList(); saveChats();

    const loadWrap = document.createElement("div");
    loadWrap.className = "msg bot";
    loadWrap.innerHTML = `<div class="msg-text"><div class="typing-loader"><span></span><span></span><span></span></div></div>`;
    $("#messagesContainer")?.appendChild(loadWrap);
    $("#messagesContainer").scrollTop = $("#messagesContainer").scrollHeight;

    try {
      const messages = chat.messages
        .filter(m => m.text || m.image)
        .map(m => ({ role: m.role === "user" ? "user" : "assistant", text: m.text || "" }));

      const sys = settings.prompt && settings.prompt.trim()
        ? `${settings.prompt}\n\nইউজারের নাম: ${settings.userName || "দাদা"}.`
        : "";

      const r = await fetch(api("/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, image: imgForServer, systemPrompt: sys }),
      });
      loadWrap.remove();
      if (!r.ok) throw new Error("server " + r.status);
      const data = await r.json();
      const reply = data.reply || "দুঃখিত, এই মুহূর্তে উত্তর দিতে পারছি না।";
      chat.messages.push({ role: "assistant", text: reply });
      saveChats(); renderMessages();
      speak(reply);
      return reply;
    } catch (err) {
      loadWrap.remove();
      console.error(err);
      chat.messages.push({
        role: "assistant",
        text: "দুঃখিত, সার্ভারে কানেক্ট করা যাচ্ছে না। দয়া করে API Key গুলো (GEMINI / GROQ / OPENROUTER / DEEPSEEK / ELEVENLABS) Render-এ Environment Variables হিসেবে সেট করুন।",
      });
      saveChats(); renderMessages();
    }
  }

  // ---------- Speech Recognition (mic + calls) ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let micRec = null;
  let callRec = null;
  let callActive = false;

  function micToggle() {
    if (!SR) { flash("এই ব্রাউজারে ভয়েস ইনপুট সাপোর্ট নেই"); return; }
    const btn = $("#micBtn");
    if (micRec) { try { micRec.stop(); } catch {} micRec = null; btn?.classList.remove("active"); return; }
    micRec = new SR();
    micRec.lang = "bn-BD";
    micRec.interimResults = false;
    micRec.continuous = false;
    micRec.onresult = (e) => {
      const txt = Array.from(e.results).map(r => r[0].transcript).join(" ").trim();
      if (txt) {
        const input = $("#chatInput");
        if (input) { input.value = (input.value ? input.value + " " : "") + txt; input.focus(); }
      }
    };
    micRec.onend = () => { btn?.classList.remove("active"); micRec = null; };
    micRec.onerror = () => { btn?.classList.remove("active"); micRec = null; };
    btn?.classList.add("active");
    try { micRec.start(); } catch { micRec = null; btn?.classList.remove("active"); }
  }

  // ---------- Settings modal ----------
  async function openSettings() {
    $("#inputUserName").value = settings.userName || "";
    $("#inputPrompt").value   = settings.prompt   || "";
    $("#logoUrl").value       = settings.logoUrl  || "";
    await populateVoices();
    $("#settingsModal").hidden = false;
    $("#settingsScrim").hidden = false;
  }
  function closeSettings() {
    $("#settingsModal").hidden = true;
    $("#settingsScrim").hidden = true;
  }
  function saveSettingsForm() {
    settings.userName = $("#inputUserName").value.trim() || "দাদা";
    settings.prompt   = $("#inputPrompt").value.trim();
    settings.logoUrl  = $("#logoUrl").value.trim();
    settings.voice    = $("#voiceSelect").value || settings.voice;
    saveSettings();
    applyLogo();
    closeSettings();
    flash("সেটিংস সেভ হয়েছে");
  }
  function resetSettings() {
    settings = { voice: "edge:bn-BD-NabanitaNeural", userName: "দাদা", prompt: "", logoUrl: "" };
    saveSettings();
    openSettings();
    flash("রিসেট হয়েছে");
  }

  async function populateVoices() {
    const sel = $("#voiceSelect"); if (!sel) return;
    sel.innerHTML = "";

    let edge = [];
    try {
      const r = await fetch(api("/edge-voices"));
      if (r.ok) edge = (await r.json()).voices || [];
    } catch {}
    if (edge.length) {
      const g = document.createElement("optgroup"); g.label = "Microsoft Edge TTS (সুপারিশকৃত)";
      edge.forEach(v => {
        const o = document.createElement("option");
        o.value = "edge:" + v.id; o.textContent = v.name;
        g.appendChild(o);
      });
      sel.appendChild(g);
    }

    try {
      const r = await fetch(api("/voices"));
      if (r.ok) {
        const list = (await r.json()).voices || [];
        if (list.length) {
          const g = document.createElement("optgroup"); g.label = "ElevenLabs";
          list.forEach(v => {
            const o = document.createElement("option");
            o.value = "eleven:" + v.voice_id; o.textContent = v.name;
            g.appendChild(o);
          });
          sel.appendChild(g);
        }
      }
    } catch {}

    if ("speechSynthesis" in window) {
      const bv = speechSynthesis.getVoices();
      if (bv.length) {
        const g = document.createElement("optgroup"); g.label = "ব্রাউজার ভয়েস";
        bv.forEach(v => {
          const o = document.createElement("option");
          o.value = "browser:" + v.name; o.textContent = `${v.name} (${v.lang})`;
          g.appendChild(o);
        });
        sel.appendChild(g);
      }
    }

    if (settings.voice) sel.value = settings.voice;
  }

  // ---------- Camera ----------
  let camStream = null;
  let camMode = "user";
  async function openCamera() {
    const view = $("#cameraView"); if (!view) return;
    view.hidden = false;
    await startCamStream($("#camVideo"));
  }
  async function startCamStream(videoEl) {
    stopCamStream();
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: camMode }, audio: false,
      });
      videoEl.srcObject = camStream;
    } catch (e) { flash("ক্যামেরা অ্যাক্সেস ব্যর্থ"); }
  }
  function stopCamStream() {
    if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  }
  function closeCamera() {
    stopCamStream();
    $("#cameraView").hidden = true;
  }
  async function flipCamera() {
    camMode = camMode === "user" ? "environment" : "user";
    await startCamStream($("#camVideo"));
  }
  async function askCamera() {
    const video = $("#camVideo"); const canvas = $("#camCanvas");
    if (!video?.videoWidth) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const cap = $("#camCaption"); if (cap) cap.textContent = "বিশ্লেষণ হচ্ছে…";
    try {
      const r = await fetch(api("/analyze"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "এই দৃশ্যে কী দেখা যাচ্ছে বাংলায় বুঝিয়ে বলো।",
          file: dataUrl, mime: "image/jpeg",
          systemPrompt: settings.prompt || "",
        }),
      });
      const data = await r.json();
      const reply = data.reply || "কিছু বুঝতে পারলাম না।";
      if (cap) cap.textContent = reply;
      speak(reply);
    } catch (e) { if (cap) cap.textContent = "সমস্যা হয়েছে।"; }
  }

  // ---------- Call mode (audio + video, Gemini-live style) ----------
  let callType = null;
  function startCall(type) {
    if (!SR) { flash("এই ব্রাউজারে কল সাপোর্ট নেই (Chrome/Edge সুপারিশকৃত)"); return; }
    callType = type; callActive = true;
    const view = $(type === "audio" ? "#audioCallView" : "#videoCallView");
    view.hidden = false;

// 🔥 ভিডিও কলের জন্য ইকো ক্যান্সেলেশন সহ ক্যামেরা স্ট্রিম
    if (type === "video") {
      (async () => {
        try {
          stopCamStream();
          camStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: camMode },
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          const vid = $("#videoCallVideo");
          if (vid) vid.srcObject = camStream;
        } catch (e) { flash("ক্যামেরা/মাইক অ্যাক্সেস ব্যর্থ"); }
      })();
    }

    setCallStatus("শুনছি…");
    listenLoop();
  }
  function endCall() {
    callActive = false;
    try { callRec?.stop(); } catch {}
    callRec = null;
    stopAllTTS();
    if (callType === "video") stopCamStream();
    $("#audioCallView").hidden = true;
    $("#videoCallView").hidden = true;
    callType = null;
  }
  function setCallStatus(txt) {
    if (callType === "audio") { const e = $("#audioCallStatus"); if (e) e.textContent = txt; }
    if (callType === "video") { const e = $("#videoCallStatus"); if (e) e.textContent = txt; }
  }
  function setCallCaption(txt) {
    const id = callType === "audio" ? "#audioCallCaption" : "#videoCallCaption";
    const e = $(id); if (e) e.textContent = txt;
  }
  function listenLoop() {
    if (!callActive) return;
    if (currentAudio && !currentAudio.paused) {
      currentAudio.onended = () => listenLoop();
      return;
    }
    try { callRec?.stop(); } catch {}
    callRec = new SR();
    callRec.lang = "bn-BD";
    callRec.interimResults = true;
    callRec.continuous = false;
    let finalText = "";
    callRec.onresult = (e) => {
      let interim = "";
      for (const res of e.results) {
        if (res.isFinal) finalText += res[0].transcript + " ";
        else interim += res[0].transcript;
      }
      setCallCaption(finalText + interim);
    };
    callRec.onerror = () => { if (callActive) setTimeout(listenLoop, 600); };
    callRec.onend = async () => {
      const text = finalText.trim();
      if (!callActive) return;
      if (!text) { listenLoop(); return; }
      setCallStatus("ভাবছি…");
      const reply = await handleSend(text);
      setCallStatus("কথা বলছি…");
      const wait = setInterval(() => {
        if (!callActive) { clearInterval(wait); return; }
        if (!currentAudio || currentAudio.paused || currentAudio.ended) {
          clearInterval(wait);
          setCallStatus("শুনছি…");
          listenLoop();
        }
      }, 400);
      if (!currentAudio) setTimeout(() => { if (callActive) { setCallStatus("শুনছি…"); listenLoop(); } }, 2500);
      void reply;
    };
    try { callRec.start(); } catch { setTimeout(listenLoop, 700); }
  }
  function toggleMute() {
    isMuted = !isMuted;
    if (isMuted) stopAllTTS();
    flash(isMuted ? "মিউট" : "আনমিউট");
  }

  // ---------- Boot ----------
  document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    loadChats();
    renderChatList();
    renderMessages();

    // Sidebar
    $("#newChatBtn")?.addEventListener("click", createNewChat);
    $("#menuBtn")?.addEventListener("click", toggleSidebarUI);
    $("#closeSidebar")?.addEventListener("click", closeSidebarUI);
    $("#sidebarScrim")?.addEventListener("click", closeSidebarUI);

    // Composer
    $("#sendBtn")?.addEventListener("click", () => handleSend());
    $("#chatInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
    $("#chatInput")?.addEventListener("input", (e) => {
      e.target.style.height = "auto";
      e.target.style.height = Math.min(e.target.scrollHeight, 180) + "px";
    });
    $("#attachBtn")?.addEventListener("click", () => $("#fileInput")?.click());
    $("#fileInput")?.addEventListener("change", handleAttachment);
    $("#micBtn")?.addEventListener("click", micToggle);

    // Settings
    $("#settingsBtn")?.addEventListener("click", openSettings);
    $("#closeSettingsBtn")?.addEventListener("click", closeSettings);
    $("#settingsScrim")?.addEventListener("click", closeSettings);
    $("#saveSettingsBtn")?.addEventListener("click", saveSettingsForm);
    $("#resetSettings")?.addEventListener("click", resetSettings);
    $("#testVoice")?.addEventListener("click", () => {
      const sel = $("#voiceSelect");
      if (sel) settings.voice = sel.value || settings.voice;
      speak("আসসালামু আলাইকুম দাদা, আমি পারিসা — আপনার কণ্ঠস্বর পরীক্ষা করছি।");
    });

    // Camera
    $("#cameraBtn")?.addEventListener("click", openCamera);
    $("#closeCam")?.addEventListener("click", closeCamera);
    $("#flipCam")?.addEventListener("click", flipCamera);
    $("#askCamBtn")?.addEventListener("click", askCamera);
    $("#camMicBtn")?.addEventListener("click", micToggle);

    // Calls
    $("#audioCallBtn")?.addEventListener("click", () => startCall("audio"));
    $("#videoCallBtn")?.addEventListener("click", () => startCall("video"));
    $("#endAudioCall")?.addEventListener("click", endCall);
    $("#endVideoCall")?.addEventListener("click", endCall);
    $("#muteAudioCall")?.addEventListener("click", toggleMute);
    $("#muteVideoCall")?.addEventListener("click", toggleMute);
    $("#flipVideoCall")?.addEventListener("click", async () => {
      camMode = camMode === "user" ? "environment" : "user";
      await startCamStream($("#videoCallVideo"));
    });

    // Suggestions
    $$(".suggestions .sugg").forEach(b => b.addEventListener("click", () => {
      const t = b.textContent || ""; handleSend(t);
    }));

    // Preload voices
    if ("speechSynthesis" in window) {
      speechSynthesis.getVoices();
      speechSynthesis.onvoiceschanged = () => {};
    }
  });

  window.viewImage = (src) => window.open(src, "_blank");
})();