# Coque Théo V22 — le contrat que les lots écrans reprennent

Lot `THEO-REFONTE-COQUE`, 23/10/2026, branche `claude/theo-refonte-coque`.
Source : les maquettes **appliquées** (`origin/claude/theo-a1-appliquees` … `theo-d2-appliquees`,
`docs/maquettes/theo-v22/_appliquees/*/*.html`) — leur DOM de coque (`.sidebar`, `.topbar`,
`.page-head`, `.v18-guide`) est identique d'une page à l'autre, à la page active près.

Ce lot livre **la coque, rien d'autre**. Aucun écran n'a été refait : chaque lot écran garde son
corps, et ne touche pas à ce qui suit — il le **déclare**.

## 1. Ce que la coque fournit

```
┌──────────────┬──────────────────────────────────────────────────────────────┐
│ Barre        │ ShellTopbar  (64 px)  fil d'Ariane ……… [Recherche ⌘K] (AL)    │
│ latérale     ├──────────────────────────────────────────────────────────────┤
│ 232 px       │ bandeaux (démo, questionnaire, retour à la conversation)     │
│              │ SectionTabs (onglets de la section)                          │
│ marque       │ PageHeader  h1 30 px · phrase · actions à droite             │
│ Laura        │ ScreenGuideLink  « Comment travailler ici ? »                │
│ Découvrir    │ ──────────────────────────────────────────────────────────── │
│ Analyser     │ corps de l'écran (le lot écran)                               │
│ ESPACE DE    │                                                              │
│ TRAVAIL …    │                                                              │
│ ──────────── │                                                              │
│ Intégrations │                                                              │
│ Paramètres   │                                                              │
│ (AL) Nom     │                                                              │
│  rôle·espace │                                                              │
└──────────────┴──────────────────────────────────────────────────────────────┘
```

| Pièce                                                | Fichier                                                                                           | Rôle                                                                                                                                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CustomerPage`                                       | `apps/web/src/components/page/CustomerPage.tsx`                                                   | **La seule porte d'un écran** : monte la barre latérale (bureau) ou `MobileShell` (≤ 768 px), puis `CustomerPageContent`.                                                                                         |
| `CustomerPageContent`                                | `apps/web/src/components/page/CustomerPageContent.tsx`                                            | Empile barre du haut, bandeaux, onglets de section, en-tête, lien guide, puis le corps qui défile.                                                                                                                |
| `ShellTopbar`                                        | `apps/web/src/components/shell/ShellTopbar.tsx`                                                   | `.topbar` : fil d'Ariane, recherche globale (`GlobalSearchTrigger`, la recherche existante), avatar du compte. **Bureau seulement.**                                                                              |
| `shellTrail` / `resolveTitle` / `resolveBreadcrumbs` | `apps/web/src/components/shell/shell-trail.ts`                                                    | Le titre et le fil, dérivés à **un** endroit (GA-26) — lus par la barre du haut ET l'en-tête.                                                                                                                     |
| `PageHeader`                                         | `apps/web/src/components/layout/PageHeader.tsx`                                                   | `.page-head` : h1 `text-3xl` semibold, phrase (`pageSubtitle`, 70 car. via `Text`), actions à droite, onglets de page (`tabs`).                                                                                   |
| `ScreenGuideLink`                                    | `apps/web/src/components/shell/ScreenGuideLink.tsx`                                               | `.v18-guide` : ouvre le centre d'aide des guides existant (`GuideHelpCenter`).                                                                                                                                    |
| `AppSidebar` / `CustomerNavbarBody`                  | `apps/web/src/components/sidebar/`                                                                | `.sidebar` : marque, commandes, rubrique, pied, identité + repli.                                                                                                                                                 |
| `NavIdentity`                                        | `apps/web/src/components/sidebar/NavUser.tsx`                                                     | Bloc d'identité : initiales, nom (profil), « rôle · espace » (espace actif). Variante `avatar` pour la barre du haut.                                                                                             |
| `MenuLayout`                                         | `packages/ui/src/layouts/menu-layout.tsx`                                                         | Contenu à plat contre la barre latérale, sur `--bellum-bg`.                                                                                                                                                       |
| Jetons                                               | `apps/web/src/styles/tokens.css` (valeurs), `packages/ui/tailwind.config.ts` → `theoTheme` (noms) | Police système (`--bellum-font-sans/-mono` → `font-sans`/`font-mono`), `rounded-card` 10 px, `rounded-control` 8, `rounded-overlay` 12, `rounded-badge` 6, `shadow-card`/`shadow-overlay`, `duration-immediate…`. |

## 2. Comment un écran déclare son titre, sa phrase et son fil

Tout passe par les props de `CustomerPage` — **jamais** un second en-tête dans le corps.

```tsx
<CustomerPage
  pageTitle="Tes automatisations" // h1 de l'en-tête + dernier maillon du fil
  pageSubtitle="Confie les suivis récurrents à Laura." // la phrase sous le titre (≤ 70 car. de large)
  headerActions={<Button variant="default">Parcourir les routines</Button>} // à droite du titre
  breadcrumbs={[{ label: 'Actions', to: '/actions' }, { label: 'Automatisations' }]} // optionnel
>
  {/* le corps de l'écran */}
