# Brief écrivain — correctifs vus en recette prod (31/10/2026)

Dépôt `Bellum-AI/belllum-monorepo`, branche **`claude/correctifs-recette-31-10`** (déjà créée depuis main, ce fichier est dessus). Modèle Sonnet. **Plafond : 300 tours** — à 240, commit de ce qui est vert, push, rapport, stop.

Contrat VALIDÉ par Louis le 31/10/2026 — rien à redemander, tout est tranché ci-dessous. Si un point se révèle impossible sans une décision produit, écris-le dans le rapport et passe au suivant ; ne t'arrête pas.

## Ce que je fais — 9 défauts vus en production (prod = 4b48280d69)

| Point             | Écran / geste                                                          | Ce qui a été mesuré                                                                                                                                                  | Ce qui doit être vrai                                                                                                                                                                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #4523.1           | `/contacts/<id>` à 1512 px                                             | volet défilant 1280 px, scrollHeight 2632 pour 716 visibles ; colonne droite (x=1187, 290 px) s'arrête à y≈1088 puis ~1 500 px VIDES                                 | la colonne droite ne laisse pas un trou de 1 500 px : les blocs se répartissent pour que les deux colonnes finissent à peu près ensemble (ou la colonne droite est collante) ; mobile < 768 px inchangé (une colonne, ordre inchangé)                                                                  |
| #4594.1           | `/chat?conversationId=…` à 1512 px                                     | rangée de puces 348 px, overflow hidden, scrollWidth 640 ; 6 `[data-chip]` en display:none ; la 3ᵉ « Match… » tronquée contre « Voir tout »                          | aucune puce tronquée : celles qui ne tiennent pas passent sous « Voir tout », jamais à moitié                                                                                                                                                                                                          |
| (Kineis)          | `/accounts/cbbd1ecd…?tab=overview`, `/accounts/cab9a89b…?tab=overview` | l'URL est réécrite en `?tab=brief` ou `?tab=sites` → `TabOverview.tsx:469` (EntityResolutionPanel, avertissement « Filiale de X ») injoignable ; DECATHLON l'affiche | `?tab=overview` demandé explicitement reste sur l'aperçu pour tout compte ; trouve la règle qui redirige (garde d'onglet « vide ») et fais qu'elle ne s'applique pas quand l'aperçu a quelque chose à montrer (résolution d'entité ambiguë ou filiale)                                                 |
| #4345.2 / #4345.3 | tiroir d'affaire `/projects` ; `/consultants` ; `/missions`            | « Demander à Laura » navigue vers `/chat?prompt=…&accountId=…` et quitte la page alors que la bulle de Laura est disponible                                          | quand la bulle est montée, le bouton OUVRE la bulle avec le prompt et le contexte, sans changer d'URL ; repli `/chat` seulement là où la bulle n'existe pas. Cherche TOUS les jumeaux (`git grep -n "/chat?prompt"` dans apps/web/src)                                                                 |
| #2075.28          | `/welcome`, « Analyser un compte de mon audit »                        | boutons sans href, simple défilement, aucun paramètre                                                                                                                | le clic ouvre le parcours d'analyse PRÉREMPLI avec le compte de l'audit (même cible que le parcours d'analyse existant) ; un élément cliquable est un `<a>`/`<button>` tabulable (GA-32/35)                                                                                                            |
| #4517.1           | `/discover`, recherche « Albi »                                        | pendant ~10 s : « Interrogation du registre… » + 3 `animate-pulse` + 2 spinners simultanés                                                                           | UN seul indicateur de chargement visible à la fois pour une recherche                                                                                                                                                                                                                                  |
| #4527.3           | `/contacts?q=zzzqqxx`                                                  | héro « 0 » + tuiles « Avec e-mail 0 », « Avec téléphone 0 », « À rattacher 0 » au-dessus de « Aucun contact avec ces critères »                                      | liste vide ⇒ ni héro « 0 » ni tuiles à 0 ; seul l'état vide parle (doctrine : on n'affiche pas ce qu'on n'a pas, GA-18/19)                                                                                                                                                                             |
| #4530.3           | `/discover`, carte « Île-de-France »                                   | 1er clic : chip + « Tous les filtres 1 » ; 2ᵉ clic : inchangé                                                                                                        | le re-clic sur une carte active RETIRE son critère (bascule), « Tous les filtres » revient à 0                                                                                                                                                                                                         |
| #4744.1           | `/accounts/2543c75f…?tab=finance`                                      | 11 exercices, 11 « Date de clôture non publiée », 33 « Non publié »                                                                                                  | si la donnée stockée (`raw_analysis` / tables financières) contient la date de clôture ou la marge, l'écran l'affiche ; trace le champ de la source à l'écran. **Si la source ne la fournit vraiment pas, l'écran est déjà juste** : ne rien inventer, écris « déjà juste : <preuve> » dans le rapport |

## Je ne fais PAS

Aucune refonte d'écran, aucun contenu nouveau, aucun changement de droits, aucune migration, aucun appel réseau nouveau. Rien sous `.claude/`.

## Droits

Aucun accès modifié : mêmes rôles, mêmes routes. Si un correctif semble l'exiger, arrête ce point et note-le.

## Périmètre

`apps/web/src/**` · `apps/web/src/**/locales/**` (FR+EN) · `apps/api/src/modules/demo/**` (semis démo si un écran le demande) · `apps/api/src/modules/accounts/**` (#4744.1 seulement, lecture de champ) · `CHANGELOG*` · `docs/briefs/**`

## Méthode

- **TDD** : par point, un test qui ÉCHOUE sur le code actuel, puis le correctif (vitest + Testing Library). Pour les largeurs (#4523.1, #4594.1) jsdom ne met rien en page : teste la STRUCTURE (classes de grille/sticky, puces masquées entières plutôt que tronquées), et dis-le dans le rapport.
- Règles de design du dépôt (CLAUDE.md) : pas de hex en JSX, échelle typo, `dvh`, pas de `<Navigate>`, cibles ≥ 44 px, mouvement via `packages/ui/src/motion.ts`.
- Trace : `// #<point> — <raison>` à l'endroit du comportement.
- Commits par écran, numéros dans le sujet : `fix(web): … (#4527.3)`. **Push après chaque point.**
- Tests CIBLÉS seulement (≤ 5 specs par point, `npx tsc --noEmit -p apps/web` depuis `apps/web`). Suite complète, build, check-types racine = la CI, jamais ici.
- À la fin : ouvre la PR **prête** (pas draft) vers main, titre `Correctifs vus en recette prod 31/10 (#4523 #4594 #4345 #2075 #4517 #4527 #4530 #4744)`, corps = un tableau point → ce qui change → test. Fin du body : `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Rapport (≤ 15 lignes)

Branche + SHA final + n° de PR ; par point : fait / déjà juste / bloqué (raison) ; tests ajoutés. Puis stop — ne surveille pas la CI.
