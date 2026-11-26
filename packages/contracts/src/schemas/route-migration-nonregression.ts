import { z } from 'zod'
import { routeMigrationKeySchema } from './route-migration-registry.js'

/**
 * Les treize dimensions de non-régression PAR CAPACITÉ — #2154.9 (+#2958.72-.93).
 *
 * #2154 (section TESTS DE NON-RÉGRESSION) demande, « pour chaque capacité » :
 * route accessible, rôle correct, donnée visible, action réelle, coût, état
 * vide, erreur, mobile, lien partagé, retour navigateur, deep link, audit —
 * douze dimensions. Le tri du 28/09 (`TRI-RESTES-28-09.md`, #2958.72-.93) en
 * compte TREIZE : `notification`, la treizième, reprend le champ 11 du
 * registre (#2154.3, `notifications`) — une notification, un message Laura ou
 * un e-mail déjà PARTI peut nommer l'ANCIENNE route ; ni « route accessible »
 * (qui vérifie la redirection), ni aucune des douze autres, ne vérifie que ce
 * qui a été ENVOYÉ pointe encore juste. Le distinguer évite qu'il se perde
 * dans « route_accessible ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE SEULE CAPACITÉ, PAS TREIZE CASES ÉPARPILLÉES
 * ─────────────────────────────────────────────────────────────────────────
 * Le bilan du 27/09 (#2958) l'a nommé : « coder une DE ces dimensions sans
 * les autres capacités de référence ni les autres dimensions produirait une
 * case cochée isolée, jamais un système de non-régression ». Ce fichier
 * prend l'inverse : LES TREIZE dimensions, ENSEMBLE, pour UNE capacité réelle —
 * Écritures → Centre d'actions (`/actions/ecritures` → `/actions`, #2154.4/.5,
 * `route-migration-registry.ts`), celle qui a la meilleure couverture de test
 * existante du produit. C'est la plus petite tranche qui a un sens comparatif
 * (le format complet), pas une maquette.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER DIT HONNÊTEMENT NE PAS SAVOIR
 * ─────────────────────────────────────────────────────────────────────────
 * Huit des treize dimensions sont `verified`, avec leur fichier:ligne RÉEL
 * (vérifié par le test — `existsSync`, jamais une affirmation à main levée).
 * Cinq sont `gap` : aucune preuve trouvée dans ce dépôt, nommée plutôt que
 * cochée en silence — exactement la même honnêteté que le registre #2154.3
 * pour les sept routes non prouvées migrées.
 */

export const NONREGRESSION_DIMENSIONS = [
  'route_accessible',
  'role_correct',
  'donnee_visible',
  'action_reelle',
  'cout',
  'etat_vide',
  'erreur',
  'mobile',
  'lien_partage',
  'retour_navigateur',
  'deep_link',
  'audit',
  'notification',
] as const
export const nonRegressionDimensionSchema = z.enum(NONREGRESSION_DIMENSIONS)
export type NonRegressionDimension = (typeof NONREGRESSION_DIMENSIONS)[number]

/**
 * #2958.104 (lot R19, 07/10) — AJOUT de `contacts_liste`, deuxième capacité.
 * Le fichier ne redevient pas une brochure pour autant : `routeMigrationKey`
 * (ci-dessous) est resté une LECTURE du registre réel, jamais un littéral
 * étendu à la main — une clé retirée du registre ferait échouer le test
 * `routeMigrationEntrySchema`, pas seulement une relecture humaine.
 */
export const NONREGRESSION_CAPACITY_KEYS = [
  'ecritures_centre_actions',
  'contacts_liste',
  'projets_pipe',
  'decouvrir',
  'veille_cibles',
  'favoris_comptes',
  'partenaires_pipeline',
  'memoire_collective_reglages',
  'besoins_projets',
  'appels_offres',
  'positionnements',
  'reactivation_vivier',
  'chaines_parcours',
  'missions',
  'pilotage',
] as const
export const nonRegressionCapacityKeySchema = z.enum(NONREGRESSION_CAPACITY_KEYS)
export type NonRegressionCapacityKey = (typeof NONREGRESSION_CAPACITY_KEYS)[number]

export const NONREGRESSION_STATUSES = ['verified', 'gap'] as const
export const nonRegressionStatusSchema = z.enum(NONREGRESSION_STATUSES)
export type NonRegressionStatus = (typeof NONREGRESSION_STATUSES)[number]

export const nonRegressionCheckSchema = z.object({
  dimension: nonRegressionDimensionSchema,
  status: nonRegressionStatusSchema,
  /** `verified` : `fichier[:ligne]` réel. `gap` : la raison concrète, jamais
   *  « à vérifier ». */
  evidence: z.string().min(1),
  /** Le fichier à relire pour vérifier `evidence` — `null` en `gap`. */
  file: z.string().min(1).nullable(),
})
export type NonRegressionCheck = z.infer<typeof nonRegressionCheckSchema>

export const nonRegressionCapacitySchema = z.object({
  key: nonRegressionCapacityKeySchema,
  sourceIssue: z.literal('#2154.9'),
  label: z.string().min(1),
  /** La clé du registre #2154.3 dont cette capacité est l'écran migré. */
  routeMigrationKey: routeMigrationKeySchema,
  checks: z.array(nonRegressionCheckSchema).length(NONREGRESSION_DIMENSIONS.length),
})
export type NonRegressionCapacity = z.infer<typeof nonRegressionCapacitySchema>

