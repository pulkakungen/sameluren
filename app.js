"use strict";

/* =========================================================
   SAMELUREN – uppgiftsapp med kråka och björn
   Samma stomme som Sassibrass, men egen ton, egna djur och
   egen push-worker.
   ========================================================= */

// Demoläge: öppna sidan med ?demo=1 för att visa upp appen utan att det
// syns i rapporten eller stjäl push-prenumerationen.
const DEMO_MODE = new URLSearchParams(location.search).get("demo") === "1";
const STORAGE_KEY = DEMO_MODE ? "sameluren_demo_state_v1" : "sameluren_state_v1";

/* ---------------------------------------------------------
   Push-notiser (egen Cloudflare Worker, skild från Sassas)
   --------------------------------------------------------- */
const PUSH_WORKER_URL = "https://sameluren-push.bella-sassibrass.workers.dev";
const VAPID_PUBLIC_KEY = "ERSÄTT_MED_EGEN_VAPID_PUBLIC_KEY";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("sw.js");
  } catch (e) {
    return null;
  }
}

async function getPushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function enablePushNotifications() {
  if (DEMO_MODE) return false;
  if (!("Notification" in window) || !("PushManager" in window)) {
    alert("Den här webbläsaren stödjer inte push-notiser.");
    return false;
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });

  await fetch(PUSH_WORKER_URL + "/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription)
  }).catch(() => {});

  return true;
}

async function disablePushNotifications() {
  const sub = await getPushSubscription();
  if (sub) {
    await sub.unsubscribe();
  }
  await fetch(PUSH_WORKER_URL + "/unsubscribe", { method: "POST" }).catch(() => {});
}

function syncStateToWorker() {
  if (DEMO_MODE) return;
  const allDoneToday = Object.keys(state.completedToday).length >= totalTasksToday();
  const tasks = [];
  TASK_SECTIONS.forEach((section) => {
    activeTasksForSection(section).forEach((t) => {
      tasks.push({ id: t.id, text: t.text, done: !!state.completedToday[t.id] });
    });
  });
  fetch(PUSH_WORKER_URL + "/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allDoneToday, tasks, hunger: state.hunger, happiness: state.happiness })
  }).catch(() => {});
}

/* ---------------------------------------------------------
   Uppgifter, indelade i sektioner för hela dagen
   --------------------------------------------------------- */
// days: valfri lista med veckodagsnummer (0=söndag ... 6=lördag) uppgiften gäller.
// Ingen "days"-lista = uppgiften gäller varje dag.
// parity: "even"/"odd" ger uppgifter som återkommer varannan dag.
const DAG_MAN = 1, DAG_TIS = 2, DAG_ONS = 3, DAG_TORS = 4, DAG_FRE = 5, DAG_LOR = 6, DAG_SON = 0;

const TASK_SECTIONS = [
  {
    id: "morgon",
    emoji: "🌅",
    title: "Morgon",
    tasks: [
      { id: "vakna", emoji: "⏰", text: "Upp ur sängen" },
      { id: "kladd", emoji: "👕", text: "Klä på dig" },
      { id: "badda", emoji: "🛏️", text: "Bädda sängen" },
      { id: "tvatta-ansikte", emoji: "💦", text: "Tvätta ansiktet" },
      { id: "deo", emoji: "🧴", text: "Deo och hår" },
      { id: "affirmation-rutin", emoji: "🎯", text: "Läs veckans affirmation" }
    ]
  },
  {
    id: "frukost",
    emoji: "🍳",
    title: "Frukost",
    tasks: [
      { id: "at-frukost", emoji: "🥣", text: "Ät frukost" },
      { id: "drick-vatten", emoji: "💧", text: "Drick vatten" },
      { id: "tander-morgon", emoji: "🪥", text: "Borsta tänderna" },
      { id: "matsack", emoji: "🍎", text: "Ta med mellanmål" }
    ]
  },
  {
    id: "skola",
    emoji: "🎒",
    title: "Till skolan",
    tasks: [
      { id: "schema", emoji: "🗓️", text: "Kolla schemat" },
      { id: "packa-vaskan", emoji: "💻", text: "Packa dator och böcker" },
      { id: "till-skolan", emoji: "🚲", text: "Ta dig till skolan i tid" }
    ]
  },
  {
    id: "hemma",
    emoji: "🏠",
    title: "Hemma efter skolan",
    tasks: [
      { id: "mellanmal", emoji: "🥪", text: "Ät ett mellanmål" },
      { id: "matsopor", emoji: "🍂", text: "Gå ut med matsopor", days: [DAG_MAN, DAG_ONS, DAG_FRE] },
      { id: "plastsopor", emoji: "♻️", text: "Gå ut med plastsopor", days: [DAG_TIS, DAG_TORS] },
      { id: "restavfall", emoji: "🗑️", text: "Gå ut med restavfall", days: [DAG_SON] },
      { id: "tvatten", emoji: "🧺", text: "Gå ner med tvätten", days: [DAG_MAN, DAG_TORS] },
      { id: "snygga-rum", emoji: "🧹", text: "Plocka undan rummet" },
      { id: "dammsuga", emoji: "🌀", text: "Dammsuga", days: [DAG_LOR] },
      { id: "diskmaskin", emoji: "🍽️", text: "Töm eller fyll diskmaskinen" }
    ]
  },
  {
    id: "skolarbete",
    emoji: "📚",
    title: "Skolarbete och kompisar",
    tasks: [
      { id: "laxa", emoji: "📖", text: "Gör läxan" },
      { id: "plugg-prov", emoji: "📝", text: "Plugga på kommande prov", days: [DAG_MAN, DAG_ONS, DAG_SON] },
      { id: "kompis", emoji: "💬", text: "Träffa eller hör av dig till en kompis" }
    ]
  },
  {
    id: "traning",
    emoji: "🏋️",
    title: "Träning",
    tasks: [
      { id: "traning", emoji: "🏋️", text: "Träningspass", days: [DAG_TIS, DAG_TORS, DAG_LOR] },
      { id: "duscha", emoji: "🚿", text: "Duscha", days: [DAG_TIS, DAG_TORS, DAG_LOR] },
      { id: "ut-en-sving", emoji: "🌤️", text: "Ut en sväng, rör på dig" }
    ]
  },
  {
    id: "kvall",
    emoji: "🌙",
    title: "Kväll",
    tasks: [
      { id: "tander-kvall", emoji: "🪥", text: "Borsta tänderna" },
      { id: "klader-imorgon", emoji: "🧦", text: "Lägg fram kläder till imorgon" },
      { id: "dator-laddning", emoji: "🔌", text: "Sätt datorn på laddning" },
      { id: "planera-veckan", emoji: "🗒️", text: "Planera kommande vecka", days: [DAG_SON] },
      { id: "skarm-av", emoji: "📵", text: "Lägg undan mobilen en stund före läggdags" },
      { id: "las", emoji: "📕", text: "Läs en stund" },
      { id: "lagga-sig", emoji: "😴", text: "Lägg dig i tid" }
    ]
  }
];

