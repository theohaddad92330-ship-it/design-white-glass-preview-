import type { WorkspacePermission } from './workspace.js'
import type { PlanFeatureKey } from './plan-features.js'
import type { RouteContract } from './route-access.js'

/**
 * #1683 — LE CATALOGUE DES ÉCRANS DU PRODUIT CLIENT : une route, un nom.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Rien, dans le dépôt, ne nommait les écrans du produit à ce niveau. C'est le
 * BLOQUANT TRANSVERSAL des cinq écrans d'analytique produit (#1683, #1684,
 * #1685, #1687, #1688) : sans lui, chacun n'aurait pu afficher qu'une route
 * brute — « /accounts/$id » dans une colonne d'un tableau lu par un opérateur,
 * et « /pilotage/rex » comme si c'était un nom de fonctionnalité.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IL Y A DEUX RAISONS D'AVOIR CE CATALOGUE, ET LA SECONDE EST LA PLUS IMPORTANTE
 * ─────────────────────────────────────────────────────────────────────────────
 * (1) Nommer. Un tableau d'adoption qui liste des chemins d'URL n'est pas lisible.
 *
 * (2) **REPLIER LES IDENTIFIANTS.** Le traceur produit envoie
 *     `event.toLocation.pathname` (`apps/web/src/router.tsx`) — c'est-à-dire le
 *     chemin RÉEL, avec l'identifiant de compte dedans. Sans repliement vers le
 *     MOTIF (`/accounts/$id`), deux choses cassent en même temps :
 *      · chaque compte devient son propre « écran », et le tableau des écrans
 *        compte des milliers de lignes vues une fois chacune — donc toutes sous
 *        le seuil de publication, donc un écran vide ;
 *      · un identifiant de compte CLIENT se retrouve dans une lecture du
 *        back-office opérateur, ce que la règle 5 de `c64_analytique_produit`
 *        refuse (« rien de comportemental par espace client nommé »).
 *     {@link resolveProductScreen} est le seul endroit où ce repliement se fait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA SOURCE DE VÉRITÉ N'EST PAS CE FICHIER — C'EST `apps/web/src/routes/`
 * ─────────────────────────────────────────────────────────────────────────────
 * Une liste écrite à la main ne voit jamais ce qui n'y est pas : c'est le défaut
 * qui a laissé un écran inatteignable pendant des mois ici. Ce fichier est donc
 * une TABLE DE NOMS, et la garde **GA-265**
 * (`apps/api/src/architecture/product-screens-catalog-covers-routes.spec.ts`)
 * la compare dans les DEUX SENS à `FileRoutesByFullPath` de
 * `apps/web/src/routeTree.gen.ts` — la dérivation que TanStack Router fait
 * lui-même du dossier des routes. Une route ajoutée sans entrée fait rougir la
 * CI ; une entrée qui survit à la disparition de sa route aussi.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LES LIBELLÉS SONT ICI, ET EN DEUX LANGUES
 * ─────────────────────────────────────────────────────────────────────────────
 * « Aucun libellé d'affichage écrit dans un contrat » vise le libellé écrit dans
 * UNE SEULE langue — il resterait français pour toujours. La forme
 * `{ fr, en }` est celle que le dépôt utilise déjà pour les catalogues fermés
 * (`DEFAULT_STAGE_LABELS`, `MISSION_BOARD_LABELS`, `PLAN_FEATURE_LABELS`) : le
 * vocabulaire vient de `apps/web/src/i18n/locales/{fr,en}/nav.json`, pas d'une
 * invention de ce fichier.
 */

/**
 * Un écran du produit, tel qu'un opérateur doit pouvoir le nommer.
 *
 * `route` est le MOTIF (avec ses `$paramètres`), jamais un chemin concret.
 */
export type ProductScreen = {
  /** Le motif de route, normalisé : commence par `/`, jamais de barre finale. */
  route: string
  /** La section du produit — de quoi grouper un tableau de trente lignes. */
  area:
    | 'accueil'
    | 'comptes'
    | 'contacts'
    | 'prospection'
    | 'actions'
    | 'copilote'
    | 'vivier'
    | 'missions'
    | 'projets'
    | 'pilotage'
    | 'reglages'
    | 'demarrage'
    | 'acces'
  /**
   * Ce que la route EST, et c'est une distinction de mesure, pas de goût :
   *
   *  · `produit`   — un écran du produit client, en session. Le seul que
   *                  #1683-#1688 doivent classer (« travaillé », « survolé »,
   *                  « jamais ouvert »…).
   *  · `public`    — hors session (connexion, inscription, page partagée). Zéro
   *                  vue n'y veut rien dire du produit.
   *  · `technique` — une REDIRECTION, un retour d'authentification, ou une page
   *                  interne. ⚠️ Une redirection ne rend aucun écran : la
   *                  compter comme un écran produirait « jamais ouvert » sur
   *                  une page qui n'existe pas, et enverrait quelqu'un chercher
   *                  pourquoi personne n'ouvre `/needs`.
   */
  nature: 'produit' | 'public' | 'technique'
  label: { fr: string; en: string }
  /**
   * #2222 — LA PERMISSION SANS LAQUELLE L'ÉCRAN N'A PLUS RIEN À MONTRER.
   *
   * Elle se DÉRIVE du serveur, elle ne s'invente pas : c'est le
   * `@RequirePermission` posé sur l'endpoint qui fournit la LISTE ou le CONTENU
   * PRINCIPAL de l'écran. Un écran dont aucun endpoint de lecture n'est gardé
   * n'en porte pas — et c'est le cas le plus fréquent.
   *
   * ⚠️ Les endpoints d'ACTION (exporter, envoyer, enrichir) aux permissions
   * différentes ne ferment PAS la route : ils deviennent des actions grisées
   * (`<CapabilityGate>`). Fermer un écran de comptes parce qu'on ne peut pas
   * exporter cacherait tout ce qui marche.
   *
   * **Absente = OUVERTE.** Un écran non catalogué reste accessible : le serveur
   * cloisonne de toute façon, et fermer par défaut transformerait chaque oubli
   * de catalogage en panne silencieuse pour un rôle entier.
   *
   * ⚠️ UNE LISTE VEUT DIRE « L'UNE SUFFIT », jamais « toutes » — la sémantique
   * de `@RequirePermission(...perms)` côté serveur, reprise telle quelle.
   */
  requiredPermission?: WorkspacePermission | readonly WorkspacePermission[]
  /** Palier requis. Absent = ouvert à toutes les offres. */
  requiredPlanFeature?: PlanFeatureKey
  /**
   * Capacités de connecteur dont l'écran a besoin. Leur absence NE FERME PAS la
   * porte : elle dégrade (voir `route-access.ts`).
   */
  degradesWithout?: readonly string[]
}

