# LOT O — #2545 : liste d'appels exploitable depuis /discover

base : 4de83342330489714e4681892f9585e8e90bf300 — 18/09/2026
branche : `feat/discover-liste-appels-18-09`

## Mesure — ce qui existe déjà (avant de coder quoi que ce soit)

- `apps/web/src/features/discover/lib/discover-result-rows.ts` — patron des
  « projections » (`needRowsFromCandidates`, `partnerRowsFromCandidates`) :
  une LECTURE de la même recherche, jamais une source neuve, et ce qui est
  laissé de côté est COMPTÉ (`withoutSignal`, `unresolvedNaf`). C'est le
  patron que #2545.1 reprend.
- `apps/web/src/features/discover/lib/discover-contact-rows.ts` — les
  PERSONNES sont déjà un type de résultat (`resultType: 'contacts'`), mais
  c'est un moteur À PART (`useDiscoverPeople`, recherche plein texte sur les
  contacts de l'ESPACE), déconnecté des candidats du registre. Les colonnes
  e-mail/téléphone y sont des BOOLÉENS par doctrine (« l'adresse fait sortir
  la liste vers une capture d'écran ») — décision qui vaut pour CET écran de
  navigation, pas pour un tableau d'appels dont la raison d'être est la
  coordonnée réelle. Je ne touche pas ce fichier ni sa doctrine.
- `apps/web/src/features/discover/lib/discover-export.ts` — patron d'export
  CSV (colonnes nommées, `null`/non mesuré jamais à 0). Repris pour #2545.3.
- `apps/web/src/features/discover/view/CoverageNotice.tsx` — funnel de
  COUVERTURE COMPTES déjà à l'écran : détectés (`candidatesFound`), examinés
  (`resolutionsAttempted`), rejetés (ambigus + injoignables), non examinés.
  C'est le funnel qui « remonte déjà jusqu'à l'écran ».
- `_assemble_coverage` (`apps/ia/.../org_graph_assembler.py:505-559`) — VÉRIFIÉ
  et ÉCARTÉ comme source pour #2545.4 : c'est la couverture de CONTACTS DANS
  L'ORGANIGRAMME D'UN SEUL COMPTE (discovered/deterministicClassified/
  llmEnriched), pas le funnel d'une recherche Découvrir. Rien côté web ne le
  lit aujourd'hui (aucun champ `DiscoverResponse` ne le porte). Le funnel
  déjà câblé à CET écran est celui de `DiscoverCoverage` (ci-dessus) : je le
  réutilise et je l'étends de deux comptages calculés CÔTÉ ÉCRAN (pertinents,
  enrichis), sans inventer un appel IA.
