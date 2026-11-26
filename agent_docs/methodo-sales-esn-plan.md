# Méthodologie Sales ESN — plan d'exécution (moteur métier)

Source : `BELLUMAI_ANNEXE_METHODOLOGIE_SALES_ESN_2026-07-21.pdf` (31 p, Théo).
Sibling de l'annexe Organigramme (`org-mapping-plan.md`, même batch Théo 21/07) — celle-ci
couvre **toute la motion de vente**, pas seulement le graphe.

> Nommage : pas de « v2/v3 ». Une feature garde son nom et évolue.

## Thèse Théo (p2, p31)

Une ESN ne gagne pas parce qu'elle a le plus de données. Elle gagne parce qu'elle **choisit**
un compte accessible, un angle crédible, un interlocuteur utile, une séquence disciplinée —
**adaptés au profil**. Le produit doit **cesser de proposer la même stratégie à toutes les ESN
et à tous les comptes**. Les règles changent selon : taille/stade ESN, relation, secteur, niveau
de référencement, capacité de delivery.

Réduit à une phrase produit : **un `SalesContext` déterministe = (profil+stade ESN) × (archétype
compte) × (état relation) qui branche score, contacts, actions, plan, messages — chaque reco
citant la règle+le profil+la preuve, le tout verrouillé par golden tests.**

Impl-map imposée (p29) : Déterministe→code/config · Prompt→agent · RAG→chunks cités ·
Objet→tables typées · UI→page/CTA · Golden→tests.

## Reframe — gap analysis code (2026-07-21, 5 audits parallèles)

**~60-70 % des primitives existent.** Mais la personnalisation **déterministe** ne s'appuie
aujourd'hui que sur `offers` (lens domaine + scoring contact) et `size` (3 bandes LLM molles +
un archétype 5-buckets confiné au scorer/weekly). Tout le reste est : hint LLM mou, déclaré-user,
ou champ mort/non câblé. **« Capturé ≠ consommé » est le fil rouge.**

### NE PAS reconstruire (existe et sert)

- Profil ESN server-side threadé (`EsnAnswers`/`esn_profiles` → `esnAnswersToProfileData` →
  `EsnProfileReader.resolveProfileData` → phases IA). `apps/api/src/modules/esn-profile/`, `packages/contracts/src/schemas/onboarding.ts`.
- Lens domaine (IT vs domaine ESN) déterministe — `apps/ia/app/services/domain_focus.py`.
- 3 grilles de score, objets **distincts** (pas concurrentes) : /25 compte `account_score.py`,
  /20 périmètre `perimeter_score.py`, /100 contact `contact_priority_score.py` (+ mirror TS `classified-data.ts`).
- Verdict compte déterministe (somme axes → bande) — `phase4_plan.py:577-610`.
- Labels SORTIE contact (8+2 statuts) déterministes — `computeContactQualifStatus` (`classified-data.ts:530-604`).
- Playbooks sectoriels (9 verticales, chaîne décision/entrée/régul/budget) — `knowledge/sector_playbooks.json`,
  `match_sector`. **Injectés dans le prompt PLAN seulement.**
- Angle rang-2 / incumbent **déterministe** (le mieux couvert) — `esn_presence.py`, `group_relationship.py`,
  `purchasing_thread.py` (DECP titulaires), `IncumbentContext`.
- Objection library, buying committee 8 rôles, business_rules registry — `apps/ia/app/knowledge/`.
- Replan manuel (endpoint + UI) + mémoire de correction — `AnalysisOnDemandService.replan`,
  `account_feedback`, `ReplanDialog.tsx`.
- Cadence dates J+1/3/6/9 (scheduler) — `cadence.service.ts`, `outreach.service.ts` ; opt-out RFC 8058 +
  arrêt-sur-réponse — `mailer.service.ts`, `contacts.service.ts:1233`.
- Chatbot advisor account-aware, groundé, cite les docs KB utilisateur + sources non-consultées — `bellum_advisor.py`.
- Coverage-gaps déterministe (zones blanches contact rankées) — `coverage.service.ts`, `TabCoverage.tsx`.
- Contrat `OrgGraph` (recommendedPath, rejectedItems, L0 board) — `org-graph.ts` (Phase 0 org-mapping ; **pas encore émis**).

### Les vrais trous (par cluster)

**A. Profil & stade ESN (p3-4)**

1. **Stade ESN pas un champ** — dérivé de `consultant_size` via **2 échelles qui divergent**
   (archétype 5-buckets `esn_profiler.py:24-36` utilisé seulement scorer/weekly ; calibration 3-bandes
   `bellum_strategy.py:41-57` dans le dossier). → **une seule source de vérité `esnStage`** à créer.