/**
 * Les écrans, dans l'ordre du produit. Complétude tenue par GA-265, pas par la
 * discipline de qui ajoute une route.
 */
export const PRODUCT_SCREENS: readonly ProductScreen[] = [
  // — Accueil et vues d'entrée ————————————————————————————————————————————
  { route: '/', area: 'accueil', nature: 'produit', label: { fr: 'Accueil', en: 'Home' } },
  { route: '/briefing', area: 'accueil', nature: 'produit', label: { fr: 'Ma journée', en: 'My day' } },
  { route: '/mailbox', area: 'accueil', nature: 'produit', label: { fr: 'Messagerie', en: 'Mailbox' } },
  { route: '/search', area: 'accueil', nature: 'produit', label: { fr: 'Recherche', en: 'Search' } },
  {
    route: '/search/history',
    area: 'accueil',
    nature: 'produit',
    label: { fr: 'Mes analyses', en: 'My analyses' },
  },

  // — Comptes ——————————————————————————————————————————————————————————————
  { route: '/accounts', area: 'comptes', nature: 'produit', label: { fr: 'Comptes', en: 'Accounts' } },
  { route: '/accounts/$id', area: 'comptes', nature: 'produit', label: { fr: 'Fiche compte', en: 'Account record' } },
  {
    route: '/accounts/$id/brief',
    area: 'comptes',
    nature: 'produit',
    label: { fr: 'Dossier de conquête', en: 'Account brief' },
  },
  {
    route: '/accounts/marches',
    area: 'comptes',
    nature: 'produit',
    label: { fr: 'Marchés locaux', en: 'Local markets' },
  },
  {
    route: '/accounts/marches/$zoneId',
    area: 'comptes',
    nature: 'produit',
    label: { fr: 'Marché local d’une zone', en: 'Local market of a zone' },
  },
  { route: '/accounts/partners', area: 'comptes', nature: 'produit', label: { fr: 'Partenaires', en: 'Partners' } },
  {
    route: '/discover',
    area: 'comptes',
    nature: 'produit',
    label: { fr: 'Découvrir', en: 'Discover' },
    // #2406.35 — reflète le palier déjà posé par `<PlanFeatureRoute feature="discover">`
    // (`apps/web/src/routes/discover/index.tsx`) ; absent ici, `routeContractFor('/discover')`
    // ne pouvait jamais porter le verrou que l'écran applique réellement.
    requiredPlanFeature: 'discover',
  },
  {
    route: '/discover/lots',
    area: 'comptes',
    nature: 'produit',
    label: { fr: "Analyser une liste d'entreprises", en: 'Analyze a list of companies' },
  },
  // #2293.5 / .6 — un lot d'analyses : son statut agrégé et ses sous-jobs.
  {
    route: '/discover/lots/$batchId',
    area: 'comptes',
    nature: 'produit',
    label: { fr: 'Détail du lot', en: 'Batch detail' },
  },
  // #4282.10 — le radar par technologie : la même sortie que Laura, mêmes comptes, même ordre.
  {
    route: '/discover/radar',
    area: 'comptes',
    nature: 'produit',
    label: { fr: 'Radar par technologie', en: 'Technology radar' },
    requiredPlanFeature: 'discover',
  },

  // — Contacts —————————————————————————————————————————————————————————————
  { route: '/contacts', area: 'contacts', nature: 'produit', label: { fr: 'Contacts', en: 'Contacts' } },
  {
    route: '/contacts/lists',
    area: 'contacts',
    nature: 'produit',
    label: { fr: 'Mes listes', en: 'My lists' },
  },
  {
    route: '/contacts/$id',
    area: 'contacts',
    nature: 'produit',
    label: { fr: 'Fiche contact', en: 'Contact record' },
  },
  // Théo B c6 — la page d'approche d'un contact, par canal : relire, valider, puis envoyer.
  {
    route: '/contacts/$id/approach/$channel',
    area: 'contacts',
    nature: 'produit',
    label: { fr: 'Approche d’un contact', en: 'Contact approach' },
  },
  // Théo B c3-imports-sources / c4-assistant-import — l'import de contacts vit sous Contacts.
  {
    route: '/contacts/imports',
    area: 'contacts',
    nature: 'produit',
    label: { fr: 'Imports & sources', en: 'Imports & sources' },
    // `universal-import.controller.ts` — permission posée au niveau de la CLASSE.
    requiredPermission: 'records:write',
  },
  {
    route: '/contacts/import',
    area: 'contacts',
    nature: 'produit',
    label: { fr: 'Importer des contacts', en: 'Import contacts' },
    requiredPermission: 'records:write',
  },

  // — Prospection ——————————————————————————————————————————————————————————
  // #2155 — le groupe de navigation qui réunit Comptes, Contacts et Mes
  // cibles. Comptes et Contacts gardent leur `area` d'origine (ce sont les
  // mêmes écrans qu'avant, seulement regroupés) ; Mes cibles est nouveau.
  // Théo A signaux (R22) — `/mes-cibles` est devenue `/signals` : la bibliothèque d'informations par compte, et ses veilles.
  // `/mes-cibles` redirige vers `/signals` (Théo A signaux.R1) mais reste une adresse routée : elle garde son entrée.
  { route: '/mes-cibles', area: 'prospection', nature: 'produit', label: { fr: 'Mes cibles', en: 'My targets' } },
  { route: '/signals', area: 'prospection', nature: 'produit', label: { fr: 'Signaux', en: 'Signals' } },
  {
    route: '/signals/watches',
    area: 'prospection',
    nature: 'produit',
    label: { fr: 'Mes veilles', en: 'My watches' },
  },

  // — Actions ——————————————————————————————————————————————————————————————
  { route: '/actions', area: 'actions', nature: 'produit', label: { fr: 'Actions', en: 'Actions' } },
  {
    route: '/actions/$id',
    area: 'actions',
    nature: 'produit',
    label: { fr: 'Détail d’une action', en: 'Action detail' },
  },
  { route: '/actions/sequences', area: 'actions', nature: 'produit', label: { fr: 'Séquences', en: 'Sequences' } },
  // Théo C sequences-detail.R1 — la séquence en page.
  {
    route: '/actions/sequences/$id',
    area: 'actions',
    nature: 'produit',
    label: { fr: 'Détail d’une séquence', en: 'Sequence detail' },
  },
  // Lot L-D1 (#4167) — « quand [signal] → alors … » : règles, routines planifiées et workflows en UNE liste.
  {
    route: '/actions/automatisations',
    area: 'actions',
    nature: 'produit',
    label: { fr: 'Automatisations', en: 'Automations' },
  },
  // Théo C automations-bibliotheque / automations-editeur — la bibliothèque, son journal des essais et l'éditeur d'une règle.
  {
    route: '/actions/automatisations/bibliotheque',
    area: 'actions',
    nature: 'produit',
    label: { fr: 'Bibliothèque de routines', en: 'Routine library' },
  },
  {
    route: '/actions/automatisations/journal',
    area: 'actions',
    nature: 'produit',
    label: { fr: 'Journal des essais', en: 'Trial journal' },
  },
  {
    route: '/actions/automatisations/$id',
    area: 'actions',
    nature: 'produit',
    label: { fr: 'Ajuster une automatisation', en: 'Adjust an automation' },
  },
  {
    route: '/propositions',
    area: 'actions',
    nature: 'produit',
    label: { fr: 'Préparer une proposition', en: 'Prepare a proposal' },
  },

  // — Copilote —————————————————————————————————————————————————————————————
  // D82 : le copilote s'appelle Laura, partout.
  { route: '/chat', area: 'copilote', nature: 'produit', label: { fr: 'Laura', en: 'Laura' } },

  // — Vivier ———————————————————————————————————————————————————————————————
  {
    route: '/consultants',
    area: 'vivier',
    nature: 'produit',
    label: { fr: 'Vivier', en: 'Talent pool' },
    // #2406.35 — reflète le palier déjà posé par `<PlanFeatureRoute feature="talent_pool">`
    // (`apps/web/src/routes/consultants/index.tsx`).
    requiredPlanFeature: 'talent_pool',
  },
  {
    route: '/consultants/$id',
    area: 'vivier',
    nature: 'produit',
    label: { fr: 'Fiche consultant', en: 'Consultant record' },
  },
  {
    route: '/consultants/$id/reverse-market',
    area: 'vivier',
    nature: 'produit',
    label: { fr: 'Placement proactif', en: 'Reverse marketing' },
  },
  {
    route: '/consultants/recrutement',
    area: 'vivier',
    nature: 'produit',
    label: { fr: 'Recrutement', en: 'Recruitment' },
  },
  {
    route: '/submissions/$id',
    area: 'vivier',
    nature: 'produit',
    label: { fr: 'Dossier de positionnement', en: 'Submission dossier' },
  },

  // — Missions et argent ——————————————————————————————————————————————————
  { route: '/missions', area: 'missions', nature: 'produit', label: { fr: 'Missions', en: 'Assignments' } },
  {
    route: '/missions/$id',
    area: 'missions',
    nature: 'produit',
    label: { fr: 'Fiche mission', en: 'Assignment record' },
  },
  { route: '/missions/adv', area: 'missions', nature: 'produit', label: { fr: 'ADV', en: 'Sales admin' } },
  { route: '/missions/cessions', area: 'missions', nature: 'produit', label: { fr: 'Cessions', en: 'Factoring' } },
  {
    route: '/missions/finance',
    area: 'missions',
    nature: 'produit',
    label: { fr: 'Vue financière', en: 'Financial view' },
  },
  {
    route: '/missions/cra',
    area: 'missions',
    nature: 'produit',
    label: { fr: 'Relevés d’activité', en: 'Timesheets' },
  },
  {
    route: '/missions/encaissements',
    area: 'missions',
    nature: 'produit',
    label: { fr: 'Encaissements', en: 'Collections' },
  },
  {
    route: '/missions/factures',
    area: 'missions',
    nature: 'produit',
    label: { fr: 'Factures', en: 'Invoices' },
  },
  {
    route: '/missions/facturation',
    area: 'missions',
    nature: 'produit',
    label: { fr: 'Facturation des missions', en: 'Assignment invoicing' },
  },
  {
    route: '/missions/nouvelle',
    area: 'missions',
    nature: 'produit',
    label: { fr: 'Créer une mission', en: 'Create an assignment' },
  },
  { route: '/missions/paiements', area: 'missions', nature: 'produit', label: { fr: 'Paiements', en: 'Payments' } },
  {
    route: '/missions/planification',
    area: 'missions',
    nature: 'produit',
    label: { fr: 'Planification', en: 'Planning' },
  },
  {
    route: '/missions/suivi',
    area: 'missions',
    nature: 'produit',
    label: { fr: 'Suivi de mission', en: 'Assignment tracking' },
  },
  // `finance:read` OU `records:write` — `expense-reports.controller.ts:102`.
  // Aucune des deux prise seule ne couvre l'union des rôles que le serveur
  // laisse entrer : `finance` n'a pas `records:write`, `sales` n'a pas
  // `finance:read`. En choisir une fermerait l'écran à l'autre moitié.
  {
    route: '/expenses',
    area: 'missions',
    nature: 'produit',
    label: { fr: 'Notes de frais', en: 'Expense reports' },
    requiredPermission: ['finance:read', 'records:write'],
  },
  // Théo C missions-notes-de-frais.N1 — l'écran est désormais un onglet de Missions ;
  // `/expenses` n'est plus qu'une redirection vers lui. Même OR de permissions.
  {
    route: '/missions/notes-de-frais',
    area: 'missions',
    nature: 'produit',
    label: { fr: 'Notes de frais', en: 'Expense reports' },
    requiredPermission: ['finance:read', 'records:write'],
  },
  {
    route: '/expenses/bareme',
    area: 'missions',
    nature: 'produit',
    label: { fr: 'Barème de frais', en: 'Expense rates' },
    // Même OR que `/expenses` — `expense-policies.controller.ts:50`.
    requiredPermission: ['finance:read', 'records:write'],
  },

  // — Projets et besoins ——————————————————————————————————————————————————
  { route: '/projects', area: 'projets', nature: 'produit', label: { fr: 'Pipe', en: 'Pipeline' } },
  {
    route: '/projects/$id',
    area: 'projets',
    nature: 'produit',
    label: { fr: 'Dossier projet', en: 'Project record' },
  },
  // Théo C projects-presentations — l'écran Présentations d'Affaires.
  {
    route: '/projects/presentations',
    area: 'projets',
    nature: 'produit',
    label: { fr: 'Présentations', en: 'Presentations' },
  },
  {
    route: '/projects/needs',
    area: 'projets',
    nature: 'produit',
    label: { fr: 'Besoins', en: 'Needs' },
    // #2406.35 — reflète le palier déjà posé par `<PlanFeatureRoute feature="needs">`
    // (`apps/web/src/routes/projects/needs.tsx`).
    requiredPlanFeature: 'needs',
  },
  {
    route: '/projects/needs/$needId',
    area: 'projets',
    nature: 'produit',
    label: { fr: 'Fiche besoin', en: 'Need record' },
  },

  // — Pilotage —————————————————————————————————————————————————————————————
  {
    route: '/pilotage',
    area: 'pilotage',
    nature: 'produit',
    label: { fr: 'Décisions', en: 'Decisions' },
    // #2406.35 — reflète le palier déjà posé par `<PlanFeatureRoute feature="manager_cockpit">`
    // (`apps/web/src/routes/pilotage/index.tsx`).
    requiredPlanFeature: 'manager_cockpit',
  },
  // `finance:read` OU `finance:read:own` — `finance.controller.ts:235`. Le
  // second est le droit de voir SON périmètre (D1, 26/08) : `sales` et
  // `sales_ops` le portent, et n'exiger que `finance:read` leur fermerait un
  // écran que le serveur leur ouvre.
  {
    route: '/pilotage/finance',
    area: 'pilotage',
    nature: 'produit',
    label: { fr: 'Finance', en: 'Finance' },
    requiredPermission: ['finance:read', 'finance:read:own'],
  },
  // L2 (14/10/2026) — Pipe : waterfall, table d'inspection, par commercial.
  // `pipe.controller.ts` — `@RequirePermission('team:manage')` sur les trois routes `pilotage/pipe/*`.
  {
    route: '/pilotage/pipe',
    area: 'pilotage',
    nature: 'produit',
    label: { fr: 'Pipe', en: 'Pipe' },
    // #4256 — Pipe porte AUSSI la section Parcours, ouverte à tous les rôles et paliers (#4163.2,
    // Louis 15/10/2026) : ni permission ni palier au niveau de l'ÉCRAN, sinon le bandeau « Ton rôle
    // n'ouvre pas cet écran » masque la section. Le pipe lui-même reste `team:manage` + `manager_cockpit`,
    // tenu par SECTION dans `routes/pilotage/pipe.tsx` et par l'API.
  },
  // L3 (14/10/2026) — Staffing : capacité, intercontrat, fins de mission, TACE.
  // `pilotage.controller.ts` — `@RequirePermission('team:manage')` sur les trois routes `staffing/*`.
  {
    route: '/pilotage/staffing',
    area: 'pilotage',
    nature: 'produit',
    label: { fr: 'Staffing', en: 'Staffing' },
    requiredPlanFeature: 'manager_cockpit',
    requiredPermission: 'team:manage',
  },
  // #3585.1 — la mémoire collective vit ici depuis le 04/10/2026 (retour bêta).
  {
    route: '/pilotage/rex',
    area: 'pilotage',
    nature: 'produit',
    label: { fr: 'Débriefer une mission', en: 'Debrief an assignment' },
  },
  // #1814 — l'onglet qui RÉFÉRENCE où part l'énergie commerciale. Il ne porte
  // aucune donnée propre : les quatre écrans qu'il nomme restent où ils sont
  // (une garde interdit qu'une route vive dans deux sections).
  {
    route: '/team',
    area: 'pilotage',
    nature: 'produit',
    label: { fr: 'Équipe', en: 'Team' },
    // `manager.controller.ts:20` — `@RequirePermission('team:manage')` posé au
    // niveau de la CLASSE, donc sur `@Get('team-stats')` qui remplit l'écran.
    requiredPermission: 'team:manage',
    // ⚠️ Le PALIER de cet écran (`manager_cockpit`) n'est délibérément PAS
    // repris ici, bien que `routes/team/index.tsx` le pose via
    // `<PlanFeatureRoute>`. Le déclarer aux deux endroits afficherait DEUX
    // verrous pour un seul refus, et surtout : le palier a déjà son
    // propriétaire (`PlanFeatureRoute`, sept fichiers de route). Un réglage vit
    // à un seul endroit (GA-26) — migrer le palier vers ce catalogue est un lot
    // à part, qui devra retirer les sept appels dans le même geste.
  },
  // Théo D team-review — le point d'équipe en trois étapes.
  {
    route: '/team/review/$step',
    area: 'pilotage',
    nature: 'produit',
    label: { fr: 'Point d’équipe', en: 'Team review' },
    requiredPermission: 'team:manage',
  },
  // Théo D team-business / team-plans / team-member — les sous-pages de la section Équipe (`manager.controller.ts`).
  {
    route: '/team/business',
    area: 'pilotage',
    nature: 'produit',
    label: { fr: 'Équipe › Objectifs & affaires', en: 'Team › Objectives & deals' },
    requiredPermission: 'team:manage',
  },
  {
    route: '/team/plans',
    area: 'pilotage',
    nature: 'produit',
    label: { fr: 'Équipe › Plans & actions', en: 'Team › Plans & actions' },
    requiredPermission: 'team:manage',
  },
  {
    route: '/team/member/$id',
    area: 'pilotage',
    nature: 'produit',
    label: { fr: 'Fiche d’un membre', en: 'Team member' },
    requiredPermission: 'team:manage',
  },
  // Théo D (22/10/2026) — les trois écrans d'Équipe de ce lot. Ils vivent sous la section Équipe (`sections.ts`).
  {
    route: '/team/recherches',
    area: 'pilotage',
    nature: 'produit',
    label: { fr: 'Équipe › Recherches', en: 'Team › Searches' },
    // Aucune permission : tout membre lit les recherches conservées de l'équipe (Louis 22/10, Q3).
  },
  {
    route: '/team/activite',
    area: 'pilotage',
    nature: 'produit',
    label: { fr: 'Équipe › Activité & échanges', en: 'Team › Activity & discussions' },
    // Le journal des faits se lit sur les statistiques d'équipe (`manager.controller.ts`), sous `team:manage`.
    requiredPermission: 'team:manage',
  },
  {
    route: '/team/admin',
    area: 'pilotage',
    nature: 'produit',
    label: { fr: 'Équipe › Administration', en: 'Team › Administration' },
    // Tout membre lit la page ; chaque geste (inviter, rôle, départ, règles) garde sa propre permission côté serveur.
  },

  // — Réglages —————————————————————————————————————————————————————————————
  { route: '/settings', area: 'reglages', nature: 'produit', label: { fr: 'Préférences', en: 'Preferences' } },
  // #4295.15 — registre des durées de conservation et politique, dans le cadre des réglages (en session).
  { route: '/privacy', area: 'reglages', nature: 'produit', label: { fr: 'Confidentialité', en: 'Privacy' } },
  {
    route: '/settings/activity',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Journal d’activité', en: 'Activity log' },
    // `workspace.controller.ts:111` — `@Get('activity')`.
    requiredPermission: 'team:manage',
  },
  // Théo D settings-outils.N4 — `/settings/billing` redirige vers `/billing` : adresse routée, entrée au catalogue.
  { route: '/settings/billing', area: 'reglages', nature: 'produit', label: { fr: 'Facturation', en: 'Billing' } },
  { route: '/settings/branding', area: 'reglages', nature: 'produit', label: { fr: 'Marque', en: 'Brand' } },
  {
    route: '/settings/business-units',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Périmètres', en: 'Perimeters' },
    // #2005.5 — `business-unit.controller.ts` : `@Get()` est `@WorkspaceRead()`,
    // ouvert à tout membre. Aucune permission ne ferme donc l'écran — c'est
    // l'ÉCRITURE de la fiche (`PATCH /business-units/:id`) qui reste sous
    // `team:manage`, en action grisée, pas en porte fermée.
  },
  {
    route: '/settings/vivier-export',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Export du vivier', en: 'Talent pool export' },
  },
  {
    route: '/settings/workspace-rules',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Règles d’espace', en: 'Workspace rules' },
    // #2081.14 — `workspace-rules.controller.ts` : `@Get()` est `@WorkspaceRead()`,
    // ouvert à tout membre (qui se voit refuser un export doit pouvoir lire
    // la règle). Le CHANGEMENT reste propriétaire ou administrateur, en
    // choix grisés, pas en porte fermée.
  },
  {
    route: '/settings/do-not-contact',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Ne pas contacter', en: 'Do not contact' },
    // #4158.22 — la liste de l'espace : `@Get('do-not-contact')` est `@WorkspaceRead()`, ouvert à
    // tout membre ; ajouter demande `records:write`, retirer `team:manage` (boutons masqués, 403 côté API).
  },
  {
    route: '/settings/catalogues',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Listes métier', en: 'Business lists' },
  },
  {
    route: '/settings/finance',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Seuil de marge', en: 'Margin threshold' },
    // #2420.17 — `finance.controller.ts` : `@Get('margin')` accepte
    // `finance:read` OU `finance:read:own` (l'une suffit). L'ÉCRITURE
    // (`PATCH margin-threshold`) reste sous `finance:write`, en formulaire
    // grisé, pas en porte fermée.
    requiredPermission: ['finance:read', 'finance:read:own'],
  },
  {
    route: '/settings/import',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Import de données', en: 'Data import' },
    // `import.controller.ts:33` — permission posée au niveau de la CLASSE.
    requiredPermission: 'data:export',
  },
  {
    route: '/settings/knowledge',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Base de connaissance', en: 'Knowledge base' },
  },
  {
    route: '/settings/legal-entities',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Entités juridiques', en: 'Legal entities' },
  },
  {
    route: '/settings/lexicon',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Lexique', en: 'Lexicon' },
    // `esn-profile.controller.ts:290` — `@Get('offer-portfolio')`, d'où vient ce
    // que l'écran ÉDITE. ⚠️ Le lexique LU voyage ailleurs (dans
    // `GET /workspaces/me`, délibérément) pour que chaque membre voie le
    // vocabulaire de son espace : c'est l'ÉCRAN DE RÉGLAGE qui est gardé, pas la
    // lecture du lexique.
    requiredPermission: 'team:manage',
  },
  { route: '/settings/mcp', area: 'reglages', nature: 'produit', label: { fr: 'Assistant IA', en: 'AI assistant' } },
  {
    route: '/settings/memory',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Mémoire de Laura', en: 'Laura’s memory' },
  },
  { route: '/settings/mes-donnees', area: 'reglages', nature: 'produit', label: { fr: 'Mes données', en: 'My data' } },
  {
    route: '/settings/mes-signalements',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Mes signalements', en: 'My reports' },
  },
  {
    route: '/settings/notifications',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Notifications', en: 'Notifications' },
  },
  // #2451.9 — le mode de contexte par défaut de Laura pour l'espace.
  {
    route: '/settings/laura-mode',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Mode de Laura', en: 'Laura mode' },
  },
  { route: '/settings/pipeline', area: 'reglages', nature: 'produit', label: { fr: 'Pipe', en: 'Pipeline' } },
  {
    route: '/settings/reverse-market',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Marché inversé', en: 'Reverse market' },
    // #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations
    // concurrentes : « Priorisation commerciale » mêlait ce sujet et la charge
    // commerciale, et les deux écrans existaient en double. Cet écran porte
    // TOUT le sujet (activation, capacité de réponse, recruteurs affichés).
    // `workspace-reverse-market-settings.controller.ts` : `@Get()` est
    // `@WorkspaceRead()`, ouvert à tout membre. L'ÉCRITURE (`@Patch()`) reste
    // sous `team:manage`, en formulaire grisé, pas en porte fermée.
  },
  {
    route: '/settings/commercial-load',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Charge commerciale', en: 'Commercial load' },
    // #2035.11 — fusionné le 21/09 : cet écran porte les DEUX plafonds du
    // sujet (dossiers suivis, besoins ouverts).
    // `workspace-commercial-load-settings.controller.ts` : même forme que
    // ci-dessus, `@Get()` ouvert à tout membre, `@Patch()` sous `team:manage`.
  },
  { route: '/settings/profile', area: 'reglages', nature: 'produit', label: { fr: 'Profil', en: 'Profile' } },
  {
    route: '/settings/profile/$stage',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Profil — une étape', en: 'Profile — one step' },
  },
  {
    route: '/settings/profile/audit',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Profil — audit commercial', en: 'Profile — commercial audit' },
  },
  {
    route: '/settings/profile/context',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Profil — contexte', en: 'Profile — context' },
  },
  {
    route: '/settings/profile/identity',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Profil — identité', en: 'Profile — identity' },
  },
  { route: '/settings/routines', area: 'reglages', nature: 'produit', label: { fr: 'Routines', en: 'Routines' } },
  {
    route: '/settings/routines/$key',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Fiche routine', en: 'Routine detail' },
  },
  { route: '/settings/security', area: 'reglages', nature: 'produit', label: { fr: 'Sécurité', en: 'Security' } },
  {
    route: '/settings/shortcuts',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Raccourcis clavier', en: 'Keyboard shortcuts' },
  },
  {
    route: '/settings/team',
    area: 'reglages',
    nature: 'produit',
    label: { fr: 'Équipe (réglages)', en: 'Team (settings)' },
  },
  { route: '/integrations', area: 'reglages', nature: 'produit', label: { fr: 'Intégrations', en: 'Integrations' } },
  { route: '/billing', area: 'reglages', nature: 'produit', label: { fr: 'Facturation', en: 'Billing' } },

  // — Mise en route ————————————————————————————————————————————————————————
  { route: '/welcome', area: 'demarrage', nature: 'produit', label: { fr: 'Bienvenue', en: 'Welcome' } },
  { route: '/onboarding', area: 'demarrage', nature: 'produit', label: { fr: 'Mise en route', en: 'Onboarding' } },
  {
    route: '/onboarding/company',
    area: 'demarrage',
    nature: 'produit',
    label: { fr: 'Mise en route — entreprise', en: 'Onboarding — company' },
  },
  {
    route: '/onboarding/plan',
    area: 'demarrage',
    nature: 'produit',
    label: { fr: 'Mise en route — offre', en: 'Onboarding — plan' },
  },
  // Théo O onboarding-catalogue / onboarding-theme — les 16 thèmes et le détail d'un thème.
  {
    route: '/onboarding/themes',
    area: 'demarrage',
    nature: 'produit',
    label: { fr: 'Mise en route — les thèmes', en: 'Onboarding — themes' },
  },
  {
    route: '/onboarding/themes/$themeId',
    area: 'demarrage',
    nature: 'produit',
    label: { fr: 'Mise en route — un thème', en: 'Onboarding — one theme' },
  },
  {
    route: '/onboarding/$id/$stage',
    area: 'demarrage',
    nature: 'produit',
    label: { fr: 'Mise en route — une étape', en: 'Onboarding — one step' },
  },
  {
    route: '/onboarding/$id/$stage/$slug',
    area: 'demarrage',
    nature: 'produit',
    label: { fr: 'Mise en route — une question', en: 'Onboarding — one question' },
  },
  {
    route: '/onboarding/$id/review',
    area: 'demarrage',
    nature: 'produit',
    label: { fr: 'Mise en route — relecture', en: 'Onboarding — review' },
  },
  // #2089.28 — écran de génération dédié (six phases), à part de l'onboarding
  // comme la relecture.
  {
    route: '/onboarding/$id/generating',
    area: 'demarrage',
    nature: 'produit',
    label: { fr: 'Mise en route — génération', en: 'Onboarding — generating' },
  },

  // — Hors session ————————————————————————————————————————————————————————
  { route: '/login', area: 'acces', nature: 'public', label: { fr: 'Connexion', en: 'Sign in' } },
  { route: '/signup', area: 'acces', nature: 'public', label: { fr: 'Inscription', en: 'Sign up' } },
  {
    route: '/forgot-password',
    area: 'acces',
    nature: 'public',
    label: { fr: 'Mot de passe oublié', en: 'Forgotten password' },
  },
  {
    route: '/verify-email',
    area: 'acces',
    nature: 'public',
    label: { fr: 'Vérification de l’adresse e-mail', en: 'Email verification' },
  },
  {
    route: '/auth/reset-password',
    area: 'acces',
    nature: 'public',
    label: { fr: 'Réinitialisation du mot de passe', en: 'Password reset' },
  },
  {
    route: '/invitation/$token',
    area: 'acces',
    nature: 'public',
    label: { fr: 'Invitation à rejoindre un espace', en: 'Workspace invitation' },
  },
  { route: '/share/$slug', area: 'acces', nature: 'public', label: { fr: 'Page partagée', en: 'Shared page' } },
  // #2422.6 (épopée #2869, lot R24 08/10/2026) — la porte PUBLIQUE du lien
  // signé à portée limitée : un contact externe (client, partenaire), sans
  // compte BellumAI, y dépose une pièce de contrat.
  {
    route: '/depot-piece/$token',
    area: 'acces',
    nature: 'public',
    label: { fr: 'Dépôt d’une pièce de contrat', en: 'Contract document upload' },
  },
  { route: '/demo', area: 'acces', nature: 'public', label: { fr: 'Salle de démonstration', en: 'Demo room' } },
  // #2705.1 — le formulaire obligatoire avant la démo, où `/demo` envoie un
  // visiteur sans lead connu.
  {
    route: '/demo/acces',
    area: 'acces',
    nature: 'public',
    label: { fr: 'Formulaire d’accès à la démo', en: 'Demo access form' },
  },
  // Le retour du fournisseur d'identité : jamais un écran, une étape de flux.
  {
    route: '/auth/callback',
    area: 'acces',
    nature: 'technique',
    label: { fr: 'Retour d’authentification', en: 'Authentication callback' },
  },
  // La console opérateur, atteinte depuis l'application. Ce n'est pas un écran
  // du produit CLIENT — le mesurer mélangerait l'usage de nos clients et le nôtre.
  {
    route: '/bak/home',
    area: 'acces',
    nature: 'technique',
    label: { fr: 'Accès au back-office', en: 'Back-office entry' },
  },
  // #4779 — trois REDIRECTIONS (`beforeLoad`, jamais `<Navigate>`), classées `technique` : elles ne rendent aucun
  // écran, les compter comme des écrans produirait « jamais ouvert » sur une page qui n'existe pas.
  // `/analyse` et `/analyze` mènent à `/search` (#4658, 27/10) ; `/talents` mène à `/consultants` (#4668).
  {
    route: '/analyse',
    area: 'accueil',
    nature: 'technique',
    label: {
      fr: 'Adresse française de la recherche (redirige vers /search)',
      en: 'French address of search (redirects to /search)',
    },
  },
  {
    route: '/analyze',
    area: 'accueil',
    nature: 'technique',
    label: {
      fr: 'Adresse anglaise de la recherche (redirige vers /search)',
      en: 'English address of search (redirects to /search)',
    },
  },
  {
    route: '/talents',
    area: 'vivier',
    nature: 'technique',
    label: { fr: 'Section Talents (redirige vers /consultants)', en: 'Talents section (redirects to /consultants)' },
  },
  // #4710 / #4789 — les adresses FRANÇAISES des écrans et `/accounts/$id/analyze` sont des REDIRECTIONS
  // (`beforeLoad`) : `technique`, jamais des écrans (GA-265 rougissait main depuis leur arrivée).
  {
    route: '/accounts/$id/analyse',
    area: 'comptes',
    nature: 'technique',
    label: {
      fr: 'Adresse française de l’analyse d’un compte (redirige vers sa fiche)',
      en: 'French address of account analysis (redirects to its record)',
    },
  },
  {
    route: '/accounts/$id/analyze',
    area: 'comptes',
    nature: 'technique',
    label: { fr: 'Analyse d’un compte (redirige vers sa fiche)', en: 'Account analysis (redirects to its record)' },
  },
  {
    route: '/affaires',
    area: 'projets',
    nature: 'technique',
    label: {
      fr: 'Adresse française du pipe (redirige vers /projects)',
      en: 'French address of the pipeline (redirects to /projects)',
    },
  },
  {
    route: '/comptes',
    area: 'comptes',
    nature: 'technique',
    label: {
      fr: 'Adresse française des comptes (redirige vers /accounts)',
      en: 'French address of accounts (redirects to /accounts)',
    },
  },
  {
    route: '/decouvrir',
    area: 'comptes',
    nature: 'technique',
    label: {
      fr: 'Adresse française de Découvrir (redirige vers /discover)',
      en: 'French address of Discover (redirects to /discover)',
    },
  },
  {
    route: '/equipe',
    area: 'pilotage',
    nature: 'technique',
    label: {
      fr: 'Adresse française de l’équipe (redirige vers /team)',
      en: 'French address of the team (redirects to /team)',
    },
  },
  {
    route: '/facturation',
    area: 'reglages',
    nature: 'technique',
    label: {
      fr: 'Adresse française de la facturation (redirige vers /billing)',
      en: 'French address of billing (redirects to /billing)',
    },
  },
  {
    route: '/signaux',
    area: 'prospection',
    nature: 'technique',
    label: {
      fr: 'Adresse française des signaux (redirige vers /signals)',
      en: 'French address of signals (redirects to /signals)',
    },
  },
  {
    route: '/vivier',
    area: 'vivier',
    nature: 'technique',
    label: {
      fr: 'Adresse française du vivier (redirige vers /consultants)',
      en: 'French address of the talent pool (redirects to /consultants)',
    },
  },
]

