# Registre des points — LOT E /accounts : organigramme et couverture contacts (18/09/2026)

Base : `4de833423` (`origin/main`, 18/09/2026). Branche : `fix/accounts-organigramme-18-09`.
Source : défaut de recette du 17/09 (#2502.1) + retours client François Thomas / Ludovic Marx (#2554.1, #2554.2).

## Mesure préalable — où l'actualisation décide de ce qu'elle rafraîchit

- **API** : `POST /analysis/:accountId/refresh` → `AnalysisRefreshService.refresh()`
  (`apps/api/src/modules/analysis/analysis-refresh.service.ts`). Dimensions dans
  `refreshDimensionSchema` (`packages/contracts/src/schemas/analysis.ts`) ; le mode
  `full` DÉRIVE de la liste complète, le mode `organisation` = `['entities', 'contacts']`
  (`packages/contracts/src/schemas/refresh-explained.ts:48-52`). Les DEUX modes
  re-déclenchent donc déjà `entities` → `AnalysisOndemandService.enrichOrganigram()`
  → `classifyAndPersist()` → phase 3 IA (`apps/ia`, `classify_node` / route
  `/phase/3/classify`, même fonction `org_graph_build.build_org_graph_payload` qu'au
  premier run).
- **Le trou mesuré** : un run COMPLET (`touchedPersonIds` vide) faisait un
  REMPLACEMENT intégral du graphe stocké (`AccountsService.applyOrgChart` →
  `saveOrgChart`) — comportement documenté comme volontaire pour les vagues ciblées
  (`mergeOrgGraphDelta`, `org-graph-merge.ts`), mais qui, pour un run complet, faisait
  disparaître SANS UN MOT toute personne que la phase 3 ne retrouvait pas ce coup-ci.
  Aucun diff nommé n'existait à ce niveau (le diff `buildRefreshDiff` de
  `refresh-explained.ts` ne compare que les facts de FICHE COMPTE —
  `ACCOUNT_FIELD_COLUMNS`, `apps/api/src/modules/crm-core/record-fields.ts` — jamais
  les personnes).
- **Conclusion** : #2554.1 était à moitié câblé (le TRIGGER de revérification existe
  déjà des deux modes de refresh) ; ce qui manquait est tenu par #2554.2 (le diff
  nommé) ET la garantie de non-suppression que #2554.2 exige littéralement
  (« jamais supprimée »).

## Points traités

| Point | Demande | État | Preuve | Fichiers clés |
| --- | --- | --- | --- | --- |
| #2554.1 | Actualiser un compte doit RE-VÉRIFIER l'organigramme existant | déjà là | `4009f4a5c` — nouvelle étape `AccountsService.withNotConfirmedPeople` dans `applyOrgChart` (même famille que `regraftDeclaredPeople`/`replayOrgCorrections`) : lit le graphe stocké, compare au run, ne supprime plus personne. Pas encore recetté en production. ‖ trace `#2554.1` en code de production sur origin/main — balayage du 18/09/2026 | `apps/api/src/modules/accounts/accounts.service.ts` |
| #2554.2 | Le diff nomme revérifiée / poste changé / non confirmée, jamais supprimée ni à jour | déjà là | `4009f4a5c` — fonction pure `preserveNotConfirmedPeople` (contracts) + champ `orgPersonSchema.notConfirmedSince` + carte `OrgPeopleRefreshDiffCard` sur TOUTES les vues de l'onglet Organigramme, FR/EN. Pas encore recetté en production. ‖ trace `#2554.2` en code de production sur origin/main — balayage du 18/09/2026 | `packages/contracts/src/schemas/org-graph-refresh-diff.ts`, `org-graph.ts`, `apps/web/.../organigramme/OrgPeopleRefreshDiffCard.tsx`, `orgPeopleRefreshDiff.ts`, `TabOrganigramme.tsx` |
 | #2502.1 (partiel) | Généraliser le geste « recharger + dire pourquoi c'est vide » | déjà là | DÉCISION LOUIS 18/09 (QCM) : un organigramme absent ne se régénère PAS tout seul — une collecte est un coût, et « rien de coûteux ne repart sans un geste ». Le bouton rendu cliquable à zéro crédit EST la réponse. ‖ SERVI EN PROD, mesuré au SHA `08bfa42a8` sur le COMPORTEMENT et non sur un nom de branche : les quatre endroits portent `gate.locked` et non `!gate.canEnrich` — or `locked = trial_expired` alors que `canEnrich = !locked && creditsLeft > 0` (`useCreditGate.ts:55,61,69`). Donc zéro crédit ne grise plus rien ; seul l'essai terminé ferme la porte. `OrgStructureSection.tsx:59`, `OrgMapEmptyState.tsx:73` (geste GRATUIT, aucune porte) et `:105`, `TabOrganigramme.tsx:161`. ⚠️ La branche citée plus bas, `fix/accounts-organigramme-18-09`, N'EXISTE PAS : un `merge-base` contre une ref absente rend le même « non » qu'un correctif absent — c'est le comportement qui tranche, jamais le nom. ‖ DÉCISION LOUIS 18/09 (QCM) : un organigramme absent ne se régénère PAS tout seul — une collecte est un coût, et « rien de coûteux ne repart sans un geste ». Le bouton « Générer / Enrichir » rendu cliquable à zéro crédit EST la réponse — la DEMANDE est donc close. Reste la LIVRAISON : la branche `fix/accounts-organigramme-18-09` n'est ni sur `origin/main` ni servie (vérifié au SHA `08bfa42a8`), donc l'état reste `livré`, pas `déjà là`. ‖ Le 3ᵉ endroit du MÊME bug #2502 (zéro crédit grisait le geste gratuit), trouvé dans `OrgStructureSection.tsx`, corrigé — branche `fix/accounts-organigramme-18-09`, fusionnée | 
