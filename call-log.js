/* Call Log: per-game spoken/typed play lists + CSV export */

const CALL_LOG_KEY = "rhs-call-log-v1";
const CALL_LOG_TOKEN_KEY = "rhs-gh-token";
const CALL_LOG_REPO = "miketorg/rhs-installs";
const CALL_LOG_PATH = "call-logs/store.json";

const callLog = {
  games: null,
  gameId: null,
  listening: false,
  recognition: null,
  mediaRecorder: null,
  mediaChunks: [],
  mediaStream: null,
  syncing: false,
};

function loadCallStore() {
  try {
    return JSON.parse(localStorage.getItem(CALL_LOG_KEY) || "{}");
  } catch (_) {
    return {};
  }
}

function saveCallStore(store) {
  localStorage.setItem(CALL_LOG_KEY, JSON.stringify(store));
}

function getGameCalls(gameId) {
  const store = loadCallStore();
  return Array.isArray(store[gameId]) ? store[gameId] : [];
}

function setGameCalls(gameId, calls) {
  const store = loadCallStore();
  store[gameId] = calls;
  saveCallStore(store);
}

function normalizePlayCall(raw) {
  let s = String(raw || "").toUpperCase().trim();
  // spoken helpers
  const words = {
    ZERO: "0",
    OH: "0",
    ONE: "1",
    TWO: "2",
    THREE: "3",
    FOUR: "4",
    FIVE: "5",
    SIX: "6",
    SEVEN: "7",
    EIGHT: "8",
    NINE: "9",
    TEN: "10",
    ELEVEN: "11",
    TWELVE: "12",
    THIRTEEN: "13",
    FOURTEEN: "14",
    FIFTEEN: "15",
    SIXTEEN: "16",
    SEVENTEEN: "17",
    EIGHTEEN: "18",
    NINETEEN: "19",
    TWENTY: "20",
    THIRTY: "30",
    FORTY: "40",
    FIFTY: "50",
  };
  s = s.replace(/[^A-Z0-9\s]/g, " ");
  s = s
    .split(/\s+/)
    .map((w) => words[w] || w)
    .join(" ");
  // "BLUE 23" / "blue twenty three" -> BLUE23
  s = s.replace(/\s+/g, "");
  return s;
}

function formatCallTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch (_) {
    return iso;
  }
}

function gameById(id) {
  return (callLog.games?.games || []).find((g) => g.id === id);
}

