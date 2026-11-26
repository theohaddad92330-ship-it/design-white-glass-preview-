# Lot BP — la porte des Réglages tombe au chargement direct

base : 7b9083854 — 18/09/2026
branche : fix/la-porte-des-reglages-tient-au-chargement-direct-18-09

| #      | Demande (≈8 mots)                                                | Sujet                                          | Mesure                                                                                                                                                                                                                                                            | État | Preuve                                                        |
| ------ | ----------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | -------------------------------------------------------------- |
| 2593.1 | La porte des Réglages tient au chargement direct                  | `apps/web` — `/settings`, `/integrations`, `/billing` via `SettingsPage` | Recette prod 18/09 sur `7b9083854` : `/settings` et `/integrations` rendent « Oups. » au chargement DIRECT, console `Error: useSidebar must be used within a SidebarProvider. at useSidebar … at SidebarMenuButton`. Guet-apens mesuré : reproduit UNIQUEMENT hors provider (menu → `/settings` sans rechargement = zéro erreur). | recetté | ÉCRAN 18/09 en prod fb3fb6200, chargement DIRECT des trois URL : /settings h1 « Préférences » 42 interactifs, /integrations h1 « Bellum peut aller plus loin… » 102, /billing h1 « Facturation » 72 — zéro erreur console, sonde de mise en page vide (n=116/509/365) |
| 2593.2 | SidebarMenuButton appelle useSidebar sans filet, quatrième appelant | `packages/ui/src/components/sidebar.tsx` — `SidebarMenuButton` | `git grep -n "useSidebar()" packages/ui/src apps/web/src` avant correctif : ligne 570 (`const { isMobile, state } = useSidebar()`), APPELÉ par `SettingsNavbarBody.tsx:57` dans `MobileShell` (hors `SidebarProvider`) — le seul des trois qui PORTE le lien de navigation, ne peut donc pas rendre `null`. | recetté | CODE — sidebar.tsx:606 useSidebarOptional, appelants réels AppSidebar.tsx:165,285 + SettingsNavbarBody.tsx:57 — origin/main 7e769e0ca |
| 2593.3 | SidebarTrigger appelle useSidebar sans filet, aucun appelant réel  | `packages/ui/src/components/sidebar.tsx` — `SidebarTrigger` | `git grep` avant correctif : ligne 326. Zéro appelant dans `apps/web/src` ou `packages/ui/src` au 18/09/2026 (`git grep -n "SidebarTrigger" apps/web/src packages/ui/src` ne rend que sa propre définition/export) — défaut dormant, prêt à mordre le prochain appelant. | recetté | CODE — sidebar.tsx:341 useSidebarOptional ; aucun appelant réel (constat du registre confirmé), garde sidebar.no-unsafe-usesidebar.test.ts:105 |
| 2593.4 | SidebarRail appelle useSidebar sans filet, aucun appelant réel     | `packages/ui/src/components/sidebar.tsx` — `SidebarRail`   | `git grep` avant correctif : ligne 348. Même constat que 2593.3 : zéro appelant au 18/09/2026.                                                                                                                                                                   | recetté | CODE — sidebar.tsx:366 useSidebarOptional ; aucun appelant réel, garde sidebar.no-unsafe-usesidebar.test.ts:132 |

## Ce que le balayage `git grep -n "useSidebar\b" apps/web/src packages/ui/src` a trouvé

Avant correctif : **3 appelants non optionnels** de `useSidebar()` (la version stricte), tous dans
`packages/ui/src/components/sidebar.tsx` — `SidebarTrigger:326`, `SidebarRail:348`,
`SidebarMenuButton:570`. Zéro appelant non optionnel hors de ce fichier : `apps/web/src` n'appelle
`useSidebar()` nulle part (déjà `useSidebarOptional` partout, legs des trois correctifs précédents —
voir `SidebarCollapseToggle.tsx:22-31`, `useSidebarCollapsePreference.ts:35-53`).

## Réponse choisie

**Les deux, comme le brief l'envisage** :

