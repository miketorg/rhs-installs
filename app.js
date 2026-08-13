const COLOR_HEX = {
  ORANGE: "#f07a1a",
  BLUE: "#2f6bff",
  BROWN: "#8b5a2b",
  PINK: "#e85aad",
  RED: "#d62828",
  GREEN: "#2a9d4a",
  YELLOW: "#e6c200",
  PURPLE: "#7b3fe4",
  BLACK: "#222222",
  WHITE: "#f0f0f0",
  GOLD: "#d4a017",
  SILVER: "#b0b0b0",
  GRAY: "#7a7a7a",
  GREY: "#7a7a7a",
  TEAL: "#1aa6a6",
  NAVY: "#1b3a6b",
  LIME: "#84cc16",
  CYAN: "#06b6d4",
  MAGENTA: "#c026d3",
  MAROON: "#7f1d1d",
  TREE: "#c8f542",
  MOTION: "#38bdf8",
};

const state = {
  data: null,
  schedule: null,
  view: "home", // home | day | search | schedule | schedule-day
  daySlug: null,
  scheduleDayId: null,
  query: "",
  list: [],
  index: -1,
};

const timer = {
  dayId: null,
  slotId: null,
  totalMs: 0,
  remainingMs: 0,
  running: false,
  paused: false,
  alarming: false,
  endsAt: 0,
  raf: 0,
  tickHandle: 0,
  audioCtx: null,
  alarmNodes: null,
  alarmAudio: null,
  audioKeepAlive: 0,
  vibrateHandle: 0,
};

const els = {
  app: document.getElementById("app"),
  title: document.getElementById("title"),
  backBtn: document.getElementById("backBtn"),
  search: document.getElementById("search"),
  clearSearch: document.getElementById("clearSearch"),
  offlineBadge: document.getElementById("offlineBadge"),
  viewer: document.getElementById("viewer"),
  viewerImg: document.getElementById("viewerImg"),
  viewerStack: document.getElementById("viewerStack"),
  viewerPlay: document.getElementById("viewerPlay"),
  viewerDay: document.getElementById("viewerDay"),
  prevPlay: document.getElementById("prevPlay"),
  nextPlay: document.getElementById("nextPlay"),
  timerDock: document.getElementById("timerDock"),
  timerPeriod: document.getElementById("timerPeriod"),
  timerTitle: document.getElementById("timerTitle"),
  timerDisplay: document.getElementById("timerDisplay"),
  timerPause: document.getElementById("timerPause"),
  timerSkip: document.getElementById("timerSkip"),
  timerBuzz: document.getElementById("timerBuzz"),
  timerStop: document.getElementById("timerStop"),
  timerBar: document.getElementById("timerBar"),
};

