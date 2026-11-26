# BellumAI — Palier 2 (plan d'exécution séquencé)

Le QUOI est dans [`palier2-cadrage.md`](./palier2-cadrage.md). Ici : le QUAND —
slices ordonnées, dépendances, frontières PR, TDD + eval par slice.

## Principe directeur

Chaque chantier se scinde en deux :

- **(a) Mécanisme** — décision-indépendant, buildable **maintenant** (le wiring,
  la structure, le gate, la classification).
- **(b) Config / seuils** — en attente Théo/Matteo (les NAF cœur-cible, les seuils
  de récence, les poids de grille, les définitions de statuts).

→ Les décisions Théo sont une **injection de config**, pas des bloqueurs. On code
le mécanisme avec une config **provisoire** (dans un fichier de constantes isolé),
on fige les valeurs quand Théo répond. Aucune slice n'attend une réunion pour démarrer.

Règles craft : TDD avant code · brancher sur `apps/ia/evals/` (golden SG = deck ref)
· 1 slice = 1 PR · impact-check si > 3 fichiers · jamais merge, PR pour Louis
([[never-merge-only-pr]]).

## Vue d'ensemble

| Slice  | Chantier           | Vague  | Démarre                            | Bloqué (config) par                     | Taille | Frontière PR            |
| ------ | ------------------ | ------ | ---------------------------------- | --------------------------------------- | ------ | ----------------------- |
| **S0** | Firecrawl          | jour 1 | ✅ maintenant                      | —                                       | XS     | env prod (pas de code)  |
| **S1** | C1 profil branché  | 1      | ✅ maintenant                      | — (défaut : run profil-neutre autorisé) | M      | 2 PR (wiring / prompt)  |
| **S2** | C2 gate entité     | 1      | ✅ maintenant (config provisoire)  | Théo : NAF cœur-cible + seuil           | M      | 1 PR                    |
| **S3** | C4 séparer scores  | 2      | après S1                           | Théo : figer grilles /25 & /100         | L      | 2 PR (compte / contact) |
| **S4** | C3 factualité      | 2      | ✅ maintenant (seuils provisoires) | Théo : seuils récence                   | M      | 1 PR                    |
| **S5** | C5 statuts contact | 3      | après S3                           | Théo : définitions 7 statuts            | M      | 1 PR                    |
| **S6** | C6 re-run scopé    | 3      | backend ✅ maintenant              | Matteo : modèle merge + UX              | L      | 2-3 PR                  |

Parallèle continu : **affichage (Matteo)** — S1/S2 lui donnent la donnée propre,
S5/S6 les briques re-lançables.

## Graphe de dépendances

```
S0 Firecrawl ─── (indépendant)

S1 profil ──┬──► S3 scores (le score compte doit refléter le fit profil)
            └──► [débloque explication reco partout]

S2 gate entité ─── (indépendant ; consomme les entités filtrées existantes)

S4 factualité ─── (indépendant)

S3 scores ──► S5 statuts contact (le statut réutilise pertinence/accessibilité)

S6 re-run ──► backend indépendant ; merge/UX ↔ Matteo
```

Chemin critique = **S1 → S3 → S5**. Tout le reste est parallélisable.

---

## Détail des slices

### S0 — Firecrawl (jour 1)

- **Objectif.** Matteo a vu 3 pages. Défaut code = `FIRECRAWL_MAX_PAGES=7`
  (`apps/ia/app/services/research/firecrawl.py:194`) → l'env prod est bridé à 3.
- **Faire.** Remonter l'env prod (7, ou plus si on relève le plafond `scrape_hits`
  `max_pages=10` `firecrawl.py:279`). Vérifier le coût (chars/catégorie).
- **Test.** Aucun code → smoke run : compter les pages scrapées.
- **Décision.** — (réglage, pas métier).

### S1 — C1 Profil branché (Vague 1) — **démarrer ici**

