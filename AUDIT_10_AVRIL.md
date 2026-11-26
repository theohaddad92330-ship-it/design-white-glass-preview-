# AUDIT BELLUM AI — 10 AVRIL 2026

> Rapport rédigé à partir d'une analyse exhaustive du code source. Chaque point cite fichier + numéro de ligne exact.

---

## 1. INCOHÉRENCES ENTRE FICHIERS

### 1.1 Types `packages/shared/` vs schéma Supabase

| Problème                                                                                                                    | Fichier A                                                                                                                      | Fichier B                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ActionPlan.weeks` est `unknown[]` (trop vague)                                                                             | `packages/shared/src/types/action-plan.ts` l.8                                                                                 | `agent_docs/database_schema.md` l.69 : la colonne `weeks` contient le plan complet séquencé — un type structuré est attendu                                                                                          |
| `AttackAngle` n'a pas les champs `strategy`, `entryContactPersona`, `specificOffer`, `estimatedDealSize` que Claude produit | `packages/shared/src/types/attack-angle.ts` l.1–11 : seulement `title`, `description`, `entry_point`, `is_recommended`, `rank` | `apps/ia/app/prompts/bellum_research.py` l.201–211 : le JSON Claude contient `strategy`, `entryContactPersona`, `specificOffer`, `estimatedDealSize`, `prerequisites`                                                |
| `Contact.user_status` inclut `"refused"` et `"silence"`                                                                     | `packages/shared/src/types/contact.ts` l.11–16                                                                                 | `agent_docs/database_schema.md` l.50 : le CHECK SQL n'inclut que `('new','contacted','replied','meeting','refused','silence')` — OK, mais `useAccount.ts` l.34 définit `user_status: string` (pas typé avec l'union) |
| `Account` dans `useAccount.ts` définit `subsidiaries: string[]`                                                             | `apps/web/src/hooks/useAccount.ts` l.13                                                                                        | `packages/shared/src/types/account.ts` l.11 : `subsidiaries: unknown[]` — incohérence entre le hook et le type partagé                                                                                               |

### 1.2 Champs produits par les prompts IA vs ce que lit `AccountDetail.tsx`

**Prompt `bellum_research.py` → tab "Fiche" (`TabFiche`)**

| Champ produit par Claude                                                                                             | Clé lue dans `AccountDetail.tsx`                                                   | Problème                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"pains"` : tableau d'objets avec `{ pain, businessImpact, esnOffer, urgency, urgencyJustification }`                | `apps/web/src/pages/AccountDetail.tsx` l.578 lit `obj.impact`                      | **MISMATCH CRITIQUE** : le prompt `bellum_research.py` l.158 génère la clé `businessImpact`, mais le frontend lit `impact` — ce champ sera toujours vide |
| `"angles"` : objets avec `{ title, strategy, entryContactPersona, specificOffer, estimatedDealSize, prerequisites }` | `AccountDetail.tsx` l.610 : lit `a.description` et `a.offer`                       | **MISMATCH** : le prompt génère `strategy` (pas `description`) et `specificOffer` (pas `offer`) — ces champs sont toujours vides dans le tab Fiche       |
| `"itChallenges"` : objets avec `{ title, description, severity, esnOfferMatch, timeframe }`                          | `AccountDetail.tsx` l.334 : lit `obj.title`, `obj.description`, `obj.severity`     | OK partiel — `esnOfferMatch` et `timeframe` jamais affichés                                                                                              |
| `"recentSignals"` : objets avec `{ signal, source, type, date, salesImplication }`                                   | `AccountDetail.tsx` l.387 : lit `obj.signal`, `obj.source`, `obj.date`             | OK partiel — `type` et `salesImplication` jamais affichés                                                                                                |
| `"entitiesExhaustive"` : objets avec `{ name, type, parent, region, estimatedHeadcount, itAutonomy }`                | `AccountDetail.tsx` l.272 : cherche `obj.activity`, `obj.esnAngle`, `obj.pitfalls` | **MISMATCH** : les clés `activity`, `esnAngle`, `pitfalls` n'existent pas dans le prompt research — ces sections resteront vides                         |
| `"commentOuvrirCompte"` : string en Phase 1                                                                          | `AccountDetail.tsx` l.639 : attend un objet avec `{ strategy, entryPoints[] }`     | **MISMATCH** : le prompt research l.213 génère une string simple, le frontend tente de lire `.strategy` et `.entryPoints`                                |

