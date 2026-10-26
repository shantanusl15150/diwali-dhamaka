const CONFIG = window.PARTY_CONFIG;
const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomItem = (list) => list[Math.floor(Math.random() * list.length)];
const DIWALI_COLORS = ["#ffc94a", "#ffb347", "#f28c28", "#fff1cf", "#e8806a"];

const STORAGE_KEYS = {
  progress: "dd_progress_v2",
  rsvp: "dd_rsvp_v2",
  selfie: "dd_selfie_v1",
  guest: "dd_guest_v1",
};

const storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

const freshQuiz = () => ({ index: 0, score: 0, done: false });
const progress = storage.get(STORAGE_KEYS.progress, { maxReached: 0, pledged: false, quiz: freshQuiz() });
const saveProgress = () => storage.set(STORAGE_KEYS.progress, progress);

/* ---------- Sound (synthesised, no assets needed) ---------- */
const sound = (() => {
  let ctx = null;
  let enabled = true;

  const ensure = () => {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  };

  const tone = (freq, duration, type = "sine", gain = 0.12, startDelay = 0) => {
    if (!enabled || !ensure()) return;
    const start = ctx.currentTime + startDelay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  };

  const noise = (duration, gain = 0.25) => {
    if (!enabled || !ensure()) return;
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    }
    const src = ctx.createBufferSource();
    const amp = ctx.createGain();
    amp.gain.value = gain;
    src.buffer = buffer;
    src.connect(amp).connect(ctx.destination);
    src.start();
  };

  return {
    unlock: ensure,
    setEnabled: (value) => {
      enabled = value;
    },
    isEnabled: () => enabled,
    tick: () => tone(1400, 0.035, "square", 0.04),
    pop: () => {
      noise(0.28, 0.35);
      tone(140, 0.12, "triangle", 0.2);
    },
    whoosh: () => noise(0.4, 0.12),
    chime: (step = 0) => tone(660 * 2 ** (step / 12), 0.35, "triangle", 0.1),
    correct: () => [784, 1047].forEach((f, i) => tone(f, 0.2, "triangle", 0.12, i * 0.09)),
    buzz: () => tone(110, 0.25, "sawtooth", 0.08),
    fanfare: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, "triangle", 0.12, i * 0.11)),
    sad: () => [392, 370, 349, 262].forEach((f, i) => tone(f, i === 3 ? 0.8 : 0.32, "sawtooth", 0.06, i * 0.32)),
  };
})();

/* ---------- Confetti / fireworks ---------- */
const hasConfetti = () => typeof window.confetti === "function";

const burstAt = (x, y, particleCount = 40, colors = DIWALI_COLORS) => {
  if (!hasConfetti()) return;
  window.confetti({
    particleCount,
    spread: 360,
    startVelocity: 16,
    ticks: 80,
    gravity: 0.6,
    scalar: 0.75,
    colors,
    shapes: ["star", "circle"],
    origin: { x, y },
  });
};

const fireworks = (durationMs = 2500, colors = DIWALI_COLORS) => {
  if (!hasConfetti()) return;
  const end = Date.now() + durationMs;
  const launch = () => {
    burstAt(0.2 + Math.random() * 0.6, 0.15 + Math.random() * 0.3, 35, colors);
    sound.pop();
    if (Date.now() < end) setTimeout(launch, 450 + Math.random() * 350);
  };
  launch();
};

const showToast = (icon, title, text) => {
  const toast = document.createElement("div");
  toast.className = "toast";
  const iconEl = document.createElement("span");
  iconEl.className = "toast-icon";
  iconEl.textContent = icon;
  const body = document.createElement("div");
  const titleEl = document.createElement("strong");
  titleEl.textContent = title;
  body.append(titleEl, document.createTextNode(text));
  toast.append(iconEl, body);
  $("toasts").append(toast);
  setTimeout(() => toast.classList.add("is-out"), 3200);
  setTimeout(() => toast.remove(), 3700);
};

const restartAnimation = (el, className) => {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
};

/* ---------- Scenes ---------- */
const SCENES = Array.from(document.querySelectorAll(".scene"));
const CLIMAX = SCENES.length - 1;
const RSVP_SCENE = CLIMAX - 1;
let currentScene = 0;

const hasRsvp = () => Boolean(storage.get(STORAGE_KEYS.rsvp, null));

const renderProgress = () => {
  $("progress-label").textContent = `Scene ${currentScene + 1} of ${SCENES.length}`;
  $("progress-diyas")
    .querySelectorAll("button")
    .forEach((btn, i) => {
      btn.classList.toggle("is-lit", i <= progress.maxReached);
      btn.classList.toggle("is-current", i === currentScene);
      btn.disabled = i > progress.maxReached || (i === CLIMAX && !hasRsvp());
    });
};

const showScene = (index) => {
  SCENES.forEach((scene, i) => {
    scene.hidden = i !== index;
  });
  currentScene = index;
  if (index > progress.maxReached) {
    progress.maxReached = index;
    saveProgress();
  }
  window.scrollTo(0, 0);
  renderProgress();
};

const goToScene = async (index, { titleCard = true } = {}) => {
  if (index < 0 || index >= SCENES.length) return;
  if (!titleCard || prefersReducedMotion) {
    showScene(index);
    return;
  }
  const card = $("scene-card");
  $("scene-card-no").textContent = `Scene ${index + 1}`;
  $("scene-card-title").textContent = SCENES[index].dataset.title;
  restartAnimation(card, "is-showing");
  sound.whoosh();
  await delay(380);
  showScene(index);
};

