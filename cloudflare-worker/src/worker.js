import { buildPushPayload } from "@block65/webcrypto-web-push";
import { handlePanelRequest, mergeSyncedTasks } from "./panel.js";
import { maybeSendDailySheet } from "./sheets.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key"
};

const SUBSCRIPTION_KEY = "subscription";
const STATE_KEY = "state";
const HISTORY_PREFIX = "history:";
const CURRENT_AFFIRMATION_KEY = "current_affirmation";

// Speglar uppgiftslistan i app.js, i samma ordning, så rapporten alltid får
// samma kolumnordning oavsett vilka uppgifter som var aktiva en viss dag.
const REPORT_COLUMNS = [
  { id: "vakna", label: "Upp ur sängen" },
  { id: "kladd", label: "Klä på dig" },
  { id: "badda", label: "Bädda sängen" },
  { id: "tvatta-ansikte", label: "Tvätta ansiktet" },
  { id: "deo", label: "Deo och hår" },
  { id: "raka", label: "Raka dig" },
  { id: "affirmation-rutin", label: "Läs veckans affirmation" },
  { id: "at-frukost", label: "Ät frukost" },
  { id: "drick-vatten", label: "Drick vatten" },
  { id: "tander-morgon", label: "Borsta tänderna (morgon)" },
  { id: "schema", label: "Kolla schemat" },
  { id: "packa-vaskan", label: "Packa dator och böcker" },
  { id: "till-skolan", label: "Ta dig till skolan i tid" },
  { id: "mellanmal", label: "Mellanmål" },
  { id: "matsopor", label: "Matsopor" },
  { id: "plastsopor", label: "Plastsopor" },
  { id: "metallglas", label: "Metall- och glassopor" },
  { id: "papperkartong", label: "Papper och kartong" },
  { id: "restavfall", label: "Restavfall" },
  { id: "tvatten", label: "Gå ner med tvätten" },
  { id: "snygga-rum", label: "Plocka undan rummet" },
  { id: "dammsuga", label: "Dammsuga" },
  { id: "diskmaskin", label: "Diskmaskinen" },
  { id: "laxa", label: "Gör läxan" },
  { id: "plugg-prov", label: "Plugga på prov" },
  { id: "kompis", label: "Träffa eller höra av sig till kompis" },
  { id: "traning", label: "Träningspass" },
  { id: "duscha", label: "Duscha" },
  { id: "ut-en-sving", label: "Ut en sväng" },
  { id: "tander-kvall", label: "Borsta tänderna (kväll)" },
  { id: "klader-imorgon", label: "Lägg fram kläder" },
  { id: "dator-laddning", label: "Dator på laddning" },
  { id: "planera-veckan", label: "Planera kommande vecka" },
  { id: "skarm-av", label: "Mobilen undan före läggdags" },
  { id: "las", label: "Läs en stund" },
  { id: "lagga-sig", label: "Lägg dig i tid" }
];

const AWAKE_START_MIN = 8 * 60; // 08:00
const AWAKE_END_MIN = 22 * 60; // 22:00
const NAG_GAP_MS = 4 * 60 * 60 * 1000; // minsta tid mellan två påminnelser från djuret
const HUNGER_DECAY_PER_HOUR = 6; // speglar samma takt som i app.js
const HAPPINESS_DECAY_PER_HOUR = 3; // speglar samma takt som i app.js
const NAG_THRESHOLD = 50; // påminn bara när mat eller humör faktiskt är under halva

// Mobilfritt i skolan: djuret ska aldrig tjata då, han kan ju inte göra något
// åt det förrän han får mobilen tillbaka.
// 1=måndag ... 5=fredag (samma nummerordning som Date.getDay()).
const SCHOOL_BLOCKS = {
  1: [8 * 60 + 30, 15 * 60], // måndag 08:30-15:00
  2: [8 * 60, 14 * 60 + 10], // tisdag 08:00-14:10
  3: [8 * 60 + 20, 15 * 60], // onsdag 08:20-15:00
  4: [8 * 60 + 20, 15 * 60 + 15], // torsdag 08:20-15:15
  5: [8 * 60 + 5, 14 * 60 + 50] // fredag 08:05-14:50
};