1. Les trois appelants restants de `packages/ui` passent à `useSidebarOptional()` (réponse 2 —
   « aucun composant de `packages/ui` n'appelle `useSidebar()` sans filet »). `SidebarTrigger` et
   `SidebarRail` (repli de barre, aucun appelant réel) rendent `null` sans fournisseur — rien à
   replier. `SidebarMenuButton` (porte le LIEN de chaque entrée de nav) rend TOUJOURS son contenu ;
   seule l'info-bulle dépend du contexte.
2. Vérifié — pas touché, car déjà correct (réponse 1) : `MenuLayout` (`packages/ui/src/layouts/
   menu-layout.tsx:19`) monte TOUJOURS un unique `SidebarProvider`, jamais deux imbriqués : la
   branche desktop de `SettingsPage` (`MenuPage`) et la branche mobile (`MobileShell`, sans
   provider) sont mutuellement exclusives (`if (isMobile) { … } return <MenuPage …>`), donc aucun
   risque de double montage en venant du menu. La porte du gabarit desktop n'avait pas besoin de
   réparation ; c'est la résilience du HOOK qui manquait pour le cas mobile.

## Gardes — TDD

1. **Par le hook** (`packages/ui/src/components/sidebar.no-unsafe-usesidebar.test.ts`) : lit tout le
   source de `packages/ui`, refuse tout appel `useSidebar()` non filtré. **Rouge avant correctif**
   (3 appelants listés dans le message d'assertion), **verte après**. Contrôles « sait dire NON »
   et « n'attrape pas ce qu'elle ne vise pas » (commentaires, `useSidebarOptional()`) inclus.
2. **Par la route** (`apps/web/src/architecture/chaque-route-de-premier-niveau-survit-au-chargement-
   direct.test.tsx`) : lit `routeTree.gen.ts`, dérive les routes de premier niveau qui rendent la
   coquille `SettingsPage` (jamais une liste écrite à la main), les monte une à une (routeur réel,
   deux largeurs). **Rouge avant correctif** sur `/settings`, `/integrations`, `/billing` À
   TÉLÉPHONE (`MobileShell`, sans provider) ; `/dashboard` (coquille `CustomerPage`, non concernée)
   sert de témoin et reste vert dans les deux états — preuve que la garde ne crie pas sur tout.
   **Verte après correctif**, les deux largeurs, les trois routes.

Corpus RÉELLEMENT monté restreint aux routes qui rendent `SettingsPage` (dérivé du source, pas
énuméré) : monter chaque route de premier niveau pour de vrai suppose de doubler chaque hook métier
qu'elle appelle, sans quoi le double générique de `fetch` (`{}` pour toute requête) fait tomber des
écrans pour des raisons SANS RAPPORT avec #2593 (`signals.map`, `sectors.map`… ne sont pas des
tableaux) — un chantier séparé. La protection GÉNÉRALE, sans cette limite, est la garde par le hook
(ci-dessus), qui couvre `packages/ui` entier quelle que soit la route qui l'appelle.

## Gates — état à la fin

- `packages/ui` : `vitest run --dir packages/ui` → 5 tests, vert ; `tsc --noEmit -p tsconfig.json` → vert (ajout `exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"]`, même motif que `packages/contracts`)
- `apps/web` : `vitest run src/routes src/components/sidebar src/features/settings src/features/mobile src/architecture src/i18n` → 2290 tests, vert ; `tsc -p tsconfig.json --noEmit` → vert
- `packages/contracts` : `vitest run` → 5526 tests, vert
- `pnpm --filter @bellum/web lint` → 0 erreur (307 warnings pré-existants, aucun nouveau hors un `import()` type annotation déjà répandu ailleurs)
- `pnpm lint:exports:types` (knip) → vert
- `python3 tools/registres/coherence.py` → 10844 points lus, cohérence OK

## Ce qui n'est pas fait

- Le corpus de la garde « par la route » ne couvre pas les ~27 routes de premier niveau (seulement les 3 qui rendent `SettingsPage` + 1 témoin) : les ~24 autres exigeraient chacune leurs propres doubles de hooks métier, hors périmètre de #2593. Documenté dans le docblock du fichier de test.
- Aucune autre régression de la même famille cherchée ailleurs dans le dépôt (ex. `useContactEngagement` sur `/contacts`, croisé par hasard pendant la mesure, PAS d'appelant `useSidebar` — hors périmètre, non touché).