function todayGameId() {
  const today = todayDateStr();
  const games = callLog.games?.games || [];
  const match = games.find((g) => g.date === today);
  return match ? match.id : null;
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportGameCsv(gameId) {
  const game = gameById(gameId);
  const calls = getGameCalls(gameId);
  const rows = [
    ["game", "date", "play", "spoken_raw", "recorded_at", "has_audio"],
    ...calls.map((c) => [
      game?.name || gameId,
      game?.date || "",
      c.play,
      c.raw || "",
      c.at,
      c.audio ? "yes" : "no",
    ]),
  ];
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  const safe = (game?.name || gameId).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  a.href = URL.createObjectURL(blob);
  a.download = `${safe || "calls"}-play-log.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

async function startAudioCapture() {
  callLog.mediaChunks = [];
  callLog.mediaRecorder = null;
  callLog.mediaStream = null;
  if (!navigator.mediaDevices?.getUserMedia) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    callLog.mediaStream = stream;
    const rec = new MediaRecorder(stream);
    callLog.mediaRecorder = rec;
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) callLog.mediaChunks.push(e.data);
    };
    rec.start();
  } catch (_) {
    /* mic optional */
  }
}

function stopAudioCapture() {
  return new Promise((resolve) => {
    const rec = callLog.mediaRecorder;
    const stream = callLog.mediaStream;
    if (!rec || rec.state === "inactive") {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      callLog.mediaStream = null;
      resolve(null);
      return;
    }
    rec.onstop = async () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      callLog.mediaStream = null;
      if (!callLog.mediaChunks.length) {
        resolve(null);
        return;
      }
      const blob = new Blob(callLog.mediaChunks, { type: rec.mimeType || "audio/webm" });
      callLog.mediaChunks = [];
      // Keep audio small for localStorage — skip if huge
      if (blob.size > 350000) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    };
    try {
      rec.stop();
    } catch (_) {
      resolve(null);
    }
  });
}

function addCallToGame(gameId, play, raw, audio) {
  const calls = getGameCalls(gameId);
  calls.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    play,
    raw: raw || play,
    at: new Date().toISOString(),
    audio: audio || null,
  });
  setGameCalls(gameId, calls);
}

function deleteCall(gameId, callId) {
  setGameCalls(
    gameId,
    getGameCalls(gameId).filter((c) => c.id !== callId)
  );
}

function getGithubToken() {
  return localStorage.getItem(CALL_LOG_TOKEN_KEY) || "";
}

function setGithubToken(token) {
  if (token) localStorage.setItem(CALL_LOG_TOKEN_KEY, token.trim());
  else localStorage.removeItem(CALL_LOG_TOKEN_KEY);
}

function promptGithubToken() {
  const existing = getGithubToken();
  const token = window.prompt(
    "Paste a GitHub token with access to miketorg/rhs-installs (Contents: Read/Write).\n\nOr cancel and use Load token from file instead.\n\nToken stays on this phone only.",
    existing || ""
  );
  if (token === null) return null;
  setGithubToken(token.trim());
  return token.trim() || null;
}

function getInviteLink(token = getGithubToken()) {
  if (!token) return "";
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  // Keep path to the app root
  const base = `${url.origin}${url.pathname.replace(/index\.html$/i, "")}`;
  return `${base}?gh_token=${encodeURIComponent(token)}`;
}

function captureTokenFromUrl() {
  try {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get("gh_token") || url.searchParams.get("token");
    let fromHash = "";
    if (url.hash && url.hash.includes("gh_token=")) {
      fromHash = decodeURIComponent(url.hash.replace(/^#/, "").split("gh_token=")[1] || "");
    }
    const token = (fromQuery || fromHash || "").trim();
    if (!token) return false;
    setGithubToken(token);
    // Remove token from the visible URL
    url.searchParams.delete("gh_token");
    url.searchParams.delete("token");
    url.hash = "";
    window.history.replaceState({}, "", url.pathname + url.search);
    return true;
  } catch (_) {
    return false;
  }
}

async function shareInviteLink() {
  const token = getGithubToken() || promptGithubToken();
  if (!token) return;
  const link = getInviteLink(token);
  if (navigator.share) {
    try {
      await navigator.share({
        title: "RHS Call Log access",
        text: "Open this once to save cloud sync on your phone.",
        url: link,
      });
      return;
    } catch (_) {
      /* fall through to copy */
    }
  }
  try {
    await navigator.clipboard.writeText(link);
    alert("Invite link copied. Text/AirDrop it. They open it once and the token is saved.");
  } catch (_) {
    window.prompt("Copy this invite link:", link);
  }
}

function downloadTokenTemplate() {
  const body = [
    "# Paste your GitHub token on the next line (delete this comment line).",
    "# Create a token at: https://github.com/settings/tokens",
    "# Needs access to miketorg/rhs-installs with Contents Read/Write.",
    "",
    "PASTE_TOKEN_HERE",
    "",
  ].join("\n");
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "github-token.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

function loadGithubTokenFromFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,text/plain";
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const text = (await file.text()).trim();
        // Allow files like: token=ghp_xxx  or just the raw token on first line
        let token = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || "";
        const m = token.match(/(?:token|github_token|gh_token)\s*[:=]\s*(\S+)/i);
        if (m) token = m[1];
        token = token.replace(/^["']|["']$/g, "").trim();
        if (!token) {
          alert("That file did not contain a token.");
          resolve(null);
          return;
        }
        setGithubToken(token);
        alert("Cloud token saved on this phone.");
        resolve(token);
      } catch (err) {
        alert("Could not read that file.");
        resolve(null);
      }
    };
    input.click();
  });
}

function storeForCloud(store) {
  // Keep lists small in git — play names/times only (no audio blobs)
  const out = {};
  for (const [gameId, calls] of Object.entries(store || {})) {
    out[gameId] = (calls || []).map((c) => ({
      id: c.id,
      play: c.play,
      raw: c.raw || "",
      at: c.at,
    }));
  }
  return {
    updatedAt: new Date().toISOString(),
    games: out,
  };
}

function mergeCallLists(localCalls, cloudCalls) {
  const map = new Map();
  [...(cloudCalls || []), ...(localCalls || [])].forEach((c) => {
    if (!c?.id) return;
    const prev = map.get(c.id);
    if (!prev || String(c.at) > String(prev.at)) map.set(c.id, { ...prev, ...c });
  });
  return [...map.values()].sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

async function githubGetStore(token) {
  const res = await fetch(`https://api.github.com/repos/${CALL_LOG_REPO}/contents/${CALL_LOG_PATH}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (res.status === 404) return { sha: null, data: { games: {} } };
  if (!res.ok) throw new Error(`GitHub read failed (${res.status})`);
  const body = await res.json();
  const json = JSON.parse(atob(body.content.replace(/\n/g, "")));
  return { sha: body.sha, data: json };
}

function toBase64Utf8(text) {
  return btoa(unescape(encodeURIComponent(text)));
}

async function ensureGithubToken() {
  let token = getGithubToken();
  if (token) return token;
  const choice = window.confirm(
    "No cloud token saved yet.\n\nOK = Load token from a file\nCancel = Paste token"
  );
  if (choice) token = await loadGithubTokenFromFile();
  else token = promptGithubToken();
  return token || null;
}

async function syncCallsToCloud() {
  const token = await ensureGithubToken();
  if (!token) return;

  callLog.syncing = true;
  try {
    const local = loadCallStore();
    const { sha, data: cloud } = await githubGetStore(token);
    const merged = {};
    const ids = new Set([...Object.keys(local), ...Object.keys(cloud.games || {})]);
    ids.forEach((id) => {
      merged[id] = mergeCallLists(local[id] || [], (cloud.games || {})[id] || []);
    });
    // Keep any local audio when saving back to phone
    const withAudio = {};
    ids.forEach((id) => {
      const audioMap = new Map((local[id] || []).filter((c) => c.audio).map((c) => [c.id, c.audio]));
      withAudio[id] = merged[id].map((c) => (audioMap.has(c.id) ? { ...c, audio: audioMap.get(c.id) } : c));
    });
    saveCallStore(withAudio);

    const payload = storeForCloud(withAudio);
    const content = toBase64Utf8(JSON.stringify(payload, null, 2));
    const put = await fetch(`https://api.github.com/repos/${CALL_LOG_REPO}/contents/${CALL_LOG_PATH}`, {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `Sync call log ${new Date().toISOString()}`,
        content,
        sha: sha || undefined,
      }),
    });
    if (!put.ok) {
      const err = await put.text();
      throw new Error(`GitHub write failed (${put.status}): ${err.slice(0, 180)}`);
    }
    alert("Call log synced to the cloud.");
  } catch (err) {
    console.error(err);
    alert(`Cloud sync failed.\n\n${err.message || err}`);
  } finally {
    callLog.syncing = false;
  }
}

