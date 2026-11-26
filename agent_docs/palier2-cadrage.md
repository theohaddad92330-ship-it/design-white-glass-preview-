# BellumAI — Palier 2 (cadrage produit)

Source : retour Matteo sur le run **Société Générale** partagé le 2026-07-03.
Suite de [`v1-vendable-cadrage.md`](./v1-vendable-cadrage.md). Ce fichier est la
référence in-repo du Palier 2. Fait à partir d'un scan complet du code réel
(pas d'aspirationnel) — chaque chantier cite les fichiers.

## Thèse

> **Palier 1 = produire une analyse riche. Palier 2 = transformer cette richesse
> en cockpit commercial intelligent.** Le produit ne doit plus seulement _dire_,
> il doit _piloter_ : recommander en fonction du profil, cloisonner le bruit,
> distinguer fait/hypothèse, et se laisser re-piloter par étapes.

Retour Matteo, verbatim résumé : « on tient quelque chose », mais le sujet
n'est plus la richesse — c'est l'intelligence produit : _pourquoi ce contact,
pourquoi cette entité, pourquoi cet angle, vu MON profil._

## Le constat qui reclasse la moitié du retour

**Le profil utilisateur n'est PAS branché dans le flux normal.** `profile_data`
arrive **vide** : le web ne l'envoie pas (`apps/web/src/features/search/hooks/useAnalysis.ts:48-51`
n'envoie que `{company_name, user_context}`), l'API forward `dto.profile_data ?? {}`
(`apps/api/src/modules/analysis/analysis.service.ts:206`) et le resume hardcode
`profileData: {}` (`analysis.service.ts:269`). Les prompts stratégie/plan sont
**construits pour** consommer le profil (`offers`, `references`, `geoZone`, `size`,
`personas`… — `bellum_strategy.py:14-25`, `bellum_plan.py:9-17`) mais reçoivent
`N/A` partout. Le `ProfileContext` riche (`profiler.py`) n'est lu que par l'UI
d'onboarding, jamais par l'analyse.

→ **C'est la vraie cause de « la stratégie latérale via l'Afrique n'a aucun sens ».**
Pas les system prompts. Sans profil, le LLM génère la stratégie sur la cible
seule, sans contrainte « Théo vend data/cloud en France, pas d'ops Afrique ».
Brancher le profil (C1) **tue l'Afrique** ET débloque le « je te conseille Mehdi
_parce que ton profil est data/cloud_ » (l'explication de reco, C1 point 7 Matteo).

## Déjà là — NE PAS reconstruire

| Demande Matteo                          | État code                                                                                                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Beaucoup de contacts (pas 5-10)         | ✅ Collecte **non capée** — Apollo 50 pages × 100 (`apollo.py:331-342`). `CONTACTS_ENRICH_MAX=30` (`classification.py:56`) cape **seulement la passe LLM**, pas la collecte |
| L'user choisit qui enrichir email/tél   | ✅ `POST /contacts/:id/enrich` par contact, credit-gated (`contacts.controller.ts:63`, `contacts.service.ts:206-277`). Manque juste l'UI (track Matteo)                     |
| Distinguer source/signal/hypothèse/reco | ✅ 5 statuts de vérité shippés (`truth_status.py`). ⚠️ badge **par bloc**, pas par valeur (cf. C3)                                                                          |
| Juge qualité déterministe               | ✅ `quality_judge.py` → `plan.quality` (à étendre, cf. C3)                                                                                                                  |
| « Why this contact/entité/angle »       | 🟡 Déjà généré (`why_contact`, `why_first`, `prioritySubAccounts[].why`) mais **non ancré profil** → débloqué par C1                                                        |
| Zones influence × accessibilité         | ✅ `prioritization.py` (4 zones deck, `accessibility_band`, `zone`)                                                                                                         |
| Harness d'éval golden-set               | ✅ `apps/ia/evals/` — réutiliser pour valider chaque chantier                                                                                                               |

**SalesQL : pas intégré** (Apollo = seul provider email/tél). Matteo l'a cité
comme logique — mais Apollo la couvre déjà. **Défer** sauf preuve d'insuffisance.

---

## Chantiers Palier 2

### C1 — Brancher le profil (le profil pilote la stratégie)

**Constat Matteo.** « Vu ton profil, je recommande cet angle » — pas « la
meilleure stratégie SG est l'Afrique ». Le user profile doit piloter la stratégie
ET l'explication (« je NE te conseille PAS le board parce que non actionnable pour
une ESN en première approche »).

**État code.** Prompts prêts à consommer le profil, mais profil vide en runtime
(cf. constat ci-dessus). Deux systèmes profil déconnectés : `profile_data` (lu par
les prompts) et `ProfileContext` (riche, UI-only). Mismatch de noms entre le
questionnaire stocké `EsnAnswers` et la shape `profile_data` attendue
(`expertise_areas`≠`offers`, `decision_maker_personas`≠`personas`,
`avg_sales_cycle`≠`avgTJM` ; `references`/`avgTJM`/`offers` sans champ source).

**À faire.**

1. Web envoie le profil au start-analysis (`useAnalysis.ts`).
2. API forward le vrai profil + resume le recharge (ne plus hardcoder `{}`).
3. Mapper `esn_profiles`/`EsnAnswers` → `profile_data` (couche de traduction des
   noms de champs), source unique de vérité.
4. L'explication de reco (contacts/entités/angles) référence explicitement le
   profil : « parce que ton offre = data/cloud, que SGABS ressort accessible… ».

**Décisions à trancher (Théo/Matteo).**

- Champs profil **minimum obligatoires** pour un run (offers ? geoZone ? references ?).
- Un run **sans profil** = autorisé (afficher « analyse profil-neutre ») ou bloqué ?

---

### C2 — Gate entité (pas de play complet sur le bruit)

**Constat Matteo.** « Le plus gros pépin » avec l'Afrique. SGTM, les moulins du
Togo, Bouterfas, les entités BTP/travaux ne doivent PAS recevoir un play commercial
complet. On les garde comme **bruit détecté / hors scope**, classés et expliqués,
mais sans le même traitement qu'une vraie entité IT ou bancaire.

**État code.** Aucun gate entité. Prouvé par le fixture SG
(`packages/shared/schemas/__fixtures__/real-run-sg.raw.json`) : **SGTM (BTP/travaux)
reçoit contacts + angles + plan 30/60/90 + messages prêts** (« La SGTM opère dans un
secteur BTP/travaux… », l.321). Détails :

- Filtre bruit = **nom-only** (`entities.py` — SCI/GIE/holding/immobilier).
- NAF ne fait qu'**upgrader** vers IT, ne **démote/exclut jamais** (`insee_sirene.py:200`).
- Labels binaires `operating`/`noise` uniquement — pas de `hors-scope`/`homonyme`/
  `hors-secteur`/`faux-positif` pour les entités (ces concepts n'existent que pour
  les _contacts_).
- **Deux pipelines disjoints** : le filtre Pappers déterministe → `meaningfulSubsidiaries`
  (72 pour SG), mais les plays tournent sur le `entitiesExhaustive` du LLM (~8) +
  une seule recherche Apollo groupe → le filtre bruit n'affecte quasi pas les plays shippés.

**À faire.**

1. Étendre la classification entité : `hors-scope` / `homonyme` / `hors-secteur` /
   `faux-positif` (+ `relevanceReason`).
2. Exclusion par NAF/secteur (BTP 41-43, véhicules financiers hors banque-cible),
   pas seulement upgrade IT.
3. **Gate** : seules les entités pertinentes déclenchent contacts + angles + plan +
   messages. Bruit/hors-scope = **gardé, classé, expliqué, PAS de play**.
4. Réconcilier les 2 pipelines : le play doit consommer les entités filtrées, pas
   le `entitiesExhaustive` LLM libre.

**Décisions à trancher (Théo).**

- Quels NAF = **cœur cible ESN** ? (62.0x/63.11 IT évident ; 64.19 banque = cible
  métier oui/non ?)
- Seuil de pertinence pour **débloquer** un play complet.

---

### C3 — Garde-fous factualité (dirigeants, dates, RH, budget, gouvernance)

**Constat Matteo.** Oudéa parti en 2023 traité comme dirigeant actuel. « 900 postes
IT » trop spécifique si la source parle seulement de suppressions de postes au siège.
Aucun fait RH/budget/gouvernance/dirigeant ne doit servir d'accroche commerciale
si la source ne le confirme pas **précisément et récemment**.

**État code (trous nets).**

- **Aucun garde-fou récence dirigeant.** Le modèle `Executive`
  (`pappers/models.py:40-56`) n'a ni début ni fin de mandat, ni flag actuel/ancien.
  Un nom d'exec issu d'une page scrapée périmée (`bellum_signals.py peopleMentioned`)
  n'est jamais cross-checké contre le registre.
- **Quality Judge trop étroit.** Le check `hallucination` ne couvre que 5 champs
  firmo (`siren/revenue/employees/headquarters/sector` — `quality_judge.py:24`).
  Un dirigeant périmé, un chiffre RH, un montant budget passent.
- **`data_freshness` auto-déclaré par le LLM**, jamais comparé à la date réelle
  (`bellum_facts.py:112-116`, `confidence.py:62-67`). Aucune arithmétique de date vs 2026.
- **Zéro garde précision numérique** — rien ne cape « 900 postes IT ».

**À faire.**

1. Récence dirigeant : cross-check `Executive` vs registre Pappers `representants`
   (snapshot actuel) ; nom absent du registre → `à vérifier / possiblement ancien`,
   **interdit comme accroche**.
2. Étendre Quality Judge aux exécs / RH / budget / gouvernance.
3. Freshness = arithmétique de date vs _aujourd'hui_ ; claim > seuil mois sans
   re-source → dégradé en signal/hypothèse.
4. Garde précision numérique : pas de chiffre précis sans citation exacte, sinon
   dégrader (« suppressions de postes, ampleur non chiffrée »).

**Décisions à trancher (Théo).** Seuils : dirigeant valide si mandat < X ? actu
< X mois ? Ce sont des **règles métier** à donner.

---

### C4 — Séparer les scores (5 scores cloisonnés)

**Constat Matteo.** Priorité 5/10, PRUDENT 16/25, confiance 95/100, contact 73/100
se mélangent → l'user ne comprend pas « 95/100 » quand il reste des sources
partielles, des contacts old, des hypothèses. Séparer : **score commercial compte ·
confiance données · pertinence contact · accessibilité · priorité action.**

**État code (bordel confirmé).** **8 notions** de score. **3 scores compte
contradictoires** (`/25` `account_score.py`, `1-10` `priorityScore`, `/10` `scorer.py`)
écrivant **la même colonne** `accounts.priority_score`, avec **3 vocabulaires
verdict** (GO/PRUDENT/STOP vs GO/NO-GO vs GO/PRUDENT/NO-GO). **2 scores contact**
par contact (`/100` `computeContactScore` + `1-5` LLM). Échelles incohérentes :
`/25`, `1-10`, `/10`, `/100`×2, `1-5`, `P1/P2/P3`, `A/B/C`, `high/med/low`.

**À faire.** Cinq scores nommés, cloisonnés, chacun une échelle unique + un label :

| Score Matteo       | Source à garder                        | Action                                                                  |
| ------------------ | -------------------------------------- | ----------------------------------------------------------------------- |
| Commercial compte  | `account_score.py` /25 GO/PRUDENT/STOP | **1 seul** — tuer `priorityScore` 1-10 + `scorer` /10, unifier le vocab |
| Confiance données  | `confidence.py` /100                   | Déjà propre — garder tel quel                                           |
| Pertinence contact | role_power + seniority                 | **Extraire** du /100 actuel                                             |
| Accessibilité      | zone entité + accessibilité contact    | **Standalone** — aujourd'hui noyé dans le /100                          |
| Priorité action    | dérivée (pas LLM brut)                 | 1 échelle, calculée à partir des 4 autres                               |

Fix aussi le doc drift `verdict_for_score` (docstring 12-18/≤11 vs constantes réelles 10-18/≤9).

**Décisions à trancher (Théo).** Garder `/25` ou tout passer en `/100` ? Les grilles
`/25` et `/100` sont déjà flaggées « propositions à valider par Théo »
(`v1-vendable-cadrage.md:90-92`) — Palier 2 doit les **figer**.

---

### C5 — Statuts contact + base contacts structurée

**Constat Matteo.** Pas « moins de contacts » : **beaucoup de contacts, mais avec
statut clair** — priorité immédiate / à enrichir / à vérifier / hors scope / bruit /
faux positif / autre angle d'attaque. Tous gardés, avec source, score, entité, rôle,
niveau de confiance, enrichissement disponible.

**État code.** Collecte non capée ✅, enrichir on-demand par contact ✅. Mais la taxo
demandée n'existe pas : seuls `a_verifier` + `bruit` existent (dans le `bucket`
auto — `contacts.py:22-54`), + un axe séparé `user_status` CRM (new/contacted/…).
Manquent : `priorité immédiate`, `à enrichir`, `hors scope` (aujourd'hui fondu dans
`bruit`), `faux positif`, `autre angle`.

