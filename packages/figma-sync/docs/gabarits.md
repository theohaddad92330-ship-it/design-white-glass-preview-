# Les gabarits — règles d’harmonisation

> Généré par `pnpm --filter @bellum/figma-sync extract` depuis `src/plugin/templates/rules.ts` — ne pas éditer.

Une page ne choisit pas sa mise en page : elle choisit un gabarit et remplit ses slots. Les gabarits sont dessinés
dans la page Figma `Templates`, une variante par largeur de référence et par état obligatoire.

## Règles communes

- Le titre (`header`) est TOUJOURS en haut à gauche de la colonne de contenu ; les actions (`actions`) sur la même ligne, alignées à droite. Anatomie du titre (RUX-11, `docs/revue-ux.md` §4, T4) : fil d’Ariane en `text/caption` UNIQUEMENT à partir du 2ᵉ niveau, sinon rien ; `h1` en `title` (24 px, semibold) partout — UNE fiche d’entité comprise, c’est le résumé qui porte la hiérarchie, jamais une taille de titre ; les actions à droite, UNE `default` au plus, les autres en `outline` ou groupées dans un menu `⋯` ; une phrase d’intro facultative en `text/body` + `text/secondary`, bornée à 70 caractères. Sous 768 : titre en 20 px, actions secondaires dans le `⋯`, l’action principale pleine largeur sous l’intro. L’en-tête ne répète JAMAIS l’onglet actif ni le nom de la section (loi 4).
- Les filtres (`filters`) sont TOUJOURS juste au-dessus du contenu qu’ils filtrent, pleine largeur.
- Les états vide, chargement et erreur REMPLACENT le slot `primary`, à sa place : ni modale, ni page à part. Le reste de la page (titre, filtres) reste affiché — une erreur conserve les filtres.
- Vide = `EmptyState` (titre, une phrase, UNE action) — deux variantes, `never` (jamais rempli) et `filtered` (retirer les filtres). Chargement = `Skeleton` à la forme du contenu attendu (tableau : lignes à hauteur réelle) ; `Spinner` réservé à un bouton en cours d’action ; `BrailleLoader` réservé à l’attente longue d’une analyse, nulle part ailleurs ; un texte brut ou un `Loader2` en dur sont interdits (RUX-18). Erreur = `GenericProblemMessage`, titre qui dit ce qui n’a PAS PU être lu — jamais le titre d’un état vide —, « Réessayer » en `outline`, un lien discret « Signaler » ; les filtres et le titre restent affichés (RUX-18). Le backoffice (DM) déclare les trois mêmes états que l’app et le site, jamais un écran blanc pendant le chargement (RUX-19).
- Largeur de lecture (D81, GA-34) : 70 caractères pour un texte ; pleine largeur pour une liste ou un tableau.
- Marges : 32 px en bureau, 16 px en mobile ; 24 px entre deux zones. Tout espacement est un token `Spacing`.
- Mobile : les colonnes latérales (`aside`, `sectionNav`, `history`) passent SOUS le contenu principal, dans le même ordre ; cibles tactiles ≥ 44 px (GA-32/35).
- Un slot vide ne se dessine pas : on n’affiche pas ce qu’on n’a pas.
- Densité (RUX-05/26, `docs/revue-ux.md` §4, T12) : DEUX densités nommées, pas une par persona. `comfort` (app, PAR DÉFAUT) — ligne 44 px, 14 px, cellules 12×8. `compact` (DM, et la bascule de l’utilisateur de l’app dans ses préférences) — ligne 36 px, 14 px (arrondi depuis 13 px pour tenir le plancher D80 avec un interligne de 20). Plus de 11 px nulle part. Entête de tableau en `text/caption` (12 px), jamais en capitales. Zébrures réservées à `compact`.
- RUX-28 (docs/revue-ux.md T14) : quatre tons d’état, identiques sur les trois surfaces — `success`, `warning`, `danger`, `info`, plus `neutral` ; jamais de `stop` (c’est `danger`). Une couleur porte un ÉTAT, jamais une CATÉGORIE (règle 7.1) : une pastille d’état est TOUJOURS accompagnée d’un libellé, jamais la couleur seule.
- RUX-17 (docs/revue-ux.md T6) : le `Table` est la forme des objets qu’on COMPARE (comptes, contacts, missions, factures, utilisateurs) ; la grille de cartes est réservée aux objets qu’on CHOISIT un par un et qui ont un visuel ou un récit (runbooks, offres, cas d’usage, pistes de Découvrir). Jamais les deux pour le même objet sur la même surface, et jamais un bouton « basculer en cartes » sur bureau — une vue différente du même objet est une vue du même `Table`, avec d’autres colonnes.

## La grille responsive

