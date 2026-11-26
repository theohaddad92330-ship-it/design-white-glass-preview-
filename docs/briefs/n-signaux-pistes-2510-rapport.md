# Rapport — Lot N-SIGNAUX-PISTES (#4545, 25/10/2026)

Branche `claude/n-signaux-pistes-2510`, base `origin/main`. Pas de PR.

## Ce qui est décidé, écrit, daté

**Revient sur #4340 (19/10/2026)** — « les pistes vivent dans Signaux » — sur décision de Louis du 25/10/2026.
**Garde #4197 L6** (pas d'onglet, pas d'adresse `/projects/pistes`) et **#4191** (le Pipe ne garde que le compte, sur
une ligne). L'ancre `#pistes` (#4340, conservée le 23/10 pour `/mes-cibles`) disparaît. Un signal est un fait daté,
une piste un besoin déduit : c'est un encombrement d'écran, pas un doublon de données.

## Ce qui a été fait

- `/signals` ne monte plus la section (`SignalsLibraryPage`, et `TargetListsContent` qui la montait aussi — deux
  sites de montage, pas un). `PistesSection` n'avait plus aucun appelant : **supprimé**. `PistesBoard`, `PistesCount`,
  le calcul et `usePistesToReview` sont **intacts**.
- Destination = le panneau du Pipe, ouvert par l'URL `/projects?pistes=1` (même patron que `?create=1`, lu au
  niveau de la page : s'ouvre aussi quand le Pipe est vide). Nouveau fichier `pipeline-detections/view/PistesDrawer.tsx`
  (le `Sheet` qui vivait dans `PipelineDetectionsLink`, déplacé ; aucune page, aucun onglet, aucune route).
- **Les cinq chemins** (un test chacun) :
  1. `/projects/pistes` (`routes/projects/$id.tsx`) et `/projects?lens=portfolio` → `/projects?pistes=1`
     (`crm-redirects.test.ts`).
  2. `/mes-cibles#pistes` → `/projects?pistes=1` ; `/mes-cibles` nu → `/signals` (décision du 23/10 gardée, voir
     question 1) (`crm-redirects.test.ts`).
  3. Bouton d'arrivée du Pipe vide (`ProjectsPage.tsx`) → pose `?pistes=1` (`ProjectsPage.emptyState.test.tsx`).
  4. Pilotage, « N pistes à revoir » (`DecisionStrip.tsx`) → `/projects?pistes=1` (`DecisionStrip.test.tsx`).
  5. Lien de retour du panneau → `/signals` sans ancre ; ligne « N pistes à revoir » du Pipe → pose `?pistes=1`
     (`PistesDrawer.test.tsx`, `PipelineDetectionsLink.test.tsx`).
- **Chemins trouvés par `git grep`, non listés au brief, qui seraient tombés dans le vide** : `IntakeQueueLink`
  (« Ouvrir la file de qualification », dans le périmètre `projects/`) et `ProjectionResults` de Découvrir
  (`features/discover/`, **hors périmètre** : une ligne, re-ciblée quand même — voir question 2).
- Droits : `PistesDrawer` ne s'ouvre pas sans la fonction `needs` (celle du Pipe) — test de REFUS
  (`PistesDrawer.test.tsx`). Le rôle change l'ordre, jamais le contenu : aucun filtrage de rôle ajouté.
- i18n : `projects:pistes.sortHint` (orphelin, ex-en-tête de section) retiré en `fr` ET `en`. `pistes.heading`
  reste (libellé du tableau).
- Garde remplacée, pas supprimée : `tabs-removed-19-10.test.ts` affirme désormais que Signaux ne monte plus aucune
  piste et que `ProjectsPage` monte `PistesDrawer` → `PistesBoard`.

## Le compteur « 0 piste à revoir » — cause et correction

`pistes_to_review` compte les **détections à confirmer** ; le tableau montre aussi les **besoins par compte**.
Sur la capture : 0 détection, 2 708 lignes. Correction locale dans `PistesCount` : zéro se tait (une absence ne
fait aucune ligne, GA-18/19). **`usePistesToReview` n'est pas modifié** : Pilotage et le Pipe disent le même nombre.

## Les puces — PAS de fusion (cas du brief : « tu ne fusionnes pas et tu l'écris »)

En lisant `PistesBoard.tsx`, les deux paires ne sont **pas** identiques : `ready` = aucun manque (besoin `pain`
ET offre rattachée) ; « Avec ton offre » = offre non nulle, quel que soit le stade. Cas qui les séparent :

- un besoin **déduit** (`implication`) rattaché à une offre d'angle : « Avec ton offre », mais pas « Prête » ;
- une **détection** à revoir : « À qualifier », mais ni « Avec ton offre » ni « Sans offre rattachée ».
  Preuve : `PistesBoard.test.tsx` (« NE FUSIONNE PAS ») — Prêtes 1 / Avec ton offre 2 / À qualifier 3 / Sans offre 1.
  Le 461 = 461 et 2 247 = 2 247 de la capture est la coïncidence d'un parc sans détection ni besoin déduit offert.
  **Les quatre puces restent.** À décider par Louis si la redondance apparente gêne : renommer, pas fusionner.

## Mesures

Non mesurables depuis ce conteneur (pas d'accès à la production) : 2 708 lignes, compteur à 0 et puces
461/461/2 247/2 247 sont **repris de la capture du brief**, non revérifiés.

## Démo (règle n°9)

Aucune table ni clé `raw_analysis` ajoutée ou retirée → `demo-coverage.ts` inchangé. Même semence
(`DEMO_SG_COMPLETE_LEAD` et voisines) ; `demo-crm-nav.ts` ré-adressé `/mes-cibles#pistes` → `/projects?pistes=1`
(`demo-crm-nav.spec.ts` vert). `/signals` en démo garde sa liste de signaux (section retirée, pas un écran vidé).

## Gates ciblés lancés

vitest (apps/web) : crm-redirects, tabs-removed-19-10, DecisionStrip, IntakeQueueLink, ProjectionResults,
ProjectsPage.emptyState, SignalsLibraryPage, TargetSignalsSection, PistesOneNumber, OpenNeedsAffairesMoves,
PistesBoard, PistesPage.count, PistesDrawer (5 tests, rouge → vert), PipelineDetectionsLink : verts. Gardes
d'architecture : laura-context-coverage, clé i18n dynamique, route de premier niveau, pipeline-total, signal sur
toute sa largeur : 40/40. api : `demo-crm-nav.spec.ts` 5/5. Pour lancer les specs j'ai construit
`@bellum/{contracts,utils,errors,http,events,observable,shared,consent,email}` (`tsc --build`, `dist/` ignoré par git).
`cd apps/web && npx tsc --noEmit -p .` : **0 erreur** (exit 0).

## Questions

1. `/mes-cibles` **nu** : le brief le range avec les cinq chemins vers le panneau ; j'ai gardé `/signals` (Louis
   23/10 : Signaux remplace Mes cibles) et envoyé seule l'ancre `#pistes` au panneau. Une ligne à changer si tu veux
   le panneau pour tout `/mes-cibles`.
2. Fichiers hors liste touchés : `features/discover/view/ProjectionResults.tsx` (+ son test), `components/navigation/
sections.ts` (commentaire seulement), `apps/api/src/modules/demo/demo-crm-nav.{ts,spec.ts}` (adresse de démo). Sans
   eux : un lien mort, et le test de démo qui visait une ancre disparue.
3. Non lancés (hors budget de la VM) : `pnpm lint:exports:types` (knip), garde GA-26 complète — à la CI.

[lot-fini] claude/n-signaux-pistes-2510
