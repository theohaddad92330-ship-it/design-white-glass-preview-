# Revue UX/UI critique — la maquette comme CIBLE

> Revue du 25/09/2026 sur `origin/main`. Portée : l’app (`apps/web`), le site (`apps/website`), le backoffice DM
> (`apps/dashboard-manager`) et le design system Figma généré par `packages/figma-sync` (tokens, 9 gabarits,
> ~158 specs de pages, leurs `uxNotes`).
>
> **Thèse.** Les specs décrivent aujourd’hui fidèlement le code, écarts compris — 82 `ecart` et 400 `decision`
> dans les `uxNotes`. La maquette doit devenir la **cible** : un produit sur trois surfaces qui se lit comme UN produit,
> où chaque geste se fait d’une seule façon. Ce document tranche ce que la maquette dessine désormais. Le code
> rattrape la maquette, pas l’inverse.
>
> **Conventions.**
>
> - Une décision porte un identifiant `RUX-nn`, unique **dans ce chantier** (GA-40) ; les `RUX` de ce document n’ont
>   rien à voir avec les `D` des PDF ni avec les gardes `GA-*`.
> - Les sources sont données en `fichier:ligne` depuis la racine du dépôt. Les comptes ont été faits par grep :
>   ce sont des ordres de grandeur, commentaires compris.
> - Effort : **S** = moins d’une journée, touche la maquette et un composant ; **M** = 2 à 5 jours, plusieurs écrans ;
>   **L** = plus d’une semaine, ou une migration de surface.
> - La doctrine reste au-dessus de tout : aucune probabilité ; une valeur absente n’est jamais « 0 » ; on n’affiche
>   pas ce qu’on n’a pas (dans une liste, une absence ne fait AUCUNE ligne ; un score garde ses axes) ; Laura
>   prépare, le commercial envoie.

---

## Sommaire