const initScenes = () => {
  $("progress-diyas").replaceChildren(
    ...SCENES.map((scene, i) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "diya-mini";
      btn.setAttribute("aria-label", `Scene ${i + 1}: ${scene.dataset.title}`);
      btn.innerHTML = '<span class="diya-mini-flame"></span><span class="diya-mini-base"></span>';
      btn.addEventListener("click", () => goToScene(i, { titleCard: false }));
      li.append(btn);
      return li;
    })
  );

  document.querySelectorAll("[data-next]").forEach((btn) =>
    btn.addEventListener("click", () => {
      sound.chime(currentScene * 2);
      goToScene(currentScene + 1);
    })
  );
  document.querySelectorAll("[data-back]").forEach((btn) =>
    btn.addEventListener("click", () => goToScene(currentScene - 1, { titleCard: false }))
  );
};

/* ---------- Music + sound toggle ---------- */
const initSound = () => {
  const audio = $("party-audio");
  const toggle = $("sound-toggle");
  let musicAvailable = true;

  audio.addEventListener("error", () => {
    musicAvailable = false;
    toggle.classList.remove("is-playing");
  });

  const playMusic = async () => {
    if (!musicAvailable || !sound.isEnabled()) return;
    try {
      audio.volume = 0.5;
      await audio.play();
      toggle.classList.add("is-playing");
    } catch {
      toggle.classList.remove("is-playing");
    }
  };

  toggle.addEventListener("click", () => {
    const next = !sound.isEnabled();
    sound.setEnabled(next);
    $("sound-icon").textContent = next ? "🔊" : "🔇";
    if (next) {
      sound.unlock();
      playMusic();
    } else {
      audio.pause();
      toggle.classList.remove("is-playing");
    }
  });

  return { playMusic };
};

/* ---------- Curtain intro ---------- */
const initCurtain = (onEnter) => {
  const curtain = $("curtain");
  document.body.classList.add("is-locked");

  $("action-btn").addEventListener("click", () => {
    sound.unlock();
    sound.pop();
    curtain.classList.add("is-open");
    document.body.classList.remove("is-locked");
    setTimeout(() => curtain.classList.add("is-gone"), 1500);
    setTimeout(() => fireworks(1200), 600);
    onEnter();
  });
};

/* ---------- Ambient effects ---------- */
const initSkyLanterns = () => {
  if (prefersReducedMotion) return;
  const sky = $("sky");
  const launch = () => {
    if (sky.childElementCount >= 4 || document.hidden) return;
    const lantern = document.createElement("span");
    lantern.className = "sky-lantern";
    lantern.style.left = `${Math.random() * 95}%`;
    lantern.style.animationDuration = `${22 + Math.random() * 12}s`;
    lantern.style.transform = `scale(${0.5 + Math.random() * 0.5})`;
    lantern.addEventListener("animationend", () => lantern.remove());
    sky.append(lantern);
  };
  launch();
  setInterval(launch, 6000);
};

/* ---------- Static details + countdown ---------- */
const eventStart = new Date(CONFIG.eventStart);

const renderDrinkChoices = () =>
  document.querySelectorAll("[data-drinks]").forEach((grid) =>
    grid.replaceChildren(
      ...CONFIG.drinks.map((drink) => {
        const label = el("label", "choice");
        const input = el("input");
        input.type = "radio";
        input.name = grid.dataset.drinks;
        input.value = drink.value;
        const card = el("span", "choice-card choice-sm");
        card.append(el("span", "choice-emoji", drink.emoji), el("strong", "", drink.value), el("small", "", drink.tag));
        label.append(input, card);
        return label;
      })
    )
  );

const initDetails = () => {
  document.querySelectorAll("[data-production]").forEach((node) => (node.textContent = CONFIG.production));
  renderDrinkChoices();
  document.querySelectorAll("[data-date]").forEach((el) => (el.textContent = CONFIG.dateLabel));
  document.querySelectorAll("[data-time]").forEach((el) => (el.textContent = CONFIG.timeLabel));
  $("venue-name").textContent = CONFIG.venue.name;
  $("venue-address").textContent = CONFIG.venue.address;
  if (CONFIG.venue.mapUrl) {
    const map = $("venue-map");
    map.href = CONFIG.venue.mapUrl;
    map.hidden = false;
  }
};

const initCountdown = () => {
  const pad = (n) => String(n).padStart(2, "0");
  const els = {
    days: document.querySelectorAll('[data-cd="days"]'),
    hours: document.querySelectorAll('[data-cd="hours"]'),
    mins: document.querySelectorAll('[data-cd="mins"]'),
    secs: document.querySelectorAll('[data-cd="secs"]'),
  };
  const set = (nodes, value) => nodes.forEach((node) => (node.textContent = pad(value)));

  const update = () => {
    const diff = Math.max(eventStart - Date.now(), 0);
    const total = Math.floor(diff / 1000);
    set(els.days, Math.floor(total / 86400));
    set(els.hours, Math.floor((total % 86400) / 3600));
    set(els.mins, Math.floor((total % 3600) / 60));
    set(els.secs, total % 60);
  };

  update();
  setInterval(update, 1000);
};