2. `preferred_entry_mode` (size→mouvement) **calculé mais jamais consommé** (mort).
3. Dimensions **absentes de la capture** : intercontrats/delivery/séniorité, rang1/rang2, marge, TJM,
   canaux GTM/owners, références (clients/cas/consultants passés), outils-comme-input-stratégie.
4. Prompts lisent `personas/avgTJM/salesCycle/references` → **toujours `N/A`** (aucune source).
5. **9 colonnes `esn_profiles` mortes** (`placed_roles`, `decision_maker_personas`, `outreach_channels`,
   `known_competitors`, `available_consultants_band`, `avg_sales_cycle`, `target_accounts_maturity`,
   `social_proof_level`…) — jamais remplies/mappées/consommées. `profile_context`/`bellum_profiler`
   riche **non câblé** au pipeline.

**B. Archétype compte × relation × ouverture (p5-6, p13)** 6. **La matrice (archétype × relation) → mouvement n'existe pas** en logique calculée. C'est la thèse. 7. Archétype compte = **secteur seulement** (9 verticales) → playbook injecté **dans le prompt PLAN uniquement**.
Pas d'archétype **taille/structure** (startup/PME/grand groupe/international). Pas de map NAF→archétype.
Média manquant ; startup/PME absents comme branche compte ; international = `country_packs` (sources+langue,
pas stratégie). 8. **Pas de taxonomie relation niveau-compte** (TABLE B). `commercial_status` = kanban **non branché aux prompts**.
Presets `AnalysisContext` = déclarés-user, hint prompt. Rien ne **détecte** dormant/référé/LinkedIn-accepté. 9. Mouvement d'ouverture = `approachAngle` **3 valeurs** (top/bottom/middle), choisi LLM par accessibilité+taille.
Sandwich/rang2/prospection-inversée/public **pas first-class**. `recommendedPath` (org-graph) **sans champ mouvement**.

**C. Scoring (p14, p25-26)** 10. Compte /25 : axes = `fit_offre/urgence/accessibilite/budget/maturite_esn`. **Concurrence + Capacité
manquants comme axes notés**. **Pas de verdict EXPLORER**. Bande PRUDENT off-by-one (15 vs 14 spec). 11. Contact : le tri **live = `priority` 1-5 assigné par le LLM**, PAS le /100 déterministe. Le boost profil
vendeur est **codé mais mort** (arg `seller` jamais passé sur le chemin live). Preuve = pas un plancher de score
(gate lifecycle seulement). 12. **Garde-fou board/CEO = prompt-only** (profile-aware mais non déterministe). Rien n'empêche par le code de
recommander le board en 1re approche froide pour une petite ESN. La priorité contact vient **~uniquement du
titre de la cible**, pas du SalesContext.

**D. Actions & plan (p7-9, p27-28)** 13. **Pas de bibliothèque d'actions ni de sélecteur 3-5**. `action-router` = **exécuteur** de 5 intents, pas un
chooser. Le plan **déverse ~10-20 actions** (viole la règle MOTEUR « jamais 20 non hiérarchisées »). 14. Plan : horizons **mauvais buckets** (Sem1/M1/M2-3/M3-6/M6-12 ≠ 7/30/60/90). Champs action : **4/7**
(canal/contact/échéance/résultat ✅ ; **owner/raison/feedback ❌**). 15. **Auto-replan (« replanifier après chaque réponse ») absent** (manuel seulement). 16. ~~**Couche zéro CRM/historique absente du plan**~~ — **FAIT** (branche `feat/plan-crm-zero-layer`) :
`CrmReadService.describeAccountHistory` (match RÉEL uniquement) part avec le run → `crm_presence` threadé
jusqu'à `phase1_research` (entrée `has_crm_presence` du SalesContext : un compte connu du CRM n'est plus
« froid ») et `phase4_plan` (bloc `zero_layer_block`, vide sans donnée = prompt byte-identique).
`reverseProspects` ne finit plus à la poubelle : `contacts_node` → état → plan (prompt + `plan.reverseProspects`
persisté) → carte « Prospection inversée » sur l'onglet Plan. Reste hors périmètre : sources couche zéro
autres que CRM (BondManager/ATS/Drive/emails, p8), et la « mémoire » couche zéro (relation/owner/prochaine
revue stockés) qui relève de la Phase 3 « champs owner/raison/feedback ». 17. ~~**Routines par taille d'équipe absentes**~~ — **FAIT** (branche `feat/methodo-rag-and-team-routines`) :
`sales_context.classify_sales_structure` / `sales_structure_from_context` (fondateur seul / 2-4 / 5+, lu du
`salesTeamSize` du questionnaire ou du SalesContext émis — aucun changement de contrat) + `team_routines.py`
(plafond d'actions par horizon dans la borne MOTEUR 3-5, threads simultanés, owner, cadence hebdo bornée à
la fourchette p27). Consommé aux deux endroits qui dimensionnent : `action_recommender` (cap réel des
`nextActions`) et le prompt plan (`team_routines_block`, injecté runtime dans `phase4_plan`). Structure
inconnue (questionnaire non renseigné) ⇒ plafond historique + bloc "" ⇒ prompt byte-identique.
Reste hors périmètre : la routine n'agit pas encore sur la CADENCE des messages (Phase 4).

