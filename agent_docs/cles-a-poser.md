# Les clés à poser — où, comment les obtenir, et ce que ça allume

Relevé du **14/08/2026** sur les trois consoles réelles (Railway `theo826's Projects` →
projet BellumAI, Vercel équipe `BELLUMAI`). Chaque ligne dit ce qui est ÉTEINT aujourd'hui,
pas ce qui pourrait l'être.

Le projet Railway porte **quatre** services, et l'un d'eux porte un nom trompeur :

| Service                   | Ce que c'est                         | Où poser ses variables                                                  |
| ------------------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| `belllum-backend-service` | **API** NestJS (`api.bellum-ai.com`) | Railway → BellumAI → ce service → **Variables**                         |
| `bellum-ia-service`       | **IA** FastAPI                       | Railway → BellumAI → ce service → **Variables**                         |
| `belllum-monorepo`        | **serveur MCP** (`/apps/mcp`)        | Railway → BellumAI → ce service → **Variables**                         |
| `Redis`                   | file BullMQ                          | —                                                                       |
| —                         | **Web** (SPA)                        | Vercel → BELLUMAI → `bellum-web` → Settings → **Environment Variables** |

⚠️ `belllum-monorepo` **n'est pas** le dépôt entier : c'est le serveur MCP, son builder
pointe `/apps/mcp/railway.json`. Il porte ses cinq variables à lui (`MCP_PUBLIC_URL`,
`API_PUBLIC_URL`, `API_INTERNAL_URL`, `INTERNAL_API_SECRET`, `PORT`) — **une variable
posée là ne vaut que pour lui**. C'est la confusion la plus facile à faire sur ce projet :
voir `API_INTERNAL_URL` sur ce service ne dit rien de son absence sur le service IA.

Railway redéploie le service à chaque variable ajoutée. Vercel exige un **redéploiement
manuel** : une variable `VITE_*` est lue au BUILD, pas à l'exécution — la poser sans
redéployer ne change rien, et c'est le piège le plus courant.

---

## 1. À poser en premier — ça ne coûte rien et ça répare une fonction cassée

### `API_INTERNAL_URL` → service **`bellum-ia-service`**

**Valeur : `http://belllum-backend-service.railway.internal:3000`** (sans barre finale).
Aucun compte à créer, aucun fournisseur : c'est l'adresse de notre propre API sur le réseau
privé Railway.

C'est **exactement la valeur que porte déjà le service MCP** — donc un chemin éprouvé en
production, pas une hypothèse. Le préférer à l'URL publique évite un aller-retour par
Internet et une poignée de main TLS à chaque appel d'outil du copilote. Si le réseau privé
posait problème (il est en IPv6), `https://api.bellum-ai.com` fonctionne aussi : le client
ne fait que concaténer un chemin à cette base.

C'est l'absence la plus coûteuse du dépôt. Le copilote a cinq outils qui lisent la
messagerie et l'agenda (`search_mailbox`, `list_agenda`, `find_free_slots`,
`get_daily_briefing`, `prepare_mail_draft`). Sans cette variable, `bellum_api.py` est en
no-op strict : les cinq répondent « je n'ai pas accès à ta messagerie » **alors que Google
Workspace est bel et bien branché côté API**. Le second ingrédient, `INTERNAL_API_SECRET`,
est déjà posé sur les trois services — il n'y a que celle-là à ajouter, et uniquement sur
le service IA.

---

## 2. Ce qui demande une clé d'un fournisseur

### `EMBEDDING_API_KEY` → service **IA**

Où : <https://platform.openai.com> → API keys. Le défaut du code est
`text-embedding-3-small` (1536 dimensions), le modèle le moins cher du catalogue OpenAI.

Sans elle, la base de connaissance cherche en **plein texte Postgres** au lieu de la
similarité vectorielle : « contrat de maintenance » ne ramène pas un document qui parle de
« TMA ». Le RPC pgvector `match_rag_documents` est déjà migré et attend la clé.

La même clé sert pour **`TRANSCRIPTION_API_KEY`** (service **API**, modèle `whisper-1`) —
c'est le même compte OpenAI, deux variables. Sans elle, le dépôt d'un enregistrement dans
un compte rendu de rendez-vous est refusé et l'écran le dit.

### `GITHUB_TOKEN` → service **IA**

Où : GitHub → Settings → Developer settings → Personal access tokens → **fine-grained**,
lecture publique seule, aucune permission d'écriture. Gratuit.