/** L'index par MOTIF — construit une fois, lu par {@link findProductScreen}. */
const BY_ROUTE = new Map(PRODUCT_SCREENS.map(screen => [screen.route, screen]))

/**
 * Le motif tel qu'on l'écrit dans le catalogue : sans chaîne de requête, sans
 * fragment, sans barre finale (sauf la racine).
 *
 * Une entrée qui n'est pas une chaîne rend `'/'` plutôt que de lever : ce module
 * est lu au bout d'une chaîne best-effort (le traceur produit perd ses
 * événements en silence par construction), une exception ici ferait tomber une
 * lecture d'analytique pour une ligne mal formée.
 */
export function normalizeScreenRoute(pathname: string): string {
  if (typeof pathname !== 'string') return '/'
  const withoutQuery = pathname.split('?')[0]?.split('#')[0] ?? ''
  const trimmed = withoutQuery.trim()
  if (!trimmed) return '/'
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  if (withLeadingSlash === '/') return '/'
  return withLeadingSlash.replace(/\/+$/, '') || '/'
}

/** L'entrée d'un MOTIF connu, ou `null`. Jamais un écran approchant. */
export function findProductScreen(route: string): ProductScreen | null {
  return BY_ROUTE.get(normalizeScreenRoute(route)) ?? null
}