| #2502.2 | Généraliser à TOUTES les sections du dossier | déjà là | SUR ORIGIN/MAIN — `fix/une-section-vide-dit-pourquoi-18-09` est ancêtre confirmé de `474fcfa31`, servi en production (fusionnée avec la vague L, PR #2600), vérifié le 18/09/2026. |

## #2502.1 — mesure de ce qui reste (retenu, hors budget de ce lot)

Recherche exhaustive de `EmptyState` sous `apps/web/src/features/accounts/view/account-detail/**` :

**Ont déjà un geste de rechargement** (patron le plus riche : `ContactsEmptyState.tsx` —
raison nommée selon `lastSearchOutcome` + bouton "Actualiser" dédié) : Contacts, Sites
(`TabSites.tsx`, bouton mais raison générique fixe), Organigramme (les 3 endroits,
tous corrigés #2502 desormais).

**N'ONT AUCUN geste de rechargement** (message seul, ou navigation vers un autre
écran, jamais une relance de collecte) — à traiter dans un lot dédié, en réutilisant
le patron `ContactsEmptyState` plutôt qu'`OrgMapEmptyState` :
- `EmptyEvaluationCard.tsx` (évaluation) — titre + description, zéro action.
- `TabCoverage.tsx` — état d'ERREUR de chargement SANS bouton retry ; état « 0
  contact » navigue vers Contacts au lieu de relancer.
- `TabPartners.tsx` (liste partenaires) — `EmptyState` sans `action`.
- `TabProjects.tsx` — deux liens de navigation, aucune relance.
- `TabProofs.tsx` — 5 liens de navigation (`EmptyDoors`), aucune relance.
- `TabMissions.tsx` — un lien vers `/missions`, aucune relance (hors périmètre : la
  route `/missions` elle-même est explicitement exclue de ce lot).
- `TabMessages.tsx` — change d'onglet, aucune relance.
- `WatchInsightsPanel.tsx` / `WatchSignalTimeline.tsx` (veille) — distinguent déjà
  deux raisons chacun, mais zéro action.
- `ActionPlanBoard.tsx` (plan) — 4 raisons nommées dans `planAbsence.ts`, mais aucun
  bouton pour relancer l'analyse en échec.
- `PlanAttackSummary.tsx` — titre + description génériques, zéro action.
- `AttackAnglesSection.tsx` — geste dans le HEADER, pas co-localisé au bloc vide.

Aucune de ces 10 sections n'est dans le périmètre organigramme/couverture-contacts de
ce lot ; les traiter toutes dans un même lot dépasserait le plafond d'un lot
d'écrivain (≤ 40 points). Prochaine étape suggérée : extraire un composant partagé
(`SectionUnavailableState` ou équivalent) du patron `ContactsEmptyState`, l'appliquer
section par section, un lot par groupe de 3-4 sections.

## Gates

- `packages/contracts` vitest : 8/8 (nouveau fichier) + suite complète verte.
- `apps/api` jest ciblé `accounts.service.spec.ts` : 166/166 · `demo-coverage.spec.ts` +
  `demo-dataset.spec.ts` + `demo-org-graphs.spec.ts` : 157/157 · `org-graph-path-forms.spec.ts` : 16/16.
- `apps/api` `check-types:tests` (tsc) : propre.
- `apps/web` vitest ciblé : `OrgStructureSection` 4/4 · `TabOrganigramme` 20/20 ·
  `orgPeopleRefreshDiff` 3/3 · `OrgPeopleRefreshDiffCard` 3/3 · `i18n/parity.test.ts` 225/225.
- `apps/web` tsc `--noEmit` : propre.
- `prettier --list-different` sur tous les fichiers touchés : propre après un passage `--write`.

## Ce qui n'est pas fait, et pourquoi

- #2502.1 généralisé à toutes les sections : mesuré, listé ci-dessus, **retenu** —
  dépasse le budget d'un lot borné.
- Aucune recherche web fraîche n'est déclenchée par la revérification (#2554.1) :
  la phase 3 reclasse les contacts déjà connus (pas d'appel Apollo/Brave/Firecrawl
  dans ce chemin) — une vraie détection de départ suppose soit un signalement humain
  (`account_feedback`, déjà lu), soit `org_verify.py` (vérification UNITAIRE, hors
  périmètre d'un run complet). Le diff nomme donc « non confirmée », jamais « partie »
  — ce qui EST l'exigence de #2554.2, pas une détection de démission.
- Les arêtes (hierarchyEdges/influenceEdges) d'une personne non confirmée ne sont pas
  reportées dans le graphe fusionné — seul le nœud personne + son entité de
  rattachement survivent. Documenté dans `org-graph-refresh-diff.ts`.
