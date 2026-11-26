import { z } from 'zod'

/**
 * Le registre de migration de routes — #2154.3.
 *
 * #2154 (« ARCHITECTURE PRODUIT — MIGRATION, NON-RÉGRESSION ET GO / NO-GO »)
 * demande un tableau à TREIZE champs pour « toutes les routes actuelles » —
 * route actuelle, nom actuel, statut cible, nouvelle destination, paramètres
 * conservés, ancre, objet canonique, permissions, feature gate, liens
 * entrants, notifications, analytics, date de suppression éventuelle. Aucun
 * fichier versionné ne portait ce tableau avant ce commit.
 *
 * Ce registre couvre les QUATORZE routes nommées par #2154.4/.5 : Contacts,
 * Découvrir, Veille, Favoris, Partenaires, Mémoire collective, Besoins,
 * Appels d'offres, Positionnements, Réactivation, Chaînes, Écritures,
 * anciennes sous-pages Missions, anciennes pages Pilotage. Ce n'est PAS
 * l'outillage complet de #2154 (redirections nouvelles à créer, rollback de
 * déploiement, coexistence de projections, 18 scénarios E2E, 11 métriques,
 * conditions NO-GO/GO) — plusieurs jours de travail, hors de portée d'une
 * seule nuit. C'est le socle sur lequel ce reste s'appuierait.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EXTENSION #2958.* (28/09/2026, lot V27) — LES 22 « ROUTES À CONTRÔLER »
 * ─────────────────────────────────────────────────────────────────────────
 * #2208 (« ROUTES À CONTRÔLER ») nomme 22 routes du produit à faire entrer
 * dans ce registre, dont les 14 ci-dessus ne couvraient que huit (Besoins,
 * Appels d'offres, Positionnements, « Submissions » = Positionnements sous
 * son nom anglais, « À réveiller » = Réactivation sous un autre nom, Chaînes,
 * Écritures, et les six sous-pages Missions déjà nommées dans le `gap` de
 * `missions_anciennes_sous_pages` : Board/CRA/ADV/Facturation/
 * Encaissements/Paiements ; Pilotage était déjà là). Sept clés de plus
 * couvrent les huit points restants : `projets` (Projets ET Portefeuille —
 * la seconde est une LENTILLE `projects:lens.portefeuille` de la même page,
 * pas une route distincte, `sections.ts:336`), `vivier`, `actions`,
 * `sequences`, `automatisations`, `integrations`, `parametres`. Aucune
 * n'a jamais changé de route (`never_renamed`) — SAUF `integrations` :
 * `/settings/integrations` redirige RÉELLEMENT vers `/integrations` en
 * conservant le `search` intégral (callbacks OAuth déjà enregistrés chez les
 * fournisseurs), une HUITIÈME redirection réelle que ce registre ne
 * portait pas avant ce commit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE REGISTRE NE REDÉCLARE PAS (GA-26)
 * ─────────────────────────────────────────────────────────────────────────
 * `apps/web/src/components/navigation/sections.test.ts` (`OFF_NAV_FORM`,
 * `REACHED_OTHERWISE`) et `off-nav-screens.ts` sont DÉJÀ le registre des
 * routes sans entrée de navigation, avec leur raison. Ce fichier ne redit pas
 * cette classification : `targetStatus` est une lecture, pas une seconde
 * vérité — `route-migration-registry.test.ts` relit le contenu RÉEL des
 * fichiers de route (le `redirect(...)` littéral) plutôt que de recopier une
 * valeur à la main, précisément pour qu'un désaccord entre les deux registres
 * soit VU et non pas silencieusement possible.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE REGISTRE DIT HONNÊTEMENT NE PAS SAVOIR
 * ─────────────────────────────────────────────────────────────────────────
 * EXTENSION #2958.5 (28/09/2026, lot V27 passe 2) — LE CHAMP `deepLinkTarget`
 * ─────────────────────────────────────────────────────────────────────────
 * #2154.3 demande un champ « ancre » (6) ; #2208.5 en demande un AUTRE :
 * un deep link vers un SOUS-OBJET (`/accounts/:id`), pas un hash intra-page.
 * `anchor` restait donc `null` pour les vingt-et-une routes sans jamais
 * répondre à #2208.5 — deux notions différentes, pas la même case cochée
 * deux fois. `deepLinkTarget` porte le fichier de route à segment
 * d'identifiant RÉELLEMENT trouvé (`existsSync`, `route-migration-
 * registry.test.ts`) pour l'objet canonique de l'entrée — cinq routes
 * (`contacts`, `ecritures`/`actions` partagent `/actions/$id`,
 * `missions_anciennes_sous_pages`, `projets`/`besoins` partagent
 * `/projects/$id`, `vivier`) en ont un prouvé ; les seize autres restent
 * `null` — soit l'objet canonique n'a pas de fiche à identifiant
 * (« routine », « connecteur », « réglage d'espace »…), soit aucun fichier
 * `$id` n'a été trouvé pour lui.
 *
 * Ce dépôt est un clone SUPERFICIEL (`.git/shallow` présent, 1366 commits
 * visibles) : `git log --diff-filter=D` ne remonte aucune ancienne route
 * supprimée pour Contacts, Découvrir, Appels d'offres, Chaînes, ni pour les
 * sous-pages Missions/Pilotage. Plutôt que d'inventer une ancienne URL
 * plausible, chaque entrée sans preuve porte `targetStatus: 'never_renamed'`
 * ou `'unverifiable_shallow_clone'` et NOMME la limite dans `gap` — jamais de
 * donnée fictive.
 */

