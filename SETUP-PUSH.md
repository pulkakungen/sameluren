# Slå på pushnotiser, steg för steg

Allt utom det här är redan klart. Appen ligger uppe, den publika VAPID-nyckeln
är inlagd i koden. Det som återstår är att driftsätta workern som faktiskt
skickar notiserna, och att koppla telefonen till den.

Räkna med en kvart. Du behöver en dator med terminal och ditt Cloudflare-konto.

---

## Steg 1: Kontrollera att du har Node

Öppna terminalen och skriv:

```
node --version
```

Får du ett versionsnummer, till exempel `v20.11.0`, är allt bra, gå vidare.
Får du `command not found` behöver du installera Node först från
https://nodejs.org, välj knappen som säger LTS.

---

## Steg 2: Hämta hem koden

Gå till mappen där du vill ha projektet, till exempel:

```
cd ~/Documents
git clone https://github.com/pulkakungen/sameluren.git
cd sameluren/cloudflare-worker
```

Har du redan mappen sedan tidigare räcker det med:

```
cd ~/Documents/sameluren
git pull
cd cloudflare-worker
```

---

## Steg 3: Installera det workern behöver

```
npm install
```

Det tar en stund och skriver ut en hel del. Det är normalt. Varningar om
"deprecated" kan du strunta i, bara det inte står "ERR".

---

## Steg 4: Logga in på Cloudflare

```
npx wrangler login
```

En webbläsare öppnas. Logga in på samma konto som Sassas app ligger på och
godkänn. Terminalen ska sen säga att du är inloggad.

Kontrollera med:

```
npx wrangler whoami
```

Där ska din mejladress stå.

---

## Steg 5: Skapa lagringsplatsen

Workern behöver en plats att spara prenumerationen och historiken på.

```
npx wrangler kv namespace create PUSH_KV
```

Kommandot skriver ut något i stil med:

```
{ binding = "PUSH_KV", id = "a1b2c3d4e5f6..." }
```

Kopiera den långa id-strängen. Öppna `wrangler.toml` i en textredigerare och
byt ut `ERSATT_MED_EGET_KV_ID` mot ditt id. Raden ska bli:

```
kv_namespaces = [
  { binding = "PUSH_KV", id = "ditt-id-här" }
]
```

Spara filen.

---

## Steg 6: Lägg in de tre hemligheterna

Kör ett kommando i taget. Varje gång ber terminalen dig klistra in ett värde
och trycka enter. Det syns inte på skärmen när du klistrar in, det är meningen.

```
npx wrangler secret put VAPID_PRIVATE_KEY
```

Klistra in den privata nyckeln du fick av mig i chatten.

```
npx wrangler secret put VAPID_PUBLIC_KEY
```

Klistra in den publika nyckeln, alltså den långa som börjar med `BC5Cbjnd`.

```
npx wrangler secret put VAPID_SUBJECT
```

Skriv `mailto:` följt av din mejladress, till exempel `mailto:namn@exempel.se`.

---

## Steg 7: Driftsätt workern

```
npx wrangler deploy
```

När det är klart skriver terminalen ut adressen workern hamnade på. Den ska
vara:

```
https://sameluren-push.bella-sassibrass.workers.dev
```

Blev det en annan adress, säg till mig så ändrar jag den i appen. Står det
något om "Cron Triggers" och `*/15 * * * *` är det rätt, det är schemat som
kollar var femtonde minut om någon notis ska skickas.

---

## Steg 8: Kontrollera att workern lever

Öppna den här adressen i webbläsaren:

```
https://sameluren-push.bella-sassibrass.workers.dev/admin/status
```

Den ska svara med en textsida. Där står det att push-prenumeration saknas,
vilket stämmer, ingen telefon är ansluten än.

---

## Steg 9: Koppla telefonen

På Samuels telefon:

1. Öppna https://pulkakungen.github.io/sameluren/ i Safari eller Chrome
2. Välj djur och namn om det inte redan är gjort
3. Lägg till appen på hemskärmen. På iPhone: dela-ikonen och sen "Lägg till på
   hemskärmen". På Android: menyn med tre prickar och sen "Installera app"
4. **Öppna appen från hemskärmen**, inte från webbläsaren. På iPhone fungerar
   notiser bara då
5. Tryck på klockan uppe till höger
6. Godkänn när telefonen frågar om notiser

Klockan ska bli orange. Får du "Kunde inte slå på påminnelser", börja om från
punkt 4 och kontrollera att du öppnade appen från hemskärmen.

---

## Steg 10: Testa

Öppna på din egen dator:

```
https://sameluren-push.bella-sassibrass.workers.dev/admin/status
```

Nu ska det stå att prenumerationen finns. Skicka sen en testnotis:

```
https://sameluren-push.bella-sassibrass.workers.dev/admin/send-test
```

Den ska dyka upp på hans telefon inom några sekunder. Gör den det är allt klart.

---

## Adresser att spara

| Adress | Vad den gör |
| --- | --- |
| `/admin/status` | Visar om prenumerationen lever och vad som skickats idag |
| `/admin/send-test` | Skickar en testnotis |
| `/admin/send-affirmation` | Skickar veckans affirmation direkt |
| `/admin/set-affirmation?text=...` | Låser veckans affirmation manuellt |
| `/report` | Laddar ner CSV med en rad per dag |

Lägg till dem efter `https://sameluren-push.bella-sassibrass.workers.dev`.

---

## Om något går fel

**"command not found: npx"** betyder att Node inte är installerat, se steg 1.

**"You need to register a workers.dev subdomain"** betyder att kontot inte har
någon subdomän än. Det löser du i dashboarden på https://dash.cloudflare.com
under Workers & Pages.

**Notisen kommer inte fram** trots att status ser bra ut: kontrollera att
notiser är påslagna för appen i telefonens inställningar, och att appen
öppnades från hemskärmen.

**Vill du börja om** med nycklarna kör du `npx web-push generate-vapid-keys`,
lägger in den nya publika nyckeln i `app.js` rad 18 och gör om steg 6 och 7.
Telefonen måste då kopplas om från steg 9.