const WEEKDAY_NAMES = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];

function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.floor((date - start) / 86400000) + 1;
}

function isTaskActiveOnDate(task, date) {
  if (task.days && !task.days.includes(date.getDay())) return false;
  if (task.parity) {
    const isEven = dayOfYear(date) % 2 === 0;
    if (task.parity === "even" && !isEven) return false;
    if (task.parity === "odd" && isEven) return false;
  }
  return true;
}
function isTaskActiveToday(task) {
  return isTaskActiveOnDate(task, new Date());
}
function activeTasksForSection(section, date) {
  const d = date === undefined ? new Date() : date;
  return section.tasks.filter((t) => isTaskActiveOnDate(t, d));
}
function totalTasksForDate(date) {
  return TASK_SECTIONS.reduce((s, sec) => s + activeTasksForSection(sec, date).length, 0);
}
function totalTasksToday() {
  return totalTasksForDate(new Date());
}

const XP_PER_TASK = 5;
const FOOD_PER_TASK = 1;
const LOVE_PER_TASK = 1;
const MAX_FOOD = 4; // tak på lagret, så mat och kärlek måste tjänas in löpande
const MAX_LOVE = 4;

function xpToNext(level) {
  return 350 + (level - 1) * 80;
}

/* ---------------------------------------------------------
   Djuren: mat och benämningar
   --------------------------------------------------------- */
const PET_INFO = {
  crow: { label: "Kråkan", foodEmoji: "🌻", foodWord: "frön", feedLabel: "Ge frön" },
  bear: { label: "Björnen", foodEmoji: "🥓", foodWord: "bacon", feedLabel: "Ge bacon" }
};

function petInfo() {
  return PET_INFO[state.petType] || PET_INFO.crow;
}

/* ---------------------------------------------------------
   Meddelanden: torrt, kort och peppigt
   --------------------------------------------------------- */
const TASK_MESSAGES = [
  "Klart. Snyggt jobbat.",
  "En till avbockad. Fortsätt så.",
  "Bra. Du ligger före ditt eget schema nu.",
  "Där satt den.",
  "Effektivt. Jag är imponerad, och jag imponeras sällan.",
  "Klart utan att någon behövde tjata. Notera det.",
  "Det där gick smidigt.",
  "Bockat. Nästa.",
  "Du gör det där lite för lätt.",
  "Solid insats.",
  "Snyggt. Listan krymper.",
  "Punkt avklarad. Bra tempo.",
  "Du vet vad du gör.",
  "Klart och betalt.",
  "Grymt. Dagen jobbar för dig nu.",
  "Där tog du i lite extra.",
  "Utmärkt. Fortsätt i den takten.",
  "Klart. Jag har fortfarande inget att klaga på.",
  "En till i kassan.",
  "Det där var ju inte så farligt."
];