export const ROUTE_MIGRATION_KEYS = [
  'contacts',
  'decouvrir',
  'veille',
  'favoris',
  'partenaires',
  'memoire_collective',
  'besoins',
  'appels_offres',
  'positionnements',
  'reactivation',
  'chaines',
  'ecritures',
  'missions_anciennes_sous_pages',
  'pilotage_anciennes_pages',
  'projets',
  'vivier',
  'actions',
  'sequences',
  'automatisations',
  'integrations',
  'parametres',
] as const
export const routeMigrationKeySchema = z.enum(ROUTE_MIGRATION_KEYS)
export type RouteMigrationKey = (typeof ROUTE_MIGRATION_KEYS)[number]

/**
 * `redirected` : une redirection RÉELLE existe dans le code (vérifié par le
 * test, pas déclaré à la main).
 * `removed` : #4359 (Louis 20/10/2026) — l'ancienne adresse n'a plus de fichier de route ET plus de
 * ligne dans la table `lib/legacy-addresses.ts` : elle tombe sur la page « introuvable », parce que
 * plus aucune notification ni aucun e-mail ne la produit. `newDestination` dit où vit la capacité.
 * `never_renamed` : aucune ancienne route distincte n'est trouvée — la route
 * actuelle est la seule connue pour cet objet.
 * `unverifiable_shallow_clone` : le clone superficiel empêche de vérifier
 * s'il existait une ancienne route ; ce n'est pas `never_renamed`, qui
 * affirmerait une absence qu'on ne peut pas prouver.
 */
export const ROUTE_MIGRATION_STATUSES = [
  'redirected',
  'removed',
  'never_renamed',
  'unverifiable_shallow_clone',
] as const
export const routeMigrationStatusSchema = z.enum(ROUTE_MIGRATION_STATUSES)
export type RouteMigrationStatus = (typeof ROUTE_MIGRATION_STATUSES)[number]