/* ---------- Scene 2: pledge gate ---------- */
const initPledge = () => {
  const pledgeBtn = $("pledge-btn");
  const nextBtn = $("dress-next");

  const markPledged = () => {
    $("pledge").classList.add("is-stamped");
    pledgeBtn.disabled = true;
    nextBtn.disabled = false;
    nextBtn.textContent = "Next Scene ➜";
  };

  if (progress.pledged) markPledged();
  pledgeBtn.addEventListener("click", () => {
    progress.pledged = true;
    saveProgress();
    markPledged();
    sound.pop();
    burstAt(0.5, 0.6, 60);
  });
};

/* ---------- Audition quiz (main guest, scene 3) ---------- */
const mountQuiz = (root, { questions, pointsPerAnswer }, state, onDone) => {
  // Old progress can be shorter than the current question list; start that guest over.
  if (state.index > questions.length || (state.done && state.index !== questions.length)) {
    Object.assign(state, freshQuiz());
    saveProgress();
  }
  const maxScore = questions.length * pointsPerAnswer;
  const part = (selector) => root.querySelector(selector);
  const optionsEl = part(".quiz-options");
  const scoreEl = part(".quiz-score strong");

  const finish = () => {
    part(".quiz-card").hidden = true;
    part(".quiz-done").hidden = false;
    part(".quiz-final").textContent = state.score;
    const ratio = state.score / maxScore;
    part(".quiz-verdict").textContent =
      ratio === 1
        ? "Full marks! Superstar material 🌟"
        : ratio >= 0.6
          ? "Hero material! Director impressed 👏"
          : "Side hero for now... but party mein sab hero hain 😄";
    onDone();
  };

  const render = () => {
    part(".quiz-card").hidden = state.done;
    part(".quiz-done").hidden = !state.done;
    if (state.done) {
      finish();
      return;
    }
    const item = questions[state.index];
    part(".quiz-count").textContent = `Q${state.index + 1} / ${questions.length}`;
    scoreEl.textContent = state.score;
    part(".quiz-bar span").style.width = `${(state.index / questions.length) * 100}%`;
    const qEl = part(".quiz-q");
    qEl.textContent = item.q;
    restartAnimation(qEl, "is-new");

    optionsEl.replaceChildren(
      ...item.options.map((option, i) => {
        const btn = el("button", "quiz-option", option);
        btn.type = "button";
        btn.addEventListener("click", () => answer(i));
        return btn;
      })
    );
  };

  const answer = async (choice) => {
    const item = questions[state.index];
    const buttons = optionsEl.querySelectorAll("button");
    buttons.forEach((btn) => (btn.disabled = true));
    buttons[item.answer].classList.add("is-correct");

    if (choice === item.answer) {
      state.score += pointsPerAnswer;
      sound.correct();
      const rect = buttons[choice].getBoundingClientRect();
      burstAt((rect.left + rect.width / 2) / window.innerWidth, rect.top / window.innerHeight, 25);
    } else {
      buttons[choice].classList.add("is-wrong");
      sound.buzz();
    }

    state.index += 1;
    state.done = state.index >= questions.length;
    saveProgress();
    scoreEl.textContent = state.score;
    await delay(1100);
    render();
    if (state.done && state.score === maxScore) fireworks(2000);
  };

  render();
  return { render };
};

const initQuiz = () =>
  mountQuiz($("quiz-main"), CONFIG.quiz, progress.quiz, () => {
    const nextBtn = $("quiz-next");
    nextBtn.disabled = false;
    nextBtn.textContent = "Next Scene ➜";
  });

/* ---------- Selfies ---------- */
const SELFIE_SIZE = 360;

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const squareCrop = async (file) => {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = SELFIE_SIZE;
    canvas.height = SELFIE_SIZE;
    canvas
      .getContext("2d")
      .drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SELFIE_SIZE, SELFIE_SIZE);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
};

const mountSelfie = (root, storageKey) => {
  let data = storage.get(storageKey, null);
  const input = root.querySelector('input[type="file"]');
  const preview = root.querySelector(".selfie-preview");
  const removeBtn = root.querySelector(".selfie-remove");

  const render = () => {
    preview.style.backgroundImage = data ? `url("${data}")` : "";
    preview.textContent = data ? "" : "🎭";
    root.querySelector(".selfie-btn-text").textContent = data ? "🔁 Retake" : "📸 Click a selfie";
    removeBtn.hidden = !data;
  };

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      data = await squareCrop(file);
      if (!storage.set(storageKey, data)) {
        showToast("⚠️", "Couldn't save the photo", " It will still show on the ticket this time.");
      }
      sound.chime(5);
    } catch {
      showToast("⚠️", "Photo didn't load", " Try another picture.");
    }
    render();
  });

  removeBtn.addEventListener("click", () => {
    data = null;
    storage.remove(storageKey);
    render();
  });

  render();
  return { get: () => data };
};

const selfies = {};
const initSelfies = () => {
  selfies.main = mountSelfie(document.querySelector('[data-selfie="main"]'), STORAGE_KEYS.selfie);
};

/* ---------- Wheel of Kismat ---------- */
const WHEEL_COLORS = ["#7a1a2c", "#c4691f", "#e2ae47", "#4d1a44", "#a8432d", "#6b2a5c", "#d4903a", "#3a1a4a"];
const LIGHT_WHEEL_COLORS = ["#e2ae47", "#d4903a"];
const TAU = Math.PI * 2;
const SPIN_SPEED = 9;