**E. Messages / chatbot / RAG / BTMMP / delivery (p10-12, p21-22, p29)** 18. **Messages s'arrêtent à M1.** M2/M3 (apport valeur / proposition-si-intérêt) **jamais générés**. Script
téléphone = **ouverture seule** (pas 10s/découverte/sortie). Email J0 seul ; J3/J6/J9 = rappels datés
**réutilisant le même draft** (pas de preuve nouvelle par touche). 19. **Message non personnalisé par état-relation** (froid vs client actif → même ton). `commercial_status` n'atteint
aucun prompt message. 20. ~~**Chatbot pas methodology-aware**~~ — **FAIT pour la méthode built-in** (branche
`feat/methodo-rag-and-team-routines`) : `method_knowledge.py` transforme `objection_library` +
`sector_playbooks` + le registre `business_rules` en **chunks shapés comme des docs RAG**
(`title`/`content`/`category`/`similarity`), récupérés déterministement sur la question (overlap de tokens,
zéro réseau, zéro clé, playbook filtré par le secteur du compte). Câblés dans `/chat/message` : bloc
« MÉTHODE BELLUM » du prompt advisor (cite la règle par son titre + sa source) et source `method_rule` du
panneau « Contexte utilisé ». Pas d'ingestion dans `rag_documents` : la méthode est versionnée dans git,
pas dupliquée par workspace (ni migration, ni dérive, ni copie à purger). Question sans règle associée ⇒
`[]` ⇒ prompt byte-identique. Reste : l'annexe PDF elle-même n'est toujours pas pré-seedée/auto-ingestible. 21. **BTMMP absent** (0 objet de qualification). **Delivery/sourcing/push-profil absent** (0 %). ← **paris produit**. 22. **Golden** : stabilité verrouillée (prompt golden). Sur 3 axes DoD : small-vs-large **partiel** (prompt scorer
seul), **cold-vs-active MANQUANT**, **public-vs-startup MANQUANT**. Corrections→mémoire OK (chatbot).

## Plan par phases (1 PR/phase, TDD, tests verts, i18n FR+EN, changelog, golden)

### Phase 0 — Contrat `SalesContext` (KEYSTONE, net-new) — débloque tout — FAIT (branche feat/sales-context-keystone)

