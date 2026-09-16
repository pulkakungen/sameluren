# Sameluren

Uppgiftsapp som PWA, byggd på samma stomme som Sassibrass men med egen ton, egna
djur (kråka och björn) och egen push-worker. Ingen inloggning, inget byggsteg.
All framdrift sparas lokalt i telefonen, och en Cloudflare Worker sköter
notiser och en rapport för föräldrar.

## Filer

| Fil | Vad den gör |
| --- | --- |
| `index.html` | Hela markupen, start och appvy |
| `style.css` | Tema i orange och marinblått, mörkt läge |
| `app.js` | All logik: uppgifter, nivåer, djuren som SVG, push-anslutning |
| `sw.js` | Service worker: offlinecache och mottagning av notiser |
| `manifest.json` | Gör den installerbar på hemskärmen |
| `icons/` | App-ikoner, platshållare tills riktig grafik finns |
| `cloudflare-worker/` | Push-notiser, historik och CSV-rapport |

## Det du ändrar oftast

**Uppgifterna** ligger i `TASK_SECTIONS` högst upp i `app.js`. En uppgift ser ut så här:

```js
{ id: "laxa", emoji: "📖", text: "Gör läxan" }
```

* `days: [DAG_MAN, DAG_TORS]` begränsar uppgiften till vissa veckodagar.
* `parity: "even"` eller `"odd"` ger en uppgift som återkommer varannan dag.
* `id` måste vara unikt och får inte ändras i efterhand, då tappar rapporten historiken.

Lägger du till eller byter namn på uppgifter: uppdatera även `REPORT_COLUMNS` i
`cloudflare-worker/src/worker.js`, så rapporten får samma kolumner.

**Affirmationerna** ligger i `FIXED_REMINDERS` i workern, under id `affirmation`.
En slumpas varje måndag och gäller hela veckan. Du kan också låsa en manuellt via
`/admin/set-affirmation?text=...`.

**Skoltiderna** ligger i `SCHOOL_BLOCKS` i workern:

```
måndag  08:30 till 15:00
tisdag  08:00 till 14:10
onsdag  08:20 till 15:00
torsdag 08:20 till 15:15
fredag  08:05 till 14:50
```

De används till två saker: påminnelsen om böckerna 30 minuter före skolslut, och
tystnad under lektionstid så djuret inte tjatar när mobilen ändå är inlåst.

## Notiser som skickas

| Tid | Vad |
| --- | --- |
| 07:00 | Dags att gå upp |
| 07:10 | Veckans affirmation |
| 30 min före skolslut | Glöm inte böckerna, kolla listan |
| 21:00 | Kvällsrutinen |
| 22:00 | God natt |
| Vid behov | Djuret hör av sig när hunger eller humör gått under 50, tidigast var fjärde timme, aldrig under skoltid eller utanför 08:00 till 22:00 |

## Så här sätter du igång push

1. Skapa VAPID-nycklar: `npx web-push generate-vapid-keys`
2. Lägg den publika nyckeln i `VAPID_PUBLIC_KEY` i `app.js`
3. `cd cloudflare-worker && npm install`
4. `npx wrangler kv namespace create PUSH_KV` och klistra in id i `wrangler.toml`
5. Sätt hemligheterna:
   * `npx wrangler secret put VAPID_PRIVATE_KEY`
   * `npx wrangler secret put VAPID_PUBLIC_KEY`
   * `npx wrangler secret put VAPID_SUBJECT` (till exempel `mailto:din@epost.se`)
6. `npx wrangler deploy`
7. Lägg workerns adress i `PUSH_WORKER_URL` i `app.js`
8. Öppna appen på telefonen, lägg till på hemskärmen och tryck på klockan

Nycklarna är egna för den här appen. Återanvänd inte Sassibrass nycklar, då tar
den ena appen över den andras prenumeration.

## Adresser i workern

| Adress | Vad den gör |
| --- | --- |
| `/report` | CSV med en rad per dag och en kolumn per uppgift |
| `/admin/status` | Visar om prenumerationen lever och vad som skickats idag |
| `/admin/send-test` | Skickar en testnotis |
| `/admin/send-affirmation` | Skickar veckans affirmation direkt |
| `/admin/set-affirmation?text=...` | Låser veckans affirmation manuellt |
| `/admin/clear-history` | Rensar all historik |

## Spelmekaniken

* 5 XP, 1 mat och 1 kärlek per avklarad uppgift. Lagret har tak på 4.
* Ny nivå kostar 350 XP plus 80 per nivå.
* Hunger sjunker 6 enheter i timmen, humör 3. Workern räknar likadant.
* Djuret växer vid nivå 10, 20 och 30.
* Accessoar var femte nivå: keps 3, hörlurar 8, solglasögon 13, halsduk 18,
  ryggsäck 23, medalj 28. De två senaste visas samtidigt.
* Vid nivå 30 dyker en unge upp. En nivå senare får man välja: börja om med
  ungen, eller låta den flytta ut och fortsätta som vanligt.
* Streak räknas bara dagar där allt blev klart.
* `?demo=1` i adressen ger ett separat demoläge utan notiser och utan rapport.

## Grafiken

Djuren ritas som SVG direkt i `app.js` (`renderCrowSVG` och `renderBearSVG`).
De är gjorda för att bytas ut: accessoarerna sitter på ankarpunkter i
`PET_ANCHORS`, så justera bara de värdena när riktiga SVG-filer läggs in.