const createWheel = (canvas, onTick) => {
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  const center = size / 2;
  const radius = center - 6;
  let items = [];
  let rotation = 0;
  let lastSegment = 0;
  let raf = null;

  const segAngle = () => TAU / items.length;

  const fitText = (text, maxWidth, baseSize) => {
    let fontSize = baseSize;
    ctx.font = `700 ${fontSize}px Poppins, sans-serif`;
    while (ctx.measureText(text).width > maxWidth && fontSize > 13) {
      fontSize -= 1;
      ctx.font = `700 ${fontSize}px Poppins, sans-serif`;
    }
    if (ctx.measureText(text).width <= maxWidth) return text;
    let trimmed = text;
    while (trimmed.length > 3 && ctx.measureText(`${trimmed}…`).width > maxWidth) trimmed = trimmed.slice(0, -1);
    return `${trimmed}…`;
  };

  const draw = () => {
    ctx.clearRect(0, 0, size, size);
    if (!items.length) return;
    const seg = segAngle();
    const colors = items.length % WHEEL_COLORS.length === 1 ? WHEEL_COLORS.slice(0, -1) : WHEEL_COLORS;

    items.forEach((item, i) => {
      const start = rotation + i * seg - Math.PI / 2;
      const color = colors[i % colors.length];
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, start, start + seg);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 228, 140, 0.9)";
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(start + seg / 2);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = LIGHT_WHEEL_COLORS.includes(color) ? "#3a0a00" : "#fff7e6";
      const baseSize = Math.max(16, Math.min(28, 40 - items.length * 2));
      const label = fitText(item, radius * 0.62, baseSize);
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = 4;
      ctx.fillText(label, radius - 22, 0);
      ctx.restore();
    });

    const shine = ctx.createRadialGradient(center, center, radius * 0.2, center, center, radius);
    shine.addColorStop(0, "rgba(255, 255, 255, 0.18)");
    shine.addColorStop(0.7, "rgba(255, 255, 255, 0)");
    shine.addColorStop(1, "rgba(0, 0, 0, 0.25)");
    ctx.fillStyle = shine;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, TAU);
    ctx.fill();
  };

  const setRotation = (value) => {
    rotation = value;
    const segment = Math.floor(rotation / segAngle());
    if (segment !== lastSegment) {
      lastSegment = segment;
      onTick();
    }
    draw();
  };

  const halt = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  };

  const setItems = (list) => {
    halt();
    items = list;
    rotation = Math.random() * TAU;
    lastSegment = Math.floor(rotation / segAngle());
    draw();
  };

  const spinFree = () => {
    halt();
    let last = performance.now();
    const loop = (now) => {
      setRotation(rotation + SPIN_SPEED * ((now - last) / 1000));
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  };

  // Decelerates from SPIN_SPEED (ease-out cubic starts at 3x average speed) so the hand-off is seamless.
  const stopAt = (index) =>
    new Promise((resolve) => {
      halt();
      const seg = segAngle();
      const target = -(index + 0.5) * seg + (Math.random() - 0.5) * seg * 0.6;
      const from = rotation;
      const distance = ((((target - from) % TAU) + TAU) % TAU) + TAU * 3;
      const duration = Math.min(9, Math.max(3, (3 * distance) / SPIN_SPEED)) * 1000;
      const startTime = performance.now();
      const loop = (now) => {
        const t = Math.min((now - startTime) / duration, 1);
        setRotation(from + distance * (1 - (1 - t) ** 3));
        if (t < 1) {
          raf = requestAnimationFrame(loop);
          return;
        }
        raf = null;
        resolve();
      };
      raf = requestAnimationFrame(loop);
    });

  return { setItems, spinFree, stopAt, halt };
};

/* ---------- Team reveal ---------- */
const findTeam = (name) => CONFIG.teams.find((team) => team.name === name) ?? { name, emoji: "🎭", color: "#c8414f" };

const revealTeam = async (personName, teamName) => {
  $("team-title").textContent = `${personName}, you are cast in...`;
  const slot = $("team-slot");
  const nameEl = $("team-slot-name");
  const emojiEl = $("team-slot-emoji");
  const finalIndex = Math.max(CONFIG.teams.findIndex((team) => team.name === teamName), 0);
  const steps = 22 + finalIndex;
  $("team-status").textContent = "";
  slot.classList.remove("is-final");

  for (let i = 0; i <= steps; i += 1) {
    const team = i === steps ? findTeam(teamName) : CONFIG.teams[i % CONFIG.teams.length];
    nameEl.textContent = team.name;
    emojiEl.textContent = team.emoji;
    slot.style.setProperty("--team-color", team.color);
    sound.tick();
    await delay(50 + (i / steps) ** 3 * 420);
  }

  const team = findTeam(teamName);
  slot.classList.add("is-final");
  $("team-status").textContent = `Welcome to ${team.name}! ${team.emoji}`;
  sound.fanfare();
  burstAt(0.5, 0.45, 60, [team.color, "#ffc94a", "#fff1cf"]);
};