/**
 * D'un chemin RÉEL (`/accounts/3f1c…`) vers l'écran qui le rend
 * (`/accounts/$id`). `null` quand aucun motif ne correspond — une route
 * inconnue est une donnée inconnue, pas l'écran le plus ressemblant.
 *
 * ⚠️ LE LITTÉRAL GAGNE SUR LE PARAMÈTRE, comme dans le routeur lui-même : sans
 * cette règle, `/accounts/partners` serait compté comme une fiche de compte, et
 * l'écran Partenaires n'apparaîtrait jamais dans le tableau d'adoption — un
 * écran déclaré mort qui ne l'est pas.
 */
export function resolveProductScreen(pathname: string): ProductScreen | null {
  const normalized = normalizeScreenRoute(pathname)
  const direct = BY_ROUTE.get(normalized)
  if (direct) return direct

  const segments = normalized.split('/')
  let best: { screen: ProductScreen; literals: number } | null = null
  for (const screen of PRODUCT_SCREENS) {
    const pattern = screen.route.split('/')
    if (pattern.length !== segments.length) continue
    let literals = 0
    let matches = true
    for (let index = 0; index < pattern.length; index += 1) {
      const expected = pattern[index] ?? ''
      const actual = segments[index] ?? ''
      if (expected.startsWith('$')) {
        // Un segment vide ne remplit pas un paramètre : `/accounts//brief` n'est
        // pas une fiche de compte.
        if (!actual) {
          matches = false
          break
        }
        continue
      }
      if (expected !== actual) {
        matches = false
        break
      }
      literals += 1
    }
    if (!matches) continue
    if (!best || literals > best.literals) best = { screen, literals }
  }
  return best?.screen ?? null
}