export const routeMigrationEntrySchema = z.object({
  key: routeMigrationKeySchema,
  /** #2154.k — le point exact dont l'entrée répond. */
  sourceIssue: z.string().min(1),
  /** Champ 2 — nom actuel, tel qu'écrit dans #2154. */
  label: z.string().min(1),
  /** Champ 1 — route actuelle. La route servie aujourd'hui, ancienne ou non. */
  currentRoute: z.string().min(1).startsWith('/'),
  targetStatus: routeMigrationStatusSchema,
  /** Champ 4 — nouvelle destination. Égale à `currentRoute` quand la route
   *  n'a jamais changé (`never_renamed`) : la destination n'a pas bougé. */
  newDestination: z.string().min(1).startsWith('/').nullable(),
  /** Champ 5 — paramètres conservés. Liste VIDE quand la redirection ne
   *  transmet rien, jamais une supposition sur ce qu'un lien portait. */
  preservedParams: z.array(z.string().min(1)),
  /** Champ 6 — ancre (#2958.5) : l'`id` posé sur le contenu de la page destination
   *  (`anchorId` de `CustomerPage`/`SettingsPage`), prouvé par `route-migration-registry.test.ts`.
   *  `null` seulement si une route n'a aucune page à ancrer. */
  anchor: z.string().min(1).nullable(),
  /** #2958.5 — deep link vers un SOUS-OBJET (`/contacts/:id`), notion distincte
   *  de `anchor` (hash intra-page). `null` quand aucun fichier de route à
   *  segment d'identifiant n'a été trouvé pour l'objet canonique de cette
   *  entrée — jamais deviné. */
  deepLinkTarget: z.string().min(1).nullable(),
  /** Champ 7 — objet canonique porté par la route. */
  canonicalObject: z.string().min(1).nullable(),
  /** Champ 8 — permissions. `null` quand la redirection elle-même n'en pose
   *  aucune (la porte, s'il y en a une, vit à la destination). */
  permissions: z.string().min(1).nullable(),
  /** Champ 9 — feature gate. */
  featureGate: z.string().min(1).nullable(),
  /** Champ 10 — liens entrants VÉRIFIÉS (fichiers qui écrivent encore cette
   *  route en dur), pas une estimation. */
  inboundLinks: z.array(z.string().min(1)),
  /** Champ 11 — notifications qui nomment cette route. */
  notifications: z.string().min(1).nullable(),
  /** Champ 12 — analytics qui mesurent cette route. */
  analytics: z.string().min(1).nullable(),
  /** Champ 13 — date de suppression éventuelle. TOUJOURS `null` : « on
   *  archive, on ne supprime pas » (doctrine). Le champ existe pour dire
   *  explicitement qu'aucune des vingt-et-une routes n'a de date de retrait. */
  deletionDate: z.null(),
  /** Le fichier qui porte la redirection, pour que le test puisse relire son
   *  contenu réel — une route, ou la table `lib/legacy-addresses.ts` (#4359). `null` quand
   *  `targetStatus !== 'redirected'`. */
  holderFile: z.string().min(1).nullable(),
  /** Ce que l'entrée ne peut pas affirmer, et pourquoi. Jamais vide : un
   *  registre qui ne nomme pas ses limites fait croire à une exhaustivité
   *  qu'un clone superficiel ne permet pas. */
  gap: z.string().min(1),
})
export type RouteMigrationEntry = z.infer<typeof routeMigrationEntrySchema>

const SHALLOW_CLONE_GAP =
  "clone superficiel (.git/shallow, 1366 commits visibles) : `git log --all --diff-filter=D --name-only` ne remonte aucune route supprimée sous ce nom. Ni prouvé migré, ni prouvé jamais renommé — l'entrée ne tranche pas ce qu'elle ne peut pas vérifier."

