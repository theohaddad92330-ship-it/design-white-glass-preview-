Le design system de BellumAI **dans Figma, construit depuis le code**. Un plugin Figma de développement lit une
photographie des tokens (`generated/tokens.json`) et les specs de pages (`src/spec/pages/**`), puis écrit dans le
fichier Figma ouvert : variables, styles, fondations — et, aux lots suivants, composants, gabarits et les ~160 pages
de l'app, du site et du backoffice.

Pourquoi un plugin et pas le connecteur MCP Figma : le connecteur est plafonné en appels ; le plugin écrit tout le
fichier en une passe, hors ligne, et **idempotent** (relancer = même fichier, jamais de doublon).

## La règle

**Un token naît dans `apps/web/src/styles/tokens.css`, jamais dans Figma seul.** Figma se régénère, il ne s'édite pas :
une variable, un style ou une planche de fondations retouchés à la main sont écrasés à la synchronisation suivante.
Pour changer une couleur : changer `tokens.css`, `pnpm --filter @bellum/figma-sync build`, relancer le plugin.

Les sources lues (et elles seules) :

| Source                           | Ce qu'on en tire                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| `apps/web/src/styles/tokens.css` | primitives, couleurs Light (`:root`) / Dark (`.dark`), rayons, ombres, styles de texte |
| `apps/web/src/index.css`         | le `--radius` shadcn                                                                   |
| `apps/web/tailwind.config.ts`    | `zIndex`                                                                               |
| `packages/ui/src/motion.ts`      | `EASE`, `DURATION`                                                                     |

Le site (`apps/website`) et le backoffice (`apps/dashboard-manager`) ont encore leurs propres violets et neutres : ils
**ne sont pas importés** — ils migreront sur ces tokens, pas l'inverse.

Ce que l'extraction ne sait pas représenter (un `color-mix()`, une valeur sous `@media`, un alias vers un token inconnu,
un mode manquant) va dans `skipped` avec son `fichier:ligne` — **jamais une valeur devinée**. Le plugin l'affiche dans son
journal et sur la planche « Non importés ».

## Le flux code → Figma

```bash
pnpm --filter @bellum/figma-sync extract   # tokens.css → generated/tokens.json + src/spec/token-names.generated.ts ; demo-dataset.ts → generated/demo.json (commités)
pnpm --filter @bellum/figma-sync build     # extract + esbuild → dist/code.js (embarque le JSON et les specs) + dist/ui.html
pnpm --filter @bellum/figma-sync test      # extraction, contrat des specs, upsert idempotent (faux figma)
```

Un test rougit si `generated/tokens.json` ou `token-names.generated.ts` ne correspondent plus à `tokens.css` : relancer
`extract` et commiter.

## Installer le plugin (une fois)

1. `pnpm --filter @bellum/figma-sync build`
2. Figma **desktop** › menu Plugins › Développement › **Importer un plugin depuis un manifeste…**
3. Choisir `packages/figma-sync/manifest.json`.
4. Dans le fichier cible : Plugins › Développement › **BellumAI — Figma Sync (dev)**, cocher les étapes, **Synchroniser**.

Le plugin n'a aucun accès réseau (`networkAccess: none`) et ne lit aucun fichier : tout est dans `dist/code.js`.
Après un changement de code, rebâtir puis relancer le plugin — Figma recharge `dist/` à chaque lancement.

## Après un merge

