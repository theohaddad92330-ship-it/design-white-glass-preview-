# Plan de migration design — unifier app, site, backoffice

**Statut : préparatoire.** Personne n'a dit « go ». Ce document existe pour que, le jour où le fondateur le dit, le
plan soit déjà mesuré, séquencé et gardé — pas à inventer en réunion. Rien ici ne modifie du code ; c'est un audit +
une proposition.

Mesuré le 25/09/2026, sur `bcf14defb1fe6dbbfd24bd472d240a1560ad4ce1` (`main`).

## 0. Ce qu'on migre, et vers quoi

Trois surfaces, trois systèmes de tokens indépendants :

| Surface                       | Stack                                   | Tokens                                                 | Discipline actuelle                                                                                                                                                                               |
| ----------------------------- | --------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web` (app)              | React + Vite + Tailwind + shadcn        | `apps/web/src/styles/tokens.css` (`--bellum-*`)        | Source de vérité déjà désignée (`packages/figma-sync/README.md`) ; 5 gardes CI dédiées                                                                                                            |
| `apps/website` (site)         | Next 14 + Tailwind + `@bellum/ui`       | `globals.css` (HSL shadcn + hex `--violet-*`/`--bg-*`) | Aucune garde de couleur/échelle                                                                                                                                                                   |
| `apps/dashboard-manager` (DM) | Next 14 + CSS modules **sans Tailwind** | `globals.css` (12 variables `--bg`/`--accent`/…)       | 1 garde CI (`couleurs-passent-par-un-token.test.ts`), mais **interdiction explicite et gardée d'ajouter Tailwind ou une librairie de composants** (`aucune-librairie-ui.test.ts`, décision #1642) |

Fait qui structure tout le reste du document : **le site importe déjà `@bellum/ui`** (70 fichiers, `Button`/`Card`/`Text`/…
via `from '@bellum/ui'`). Le site n'a donc **pas de composants dupliqués** au sens code — sa fourche est dans la
COUCHE DE TOKENS (son `tailwind.config.ts` résout `bg-primary` vers `hsl(263 70% 50%)`, celui de l'app vers
`--bellum-primary-500`) et dans des surcouches Tailwind arbitraires posées par-dessus (`packages/design-tokens` §2).
Le DM, lui, n'importe RIEN de `packages/ui` — c'est une décision produit gardée (#1642, « le manager reste léger »),
pas un oubli — et réécrit ses primitives à la main en CSS modules. C'est là qu'est la vraie duplication de code.

Cette asymétrie est la raison pour laquelle §2 recommande une seule option mais avec deux modes de consommation.

## 1. Inventaire mesuré

Toutes les commandes ci-dessous sont rejouables telles quelles depuis la racine du dépôt. Les gardes CI existantes
(citées) ont déjà leur propre mesure, datée ; quand une garde existe, sa mesure fait foi plutôt qu'un recomptage brut
(un `grep -c '#[0-9a-f]\{3,8\}'` brut compte aussi les références de ticket en commentaire, `#2419`, `#1907` — c'est
très exactement le faux positif que GA-248 et la garde du DM ont déjà dû corriger).

### 1.1 Couleurs en dur (hex/hsl/rgb hors tokens)