**Prompt `bellum_plan.py` → tab "Plan" (`TabPlan`)**

| Champ produit par Claude                                                                 | Clé lue dans `AccountDetail.tsx`                                                         | Problème                                                                                                            |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `actionPlan.phases[].actions[].action` (string)                                          | `AccountDetail.tsx` l.873 : lit `item["text"] ?? item["action"]`                         | OK — fallback sur `action` fonctionne                                                                               |
| `evaluation.quickWins` : tableau d'objets `{ action, expectedImpact, timeline, effort }` | `AccountDetail.tsx` l.1135–1141 : `safeString(qw)` — traite chaque quickWin comme string | **MISMATCH** : le prompt `bellum_plan.py` l.112–120 génère des objets, le frontend les affiche comme strings brutes |
| `evaluation.risks` : tableau d'objets `{ risk, probability, impact, mitigation }`        | `AccountDetail.tsx` l.1148–1154 : `safeString(r)` — traite comme string                  | **MISMATCH** identique — objets affichés comme strings brutes                                                       |
| `messages[].emailSubject` + `messages[].emailBody`                                       | `AccountDetail.tsx` l.1172 : cherche `m["email"]` objet OU `m["emailBody"]`              | OK — le fallback `m["emailBody"]` couvre le schema du prompt                                                        |

**Prompt `bellum_contacts.py` → tab "Contacts" (`TabContacts`)**

| Champ produit par Claude                                                    | Champ en DB (`contacts` table) | Problème                                                                                          |
| --------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `"fullName"`                                                                | `full_name`                    | OK — `phase3_enrich.py` l.48 normalise les deux                                                   |
| `"role"`                                                                    | `decision_role`                | OK — `phase3_enrich.py` l.53 mappe `c.get("role", "unknown")`                                     |
| `"priority"` (1–5)                                                          | `priority` (integer)           | OK                                                                                                |
| `"summary"`                                                                 | `profile_summary`              | OK — `phase3_enrich.py` l.55                                                                      |
| `"whyContact"`                                                              | `why_contact`                  | OK — `phase3_enrich.py` l.56                                                                      |
| `"linkedinUrl"`                                                             | `linkedin_url`                 | **NON SAUVEGARDÉ** — `phase3_enrich.py` ne met pas à jour `linkedin_url` lors de l'enrichissement |
| `"bestApproach"`, `"personalizedHook"`, `"reportingTo"`, `"influenceLevel"` | Aucune colonne correspondante  | **DONNÉES PERDUES** — ces champs riches générés par Claude ne sont jamais persistés en base       |

### 1.3 Endpoints NestJS vs appels frontend

| Endpoint NestJS                                                   | Appel frontend                                                             | Statut                                                                          |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `POST /analysis/start` retourne `{ jobId, accountId }`            | `useAnalysis.ts` l.52–65 : attend `{ jobId, accountId }`                   | OK                                                                              |
| `GET /accounts`                                                   | `Dashboard.tsx` l.123, `Accounts.tsx`                                      | OK                                                                              |
| `GET /accounts/:id`                                               | `useAccount.ts` l.66                                                       | OK                                                                              |
| `GET /contacts/account/:accountId`                                | `useAccount.ts` l.67                                                       | OK                                                                              |
| `POST /contacts/:id/enrich` appelle `iaServiceUrl/phase/2/enrich` | `contacts.service.ts` l.55                                                 | OK mais endpoint IA utilisé : `/phase/2/enrich`                                 |
| `GET /credits/plans` (sans garde JWT)                             | `apps/web/src/lib/plans.ts` — à vérifier                                   | **Non utilisé depuis le frontend** (voir section 2)                             |
| Aucun endpoint `PUT /accounts/:id`                                | `AccountDetail.tsx` — bouton "Relancer" navigue vers `/search?company=...` | Relancer une analyse crée un nouveau compte au lieu de mettre à jour l'existant |

### 1.4 Incohérence champ `entry_point` (attack_angles table)

