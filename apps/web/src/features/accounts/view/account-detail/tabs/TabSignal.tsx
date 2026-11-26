import { isSegmentCollectionStale, SEGMENT_CAPABILITY_EPOCH, type Account } from '@bellum/contracts'
import { useHiringDomainProfileState } from '@/features/discover/hooks/useHiringDomainProfile'
import { useAccountCrmSignals } from '@/features/accounts/hooks/useAccountCrmSignals'
import { useAccountRegistryAnnouncements } from '@/features/accounts/hooks/useAccountRegistryAnnouncements'
import { useAccountMarketContext } from '@/features/accounts/hooks/useAccountMarketContext'
import { useAccountRecentHires } from '@/features/accounts/hooks/useAccountRecentHires'
import type { WatchSignal } from '@/features/accounts/model/watch'
import { awardSignalsForWatch } from '@/features/accounts/model/awardSignals'
import { buildAccountWatchData, buildInsights } from '@/features/accounts/model/watchData'
import { signalsNotCoveredByLeads } from '@/features/accounts/model/lineNature'
import { distinctWatchEvents } from '@/features/accounts/model/watchEvents'
import { observedRoleFamilyLabels } from '@/features/accounts/model/observedRoleFamilies'
import { SignalFreshnessLine } from '../components/SignalFreshnessLine'
import { SegmentStaleCollectionNotice } from '../components/SegmentStaleCollectionNotice'
import { useLeadCoveredFacts } from './opportunities/useLeadCoveredFacts'
import { DeclareLinkedInSignalDialog } from './veille/DeclareLinkedInSignalDialog'
import { WatchFilters } from './veille/WatchFilters'
import { WatchInsightsPanel } from './veille/WatchInsightsPanel'
import { WatchOverviewStats } from './veille/WatchOverviewStats'
import { hiringVolumeByMonth } from '@/features/accounts/model/hiringVolumeTrend'
import { WatchHiringTrendPanel } from './veille/WatchHiringTrendPanel'
import { AccountJobOffersPanel } from './veille/AccountJobOffersPanel'
import { WatchRecentHiresPanel } from './veille/WatchRecentHiresPanel'
import { WatchHypothesesPanel } from './veille/WatchHypothesesPanel'
import { OffersCascadeNotice } from './veille/OffersCascadeNotice'
import { WatchSignalTimeline } from './veille/WatchSignalTimeline'
import { AccountHistoryFactsSection } from './veille/AccountHistoryFactsSection'
import { WatchSourcesPanel } from './veille/WatchSourcesPanel'

type TabSignalProps = {
  account: Account
  isPersisting: boolean
  onAddToPlan: (signal: WatchSignal) => void
  onCreateAngle: (signal: WatchSignal) => void
}