async function pullCallsFromCloud() {
  const token = await ensureGithubToken();
  if (!token) return;

  callLog.syncing = true;
  try {
    const local = loadCallStore();
    const { data: cloud } = await githubGetStore(token);
    const merged = {};
    const ids = new Set([...Object.keys(local), ...Object.keys(cloud.games || {})]);
    ids.forEach((id) => {
      const audioMap = new Map((local[id] || []).filter((c) => c.audio).map((c) => [c.id, c.audio]));
      merged[id] = mergeCallLists(local[id] || [], (cloud.games || {})[id] || []).map((c) =>
        audioMap.has(c.id) ? { ...c, audio: audioMap.get(c.id) } : c
      );
    });
    saveCallStore(merged);
    alert("Pulled latest call log from the cloud.");
  } catch (err) {
    console.error(err);
    alert(`Cloud pull failed.\n\n${err.message || err}`);
  } finally {
    callLog.syncing = false;
  }
}

function cloudToolbarHtml(mode = "home") {
  const hasToken = !!getGithubToken();
  if (mode === "game") {
    return `
      <div class="call-toolbar cloud-toolbar">
        <button type="button" id="syncCloudBtn" class="timer-btn">Sync to cloud</button>
        <button type="button" id="pullCloudBtn" class="timer-btn">Pull from cloud</button>
      </div>
    `;
  }
  return `
    <div class="call-toolbar cloud-toolbar">
      <button type="button" id="shareTokenBtn" class="timer-btn">Share access link</button>
      <button type="button" id="loadTokenFileBtn" class="timer-btn">Load token from file</button>
      <button type="button" id="downloadTokenTplBtn" class="timer-btn">Download token file</button>
      <button type="button" id="tokenBtn" class="timer-btn">${hasToken ? "Update token" : "Paste token"}</button>
    </div>
    <p class="call-cloud-note">Set up cloud access here. Inside each game, use Sync to cloud / Pull from cloud.</p>
  `;
}

