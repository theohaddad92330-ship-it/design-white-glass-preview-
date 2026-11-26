# Lot 687 — EPOPEE #4923 lots 3-4 (#4923.12 à .16)

Périmètre : apps/web/src/features/accounts/view/account-detail/tabs/TabCoverage.tsx, apps/web/src/i18n/locales/fr/accountDetail.json, apps/ia/app/services/contact_ranking.py, apps/ia/app/services/contact_themes.py, apps/ia/app/services/classification.py, apps/ia/app/eval/**, apps/ia/tests/**, apps/api/src/modules/analysis/segment-catchup.service.ts, apps/api/src/modules/analysis/segment-catchup.service.spec.ts, apps/api/src/modules/admin/**, apps/api/src/modules/demo/**, packages/contracts/src/schemas/segment-catchup.ts, packages/contracts/src/schemas/segment-catchup.test.ts, docs/briefs/\*\*

## Traité

- #4923.12 : cases vides de la matrice nommées « non trouvé par cette recherche » (jamais « absent chez le client », GA-259) + geste « Chercher ce rôle » par case, qui rejoue le scope famille × niveau existant.
- #4923.13 : une tête de famille cible passe devant à séniorité égale (un demi-point, jamais un palier) ; les places d'enrichissement lui sont réservées d'abord. Le rôle change l'ORDRE, jamais le CONTENU (c76).
- #4923.14 : rappel des têtes — plancher bloquant (`headRoles`), seuil 2/3 posé avant mesure (`headRolesTarget`), rubrique `tetes_conservees`.
- #4923.15 : capacité #4923 datée sur le segment `contacts` + rattrapage restreint à des comptes nommés (`account_ids`).
- #4923.16 : démo — matrice classée seedée, provenance `web_role_search` vide à dessein.

## Décisions touchées

Garde #4294 (libellés d'état de la grille de couverture : « à ouvrir » / « aucun contact » deviennent « non trouvé par cette recherche » — revient sur ces deux libellés, sur ordre de #4923.12), garde #4440 (spec du contrôleur de rattrapage : seule la fabrique du mock `runCatchup` change), garde #2543, #2655.1, #4465 (histoire du segment contacts inchangée), #2631.1 / c77 (le rappel des têtes complète le plancher de rôles sans le modifier). #4801 relue : aucune spec écrite, la matrice n'infère aucun lien hiérarchique.

## Droits

Aucune surface d'accès créée. La route admin existante `internal/admin/segment-catchup/contacts` (InternalSecretGuard, inchangé) gagne un paramètre optionnel `account_ids` qui RESTREINT le ciblage ; tests ajoutés (`admin-segment-catchup.controller.spec.ts`, `segment-catchup.service.spec.ts`).

## Non fait

L'Oréal n'a aucun jeu de référence committé (nommé « non mesuré », aucune donnée inventée). Le seuil de rappel n'est pas bloquant tant que le rattrapage n'a pas rafraîchi les fixtures. Provenance `web_role_search` non semée (aucune colonne, jamais nommée). Rubrique `organigramme.py` non étendue. Rattrapage non lancé (geste manuel, déploiement d'abord).