function inSchoolBlock(minutesOfDay, weekday) {
  const block = SCHOOL_BLOCKS[weekday];
  return !!block && minutesOfDay >= block[0] && minutesOfDay < block[1];
}

const FIXED_REMINDERS = [
  {
    id: "morgon",
    hour: 7,
    minute: 0,
    messages: [
      "Morgon. Dags att gå upp.",
      "Upp och hoppa. Dagen börjar nu.",
      "God morgon. Jag är vaken, är du?"
    ]
  },
  {
    id: "affirmation",
    hour: 7,
    minute: 30,
    messages: [
      // Självkänsla och trygghet
      "🎯 Veckans affirmation: Jag duger precis som jag är.",
      "🎯 Veckans affirmation: Min röst och mina åsikter spelar roll.",
      "🎯 Veckans affirmation: Jag behöver inte passa in i alla mallar för att vara cool.",
      "🎯 Veckans affirmation: Jag är stolt över den jag håller på att bli.",
      // Skola och prestation
      "🎯 Veckans affirmation: Misstag är bara ett sätt att lära sig på.",
      "🎯 Veckans affirmation: Jag gör mitt bästa, och det är mer än tillräckligt.",
      "🎯 Veckans affirmation: Jag har förmågan att klara av svåra utmaningar.",
      "🎯 Veckans affirmation: Min framgång mäts i min egen utveckling, inte i jämförelse med andra.",
      // Relationer och vänner
      "🎯 Veckans affirmation: Jag förtjänar vänner som respekterar och stöttar mig.",
      "🎯 Veckans affirmation: Jag vågar säga nej när något inte känns rätt.",
      "🎯 Veckans affirmation: Jag sprider positiv energi till människorna runt omkring mig.",
      "🎯 Veckans affirmation: Det är ett tecken på styrka att be om hjälp när jag behöver det.",
      // Känslor och mental styrka
      "🎯 Veckans affirmation: Alla mina känslor är tillåtna och okej att känna.",
      "🎯 Veckans affirmation: Jag har kontroll över hur jag reagerar på svåra situationer.",
      "🎯 Veckans affirmation: Jag är stark nog att hantera motgångar.",
      "🎯 Veckans affirmation: Idag väljer jag att fokusera på det jag kan påverka."
    ]
  },
  {
    id: "kvall",
    hour: 21,
    minute: 0,
    messages: [
      "Kvällsrutinen då. Vad är kvar på listan?",
      "Dags att stänga ner dagen. Kolla av kvällsuppgifterna."
    ]
  },
  {
    id: "godnatt",
    hour: 22,
    minute: 0,
    messages: [
      "God natt. Vi tar nya tag imorgon.",
      "Släck och sov. Bra jobbat idag."
    ]
  }
];

// Två uppsättningar, så texten stämmer med vad som faktiskt är lågt. Innan
// kunde djuret säga att det var hungrigt fast det var kärleken som saknades.
const HUNGRY_MESSAGES = [
  "Jag börjar bli hungrig här.",
  "Magen säger ifrån. Kika in i appen.",
  "Det vore inte fel med något att äta."
];

const LONELY_MESSAGES = [
  "Har du glömt bort mig?",
  "Det var ett tag sen du kollade in.",
  "Sitter här och väntar. Lite uppmärksamhet hade suttit fint."
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function stockholmParts(date) {
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    dateStr,
    minutesOfDay: parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10),
    weekday: new Date(dateStr + "T12:00:00Z").getUTCDay()
  };
}