export const ROUTE_MIGRATION_REGISTRY: readonly RouteMigrationEntry[] = [
  {
    key: 'contacts',
    sourceIssue: '#2154.4',
    label: 'Contacts',
    currentRoute: '/contacts',
    targetStatus: 'unverifiable_shallow_clone',
    newDestination: '/contacts',
    preservedParams: [],
    anchor: 'contacts', // #2958.5
    deepLinkTarget: '/contacts/$id',
    canonicalObject: 'contact',
    permissions: null,
    featureGate: null,
    inboundLinks: [],
    notifications: null,
    analytics: null,
    deletionDate: null,
    holderFile: null,
    gap: SHALLOW_CLONE_GAP,
  },
  {
    key: 'decouvrir',
    sourceIssue: '#2154.4',
    label: 'Découvrir',
    currentRoute: '/discover',
    targetStatus: 'unverifiable_shallow_clone',
    newDestination: '/discover',
    preservedParams: [],
    anchor: 'decouvrir', // #2958.5
    deepLinkTarget: null,
    canonicalObject: 'compte (découverte)',
    permissions: null,
    featureGate: null,
    inboundLinks: [],
    notifications: null,
    analytics: null,
    deletionDate: null,
    holderFile: null,
    gap: `Aucune route \`/decouvrir\` (français) trouvée dans le code accessible — seule \`/discover\` existe. ${SHALLOW_CLONE_GAP}`,
  },
  {
    key: 'veille',
    sourceIssue: '#2154.4/.5',
    label: 'Veille',
    currentRoute: '/watchlist',
    targetStatus: 'redirected',
    newDestination: '/signals', // Théo A signaux (22/10) : l'écran « Signaux » est `/signals` ; `/mes-cibles` y redirige à son tour
    preservedParams: ['*'],
    anchor: 'signaux', // #2958.5
    deepLinkTarget: null,
    canonicalObject: 'compte (signal de veille)',
    permissions: null,
    featureGate: null,
    inboundLinks: [],
    notifications:
      'Des notifications et des conversations de Laura déjà écrites nomment /watchlist : la table `legacy-addresses.ts` (#4359) les mène à « Signaux ». Le catalogue écrit /signals ; /mes-cibles, ancienne adresse du même écran, y redirige en gardant l’ancre.',
    analytics: null,
    deletionDate: null,
    holderFile: 'apps/web/src/lib/legacy-addresses.ts',
    gap: '#4359 : plus de fichier de route, une ligne de la table `lib/legacy-addresses.ts` qui réécrit le chemin et garde `search` et ancre (X41) — prouvé par `legacy-addresses.test.ts`. Non vérifiable au-delà (clone superficiel).',
  },
  {
    key: 'favoris',
    sourceIssue: '#2154.4/.5',
    label: 'Favoris',
    currentRoute: '/favorites',
    targetStatus: 'removed', // #4359 — plus de route, plus de ligne de table : « introuvable »
    newDestination: '/accounts',
    preservedParams: [],
    anchor: 'comptes', // #2958.5
    deepLinkTarget: null,
    canonicalObject: 'compte',
    permissions: null,
    featureGate: null,
    inboundLinks: [],
    notifications: null,
    analytics: null,
    deletionDate: null,
    holderFile: null,
    gap: "La notion de favori a été retirée du produit (#1800). #4359 (Louis 20/10/2026) : l'ancienne adresse /favorites n'a plus de route — aucune notification ni aucun e-mail ne l'a jamais produite, elle tombe sur la page « introuvable » plutôt que de rediriger vers /accounts.",
  },
  {
    key: 'partenaires',
    sourceIssue: '#2154.4/.5',
    label: 'Partenaires',
    currentRoute: '/accounts/partners',
    targetStatus: 'unverifiable_shallow_clone',
    newDestination: '/accounts/partners',
    preservedParams: [],
    anchor: 'partenaires', // #2958.5
    deepLinkTarget: null,
    canonicalObject: 'partenaire (account_partners)',
    permissions: null,
    featureGate: null,
    inboundLinks: ['apps/web/src/components/navigation/off-nav-screens.ts'],
    notifications: null,
    analytics: null,
    deletionDate: null,
    holderFile: null,
    gap: `Aucune route \`/partenaires\` distincte de \`/accounts/partners\` trouvée : le chemin n'a pas changé, seule sa présence en onglet a bougé (#2151.26/.38 — hors nav, mais atteinte depuis Market Watch et la fiche Énergie, \`sections.test.ts::linkedFromAScreen\`). ${SHALLOW_CLONE_GAP}`,
  },
  {
    key: 'memoire_collective',
    sourceIssue: '#2154.4/.5',
    label: 'Mémoire collective',
    currentRoute: '/knowledge',
    targetStatus: 'redirected',
    newDestination: '/settings/knowledge',
    preservedParams: ['*'],
    anchor: 'memoire-collective', // #2958.5
    deepLinkTarget: null,
    canonicalObject: 'document (RAG)',
    permissions: null,
    featureGate: null,
    inboundLinks: [],
    notifications:
      'Le CTA du copilote « Ajouter un document » a pointé vers /knowledge (réécrit vers /settings/knowledge, #4359) : la table `legacy-addresses.ts` garde les conversations déjà écrites.',
    analytics: null,
    deletionDate: null,
    holderFile: 'apps/web/src/lib/legacy-addresses.ts',
    gap: "#4359 : plus de fichier de route, une ligne de la table `lib/legacy-addresses.ts` (search et ancre conservés). Aucun paramètre n'était attendu (page sans filtre connu).",
  },
  {
    key: 'besoins',
    sourceIssue: '#2154.4/.5',
    label: 'Besoins',
    currentRoute: '/needs',
    targetStatus: 'redirected',
    newDestination: '/projects',
    preservedParams: ['*'],
    anchor: 'projets', // #2958.5
    deepLinkTarget: '/projects/$id',
    canonicalObject: 'projet',
    permissions: null,
    featureGate: null,
    inboundLinks: [],
    notifications:
      'Des notifications déjà parties nomment /needs : la table `legacy-addresses.ts` (#4359) les mène à /projects. (`/needs/...` côté API IA est un chemin de service, pas un écran.)',
    analytics: null,
    deletionDate: null,
    holderFile: 'apps/web/src/lib/legacy-addresses.ts',
    gap: "« Besoin » et « Projet » ont fusionné en un seul objet (#2154 doctrine) : la table cible la liste, jamais un besoin précis — un ancien lien /needs/$id n'a pas d'équivalent vérifié dans ce dossier.",
  },
  {
    key: 'appels_offres',
    sourceIssue: '#2154.4',
    label: "Appels d'offres",
    currentRoute: '/rfp',
    // #4341 (Louis 19/10/2026) — l'onglet « Appels d'offres » quitte Affaires : l'espace vit DANS
    // le pipe (`/projects?lens=rfp`), `/rfp` y redirige pour les liens déjà partis.
    targetStatus: 'removed', // #4359 — l'espace vit dans le pipe (`/projects?lens=rfp`), plus d'adresse `/rfp`
    newDestination: '/projects',
    preservedParams: [],
    anchor: 'appels-offres', // #2958.5
    deepLinkTarget: null,
    canonicalObject: "appel d'offres",
    permissions: null,
    featureGate: null,
    inboundLinks: [],
    notifications: null,
    analytics: null,
    deletionDate: null,
    holderFile: null,
    gap: "#4359 (Louis 20/10/2026) : `/rfp` n'a plus de route — Laura n'écrit plus cette adresse (catalogue réécrit), aucune notification ne la produit. L'espace s'ouvre par `/projects?lens=rfp`.",
  },
  {
    key: 'positionnements',
    sourceIssue: '#2154.4/.5',
    label: 'Positionnements',
    currentRoute: '/consultants/submissions',
    // #4197 (L6, Louis 14/10/2026) — l'écran n'est plus une VUE du Vivier : il a de
    // nouveau SA route, troisième onglet de Talents. La redirection a changé de
    // sens (`/consultants?view=submissions` → `/consultants/submissions`, dans le
    // `beforeLoad` de la page Vivier, qui rend aussi son propre écran) : l'entrée
    // quitte donc `redirected` — son fichier n'est plus « une redirection à usage
    // unique », et c'est ce que les gardes de redirection pure vérifient.
    // #4349 (Louis 19/10/2026, renverse #4197) — Talents = le Vivier seul : l'onglet est retiré,
    // `/consultants/submissions` redirige vers la section « Positionnements » du Vivier.
    targetStatus: 'removed', // #4359 — la section « Positionnements » du Vivier n'a plus d'adresse propre
    newDestination: '/projects/presentations', // #4528 (Louis 24/10/2026) — Affaires › Présentations
    preservedParams: [],
    anchor: 'presentations', // #2958.5 ; #4528 — `id="presentations"` de PresentationsPage
    deepLinkTarget: null,
    canonicalObject: 'positionnement',
    permissions: null,
    featureGate: null,
    inboundLinks: [],
    notifications: null,
    analytics: null,
    deletionDate: null,
    holderFile: null,
    gap: "#4359 (Louis 20/10/2026) : `/consultants/submissions` n'a plus de route (les liens du cockpit, des chaînes et de Pilotage visent `/consultants`, ou `/consultants#positionnements` quand le composant porte l'ancre). #4528 : ces deux adresses mènent désormais à `/projects/presentations`. Attention : le segment tombe sur la fiche `/consultants/$id` avec l'identifiant « submissions ».",
  },
  {
    key: 'reactivation',
    sourceIssue: '#2154.4/.5',
    label: 'Réactivation',
    currentRoute: '/consultants/pool',
    targetStatus: 'redirected',
    newDestination: '/consultants',
    preservedParams: [], // #3962 — la vue `reactivation` n'existe plus, l'ancien `?view=` n'est plus transmis
    anchor: 'vivier', // #2958.5
    deepLinkTarget: null,
    canonicalObject: 'consultant',
    permissions: null,
    featureGate: null,
    inboundLinks: [],
    notifications: null,
    analytics: null,
    deletionDate: null,
    holderFile: 'apps/web/src/lib/legacy-addresses.ts',
    gap: "#3962 (Louis 10/10) — la vue « À réveiller » est retirée du Vivier. #4359 : `/consultants/pool` n'a plus de fichier de route, une ligne de la table `lib/legacy-addresses.ts` la mène à `/consultants` (les liens des rituels `ritual.ts` visent désormais `/consultants`). Sans la ligne, le segment tomberait sur la fiche `/consultants/$id`.",
  },
  {
    key: 'chaines',
    sourceIssue: '#2154.4',
    label: 'Chaînes (Parcours)',
    currentRoute: '/actions/chaines',
    // #2958 (16/10/2026) — Louis 15/10 : Parcours est une SECTION de Pilotage › Pipe (#4163.2). Les deux
    // anciennes adresses (`/actions/chaines`, `/pilotage/parcours`) redirigent par `beforeLoad` + `redirect()`
    // (jamais `<Navigate>`, GA-27) ; le registre suit désormais la redirection VRAIE, plus l'écran canonique.
    targetStatus: 'removed', // #4359 — Parcours est une section de Pilotage › Pipe, plus d'adresse propre
    newDestination: '/pilotage/pipe',
    preservedParams: [],
    anchor: 'parcours',
    deepLinkTarget: null,
    canonicalObject: 'chaîne (séquence de relance)',
    permissions: null,
    featureGate: null,
    inboundLinks: [],
    notifications: null,
    analytics: null,
    deletionDate: null,
    holderFile: null,
    gap: "#4359 (Louis 20/10/2026) : `/actions/chaines` et `/pilotage/parcours` n'ont plus de route — Parcours se lit sur `/pilotage/pipe#parcours`. Aucune notification ne produit ces adresses. Le droit se règle PAR SECTION sur la page (Parcours ouvert à tous les rôles). `/actions/chaines` tombe sur la fiche `/actions/$id`.",
  },
  {
    key: 'ecritures',
    sourceIssue: '#2154.4/.5',
    label: 'Écritures',
    currentRoute: '/actions/ecritures',
    targetStatus: 'removed', // #4359 — la file « À valider » est l'onglet de `/actions`
    newDestination: '/actions',
    preservedParams: [],
    anchor: 'actions', // #2958.5
    deepLinkTarget: '/actions/$id',
    canonicalObject: 'écriture CRM/ERP à valider',
    permissions: null,
    featureGate: null,
    inboundLinks: [],
    notifications: null,
    analytics: null,
    deletionDate: null,
    holderFile: null,
    gap: "Les paramètres listés sont ceux d'`actionHistorySearchSchema`, relu par `/actions` (ils ne voyagent plus depuis l'ancienne adresse). #4359 (Louis 20/10/2026) : `/actions/ecritures` n'a plus de route — `notifications: null`, aucun message parti ne la nomme ; elle tombe sur la fiche `/actions/$id`.",
  },
  {
    key: 'missions_anciennes_sous_pages',
    sourceIssue: '#2154.4',
    label: 'Anciennes sous-pages Missions',
    currentRoute: '/missions',
    targetStatus: 'unverifiable_shallow_clone',
    newDestination: null,
    preservedParams: [],
    anchor: 'missions', // #2958.5
    deepLinkTarget: '/missions/$id',
    canonicalObject: 'mission',
    permissions: null,
    featureGate: null,
    inboundLinks: [],
    notifications: null,
    analytics: null,
    deletionDate: null,
    holderFile: null,
    gap: `Onze sous-pages de /missions existent aujourd'hui (adv, board, cessions, cra, encaissements, facturation, nouvelle, paiements, planification, renouvellements, suivi) — toutes des écrans canoniques, aucune redirection. Impossible de savoir laquelle, s'il y en a une, a absorbé une ancienne sous-page distincte. ${SHALLOW_CLONE_GAP}`,
  },
  {
    key: 'pilotage_anciennes_pages',
    sourceIssue: '#2154.4',
    label: 'Anciennes pages Pilotage',
    currentRoute: '/pilotage',
    targetStatus: 'unverifiable_shallow_clone',
    newDestination: null,
    preservedParams: [],
    anchor: 'cockpit-decisions', // #2958.5
    deepLinkTarget: null,
    canonicalObject: 'indicateur de pilotage',
    permissions: null,
    featureGate: null,
    inboundLinks: [],
    notifications: null,
    analytics: null,
    deletionDate: null,
    holderFile: null,
    gap: `Six pages de /pilotage existent aujourd'hui (index, energie, finance, marche, qualite, rex) — toutes des écrans canoniques, aucune redirection. ${SHALLOW_CLONE_GAP}`,
  },
  {
    key: 'projets',
    sourceIssue: '#2208.10/.11',
    label: 'Projets / Portefeuille',
    currentRoute: '/projects',
    targetStatus: 'never_renamed',
    newDestination: '/projects',
    preservedParams: [],
    anchor: 'projets', // #2958.5
    deepLinkTarget: '/projects/$id',
    canonicalObject: 'projet',
    permissions: null,
    featureGate: 'needs (PlanFeatureRoute, projects/index.tsx:167)',
    inboundLinks: [],
    notifications: null,
    analytics: null,
    deletionDate: null,
    holderFile: null,
    gap: "« Portefeuille » n'est pas une route distincte de « Projets » : c'était une lentille de la même page — comptée ici comme le MÊME point d'entrée, jamais une deuxième route à auditer. Route canonique, jamais renommée. Affaires = le Pipe SEUL (Louis 19/10/2026) : `/projects/pistes` redirige vers Signaux (`/mes-cibles#pistes`), `/rfp` vers `/projects?lens=rfp`, et `/projects/needs` NU vers `/projects` (F1-FIX #4344 — seuls les liens profonds `match`, `q`, `fromRfp`, `account_id` gardent l'écran des besoins).",
  },
  {
    key: 'vivier',
    sourceIssue: '#2208.14',
    label: 'Vivier',
    currentRoute: '/consultants',
    targetStatus: 'never_renamed',
    newDestination: '/consultants',
    preservedParams: [],
    anchor: 'vivier', // #2958.5
    deepLinkTarget: '/consultants/$id',
    canonicalObject: 'consultant',
    permissions: null,
    featureGate: 'talent_pool (PlanFeatureRoute, consultants/index.tsx:103)',
    inboundLinks: [],
    notifications: null,
    analytics: null,
    deletionDate: null,
    holderFile: null,
    gap: 'Route canonique, jamais renommée — ses deux anciennes sous-pages (Positionnements/Réactivation) sont déjà les entrées `positionnements`/`reactivation` ci-dessus, pas redéclarées ici (GA-26).',
  },
  {
    key: 'actions',
    sourceIssue: '#2208.24',
    label: 'Actions',
    currentRoute: '/actions',
    targetStatus: 'never_renamed',
    newDestination: '/actions',
    preservedParams: [],
    anchor: 'actions', // #2958.5
    deepLinkTarget: '/actions/$id',
    canonicalObject: 'action (geste à valider)',
    permissions: null,
    featureGate: null,
    inboundLinks: [],
    notifications: null,
    analytics: null,
    deletionDate: null,
    holderFile: null,
    gap: 'Route canonique, jamais renommée — sa sous-page Écritures est déjà `ecritures` ci-dessus, pas redéclarée ici.',
  },
  {
    key: 'sequences',
    sourceIssue: '#2208.27',
    label: 'Séquences',
    currentRoute: '/actions/sequences',
    targetStatus: 'never_renamed',
    newDestination: '/actions/sequences',
    preservedParams: [],
    anchor: 'sequences', // #2958.5
    deepLinkTarget: null,
    canonicalObject: 'séquence de prospection',
    permissions: null,
    featureGate: null,
    inboundLinks: [],
    notifications: null,
    analytics: null,
    deletionDate: null,
    holderFile: null,
    gap: '`actions/sequences.tsx` documente explicitement suivre « le même palier que le reste de la section Actions » plutôt que de poser sa propre `PLAN_FEATURE_KEY` — la porte, si elle existe, vit à un niveau au-dessus de cette route, non vérifiée ici.',
  },
  {
    key: 'automatisations',
    sourceIssue: '#2208.28',
    label: 'Automatisations',
    // #2958 (16/10/2026) — lot L-D1 (#4167) : Actions = Aujourd'hui / Séquences / Automatisations. La route
    // canonique est `/actions/automatisations` ; `/settings/routines` (et sa fiche `/settings/routines/:key`)
    // reste atteignable, sans redirection : la fiche d'une routine n'a pas d'équivalent dans la page de règles.
    currentRoute: '/actions/automatisations',
    // #4357 (Louis 19/10/2026, renverse c105) faisait de `/actions/automatisations` une redirection vers « Séquences
    // sur un signal » ; la décision Louis 22/10 `c130_actions_trois_onglets_automatisations_theo` la renverse à son
    // tour : Actions a TROIS onglets et « Automatisations » rend un VRAI écran (« Tes automatisations »). La route est
    // donc active (`never_renamed`), plus une redirection ni une destination de rollback.
    targetStatus: 'never_renamed',
    newDestination: '/actions/automatisations',
    preservedParams: [],
    anchor: 'sur-signal', // #2958.5
    deepLinkTarget: null,
    canonicalObject: 'automatisation (règle « quand → alors » et routine planifiée)',
    permissions: null,
    featureGate: null,
    inboundLinks: [],
    notifications: null,
    analytics: null,
    deletionDate: null,
    holderFile: null,
    gap: "Les routines planifiées gardent leur adresse `/settings/routines` et leurs fiches `/settings/routines/:key` (liens, notifications et réponses de Laura déjà partis) : aucune redirection n'est posée, la navigation n'expose plus que « Automatisations » sous Actions. Tranché sans Louis : une redirection ferait perdre la fiche d'une routine à qui suit un ancien lien.",
  },
  {
    key: 'integrations',
    sourceIssue: '#2208.30',
    label: 'Intégrations',
    currentRoute: '/settings/integrations',
    targetStatus: 'redirected',
    newDestination: '/integrations',
    preservedParams: ['*'],
    anchor: 'integrations', // #2958.5
    deepLinkTarget: null,
    canonicalObject: 'connecteur',
    permissions: null,
    featureGate: null,
    inboundLinks: ['apps/web/src/features/integration-center/view/IntegrationCenterPage.tsx'],
    notifications: null,
    analytics: null,
    deletionDate: null,
    holderFile: 'apps/web/src/lib/legacy-addresses.ts',
    gap: "`['*']` : #4359 — la table `lib/legacy-addresses.ts` réécrit le chemin et garde le `search` COMPLET, jamais une liste de noms fixes (les clés de requête d'un retour OAuth ne s'énumèrent pas à l'avance sans en inventer). Les sept contrôleurs OAuth de l'API redirigent désormais vers `/integrations` ; la ligne reste pour les retours déjà en vol et la fenêtre où l'API et le web ne sont pas déployés ensemble.",
  },
  {
    key: 'parametres',
    sourceIssue: '#2208.31',
    label: 'Paramètres',
    currentRoute: '/settings',
    targetStatus: 'never_renamed',
    newDestination: '/settings',
    preservedParams: [],
    anchor: 'parametres', // #2958.5
    deepLinkTarget: null,
    canonicalObject: "réglage d'espace",
    permissions: null,
    featureGate: null,
    inboundLinks: [],
    notifications: null,
    analytics: null,
    deletionDate: null,
    holderFile: null,
    gap: 'Route canonique, jamais renommée — ses sous-pages (routines, integrations, knowledge…) sont soit déjà des entrées séparées de ce registre, soit hors du périmètre des 22 routes de #2208.',
  },
]