1. [Incohérences transverses](#1-incohérences-transverses) — T1 à T16
2. [Frictions par parcours clés](#2-frictions-par-parcours-clés) — P1 à P6
3. [Règles de gabarit cibles](#3-règles-de-gabarit-cibles) — les 9 gabarits aux 16 largeurs
4. [Top 20 des décisions, triées par gain/effort](#4-top-20-des-décisions-triées-par-gaineffort)
5. [Questions pour le fondateur](#5-questions-produit-qui-exigent-larbitrage-du-fondateur)

---

## 1. Incohérences transverses

### T1 — Trois surfaces, trois produits visuels

**Constat.**

| Fondation            | App                                                                                                          | Site                                                                                                                                                                                  | DM                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Violet de marque     | `#5b3ee8`, `250 79% 58%` (`apps/web/src/styles/tokens.css:11-20`, `apps/web/src/index.css:120`)              | `#7c3aed`/`#8b5cf6`, `263 70% 50%`, et un **dégradé** `#7c3aed→#4f46e5` (`apps/website/src/app/globals.css:22-26,51`)                                                                 | `#8071f6` / `#5a3fd1` (`apps/dashboard-manager/src/app/globals.css:12,23`)                                                                                     |
| Neutres              | zinc (`tokens.css:75-83`)                                                                                    | `#0a0a10` / `#111118` (`apps/website/src/app/globals.css:10-11`)                                                                                                                      | gris bleuté `#0b0e14` / `#151a23` (`apps/dashboard-manager/src/app/globals.css:7-11`)                                                                          |
| Thèmes               | clair + sombre, sombre par défaut (`apps/web/index.html:2`)                                                  | **sombre seul**, codé en dur (`apps/website/src/app/[locale]/layout.tsx:80`)                                                                                                          | clair + sombre via `data-theme` (`apps/dashboard-manager/src/app/layout.tsx:175`)                                                                              |
| Police               | Geist (`apps/web/tailwind.config.ts:55-65`)                                                                  | Clash Display pour le corps et les titres, Inter pour Tailwind, Geist importée mais jamais posée (`apps/website/src/app/globals.css:1-2,85,92`, `apps/website/tailwind.config.ts:50`) | pile système, corps à **13 px** (`apps/dashboard-manager/src/app/globals.css:77-90`)                                                                           |
| Plancher 12 px (D80) | tenu, sauf `.text-label` à 11 px (`tokens.css:353`), utilisé par `apps/web/src/components/ui/KpiCard.tsx:58` | tenu                                                                                                                                                                                  | **enfreint** : 11/10/9 px en CSS (`globals.css:343,392,436,1035`, `apps/dashboard-manager/src/ui/DataTable.module.css:17,58,83`) et 31 `fontSize: 11` en ligne |
| Sémantique           | `success/warning/danger/info` + `*-soft-*` (`tokens.css:49-52,172-186`)                                      | `green/amber/red-500` (`apps/website/src/app/globals.css:29-31`) + 277 classes `violet-*` brutes                                                                                      | `--green/--amber/--red`, plus `--danger` et `--stop` en doublon (`apps/dashboard-manager/src/app/globals.css:33-38,57-63`)                                     |

Le dépôt le sait déjà : « le site et le backoffice ont encore leurs propres violets et neutres […] ils migreront sur
ces tokens, pas l’inverse » (`packages/figma-sync/README.md`). La maquette, elle, dessine le site et le DM avec les
tokens de l’app. Elle montre donc déjà la cible, mais aucune règle écrite ne dit ce qui change.

**Impact.** Un prospect passe du site (violet chaud, dégradé, Clash Display, sombre imposé) à l’app (violet froid,
à plat, Geist) : la marque change au moment même où il s’inscrit. Le support client qui navigue entre le DM et une
impersonation de l’app voit deux violets à l’écran en même temps.

**Décision.**

- **RUX-01** — Une seule source de tokens pour les trois surfaces : `apps/web/src/styles/tokens.css`, publié sous
  forme de feuille partagée (`packages/ui/src/styles/tokens.css`, importée par le site et par le DM). Le site et le DM
  gardent des alias locaux le temps de migrer (`--violet-600: var(--bellum-primary-500)`), puis les suppriment.
  Effort **L** (site M, DM M).
- **RUX-02** — Une seule police : Geist pour le texte courant des trois surfaces. Clash Display reste autorisée
  uniquement pour le `hero` du site (`text/display`, ≥ 36 px), jamais pour le corps. Le DM passe de la pile système
  à Geist, avec un corps à 14 px (`text/body`). Effort **S** pour le site, **M** pour le DM (sa densité change, voir T12).
- **RUX-03** — Le site gagne le thème clair. La parité clair/sombre est une promesse (D79) et le site est la
  première promesse qu’un prospect lit. Le site suit la préférence du système, comme le DM. Effort **M**.
- **RUX-04** — Aucun dégradé de marque, nulle part. `tokens.css:280-282` l’interdit déjà dans l’app ; le site garde
  son dégradé uniquement comme fond décoratif du `hero`, derrière le contenu et jamais sur un bouton ni sur du texte.
  Effort **S**.
- **RUX-05** — `.text-label` passe à 12 px (`text-xs`, capitales et interlettrage conservés) : le plancher D80 n’a
  pas d’exception pour une étiquette de KPI. Effort **S**.

---

### T2 — La navigation : trois coques, trois bornes, et le DM dessiné dans la coque de l’app

**Constat.**

- App : barre latérale à 8 sections visibles (`apps/web/src/components/navigation/sections.ts:205`,
  `apps/web/src/components/sidebar/items.ts:115,141`), borne 768 px (`apps/web/src/features/mobile/useIsMobile.ts:10`),
  `MobileTabBar` à 4 onglets Laura · Aujourd’hui · Comptes · Actions (`apps/web/src/features/mobile/mobile-nav.ts:27-39`).
  Pas de palette de commandes (`apps/web/src/features/accounts/view/account-detail/tabs/partners/EsnNameField.tsx:19`).
- DM : un rail de 1 + 30 liens en 5 groupes (`apps/dashboard-manager/src/app/_components/nav-sections.ts:33-170`),
  réduit aux icônes **sous 1 280 px** (`apps/dashboard-manager/src/app/globals.css:496-526`), aucune navigation mobile,
  mais une **recherche globale ⌘K** (`apps/dashboard-manager/src/app/_components/side-rail.tsx:152-159`) que l’app n’a pas.
- Site : menu burger **sous 1 280 px** (`apps/website/src/components/Navbar.tsx:52,83,96`).
- Figma : toutes les pages de gabarit `app` — y compris les 41 pages DM — sont dessinées avec la `Sidebar` de l’app
  (`packages/figma-sync/src/plugin/templates/layout.ts:231-256`). Le DM de la maquette porte donc la navigation d’un
  commercial.
- L’onglet mobile s’appelle « Laura » et la section bureau « copilote », absente de la barre latérale
  (`apps/web/src/components/sidebar/items.ts:115`).

**Impact.** Sur une tablette à 1 024 px, le site affiche le burger alors que l’app affiche le bureau : la même
personne voit deux produits. Dans l’app, retrouver un compte, un contact ou une mission impose de savoir dans quelle
section il vit, alors que le backoffice propose une recherche transversale depuis longtemps. La maquette du DM est
fausse dès sa première colonne.

**Décision.**

- **RUX-06** — Une seule borne pour les trois surfaces : 768 px (GA-28). Le site passe son burger de `xl` à `md`
  (liens principaux ≤ 5 de 768 à 1 279, le reste sous « Plus ») ; le rail du DM se réduit aux icônes sous **1 024 px**
  comme la `Sidebar` de l’app, et non plus sous 1 280. Effort **S** pour le site, **S** pour le DM.
- **RUX-07** — Une palette de commandes ⌘K dans l’app, sur le modèle de celle du DM
  (`apps/dashboard-manager/src/app/_components/global-search.logic.ts:25`) : comptes, contacts, missions, consultants,
  pages, et « Analyser “<saisie>” » comme dernière ligne. Elle se dessine en `Dialog` centré (640 px) dans la page
  `Components — Navigation`. Sur mobile, elle s’ouvre depuis la loupe de l’entête de l’onglet actif. Effort **M**.
- **RUX-08** — Le plugin gagne une coque `backoffice` : même anatomie que la `Sidebar` (240 px dépliée, 64 px en
  icônes), les 5 groupes de `nav-sections.ts`, un badge d’environnement en tête (« Production » en `soft/danger`) et
  pas de `MobileTabBar`. Le DM reste un poste de travail : sous 768, il montre une page « Ouvrez ce backoffice sur un
  écran d’au moins 768 px » (le composant `PosteDeTravailSeulement` existe déjà : `apps/dashboard-manager/src/ui/PosteDeTravailSeulement.tsx:36`).
  Effort **M** (plugin).
- **RUX-09** — Laura s’appelle Laura partout (D82), y compris dans la barre latérale : l’entrée « copilote » devient
  « Laura », en première position, avec le `LauraFace` à 20 px. Effort **S**.

---

### T3 — Quatre écrans d’accueil pour une seule question

**Constat.** « Accueil » (`packages/figma-sync/src/spec/pages/app/home.ts:23`), « Tableau de bord »
(`packages/figma-sync/src/spec/pages/app/dashboard.ts:19`), « Aujourd’hui » (`packages/figma-sync/src/spec/pages/app/briefing.ts:18`)
et le `/welcome` post-onboarding (`packages/figma-sync/src/spec/pages/app/welcome.ts`) répondent tous à « qu’est-ce
que je fais maintenant ? ». Sur mobile, l’arrivée est `/chat` (`apps/web/src/features/mobile/mobile-nav.ts:43`) ; sur
bureau elle dépend d’une préférence de démarrage. `/dashboard` affiche « Mes prochaines étapes »
(`packages/figma-sync/src/spec/pages/app/dashboard.ts:121`) et `/briefing` « À faire maintenant » (`briefing.ts:43`).

**Impact.** Deux listes de « prochaines choses à faire » sous deux noms, et le commercial ne sait pas laquelle fait
foi. C’est exactement la loi 4 : rien n’apparaît deux fois sous la même forme (`agent_docs/regles-design-2026-08-23.md:105`).

**Décision.**

- **RUX-10** — « Aujourd’hui » (`/briefing`) est l’UNIQUE écran d’arrivée sur bureau ; Laura reste l’arrivée sur mobile
  (décision du 23/08, inchangée). `/dashboard` devient « Ma trajectoire » dans Pilotage et perd son bloc « Mes
  prochaines étapes », qui renvoie vers « Aujourd’hui ». `/home` n’est plus qu’un aiguillage technique, jamais un écran.
  `/welcome` devient l’état « premier jour » de « Aujourd’hui » (une bannière de démarrage au-dessus de « À faire
  maintenant », qui disparaît après la première analyse). Effort **M**. → question Q1.

---

### T4 — Les en-têtes de page : un composant, six tailles de titre

**Constat.** L’app a un `PageHeader` (`apps/web/src/components/layout/PageHeader.tsx:99`) dont le titre visible est un
`h1` en `size="sm"` (`:288`), et un `ScreenIntro` en 2xl (`apps/web/src/components/primitives/ScreenIntro.tsx:53,59`).
28 écrans passent `titleInScreen` pour dessiner leur propre `h1`. Tailles de `h1` relevées : 2xl ×38, lg ×17, xl ×12,
3xl ×9, sm ×6 (ex. `apps/web/src/features/settings/view/LegalEntitiesView.tsx:72` en lg,
`apps/web/src/features/briefing/view/BriefingHero.tsx:69` en 3xl). Seuls 4 écrans utilisent le slot `headerActions`. Le DM
n’a pas de composant d’en-tête : 51 `<h1>` nus à 20 px (`apps/dashboard-manager/src/app/globals.css:136-139`), 5 avec
un style en ligne.

**Impact.** D’un écran à l’autre, le titre saute de 14 à 30 px et l’action principale change de place : l’œil
recherche la page au lieu de la lire.

**Décision.**

- **RUX-11** — Un seul `PageHeader` pour l’app ET le DM (le DM en a une copie CSS, pas une dépendance), avec une
  anatomie fixe :
  1. rangée 1 : fil d’Ariane (`text/caption`, uniquement à partir du 2ᵉ niveau), sinon rien ;
  2. rangée 2 : `h1` en **24 px / semibold** (`text/title`) à gauche, les actions à droite, alignées sur la ligne de
     base du titre, 8 px entre les boutons ; **une** action `default` au plus, les autres en `outline` ou regroupées
     dans un menu `⋯` ;
  3. rangée 3, facultative : une phrase d’intro en `text/body` + `text/secondary`, bornée à 70 caractères.

  Le titre est 24 px partout, une fiche d’entité comprise : c’est le résumé (`summary`) qui porte la hiérarchie, pas
  une taille de titre. Sous 768 : le titre passe en 20 px, les actions secondaires rejoignent le `⋯`, l’action
  principale devient un bouton pleine largeur sous l’intro. Effort **M** (app), **S** (DM).

- **RUX-12** — L’en-tête ne répète jamais l’onglet actif ni le nom de la section (loi 4, déjà appliquée) — la
  maquette l’impose à toutes les specs. Effort **S**.

---

### T5 — Filtrer : quatre mécanismes empilés sur un même écran

**Constat.** La spec des comptes empile des `Tabs` dans le slot `actions`
(`packages/figma-sync/src/spec/pages/app/accounts.ts:64`), un `TabNav` en pilules à 7 vues (`:41`), des `FilterChips`
(`:57`) et une `FilterBar` (`:86`) : quatre façons de réduire la même liste. Les missions empilent **huit** rangées
de pastilles (`apps/web/src/features/missions/view/MissionsToolbar.tsx:107-411`). `FilterBar` ne sert que sur 3 écrans
(`apps/web/src/features/accounts/view/AccountContent.tsx:654`, `apps/web/src/features/contacts/view/ContactContent.tsx:683`,
`apps/web/src/features/action-history/view/ActionHistoryPage.tsx:238`), `FilterChips` sur ~40, avec des variantes
maison (`ContactsViewChips`, `AccountsLensToggle`, le `FilterRail` de Découvrir). Le DM a sa propre `FilterBar`
(`apps/dashboard-manager/src/ui/FilterBar.tsx`). Les filtres sont bien synchronisés dans l’URL sur les 5 listes
(ex. `apps/web/src/routes/accounts/index.tsx:6`) — c’est acquis, à garder.

**Impact.** Pour une question simple (« mes comptes du secteur banque sans prochaine action »), le commercial doit
comprendre quatre contrôles et deviner lesquels se cumulent. Sur mobile, quatre rangées de filtres poussent la liste
sous le pli.

**Décision.**

- **RUX-13** — Une grammaire de filtres en DEUX niveaux, pas plus :
  1. **Vues** (`TabNav` variante `underline`, dans le slot `intro`) : des jeux de filtres nommés et exclusifs
     (« Tout », « Mes priorités », « Sans prochaine action »…), **5 au plus**, le reste sous « Plus de vues ▾ ».
  2. **Filtres** (`FilterBar`, dans le slot `filters`) : un bouton « + Filtre » qui ouvre la liste des champs, puis
     une pastille retirable par filtre actif, suivie de « Tout effacer ». Recherche à gauche de la barre, tri et
     densité à droite.

  Les `Tabs` à l’intérieur du slot `actions` sont interdits : le slot `actions` porte des verbes, pas des
  sous-ensembles. Les pastilles (« Mes favoris », « Portés par un collègue ») deviennent des filtres de la
  `FilterBar`. Sous 768 : les vues passent dans un `Select` en tête de liste ; la `FilterBar` se réduit à
  « Filtres (n) », qui ouvre un `Sheet` du bas. Effort **M** par écran (comptes, contacts, missions, actions,
  consultants, Découvrir). → la maquette d’abord (**S**), puis les écrans.

- **RUX-14** — Une vue filtrée qui ne rend rien montre l’état « vide filtré » (« Aucun compte ne passe ces filtres »
  - « Retirer les filtres »), distinct du vide « jamais rempli ». Le gabarit gagne un 2ᵉ état vide, `emptyFiltered`
    (l’écart est déjà relevé : `packages/figma-sync/src/spec/pages/app/settings-activity.ts`,
    `apps/web/src/features/team/view/ActivityLogView.tsx:261`). Effort **S** (contrat de spec + gabarits).

---

### T6 — Tableaux et cartes : la maquette contredit le meilleur composant du code

**Constat.** La règle responsive des gabarits dit « sous 768 seules les 2 premières colonnes restent visibles »
(`packages/figma-sync/src/plugin/templates/rules.ts:143`). Or le code a un meilleur primitif, `ResponsiveTable`, qui
transforme chaque ligne en carte sous 768 selon un rôle déclaré par colonne — `title`, `meta`, `field`, `hidden` —,
avec `field` par défaut pour qu’une colonne oubliée ne disparaisse pas
(`apps/web/src/components/primitives/ResponsiveTable.tsx:18-29,146-148`). Seuls 2 des 5 écrans de liste principaux
s’en servent (missions `apps/web/src/features/missions/view/MissionsTable.tsx:18`, consultants
`apps/web/src/features/consultants/view/VivierTable.tsx:47,54-56`). Comptes, contacts et actions restent des tableaux tronqués qui défilent en largeur
(`apps/web/src/features/accounts/view/accounts-list/AccountsTable.tsx:57`). Le guide lui-même liste « les 22 tableaux restants »
(`agent_docs/regles-design-2026-08-23.md:370`). Côté DM, `DataTable` n’a aucune priorité de colonne et déborde à
1 280 (`apps/dashboard-manager/src/ui/DataTable.tsx:389`).

**Impact.** Sur téléphone, la « prochaine action » d’un compte — la seule colonne qui compte en mobilité — est
la sixième et disparaît. À 1 280 dans le DM, le tableau de 10 colonnes défile en largeur dans son propre conteneur.

**Décision.**

- **RUX-15** — Le composant `Table` du catalogue gagne une prop par colonne, `mobile: 'title' | 'meta' | 'field' |
'hidden'`, et une prop `priority: 1..n`. Règle cible :
  - ≥ 1 024 : toutes les colonnes ;
  - 768–1 023 : les colonnes de priorité 1 à 4 ;
  - < 768 : chaque ligne devient une **carte-ligne** (titre, méta en `text/secondary`, puis les `field` en paires
    étiquette/valeur ; une valeur absente ne fait AUCUNE paire, doctrine #2613), dans le MÊME rendu (GA-29).

  La règle « 2 premières colonnes » est retirée de `rules.ts:143`. Chaque spec de liste déclare les rôles de ses
  colonnes ; la « prochaine action » est `meta` partout où elle existe. Effort **S** (maquette), **M** (comptes,
  contacts, actions).

- **RUX-16** — `DataTable` du DM reçoit la même prop `priority` : à 1 280–1 439, les colonnes de priorité > 6 se
  replient derrière « Colonnes ▾ » ; aucune colonne n’est supprimée. Effort **M**.
- **RUX-17** — Cartes ou tableau ? Le **tableau** est la forme des objets qu’on compare (comptes, contacts, missions,
  factures, utilisateurs DM) ; la **grille de cartes** est réservée aux objets qu’on choisit un par un et qui ont
  un visuel ou un récit (runbooks DM, offres, cas d’usage du site, pistes de Découvrir). Jamais les deux pour le même
  objet sur la même surface, et jamais un « basculer en cartes » sur bureau (la vue « facturation » en cartes des
  comptes, `AccountContent.tsx:848`, devient une vue du même tableau avec d’autres colonnes). Effort **S**.

---

### T7 — Vide, chargement, erreur : quatre chargeurs et une erreur qui ment

**Constat.**

- Chargement dans l’app : `Loader2` ×42 (31 fichiers), `BrailleLoader` ×23 (21), `Spinner` ×11 (10), `Skeleton` ×12
  dans 3 fichiers seulement. Le `BrailleLoader` n’est pas représentable en maquette et les specs le remplacent déjà
  (`packages/figma-sync/src/spec/pages/app/accounts-detail.ts`, source `apps/web/src/features/accounts/view/account-detail/states/AccountDetailLoading.tsx:6`,
  et `packages/figma-sync/src/spec/pages/app/contacts.ts`, source `apps/web/src/features/contacts/view/ContactContent.tsx:4`).
- Erreurs : pas de composant `ErrorState` ; il y a `GenericProblemMessage` (`packages/ui/src/organisms/generic-problem-message.tsx:35`,
  12 fichiers) et un `ScreenState` propre à l’app (`apps/web/src/components/primitives/ScreenState.tsx:122`, 16 fichiers).
  Le suivi des missions affiche en erreur le TITRE de l’état vide, « Aucune mission active pour l’instant. »
  (`apps/web/src/features/mission-tracking/view/MissionTrackingPage.tsx:125`) : l’échec se lit comme une absence.
- Le board des missions n’a pas d’état vide : douze colonnes à « 0 »
  (`apps/web/src/features/missions/view/MissionBoardPage.tsx:100`).
- DM : **0** `loading.tsx`, **0** `error.tsx`, **0** `not-found.tsx` sur 43 pages (ex. `apps/dashboard-manager/src/app/page.tsx:51`,
  `apps/dashboard-manager/src/app/laura-site/page.tsx:64`) : un rendu serveur bloquant, un écran blanc pendant
  le chargement.

**Impact.** Le chargement change de forme d’un écran à l’autre (points braille, cercle, squelette), donc aucun ne
dit « la page arrive ». Une panne rendue comme « Aucune mission » fait croire au commercial que son portefeuille est
vide — c’est la pire erreur possible pour la confiance.

**Décision.**

- **RUX-18** — Trois composants d’état, pas un de plus, sur les trois surfaces :
  - **Chargement** = `Skeleton` à la forme du contenu (tableau : 8 lignes à la hauteur réelle de ligne ; blocs :
    les cartes du gabarit). `Spinner` est réservé à un bouton en cours d’action (dans le bouton, à la place de
    l’icône, libellé conservé). `BrailleLoader` est réservé à l’attente longue d’une analyse (T11) et nulle part
    ailleurs. `Loader2` en dur est interdit.
  - **Vide** = `EmptyState` : un titre qui NOMME ce qui manque, une phrase, UNE action (règle commune déjà écrite).
    Deux variantes : `never` (jamais rempli) et `filtered` (RUX-14).
  - **Erreur** = un nouveau `ErrorState` qui fusionne `GenericProblemMessage` et l’état d’erreur de `ScreenState` :
    icône `AlertTriangle`, un titre qui dit ce qui n’a pas pu être LU (« Tes missions n’ont pas pu être chargées »),
    jamais un titre d’état vide, « Réessayer » en `outline`, et un lien discret « Signaler » vers les signalements.
    Les filtres et le titre restent affichés.

  Effort **S** (catalogue et maquette), **M** (remplacement dans l’app, guidé par un cliquet).

- **RUX-19** — Le DM gagne un `loading.tsx` et un `error.tsx` au niveau de `app/` (hérités par toutes les routes),
  qui rendent les mêmes `Skeleton` et `ErrorState`. Effort **S**.
- **RUX-20** — Un board, un kanban ou une grille de compteurs dont toutes les colonnes valent 0 n’est pas dessiné :
  l’`EmptyState` le remplace (le board des missions, la file de décisions). Effort **S**.

---

### T8 — Formulaires et enregistrement : trois modèles sans règle

**Constat.** Dans les 12 vues de réglages : 5 ont un bouton « Enregistrer » — un bouton en bas de formulaire pour
`apps/web/src/features/settings/view/BrandingView.tsx:254`, **un petit bouton par champ** pour
`CommercialLoadSettingsView.tsx:158`, `FinanceSettingsView.tsx:158`, `ReverseMarketSettingsView.tsx:172`,
`PipelineSlaView.tsx:161` — ; 3 enregistrent à chaque changement avec un toast (`LauraModeSettingsView.tsx:83`,
`NotificationsView.tsx:237`, `PreferencesView.tsx:232`) ; `ReverseMarketSettingsView.tsx:66` mélange les deux ; le
profil est le seul à enregistrer automatiquement avec un indicateur (`apps/web/src/features/profile/hooks/useAutoSaveProfile.ts:16`,
`apps/web/src/features/profile/components/SaveStatus.tsx:9`). Aucune garde de modifications non enregistrées
(0 `beforeunload`, 0 `useBlocker`). `react-hook-form` n’est utilisé que par l’authentification et la démo
(`apps/web/src/features/auth/hooks/useSignupForm.ts:64`) ; la validation se fait presque partout à la soumission.
Dans la maquette, 29 des 30 specs `settings` n’ont pas de `footer` (seule `settings-security.ts` en a un). Et
`SettingsRow` reste en ligne sous 768 (`packages/ui/src/molecules/settings-row.tsx:17`).

**Impact.** Le commercial ne sait pas si son réglage est pris en compte : parfois il faut cliquer, parfois non,
parfois un toast confirme, parfois rien. Quitter une page de réglage avec une saisie non enregistrée la perd sans
prévenir.

**Décision.**

- **RUX-21** — Deux modèles, et la règle qui choisit :
  - **Bascule, choix unique, sélection** (`Switch`, `RadioGroup`, `Select`) : enregistrement **immédiat**, sans toast.
    Un indicateur « Enregistré » en `text/tertiary` apparaît 2 s à droite de la ligne (le `SaveStatus` du profil,
    promu dans `packages/ui`). En cas d’échec, la valeur revient à l’état précédent avec un message sous la ligne.
  - **Saisie de texte ou de nombre, ou un groupe de champs liés** : un bouton « Enregistrer » **par groupe**
    (`SectionCard`), dans le pied de la carte, aligné à droite ; il reste inactif tant que rien n’a changé ; « Annuler »
    à sa gauche remet les valeurs. Jamais un bouton par champ.
  - Tout groupe modifié et non enregistré déclenche un `AlertDialog` quand on quitte la page (« Quitter sans
    enregistrer ? » — « Rester » / « Quitter sans enregistrer »).

  Effort **S** (maquette : le pied de `SectionCard` et l’indicateur), **M** (les 5 vues à bouton par champ).

- **RUX-22** — Validation en ligne à la sortie du champ (`onBlur`), message sous le champ en `soft/danger/text`,
  jamais un toast pour une erreur de saisie. Sous 768, `SettingsRow` passe en colonne : libellé au-dessus du contrôle
  (déjà la cible de `packages/figma-sync/src/spec/pages/app/settings-shared.ts`). Effort **S** (`SettingsRow`), **M** (formulaires).

---

### T9 — Confirmations destructives : trois composants inutilisés, des `window.confirm`

**Constat.** `packages/ui` fournit `AlertDialog`, `ConfirmationDialog` (`packages/ui/src/components/confirmation-dialog.tsx:22`)
et `ActionDialog` (`packages/ui/src/components/action-dialog.tsx:79`) ; l’app n’en rend **aucun** et construit
27 dialogues maison (ex. `apps/web/src/features/accounts/view/accounts-list/DeleteConfirmDialog.tsx:12`, sur `ModalPortal`).
Deux `window.confirm` restent dans l’app (`apps/web/src/features/chat/view/ConversationsPanel.tsx:577`,
`apps/web/src/features/settings/view/BrandingView.tsx:263`) et quatre dans le DM, dont la suppression d’un membre qui
affiche « ✗ erreur » dans le bouton en cas d’échec (`apps/dashboard-manager/src/app/esn/[id]/_components/remove-member-button.tsx:16`)
et la suppression définitive d’un bandeau (`apps/dashboard-manager/src/app/banners/_components/banner-card.tsx:76`).
Le DM a montré la bonne voie pour la suspension d’un utilisateur : un panneau qui énonce les conséquences
(`apps/dashboard-manager/src/app/users/_components/suspend-user.tsx:15`). L’annulation après coup n’existe que par
îlots (`apps/web/src/features/tasks/view/TaskList.tsx:164`).

**Impact.** `window.confirm` n’est pas thématisé, pas traduit, et bloque la page ; un opérateur du DM qui supprime un
membre d’une ESN cliente le fait avec la même boîte grise qu’un navigateur de 2005. La doctrine « on archive, on ne
supprime pas » n’a pas de forme visuelle commune.

**Décision.**

- **RUX-23** — Trois niveaux de gravité, un composant chacun :
  1. **Réversible** (archiver, retirer d’une liste, masquer) : aucune confirmation ; un toast « Archivé » avec
     « Annuler » pendant 8 s. C’est le cas par défaut, puisqu’on archive au lieu de supprimer.
  2. **Irréversible pour soi** (supprimer un fil de Laura, réinitialiser la marque) : `ConfirmationDialog`, titre =
     le verbe et l’objet (« Supprimer ce fil ? »), une phrase sur la conséquence, bouton `destructive` qui répète le
     verbe (« Supprimer le fil »), « Annuler » à gauche. Focus initial sur « Annuler ».
  3. **Irréversible pour autrui ou sortant** (envoyer un e-mail, retirer un membre, effacement RGPD, arrêter une
     file dans le DM) : `ActionDialog` qui liste ce qui va se passer ; pour l’effacement RGPD et la suppression d’un
     espace, saisie du nom pour confirmer.

  `window.confirm` est interdit dans les trois surfaces (nouvelle garde d’architecture : sait dire NON sur les 6
  appels actuels). Effort **S** (maquette), **M** (app + DM).

---

### T10 — Création et édition : modale par défaut, sans règle

**Constat.** `Dialog` ×118 (104 fichiers), `Sheet` ×40 (28), `Drawer` ×2, plus 6 `ModalPortal` maison. La liste des
missions ouvre un `Sheet` puis un bouton vers la fiche (`apps/web/src/features/missions/view/MissionsPage.tsx:558`,
`MissionDetailSheet.tsx:139`) ; la planification ouvre un autre panneau (`PlanningPage.tsx:700`,
`MissionDetailPanel.tsx:141`). Le DM n’a ni dialogue ni tiroir (`apps/dashboard-manager/src/architecture/aucune-librairie-ui.test.ts`).

**Impact.** Pour « voir le détail », le commercial obtient tantôt une modale, tantôt un panneau latéral, tantôt une
page ; sur mobile, une modale de formulaire long se superpose au clavier.

**Décision.**

- **RUX-24** — Règle de forme :
  - **Dialog** (≤ 560 px) : une décision ou un formulaire de 1 à 4 champs.
  - **Sheet latéral droit** (480 px, 640 px pour un aperçu) : consulter ou éditer un élément SANS quitter la liste —
    c’est aussi la forme du maître-détail sous 2 560 px (§3).
  - **Page** : tout formulaire de plus de 4 champs, tout parcours en étapes, toute fiche d’entité.

  Sous 768, `Dialog` et `Sheet` deviennent un `Sheet` du bas, pleine hauteur (`100dvh`) au-delà de 4 champs.
  Effort **S** (maquette), **M** (convergence des panneaux Missions).

---

### T11 — Toasts : deux systèmes livrés, un seul usage clair

**Constat.** L’app utilise sonner en bas à droite (`apps/web/src/App.tsx:10,131`), importé directement de `sonner` par
239 fichiers, alors que `packages/ui` en réexporte une version (`packages/ui/src/components/sonner.tsx:11`) et livre
AUSSI un toast Radix mort (`packages/ui/src/components/toast.tsx:1`). 363 `toast.success`. Le DM n’a pas de toast :
le retour s’écrit dans le bouton.

**Décision.**

- **RUX-25** — Un seul système (sonner via `@bellum/ui`), en bas à droite sur bureau, en haut sous 768 (la
  `MobileTabBar` occupe le bas). Un toast annonce un résultat HORS de la vue ou annulable ; il ne double jamais un
  changement déjà visible à l’écran (ce qui supprime la majorité des 363 `toast.success`, remplacés par l’indicateur
  de RUX-21). Le DM adopte le même composant. Le toast Radix est retiré de `packages/ui`. Effort **M**.

---

### T12 — Densité : l’app aérée, le DM compressé sous le plancher

**Constat.** Tableau de l’app : 14 px, entête 40 px, cellules `p-2` (`packages/ui/src/components/table.tsx`). DM :
11 px, lignes fixes de 32 px, 6×10 de marge, entête en capitales collant, zébrures
(`apps/dashboard-manager/src/ui/DataTable.module.css:13-30,45-60`) ; les `<table>` bruts du DM en 11×14
(`apps/dashboard-manager/src/app/globals.css:197-210`). Les cartes du DM ont 18 px de marge interne (`:167-172`),
contre 16 ou 24 dans l’app. Le guide écarte une « densité par persona » (`agent_docs/regles-design-2026-08-23.md:363`).

**Décision.**

- **RUX-26** — Deux densités, nommées, pas une par persona : **Confort** (app, par défaut : ligne de 44 px, 14 px,
  cellules 12×8) et **Compact** (DM, et bascule de l’utilisateur de l’app dans ses préférences : ligne de 36 px, 13 px
  → arrondi à **14 px** pour tenir D80 avec un interligne de 20, cellules 8×6). Plus de 11 px nulle part. Entête de
  tableau en `text/caption` (12 px), pas en capitales (les capitales à 11 px sont la première cause d’illisibilité
  du DM). Zébrures seulement en Compact. Effort **S** (maquette : une variante `density` sur `Table`), **M** (DM).

---

### T13 — Mouvement : cinq courbes locales, trois durées hors grammaire

**Constat.** Écarts déjà sourcés par les specs : bézier locale `[0.23, 1, 0.32, 1]` dans deux écrans
(`apps/web/src/features/action-history/view/ActionHistoryPage.tsx:25`, `ActionHistoryDetailPage.tsx:212`),
`ease: 'easeOut'` (`apps/web/src/features/billing/view/Billing.tsx:92`), durées 0,12 / 0,18 / 0,24 s
(`apps/web/src/features/accounts/view/AccountContent.tsx:895`) ; sur le site, 0,8 s et une courbe propre à
`apps/website/src/features/landing/Reveal.tsx:12`, que `/use-cases` n’utilise même pas (`Reveal.tsx:6`).

**Décision.**

- **RUX-27** — `packages/ui/src/motion.ts` est importé par le site aussi. Sur le site, `Reveal` passe à
  `DURATION.perceptible` + `EASE.out` (0,26 s), déclenché une seule fois par section, et s’applique à toutes les
  pages marketing ou à aucune (recommandation : toutes, sauf les pages légales). Effort **S**.

---

### T14 — Couleurs d’état : le site et le DM parlent une autre langue

**Constat.** `/status` du site peint ses états en `bg-emerald-400` / `bg-amber-400` / `bg-red-400`
(`apps/website/src/features/status/StatusBoard.tsx:34`). L’app garde 25 `emerald-`, 43 `amber-`, 29 `red-` en dur.
Le DM double le danger (`--danger` et `--stop`). La règle 7.1 dit « une couleur porte un ÉTAT, jamais une
CATÉGORIE » (`agent_docs/regles-design-2026-08-23.md:233`).

**Décision.**

- **RUX-28** — Quatre tons d’état et leur triplet `soft/{tone}/{bg,border,text}`, identiques sur les trois surfaces :
  `success`, `warning`, `danger`, `info`, plus `neutral`. Pas de `stop` : c’est `danger`. Une pastille d’état est
  toujours accompagnée d’un libellé (la couleur ne porte jamais seule l’information). Effort **S** (site), **S** (DM).

---

### T15 — La doctrine « on n’affiche pas ce qu’on n’a pas » n’est pas encore dans la maquette

**Constat.** La décision du 20/09 (#2613, `agent_docs/doctrine.md:15`) : dans une liste, une carte, un bandeau ou un
tableau, une valeur absente ne produit **aucune ligne** ; seul un score garde ses axes non évaluables nommés. Or :

- la règle du gabarit `dashboard` dit « une valeur non mesurée s’écrit “non mesuré” »
  (`packages/figma-sync/src/plugin/templates/rules.ts:69`) ;
- `KpiTile` en `state: unmeasured` affiche « — » (`packages/figma-sync/src/spec/catalog.ts:232`,
  `packages/figma-sync/src/plugin/components/recipes/charts.ts:148`) ;
- la spec des cessions aligne **trois** tuiles « Non mesuré » côte à côte
  (`packages/figma-sync/src/spec/pages/app/missions-cessions.ts:40-50`) ; une pastille « Disponibilité — non mesuré »
  (`packages/figma-sync/src/spec/pages/app/projects-needs-detail.ts:102`) ; un KPI « Étape où l’on attend le plus —
  non mesuré » (`packages/figma-sync/src/spec/pages/app/pilotage-parcours.ts:56`) ;
- les tableaux d’exemple sont remplis de « — » (`packages/figma-sync/src/spec/pages/app/accounts.ts`, lignes du tableau).

**Impact.** La maquette enseigne aux lots suivants l’inverse de la dernière décision : un écran fait de « Non mesuré »
envoie « un signal négatif à l’user qui est pas utile » (les mots du fondateur).

**Décision.**

- **RUX-29** — Dans la maquette cible :
  - une **tuile KPI** sans valeur n’est pas dessinée ; si TOUTES les tuiles d’une rangée sont absentes, la rangée
    est remplacée par UNE phrase qui dit pourquoi (« Les cessions apparaîtront après la première facture préparée »)
    — jamais trois fois « Non mesuré » ;
  - une **pastille** sans valeur n’existe pas ;
  - une **cellule de tableau** sans valeur reste **vide** (pas de « — ») : le tableau garde ses colonnes, la ligne
    garde sa hauteur ; la carte-ligne mobile (RUX-15) n’affiche pas la paire ;
  - un **score** montre ses axes et NOMME ceux qui n’ont pas pu être évalués (« Accessibilité : pas assez de
    contacts pour l’évaluer »), sous 3 axes pas de score ;
  - jamais « 0 » pour une absence, nulle part.

  `rules.ts:69`, `catalog.ts:232` et les specs citées sont à réécrire par le lot propriétaire. Effort **S**.
  → question Q4 pour les FICHES d’objet, que #2613 laisse hors corpus.

---

### T16 — Largeurs extrêmes : on étire au lieu d’ajouter

**Constat.** Le contenu des listes et des réglages s’étire sans borne au-delà de 1 920 (`apps/web/src/components/page/page-gutter.ts:46-47`) ;
la bande de décisions de Pilotage s’arrête à 3 colonnes (`apps/web/src/features/pilotage/view/DecisionStrip.tsx:105`) ;
aucune règle `@media (min-width…)` dans le DM (`apps/dashboard-manager/src/app/globals.css:114`), seulement un
plafond `.wrap` à 1 600 ; quatre grilles DM `repeat(4, 1fr)` en style en ligne qui se resserrent à 1 280 au lieu de
passer à 3 (`apps/dashboard-manager/src/app/clients/page.tsx:23`, `couts/page.tsx:206`, `changelog/page.tsx:50`,
`impersonations/page.tsx:68`) ; une rangée `.kpis` sans règle CSS (`apps/dashboard-manager/src/app/produit/laura-non-compris/page.tsx:59`).
Côté site, 3 forfaits dans une grille à 4 colonnes laissent un trou dès 1 280 (`apps/website/src/features/pricing/PricingPlans.tsx:262`,
`apps/website/src/features/landing/Pricing.tsx:153`).

**Décision.**

- **RUX-30** — Plafond `CONTENT_MAX` = 1 600 px appliqué dans le code (`page-gutter.ts`), centré ; au-delà, les
  gabarits AJOUTENT (maître-détail, KPI, aside — §3). Les grilles déclarent `minmax(<largeur de carte>, 1fr)` avec
  un nombre de colonnes maximal égal au nombre d’éléments (3 forfaits → 3 colonnes, jamais 4). Effort **S** (app),
  **M** (DM).

---

## 2. Frictions par parcours clés

### P1 — Analyser une entreprise → dossier → contacts → plan d’action → message

| Étape                | Friction constatée                                                                                                                                                                                                                                                                                                                       | Source                                                                                                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lancer               | 5 portes au moins : `/search` (hors menu, 22 liens entrants), le lanceur de la liste des comptes, les pastilles du composer de Laura, une suggestion de Laura, « Lancer une analyse » dans les comptes similaires. La clé « Nouvelle analyse » existe et n’est utilisée nulle part.                                                      | `apps/web/src/components/navigation/off-nav-screens.ts:74`, `apps/web/src/features/accounts/view/accounts-list/AccountsToolbar.tsx:66`, `apps/web/src/features/launcher/ComposerLauncher.tsx:38`, `apps/web/src/i18n/locales/fr/nav.json:2` |
| Nommer               | Le même geste s’appelle « Recherche » (titre), (l’entête de /search est retiré, #3618) « Confirmer et lancer » (`/search`), « Analyser » (lanceur), « Analyser une entreprise » (bouton de la spec des comptes).                                                                                                                         | `nav.json:61`, `apps/web/src/i18n/locales/fr/search.json:8,253`, `launcher.json`                                                                                                                                                            |
| Choisir le périmètre | Le lanceur rapide n’offre que « groupe » et renvoie vers « l’analyse complète » pour le reste : deux parcours pour une tâche.                                                                                                                                                                                                            | `apps/web/src/features/launcher/AccountLaunchSurface.tsx:194`                                                                                                                                                                               |
| Payer                | Bon : coût en crédits, solde et durée annoncés avant, « Rien n’est débité avant ta confirmation ». À garder tel quel.                                                                                                                                                                                                                    | `apps/web/src/features/search/components/ScopeConfirmPanel.tsx:319-323`, `AccountLaunchSurface.tsx:285-294`                                                                                                                                 |
| Attendre 3 à 6 min   | Bon : pourcentage ou « En cours », découvertes au fil de l’eau, « Tu peux quitter cette page », tâche de fond dans la barre latérale, toast de fin.                                                                                                                                                                                      | `apps/web/src/components/analysis/AnalysisProgressCard.tsx:233,276`, `apps/web/src/components/sidebar/background-tasks/useBackgroundEntries.ts:44`                                                                                          |
| Lire le dossier      | 7 sections, ~20 onglets ; des alias d’URL gardent les anciens noms (« Carte d’influence » → « Organigramme »).                                                                                                                                                                                                                           | `apps/web/src/features/accounts/view/account-detail/components/AccountDetailTabsBar.tsx:113-144`, `accountDetailSearch.ts:33-40`                                                                                                            |
| Aller au contact     | 5 chemins vers le même panneau d’approche.                                                                                                                                                                                                                                                                                               | `ContactContent.tsx:512`, `ContactDetail.tsx:51`, `PriorityPathSection.tsx:137`, `CompactContactRow.tsx:327`, `TabMessages.tsx:126`                                                                                                         |
| Préparer le message  | Trois fins différentes selon le canal : LinkedIn = « copier + ouvrir » puis « déclarer envoyé » ; e-mail = « Modifier » + « Envoyer » (envoi depuis l’app, après un dialogue qui confirme destinataire et objet) ; autres = « Copier ». Deux libellés de copie (« Copier », « Copier le message »). Aucun « Ouvrir dans ma messagerie ». | `apps/web/src/features/accounts/view/account-detail/components/contact-engagement/EngagementMessage.tsx:309-325,450`, `EngagementSendEmail.tsx:30-45`, `apps/web/src/i18n/locales/fr/actions.json:144`                                      |

L’envoi d’e-mail est conforme à la doctrine : c’est le commercial qui clique « Envoyer », après confirmation, et
Laura n’a aucun chemin d’écriture. Mais trois fins différentes pour un même moment (« le message est prêt »)
brouillent qui fait quoi.

**Décisions.**

- **RUX-31** — Un verbe, une porte principale : **« Analyser une entreprise »**, bouton `default` en tête de la
  barre latérale (sous le logo, au-dessus des sections ; en icône `+` quand la barre est réduite) et ligne
  « Analyser “<saisie>” » de ⌘K (RUX-07). Les autres portes restent (Laura, états vides, comptes similaires) mais
  ouvrent TOUTES le même `Dialog` de lancement, en 2 temps : identifier → confirmer (périmètre, coût, durée). Le
  périmètre se choisit dans ce dialogue ; `/search` devient la page de secours de ce dialogue (lien profond), plus
  un second parcours. Bouton final : « Lancer l’analyse — n crédits ». Effort **M**.
- **RUX-32** — Le dossier passe de ~20 onglets à **5 onglets** stables : Synthèse · Personnes · Plan d’action ·
  Signaux · Historique. Les anciennes sections deviennent des blocs ancrés dans ces onglets, avec un sommaire
  d’ancres dans l’`aside` à ≥ 1 280. Les alias d’URL restent (ils ne coûtent rien). Effort **L**. → question Q2.
- **RUX-33** — Le panneau d’approche a une anatomie unique, quel que soit le canal : brouillon de Laura (éditable
  dans le panneau) → une rangée d’actions à droite, dans cet ordre : **action principale du canal**
  (« Envoyer » pour l’e-mail avec confirmation ; « Copier et ouvrir LinkedIn » ; « Copier » ailleurs), puis
  « Ouvrir dans ma messagerie » (lien `mailto:` prérempli) pour l’e-mail, puis « Marquer comme fait » — le geste
  déclaratif, jamais présenté comme une preuve d’envoi. Un seul libellé de copie : « Copier le message ». Le badge
  de Laura dit « Préparé par Laura », jamais « Envoyé par Laura ». Effort **M**. → question Q3.

### P2 — Missions et finance

**Constat.** 14 onglets en 4 groupes (`apps/web/src/components/navigation/sections.ts:471-656`) ; un groupe
« Planification » contient un onglet « Planification » (`nav.json:119,135`) ; `/cra` s’affiche « Relevés d’activité »
et `/board` « Historique » ; « Débriefer » vit sous `/pilotage/rex`. Liste → dossier en 2 clics via un `Sheet`. Surtout :
la chaîne du dossier (`apps/web/src/features/chain/view/MissionChainStrip.tsx:226`) envoie vers CRA, facturation et
encaissements **sans filtre sur la mission** — le code l’avoue (`apps/web/src/features/chain/missionChain.ts:129-134`).
Deux statuts (`ended`, `completed`) portent le même libellé « Terminée » (`apps/web/src/i18n/locales/fr/missions.json:17`).
« Facturation » désigne l’abonnement dans les réglages et la facturation client dans Missions.

**Décisions.**

- **RUX-34** — Missions se range en **3 groupes, 9 onglets au plus** : _Missions_ (En cours · Planification ·
  Renouvellements) · _De l’activité au cash_ (Relevés d’activité · Facturation · Encaissements · Cessions) ·
  _Suivi_ (Notes de frais · Débriefs). « Nouvelle » n’est plus un onglet mais l’action principale de l’en-tête ;
  « Historique » devient la vue « Terminées » de la liste ; ADV et Paiements rejoignent _De l’activité au cash_ s’ils
  ne se fondent pas (à mesurer à l’usage). Un groupe ne porte jamais le nom d’un de ses onglets. Effort **M**.
- **RUX-35** — Chaque maillon de la chaîne s’ouvre **filtré sur la mission** (`?mission=<id>`) avec une pastille
  retirable « Mission : <nom> » dans la `FilterBar`. Effort **M** (priorité haute : c’est la friction la plus coûteuse
  du parcours finance).
- **RUX-36** — « Facturation » dans les réglages devient **« Abonnement et crédits »**. « Terminée » et
  « Clôturée » distinguent `ended` et `completed` (à valider avec le glossaire métier). Effort **S**.

### P3 — Réglages

**Constat.** ~30 entrées en 2 groupes (`apps/web/src/components/sidebar/items.settings.ts:35,102`) ; deux sortent de
`/settings` (Intégrations, Facturation) ; « Équipe » désigne deux écrans différents (`nav.json:23,103`) ; trois
orthographes pour la base de connaissance (`nav.json:41,66,106`) ; Laura éclatée en « Assistant IA », « Mémoire de
Laura » (Personnel) et « Laura — mode par défaut » (Espace) ; sous 768, la navigation de 30 entrées s’empile au-dessus
du contenu (`apps/web/src/components/page/SettingsPage.tsx:62`) ; trois portes « relancer/revoir » dans « Démarrage »
(`apps/web/src/features/settings/view/PreferencesView.tsx:143`).

**Décisions.**

- **RUX-37** — La navigation des réglages passe à **4 groupes** avec des titres qui disent à qui ils s’adressent :
  _Mon compte_ (Profil · Préférences · Notifications · Sécurité · Mes données) · _Laura_ (Mode · Mémoire ·
  Connaissances · Assistant externe (MCP) · Routines) · _Mon espace_ (Équipe et accès · Règles · Marque · Listes et
  lexique · Pipe et charge · Finance) · _Branchements et abonnement_ (Intégrations · Import · Abonnement et crédits).
  Un libellé par objet (« Connaissances », « Équipe et accès »). Les groupes réservés aux administrateurs portent
  un badge « Admin ». Effort **M**.
- **RUX-38** — Sous 768 : patron liste → page (la liste plein écran, un tap ouvre la page, « ‹ Réglages » pour
  revenir), déjà décidé dans `packages/figma-sync/src/spec/pages/app/settings-shared.ts`. Effort **M**.
- **RUX-39** — « Démarrage » devient UN bouton « Revoir la prise en main » qui ouvre un menu à 3 choix. Effort **S**.

### P4 — Onboarding

**Constat.** `/signup` → `/verify-email` → accueil (« Commencer » / « Plus tard ») → plan → entreprise →
questionnaire à **5 étapes et 49 sous-étapes** (`apps/web/src/features/onboarding/lib/questions/index.ts:75-197`) →
relecture → génération → `/welcome`. On peut sortir à plusieurs endroits ; un bug a renvoyé des utilisateurs payants
en boucle dans l’onboarding (`apps/web/src/features/onboarding/view/OnboardingWizard.tsx:277-286`). Le panneau de marque
de l’authentification disparaît sous 1 024 et pas sous 768 (`apps/web/src/features/auth/components/AuthBrandingPanel.tsx:11`).

**Impact.** 49 questions avant la première valeur ; la promesse du produit est « un dossier en 5 minutes ».

**Décisions.**

- **RUX-40** — **Valeur d’abord** : après la vérification de l’e-mail, un seul écran obligatoire (nom de
  l’entreprise de l’utilisateur + son rôle, 2 champs), puis **la première analyse** d’un compte cible, lancée
  depuis l’onboarding. Le questionnaire (49 sous-étapes) devient un « profil commercial » à compléter pendant les
  3–6 min d’attente de l’analyse, puis depuis « Aujourd’hui » (carte « Complète ton profil : n questions restantes »).
  La progression affichée compte les questions, jamais un pourcentage de « chance ». Effort **L**. → question Q5.
- **RUX-41** — Le gabarit `wizard` impose : progression visible en haut (étape n sur N, avec le nom des étapes à
  ≥ 1 024), « Retour » à gauche et « Continuer » à droite dans le pied collant, « Terminer plus tard » en lien
  tertiaire dans l’entête, qui ENREGISTRE l’état et ne ramène jamais dans le parcours. Effort **S**.

### P5 — Site → inscription

**Constat.** « Demander une démo » mène tantôt à la démo libre-service de l’app (`apps/website/src/features/landing/FinalCta.tsx:27`),
tantôt au formulaire du site (`apps/website/src/features/pricing/PricingCta.tsx:26`) ; « Voir la démo » idem
(`Hero.tsx:56` vs `ProductHero.tsx:39`). Libellés du bouton principal : « Créer mon compte », « Créer un compte »
(`apps/website/messages/fr/chatbot.json:84`), « Choisir une offre » qui mène à l’inscription (`pricing.json:148`),
« Choisir Growth », « Explorer la démo », « Parler à l’équipe ». Le prix Growth a une bascule mensuel/annuel sur
`/tarifs` mais pas sur l’accueil (`apps/website/src/features/landing/Pricing.tsx:125`). La page webinaire annonce
un événement passé (`apps/website/messages/fr/webinar.json:7`). Deux formulations de la phrase-clé sur le copilote
(`apps/website/messages/fr/about.json:19`).

**Décisions.**

- **RUX-42** — Trois intentions, trois libellés, trois destinations, partout sur le site :
  - **« Créer mon compte »** → `/signup` de l’app (bouton `default`) ;
  - **« Essayer la démo »** → la démo libre-service de l’app, sans compte (bouton `outline`) ;
  - **« Parler à l’équipe »** → le formulaire du site (`/demo`, renommé `/contact`), lien tertiaire.

  « Demander une démo » disparaît : il désignait deux choses. Les cartes de forfait disent « Créer mon compte »
  (Free, Growth) et « Parler à l’équipe » (Entreprise). La barre du site porte « Se connecter » (lien) +
  « Créer mon compte » (bouton). Effort **S**.

- **RUX-43** — L’aperçu tarifaire de l’accueil réutilise le composant de `/tarifs` (bascule comprise) : un prix ne
  s’affiche que d’une façon. La page webinaire se dépublie dès la date passée (état « Rediffusion » ou 404 contrôlé).
  Effort **S**.
- **RUX-44** — La page d’inscription reprend la marque du site en haut de colonne (logo, une phrase de promesse,
  3 preuves) et le panneau de marque tombe sous 768, pas sous 1 024. Effort **S**.

### P6 — DM : support client

**Constat.** Bonne base : ⌘K trouve utilisateurs, espaces, analyses, factures ; un e-mail complet mène directement à la
fiche (`apps/dashboard-manager/src/app/_components/global-search.logic.ts:11-15`). Frictions : la fiche d’une ESN existe
deux fois (`/esn/[id]` et `/teams/[id]`) ; `/esn`, `/teams` et `/clients?view=users` ne sont que des redirections
(`apps/dashboard-manager/src/app/esn/page.tsx:10`, `teams/page.tsx:11`) ; le tableau des membres d’une ESN n’a pas de
lien vers la fiche de chaque utilisateur (`apps/dashboard-manager/src/app/esn/[id]/page.tsx:79-86`) ; « Impersonations »
au menu et « incarnation » à l’écran ; l’audit ne se filtre ni par utilisateur ni par ESN et aucune fiche n’y renvoie
filtrée (`apps/dashboard-manager/src/app/audit/audit.logic.ts:116-130`).

**Décisions.**

- **RUX-45** — Une fiche par objet : `/esn/[id]` (la fiche d’espace) et `/users/[id]` (la fiche d’utilisateur) ; les
  doublons redirigent. Chaque fiche a la même anatomie de gabarit `detail` : entête (nom, plan, état), résumé (4 KPI),
  onglets _Membres · Usage · Facturation · Journal_, et dans l’`aside` les actions de support (incarner, suspendre,
  rembourser), chacune au niveau 3 de RUX-23. Chaque ligne de membre mène à sa fiche. Effort **M**.
- **RUX-46** — L’onglet _Journal_ d’une fiche est l’audit filtré sur cet objet (`?target=<id>`), avec un lien « Voir
  dans l’audit complet ». Effort **M**.
- **RUX-47** — Un seul mot : « Incarner » (verbe), « Incarnations » (menu). Effort **S**.

---

## 3. Règles de gabarit cibles

### 3.0 Les bandes de largeur

Les 16 largeurs de référence se lisent en 6 bandes. Chaque gabarit dit ce qu’il fait dans chacune ; entre deux largeurs
de la même bande, le comportement est identique.

| Bande                    | Largeurs                      | Coque                                                                       |
| ------------------------ | ----------------------------- | --------------------------------------------------------------------------- |
| **XS** téléphone         | 320 · 360 · 390 · 430         | `MobileTabBar` (4 onglets), marges 16, `100dvh`                             |
| **S** tablette / paysage | 768 · 834 · 844               | `Sidebar` en icônes (64 px), marges 24                                      |
| **M** petit bureau       | 1 024 · 1 194                 | `Sidebar` dépliée (240 px), marges 32                                       |
| **L** bureau             | 1 280 · 1 366 · 1 440 · 1 536 | `Sidebar` dépliée ; l’`aside` se pose à côté                                |
| **XL** grand bureau      | 1 920                         | contenu plafonné à 1 600, centré                                            |
| **XXL** très grand       | 2 560 · 3 440                 | 1 600 + une colonne d’usage (maître-détail, KPI, aide) ; jamais d’étirement |

Deux corrections au `rules.ts` actuel :

- **RUX-48** — Le paysage téléphone (844 × 390) garde la coque bureau (GA-28), mais les entêtes et barres d’actions ne
  sont plus collantes quand la hauteur est < 500 px : seules les barres de saisie (chat) et le pied de `wizard` le
  restent. Effort **S**.
- **RUX-49** — Largeurs dessinées par défaut : ajouter **1 024** (tablette paysage, la largeur où la `Sidebar` se déplie)
  aux pages `app` et `site`, et **1 280** reste la seule largeur « serrée » du DM. Les pages de liste dessinent aussi
  **768**. Effort **S** (plugin).

### 3.1 `list`

**Anatomie.** `header` (titre + intro) | `actions` (verbes : 1 principal + `⋯`) → `intro` (Vues, RUX-13) → `filters`
(`FilterBar` : recherche, + Filtre, pastilles, tri, densité) → `primary` (`Table`) | `aside` (320 : contexte,
« Comptes récents ») → `bulk` (barre de sélection) → `footer` (pagination ou « Charger plus »).

**Comportements.** Vide `never` / `filtered` / chargement (8 lignes squelette) / erreur, à la place de `primary`,
filtres conservés. La barre `bulk` apparaît **collée en bas de la zone de liste** dès qu’une ligne est cochée (au lieu
de sous la liste, où elle sort de l’écran au-delà de 20 lignes), avec le compte « n sélectionnés », les actions,
« Tout désélectionner ».

| Bande | Comportement                                                                                                                                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| XS    | Titre 20 px ; action principale pleine largeur sous l’intro ; Vues en `Select` ; « Filtres (n) » ouvre un `Sheet` du bas ; `Table` → cartes-lignes (RUX-15) ; `aside` sous la liste, replié ; `bulk` au-dessus de la `MobileTabBar`. |
| S     | Colonnes de priorité 1–4 ; `aside` sous la liste ; Vues en onglets défilants.                                                                                                                                                        |
| M     | Toutes les colonnes ; `aside` sous la liste.                                                                                                                                                                                         |
| L     | `aside` à droite (320) ; la ligne ouvre un `Sheet` d’aperçu de 480.                                                                                                                                                                  |
| XL    | Plafond 1 600, centré.                                                                                                                                                                                                               |
| XXL   | Maître-détail : la liste garde ~1 040, l’aperçu de la ligne sélectionnée se pose à droite (560) à la place du `Sheet` ; l’`aside` passe au-dessus de la liste en bandeau repliable.                                                  |

### 3.2 `detail`

**Anatomie.** `header` (nom de l’entité, fil d’Ariane) | `actions` (1 principale : « Préparer un message », « Mettre à
jour l’analyse »…) → `summary` (identité + score AVEC ses axes, jamais nu ; 4 faits clés au plus ; les absents ne font
aucune ligne) → `tabs` (5 au plus, variante `underline`, collants sous l’entête au défilement) → `primary` | `aside`
(360 : sommaire d’ancres, provenance, collègues) → `footer`.

**Comportements.** Chargement = squelette du résumé + du premier onglet ; erreur = `ErrorState` qui garde l’entête
si le nom est connu ; entité introuvable = `EmptyState` « Ce compte n’existe plus ou a été archivé » + « Retour aux
comptes ».

| Bande | Comportement                                                                                                                                                                       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| XS    | Résumé en pile ; onglets en rangée défilante avec masque de débordement ; action principale en bouton collé au-dessus de la `MobileTabBar` ; `aside` en fin de page, replié.       |
| S · M | `aside` sous `primary` ; résumé sur 2 colonnes.                                                                                                                                    |
| L     | `aside` à droite (360), collant.                                                                                                                                                   |
| XL    | Plafond 1 600.                                                                                                                                                                     |
| XXL   | **Nouveau** : `primary` borné à 1 040, `aside` à 360, et une 3ᵉ colonne de 400 pour Laura (« Demander à Laura sur ce compte »), repliable — on ajoute de l’usage au lieu d’étirer. |

### 3.3 `dashboard`

**Anatomie.** `header` | `actions` (période, export) → `filters` (périmètre : moi / équipe / espace, période) →
`kpis` (tuiles `KpiTile` + delta ; aucune probabilité ; une tuile sans valeur n’est pas dessinée — RUX-29) →
`primary` / `secondary` (graphes, listes courtes de 5 lignes + « Tout voir ») | `aside` (décisions, alertes).

**Comportements.** Rien à piloter = UNE phrase qui dit quand la page se remplira + une action. Chargement =
squelettes de tuiles et de graphes.

| Bande | Comportement                                                                                          |
| ----- | ----------------------------------------------------------------------------------------------------- |
| XS    | KPI en 2 colonnes (1 si la valeur dépasse 8 caractères) ; graphes pleine largeur ; `aside` sous tout. |
| S · M | KPI en 2 colonnes (S) / 3 (M) ; `aside` sous `primary`.                                               |
| L     | KPI : 4 colonnes à 1 280–1 439, jusqu’à 5 à ≥ 1 440 ; `aside` à droite.                               |
| XL    | Plafond 1 600.                                                                                        |
| XXL   | +2 colonnes de KPI (jusqu’à 7) et `secondary` passe À CÔTÉ de `primary`.                              |

### 3.4 `settings`

**Anatomie.** `header` (« Réglages », sans répéter la section) → `sectionNav` (240, les 4 groupes de RUX-37) |
`primary` (groupes `SectionCard` de 720 max ; pied de carte = « Annuler » + « Enregistrer » pour les groupes de saisie,
indicateur « Enregistré » pour les bascules — RUX-21) | `aside` (aide contextuelle, 320).

**Comportements.** État vide facultatif pour les réglages qui listent (membres, entités). Quitter avec des
modifications ouvre l’`AlertDialog` de RUX-21.

| Bande         | Comportement                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------- |
| XS            | Liste → page (RUX-38) ; `SettingsRow` en colonne ; « Enregistrer » pleine largeur en pied de carte. |
| S             | `sectionNav` en colonne étroite (200) ; `aside` sous les groupes.                                   |
| M · L < 1 536 | `sectionNav` 240 + groupes 720 ; `aside` sous les groupes.                                          |
| L ≥ 1 536     | `aside` à droite.                                                                                   |
| XL · XXL      | Plafond 1 328 ; les groupes restent à 720 ; rien ne s’étire.                                        |

### 3.5 `wizard`

**Anatomie.** Coque sans navigation. `header` (logo à gauche, « Terminer plus tard » à droite) → `progress`
(étape n / N + nom de l’étape) → `primary` (720 max, une question ou un groupe par écran) | `aside` (320 : pourquoi
on demande, ce que Laura en fera) → `footer` collant (« Retour » à gauche, « Continuer » à droite, désactivé tant que
l’obligatoire manque, avec la raison en `text/secondary`).

| Bande  | Comportement                                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| XS     | `progress` réduit à une barre + « 3/7 » ; `aside` en lien « Pourquoi cette question ? » qui ouvre un `Sheet` ; pied collant pleine largeur au-dessus du clavier (`dvh`). |
| S · M  | `aside` sous `primary`.                                                                                                                                                  |
| L et + | `aside` à droite ; colonne centrée, jamais plus large que 720 + 24 + 320.                                                                                                |

### 3.6 `chat` (Laura)

**Anatomie.** `header` (« Laura », `LauraFace`, fil actif, « Nouveau fil ») → `history` (280 : fils, recherche) |
`thread` (messages à 70 caractères, une carte d’action par proposition — « Préparer le message » — jamais « Envoyer »)
/ `composer` (collé en bas, lanceurs en pastilles au-dessus, mémoire annoncée par un `h2` masqué — écart
`apps/web/src/features/chat/view/Chat.tsx:2326`) | `aside` (320 : contexte du compte ou du contact en cours).

| Bande   | Comportement                                                                                                                                                                 |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| XS      | `thread` + `composer` seuls ; `history` derrière le bouton « Fils » (un `Sheet` gauche) ; `aside` derrière « Contexte » (un `Sheet` du bas) ; composer au-dessus du clavier. |
| S · M   | `history` repliée en icône ; `aside` en `Sheet`.                                                                                                                             |
| L       | `history` 280 + `thread` ; `aside` en `Sheet`.                                                                                                                               |
| ≥ 1 536 | `history` + `thread` + `aside`.                                                                                                                                              |
| XXL     | Le fil reste à 70 caractères, centré dans sa colonne ; l’`aside` s’élargit à 400 pour montrer la fiche complète du compte.                                                   |

### 3.7 `auth`

**Anatomie.** Deux colonnes à partir de 768 : panneau de marque (40 % de la largeur, 560 max : promesse, 3 preuves,
logo) | colonne du formulaire (400 max, centrée). Sous 768 : une colonne, logo + promesse en une ligne au-dessus du
formulaire. Le gabarit actuel n’a qu’une colonne de 400 (`packages/figma-sync/src/plugin/templates/rules.ts:97-104`)
alors que le code a un panneau de marque (`AuthBrandingPanel`) : la cible garde le panneau, à la borne 768.

**Comportements.** Erreur de connexion sous le formulaire, jamais un toast ; bouton en `Spinner` pendant l’envoi ;
lien secondaire (« Mot de passe oublié », « Créer mon compte ») en pied. `welcome`, `share` et `demo` sortent de
ce gabarit : `welcome` devient un état de « Aujourd’hui » (RUX-10), `share` un `detail` en lecture seule avec la
coque du site, `demo` un `marketing` (écarts déjà relevés dans les specs `app/welcome.ts`, `app/share.ts`,
`app/demo.ts`). Effort **S** (maquette).

### 3.8 `marketing`

**Anatomie.** `nav` (pleine largeur : logo, ≤ 5 liens, « Se connecter », « Créer mon compte ») → `hero` (titre en
`text/display`, une phrase, les 2 boutons de RUX-42) → `sections` (1 200 max, texte à 70 caractères) → `cta` (le même
couple de boutons) → `footer`.

**Comportements.** Le gabarit gagne des états pour ses FORMULAIRES (démo, bêta, contact) : envoi en cours, erreur,
envoyé — aujourd’hui `states: []` (`packages/figma-sync/src/spec/catalog.ts:492`). Hauteurs en `dvh`, jamais `vh`
(écarts `apps/website/src/components/SiteLayout.tsx:13`, `apps/website/src/app/not-found.tsx:13`). Un tableau défile
dans son conteneur (`apps/website/src/features/product/ProductSites.tsx:243`).

| Bande    | Comportement                                                                                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| XS       | Burger → `Sheet` plein écran ; hero en une colonne ; cartes en 1 colonne ; sommaire des pages légales en `Select` en tête (aujourd’hui masqué, `apps/website/src/features/legal/LegalPage.tsx:50`). |
| S · M    | Liens principaux visibles (RUX-06) ; cartes en 2 colonnes ; sommaire légal en `Select`.                                                                                                             |
| L        | Cartes en 3 colonnes ; sommaire légal à gauche (240).                                                                                                                                               |
| XL · XXL | Plafond 1 200, centré ; le fond du hero peut s’étendre pleine largeur, jamais le texte.                                                                                                             |

### 3.9 `admin-table` (DM)

**Anatomie.** Coque `backoffice` (RUX-08). `header` | `actions` → `filters` (même `FilterBar` que l’app) → `primary`
(`Table` en densité Compact, colonnes à priorité) → `footer` (pagination, total). Une rangée de KPI au-dessus du
tableau passe par le slot `filters` : à ajouter comme slot `kpis` dans le contrat (4 DM l’utilisent en style en ligne).

| Bande | Comportement                                                                                   |
| ----- | ---------------------------------------------------------------------------------------------- |
| XS    | Page `PosteDeTravailSeulement` (RUX-08).                                                       |
| S · M | Rail en icônes ; colonnes de priorité 1–5 ; KPI en 2 colonnes.                                 |
| L     | Colonnes de priorité 1–6 à 1 280–1 439, toutes à ≥ 1 440 ; KPI en 4 colonnes.                  |
| XL    | Plafond 1 600.                                                                                 |
| XXL   | Maître-détail : la fiche de la ligne sélectionnée à droite (560), avec ses actions de support. |

---

## 4. Top 20 des décisions, triées par gain/effort

Gain : **3** = touche chaque session ou un parcours de revenu ; **2** = un parcours fréquent ; **1** = cohérence.
Le tri va du meilleur rapport au moins bon.

| #   | Décision                                                                                                        | Gain | Effort | Pourquoi maintenant                                                        |
| --- | --------------------------------------------------------------------------------------------------------------- | ---- | ------ | -------------------------------------------------------------------------- |
| 1   | **RUX-29** — la maquette applique #2613 (pas de « Non mesuré » en liste, cellule vide, score avec axes)         | 3    | S      | La maquette enseigne l’inverse de la doctrine aux lots suivants.           |
| 2   | **RUX-42** — site : 3 intentions, 3 libellés, 3 destinations                                                    | 3    | S      | « Demander une démo » mène à deux endroits : fuite directe d’inscriptions. |
| 3   | **RUX-18/19** — trois composants d’état ; l’erreur ne se déguise jamais en vide ; le DM gagne `loading`/`error` | 3    | S→M    | « Aucune mission » affiché en cas de panne détruit la confiance.           |
| 4   | **RUX-15** — `Table` à rôles mobiles (fin de la règle « 2 premières colonnes »)                                 | 3    | S→M    | Sur téléphone, la prochaine action disparaît ; le primitif existe déjà.    |
| 5   | **RUX-35** — chaque maillon de la chaîne mission s’ouvre filtré sur la mission                                  | 3    | M      | La friction la plus coûteuse du parcours finance.                          |
| 6   | **RUX-06** — une borne 768 pour le site et le DM                                                                | 2    | S      | Une tablette voit aujourd’hui trois produits.                              |
| 7   | **RUX-21** — deux modèles d’enregistrement + garde de sortie                                                    | 3    | S→M    | Aucun commercial ne sait si son réglage est pris.                          |
| 8   | **RUX-09** — « Laura » dans la barre latérale, en premier                                                       | 2    | S      | D82, gratuit.                                                              |
| 9   | **RUX-05 / RUX-26** — plus rien sous 12 px ; densités Confort / Compact                                         | 2    | S→M    | Le DM à 11 px est illisible en astreinte.                                  |
| 10  | **RUX-13** — filtres en deux niveaux (Vues + `FilterBar`)                                                       | 3    | M      | Quatre mécanismes empilés sur la liste la plus utilisée.                   |
| 11  | **RUX-31** — un verbe et un dialogue de lancement d’analyse                                                     | 3    | M      | Le geste cœur du produit a 5 portes et 5 noms.                             |
| 12  | **RUX-33** — une anatomie du panneau d’approche, quel que soit le canal                                         | 3    | M      | Le « moment du message » est celui où le produit rapporte.                 |
| 13  | **RUX-23** — trois niveaux de confirmation ; `window.confirm` interdit                                          | 2    | S→M    | Les suppressions du DM se font dans une boîte de navigateur.               |
| 14  | **RUX-11** — un `PageHeader` à 24 px, actions à droite                                                          | 2    | M      | Six tailles de titre, l’action principale erre.                            |
| 15  | **RUX-10** — « Aujourd’hui » seul écran d’arrivée                                                               | 3    | M      | Deux listes de « prochaines étapes » concurrentes.                         |
| 16  | **RUX-37/38** — réglages en 4 groupes, patron liste → page sous 768                                             | 2    | M      | 30 entrées, trois « Base de connaissance ».                                |
| 17  | **RUX-07** — ⌘K dans l’app                                                                                      | 2    | M      | Le DM l’a ; l’app, qui en a le plus besoin, non.                           |
| 18  | **RUX-08** — coque `backoffice` dans le plugin                                                                  | 1    | M      | Les 41 pages DM de la maquette portent la navigation de l’app.             |
| 19  | **RUX-01/02/03** — une source de tokens, une police, le thème clair sur le site                                 | 2    | L      | La marque change au moment de l’inscription.                               |
| 20  | **RUX-40** — onboarding « valeur d’abord »                                                                      | 3    | L      | 49 questions avant la promesse des « 5 minutes ».                          |

Les autres décisions (RUX-04, 12, 14, 16, 17, 20, 22, 24, 25, 27, 28, 30, 32, 34, 36, 39, 41, 43–49) restent valables ;
elles sont soit de la cohérence à coût faible à faire au fil de l’eau, soit suspendues à une question du §5.

---

## 5. Questions produit qui exigent l’arbitrage du fondateur

**Q1 — Quel est l’écran d’arrivée sur bureau ?**
« Accueil », « Tableau de bord », « Aujourd’hui » et `/welcome` se disputent la question « que fais-je maintenant ? ».
_Recommandation_ : « Aujourd’hui » partout sur bureau, Laura sur mobile (inchangé) ; `/dashboard` devient « Ma
trajectoire » dans Pilotage (RUX-10). La préférence de démarrage reste, mais « Aujourd’hui » devient son défaut.

**Q2 — Peut-on réduire le dossier de compte à 5 onglets ?**
Aujourd’hui 7 sections et ~20 onglets, que les renommages successifs ont déjà forcés à garder des alias.
_Recommandation_ : oui — Synthèse · Personnes · Plan d’action · Signaux · Historique, les anciens onglets devenant des
blocs ancrés (RUX-32). Coût L, mais c’est l’écran le plus montré en démo.

**Q3 — « Envoyer » un e-mail : depuis notre relais ou depuis la boîte du commercial ?**
Le bouton « Envoyer » part aujourd’hui de l’app après confirmation (`EngagementSendEmail.tsx:30-45`). C’est conforme
à « Laura prépare, le commercial envoie », mais le message part d’une infrastructure qui n’est pas celle que l’espace
a branchée, et les réponses ne reviennent pas dans sa messagerie.
_Recommandation_ : quand l’espace a branché sa messagerie, « Envoyer » passe par elle (ou crée un brouillon dans
celle-ci, qu’il ouvre) et se nomme par l’outil branché (« Envoyer depuis Gmail ») ; sinon, l’action principale est
« Ouvrir dans ma messagerie » (`mailto:` prérempli) et « Envoyer » n’apparaît pas.

**Q4 — Les FICHES d’objet suivent-elles aussi « on n’affiche pas ce qu’on n’a pas » ?**
#2613 a laissé les fiches hors corpus : un champ attendu resté muet y laisserait un libellé orphelin.
_Recommandation_ : oui pour les faits secondaires (le champ disparaît), non pour les 4 faits clés du résumé d’une fiche
(ils gardent leur libellé avec une action « Compléter » ou « Demander à Laura de chercher », jamais « non mesuré »).

**Q5 — Onboarding : la première analyse avant le questionnaire ?**
49 sous-étapes précèdent aujourd’hui la première valeur.
_Recommandation_ : oui (RUX-40) — 2 champs, puis la première analyse ; le questionnaire se remplit pendant l’attente
et depuis « Aujourd’hui ». Risque accepté : une première analyse moins personnalisée, rattrapée au rejeu ciblé une fois
le profil complété (même logique que « un correctif de collecte rattrape l’existant »).

**Q6 — Le site passe-t-il au thème clair et à Geist ?**
Le site est sombre, en Clash Display, avec un violet et un dégradé propres ; l’app promet la parité des deux thèmes (D79).
_Recommandation_ : oui au thème clair (suit le système) et à Geist pour le texte ; Clash Display gardée pour les
titres du hero seulement ; le violet du site s’aligne sur `primary-500` de l’app (RUX-01 à 04).

**Q7 — Le DM est-il désormais un produit sur mobile ?**
Le DM n’a aucune navigation mobile et des tableaux qui gardent toutes leurs colonnes.
_Recommandation_ : non — poste de travail à partir de 768 px, avec une page d’avertissement en dessous (RUX-08). Seule
exception à examiner : une vue « astreinte » (santé, files, incidents) lisible sur téléphone, si l’équipe la réclame.

**Q8 — Le score RFP « fit /100 » garde-t-il ce nom ?**
`apps/web/src/i18n/locales/fr/rfp.json:41` affiche « fit {{value}}/100 » à côté du verdict ; un prospect peut le lire
comme une chance de gagner, ce que la doctrine interdit (refusé six fois).
_Recommandation_ : renommer « Adéquation aux critères » et le montrer comme les autres scores, avec ses axes et ceux
qui n’ont pas pu être évalués, jamais sur 100 seul (« 7 critères sur 9 couverts » plutôt que « 78/100 »).

---

## 6. Arbitrages du fondateur (Louis, 25/09/2026)

Ces réponses priment sur les recommandations du §5.

| Question                   | Décision                                                                                                                                                                                             | Écart à la recommandation |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Q1 — écran d’arrivée       | **Laura par défaut, partout** (bureau et mobile) ; sinon l’écran choisi par l’utilisateur dans sa préférence de démarrage. « Aujourd’hui » n’est PAS le défaut.                                      | oui                       |
| Q2 — dossier de compte     | **5 onglets** : Synthèse · Personnes · Plan d’action · Signaux · Historique ; les anciens onglets deviennent des blocs ancrés (RUX-32).                                                              | non                       |
| Q3 — « Envoyer » un e-mail | **On garde l’envoi par notre relais**, après confirmation, comme aujourd’hui.                                                                                                                        | oui                       |
| Q4 — fiches d’objet        | **Tout champ sans valeur disparaît**, faits clés compris : aucun libellé orphelin, aucune exception.                                                                                                 | oui (plus strict)         |
| Q5 — onboarding            | **Valeur d’abord** : 2 champs, puis la première analyse ; le questionnaire se remplit pendant l’attente (RUX-40).                                                                                    | non                       |
| Q6 — site                  | **Thème clair (suit le système) + Geist** pour le texte, Clash Display au seul titre du hero, violet = `primary-500` de l’app (RUX-01 à 04).                                                         | non                       |
| Q7 — DM sur mobile         | **Oui, le DM complet est un produit mobile** : navigation mobile, tableaux à rôles mobiles, largeurs 390/360 maquettées comme l’app. RUX-08 est révisé en conséquence (pas de page d’avertissement). | oui                       |
| Q8 — score RFP             | **« Adéquation aux critères »**, en critères couverts avec ses axes, jamais « /100 ».                                                                                                                | non                       |

---

_Ce document ne modifie ni code ni spec. Chaque `RUX` est destiné au lot propriétaire du fichier cité ; une décision
adoptée se reporte dans `src/plugin/templates/rules.ts` (règles de gabarit), dans `src/spec/catalog.ts` (composants et
variantes) ou dans les `uxNotes` de la spec concernée, en `decision`, avec sa source._