// Nyckel som är identisk måndag till söndag och byts exakt på måndagar.
function mondayKeyFor(date) {
  const { dateStr } = stockholmParts(date);
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay(); // 0=söndag ... 6=lördag
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

// Samma affirmation hela veckan, ny slumpad varje måndag.
async function getWeeklyAffirmation(env, now) {
  const weekKey = mondayKeyFor(now);
  const raw = await env.PUSH_KV.get(CURRENT_AFFIRMATION_KEY);
  const stored = raw ? JSON.parse(raw) : null;
  if (stored && stored.weekKey === weekKey) return stored.text;

  const affirmationReminder = FIXED_REMINDERS.find((r) => r.id === "affirmation");
  const text = pick(affirmationReminder.messages);
  await env.PUSH_KV.put(CURRENT_AFFIRMATION_KEY, JSON.stringify({ weekKey, text }));
  return text;
}

// Allt under /admin och rapporten kräver nyckeln som sätts med
// `wrangler secret put ADMIN_TOKEN`. Barnens egna anrop (/subscribe, /sync)
// är fortsatt öppna, de har ingen hemlighet att bära på.
function adminKeyOk(request, url, env) {
  if (!env.ADMIN_TOKEN) return true; // ingen nyckel satt än, lås inte ute någon
  const given = request.headers.get("X-Admin-Key") || url.searchParams.get("key") || "";
  return given === env.ADMIN_TOKEN;
}

function denied() {
  return new Response("Fel eller saknad nyckel. Lägg till ?key=... i adressen.", {
    status: 401,
    headers: { ...CORS_HEADERS, "Content-Type": "text/plain; charset=utf-8" }
  });
}

// Normaliserad lägesbild för föräldrapanelen. Samma form i alla appar, så
// panelen slipper veta hur varje enskild app är byggd inuti.
async function buildSummary(env, url, request) {
  const now = new Date();
  const { dateStr } = stockholmParts(now);
  const subRaw = await env.PUSH_KV.get(SUBSCRIPTION_KEY);
  const stateRaw = await env.PUSH_KV.get(STATE_KEY);
  const state = stateRaw ? JSON.parse(stateRaw) : null;
  const todayRaw = await env.PUSH_KV.get(HISTORY_PREFIX + dateStr);
  const today = todayRaw ? JSON.parse(todayRaw) : null;
  const sentRaw = await env.PUSH_KV.get(`reminders:${dateStr}`);
  const cronLast = await env.PUSH_KV.get(CRON_HEARTBEAT_KEY);

  const tasks = today && Array.isArray(today.tasks) ? today.tasks : [];

  // Appen sänker hunger och humör löpande i telefonen, men servern hör bara
  // av sig vid synk. Räkna fram var nivåerna ligger nu, med samma takt som
  // appen använder, annars visar panelen gamla siffror.
  const timmarSedanSynk = state && state.lastSyncAt ? (now - new Date(state.lastSyncAt)) / 3600000 : null;
  const uppskatta = (varde, takt) =>
    typeof varde === "number" && timmarSedanSynk !== null
      ? Math.max(10, Math.round(varde - timmarSedanSynk * takt))
      : null;

  // fjorton dagar bakåt, för en liten kurva i panelen
  const history = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = HISTORY_PREFIX + stockholmParts(d).dateStr;
    const raw = await env.PUSH_KV.get(key);
    const rec = raw ? JSON.parse(raw) : null;
    const recTasks = rec && Array.isArray(rec.tasks) ? rec.tasks : [];
    history.push({
      date: stockholmParts(d).dateStr,
      done: recTasks.filter((t) => t.done).length,
      total: recTasks.length,
      allDone: !!(rec && rec.allDoneToday)
    });
  }

  // Länkar så att föräldrapanelen kan lägga en knapp rakt in i kortet.
  const key = (url ? url.searchParams.get("key") : null) || (request ? request.headers.get("X-Admin-Key") : null);
  const lank = (path) => (url ? url.origin + path + (key ? "?key=" + encodeURIComponent(key) : "") : null);

  return {
    app: "sameluren",
    title: "Sameluren",
    child: "Samuel",
    panelUrl: lank("/panel"),
    links: [
      { label: "Panel", url: lank("/panel") },
      { label: "Status", url: lank("/admin/status") }
    ],
    now: now.toISOString(),
    dateStr,
    notifications: !!subRaw,
    lastSyncAt: state ? state.lastSyncAt : null,
    lastNagAt: state ? state.lastNagAt : null,
    allDoneToday: tasks.length > 0 ? tasks.every((t) => t.done) : !!(state && state.allDoneToday),
    hunger: uppskatta(state && state.hunger, HUNGER_DECAY_PER_HOUR),
    happiness: uppskatta(state && state.happiness, HAPPINESS_DECAY_PER_HOUR),
    hungerAtSync: state && typeof state.hunger === "number" ? state.hunger : null,
    happinessAtSync: state && typeof state.happiness === "number" ? state.happiness : null,
    hoursSinceSync: timmarSedanSynk === null ? null : Math.round(timmarSedanSynk * 10) / 10,
    level: state && typeof state.level === "number" ? state.level : null,
    streak: state && typeof state.streak === "number" ? state.streak : null,
    petName: state && state.petName ? state.petName : null,
    doneToday: tasks.filter((t) => t.done).length,
    totalToday: tasks.length,
    tasks,
    remindersSentToday: sentRaw ? JSON.parse(sentRaw) : [],
    lastCronAt: cronLast || null,
    affirmation: today && today.affirmationSent ? today.affirmationSent : null,
    history
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS }
  });
}

