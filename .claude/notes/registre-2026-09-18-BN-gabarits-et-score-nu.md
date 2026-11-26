# Lot BN — deux phrases que la Synthèse n'a pas fini d'écrire, et un score qui s'affiche nu

base : 7b9083854909461927b030685f83e598faa76607 — 18/09/2026
branche : `fix/la-synthese-finit-ses-phrases-18-09`

| numéro | demande en huit mots | sujet | mesure | état | preuve |
|---|---|---|---|---|---|
| 2592.1 | `{{axesCount}}` littéral, l'appel passait `count` | web | vu sur SAFRAN/ARQUUS ; garde d'interpolation neuve, rouge puis vert | recetté | `apps/web/src/features/accounts/view/account-detail/tabs/sections/DossierReadBlocks.tsx:96-99` (appel corrigé) ; `apps/web/src/i18n/interpolation-vars-supplied.test.ts` (garde générale, trouve aussi un 2e cas non listé au brief : `EnrichmentPlannerDialog.tsx:110`, corrigé au même geste) ‖ Recette prod 18/09 (7e769e0ca) : « {{ » cherché sur 17247 caractères (Vue d'ensemble 11214 + Score 6033, SAFRAN) : 0 occurrence. |
| 2592.2 | `{{fields}}` rend un nom de champ technique brut | web | vu sur SAFRAN/ARQUUS : « ... profil : references. » | recetté | mappage champ → libellé posé dans `apps/web/src/features/accounts/view/account-detail/tabs/sections/DossierReadBlocks.tsx:287-303` (`PROFILE_FIELD_KEYS` + `profileFieldLabel`), libellés dans `apps/web/src/i18n/locales/{fr,en}/accountDetail.json` sous `dossierRead.profileField.*` ; test corrigé pour partir des vrais noms de champs `apps/web/src/features/accounts/view/account-detail/tabs/sections/DossierReadBlocks.test.tsx:165-201` ‖ Recette prod 18/09 (7e769e0ca) : sur les mêmes 17247 caractères, aucun identifiant technique (legal_name, naf_code, snake_case) détecté. |
| 2118.48 | dossier ancien : score `/10` nu, axes absents | web | vu sur QONTO (18/07) et LATECOERE (04/08) : `noAxisBreakdown` s'affiche, son explication vivait en `title` (survol seul, jamais visible) | déjà là | `apps/web/src/features/accounts/view/account-detail/tabs/sections/BellumReadCard.tsx:206-225` (explication en `<Text>` visible + renvoi au rafraîchissement, jamais déclenché seul) ; test `apps/web/src/features/accounts/view/account-detail/tabs/sections/BellumReadCard.test.tsx` (describe `#2118.48`) ‖ trace `#2118.48` en code de production sur origin/main — balayage du 18/09/2026 |

## Ce que j'ai mesuré qui contredit le brief

- **`count` ne pilote aucun pluriel sur `unknownOutOfScore`** : la clé n'a pas
  de variante `_one`/`_other` (« axe(s) » est écrit en dur) — je l'ai laissé
  posé (inoffensif), et ajouté `axesCount`.
- **La garde générale, tournée sur tout le corpus (≈1100 fichiers), a trouvé
  327 candidats bruts** — 325 étaient des faux positifs légitimes :
  `{{brand}}`/`{{copilot}}` (fournis par `i18n/index.ts` `defaultVariables`,
  à CHAQUE interpolation, jamais au call site) et `{{firstName}}` (onze
  écrans, tous via `ScreenIntro.tsx` qui l'injecte lui-même par
  `.replace('{{firstName}}', …)`, design documenté et testé). Après exclusion
  documentée de ces trois, il restait exactement les 2 vrais bugs : `axesCount`
  (2592.1, dans le périmètre) et `{{matched}}` dans
  `EnrichmentPlannerDialog.tsx:110` (`launchSuccess_one/_other`, hors
  périmètre du brief mais même classe de bug — corrigé pour que la garde
  reste verte, sinon elle aurait été livrée rouge).
- **Point 3 — la démo ne porte aujourd'hui AUCUN dossier au format ancien**
  atteignable via `/accounts/<id>` : sur les 7 comptes de démonstration, 6
  portent `dossier_read` (Société Générale, Thales, leboncoin, BlaBlaCar,
  SNCF, Decathlon — confirmé par le log `DemoSeedService : 6/6 dossiers`), le
  7e (`DEMO_DELIVERY_CLIENT` / NOVA LOGISTIQUE) a un `raw_analysis: {}`
  volontairement vide pour une raison différente et documentée (barrière
  d'achat non vérifiable sur un compte réel) et ne route pas vers cet écran.
  La correction du point 3 est donc INVISIBLE dans la salle telle quelle. Je
  n'ai PAS semé un nouveau compte pour la rendre visible : modifier le jeu de
  données de démo est une décision à part (quel compte, quelle raison
  affichée dans `demo-coverage.ts`), risque des dizaines de specs
  `demo-*-coverage.spec.ts` croisées, et sort du périmètre borné de ce lot de
  correctifs. À trancher séparément si la salle doit porter ce cas.
- **`cd apps/ia && python3 -m pytest …`** : ce worktree n'a pas
  d'environnement Python installé (`ModuleNotFoundError: No module named
  'fastapi'` dès `conftest.py`) — aucun venv/uv trouvé dans ce worktree. Rien
  dans ce lot ne touche `apps/ia` (le mappage champ → libellé est posé côté
  écran, pas côté moteur, cf. 2592.2), donc pas de régression à ce niveau,
  mais la porte n'a pas pu être vérifiée telle quelle.