- `apps/ia/app/prompts/bellum_research.py` l.206 : le prompt génère la clé `"entryContactPersona"` dans chaque angle
- `apps/ia/app/routers/phase1_research.py` l.185 : sauvegarde `angle.get("entryContact", "")` → **double mismatch** : ni `entryContactPersona` ni `entryContact` n'est la bonne clé, donc la colonne `entry_point` sera toujours vide

---

## 2. CODE MORT

### 2.1 Composants UI jamais importés

Les fichiers suivants existent dans `apps/web/src/components/ui/` mais ne sont importés par **aucun** fichier source (vérifié par recherche exhaustive) :

| Fichier                                        | Lignes | Statut                        |
| ---------------------------------------------- | ------ | ----------------------------- |
| `apps/web/src/components/ui/button.tsx`        | —      | **MORT** — aucune importation |
| `apps/web/src/components/ui/card.tsx`          | —      | **MORT**                      |
| `apps/web/src/components/ui/badge.tsx`         | —      | **MORT**                      |
| `apps/web/src/components/ui/skeleton.tsx`      | —      | **MORT**                      |
| `apps/web/src/components/ui/tabs.tsx`          | —      | **MORT**                      |
| `apps/web/src/components/ui/separator.tsx`     | —      | **MORT**                      |
| `apps/web/src/components/ui/progress.tsx`      | —      | **MORT**                      |
| `apps/web/src/components/ui/scroll-area.tsx`   | —      | **MORT**                      |
| `apps/web/src/components/ui/dropdown-menu.tsx` | —      | **MORT**                      |
| `apps/web/src/components/ui/input.tsx`         | —      | **MORT**                      |
| `apps/web/src/components/ui/label.tsx`         | —      | **MORT**                      |
| `apps/web/src/components/ui/select.tsx`        | —      | **MORT**                      |
| `apps/web/src/components/ui/dialog.tsx`        | —      | **MORT**                      |

Seuls `tooltip.tsx`, `ScoreCircle.tsx`, et `KpiCard.tsx` sont effectivement utilisés.

### 2.2 Services Python jamais appelés depuis les routers

- `apps/ia/app/services/classifier.py` : fonctions `classify_company()`, `classify_from_pappers()`, `get_params()` — **jamais importées** depuis aucun router ou agent actif. La classification n'est pas utilisée dans le pipeline principal.
- `apps/ia/app/services/crawl4ai.py` : fournit `scrape_urls()` et `get_combined_content()` — **jamais importé** depuis les routers actifs. `phase1_research.py` l.12 importe uniquement `firecrawl.py`. Le fichier `crawl4ai.py` est une alternative non connectée.

### 2.3 Agents Python jamais appelés depuis les routers

Le répertoire `apps/ia/app/agents/` contient 8 agents (`researcher.py`, `scout.py`, `advisor.py`, `strategist.py`, `messenger.py`, `contact_hunter.py`, `watcher.py`, `orchestrator.py`) qui constituent une architecture multi-agents complète. **Aucun router** dans `apps/ia/app/routers/` n'importe ces agents. Les routers utilisent directement les services et prompts. Ce code est fonctionnel mais totalement inutilisé.

### 2.4 Exports partagés jamais utilisés

- `packages/shared/src/types/attack-angle.ts` : `AttackAngle` — jamais importé dans `apps/web/`
- `packages/shared/src/types/action-plan.ts` : `ActionPlan` — jamais importé dans `apps/web/`
- `packages/shared/src/types/rag-document.ts` : `RagDocument` — jamais importé dans `apps/web/`
- `packages/shared/src/types/analysis.ts` : contenu à vérifier mais probable code mort

### 2.5 Variable inutilisée

- `apps/web/src/pages/Search.tsx` l.164 : `void selectedCompany;` — le développeur a explicitement supprimé l'avertissement lint au lieu de nettoyer le code. `selectedCompany` est setté (l.72) mais jamais lu.

### 2.6 `apps/web/src/lib/plans.ts` jamais utilisé en production

Ce fichier existe mais l'endpoint `GET /credits/plans` n'est appelé nulle part dans `apps/web/src/`.

---

## 3. ERREURS SILENCIEUSES

### 3.1 Catch vides côté frontend (TypeScript)

