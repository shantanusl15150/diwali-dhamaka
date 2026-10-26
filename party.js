const CONFIG = window.PARTY_CONFIG;
const $ = (id) => document.getElementById(id);
const REFRESH_MS = 10000;
const PIN_KEY = "dd_host_pin";
const isDemo = !CONFIG.rsvpEndpoint;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const teamMeta = (name) => CONFIG.teams.find((team) => team.name === name) ?? { name, emoji: "🎭", color: "#c8414f" };

/* ---------- API ---------- */
const demoState = { teams: [], recent: [] };

const api = {
  async get(params) {
    const res = await fetch(`${CONFIG.rsvpEndpoint}?${new URLSearchParams(params)}`);
    const body = await res.json();
    if (!body.ok) throw new Error(body.error || "Request failed");
    return body;
  },
  async leaderboard() {
    if (isDemo) return demoState;
    return (await api.get({ action: "leaderboard" })).leaderboard;
  },
  async host(pin) {
    if (isDemo) return { totals: {}, drinks: {}, arrivals: {}, guests: [], songs: [], movies: [] };
    return (await api.get({ action: "host", pin })).host;
  },
  async score(pin, team, points, reason) {
    if (isDemo) {
      let entry = demoState.teams.find((t) => t.name === team);
      if (!entry) {
        entry = { name: team, members: [], audition: 0, party: 0, total: 0 };
        demoState.teams.push(entry);
      }
      entry.party += points;
      entry.total = entry.audition + entry.party;
      demoState.recent.unshift({ team, points, reason, time: new Date().toISOString() });
      demoState.recent = demoState.recent.slice(0, 6);
      return demoState;
    }
    const res = await fetch(CONFIG.rsvpEndpoint, {
      method: "POST",
      body: JSON.stringify({ action: "score", pin, team, points, reason }),
    });
    const body = await res.json();
    if (!body.ok) throw new Error(body.error || "Request failed");
    return body.leaderboard;
  },
};

/* ---------- Leaderboard ---------- */
let lastLeader = null;

const mergeTeams = (serverTeams) => {
  const byName = new Map(serverTeams.map((team) => [team.name, team]));
  const names = [...new Set([...CONFIG.teams.map((team) => team.name), ...byName.keys()])];
  return names
    .map((name) => ({ members: [], audition: 0, party: 0, total: 0, ...byName.get(name), ...teamMeta(name) }))
    .sort((a, b) => b.total - a.total);
};

const renderBoard = (data) => {
  const teams = mergeTeams(data.teams);
  const max = Math.max(...teams.map((team) => team.total), 1);
  const medals = ["🥇", "🥈", "🥉"];

  $("board").replaceChildren(
    ...teams.map((team, i) => {
      const card = el("article", "team-card");
      card.style.setProperty("--team-color", team.color);
      if (i === 0 && team.total > 0) card.classList.add("is-leader");

      const head = el("div", "team-head");
      head.append(el("span", "team-rank", medals[i] ?? `#${i + 1}`), el("span", "team-emoji", team.emoji), el("h2", "team-name", team.name));
      const total = el("p", "team-total", String(team.total));
      total.append(el("small", "", " pts"));

      const bar = el("div", "team-bar");
      const fill = el("span");
      fill.style.width = `${Math.max((team.total / max) * 100, 2)}%`;
      bar.append(fill);

      const breakdown = el("p", "team-breakdown", `🧠 Audition ${team.audition} · 🎉 Party ${team.party}`);
      const members = el("ul", "team-members");
      members.append(...(team.members.length ? team.members : ["Casting in progress..."]).map((name) => el("li", "", name)));

      card.append(head, total, bar, breakdown, members);
      return card;
    })
  );

  const leader = teams[0]?.total > 0 ? teams[0].name : null;
  if (leader && lastLeader && leader !== lastLeader && typeof window.confetti === "function") {
    window.confetti({ particleCount: 160, spread: 100, origin: { y: 0.4 }, colors: [teamMeta(leader).color, "#ffc94a", "#fff4dc"] });
  }
  lastLeader = leader;

  const ticker = $("ticker");
  ticker.hidden = !data.recent?.length;
  $("ticker-list").replaceChildren(
    ...(data.recent ?? []).map((entry) => {
      const li = el("li");
      const meta = teamMeta(entry.team);
      li.append(
        el("span", "", `${meta.emoji} ${entry.team}`),
        el("strong", entry.points > 0 ? "is-up" : "is-down", `${entry.points > 0 ? "+" : ""}${entry.points}`),
        el("span", "ticker-reason", entry.reason || "")
      );
      return li;
    })
  );
};