const SECTION_COMPLETE_MESSAGES = [
  "Hela sektionen klar. Starkt.",
  "Allt avbockat i den kategorin. Snyggt.",
  "Full pott där. Bra jobbat.",
  "Sektionen är historia.",
  "Det där var rent spel."
];

const ALL_DONE_MESSAGES = [
  "Hela dagen klar. Det är en riktigt bra dag.",
  "Allt avbockat. Streaken är säkrad.",
  "Perfekt dag. Du får vara nöjd nu.",
  "Noll kvar på listan. Bra gjort."
];

const LEVEL_UP_MESSAGES = [
  "Level up. Du blir starkare, jag blir gladare.",
  "Ny nivå. Det där har du förtjänat.",
  "Level up. Fortsätt så här så blir det löjligt bra."
];

const FOOD_MESSAGES = {
  crow: ["Precis vad jag behövde.", "Frön. Alltid rätt svar.", "Tack, jag var faktiskt hungrig.", "Bra kvalitet på det här."],
  bear: ["Bacon. Du förstår dig på mig.", "Det där var gott.", "Tack, magen är nöjd nu.", "Nu är jag på bra humör."]
};

const LOVE_MESSAGES = [
  "Skönt att du kollar in.",
  "Jag mår bättre nu, faktiskt.",
  "Bra att du är här.",
  "Vi är ett rätt bra team."
];

const GREETING_MORNING = [
  "God morgon. Dags att dra igång.",
  "Morgon. Dagen är helt öppen än."
];
const GREETING_AFTERNOON = [
  "Tja. Hur går det?",
  "Halva dagen kvar. Bra läge att ta några punkter."
];
const GREETING_EVENING = [
  "Kväll. Dags att stänga ner dagen ordentligt.",
  "Sista sträckan för idag."
];

const LOW_HUNGER_BUBBLE = ["Jag börjar bli hungrig här.", "Lite mat hade suttit fint."];
const LOW_HAPPINESS_BUBBLE = ["Det var ett tag sen sist.", "Jag skulle inte säga nej till lite uppmärksamhet."];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isConsecutiveDay(prevStr, curStr) {
  if (!prevStr) return false;
  const prev = new Date(prevStr + "T00:00:00");
  const cur = new Date(curStr + "T00:00:00");
  const diffDays = Math.round((cur - prev) / 86400000);
  return diffDays === 1;
}

/* ---------------------------------------------------------
   State
   --------------------------------------------------------- */