export function TabSignal({ account, isPersisting, onAddToPlan, onCreateAngle }: TabSignalProps) {
  // #3918.b — les affaires perdues / dormantes / à renouveler du CRM du client, rattachées à CE compte,
  // passent par le MÊME lecteur que les signaux de l'analyse (filtres, compteurs, sources).
  const crmSignals = useAccountCrmSignals(account.id)
  // #4286.1 — les marchés publics attribués lus en continu par SIREN passent par le même lecteur (datés, avec lien).
  const registry = useAccountRegistryAnnouncements(account.id).data
  const extraSignals = [...crmSignals, ...awardSignalsForWatch(registry?.announcements)]
  const { scenario, signals: rawSignals, hypotheses } = buildAccountWatchData(account, extraSignals)
  const signalsEpoch = SEGMENT_CAPABILITY_EPOCH.signals
  // #3680.1 — l'unité est l'événement identifié : la liste et les compteurs lisent la même collection.
  const leadFacts = useLeadCoveredFacts(account.id)
  // #3995 — renverse #3676.6 POUR LA LISTE SEULE (décision Louis 10/10) : un signal déjà présenté en
  // piste reste listé, avec une mention légère « En piste » ; plus de renvoi « ci-dessus ».
  // (Réfuté en prod le 07/10 : « 0 signal sur aucun de mes comptes » — chaque piste naît d'un signal.)
  const events = distinctWatchEvents(rawSignals)
  const notInLeads = signalsNotCoveredByLeads(events, leadFacts)
  const inLeadSignalIds = new Set(events.filter(e => !notInLeads.some(s => s.id === e.id)).map(e => e.id))
  // #3676 (réfuté en recette 07/10 : même fait sous « Pistes à qualifier » ET « Ce que
  // cela implique commercialement ») — TOUJOURS VRAI après #3995 : les insights restent
  // calculés sur les signaux qu'aucune piste ne présente, jamais sur la liste brute.
  const insights = buildInsights(notInLeads)
  // #2127.8 — le passé du marché ÉCLAIRE un signal actuel, il ne le remplace
  // pas : la frise reçoit les familles d'expertise observées et ne les pose que
  // sous un signal d'emploi. Lecture gratuite, même clé de cache que la carte
  // « Contexte marché » du dossier — ouvrir la veille ne relit rien de plus.
  const { data: marketContext } = useAccountMarketContext(account.id, true)
  // #3970 — qui vient d'arriver chez ce compte, et pourquoi ça colle (ou non) au contexte de l'espace.
  const recentHires = useAccountRecentHires(account.id)
  // #3901.w — le secteur des recrutements suit le profil déclaré (jumeau de Découvrir).
  const { profile: hiringProfile, failed: hiringProfileFailed } = useHiringDomainProfileState()
  // #3920 (Louis 15/10) — la tendance du compte = le volume d'offres d'emploi par mois, lu sur la collecte.
  const hiringTrend = hiringVolumeByMonth((account.raw_analysis as Record<string, unknown> | null)?.['it_job_signals'])

  return (
    <div className="space-y-4 pb-8">
      {/* #2543.7 — l'aveu de fraîcheur du segment signaux. */}
      <SegmentStaleCollectionNotice dimension="signals" collectedAt={account.signals_collected_at ?? null} />
      {/* #3682.3/.4/.5 — la vérification et le dernier événement utile, séparés ; même lecture que la liste et Laura. */}
      {account.signal_freshness ? (
        <SignalFreshnessLine
          summary={account.signal_freshness}
          cadence={account.watch_cadence}
          nextReanalysisAt={account.next_reanalysis_at}
          nextReanalysisReason={account.next_reanalysis_reason}
        />
      ) : null}
      {/* #2634.1 — LinkedIn n'entre que par ce que le commercial apporte
          lui-même (URL et/ou texte) ; le serveur ne contacte jamais LinkedIn. */}
      <div className="flex justify-end">
        <DeclareLinkedInSignalDialog accountId={account.id} />
      </div>
      <WatchFilters signals={events}>
        {({ filteredSignals, activeCategory, narrowed, openCategory }) => (
          <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
            <div className="min-w-0 space-y-6">
              {/* #3939.a — les hypothèses qualifiées et leurs signaux fondateurs, lues sur TOUS les
                  signaux : celles dont les signaux sont devenus des pistes ne disparaissent plus.
                  #3993 — section normale en colonne principale (à gauche), plus une carte de 340 px
                  coincée dans l'aside de droite. */}
              <WatchHypothesesPanel hypotheses={hypotheses} />
              {/* CASCADE-ECRAN — « Recrutements » : la recherche d'offres s'est élargie (ou n'a pas atteint son plancher). */}
              {activeCategory === 'all' || activeCategory === 'recruitments' ? (
                <OffersCascadeNotice rawAnalysis={account.raw_analysis} />
              ) : null}
              {/* #5000.1 #5000.2 — les offres d'emploi du compte, AVEC leur type de contrat (même libellé que
                  Découvrir) et la recherche d'un autre métier : le panneau existait, sans aucun appelant. */}
              {activeCategory === 'all' || activeCategory === 'recruitments' ? (
                <AccountJobOffersPanel accountId={account.id} />
              ) : null}
              <WatchSignalTimeline
                signals={filteredSignals}
                activeCategory={activeCategory}
                narrowed={narrowed}
                isPersisting={isPersisting}
                scenario={scenario}
                onAddToPlan={onAddToPlan}
                onCreateAngle={onCreateAngle}
                observedRoleFamilies={observedRoleFamilyLabels(marketContext)}
                accountId={account.id}
                hiringProfile={hiringProfile}
                hiringProfileFailed={hiringProfileFailed}
                inLeadSignalIds={inLeadSignalIds}
                // #3922.3 — même critère que le bandeau ci-dessus (GA-26) : un seul endroit décide « concerné ».
                collectedBeforeLink={
                  signalsEpoch ? isSegmentCollectionStale(account.signals_collected_at ?? null, signalsEpoch) : false
                }
              />
              {/* #4068.6 — l'historique daté de la carte /discover, aussi sur la fiche compte. */}
              <AccountHistoryFactsSection accountId={account.id} />
            </div>
            <aside className="space-y-4 xl:sticky xl:top-4">
              <WatchOverviewStats
                signals={events}
                shownCount={filteredSignals.length}
                narrowed={narrowed}
                onOpenCategory={openCategory}
              />
              <WatchHiringTrendPanel series={hiringTrend} />
              <WatchRecentHiresPanel data={recentHires.data ?? null} isError={recentHires.isError} />
              <WatchInsightsPanel insights={insights} scenario={scenario} />
              <WatchSourcesPanel signals={events} />
            </aside>
          </div>
        )}
      </WatchFilters>
    </div>
  )
}