</CustomerPage>
```

Règles :

- **Le fil** se dérive seul du modèle de navigation (`sections.ts`) : racine de section → « Comptes » ;
  onglet → « Aujourd'hui › Messagerie » (la section est un lien) ; page de détail → « Comptes › <nom> ».
  Un écran ne passe `breadcrumbs` que si la dérivation ne dit pas juste. Le dernier maillon porte
  `aria-current="page"` et n'est pas cliquable. Un maillon vers une route à paramètres prend `onClick`.
- **Le titre** : `pageTitle`, sinon `pageTitleKeys` (`lib/page-titles.ts`). Une section à plusieurs
  onglets se nomme par ses onglets : l'en-tête ne répète pas le mot (loi 4, `PageHeader`) et garde
  un h1 `sr-only` (#2456). Un écran qui rend son propre h1 passe `titleInScreen` — jamais deux h1
  (GA-347).
- **Sur bureau**, le fil vit dans la barre du haut : l'en-tête ne le répète pas (`trailInTopbar`,
  posé par la coque). **Sur mobile**, pas de barre du haut : le fil reste dans l'en-tête.
- **« Comment travailler ici ? »** est posé par la coque sous l'en-tête de chaque écran qui a un
  en-tête (`skipHeader` le retire). Il ouvre les guides du registre (`features/guide/guide-registry.ts`) :
  pour qu'un écran ait SON parcours, on ajoute un guide au registre, on n'écrit pas un second panneau.
- `skipHeader` (écran plein cadre qui dessine sa propre chrome) retire en-tête et lien guide, pas la
  barre du haut. `skipLayout` retire toute la coque.

## 3. La barre latérale — ce qui est où

- **Commandes** (`CustomerNavbarBody`, `topAction`) : Demander à Laura (aplat primaire), Découvrir,
  Analyser (`.tool-nav`, contour discret ; actif = aplat d'accent + `aria-current`).
- **Rubrique « Espace de travail »** (`items.ts`, `PLATFORM_SECTIONS`, dérivée de `NAV_SECTIONS`) :
  Aujourd'hui, Comptes, Contacts, Mes cibles, Affaires, Talents, Missions, Actions, **Messagerie**
  (onglet promu, `PROMOTED_AFTER`), Équipe (gérant + équipe), Pilotage. L'ordre suit le rôle
  (`orderNavItems`, c76 : l'ordre, jamais le contenu).
- **Pied** (`PLATFORM_FOOT_SECTION`) : Intégrations (`/integrations`), Paramètres (`/settings`),
  puis carte d'offre, thème / langue / notifications / nouveautés, puis l'identité et le repli.
- Une entrée : 40 px, rayon 8, icône 20, `text-sm` medium ; active = `--bellum-accent-bg` +
  `--bellum-text-accent` + semibold. Repliée (⌘B) : 56 px, icônes + infobulles.
- **Aucun capuchon de raccourci dans la barre latérale** (GA-95) : la recherche ⌘K vit dans la barre du haut.

## 4. Jetons à utiliser (et à ne pas réécrire)

| Besoin                                          | Classe                                                                                                               | Jeton                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----- | --------- | ---- |
| Fond de page / panneau / carte / creux          | `bg-[var(--bellum-bg)]` / `bg-[var(--bellum-sidebar)]` / `bg-card` / `bg-[var(--bellum-surface-2)]`                  | `--bellum-*`              |
| Texte principal / secondaire / discret / accent | `text-[var(--bellum-text-primary                                                                                     | secondary                 | muted | accent)]` | idem |
| Carte                                           | `rounded-card` (10 px), bordure `--bellum-border`, **sans ombre au repos**                                           | `--bellum-radius-card`    |
| Contrôle, entrée de nav                         | `rounded-control` (8 px)                                                                                             | `--bellum-radius-control` |
| Menu, modale                                    | `rounded-overlay` (12 px), `shadow-overlay`                                                                          |                           |
| Mouvement CSS                                   | `duration-immediate` + `ease-bellum-out` (jamais `duration-150` à la main, GA-25)                                    | dérivés de `motion.ts`    |
| Police                                          | rien à écrire : `font-sans` = pile système de la maquette                                                            | `--bellum-font-sans`      |
| Titres                                          | h1 `text-3xl font-semibold tracking-tight` ; tailles **de l'échelle Tailwind seulement**, plancher `text-xs` (GA-31) |                           |

Interdits tenus par les gardes : couleur hexadécimale dans du JSX (GA-33), taille < 12 px ou
arbitraire (GA-31), `vh` (GA-30, `dvh`), icône sans nom (GA-32), cible < 44 px au doigt (GA-35),
largeur de lecture ailleurs que dans `Text` (GA-34).

## 5. Écarts assumés avec la maquette (à trancher, pas à « corriger » en douce)

- **« Ma journée »** (maquette) ↔ **« Aujourd'hui »** (produit) : nom retiré par #1389, tenu par la
  garde `briefing-screen-has-one-name`. Le renommage se décide (six entrées × deux langues), il ne
  se glisse pas dans un lot de coque.
- **Signaux** (entrée de la maquette) : aucune route ni écran n'existe ; pas d'entrée vide ajoutée.
- **Tailles** : 13 px de la maquette → `text-sm` 14 px ; 23 px de la marque → `text-2xl` ; 11 px
  du capuchon → `text-xs` (échelle Tailwind, GA-31). Entrée de nav 40 px (maquette 41).
- **Recherche** : libellé « Recherche globale » (registre des raccourcis) au lieu de « Rechercher ».
- **Mobile** : la maquette met la barre latérale en tiroir derrière un bouton menu ; le produit garde
  sa coque mobile à quatre onglets (GA-28) — décision antérieure, non re-litigée.
- **Sous-navigation** dépliée sous l'entrée active (`.a14-navsub`) : non reprise ; les onglets de
  section (`SectionTabs`) restent en haut du contenu. C'est le lot de chaque section qui tranchera.