const refresh = async () => {
  try {
    renderBoard(await api.leaderboard());
    $("cr-status").textContent = isDemo
      ? "Demo mode: set rsvpEndpoint in config.js to go live."
      : `Live · updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  } catch (err) {
    console.error(err);
    $("cr-status").textContent = "Couldn't reach the scoreboard, retrying...";
  }
};

/* ---------- Host mode ---------- */
let hostPin = sessionStorage.getItem(PIN_KEY);
let selectedTeam = null;

const fillList = (id, items, empty = "Nothing yet") =>
  $(id).replaceChildren(...(items.length ? items : [empty]).map((item) => el("li", "", item)));

const ARRIVAL_ORDER = ["6:00 PM", "6:30 PM", "7:00 PM", "7:30 PM", "8:00 PM", "8:30 PM or later"];

const renderHostStats = (stats) => {
  const totals = stats.totals;
  $("stat-grid").replaceChildren(
    ...[
      ["👥 Expected", totals.headcount],
      ["✅ RSVPs in", totals.coming],
      ["📲 +1s invited", totals.plusOnes],
      ["😢 Not coming", totals.notComing],
    ].map(([label, value]) => {
      const card = el("div", "stat");
      card.append(el("strong", "", String(value ?? 0)), el("span", "", label));
      return card;
    })
  );

  fillList("stat-drinks", Object.entries(stats.drinks).map(([drink, n]) => `${drink}: ${n}`));
  fillList(
    "stat-arrivals",
    Object.entries(stats.arrivals)
      .sort(([a], [b]) => ARRIVAL_ORDER.indexOf(a) - ARRIVAL_ORDER.indexOf(b))
      .map(([time, n]) => `${time}: ${n} ${n === 1 ? "person" : "people"}`)
  );
  fillList("stat-songs", stats.songs);
  fillList("stat-movies", stats.movies);

  $("missions-hint").hidden = stats.missionsConfigured !== 0;
  $("stat-guests").replaceChildren(
    ...stats.guests.map((guest) => {
      const plus =
        guest.plusOneName
          ? `${guest.plusOneName}${guest.plusOneRelation ? ` (${guest.plusOneRelation})` : ""}${guest.response?.includes("+1") ? " · pending RSVP" : ""}`
          : "";
      const tr = el("tr");
      [guest.seat, guest.name, guest.response, guest.phone, guest.arrivalTime, guest.team, guest.item, plus, guest.mission].forEach(
        (value) => tr.append(el("td", "", value || "-"))
      );
      const action = el("td");
      const link = missionLink(guest);
      if (link) {
        const btn = el("a", "btn btn-gold btn-small", "💬 Send");
        btn.href = link;
        btn.target = "_blank";
        btn.rel = "noopener";
        action.append(btn);
      }
      tr.append(action);
      return tr;
    })
  );
};

const missionLink = (person) => {
  const digits = String(person.phone || "").replace(/\D/g, "");
  if (!digits || !person.mission) return "";
  const fill = { name: person.name, mission: person.mission, team: person.team, seat: person.seat };
  const text = (CONFIG.missionMessage || "{name}, your secret mission: {mission}").replace(/\{(\w+)\}/g, (_, key) => fill[key] ?? "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
};

const renderHostControls = () => {
  $("host-teams").replaceChildren(
    ...CONFIG.teams.map((team) => {
      const btn = el("button", "host-team", `${team.emoji} ${team.name}`);
      btn.type = "button";
      btn.style.setProperty("--team-color", team.color);
      btn.classList.toggle("is-selected", team.name === selectedTeam);
      btn.addEventListener("click", () => {
        selectedTeam = team.name;
        renderHostControls();
      });
      return btn;
    })
  );

  $("host-presets").replaceChildren(
    ...CONFIG.partyScoring.map((preset) => {
      const btn = el("button", `btn btn-small ${preset.points > 0 ? "btn-gold" : "btn-ghost"}`, `${preset.label} ${preset.points > 0 ? "+" : ""}${preset.points}`);
      btn.type = "button";
      btn.addEventListener("click", () => award(preset.points, preset.label));
      return btn;
    })
  );
};

const award = async (points, reason) => {
  const msg = $("host-msg");
  if (!selectedTeam) {
    msg.textContent = "Pick a team first 👆";
    return;
  }
  msg.textContent = "Saving...";
  try {
    renderBoard(await api.score(hostPin, selectedTeam, points, reason));
    msg.textContent = `✅ ${selectedTeam} ${points > 0 ? "+" : ""}${points} · ${reason}`;
    if (points > 0 && typeof window.confetti === "function") {
      window.confetti({ particleCount: 90, spread: 80, origin: { y: 0.7 }, colors: [teamMeta(selectedTeam).color, "#ffc94a"] });
    }
  } catch (err) {
    msg.textContent = `❌ ${err.message}`;
  }
};

const unlockHost = async (pin) => {
  const stats = await api.host(pin);
  hostPin = pin;
  sessionStorage.setItem(PIN_KEY, pin);
  $("host").hidden = false;
  $("pin-form").hidden = true;
  $("host-toggle").textContent = "🔒 Exit host mode";
  renderHostControls();
  renderHostStats(stats);
};

const initHost = () => {
  const pinForm = $("pin-form");

  $("host-toggle").addEventListener("click", () => {
    if (!$("host").hidden) {
      sessionStorage.removeItem(PIN_KEY);
      hostPin = null;
      $("host").hidden = true;
      $("host-toggle").textContent = "🔑 Host mode";
      return;
    }
    pinForm.hidden = !pinForm.hidden;
    if (!pinForm.hidden) pinForm.elements.pin.focus();
  });

  pinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await unlockHost(pinForm.elements.pin.value.trim());
      pinForm.reset();
    } catch (err) {
      $("cr-status").textContent = `❌ ${err.message}`;
    }
  });

  $("host-custom").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    const points = Math.round(Number(form.elements.points.value));
    if (!points) return;
    award(points, form.elements.reason.value.trim() || "Bonus");
    form.reset();
  });

  if (hostPin) unlockHost(hostPin).catch(() => sessionStorage.removeItem(PIN_KEY));
};

/* ---------- Boot ---------- */
initHost();
refresh();
setInterval(() => {
  if (!document.hidden) refresh();
}, REFRESH_MS);