| Fichier                                            | Ligne         | Conséquence                                                                                                        |
| -------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/hooks/useAccount.ts`                 | 73            | Échec du chargement compte/contacts avalé silencieusement — l'utilisateur voit un écran vide sans message d'erreur |
| `apps/web/src/hooks/useAccount.ts`                 | 97            | Erreur de polling avalée — impossible de diagnostiquer les problèmes de connectivité                               |
| `apps/web/src/pages/Login.tsx`                     | 40            | Erreur de connexion avalée — l'utilisateur peut croire que sa session est active                                   |
| `apps/web/src/pages/Dashboard.tsx`                 | 125           | Échec du fetch des comptes avalé — dashboard vide sans explication                                                 |
| `apps/web/src/pages/Profile.tsx`                   | 184, 227, 254 | 3 catch vides — saves de profil peuvent échouer silencieusement                                                    |
| `apps/web/src/pages/Billing.tsx`                   | 152, 170      | Erreurs Stripe avalées — l'utilisateur peut croire que son paiement est en cours                                   |
| `apps/web/src/pages/Chat.tsx`                      | 302           | Erreur de message chat avalée                                                                                      |
| `apps/web/src/components/ProtectedRoute.tsx`       | 34            | Erreur d'auth avalée — peut créer des boucles de redirection                                                       |
| `apps/web/src/components/account/MessagesTab.tsx`  | 48            | Erreur copy-to-clipboard avalée                                                                                    |
| `apps/web/src/components/account/PrintContent.tsx` | 13            | Erreur d'impression avalée                                                                                         |
| `apps/web/src/hooks/useCompanySearch.ts`           | 56            | Erreur autocomplete avalée                                                                                         |
| `apps/web/src/pages/Discover.tsx`                  | 172           | Erreur discover avalée                                                                                             |
| `apps/web/src/pages/Knowledge.tsx`                 | 180           | Erreur knowledge base avalée                                                                                       |

### 3.2 Catch vides côté API (NestJS)

| Fichier                                            | Ligne | Conséquence                                                                                                                      |
| -------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/analysis/analysis.worker.ts` | 102   | La mise à jour du statut `error` dans Supabase peut échouer silencieusement — le compte reste en statut `analyzing` indéfiniment |
| `apps/api/src/app.module.ts`                       | 33    | Erreur de configuration avalée — l'application démarre avec des valeurs par défaut incorrectes sans avertissement                |

### 3.3 `except Exception:` sans logging côté Python

Les blocs suivants attrapent silencieusement (pas de `logger.warning` ni `logger.error`) :

| Fichier                                  | Ligne      | Conséquence                                                                                                         |
| ---------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `apps/ia/app/agents/researcher.py`       | 64, 71, 78 | 3 méthodes `_safe_*` retournent `[]` ou `""` sans log — impossible de diagnostiquer pourquoi les données sont vides |
| `apps/ia/app/agents/scout.py`            | 20–21      | `brave_search` échoue silencieusement avec `pass` — aucune trace                                                    |
| `apps/ia/app/agents/watcher.py`          | 28         | Idem                                                                                                                |
| `apps/ia/app/routers/phase2_contacts.py` | 75         | Boucle Apollo : une erreur par contact est avalée silencieusement                                                   |

### 3.4 Fallback masquant des erreurs réelles

- `apps/web/src/hooks/useAnalysis.ts` l.40 : `const token = session?.access_token || "dev-token"` — si la session est null en production, le token `"dev-token"` est envoyé au backend, qui retournera un 401, mais l'erreur sera masquée par le catch vide de `startAnalysis`
- `apps/web/src/pages/Dashboard.tsx` l.121 : même problème — `"dev-token"` en fallback peut simuler une session active
- `apps/ia/app/routers/phase4_plan.py` l.51–52 : `raw = existing.data.get("raw_analysis", {}) if existing.data else {}` — si Supabase retourne une erreur, `existing.data` est `None` et le plan est sauvegardé dans un `raw_analysis` vide, écrasant les données des phases précédentes sans avertissement

---

## 4. PROBLÈMES DE SÉCURITÉ

### 4.1 Tokens "dev-token" en fallback (CRITIQUE)

- `apps/web/src/hooks/useAnalysis.ts` l.40 : `const token = session?.access_token || "dev-token"`
- `apps/web/src/pages/Dashboard.tsx` l.121 : `const token = session?.access_token || "dev-token"`

