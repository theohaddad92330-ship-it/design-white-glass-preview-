# Domaines d'offre pluggables (C6 / PDF6 §1)

> « Bellum ne doit pas être enfermé dans le vocabulaire IT/data — raisonner par
> périmètres métiers (finance, supply chain, produit, design, PMO, RH…) puis se
> spécialiser via le contexte utilisateur. » — PDF6 §1 (note candidat)

Aujourd'hui les prompts pipeline raisonnent dans un prisme IT/ESN. Cette
architecture rend le prisme **pluggable par domaine d'offre**, **sans changer le
comportement par défaut** : le chemin `esn_it` (produit LIVE) reste
**byte-identique** à l'existant, prouvé par les goldens.

## Principe : registry de domaines, calqué sur les country-packs

Même philosophie que `apps/ia/app/services/country_packs/` (additif, no-op pour
le défaut, zéro flag) appliquée au **prisme des prompts** au lieu des sources de
données :

- Un **domaine** = du vocabulaire statique (périmètres métiers, familles de
  signaux, exemples de plays) + une **lens** (le dict que `resolve_domain_focus`
  interpole dans les prompts).
- Le **défaut** est `esn_it`. Le registry `get_offer_domain_pack()` renvoie
  `None` pour `esn_it`, un `offerDomain` absent ou inconnu → le chemin
  historique de `domain_focus.py` s'applique inchangé → prompts byte-identiques.
- **Sélectionner un domaine non-défaut EST l'interrupteur** — pas d'env var.

## Flux de bout en bout

```
UI profil vendeur (« Domaine d'offre », défaut ESN/IT)
  └─ esn_profiles.offer_domain (TEXT, migration 1785960000000)
       └─ EsnAnswers.offer_domain (contracts, enum OFFER_DOMAINS, .catch(null))
            └─ esnAnswersToProfileData → AnalysisProfileData.offerDomain
                 └─ profile_data.offerDomain (IA)
                      └─ resolve_domain_focus → get_offer_domain_pack(offerDomain)
                           ├─ None (esn_it / absent / inconnu) → lens IT historique
                           └─ pack → lens du domaine (labels + blocs de prompt)
```

Chemin batch (scorer / veille) : `seller_context.esn_row_to_profile_data` mappe
aussi `offer_domain` → `offerDomain`, donc Scoring et Veille consomment le même
domaine que le dossier.

## Ce que la lens pilote dans les prompts

`resolve_domain_focus(profile_data)` renvoie un dict de labels ET de blocs :

| Clé                     | Consommée par                                    | Rôle                                                                         |
| ----------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `label` / `label_long`  | facts, signals, strategy, contacts, organigramme | nom court/long du domaine (« défis {label} », « organigramme {label_long} ») |
| `system_label`          | facts                                            | l'actif analysé (« son {system_label} »)                                     |
| `budget_signal`         | facts (grille priorityScore)                     | 1er critère de score                                                         |
| `tech_entity_directive` | facts (user)                                     | directive « entité cible n°1 »                                               |
| `sell_examples`         | facts (user)                                     | exemples `whatToSell`                                                        |
| `signal_grid`           | signals (system)                                 | grille des signaux dynamiques                                                |
| `challenge_label`       | strategy (user)                                  | « Pour chaque defi {challenge_label} »                                       |
| `play_examples_inline`  | strategy (user)                                  | exemples `axesEcartes`                                                       |
| `domain_brief`          | facts, signals, strategy, contacts (system)      | bloc « DOMAINE D'OFFRE » injecté en fin de MISSION                           |

**Byte-identité par construction** : sur le chemin défaut, `domain_brief == ""`
(append d'une chaîne vide) et `signal_grid` / `challenge_label` /
`play_examples_inline` valent les chaînes IT historiques exactes
(`offer_domains/esn_it.py` = source unique de vérité de ces textes). Les **clés
JSON du contrat** (`itAutonomy`, `it_implications_for_esn`, `programNames`,
`itChallenges`…) ne changent JAMAIS — seuls leurs libellés lisibles se
spécialisent.

## Domaines livrés

| Code             | Statut     | Contenu                                                                                                                                                                     |
| ---------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `esn_it`         | `live`     | **= l'existant exact** (défaut). Textes IT historiques.                                                                                                                     |
| `generic`        | `live`     | lens dérivée des offres déclarées du vendeur (prisme neutre, sélection explicite → abandonne l'IT présumé).                                                                 |
| `finance`        | `live`     | **domaine témoin curé** : périmètres DAF/contrôle de gestion/consolidation/trésorerie, grille de signaux finance (CFO, ERP/EPM, CSRD…), plays finance. Prouve la plomberie. |
| `supply_chain`   | `scaffold` | structure + TODO curation documenté.                                                                                                                                        |
| `product_design` | `scaffold` | structure + TODO curation documenté.                                                                                                                                        |
| `pmo`            | `scaffold` | structure + TODO curation documenté.                                                                                                                                        |
| `rh`             | `scaffold` | structure + TODO curation documenté.                                                                                                                                        |

Un **scaffold** est sélectionnable et honnête : sa lens dérive du générique sous
le label du domaine (aucun vocabulaire « expert » à moitié curé n'est livré). Le
TODO de curation vit dans chaque module (`supply_chain.py`, etc.).

## Sûreté (précaution maximale — ESN IT = produit LIVE)

1. `esn_it` / `offerDomain` absent / valeur inconnue → chemin historique exact.
2. Le dé-silo heuristique Drive #9 (`_looks_like_it_esn`) est **inchangé** : une
   ESN non-IT sans domaine explicite garde la généralisation dérivée des offres.
3. `looks_like_it_esn` (services déterministes phase 3/4) renvoie `False` pour un
   domaine explicite non-défaut — un vendeur finance ne doit pas hériter du
   pouce-sur-la-balance IT. `esn_it`/absent/inconnu gardent l'heuristique.
4. Goldens de byte-identité :
   - `tests/test_prompt_golden.py` (22 system prompts) — inchangés avec `esn_it`.
   - `tests/test_domain_focus_user_prompts.py` (user prompts Drive #9).
   - `tests/test_offer_domains.py` : rend chaque prompt avec `None` / `esn_it` /
     `unknown` et compare aux baselines committées, **dont
     `tests/golden/user/strategy.txt` capturée depuis le code PRÉ-changement**.

## Ajouter un domaine (checklist)

1. `apps/ia/app/services/offer_domains/<code>.py` : sous-classer
   `OfferDomainPack` (ou `ScaffoldDomainPack`), remplir les 4 méthodes.
2. L'enregistrer dans `offer_domains/__init__.py` (`OFFER_DOMAIN_PACKS`).
3. Ajouter le code à l'enum contracts `OFFER_DOMAINS`
   (`packages/contracts/src/schemas/onboarding.ts`).
4. Ajouter les labels i18n FR+EN
   (`apps/web/src/i18n/locales/{fr,en}/onboarding.json` →
   `questions.offerDomain.options.<code>`).
5. Tests : étendre `tests/test_offer_domains.py` (`_ALL_DOMAINS`).
6. Aucune migration : `offer_domain` est TEXT libre côté SQL, l'enum vit dans
   les contracts + packs.

Promouvoir un scaffold en `live` = remplir `perimeters()` / `signal_families()`
/ `play_examples()` avec du contenu curé (validation métier requise) et passer
`status = "live"`.