Contrat zod `@bellum/contracts` (`sales-context.ts`) + JSON Schema + mirror Python, threadé server-side
à chaque phase IA (comme le profil aujourd'hui). Trois axes :

- `esnProfile` : promouvoir les dims mortes/absentes en **vrais champs** (stade, businessModel {rang1/rang2,
  staffing, bande marge, bande TJM}, capacity {intercontrats, delivery, séniorité}, GTM {founder-led/team,
  canaux}, references {secteurs/clients/cas}, tools). **Réconcilier les 2 échelles taille en UN `esnStage`**
  (freelance/petite/structuration/etablie/grande) — aligner archétype 5-buckets ET calibration 3-bandes dessus.
  Purger ou câbler les 9 colonnes mortes.
- `accountArchetype` : enum net-new (startup/pme_eti/grand_groupe/banque_assurance/public/luxe_retail_media/
  industrie/international) — **classifieur déterministe** (secteur + taille + NAF + entités). Corrige le trou média +
  startup/PME + international.
- `relationshipState` : enum niveau-compte net-new (froid/connu/linkedin/dormant/refere/ancien_client/rang2/
  client_actif/besoin_ouvert) — dérivé de `commercial_status` + présence CRM + `AnalysisContext` + dernière
  interaction ; override user. **Câbler `commercial_status` DANS les prompts.**
  Invariants typés + `salesContextVersion`. Golden : profils différents → context différent.
  Note : le JSON Schema partagé + le mirror Python sont ajoutés à la phase qui THREAD le contexte dans le
  pipeline IA (comme OrgGraph), là où le verrou cross-lang sert — pas au contrat nu.

### Phase 1 — Scoring aligné spec (cluster C) — surtout REUSE

- Compte /25 : ajouter axes **Concurrence + Capacité** ; corriger bande **PRUDENT=14** ; ajouter verdict **EXPLORER**.
  (Mapper budget/urgence sous Timing, maturité sous SalesContext.)
- Contact : **faire respecter le /100 déterministe au tri live** (réconcilier avec `priority` 1-5) ; **câbler le
  boost profil vendeur** (passer l'arg seller) ; entrée relationshipState ; **plancher preuve**.
- **Garde-fou board/CEO déterministe** : dé-ranker L0/board en 1er contact froid quand SalesContext = petite ESN +
  relation froide (plus prompt-only). Ride sur `OrgGraph` L0 (org-mapping).

### Phase 2 — Routing archétype × relation → mouvement (cluster B)

- Étendre `approachAngle` à **7** (sandwich/rang2/prospection_inversee/public). **Calculer le mouvement
  déterministiquement** depuis (archétype × relation × esnStage), TABLE C. Attacher au plan + `recommendedPath.movement`
  (coordonner avec org-mapping Phase 2/3).
- Étendre les playbooks sectoriels aux prompts **strategy/contacts** (pas que plan) ; ajouter média + branches
  startup/PME + international.

### Phase 3 — Bibliothèque d'actions + sélecteur 3-5 + plan horizons/champs (cluster D)

- Catalogue d'actions **indexé par scénario** (6 chantiers Compte/Contacts/Signaux/Messages/Delivery/Expansion),
  config typée.
- **Sélecteur** : choisit **3-5 actions rankées** par (SalesContext, score, données-manquantes, horizon), **cap
  imposé**. Câblé à `action-router` (exécuteur) + action center UI + cockpit.
- Plan : ajouter **owner/raison/feedback** ; retarget horizons **7/30/60/90** ; **couche-zéro** (lire présence CRM
  dans le plan avant froid ; surfacer `reverseProspects`).
- **Routines par taille d'équipe** (fondateur seul / 2-3 / 5+) : adapter volume/owners.

### Phase 4 — Séquences messages M1/M2/M3 + J0/J3/J6/J9, relation-personnalisées (cluster E)

- Générer **contenu M2/M3** + structure téléphone (10s/découverte/sortie). Différencier J3/J6/J9 (preuve nouvelle
  par touche). **Personnaliser par relationshipState** (froid vs client actif → ton/cadence). Garder opt-out/stop-réponse ;
  ajouter bounce + stop-statut-CRM.

### Phase 5 — Méthodologie dans RAG + chatbot (cluster E, p29)

- Ingérer la méthode built-in (objection_library, sector_playbooks, cette annexe) dans `rag_documents` = **chunks
  cités**. Chatbot cite les **règles built-in**. « Cite règle/profil/preuve » partout (explicabilité DoD).

### Phase 6 — BTMMP + delivery/sourcing (cluster E) — **PARIS PRODUIT, décision Louis/Théo**

- Objet qualification **BTMMP** (besoin ouvert). Flow **push-profil/vivier/soutenance/feedback**. Nouvelle surface —
  probablement roadmap séparée, pas ce chantier.

### Phase 7 — Golden sets verrouillant la DoD (p29, p31) — continu dès Phase 1

- Golden : small-vs-large ESN → doors/score/contacts/actions **différents** ; cold-vs-active → messages/cadence
  **différents** ; public-vs-startup → procurement **différent**. + stabilité (déjà là). Chaque reco cite règle/profil/preuve.

## Ordre / dépendances

Phase 0 (keystone) → 1 + 2 en parallèle → 3 → 4 → 5 ; Phase 7 (golden) en continu dès la Phase 1.
Phase 6 parquée (décision produit). **Coordination org-mapping** : garde-fou board (P1) + `recommendedPath.movement`
(P2) rident sur `OrgGraph` (org-mapping P0-3) — ne pas dupliquer.

## Definition of Done (spec p31)

Même compte petite-vs-grande ESN → portes/score/contacts/actions différents ; même ESN froid-vs-client actif →
messages/cadence différents ; public-vs-startup → procurement/sources/temporalité différents ; board/administrateur
jamais recommandé en 1re approche sans relation/sponsor ; **aucune action « audit flash » / « contacte le CEO » par
réflexe générique** ; chaque reco cite règle+profil+preuves ; corrections user alimentent mémoire + prochains runs ;
tout verrouillé par golden tests.