La CI ne peut pas écrire dans Figma (l'API REST ne crée pas de nœuds) — faire suivre la maquette est donc un geste du
fondateur, pas un déploiement automatique. Après avoir tiré `main` :

```bash
pnpm --filter @bellum/figma-sync build     # extract (tampon de version + fil de nouveautés) + bundle du plugin
# Figma desktop › Plugins › Développement › BellumAI — Figma Sync (dev) › cocher les pages à jour › Synchroniser
git add packages/figma-sync/generated && git commit -m "chore(packages): resynchro figma-sync"   # tampon + fil, commités
```

Dans le plugin :

1. Le tampon (`sha · date · nombre de pages`) s'affiche en haut de l'UI — comparé, au dessin, au cadre **Version** déjà
   présent sur la page `Cover` (si les deux divergent, le journal le dit avant d'écraser).
2. La page **Nouveautés** liste les commits touchant `apps/web`, `apps/website`, `apps/dashboard-manager` et
   `packages/ui` depuis la dernière extraction (les 30 derniers s'il n'y en a pas), plus récent en tête — **append-only** :
   relancer `extract` n'efface jamais une entrée, il en ajoute au plus. Une entrée porte le badge **« à maquetter »**
   quand la route qu'elle touche a changé sans que son fichier de spec (`src/spec/pages/<surface>/<slug>.ts`) bouge dans
   le même commit — c'est la liste à vérifier avant de cocher les pages concernées.
3. Cocher au moins « Tokens », « Fondations » (Cover + Nouveautés) et les pages dont une spec a changé, puis
   **Synchroniser**.

Ce que la garde de couverture des routes (`src/spec/route-coverage.test.ts`) exige d'une PR qui touche une route
(`apps/web/src/routes/**`, `app.tsx`/`page.tsx` de `apps/website` ou `apps/dashboard-manager`) : soit une spec dans
`src/spec/pages/<surface>/`, soit une entrée dans `src/spec/route-exceptions.ts` avec sa raison (redirection pure, route
technique de routeur, outil de dev interne — jamais un raccourci pour faire taire la garde). Le job **Test (figma-sync)**
de la CI relance cette garde dès qu'une PR touche l'une de ces trois routes, `packages/figma-sync/`, un token
(`tokens.css`, `tailwind.config.ts`, `index.css`) ou `packages/ui/` — une PR qui ajoute une route sans y toucher
autrement ne passait pas ce filtre avant le 25/09/2026 (le job ne se déclenchait pas, la garde ne tournait jamais).

## Ce que le plugin écrit

| Étape      | Résultat dans Figma                                                                                                                                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tokens     | collections `Primitives` (1 mode, masquées des sélecteurs), `Color` (Light/Dark, alias vers les primitives), `Radius`, `Spacing`, `ZIndex` ; code syntax WEB = le vrai `var(--…)` ; scopes précis (fond, texte, bordure, rayon, gap)                                                                                                                   |
| Styles     | `text/display` … `text/mono` (Geist ; repli Inter **journalisé**), `shadow/<nom>/light` et `shadow/<nom>/dark`                                                                                                                                                                                                                                         |
| Fondations | pages `Cover`, `Getting Started`, `Foundations` (nuanciers par mode, typo, rayons, espacements, z-index, mouvement, non-importés)                                                                                                                                                                                                                      |
| Composants | page `Components` (index) + une page par famille (`Components — Actions`, `Formulaires`, `Données`, `Navigation`, `Retours`, `Surfaces`, `Identité`) : un COMPONENT_SET par composant du catalogue, une variante par combinaison d'axes (découpé au-delà de 30), propriétés TEXT / BOOLEAN / INSTANCE_SWAP, icônes lucide en composants `Icon / <nom>` |
| Gabarits   | page `Templates` : `Template / <id> / state=<état>`, une variante par largeur de référence (16, de 3440 à 320), en instances des composants ; règles en annotation (`docs/gabarits.md`)                                                                                                                                                                |
| Pages      | `App — <domaine>`, `Site`, `DM — <domaine>` : une frame par spec × largeur × état (défaut 1440, 1920, 2560, 1280, 390, 360 ; cases du plugin pour les autres) ; `Rules (UX)` agrège les `uxNotes`                                                                                                                                                      |

Plan Starter : si Figma refuse le 2ᵉ mode de `Color`, le journal le dit en ERREUR et la collection est écrite en Light seul.

## Composants, gabarits, pages : comment c'est construit

- **Une recette par composant** (`src/plugin/components/recipes/<famille>.ts`) : une fonction pure « valeurs de variante → arbre
  de parties », écrite en lisant le fichier source (classes Tailwind, `cva`). `RECIPES` `satisfies` le catalogue : un
  composant sans recette ne compile pas. Ce que la maquette ne sait pas rendre fidèlement (color-mix, littéraux Tailwind,
  ombres Tailwind) est écrit dans `notes` et part dans la description Figma du composant.
- **Aucune couleur brute** : toute peinture est liée à une variable (`paint()`), sinon rien n'est peint et le journal le dit.
  Espacements liés à `Spacing` quand le pas existe, rayons liés quand le code CITE la variable (`rounded-lg` = `--radius`).
- **Gabarits responsive** : `src/plugin/templates/rules.ts` porte les règles (zones, largeurs, grille) une seule fois ; le
  dessin, l'annotation Figma et `docs/gabarits.md` les lisent. Borne unique 768 px (GA-28).
- **Données** : un emplacement de spec (« Compte exemple 1 », une ligne de « — ») est rempli au rendu par le jeu de
  démonstration de l'API (`generated/demo.json`, `src/plugin/pages/demo-fill.ts`) : six comptes réels, leurs
  interlocuteurs, le vivier, les missions. Une colonne que le jeu ne connaît pas garde « — » (non mesuré).
- **Pages** : le gabarit à la largeur voulue est instancié puis détaché (Figma ne remplit pas un cadre d'instance), ses slots
  remplis par les `Block` de la spec ; un slot vide est caché.
- **Tests** (`src/plugin/build.test.ts`, faux arbre de scène `fake-scene.ts`) : exhaustivité, aucune couleur sans variable,
  idempotence, 16 largeurs sans débordement, page exemple `app/accounts`.

## Le format des specs (pour les lots suivants)

Le contrat est `src/spec/types.ts` (JSDoc complet), le catalogue `src/spec/catalog.ts`, la validation
`src/spec/validate.ts`. Exemple complet : `src/spec/pages/app/accounts.ts`.

- **Une page = un gabarit + des slots + des états.** `template` ∈ `list`, `detail`, `dashboard`, `settings`, `wizard`,
  `chat`, `auth`, `marketing`, `admin-table`. Chaque gabarit déclare ses slots (`header`, `filters`, `primary`, `aside`…),
  ceux qui sont obligatoires, et ses états obligatoires (`empty`, `loading`, `error`). C'est là que vit l'harmonisation :
  une page ne choisit pas sa mise en page, elle remplit des slots.
- **États facultatifs** : un gabarit peut déclarer des `optionalStates` (ex. `settings` : `empty`) — il les dessine,
  une page ne les déclare que s'ils ont un sens pour elle.
- **Chiffres et graphes** : `KpiTile`, `Stat`, `Delta`, `Sparkline`, `BarChart`, `StackedBar`, `WaterfallChart`,
  `Donut`, `Heatmap`, `CohortGrid`, `SegmentBar`, `Gantt` (`recipes/charts.ts`) — préférer ces composants à un
  `placeholder`. « Non mesuré » n'est jamais 0 : `state: unmeasured`, `delta: unknown`, `data: partial`.
- **Un slot = une liste de `Block`** : `component` (un composant du catalogue + ses props typées), `text` (un style
  `text/*`), `stack` / `grid` (espacements par token), `placeholder` (graphe, carte : un libellé, jamais une fausse donnée).
- **Aucune valeur brute.** Couleur = un nom de la collection `Color` (`text/secondary`, jamais `#52525b` ni `primary/500`),
  espacement = un pas Tailwind (`'4'` = 16 px), rayon = `sm|md|lg|xl|shadcn`. Le type le refuse à la compilation, la
  validation au runtime.
- **Les composants et leurs variantes sont ceux du code** (`packages/ui` + la coque `Sidebar` / `MobileTabBar`). Une
  variante absente du fichier source n'existe pas — l'ajouter au catalogue exige qu'elle existe dans le code.
- **`uxNotes`** : `ecart` (le code fait encore autrement que la maquette) ou `decision` (un arbitrage déjà tranché), avec
  une `source` `chemin/depuis/la/racine.tsx:ligne` — le test du registre vérifie que le fichier et la ligne existent.
- **Ajouter une page** : créer `src/spec/pages/<surface>/<slug>.ts` (`id: '<surface>/<slug>'`), l'ajouter au tableau de
  `src/spec/pages/<surface>/index.ts`, `pnpm --filter @bellum/figma-sync test`.