Fait passer le signal tech (langages et dépôts actifs d'une organisation) de **60 à 5000
requêtes/heure**. La source tourne déjà en anonyme : la clé la rend fiable sur un run
chargé, elle ne l'allume pas.

---

## 3. Les CRM et suites qu'aucun client ne peut brancher aujourd'hui

Chacun demande de **déclarer une application OAuth** chez l'éditeur. Tant que les trois
variables ne sont pas posées, la carte n'apparaît sur l'écran Intégrations d'aucun client —
c'est voulu, un bouton « Connecter » qui répond 400 est pire qu'une absence.

L'URL de redirection est imposée par notre code, elle doit être recopiée **au caractère
près** dans l'application déclarée chez l'éditeur.

| Éditeur       | Variables (service **API**)                                                   | URL de redirection à déclarer                   |
| ------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- |
| Salesforce    | `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET`, `SALESFORCE_REDIRECT_URI` | `https://api.bellum-ai.com/salesforce/callback` |
| Pipedrive     | `PIPEDRIVE_CLIENT_ID`, `PIPEDRIVE_CLIENT_SECRET`, `PIPEDRIVE_REDIRECT_URI`    | `https://api.bellum-ai.com/pipedrive/callback`  |
| Attio         | `ATTIO_CLIENT_ID`, `ATTIO_CLIENT_SECRET`, `ATTIO_REDIRECT_URI`                | `https://api.bellum-ai.com/attio/callback`      |
| Microsoft 365 | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI`    | `https://api.bellum-ai.com/microsoft/callback`  |

Où déclarer l'application :

- **Salesforce** — Setup → App Manager → New Connected App → activer OAuth, portées
  `api refresh_token`. Les identifiants s'appellent _Consumer Key_ et _Consumer Secret_, et
  Salesforce met **plusieurs minutes** à les activer après création.
- **Pipedrive** — espace développeur → Marketplace Manager → Create app. Ne pas renseigner
  `PIPEDRIVE_SCOPES` : sans valeur on hérite des portées enregistrées sur l'app, et c'est
  la réponse du serveur qui fait foi.
- **Attio** — Attio → Settings → Developers → nouvelle intégration OAuth. Particularité :
  le jeton d'accès est **longue durée, sans rafraîchissement**, et les portées se règlent
  sur l'intégration et non dans l'URL d'autorisation (`ATTIO_SCOPES` est informatif).
- **Microsoft 365** — portail Azure → Entra ID → App registrations → New registration,
  plateforme **Web**. Le secret se crée dans _Certificates & secrets_ et **expire** (24
  mois au maximum) : à noter quelque part, sinon la connexion tombera sans prévenir.
  Garder `offline_access` dans les portées, sans lui il n'y a pas de jeton de
  rafraîchissement.

---

## 4. Les enrichisseurs de secours de la cascade

Ordre réel : Apollo (posé) → SalesQL → Dropcontact → Hunter → Lusha → Kaspr/FullEnrich.
Chacun n'est appelé que si les précédents n'ont rien trouvé. Tous débitent **1 crédit par
succès uniquement** — 0 coordonnée = 0 débit.

| Clé                   | Service | Où l'obtenir                     | Note                                                                                                   |
| --------------------- | ------- | -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `SALESQL_API_KEY`     | IA      | salesql.com → compte → API       | Résout email + téléphone depuis une URL LinkedIn déjà trouvée par Apollo                               |
| `DROPCONTACT_API_KEY` | API     | dropcontact.com → paramètres API | **RGPD-safe** (algorithmique, sans base pré-scrapée) — c'est celui recommandé par notre étude vs Kaspr |
| `HUNTER_API_KEY`      | API     | hunter.io → Dashboard → API      | Exige un **domaine** ; sans domaine connu l'appel n'est même pas tenté                                 |
| `LUSHA_API_KEY`       | API     | lusha.com → API (offre payante)  |                                                                                                        |
| `KASPR_API_KEY`       | API     | compte client Kaspr              | ⚠️ contrat d'API **non public** — lecture tolérante côté code                                          |
| `FULLENRICH_API_KEY`  | API     | compte client FullEnrich         | ⚠️ idem                                                                                                |

⚠️ Kaspr et FullEnrich : leur documentation vit derrière un compte client, donc le code ne
devine aucun nom de champ — il ne retient que ce qui **a la forme** d'une adresse ou d'un
numéro, écarte ce qu'on a envoyé en écho, et refuse une adresse marquée « devinée par
motif ». Le risque bascule ainsi de « débite un crédit pour une réponse mal lue » vers « ne
trouve rien ». À valider sur une instance réelle avant d'ouvrir à un client.

---

## 5. Le web (Vercel) — trois absences, dont une qui rend aveugle

| Clé                           | Valeur / où l'obtenir                                                              | Ce que ça allume                                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_SENTRY_DSN`             | Sentry → projet web → Client Keys (DSN)                                            | **Aucune erreur front de production n'est remontée aujourd'hui.** Un écran blanc chez un client est invisible                                     |
| `VITE_PLAUSIBLE_DOMAIN`       | `app.bellum-ai.com` (+ un compte plausible.io ou une instance auto-hébergée)       | La mesure d'audience. Sans elle `track('demo_started')` ne compte rien : impossible de savoir si le lien de démo collé dans un message fait effet |
| `VITE_REFLAG_PUBLISHABLE_KEY` | Dashboard Reflag, **même application** que `REFLAG_SECRET_KEY` déjà posée côté API | Les feature flags. Aujourd'hui la moitié serveur est configurée et la moitié web ne l'est pas : tous les flags valent `false` côté SPA            |

Rappel : après avoir posé une variable `VITE_*`, **redéployer** — elle est lue au build.

---

## 6. Ce qu'on ne pose pas

- **`WTTJ_ALGOLIA_APP_ID` / `WTTJ_ALGOLIA_API_KEY`** — Welcome to the Jungle n'a aucune API
  emploi publique gratuite. La clé Algolia embarquée dans leur front **n'est pas** réutilisée
  (ce serait leur clé, pas la nôtre). La source s'active le jour où l'opérateur obtient ses
  propres identifiants légitimes.
- **`ZEFIX_API_USER` / `ZEFIX_API_PASSWORD`** — registre suisse. Ne sert que si un client
  suisse arrive ; les autres parties du pack CH tournent déjà sans clé.
- **`INSEE_API_KEY`, `INPI_USERNAME`/`INPI_PASSWORD`, `FRANCE_TRAVAIL_*`** — déjà posées.

---

## Comment vérifier après coup

Back-office → **Intégrations** → onglet **Catalogue**. Le bandeau « Ce qu'il manque sur ce
serveur » liste nommément chaque outil non configuré avec le nom exact de sa variable. Une
clé correctement posée fait disparaître sa ligne au redéploiement suivant.

Le catalogue lit l'état RÉEL des deux services : les clés du service IA remontent par
`GET /config/integrations`, celles de l'API par son propre `process.env`. Aucune valeur de
clé ne traverse jamais ces réponses — uniquement des booléens.