function normalizeQuery(q) {
  return String(q || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function colorHex(color) {
  return COLOR_HEX[color] || "#9fb5a6";
}

function setOfflineBadge() {
  els.offlineBadge.hidden = navigator.onLine;
}

function formatClock(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const hr = ((h + 11) % 12) + 1;
  return `${hr}:${String(m).padStart(2, "0")}${ampm}`;
}

function formatMs(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function todayDateStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function minutesNow() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function scheduleDayById(id) {
  return state.schedule.days.find((d) => d.id === id);
}

function findSlot(dayId, slotId) {
  const day = scheduleDayById(dayId);
  if (!day) return null;
  const index = day.slots.findIndex((s) => s.id === slotId);
  if (index < 0) return null;
  return { day, slot: day.slots[index], index };
}

function currentSlotForDay(day) {
  const now = minutesNow();
  return day.slots.find((s) => now >= toMinutes(s.start) && now < toMinutes(s.end)) || null;
}

function remainingMsInSlot(slot) {
  const now = minutesNow();
  const end = toMinutes(slot.end);
  return Math.max(0, (end - now) * 60 * 1000);
}

async function loadData() {
  const [playsRes, scheduleRes] = await Promise.all([
    fetch("plays.json", { cache: "no-cache" }),
    fetch("schedule.json", { cache: "no-cache" }),
  ]);
  if (!playsRes.ok) throw new Error("Could not load plays.json");
  if (!scheduleRes.ok) throw new Error("Could not load schedule.json");
  state.data = await playsRes.json();
  state.schedule = await scheduleRes.json();
}

function playsForDay(slug) {
  return state.data.plays.filter((p) => p.daySlug === slug);
}

function searchPlays(query) {
  const q = normalizeQuery(query);
  if (!q) return [];
  return state.data.plays.filter((p) => {
    const hay = p.search;
    return hay.includes(q) || p.color.includes(q) || p.number.includes(q) || `${p.color}${p.number}`.includes(q);
  });
}

async function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      if (!timer.audioCtx) timer.audioCtx = new AC();
      if (timer.audioCtx.state === "suspended") await timer.audioCtx.resume();
    }
  } catch (_) {
    /* ignore */
  }

  try {
    if (!timer.alarmAudio) {
      const audio = new Audio("./alarm.wav");
      audio.loop = true;
      audio.preload = "auto";
      audio.setAttribute("playsinline", "true");
      audio.volume = 1;
      timer.alarmAudio = audio;
    }
    const audio = timer.alarmAudio;
    audio.muted = true;
    audio.currentTime = 0;
    // Prime playback during the user tap so iOS allows later play()
    const p = audio.play();
    if (p && p.then) {
      await p;
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
    }
  } catch (_) {
    try {
      if (timer.alarmAudio) {
        timer.alarmAudio.pause();
        timer.alarmAudio.muted = false;
      }
    } catch (__) {
      /* ignore */
    }
  }
}

function keepAudioAlive() {
  if (timer.audioKeepAlive) return;
  timer.audioKeepAlive = setInterval(() => {
    if (!timer.running && !timer.alarming) return;
    try {
      if (timer.audioCtx && timer.audioCtx.state === "suspended") timer.audioCtx.resume();
    } catch (_) {
      /* ignore */
    }
  }, 10000);
}

function clearAudioKeepAlive() {
  if (timer.audioKeepAlive) {
    clearInterval(timer.audioKeepAlive);
    timer.audioKeepAlive = 0;
  }
}

function stopAlarm() {
  timer.alarming = false;
  if (timer.vibrateHandle) {
    clearInterval(timer.vibrateHandle);
    timer.vibrateHandle = 0;
  }
  if (timer.alarmNodes && timer.alarmNodes.pulseHandle) {
    clearInterval(timer.alarmNodes.pulseHandle);
  }
  if (navigator.vibrate) navigator.vibrate(0);
  if (timer.alarmAudio) {
    try {
      timer.alarmAudio.pause();
      timer.alarmAudio.currentTime = 0;
      timer.alarmAudio.muted = false;
    } catch (_) {
      /* ignore */
    }
  }
  if (timer.alarmNodes) {
    try {
      (timer.alarmNodes.oscillators || []).forEach((o) => {
        try {
          o.stop();
        } catch (_) {
          /* already stopped */
        }
      });
      if (timer.alarmNodes.gain) timer.alarmNodes.gain.disconnect();
    } catch (_) {
      /* ignore */
    }
    timer.alarmNodes = null;
  }
  els.timerDock.classList.remove("alarming");
}

