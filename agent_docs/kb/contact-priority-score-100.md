# Contact Priority Score /100 — grille canonique (Drive 03_BUSINESS_RULES §3)

**Source de vérité : Drive `03_BUSINESS_RULES §3 — Contact Priority Score (100 points)`.**
Grille déterministe, band-faithful, chaque critère relié à une **preuve**. Aucune
donnée inventée : un critère non-évaluable vaut **0** (absence documentée), jamais
un bonus fictif.

Elle clôt le gap historique « grille contact /100 divergente à trancher » : le
score contact ne dérive plus d'un pré-tri opaque — il **est** la somme d'une grille
à 6 critères, chacun explicité.

## La grille (poids au point près)

| Critère                | Clé (`key`)     | Poids max | Donnée d'entrée                                            | Preuve affichée (exemples)                                                |
| ---------------------- | --------------- | --------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| Rôle décisionnel       | `role`          | **0-30**  | `decision_role` (taxonomie MEDDIC deck)                    | « décideur technique », « sponsor », « achats / procurement »             |
| Proximité du périmètre | `proximity`     | **0-20**  | `perimeterTier` (P1/P2/secondaire) sinon `entityRelevance` | « périmètre prioritaire (P1) », « entité hors périmètre »                 |
| Niveau hiérarchique    | `seniority`     | **0-15**  | `title` → `classify_hierarchy_level`                       | « C-level / COMEX », « Direction », « Opérationnel »                      |
| Accessibilité / source | `accessibility` | **0-15**  | `email` + `emailVerified`, `linkedinUrl`                   | « email vérifié », « profil LinkedIn », « aucun canal de contact »        |
| Fit avec l'angle       | `angleFit`      | **0-10**  | `angleMatch` (title ∩ angles reco) + §9 thèmes vendeur     | « colle à l'angle recommandé », « aligné à votre expertise »              |
| Fraîcheur / activité   | `freshness`     | **0-10**  | `source`, `employerMismatch`                               | « Apollo (annuaire vérifié) », « employeur obsolète (a quitté la cible) » |
| **Total**              |                 | **100**   |                                                            | `score = Σ(critères)` (borné 0-100)                                       |

Bandes : **haute ≥ 70 · moyenne 45-69 · faible < 45** (`priority_band`).

### Barème par critère

- **Rôle /30** : economic 30 · sponsor 30 · technical 28 · champion 24 · user 16 ·
  influencer 14 · procurement/purchasing 12 · blocker 8 · (non classé → **0**).
- **Proximité /20** : P1 20 · P2 14 · secondaire 8 · entité opérante 10 ·
  hors-secteur/bruit **0** · pas de contexte périmètre → 10 (neutre documenté).
- **Hiérarchie /15** : c_level 15 · direction 12 · management 8 · expert 5 ·
  operationnel 2.
- **Accessibilité /15** : email vérifié 15 · email 10 · LinkedIn 6 · aucun canal **0**.
- **Fit angle /10** : match 10 · pas d'angle évalué 5 (neutre) · explicitement
  hors-angle **0**.
- **Fraîcheur /10** : apollo 10 · manual 8 · pappers 7 · brave_search 5 ·
  ia_reconstruction 3 · source inconnue 5 (neutre) · `employerMismatch` → **1**
  (périmé, quelle que soit la source).

## profileData influe le score (Drive §9)

Le barème est **profile-aware** : `SellerContext(priority_roles, focus_themes)`
dérivé du profil ESN (`seller_context_from_profile`).

- **Rôle** : si le rôle du contact ∈ `priority_roles`, ses points sont remontés
  vers le cap /30 (`+6`, borné à 30). Ex. ESN cyber → `priority_roles={technical}`
  → un **RSSI** (technical) gagne des points vs un scoring profile-agnostic.
- **Fit angle** : un `focus_theme` du vendeur qui matche le titre du contact fournit
  le boost /10 même sans `angleMatch` explicite (ex. focus `cybersecurite` → un
  « Responsable Cybersécurité » passe de 5 → 10).

Contexte vendeur vide / absent ⇒ grille **neutre** = identique au comportement
actuel (aucun score live ne bouge tant qu'un profil n'est pas fourni).

## Chaque facteur → une preuve (exigence Théo P1)

Le breakdown renvoie, par critère, `{ key/criterion, points, max, proof, label }`.
La `proof` cite le signal réel (rôle, tier périmètre, tier hiérarchique, canal,
thème d'angle, source) — jamais une justification générique. « Un score qui
explique pourquoi. »

## Implémentation (miroirs)

- **IA (référence canonique)** : `apps/ia/app/services/contact_priority_score.py`
  — `contact_priority_breakdown` / `contact_priority_score` / `priority_band` /
  `SellerContext` / `seller_context_from_profile`. Déterministe, pur.
- **TS (chemin d'affichage live)** :
  `packages/contracts/src/schemas/classified-data.ts` —
  `computeContactScoreBreakdown` / `computeContactScore(c, seller?)`. Le score =
  `Σ(breakdown)`, donc le nombre et sa justification ne peuvent pas diverger.
- **API** : `analysis-telemetry.service.ts` expose `scoreBreakdown` (par contact)
  à côté de `contactScore` (passthrough vers le front).
- **Web** : `ContactScoreBreakdown.tsx` (onglet **Rôle & périmètre** de la fiche
  contact) affiche le total /100 + les 6 critères (points/max + preuve). Libellés
  i18n FR+EN (`contacts.score.breakdown.*`).

## Registre des règles métier

`apps/ia/app/knowledge/business_rules.py` : `contact_fit_score_100` passe
**SPECIFIED → ACTIVE** avec `applied_in` (impl + miroir TS) et `test_ref`
(`test_contact_priority_score_100_grid`).

## Tests

- `apps/ia/tests/test_contact_priority_score.py` — chaque critère borné, total = Σ
  ≤ 100, band cohérente, facteur→preuve, profileData change le score (§9), boost
  ≤ cap, critère absent = 0, `employerMismatch` écrase la fraîcheur.
- `apps/ia/tests/test_business_rules.py::test_contact_priority_score_100_grid` —
  preuve d'application (registre ACTIVE).
- `packages/contracts/src/schemas/classified-data.test.ts` — breakdown = score,
  preuves, §9, cap /30, parité libellés FR/EN.
- `apps/api/.../analysis-telemetry.service.spec.ts` — passthrough : `scoreBreakdown`
  présent, borné, somme = `contactScore`.
- `apps/web/.../ContactScoreBreakdown.test.tsx` — les 6 critères + preuves rendus.

## Ce qui change vs l'ancien /100

Le /100 existait déjà côté contracts avec **les mêmes poids** (30/20/15/15/10/10)
mais comme un simple nombre opaque. Cette itération :

1. dérive le score d'un **breakdown explicable** (`score = Σ(critères)`), chaque
   critère portant sa **preuve** ;
2. rend le barème **profile-aware** (§9), neutre par défaut (aucune régression) ;
3. ajoute la **référence Python canonique** + passe la règle registre en **ACTIVE** ;
4. **affiche** le breakdown sur la fiche contact (FR+EN).