export const NONREGRESSION_CAPACITIES: readonly NonRegressionCapacity[] = [
  {
    key: 'ecritures_centre_actions',
    sourceIssue: '#2154.9',
    label: "Écritures CRM/ERP à valider — Centre d'actions",
    routeMigrationKey: 'ecritures',
    checks: [
      {
        dimension: 'route_accessible',
        status: 'verified',
        evidence:
          "#4359 : `/actions/ecritures` n'a plus de route — la page « introuvable » répond ; `/actions` rend l'écran (`ActionsRoute`).",
        file: 'apps/web/src/routes/actions/index.tsx',
      },
      {
        dimension: 'role_correct',
        status: 'verified',
        evidence:
          "Le filtre membre lit `GET /workspaces/members`, PAS un rôle manager — choix explicite écrit en commentaire : aucune capacité n'est cachée par rôle sur cet écran (conforme à la doctrine « le rôle change l'ordre, jamais le contenu »).",
        file: 'apps/web/src/features/action-history/view/ActionHistoryPage.tsx',
      },
      {
        dimension: 'donnee_visible',
        status: 'verified',
        evidence:
          'La liste des écritures se rend VRAIMENT dans `ActionHistoryTable`, alimentée par `ActionHistoryPage`.',
        file: 'apps/web/src/features/action-history/view/ActionHistoryTable.tsx',
      },
      {
        dimension: 'action_reelle',
        status: 'verified',
        evidence:
          "Le dialogue d'exécution dispatche une VRAIE action CRM/ERP (`ExecuteActionDialog`), derrière la porte d'approbation de la doctrine — pas un bouton mort.",
        file: 'apps/web/src/features/actions/components/ExecuteActionDialog.tsx',
      },
      {
        // #4468 — crédits implicites (Louis 22/10)
        dimension: 'cout',
        status: 'verified',
        evidence:
          "#4468 — crédits implicites (Louis 22/10) : le dialogue d'exécution n'affiche AUCUN chiffre de crédit (le débit continue en coulisse, le solde épuisé se dit par le frein doux #4464). La règle est tenue par la garde `aucun-credit-visible` (le mot « crédit » est refusé dans tout littéral visible) ; le dialogue lui-même est relu par le test de non-régression.",
        file: 'apps/web/src/architecture/aucun-credit-visible.test.ts',
      },
      {
        dimension: 'etat_vide',
        status: 'verified',
        evidence:
          '`ActionHistoryTable` porte `emptyTitle`/`emptySubtitle`, distincts du mode « depuis ma dernière connexion » — jamais un tableau vide sans phrase.',
        file: 'apps/web/src/features/action-history/view/ActionHistoryTable.tsx',
      },
      {
        dimension: 'erreur',
        status: 'gap',
        evidence:
          "Aucune gestion `isError` trouvée dans `ActionHistoryPage.tsx` ni `useActionHistory.ts` : un échec de `GET /actions` n'a pas d'état d'écran DISTINCT du chargement ou du vide, dans ce dépôt.",
        file: null,
      },
      {
        dimension: 'mobile',
        status: 'gap',
        evidence:
          "`e2e/tests/web-mobile/` couvre l'onboarding, pas `/actions` : aucun test ni comportement dédié mobile trouvé pour cette capacité précise.",
        file: null,
      },
      {
        dimension: 'lien_partage',
        status: 'gap',
        evidence:
          "Le mécanisme générique de lien partagé existe pour le produit (`apps/web/src/routes/share/$slug.tsx`), mais aucune preuve qu'une écriture individuelle y soit exposable — inventer le lien serait la donnée fictive que la doctrine interdit.",
        file: null,
      },
      {
        dimension: 'retour_navigateur',
        status: 'gap',
        evidence:
          "Aucun test dédié ne prouve qu'un retour navigateur restaure les filtres de `/actions` (URL-driven mais non vérifié end-to-end pour cette capacité).",
        file: null,
      },
      {
        dimension: 'deep_link',
        status: 'verified',
        evidence: '`/actions/$id` ouvre directement une écriture précise — le deep link existe et est servi.',
        file: 'apps/web/src/routes/actions/$id.tsx',
      },
      {
        dimension: 'audit',
        status: 'verified',
        evidence:
          "`TraceabilityPanel` rend la preuve de conformité de l'action — l'audit n'est pas perdu par la migration.",
        file: 'apps/web/src/features/action-history/view/TraceabilityPanel.tsx',
      },
      {
        dimension: 'notification',
        status: 'gap',
        evidence:
          "`route-migration-registry.ts` déclare `notifications: null` pour l'entrée `ecritures` : aucune notification, message Laura ou e-mail déjà parti ne nomme `/actions/ecritures` dans ce dépôt — à la différence de Veille (`off-nav-screens.ts`) ou Besoins (`sections.test.ts::REACHED_OTHERWISE`), qui ont un texte déjà écrit citant l'ancienne route. Rien à corriger ici : le gap est l'ABSENCE de preuve, pas une preuve d'un texte cassé.",
        file: null,
      },
    ],
  },
  {
    /**
     * #2958.104 (lot R19, 07/10) — « Contacts », deuxième capacité, 2/21.
     *
     * Choisie parce que `ContactContent.tsx` distingue DÉJÀ trois branches
     * d'un dénombrement nul — filtré (`SearchEmptyState`, sa propre action de
     * retrait), erreur (`role="alert"`, jamais confondu avec un vide), vide
     * initial (`ContactsEmpty`, une action RÉELLE) — exactement ce que la
     * condition NO-GO #2958.104 cherche : AUCUNE des deux portes de sortie
     * n'est manquante ici. Pas un correctif : une preuve que le défaut
     * nommé par #2958.104 ne se trouve pas sur CETTE route migrée.
     */
    key: 'contacts_liste',
    sourceIssue: '#2154.9',
    label: 'Contacts — liste',
    routeMigrationKey: 'contacts',
    checks: [
      {
        dimension: 'route_accessible',
        status: 'verified',
        evidence: "`/contacts` rend VRAIMENT l'écran (`ContactsPage`, importé par le fichier de route).",
        file: 'apps/web/src/routes/contacts/index.tsx',
      },
      {
        dimension: 'role_correct',
        status: 'gap',
        evidence:
          "`ROLE_FILTERS` (importé par la route) filtre le POSTE du contact, pas le rôle de l'utilisateur connecté (manager/membre) : aucune preuve trouvée que le contenu de cet écran varie — ou ne varie pas délibérément — selon le rôle, à la différence d'Écritures (`ActionHistoryPage.tsx`, décision explicite en commentaire).",
        file: null,
      },
      {
        dimension: 'donnee_visible',
        status: 'verified',
        evidence: 'La liste des contacts se rend VRAIMENT dans `ContactsTable`, montée par `ContactContent`.',
        file: 'apps/web/src/features/contacts/view/ContactContent.tsx',
      },
      {
        dimension: 'action_reelle',
        status: 'gap',
        evidence:
          "Aucune action PAYANTE dispatchée depuis CET écran (liste) trouvée dans le temps de ce lot — l'enrichissement réel vit à la fiche compte (`ContactsEmptyState`, account-detail), pas ici.",
        file: null,
      },
      {
        dimension: 'cout',
        status: 'gap',
        evidence:
          "Le CTA du vide initial (« Lancer ma première analyse ») renvoie vers `/search`, où le coût s'affiche — rien ne l'annonce SUR cet écran avant le clic, à la différence d'Écritures (`creditCostOf` affiché avant exécution).",
        file: null,
      },
      {
        dimension: 'etat_vide',
        status: 'verified',
        evidence:
          "`ContactContent.tsx` distingue TROIS branches d'un dénombrement nul : filtré (`isFilterActive` → `ContactsStateBox` « aucun résultat », action de retrait du filtre), erreur (branche dédiée, dimension `erreur` ci-dessous), et vide INITIAL (`ContactsEmpty`) — qui porte une action RÉELLE (`actions={<Button onClick={() => navigate({ to: '/search' })}>…`, `ContactsEmpty.tsx`) : jamais un vide qui ne mène nulle part. La condition NO-GO #2958.104 ne se déclenche PAS sur cette route.",
        file: 'apps/web/src/features/contacts/view/ContactContent.tsx',
      },
      {
        dimension: 'erreur',
        status: 'verified',
        evidence:
          'Une 1ʳᵉ page en échec rend une branche DISTINCTE (`role="alert"`, `list.loadErrorTitle`/`list.loadErrorDescription`) — jamais confondue avec « zéro contact » (#3713.8, déjà cité en commentaire du fichier).',
        file: 'apps/web/src/features/contacts/view/ContactContent.tsx',
      },
      {
        dimension: 'mobile',
        status: 'gap',
        evidence: "`e2e/tests/web-mobile/` couvre l'onboarding, pas `/contacts` — même gap qu'Écritures.",
        file: null,
      },
      {
        dimension: 'lien_partage',
        status: 'gap',
        evidence:
          "Aucune preuve qu'un contact individuel soit exposable par le mécanisme générique de lien partagé (`routes/share/$slug.tsx`) — même gap qu'Écritures, pas inventé ici.",
        file: null,
      },
      {
        dimension: 'retour_navigateur',
        status: 'gap',
        evidence: "Aucun test dédié ne prouve qu'un retour navigateur restaure les filtres de `/contacts`.",
        file: null,
      },
      {
        dimension: 'deep_link',
        status: 'verified',
        evidence:
          "`/contacts/$id` ouvre directement une fiche contact — le registre #2154.3 le déclare (`deepLinkTarget: '/contacts/$id'`) et le fichier de route existe VRAIMENT.",
        file: 'apps/web/src/routes/contacts/$id.tsx',
      },
      {
        dimension: 'audit',
        status: 'gap',
        evidence: 'Aucun panneau de traçabilité équivalent à `TraceabilityPanel` (Écritures) trouvé sur cet écran.',
        file: null,
      },
      {
        dimension: 'notification',
        status: 'gap',
        evidence:
          "`route-migration-registry.ts` déclare `notifications: null` pour l'entrée `contacts` : aucune notification, message Laura ou e-mail déjà parti ne nomme `/contacts` dans ce dépôt — même raisonnement qu'Écritures.",
        file: null,
      },
    ],
  },
  {
    /**
     * #2958.104 (lot J04, 09/10) — « Projets — pipe », troisième capacité, 3/21.
     *
     * Choisie parce que `ProjectsPage.tsx` distingue QUATRE branches d'un pipe
     * qui ne montre rien (échec, pipe vide, filtre d'étape, filtres de barre) et
     * que le vide initial porte quatre portes réelles. Pas un correctif : la
     * preuve que le défaut nommé par la condition ne se trouve pas ici.
     */
    key: 'projets_pipe',
    sourceIssue: '#2154.9',
    label: 'Projets — pipe',
    routeMigrationKey: 'projets',
    checks: [
      {
        dimension: 'route_accessible',
        status: 'verified',
        evidence: '`/projects` rend VRAIMENT l\'écran (`ProjectsPage`, derrière `PlanFeatureRoute feature="needs"`).',
        file: 'apps/web/src/routes/projects/index.tsx',
      },
      {
        dimension: 'role_correct',
        status: 'gap',
        evidence:
          "Aucune preuve trouvée dans ce lot que le contenu du pipe varie — ou ne varie pas délibérément — selon le rôle de l'utilisateur connecté ; le filtre « Mes affaires » est un filtre d'usage, pas une règle de rôle.",
        file: null,
      },
      {
        dimension: 'donnee_visible',
        status: 'verified',
        evidence:
          "Le pipe se rend VRAIMENT dans `PipelineBoard` (colonnes d'étapes, cartes), monté par `ProjectsPage`.",
        file: 'apps/web/src/features/projects/view/PipelineBoard.tsx',
      },
      {
        dimension: 'action_reelle',
        status: 'verified',
        evidence:
          "Le vide initial offre `CreateProjectAction` — composant partagé avec la barre d'outils du pipe (même route de création, GA-26) — et l'import CRM : de vraies portes, aucune donnée jouée.",
        file: 'apps/web/src/features/projects/portfolio/view/EmptyStateActions.tsx',
      },
      {
        dimension: 'cout',
        status: 'gap',
        evidence:
          "Aucun coût de crédit n'est annoncé sur le pipe avant une action payante depuis cet écran : la création d'une opportunité n'en débite pas, et le coût d'une analyse s'affiche sur `/search`.",
        file: null,
      },
      {
        dimension: 'etat_vide',
        status: 'verified',
        evidence:
          "`ProjectsPage` distingue QUATRE branches d'un pipe qui ne montre rien : échec de chargement (`emptyState.pipelineErrorTitle`, sans porte volontairement — « réessaie » n'est pas une destination), pipe réellement vide (`emptyState.noProjectTitle`) avec QUATRE portes réelles (découvrir, importer un CRM, `CreateProjectAction`, qualifier une piste), filtre d'étape (`stageFilter.emptyCta` retire le filtre nommé) et filtres de barre (`ClearFiltersAction` efface les sept filtres). La condition NO-GO #2958.104 ne se déclenche PAS sur cette route.",
        file: 'apps/web/src/features/projects/view/ProjectsPage.tsx',
      },
      {
        dimension: 'erreur',
        status: 'verified',
        evidence:
          'Un échec de chargement rend une branche DISTINCTE (`emptyState.pipelineErrorTitle`/`emptyState.errorDescription`) — jamais confondue avec « aucune affaire ».',
        file: 'apps/web/src/features/projects/view/ProjectsPage.tsx',
      },
      {
        dimension: 'mobile',
        status: 'gap',
        evidence:
          "`e2e/tests/web-mobile/` couvre l'onboarding, pas `/projects` : aucun test dédié mobile trouvé pour cette capacité.",
        file: null,
      },
      {
        dimension: 'lien_partage',
        status: 'gap',
        evidence:
          "Aucune preuve qu'une affaire individuelle soit exposable par le mécanisme générique de lien partagé (`routes/share/$slug.tsx`) — pas inventé ici.",
        file: null,
      },
      {
        dimension: 'retour_navigateur',
        status: 'gap',
        evidence: "Aucun test dédié ne prouve qu'un retour navigateur restaure l'étape et les filtres de `/projects`.",
        file: null,
      },
      {
        dimension: 'deep_link',
        status: 'verified',
        evidence:
          "`/projects/$id` ouvre directement une affaire — le registre #2154.3 le déclare (`deepLinkTarget: '/projects/$id'`) et le fichier de route existe VRAIMENT.",
        file: 'apps/web/src/routes/projects/$id.tsx',
      },
      {
        dimension: 'audit',
        status: 'gap',
        evidence: 'Aucun panneau de traçabilité équivalent à `TraceabilityPanel` (Écritures) trouvé sur le pipe.',
        file: null,
      },
      {
        dimension: 'notification',
        status: 'gap',
        evidence:
          "`route-migration-registry.ts` déclare `notifications: null` pour l'entrée `projets` : aucune notification ni message déjà parti ne nomme `/projects` dans ce dépôt — route jamais renommée, même raisonnement qu'Écritures.",
        file: null,
      },
    ],
  },
  {
    key: 'decouvrir',
    sourceIssue: '#2154.9',
    label: 'Découvrir',
    routeMigrationKey: 'decouvrir',
    checks: [
      {
        dimension: 'route_accessible',
        status: 'verified',
        evidence: "`/discover` rend VRAIMENT l'écran (fichier de route importé par le routeur).",
        file: 'apps/web/src/routes/discover/index.tsx',
      },
      {
        dimension: 'role_correct',
        status: 'gap',
        evidence:
          "Aucune preuve trouvée que le contenu de `/discover` varie — ou ne varie pas délibérément — selon le rôle de l'utilisateur connecté : aucune lecture de rôle ni de permission dans l'écran.",
        file: null,
      },
      {
        dimension: 'donnee_visible',
        status: 'verified',
        evidence: 'Les candidats de la découverte se rendent VRAIMENT dans `Discover`, monté par le fichier de route.',
        file: 'apps/web/src/features/discover/view/Discover.tsx',
      },
      {
        dimension: 'action_reelle',
        status: 'verified',
        evidence: "`CandidateActions` offre l'analyse d'un compte candidat : une vraie action, jamais un bouton mort.",
        file: 'apps/web/src/features/discover/view/CandidateActions.tsx',
      },
      {
        // #4468 — crédits implicites (Louis 22/10)
        dimension: 'cout',
        status: 'verified',
        evidence:
          "#4468 — crédits implicites (Louis 22/10) : le bouton d'analyse n'affiche plus de coût (`actions.analyzeCost` retiré) ; aucun chiffre de crédit côté client, tenu par la garde `aucun-credit-visible`.",
        file: 'apps/web/src/architecture/aucun-credit-visible.test.ts',
      },
      {
        dimension: 'etat_vide',
        status: 'gap',
        evidence:
          "Aucune branche d'état vide DISTINCTE n'a été lue pour `/discover` dans ce lot — ni prouvée présente, ni prouvée absente.",
        file: null,
      },
      {
        dimension: 'erreur',
        status: 'verified',
        evidence: '`Discover` lit `isError` : un échec de chargement a sa branche.',
        file: 'apps/web/src/features/discover/view/Discover.tsx',
      },
      {
        dimension: 'mobile',
        status: 'gap',
        evidence:
          "`e2e/tests/web-mobile/` couvre l'onboarding, le plan focus et le parcours 36, pas `/discover` : aucun test dédié mobile trouvé.",
        file: null,
      },
      {
        dimension: 'lien_partage',
        status: 'gap',
        evidence:
          "Aucune preuve qu'un objet de `/discover` soit exposable par le mécanisme générique de lien partagé (`routes/share/$slug.tsx`) — pas inventé ici.",
        file: null,
      },
      {
        dimension: 'retour_navigateur',
        status: 'gap',
        evidence: "Aucun test dédié ne prouve qu'un retour navigateur restaure l'état de `/discover`.",
        file: null,
      },
      {
        dimension: 'deep_link',
        status: 'gap',
        evidence:
          'Le registre #2154.3 déclare `deepLinkTarget: null` pour cette entrée : aucun fichier de route à `$id` trouvé pour son objet canonique.',
        file: null,
      },
      {
        dimension: 'audit',
        status: 'gap',
        evidence: "Aucun panneau de traçabilité ni journal d'audit propre à `/discover` trouvé dans ce lot.",
        file: null,
      },
      {
        dimension: 'notification',
        status: 'gap',
        evidence:
          "Le registre #2154.3 déclare `notifications: null` pour cette entrée : aucune notification ni message déjà parti ne nomme `/discover` dans ce dépôt — l'ABSENCE de preuve, pas la preuve d'un texte cassé.",
        file: null,
      },
    ],
  },
  {
    key: 'veille_cibles',
    sourceIssue: '#2154.9',
    label: 'Veille → Mes cibles',
    routeMigrationKey: 'veille',
    checks: [
      {
        dimension: 'route_accessible',
        status: 'verified',
        evidence:
          "L'ancienne route redirige VRAIMENT vers `/mes-cibles` (table `lib/legacy-addresses.ts`, #4359, vérifiée par `legacy-addresses.test.ts`) ; la destination rend l'écran.",
        file: 'apps/web/src/routes/mes-cibles/index.tsx',
      },
      {
        dimension: 'role_correct',
        status: 'gap',
        evidence:
          "Aucune preuve trouvée que le contenu de `/mes-cibles` varie — ou ne varie pas délibérément — selon le rôle de l'utilisateur connecté : aucune lecture de rôle ni de permission dans l'écran.",
        file: null,
      },
      {
        dimension: 'donnee_visible',
        status: 'verified',
        evidence: 'Les listes de cibles se rendent VRAIMENT dans `TargetListsSection`, montée par `TargetListsPage`.',
        file: 'apps/web/src/features/target-lists/view/TargetListsSection.tsx',
      },
      {
        dimension: 'action_reelle',
        status: 'gap',
        evidence:
          "Aucune action payante ou d'écriture dispatchée depuis `/mes-cibles` n'a été prouvée dans ce lot : l'écran est lu, pas rejoué.",
        file: null,
      },
      {
        dimension: 'cout',
        status: 'gap',
        evidence:
          "Aucun coût de crédit n'est annoncé sur `/mes-cibles` avant une action : aucun `creditCostOf` dans l'écran.",
        file: null,
      },
      {
        dimension: 'etat_vide',
        status: 'verified',
        evidence: '`TargetListsSection` porte un `EmptyState` : jamais une liste muette.',
        file: 'apps/web/src/features/target-lists/view/TargetListsSection.tsx',
      },
      {
        dimension: 'erreur',
        status: 'verified',
        evidence: '`TargetListsSection` lit `isError` et rend `role="alert"` : l\'échec ne se lit pas comme un vide.',
        file: 'apps/web/src/features/target-lists/view/TargetListsSection.tsx',
      },
      {
        dimension: 'mobile',
        status: 'gap',
        evidence:
          "`e2e/tests/web-mobile/` couvre l'onboarding, le plan focus et le parcours 36, pas `/mes-cibles` : aucun test dédié mobile trouvé.",
        file: null,
      },
      {
        dimension: 'lien_partage',
        status: 'gap',
        evidence:
          "Aucune preuve qu'un objet de `/mes-cibles` soit exposable par le mécanisme générique de lien partagé (`routes/share/$slug.tsx`) — pas inventé ici.",
        file: null,
      },
      {
        dimension: 'retour_navigateur',
        status: 'gap',
        evidence: "Aucun test dédié ne prouve qu'un retour navigateur restaure l'état de `/mes-cibles`.",
        file: null,
      },
      {
        dimension: 'deep_link',
        status: 'gap',
        evidence:
          'Le registre #2154.3 déclare `deepLinkTarget: null` pour cette entrée : aucun fichier de route à `$id` trouvé pour son objet canonique.',
        file: null,
      },
      {
        dimension: 'audit',
        status: 'gap',
        evidence: "Aucun panneau de traçabilité ni journal d'audit propre à `/mes-cibles` trouvé dans ce lot.",
        file: null,
      },
      {
        dimension: 'notification',
        status: 'verified',
        evidence:
          'Des notifications et des conversations de Laura déjà écrites nomment `/watchlist` ; la table `lib/legacy-addresses.ts` (`/watchlist` → `/mes-cibles`, `search` ET ancre conservés) garde ces liens justes.',
        file: 'apps/web/src/lib/legacy-addresses.ts',
      },
    ],
  },
  {
    key: 'favoris_comptes',
    sourceIssue: '#2154.9',
    label: 'Favoris → Comptes',
    routeMigrationKey: 'favoris',
    checks: [
      {
        dimension: 'route_accessible',
        status: 'verified',
        evidence:
          "#4359 : l'ancienne adresse `/favorites` n'a plus de route — la page « introuvable » répond (garde `une-adresse-hors-catalogue-montre-introuvable`) ; `/accounts` rend l'écran.",
        file: 'apps/web/src/routes/accounts/index.tsx',
      },
      {
        dimension: 'role_correct',
        status: 'gap',
        evidence:
          "Aucune preuve trouvée que le contenu de `/accounts` varie — ou ne varie pas délibérément — selon le rôle de l'utilisateur connecté : aucune lecture de rôle ni de permission dans l'écran.",
        file: null,
      },
      {
        dimension: 'donnee_visible',
        status: 'verified',
        evidence: 'La liste des comptes se rend VRAIMENT dans `AccountsTable`, montée par `AccountsPage`.',
        file: 'apps/web/src/features/accounts/view/accounts-list/AccountsTable.tsx',
      },
      {
        dimension: 'action_reelle',
        status: 'gap',
        evidence:
          "Aucune action payante ou d'écriture dispatchée depuis `/accounts` n'a été prouvée dans ce lot : l'écran est lu, pas rejoué.",
        file: null,
      },
      {
        dimension: 'cout',
        status: 'gap',
        evidence:
          "Aucun coût de crédit n'est annoncé sur `/accounts` avant une action : aucun `creditCostOf` dans l'écran.",
        file: null,
      },
      {
        dimension: 'etat_vide',
        status: 'gap',
        evidence:
          "Aucune branche d'état vide DISTINCTE n'a été lue pour `/accounts` dans ce lot — ni prouvée présente, ni prouvée absente.",
        file: null,
      },
      {
        dimension: 'erreur',
        status: 'verified',
        evidence: "`AccountsPage` lit `isError` : l'échec de chargement a sa branche.",
        file: 'apps/web/src/features/accounts/view/AccountsPage.tsx',
      },
      {
        dimension: 'mobile',
        status: 'verified',
        evidence: '`AccountsTable` lit `useIsMobile` : une présentation mobile dédiée existe.',
        file: 'apps/web/src/features/accounts/view/accounts-list/AccountsTable.tsx',
      },
      {
        dimension: 'lien_partage',
        status: 'gap',
        evidence:
          "Aucune preuve qu'un objet de `/accounts` soit exposable par le mécanisme générique de lien partagé (`routes/share/$slug.tsx`) — pas inventé ici.",
        file: null,
      },
      {
        dimension: 'retour_navigateur',
        status: 'gap',
        evidence: "Aucun test dédié ne prouve qu'un retour navigateur restaure l'état de `/accounts`.",
        file: null,
      },
      {
        dimension: 'deep_link',
        status: 'verified',
        evidence: '`/accounts/$id` ouvre directement un compte — le fichier de route existe.',
        file: 'apps/web/src/routes/accounts/$id.tsx',
      },
      {
        dimension: 'audit',
        status: 'gap',
        evidence: "Aucun panneau de traçabilité ni journal d'audit propre à `/accounts` trouvé dans ce lot.",
        file: null,
      },
      {
        dimension: 'notification',
        status: 'gap',
        evidence:
          "Le registre #2154.3 déclare `notifications: null` pour cette entrée : aucune notification ni message déjà parti ne nomme `/accounts` dans ce dépôt — l'ABSENCE de preuve, pas la preuve d'un texte cassé.",
        file: null,
      },
    ],
  },
  {
    key: 'partenaires_pipeline',
    sourceIssue: '#2154.9',
    label: 'Partenaires — pipeline',
    routeMigrationKey: 'partenaires',
    checks: [
      {
        dimension: 'route_accessible',
        status: 'verified',
        evidence: "`/accounts/partners` rend VRAIMENT l'écran (fichier de route importé par le routeur).",
        file: 'apps/web/src/routes/accounts/partners.tsx',
      },
      {
        dimension: 'role_correct',
        status: 'gap',
        evidence:
          "Aucune preuve trouvée que le contenu de `/accounts/partners` varie — ou ne varie pas délibérément — selon le rôle de l'utilisateur connecté : aucune lecture de rôle ni de permission dans l'écran.",
        file: null,
      },
      {
        dimension: 'donnee_visible',
        status: 'verified',
        evidence: 'Le pipeline partenaires se rend VRAIMENT dans `PartnerPipeline`, monté par le fichier de route.',
        file: 'apps/web/src/features/partner-pipeline/view/PartnerPipeline.tsx',
      },
      {
        dimension: 'action_reelle',
        status: 'gap',
        evidence:
          "Aucune action payante ou d'écriture dispatchée depuis `/accounts/partners` n'a été prouvée dans ce lot : l'écran est lu, pas rejoué.",
        file: null,
      },
      {
        dimension: 'cout',
        status: 'gap',
        evidence:
          "Aucun coût de crédit n'est annoncé sur `/accounts/partners` avant une action : aucun `creditCostOf` dans l'écran.",
        file: null,
      },
      {
        dimension: 'etat_vide',
        status: 'gap',
        evidence:
          "Aucune branche d'état vide DISTINCTE n'a été lue pour `/accounts/partners` dans ce lot — ni prouvée présente, ni prouvée absente.",
        file: null,
      },
      {
        dimension: 'erreur',
        status: 'verified',
        evidence:
          "`PartnerPipeline` lit `isError` sur la déclaration d'un partenaire (`failed={declare.isError}`) : l'échec d'écriture est dit.",
        file: 'apps/web/src/features/partner-pipeline/view/PartnerPipeline.tsx',
      },
      {
        dimension: 'mobile',
        status: 'gap',
        evidence:
          "`e2e/tests/web-mobile/` couvre l'onboarding, le plan focus et le parcours 36, pas `/accounts/partners` : aucun test dédié mobile trouvé.",
        file: null,
      },
      {
        dimension: 'lien_partage',
        status: 'gap',
        evidence:
          "Aucune preuve qu'un objet de `/accounts/partners` soit exposable par le mécanisme générique de lien partagé (`routes/share/$slug.tsx`) — pas inventé ici.",
        file: null,
      },
      {
        dimension: 'retour_navigateur',
        status: 'gap',
        evidence: "Aucun test dédié ne prouve qu'un retour navigateur restaure l'état de `/accounts/partners`.",
        file: null,
      },
      {
        dimension: 'deep_link',
        status: 'gap',
        evidence:
          'Le registre #2154.3 déclare `deepLinkTarget: null` pour cette entrée : aucun fichier de route à `$id` trouvé pour son objet canonique.',
        file: null,
      },
      {
        dimension: 'audit',
        status: 'gap',
        evidence: "Aucun panneau de traçabilité ni journal d'audit propre à `/accounts/partners` trouvé dans ce lot.",
        file: null,
      },
      {
        dimension: 'notification',
        status: 'gap',
        evidence:
          "Le registre #2154.3 déclare `notifications: null` pour cette entrée : aucune notification ni message déjà parti ne nomme `/accounts/partners` dans ce dépôt — l'ABSENCE de preuve, pas la preuve d'un texte cassé.",
        file: null,
      },
    ],
  },
  {
    key: 'memoire_collective_reglages',
    sourceIssue: '#2154.9',
    label: 'Mémoire collective → Réglages',
    routeMigrationKey: 'memoire_collective',
    checks: [
      {
        dimension: 'route_accessible',
        status: 'verified',
        evidence:
          "L'ancienne route redirige VRAIMENT vers `/settings/knowledge` (table `lib/legacy-addresses.ts`, #4359, vérifiée par `legacy-addresses.test.ts`) ; la destination rend l'écran.",
        file: 'apps/web/src/routes/settings/knowledge.tsx',
      },
      {
        dimension: 'role_correct',
        status: 'gap',
        evidence:
          "Aucune preuve trouvée que le contenu de `/settings/knowledge` varie — ou ne varie pas délibérément — selon le rôle de l'utilisateur connecté : aucune lecture de rôle ni de permission dans l'écran.",
        file: null,
      },
      {
        dimension: 'donnee_visible',
        status: 'verified',
        evidence:
          'Les modèles, playbooks et la méthode se rendent VRAIMENT dans `Knowledge`, monté par le fichier de route.',
        file: 'apps/web/src/features/knowledge/view/Knowledge.tsx',
      },
      {
        dimension: 'action_reelle',
        status: 'gap',
        evidence:
          "Aucune action payante ou d'écriture dispatchée depuis `/settings/knowledge` n'a été prouvée dans ce lot : l'écran est lu, pas rejoué.",
        file: null,
      },
      {
        dimension: 'cout',
        status: 'gap',
        evidence:
          "Aucun coût de crédit n'est annoncé sur `/settings/knowledge` avant une action : aucun `creditCostOf` dans l'écran.",
        file: null,
      },
      {
        dimension: 'etat_vide',
        status: 'gap',
        evidence:
          "Aucune branche d'état vide DISTINCTE n'a été lue pour `/settings/knowledge` dans ce lot — ni prouvée présente, ni prouvée absente.",
        file: null,
      },
      {
        dimension: 'erreur',
        status: 'verified',
        evidence:
          "`Knowledge` lit `isError` sur chaque requête (modèles, playbooks, méthode) : l'échec est transmis à chaque liste.",
        file: 'apps/web/src/features/knowledge/view/Knowledge.tsx',
      },
      {
        dimension: 'mobile',
        status: 'gap',
        evidence:
          "`e2e/tests/web-mobile/` couvre l'onboarding, le plan focus et le parcours 36, pas `/settings/knowledge` : aucun test dédié mobile trouvé.",
        file: null,
      },
      {
        dimension: 'lien_partage',
        status: 'gap',
        evidence:
          "Aucune preuve qu'un objet de `/settings/knowledge` soit exposable par le mécanisme générique de lien partagé (`routes/share/$slug.tsx`) — pas inventé ici.",
        file: null,
      },
      {
        dimension: 'retour_navigateur',
        status: 'gap',
        evidence: "Aucun test dédié ne prouve qu'un retour navigateur restaure l'état de `/settings/knowledge`.",
        file: null,
      },
      {
        dimension: 'deep_link',
        status: 'gap',
        evidence:
          'Le registre #2154.3 déclare `deepLinkTarget: null` pour cette entrée : aucun fichier de route à `$id` trouvé pour son objet canonique.',
        file: null,
      },
      {
        dimension: 'audit',
        status: 'gap',
        evidence: "Aucun panneau de traçabilité ni journal d'audit propre à `/settings/knowledge` trouvé dans ce lot.",
        file: null,
      },
      {
        dimension: 'notification',
        status: 'verified',
        evidence:
          'Le CTA du copilote « Ajouter un document » pointe encore vers `/knowledge` ; la redirection `/knowledge` → `/settings/knowledge` garde ce lien juste.',
        file: 'apps/web/src/lib/legacy-addresses.ts',
      },
    ],
  },
  {
    key: 'besoins_projets',
    sourceIssue: '#2154.9',
    label: 'Besoins → Projets',
    routeMigrationKey: 'besoins',
    checks: [
      {
        dimension: 'route_accessible',
        status: 'verified',
        evidence:
          "L'ancienne route redirige VRAIMENT vers `/projects` (table `lib/legacy-addresses.ts`, #4359, vérifiée par `legacy-addresses.test.ts`) ; la destination rend l'écran.",
        file: 'apps/web/src/routes/projects/index.tsx',
      },
      {
        dimension: 'role_correct',
        status: 'gap',
        evidence:
          "Aucune preuve trouvée que le contenu de `/projects` varie — ou ne varie pas délibérément — selon le rôle de l'utilisateur connecté : aucune lecture de rôle ni de permission dans l'écran.",
        file: null,
      },
      {
        dimension: 'donnee_visible',
        status: 'verified',
        evidence: 'Les besoins ouverts se rendent VRAIMENT dans `OpenNeedsPage`.',
        file: 'apps/web/src/features/projects/open-needs/view/OpenNeedsPage.tsx',
      },
      {
        dimension: 'action_reelle',
        status: 'gap',
        evidence:
          "Aucune action payante ou d'écriture dispatchée depuis `/projects` n'a été prouvée dans ce lot : l'écran est lu, pas rejoué.",
        file: null,
      },
      {
        dimension: 'cout',
        status: 'gap',
        evidence:
          "Aucun coût de crédit n'est annoncé sur `/projects` avant une action : aucun `creditCostOf` dans l'écran.",
        file: null,
      },
      {
        dimension: 'etat_vide',
        status: 'verified',
        evidence: "`OpenNeedsPage` porte des branches d'état vide.",
        file: 'apps/web/src/features/projects/open-needs/view/OpenNeedsPage.tsx',
      },
      {
        dimension: 'erreur',
        status: 'verified',
        evidence: "`OpenNeedsPage` lit `isError` : l'échec de chargement a sa branche.",
        file: 'apps/web/src/features/projects/open-needs/view/OpenNeedsPage.tsx',
      },
      {
        dimension: 'mobile',
        status: 'gap',
        evidence:
          "`e2e/tests/web-mobile/` couvre l'onboarding, le plan focus et le parcours 36, pas `/projects` : aucun test dédié mobile trouvé.",
        file: null,
      },
      {
        dimension: 'lien_partage',
        status: 'gap',
        evidence:
          "Aucune preuve qu'un objet de `/projects` soit exposable par le mécanisme générique de lien partagé (`routes/share/$slug.tsx`) — pas inventé ici.",
        file: null,
      },
      {
        dimension: 'retour_navigateur',
        status: 'gap',
        evidence: "Aucun test dédié ne prouve qu'un retour navigateur restaure l'état de `/projects`.",
        file: null,
      },
      {
        dimension: 'deep_link',
        status: 'verified',
        evidence:
          "`/projects/$id` ouvre directement un besoin — le registre le déclare (`deepLinkTarget: '/projects/$id'`) et le fichier existe.",
        file: 'apps/web/src/routes/projects/$id.tsx',
      },
      {
        dimension: 'audit',
        status: 'gap',
        evidence: "Aucun panneau de traçabilité ni journal d'audit propre à `/projects` trouvé dans ce lot.",
        file: null,
      },
      {
        dimension: 'notification',
        status: 'verified',
        evidence:
          'Des notifications déjà parties nomment `/needs` (`sections.test.ts::REACHED_OTHERWISE`) ; la redirection `/needs` → `/projects` garde ces liens justes.',
        file: 'apps/web/src/lib/legacy-addresses.ts',
      },
    ],
  },
  {
    key: 'appels_offres',
    sourceIssue: '#2154.9',
    label: "Appels d'offres",
    routeMigrationKey: 'appels_offres',
    checks: [
      {
        dimension: 'route_accessible',
        status: 'verified',
        // #4341 (Louis 19/10/2026) — `/rfp` redirige vers `/projects?lens=rfp` ; c'est ce fichier de route qui monte l'espace.
        evidence:
          "`/rfp` redirige vers `/projects?lens=rfp` (#4341) ; le fichier de route `/projects` monte VRAIMENT l'espace des appels d'offres (`RfpWorkspace`).",
        file: 'apps/web/src/routes/projects/index.tsx',
      },
      {
        dimension: 'role_correct',
        status: 'gap',
        evidence:
          "Aucune preuve trouvée que le contenu de `/rfp` varie — ou ne varie pas délibérément — selon le rôle de l'utilisateur connecté : aucune lecture de rôle ni de permission dans l'écran.",
        file: null,
      },
      {
        dimension: 'donnee_visible',
        status: 'verified',
        evidence:
          "Les sessions d'appel d'offres se rendent VRAIMENT dans `RfpWorkspace`, monté par le pipe sous `?lens=rfp` (#4341).",
        file: 'apps/web/src/features/rfp/view/RfpWorkspace.tsx',
      },
      {
        dimension: 'action_reelle',
        status: 'verified',
        evidence:
          '`RfpWorkspace` enchaîne un aperçu (`previewMutation`) puis une confirmation (`confirmMutation`) : une vraie écriture derrière une étape de validation.',
        file: 'apps/web/src/features/rfp/view/RfpWorkspace.tsx',
      },
      {
        dimension: 'cout',
        status: 'gap',
        evidence: "Aucun coût de crédit n'est annoncé sur `/rfp` avant une action : aucun `creditCostOf` dans l'écran.",
        file: null,
      },
      {
        dimension: 'etat_vide',
        status: 'verified',
        evidence: '`RfpWorkspace` porte un `EmptyState`.',
        file: 'apps/web/src/features/rfp/view/RfpWorkspace.tsx',
      },
      {
        dimension: 'erreur',
        status: 'gap',
        evidence:
          "Aucune gestion d'échec de chargement n'a été lue pour `/rfp` dans ce lot : un échec n'est pas prouvé distinct du vide.",
        file: null,
      },
      {
        dimension: 'mobile',
        status: 'gap',
        evidence:
          "`e2e/tests/web-mobile/` couvre l'onboarding, le plan focus et le parcours 36, pas `/rfp` : aucun test dédié mobile trouvé.",
        file: null,
      },
      {
        dimension: 'lien_partage',
        status: 'gap',
        evidence:
          "Aucune preuve qu'un objet de `/rfp` soit exposable par le mécanisme générique de lien partagé (`routes/share/$slug.tsx`) — pas inventé ici.",
        file: null,
      },
      {
        dimension: 'retour_navigateur',
        status: 'gap',
        evidence: "Aucun test dédié ne prouve qu'un retour navigateur restaure l'état de `/rfp`.",
        file: null,
      },
      {
        dimension: 'deep_link',
        status: 'gap',
        evidence:
          'Le registre #2154.3 déclare `deepLinkTarget: null` pour cette entrée : aucun fichier de route à `$id` trouvé pour son objet canonique.',
        file: null,
      },
      {
        dimension: 'audit',
        status: 'gap',
        evidence: "Aucun panneau de traçabilité ni journal d'audit propre à `/rfp` trouvé dans ce lot.",
        file: null,
      },
      {
        dimension: 'notification',
        status: 'gap',
        evidence:
          "Le registre #2154.3 déclare `notifications: null` pour cette entrée : aucune notification ni message déjà parti ne nomme `/rfp` dans ce dépôt — l'ABSENCE de preuve, pas la preuve d'un texte cassé.",
        file: null,
      },
    ],
  },
  {
    key: 'positionnements',
    sourceIssue: '#2154.9',
    label: 'Positionnements',
    routeMigrationKey: 'positionnements',
    checks: [
      {
        dimension: 'route_accessible',
        status: 'verified',
        // #4349 (Louis 19/10/2026) — `/consultants/submissions` redirige vers la section du Vivier.
        evidence:
          "#4349 / #4359 : `/consultants/submissions` n'a plus de route ; le fichier de route du Vivier monte VRAIMENT la section « Positionnements ».",
        file: 'apps/web/src/routes/consultants/index.tsx',
      },
      {
        dimension: 'role_correct',
        status: 'gap',
        evidence:
          "Aucune preuve trouvée que le contenu de `/consultants/submissions` varie — ou ne varie pas délibérément — selon le rôle de l'utilisateur connecté : aucune lecture de rôle ni de permission dans l'écran.",
        file: null,
      },
      {
        dimension: 'donnee_visible',
        status: 'verified',
        evidence:
          'Les présentations se rendent VRAIMENT dans `PresentationsPage` (Affaires › Présentations, #4528 : plus de section dans Talents).',
        file: 'apps/web/src/features/submissions/view/PresentationsPage.tsx',
      },
      {
        dimension: 'action_reelle',
        status: 'gap',
        evidence:
          "Aucune action payante ou d'écriture dispatchée depuis `/consultants/submissions` n'a été prouvée dans ce lot : l'écran est lu, pas rejoué.",
        file: null,
      },
      {
        dimension: 'cout',
        status: 'gap',
        evidence:
          "Aucun coût de crédit n'est annoncé sur `/consultants/submissions` avant une action : aucun `creditCostOf` dans l'écran.",
        file: null,
      },
      {
        dimension: 'etat_vide',
        status: 'verified',
        evidence:
          '`PresentationsPage` porte les deux vides (`SearchEmptyState`) : rien du tout, et un filtre sans résultat.',
        file: 'apps/web/src/features/submissions/view/PresentationsPage.tsx',
      },
      {
        dimension: 'erreur',
        status: 'verified',
        evidence: "`PresentationsPage` lit `isError` : l'échec de chargement a sa branche.",
        file: 'apps/web/src/features/submissions/view/PresentationsPage.tsx',
      },
      {
        dimension: 'mobile',
        status: 'gap',
        evidence:
          "`e2e/tests/web-mobile/` couvre l'onboarding, le plan focus et le parcours 36, pas `/consultants/submissions` : aucun test dédié mobile trouvé.",
        file: null,
      },
      {
        dimension: 'lien_partage',
        status: 'gap',
        evidence:
          "Aucune preuve qu'un objet de `/consultants/submissions` soit exposable par le mécanisme générique de lien partagé (`routes/share/$slug.tsx`) — pas inventé ici.",
        file: null,
      },
      {
        dimension: 'retour_navigateur',
        status: 'gap',
        evidence: "Aucun test dédié ne prouve qu'un retour navigateur restaure l'état de `/consultants/submissions`.",
        file: null,
      },
      {
        dimension: 'deep_link',
        status: 'gap',
        evidence:
          'Le registre #2154.3 déclare `deepLinkTarget: null` pour cette entrée : aucun fichier de route à `$id` trouvé pour son objet canonique.',
        file: null,
      },
      {
        dimension: 'audit',
        status: 'gap',
        evidence:
          "Aucun panneau de traçabilité ni journal d'audit propre à `/consultants/submissions` trouvé dans ce lot.",
        file: null,
      },
      {
        dimension: 'notification',
        status: 'gap',
        evidence:
          "Le registre #2154.3 déclare `notifications: null` pour cette entrée : aucune notification ni message déjà parti ne nomme `/consultants/submissions` dans ce dépôt — l'ABSENCE de preuve, pas la preuve d'un texte cassé.",
        file: null,
      },
    ],
  },
  {
    key: 'reactivation_vivier',
    sourceIssue: '#2154.9',
    label: 'Réactivation → Vivier',
    routeMigrationKey: 'reactivation',
    checks: [
      {
        dimension: 'route_accessible',
        status: 'verified',
        evidence:
          "L'ancienne route redirige VRAIMENT vers `/consultants` (table `lib/legacy-addresses.ts`, #4359, vérifiée par `legacy-addresses.test.ts`) ; la destination rend l'écran.",
        file: 'apps/web/src/routes/consultants/index.tsx',
      },
      {
        dimension: 'role_correct',
        status: 'gap',
        evidence:
          "Aucune preuve trouvée que le contenu de `/consultants` varie — ou ne varie pas délibérément — selon le rôle de l'utilisateur connecté : aucune lecture de rôle ni de permission dans l'écran.",
        file: null,
      },
      {
        dimension: 'donnee_visible',
        status: 'verified',
        evidence: 'Le vivier se rend VRAIMENT dans `VivierTable`, monté par `ConsultantsPage`.',
        file: 'apps/web/src/features/consultants/view/VivierTable.tsx',
      },
      {
        dimension: 'action_reelle',
        status: 'gap',
        evidence:
          "Aucune action payante ou d'écriture dispatchée depuis `/consultants` n'a été prouvée dans ce lot : l'écran est lu, pas rejoué.",
        file: null,
      },
      {
        dimension: 'cout',
        status: 'gap',
        evidence:
          "Aucun coût de crédit n'est annoncé sur `/consultants` avant une action : aucun `creditCostOf` dans l'écran.",
        file: null,
      },
      {
        dimension: 'etat_vide',
        status: 'verified',
        evidence: '`ConsultantsPage` porte un `EmptyState`.',
        file: 'apps/web/src/features/consultants/view/ConsultantsPage.tsx',
      },
      {
        dimension: 'erreur',
        status: 'verified',
        evidence: '`ConsultantsPage` rend une branche `role="alert"` sur échec de chargement.',
        file: 'apps/web/src/features/consultants/view/ConsultantsPage.tsx',
      },
      {
        dimension: 'mobile',
        status: 'verified',
        evidence: '`VivierTable` lit `useIsMobile` : une présentation mobile dédiée existe.',
        file: 'apps/web/src/features/consultants/view/VivierTable.tsx',
      },
      {
        dimension: 'lien_partage',
        status: 'gap',
        evidence:
          "Aucune preuve qu'un objet de `/consultants` soit exposable par le mécanisme générique de lien partagé (`routes/share/$slug.tsx`) — pas inventé ici.",
        file: null,
      },
      {
        dimension: 'retour_navigateur',
        status: 'gap',
        evidence: "Aucun test dédié ne prouve qu'un retour navigateur restaure l'état de `/consultants`.",
        file: null,
      },
      {
        dimension: 'deep_link',
        status: 'gap',
        evidence:
          'Le registre #2154.3 déclare `deepLinkTarget: null` pour cette entrée : aucun fichier de route à `$id` trouvé pour son objet canonique.',
        file: null,
      },
      {
        dimension: 'audit',
        status: 'gap',
        evidence: "Aucun panneau de traçabilité ni journal d'audit propre à `/consultants` trouvé dans ce lot.",
        file: null,
      },
      {
        dimension: 'notification',
        status: 'gap',
        evidence:
          "Le registre #2154.3 déclare `notifications: null` pour cette entrée : aucune notification ni message déjà parti ne nomme `/consultants` dans ce dépôt — l'ABSENCE de preuve, pas la preuve d'un texte cassé.",
        file: null,
      },
    ],
  },
  {
    key: 'chaines_parcours',
    sourceIssue: '#2154.9',
    label: 'Chaînes → Parcours',
    routeMigrationKey: 'chaines',
    checks: [
      {
        dimension: 'route_accessible',
        status: 'verified',
        evidence:
          "#4359 : les anciennes adresses `/actions/chaines` et `/pilotage/parcours` n'ont plus de route — la page « introuvable » répond ; `/pilotage/pipe#parcours` rend l'écran.",
        file: 'apps/web/src/routes/pilotage/pipe.tsx',
      },
      {
        dimension: 'role_correct',
        status: 'gap',
        evidence:
          "Aucune preuve trouvée que le contenu de `/pilotage/pipe` varie — ou ne varie pas délibérément — selon le rôle de l'utilisateur connecté : aucune lecture de rôle ni de permission dans l'écran.",
        file: null,
      },
      {
        dimension: 'donnee_visible',
        status: 'verified',
        evidence: "Les parcours se rendent VRAIMENT dans `ChainsPage`, sous l'ancre `parcours`.",
        file: 'apps/web/src/features/chains/view/ChainsPage.tsx',
      },
      {
        dimension: 'action_reelle',
        status: 'gap',
        evidence:
          "Aucune action payante ou d'écriture dispatchée depuis `/pilotage/pipe` n'a été prouvée dans ce lot : l'écran est lu, pas rejoué.",
        file: null,
      },
      {
        dimension: 'cout',
        status: 'gap',
        evidence:
          "Aucun coût de crédit n'est annoncé sur `/pilotage/pipe` avant une action : aucun `creditCostOf` dans l'écran.",
        file: null,
      },
      {
        dimension: 'etat_vide',
        status: 'verified',
        evidence: '`ChainsPage` porte un `EmptyState`.',
        file: 'apps/web/src/features/chains/view/ChainsPage.tsx',
      },
      {
        dimension: 'erreur',
        status: 'verified',
        evidence: "`ChainsPage` lit `isError` : l'échec de chargement a sa branche.",
        file: 'apps/web/src/features/chains/view/ChainsPage.tsx',
      },
      {
        dimension: 'mobile',
        status: 'gap',
        evidence:
          "`e2e/tests/web-mobile/` couvre l'onboarding, le plan focus et le parcours 36, pas `/pilotage/pipe` : aucun test dédié mobile trouvé.",
        file: null,
      },
      {
        dimension: 'lien_partage',
        status: 'gap',
        evidence:
          "Aucune preuve qu'un objet de `/pilotage/pipe` soit exposable par le mécanisme générique de lien partagé (`routes/share/$slug.tsx`) — pas inventé ici.",
        file: null,
      },
      {
        dimension: 'retour_navigateur',
        status: 'gap',
        evidence: "Aucun test dédié ne prouve qu'un retour navigateur restaure l'état de `/pilotage/pipe`.",
        file: null,
      },
      {
        dimension: 'deep_link',
        status: 'gap',
        evidence:
          'Le registre #2154.3 déclare `deepLinkTarget: null` pour cette entrée : aucun fichier de route à `$id` trouvé pour son objet canonique.',
        file: null,
      },
      {
        dimension: 'audit',
        status: 'gap',
        evidence: "Aucun panneau de traçabilité ni journal d'audit propre à `/pilotage/pipe` trouvé dans ce lot.",
        file: null,
      },
      {
        dimension: 'notification',
        status: 'gap',
        evidence:
          "Le registre #2154.3 déclare `notifications: null` pour cette entrée : aucune notification ni message déjà parti ne nomme `/pilotage/pipe` dans ce dépôt — l'ABSENCE de preuve, pas la preuve d'un texte cassé.",
        file: null,
      },
    ],
  },
  {
    key: 'missions',
    sourceIssue: '#2154.9',
    label: 'Missions',
    routeMigrationKey: 'missions_anciennes_sous_pages',
    checks: [
      {
        dimension: 'route_accessible',
        status: 'verified',
        evidence: "`/missions` rend VRAIMENT l'écran (fichier de route importé par le routeur).",
        file: 'apps/web/src/routes/missions/index.tsx',
      },
      {
        dimension: 'role_correct',
        status: 'gap',
        evidence:
          "Aucune preuve trouvée que le contenu de `/missions` varie — ou ne varie pas délibérément — selon le rôle de l'utilisateur connecté : aucune lecture de rôle ni de permission dans l'écran.",
        file: null,
      },
      {
        dimension: 'donnee_visible',
        status: 'verified',
        evidence: 'La liste des missions se rend VRAIMENT dans `MissionsPage`, importé par le fichier de route.',
        file: 'apps/web/src/features/missions/view/MissionsPage.tsx',
      },
      {
        dimension: 'action_reelle',
        status: 'gap',
        evidence:
          "Aucune action payante ou d'écriture dispatchée depuis `/missions` n'a été prouvée dans ce lot : l'écran est lu, pas rejoué.",
        file: null,
      },
      {
        dimension: 'cout',
        status: 'gap',
        evidence:
          "Aucun coût de crédit n'est annoncé sur `/missions` avant une action : aucun `creditCostOf` dans l'écran.",
        file: null,
      },
      {
        dimension: 'etat_vide',
        status: 'verified',
        evidence: "`MissionsPage` porte sept branches d'état vide (`EmptyState`).",
        file: 'apps/web/src/features/missions/view/MissionsPage.tsx',
      },
      {
        dimension: 'erreur',
        status: 'verified',
        evidence: "`MissionsPage` lit `isError` sur chacune de ses vues : l'échec ne se lit pas comme un vide.",
        file: 'apps/web/src/features/missions/view/MissionsPage.tsx',
      },
      {
        dimension: 'mobile',
        status: 'verified',
        evidence: '`MissionsPage` lit `useIsMobile` : une présentation mobile dédiée existe.',
        file: 'apps/web/src/features/missions/view/MissionsPage.tsx',
      },
      {
        dimension: 'lien_partage',
        status: 'gap',
        evidence:
          "Aucune preuve qu'un objet de `/missions` soit exposable par le mécanisme générique de lien partagé (`routes/share/$slug.tsx`) — pas inventé ici.",
        file: null,
      },
      {
        dimension: 'retour_navigateur',
        status: 'gap',
        evidence: "Aucun test dédié ne prouve qu'un retour navigateur restaure l'état de `/missions`.",
        file: null,
      },
      {
        dimension: 'deep_link',
        status: 'verified',
        evidence: '`/missions/$id` ouvre directement une mission — le registre le déclare et le fichier existe.',
        file: 'apps/web/src/routes/missions/$id.tsx',
      },
      {
        dimension: 'audit',
        status: 'gap',
        evidence: "Aucun panneau de traçabilité ni journal d'audit propre à `/missions` trouvé dans ce lot.",
        file: null,
      },
      {
        dimension: 'notification',
        status: 'gap',
        evidence:
          "Le registre #2154.3 déclare `notifications: null` pour cette entrée : aucune notification ni message déjà parti ne nomme `/missions` dans ce dépôt — l'ABSENCE de preuve, pas la preuve d'un texte cassé.",
        file: null,
      },
    ],
  },
  {
    key: 'pilotage',
    sourceIssue: '#2154.9',
    label: 'Pilotage',
    routeMigrationKey: 'pilotage_anciennes_pages',
    checks: [
      {
        dimension: 'route_accessible',
        status: 'verified',
        evidence: "`/pilotage` rend VRAIMENT l'écran (fichier de route importé par le routeur).",
        file: 'apps/web/src/routes/pilotage/index.tsx',
      },
      {
        dimension: 'role_correct',
        status: 'verified',
        evidence:
          "La page Pilotage vérifie la permission `team:manage` et le palier `manager_cockpit` avant de rendre chaque section d'équipe (Cockpit, Staffing, Finance) : le rôle est lu, pas supposé.",
        file: 'apps/web/src/features/pilotage/view/PilotagePage.tsx',
      },
      {
        dimension: 'donnee_visible',
        status: 'verified',
        evidence:
          'Le cockpit (décisions, chaîne, détail) se rend VRAIMENT dans `CockpitBody`, section de `PilotagePage`.',
        file: 'apps/web/src/features/pilotage/view/CockpitBody.tsx',
      },
      {
        dimension: 'action_reelle',
        status: 'gap',
        evidence:
          "Aucune action payante ou d'écriture dispatchée depuis `/pilotage` n'a été prouvée dans ce lot : l'écran est lu, pas rejoué.",
        file: null,
      },
      {
        dimension: 'cout',
        status: 'gap',
        evidence:
          "Aucun coût de crédit n'est annoncé sur `/pilotage` avant une action : aucun `creditCostOf` dans l'écran.",
        file: null,
      },
      {
        dimension: 'etat_vide',
        status: 'gap',
        evidence:
          "Aucune branche d'état vide DISTINCTE n'a été lue pour `/pilotage` dans ce lot — ni prouvée présente, ni prouvée absente.",
        file: null,
      },
      {
        dimension: 'erreur',
        status: 'verified',
        evidence: "`CockpitBody` lit `isError` : l'échec de chargement a sa branche.",
        file: 'apps/web/src/features/pilotage/view/CockpitBody.tsx',
      },
      {
        dimension: 'mobile',
        status: 'gap',
        evidence:
          "`e2e/tests/web-mobile/` couvre l'onboarding, le plan focus et le parcours 36, pas `/pilotage` : aucun test dédié mobile trouvé.",
        file: null,
      },
      {
        dimension: 'lien_partage',
        status: 'gap',
        evidence:
          "Aucune preuve qu'un objet de `/pilotage` soit exposable par le mécanisme générique de lien partagé (`routes/share/$slug.tsx`) — pas inventé ici.",
        file: null,
      },
      {
        dimension: 'retour_navigateur',
        status: 'gap',
        evidence: "Aucun test dédié ne prouve qu'un retour navigateur restaure l'état de `/pilotage`.",
        file: null,
      },
      {
        dimension: 'deep_link',
        status: 'gap',
        evidence:
          'Le registre #2154.3 déclare `deepLinkTarget: null` pour cette entrée : aucun fichier de route à `$id` trouvé pour son objet canonique.',
        file: null,
      },
      {
        dimension: 'audit',
        status: 'gap',
        evidence: "Aucun panneau de traçabilité ni journal d'audit propre à `/pilotage` trouvé dans ce lot.",
        file: null,
      },
      {
        dimension: 'notification',
        status: 'gap',
        evidence:
          "Le registre #2154.3 déclare `notifications: null` pour cette entrée : aucune notification ni message déjà parti ne nomme `/pilotage` dans ce dépôt — l'ABSENCE de preuve, pas la preuve d'un texte cassé.",
        file: null,
      },
    ],
  },
]

export function nonRegressionCoverage(capacityKey: NonRegressionCapacityKey): { verified: number; total: number } {
  const capacity = NONREGRESSION_CAPACITIES.find(entry => entry.key === capacityKey)
  if (!capacity) throw new Error(`route-migration-nonregression: capacité inconnue — ${capacityKey}`)
  return {
    verified: capacity.checks.filter(check => check.status === 'verified').length,
    total: capacity.checks.length,
  }
}
