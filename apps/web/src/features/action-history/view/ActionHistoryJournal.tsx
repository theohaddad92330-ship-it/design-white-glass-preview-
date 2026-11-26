import { useCallback, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Box, FilterBar, Text, type ActiveFilter } from '@bellum/ui'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { useActionHistory, useLastSeen } from '@/features/action-history/hooks/useActionHistory'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { trackFilterApplied } from '@/lib/product-tracker'
import { ActionHistoryTable } from './ActionHistoryTable'
import { ActionHistoryToolbar } from './ActionHistoryToolbar'
import { TraceabilityPanel } from './TraceabilityPanel'
import { buildActiveFilters, buildHistoryQuery, PAGE_SIZE, searchPatchFromFilters } from './actionHistoryQuery'
import { formatActionDate, getActionHistoryFilters, isActionHistoryTabKey } from './actionHistoryPresentation'
import { guideAnchorProps } from '@/features/guide/guide-anchors'

/** #1687 — le MOTIF d'écran, jamais dérivé. */
const ACTIONS_SCREEN = '/actions'

const easeOut = [0.23, 1, 0.32, 1] as const

const fadeUp = {
  hidden: { opacity: 0, transform: 'translate3d(0, 10px, 0)' },
  visible: { opacity: 1, transform: 'translate3d(0, 0, 0)' },
}

type ActionHistoryRouteId = '/actions/'

/**
 * Lot L-A (#4164) — LE JOURNAL D'ACTIVITÉ, dans le tiroir « Historique ».
 *
 * C'était le bas de la page `/actions` ; la page est devenue « Aujourd'hui » (la file
 * où l'on agit) et le journal, qui répond à « qu'est-ce qui s'est passé ? », vit dans
 * le tiroir. Même requête, mêmes filtres d'URL : un lien partagé retombe ici.
 */
