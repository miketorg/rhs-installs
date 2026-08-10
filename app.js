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
};

const state = {
  data: null,
  view: "home", // home | day | search
  daySlug: null,
  query: "",
  list: [],
  index: -1,
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
  viewerPlay: document.getElementById("viewerPlay"),
  viewerDay: document.getElementById("viewerDay"),
  prevPlay: document.getElementById("prevPlay"),
  nextPlay: document.getElementById("nextPlay"),
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

async function loadData() {
  const res = await fetch("plays.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("Could not load plays.json");
  state.data = await res.json();
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

function renderHome() {
  state.view = "home";
  state.daySlug = null;
  els.title.textContent = "RHS Installs";
  els.backBtn.classList.add("hidden");

  const days = state.data.days
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

  els.app.innerHTML = `
    <p class="section-label">Install packets</p>
    <div class="day-grid">${days}</div>
  `;

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
  state.query = "";
  els.search.value = "";
  els.clearSearch.classList.add("hidden");
  els.title.textContent = day.name;
  els.backBtn.classList.remove("hidden");
  renderPlayGrid(playsForDay(slug), `${day.playCount} plays`);
}

function renderSearch(query) {
  state.query = query;
  const q = normalizeQuery(query);
  els.clearSearch.classList.toggle("hidden", !query);

  if (!q) {
    if (state.daySlug) renderDay(state.daySlug);
    else renderHome();
    return;
  }

  state.view = "search";
  els.title.textContent = "Search";
  els.backBtn.classList.remove("hidden");
  const results = searchPlays(q);
  renderPlayGrid(results, `${results.length} match${results.length === 1 ? "" : "es"} for ${q}`);
}

function openViewer(index) {
  state.index = index;
  const play = state.list[index];
  if (!play) return;
  els.viewerPlay.textContent = play.play;
  els.viewerDay.textContent = `${play.day} · page ${play.page}`;
  els.viewerImg.src = play.image;
  els.viewerImg.alt = play.play;
  els.prevPlay.disabled = index <= 0;
  els.nextPlay.disabled = index >= state.list.length - 1;
  if (!els.viewer.open) els.viewer.showModal();
}

function stepViewer(delta) {
  const next = state.index + delta;
  if (next < 0 || next >= state.list.length) return;
  openViewer(next);
}

function wireEvents() {
  els.backBtn.addEventListener("click", () => {
    els.search.value = "";
    els.clearSearch.classList.add("hidden");
    state.query = "";
    if (state.view === "search" && state.daySlug) renderDay(state.daySlug);
    else renderHome();
  });

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

  document.addEventListener("keydown", (e) => {
    if (!els.viewer.open) return;
    if (e.key === "ArrowLeft") stepViewer(-1);
    if (e.key === "ArrowRight") stepViewer(1);
    if (e.key === "Escape") els.viewer.close();
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
