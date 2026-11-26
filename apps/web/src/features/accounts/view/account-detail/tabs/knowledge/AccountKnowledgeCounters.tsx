import type { Account, CommercialBrief, Contact, ProjectRow } from '@bellum/contracts'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AccountQualificationCard } from '@/features/qualification-grid/view/AccountQualificationCard'
import { apiFetch } from '@/lib/api'
import { queryKeys } from '@/lib/api/query-keys'
import type { TabId } from '../../components/AccountDetailTabsBar'
import { useAccountVocabulary } from '@/features/accounts/hooks/useAccountVocabulary'
import { countListedEntities } from '../../components/entities/listedEntities'
import { isHistoricalNeedRow } from '../accountNeedRows'
import { buildEvaluationViewData } from '../evaluation/evaluationViewData'
import { ScoreSummaryCard } from '../evaluation/ScoreSummaryCard'
import { measuredAxisCount, totalAxisCount } from '../evaluation/scoreFactors'
import { useAccountOverviewData } from '../useAccountOverviewData'

type CounterProps = {
  account: Account
  contacts: readonly Contact[]
  /** Le brief commercial du dossier, quand il existe : sans lui, pas de relevés de TJM (jamais « 0 »). */
  brief: CommercialBrief | null
  onTabChange: (tab: TabId) => void
}

/**
 * Théo A comptes-fiche.R3 — les compteurs de « Ce que je sais » : entités
 * documentées · besoins historiques · relevés de TJM · contacts, et l'INTÉRÊT
 * COMMERCIAL /100 comme cinquième compteur ouvrable.
 *
 * Rien ne se perd (Louis 22/10) : le score du dossier et ses axes — y compris
 * ceux qu'on n'a pas pu évaluer, nommés — s'ouvrent d'un clic depuis la tuile
 * Intérêt (doctrine : un score n'est jamais nu). Une valeur absente ne fait
 * AUCUNE tuile, jamais « 0 » (GA-18/19).
 */
export function AccountKnowledgeCounters({ account, contacts, brief, onTabChange }: CounterProps) {
  const { t } = useTranslation('accountDetail', { keyPrefix: 'knowledge.counters' })
  const { t: tCommon } = useTranslation('common')
  const [scoreOpen, setScoreOpen] = useState(false)

  // MÊME clé de cache que `TabNeeds` / `TabProjects` : la liste des projets du compte ne part qu'une fois.
  const projects = useQuery({
    queryKey: queryKeys.accounts.projects(account.id),
    queryFn: () => apiFetch<ProjectRow[]>({ path: `/projects?account_id=${account.id}` }),
  })
  const historicalNeeds = projects.data ? projects.data.filter(isHistoricalNeedRow).length : null

  const evaluation = buildEvaluationViewData(account)
  const interest = evaluation.commercialScore
  const total = totalAxisCount(evaluation.scoreFactors)
  const measured = measuredAxisCount(evaluation.scoreFactors)

  // #4649 (GA-26) — « 5 entités » dans Sites contre « 4 entités documentées » ici : la tuile lisait la liste du brief,
  // l'onglet Sites lisait le dossier. UN prédicat (`countListedEntities`, catégorie « toutes »), les deux endroits
  // disent le même nombre. `null` = aucune entité listée : pas de tuile, jamais « 0 ».
  const overview = useAccountOverviewData(account)
  const { data: vocabulary } = useAccountVocabulary(account.id)
  const entityCount = countListedEntities(
    overview.entities_exhaustive,
    overview.subsidiaries,
    account.company_name,
    vocabulary ?? [],
    overview.sites_france,
    'all',
  )

  const tiles: { key: string; count: number; label: string; tab: TabId }[] = []
  if (entityCount !== null)
    tiles.push({ key: 'entities', count: entityCount, label: t('entities', { count: entityCount }), tab: 'sites' })
  if (historicalNeeds !== null && historicalNeeds > 0)
    tiles.push({ key: 'needs', count: historicalNeeds, label: t('needs', { count: historicalNeeds }), tab: 'veille' })
  if (brief && brief.prices.length > 0)
    tiles.push({
      key: 'tjm',
      count: brief.prices.length,
      label: t('tjm', { count: brief.prices.length }),
      tab: 'brief',
    })
  if (contacts.length > 0)
    tiles.push({
      key: 'contacts',
      count: contacts.length,
      label: t('contacts', { count: contacts.length }),
      tab: 'contacts',
    })

  if (tiles.length === 0 && interest === null) return null

  // Refonte Théo (23/10) — `.ac20-metrics` : une bande de repères séparés par un filet, le chiffre en grand.
  const tileClass =
    'flex min-h-11 min-w-0 flex-col items-start gap-1 border-[var(--bellum-border)] px-0 py-2 text-left transition-colors duration-immediate ease-bellum-out hover:text-[var(--bellum-text-accent)] md:border-r md:px-5 md:first:pl-0 md:last:border-r-0'
  // Louis 23/10 — « aucun score en points » : l'intérêt commercial s'écrit en MOTS (fort / moyen / faible) ;
  // le chiffre et ses axes restent dans la fenêtre du score, qui nomme les axes non évalués.
  const interestBand = interest === null ? null : interest >= 70 ? 'strong' : interest >= 40 ? 'medium' : 'weak'

  return (
    <section
      aria-label={t('aria')}
      data-testid="account-knowledge-counters"
      className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-[var(--bellum-border)] pb-6 md:grid-cols-5 md:gap-0"
    >
      {tiles.map(tile => (
        <button
          key={tile.key}
          type="button"
          aria-label={`${tile.count} ${tile.label}`}
          onClick={() => onTabChange(tile.tab)}
          className={tileClass}
        >
          <Text size="2xl" weight="semibold" className="tabular-nums tracking-tight" aria-hidden>
            {tile.count}
          </Text>
          <Text size="xs" className="text-[var(--bellum-text-muted)]" aria-hidden>
            {tile.label}
          </Text>
        </button>
      ))}
      {interest !== null && interestBand !== null ? (
        <>
          <button
            type="button"
            data-testid="knowledge-interest"
            aria-label={`${t(`interestBand.${interestBand}`)} · ${t('interest')}${total > 0 ? ` · ${t('axes', { measured, total })}` : ''}`}
            aria-haspopup="dialog"
            onClick={() => setScoreOpen(true)}
            className={tileClass}
          >
            {/* i18n keys: knowledge.counters.interestBand.strong | knowledge.counters.interestBand.medium | knowledge.counters.interestBand.weak */}
            <Text size="2xl" weight="semibold" className="tracking-tight" aria-hidden>
              {t(`interestBand.${interestBand}`)}
            </Text>
            <Text size="xs" className="text-[var(--bellum-text-muted)]" aria-hidden>
              {t('interest')}
              {total > 0 ? ` · ${t('axes', { measured, total })}` : ''}
            </Text>
          </button>
          <Dialog open={scoreOpen} onOpenChange={setScoreOpen}>
            <DialogContent closeLabel={tCommon('actions.close')} className="max-h-[90dvh] max-w-3xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('scoreDialog.title')}</DialogTitle>
                <DialogDescription>{t('scoreDialog.description')}</DialogDescription>
              </DialogHeader>
              <ScoreSummaryCard data={evaluation} />
              <AccountQualificationCard accountId={account.id} />
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </section>
  )
}