/* ---------- Ticket (drawn on canvas so it can be saved/shared) ---------- */
const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const fitFont = (ctx, text, maxWidth, size, family, weight = "") => {
  let fontSize = size;
  ctx.font = `${weight} ${fontSize}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && fontSize > 16) {
    fontSize -= 2;
    ctx.font = `${weight} ${fontSize}px ${family}`;
  }
};

const drawTicket = async (canvas, person, rsvp) => {
  await Promise.all(
    ["80px 'Yatra One'", "80px 'Rozha One'", "700 30px Poppins", "800 30px Poppins"].map((font) =>
      document.fonts?.load(font).catch(() => null)
    )
  );
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const team = findTeam(person.team);
  const maroon = "#6b0f1a";
  const perforationY = 1250;
  ctx.clearRect(0, 0, W, H);

  const gold = ctx.createLinearGradient(0, 0, W, H);
  gold.addColorStop(0, "#fff6d6");
  gold.addColorStop(0.55, "#ffd56b");
  gold.addColorStop(1, "#ffb43a");
  roundRect(ctx, 0, 0, W, H, 44);
  ctx.fillStyle = gold;
  ctx.fill();

  ctx.save();
  roundRect(ctx, 0, 0, W, H, 44);
  ctx.clip();
  const header = ctx.createLinearGradient(0, 0, 0, 330);
  header.addColorStop(0, "#3a0a2a");
  header.addColorStop(1, maroon);
  ctx.fillStyle = header;
  ctx.fillRect(0, 0, W, 330);
  ctx.fillStyle = "#ffc94a";
  for (let x = 30; x < W; x += 60) {
    ctx.beginPath();
    ctx.arc(x, 330, 10, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffc94a";
  ctx.font = "84px 'Yatra One', serif";
  ctx.fillText("दिवाली", W / 2, 120);
  ctx.save();
  ctx.shadowColor = "rgba(255, 170, 60, 0.85)";
  ctx.shadowBlur = 30;
  ctx.fillStyle = "#fff";
  ctx.font = "128px 'Rozha One', serif";
  ctx.fillText("DHAMAKA", W / 2, 245);
  ctx.restore();
  ctx.fillStyle = "#fff4dc";
  ctx.font = "600 28px Poppins, sans-serif";
  ctx.fillText("A BOLLYWOOD DIWALI HOUSE PARTY", W / 2, 298);

  ctx.fillStyle = maroon;
  ctx.font = "800 30px Poppins, sans-serif";
  ctx.fillText("★  ADMIT ONE  ★", W / 2, 405);

  const cx = W / 2;
  const cy = 570;
  const r = 140;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 22, 0, TAU);
  ctx.fillStyle = maroon;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 12, 0, TAU);
  ctx.fillStyle = "#ffc94a";
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.clip();
  if (person.selfie) {
    const img = await loadImage(person.selfie).catch(() => null);
    if (img) ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  } else {
    const bg = ctx.createRadialGradient(cx, cy - 40, 20, cx, cy, r);
    bg.addColorStop(0, "#ff6bb0");
    bg.addColorStop(1, "#7b2cbf");
    ctx.fillStyle = bg;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.font = "150px serif";
    ctx.textBaseline = "middle";
    ctx.fillText("🎭", cx, cy + 8);
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();

  ctx.fillStyle = maroon;
  ctx.globalAlpha = 0.7;
  ctx.font = "700 24px Poppins, sans-serif";
  ctx.fillText(person.coStarOf ? `C O - S T A R   ·   W I T H   ${person.coStarOf.toUpperCase()}` : "S T A R R I N G", W / 2, 780);
  ctx.globalAlpha = 1;
  const starring = person.name;
  fitFont(ctx, starring, W - 120, 70, "'Rozha One', serif");
  ctx.fillText(starring, W / 2, 855);

  const teamLabel = `${team.emoji}  ${team.name}`;
  ctx.font = "800 40px Poppins, sans-serif";
  const pillW = Math.min(ctx.measureText(teamLabel).width + 90, W - 100);
  roundRect(ctx, (W - pillW) / 2, 885, pillW, 76, 38);
  ctx.fillStyle = team.color;
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(teamLabel, W / 2, 937);

  const cells = [
    ["DATE", CONFIG.dateLabel],
    ["SHOWTIME", CONFIG.timeLabel],
    ["ENTRY", rsvp.arrivalTime],
    ["PARTY FUEL", person.drink],
    ["BRINGING", rsvp.item],
    ["AUDITION", `${person.quizScore ?? 0} pts`],
  ];
  ctx.textAlign = "left";
  cells.forEach(([label, value], i) => {
    const x = i % 2 === 0 ? 80 : W / 2 + 30;
    const y = 1025 + Math.floor(i / 2) * 78;
    ctx.fillStyle = maroon;
    ctx.globalAlpha = 0.6;
    ctx.font = "700 20px Poppins, sans-serif";
    ctx.fillText(label, x, y);
    ctx.globalAlpha = 1;
    fitFont(ctx, value || "-", W / 2 - 110, 32, "Poppins, sans-serif", "700");
    ctx.fillStyle = "#3a0a00";
    ctx.fillText(value || "-", x, y + 38);
  });

  ctx.save();
  ctx.setLineDash([18, 14]);
  ctx.strokeStyle = "rgba(107, 15, 26, 0.5)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(50, perforationY);
  ctx.lineTo(W - 50, perforationY);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  [0, W].forEach((x) => {
    ctx.beginPath();
    ctx.arc(x, perforationY, 32, 0, TAU);
    ctx.fill();
  });
  ctx.restore();

  ctx.fillStyle = maroon;
  ctx.globalAlpha = 0.7;
  ctx.font = "700 22px Poppins, sans-serif";
  ctx.fillText("SEAT", 80, 1320);
  ctx.globalAlpha = 1;
  ctx.font = "60px 'Rozha One', serif";
  ctx.fillText(`#${person.seat}`, 80, 1385);

  let seed = [...person.seat].reduce((sum, ch) => sum * 31 + ch.charCodeAt(0), 7) % 9973;
  ctx.fillStyle = "#3a0a00";
  for (let x = W - 380; x < W - 80; ) {
    seed = (seed * 9301 + 49297) % 233280;
    const width = 3 + (seed % 7);
    ctx.fillRect(x, 1295, width, 100);
    x += width + 4 + (seed % 5);
  }

  ctx.textAlign = "center";
  ctx.font = "600 24px Poppins, sans-serif";
  ctx.fillText("👘 Traditional attire compulsory · Show at the door", W / 2, 1455);
};