| Surface                  | Mesure                                                                                                                                                                                                                                                                                                                                                      | Source                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `apps/web`               | **0** couleur posée hors token dans le produit (983 `.tsx` hors tests, 2 exemptions nommées : logo Google, bandeau d'impersonation)                                                                                                                                                                                                                         | `apps/web/src/architecture/no-hardcoded-colors.test.ts` (GA-248), guard **verte** aujourd'hui                       |
| `apps/website`           | **131** occurrences de hex en dur dans une classe Tailwind (`text-[#8a8aa0]`, `bg-[#36e6a0]`, `from-[#4d9dff]`…), **19** valeurs distinctes ; + **26** hex et **12** `rgba()` dans les tokens de `globals.css` eux-mêmes (légitimes, ce sont les définitions)                                                                                               | `grep -rohE '[a-zA-Z-]+-\[#[0-9a-fA-F]{3,8}\]' apps/website/src --include="*.tsx" \| wc -l`                         |
| `apps/dashboard-manager` | **~20 littéraux hex** hérités dans 5 fichiers `.tsx` (dont 1 faux positif déjà purgé), contre **462** `var(--token)` — 96 % déjà propre. Palette de graphiques SVG non tokenisée (`charts.tsx`, `cockpit-panel.tsx`) : 6 couleurs. + 33 hex dans les `.module.css` (à mesurer plus finement, hors périmètre de la garde actuelle qui ne lit que les `.tsx`) | `apps/dashboard-manager/src/architecture/couleurs-passent-par-un-token.test.ts` (#1642), guard **verte** en cliquet |

### 1.2 Classes Tailwind arbitraires (`-[...]`)

| Surface                  | Mesure                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`               | 9 233 occurrences de `-[...]` — **mais 0 couleur** (voir 1.1) et 0 taille de texte hors les 2 exceptions nommées (voir 1.3). L'essentiel est légitime (dimensions de panneaux, graphes, colonnes) : GA-31/GA-250 ont déjà distingué l'arbitraire ILLÉGITIME (double un nom existant) de l'arbitraire nécessaire (`h-[220px]` d'un graphe) et gardent la différence.                                                                                                                                                                               |
| `apps/website`           | **556** occurrences. Répartition : `bg-[…]` 135, `text-[…]` 114, `shadow-[…]` 42, `backdrop-blur-[…]` 34, `rounded(-*)-[…]` 14, `blur-[…]` 16, `grid-cols/rows-[…]` 21, le reste (tracking, gradient `from/to`, position) 90. **0** taille de texte arbitraire (bonne surprise — l'échelle Tailwind par défaut est respectée pour le texte). 14 rayons arbitraires : `rounded-[9px]`×4, `[13px]`×3, `[10px]`×3, `[15px]`×2, `[14px]`×2 — aucun ne correspond à l'échelle de l'app (6/8/10/12/16 px) à l'unité près, donc pas un simple renommage. |
| `apps/dashboard-manager` | Non applicable (pas de Tailwind, #1642). L'équivalent est mesuré en CSS pur, §1.4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

### 1.3 Tailles de police hors échelle

| Surface                    | Mesure                                                                                                                                                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web` + `packages/ui` | **0** hors échelle Tailwind (12/14/16/18/20/24/30/36), plancher 12 px tenu. Mesure historique (23/08) : 15+13 tailles arbitraires, 388 occurrences sous 12 px — converties.                                                                                                                             | `apps/web/src/architecture/type-scale.test.ts` (GA-31), guard **verte**                                                        |
| `apps/website`             | 0 classe `text-[Npx\|rem]` (voir 1.2). 2 `fontSize:` inline en style JS (`14`, `18`) — dans l'échelle, mais en `px` numérique plutôt qu'en `rem` (même défaut que celui documenté par GA-31 pour le tableau de bord de l'app avant correction : ignore le réglage d'accessibilité « Taille du texte »). |
| `apps/dashboard-manager`   | **14 valeurs distinctes** de `font-size`, dont 3 sous le plancher D80 de 12 px : `9px`×1, `10px`×2, `11px`×7 (30 occurrences à 12px, 19 à 13px, 6 à 14px, 6 en `rem`, 3 à 26px, 2 à 16px, 2 à 12.5px, 1 à 20px, 1 à 1rem, 1 à 1.125rem). Aucune échelle nommée — chaque écran choisit son pixel.        | `grep -rhoE 'font-size:\s*[0-9.]+(px\|rem)' apps/dashboard-manager/src --include="*.css" --include="*.tsx" \| sort \| uniq -c` |

### 1.4 Rayons et ombres hors tokens

| Surface                    | Rayons                                                                                                                                                                                                                      | Ombres                                                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `apps/web` + `packages/ui` | 0 rayon arbitraire hors 2 exceptions nommées (`rounded-[inherit]`, la pointe d'infobulle `rounded-[2px]`) ; échelle à 8 noms (`rounded-none`…`rounded-full`)                                                                | Tokens `--shadow-card`/`--shadow-elevated`/`--shadow-glow-violet`, parité light/dark                                                                                         | `apps/web/src/architecture/radius-scale.test.ts` (GA-250), guard **verte** |
| `apps/website`             | 14 rayons arbitraires (1.2) + son propre jeu `--radius-sm/md/lg/xl` (6/10/14/20 px) qui **ne correspond pas** à celui de l'app (6/8/10/12/16 px — `lg` et `xl` divergent)                                                   | 42 `shadow-[…]` arbitraires (glows marketing, ex. `shadow-[0_0_30px_rgba(124,58,237,0.45)]`), aucun token d'ombre partagé                                                    |
| `apps/dashboard-manager`   | **11 valeurs distinctes** de `border-radius` (999, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1 px) sans nom — 999px (pilule) et 8px sont les plus fréquents (9 et 13 occurrences) mais rien ne dit que 8px du DM = `rounded-md` de l'app | **7 recettes d'ombre distinctes**, toutes écrites à la main (`0 8px 24px rgb(0 0 0 / 25%)`, `color-mix(in srgb, var(--bg) 70%, transparent)`…), aucun nom partagé avec l'app |

### 1.5 Composants dupliqués entre surfaces

| Composant                                             | app (`packages/ui`)                                                                                                                                                                           | site                                                                                                                                                                                            | DM                                                                                                                                                                                         |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bouton                                                | `components/button.tsx` (cva)                                                                                                                                                                 | **importe le même fichier** (`Button` de `@bellum/ui`), étend via `apps/website/src/lib/button-styles.ts` (`buttonVariants(...)` + classes arbitraires : `rounded-full`, `shadow-[0_0_30px_…]`) | Pas de composant Bouton dédié — classes CSS directes par écran (à vérifier écran par écran, hors mesure automatisée)                                                                       |
| Carte                                                 | `components/card.tsx`                                                                                                                                                                         | **importe le même fichier** (`Card` de `@bellum/ui`, 70 usages)                                                                                                                                 | `src/ui/Card.module.css` + `CardHeader.module.css` — implémentation CSS propre, zéro ligne partagée                                                                                        |
| Tableau                                               | `components/table.tsx`                                                                                                                                                                        | pas d'usage détecté (marketing, peu de tableaux)                                                                                                                                                | `src/ui/DataTable.module.css` — implémentation propre                                                                                                                                      |
| Champ                                                 | `atoms/field-text.tsx`, `components/input.tsx`                                                                                                                                                | via `@bellum/ui`                                                                                                                                                                                | Champs HTML natifs stylés en CSS module par écran (pas de composant central recensé)                                                                                                       |
| Pastille / badge                                      | `components/badge.tsx`                                                                                                                                                                        | via `@bellum/ui`                                                                                                                                                                                | `src/ui/Pill.module.css` — même fonction, nom différent, code différent                                                                                                                    |
| État vide                                             | `molecules/empty-state.tsx`                                                                                                                                                                   | via `@bellum/ui`                                                                                                                                                                                | `src/ui/EmptyState.module.css` — **même nom, même fonction, deux implémentations**                                                                                                         |
| Barre de filtres                                      | `molecules/filter-bar.tsx`                                                                                                                                                                    | via `@bellum/ui`                                                                                                                                                                                | `src/ui/FilterBar.module.css` — **même nom, même fonction, deux implémentations**                                                                                                          |
| Squelette de chargement                               | `components/skeleton.tsx`                                                                                                                                                                     | via `@bellum/ui`                                                                                                                                                                                | `src/ui/Skeleton.module.css` — **même nom, même fonction, deux implémentations**                                                                                                           |
| KPI / Stat / Delta / Sparkline / Heatmap / SegmentBar | pas d'équivalent direct dans `packages/ui` (existent comme composants du catalogue Figma dans `figma-sync/src/plugin/components/recipes/charts.ts`, mais pas comme composants React de l'app) | —                                                                                                                                                                                               | `src/ui/{KpiTile,Stat,Delta,Sparkline,Heatmap,SegmentBar}.module.css` — composants propres au DM, pas de duplication au sens strict (rien à unifier tant que l'app n'a pas ces composants) |

**Conclusion de l'inventaire composants** : la duplication de CODE est concentrée sur le DM (Card, DataTable, Pill,
EmptyState, FilterBar, Skeleton — 6 primitives réécrites), et elle est **voulue et gardée** (#1642). Le site n'a
aucune duplication de code — sa dette est dans la valeur des tokens et dans les classes arbitraires posées par-dessus
les mêmes composants.

## 2. Stratégie de consommation des tokens

### Option recommandée : un fichier de variables CSS généré, consommé en DEUX modes selon ce que chaque surface a le droit d'embarquer

**Génération** : étendre l'extraction déjà écrite et déjà testée dans `packages/figma-sync` (`tokens.css` →
`generated/tokens.json`, idempotente, avec une liste `skipped` explicite pour tout ce qu'elle ne sait pas
représenter — « jamais une valeur devinée », la même règle que le reste du dépôt) avec une seconde sortie, dans un
nouveau paquet léger `packages/design-tokens` :

- `tokens.generated.css` — les mêmes variables `--bellum-*`, en `:root` / `.dark`, **sans** ce qui est spécifique à
  l'app (hauteur de nav mobile, shimmer de squelette, alias de rétrocompatibilité `--bg-base` etc.) : un fichier CSS
  pur, zéro classe, zéro sélecteur de composant.
- `tailwind-preset.cjs` — un preset Tailwind (`colors`, `borderRadius`, `boxShadow`) dérivé du même JSON, pour les
  surfaces qui font tourner Tailwind.

**Consommation** :

- **`apps/website` (fait déjà tourner Tailwind + importe déjà `@bellum/ui`)** : `tailwind.config.ts` étend le preset
  partagé au lieu de déclarer ses propres `colors`/`borderRadius` ; `globals.css` importe `tokens.generated.css` et
  fait de ses variables actuelles des **alias** (`--violet-500: var(--bellum-primary-400)`, etc.) plutôt que d'être
  supprimées d'un coup — la bascule reste réversible ligne par ligne.
- **`apps/dashboard-manager` (Tailwind et toute librairie de composants sont interdits — #1642, gardé par
  `aucune-librairie-ui.test.ts`)** : consomme **uniquement** `tokens.generated.css`, importé une fois dans
  `globals.css`. Zéro dépendance ajoutée au `package.json` — le fichier est du texte CSS, pas un paquet. Les 12
  variables du DM deviennent des alias vers `--bellum-*` de la même façon.

**Pourquoi cette option et pas une autre** :

1. Elle respecte #1642 à la lettre plutôt que de la re-proposer : le DM ne gagne ni Tailwind ni un import de
   composant, seulement du texte CSS — exactement ce que la garde autorise déjà (« une primitive manquante s'écrit
   dans `src/ui/`, en CSS module »).
2. Elle réutilise un extracteur déjà écrit, déjà testé (idempotence, `skipped` journalisé) au lieu d'en construire un
   deuxième — le risque d'un extracteur qui devine une valeur est déjà couvert côté Figma, pas la peine de le
   recréer côté CSS.
3. Elle permet un aliasing réversible plutôt qu'un renommage massif en un lot : chaque variable de site/DM peut
   pointer vers son équivalent partagé UNIQUEMENT quand la valeur rendue est identique (voir lots §3) ; quand elle
   diffère (le violet du site n'est pas celui de l'app), la variable reste locale et le lot suivant nomme
   explicitement l'écart comme une décision produit, pas un détail technique.
4. Elle centralise à un seul endroit ce qui aujourd'hui est réglé trois fois (GA-26 appliqué au niveau du dépôt et
   non plus du seul produit) : changer une couleur dans `tokens.css` + `pnpm --filter @bellum/design-tokens build`
   propage aux trois surfaces qui l'ont adopté.