function defaultState() {
  return {
    petType: null,
    petName: "",
    level: 1,
    xp: 0,
    food: 2,
    love: 2,
    hunger: 80,
    happiness: 80,
    lastStatDecayAt: null,
    hasBaby: false,
    babyName: "",
    nextBabyLevel: 30,
    streak: 0,
    lastActiveDate: null,
    completedToday: {},
    rewardedToday: {},
    totalCompleted: 0,
    sectionsCollapsed: {}
  };
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultState(), parsed);
  } catch (e) {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function handleDailyReset() {
  const today = todayStr();
  if (state.lastActiveDate === today) return;

  if (state.lastActiveDate) {
    const completedCount = Object.keys(state.completedToday).length;
    const lastActiveDateObj = new Date(state.lastActiveDate + "T00:00:00");
    const wasFullDay = completedCount >= totalTasksForDate(lastActiveDateObj);
    const consecutive = isConsecutiveDay(state.lastActiveDate, today);

    if (wasFullDay && (consecutive || state.streak === 0)) {
      state.streak += 1;
    } else if (!consecutive) {
      state.streak = 0;
    } else if (!wasFullDay) {
      state.streak = 0;
    }
  }

  state.completedToday = {};
  state.rewardedToday = {};
  state.lastActiveDate = today;
  saveState();
}

const HUNGER_DECAY_PER_HOUR = 6;
const HAPPINESS_DECAY_PER_HOUR = 3;

// Sänker hunger och humör i takt med hur länge sen appen var öppen, istället
// för en engångsminskning per dygn. Håller staplarna i synk med notiserna,
// som räknar på samma sätt i workern.
function applyStatDecay() {
  const now = new Date();
  if (!state.lastStatDecayAt) {
    state.lastStatDecayAt = now.toISOString();
    saveState();
    return;
  }
  const hoursElapsed = (now - new Date(state.lastStatDecayAt)) / (60 * 60 * 1000);
  if (hoursElapsed < 0.1) return; // för kort tid för att vara värt att räkna

  state.hunger = Math.round(clamp(state.hunger - hoursElapsed * HUNGER_DECAY_PER_HOUR, 10, 100));
  state.happiness = Math.round(clamp(state.happiness - hoursElapsed * HAPPINESS_DECAY_PER_HOUR, 10, 100));
  state.lastStatDecayAt = now.toISOString();
  saveState();
}

/* ---------------------------------------------------------
   Djuren ritas som SVG i koden
   Byts ut mot riktiga SVG-filer när de kommer.
   --------------------------------------------------------- */
const INK = "#101c33";

function eyesMarkup(mood, cx1, cx2, cy) {
  if (mood === "love") {
    const heart = (cx) => `
      <path d="M${cx} ${cy + 6} C${cx - 8} ${cy - 4}, ${cx - 2} ${cy - 12}, ${cx} ${cy - 6}
               C${cx + 2} ${cy - 12}, ${cx + 8} ${cy - 4}, ${cx} ${cy + 6} Z" fill="#ff8c42"/>`;
    return heart(cx1) + heart(cx2);
  }
  if (mood === "sad") {
    return `
      <circle cx="${cx1}" cy="${cy}" r="6.5" fill="${INK}"/>
      <circle cx="${cx2}" cy="${cy}" r="6.5" fill="${INK}"/>
      <path d="M${cx1 - 7} ${cy - 11} q7 -5 14 1" stroke="${INK}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M${cx2 - 7} ${cy - 10} q7 -6 14 -1" stroke="${INK}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    `;
  }
  // happy / yum: vakna ögon med liten glans
  return `
    <circle cx="${cx1}" cy="${cy}" r="8" fill="${INK}"/>
    <circle cx="${cx2}" cy="${cy}" r="8" fill="${INK}"/>
    <circle cx="${cx1 - 2.6}" cy="${cy - 2.8}" r="2.4" fill="#fff"/>
    <circle cx="${cx2 - 2.6}" cy="${cy - 2.8}" r="2.4" fill="#fff"/>
  `;
}

function mouthMarkup(mood, cx, cy) {
  if (mood === "yum") {
    return `<ellipse cx="${cx}" cy="${cy}" rx="6" ry="7.5" fill="#7a2f1d"/>
            <ellipse cx="${cx}" cy="${cy + 3}" rx="3.5" ry="2.5" fill="#e08163"/>`;
  }
  if (mood === "sad") {
    return `<path d="M${cx - 9} ${cy + 5} q9 -8 18 0" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  }
  return `<path d="M${cx - 10} ${cy - 3} q10 11 20 0" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
}

// Ankarpunkter per djur, så accessoarerna hamnar rätt på både kråka och björn
// även när djuren byts ut mot riktiga SVG-filer.
const PET_ANCHORS = {
  crow: { headCx: 104, headR: 34, headTop: 32, eyeCy: 62, neckY: 126, bodyLeft: 46 },
  bear: { headCx: 100, headR: 58, headTop: 26, eyeCy: 76, neckY: 142, bodyLeft: 34 }
};

// Accessoarer låses upp var femte nivå och blir kvar. De två senaste visas
// samtidigt, så det känns som en växande samling utan att bli rörigt.
const ACCESSORY_TIERS = [
  {
    level: 3,
    label: "Keps",
    markup: (a) => `<g transform="translate(${a.headCx},${a.headTop + 4})">
      <path d="M${-a.headR * 0.85} 4 Q${-a.headR * 0.85} -20 0 -20 Q${a.headR * 0.85} -20 ${a.headR * 0.85} 4 Z" fill="#ff8c42"/>
      <path d="M${-a.headR * 0.85} 4 Q-4 10 ${a.headR * 0.85} 2 L${a.headR * 0.85 + 3} 8 Q-4 16 ${-a.headR * 0.85 - 2} 10 Z" fill="#e5762f"/>
      <circle cx="0" cy="-18" r="3.5" fill="#ffd0ad"/>
    </g>`
  },
  {
    level: 8,
    label: "Hörlurar",
    markup: (a) => `<g>
      <path d="M${a.headCx - a.headR - 2} ${a.eyeCy} Q${a.headCx} ${a.headTop - 26} ${a.headCx + a.headR + 2} ${a.eyeCy}" stroke="#f2f5fa" stroke-width="6" fill="none" stroke-linecap="round"/>
      <rect x="${a.headCx - a.headR - 12}" y="${a.eyeCy - 8}" width="19" height="28" rx="8" fill="#ff8c42"/>
      <rect x="${a.headCx + a.headR - 7}" y="${a.eyeCy - 8}" width="19" height="28" rx="8" fill="#ff8c42"/>
    </g>`
  },
  {
    level: 13,
    label: "Solglasögon",
    markup: (a) => `<g transform="translate(${a.headCx},${a.eyeCy})">
      <rect x="-36" y="-10" width="31" height="20" rx="7" fill="#16233d"/>
      <rect x="5" y="-10" width="31" height="20" rx="7" fill="#16233d"/>
      <path d="M-5 -3 Q0 -8 5 -3" stroke="#16233d" stroke-width="4" fill="none"/>
      <rect x="-32" y="-7" width="8" height="4" rx="2" fill="#fff" opacity="0.35"/>
      <rect x="9" y="-7" width="8" height="4" rx="2" fill="#fff" opacity="0.35"/>
    </g>`
  },
  {
    level: 18,
    label: "Halsduk",
    markup: (a) => `<g transform="translate(${a.headCx},${a.neckY})">
      <path d="M-30 -4 Q0 10 30 -4 Q30 8 0 18 Q-30 8 -30 -4 Z" fill="#ff8c42"/>
      <path d="M16 7 L27 29 L16 31 L9 12 Z" fill="#e5762f"/>
    </g>`
  },
  {
    level: 23,
    label: "Ryggsäck",
    markup: (a) => `<g transform="translate(${a.bodyLeft},${a.neckY - 14})">
      <rect x="-13" y="-15" width="26" height="34" rx="9" fill="#2c4270"/>
      <rect x="-13" y="-2" width="26" height="8" rx="3" fill="#ff8c42"/>
      <path d="M-6 -15 Q0 -26 6 -15" stroke="#2c4270" stroke-width="4" fill="none"/>
    </g>`
  },
  {
    level: 28,
    label: "Medalj",
    markup: (a) => `<g transform="translate(${a.headCx},${a.neckY - 8})">
      <path d="M-10 -16 L-3 4 M10 -16 L3 4" stroke="#2c4270" stroke-width="4" stroke-linecap="round"/>
      <circle cx="0" cy="12" r="10" fill="#f3b23f" stroke="#c98c24" stroke-width="2"/>
      <path d="M0 6 l2 4.2 4.6 0.6 -3.3 3.2 0.8 4.6 -4.1 -2.2 -4.1 2.2 0.8 -4.6 -3.3 -3.2 4.6 -0.6 Z" fill="#fff3d6"/>
    </g>`
  }
];

function accessoryMarkup(type, level) {
  const anchors = PET_ANCHORS[type] || PET_ANCHORS.crow;
  const earned = ACCESSORY_TIERS.filter((t) => level >= t.level);
  return earned.slice(-2).map((t) => t.markup(anchors)).join("");
}

function petSizeScale(level) {
  if (level >= 30) return 1.45;
  if (level >= 20) return 1.3;
  if (level >= 10) return 1.15;
  return 1;
}

// Kråkan: näbben öppnas när den äter, så den slipper en ritad mun.
function crowBeak(mood) {
  if (mood === "yum") {
    return `
      <path d="M137 58 L170 52 L138 66 Z" fill="#ff8c42"/>
      <path d="M137 70 L170 80 L138 74 Z" fill="#e5762f"/>`;
  }
  return `
    <path d="M136 56 L171 66 L136 76 Z" fill="#ff8c42"/>
    <path d="M136 67 L171 66 L136 72 Z" fill="#e5762f"/>`;
}

function renderCrowSVG(mood, level) {
  return `
  <svg viewBox="0 0 200 180" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="100" cy="168" rx="46" ry="7" fill="#000" opacity="0.2"/>
    <path d="M62 126 Q26 140 10 166 Q44 160 70 142 Z" fill="#222f47"/>
    <ellipse cx="100" cy="118" rx="44" ry="42" fill="#2c3b58"/>
    <path d="M78 96 Q118 96 126 130 Q112 156 84 146 Q66 128 78 96 Z" fill="#243350"/>
    <circle cx="104" cy="66" r="34" fill="#2c3b58"/>
    <path d="M74 40 Q88 28 100 36 Q86 40 78 48 Z" fill="#243350"/>
    ${crowBeak(mood)}
    ${eyesMarkup(mood, 92, 118, 62)}
    <path d="M88 152 L84 168 M112 152 L116 168" stroke="#8a97ad" stroke-width="4" stroke-linecap="round"/>
    ${accessoryMarkup("crow", level)}
  </svg>`;
}

function renderBearSVG(mood, level) {
  return `
  <svg viewBox="0 0 200 180" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="100" cy="166" rx="50" ry="7" fill="#000" opacity="0.2"/>
    <circle cx="56" cy="42" r="20" fill="#8a5a33"/>
    <circle cx="144" cy="42" r="20" fill="#8a5a33"/>
    <circle cx="56" cy="42" r="10" fill="#c89163"/>
    <circle cx="144" cy="42" r="10" fill="#c89163"/>
    <ellipse cx="100" cy="94" rx="58" ry="56" fill="#8a5a33"/>
    <ellipse cx="100" cy="114" rx="31" ry="23" fill="#d8ab7c"/>
    <ellipse cx="100" cy="102" rx="9" ry="6.5" fill="${INK}"/>
    ${eyesMarkup(mood, 80, 120, 76)}
    ${mouthMarkup(mood, 100, 120)}
    ${accessoryMarkup("bear", level)}
  </svg>`;
}

function petSVG(type, mood, level) {
  return type === "bear" ? renderBearSVG(mood, level) : renderCrowSVG(mood, level);
}

let currentMood = "happy";
function updatePetAvatars(mood) {
  currentMood = mood || currentMood;
  const svg = petSVG(state.petType, currentMood, state.level);
  const mini = document.getElementById("pet-avatar");
  const big = document.getElementById("pet-avatar-big");
  if (mini) mini.innerHTML = svg;
  if (big) big.innerHTML = svg;

  const sizeWrap = document.getElementById("pet-size-wrap");
  if (sizeWrap) sizeWrap.style.transform = `scale(${petSizeScale(state.level)})`;
}

function flashMood(mood, duration = 1400) {
  updatePetAvatars(mood);
  setTimeout(() => updatePetAvatars("happy"), duration);
}

/* ---------------------------------------------------------
   UI: toast, konfetti, flygande emoji
   --------------------------------------------------------- */
function showToast(text, big) {
  const layer = document.getElementById("toast-layer");
  const el = document.createElement("div");
  el.className = "toast" + (big ? " big" : "");
  el.textContent = text;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 2700);
}

const CONFETTI_COLORS = ["#ff8c42", "#ffb26b", "#f3b23f", "#6ea8e8", "#f2f5fa"];
function burstConfetti(count) {
  const layer = document.getElementById("confetti-layer");
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "confetti-piece";
    const size = 6 + Math.random() * 6;
    el.style.left = Math.random() * 100 + "vw";
    el.style.width = size + "px";
    el.style.height = size * 0.6 + "px";
    el.style.background = pick(CONFETTI_COLORS);
    el.style.animationDuration = 1.6 + Math.random() * 1.2 + "s";
    el.style.opacity = String(0.8 + Math.random() * 0.2);
    layer.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }
}

