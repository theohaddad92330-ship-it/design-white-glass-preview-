# Audit — comptabilité des crédits (analyses, enrichissements, actions payantes)

> **Question posée.** « Est-ce que mes crédits, mes enrichissements et tout sont bien
> décomptés où il faut ? Et est-ce que ce ne serait pas mieux de faire un big
> compteur, genre à 140, qui compte tous les crédits — Apollo, analyses, etc. ? »
>
> **Décision prise depuis** : « faudra que tu mettes à jour les abonnements, le DM
> et tout et tout, que tout soit carré sur un compteur de crédit partout. »
> Le compteur unique **est acté** — la §7 ne discute donc plus _s'il faut_ le
> faire, elle donne les poids et la §8 donne le **plan d'exécution complet**.
>
> Livrables : **§1–§6 = l'audit** (ce qui est débité, ce qui ne l'est pas, ce qui
> est remboursé) · **§7 = l'unité et les poids** ·
> **§8 = le plan de mise en œuvre** (ce qui est vendu, surfaces, migration,
> séquencement) · **§9 = tests**.
>
> Périmètre : `apps/api` (NestJS, seul porteur de la facturation), `apps/ia`
> (fournisseurs payants), `apps/web`, `apps/website` (marketing),
> `apps/dashboard-manager` (backoffice).
> Date : 2026-07-20. Branche : `audit/credits-accounting`.
>
> ⚠️ **Rien de la §8 n'est implémenté.** Les poids et surtout la réécriture de la
> page de vente touchent des clients payants réels : ils demandent votre
> validation. Le seul code livré ici est la correction D2 (§4).

---

## 0. ⛔ BLOQUANT — la page de vente décrit un produit qui n'existe pas

> **À lire avant toute décision sur les crédits. Ce n'est pas un des sept défauts
> listés plus bas : c'est un préalable qui bloque l'unification, et c'est vrai
> AUJOURD'HUI, indépendamment de tout changement.**

**Le mot « crédit » désigne des choses opposées selon l'écran :**

|              | Ce que « crédit » veut dire                        | Preuve                                                                                                                                                       |
| ------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **App**      | les **analyses** restantes                         | `CreditsBadge.tsx:58-63` — `remaining = accounts_limit − accounts_used`, affiché « N crédits »                                                               |
| **Site web** | les **enrichissements** — l'analyse y est gratuite | `messages/fr/pricing.json:73` « L'analyse de compte est toujours incluse — les crédits ne sont consommés que lorsque vous déclenchez un **enrichissement** » |

L'app appelle « crédits » exactement ce que le site jure être gratuit.

**Et le tableau de coûts du site est faux sur 3 lignes sur 5** (`messages/{fr,en,de,nl}/pricing.json:71-98`) :

| Le site annonce                                | Le code fait                                                                                                                                   |     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| « Analyse de compte — **Incluse · 0 crédit** » | consomme 1 slot, **plafonné** à 15/50/120 par mois (`analysis.service.ts:390`)                                                                 | ❌  |
| « Email professionnel — 1 crédit »             | 1 crédit d'enrichissement                                                                                                                      | ✅  |
| « Téléphone professionnel — **2 crédits** »    | **aucune tarification par type de donnée n'existe** — `CREDIT_COSTS.enrichment` n'a qu'une entrée, `contact: 1` (`credits.service.ts:102-105`) | ❌  |
| « Message personnalisé — **1 crédit** »        | `POST /ia/message` **ne débite rien** (`ia-proxy.controller.ts:190`)                                                                           | ❌  |
| « Export PDF — inclus »                        | aucun coût                                                                                                                                     | ✅  |

**Et l'app se contredit elle-même, sur un seul et même écran.** Ce n'est donc pas
seulement « le site ne dit pas comme le code » — l'incohérence est déjà à
l'intérieur du produit :

| Ce qui s'affiche                                                                                                                           | Où                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Le pill de la sidebar affiche « N crédits » = **les analyses seules**, le solde d'enrichissements n'existant que dans le popover au survol | `CreditsBadge.tsx:58-63` (pill) vs `:36-42` (popover)                                                    |
| « **Analyses illimitées / mois** » dès que `accounts_limit >= 999_999`                                                                     | `billing-view-model.ts:71`, `:93-94` (`planDescriptionUnlimited`)                                        |
| …pendant que la liste d'avantages **de la même carte** affiche « **120 analyses/mois (fair use)** »                                        | `billing-view-model.ts:99` (`benefits: [...plan.features]`) ← `plans.ts:126` (`analysesPerMonthFairUse`) |

