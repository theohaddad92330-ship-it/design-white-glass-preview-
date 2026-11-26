# Registre des points — LOT BH : le défilement ne navigue pas, l'onglet mort (#2588, #2589)

base : `ad014503d` — 18/09/2026. Branche : `fix/le-defilement-ne-navigue-pas-18-09`.

## Points traités

| Numéro | Demande en huit mots | Sujet | Mesure | État | Preuve |
| --- | --- | --- | --- | --- | --- |
| 2588.1 | un défilement à la molette redirige vers /chat | navigation involontaire au défilement, /missions et /consultants | Balayage statique complet de `apps/web/src` : tous les `navigate(` (107 fichiers), tous les `useEffect` qui en contiennent un, tous les gestionnaires `onWheel`/`onScroll`/`onFocus`/`onMouseEnter`/`IntersectionObserver`, tous les imports de `<Navigate>` (aucun, GA-27 n'a rien à attraper), tous les `history.back/go`. Aucun ne navigue sur un survol, un focus ou un défilement sans clic. Puis recette écran EN DIRECT sur `https://app.bellum-ai.com` (agent `recetteur`, session démo) : `history.pushState`/`replaceState`/`popstate` instrumentés, défilement molette simulé (vertical pur, puis avec composante horizontale, via CDP) sur `/missions` ET `/consultants` — aucune navigation, aucune entrée dans le journal, aucune erreur console. `overscroll-behavior-x` mesuré à `auto` (html ET body) sur les deux routes : rien ne bloquerait un swipe-back natif de trackpad si c'est lui le déclencheur, mais l'outil de recette (wheel CDP) ne reproduit pas fidèlement ce geste physique — ni confirmé, ni éliminé avec certitude | recetté | ÉCRAN PROD 18/09 (`474fcfa31`) : molette sur `/missions` puis `/consultants`, `location.href` relu avant et après — inchangé dans les deux cas, aucune redirection vers `/chat`. Non reproduit, cohérent avec le balayage statique qui n'avait trouvé aucune cause. |
| 2589.1 | brancher enfin le panneau opportunité mort dans ScopeDialog | sixième onglet du sélecteur de portée de Laura | `OpportunityOptions` (déjà écrit, déjà testé en pur — `chat-scope-opportunity.test.ts`, `useProjects()`/`scopeOpportunitiesFrom` déjà utilisés ailleurs) n'était appelé par AUCUN bloc JSX : six onglets rendus (`PRECISE_KINDS`), cinq panneaux branchés. Choix : brancher (option 1 du brief), pas retirer — le panneau est complet, gère chargement/erreur/liste vide nommée comme ses cinq voisins, et la donnée existe réellement (`GET /projects`, table `opportunities`, déjà classée SEEDÉE en démo). Test AVANT code : `ScopeDialog.test.tsx` échouait sur les 3 nouveaux cas (`TypeError: PRECISE_KINDS is not iterable` puis deux `TestingLibraryElementError` sur `scope-tab-opportunity`), les 19 tests existants restant verts — prouvé rouge pour la bonne raison avant le correctif | recetté | `apps/web/src/features/chat/scope/precise-kind.ts:20,22` (liste exportée, un seul endroit) ; `apps/web/src/features/chat/scope/ScopeDialog.tsx:247` (accroche `data-testid` par genre, indépendante de la traduction) et `:289-293` (bloc `precise === 'opportunity'` ajouté) ; `apps/web/src/features/chat/scope/ScopeDialog.test.tsx` (nouveau `describe` « #2589 chaque genre de PRECISE_KINDS a son panneau », itère la LISTE, pas six noms en dur) | ‖ Recette prod 18/09 (7e769e0ca) : onglet « Une opportunité » → champ de recherche + liste réelle (SAFRAN · detected + 3 items) ; le panneau n'est plus mort.

## Ce que j'ai mesuré qui contredit le brief

- Le brief proposait quatre pistes par coût croissant pour #2588 ; les quatre ont
  été instruites, aucune n'aboutit à une cause certaine côté JavaScript — y compris
  en poussant jusqu'à la recette EN DIRECT sur la prod (pas seulement statique).
  C'est la limite prévue par le brief lui-même (« si tu ne trouves pas la cause de
  façon certaine, ne pose pas un correctif au cas où ») : aucun code n'a été touché
  pour #2588.
- Rien d'autre mesuré ne contredit le brief pour #2589 : le panneau était bien
  complet et juste, seul le dernier saut manquait, exactement comme annoncé.

## Portes passées

`npx vitest run src/features/chat src/features/missions src/features/consultants src/architecture src/i18n` (4261 tests, 0 échec) ·
`npx vitest run --dir packages/contracts` (5483 tests, 0 échec, lancé depuis `packages/contracts/`) ·
`pnpm --filter @bellum/web lint` (0 erreur, 304 warnings pré-existants, aucun sur les fichiers touchés) ·
`pnpm lint:exports:types` (knip, aucun export mort) ·
`python3 tools/registres/coherence.py` (10844 points, cohérence OK).
