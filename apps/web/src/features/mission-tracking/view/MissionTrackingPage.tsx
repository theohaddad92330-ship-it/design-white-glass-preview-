import { Box, SearchEmptyState } from '@bellum/ui'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { ScreenIntro } from '@/components/primitives/ScreenIntro'
import { useAggregateMargin } from '@/features/missions/api'
import { useRoutines } from '@/features/routines/api'
import { formatMonth } from '@/lib/locale'
import { automationGaps, isToAct, sortByUrgency, type TrackingView } from '../derive'
import { useMissionTrackingData } from '../rows'
import { useMissionTrackingColumns } from '../useMissionTrackingColumns'
import { AutomationsRail, MISSION_ROUTINE_KEYS } from './AutomationsRail'
import { MissionTrackingTable } from './MissionTrackingTable'
import { MissionDriftPanel } from './MissionDriftPanel'
import { MissionTrackingTiles } from './MissionTrackingTiles'
import { ProfitabilityPanel } from './ProfitabilityPanel'
import { RecentActivityPanel } from './RecentActivityPanel'

/**
 * « SUIVI, FACTURATION & AUTOMATISATIONS » (`/missions/suivi`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN EST, ET CE QU'IL N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────
 * D-22-2 (29/08/2026) l'avait rayé : les cinq autres blocs de la maquette
 * vivaient déjà chacun sur son écran (missions sur `/missions`, relevés sur
 * `/missions/cra`, blocages de facturation sur `/missions/facturation`,
 * retards et règlements sur `/missions/encaissements`, marge sur
 * `/pilotage`), et le seul bloc manquant — la grande table — était « la
 * fusion que ces écrans ont été séparés pour éviter ». Louis a levé la
 * décision le 31/08/2026 : il veut la table.
 *
 * Elle reste fidèle à l'objection technique de D-22-2 : les trois colonnes du
 * milieu ne recalculent RIEN (`../derive.ts`), et chacune dit explicitement
 * quand elle n'a pas l'information — « sans objet » et « non mesuré » ne sont
 * jamais confondus avec « à faire ».
 *
 * Le panneau « Automatisations » AFFICHE l'état de quatre routines réelles et
 * RENVOIE à Réglages › Routines — jamais un second interrupteur (GA-26,
 * `AutomationsRail.tsx`).
 */
export function MissionTrackingPage() {
  const { t } = useTranslation('missionTracking')
  const now = useMemo(() => new Date(), [])
  const data = useMissionTrackingData(now)
  const margin = useAggregateMargin()
  const { visible, toggle, reset } = useMissionTrackingColumns()
  const [search, setSearch] = useState('')
  // #1378 — « Par défaut ouvrir "À traiter" ». C'est le repositionnement que
  // #1377 demande, rendu par le défaut plutôt que par une phrase : l'écran
  // s'ouvre sur ce qui bloque, pas sur le portefeuille.
  const [view, setView] = useState<TrackingView>('toAct')
  const routines = useRoutines()

  /**
   * ⚠️ L'ORDRE EST CALCULÉ UNE FOIS, sur TOUTES les lignes, et les deux vues le
   * partagent (#1378). Trier dans chaque vue produirait deux ordres qui
   * divergeraient — et « Tout le suivi » remonterait alors des missions saines
   * au-dessus de missions bloquées.
   */
  const ordered = useMemo(() => sortByUrgency(data.rows), [data.rows])
  const toActRows = useMemo(() => ordered.filter(isToAct), [ordered])
  const viewCounts = useMemo(
    () => ({ toAct: toActRows.length, all: ordered.length }) as Record<TrackingView, number>,
    [toActRows.length, ordered.length],
  )
  const visibleRows = view === 'toAct' ? toActRows : ordered

  /**
   * #1380 — les garde-fous ÉTEINTS que la file rend visibles.
   *
   * ⚠️ Calculés sur la FILE À TRAITER, jamais sur la vue courante : un manque
   * ne doit pas disparaître parce qu'on a cliqué une tuile, et il ne doit pas
   * réapparaître plus gros parce qu'on regarde tout le portefeuille.
   */
  const gaps = useMemo(() => {
    const enabled = new Map<string, boolean>()
    for (const routine of routines.data ?? []) {
      if (MISSION_ROUTINE_KEYS.includes(routine.definition.key)) {
        enabled.set(routine.definition.key, routine.subscription.enabled)
      }
    }
    return automationGaps(toActRows, enabled)
  }, [routines.data, toActRows])

  /** #1384 — ce que Laura reçoit : la FILE, pas le portefeuille. */
  const lauraQuestion = t('table.askLauraQuestion', { count: toActRows.length })

  return (
    <CustomerPage titleInScreen pageTitle={t('page.title')}>
      <Box className="flex flex-col gap-6 py-4">
        {/* #1377 — l'entête ne fait pas que porter un prénom : il repositionne
            la page. Le retour est explicite — « ne pas faire de Suivi une
            deuxième liste de missions actives, cette fonction existe déjà dans
            Missions > En cours ». Le sous-titre nomme donc ce qui BLOQUE et le
            cash, pas le portefeuille. L'ancien `page.subtitle` est remplacé,
            pas doublé. */}
        <ScreenIntro
          title={t('page.introTitle')}
          titleWithoutName={t('page.introTitleWithoutName')}
          subtitle={t('page.introSubtitle')}
        />

        <MissionTrackingTiles
          activeMissionsCount={data.activeMissionsCount}
          craSummary={data.craSummary}
          readinessSummary={data.readinessSummary}
          readinessCanReadFinance={data.readinessCanReadFinance}
          overdueBucket={data.collectionsSummary.overdue}
          collectionsCanReadFinance={data.collectionsCanReadFinance}
          collectionsWindowMonths={data.collectionsWindowMonths}
          marginPercent={margin.data?.marginPercent}
          marginMonth={formatMonth(previousMonthLabel(now)) ?? undefined}
          marginForbidden={margin.isError}
          period={formatMonth(previousMonthLabel(now)) ?? undefined}
          onShowAll={() => setView('all')}
        />

        {/* #1380 — le rail n'occupe plus 320 px à droite de la table : c'est
            une ligne compacte au-dessus d'elle. La table récupère toute la
            largeur, qui est ce que le retour demande. */}
        <AutomationsRail gaps={gaps} />

        {data.isError ? (
          <SearchEmptyState title={t('table.loadErrorTitle')} description={t('common:states.error')} />
        ) : (
          <MissionTrackingTable
            rows={visibleRows}
            visible={visible}
            onToggleColumn={toggle}
            onResetColumns={reset}
            search={search}
            onSearchChange={setSearch}
            view={view}
            onViewChange={setView}
            viewCounts={viewCounts}
            lauraQuestion={lauraQuestion}
          />
        )}

        {/* La DÉGRADATION d'une mission (PDF 5 §7.2) — distincte de sa FIN, que
            `/missions` traite déjà à J-60. Le panneau ne s'affiche que s'il a
            quelque chose à dire : une dérive, ou une mission illisible. */}
        <MissionDriftPanel />

        <Box className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RecentActivityPanel events={data.recentActivity} isLoading={data.isLoading} />
          <ProfitabilityPanel now={now} />
        </Box>
      </Box>
    </CustomerPage>
  )
}

/** Le mois que `useAggregateMargin()` sans argument lit côté serveur : le
 *  précédent — même défaut que partout ailleurs dans le module missions. */
function previousMonthLabel(now: Date): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  date.setUTCMonth(date.getUTCMonth() - 1)
  return date.toISOString().slice(0, 7)
}
