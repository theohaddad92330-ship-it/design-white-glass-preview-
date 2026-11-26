# Rapport — lot DÉCOUVRIR-NEUTRE-MA-CIBLE (#4529 + #4530), 24/10

Branche `claude/discover-neutre-ma-cible-2410` (base `origin/claude/decouvrir-recolte-2410`), sans PR.
Tests : `tsc --noEmit -p apps/web` = 0 `error TS` ; vitest ciblé : 22 specs `Discover.*` + `discover-my-target`, `offer-territory`, `profile-size`, `autopilot-apply`, `Discover.test`, `DiscoverOverview` verts ; `src/architecture` entier = 242 fichiers / 2075 tests verts ; jest `demo-coverage` + `demo-discover-my-target-coverage` verts ; changelog (contracts) vert ; pre-push knip vert.
Pas fait : recette Chrome prod/démo clair+sombre (#4529 recette, #4530.10 non vérifié en navigateur).

## #4529

- .1 FAIT — plus de semis de zone (`nextSeededZone` retiré), plus de `applyProfileZone` au lancement ; sans `?context` Découvrir envoie `contextMode: 'neutral'` explicitement (test). La tranche n'était déjà plus posée (#4516.7 : `proposeProfileSize` ne fait que PROPOSER, inchangé).
- .2 FAIT — URL `?region=…` gardée (test) ; `?context=…` conservé ; relais Laura / recherche enregistrée passent par le même prefill.
- .3 FAIT — pistes et « Ma cible » posent zone/secteurs au choix (pistes inchangées).
- .4 FAIT côté données — l'arrivée est la page sans requête ; entrée `DEMO_DISCOVER_MY_TARGET_COVERAGE` (seedée) + spec qui prouve le profil démo. Résultats démo en Neutre non vérifiés en navigateur.
- .5 FAIT — API, `default_context_mode`, Laura non touchés.

## #4530

- .1 FAIT — `MyTargetToggle` dans l'en-tête de la carte d'exploration (`aria-pressed`, `min-h-11`, `<button>`) ; désactivé seulement pendant la lecture du profil/portefeuille.
- .2 FAIT — `poseMyTarget` (réutilise `applyPlanToFilters`) + `contextMode=my_activity` dans l'URL ; secteurs/zone/catégorie/niveau dans les puces.
- .3 FAIT — `retireMyTarget` : retire les valeurs posées par le bouton, garde celles posées à la main ensuite (test).
- .4 FAIT — chaque bascule appelle `launch` (volume et URL suivent le nouveau mode).
- .5 FAIT — `StartingPoint`, `DiscoverSidebar`, « Ce que Bellum a compris » retirés ; `SaveSearchDialog` reste dans `DiscoverSidebar.tsx`.
- .6 FAIT — appel `SurfaceContextChip` retiré de Découvrir seul (garde `surface-context-chip-placement` mise à jour) ; `?context=one_off_mission` toujours lu (bouton non activé).
- .7 FAIT (test). .8 profil démo seedé (spec). .9 FAIT : > 5 secteurs → dialogue de choix, rien coupé (test, #3528 gardé).
- .10 non vérifié en navigateur : jetons du thème uniquement (accent), pas de couleur en dur.
- i18n FR+EN : `overview.myTarget` ajoutée ; mortes retirées : `sidebar.icp*`, `sidebar.sectorsNotSearched`, `sidebar.zoneUnrecognized`, `profileZone.*`, `autopilot.{title,description,remove,editable,appliesTitle}`. Changelog `2026-10-24-decouvrir-ma-cible`.

## Revient sur / garde (aussi dans les commits)

Revient sur LUDB.2 (arrivée), #3659/#2488 (ce bouton), LC.6 « Ce que Bellum a compris », G-FIX zone du profil (sans objet : plus de zone semée). Garde #2621, #3528, #2454.4, #4516.7.

## Atteint seulement par les blocs retirés (perdu sur Découvrir)

- Lien « Renseigner mon profil » vers `/settings/profile` (profil vide) — non reporté.
- Entrée du mode « Mission ponctuelle » et phrase « Cette recherche utilise ton profil… » (puce de contexte) — lecture d'URL gardée.
- Notices « zone non reconnue » (F.1) et « secteurs du profil non cherchés » (D.2) ; bloc « Aussi dans ta cible » ; repli « sur quoi Bellum a choisi » (profil inexploitable : le bouton ne pose alors rien, il passe seulement en `my_activity`).
- Code mort retiré : `AutopilotPanel.tsx`, `nextSeededZone`, `applyProfileZone`, `ProfileZoneNotice`, `planWithout` (+ leurs tests, 8 specs `DiscoverSidebar.*`/`icpApplyOpensRail`).
- Laissés (orphelins, testés) : `unrecognizedZones`, `profileSectorsNotSearched`, clés `autopilot.{basis,criteria,origins,also}` — à décider.

## À savoir / décisions prises

- Activer « Ma cible » REMPLACE les secteurs/effectif déjà dans le rail (comportement de `applyPlanToFilters`, comme l'ancien « Appliquer ») ; le re-clic ne les restaure pas.
- `?context=my_activity` ouvre le bouton activé SANS poser de critères (ce sont ceux du lien) ; le re-clic ne retire alors rien, repasse en Neutre.
- Neutre = absence de `?context` dans l'URL. Un ancien lien sans `?context` ouvre donc en Neutre (avant : défaut d'espace).
- Hors périmètre listé, nécessaire : 1 ligne retirée de `apps/web/src/test/tests-node.generated.ts` ; exceptions/étiquettes de 3 gardes `architecture`/`i18n`.
- Les `dist` des paquets `packages/*` ont été construits localement pour lancer vitest (non commités).
