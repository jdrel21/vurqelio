# Vurqelio — pachet de pornire gratuit

## Ce conține
- Site de prezentare responsive, gândit pentru telefon.
- Identitate vizuală de bază și logo SVG.
- Modal de înregistrare/conectare.
- Mod demo local pentru a testa interfața fără conturi reale.
- Schema SQL inițială pentru Supabase, cu Row Level Security.
- Pagini inițiale pentru confidențialitate și termeni (șabloane de completat).

## Important: ce este și ce nu este funcțional
În mod implicit, site-ul este un prototip. Modul demo ține doar o identitate demonstrativă în browserul dispozitivului și NU este un sistem sigur de conturi. Punctele din design sunt demonstrative, nu au valoare monetară și nu pot fi retrase. Nu sunt incluse reclame reale, plăți, retrageri sau verificarea furnizorilor de oferte.

## Stack gratuit de început
1. **GitHub** — depozit pentru cod.
2. **Netlify Free** — publicarea site-ului static; limitele planului gratuit se pot schimba.
3. **Supabase Free** — autentificare și bază de date pentru MVP.
4. **Domeniu** — opțional. Pentru testare folosește întâi subdomeniul gratuit Netlify; cumpără domeniul numai după ce verifici atent ortografia mărcii.

Linkuri oficiale:
- GitHub: https://github.com/
- Netlify: https://www.netlify.com/pricing/
- Supabase: https://supabase.com/pricing
- Supabase Docs: https://supabase.com/docs

## Publicare rapidă de pe telefon
1. Creează un cont GitHub.
2. Creează un repository nou numit `vurqelio`.
3. Încarcă toate fișierele din acest folder, păstrând structura `assets/` și `supabase/`.
4. Creează cont Netlify și alege **Add new site / Import an existing project**, conectează GitHub și selectează repository-ul.
5. Pentru site static simplu, nu este necesară o comandă de build; directorul de publicare este rădăcina (`.`). Publică și testează URL-ul gratuit Netlify.

## Conectarea Supabase (pentru autentificare reală)
1. Creează un proiect pe Supabase.
2. Deschide Project Settings → API și copiază Project URL și cheia publică anon/publishable.
3. În `app.js`, completează `SUPABASE_URL` și `SUPABASE_ANON_KEY`.
4. În Supabase → SQL Editor, inspectează și rulează `supabase/schema.sql`.
5. În Authentication, configurează URL-ul site-ului și URL-urile de redirect. Testează înregistrarea și confirmarea emailului.
6. Nu introduce niciodată `service_role` key în `app.js`, GitHub sau alt cod vizibil în browser.

## Următoarea etapă înainte de lansarea publică
- Creează dashboard protejat cu sold calculat din `point_ledger`.
- Creează backend/Edge Function care verifică server-side postback-ul furnizorului înainte să acorde puncte; folosește identificatori unici și protecție anti-replay.
- Alege un furnizor de reclame/oferte care permite explicit recompensele și traficul stimulat pe site. Nu folosi reclame Google obișnuite pentru a plăti utilizatorii să le vadă/click-uiască: regulile Google interzic programele care promit plată sau stimulente pentru vizualizarea/click-ul reclamelor, iar AdMob rewarded nu permite recompense directe în bani.
- Nu afișa promisiuni de câștig, conversii puncte-bani sau buton de retragere până când ai contract și reguli de recompensare aprobate.
- Adaugă politici finale de confidențialitate/cookies, termeni, reguli anti-fraudă, contact real și informații despre operator.
- Verifică obligațiile fiscale și legale aplicabile înainte de a primi bani de la utilizatori sau de a efectua plăți.

## Atenție la nume
În conversație a apărut o diferență de ortografie între **Vurgelio** și **Vurqelio**. Acest pachet folosește **Vurqelio** (cu litera `q`). Verifică exact numele și domeniul înainte să plătești pentru domeniu sau marcă.

## Versiunea 2 — ce e nou
- Bug critic reparat în `app.js` (lipseau acolade → tot site-ul era blocat).
- Pagină separată `dashboard.html` cu: sold, nivele, streak zilnic, insigne, clasament, magazin, istoric și panou Admin.
- Validare pe server: `start_activity` pornește o sesiune, iar `complete_activity` acordă puncte doar dacă a trecut pe server cel puțin durata videoclipului. O singură recompensă per activitate.
- Utilizatorii nu își pot modifica `is_admin` sau streak-ul (doar `display_name`).

## Versiunea 3
- Profil: schimbi numele afișat și alegi rama avatarului (ramele se cumpără din Magazin).
- „Ai uitat parola?” + pagina `reset.html`.
- Banner de avertizare când streak-ul e pe cale să expire.
- Provocări săptămânale (se resetează luni) cu bonus VP, validate pe server.

## Versiunea 4
- Confetti la insigne noi și provocări finalizate.
- Sezoane lunare în clasament: top 3 primesc 500/300/150 VP + insignă; „Sala campionilor” cu ultimele 6 sezoane. Sezonul trecut se închide automat la prima vizită în panou din luna nouă.
- Program referral: link personal în Profil; ambii primesc +100 VP după prima activitate a celui invitat. Insigna „Recrutor” la 3 invitați.
- Admin → Provocări: adaugi, editezi, ascunzi sau ștergi provocări fără SQL.

