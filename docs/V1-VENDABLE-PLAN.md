# Plan v1 vendable — feuille de route détaillée

**But.** Un commercial ESN tape un nom d'entreprise → en ~5 min, le **dossier de conquête du deck Skaizen** : cartographie groupe priorisée, contacts par rôle décisionnel avec messages prêts, angles d'attaque, plan 30 jours — **rapide, fiable, sourcé, ultra-pro**.

**Où on en est.** Palier 1 est livré et dépassé (voir `PALIER1-LIVRABLE.md`). Acquis exploitables comme socle : filtre d'entités, **zones P1/P2/P3**, B3 sources (registry + evidence + tags PUBLIC/HYPOTHÈSE), B4 confiance, résolution SIREN robuste, cache SIREN, audit par phase, dashboard riche, contrat `@bellum/shared`.

Légende effort : **S** ≤ 1j · **M** 2-4j · **L** ≥ 1 sem. Risque : 🟢 déterministe / 🟠 prompt+éval / 🔴 archi.

---

## Axe 1 — Cartographie deck-complète

| Chantier                              | Manque                                           | Approche                                                                                                                                                                                                                                | Effort | Risque |
| ------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| **What-to-sell par BU**               | Offres/stack rattachés au compte, pas à l'entité | Restructurer `entities_exhaustive[]` : `{angles[], stack[]}` par BU (deck : GBIS=Java/quant, BoursoBank=mobile/anti-fraude). Atomes existants (`technology_stack[].opportunity_for_esn`, `angles[].specific_offer`) à re-clé par entité | M      | 🟠     |
| **Matrice influence × accessibilité** | Tiers calculés par IT×taille seulement           | Ajouter l'axe accessibilité (CRM/relais/contacts existants) → quadrant du deck (zone idéale = haut-droite)                                                                                                                              | M      | 🟢     |
| **Org-chart visuel**                  | Liste tierée, pas de graphe                      | Rendu arbre DG→piliers→sous-DSI au dashboard (SVG) façon deck p.28                                                                                                                                                                      | M      | 🟢     |
| **Filtre entités v2**                 | ~72 « opérantes » sur SG (vs 14 curées du deck)  | Affiner : NAF/legal-form quand dispo + dédup + regroupement par BU ; viser la vue curée                                                                                                                                                 | M      | 🟠     |

## Axe 2 — Contacts par rôle (deck p.6)

| Chantier                      | Manque                                                                             | Approche                                                                                                                                                    | Effort | Risque |
| ----------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| **decisionRole déterministe** | Taxo LLM (sponsor/champion/…) ≠ deck (ECONOMIC/TECHNICAL/USER/CHAMPION/À-VÉRIFIER) | Classifieur **titre→rôle** pur (DSI/CTO/RSSI→TECHNICAL, CFO→ECONOMIC, métier→USER) appliqué côté API à la persistance (colonne `decision_role` existe déjà) | M      | 🟢     |
| **Tags de source contacts**   | INTERNE/PUBLIC/HYPOTHÈSE/RISQUE par contact                                        | Dériver de la provenance (Pappers=PUBLIC, web=HYPOTHÈSE, CRM=INTERNE) — réutilise le moteur B3                                                              | S      | 🟢     |
| **Top-N hiérarchisé**         | Top-3 par priorité                                                                 | Tri ancienneté × séniorité × signal LinkedIn (deck « 30 contacts à activer »)                                                                               | S      | 🟢     |

## Axe 3 — Angles, signaux, plan 30j

| Chantier                  | Manque              | Approche                                                                                                   | Effort | Risque |
| ------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- | ------ | ------ |
| **3 angles par contexte** | Angles globaux      | Tag `approach: topDown\|bottomUp\|middleOut` par angle (enum `EntryStrategy` existe) selon contexte compte | M      | 🟠     |
| **Signaux → hypothèses**  | Signaux bruts       | Chaque `recent_signal` → `{hypothesis, offer, confidence}` (deck : 4 signaux → 4 hypothèses)               | M      | 🟠     |
| **Roadmap 30j par zone**  | Plan phasé par mois | Ajouter `zone/priorityTier` à `PlanAction` → prochaine action assignée par P1/P2/P3                        | M      | 🟠     |

## Axe 4 — Optimisation par phase + parallélisation max