function wireCloudToolbar(after, mode = "home") {
  document.getElementById("syncCloudBtn")?.addEventListener("click", async () => {
    await syncCallsToCloud();
    after?.();
  });
  document.getElementById("pullCloudBtn")?.addEventListener("click", async () => {
    await pullCallsFromCloud();
    after?.();
  });
  if (mode === "game") return;
  document.getElementById("shareTokenBtn")?.addEventListener("click", async () => {
    await shareInviteLink();
    after?.();
  });
  document.getElementById("loadTokenFileBtn")?.addEventListener("click", async () => {
    await loadGithubTokenFromFile();
    after?.();
  });
  document.getElementById("downloadTokenTplBtn")?.addEventListener("click", () => {
    downloadTokenTemplate();
  });
  document.getElementById("tokenBtn")?.addEventListener("click", () => {
    promptGithubToken();
    after?.();
  });
}

function getSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  return SR ? new SR() : null;
}

async function toggleListen(gameId) {
  if (callLog.listening) {
    stopListening();
    return;
  }
  const recog = getSpeechRecognition();
  if (!recog) {
    alert("Voice recognition is not available in this browser. Type the play name instead.");
    return;
  }

  callLog.listening = true;
  callLog.recognition = recog;
  await startAudioCapture();
  updateListenButtons();

  recog.lang = "en-US";
  recog.interimResults = false;
  recog.maxAlternatives = 3;
  recog.continuous = false;

  recog.onresult = async (event) => {
    const raw = event.results?.[0]?.[0]?.transcript || "";
    const play = normalizePlayCall(raw);
    const audio = await stopAudioCapture();
    stopListening(false);
    if (!play) {
      alert("Didn't catch a play name. Try again.");
      renderCallGame(gameId);
      return;
    }
    addCallToGame(gameId, play, raw, audio);
    renderCallGame(gameId);
  };

  recog.onerror = async () => {
    await stopAudioCapture();
    stopListening(false);
    renderCallGame(gameId);
  };

  recog.onend = () => {
    if (callLog.listening) stopListening(false);
    updateListenButtons();
  };

  try {
    recog.start();
  } catch (_) {
    stopListening();
    alert("Could not start microphone listening.");
  }
}

function stopListening(stopAudio = true) {
  callLog.listening = false;
  try {
    callLog.recognition?.stop();
  } catch (_) {
    /* ignore */
  }
  callLog.recognition = null;
  if (stopAudio) stopAudioCapture();
  updateListenButtons();
}

function updateListenButtons() {
  const btn = document.getElementById("listenBtn");
  if (!btn) return;
  btn.classList.toggle("listening", callLog.listening);
  btn.textContent = callLog.listening ? "Listening… tap to stop" : "Speak play";
}

