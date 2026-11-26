# Rapport — FIX-RECETTE-F2 (25/10)

## #4286.12 — le détail d'un signal nomme son demandeur

**Le calcul ET l'appelant existaient** (`derive_offer_requester` côté IA, `OfferRequesterLine` appelé par la carte et par le détail). Le défaut était le RENDU du détail :
l'état « à identifier » écrivait une ligne (+ méthode) alors que la décision est « inconnu = aucune ligne », et un demandeur étayé par une équipe seule ne contenait jamais le mot « demandeur ».
Fichiers : `features/watchlist/view/WatchlistSignalDetail.tsx` (+ test), `i18n/locales/{fr,en}/watchlist.json`. Tests : 2 rouges → verts (à identifier = zéro ligne ; équipe seule nommée avec sa preuve « D'après le texte de l'offre »).
Non fait : si DARTY GRAND EST n'est pas une offre `hiring`, la collecte ne compose aucun demandeur — c'est de la donnée, pas du rendu ; non vérifiable depuis la VM (pas d'accès prod).

## #4291.8 — un projet gagné est suivi comme mission

**Le lien existait (`missions.opportunity_id`, `useMissions({accountId})`, route `/missions/$id`) ; l'appelant manquait** : `ProjectRow` ne porte que `has_mission` (booléen), et les deux écrans de détail menaient à la LISTE `/missions?accountId=`, sans nom.
Fichiers : `features/projects/model/project-mission.ts` (`missionOfProject`, calcul pur), `features/projects/view/ProjectMissionLink.tsx` (nouveau), branchée dans `ProjectPropertiesContent.tsx` et `ProjectDossierPage.tsx` ; clé `detail.trackedAsMission` fr/en.
Tests : `project-mission.test.ts` (4, dont 3 « sait dire NON »), `ProjectMissionLink.test.tsx` (3), `ProjectPropertiesContent.test.tsx` (+2).
Comportement : mission retrouvée → « Suivi comme mission — <nom> » cliquable vers sa fiche ; sinon (chargement, droit absent, autre projet du même client) le geste d'avant. Sans mission, « Créer la mission » inchangé. Aucune mission créée.
Démo : le semis lie déjà ses missions à leur affaire gagnée (`demo-crm-links.ts`, `opportunity_id`) — rien à semer.
Non fait : les cartes Kanban « Gagnée » ne portent pas le lien (le brief vise le détail ; la carte ne connaît que `has_mission`). Un `mission_id`/`mission_label` sur `ProjectRow` serait dans `packages/contracts` — hors périmètre, à décider.

## #4294.7 — « Déjà travaillées » croise le secteur dans Découvrir

**Le prédicat existait côté cadrage d'analyse (`AnalysisPersistenceService.workedSirens`, client / affaire gagnée / mission) ; l'appelant manquait dans Découvrir** : aucun filtre de la rubrique Relation, et aucun fait « travaillé » sur le candidat (seul `portfolioState` existait, où « analysé » n'est ni une relation ni une mission).
Fait : prédicat extrait en UN endroit (`apps/api/src/modules/accounts/account-worked.ts`, GA-26) et lu par `workedSirens` ET par `DiscoverPortfolioService.workedAccountIds` (une requête par page, calculé à la lecture, jamais écrit ; panne → ensemble vide, l'état portefeuille reste). Le candidat porte `workedBefore: true` (clé absente sinon). Web : `UnifiedFilters.workedOnly`, `passesWorked` dans `applyRailConstraints` (les DEUX modes, en ET avec secteur et le reste), puce « Comptes déjà travaillés » sous le champ « Déjà travaillées » de la rubrique Relation (`FilterRail`, fr/en), `FRAMING_FIELDS.relation`, compté dans `countActiveFilters`, ligne du cliquet GA-275. Aucun filtre retiré.
Démo : Cévennes Défense Systèmes (démo) est `customer` + `workedBefore` (secteur défense, vue par défaut) ; classé `DEMO_DISCOVER_WORKED_ACCOUNTS_COVERAGE`, garde `demo-discover-worked-accounts-coverage.spec.ts`.
Tests : discover-filters (+4, dont ET avec secteur et « sait dire NON »), FilterRail (+2), discover-portfolio.service.spec (+2, rouge puis vert), cliquet GA-275, démo (3).
Non fait / à savoir : (1) `workedBefore` n'est pas déclaré dans `discoverCandidateSchema` (`packages/contracts`, hors périmètre) — il traverse comme `qualification` ; à déclarer si on veut le parse strict. (2) Le filtre n'est pas encore dans l'URL / les préréglages (`discover-prefill`) : il vit dans le brouillon de la modale. (3) La case de barre d'outils « Masquer les comptes déjà clients ou déjà analysés » (`hideWorked`) est le contraire du nouveau filtre ; cochées ensemble elles donnent zéro résultat — deux formes différentes, mais à surveiller.

## #4433.9 — le même palier d'élargissement, sur les trois surfaces (PARTIEL)

**Le calcul ET le module existaient** : `widenToThreshold` / `SurfaceWidening` (`packages/contracts/src/schemas/surface-widening.ts`) et l'unique rendu `SurfaceWideningNotice` (`features/discover/view/WideningNotice.tsx`). Son titre DIT déjà la raison (« Moins de N résultats exacts… »), sa ligne le palier (« Élargi aux comptes déjà traités : 11 résultats »). Il est déjà appelé par la veille (`WatchlistBoard` → `buildWatchlistView`) et par l'analyse de compte (`OrgCoverageBanner`). **L'appelant manque pour la liste de cibles et l'onglet Veille d'une fiche.**
Fait (dans le périmètre) : le « 0 » des deux surfaces vues en prod est supprimé, via UN helper (`lib/count-label.ts`, `labelWithCount`) — liste de cibles : « 0 liste active », « 0 contact prêt », « Terminées · 0 »/« Archivées · 0 » ne s'écrivent plus (`TargetListsSection.tsx`) ; Veille d'une fiche : « En veille (0) », « Écartées (0) » → libellés seuls (`QualificationLeadsQueue.tsx`, clés `qualificationLeads.filters.*` rendues nues, fr/en). Tests : `count-label.test.ts` (2), `TargetListsSection.test.tsx` (1 modifié — il enterrait « 0 contact prêt » —, +1), `QualificationLeadsQueue.test.tsx` (+1).
**NON fait, et pourquoi** : brancher `SurfaceWideningNotice` sur la liste de cibles et la file Veille exige un palier qui n'existe pas. `SURFACE_WIDEN_TIERS` (contrat partagé, hors périmètre) ne connaît que `watch_intent` (« comptes déjà traités ») et `contacts_neighbour_roles` ; le réutiliser pour « listes terminées » ou « pistes en veille » ferait dire au bandeau un mot faux. Il faut deux paliers neufs dans `packages/contracts` (+ libellés `discover:widening.surface.tier.*`) AVANT de câbler : décision à prendre. Autre point à trancher : élargir la file Veille aux pistes « en veille » défait une décision de la personne (une mise en veille est un geste) — je recommande plutôt de déplier les pistes « sans source datée » (déjà repliées par `splitLeadsByProof`).

## #4292.2 — le badge « Décideur » sur l'onglet Accès (AUCUN CHANGEMENT DE CODE)

**Le rendu, la donnée et le semis de démo existaient déjà ; rien à écrire.** Tranché, couche par couche :

- Rendu : `TabAccess.tsx:1109` pose `<DecisionMakerBadge role={item.decisionRole} />` sur chaque voie personnelle — le MÊME composant que les cartes de comptes ; test `TabAccess.personalPaths.test.tsx` (9 verts, dont #3777 : un décideur porte la pastille, un autre rôle ou un rôle inconnu rien).
- Donnée : `account-access.service.ts:729` (voies à lien déclaré, `c.decision_role`) et `:833` (changement de poste, `// #4292.2`, rapprochement par nom unique) ; type `PersonalAccessPath.decisionRole` dans `packages/contracts`.
- Démo (craft rule n°9) : Société Générale porte deux voies NOMINATIVES vers des contacts `economic` (Pierre Palmieri — ancien collègue, vérifié ; Lorenzo Bini Smaghi — ancien manager), `DEMO_PERSONAL_ACCESS_PATH_SEED_SPECS` → `seedPersonalAccessPaths`, classé `DEMO_PERSONAL_ACCESS_PATHS_COVERAGE` ; la garde `demo-coverage.spec.ts` « RV4-E-FIX 4292.2 — une voie semée mène à un décideur » est verte (relancée).
  **Donc l'absence vue en prod sur Guerbet, JCDecaux, Infovista, Accor est une absence de DONNÉE** : aucun lien personnel n'a été déclaré (`introduction_authorizations`) ni aucun changement de poste détecté sur ces quatre comptes — l'onglet n'a rien à nommer, et ne doit rien inventer. Pour le prouver en prod : déclarer un lien sur un contact décideur de l'un d'eux. Non fait volontairement : nommer une personne dans le libellé du changement de poste de démo (« Ancien collègue arrivé… ») pour exercer le rapprochement par nom — ce serait attribuer un fait fictif à une personne du registre.

## Gates et bilan

`tsc --noEmit` web : 0 erreur (compté). API : 3 erreurs, toutes `Cannot find module '@bellum/email'` (paquet workspace non construit dans cette VM, fichiers non touchés), aucune dans les fichiers du lot. `git diff --check origin/main...HEAD` : vide. Tests ciblés lancés (rouge → vert pour 1, 2, 3, 4) : WatchlistSignalDetail, ProjectMissionLink/ProjectPropertiesContent/ProjectDossierPage/project-mission, discover-filters/framing/FilterRail/GA-275/i18n parité, discover-portfolio.service/analysis.persistence/demo (worked-accounts + coverage), TargetListsSection, QualificationLeadsQueue, count-label.
Ce qui reste à décider (contrats, hors périmètre) : deux paliers neufs dans `SURFACE_WIDEN_TIERS` pour câbler le bandeau sur la liste de cibles et la file Veille (#4433.9) ; `workedBefore` / `mission_id` dans les schémas partagés (#4294.7, #4291.8).

[lot-fini] claude/fix-recette-f2-2510
