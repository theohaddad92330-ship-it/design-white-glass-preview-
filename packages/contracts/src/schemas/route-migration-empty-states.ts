import { ROUTE_MIGRATION_KEYS, type RouteMigrationKey } from './route-migration-registry.js'

/**
 * #2958.104 (lot M12, 09/10) — « une page migrée est vide sans porte de sortie »,
 * vérifié sur LES VINGT ET UNE routes du registre #2154.3/#2208.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN REGISTRE À PART, PAS DIX-HUIT CAPACITÉS DE PLUS
 * ─────────────────────────────────────────────────────────────────────────
 * `route-migration-nonregression.ts` porte TREIZE dimensions par capacité ;
 * trois capacités y sont décrites (Écritures, Contacts, Projets). Ajouter dix-
 * huit capacités pour ne remplir qu'UNE dimension (`etat_vide`) laisserait
 * 216 cases `gap` écrites à main levée — la brochure que ce fichier-là refuse.
 * La condition NO-GO ne lit qu'une question : « chaque page migrée a-t-elle,
 * quand elle ne montre rien, une porte de sortie ? ». Ce registre y répond
 * pour les vingt et une routes, et rien d'autre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI TIENT LE REGISTRE
 * ─────────────────────────────────────────────────────────────────────────
 * Chaque entrée nomme le FICHIER d'écran et des MARQUEURS — des extraits de
 * code littéraux (la branche vide ET le geste qui en sort). La garde
 * `apps/web/src/architecture/une-page-migree-vide-a-une-porte-de-sortie.test.ts`
 * RELIT chaque fichier et échoue si un marqueur manque : retirer la porte
 * d'un écran casse la CI, pas seulement une relecture humaine.
 *
 * `door` : la branche vide existe et une porte réelle (lien, bouton, retrait
 * de filtre) est rendue avec elle. `not_a_list` : l'écran ne rend aucune
 * collection qui puisse être vide (un formulaire de préférences) — la garde
 * vérifie alors qu'AUCUN `.length === 0` n'y est apparu depuis ; le jour où
 * l'écran gagne une liste, il doit être reclassé en `door`.
 */

interface RouteEmptyStateProof {
  /** Chemin depuis la racine du dépôt. */
  file: string
  /** Extraits littéraux que le fichier DOIT contenir. */
  markers: readonly string[]
}

interface RouteEmptyStateEntry {
  routeMigrationKey: RouteMigrationKey
  /** L'écran réellement rendu (la DESTINATION quand l'ancienne route redirige). */
  screen: string
  status: 'door' | 'not_a_list'
  /** Ce que voit l'utilisateur quand rien ne s'affiche, et par où il sort. */
  evidence: string
  proofs: readonly RouteEmptyStateProof[]
}

/** Le motif interdit dans un écran classé `not_a_list`. */
const NOT_A_LIST_FORBIDDEN_MARKER = '.length === 0'

const WEB = 'apps/web/src/features'