async function mergeHistoryRecord(env, dateStr, patch) {
  const raw = await env.PUSH_KV.get(HISTORY_PREFIX + dateStr);
  const existing = raw ? JSON.parse(raw) : {};
  const merged = { ...existing, ...patch };
  await env.PUSH_KV.put(HISTORY_PREFIX + dateStr, JSON.stringify(merged));
  return merged;
}

async function sendPush(env, message) {
  const subRaw = await env.PUSH_KV.get(SUBSCRIPTION_KEY);
  if (!subRaw) return false;

  try {
    const subscription = JSON.parse(subRaw);
    const vapid = {
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY
    };

    const payload = await buildPushPayload(
      { data: JSON.stringify({ title: "Sameluren", body: message }), options: { ttl: 3600 } },
      subscription,
      vapid
    );

    const res = await fetch(subscription.endpoint, payload);
    if (res.status === 404 || res.status === 410) {
      // prenumerationen är ogiltig, ta bort den
      await env.PUSH_KV.delete(SUBSCRIPTION_KEY);
    }
    if (!res.ok) {
      console.error("sendPush misslyckades", res.status, await res.text().catch(() => ""));
    }
    return res.ok;
  } catch (err) {
    // en trasig prenumeration eller VAPID-miss ska aldrig krascha hela schemat
    console.error("sendPush kastade fel", err && err.message);
    return false;
  }
}

const SCHOOL_END_MESSAGE = "Snart slut för idag. Glöm inte böckerna hem, och kolla vad som står på listan.";

const CRON_HEARTBEAT_KEY = "cron:last";

async function handleScheduled(env) {
  try {
    // Pulsslag: skrivs varje gång schemat körs, så det går att skilja
    // "cron kör inte alls" från "cron kör men skickar inget".
    await env.PUSH_KV.put(CRON_HEARTBEAT_KEY, new Date().toISOString());
    await runScheduledChecks(env);
  } catch (err) {
    // ett enskilt fel ska aldrig tysta hela cron-körningen utan spår
    console.error("handleScheduled kastade fel", err && err.stack);
  }
}