## Versiunea 5 — Reels + monetizare
- `reels.html`: feed vertical (swipe) cu YouTube Shorts și TikTok, prin playerele oficiale. Punctele se dau după durata validată pe server. Adaugi reels din Admin (Tip: Reel).
- `rewarded.js`: reclame cu recompensă prin Google Ad Manager (+5 VP, max 10/zi, min. 60s). Completează `AD_MANAGER_REWARDED_UNIT` în `app.js`.
- Offerwall: completează `OFFERWALLS` în `app.js`. Postback URL pentru furnizor:
  `https://<PROIECT>.supabase.co/functions/v1/offerwall-postback?token=<OFFERWALL_SECRET>&provider=<nume>&user_id={USER}&tx_id={TX}&points={POINTS}&status={STATUS}`
  (înlocuiește {USER}/{TX}/{POINTS}/{STATUS} cu macro-urile din documentația furnizorului).
- `advertise.html`: advertiserii aleg pachetul (49€/199€/599€), trimit videoclipul și plătesc prin Stripe Payment Link. Webhook-ul marchează automat campania ca plătită; tu o aprobi din Admin → Campanii și devine activitate sponsorizată care se oprește singură la atingerea țintei.

### Activare Edge Functions (Supabase CLI)
```
supabase login
supabase link --project-ref dkljnpzclzeofwybqtnv
supabase secrets set OFFERWALL_SECRET=un-sir-lung-aleator STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_...
supabase functions deploy offerwall-postback --no-verify-jwt
supabase functions deploy stripe-webhook --no-verify-jwt
```
Stripe: creează 3 Payment Links (49€, 199€, 599€) → pune-le în `PAYMENT_LINKS` din `app.js`. Webhook: Developers → Webhooks → `https://<PROIECT>.supabase.co/functions/v1/stripe-webhook`, eveniment `checkout.session.completed`.

⚠️ Înainte de a încasa bani: firmă (PFA/SRL), banner de consimțământ cookies certificat (cerut de Google în UE), termeni actualizați. Nu da puncte pentru bannere AdSense.

## Versiunea 6
- Like-uri pe reels; feed-ul afișează primele reels-urile neurmărite, apoi pe cele sponsorizate, apoi pe cele mai apreciate.
- `withdraw.html`: cereri de retragere (PayPal / Revolut / IBAN) cu reguli clare. **OPRITE implicit**; le pornești din Admin → Retrageri (curs, minim, vechime cont). Punctele se rezervă la cerere și se returnează dacă respingi.
- `cookies.js`: banner GDPR (Accept / Doar necesare / Personalizează) + Google Consent Mode v2; reclamele GPT devin nepersonalizate/limitate fără acord. Link „Setări cookies” în footer.
  ⚠️ Pentru Google Ad Manager/AdSense în UE, Google cere un CMP certificat (IAB TCF). Când activezi reclamele, pornește CMP-ul gratuit Google din Ad Manager → Privacy & messaging (sau un CMP certificat) și păstrează bannerul acesta pentru restul cookie-urilor.
- `stats.html?c=…&k=…`: link privat de statistici live pentru advertiseri (vizionări complete, like-uri, grafic 14 zile). Se afișează după crearea campaniei și se poate copia din Admin.

## Versiunea 7
- Comentarii la reels (max 200 caractere, fără linkuri, 1 la 10 secunde, max 50/zi); autorul sau adminul pot șterge.
- Verificare telefon prin SMS înainte de retragere (blocată și pe server printr-un trigger). Activare: Supabase → Authentication → Providers → **Phone** → alege Twilio / MessageBird / Vonage și completează datele contului SMS. Supabase nu permite același număr pe două conturi.
- Admin → Raport lunar: venituri pe surse (campanii plătite automat, offerwall dacă adaugi `&revenue={PAYOUT}` în postback, Ad Manager/AdSense introduse manual), plăți către utilizatori, profit brut, VP acordați pe categorii, utilizatori activi/noi.

## Pași după upload
1. Supabase → SQL Editor → rulează tot `supabase/schema.sql` (se poate rula de mai multe ori).
2. Fă-te admin: `update public.profiles set is_admin = true where id = (select id from auth.users where email = 'emailul@tau.ro');`
3. Supabase → Authentication → URL Configuration: adaugă `https://SITE-UL-TAU.netlify.app/reset.html` la **Redirect URLs** (necesar pentru „Ai uitat parola?”).
4. Intră în Panou → Admin și adaugă activități (link YouTube + durata în secunde + puncte).

## Fișiere importante
- `dashboard.html`, `dashboard.js` — panoul utilizatorului și admin.
- `index.html` — pagina principală.
- `styles.css` — design responsive.
- `app.js` — interacțiuni și configurare Supabase.
- `supabase/schema.sql` — structură inițială de bază de date.
- `privacy.html`, `terms.html` — șabloane, nu consultanță juridică.