export function ActionHistoryJournal({ from = '/actions/' }: { from?: ActionHistoryRouteId } = {}) {
  const { t } = useTranslation('actions')
  const search = useSearch({ from })
  const navigate = useNavigate({ from })
  const shouldReduceMotion = useReducedMotion()
  const activeTab = isActionHistoryTabKey(search.category ?? 'all') ? (search.category ?? 'all') : 'all'
  // « Depuis votre dernière connexion » : un mode transversal (pas une catégorie)
  // qui montre le DELTA depuis le repère posé au sign-in.
  const isSinceMode = activeTab === 'since'
  const activeCategory = isSinceMode ? 'all' : activeTab
  const activeFilters = useMemo(() => buildActiveFilters(search), [search])

  // Repère « depuis quand », posé une seule fois par montage du Journal. `null` =
  // première visite jamais enregistrée → il n'existe pas de « dernière connexion ».
  const lastSeen = useLastSeen()
  const sinceRef = lastSeen.data?.since ?? null

  const query = useMemo(
    () =>
      isSinceMode && sinceRef
        ? { since: sinceRef, limit: PAGE_SIZE }
        : buildHistoryQuery(activeCategory, activeFilters),
    [isSinceMode, sinceRef, activeCategory, activeFilters],
  )
  // En mode « delta » sans repère (première visite), il n'y a aucune fenêtre à
  // interroger : on n'appelle pas le serveur, on montre l'état d'accueil.
  const historyEnabled = !isSinceMode || sinceRef !== null
  const history = useActionHistory(query, { enabled: historyEnabled })

  // Les membres alimentent le filtre « Membre ». Route lisible par tout membre
  // (`GET /workspaces/members`), donc le filtre ne dépend pas d'un rôle manager.
  const members = useWorkspaceMembers().data
  const filterMembers = useMemo(() => {
    const list = (members ?? []).map(member => ({
      userId: member.userId,
      label: member.fullName ?? member.email ?? t('filters.unknownMember'),
    }))
    // Un lien partagé peut porter un membre absent de la liste (liste encore en
    // vol, ou collaborateur sorti de l'espace) : sans cette entrée, la chip
    // disparaîtrait de l'écran alors que le filtre continuerait de s'appliquer.
    if (search.member && !list.some(member => member.userId === search.member)) {
      list.push({ userId: search.member, label: t('filters.unknownMember') })
    }
    return list
  }, [members, search.member, t])
  const filterDefinitions = useMemo(() => getActionHistoryFilters(t, filterMembers), [t, filterMembers])

  const handleFiltersChange = useCallback(
    (next: ActiveFilter[]) => {
      void navigate({ search: previous => ({ ...previous, ...searchPatchFromFilters(next) }) })
    },
    [navigate],
  )

  const handleAddFilter = useCallback(
    (filterId: string, value: string) => {
      // #1687 — le NOM du filtre, jamais sa valeur.
      trackFilterApplied(ACTIONS_SCREEN, filterId)
      void navigate({ search: previous => ({ ...previous, [filterId]: value }) })
    },
    [navigate],
  )

  // Le mode « depuis ma dernière connexion » vivait dans un rang d'onglets à
  // part (§L4, 30/08/2026) — retiré : c'est désormais un bouton bascule de la
  // barre d'outils, qui se présente comme un filtre plutôt que comme une
  // navigation entre sous-écrans.
  const handleToggleSince = useCallback(() => {
    void navigate({ search: previous => ({ ...previous, category: isSinceMode ? undefined : 'since' }) })
  }, [navigate, isSinceMode])

  const items = history.data?.data ?? []
  const tableLoading = isSinceMode ? lastSeen.isLoading || (historyEnabled && history.isFetching) : history.isLoading

  // État vide DATÉ (jamais un « 0 » ambigu) : « rien de nouveau depuis {date} »
  // quand la fenêtre est connue, un accueil quand c'est la première visite.
  const sinceEmpty = sinceRef
    ? {
        emptyTitle: t('since.emptyTitle'),
        emptySubtitle: t('since.emptySubtitle', { date: formatActionDate(sinceRef) }),
      }
    : { emptyTitle: t('since.firstVisitTitle'), emptySubtitle: t('since.firstVisitSubtitle') }
  const emptyProps = isSinceMode ? sinceEmpty : {}

  return (
    <Box className="flex min-h-full w-full flex-1 flex-col space-y-4">
      {/* La barre d'outils reste montée dans les DEUX modes : le bouton
          « depuis ma connexion » doit rester cliquable pour en SORTIR, pas
          seulement pour y entrer. */}
      <motion.div
        {...guideAnchorProps('actions.filtres')}
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease: easeOut }}
      >
        <ActionHistoryToolbar
          definitions={filterDefinitions}
          onAddFilter={handleAddFilter}
          hasActiveFilters={activeFilters.length > 0}
          isSinceMode={isSinceMode}
          onToggleSince={handleToggleSince}
        />
      </motion.div>
      {isSinceMode ? (
        // Bandeau du mode delta : rappelle la fenêtre affichée. Pas de filtres —
        // le delta se lit d'un coup d'œil, il n'y a rien à affiner.
        sinceRef && items.length > 0 ? (
          <Text size="sm" weight="medium" className={`text-[var(--bellum-text-secondary)] ${PAGE_GUTTER_X}`}>
            {t('since.banner', { date: formatActionDate(sinceRef) })}
          </Text>
        ) : null
      ) : (
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ duration: shouldReduceMotion ? 0 : 0.2, delay: shouldReduceMotion ? 0 : 0.04, ease: easeOut }}
        >
          <FilterBar
            definitions={filterDefinitions}
            active={activeFilters}
            onChange={handleFiltersChange}
            onClear={() => handleFiltersChange([])}
            className={PAGE_GUTTER_X}
          />
        </motion.div>
      )}
      {/* #1499 — la largeur revient au travail.
          Le panneau de conformité occupait 320 à 340 px À DROITE, en permanence,
          pour du contenu pédagogique qui ne change jamais. Il est désormais une
          ligne SOUS le journal : la conformité reste dite, elle ne coûte plus un
          cinquième de l'écran à chaque visite. */}
      <Box {...guideAnchorProps('actions.journal')} className="flex min-h-0 flex-1 flex-col gap-4 overflow-visible">
        <ActionHistoryTable items={items} loading={tableLoading} {...emptyProps} />
        <TraceabilityPanel />
      </Box>
    </Box>
  )
}