async function runScheduledChecks(env) {
  const now = new Date();
  const { dateStr, minutesOfDay, weekday } = stockholmParts(now);

  // dagens rad till kalkylarket, strax före midnatt
  const stateForSheet = await env.PUSH_KV.get(STATE_KEY);
  await maybeSendDailySheet(env, {
    app: "sameluren",
    title: "Sameluren",
    dateStr,
    minutesOfDay,
    historyPrefix: HISTORY_PREFIX,
    streak: stateForSheet ? JSON.parse(stateForSheet).streak ?? null : null
  });

  const hasSub = !!(await env.PUSH_KV.get(SUBSCRIPTION_KEY));
  if (!hasSub) return;

  // --- Fasta påminnelser ---
  const sentKey = `reminders:${dateStr}`;
  const sentRaw = await env.PUSH_KV.get(sentKey);
  const sent = sentRaw ? JSON.parse(sentRaw) : [];

  for (const reminder of FIXED_REMINDERS) {
    const slotStart = reminder.hour * 60 + reminder.minute;
    const withinWindow = minutesOfDay >= slotStart && minutesOfDay < slotStart + 15;
    if (withinWindow && !sent.includes(reminder.id)) {
      const message = reminder.id === "affirmation" ? await getWeeklyAffirmation(env, now) : pick(reminder.messages);
      const delivered = await sendPush(env, message);
      if (delivered) {
        sent.push(reminder.id);
        await env.PUSH_KV.put(sentKey, JSON.stringify(sent), { expirationTtl: 60 * 60 * 48 });
        if (reminder.id === "affirmation") {
          await mergeHistoryRecord(env, dateStr, { affirmationSent: message });
        }
      }
    }
  }

  // --- "Snart slut för idag" 30 minuter innan just den dagens skolslut ---
  const schoolBlock = SCHOOL_BLOCKS[weekday];
  if (schoolBlock) {
    const reminderStart = schoolBlock[1] - 30;
    const withinSchoolEndWindow = minutesOfDay >= reminderStart && minutesOfDay < reminderStart + 15;
    if (withinSchoolEndWindow && !sent.includes("skoldagslut")) {
      const delivered = await sendPush(env, SCHOOL_END_MESSAGE);
      if (delivered) {
        sent.push("skoldagslut");
        await env.PUSH_KV.put(sentKey, JSON.stringify(sent), { expirationTtl: 60 * 60 * 48 });
      }
    }
  }

  // --- Djuret hör av sig när hunger eller humör faktiskt sjunkit ---
  if (minutesOfDay < AWAKE_START_MIN || minutesOfDay > AWAKE_END_MIN) return;
  if (inSchoolBlock(minutesOfDay, weekday)) return; // mobilfritt i skolan

  const stateRaw = await env.PUSH_KV.get(STATE_KEY);
  const state = stateRaw ? JSON.parse(stateRaw) : null;
  if (!state) return; // appen har aldrig synkat, inget att sakna ännu

  if (state.lastSyncDateStr === dateStr && state.allDoneToday) return; // klar för dagen, inget tjat

  const lastActivityMs = new Date(state.lastSyncAt).getTime();
  const hoursSinceActivity = (now.getTime() - lastActivityMs) / (60 * 60 * 1000);
  const lastKnownHunger = typeof state.hunger === "number" ? state.hunger : 80;
  const lastKnownHappiness = typeof state.happiness === "number" ? state.happiness : 80;
  const estimatedHunger = Math.max(10, lastKnownHunger - hoursSinceActivity * HUNGER_DECAY_PER_HOUR);
  const estimatedHappiness = Math.max(10, lastKnownHappiness - hoursSinceActivity * HAPPINESS_DECAY_PER_HOUR);

  const lastNagMs = state.lastNagAt ? new Date(state.lastNagAt).getTime() : 0;
  const gapSinceNag = now.getTime() - lastNagMs;

  const isHungryOrLonely = estimatedHunger < NAG_THRESHOLD || estimatedHappiness < NAG_THRESHOLD;
  if (isHungryOrLonely && gapSinceNag > NAG_GAP_MS) {
    // den lägsta nivån avgör vad djuret klagar på
    const hungriest = estimatedHunger <= estimatedHappiness;
    await sendPush(env, pick(hungriest ? HUNGRY_MESSAGES : LONELY_MESSAGES));
    state.lastNagAt = now.toISOString();
    await env.PUSH_KV.put(STATE_KEY, JSON.stringify(state));
  }
}