const saveTicket = (canvas, name) => {
  canvas.toBlob(async (blob) => {
    if (!blob) return;
    const fileName = `diwali-dhamaka-ticket-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
    const file = new File([blob], fileName, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] }) && matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ files: [file], title: "My Diwali Dhamaka ticket" });
        return;
      } catch {
        /* user cancelled share; fall back to download */
      }
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  }, "image/png");
};

/* ---------- RSVP ---------- */
const RESPONSE_LABELS = {
  yes: "Coming solo",
  plusOne: "Coming with +1",
  no: "Not coming",
};

const WHEEL_COPY = {
  yes: { kicker: "Wheel of Kismat", title: "Aapki dish decide ho rahi hai..." },
  plusOne: { kicker: "Wheel of Kismat", title: "Aapki dish decide ho rahi hai..." },
  no: { kicker: "Punishment Wheel 😈", title: "Na aane ki saza decide ho rahi hai..." },
};

const cleanList = (list) => (list ?? []).map((item) => String(item).trim()).filter(Boolean);

const getWheelOptions = (response) => {
  const options = cleanList(CONFIG.wheels[response]);
  return options.length ? options : cleanList(CONFIG.wheels.yes);
};

const getGuestId = () => {
  const existing = storage.get(STORAGE_KEYS.guest, null);
  if (existing) return existing;
  const id = window.crypto?.randomUUID?.() ?? `g-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  storage.set(STORAGE_KEYS.guest, id);
  return id;
};

const readForm = (form) => {
  const data = new FormData(form);
  const value = (key) => String(data.get(key) ?? "").trim();
  const response = value("response");
  const coming = response === "yes" || response === "plusOne";
  const withPlusOne = response === "plusOne";
  const ifComing = (key) => (coming ? value(key) : "");
  const ifPlusOne = (key) => (withPlusOne ? value(key) : "");
  return {
    name: value("name"),
    response,
    phone: ifComing("phone"),
    arrivalTime: ifComing("arrivalTime"),
    drink: ifComing("drink"),
    songRequest: ifComing("songRequest"),
    charadesMovie: ifComing("charadesMovie"),
    plusOneName: ifPlusOne("plusOneName"),
    plusOneRelation: ifPlusOne("plusOneRelation"),
    plusOnePhone: ifPlusOne("plusOnePhone"),
  };
};

// Accepts 10-digit Indian numbers or full international numbers; returns "+<digits>" or "".
const normalizePhone = (value) => {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) return `+91${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? `+${digits}` : "";
};

const maskPhone = (phone) => (phone ? `••••• ${phone.slice(-5)}` : "");

const validateRsvp = (data) => {
  if (data.name.length < 2) return "Hero, apna naam toh batao! (Enter your name)";
  if (!RESPONSE_LABELS[data.response]) return "Aa rahe ho ya nahi? Pick an option 🎬";
  if (data.response === "no") return "";
  if (!normalizePhone(data.phone)) return "WhatsApp number chahiye, mission wahin aayega 📱";
  if (!data.arrivalTime) return "Entry scene ka time choose karo ⏰";
  if (!data.drink) return "Pick your party fuel ☕🥛🧋";
  if (data.response !== "plusOne") return "";
  if (data.plusOneName.length < 2) return "Your +1's naam bhi chahiye 👯";
  if (!data.plusOneRelation) return "Partner or friend? Tell us who you're bringing 💑🤝";
  if (data.plusOnePhone && !normalizePhone(data.plusOnePhone)) return "That WhatsApp number looks off 📱";
  return "";
};

const keepOrPick = (options, previous) => (previous && options.includes(previous) ? previous : randomItem(options) ?? "");

const sendRsvp = async (payload) => {
  if (!CONFIG.rsvpEndpoint) {
    await delay(1500);
    const previous = storage.get(STORAGE_KEYS.rsvp, null);
    const coming = payload.response !== "no";
    const seat = previous?.seat ?? `DD-${String(Math.floor(Math.random() * 900) + 100)}`;
    return {
      item: keepOrPick(payload.options, previous?.item),
      team: coming ? keepOrPick(payload.teamOptions, previous?.team) : "",
      seat,
      demo: true,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    // text/plain body keeps this a "simple" CORS request, which Apps Script supports.
    const res = await fetch(CONFIG.rsvpEndpoint, {
      method: "POST",
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (!body.ok || !body.item) throw new Error(body.error || "Invalid response");
    return {
      item: body.item,
      team: body.team || "",
      seat: body.seat || "",
      demo: false,
    };
  } finally {
    clearTimeout(timer);
  }
};

// One ticket per RSVP. A +1 opens the invite and gets their own ticket when they RSVP.
const peopleOf = (rsvp) =>
  rsvp.team
    ? [
        {
          name: rsvp.name,
          team: rsvp.team,
          phone: rsvp.phone,
          seat: rsvp.seat,
          drink: rsvp.drink,
          quizScore: rsvp.quizScore,
          selfie: selfies.main.get(),
          coStarOf: "",
        },
      ]
    : [];

const buildWhatsappLink = (rsvp) => {
  const lines = [
    "🪔 Diwali Dhamaka RSVP",
    `Name: ${rsvp.name}`,
    `Status: ${RESPONSE_LABELS[rsvp.response]}`,
    rsvp.arrivalTime && `Arrival: ${rsvp.arrivalTime}`,
    rsvp.drink && `Party fuel: ${rsvp.drink}`,
    rsvp.phone && `WhatsApp: ${rsvp.phone}`,
    rsvp.plusOneName && `Bringing: ${rsvp.plusOneName} (${rsvp.plusOneRelation}) — still needs to RSVP`,
    ...peopleOf(rsvp).map((person) => `${person.name}'s team: ${person.team}`),
    `${rsvp.response === "no" ? "Punishment" : "Bringing"}: ${rsvp.item}`,
  ].filter(Boolean);
  return `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(lines.join("\n"))}`;
};