function floatEmojiFromPet(emoji) {
  const stage = document.querySelector(".pet-stage");
  if (!stage) return;
  const el = document.createElement("div");
  el.className = "float-emoji";
  el.textContent = emoji;
  const rect = stage.getBoundingClientRect();
  el.style.left = rect.width / 2 - 12 + (Math.random() * 40 - 20) + "px";
  el.style.top = "50px";
  stage.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

/* ---------------------------------------------------------
   Rendering
   --------------------------------------------------------- */
function setBubble(text) {
  const el = document.getElementById("pet-bubble");
  if (el) el.textContent = text;
}

function greetingForNow() {
  const h = new Date().getHours();
  if (h < 10) return pick(GREETING_MORNING);
  if (h < 17) return pick(GREETING_AFTERNOON);
  return pick(GREETING_EVENING);
}

function updateFoodLabels() {
  const info = petInfo();
  const label = document.getElementById("feed-btn-label");
  const icon = document.getElementById("food-icon");
  if (label) label.textContent = `${info.foodEmoji} ${info.feedLabel}`;
  if (icon) icon.textContent = info.foodEmoji;
}

function updateStatsUI() {
  document.getElementById("pet-name-display").textContent = state.petName;
  document.getElementById("pet-level").textContent = "Lvl " + state.level;

  const xpPct = clamp((state.xp / xpToNext(state.level)) * 100, 0, 100);
  document.getElementById("xp-fill").style.width = xpPct + "%";
  document.getElementById("hunger-fill").style.width = state.hunger + "%";
  document.getElementById("happiness-fill").style.width = state.happiness + "%";

  document.getElementById("streak-count").textContent = state.streak;
  document.getElementById("food-count").textContent = state.food;
  document.getElementById("love-count").textContent = state.love;

  document.getElementById("feed-btn").disabled = state.food <= 0;
  document.getElementById("love-btn").disabled = state.love <= 0;

  const doneCount = Object.keys(state.completedToday).length;
  const totalToday = totalTasksToday();
  document.getElementById("daily-progress-text").textContent = `${doneCount} / ${totalToday}`;
  document.getElementById("daily-progress-fill").style.width = clamp((doneCount / totalToday) * 100, 0, 100) + "%";
  document.getElementById("daily-progress-weekday").textContent = WEEKDAY_NAMES[new Date().getDay()];

  if (state.hunger <= 25) setBubble(pick(LOW_HUNGER_BUBBLE));
  else if (state.happiness <= 25) setBubble(pick(LOW_HAPPINESS_BUBBLE));
}

function renderTaskSections() {
  const container = document.getElementById("task-sections");
  container.innerHTML = "";

  TASK_SECTIONS.forEach((section) => {
    const todaysTasks = activeTasksForSection(section);
    if (todaysTasks.length === 0) return;

    const doneInSection = todaysTasks.filter((t) => state.completedToday[t.id]).length;
    const collapsed = !!state.sectionsCollapsed[section.id];

    const sectionEl = document.createElement("div");
    sectionEl.className = "task-section" + (collapsed ? " collapsed" : "");
    sectionEl.innerHTML = `
      <div class="task-section-header" data-section="${section.id}">
        <span class="task-section-emoji">${section.emoji}</span>
        <span class="task-section-title">${section.title}</span>
        <span class="task-section-progress">${doneInSection}/${todaysTasks.length}</span>
        <span class="task-section-chevron">▾</span>
      </div>
      <ul class="task-list">
        ${todaysTasks
          .map((t) => {
            const done = !!state.completedToday[t.id];
            return `
            <li class="task-item${done ? " done" : ""}" data-task="${t.id}" data-section="${section.id}">
              <span class="task-checkbox">${done ? "✓" : ""}</span>
              <span class="task-emoji">${t.emoji}</span>
              <span class="task-label">${t.text}</span>
            </li>`;
          })
          .join("")}
      </ul>
    `;
    container.appendChild(sectionEl);
  });
}

function renderAll() {
  updatePetAvatars("happy");
  updateFoodLabels();
  updateStatsUI();
  renderTaskSections();
  renderBabyAvatar();
  setBubble(greetingForNow());
  document.getElementById("demo-badge").hidden = !DEMO_MODE;
}

/* ---------------------------------------------------------
   Unge: dyker upp vid nextBabyLevel, val en nivå senare
   --------------------------------------------------------- */
function renderBabyAvatar() {
  const wrap = document.getElementById("baby-avatar-wrap");
  if (!wrap) return;
  if (!state.hasBaby) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  document.getElementById("baby-avatar").innerHTML = petSVG(state.petType, "happy", 1);
  document.getElementById("baby-name-tag").textContent = state.babyName;
}

function showBabyChoiceModal() {
  const modal = document.getElementById("baby-choice-modal");
  document.getElementById("baby-choice-text").textContent =
    `${state.babyName} har vuxit klart. Vill du börja om från nivå 1 med ${state.babyName} som ditt djur, eller låta ${state.babyName} flytta ut och fortsätta som vanligt med ${state.petName}?`;
  modal.hidden = false;
}

function hideBabyChoiceModal() {
  document.getElementById("baby-choice-modal").hidden = true;
}

function checkBabyMilestones() {
  if (!state.hasBaby && state.level >= state.nextBabyLevel) {
    const input = prompt("En unge har dykt upp. Vad ska den heta?", "");
    const name = (input || "Lillen").trim().slice(0, 16) || "Lillen";
    state.hasBaby = true;
    state.babyName = name;
    saveState();
    renderBabyAvatar();
    showToast(`En unge har dykt upp. Välkommen, ${name}.`, true);
    burstConfetti(30);
    return;
  }
  if (state.hasBaby && state.level >= state.nextBabyLevel + 1) {
    showBabyChoiceModal();
  }
}

/* ---------------------------------------------------------
   Logik: klara uppgift, mata, ge kärlek
   --------------------------------------------------------- */
function completeTask(taskId, sectionId) {
  const alreadyDone = !!state.completedToday[taskId];

  if (alreadyDone) {
    delete state.completedToday[taskId];
    saveState();
    renderTaskSections();
    updateStatsUI();
    return;
  }

  state.completedToday[taskId] = true;

  if (!state.rewardedToday[taskId]) {
    state.rewardedToday[taskId] = true;
    state.xp += XP_PER_TASK;
    state.food = clamp(state.food + FOOD_PER_TASK, 0, MAX_FOOD);
    state.love = clamp(state.love + LOVE_PER_TASK, 0, MAX_LOVE);
    state.totalCompleted += 1;

    const levelBefore = state.level;
    let leveledUp = false;
    while (state.xp >= xpToNext(state.level)) {
      state.xp -= xpToNext(state.level);
      state.level += 1;
      state.food = clamp(state.food + 2, 0, MAX_FOOD);
      state.love = clamp(state.love + 2, 0, MAX_LOVE);
      leveledUp = true;
    }

    showToast(pick(TASK_MESSAGES));
    burstConfetti(14);
    flashMood("love", 900);

    if (leveledUp) {
      setTimeout(() => {
        showToast(pick(LEVEL_UP_MESSAGES), true);
        burstConfetti(30);
      }, 350);

      const newAccessory = ACCESSORY_TIERS.find((t) => t.level > levelBefore && t.level <= state.level);
      const newSizeTier = [10, 20, 30].find((l) => l > levelBefore && l <= state.level);
      let extraDelay = 900;
      if (newAccessory) {
        setTimeout(() => {
          showToast(`Upplåst: ${newAccessory.label}`, true);
          burstConfetti(24);
        }, extraDelay);
        extraDelay += 550;
      }
      if (newSizeTier) {
        setTimeout(() => {
          showToast(`${petInfo().label} har vuxit.`, true);
          burstConfetti(24);
        }, extraDelay);
      }

      checkBabyMilestones();
    }

    const section = TASK_SECTIONS.find((s) => s.id === sectionId);
    const sectionDone = activeTasksForSection(section).every((t) => state.completedToday[t.id]);
    if (sectionDone) {
      setTimeout(() => showToast(pick(SECTION_COMPLETE_MESSAGES)), leveledUp ? 750 : 400);
      burstConfetti(20);
    }

    const allDone = Object.keys(state.completedToday).length >= totalTasksToday();
    if (allDone) {
      setTimeout(() => {
        showToast(pick(ALL_DONE_MESSAGES), true);
        burstConfetti(50);
      }, sectionDone ? 1100 : 500);
    }
  }

  saveState();
  renderTaskSections();
  updateStatsUI();
  syncStateToWorker();
}

function pulsePet() {
  const big = document.getElementById("pet-avatar-big");
  big.classList.add("pulse-once");
  setTimeout(() => big.classList.remove("pulse-once"), 500);
}

function feedPet() {
  if (state.food <= 0) return;
  const info = petInfo();
  state.food -= 1;
  state.hunger = clamp(state.hunger + 20, 0, 100);
  saveState();
  updateStatsUI();
  floatEmojiFromPet(info.foodEmoji);
  setBubble(pick(FOOD_MESSAGES[state.petType] || FOOD_MESSAGES.crow));
  flashMood("yum", 900);
  pulsePet();
}

function lovePet() {
  if (state.love <= 0) return;
  state.love -= 1;
  state.happiness = clamp(state.happiness + 20, 0, 100);
  saveState();
  updateStatsUI();
  floatEmojiFromPet("🧡");
  setBubble(pick(LOVE_MESSAGES));
  flashMood("love", 900);
  pulsePet();
}

/* ---------------------------------------------------------
   Startskärm
   --------------------------------------------------------- */
function initStartScreen() {
  let chosenPet = null;
  const choices = document.querySelectorAll(".pet-choice");
  const nameInput = document.getElementById("pet-name-input");
  const startBtn = document.getElementById("start-btn");

  choices.forEach((btn) => {
    const previewEl = btn.querySelector(".pet-avatar-preview");
    previewEl.innerHTML = petSVG(btn.dataset.pet, "happy", 1);
    btn.addEventListener("click", () => {
      chosenPet = btn.dataset.pet;
      choices.forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      validateStart();
    });
  });

  function validateStart() {
    startBtn.disabled = !(chosenPet && nameInput.value.trim().length > 0);
  }
  nameInput.addEventListener("input", validateStart);

  startBtn.addEventListener("click", () => {
    if (!chosenPet || !nameInput.value.trim()) return;
    state.petType = chosenPet;
    state.petName = nameInput.value.trim().slice(0, 16);
    state.lastActiveDate = todayStr();
    saveState();
    showAppScreen();
  });
}

async function showAppScreen() {
  document.getElementById("screen-start").classList.remove("active");
  document.getElementById("screen-app").classList.add("active");
  renderAll();
  checkBabyMilestones();

  const sub = await getPushSubscription();
  if (sub) document.getElementById("notif-btn").classList.add("active");
}

/* ---------------------------------------------------------
   Events
   --------------------------------------------------------- */
function initAppEvents() {
  document.getElementById("task-sections").addEventListener("click", (e) => {
    const header = e.target.closest(".task-section-header");
    if (header) {
      const id = header.dataset.section;
      state.sectionsCollapsed[id] = !state.sectionsCollapsed[id];
      saveState();
      renderTaskSections();
      return;
    }
    const item = e.target.closest(".task-item");
    if (item) {
      completeTask(item.dataset.task, item.dataset.section);
    }
  });

  document.getElementById("feed-btn").addEventListener("click", feedPet);
  document.getElementById("love-btn").addEventListener("click", lovePet);

  document.getElementById("notif-btn").addEventListener("click", async () => {
    if (DEMO_MODE) {
      showToast("Notiser är avstängda i demoläget");
      return;
    }
    const btn = document.getElementById("notif-btn");
    const existing = await getPushSubscription();
    if (existing) {
      await disablePushNotifications();
      btn.classList.remove("active");
      showToast("Påminnelser avstängda");
    } else {
      const ok = await enablePushNotifications();
      if (ok) {
        btn.classList.add("active");
        showToast("Påminnelser på. Jag hör av mig.");
        syncStateToWorker();
      } else {
        showToast("Kunde inte slå på påminnelser");
      }
    }
  });

  document.getElementById("reset-btn").addEventListener("click", () => {
    if (confirm("Börja om helt? Allt sparat försvinner.")) {
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    }
  });

  document.getElementById("baby-restart-btn").addEventListener("click", () => {
    const babyName = state.babyName;
    state.petName = babyName;
    state.level = 1;
    state.xp = 0;
    state.food = 2;
    state.love = 2;
    state.hunger = 80;
    state.happiness = 80;
    state.lastStatDecayAt = new Date().toISOString();
    state.streak = 0;
    state.completedToday = {};
    state.rewardedToday = {};
    state.hasBaby = false;
    state.babyName = "";
    state.nextBabyLevel = 30;
    saveState();
    hideBabyChoiceModal();
    renderAll();
    showToast(`Ny start med ${babyName}.`, true);
    burstConfetti(30);
  });

  document.getElementById("baby-moveout-btn").addEventListener("click", () => {
    const babyName = state.babyName;
    state.hasBaby = false;
    state.babyName = "";
    state.nextBabyLevel += 30;
    saveState();
    hideBabyChoiceModal();
    renderAll();
    showToast(`${babyName} flyttade ut. Lycka till där ute.`, true);
  });
}

/* ---------------------------------------------------------
   Init
   --------------------------------------------------------- */
function init() {
  handleDailyReset();
  applyStatDecay();
  initAppEvents();
  registerServiceWorker();

  if (state.petType) {
    showAppScreen();
  } else {
    document.getElementById("screen-start").classList.add("active");
    initStartScreen();
  }
}

document.addEventListener("DOMContentLoaded", init);