**Impact** : si une session expire ou est invalide, le frontend envoie `"dev-token"` comme Bearer token. Selon la configuration de `JwtGuard`, cela pourrait lever une 401 (comportement actuel correct) **ou** — en cas d'erreur de config — passer le guard. Le pattern lui-même est dangereux et contraire aux règles du projet (`JAMAIS de clé API dans du code côté client`).

### 4.2 Hardcoded `"sk_test_placeholder"` (RISQUE MOYEN)

- `apps/api/src/modules/credits/credits.controller.ts` l.45 : `|| "sk_test_placeholder"`
- `apps/api/src/modules/credits/credits.service.ts` l.25 : `|| "sk_test_placeholder"`

**Impact** : si `STRIPE_SECRET_KEY` n'est pas configurée, Stripe est initialisé avec une clé placeholder invalide. Les webhooks et checkout sessions échouent silencieusement sans erreur claire au démarrage.

### 4.3 Aucun `SUPABASE_SERVICE_ROLE_KEY` dans `apps/web/` (POSITIF)

Vérification effectuée — aucune clé service role dans le frontend. Le client Supabase frontend utilise uniquement `VITE_SUPABASE_ANON_KEY`. Pas de bypass RLS côté client.

### 4.4 Routes FastAPI sans validation `user_id` (RISQUE MOYEN)

Les routes FastAPI `POST /phase/1/research`, `POST /phase/2/contacts`, `POST /phase/3/enrich`, `POST /phase/4/plan` acceptent `user_id` et `account_id` comme paramètres du body sans aucune authentification. N'importe qui peut appeler ces routes avec n'importe quel `account_id` / `user_id` et peupler la base de données d'un autre utilisateur.

- `apps/ia/app/models/research.py` l.8–9 : `account_id: str = ""` et `user_id: str = ""` sont optionnels et non validés
- Le service IA est appelé uniquement par le worker NestJS (`analysis.worker.ts`) depuis le réseau interne, mais en l'absence de protection réseau (Railway, Docker), ces endpoints sont accessibles publiquement.

### 4.5 WebSocket Gateway sans authentification

- `apps/api/src/modules/analysis/analysis.gateway.ts` l.4–10 : le `@WebSocketGateway` n'a pas de guard. N'importe quel client peut rejoindre n'importe quelle room `jobId` et recevoir les données d'analyse d'un autre utilisateur.

---

## 5. DETTE TECHNIQUE

### 5.1 Fichiers dépassant 300 lignes

| Fichier                                           | Lignes    | Commentaire                                                        |
| ------------------------------------------------- | --------- | ------------------------------------------------------------------ |
| `apps/web/src/pages/Landing.tsx`                  | **1 900** | 6x trop grand — tout le site marketing dans un seul fichier        |
| `apps/web/src/pages/AccountDetail.tsx`            | **1 771** | 8 tabs inline + helpers + composants locaux — à éclater en modules |
| `apps/web/src/pages/Billing.tsx`                  | 742       | Acceptable si refactorisé                                          |
| `apps/web/src/pages/Knowledge.tsx`                | 690       | Idem                                                               |
| `apps/web/src/pages/Chat.tsx`                     | 687       | Idem                                                               |
| `apps/web/src/pages/Search.tsx`                   | 669       | Idem                                                               |
| `apps/web/src/pages/Discover.tsx`                 | 650       | Idem                                                               |
| `apps/web/src/pages/Profile.tsx`                  | 598       | Idem                                                               |
| `apps/web/src/pages/Demo.tsx`                     | 550       | Idem                                                               |
| `apps/web/src/pages/Dashboard.tsx`                | 539       | Idem                                                               |
| `apps/web/src/pages/Contacts.tsx`                 | 539       | Idem                                                               |
| `apps/web/src/components/account/MessagesTab.tsx` | 523       | Idem                                                               |

### 5.2 Usages de TypeScript `any`

- `apps/web/src/pages/Demo.tsx` l.153 : `icon: any` dans les props
- `apps/web/src/pages/Demo.tsx` l.344 : `raw.competitors.map((c: any)` — données mockées non typées
- `apps/web/src/pages/Demo.tsx` l.358 : `raw.angles.map((a: any, i: number)` — idem
- Fichiers de tests (`*.test.tsx`) : nombreux `any` dans les mocks framer-motion — acceptable en test

### 5.3 Castings `as Type` contournant le système de types