Plus haut levier : tue l'Afrique + débloque l'explication de reco. Aucun bloqueur.

**PR 1a — wiring profil (mécanisme).**

1. **Mapper** `esn_profiles`/`EsnAnswers` → `profile_data` (couche de traduction :
   `expertise_areas`→`offers`, `decision_maker_personas`→`personas`, etc. ; gérer les
   champs sans source `references`/`avgTJM`). Util isolé + **test unitaire du mapper**.
2. Web envoie le profil au start-analysis (`apps/web/.../useAnalysis.ts:48-51`).
3. API forward le vrai profil + **resume le recharge** (retirer le `profileData: {}`
   hardcodé `analysis.service.ts:206,269`).
4. Défaut : run sans profil = autorisé, bannière « analyse profil-neutre » (décision
   soft, revalidable avec Théo).

- Impact-check (touche web + api + util).

**PR 1b — explication de reco ancrée profil (prompt).** 5. Les « why » référencent explicitement le profil (« parce que ton offre = data/cloud,
que SGABS ressort accessible… ») + reco négative (« je NE te conseille PAS le board
parce que non actionnable pour une ESN »). Prompts `bellum_strategy` /
`bellum_organigramme` / `bellum_plan`.

- **Eval gate.** Rejouer SG avec un profil Théo (data/cloud, France, refs bancaires)
  → **l'Afrique disparaît de la stratégie principale**. Golden SG + `--judge`.

### S2 — C2 Gate entité (Vague 1)

**PR 2 (mécanisme + config provisoire).**

1. Étendre la classification entité : `hors-scope` / `homonyme` / `hors-secteur` /
   `faux-positif` + `relevanceReason` (`apps/ia/app/services/entities.py`, schema
   `research.schema.json`, contract). **TDD.**
2. Exclusion par NAF/secteur (pas seulement upgrade IT) — liste cœur-cible dans un
   **fichier config isolé** (provisoire : IT 62.0x/63.11 in ; BTP 41-43 out ;
   véhicules financiers hors banque-cible out). `insee_sirene.py`/`entities.py`. **TDD.**
3. **Gate** : seules les entités pertinentes → contacts + angles + plan + messages.
   Réconcilier le pipeline plan (consomme les entités **filtrées**, plus le
   `entitiesExhaustive` LLM libre — `phase4_plan.py`). Bruit/hors-scope = gardé,
   classé, expliqué, **pas de play**. **TDD.**

- **Eval gate.** Regen fixture SG → **SGTM (BTP) et moulins classés hors-scope,
  zéro message/plan généré pour eux**. Golden assertion « pas de play sur bruit ».
- **Config Théo après.** NAF cœur-cible définitif + seuil de pertinence → remplacer
  les provisoires.

### S3 — C4 Séparer les scores (Vague 2, après S1)

Après S1 car le score commercial compte doit refléter le fit profil.

**PR 3a — scores compte.**

1. Tuer les 3 scores compte contradictoires → **1 seul** : `/25` GO/PRUDENT/STOP.
   Retirer `priorityScore` 1-10 + `scorer` /10 qui écrivent la même colonne
   `accounts.priority_score` ; unifier le vocab verdict. Fix doc drift
   `verdict_for_score` (`account_score.py`). Migration si sémantique colonne change.
   **TDD.**

**PR 3b — scores contact.** 2. Splitter `computeContactScore` `/100` → **pertinence** (role_power + seniority)
ET **accessibilité** (standalone), deux scores nommés. **priorité action** =
dérivée (pas LLM brut). Contract + API + IA + dashboard. **TDD.**

- **Eval gate.** Chaque score a 1 échelle + 1 label ; plus aucun mélange /25 vs /100
  vs 1-10 sur le même objet.
- **Config Théo après.** Figer les poids de grille /25 et /100 (déjà « proposition
  en attente Théo » — `v1-vendable-cadrage.md:90-92`).