async function playAlarmSound() {
  // HTMLAudio is the most reliable path on iPhone
  try {
    if (!timer.alarmAudio) {
      timer.alarmAudio = new Audio("./alarm.wav");
      timer.alarmAudio.loop = true;
      timer.alarmAudio.preload = "auto";
      timer.alarmAudio.setAttribute("playsinline", "true");
    }
    const audio = timer.alarmAudio;
    audio.loop = true;
    audio.muted = false;
    audio.volume = 1;
    audio.currentTime = 0;
    await audio.play();
    return true;
  } catch (_) {
    /* fall through to Web Audio */
  }

  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (!timer.audioCtx) timer.audioCtx = new AC();
    const ctx = timer.audioCtx;
    if (ctx.state === "suspended") await ctx.resume();

    const gain = ctx.createGain();
    gain.gain.value = 0.2;
    gain.connect(ctx.destination);

    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = "square";
    o2.type = "square";
    o1.frequency.value = 880;
    o2.frequency.value = 1174;
    o1.connect(gain);
    o2.connect(gain);
    o1.start();
    o2.start();

    let on = false;
    const pulseHandle = setInterval(() => {
      if (!timer.alarming) return;
      on = !on;
      try {
        gain.gain.setTargetAtTime(on ? 0.28 : 0.02, ctx.currentTime, 0.02);
        o1.frequency.setValueAtTime(on ? 880 : 1046, ctx.currentTime);
        o2.frequency.setValueAtTime(on ? 1174 : 1396, ctx.currentTime);
      } catch (__) {
        /* ignore */
      }
    }, 220);

    timer.alarmNodes = { oscillators: [o1, o2], gain, pulseHandle };
    return true;
  } catch (_) {
    return false;
  }
}

function startAlarm() {
  stopAlarm();
  timer.alarming = true;
  els.timerDock.classList.add("alarming");
  keepAudioAlive();

  playAlarmSound().then((ok) => {
    if (!ok) {
      els.timerTitle.textContent = "Tap BUZZ then End · check silent switch";
    }
  });

  if (navigator.vibrate) {
    navigator.vibrate([400, 200, 400, 200]);
    timer.vibrateHandle = setInterval(() => {
      if (timer.alarming && navigator.vibrate) navigator.vibrate([400, 200, 400, 200]);
    }, 1400);
  }
}

function updateTimerUI() {
  const found = findSlot(timer.dayId, timer.slotId);
  if (!found && !timer.alarming) {
    els.timerDock.classList.add("hidden");
    document.body.classList.remove("has-timer");
    return;
  }
  if (!found) return;
  els.timerDock.classList.remove("hidden");
  document.body.classList.add("has-timer");
  els.timerPeriod.textContent = timer.alarming
    ? `${found.day.name} · TIME UP`
    : `${found.day.name} · ${found.slot.period}`;
  els.timerTitle.textContent = timer.alarming
    ? "Buzzing… tap End to stop · flip silent switch off"
    : found.slot.title;
  els.timerDisplay.textContent = timer.alarming ? "00:00" : formatMs(timer.remainingMs);
  els.timerPause.textContent = timer.paused || !timer.running ? "Resume" : "Pause";
  els.timerPause.disabled = timer.alarming;
  els.timerSkip.disabled = timer.alarming;
  els.timerBuzz.classList.toggle("hidden", !timer.alarming);
  els.timerStop.textContent = "End";
  const actions = els.timerDock.querySelector(".timer-actions");
  if (actions) actions.classList.toggle("alarm-actions", timer.alarming);
  const pct = timer.alarming
    ? 0
    : timer.totalMs
      ? Math.max(0, Math.min(100, (timer.remainingMs / timer.totalMs) * 100))
      : 0;
  els.timerBar.style.width = `${pct}%`;
  els.timerDisplay.classList.toggle("urgent", timer.alarming || (timer.remainingMs <= 30000 && timer.remainingMs > 0));
  document.querySelectorAll(".slot-card").forEach((card) => {
    card.classList.toggle("timing", card.dataset.slotId === timer.slotId);
  });
}

function stopTimerLoop() {
  if (timer.tickHandle) {
    clearInterval(timer.tickHandle);
    timer.tickHandle = 0;
  }
}

function finishTimer() {
  timer.running = false;
  timer.paused = false;
  timer.remainingMs = 0;
  stopTimerLoop();
  startAlarm();
  updateTimerUI();
}