- `packages/contracts/src/schemas/contact.ts` — `contactLifecycleTallySchema`
  (`detecte/identite_verifiee/qualifie/enrichi/actionnable/...`) existe mais
  sert `/contacts` (badges globaux de l'espace), pas une recherche Découvrir
  précise : granularité différente, hors périmètre.
- Aucun « tableau d'appels » n'existe (`grep -rl CallList/tableau d'appel` :
  0 résultat pertinent). Aucune capacité à retirer.
- Bulk existants réutilisables : `useDiscoverShortlist` (Suivre / Écarter,
  UN candidat à la fois, portefeuille serveur) + `discover-selection.ts`
  (sélection multiple déjà câblée sur la vue Comptes). « Envoyer au vivier de
  travail » (client) = le MÊME geste que « Suivre » (ajouter au portefeuille,
  déjà un geste serveur) — je ne crée pas un troisième état : aucune valeur
  `ContactStatus` (`new/contacted/replied/meeting/refused/silence`) ne
  correspond à « vivier », et en inventer une serait une mutation d'état non
  demandée par l'utilisateur (interdit : « une correction humaine gagne
  toujours », rien n'écrit tout seul).

## Décisions de périmètre

- **#2545.1** : nouveau fichier pur `discover-call-list.ts` — joint les
  candidats VISIBLES (déjà filtrés à l'écran) et les contacts de l'espace
  (`useDiscoverPeople`, déjà chargés pour `resultType: 'contacts'`) par nom
  d'entreprise normalisé. Une entreprise qualifiée sans contact connu reste
  une LIGNE (jamais retirée), avec les colonnes personne nommées non
  mesurées. Plafond 10 contacts/entreprise (le nombre du client) ; l'excédent
  est COMPTÉ, jamais tu.
- **#2545.2** : filtres = réutilisation stricte de `DiscoverContactFilters` /
  `filterContactRows` (déjà testés) sur la portion personne de la ligne.
  Lot = bulk Suivre/Écarter sur la sélection de lignes (par entreprise),
  réutilisant `useDiscoverShortlist` — aucune écriture neuve.
- **#2545.3** : `discoverCallListCsv`, même patron que `discover-export.ts`.
- **#2545.4** : funnel calculé depuis `data.coverage` (détectés/vérifiés) +
  compte des lignes qualifiées/enrichies calculé sur l'écran (pertinents/
  enrichis). `coverage: null` (backend antérieur) → étape nommée non mesurée,
  jamais 0.
- **#2545.5** : AUCUN nouveau jeu de données à semer. `accounts` (recherche
  live, sources publiques réelles même en démo) et `contacts` (table SEMÉE,
  déjà classée) sont TOUS DEUX déjà classés dans `DEMO_DISCOVER_RESULT_TYPES`.
  La ligne à ajouter est `calls`, classée SEEDÉE avec sa raison propre : les
  comptes déjà semés (Société Générale, Thales, SNCF, Decathlon, BlaBlaCar,
  leboncoin) sont de VRAIES entreprises — une recherche Découvrir par leur nom
  les retrouve dans le registre réel, et le tableau croise alors ce résultat
  avec les contacts DÉJÀ semés du même compte. Zéro donnée nouvelle inventée.

## Fichiers touchés (prévu)

- `packages/contracts/src/schemas/discover-result-type.{ts,test.ts}` — 5e type `calls`.
- `apps/web/src/features/discover/lib/discover-call-list.{ts,test.ts}` — NEW.
- `apps/web/src/features/discover/view/CallListResults.{tsx,test.tsx}` — NEW.
- `apps/web/src/features/discover/view/ResultTypeSelector.tsx` — icône + libellé `calls`.
- `apps/web/src/features/discover/view/Discover.tsx` — branchement.
- `apps/web/src/i18n/locales/{fr,en}/discover.json` — `resultType.*.calls`, `callList.*`.
- `apps/api/src/modules/demo/demo-coverage.ts` — `DEMO_DISCOVER_RESULT_TYPES.calls`.

Hors périmètre confirmé : `apps/ia/**`, `/accounts`, `/consultants`, `/missions`, `/onboarding`.

## Livré

Tous les fichiers listés ci-dessus, testés (39 tests neufs/modifiés verts :
16 `discover-call-list.test.ts` + 6 `CallListResults.test.tsx` + 5 ResultTypeSelector
+ 5 Discover.resultType + 5 demo-coverage/demo-discover-result-types + 2 contrat).
Gates verts : `tsc` web et api (avec tests), `knip --include types,nsTypes`,
`prettier --list-different` sur les fichiers touchés, jest ciblé API (module demo,
53 tests). `⚠️` J'ai dû reconstruire `packages/contracts` (`tsc --build`) après avoir
ajouté `calls` — sans ça le `dist` consommé par le web restait périmé (silencieux,
aucune erreur, juste l'ancien vocabulaire).

Non fait, et pourquoi : rowSpan sur les colonnes entreprise pour une société à
plusieurs contacts (répétition acceptée, chaque ligne reste une action valide) ;
« envoyer au vivier de travail » n'est PAS un troisième état — mappé sur le geste
« Suivre » déjà existant (portefeuille), aucun état `ContactStatus` ne correspond
et en inventer un aurait été une écriture non demandée.