### S4 — C3 Factualité (Vague 2, parallélisable)

**PR 4 (mécanisme + seuils provisoires).**

1. Récence dirigeant : cross-check `Executive` (`pappers/models.py`) vs registre
   Pappers `representants` (snapshot actuel) ; nom absent → `à vérifier / possiblement
ancien`, **interdit comme accroche**. **TDD** (cas Oudéa parti 2023).
2. Étendre Quality Judge aux exécs / RH / budget / gouvernance (aujourd'hui 5 champs
   firmo seulement — `quality_judge.py:24`). **TDD** (tests existants à étendre).
3. Freshness = arithmétique de date vs _aujourd'hui_ ; claim périmé → dégradé
   signal/hypothèse (`confidence.py`, `bellum_facts.py`). **TDD.**
4. Garde précision numérique : pas de chiffre précis (« 900 postes IT ») sans citation
   exacte → dégrader (« suppressions, ampleur non chiffrée »). **TDD.**

- **Eval gate.** SG : Oudéa non traité comme dirigeant actuel ; « 900 postes »
  dégradé si la source ne le confirme pas.
- **Config Théo après.** Seuils : mandat < X ans, actu < X mois.

### S5 — C5 Statuts contact (Vague 3, après S3)

Après S3 car le statut réutilise pertinence/accessibilité.

**PR 5 (mécanisme + règles provisoires).**

1. Nouvel enum **statut qualif** 7 valeurs (priorité immédiate / à enrichir / à
   vérifier / hors scope / bruit / faux positif / autre angle), assigné déterministe.
   Contract + IA (`contacts.py`) + colonne DB. **TDD.**
2. Flag « enrichissement disponible » (email/tél manquant → enrichable ; réutilise
   l'endpoint on-demand `POST /contacts/:id/enrich` existant).
3. Exposer par contact : source + score (S3) + entité de rattachement + rôle +
   confiance (données déjà présentes → surfacer).

- **Config Théo après.** Définitions exactes + règles d'assignation (« à enrichir »
  vs « à vérifier »).

### S6 — C6 Re-run partiel scopé (Vague 3)

**PR 6a — scope backend (mécanisme, indépendant).**

1. Param **scope** (persona/secteur/entité/géo/rôle) sur `ContactsRequest`/
   `ClassifyRequest` + `StartAnalysisDto`. **TDD.**
2. Threader `person_locations` / secteur / séniorité dans `search_people`
   (aujourd'hui titres-only — `apollo.py:383-384`). **TDD.**

**PR 6b — merge-par-scope.** 3. Re-run on-demand **merge** au lieu d'écraser (`AnalysisOnDemandService` +
`saveContacts` : garder le reste, ajouter/remplacer le segment ciblé). **TDD.**

**PR 6c — regen ciblé.** 4. Endpoint « changer d'angle / regénérer le plan » (P4, aujourd'hui absent). 5. « Plus de contacts similaires » (re-run scopé sur le persona courant).

- **Décision Matteo.** Modèle de merge (append vs replace-in-scope) + comment l'UI
  expose les briques re-lançables → co-défini avec l'affichage.

---

## Ordre d'attaque recommandé

1. **S0** (jour 1, en passant) + **S1 PR 1a** (wiring profil) — démarrer immédiatement.
2. **S1 PR 1b** + **S2** en parallèle → fin de Vague 1 → **partager le run SG re-généré
   à Matteo** (Afrique tuée, SGTM classée hors-scope). Point de validation produit.
3. **S3** (après S1) + **S4** (parallèle) → Vague 2.
4. **S5** (après S3) + **S6 backend** (parallèle) → Vague 3, avec Matteo sur l'affichage.

Point de synchro Théo à caler **avant de figer** (pas avant de coder) : NAF cœur-cible
(S2), seuils récence (S4), grilles /25 & /100 (S3), définitions statuts (S5).