export const ROUTE_EMPTY_STATES: readonly RouteEmptyStateEntry[] = [
  {
    routeMigrationKey: 'contacts',
    screen: '/contacts',
    status: 'door',
    evidence:
      'Vide filtré (`SearchEmptyState`, retrait des filtres) distinct du vide initial (`ContactsEmpty`, « Lancer ma première analyse » vers /search).',
    proofs: [
      {
        file: `${WEB}/contacts/view/ContactContent.tsx`,
        markers: ['onClick={handleResetSearchAndFilters}', '<ContactsEmpty />'],
      },
      {
        file: `${WEB}/contacts/view/contacts-list/ContactsEmpty.tsx`,
        markers: ["onClick={() => navigate({ to: '/search' })}"],
      },
    ],
  },
  {
    routeMigrationKey: 'decouvrir',
    screen: '/discover',
    status: 'door',
    evidence:
      '« Aucune entreprise ne correspond » propose d’élargir la recherche ou de passer aux signaux (`DiscoverEmpty`).',
    proofs: [
      {
        file: `${WEB}/discover/view/Discover.tsx`,
        // #4317 (lot DEC, 19/10) — `<DiscoverEmpty>` porte aussi `skills` : la porte se lit prop par prop.
        markers: ['<DiscoverEmpty', 'onWiden={widenSearch}', 'onSwitchToSignals={enableSignals}'],
      },
      {
        file: `${WEB}/discover/view/DiscoverStates.tsx`,
        markers: ['<SecondaryButton onClick={onWiden}>', '<SecondaryButton onClick={onSwitchToSignals}>'],
      },
    ],
  },
  {
    routeMigrationKey: 'veille',
    screen: '/mes-cibles',
    status: 'door',
    evidence:
      'Aucun signal et aucun filtre : l’état « jamais rempli » ouvre Découvrir (la porte vers les comptes à analyser) ; filtré à vide, le geste « effacer les filtres » ramène la liste. (#4088.8 : les listes de cibles ont quitté cet écran.)',
    proofs: [
      {
        file: `${WEB}/watchlist/view/WatchlistBoard.tsx`,
        markers: [
          'state="empty_never"',
          "action={{ label: t('emptyState.discoverAction'), to: '/discover' }}",
          "action={{ label: t('emptyState.clearFilters'), onClick: onClearFilters }}",
        ],
      },
    ],
  },
  {
    routeMigrationKey: 'favoris',
    screen: '/accounts',
    status: 'door',
    evidence:
      'Vide initial (`AccountsEmpty` → /chat, #3905), filtre nommé qui se retire seul, filtres qui se réinitialisent, société absente proposée à l’analyse.',
    proofs: [
      {
        file: `${WEB}/accounts/view/AccountContent.tsx`,
        markers: ['<AccountsEmpty />', "{t('emptyFiltered.removeFilter')}", "{t('emptyFiltered.resetFilters')}"],
      },
      {
        file: `${WEB}/accounts/view/accounts-list/AccountsEmpty.tsx`,
        markers: ["navigate({ to: '/chat', search: { prompt: t('emptyState.chatPrompt') } })"],
      },
    ],
  },
  {
    routeMigrationKey: 'partenaires',
    screen: '/accounts/partners',
    status: 'door',
    evidence:
      '« Aucun partenaire » sous le bouton « Ajouter » ; une liste vidée par le bandeau le dit (`band.emptyFiltered`).',
    proofs: [
      {
        file: `${WEB}/partner-pipeline/view/PartnerPipeline.tsx`,
        markers: ['onClick={() => setAdding(true)}', "{t('mine.empty')}", "{t('band.emptyFiltered')}"],
      },
    ],
  },
  {
    routeMigrationKey: 'memoire_collective',
    screen: '/settings/knowledge',
    status: 'door',
    evidence: 'Aucun document : le vide porte son geste d’ajout (`documents.emptyCta` ouvre le formulaire de dépôt).',
    proofs: [
      {
        file: `${WEB}/knowledge/view/Knowledge.tsx`,
        markers: ["{t('documents.emptyTitle')}", 'onClick={() => openNewUploadForm()}', "{t('documents.emptyCta')}"],
      },
    ],
  },
  {
    routeMigrationKey: 'besoins',
    screen: '/projects',
    status: 'door',
    evidence:
      '/needs redirige vers le pipe des affaires : même écran que `projets` — pipe vide à quatre portes, filtres qui se retirent.',
    proofs: [
      {
        file: `${WEB}/projects/view/ProjectsPage.tsx`,
        markers: ["title={t('emptyState.noProjectTitle')}", '<CreateProjectAction />', "{t('stageFilter.emptyCta')}"],
      },
    ],
  },
  {
    routeMigrationKey: 'appels_offres',
    screen: '/projects', // #4359 — l'espace des appels d'offres est une lentille du pipe (`?lens=rfp`)
    status: 'door',
    evidence:
      'Aucun AO : l’import est rendu au-dessus de la liste et le vide le nomme (« importer un premier AO ou masquer cette section ») ; une vue vide garde ses onglets.',
    proofs: [
      {
        file: `${WEB}/rfp/view/RfpWorkspace.tsx`,
        markers: [
          '<RfpImportFlow onImported={onImported} />',
          'if (rfps.length === 0) return <RfpEmptyState />',
          "<EmptyPanel text={t('list.emptyView')} />",
        ],
      },
    ],
  },
  {
    routeMigrationKey: 'positionnements',
    screen: '/projects/presentations', // #4528 (Louis 24/10/2026) — Affaires › Présentations, plus de section dans Talents
    status: 'door',
    // #4528 — Affaires › Présentations (ex-onglet de Talents, #4502) : « Ajouter une présentation » (fenêtre de la page) quand il n'y a
    // rien ; un filtre sans résultat se retire d'un clic (« Tous les états »), jamais « créer ».
    evidence:
      'Aucune présentation : « Ajouter une présentation » ; une recherche ou un état sans résultat se retire d’un clic.',
    proofs: [
      {
        file: `${WEB}/submissions/view/PresentationsPage.tsx`,
        markers: ["{t('presentations.add.cta')}", "{t('presentations.filter.all')}"],
      },
    ],
  },
  {
    routeMigrationKey: 'reactivation',
    // #3962 — la vue est retirée du Vivier et son composant supprimé : l'ancienne URL est réécrite vers le vivier (porte = la table des anciennes adresses, #4359).
    screen: '/consultants',
    status: 'door',
    evidence:
      "L'ancienne URL `/consultants/pool` ne montre rien : la table `lib/legacy-addresses.ts` la mène au vivier et à sa porte d'ajout.",
    proofs: [
      {
        file: 'apps/web/src/lib/legacy-addresses.ts',
        markers: ["'/consultants/pool': '/consultants'"],
      },
    ],
  },
  {
    routeMigrationKey: 'chaines',
    screen: '/pilotage/pipe',
    status: 'door',
    evidence:
      '« Aucun dossier ne se place encore dans un parcours » porte désormais son lien vers le pipe des affaires (#2958.104, lot M12) ; « rien ne bloque » garde les pastilles de portée juste au-dessus.',
    proofs: [
      {
        file: `${WEB}/chains/view/ChainsPage.tsx`,
        markers: [
          "{t('states.nothingTracked')}",
          '<Link to="/projects">{t(\'states.nothingTrackedCta\')}</Link>',
          '<FilterChips',
        ],
      },
    ],
  },
  {
    routeMigrationKey: 'ecritures',
    screen: '/actions',
    status: 'door',
    evidence:
      'La file « Aujourd’hui » vide dit pourquoi et offre « Ouvrir mes séquences » ; le journal vide (dans l’historique) garde sa barre de filtres, qui s’efface d’un geste (`onClear`), sous le Centre d’actions.',
    proofs: [
      {
        file: `${WEB}/today/TodayPage.tsx`,
        markers: ["title={t('today.empty.title')}", '<Link to="/actions/sequences"', "{t('today.empty.sequences')}"],
      },
      { file: `${WEB}/today/HistoryDrawer.tsx`, markers: ['<ActionCenter'] },
      {
        file: `${WEB}/action-history/view/ActionHistoryJournal.tsx`,
        markers: ['onClear={() => handleFiltersChange([])}'],
      },
      { file: `${WEB}/action-history/view/ActionHistoryTable.tsx`, markers: ["{emptyTitle ?? t('table.emptyTitle')}"] },
    ],
  },
  {
    routeMigrationKey: 'missions_anciennes_sous_pages',
    screen: '/missions',
    status: 'door',
    evidence:
      'Aucune mission : « Créer une mission » (`MissionsEmptyState`) ; filtre de source et filtres de barre se retirent.',
    proofs: [
      {
        file: `${WEB}/missions/view/MissionsPage.tsx`,
        markers: [
          '<MissionsEmptyState finishedCount={finishedCount} />',
          'onClick={clearFilters}',
          "{t('sourceFilter.emptyCta')}",
        ],
      },
      { file: `${WEB}/missions/view/MissionsEmptyState.tsx`, markers: ['<Link to="/missions/nouvelle">'] },
    ],
  },
  {
    routeMigrationKey: 'pilotage_anciennes_pages',
    screen: '/pilotage',
    status: 'door',
    evidence:
      'Tableau de bord sans liste nue : chaque maillon, même non mesuré, ouvre sa page de travail (`LevelDetail`, `<Link to={to}>`).',
    proofs: [
      { file: `${WEB}/pilotage/view/CockpitBody.tsx`, markers: ['<ChainStrip'] },
      { file: `${WEB}/pilotage/view/LevelDetail.tsx`, markers: ['to={to}'] },
    ],
  },
  {
    routeMigrationKey: 'projets',
    screen: '/projects',
    status: 'door',
    evidence: 'Pipe vide à quatre portes réelles, filtre d’étape et filtres de barre retirables (lot J04).',
    proofs: [
      {
        file: `${WEB}/projects/view/ProjectsPage.tsx`,
        markers: ["title={t('emptyState.noProjectTitle')}", '<CreateProjectAction />', '<ClearFiltersAction'],
      },
    ],
  },
  {
    routeMigrationKey: 'vivier',
    screen: '/consultants',
    status: 'door',
    evidence:
      'Vivier vide : « Ajouter » dans la barre ; un critère nommé se retire seul ; une recherche sans résultat se vide désormais d’un clic (#2958.104, lot M12) ; profils archivés affichables.',
    proofs: [
      {
        file: `${WEB}/consultants/view/ConsultantsPage.tsx`,
        markers: [
          'onClick={openAdd}',
          "{t('search.namedEmpty.clear')}",
          "{t('search.empty.clear')}",
          "{t('empty.archivedOnly.show')}",
        ],
      },
    ],
  },
  {
    routeMigrationKey: 'actions',
    screen: '/actions',
    status: 'door',
    evidence:
      'Même écran qu’Écritures : la file « Aujourd’hui » vide mène aux séquences ; le Centre d’actions et les filtres effaçables encadrent le journal vide.',
    proofs: [
      {
        file: `${WEB}/today/TodayPage.tsx`,
        markers: ["title={t('today.empty.title')}", '<Link to="/actions/sequences"', "{t('today.empty.sequences')}"],
      },
      { file: `${WEB}/today/HistoryDrawer.tsx`, markers: ['<ActionCenter'] },
      {
        file: `${WEB}/action-history/view/ActionHistoryJournal.tsx`,
        markers: ['onClear={() => handleFiltersChange([])}'],
      },
    ],
  },
  {
    routeMigrationKey: 'sequences',
    screen: '/actions/sequences',
    status: 'door',
    evidence:
      'Aucune séquence : lien vers les contacts, ou vers les intégrations quand aucune messagerie n’est branchée.',
    proofs: [
      {
        file: `${WEB}/outreach/view/SequencesPage.tsx`,
        markers: [
          '<Link to="/contacts">{t(\'page.empty.cta\')}</Link>',
          '<Link to="/integrations">{t(\'page.empty.ctaConnect\')}</Link>',
        ],
      },
    ],
  },
  {
    routeMigrationKey: 'automatisations',
    screen: '/actions/automatisations/bibliotheque',
    status: 'door',
    evidence:
      'Une recherche ou une famille sans routine le dit et propose « Tout afficher » (#2958.104, lot M12 ; Théo C automations-bibliotheque : la bibliothèque a quitté Réglages › Routines) — elle ne finit plus en zone blanche.',
    proofs: [
      {
        file: `${WEB}/routines/view/RoutineLibraryPage.tsx`,
        markers: ["{t('lib.noMatch')}", "{t('lib.reset')}"],
      },
    ],
  },
  {
    routeMigrationKey: 'integrations',
    screen: '/integrations',
    status: 'door',
    evidence:
      '« Aucun outil ne correspond » efface désormais la recherche et le filtre d’un clic (#2958.104, lot M12) ; l’import reste dans l’en-tête.',
    proofs: [
      {
        file: `${WEB}/integration-center/view/IntegrationCenterPage.tsx`,
        // Refonte Théo (PR12) : l'import est le geste principal de l'en-tête (`.bo11-head-actions`). Arbitrage Louis
        // 24/10 : « Par quoi commencer » a quitté la page — son marqueur `<StarterSteps` avec lui.
        markers: ["{t('noMatch')}", "{t('noMatchClear')}", '<ImportEntryAction />'],
      },
    ],
  },
  {
    routeMigrationKey: 'parametres',
    screen: '/settings',
    status: 'not_a_list',
    evidence: 'Formulaire de préférences locales (thème, taille, vue par défaut) : aucune collection serveur à vider.',
    proofs: [{ file: `${WEB}/settings/view/PreferencesView.tsx`, markers: ['usePreferences()'] }],
  },
]