**Option écartée — importer directement `apps/web/src/styles/tokens.css`** : le fichier source porte des noms qui
collisionnent en silence avec ceux du site (`--bg-base`, `--text-primary`… existent déjà dans `apps/website/globals.css`
avec des valeurs différentes) et embarque des décisions propres à l'app (hauteur de barre d'onglets mobile, shimmer).
Un import direct romprait le rendu du site sans qu'aucun test ne le voie — contraire à « jamais une valeur devinée ».
Un fichier généré, filtré, permet de choisir ce qui sort et de faire échouer bruyamment ce qui ne se traduit pas.

**Option écartée — donner Tailwind et `packages/ui` au DM** : reviendrait à annuler #1642 en le contournant par
l'architecture plutôt qu'en le rediscutant. Ce n'est pas une décision technique — si le fondateur veut ce jour-là
faire tomber #1642, ce sera écrit et daté comme tous les autres arbitrages du registre de doctrine, pas décidé
silencieusement dans un plan de migration.

### Gardes CI à étendre (existantes)

| Garde                                                                                   | Aujourd'hui                                        | Extension proposée                                                                                           |
| --------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/architecture/type-scale.test.ts` (GA-31/GA-34)                            | `ROOTS = [apps/web/src, packages/ui/src]`          | ajouter `apps/website/src` et `apps/dashboard-manager/src` à `ROOTS`                                         |
| `apps/web/src/architecture/radius-scale.test.ts` (GA-250)                               | `WEB_SRC` + `UI_SRC` seulement                     | même extension, avec une échelle DM distincte tant que ses rayons ne pointent pas vers `--bellum-radius-*`   |
| `apps/web/src/architecture/no-hardcoded-colors.test.ts` (GA-248)                        | scanne `apps/web` + `packages/ui`                  | ne pas étendre telle quelle (elle casserait immédiatement sur le site) — voir garde nouvelle ci-dessous      |
| `apps/dashboard-manager/src/architecture/couleurs-passent-par-un-token.test.ts` (#1642) | cliquet par fichier/valeur, 20 littéraux hérités   | son mécanisme (une `HERITAGE` nommée, jamais un compte) est le bon modèle pour le site — voir garde nouvelle |
| `apps/dashboard-manager/src/architecture/aucune-librairie-ui.test.ts` (#1642)           | interdit Tailwind/Radix/shadcn dans `dependencies` | **ne pas toucher** — c'est la garde qui protège la décision produit citée plus haut                          |
| `apps/web/src/architecture/theme-parity.test.ts` (GA-33/D79)                            | vérifie que light et dark existent pour l'app      | ne s'applique pas au site (sombre seul, assumé) — voir risque §4                                             |

### Garde nouvelle à écrire

- **`packages/design-tokens/src/generation-matches-source.test.ts`** : `tokens.generated.css` contient exactement les
  variables listées dans `generated/tokens.json` (même modèle que le test d'idempotence de figma-sync) — un lot qui
  oublie de régénérer est rouge avant de mentir aux deux autres surfaces.
- **`apps/website/src/architecture/couleurs-passent-par-un-token.test.ts`** : copie du mécanisme DM (§ ci-dessus),
  amorcée avec l'héritage mesuré en §1.1 (131 occurrences, 19 valeurs) comme `HERITAGE` nommée — verte dès le lot 2,
  rouge sur toute nouvelle couleur en dur à partir de ce moment-là.
- **`apps/website/src/architecture/type-scale.test.ts`** existe déjà en tant qu'extension de GA-31 (voir tableau
  ci-dessus) — pas de fichier séparé nécessaire si l'extension de `ROOTS` est faite.

## 3. Plan séquencé (tokens → primitives → écrans)

Chaque lot ≤ 40 points (1 point ≈ un fichier modifié ou créé avec sa vérification). Un lot ne commence que si le
précédent est vert. Aucun lot de ce plan ne change une valeur RENDUE avant le lot 5 — jusque-là, tout est plomberie
et alias 1:1.

### Lot 1 — Fabrique de tokens portable (risque : nul, aucun consommateur)

- **Fichiers** : nouveau `packages/design-tokens/{package.json, src/generate.ts, src/generation-matches-source.test.ts}` ;
  extension de `packages/figma-sync/scripts/extract.ts` pour appeler ce générateur en plus de `tokens.json`.
- **Critère de fin mesurable** : `tokens.generated.css` contient autant de variables que `generated/tokens.json` a de
  clés (test qui compte les deux et compare) ; `tailwind-preset.cjs` exporte `colors`/`borderRadius`/`boxShadow` non
  vides.
- **Garde** : `generation-matches-source.test.ts` (nouvelle, §2).
- **Recette écran** : aucune — rien n'est encore consommé.
- **Volume estimé** : 4-5 fichiers créés/modifiés. **≈ 15 points.**

### Lot 2 — Gardes de mesure sur site et DM (risque : nul, aucune valeur ne change)

- **Fichiers** : `apps/website/src/architecture/couleurs-passent-par-un-token.test.ts` (nouveau, héritage 131/19) ;
  extension de `ROOTS` dans `apps/web/src/architecture/type-scale.test.ts` et `radius-scale.test.ts`.
- **Critère de fin mesurable** : les 3 gardes passent en lisant les 3 surfaces (preuve « corpus non vide » sur
  `apps/website/src` et `apps/dashboard-manager/src` en plus de l'existant).
- **Garde** : elles-mêmes (cliquet — le nombre d'entrées d'héritage ne peut plus monter à partir de ce lot).
- **Recette écran** : aucune.
- **Volume estimé** : 3 fichiers modifiés/créés. **≈ 10 points.**

### Lot 3 — Site : alias 1:1 vers les tokens partagés (risque : faible, réversible variable par variable)

- **Fichiers** : `apps/website/src/app/globals.css` (import de `tokens.generated.css`, alias des variables dont la
  valeur rendue est identique — ex. si un `--green-500` du site tombe pile sur `--bellum-success`) ;
  `apps/website/tailwind.config.ts` (étend `tailwind-preset.cjs` pour `borderRadius` seulement dans un premier temps,
  les couleurs `primary`/`accent` du site restant locales tant que §5 n'a pas tranché leur valeur).
- **Critère de fin mesurable** : liste écrite des variables aliasées vs restées locales, avec la raison pour chacune
  restée locale (valeur différente = décision produit, pas un oubli) ; 0 changement de pixel constaté sur un
  contrôle visuel des pages `/`, `/pricing`, `/product`.
- **Garde** : `couleurs-passent-par-un-token.test.ts` du site (lot 2) reste verte sans grossir sa liste d'héritage.
- **Recette écran** : `/`, `/pricing`, `/product`, `/about` (les 4 pages qui utilisent le plus de `Card`/`Button` de
  `@bellum/ui` d'après le comptage de 70 imports).
- **Volume estimé** : 2 fichiers de config + 0 à quelques écrans si un alias révèle un écart visuel à corriger.
  **≈ 20 points.**

### Lot 4 — DM : alias 1:1 vers les tokens partagés (risque : faible, même logique que le lot 3)

- **Fichiers** : `apps/dashboard-manager/src/app/globals.css` (import de `tokens.generated.css`, alias des 12
  variables existantes vers `--bellum-*` quand la valeur rendue est identique).
- **Critère de fin mesurable** : même format que le lot 3 (liste variable aliasée / restée locale + raison) ; les
  tests `contraste-aa.test.ts` et `couleurs-passent-par-un-token.test.ts` du DM restent verts.
- **Garde** : `contraste-aa.test.ts` (existant, DM) — un alias qui ferait tomber un contraste sous AA doit être vu
  avant merge, pas en production.
- **Recette écran** : `/monitoring`, `/clients`, `/facturation` (les écrans qui portent le plus de `.module.css`
  cités en §1.5).
- **Volume estimé** : 1 fichier + vérification des 18 `.module.css` qui consomment ces variables. **≈ 20 points.**

### Lot 5 — Décision de valeur : rayons et ombres (risque : moyen, premier changement de pixel possible)

- **Fichiers** : `apps/website/tailwind.config.ts` (rayons `lg`/`xl` alignés sur l'échelle partagée, remplaçant
  6/10/14/20 px par 6/8/10/12/16 px) ; `apps/dashboard-manager/src/ui/*.module.css` (11 valeurs de rayon → échelle
  nommée `--bellum-radius-*`) ; consolidation des 7 recettes d'ombre du DM et des 42 `shadow-[…]` arbitraires du site
  vers 2-3 ombres nommées partagées.
- **Critère de fin mesurable** : 0 rayon/ombre arbitraire restant sur les fichiers touchés (mesuré par les commandes
  de §1.2/1.4, rejouées) ; capture avant/après des composants dont le rayon change de plus de 2 px.
- **Garde** : extension de `radius-scale.test.ts` (lot 2) qui, à partir de ce lot, interdit aussi les rayons DM hors
  échelle nommée (plus seulement « corpus lu »).
- **Recette écran** : toutes les cartes et boutons du site (rayon `lg`/`xl` change), `Card`/`Pill`/`DataTable` du DM.
- **Volume estimé** : ~15 fichiers `.module.css` DM + `tailwind.config.ts` site. **≈ 30 points.**

### Lot 6 — Décision de valeur : palette de marque du site (risque : élevé, décision produit requise AVANT le lot)

- **Préalable non technique** : le fondateur tranche si le violet marketing (`hsl(263 70% 50%)`) devient
  `--bellum-primary-500` ou reste une teinte de marque distincte assumée (comme Google dans `no-hardcoded-colors.test.ts`
  est exempté pour une raison écrite). Sans cette décision, ce lot ne démarre pas — c'est un arbitrage à écrire dans
  le registre de doctrine, pas une valeur à deviner dans ce plan.
- **Fichiers (si « on unifie »)** : `apps/website/tailwind.config.ts` (`primary`/`accent` pointent sur le preset
  partagé), puis les 131 occurrences de hex en dur en `className` (§1.1), converties classe par classe vers un nom
  de la palette partagée ou vers une extension nommée de cette palette si la teinte marketing (`#36e6a0`, vert néon,
  13 occurrences) n'a pas d'équivalent produit.
- **Critère de fin mesurable** : 0 hex en dur restant dans `apps/website/src` (mesuré par la commande de §1.1) ; la
  garde du lot 2 passe sans plus aucune entrée d'héritage.
- **Garde** : `couleurs-passent-par-un-token.test.ts` du site, héritage ramené à 0.
- **Recette écran** : les 20 pages qui portent au moins une des 19 valeurs hex recensées — liste à produire par
  `grep -l` au moment du lot (elle bougera d'ici là).
- **Volume estimé** : ~20-25 fichiers `.tsx`. **≈ 35 points.**

### Lot 7 — DM : convergence visuelle des primitives dupliquées (risque : moyen)

- **Décision de portée à faire AVANT ce lot** : converger le RENDU (CSS du DM réécrit pour ressembler pixel-pour-pixel
  à `packages/ui`, implémentations séparées, #1642 intact) ou converger le CODE (DM importe `packages/ui`, ce qui
  suppose de faire tomber #1642 d'abord). Ce plan ne tranche pas — il pose la question au bon endroit, avant le lot.
- **Fichiers (branche « convergence visuelle »)** : `EmptyState.module.css`, `FilterBar.module.css`,
  `Skeleton.module.css`, `Pill.module.css`, `Card.module.css`/`CardHeader.module.css`, `DataTable.module.css` (6
  composants, §1.5) réécrits pour consommer les mêmes rayons/ombres/espacements que leurs homonymes de `packages/ui`.
- **Critère de fin mesurable** : capture côte à côte DM / app pour chacun des 6 composants, écart de rayon/ombre/
  espacement nul.
- **Garde** : aucune garde automatisée ne peut vérifier un rendu visuel sans outillage de diff d'image, qui n'existe
  pas aujourd'hui dans le dépôt (voir risque §4) — ce lot reste donc gardé par la recette manuelle jusqu'à ce que
  cet outillage existe.
- **Recette écran** : les écrans qui utilisent chacun des 6 composants (`/monitoring`, `/clients`, `/queues`,
  `/facturation` au minimum).
- **Volume estimé** : 6 fichiers CSS module + leurs écrans appelants (à recenser au lot). **≈ 25 points.**

### Lot 8 — Écrans : passe de recette croisée

- **Fichiers** : aucun changement de code prévu — ce lot est une recette, pas une implémentation. S'il révèle un
  écart, il ouvre un lot correctif ciblé plutôt que de grossir sur place.
- **Critère de fin mesurable** : les listes de pages des lots 3, 4, 6 et 7 ont chacune leur recette datée et signée.
- **Garde** : les gardes des lots précédents, rejouées une dernière fois sur les trois surfaces.
- **Recette écran** : toutes les pages listées dans les lots précédents, plus un tour rapide (smoke) des pages non
  listées pour vérifier qu'aucun alias n'a eu d'effet de bord ailleurs.
- **Volume estimé** : 0 fichier de code, temps de recette humaine. **≈ 10 points.**

## 4. Risques et parades

| Risque                     | Détail                                                                                                                                                                                                            | Parade                                                                                                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Thème sombre du site       | Le site est sombre SEUL (assumé, brief). GA-33/D79 exigent une parité clair/sombre pour le PRODUIT — pas de raison écrite à ce jour d'étendre cette promesse au marketing.                                        | Ne pas faire porter `theme-parity.test.ts` au site sans décision explicite ; documenter l'exemption dans le futur registre de doctrine si le sujet est tranché, plutôt que de laisser un silence se relire comme un oubli.             |
| Contraste AA               | Aliasing (lots 3-4) peut faire glisser un texte sous 4,5:1 sans qu'un humain ne le remarque à l'œil sur un seul écran.                                                                                            | `contraste-aa.test.ts` (DM, existant) bloque déjà ce risque côté DM ; créer son équivalent côté site avant le lot 6 (pas dans ce plan — à ouvrir si le lot 6 est déclenché).                                                           |
| SEO / marketing            | Le site charge une police différente (`Clash Display`) et des CTA calibrés (conversion) ; changer une couleur d'accent ou une ombre de bouton peut affecter un taux de clic sans que rien ne casse techniquement. | Le lot 6 (palette de marque) est explicitement bloqué sur une décision produit écrite, pas une conversion automatique ; pas de changement de police dans ce plan.                                                                      |
| Régressions visuelles      | Aucun outillage de diff d'image n'existe dans le dépôt aujourd'hui (`e2e/` ne fait que du smoke fonctionnel Playwright, pas de `toHaveScreenshot`).                                                               | Chaque lot à risque (5, 6, 7) porte une recette manuelle explicite en attendant ; si le volume de lots visuels grossit, l'ajout d'un diff de capture Playwright devient sa propre décision d'outillage, hors périmètre de ce document. |
| Décision de valeur devinée | Le risque le plus probable n'est pas technique : c'est qu'un lot glisse une couleur ou un rayon « qui se ressemble » sans que ce soit écrit comme un choix.                                                       | Les lots 5-6-7 nomment explicitement leur préalable de décision et le critère de fin mesure un ÉCART à zéro, jamais une ressemblance à l'œil.                                                                                          |

## 5. Volume estimé (fichiers touchés par lot)

| Lot                        | Fichiers touchés (estimation)        | Points  |
| -------------------------- | ------------------------------------ | ------- |
| 1 — Fabrique de tokens     | 4-5 (nouveaux)                       | 15      |
| 2 — Gardes de mesure       | 3                                    | 10      |
| 3 — Alias site             | 2 config + 0-4 écrans                | 20      |
| 4 — Alias DM               | 1 + vérification de 18 `.module.css` | 20      |
| 5 — Rayons/ombres          | ~15 `.module.css` DM + 1 config site | 30      |
| 6 — Palette de marque site | ~20-25 `.tsx`                        | 35      |
| 7 — Primitives DM          | 6 CSS module + écrans appelants      | 25      |
| 8 — Recette croisée        | 0 (recette)                          | 10      |
| **Total**                  | **≈ 55-65 fichiers**                 | **165** |

---

**Résumé (≤ 15 lignes)**

- SHA mesuré : `bcf14defb1fe6dbbfd24bd472d240a1560ad4ce1` (`main`).
- Site : 0 duplication de code (importe déjà `@bellum/ui`) mais 131 hex en dur / 19 valeurs, 556 classes Tailwind
  arbitraires, palette de rayons propre non alignée. DM : ~20 hex hérités (96 % déjà propre), 11 rayons et 7 ombres
  sans nom, 6 primitives (Card, DataTable, Pill, EmptyState, FilterBar, Skeleton) réécrites à la main — **et
  l'interdiction d'y importer Tailwind ou une librairie de composants est une décision produit gardée (#1642), pas
  un oubli**. App : déjà propre, 5 gardes CI vertes.
- Option retenue : un fichier `tokens.generated.css` + un preset Tailwind, générés depuis l'extracteur déjà testé de
  `packages/figma-sync`, dans un nouveau `packages/design-tokens`. Le site l'adopte via Tailwind + alias CSS ; le DM
  l'adopte en CSS pur, sans dépendance nouvelle, pour ne pas contourner #1642.
- 8 lots, tokens → primitives → écrans, chacun ≤ 40 points, ≈ 55-65 fichiers et 165 points au total. Les 3 premiers
  lots (fabrique, gardes, alias) ne changent aucun pixel ; les lots 5-6-7 changent des valeurs et sont chacun bloqués
  sur une décision produit écrite avant de démarrer.
- Aucun code modifié par ce document ; aucun test lancé.
