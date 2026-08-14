/* Call Log: per-game spoken/typed play lists + CSV export */

const CALL_LOG_KEY = "rhs-call-log-v1";

const callLog = {
  games: null,
  gameId: null,
  listening: false,
  recognition: null,
  mediaRecorder: null,
  mediaChunks: [],
  mediaStream: null,
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
    <div class="day-grid">${cards}</div>
  `;
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