/** Les routes dont la migration N'EST PAS prouvée par le code — le reste
 *  concret de #2154.3/.4/.5 pour ce lot. */
export function routeMigrationGaps(): { key: RouteMigrationKey; targetStatus: RouteMigrationStatus; gap: string }[] {
  return ROUTE_MIGRATION_REGISTRY.filter(entry => entry.targetStatus !== 'redirected').map(entry => ({
    key: entry.key,
    targetStatus: entry.targetStatus,
    gap: entry.gap,
  }))
}

/** Les routes dont la redirection est vérifiée dans le code — pas seulement déclarée. */
export function redirectedRoutes(): RouteMigrationEntry[] {
  return ROUTE_MIGRATION_REGISTRY.filter(entry => entry.targetStatus === 'redirected')
}

/** #4359 — les anciennes adresses sans fichier de route NI ligne de table : elles tombent sur « introuvable ». */
export function removedRoutes(): RouteMigrationEntry[] {
  return ROUTE_MIGRATION_REGISTRY.filter(entry => entry.targetStatus === 'removed')
}

/** #2958.5 — les routes dont l'objet canonique a un deep link vers un
 *  sous-objet PROUVÉ (`/contacts/:id`, jamais l'ancre `anchor`). */
export function routesWithDeepLink(): RouteMigrationEntry[] {
  return ROUTE_MIGRATION_REGISTRY.filter(entry => entry.deepLinkTarget !== null)
}