| Chantier                                    | Manque                                                                    | Approche                                                                                                                                                                                                                                                    | Effort | Risque |
| ------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| **F3 — Apollo pagination**                  | Pages 2..N en série                                                       | Page 1 → `total` → `gather` des pages restantes (throttle cap 10)                                                                                                                                                                                           | S      | 🟠     |
| **F5/F6 — worker awaits**                   | `saveResearch`→`seedContacts` séquentiel ; `setApiCost` avant le « done » | Folder le seed dans la TX research ; émettre « done » avant la télémétrie                                                                                                                                                                                   | S      | 🟢     |
| **Cost phases 2&3 réel**                    | IA ne reporte pas l'usage de contacts/classify (audit affiche $0)         | Threader `usage` (`phase2_contacts` fallback + `classification.py`) → `token_usage` meta                                                                                                                                                                    | M      | 🟢     |
| **Réduire sortie strategy (C3-suite #274)** | Output strategy volumineux                                                | Resserrer schéma + concision, **éval golden-set obligatoire**                                                                                                                                                                                               | M      | 🟠     |
| **Nouvelles phases (si pertinent)**         | —                                                                         | Évaluer : (a) phase **enrichissement email/LinkedIn** dédiée parallèle ; (b) phase **scoring compte** isolée ; (c) phase **vérification/cross-check** des faits. Chaque nouvelle phase = endpoint IA + checkpoint worker, parallélisable si sans dépendance | L      | 🔴     |
| **Overlap cross-phase**                     | Phases strictement séquentielles                                          | Démarrer la collecte contacts (Apollo, indépendant du LLM research) **pendant** la Phase 1                                                                                                                                                                  | M      | 🔴     |

## Axe 5 — Qualité, démo, contrat

| Chantier                                    | Manque                                       | Approche                                                                                                                         | Effort | Risque |
| ------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| **Golden-set d'éval**                       | Pas de mesure qualité                        | 10-15 boîtes de référence + grille (angles pertinents, contacts justes) → gate de non-régression pour tout changement de prompt  | M      | 🟢     |
| **Pipeline complet via worker (dashboard)** | `/run` chaîne les phases IA sans persistance | Brancher « Lancer » sur l'endpoint analyse réel (auth opérateur) → worker BullMQ → persistance + resume                          | M      | 🟠     |
| **Contrat par étape (#273)**                | JSON Schema research seul                    | Étendre `@bellum/shared` : schémas contacts/classify/plan + fixtures + test ajv                                                  | M      | 🟢     |
| **Démo réelle SG/Doctolib**                 | Démo = données seed                          | Script qui lance l'analyse réelle sur SG + Doctolib et peuple le dashboard live                                                  | S      | 🟢     |
| **Tout mesurer**                            | Audit par phase OK                           | Ajouter : tokens cache-hit (C3), $/contact, durée par sous-appel, taux de filtrage entités, distribution confiance dans le temps | M      | 🟢     |

---

## Séquencement proposé

**Sprint 1 — quick wins déterministes (🟢, visibles tout de suite)**
decisionRole · tags source contacts · cost 2&3 réel · F3 · F5/F6 · démo réelle SG/Doctolib · pipeline via worker.

**Sprint 2 — cartographie deck**
what-to-sell par BU · matrice influence×accès · org-chart visuel · filtre entités v2 · roadmap 30j par zone.

**Sprint 3 — qualité IA (gate éval)**
golden-set · 3 angles par contexte · signaux→hypothèses · réduction strategy (#274) · contrat par étape (#273).

**Sprint 4 — archi (si ROI prouvé)**
overlap cross-phase · nouvelles phases (enrichissement / scoring / cross-check).

---

## Définition de « v1 vendable »

Sur SG **et** Doctolib, par commande, en < 5 min : cartographie priorisée P1/P2/P3 avec what-to-sell par BU · top contacts par rôle décisionnel avec ≥1 décideur IT vérifié + message réel · 3 angles + plan 30j · chaque info tag PUBLIC/HYPOTHÈSE + source + confiance · coût + temps mesurés par phase · le tout lisible et démontrable dans le dashboard. Qualité verrouillée par golden-set.

Suivi : #273 (contrat par étape) · #274 (réduction strategy) · #275 (cartographie/contacts/angles deck).