const inviteUrl = () => CONFIG.inviteUrl || `${location.origin}${location.pathname.replace(/party\.html$/, "")}`;

const buildShareInviteLink = (rsvp) => {
  const fill = { from: rsvp.name, to: rsvp.plusOneName, url: inviteUrl() };
  const text = (CONFIG.shareInviteMessage || "{from} invited you to Diwali Dhamaka: {url}").replace(
    /\{(\w+)\}/g,
    (_, key) => fill[key] ?? ""
  );
  const digits = String(rsvp.plusOnePhone || "").replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
};

const initRsvp = () => {
  const form = $("rsvp-form");
  const errorEl = $("form-error");
  const submitBtn = $("submit-btn");
  const pointer = $("wheel-pointer");
  const shareInvite = $("share-invite");
  const stages = ["wheel-stage", "team-stage", "ticket-stage", "regret-stage"].map($);
  let pending = null;
  let running = false;

  const wheel = createWheel($("wheel"), () => {
    sound.tick();
    restartAnimation(pointer, "is-tick");
  });

  const showStage = (id) => stages.forEach((stage) => (stage.hidden = stage.id !== id));

  const showForm = () => {
    form.hidden = false;
  };

  const updateConditionalFields = () => {
    const response = form.elements.response.value;
    $("when-coming").hidden = !(response === "yes" || response === "plusOne");
    $("plus-one").hidden = response !== "plusOne";
    submitBtn.textContent = response === "no" ? "😢 Send Regrets & Face the Wheel" : "🎰 Lock Kiya Jaaye & Spin!";
  };

  const fillForm = (rsvp) => {
    form.reset();
    if (rsvp) {
      const setRadio = (name, value) => {
        const input = form.querySelector(`input[name="${name}"][value="${value}"]`);
        if (input) input.checked = true;
      };
      setRadio("response", rsvp.response);
      setRadio("drink", rsvp.drink);
      setRadio("plusOneRelation", rsvp.plusOneRelation);
      ["name", "phone", "arrivalTime", "plusOneName", "plusOnePhone", "songRequest", "charadesMovie"].forEach((key) => {
        form.elements[key].value = rsvp[key] || "";
      });
    }
    errorEl.textContent = "";
    updateConditionalFields();
  };

  const renderTickets = async (rsvp) => {
    const people = peopleOf(rsvp);
    $("ticket-kicker").textContent = "🎟️ Your Official Ticket";

    const blocks = people.map((person) => {
      const block = el("div", "ticket-block");
      const canvas = el("canvas", "ticket-canvas");
      canvas.width = 900;
      canvas.height = 1500;
      canvas.setAttribute("aria-label", `${person.name}'s party ticket`);

      const note = el("div", "mission-note");
      note.append(
        el("p", "mission-head", `🕵️ ${person.name}'s secret mission`),
        el(
          "p",
          "mission-text",
          `Arrives on WhatsApp${person.phone ? ` at ${maskPhone(person.phone)}` : ""} once your RSVP is confirmed. Tell no one. Trust no one. 🤫`
        )
      );

      const save = el("button", "btn btn-gold btn-small", `⬇️ Save ${person.name}'s Ticket`);
      save.type = "button";
      save.addEventListener("click", () => saveTicket(canvas, person.name));

      block.append(canvas, note, save);
      return { block, canvas, person };
    });

    $("tickets").replaceChildren(...blocks.map((b) => b.block));
    await Promise.all(blocks.map(({ canvas, person }) => drawTicket(canvas, person, rsvp)));
  };

  const setWhatsapp = (rsvp) =>
    document.querySelectorAll("[data-whatsapp]").forEach((link) => {
      link.hidden = !CONFIG.whatsappNumber;
      if (CONFIG.whatsappNumber) link.href = buildWhatsappLink(rsvp);
    });

  const setShareInvite = (rsvp) => {
    const show = rsvp.response === "plusOne" && rsvp.plusOneName;
    shareInvite.hidden = !show;
    if (!show) return;
    $("share-invite-head").textContent = `📲 Share the invite with ${rsvp.plusOneName}`;
    $("share-invite-text").textContent = rsvp.plusOnePhone
      ? `Send ${rsvp.plusOneName} the invite so they can RSVP, spin the wheel & get their own ticket.`
      : `Opens WhatsApp with the invite link — pick ${rsvp.plusOneName}, they RSVP themselves.`;
    const btn = $("share-invite-btn");
    btn.href = buildShareInviteLink(rsvp);
    btn.textContent = `💬 WhatsApp ${rsvp.plusOneName}`;
  };

  const showFinal = async (rsvp) => {
    $("demo-note").hidden = !rsvp.demo;
    $("climax-nav").hidden = false;
    setWhatsapp(rsvp);

    if (rsvp.response === "no") {
      $("climax-title").textContent = "Kabhi Khushi Kabhie Gham";
      $("regret-item").textContent = rsvp.item;
      $("regret-sub").textContent = `We'll miss you, ${rsvp.name}! Your punishment has been noted 😜`;
      shareInvite.hidden = true;
      showStage("regret-stage");
      return;
    }

    $("climax-title").textContent = "The Climax: Your Ticket";
    showStage("ticket-stage");
    await renderTickets(rsvp);
    setShareInvite(rsvp);
  };

  const run = async (formData) => {
    if (running) return;
    running = true;
    const data = { ...formData, phone: normalizePhone(formData.phone), plusOnePhone: normalizePhone(formData.plusOnePhone) };
    pending = data;
    const previous = storage.get(STORAGE_KEYS.rsvp, null);
    const options = getWheelOptions(data.response);
    const copy = WHEEL_COPY[data.response];

    await goToScene(CLIMAX);
    showForm();
    $("climax-title").textContent = "The Climax";
    $("climax-nav").hidden = true;
    $("demo-note").hidden = true;
    $("wheel-kicker").textContent = copy.kicker;
    $("wheel-title").textContent = copy.title;
    $("wheel-status").textContent = "Ghoom raha hai... 🌀";
    $("wheel-error").hidden = true;
    showStage("wheel-stage");
    $("wheel-stage").classList.add("is-spinning");
    wheel.setItems(options);
    wheel.spinFree();

    let result;
    try {
      [result] = await Promise.all([
        sendRsvp({
          ...data,
          guestId: getGuestId(),
          quizScore: progress.quiz.score,
          options,
          teamOptions: CONFIG.teams.map((team) => team.name),
        }),
        delay(2200),
      ]);
    } catch (err) {
      console.error("RSVP failed", err);
      wheel.halt();
      $("wheel-stage").classList.remove("is-spinning");
      $("wheel-status").textContent = "";
      $("wheel-error").hidden = false;
      sound.buzz();
      running = false;
      return;
    }

    $("wheel-status").textContent = "Aur aapka faisla hai... 🥁";
    const index = options.indexOf(result.item);
    await wheel.stopAt(index >= 0 ? index : 0);
    $("wheel-stage").classList.remove("is-spinning");
    $("wheel-status").textContent =
      data.response === "no" ? `😈 ${result.item}!` : `🍲 You're bringing: ${result.item}!`;
    if (previous?.item === result.item) showToast("🔮", "Kismat nahi badlegi!", " Same as before 😉");

    const saved = { ...data, ...result, quizScore: progress.quiz.score, savedAt: new Date().toISOString() };
    storage.set(STORAGE_KEYS.rsvp, saved);
    renderProgress();

    if (data.response === "no") {
      sound.sad();
      await delay(1600);
      await showFinal(saved);
      running = false;
      return;
    }

    sound.fanfare();
    burstAt(0.5, 0.4, 70);
    await delay(1900);
    showStage("team-stage");
    for (const person of peopleOf(saved)) {
      await revealTeam(person.name, person.team);
      await delay(1600);
    }
    await showFinal(saved);
    fireworks(1600);
    running = false;
  };

  form.addEventListener("change", (event) => {
    if (event.target.name === "response") updateConditionalFields();
    errorEl.textContent = "";
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = readForm(form);
    const error = validateRsvp(data);
    if (error) {
      errorEl.textContent = error;
      restartAnimation(form, "is-shaking");
      sound.buzz();
      return;
    }
    run(data);
  });

  $("retry-btn").addEventListener("click", () => {
    if (!pending) return;
    running = false;
    run(pending);
  });

  $("edit-btn").addEventListener("click", () => {
    fillForm(storage.get(STORAGE_KEYS.rsvp, null));
    showForm();
    goToScene(RSVP_SCENE, { titleCard: false });
  });

  $("new-btn").addEventListener("click", () => {
    [STORAGE_KEYS.rsvp, STORAGE_KEYS.guest, STORAGE_KEYS.selfie].forEach(storage.remove);
    progress.quiz = freshQuiz();
    progress.maxReached = 0;
    saveProgress();
    window.location.reload();
  });

  $("replay-btn").addEventListener("click", () => goToScene(0));

  const saved = storage.get(STORAGE_KEYS.rsvp, null);
  updateConditionalFields();
  return {
    resume: () => {
      if (!saved) return false;
      showScene(CLIMAX);
      showFinal(saved);
      return true;
    },
  };
};

/* ---------- Boot ---------- */
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
const { playMusic } = initSound();
initScenes();
initDetails();
initCountdown();
initPledge();
initQuiz();
initSelfies();
const rsvp = initRsvp();
initSkyLanterns();
showScene(0);
initCurtain(() => {
  playMusic();
  rsvp.resume();
});