/** Les clés du registre #2154.3 qui n'ont pas (ou plus) leur entrée ici. */
export function uncoveredEmptyStateRouteKeys(
  entries: readonly RouteEmptyStateEntry[] = ROUTE_EMPTY_STATES,
): RouteMigrationKey[] {
  const covered = new Set(entries.map(entry => entry.routeMigrationKey))
  return ROUTE_MIGRATION_KEYS.filter(key => !covered.has(key))
}

/**
 * Ce qui manque à une entrée, relu dans le code réel (`readSource` lit un
 * fichier depuis la racine du dépôt). Vide quand la preuve tient.
 */
export function emptyStateViolations(entry: RouteEmptyStateEntry, readSource: (file: string) => string): string[] {
  return entry.proofs.flatMap(proof => {
    const source = readSource(proof.file)
    const missing = proof.markers
      .filter(marker => !source.includes(marker))
      .map(marker => `${proof.file} : manque ${marker}`)
    const grownList =
      entry.status === 'not_a_list' && source.includes(NOT_A_LIST_FORBIDDEN_MARKER)
        ? [`${proof.file} : classé « sans liste » mais contient ${NOT_A_LIST_FORBIDDEN_MARKER} — reclasser en \`door\``]
        : []
    return [...missing, ...grownList]
  })
}