function renderCallLogHome() {
  state.view = "calls";
  state.scheduleDayId = null;
  state.daySlug = null;
  callLog.gameId = null;
  els.title.textContent = "Call Log";
  els.backBtn.classList.remove("hidden");
  els.search.closest(".search-wrap").classList.add("hidden");

  const today = todayDateStr();
  const cards = (callLog.games?.games || [])
    .map((g) => {
      const count = getGameCalls(g.id).length;
      const isToday = g.date === today;
      return `
        <button class="day-tile ${isToday ? "is-today" : ""}" data-game="${g.id}">
          <div>
            <h2>${g.name}</h2>
            <p class="count">${g.date}</p>
            <p class="tile-note">${count} play${count === 1 ? "" : "s"} recorded</p>
          </div>
          <p class="count">${isToday ? "TODAY · " : ""}Open list</p>
        </button>`;
    })
    .join("");

  els.app.innerHTML = `
    <p class="section-label">Pick a game or practice — each has its own play list</p>
    ${cloudToolbarHtml("home")}
    <div class="day-grid">${cards}</div>
  `;
  wireCloudToolbar(() => renderCallLogHome(), "home");
  els.app.querySelectorAll("[data-game]").forEach((btn) => {
    btn.addEventListener("click", () => renderCallGame(btn.dataset.game));
  });
}

function renderCallGame(gameId) {
  const game = gameById(gameId);
  if (!game) return renderCallLogHome();
  state.view = "call-game";
  callLog.gameId = gameId;
  els.title.textContent = game.name;
  els.backBtn.classList.remove("hidden");
  els.search.closest(".search-wrap").classList.add("hidden");

  const calls = getGameCalls(gameId);
  const list = calls.length
    ? calls
        .map(
          (c) => `
      <article class="call-row">
        <div class="call-main">
          <p class="call-play">${c.play}</p>
          <p class="call-meta">${formatCallTime(c.at)}${c.raw && c.raw !== c.play ? ` · “${c.raw}”` : ""}</p>
        </div>
        <div class="call-actions">
          ${c.audio ? `<button type="button" class="timer-btn" data-play-audio="${c.id}">Play</button>` : ""}
          <button type="button" class="timer-btn danger" data-del="${c.id}">Del</button>
        </div>
      </article>`
        )
        .join("")
    : `<div class="empty">No plays yet. Tap Speak play or type a call like BLUE23.</div>`;

  els.app.innerHTML = `
    <div class="schedule-head">
      <p class="section-label">${game.label}</p>
      <p class="schedule-focus">Say or type the play name to save it to this list</p>
    </div>
    <div class="call-record-box">
      <button type="button" id="listenBtn" class="listen-btn">Speak play</button>
      <form id="manualCallForm" class="manual-call">
        <input id="manualPlay" type="text" inputmode="text" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Or type BLUE23 / GREEN15" />
        <button type="submit" class="timer-start">Add</button>
      </form>
      <div class="call-toolbar">
        <button type="button" id="exportCsvBtn" class="timer-btn">Export CSV</button>
        <button type="button" id="clearCallsBtn" class="timer-btn danger">Clear list</button>
      </div>
      ${cloudToolbarHtml("game")}
    </div>
    <p class="section-label">${calls.length} recorded</p>
    <div class="call-list">${list}</div>
  `;

  updateListenButtons();
  document.getElementById("listenBtn").addEventListener("click", () => toggleListen(gameId));
  document.getElementById("manualCallForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("manualPlay");
    const raw = input.value.trim();
    const play = normalizePlayCall(raw);
    if (!play) return;
    addCallToGame(gameId, play, raw, null);
    input.value = "";
    renderCallGame(gameId);
  });
  document.getElementById("exportCsvBtn").addEventListener("click", () => exportGameCsv(gameId));
  document.getElementById("clearCallsBtn").addEventListener("click", () => {
    if (!getGameCalls(gameId).length) return;
    if (confirm(`Clear all plays for ${game.name}?`)) {
      setGameCalls(gameId, []);
      renderCallGame(gameId);
    }
  });
  wireCloudToolbar(() => renderCallGame(gameId), "game");
  els.app.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      deleteCall(gameId, btn.dataset.del);
      renderCallGame(gameId);
    });
  });
  els.app.querySelectorAll("[data-play-audio]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const call = getGameCalls(gameId).find((c) => c.id === btn.dataset.playAudio);
      if (!call?.audio) return;
      const audio = new Audio(call.audio);
      audio.play();
    });
  });
}