/**
 * #2222 — LE CONTRAT D'ACCÈS D'UN CHEMIN RÉEL.
 *
 * Le pont entre ce catalogue et {@link resolveRouteAccess} : le catalogue sait
 * CE QU'UN ÉCRAN EXIGE, le contrat sait TRANCHER, et rien entre les deux ne
 * doit réimplémenter la décision.
 *
 * Il passe par {@link resolveProductScreen}, donc il replie l'identifiant :
 * `/accounts/3f1c…` est jugé sur le contrat de `/accounts/$id`. Sans ce
 * repliement, chaque compte serait une route inconnue — donc ouverte — et le
 * cloisonnement ne s'appliquerait qu'aux écrans sans paramètre.
 *
 * `null` quand aucun motif ne correspond, et l'appelant doit lire ce `null`
 * comme **OUVERT**, jamais comme fermé : une route inconnue de ce fichier est
 * un trou de catalogage, et un trou de catalogage ne doit pas priver quelqu'un
 * d'un écran qu'il paie. Le serveur, lui, refuse de toute façon ce qu'il doit
 * refuser.
 */
export function routeContractFor(pathname: string): RouteContract | null {
  const screen = resolveProductScreen(pathname)
  if (!screen) return null
  const permission = screen.requiredPermission
  return {
    path: screen.route,
    section: screen.area,
    // Le catalogue est `readonly` (il ne se modifie pas à l'exécution), le
    // contrat ne l'est pas : on COPIE plutôt que d'élargir le catalogue.
    ...(permission ? { requiredPermission: typeof permission === 'string' ? permission : [...permission] } : {}),
    ...(screen.requiredPlanFeature ? { requiredPlanFeature: screen.requiredPlanFeature } : {}),
    degradesWithout: [...(screen.degradesWithout ?? [])],
  }
}