« Illimité » et « 120 (fair use) » peuvent donc être **à l'écran en même temps,
sur la même carte**. Pire : `plans.ts:119-120` documente noir sur blanc la
décision produit inverse — « Real fair-use cap, not "illimité" (Théo restitution
§14/§7 : chaque analyse coûte des APIs — **pas d'illimité technique**) ». L'UI
contredit une décision produit explicitement écrite dans le code juste au-dessus.

À noter aussi : le seuil sentinelle `999_999` est **redupliqué en dur à 4
endroits** (`CreditsBadge.tsx:60`, `PlansGrid.tsx:26`, `CurrentPlanCard.tsx:29`,
`billing-view-model.ts:71`) — quatre occasions de diverger.

**Pourquoi c'est bloquant.** Un client qui lit la page de vente croit que les
analyses sont gratuites et illimitées, et qu'un téléphone coûte le double d'un
email ; un client qui regarde son écran voit « illimité » et « 120 fair use » côte
à côte, sous un mot « crédits » qui ne désigne qu'un compteur sur deux. Aucun
compteur — unique ou pas — ne peut être cohérent avec cet ensemble : tant que ce
n'est pas tranché, **toute unification produira un chiffre de plus qui contredit
les autres**, c'est-à-dire précisément le risque à éviter. C'est aussi, très
probablement, la vraie origine de la confusion qui a déclenché cet audit.

**À trancher (personne d'autre que vous ne peut le faire)** : le **code** rattrape
le site (implémenter email 1 / téléphone 2 / message 1, et rendre l'analyse
réellement gratuite hors plafond) — ou le **site** décrit le produit réel.
Mon avis : aligner le site sur le code, **sauf** si « téléphone = 2 crédits » a
été promis en clientèle. Détail complet en §8.1.

Côté app, deux corrections sont sans enjeu commercial et peuvent partir tout de
suite : supprimer le libellé « illimité » (il contredit `plans.ts:119-120`) et
factoriser le seuil `999_999` en une constante unique.

---

## 1. Résumé exécutif

**La bonne nouvelle** : le socle est sérieux. Il y a un **ledger append-only**
(`credit_ledger`), les débits sont **atomiques et race-safe** (un seul `UPDATE`
gardé, pas de check-then-act), le quota est **mutualisé au workspace** de façon
cohérente, le chemin **MCP ne contourne rien**, et le débit se fait **après**
succès sur les chemins d'enrichissement (un appel Apollo raté ne coûte rien).

**Le vrai problème n'est pas « est-ce qu'on débite trop » — c'est que le même
travail est facturé ou gratuit selon le bouton sur lequel on clique.** Quatre
paires de routes exécutent **la même méthode de service**, avec les mêmes
fournisseurs payants : une variante débite un crédit, l'autre ne débite rien. Les
deux sont câblées dans l'UI et utilisées par de vrais utilisateurs.

Classement par impact :

| #      | Défaut                                                                         | Qui paie                                           | Gravité                                    |
| ------ | ------------------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------ |
| **D1** | 4 paires de routes identiques, une facturée / une gratuite                     | Vous (manque à gagner + COGS non couvert)          | 🔴 P0                                      |
| **D2** | Run fantôme (`analyzing` bloqué) : passé en `error` **sans remboursement**     | L'utilisateur (1 crédit pour un dossier vide)      | 🔴 P0 — **CORRIGÉ ici**                    |
| **D3** | `resume()` ne redébite jamais après remboursement → dossier complet à 0 crédit | Vous                                               | 🟠 P1 — décision produit                   |
| **D4** | Toute la surface `/ia/*` (11 routes Claude) non facturée ni plafonnée          | Vous                                               | 🟠 P1                                      |
| **D5** | La ligne ledger `consume_analysis` n'a **pas** d'`account_id`                  | Personne, mais l'audit a posteriori est impossible | 🟠 P1                                      |
| **D6** | Annulation utilisateur / `force_error` admin : aucun remboursement             | L'utilisateur                                      | 🟡 P2                                      |
| **D7** | Le pill « N crédits » n'affiche qu'**un** des deux compteurs                   | L'utilisateur (confusion)                          | 🟡 P2 — cause directe de la question posée |

> Ces sept défauts viennent **après** le §0 : corriger D1 à D7 sur une page de
> vente qui décrit un autre produit ne ferait que déplacer l'incohérence.

**Corrigé dans cette branche : D2 uniquement** — les **quatre** chemins de sortie
de `analyzing` (la 4ᵉ, la réparation à la relance, est arrivée avec #627 pendant
cet audit et **double-facturait** : voir §4). D1/D3 changent ce que les
utilisateurs paient — décision produit, pas correction de bug ; je ne l'ai pas
prise à votre place (voir §6).

---

## 2. Le modèle tel qu'il est aujourd'hui

Deux compteurs distincts, portés par la ligne `subscriptions` du **propriétaire**
du workspace (`credits.service.ts:257-268`) :

| Compteur        | Colonne                            | Sémantique                             | Débit                                                |
| --------------- | ---------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| Analyses        | `accounts_used` / `accounts_limit` | compteur qui **monte** vers un plafond | `consumeAnalysisSlot` (`credits.service.ts:896`)     |
| Enrichissements | `enrichment_credits`               | solde qui **descend**                  | `consumeEnrichmentCredit` (`credits.service.ts:833`) |

Quotas par palier (`plan-catalog.defaults.ts:86-146`, éditables en base via
`plan_definitions`) :

| Palier                   | Prix/mois | Analyses | Enrich. | Sièges |
| ------------------------ | --------- | -------- | ------- | ------ |
| `trial`                  | 0 € (7 j) | 40       | 75      | 3      |
| `starter` (Starter-Solo) | 119 €     | 15       | 20      | 1      |
| `team`                   | 259 €     | 50       | 100     | 3      |
| `growth`                 | 599 €     | 120      | 300     | 8      |
| `beta`                   | 59 €      | 20       | 40      | 3      |

> ⚠️ Le brief mentionnait « 119/159/289 » : c'est **l'ancienne** grille (§1 de
> `agent_docs/billing/pricing-proposal.md`). La grille en vigueur, validée le
> 16/07 et implémentée, est **119 / 259 / 599**.

### Ce qui est solide (vérifié)

| Propriété                       | Preuve                                                                                                                                                                                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ledger append-only**          | table `credit_ledger`, migration `1784900500000-CreditLedger.ts:20-32` ; écriture `recordLedger` (`credits.service.ts:277`) sur consume/refund/grant/topup                                                                                                                               |
| **Débit atomique / race-safe**  | `UPDATE … SET accounts_used = accounts_used + cost WHERE accounts_used + cost <= accounts_limit` (`credits.service.ts:913-923`) — deux départs concurrents au dernier crédit : un seul obtient `affected: 1`. Idem enrichissement (`:845-853`). **Aucun check-then-act sans garde SQL.** |
| **Essai expiré non dépensable** | prédicat `TRIAL_ACTIVE_SQL` (`credits.service.ts:158`) plié dans les deux gardes                                                                                                                                                                                                         |
| **Débit après succès**          | enrichissement contact (`contacts.service.ts:1120`) et refresh (`analysis-refresh.service.ts:76`) débitent **après** que le fournisseur a répondu — un échec Apollo ne coûte rien                                                                                                        |
| **Mutualisation workspace**     | `resolveBillingSubscription` (`credits.service.ts:257`) débite toujours le **propriétaire**, l'acteur est tracé dans `actor_user_id`                                                                                                                                                     |
| **MCP ne contourne pas**        | `mcp-api.controller.ts:169` délègue à `analysis.start()` sans `force` → débit normal ; handshake `confirm` en amont (`:141-168`)                                                                                                                                                         |
| **Démo ne débite jamais**       | court-circuit `isDemo` (`credits.service.ts:844`, `:912`) — et ne rembourse pas non plus (`:1042`), donc pas d'inflation                                                                                                                                                                 |
| **Idempotence Stripe**          | `stripe_events` en `ON CONFLICT DO NOTHING` (`credits.service.ts:423-433`) — une redelivery ne recrédite pas un top-up                                                                                                                                                                   |

---

## 3. D1 — le défaut principal : même travail, facturation différente 🔴

`AnalysisOnDemandService` expose quatre re-runs mono-phase. Chacun est atteignable
par **deux** routes : une qui débite, une qui ne débite pas. **Les deux sont
appelées par l'UI.**

| Travail (fournisseurs payants)                                                          | Route **facturée**                                                                       | Route **gratuite**                                                    | Même méthode ?                                                                            |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Phase 1 recherche — Firecrawl + Brave + Pappers + INSEE + INPI + Apollo org + Claude ×3 | `POST /analysis/:id/refresh {signals}` → `analysis-refresh.service.ts:76` (**1 crédit**) | `POST /analysis/:id/research-site` (`analysis.controller.ts:166`)     | **Oui** — les deux appellent `runResearch` (`analysis-ondemand.service.ts:305` et `:327`) |
| Phase 2 contacts — Apollo search+enrich, SalesQL, Brave, Claude Haiku                   | `POST /analysis/:id/refresh {contacts}` (**1 crédit**)                                   | `POST /analysis/:id/enrich-contacts` (`analysis.controller.ts:134`)   | **Oui** — `onDemand.enrichContacts`                                                       |
| Phase 3 organigramme — Claude + Apollo enrich                                           | `POST /analysis/:id/refresh {entities}` (**1 crédit**)                                   | `POST /analysis/:id/enrich-organigram` (`analysis.controller.ts:155`) | **Oui** — `onDemand.enrichOrganigram`                                                     |
| Phase 4 plan — Claude ×3 + embeddings                                                   | `POST /analysis/:id/refresh {strategy}` (**1 crédit**)                                   | `POST /analysis/:id/replan` (`analysis.controller.ts:147`)            | **Oui** — `onDemand.replan`                                                               |

Preuve que ce sont bien les mêmes appels :
`AnalysisRefreshService.runDimension` (`analysis-refresh.service.ts:100-108`)
route `signals→refreshResearch`, `contacts→enrichContacts`,
`entities→enrichOrganigram`, `strategy→replan` — **exactement** les méthodes que
les quatre routes « gratuites » appellent en direct.

Et le web appelle bien les deux familles :
`apps/web/src/features/accounts/api.ts:94` (`enrich-contacts`), `:104` (`replan`),
`:112` (`enrich-organigram`), `:119` (`research-site`) **et** `:132` (`refresh`).

`AnalysisOnDemandService` **n'importe même pas** `CreditsService` — l'omission est
assumée en commentaire (`analysis.controller.ts:164-165` : « no credit debit
(mirrors enrich-contacts / enrich-organigram) »), mais elle rend le compteur
d'enrichissements **contournable par construction** : n'importe quel utilisateur
à 0 crédit peut relancer la phase 1 (le call le plus cher de l'app) autant de
fois qu'il veut via « Rechercher les sites ».

> **Ce n'est pas un sur-débit — c'est un sous-débit.** Personne ne s'en plaindra,
> et c'est précisément pour ça que ça peut durer longtemps sans être vu.

---

## 4. D2 — run fantôme non remboursé 🔴 (**corrigé dans cette branche**)

### Le trou

Un compte ne quitte `status='analyzing'` que par un événement terminal du worker.
Le worker **rembourse** correctement sur échec terminal
(`analysis.worker.ts:1017-1029`, conditionné à `job.data.slotConsumed`).

Mais le faucheur `StuckAnalysisReaper` existe **précisément pour les runs dont le
worker n'a jamais émis cet événement** — éviction Redis, redeploy Railway en plein
run (`stuck-analysis.reaper.ts:27-42`). Or, avant ce correctif :

- `stuck-analysis.reaper.ts:100-133` basculait le compte en `error` — **sans
  injecter `CreditsService` du tout** ;
- `analysis.service.ts:251-259` (réparation à la lecture) faisait `markErrored`
  — **sans remboursement non plus**.

**Donc, dans le seul cas où le worker ne peut pas rembourser, personne ne
remboursait.** L'utilisateur payait 1 crédit pour un dossier vide, sur une panne
d'infra dont il n'est pas responsable — la violation directe de la règle inscrite
dans le code lui-même (`analysis.worker.ts:1013`, Théo §7 : « rembourser si échec
non utilisateur »).

Aggravant : la réparation à la lecture **volait la transition** au faucheur (elle
bascule la ligne en `error`, après quoi le faucheur ne la sélectionne plus). Un
utilisateur qui ouvre son dossier bloqué — le réflexe naturel — empruntait donc
le chemin qui ne remboursait pas.

### ⚠️ Une QUATRIÈME sortie est apparue pendant l'audit (#627) — et elle double-facturait

`#627` (mergé sur `main` pendant cet audit) a ouvert une 4ᵉ sortie de `analyzing` :
la **réparation à la relance** (`analysis.service.ts`, couche d'idempotence 2 de
`start`). Sans elle, un compte fantôme était un cul-de-sac produit — « Relancer »
renvoyait `in_flight` sur le run mort, indéfiniment. C'est une bonne correction.

Mais elle répare le run mort **puis consomme aussitôt un slot** pour le run neuf,
quelques lignes plus bas. Sans remboursement, l'utilisateur payait donc **2 crédits
pour un seul dossier — sur le bouton même qu'il presse pour se sortir d'une panne
d'infra dont il n'est pas responsable.** Ce chemin est désormais traité comme les
autres.

**La composition des deux PR est ce qui compte** : `#627` rend le run mort
**atteignable** (un job `active` orphelin ne compte plus comme vivant — c'est le
mode de panne le plus courant en prod, le redeploy Railway) ; ce correctif rend la
sortie **remboursée**. Avant les deux réunies, ce compte-là n'était jamais fauché
du tout, donc jamais remboursé : le crédit était perdu en silence, définitivement.
Test de composition dédié.

### Le correctif livré

Les **quatre** sorties remboursent, **exactement une fois**, via une transition gardée :

| Sortie de `analyzing`             | Rembourse ?                                | Garde                            |
| --------------------------------- | ------------------------------------------ | -------------------------------- |
| 1. worker `onFailed`              | ✅ déjà le cas (`analysis.worker.ts:1019`) | `job.data.slotConsumed`          |
| 2. réparation à la lecture        | ✅ **ajouté**                              | `markInterrupted`                |
| 3. faucheur périodique            | ✅ **ajouté**                              | `result.affected` (déjà présent) |
| 4. réparation à la relance (#627) | ✅ **ajouté**                              | `markInterrupted`                |

- `AccountsService.markInterrupted(id, message)` (nouveau,
  `accounts.service.ts:1166`) : `UPDATE … WHERE id = :id AND status = 'analyzing'`
  et renvoie un booléen « ai-je gagné la course ». `markErrored` (non gardé) est
  laissé intact pour ses autres appelants.
- `AnalysisService.refundInterruptedRun` : le remboursement factorisé des sorties
  2 et 4, best-effort en `try/catch`.

Les trois sorties qui ne peuvent pas s'appuyer sur le worker sont toutes
conditionnées à la même transition gardée sur `status='analyzing'` : **une seule
peut la gagner** → un remboursement, jamais deux — y compris maintenant que les
trois atteignent les **mêmes lignes** (depuis #627, un job orphelin ne protège
plus le compte), ce qui rend la garde indispensable plutôt que théorique.

Un dossier réconcilié en `completed` (le cas « dossier complet resté bloqué »,
`stuck-analysis.reaper.ts:107-110`) **n'est pas remboursé** : le dossier est livré,
le crédit est dû. Test dédié.

### Limite honnête

Un lancement opérateur `force` (`analysis.service.ts:386`, tableau de bord
monitoring) ne consomme aucun slot ; le worker le sait via `slotConsumed`, mais
le faucheur n'a **pas** de job à interroger. Si un run `force` se bloque, le
propriétaire est crédité de +1 à tort. Borné (opérateur uniquement, +1 crédit,
jamais un débit), et strictement préférable à l'ancien comportement. Le correctif
propre passe par D5 (voir §5).

---

## 5. Les autres défauts

### D3 — `resume()` ne redébite jamais 🟠

`AnalysisService.resume` (`analysis.service.ts:584-642`) n'appelle **aucune**
méthode de crédit et n'enfile pas `slotConsumed` dans le payload BullMQ
(`:621-638`).

Séquence réelle : lancement (**−1**) → échec terminal → remboursement (**+1**) →
clic « Reprendre » (**0**) → le run repart des phases non abouties et se termine →
**dossier complet livré pour 0 crédit**. Le correctif D2 ci-dessus _élargit_
mécaniquement ce trou (davantage de runs sont désormais remboursés, donc
davantage de reprises gratuites).

Correctif proposé (2 lignes, **non appliqué — décision produit**) : consommer un
slot dans `resume()` et passer `slotConsumed: true` dans le job, de sorte qu'un
échec de la reprise soit à son tour remboursé. Net : 1 dossier = 1 crédit, quel
que soit le nombre d'interruptions. Risque à peser : un utilisateur au quota plein
ne pourrait plus reprendre son propre run interrompu.

### D4 — la surface `/ia/*` n'est ni facturée ni plafonnée 🟠

Le module `ia-proxy` ne référence `CreditsService` **nulle part**. 11 routes
utilisateur atteignent Claude et/ou des APIs payantes sans compteur :

| Route                                                | Fichier                                 | Fournisseur                       |
| ---------------------------------------------------- | --------------------------------------- | --------------------------------- |
| `POST /ia/discover`                                  | `ia-proxy.controller.ts:66`             | Brave + Claude                    |
| `POST /ia/discover/registry`                         | `:79`                                   | Pappers + Claude (throttle seul)  |
| `POST /ia/discover/signals`                          | `:96`                                   | résolution d'homonymes ×N groupes |
| `POST /ia/chat`                                      | `:121`                                  | Claude + embeddings               |
| `POST /ia/icebreaker`                                | `:181`                                  | Claude                            |
| `POST /ia/message` (messages prêts à envoyer)        | `:190`                                  | Claude                            |
| `POST /ia/weekly-briefing` (veille)                  | `:205`                                  | Claude                            |
| `POST /ia/battlecard`                                | `:217`                                  | Claude                            |
| `POST /ia/compare`                                   | `:226`                                  | Claude                            |
| `POST /rag-documents/ingest` \| `/query`             | `rag.controller.ts:62`, `:77`           | embeddings                        |
| `POST /esn-profile/prefill` \| `/regenerate-context` | `esn-profile.controller.ts:143`, `:190` | Claude + Brave + Pappers          |

Deux cas méritent un plafond même sans facturation :
`GET /accounts/similar-to-explore` (`accounts.controller.ts:95`) et
`GET /accounts/:id/similar` (`:145`) déclenchent une découverte **Pappers sur un
simple GET** — un refetch React ou un polling de dashboard facture Pappers.
De même, la synchro Google Drive → RAG (`google.service.ts:392`) et Notion
(`notion.service.ts:183`) génèrent des embeddings proportionnels au nombre de
fichiers, sans plafond côté API.

Ce n'est pas forcément un bug : le chat et les messages sont probablement voulus
« inclus ». Mais c'est un **choix non écrit** : rien dans le code ne dit que c'est
délibéré, et le coût est réel.

### D5 — le ledger ne relie pas le débit d'analyse au dossier 🟠

`consumeAnalysisSlot` est appelé **avant** la création du compte
(`analysis.service.ts:390-393`) — logique, le compte n'existe pas encore — donc la
ligne ledger part avec `account_id = NULL`. Les remboursements, eux, portent bien
un `accountId` (`analysis.worker.ts:1021`, et désormais les deux chemins de D2).

Conséquence : impossible de répondre après coup à « ce dossier-là a-t-il été
débité, puis remboursé ? » — exactement la question qu'un ledger doit trancher.
C'est aussi ce qui empêche un remboursement strictement idempotent piloté par le
ledger (cf. limite de D2).

Correctif propre : rapprocher le débit de la création du compte, ou rattacher
l'`account_id` à la ligne ledger juste après la création. Non fait ici — touche
l'ordonnancement du chemin chaud de lancement.

### D6 — annulations non remboursées 🟡

- `cancelByUser` (`analysis.service.ts:673-691`) : aucun appel crédit. Un
  utilisateur qui annule à 90 % paie plein tarif. Défendable (c'est son choix),
  mais **jamais annoncé dans l'UI**.
- `cancelByAdmin` en mode `force_error` (`analysis.service.ts:728-730`) : un run
  zombie force-erroré par un opérateur ne rembourse pas. Là, l'échec n'est **pas**
  imputable à l'utilisateur — même famille que D2, et il devrait rembourser.

### D7 — l'UI n'affiche qu'un compteur sur deux 🟡

`CreditsBadge.tsx:58-63` :

```ts
const used = credits.accounts_used
const total = credits.accounts_limit
const remaining = Math.max(total - used, 0)
const badgeLabel = t('badge.creditsCount', { count: remaining }) // « N crédits »
```

Le pill « 112 crédits » signifie donc **« 112 analyses restantes »** (cohérent avec
Growth : 120 − 8). Le solde d'enrichissements — l'autre compteur, celui que
débitent « Enrichir » et « Actualiser » — n'apparaît **que** dans le popover au
survol (`CreditsBadge.tsx:36-42`).

Un utilisateur voit donc « 112 crédits », clique « Actualiser », et **rien ne
bouge** dans le pill : ce clic a débité l'autre compteur, invisible. C'est très
probablement l'origine exacte de la question posée.

### Vérifications que je n'ai **pas** pu faire

- **La base locale (port 5440) est vide** : 2 lignes `subscriptions` en `trial`,
  **0 ligne** dans `credit_ledger`. Aucun comportement de production n'a pu être
  validé sur données réelles — tout ci-dessus est établi par lecture de code et
  par les tests.
  (Détail à noter : une des deux lignes porte `accounts_used = 2` sans aucune
  ligne ledger correspondante. En dev, avec un ledger postérieur aux données,
  c'est attendu — mais **ça mériterait la même requête en prod** : un écart
  soutenu entre `accounts_used` et la somme des deltas ledger serait le signal
  d'un débit hors ledger.)
- Les coûts unitaires **0,65 € / 0,08 €** ne sont pas mesurés par moi : ce sont
  les chiffres fournis et figés dans `agent_docs/billing/pricing-proposal.md:38-39`
  (repris dans `credits.service.ts:188-189` et `agent_docs/caching.md:47`).
  Toute la §7 en dépend.

---

## 6. Carte de consommation (synthèse)

| Action utilisateur                                                 | Débité ?          | Où                                                | Remboursé si échec ?                                                                              |
| ------------------------------------------------------------------ | ----------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Analyse complète (bouton principal)                                | ✅ 1 slot         | `analysis.service.ts:390`                         | ✅ création (`:461`), enqueue (`:559`), échec terminal (`worker:1019`), **run fantôme (corrigé)** |
| Analyse via MCP                                                    | ✅ 1 slot         | `mcp-api.controller.ts:169` → même chemin         | idem                                                                                              |
| Ré-ouverture dossier < 30 j                                        | ❌ (cache)        | `analysis.service.ts:364-374`                     | n/a — **correct**                                                                                 |
| Relance explicite (`relaunch`)                                     | ✅ 1 slot         | même chemin                                       | idem                                                                                              |
| **Reprendre** après échec                                          | ❌                | `analysis.service.ts:584`                         | **D3**                                                                                            |
| Enrichir un contact                                                | ✅ 1 enrich.      | `contacts.service.ts:1120` (après succès)         | n/a — pas de débit sans match                                                                     |
| Enrichir via MCP                                                   | ✅ 1 enrich.      | `mcp-api.controller.ts:254`                       | idem                                                                                              |
| Actualiser un axe (`/refresh`)                                     | ✅ 1 enrich.      | `analysis-refresh.service.ts:76`                  | n/a — débit post-succès                                                                           |
| Enrichir contacts / organigramme / replan / rechercher sites       | ❌                | `analysis.controller.ts:134,147,155,166`          | **D1**                                                                                            |
| Discover / Chat / Veille / Icebreaker / Message / Battlecard / RAG | ❌                | `ia-proxy.controller.ts`, `rag.controller.ts`     | **D4**                                                                                            |
| Refresh watchlist quotidien                                        | ❌ **volontaire** | `watchlist-refresh.worker.ts:34-35`               | système — borne = volume (10/j/workspace)                                                         |
| Annulation utilisateur / `force_error` admin                       | ❌ remb.          | `analysis.service.ts:673`, `:728`                 | **D6**                                                                                            |
| Export CRM / envoi email                                           | ❌                | `crm.controller.ts`, `contacts.controller.ts:146` | pas de coût LLM — **correct**                                                                     |

---

## 7. L'unité et les poids (décidé : compteur unique)

> ### ⚠️ Statut épistémique des chiffres de cette section — à lire avant de fixer un prix
>
> Ces poids vont servir à fixer ce que paient de vrais clients. **Deux chiffres
> seulement sont des coûts réels ; tout le reste est dérivé ou absent.**
>
> | Chiffre                                                          | Statut                                                                                                                                | Source                       |
> | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
> | **0,65 € / analyse**                                             | 🟢 **fourni et validé** — c'est la base du modèle de marge validé le 16/07                                                            | `pricing-proposal.md:38`     |
> | **0,08 € / enrichissement**                                      | 🟢 **fourni et validé**                                                                                                               | `pricing-proposal.md:39`     |
> | **1 analyse = 8 crédits**                                        | 🟢 déduction arithmétique directe des deux ci-dessus (8,125 → 8)                                                                      | —                            |
> | Poids par axe (signals 4 / contacts 2 / entities 1 / strategy 1) | 🟠 **DÉRIVÉS, non mesurés** — extrapolés d'**une seule** répartition de phase, observée sur un **pire cas** (Société Générale, CAC40) | `strategy-token-eval.md:184` |
> | Coût de `/ia/*` (chat, message, veille, discover, RAG…)          | 🔴 **JAMAIS MESURÉ** — mis à **0 (inclus)** _faute de donnée, pas par conviction_ : je n'ai aucune idée de ce que ça coûte            | —                            |
> | Marge par palier après unification                               | 🟢 arithmétique, mais **héritée** de la fiabilité des deux premières lignes                                                           | —                            |
>
> **Ce que ça implique concrètement :**
>
> - Les poids 🟢 peuvent servir à tarifer dès maintenant.
> - Les poids 🟠 sont des **ordres de grandeur** : ne pas les afficher à un client
>   ni les graver dans Stripe avant mesure. Leur seule propriété solide est de
>   sommer à 8 (les 4 axes = 1 analyse), ce qui est une contrainte de cohérence
>   interne, **pas** une mesure.
> - Les lignes 🔴 à 0 ne veulent **pas** dire « c'est gratuit » : elles veulent dire
>   « je n'ai pas su chiffrer ». Un chat intensif peut très bien coûter cher.
> - **Rien n'a été validé sur des données de production** : la base locale (port 5440) contenait 2 lignes `subscriptions` en essai et **0 ligne** de ledger.
>   Aucune consommation réelle, aucun mix analyses/enrichissements observé, aucun
>   parc client mesuré. Tout ce document est établi par **lecture de code**.
> - Dispersion connue et non modélisée : un run coûte **0,65 €** en base, **0,78 €**
>   en pire cas (`collection-depth.md:19-21`), jusqu'à **$1,08** sur un mega-compte
>   (`strategy-token-eval.md:181`). Un parc majoritairement grands comptes
>   consommerait **plus** que ce que le modèle prévoit.
>
> **Prérequis avant de figer la grille** : instrumenter le coût réel par phase et
> par appel. Le nécessaire existe déjà côté IA (`_api_metrics`, et
> `strategy-token-eval.md:199` prévoit explicitement que « `run cost` remplace
> cette estimation par le coût réel observé »). Un mois de télémétrie fait passer
> les 🟠 et 🔴 en 🟢 — c'est peu de travail pour des chiffres qui vont porter une
> grille tarifaire.

### Les unités ne sont pas commensurables : rapport **8:1**

- 1 analyse ≈ **0,65 €** de fournisseurs — 1 enrichissement ≈ **0,08 €**
  (`pricing-proposal.md:38-39`). Rapport exact : **8,125**.
- Toute la grille tarifaire est construite là-dessus :
  `COGS = 0,65 × analyses + 0,08 × enrichissements`, avec la règle
  `prix ≥ 5 × COGS_plein` pour tenir > 80 % de marge (`pricing-proposal.md:96-99`).
- Et c'est **vendu séparément** : la description Stripe elle-même écrit
  « `{accounts_limit}` analyses/mois, `{enrichment_credits}` enrichissements »
  (`credits.service.ts:345`), les packs de recharge sont séparés
  (`TOPUP_PACKS`, `credits.service.ts:193-200`), et le site marketing affiche
  les deux lignes.

### Pourquoi un compteur **plat** est à exclure

Un pool fongible à 1:1 laisse l'utilisateur tout dépenser du côté cher :

| Palier        | Pool plat (analyses + enrich.) | COGS si tout en analyses | Marge               |
| ------------- | ------------------------------ | ------------------------ | ------------------- |
| Starter 119 € | 35                             | 22,75 €                  | 90,5 % → **80,9 %** |
| Team 259 €    | 150                            | 97,50 €                  | 84,4 % → **62,4 %** |
| Growth 599 €  | 420                            | 273,00 €                 | 83,0 % → **54,4 %** |

Growth perdrait **29 points de marge** dans le pire cas. Un compteur plat
sur-facture les actions bon marché _et_ brade les chères — il casse le modèle
validé le 16/07.

### ✅ Retenu : **compteur unique PONDÉRÉ, 1 analyse = 8 crédits**

L'unité = 1 enrichissement (la plus petite action réelle). Le poids **8** est le
rapport de coût, arrondi à l'entier.

| Palier          | Aujourd'hui | **Pool unifié**  | COGS max (tout en analyses) | Marge pire cas |
| --------------- | ----------- | ---------------- | --------------------------- | -------------- |
| `trial`         | 40 + 75     | **395 unités**   | —                           | —              |
| `starter` 119 € | 15 + 20     | **140 unités**   | 11,38 €                     | 90,4 %         |
| `team` 259 €    | 50 + 100    | **500 unités**   | 40,63 €                     | 84,3 %         |
| `growth` 599 €  | 120 + 300   | **1 260 unités** | 102,38 €                    | 82,9 %         |
| `beta` 59 €     | 20 + 40     | **200 unités**   | 16,25 €                     | 72,5 %         |

**Le point clé** : parce que les poids _sont_ le rapport de coût, le COGS maximal
vaut `unités × 0,08125 €` **quelle que soit la répartition** entre analyses et
enrichissements. La marge à pleine consommation bouge de **moins de 0,5 %** par
rapport à aujourd'hui — le modèle validé le 16/07 est préservé exactement, tout en
donnant à l'utilisateur un seul nombre et la liberté de le dépenser comme il veut.

> Anecdote parlante : le « genre à 140 » de la question tombe **pile** sur le pool
> pondéré de Starter-Solo (15 × 8 + 20 = 140). L'intuition était bonne.

### La grille complète des poids

**1 crédit = 1 enrichissement de contact ≈ 0,08 € de coût fournisseur.**

| Action                                                      | Poids proposé                          | Base du calcul                                                                                                     | Confiance                                   |
| ----------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| **Analyse complète** (4 phases)                             | **8**                                  | 0,65 € ÷ 0,08 € = 8,125 → 8                                                                                        | 🟢 **mesuré** (`pricing-proposal.md:38-39`) |
| **Enrichissement contact** (Apollo → SalesQL → Dropcontact) | **1**                                  | l'unité elle-même                                                                                                  | 🟢 **mesuré**                               |
| Refresh axe **signals** (phase 1)                           | **4**                                  | phase research = 35-60 % du run mesuré (`strategy-token-eval.md:184` : $0,375-0,65 sur un run à $1,08) → ~50 % × 8 | 🟠 dérivé                                   |
| Refresh axe **contacts** (phase 2)                          | **2**                                  | Apollo ×N + Claude Haiku                                                                                           | 🟠 dérivé                                   |
| Refresh axe **entities** (phase 3)                          | **1**                                  | Claude classify + Apollo top-décideurs                                                                             | 🟠 dérivé                                   |
| Refresh axe **strategy** (phase 4)                          | **1**                                  | Claude ×3 + embeddings                                                                                             | 🟠 dérivé                                   |
| Chat / icebreaker / message / battlecard / compare / veille | **0 (inclus)** + rate-limit            | 1 appel Claude, ≪ 0,08 €                                                                                           | 🔴 **non mesuré**                           |
| Discover (registry / signals)                               | **0 (inclus)** + rate-limit            | Pappers + Claude, déjà throttlé                                                                                    | 🔴 **non mesuré**                           |
| RAG ingest / query                                          | **0 (inclus)** + plafond par workspace | embeddings, coût marginal                                                                                          | 🔴 **non mesuré**                           |
| Export CRM / PDF / envoi email                              | **0**                                  | aucun coût LLM                                                                                                     | 🟢                                          |

**Propriété de cohérence** : les 4 refresh d'axes somment à **8** — exactement le
prix d'une analyse complète. Rafraîchir les 4 axes coûte donc le même prix que
relancer l'analyse, ce qui est le comportement voulu et supprime toute incitation
à contourner par le chemin le moins cher.

> ⚠️ **Honnêteté sur les chiffres.** Seuls **0,65 €** (analyse) et **0,08 €**
> (enrichissement) sont des coûts fournis et validés. Les poids d'axes sont
> _dérivés_ d'une répartition de phase mesurée une fois, sur un pire cas
> (Société Générale, CAC40). Les lignes 🔴 ne sont pas mesurées du tout — je les
> mets à 0 (inclus) faute de donnée, pas par conviction.
> **Prérequis avant de figer la grille : instrumenter le coût réel par phase et
> par appel** (`_api_metrics` existe déjà côté IA, cf. `strategy-token-eval.md:199`
> « `run cost` remplace cette estimation par le coût réel observé »). Un mois de
> télémétrie transforme les 🟠/🔴 en 🟢 — et c'est peu de travail.

> Note de dispersion : un run coûte **0,65 €** en base, **0,78 €** en pire cas
> (`collection-depth.md:19-21`) et jusqu'à **$1,08** sur un mega-compte CAC40
> (`strategy-token-eval.md:181`). Le poids 8 est calé sur le cas de base, comme
> toute la grille tarifaire validée le 16/07 — c'est cohérent, mais un parc de
> gros comptes consommerait plus que le modèle ne prévoit.

---

## 8. Plan de mise en œuvre — compteur unique partout

### 8.1 Réconciliation avec ce qui est VENDU — ⚠️ à lire en premier

C'est la partie la plus dangereuse, et elle réserve une mauvaise surprise :
**la page de vente décrit déjà un modèle de crédits qui n'existe nulle part dans
le code.** Ce n'est pas un effet de l'unification — c'est vrai aujourd'hui.

#### a) Le mot « crédit » désigne des choses OPPOSÉES selon l'écran

| Surface                | Ce que « crédit » désigne                                                       | Preuve                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **App** (pill sidebar) | les **analyses** restantes                                                      | `CreditsBadge.tsx:58-63` : `remaining = accounts_limit − accounts_used`, libellé « N crédits »                                                                                                                |
| **Site marketing**     | les **enrichissements** uniquement — et l'analyse y est annoncée à **0 crédit** | `fr/pricing.json:73` : « L'analyse de compte est toujours incluse — les crédits ne sont consommés que lorsque vous déclenchez un enrichissement » ; ligne 78 : « Analyse de compte · **Incluse · 0 crédit** » |

L'app appelle « crédits » exactement ce que le site jure être gratuit. À lui seul,
ce point justifie l'unification demandée.

#### b) Le tableau de coûts du site est faux sur 3 lignes / 5

| Ligne du site (`fr/pricing.json:75-98`, `en/pricing.json:75-98`) | Réalité du code                                                                                                                                        | Verdict                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| « Analyse de compte — **Incluse · 0 crédit** »                   | consomme 1 slot d'analyse, **plafonné** à 15/50/120 par mois (`analysis.service.ts:390`)                                                               | ❌ **faux** (l'analyse est bien plafonnée) |
| « Email professionnel — 1 crédit / contact »                     | 1 crédit d'enrichissement                                                                                                                              | ✅ exact                                   |
| « Téléphone professionnel — **2 crédits** / contact »            | **aucune tarification par type de donnée n'existe** : `CREDIT_COSTS.enrichment` ne contient qu'une entrée, `contact: 1` (`credits.service.ts:102-105`) | ❌ **faux**                                |
| « Message personnalisé — 1 crédit / message »                    | `POST /ia/message` **ne débite rien** (`ia-proxy.controller.ts:190`, cf. D4)                                                                           | ❌ **faux** (en faveur du client)          |
| « Export PDF — inclus »                                          | aucun coût                                                                                                                                             | ✅ exact                                   |

> **À trancher avant tout le reste** : est-ce le **code** qui doit rattraper le
> site (implémenter email 1 / téléphone 2 / message 1), ou le **site** qui doit
> décrire le produit ? Tant que ce n'est pas tranché, tout compteur unique
> contredira la page de vente — c'est-à-dire exactement le risque à éviter.
> Mon avis : aligner le site sur le code (plus simple, et la tarification par
> type de donnée n'apporte pas grand-chose), **sauf** si le « téléphone = 2 »
> a été promis en clientèle.

#### c) Les cartes de prix, elles, sont exactes

`fr/pricing.json:30-31,46-47,62-63` annoncent 15/20, 50/100, 120/300 — conformes
au catalogue (`plan-catalog.defaults.ts:100-132`). Les **prix** sont lus en direct
depuis `/credits/plans` (`live-prices.ts:74-110`), donc une édition backoffice les
propage ; **les quotas, eux, sont des chaînes statiques** dans les catalogues de
messages → à réécrire à la main lors de la bascule (FR + EN + NL).

> ⚠️ Le brief parlait de « 119/159/289 € » : c'est l'**ancienne** grille
> (`pricing-proposal.md` §1, historique). La grille **en vigueur** est
> **119 / 259 / 599 €** (validée 16/07, §3 du même document). Toute communication
> doit partir de celle-ci.

#### d) Personne ne perd de valeur — c'est démontrable

Conversion retenue : `crédits = (accounts_limit − accounts_used) × 8 + enrichment_credits`.

| Palier    | Aujourd'hui | Pool unifié | Max analyses avant → après | Max enrich. avant → après |
| --------- | ----------- | ----------- | -------------------------- | ------------------------- |
| `trial`   | 40 + 75     | **395**     | 40 → **49**                | 75 → **395**              |
| `starter` | 15 + 20     | **140**     | 15 → **17**                | 20 → **140**              |
| `team`    | 50 + 100    | **500**     | 50 → **62**                | 100 → **500**             |
| `growth`  | 120 + 300   | **1 260**   | 120 → **157**              | 300 → **1 260**           |
| `beta`    | 20 + 40     | **200**     | 20 → **25**                | 40 → **200**              |

Dans **chaque** dimension le client est ≥ à ce qu'il avait, et exactement à
l'équivalent s'il garde son mix habituel (15 × 8 + 20 = 140, pile le pool).
Le poids 8 est volontairement **sous** le rapport réel 8,125 : l'arrondi joue en
faveur du client. **Aucun grandfathering n'est nécessaire pour la conversion
elle-même.**

**La seule chose qui change de nature** — et qu'il faut dire honnêtement dans la
communication : aujourd'hui les 15 analyses de Starter sont **réservées**
(impossible de les perdre en enrichissant) ; demain elles sont **finançables par
le même pool**. Un client qui brûle son pool en enrichissements ne pourra plus
faire ses 15 analyses. Le total est préservé, la **garantie plancher** disparaît.
C'est le prix de la fongibilité — c'est ce qui est demandé, mais ça se dit.

> Client existant à protéger : je **n'ai pas pu** énumérer les abonnés réels (base
> locale vide, cf. §5). Avant bascule : compter les lignes `subscriptions` en
> plan payant et vérifier qu'aucune n'a un `accounts_limit`/`enrichment_credits`
> personnalisé par un grant admin (`admin-users.service.ts:251-252` permet de
> dévier du catalogue) — ces lignes-là doivent être converties depuis **leurs**
> valeurs, pas depuis celles du palier.

### 8.3 Toutes les surfaces à migrer (checklist)

Une seule d'entre elles laissée en arrière et on retombe sur le bug qu'on tue :
deux chiffres qui se contredisent. **A** = compteur analyses, **E** = compteur
enrichissements.

#### API — enforcement (`apps/api`)

| Surface              | `file:line`                                                               | Lit                              | Devient                                                                          |
| -------------------- | ------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| Débit analyse        | `credits.service.ts:896` `consumeAnalysisSlot`                            | A                                | `consumeCredits(cost=8)`                                                         |
| Débit enrichissement | `credits.service.ts:833` `consumeEnrichmentCredit`                        | E                                | `consumeCredits(cost=1)`                                                         |
| Remboursements       | `credits.service.ts:1038` / `:1080`                                       | A / E                            | un seul `refundCredits(cost)`                                                    |
| Grille de coûts      | `credits.service.ts:90-109` `CREDIT_COSTS`                                | les deux                         | grille unique §7                                                                 |
| Pré-check UI         | `credits.service.ts:876` `hasEnrichmentCredit`                            | E                                | `hasCredits(cost)`                                                               |
| Garde essai          | `credits.service.ts:158` `TRIAL_ACTIVE_SQL`                               | —                                | inchangé                                                                         |
| Réponse `/credits`   | `credits.service.ts:699-748` `getCredits`                                 | les deux                         | + `credit_units`, `credit_units_limit` (garder A/E une release)                  |
| Reset mensuel        | `credits.service.ts:766-806`                                              | les deux                         | une boucle, cf. §8.4                                                             |
| Alerte solde bas     | `credits.service.ts:993-1031` `maybeNotifyCreditLow`                      | les deux                         | **un seul** message (aujourd'hui 2 textes distincts, `:1015-1018`) — **FR + EN** |
| Description Stripe   | `credits.service.ts:345`                                                  | les deux                         | « N crédits/mois »                                                               |
| Packs de recharge    | `credits.service.ts:193-200` `TOPUP_PACKS`                                | les deux                         | échelle unique (ids Stripe **inchangés**)                                        |
| Catalogue paliers    | `plan-catalog.defaults.ts:86-146`                                         | les deux                         | + `credit_units` par palier                                                      |
| Grant admin          | `admin/dto/grant-credits.dto.ts:10-19` + `admin-users.service.ts:228-253` | 2 champs `accounts`/`enrichment` | **1 champ** `credits` ⚠️ lire aussi §8.3-bis                                     |
| Quota MCP (analyse)  | `mcp-api.controller.ts:145-161`                                           | A                                | devis `cost: { credits: 8 }`                                                     |
| Quota MCP (enrich)   | `mcp-api.controller.ts:264-276`                                           | E                                | devis `cost: { credits: 1 }`                                                     |
| Add-on siège         | `credits.service.ts:335-336`, `EXTRA_SEAT_PRICE_CENTS:67`                 | —                                | **inchangé** (un siège ajoute un utilisateur, pas du quota)                      |

#### Contrat partagé (`packages/contracts`) — à faire **en premier**

| Surface                                                                      | `file:line`                     | Lit      |
| ---------------------------------------------------------------------------- | ------------------------------- | -------- |
| **Schéma zod `credits`** (source de vérité inter-apps)                       | `src/schemas/credits.ts:16-18`  | les deux |
| Note de contrat analyse/refresh                                              | `src/schemas/analysis.ts:104`   | les deux |
| Types Supabase générés                                                       | `src/database.types.ts:349-376` | les deux |
| ⚠️ RPC legacy `check_and_increment_accounts_used`, `increment_accounts_used` | `src/database.types.ts:394,402` | A        |

> Les 2 RPC ci-dessus n'ont **aucun appelant** dans le monorepo (vérifié) : ce sont
> des fonctions DB héritées d'avant l'enforcement NestJS. Si elles existent encore
> dans Supabase et sont exposées par PostgREST, elles constituent un chemin
> d'incrément parallèle non audité (pas de ligne ledger). **À supprimer côté base
> pendant la migration.**

#### Web (`apps/web`)

| Surface                                                            | `file:line`                                                                                                                                                   | Lit                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **Pill sidebar « N crédits »**                                     | `features/billing/components/CreditsBadge.tsx:58-63` (+ popover `:36-42`), monté par `components/sidebar/SidebarFooterActions.tsx:3,16`                       | A (affiché) + E (caché) |
| Type + défauts du hook                                             | `features/billing/hooks/useCredits.ts:5-29` et `features/credits/hooks/useCredits.ts:9-11` (⚠️ **deux** hooks dupliqués, défauts divergents 0 vs 75)          | les deux                |
| Contrat API client                                                 | `features/credits/api.ts:7-9`                                                                                                                                 | les deux                |
| Donut + libellés de quota                                          | `features/billing/model/billing-view-model.ts:70-74`, `:93-98` (mélange cap **appliqué** + quota **catalogue**), `:103-105`                                   | A (+E)                  |
| Cartes billing                                                     | `dashboard/CreditsCard.tsx:20-38`, `dashboard/CreditRing.tsx:11-13,60-64`, `dashboard/CreditLedgerCard.tsx:15,20`, `CurrentPlanCard.tsx:11-12,29-31,62,72-75` | les deux                |
| Grille de plans / picker sièges                                    | `PlansGrid.tsx:26-32`, `PlanPickerDialog.tsx:9-12,44,64-88`                                                                                                   | A (catalogue)           |
| Catalogue front                                                    | `lib/plans.ts:10-11,40-43,58-59,92-95`                                                                                                                        | les deux                |
| Barre de recherche (reste à analyser)                              | `features/search/view/Search.tsx:299-300`                                                                                                                     | A                       |
| Bouton « Enrichir » (contact)                                      | `features/contacts/.../ContactHeader.tsx:78-79`                                                                                                               | E                       |
| Onglet Contacts + parcours prioritaire                             | `.../TabContacts.tsx:48-50`, `.../PriorityPathSection.tsx:23,33,94,143,152,200`, `ContactChannelMenu.tsx`, `ContactEngagementTrigger.tsx`                     | E                       |
| **Sentinelle « illimité » `999_999`**                              | `CreditsBadge.tsx:60`, `billing-view-model.ts:71`, `CurrentPlanCard.tsx:29`, `PlansGrid.tsx:26` (⚠️ 4 copies en dur)                                          | A                       |
| ⛔ **« illimité » vs « 120 fair use » sur la MÊME carte** (cf. §0) | `billing-view-model.ts:93-94` vs `:99` ← `plans.ts:126` — contredit la décision produit écrite en `plans.ts:119-120`                                          | A                       |

**i18n web — 13 fichiers concernés, pas seulement `billing.json`** (`src/i18n/locales/{fr,en}`) :

| Fichier                                                                                                 | Clés                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `billing.json`                                                                                          | `:19` enrichmentCredits · `:22-23` `∞ crédits` / `{{count}} crédits` · `:47` remainingAnalyses · `:95-97` analysesPerMonth / enrichments · `:102` « crédits mutualisés » · `:117-123` carte crédits (**`infoText` : « 1 analyse consomme 1 crédit »**) · `:139-140` recharge · `:154-164` libellés ledger · `:177-182` planDescription |
| `search.json`                                                                                           | `:24-26` « 1 crédit sera consommé », « {{count}} crédits d'analyse restants »                                                                                                                                                                                                                                                          |
| `contacts.json`                                                                                         | `:197` insufficient_credits · `:220` · `:344-362` coût/confirmation/toasts                                                                                                                                                                                                                                                             |
| `accounts.json`                                                                                         | `:178-179` `credits_one/other` · `:299-300` creditsExhausted                                                                                                                                                                                                                                                                           |
| `engagement.json`                                                                                       | `:92,99` noCredits / « Réessayer quand même (1 crédit) »                                                                                                                                                                                                                                                                               |
| `actions.json`                                                                                          | `:5,128,131` enrichCreditHint                                                                                                                                                                                                                                                                                                          |
| `discover.json`                                                                                         | `:2,118-119` « Explorer ne consomme aucun crédit », « 1 crédit »                                                                                                                                                                                                                                                                       |
| `needs.json`                                                                                            | `:63-65` « Enrichir les besoins · 1 crédit »                                                                                                                                                                                                                                                                                           |
| `dashboard.json`                                                                                        | `:227` « n'utilise aucun crédit d'analyse »                                                                                                                                                                                                                                                                                            |
| `accountDetail.json` `:313` · `settings.json` `:73-74` · `common.json` `:131` · `activityLog.json` `:4` | divers                                                                                                                                                                                                                                                                                                                                 |

#### Backoffice DM (`apps/dashboard-manager`)

| Surface                                   | `file:line`                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Éditeur de paliers (2 champs quota)       | `app/facturation/_components/plans-editor.tsx:18-19,28-29,55-56,62,150-151,160-161`             |
| Route API paliers                         | `app/api/admin/plans/[key]/route.ts:12` (`NUMERIC_FIELDS`)                                      |
| **Grant / ajustement crédits** (2 champs) | `app/users/[userId]/_components/grant-credits.tsx:29-83`                                        |
| Fiche user « Offre & crédits »            | `app/users/[userId]/page.tsx:64-66`, `:74` (A) et `:77` (E)                                     |
| Annuaire clients (colonne quota)          | `app/clients/_components/users-directory.tsx:101`                                               |
| Sélecteur de plan (re-sync du cap)        | `app/users/_components/plan-select.tsx:14-15` + `app/api/admin/users/[userId]/plan/route.ts:10` |
| Panneau équipes « crédits consommés »     | `app/clients/_components/teams-panel.tsx:101-102,146,174`                                       |
| Types admin                               | `lib/admin.ts:22,88-89,102-103`                                                                 |

#### Site marketing (`apps/website`) — ⚠️ chaînes statiques

| Surface                                      | `file:line`                                               |
| -------------------------------------------- | --------------------------------------------------------- |
| Quotas des 3 cartes                          | `messages/{fr,en,de,nl}/pricing.json:30-31, 46-47, 62-64` |
| **Tableau « Crédits »** (faux, cf. §8.1.b)   | `messages/{fr,en,de,nl}/pricing.json:71-98`               |
| FAQ « qu'est-ce qui consomme des crédits ? » | `messages/*/pricing.json:112-113`                         |
| FAQ « différence entre les offres »          | `messages/*/pricing.json:121`                             |
| Home                                         | `messages/{fr,en,de,nl}/home.json`                        |
| Prix live (aucun changement)                 | `src/features/pricing/live-prices.ts:74-110`              |

⚠️ **4 locales** sur le site (`fr`, `en`, `de`, `nl`), pas 2.

#### Serveur MCP (`apps/mcp`)

| Surface                     | `file:line`                                |
| --------------------------- | ------------------------------------------ |
| Chaînes de quota côté proxy | `src/api-client.ts:59`, `src/tools.ts:111` |

#### 8.3-bis — pièges repérés en chemin

1. **Les deux compteurs n'ont pas la même FORME.** Les analyses sont un
   _compteur vs plafond_ (`accounts_used` / `accounts_limit`) ; les
   enrichissements un _solde nu_, **sans colonne `used`**. D'où le cas particulier
   de `maybeNotifyCreditLow` (`credits.service.ts:1000-1003`), qui doit comparer
   le solde au quota du **catalogue** faute de plafond stocké. Le pool unifié
   supprime cette asymétrie — c'est un gain, pas seulement un déplacement.
2. **Les recharges gonflent le PLAFOND, pas le compteur**
   (`credits.service.ts:594-595`) : `accounts_limit` diverge donc du nominal du
   palier. C'est pour ça que `billing-view-model.ts:64-70` porte un commentaire
   explicite « lire la valeur appliquée, pas le catalogue ». La colonne
   `credit_units_topup` (§8.4) supprime cette divergence.
3. **Deux hooks `useCredits` coexistent** (`features/billing/hooks/useCredits.ts`
   et `features/credits/hooks/useCredits.ts`) avec des défauts **divergents**
   (`enrichment_credits` = 0 ici, 75 là) : les deux s'affichent pendant le
   chargement. Deux sources de vérité front = exactement la divergence qu'on veut
   tuer → **fusionner AVANT la bascule**.
4. **Le grant admin n'est pas atomique** : `findOne` puis `save`
   (`admin-users.service.ts:240-253`) — read-modify-write, contrairement au chemin
   de consommation correctement gardé en SQL. Deux grants concurrents peuvent en
   perdre un. Impact faible (opérateur, rare), mais autant le passer en `UPDATE`
   gardé pendant la refonte.
5. **Chaînes FR en dur côté serveur** (hors i18n, donc invisibles pour un client
   EN) : `credits.service.ts:1017-1021`, `analysis-refresh.service.ts:86`,
   `mcp-api.controller.ts:149`, `pricing.ts:9`, `grant-credits.dto.ts:17`,
   `apps/mcp/src/api-client.ts:59`, `tools.ts:111`. La bascule réécrit ces
   messages : c'est l'occasion de les passer en **FR + EN**.
6. **Aucun email ne mentionne les crédits** (vérifié sur `packages/email`) :
   l'alerte `credit_low` est **in-app uniquement**. Rien à migrer côté mailing —
   mais c'est peut-être un manque produit à part entière.

### 8.4 Migration technique

**Le ledger existe déjà** (`credit_ledger`, migration `1784900500000`) — c'est la
bonne nouvelle : la question « pourquoi ai-je été débité ? » restera répondable
pendant et après la bascule. Rien à créer, juste à étendre (`resource` passe de
`analysis_slot`/`enrichment_credit` à `credit_unit`, en gardant les anciennes
valeurs pour l'historique).

Une traduction **à la lecture seule est à exclure** : afficher un pool unique de
140 alors que l'enforcement reste sur deux colonnes séparées promettrait une
fongibilité inexistante — l'utilisateur verrait « 140 crédits » et serait bloqué
à 15 analyses. Il faut donc un vrai pool.

**Schéma cible** (`subscriptions`, `subscription.entity.ts`) — deux colonnes, pas
une, pour préserver les deux sémantiques de reset actuelles :

| Colonne              | Rôle                      | Reset mensuel                                                                        |
| -------------------- | ------------------------- | ------------------------------------------------------------------------------------ |
| `credit_units`       | pool du palier            | remis à `plan_units` (use-it-or-lose-it, sémantique actuelle des analyses)           |
| `credit_units_topup` | packs de recharge achetés | **jamais** remis à zéro (sémantique actuelle du `GREATEST` sur `enrichment_credits`) |

Le débit consomme `credit_units` d'abord, `credit_units_topup` ensuite.

**Étapes** :

1. **Migration additive** : ajouter les 2 colonnes + backfill
   `credit_units = (accounts_limit − accounts_used) × 8 + enrichment_credits`,
   `credit_units_topup = 0`. Les anciennes colonnes sont **conservées** (lecture
   seule) pendant au moins une release → rollback possible sans perte.
2. **Enforcement** : un seul `UPDATE` gardé
   `SET credit_units = credit_units − :cost WHERE user_id = :owner AND credit_units >= :cost AND <TRIAL_ACTIVE_SQL>`.
   C'est **exactement** le patron déjà éprouvé de `consumeEnrichmentCredit`
   (`credits.service.ts:845-853`) — atomicité et race-safety conservées gratuitement.
3. **`CREDIT_COSTS`** (`credits.service.ts:90-109`) devient la grille unique de la
   §7. Le mécanisme de coût paramétrable est **déjà câblé et testé** (`resolveAnalysisCost`,
   `resolveEnrichmentCost`) : il n'a jamais servi qu'à écrire `1` partout.
4. **Reset mensuel** (`resetElapsedMonthlyQuotas`, `credits.service.ts:766-806`) :
   une seule boucle, `credit_units = plan_units`, `credit_units_topup` intact.
5. **Top-ups** (`TOPUP_PACKS`, `credits.service.ts:193-200`) : les 6 packs
   (3 analyses + 3 enrichissements) fusionnent en une échelle unique de crédits.
   Conversion des packs existants au même poids 8 :
   `analysis_5` → 40 crédits (19 €), `analysis_20` → 160 (59 €),
   `analysis_50` → 400 (119 €), `enrich_25` → 25 (9 €), `enrich_100` → 100 (29 €),
   `enrich_300` → 300 (69 €). ⚠️ Les `id` sont **stables et portés dans les
   metadata Stripe** : ne pas les renommer, seulement les re-libeller.
6. **Quota en vol au milieu du mois** : la conversion étant faite sur le _restant_
   (`limit − used`), un abonné à mi-cycle garde exactement son reste. Aucune
   remise à zéro, aucun cadeau, aucun manque. Faire la migration **dans une
   transaction** et journaliser une ligne ledger `kind: 'migration'` par ligne
   convertie — pour que le solde d'après soit traçable jusqu'au solde d'avant.
7. **Stripe** : **aucun produit ni prix à toucher**. Les montants (119/259/599 €)
   et l'add-on siège (29 €) sont inchangés — seule la _description_ de la ligne
   change (`credits.service.ts:345`, aujourd'hui
   « `{accounts_limit}` analyses/mois, `{enrichment_credits}` enrichissements »).
   C'est ce qui rend la bascule peu risquée côté facturation : on ne change pas ce
   qui est payé, seulement la façon de compter ce qui est consommé.

### 8.5 Séquencement

| Lot   | Contenu                                                                                                                                                                                             | Risque                                        |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **0** | ✅ **D2** — remboursement des runs fantômes (livré ici)                                                                                                                                             | nul                                           |
| **1** | **D1** — les 4 boutons gratuits débitent (prérequis absolu : unifier sur une métrologie contournable ne ferait qu'afficher un faux chiffre avec plus d'aplomb) + **D5** (`account_id` sur le débit) | moyen — change ce que paient les users        |
| **2** | **Trancher §8.1.b** : le site s'aligne sur le code, ou l'inverse                                                                                                                                    | décision produit                              |
| **3** | Instrumenter le coût réel par phase (`_api_metrics`) → figer les poids 🟠/🔴                                                                                                                        | faible                                        |
| **4** | Migration schéma + enforcement unifié + reset + top-ups (§8.4)                                                                                                                                      | élevé — transaction + ledger + rollback prêts |
| **5** | Surfaces d'affichage (§8.3) : app, DM, checkout, site, i18n **FR + EN**                                                                                                                             | faible                                        |
| **6** | **D3 / D6** — symétriser reprise et annulations                                                                                                                                                     | faible                                        |
| **7** | **D4** — écrire noir sur blanc ce qui est « inclus » + rate-limits                                                                                                                                  | faible                                        |

**Règle i18n** : toute nouvelle chaîne visible (libellé du compteur, coût par
bouton, message « crédits épuisés ») est livrée **FR + EN** — et le site a aussi
un catalogue **NL** à ne pas oublier (`apps/website/messages/nl/pricing.json`).

**Changelog** : la bascule est une nouveauté user-facing majeure → une entrée
« Nouveautés » FR + EN dans `changelog-entries.ts`.

---

## 9. Tests

Suite API **après merge de `origin/main`** (#627 jobs orphelins, #628 source
health) : **2335 tests / 193 suites, 0 échec** (`npx jest` dans `apps/api`).
`salesforce.client.spec.ts` est passé sans souci ici, contrairement au baseline
annoncé. Les suites web et IA ne sont pas touchées par ce correctif (aucun fichier
modifié dans `apps/web` ni `apps/ia`).

Tests ajoutés (écrits avant le code) :

| Fichier                         | Couvre                                                                                                                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stuck-analysis.reaper.spec.ts` | remboursement au fauchage ; **pas** de remboursement si réconcilié `completed` ; pas si la transition est perdue ; un seul par compte sur un lot ; un échec de remboursement n'interrompt pas le balayage                    |
| `stuck-analysis.reaper.spec.ts` | **composition #627** : remboursement d'un run dont le worker est mort en tenant le job (`processedOn` au-delà du plafond) ; pas de remboursement si le dossier orphelin est complet, ni si le run est encore dans son budget |
| `analysis.service.spec.ts`      | réparation à la lecture : rembourse si la transition est gagnée, pas sinon                                                                                                                                                   |
| `analysis.service.spec.ts`      | **4ᵉ sortie (#627)** : la relance rembourse le run mort qu'elle répare au lieu de double-facturer ; et ne rembourse pas si un autre chemin a déjà gagné la transition                                                        |