AccountDetail.tsx contient au moins **20 castings** `as Record<string, unknown>` ou `as { field?: string }` pour gérer les données JSON brutes de Claude. C'est une conséquence du choix de stocker tout le JSON Claude dans `raw_analysis: JSONB` sans typage fort. Lignes concernées : 80, 272, 334, 387, 465, 492, 519, 550, 578, 610, 639, 641, 644, 646, 675, 867, 871, 950, 951, 958.

### 5.4 Logique dupliquée

**`_url_priority()` et `_is_excluded()` dupliqués** :

- `apps/ia/app/services/firecrawl.py` l.44–60
- `apps/ia/app/services/crawl4ai.py` l.44–60
  Les deux fichiers contiennent exactement les mêmes listes `EXCLUDED_DOMAINS`, `HIGH_VALUE_KEYWORDS`, `LOW_VALUE_KEYWORDS` et les mêmes fonctions. Ils devraient partager un module commun `url_utils.py`.

**Interface `Contact` dupliquée** :

- `apps/web/src/hooks/useAccount.ts` l.23–36 : définition locale de `Contact` avec 11 champs
- `packages/shared/src/types/contact.ts` : définition complète avec 20 champs
  Le hook ne réexporte pas le type partagé, créant une désynchronisation silencieuse.

**Interface `Account` dupliquée** :

- `apps/web/src/hooks/useAccount.ts` l.5–21 : définition locale avec 12 champs (manque `user_id`, `error_message`, `user_context`, `api_cost_euros`, `updated_at`)
- `packages/shared/src/types/account.ts` : type complet

---

## 6. COMPOSANTS ET TABS MANQUANTS

### 6.1 Routes App.tsx vs pages existantes

Toutes les routes définies dans `apps/web/src/App.tsx` (l.54–83) correspondent à des fichiers existants. **Aucune page manquante**.

### 6.2 Imports App.tsx

Tous les imports de `App.tsx` pointent vers des fichiers existants. **Aucun import cassé**.

### 6.3 Liens Sidebar vs routes App.tsx

| Lien Sidebar | Route App.tsx | Statut |
| ------------ | ------------- | ------ |
| `/dashboard` | Définie l.69  | OK     |
| `/search`    | Définie l.70  | OK     |
| `/accounts`  | Définie l.71  | OK     |
| `/contacts`  | Définie l.74  | OK     |
| `/chat`      | Définie l.75  | OK     |
| `/discover`  | Définie l.76  | OK     |
| `/knowledge` | Définie l.77  | OK     |
| `/billing`   | Définie l.79  | OK     |
| `/settings`  | Définie l.81  | OK     |

La sidebar ne contient pas de lien vers `/profile` — accessible via `/profile` dans App.tsx mais non visible dans la navigation.

### 6.4 Tabs `AccountDetail.tsx` — TABS array vs rendu switch

**TABS array** (`apps/web/src/pages/AccountDetail.tsx` l.1507–1516) :

```
fiche | contacts | organigramme | plan | messages | evaluation | veille | notes
```

**Tabs rendus** (l.1738–1762) :

```
fiche       → TabFiche         ✓
contacts    → TabContacts      ✓
organigramme→ TabOrganigramme  ✓
plan        → TabPlan          ✓
messages    → TabMessages      ✓
evaluation  → TabEvaluation    ✓
veille      → TabVeille        ✓
notes       → TabNotes         ✓
```

**Tous les tabs sont rendus.** Pas de tab déclaré mais non rendu.

### 6.5 Méthode `ilike()` manquante dans `supabase_client.py` (CRITIQUE)

`apps/ia/app/services/rag_service.py` l.27, 37, 49 appelle `.ilike()` sur l'objet `TableQuery`.
`apps/ia/app/services/supabase_client.py` : la classe `TableQuery` n'implémente **pas** la méthode `.ilike()`.
**Conséquence** : toute requête RAG lèvera une `AttributeError` en production. La fonctionnalité RAG (Knowledge Base) est complètement cassée.

### 6.6 Commits récents (référence)