**À faire.**

1. Nouvel enum **statut qualif** (7 valeurs Matteo), assigné déterministe.
2. Flag « enrichissement disponible » (email/tél manquant → enrichable, réutilise
   l'endpoint on-demand existant).
3. Exposer par contact : source + score (C4) + entité de rattachement + rôle +
   confiance (données déjà présentes, à surfacer).

**Décisions à trancher (Théo).** Définitions exactes des 7 statuts + règles
d'assignation déterministe (ex. quand « à enrichir » vs « à vérifier »).

---

### C6 — Re-run partiel scopé + changer de stratégie

**Constat Matteo (priorité #1).** Relancer **une seule brique** — cyber, ITIM,
Boursorama, SG France, achats IT, ou « les gens qui font du marketing » — sans
refaire toute l'analyse. Scope par persona / secteur / entité / géographie / rôle.
Plus : logique « changer de stratégie ». Plus : bouton « chercher plus de contacts
similaires ».

**État code (~40 % là).**

- ✅ Les phases sont **invocables isolément** : `AnalysisOnDemandService`
  (`analysis-ondemand.service.ts`) fait déjà des re-run P1/P2/P3 whole-phase
  (`enrich-contacts`, `enrich-organigram`, `refresh`) ; les sorties de phase sont
  persistées et rechargeables (`loadResearch`, `loadContactsForResume`).
- ❌ **Aucun param de scope** nulle part (persona/secteur/entité/géo/rôle) sur les
  requêtes analyze/enrich (`ContactsRequest`, `GraphAnalyzeRequest`, `StartAnalysisDto`).
- ❌ Apollo scopé **titres-only** — pas de `person_locations` (géo), pas de secteur,
  pas de séniorité passés (`apollo.py:383-384`).
- ❌ Re-run on-demand **écrase** (`saveContacts` bulkInsert dédupe par nom) au lieu
  de **merger par scope**.
- ❌ Pas d'endpoint regen **P4/plan** ni « re-run angle X » (les angles sont
  write-once depuis la research). `RetryContext.newAngle` existe mais seulement sur
  un **run frais** (steer P4 ; en P1 il n'entre que comme DATA fencée).

**À faire.**

1. Param **scope** (persona/secteur/entité/géo/rôle) sur `ContactsRequest`/
   `ClassifyRequest` + DTO NestJS.
2. Threader `person_locations` / secteur / séniorité dans `search_people`.
3. On-demand **merge-par-scope** : garder le reste, ajouter/remplacer seulement le
   segment ciblé (pas d'écrasement global).
4. Endpoint **« changer d'angle / regénérer le plan »** (P4).
5. Bouton **« plus de contacts similaires »** (re-run scopé sur le persona courant).

**Décisions à trancher (avec Matteo — UX).** Modèle de merge (append vs
replace-in-scope) ; comment l'UI expose les briques re-lançables.

---

## Transverse

- **Firecrawl.** Matteo a vu 3 pages. Défaut code = `FIRECRAWL_MAX_PAGES=7`
  (`research/firecrawl.py:194`) → l'env de prod est bridé à 3. **Bump quick** (1 réglage).
- **Affichage (track Matteo).** Collecte large → vue par défaut intelligente →
  filtres → enrichissements → boutons « chercher plus de contacts similaires » /
  « relancer un angle ». Côté IA/API : C5 (statuts) + C6 (re-run) fournissent la
  donnée ; le rendu est chez Matteo.

## Séquence

| Vague      | Chantiers                            | Ce que ça tue                                                                      |
| ---------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| **1**      | C1 profil branché + C2 gate entité   | L'Afrique **et** les plays sur SGTM/moulins — les 2 « plus gros pépins » de Matteo |
| **2**      | C4 séparer scores + C3 factualité    | Le « 95/100 » incompréhensible + Oudéa/« 900 postes »                              |
| **3**      | C5 statuts contact + C6 re-run scopé | Sous-tend le cockpit UX (avec Matteo)                                              |
| **Jour 1** | Firecrawl bump                       | Quick win parallèle                                                                |

## Décisions à trancher (récap pour Théo / Matteo)

1. **C1** — champs profil minimum obligatoires ? run sans profil autorisé ou bloqué ?
2. **C2** — quels NAF = cœur cible ESN ? (64.19 banque cible oui/non) ; seuil pour débloquer un play.
3. **C3** — seuils récence : dirigeant valide si mandat < X ? actu < X mois ? (règles métier).
4. **C4** — figer les grilles `/25` (compte) et `/100` (contact), déjà en attente Théo ; `/25` ou tout `/100` ?
5. **C5** — définitions + règles d'assignation des 7 statuts contact.
6. **C6** — modèle de merge du re-run scopé (avec Matteo, lié à l'affichage).

## Méthode (rappel craft rules)

TDD sur chaque chantier · brancher sur `apps/ia/evals/` (golden SG = deck ref) ·
jamais merge dans main sans tous les tests verts · PR, jamais merge direct.