- Largeurs de référence : 3440 · 2560 · 1920 · 1536 · 1440 · 1366 · 1280 · 1194 · 1024 · 844 · 834 · 768 · 430 · 390 · 360 · 320 px — bureau d’abord, puis mobile.
- UNE borne de coque : 768 px (GA-28). Sous 768 : pas de sidebar, la `MobileTabBar` à 4 onglets en bas, hauteur `100dvh` (jamais `vh`). À partir de 768 : la `Sidebar` à gauche.
- Tablettes et téléphone en paysage (768 · 834 · 844 · 1024 exclu) : coque bureau, `Sidebar` réduite aux icônes sous 1024 px ; dépliée à partir de 1024.
- La colonne latérale (`aside`) ne se pose À CÔTÉ du contenu qu’à partir de 1280 px : en dessous elle passe SOUS le contenu (retour à la ligne de l’auto-layout, contenu principal ≥ 600 px). Rien n’est caché : l’ordre change, jamais le contenu.
- Grilles (KPI, cartes) : toutes leurs colonnes à ≥ 1440, 4 au plus de 1280 à 1439, 2 colonnes de 768 à 1279, 1 colonne (ou `columnsMobile`) sous 768.
- Tableaux (RUX-15, `docs/revue-ux.md` §4) : même rendu à toutes les tailles (GA-29) ; les colonnes visibles se choisissent par PRIORITÉ déclarée, jamais par position — la règle « 2 premières colonnes » est retirée : sur téléphone, la « prochaine action » ne disparaît plus sous prétexte qu’elle est la sixième. ≥ 1024 : toutes. 768–1023 : les 4 priorités les plus hautes. < 768 : les colonnes de rôle `mobile: 'title'` (le nom de la ligne) et `'meta'` (une deuxième information en avant — la « prochaine action » partout où elle existe) deviennent une carte-ligne ; les `'field'` suivent en paires étiquette/valeur, une valeur absente ne fait AUCUNE paire (doctrine #2613) ; `'hidden'` ne se dessine jamais. Une colonne sans rôle déclaré retombe sur sa POSITION (compatibilité) — masquée, jamais supprimée.
- On n’étire JAMAIS : le contenu s’arrête à 1600 px (720 pour les groupes de réglages et les parcours, 400 pour l’authentification, 1200 pour le site) et se centre.
- Au-delà de 1920 on AJOUTE de l’usage : à ≥ 2560, `list` et `admin-table` posent la fiche de l’élément sélectionné à côté de la liste (maître-détail) ; `dashboard` ajoute deux colonnes de KPI. Le texte reste borné à 70 caractères.
- RUX-30 (docs/revue-ux.md T16) : une grille ne dessine JAMAIS plus de colonnes qu’elle n’a d’éléments, même si la bande de largeur en permettrait plus — `minmax(<largeur de carte>, 1fr)`, un nombre de colonnes maximal égal au nombre d’éléments (3 forfaits → 3 colonnes, jamais 4 par confort de grille).
- RUX-48 (docs/revue-ux.md T3.0) : en paysage téléphone (844 × 390, hauteur < 500 px), les entêtes et barres d’actions ne restent PAS collantes au défilement — seules les barres de saisie (`composer` du gabarit `chat`) et le pied collant du gabarit `wizard` le restent.
- Un gabarit redimensionné à la main dans Figma se réorganise seul : auto-layout FILL, largeurs min/max, retour à la ligne.
- Une page est dessinée par défaut à 1440, 1920, 2560, 1280, 1024, 390, 360 (backoffice : 1440, 1920, 2560, 1280, 390, 360) ; le plugin permet d’en cocher d’autres. Une spec `desktop` couvre 768 → 3440, `mobile` 320 → 430. RUX-49 (docs/revue-ux.md T3.0) : les pages `app` et `site` dessinent aussi 1024 (tablette paysage, la largeur où la `Sidebar` se déplie) ; les pages `list` dessinent aussi 768 — le DM garde 1280 comme seule largeur « serrée ».

## Le backoffice (DM) — coque et mobile

- Coque `backoffice` (RUX-08 révisé) : jamais la `Sidebar` ni la `MobileTabBar` de l’app. À partir de 768 px, le `BackofficeRail` à gauche — déplié (240 px) à partir de 1024, en icônes (64 px) de 768 à 1023 (RUX-06) — : Cockpit, les 5 groupes de `nav-sections.ts`, le badge d’environnement, la recherche ⌘K.
- Sous 768 (la même borne unique, GA-28) : la `BackofficeTopBar` collée en HAUT — menu des groupes, environnement, loupe ⌘K qui ouvre la recherche globale en plein écran —, puis les onglets de groupe qui défilent. Hauteur `100dvh`, jamais `vh` ; cibles ≥ 44 px (GA-30/32).
- Tableaux à rôles mobiles sous 768 : chaque ligne devient une carte-ligne — la 1ʳᵉ colonne (titre), la colonne de statut (`Statut`, `État`, `Rôle`…) et l’action principale (colonne sans entête) restent sur la ligne ; les autres colonnes passent dans la fiche de la ligne, dépliée par son chevron (44 px), étiquette et valeur. Une valeur absente ne fait aucune paire. Jamais de défilement horizontal de page.
- Filtres sous 768 : la recherche reste en haut, pleine largeur ; les autres filtres passent dans une FEUILLE BASSE ouverte par « Filtres » (cadre `· filtres` à côté de la page), pied « Réinitialiser » / « Afficher les résultats ».
- Densité (RUX-26) : Compact en bureau, jamais un texte sous 12 px ; les surcouches du DM se dessinent aussi à 390, en panneau bas pleine largeur.
- Largeurs dessinées par défaut : 1440, 1920, 2560, 1280, 390, 360.

## `list`

Liste ou tableau d’entités, avec recherche et filtres (comptes, contacts, missions…).

- Coque : Sidebar (bureau) / MobileTabBar (mobile)
- Zones, dans l’ordre : [`header` | `actions`] → `intro` → `filters` → [`primary` | `aside`] → `bulk` → `footer`
- Slots obligatoires : `header`, `primary`
- États : `empty`, `loading`, `error` ; facultatif : `emptyFiltered`
- Largeur du contenu : pleine largeur ; colonnes latérales `aside` 320 px
- Chargement : squelette de tableau
- À ≥ 2560 : maître-détail (la fiche à côté de la liste)
- Pleine largeur : le tableau prend toute la place (GA-34). Filtres au-dessus, jamais dans un panneau caché. La barre de sélection (`bulk`) apparaît sous la liste. Grammaire de filtres en DEUX niveaux (RUX-13) : Vues (`intro`, `TabNav` `underline`, 5 au plus + « Plus de vues ▾ ») et Filtres (`filters`, `FilterBar` : « + Filtre », pastilles retirables, « Tout effacer »). `Tabs` est INTERDIT dans `actions` : ce slot porte des verbes, jamais un sous-ensemble. RUX-20 (docs/revue-ux.md T15/#2613) : un board, un kanban ou une grille de compteurs dont TOUTES les colonnes valent 0 n’est pas dessiné — l’état `empty` le remplace, jamais douze fois « 0 ». RUX-12 (docs/revue-ux.md T4, loi 4) : l’en-tête ne répète jamais le nom de la section ni la vue active (`intro`) — le titre nomme l’objet listé.

## `detail`

Fiche d’une entité : entête, résumé, onglets, contenu, panneau latéral.

- Coque : Sidebar (bureau) / MobileTabBar (mobile)
- Zones, dans l’ordre : [`header` | `actions`] → `summary` → `tabs` → [`primary` | `aside`] → `footer`
- Slots obligatoires : `header`, `primary`
- États : `loading`, `error`
- Largeur du contenu : pleine largeur ; colonnes latérales `aside` 360 px
- Chargement : squelettes de blocs
- Entête + actions, puis le résumé (score et ses axes, jamais un score nu), puis les onglets. Le panneau latéral porte le contexte, pas l’action principale. RUX-12 (docs/revue-ux.md T4, loi 4) : l’en-tête ne répète JAMAIS l’onglet actif ni le nom de la section — le titre nomme l’ENTITÉ, les onglets nomment ses vues.

## `dashboard`

Pilotage : KPI puis graphes et listes courtes.

- Coque : Sidebar (bureau) / MobileTabBar (mobile)
- Zones, dans l’ordre : [`header` | `actions`] → `filters` → `kpis` → [(`primary` / `secondary`) | `aside`] → `bulk`
- Slots obligatoires : `header`, `primary`
- États : `empty`, `loading`, `error`
- Largeur du contenu : pleine largeur ; colonnes latérales `aside` 320 px
- Chargement : squelettes de blocs
- À ≥ 2560 : deux colonnes de KPI de plus
- KPI d’abord, en grille (jusqu’à 5 par rangée) ; une tuile sans valeur ne se dessine PAS (RUX-29/#2613) — jamais « non mesuré » ni « 0 » (GA-18/19) ; si TOUTES les tuiles d’une rangée sont absentes, la rangée est remplacée par UNE phrase qui dit pourquoi, jamais répétée tuile par tuile. Aucune probabilité affichée. Les actions de masse (`bulk`) apparaissent sous la liste qu’elles visent, comme dans `list`.

## `settings`

Réglages : navigation de section à gauche, groupes de réglages à droite.

- Coque : Sidebar (bureau) / MobileTabBar (mobile)
- Zones, dans l’ordre : [`header`] → [`sectionNav` | `primary` | `aside`] → `footer`
- Slots obligatoires : `header`, `sectionNav`, `primary`
- États : `loading`, `error` ; facultatif : `empty`, `emptyFiltered`
- Largeur du contenu : 1328 px max ; colonnes latérales `sectionNav` 240 px, `aside` 320 px
- Chargement : squelettes de blocs
- Navigation de section à gauche (240 px), groupes à droite limités à 720 px. L’`aside` (aide, contexte) se pose à droite quand navigation + groupes ≥ 600 px + aside tiennent (≥ 1536 avec la Sidebar dépliée), sinon SOUS les groupes. État vide FACULTATIF : déclaré par les réglages qui listent quelque chose. Un réglage vit à UN endroit (GA-26). Enregistrement (RUX-21) : bascule/choix unique → immédiat avec indicateur « Enregistré », jamais de toast ; saisie ou groupe de champs liés → UN bouton « Enregistrer » dans le pied du groupe, jamais un bouton par champ. RUX-22 (docs/revue-ux.md T8) : la validation d’un champ se fait à sa SORTIE (`onBlur`), message sous le champ en `soft/danger/text` — jamais un toast pour une erreur de saisie. Sous 768, `SettingsRow` passe en colonne : libellé au-dessus du contrôle.

## `wizard`

Parcours en étapes (onboarding, import, lancement d’analyse).

- Coque : aucune navigation (parcours)
- Zones, dans l’ordre : [`header`] → `progress` → [`primary` | `aside`] → `footer`
- Slots obligatoires : `progress`, `primary`, `footer`
- États : `loading`, `error`
- Largeur du contenu : 720 px max ; colonnes latérales `aside` 320 px
- Chargement : squelettes de blocs
- Sans navigation d’app : une seule tâche. La progression est toujours visible ; `footer` porte Retour à gauche, Continuer à droite. RUX-41 (docs/revue-ux.md §2 P4) : `progress` montre l’étape n sur N, avec le nom des étapes à ≥ 1024 ; « Terminer plus tard » est un lien tertiaire dans l’entête qui ENREGISTRE l’état — il ne ramène JAMAIS dans le parcours au retour.

## `chat`

Laura : historique, fil de conversation, zone de saisie.

- Coque : Sidebar (bureau) / MobileTabBar (mobile)
- Zones, dans l’ordre : [`header`] → [`history` | (`thread` / `composer`) | `aside`]
- Slots obligatoires : `thread`, `composer`
- États : `empty`, `loading`, `error`
- Largeur du contenu : pleine largeur ; colonnes latérales `history` 280 px, `aside` 320 px
- Chargement : squelettes de blocs
- Laura (D82). Historique à gauche, fil au centre (texte à 70 caractères), la saisie reste collée en bas du fil.

## `auth`

Connexion, inscription, mot de passe oublié.

- Coque : aucune
- Zones, dans l’ordre : `brand` → `primary` → `footer`
- Slots obligatoires : `primary`
- États : `loading`, `error`
- Largeur du contenu : 400 px max
- Chargement : squelettes de blocs
- Colonne centrée de 400 px : la marque, le formulaire, puis les liens secondaires. Aucune navigation.

## `marketing`

Page du site public, faite de sections.

- Coque : barre du site
- Zones, dans l’ordre : `nav` → `hero` → `sections` → `cta` → `footer`
- Slots obligatoires : `nav`, `hero`, `footer`
- États : aucun (page statique)
- Largeur du contenu : 1200 px max
- Chargement : squelettes de blocs
- Site public : barre de navigation pleine largeur, contenu centré à 1200 px, texte courant à 70 caractères. RUX-27 (docs/revue-ux.md T13) : le mouvement suit la même grammaire que l’app (`packages/ui/src/motion.ts`, GA-25) — une apparition de section utilise `DURATION.perceptible` + `EASE.out`, une seule fois par section, jamais une courbe ou une durée locale au composant.

## `admin-table`

Backoffice (dashboard-manager) : tableau dense d’administration.

- Coque : BackofficeRail (bureau) / BackofficeTopBar (mobile)
- Zones, dans l’ordre : [`header` | `actions`] → `filters` → `primary` → `footer`
- Slots obligatoires : `header`, `primary`
- États : `empty`, `loading`, `error`
- Largeur du contenu : pleine largeur
- Chargement : squelette de tableau
- À ≥ 2560 : maître-détail (la fiche à côté de la liste)
- Backoffice : même squelette que `list`, sans panneau latéral ; tableau dense pleine largeur, densité `compact` (RUX-26). Coque `backoffice` (rail ≥ 768, barre du haut dessous). Sous 768 : tableau à rôles mobiles (titre + statut + action sur la ligne, le reste dans la fiche dépliée), filtres en feuille basse, jamais de défilement horizontal de page.