function tickTimer() {
  if (!timer.running || timer.paused) return;
  timer.remainingMs = Math.max(0, timer.endsAt - Date.now());
  updateTimerUI();
  if (timer.remainingMs <= 0) finishTimer();
}

function startTimer(dayId, slotId, durationMs) {
  const found = findSlot(dayId, slotId);
  if (!found) return;
  stopAlarm();
  unlockAudio();
  keepAudioAlive();
  timer.dayId = dayId;
  timer.slotId = slotId;
  timer.totalMs = durationMs;
  timer.remainingMs = durationMs;
  timer.running = true;
  timer.paused = false;
  timer.endsAt = Date.now() + durationMs;
  stopTimerLoop();
  timer.tickHandle = setInterval(tickTimer, 200);
  updateTimerUI();
  if (state.view === "schedule-day" && state.scheduleDayId === dayId) {
    const el = document.getElementById(`slot-${slotId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function pauseResumeTimer() {
  if (!timer.slotId) return;
  if (!timer.running && timer.remainingMs > 0) {
    timer.running = true;
    timer.paused = false;
    timer.endsAt = Date.now() + timer.remainingMs;
    stopTimerLoop();
    timer.tickHandle = setInterval(tickTimer, 200);
  } else if (timer.running && !timer.paused) {
    timer.paused = true;
    timer.remainingMs = Math.max(0, timer.endsAt - Date.now());
  } else if (timer.paused) {
    timer.paused = false;
    timer.endsAt = Date.now() + timer.remainingMs;
  }
  updateTimerUI();
}

function stopTimer() {
  const wasAlarming = timer.alarming;
  const finishedDayId = timer.dayId;
  const finishedSlotId = timer.slotId;
  stopAlarm();
  clearAudioKeepAlive();
  timer.running = false;
  timer.paused = false;
  timer.remainingMs = 0;
  timer.totalMs = 0;
  timer.slotId = null;
  timer.dayId = null;
  stopTimerLoop();
  updateTimerUI();
  document.querySelectorAll(".slot-card.timing").forEach((c) => c.classList.remove("timing"));

  // After silencing, offer the next period (does not auto-start)
  if (wasAlarming) {
    const found = findSlot(finishedDayId, finishedSlotId);
    if (found && found.index < found.day.slots.length - 1) {
      const next = found.day.slots[found.index + 1];
      const goNext = window.confirm(
        `Alarm off. Start next period?\n\n${next.period}: ${next.title} (${next.minutes} min)`
      );
      if (goNext) startTimer(found.day.id, next.id, next.minutes * 60 * 1000);
    }
  }
}

function skipTimer() {
  if (timer.alarming) return;
  const found = findSlot(timer.dayId, timer.slotId);
  if (!found) return;
  if (found.index >= found.day.slots.length - 1) {
    stopTimer();
    return;
  }
  const next = found.day.slots[found.index + 1];
  startTimer(found.day.id, next.id, next.minutes * 60 * 1000);
}

function renderHome() {
  state.view = "home";
  state.daySlug = null;
  state.scheduleDayId = null;
  els.title.textContent = "RHS Installs";
  els.backBtn.classList.add("hidden");
  els.search.closest(".search-wrap").classList.remove("hidden");

  const installDays = state.data.days.filter((d) => d.slug !== "motions");
  const motions = state.data.days.find((d) => d.slug === "motions");

  const days = installDays
    .map(
      (d) => `
      <button class="day-tile" data-day="${d.slug}">
        <div>
          <h2>${d.name}</h2>
          <p class="count">${d.playCount} plays</p>
          <div class="swatches">
            ${d.colors
              .map((c) => `<span class="swatch" title="${c}" style="background:${colorHex(c)}"></span>`)
              .join("")}
          </div>
        </div>
        <p class="count">Tap to open install</p>
      </button>`
    )
    .join("");

  const sched = state.schedule;
  const today = todayDateStr();
  const todayDay = sched.days.find((d) => d.date === today);

  const motionsTile = motions
    ? `
    <button class="day-tile motions-tile" data-day="motions">
      <div>
        <h2>${motions.name}</h2>
        <p class="count">${motions.playCount} diagrams</p>
        <p class="tile-note">Route tree · Zip Zap Jet Monkey</p>
      </div>
      <p class="count">Tap to open</p>
    </button>`
    : "";

  els.app.innerHTML = `
    <p class="section-label">Practice</p>
    <div class="day-grid">
      <button class="day-tile schedule-tile" id="openSchedule">
        <div>
          <h2>${sched.title}</h2>
          <p class="count">${sched.days.length} days · built-in timers</p>
          <p class="tile-note">${todayDay ? `Today: ${todayDay.name} ${todayDay.window}` : "Mon–Fri practice plan"}</p>
        </div>
        <p class="count">Open schedule + timers</p>
      </button>
      ${motionsTile}
    </div>
    <p class="section-label">Install packets</p>
    <div class="day-grid">${days}</div>
  `;

  document.getElementById("openSchedule").addEventListener("click", () => {
    if (todayDay) renderScheduleDay(todayDay.id);
    else renderScheduleHome();
  });
  els.app.querySelectorAll("[data-day]").forEach((btn) => {
    btn.addEventListener("click", () => renderDay(btn.dataset.day));
  });
}

function renderPlayGrid(plays, label) {
  if (!plays.length) {
    els.app.innerHTML = `<div class="empty">No plays match “${state.query}”. Try BLUE3 or ORANGE22.</div>`;
    return;
  }

  const cards = plays
    .map(
      (p, i) => `
      <button class="play-tile" data-index="${i}">
        <img src="${p.image}" alt="${p.play}" loading="lazy" />
        <div class="play-meta">
          <div class="play-name">
            <span class="color-dot" style="background:${colorHex(p.color)}"></span>${p.play}
          </div>
          <div class="play-day">${p.day}</div>
        </div>
      </button>`
    )
    .join("");

  els.app.innerHTML = `
    <p class="section-label">${label}</p>
    <div class="play-grid">${cards}</div>
  `;

  state.list = plays;
  els.app.querySelectorAll("[data-index]").forEach((btn) => {
    btn.addEventListener("click", () => openViewer(Number(btn.dataset.index)));
  });
}

function renderDay(slug) {
  const day = state.data.days.find((d) => d.slug === slug);
  if (!day) return renderHome();
  state.view = "day";
  state.daySlug = slug;
  state.scheduleDayId = null;
  state.query = "";
  els.search.value = "";
  els.clearSearch.classList.add("hidden");
  els.search.closest(".search-wrap").classList.remove("hidden");
  els.title.textContent = day.name;
  els.backBtn.classList.remove("hidden");
  renderPlayGrid(playsForDay(slug), `${day.playCount} plays`);
}

function renderSearch(query) {
  state.query = query;
  const q = normalizeQuery(query);
  els.clearSearch.classList.toggle("hidden", !query);

  if (!q) {
    if (state.view === "schedule" || state.view === "schedule-day") return;
    if (state.daySlug) renderDay(state.daySlug);
    else renderHome();
    return;
  }

  state.view = "search";
  els.title.textContent = "Search";
  els.backBtn.classList.remove("hidden");
  els.search.closest(".search-wrap").classList.remove("hidden");
  const results = searchPlays(q);
  renderPlayGrid(results, `${results.length} match${results.length === 1 ? "" : "es"} for ${q}`);
}

function renderScheduleHome() {
  state.view = "schedule";
  state.scheduleDayId = null;
  els.title.textContent = state.schedule.title;
  els.backBtn.classList.remove("hidden");
  els.search.closest(".search-wrap").classList.add("hidden");

  const today = todayDateStr();
  const cards = state.schedule.days
    .map((d) => {
      const isToday = d.date === today;
      return `
        <button class="day-tile ${isToday ? "is-today" : ""}" data-sched="${d.id}">
          <div>
            <h2>${d.name}</h2>
            <p class="count">${d.date} · Practice ${d.practice}</p>
            <p class="tile-note">${d.window} · ${d.gear}</p>
          </div>
          <p class="count">${d.slots.length} timed periods${isToday ? " · TODAY" : ""}</p>
        </button>`;
    })
    .join("");

  els.app.innerHTML = `
    <p class="section-label">Week 1 · tap a day</p>
    <div class="day-grid">${cards}</div>
    <p class="pdf-link-wrap"><a class="pdf-link" href="${state.schedule.pdf}" target="_blank" rel="noopener">Open original PDF</a></p>
  `;

  els.app.querySelectorAll("[data-sched]").forEach((btn) => {
    btn.addEventListener("click", () => renderScheduleDay(btn.dataset.sched));
  });
}

function slotGroupsHtml(slot) {
  const entries = Object.entries(slot.groups || {});
  if (!entries.length) return "";
  return `<ul class="slot-groups">${entries
    .map(([k, v]) => `<li><strong>${k}</strong> ${v}</li>`)
    .join("")}</ul>`;
}

function slotPlaysHtml(slot) {
  if (!slot.plays || !slot.plays.length) return "";
  const prefer = slot.preferPacket || "";
  return `<div class="play-chips">${slot.plays
    .map((p) => {
      const color = p.replace(/\d+/g, "");
      return `<button type="button" class="play-chip" data-play="${p}" data-prefer="${prefer}" style="--chip:${colorHex(color)}">${p}</button>`;
    })
    .join("")}</div>`;
}

function findVsPair(playName) {
  const q = normalizeQuery(playName);
  const all = state.data.plays.filter((p) => p.search === q || normalizeQuery(p.play) === q);
  const v34 = all.find((p) => p.daySlug === "day4groupo34" || p.vs === "3-4");
  const v44 = all.find((p) => p.daySlug === "day4groupo44" || p.vs === "4-4");
  if (v34 && v44) return { v34, v44 };
  return null;
}

function renderViewerStack(panels) {
  if (!panels.length) return;
  if (panels.length === 1) {
    els.viewerStack.classList.remove("dual");
    els.viewerStack.innerHTML = `<img id="viewerImg" alt="${panels[0].alt}" src="${panels[0].src}" />`;
    els.viewerImg = document.getElementById("viewerImg");
    return;
  }
  els.viewerStack.classList.add("dual");
  els.viewerStack.innerHTML = panels
    .map(
      (panel) => `
      <section class="viewer-panel">
        <p class="viewer-panel-label">${panel.label}</p>
        <img src="${panel.src}" alt="${panel.alt}" />
      </section>`
    )
    .join("");
  els.viewerImg = null;
}

function openPlayByName(playName, preferPacket) {
  const q = normalizeQuery(playName);
  const pair = findVsPair(playName);
  if (pair && (preferPacket === "day4groupo34" || preferPacket === "day4groupo44" || preferPacket === "both" || !preferPacket)) {
    // For Group/Team O chips, always show both defenses stacked
    if (preferPacket === "day4groupo34" || preferPacket === "day4groupo44" || preferPacket === "both") {
      state.list = [pair.v34, pair.v44];
      state.view = "search";
      els.title.textContent = playName;
      els.backBtn.classList.remove("hidden");
      els.search.closest(".search-wrap").classList.remove("hidden");
      els.search.value = playName;
      openDualViewer(pair.v34, pair.v44);
      return;
    }
  }

  let results = searchPlays(q);
  if (!results.length) return;
  if (preferPacket && preferPacket !== "both") {
    const preferred = results.filter((p) => p.daySlug === preferPacket);
    if (preferred.length) results = preferred;
  }
  results.sort((a, b) => {
    const ae = a.search === q ? 0 : 1;
    const be = b.search === q ? 0 : 1;
    return ae - be;
  });

  // If exact match has both 3-4 and 4-4, stack them
  const exact = results.filter((p) => p.search === q);
  const stacked = findVsPair(playName);
  if (stacked) {
    state.list = [stacked.v34, stacked.v44];
    state.view = "search";
    els.title.textContent = playName;
    els.backBtn.classList.remove("hidden");
    els.search.closest(".search-wrap").classList.remove("hidden");
    els.search.value = playName;
    openDualViewer(stacked.v34, stacked.v44);
    return;
  }

  els.search.closest(".search-wrap").classList.remove("hidden");
  els.search.value = playName;
  state.list = results;
  state.view = "search";
  els.title.textContent = playName;
  els.backBtn.classList.remove("hidden");
  renderPlayGrid(results, `${results.length} match${results.length === 1 ? "" : "es"} for ${q}`);
  openViewer(0);
}

function openDualViewer(play34, play44) {
  state.index = 0;
  state.dual = true;
  els.viewerPlay.textContent = play34.play;
  els.viewerDay.textContent = "vs 3-4 on top · vs 4-4 below";
  renderViewerStack([
    { label: "vs 3-4", src: play34.image, alt: `${play34.play} vs 3-4` },
    { label: "vs 4-4", src: play44.image, alt: `${play44.play} vs 4-4` },
  ]);
  els.prevPlay.disabled = true;
  els.nextPlay.disabled = true;
  if (!els.viewer.open) els.viewer.showModal();
}

function openViewer(index) {
  state.index = index;
  state.dual = false;
  const play = state.list[index];
  if (!play) return;

  // If this play has a vs pair in DAY4 Group/Team O, show both stacked
  const pair = findVsPair(play.play);
  if (pair && (play.daySlug === "day4groupo34" || play.daySlug === "day4groupo44" || play.vs)) {
    openDualViewer(pair.v34, pair.v44);
    return;
  }

  els.viewerPlay.textContent = play.play;
  els.viewerDay.textContent = `${play.day} · page ${play.page}`;
  renderViewerStack([{ label: "", src: play.image, alt: play.play }]);
  // single image mode without label chrome
  els.viewerStack.classList.remove("dual");
  els.viewerStack.innerHTML = `<img id="viewerImg" alt="${play.play}" src="${play.image}" />`;
  els.viewerImg = document.getElementById("viewerImg");
  els.prevPlay.disabled = index <= 0;
  els.nextPlay.disabled = index >= state.list.length - 1;
  if (!els.viewer.open) els.viewer.showModal();
}

function renderScheduleDay(dayId) {
  const day = scheduleDayById(dayId);
  if (!day) return renderScheduleHome();
  state.view = "schedule-day";
  state.scheduleDayId = dayId;
  els.title.textContent = day.name;
  els.backBtn.classList.remove("hidden");
  els.search.closest(".search-wrap").classList.add("hidden");

  const live = currentSlotForDay(day);
  const timingId = timer.dayId === dayId ? timer.slotId : null;

  const slots = day.slots
    .map((slot) => {
      const isLive = live && live.id === slot.id;
      const isTiming = timingId === slot.id;
      return `
        <article class="slot-card ${isLive ? "live" : ""} ${isTiming ? "timing" : ""}" id="slot-${slot.id}" data-slot-id="${slot.id}">
          <div class="slot-top">
            <div>
              <p class="slot-time">${formatClock(slot.start)} – ${formatClock(slot.end)} · ${slot.minutes} min</p>
              <p class="slot-period">${slot.period}${isLive ? " · NOW" : ""}</p>
              <h3 class="slot-title">${slot.title}</h3>
            </div>
            <div class="slot-timer-btns">
              <button type="button" class="timer-start" data-start="${slot.id}">Start ${slot.minutes}:00</button>
              ${
                isLive
                  ? `<button type="button" class="timer-sync" data-sync="${slot.id}">Sync clock</button>`
                  : ""
              }
            </div>
          </div>
          ${slot.detail ? `<p class="slot-detail">${slot.detail}</p>` : ""}
          ${slotGroupsHtml(slot)}
          ${slotPlaysHtml(slot)}
        </article>`;
    })
    .join("");

  els.app.innerHTML = `
    <div class="schedule-head">
      <p class="section-label">Practice ${day.practice} · ${day.window} · ${day.gear}</p>
      <p class="schedule-focus">${day.focus}</p>
      <div class="day-tabs">
        ${state.schedule.days
          .map(
            (d) =>
              `<button type="button" class="day-tab ${d.id === dayId ? "active" : ""}" data-tab="${d.id}">${d.name.slice(0, 3)}</button>`
          )
          .join("")}
      </div>
    </div>
    <div class="slot-list">${slots}</div>
  `;

  els.app.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => renderScheduleDay(btn.dataset.tab));
  });
  els.app.querySelectorAll("[data-start]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const slot = day.slots.find((s) => s.id === btn.dataset.start);
      if (slot) startTimer(day.id, slot.id, slot.minutes * 60 * 1000);
    });
  });
  els.app.querySelectorAll("[data-sync]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const slot = day.slots.find((s) => s.id === btn.dataset.sync);
      if (!slot) return;
      const left = remainingMsInSlot(slot);
      if (left <= 0) {
        alert("This period is already over.");
        return;
      }
      startTimer(day.id, slot.id, left);
    });
  });
  els.app.querySelectorAll("[data-play]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openPlayByName(btn.dataset.play, btn.dataset.prefer || "");
    });
  });

  updateTimerUI();
}

function stepViewer(delta) {
  const next = state.index + delta;
  if (next < 0 || next >= state.list.length) return;
  openViewer(next);
}

function goBack() {
  els.search.value = "";
  els.clearSearch.classList.add("hidden");
  state.query = "";
  if (state.view === "search" && state.scheduleDayId) {
    renderScheduleDay(state.scheduleDayId);
    return;
  }
  if (state.view === "search" && state.daySlug) {
    renderDay(state.daySlug);
    return;
  }
  if (state.view === "schedule-day") {
    renderScheduleHome();
    return;
  }
  renderHome();
}

function wireEvents() {
  els.backBtn.addEventListener("click", goBack);

  els.search.addEventListener("input", (e) => {
    renderSearch(e.target.value);
  });

  els.search.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const results = searchPlays(els.search.value);
      if (results.length === 1) {
        state.list = results;
        openViewer(0);
      }
    }
  });

  els.clearSearch.addEventListener("click", () => {
    els.search.value = "";
    renderSearch("");
    els.search.focus();
  });

  els.prevPlay.addEventListener("click", () => stepViewer(-1));
  els.nextPlay.addEventListener("click", () => stepViewer(1));
  els.timerPause.addEventListener("click", pauseResumeTimer);
  els.timerSkip.addEventListener("click", skipTimer);
  els.timerBuzz.addEventListener("click", () => {
    if (!timer.alarming) return;
    playAlarmSound();
  });
  els.timerStop.addEventListener("click", stopTimer);

  document.addEventListener("keydown", (e) => {
    if (!els.viewer.open) return;
    if (e.key === "ArrowLeft") stepViewer(-1);
    if (e.key === "ArrowRight") stepViewer(1);
    if (e.key === "Escape") els.viewer.close();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && timer.running && !timer.paused) {
      tickTimer();
    }
  });

  window.addEventListener("online", setOfflineBadge);
  window.addEventListener("offline", setOfflineBadge);
}

async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (err) {
    console.warn("SW register failed", err);
  }
}

async function boot() {
  setOfflineBadge();
  wireEvents();
  try {
    await loadData();
    renderHome();
  } catch (err) {
    els.app.innerHTML = `<div class="empty">Could not load playbook data. Open this folder with a local server and try again.</div>`;
    console.error(err);
  }
  registerSW();
}

boot();