```
41e3be3 fix(quality): replace hardcoded credits with real-time data from Supabase
cb46126 fix(data-isolation): enforce user_id filtering and fix auth timing race conditions
472be5e fix(security): remove JWT bypass in dev mode and restrict WebSocket CORS
e644617 feat(web): landing page refonte complète v3 — 11 sections premium
f7750bf fix(web): AccountDetail — raw JSON display + Activité du groupe section
a387ca2 feat(web): PRD v2 design overhaul — all pages + new tabs + polish
```

---

## 7. RÉSUMÉ EXÉCUTIF

### 7.1 Total des problèmes par catégorie

| Catégorie            | Critique | Élevé  | Moyen  | Total  |
| -------------------- | -------- | ------ | ------ | ------ |
| Incohérences champs  | 3        | 4      | 4      | **11** |
| Code mort            | 0        | 2      | 6      | **8**  |
| Erreurs silencieuses | 2        | 6      | 8      | **16** |
| Sécurité             | 1        | 2      | 2      | **5**  |
| Dette technique      | 0        | 3      | 4      | **7**  |
| Composants/Tabs      | 1        | 0      | 1      | **2**  |
| **TOTAL**            | **7**    | **17** | **25** | **49** |

### 7.2 Top 3 corrections prioritaires

#### Priorité 1 — Méthode `ilike()` absente dans `supabase_client.py` — **BLOQUANT** (Effort : SMALL)

**Fichier** : `apps/ia/app/services/supabase_client.py`  
**Symptôme** : `AttributeError: 'TableQuery' object has no attribute 'ilike'` à chaque appel RAG  
**Correction** : Ajouter la méthode `ilike(self, column, pattern)` dans la classe `TableQuery` (3 lignes) en ajoutant un param PostgREST `column=ilike.{pattern}`.

#### Priorité 2 — Champs `businessImpact` et `angles.strategy` jamais affichés — **DONNÉES PERDUES** (Effort : SMALL)

**Fichiers** : `apps/web/src/pages/AccountDetail.tsx` l.578 et l.610  
**Symptôme** : Le tab "Fiche" affiche toujours `undefined` pour l'impact des pains et la stratégie des angles, car le prompt génère `businessImpact` et `strategy` mais le frontend lit `impact` et `description`  
**Correction** : Remplacer `obj.impact` par `obj.businessImpact || obj.impact` et `a.description` par `a.strategy || a.description`.

#### Priorité 3 — Tokens `"dev-token"` hardcodés en fallback — **SÉCURITÉ** (Effort : SMALL)

**Fichiers** : `apps/web/src/hooks/useAnalysis.ts` l.40, `apps/web/src/pages/Dashboard.tsx` l.121  
**Symptôme** : En cas de session invalide, un token fictif est envoyé au backend. Le pattern viole les règles de sécurité du projet.  
**Correction** : Supprimer le fallback `|| "dev-token"` et gérer explicitement l'absence de session (retourner une erreur ou rediriger vers `/login`).

### 7.3 Tableau de synthèse

| #   | Problème                                   | Sévérité | Effort | Impact                            |
| --- | ------------------------------------------ | -------- | ------ | --------------------------------- |
| 1   | `ilike()` absent → RAG complètement cassé  | CRITIQUE | SMALL  | Knowledge Base hors service       |
| 2   | Champs `businessImpact`/`strategy` mal lus | CRITIQUE | SMALL  | Données perdues en prod           |
| 3   | `"dev-token"` hardcodé                     | ÉLEVÉ    | SMALL  | Faille sécurité latente           |
| 4   | 13 composants UI shadcn morts              | MOYEN    | MEDIUM | ~800 lignes de code inutiles      |
| 5   | 8+ agents Python non connectés             | MOYEN    | LARGE  | Architecture duale incohérente    |
| 6   | WebSocket sans auth                        | ÉLEVÉ    | MEDIUM | Fuite de données cross-users      |
| 7   | Routes FastAPI sans auth                   | ÉLEVÉ    | MEDIUM | Injection de données arbitraires  |
| 8   | `LinkedinUrl` non persisté (Phase 3)       | ÉLEVÉ    | SMALL  | Données contacts incomplètes      |
| 9   | 16 catch vides frontend                    | MOYEN    | MEDIUM | UX dégradée, débugging impossible |
| 10  | `sk_test_placeholder` hardcodé             | MOYEN    | SMALL  | Stripe silencieusement cassé      |

---

_Audit réalisé le 10 avril 2026 — Codebase : commit `41e3be3`_