function csvEscape(value) {
  const s = String(value);
  return /[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function buildReportCsv(env) {
  const records = {}; // dateStr -> { tasks, allDoneToday }
  let cursor;
  do {
    const page = await env.PUSH_KV.list({ prefix: HISTORY_PREFIX, cursor });
    for (const key of page.keys) {
      const raw = await env.PUSH_KV.get(key.name);
      if (raw) records[key.name.slice(HISTORY_PREFIX.length)] = JSON.parse(raw);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  const dates = Object.keys(records).sort();
  const weekdayNames = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];

  const header = ["Datum", "Veckodag", ...REPORT_COLUMNS.map((c) => c.label), "Allt klart den dagen", "Veckans affirmation"];
  const rows = [header];

  for (const dateStr of dates) {
    const record = records[dateStr];
    const taskById = Object.fromEntries((record.tasks || []).map((t) => [t.id, t]));
    const weekday = weekdayNames[new Date(dateStr + "T12:00:00Z").getUTCDay()];
    const row = [dateStr, weekday];
    for (const col of REPORT_COLUMNS) {
      const t = taskById[col.id];
      row.push(t ? (t.done ? "Ja" : "Nej") : "–");
    }
    row.push(record.allDoneToday ? "Ja" : "Nej");
    row.push(record.affirmationSent ? record.affirmationSent.replace(/^🎯 Veckans affirmation: /, "") : "");
    rows.push(row);
  }

  const csv = "﻿" + rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="sameluren-rapport.csv"'
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/subscribe" && request.method === "POST") {
      const subscription = await request.json();
      await env.PUSH_KV.put(SUBSCRIPTION_KEY, JSON.stringify(subscription));
      return json({ ok: true });
    }

    if (url.pathname === "/unsubscribe" && request.method === "POST") {
      await env.PUSH_KV.delete(SUBSCRIPTION_KEY);
      return json({ ok: true });
    }

    if (url.pathname === "/sync" && request.method === "POST") {
      const body = await request.json();
      const { dateStr } = stockholmParts(new Date());
      const state = {
        lastSyncAt: new Date().toISOString(),
        lastSyncDateStr: dateStr,
        allDoneToday: !!body.allDoneToday,
        hunger: typeof body.hunger === "number" ? body.hunger : 80,
        happiness: typeof body.happiness === "number" ? body.happiness : 80,
        level: typeof body.level === "number" ? body.level : null,
        streak: typeof body.streak === "number" ? body.streak : null,
        petName: typeof body.petName === "string" ? body.petName : null,
        lastNagAt: null
      };
      // behåll lastNagAt om det redan finns, så spärren inte nollas vid varje synk
      const existingRaw = await env.PUSH_KV.get(STATE_KEY);
      if (existingRaw) {
        const existing = JSON.parse(existingRaw);
        state.lastNagAt = existing.lastSyncDateStr === dateStr ? existing.lastNagAt : null;
      }
      await env.PUSH_KV.put(STATE_KEY, JSON.stringify(state));

      const tidigareRaw = await env.PUSH_KV.get(HISTORY_PREFIX + dateStr);
      const tidigare = tidigareRaw ? JSON.parse(tidigareRaw) : {};
      const tasks = mergeSyncedTasks(tidigare, Array.isArray(body.tasks) ? body.tasks : []);

      await mergeHistoryRecord(env, dateStr, {
        tasks,
        allDoneToday: tasks.length > 0 && tasks.every((t) => t.done),
        updatedAt: new Date().toISOString()
      });

      return json({ ok: true });
    }

    const panelRes = await handlePanelRequest(request, env, url, {
      title: "Sameluren 🐻",
      historyPrefix: HISTORY_PREFIX,
      authorized: adminKeyOk,
      corsHeaders: CORS_HEADERS
    });
    if (panelRes) return panelRes;

    if (url.pathname.startsWith("/admin") || url.pathname === "/report") {
      if (!adminKeyOk(request, url, env)) return denied();
    }

    if (url.pathname === "/report" && request.method === "GET") {
      return buildReportCsv(env);
    }

    if (url.pathname === "/admin/summary" && request.method === "GET") {
      return json(await buildSummary(env, url, request));
    }

    // Fritt meddelande från föräldrapanelen.
    if (url.pathname === "/admin/send" && (request.method === "GET" || request.method === "POST")) {
      let text = url.searchParams.get("text");
      if (!text && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        text = body.text;
      }
      if (!text || !text.trim()) return json({ ok: false, error: "ingen text" }, 400);
      const ok = await sendPush(env, text.trim());
      return json({ ok });
    }

    if (url.pathname === "/admin/clear-history" && request.method === "GET") {
      let cleared = 0;
      let cursor;
      do {
        const page = await env.PUSH_KV.list({ prefix: HISTORY_PREFIX, cursor });
        for (const key of page.keys) {
          await env.PUSH_KV.delete(key.name);
          cleared++;
        }
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      return new Response(`Rensade ${cleared} dagar med historik.`, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/admin/status" && request.method === "GET") {
      const subRaw = await env.PUSH_KV.get(SUBSCRIPTION_KEY);
      const stateRaw = await env.PUSH_KV.get(STATE_KEY);
      const { dateStr, minutesOfDay, weekday } = stockholmParts(new Date());
      const todayKey = `reminders:${dateStr}`;
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const yesterdayKey = `reminders:${stockholmParts(yesterday).dateStr}`;
      const sentToday = await env.PUSH_KV.get(todayKey);
      const sentYesterday = await env.PUSH_KV.get(yesterdayKey);

      const lines = [
        "=== Sameluren push-status ===",
        "",
        `Push-prenumeration finns: ${subRaw ? "JA" : "NEJ (klockan är inte aktiverad på någon enhet just nu)"}`,
        "",
        `Workerns nuvarande tid (svensk lokaltid): ${String(Math.floor(minutesOfDay / 60)).padStart(2, "0")}:${String(minutesOfDay % 60).padStart(2, "0")}, veckodag ${weekday}`,
        "",
        `Notiser skickade idag (${dateStr}): ${sentToday || "inga än"}`,
        `Notiser skickade igår: ${sentYesterday || "inga"}`,
        "",
        `Sync-status (app-aktivitet): ${stateRaw || "appen har aldrig synkat"}`,
        "",
        `Schemat kördes senast: ${(await env.PUSH_KV.get(CRON_HEARTBEAT_KEY)) || "ALDRIG, cron verkar inte köra alls"}`
      ];
      return new Response(lines.join("\n"), { headers: { ...CORS_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
    }

    // Skriver dagens rad till kalkylarket direkt, för att testa kopplingen.
    if (url.pathname === "/admin/sheet-now" && request.method === "GET") {
      const { dateStr, minutesOfDay } = stockholmParts(new Date());
      const stateRaw = await env.PUSH_KV.get(STATE_KEY);
      const res = await maybeSendDailySheet(env, {
        app: "sameluren",
        title: "Sameluren",
        dateStr,
        minutesOfDay,
        historyPrefix: HISTORY_PREFIX,
        streak: stateRaw ? JSON.parse(stateRaw).streak ?? null : null,
        force: true
      });
      return new Response(
        res.ok ? `Skrivet till arket \u2705\n${res.date}: ${res.done} av ${res.total} klara` : `Gick inte: ${res.reason}`,
        { headers: { ...CORS_HEADERS, "Content-Type": "text/plain; charset=utf-8" } }
      );
    }

    if (url.pathname === "/admin/send-test" && request.method === "GET") {
      const ok = await sendPush(env, "Testnotis från Sameluren. Ser du den här funkar allt.");
      return new Response(
        ok ? "Skickad. Kolla telefonen." : "Misslyckades, troligen finns ingen aktiv prenumeration just nu (klockan inte påslagen).",
        { headers: CORS_HEADERS }
      );
    }

    if (url.pathname === "/admin/send-affirmation" && request.method === "GET") {
      const message = await getWeeklyAffirmation(env, new Date());
      const ok = await sendPush(env, message);
      if (ok) {
        const { dateStr } = stockholmParts(new Date());
        await mergeHistoryRecord(env, dateStr, { affirmationSent: message });
      }
      return new Response(
        ok ? `Skickad.\n\n${message}` : "Misslyckades, troligen finns ingen aktiv prenumeration just nu (klockan inte påslagen).",
        { headers: CORS_HEADERS }
      );
    }

    if (url.pathname === "/admin/set-affirmation" && request.method === "GET") {
      const text = url.searchParams.get("text");
      if (!text) {
        return new Response("Lägg till ?text=... i webbadressen med affirmationen du vill låsa för veckan.", {
          status: 400,
          headers: CORS_HEADERS
        });
      }
      const full = text.startsWith("🎯") ? text : `🎯 Veckans affirmation: ${text}`;
      const weekKey = mondayKeyFor(new Date());
      await env.PUSH_KV.put(CURRENT_AFFIRMATION_KEY, JSON.stringify({ weekKey, text: full }));
      return new Response(`Veckans affirmation är nu låst till (gäller till nästa måndag):\n\n${full}`, {
        headers: CORS_HEADERS
      });
    }

    if (url.pathname === "/" || url.pathname === "") {
      return new Response("Sameluren push worker is running", { headers: CORS_HEADERS });
    }

    return json({ error: "not found" }, 404);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(handleScheduled(env));
  }
};
