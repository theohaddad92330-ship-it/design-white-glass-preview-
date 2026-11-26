import type {
  AccountAnalysis,
  AnalysisApolloOrgEnrichment,
  AwardedContract,
  BeneficialOwner,
  ContractModel,
  Executive,
  FinancialYear,
  GithubSignals,
  JobSignal,
  LegalSignal,
  PublicTender,
  SecFiling,
  TechnologyEntry,
  UsSecFinancials,
} from '@bellum/contracts'
import {
  REFRESH_DIMENSION_CREDIT_COST,
  isSegmentCollectionStale,
  parseSignalDate,
  segmentCapabilityAt,
  type SalesProfileForRelevance,
} from '@bellum/contracts'
import { Badge, Card, HORIZONTAL_OVERSCROLL_CLASS, Text, Tooltip, TooltipContent, TooltipTrigger, cn } from '@bellum/ui'
import { displayRecordedRevenue } from './apolloRegistryConflict'
import {
  Briefcase,
  Cpu,
  FileSignature,
  Scale,
  FileText,
  Github,
  History,
  Info,
  Landmark,
  LineChart,
  Users,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { buildTechPills } from '../synthesis/accountSynthesis'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { NamedAbsence } from '@/components/feedback/NamedAbsence'
import { useAccountMarketContext } from '@/features/accounts/hooks/useAccountMarketContext'
import { useRefreshDimension } from '@/features/accounts/hooks/useRefreshDimension'
import { SegmentStaleCollectionNotice } from '../../components/SegmentStaleCollectionNotice'
import { formatDate, formatDateRange } from '@/lib/locale'
import { safeHref } from '@/lib/safe-href'
import { formatRegistryDateIfKnown, formatSignalDateIfKnown, plausibleRegistryDate } from '@/lib/signal-date'
import { offerTitleKey } from '@/lib/signal-dedupe'
import {
  buildSecFinancialRows,
  formatCount,
  formatEuros,
  formatPercent,
  formatUsd,
  mergeTechStack,
  rankOfficers,
  splitJobsByTrade,
} from './publicDataViewData'
import { groupClosureNotices, mergeLegalNotices } from './legalNotices'
import { mergeAwardedContracts } from './awardedContracts'
import { useAccountRegistryAnnouncements } from '@/features/accounts/hooks/useAccountRegistryAnnouncements'
import type { AccountRegistryAnnouncements, RegistryAnnouncement } from '@bellum/contracts'

/**
 * « Données société & signaux publics » — surface les blocs FACTUELS collectés
 * en phase 1 mais jamais affichés jusqu'ici (financiers Pappers, stack technique
 * tech-detect + Apollo, dirigeants/bénéficiaires, appels d'offres BOAMP + marchés
 * DECP, offres d'emploi, signal GitHub). Chaque carte est present-only : absente
 * quand sa source n'a rien renvoyé. Rien d'inventé.
 */
export function CompanyPublicDataSection({
  analysis,
  apolloEnrichment,
  accountId,
  signalsCollectedAt,
  groupRevenue,
  hiringProfile,
}: {
  analysis: AccountAnalysis
  apolloEnrichment?: AnalysisApolloOrgEnrichment
  /** #1607.2 — pour lire l'environnement technologique OBSERVÉ par la mémoire
   *  marché. Optionnel : les écrans qui ne le passent pas gardent le rendu
   *  d'avant, à l'identique. */
  accountId?: string
  /** #2291.2 (lot R) — `accounts.signals_collected_at`, pour que la carte
   *  « Modèle de contrat observé » sache si ce compte a été analysé AVANT la
   *  capacité (`SEGMENT_CAPABILITY_EPOCH.signals`) et le DISE plutôt que de se
   *  taire — seule carte de cette section qui n'est pas present-only. */
  signalsCollectedAt?: string | null
  /** #recette-21-10-K1 — `account.revenue` : le CA du GROUPE (consolidé), à ne pas
   *  confondre avec les comptes sociaux de l'entité du SIREN (`financials_history`). */
  groupRevenue?: string | null
  /** #4396.1 — le profil de l'espace : « Offres d'emploi IT » ne montre que les offres de SON métier. */
  hiringProfile?: SalesProfileForRelevance
}) {
  const hasFinancials =
    (analysis.financials_history?.length ?? 0) > 0 ||
    Boolean(analysis.legal_form) ||
    typeof analysis.capital === 'number' ||
    Boolean(plausibleRegistryDate(analysis.creation_date))
  // #1607.2 — l'environnement technologique OBSERVÉ par la mémoire marché. Lu
  // ICI et non dans la carte : « la section n'a rien à dire » doit rester vrai,
  // et un compte sans stack détectée mais couvert par le corpus a quand même
  // quelque chose à montrer.
  const observedStack = useAccountMarketContext(accountId, Boolean(accountId)).data?.observed_stack ?? []
  const hasTech =
    mergeTechStack(analysis.detected_tech_stack, apolloEnrichment?.technologies, analysis.technology_stack).length >
      0 || observedStack.length > 0
  const hasLeadership =
    (analysis.c_level?.length ?? 0) + (analysis.executives?.length ?? 0) > 0 ||
    (analysis.beneficial_owners?.length ?? 0) > 0
  const hasJobs = (analysis.it_job_signals?.length ?? 0) > 0
  const historicalSignals = (analysis.historical_needs?.items ?? []).filter(need => need.source === 'signal')
  const hasHistoricalNeeds = historicalSignals.length > 0
  // #3916.b — les annonces relues chaque matin par la veille, en plus de
  // celles que l'analyse a figées : lues ICI pour que « la section n'a rien à
  // dire » reste vrai quand seule la veille en a trouvé.
  const registry = useAccountRegistryAnnouncements(accountId).data ?? null
  const hasLegal =
    mergeLegalNotices(analysis.legal_signals, registry?.announcements, analysis.recent_signals).length > 0
  // #3915.decp — un marché attribué relu en continu suffit à donner la carte des marchés.
  const hasTenders =
    (analysis.public_tenders?.length ?? 0) > 0 ||
    mergeAwardedContracts(analysis.awarded_contracts, registry?.announcements).length > 0
  const hasGithub = Boolean(analysis.github_signals?.org)
  const hasSiteLegal = siteLegalRows(analysis.legal_notice).length > 0
  const hasUsSec = usSecHasContent(analysis.us_sec_financials)
  // #2291.2 (lot R) — contrairement aux blocs ci-dessus (present-only), cette
  // carte a quelque chose à DIRE même sans donnée : « non observé » (cherché,
  // rien d'attribuable) ou « collecte antérieure à cette capacité » (jamais
  // cherché). `undefined` = recherche antérieure à #2291.2 ET signaux à jour
  // (cas théorique seulement, le calcul est TOUJOURS posé depuis) → rien à dire.
  // Daté sur #2291.2 (le modèle de contrat), jamais sur l'epoch `signals` qu'une capacité suivante fait avancer.
  const signalsCapabilityAt = segmentCapabilityAt('signals', '#2291.2')
  const signalsStale =
    Boolean(signalsCapabilityAt) && isSegmentCollectionStale(signalsCollectedAt, signalsCapabilityAt as string)
  const hasContractModel = analysis.contract_model !== undefined || signalsStale

  if (!(
    hasFinancials ||
    hasTech ||
    hasLeadership ||
    hasTenders ||
    hasJobs ||
    hasHistoricalNeeds ||
    hasLegal ||
    hasSiteLegal ||
    hasGithub ||
    hasUsSec ||
    hasContractModel
  ))
    return null

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <FinancialsCard
        analysis={analysis}
        groupRevenue={groupRevenue}
        accountId={accountId}
        signalsCollectedAt={signalsCollectedAt}
      />
      <UsSecFinancialsCard data={analysis.us_sec_financials ?? undefined} entityName={analysis.legal_name} />
      <TechStackCard
        detected={analysis.detected_tech_stack}
        apollo={apolloEnrichment?.technologies}
        analysed={analysis.technology_stack}
        observed={observedStack}
      />
      <LeadershipCard analysis={analysis} />
      <TendersCard
        tenders={analysis.public_tenders}
        awarded={analysis.awarded_contracts}
        registry={registry?.announcements}
      />
      <JobSignalsCard jobs={analysis.it_job_signals} profile={hiringProfile} signalsCollectedAt={signalsCollectedAt} />
      {hasHistoricalNeeds ? <HistoricalNeedsCard signals={historicalSignals} /> : null}
      <LegalNoticesCard signals={analysis.legal_signals} registry={registry} recentSignals={analysis.recent_signals} />
      <SiteLegalNoticeCard fields={analysis.legal_notice} />
      <GithubCard signals={analysis.github_signals ?? undefined} />
      {hasContractModel ? <ContractModelCard model={analysis.contract_model} isStale={signalsStale} /> : null}
    </div>
  )
}

/** True when the SEC/EDGAR (US) snapshot carries at least one displayable fact. */
function usSecHasContent(data: UsSecFinancials | null | undefined): boolean {
  if (!data) return false
  return (
    (data.revenues?.length ?? 0) > 0 ||
    (data.net_income?.length ?? 0) > 0 ||
    (data.filings?.length ?? 0) > 0 ||
    Boolean(data.shares_outstanding)
  )
}

/* ─── Shared shell ──────────────────────────────────────────────────────────── */

function SectionCard({
  icon,
  title,
  source,
  /**
   * #1087 — « C'est quoi ? Que peut-on voir avec ça. Peut-être que vous pourriez
   * faire afficher des bulles avec une courte explication en passant le curseur
   * dessus ». Chaque carte dit donc ce qu'elle montre ET à quoi ça sert
   * commercialement : le badge de source disait D'OÙ vient la donnée, jamais
   * POURQUOI on la regarde.
   *
   * Un `<button>` et non un `<span>` : la bulle doit s'atteindre au clavier, et
   * un survol seul ne existe pas au doigt (GA-35). L'icône est seule, elle porte
   * donc un nom (GA-32).
   */
  help,
  children,
}: {
  icon: ReactNode
  title: string
  source?: string
  help?: string
  children: ReactNode
}) {
  const { t } = useTranslation('accountDetail')
  return (
    <Card className="gap-0 overflow-hidden p-0 [--card-spacing:0px]">
      <div className="flex items-center justify-between gap-3 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 text-[var(--bellum-text-accent)]">{icon}</span>
          <Text element="h3" size="sm" weight="semibold" noWrap className="truncate">
            {title}
          </Text>
          {help ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t('publicData.whatIsThis', { title })}
                  className="shrink-0 rounded-full text-[var(--bellum-text-muted)] transition-colors hover:text-[var(--bellum-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
                >
                  <Info className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{help}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        {source ? (
          <Badge className="shrink-0 border-0 bg-[var(--bellum-surface-2)] px-1.5 py-0 text-xs text-[var(--bellum-text-secondary)]">
            {source}
          </Badge>
        ) : null}
      </div>
      <div className="border-t border-[var(--bellum-border)]">{children}</div>
    </Card>
  )
}

/* ─── Besoins historiques (#4760) ───────────────────────────────────────────── */

/**
 * #4760 — ce que l'analyse a LU de l'historique du compte : les signaux que la fenêtre de fraîcheur a rangés en
 * archive (plus de 180 jours), nommés avec leur date réelle. Avant, la couche était calculée et journalisée, jamais
 * montrée. Les OFFRES d'emploi anciennes portent déjà leur bloc « Besoins historiques » (#4757, `JobSignalsCard`) :
 * les lignes `source: 'job_offer'` de `historical_needs` voyagent dans le dossier pour l'API et Laura, mais ne se
 * répètent pas ici (GA-26).
 * Une date absente se tait — jamais « non daté » ni une date devinée ; zéro besoin = aucune ligne : c'est le
 * PARENT qui ne monte pas la carte (`hasHistoricalNeeds`), la carte ne rend jamais `null` (#4805).
 */
function HistoricalNeedsCard({ signals }: { signals: NonNullable<AccountAnalysis['historical_needs']>['items'] }) {
  const { t } = useTranslation('accountDetail')
  return (
    <SectionCard
      icon={<History className="size-4" />}
      title={t('publicData.historicalNeeds.title')}
      help={t('publicData.historicalNeeds.help')}
    >
      <ul className="flex flex-col gap-2 px-4 py-3" data-testid="historical-needs">
        {signals.map((need, idx) => {
          const date = formatSignalDateIfKnown(need.date)
          return (
            <li key={`${need.label}-${idx}`} className="text-sm text-[var(--bellum-text-secondary)]">
              {need.label}
              {date ? <span className="text-[var(--bellum-text-muted)]"> — {date}</span> : null}
            </li>
          )
        })}
      </ul>
    </SectionCard>
  )
}

/* ─── Financials (Pappers) ──────────────────────────────────────────────────── */

function FinancialsCard({
  analysis,
  groupRevenue,
  accountId,
  signalsCollectedAt,
}: {
  analysis: AccountAnalysis
  groupRevenue?: string | null
  accountId?: string
  signalsCollectedAt?: string | null
}) {
  const { t, i18n } = useTranslation('accountDetail')
  const locale = i18n.language
  const years: FinancialYear[] = (analysis.financials_history ?? []).slice(0, 3)
  // Recette 13/10 (fiche EDF) — une colonne sans AUCUNE valeur ne s'affiche pas
  // (« On n'affiche pas ce qu'on n'a pas »).
  const showHeadcount = years.some(year => formatCount(year.headcount, locale) != null)
  const capital = formatEuros(analysis.capital, locale)
  const rows: Array<{ label: string; value: string }> = []
  if (analysis.legal_form) rows.push({ label: t('publicData.financials.legalForm'), value: analysis.legal_form })
  if (capital) rows.push({ label: t('publicData.financials.capital'), value: capital })
  // #3499 — jamais la date brute « 1982-01-01 » : formatée, ou omise si illisible.
  // #5 — « 1 janv. 1900 » est la date inconnue d'un registre : jamais affichée.
  const created = formatRegistryDateIfKnown(analysis.creation_date)
  if (created) rows.push({ label: t('publicData.financials.created'), value: created })
  // #recette-21-10-K1 — le CA du groupe se lit « consolidé », à côté de comptes sociaux
  // qui, eux, portent le nom de leur entité.
  const consolidated = years.length > 0 ? displayRecordedRevenue(groupRevenue, locale) : null
  if (consolidated) rows.push({ label: t('publicData.financials.groupRevenue'), value: consolidated })
  // Un résultat net supérieur au CA la même année = une holding qui encaisse les
  // dividendes de ses filiales ; on le DIT plutôt que de laisser un chiffre absurde.
  const holdingLike = years.some(
    year => typeof year.revenue === 'number' && typeof year.net_result === 'number' && year.net_result > year.revenue,
  )
  const entityName = analysis.legal_name?.trim()

  if (years.length === 0 && rows.length === 0)
    return <NamedAbsence what={t('publicData.financials.title')} testId="public-data-financials-absence" />
  const pappersHref = safeHref(analysis.pappers_url ?? undefined)

  // Théo p16 §1 : le badge « Source : Pappers » ne décore plus l'en-tête de la
  // carte côté commercial. La provenance reste accessible — mais comme un
  // DÉTAIL DE PREUVE (le lien Pappers en pied de carte), pas un ornement.
  return (
    <SectionCard
      icon={<Landmark className="size-4" />}
      title={t('publicData.financials.title')}
      help={t('publicData.financials.help')}
    >
      {years.length > 0 ? (
        <Text element="p" size="xs" className="px-4 pt-3 text-[var(--bellum-text-muted)]">
          {entityName
            ? t('publicData.financials.entityAccounts', { name: entityName })
            : t('publicData.financials.entityAccountsUnnamed')}
        </Text>
      ) : null}
      {/* K1 22/10 — un correctif de collecte RATTRAPE l'existant : sans nom légal, l'écran dit si c'est la collecte
          qui est antérieure (le champ n'existe que depuis le 21/10) et propose le geste existant, jamais un second. */}
      {years.length > 0 && !entityName && legalNameCollectionIsOlder(signalsCollectedAt) ? (
        <div className="px-4 pt-3">
          <LegalNameStaleNotice accountId={accountId} signalsCollectedAt={signalsCollectedAt} />
        </div>
      ) : null}
      {years.length > 0 ? (
        // #2588 — un tableau large ne renvoie pas le navigateur en arrière.
        <div className={cn('overflow-x-auto px-4 py-3', HORIZONTAL_OVERSCROLL_CLASS)}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--bellum-text-muted)]">
                <th className="pb-2 pr-3 font-medium">{t('publicData.financials.year')}</th>
                <th className="pb-2 pr-3 text-right font-medium">{t('publicData.financials.revenue')}</th>
                <th className="pb-2 pr-3 text-right font-medium">{t('publicData.financials.netResult')}</th>
                {showHeadcount ? (
                  <th className="pb-2 text-right font-medium">{t('publicData.financials.headcount')}</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {years.map((year, idx) => (
                <tr key={year.year ?? idx} className="border-t border-[var(--bellum-border)]">
                  <td className="py-1.5 pr-3 text-[var(--bellum-text-secondary)]">{year.year ?? '—'}</td>
                  <td className="py-1.5 pr-3 text-right text-[var(--bellum-text-primary)]">
                    {formatEuros(year.revenue, locale) ?? '—'}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-[var(--bellum-text-primary)]">
                    {formatEuros(year.net_result, locale) ?? '—'}
                  </td>
                  {showHeadcount ? (
                    <td className="py-1.5 text-right text-[var(--bellum-text-secondary)]">
                      {formatCount(year.headcount, locale) ?? '—'}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {holdingLike ? (
        <Text element="p" size="xs" className="px-4 pb-2 text-[var(--bellum-text-muted)]">
          {t('publicData.financials.holdingNote')}
        </Text>
      ) : null}

      {rows.length > 0 ? (
        <div className="px-4 py-1">
          {rows.map(row => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-3 border-b border-[var(--bellum-border)] py-2.5 last:border-0"
            >
              <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
                {row.label}
              </Text>
              <Text element="span" size="xs" weight="medium" className="text-right text-[var(--bellum-text-primary)]">
                {row.value}
              </Text>
            </div>
          ))}
        </div>
      ) : null}

      {pappersHref ? (
        <div className="px-4 py-3">
          <a
            href={pappersHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--bellum-text-secondary)] transition-colors hover:text-[var(--bellum-text-accent)]"
          >
            {t('publicData.financials.pappersLink')}
          </a>
        </div>
      ) : null}
    </SectionCard>
  )
}

/* ─── SEC/EDGAR financials (US listed companies) ────────────────────────────── */

const LEGAL_NAME_CAPABILITY_ISSUE = '#4398.2'

// Même critère que le bandeau (GA-26) ; évalué ICI pour ne monter la mutation d'actualisation que si l'avis s'affiche.
function legalNameCollectionIsOlder(signalsCollectedAt: string | null | undefined): boolean {
  const capabilityAt = segmentCapabilityAt('signals', LEGAL_NAME_CAPABILITY_ISSUE)
  return Boolean(capabilityAt && signalsCollectedAt && isSegmentCollectionStale(signalsCollectedAt, capabilityAt))
}

function LegalNameStaleNotice({
  accountId,
  signalsCollectedAt,
}: {
  accountId?: string | undefined
  signalsCollectedAt?: string | null | undefined
}) {
  const { t } = useTranslation('projects')
  const refresh = useRefreshDimension(accountId ?? '')
  return (
    <SegmentStaleCollectionNotice
      dimension="signals"
      capabilityIssue={LEGAL_NAME_CAPABILITY_ISSUE}
      i18nPrefix="overviewTab.legalNameStaleCollection"
      collectedAt={signalsCollectedAt ?? null}
      hideWhenUndated
      {...(accountId
        ? {
            action: {
              label: t('accountOpportunity.refreshSignals', { count: REFRESH_DIMENSION_CREDIT_COST.signals }),
              onClick: () => refresh.mutate('signals'),
              pending: refresh.isPending,
            },
          }
        : {})}
    />
  )
}

function UsSecFinancialsCard({
  data,
  entityName,
}: {
  data: UsSecFinancials | null | undefined
  entityName?: string | null
}) {
  const { t, i18n } = useTranslation('accountDetail')
  const locale = i18n.language
  if (!data) return null
  const rows = buildSecFinancialRows(data)
  const shares = data.shares_outstanding
  const sharesVal = formatCount(shares?.val, locale)
  const filings = (data.filings ?? []).filter((f): f is SecFiling => Boolean(f?.url && f?.date)).slice(0, 5)
  if (rows.length === 0 && !sharesVal && filings.length === 0) return null
  const edgarHref = safeHref(data.filing_url ?? data.detail_url ?? undefined)

  return (
    <SectionCard
      icon={<LineChart className="size-4" />}
      title={t('publicData.usSecFinancials.title')}
      source={t('publicData.usSecFinancials.source')}
      help={t('publicData.usSecFinancials.help')}
    >
      {rows.length > 0 ? (
        <Text element="p" size="xs" className="px-4 pt-3 text-[var(--bellum-text-muted)]">
          {t('publicData.usSecFinancials.filer', { name: entityName?.trim() || `CIK ${data.cik ?? '—'}` })}
        </Text>
      ) : null}
      {rows.length > 0 ? (
        // #2588 — un tableau large ne renvoie pas le navigateur en arrière.
        <div className={cn('overflow-x-auto px-4 py-3', HORIZONTAL_OVERSCROLL_CLASS)}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--bellum-text-muted)]">
                <th className="pb-2 pr-3 font-medium">{t('publicData.usSecFinancials.fiscalYear')}</th>
                <th className="pb-2 pr-3 text-right font-medium">{t('publicData.usSecFinancials.revenue')}</th>
                <th className="pb-2 pr-3 text-right font-medium">{t('publicData.usSecFinancials.netIncome')}</th>
                <th className="pb-2 text-right font-medium">{t('publicData.usSecFinancials.filed')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.end} className="border-t border-[var(--bellum-border)]">
                  <td className="py-1.5 pr-3 text-[var(--bellum-text-secondary)]">{row.end}</td>
                  <td className="py-1.5 pr-3 text-right text-[var(--bellum-text-primary)]">
                    {formatUsd(row.revenue, locale) ?? '—'}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-[var(--bellum-text-primary)]">
                    {formatUsd(row.netIncome, locale) ?? '—'}
                  </td>
                  <td className="py-1.5 text-right text-[var(--bellum-text-secondary)]">{row.filed ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {sharesVal ? (
        <div className="px-4 py-1">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--bellum-border)] py-2.5 last:border-0">
            <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
              {t('publicData.usSecFinancials.sharesOutstanding')}
            </Text>
            <Text element="span" size="xs" weight="medium" className="text-right text-[var(--bellum-text-primary)]">
              {shares?.end
                ? t('publicData.usSecFinancials.sharesValueAt', { value: sharesVal, date: shares.end })
                : sharesVal}
            </Text>
          </div>
        </div>
      ) : null}

      {filings.length > 0 ? (
        <div className="border-t border-[var(--bellum-border)] px-4 py-3">
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
            {t('publicData.usSecFinancials.recentFilings')}
          </Text>
          <div className="mt-2 flex flex-col gap-2.5">
            {filings.map((filing, idx) => {
              const href = safeHref(filing.url ?? undefined)
              return (
                <div key={filing.url ?? idx} className="flex flex-col gap-0.5">
                  <Text element="span" size="xs" weight="medium" className="text-[var(--bellum-text-primary)]">
                    {[filing.form, filing.date].filter(Boolean).join(' · ')}
                  </Text>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--bellum-text-accent)] hover:underline"
                    >
                      {t('publicData.usSecFinancials.viewFiling')}
                    </a>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {edgarHref ? (
        <div className="border-t border-[var(--bellum-border)] px-4 py-3">
          <a
            href={edgarHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--bellum-text-secondary)] transition-colors hover:text-[var(--bellum-text-accent)]"
          >
            {t('publicData.usSecFinancials.viewOnEdgar')}
          </a>
        </div>
      ) : null}
    </SectionCard>
  )
}

/* ─── Tech stack (tech-detect + Apollo) ─────────────────────────────────────── */

/**
 * La stack technique — détection sur site, réseau professionnel, ET analyse.
 *
 * ⚠️ La troisième source (`raw_analysis.technology_stack[]`) n'était lue par
 * AUCUN écran : la carte ne montrait que des noms nus venus des deux premières.
 * Elle seule porte l'usage (« à quoi ça leur sert ») et la maturité (« où ils en
 * sont »), qui sont exactement ce qui distingue une accroche d'un mot-clé.
 *
 * Les entrées qui portent cette matière se rendent en LIGNES, celles qui n'ont
 * qu'un nom restent des pastilles : une pastille « Cloud hybride — » suggérerait
 * qu'on a perdu quelque chose, alors qu'on n'a jamais rien su.
 */
function TechStackCard({
  detected,
  apollo,
  analysed,
  observed,
}: {
  detected: string[] | undefined
  apollo: AnalysisApolloOrgEnrichment['technologies'] | undefined
  analysed: TechnologyEntry[] | undefined
  /** #1607.2 — l'environnement OBSERVÉ, à côté et jamais fusionné. */
  observed: readonly string[]
}) {
  const { t } = useTranslation('accountDetail')
  const [showDetail, setShowDetail] = useState(false)
  const stack = mergeTechStack(detected, apollo, analysed)
  if (stack.length === 0 && observed.length === 0)
    return <NamedAbsence what={t('publicData.tech.title')} testId="public-data-tech-absence" />

  const described = stack.filter(row => row.usage || row.maturity)
  /**
   * recette 10/09 — mesuré sur BNP Paribas : sous les technologies DÉCRITES
   * ci-dessus (source + maturité, un raisonnement), un déversement
   * alphabétique de dizaines de noms nus — `.GIS`, `/DB`, `3M 360
   * Encompass…`, `ABB Distributed Control Systems`… Ce n'est jamais
   * `detected` (détection sur site, ~30 signatures curées MAX,
   * `tech_detect.py`) qui produit ce volume : c'est le technographe d'Apollo,
   * exhaustif et bruyant pour une grande entreprise. Une poignée de pastilles
   * nues reste utile (React, AWS…) ; un déversement de dizaines ne l'est pas
   * — borné au même ordre de grandeur que la liste raisonnée au-dessus.
   */
  // #3499 — « Technologies en place : pondération etc. on sait pas ce que ça
  // veut dire ». Les HUIT plus présentes en pastilles, chacune avec un libellé
  // humain (très présente / présente / ponctuelle) ; le détail chiffré
  // (« Pondération 42 sur les profils en poste… ») seulement derrière
  // « Voir le détail ». Même borne de huit que ci-dessus.
  const pills = buildTechPills(stack)
  // #3499 — une technologie déjà en pastille ne se répète PAS dans les
  // environnements observés (SQL/Java vus deux fois en recette) : un seul
  // endroit. Les deux origines restent séparées (#1607.2) ; seul le doublon
  // exact (casse et espaces ignorés) est retiré du bloc observé.
  const shownNames = new Set(pills.map(pill => pill.name.trim().toLowerCase()))
  const observedOnly = observed.filter(name => !shownNames.has(name.trim().toLowerCase()))

  return (
    <SectionCard icon={<Cpu className="size-4" />} title={t('publicData.tech.title')} help={t('publicData.tech.help')}>
      <div className="px-4 py-3">
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('publicData.tech.subtitle')}
        </Text>
        {pills.length > 0 ? (
          <ul data-testid="tech-pills" className="mt-2 flex flex-wrap gap-1.5">
            {pills.map(pill => (
              <li key={pill.name} className="min-w-0 max-w-full">
                <Badge className="max-w-full overflow-hidden border-0 bg-[var(--bellum-surface-2)] px-2 py-0.5 text-xs font-normal text-[var(--bellum-text-primary)]">
                  {pill.name}
                  {pill.presence ? (
                    <span className="text-[var(--bellum-text-muted)]">
                      {' · '}
                      {t(`synthesis.tech.${pill.presence}`)}
                    </span>
                  ) : null}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
        {described.length > 0 ? (
          <button
            type="button"
            aria-expanded={showDetail}
            onClick={() => setShowDetail(open => !open)}
            className="mt-2 inline-flex min-h-11 items-center text-xs font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline md:min-h-6"
          >
            {showDetail ? t('synthesis.tech.hideDetail') : t('synthesis.tech.showDetail')}
          </button>
        ) : null}
        {described.length > 0 && showDetail ? (
          <ul className="mt-2 space-y-2">
            {described.map(row => (
              <li key={row.name} className="min-w-0">
                <Text size="xs" weight="medium">
                  {row.name}
                </Text>
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {[row.usage, row.maturity ? t('publicData.tech.maturity', { value: row.maturity }) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </li>
            ))}
          </ul>
        ) : null}
        {observedOnly.length > 0 ? <ObservedStackBlock technos={observedOnly} /> : null}
      </div>
    </SectionCard>
  )
}

/**
 * #1607.2 — L'ENVIRONNEMENT TECHNOLOGIQUE OBSERVÉ, ET POURQUOI IL EST À PART.
 *
 * « Ne pas fusionner silencieusement les deux » — le retour l'écrit, et c'est la
 * seule chose qui compte ici. Les deux blocs ne répondent pas à la même question :
 *
 *  · TECHNOLOGIES DÉTECTÉES — ce que l'entreprise utilise, d'après ses propres
 *    traces publiques (site, offres d'emploi, enrichissement) ;
 *  · ENVIRONNEMENTS OBSERVÉS — les technologies vues dans les parcours de
 *    prestataires passés par cette entreprise. Elles ne prouvent pas un usage
 *    actuel, et leur ABSENCE ne prouve rien du tout (#1611 : « même avec 25
 *    technologies observées, l'absence dans un échantillon ne prouve pas que la
 *    technologie est absente de l'entreprise »).
 *
 * Les fondre en une liste ferait passer les secondes pour les premières.
 *
 * ⚠️ Bornée à huit puis « +N » (le retour le demande), et la coupe se DIT : une
 * liste tronquée en silence se lit comme une liste complète.
 */
const OBSERVED_STACK_MAX_CHIPS = 8

function ObservedStackBlock({ technos }: { technos: readonly string[] }) {
  const { t } = useTranslation('accountDetail')
  const shown = technos.slice(0, OBSERVED_STACK_MAX_CHIPS)
  const rest = technos.length - shown.length

  return (
    <div className="mt-4 border-t border-[var(--bellum-border)] pt-3">
      <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
        {t('publicData.tech.observedTitle')}
      </Text>
      <Text size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
        {t('publicData.tech.observedHint')}
      </Text>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {shown.map(techno => (
          <Badge
            key={techno}
            className="border-0 bg-[var(--bellum-surface-2)] px-1.5 py-0.5 text-xs font-normal text-[var(--bellum-text-secondary)]"
          >
            {techno}
          </Badge>
        ))}
        {rest > 0 ? (
          <Text size="xs" className="self-center text-[var(--bellum-text-muted)]">
            {t('publicData.tech.observedMore', { count: rest })}
          </Text>
        ) : null}
      </div>
    </div>
  )
}

/* ─── Officers + beneficial owners (Pappers / INPI) ─────────────────────────── */

function officerName(person: Executive): string | null {
  const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim()
  return name.length > 0 ? name : null
}

function LeadershipCard({ analysis }: { analysis: AccountAnalysis }) {
  const { t, i18n } = useTranslation('accountDetail')
  // #1086 : la liste était coupée à huit AVANT tout classement, si bien qu'une
  // mutuelle affichait ses huit premiers administrateurs et jamais son directeur
  // des systèmes d'information, plus bas dans l'ordre du registre. On classe,
  // PUIS on coupe — et la coupe se dit, au lieu de faire croire qu'il n'y a que
  // huit mandataires.
  const { officers, hiddenCount } = rankOfficers(
    [...(analysis.c_level ?? []), ...(analysis.executives ?? [])].flatMap(person => {
      const name = officerName(person)
      return name ? [{ name, role: person.role ?? null }] : []
    }),
  )
  const owners = (analysis.beneficial_owners ?? []).filter((o): o is BeneficialOwner => Boolean(o?.name)).slice(0, 8)

  if (officers.length === 0 && owners.length === 0)
    return <NamedAbsence what={t('publicData.leadership.title')} testId="public-data-leadership-absence" />

  return (
    <SectionCard
      icon={<Users className="size-4" />}
      title={t('publicData.leadership.title')}
      source={t('publicData.leadership.source')}
      help={t('publicData.leadership.help')}
    >
      {officers.length > 0 ? (
        <div className="px-4 py-3">
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
            {t('publicData.leadership.officers')}
          </Text>
          <div className="mt-2 flex flex-col gap-1.5">
            {officers.map(officer => (
              <div key={officer.name} className="flex items-center justify-between gap-3">
                <Text element="span" size="xs" className="text-[var(--bellum-text-primary)]">
                  {officer.name}
                </Text>
                {officer.role ? (
                  <Text element="span" size="xs" className="text-right text-[var(--bellum-text-secondary)]">
                    {officer.role}
                  </Text>
                ) : null}
              </div>
            ))}
          </div>
          {hiddenCount > 0 ? (
            <Text size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
              {t('publicData.leadership.more', { count: hiddenCount })}
            </Text>
          ) : null}
        </div>
      ) : null}

      {owners.length > 0 ? (
        <div className="border-t border-[var(--bellum-border)] px-4 py-3">
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
            {t('publicData.leadership.owners')}
          </Text>
          <div className="mt-2 flex flex-col gap-1.5">
            {owners.map(owner => {
              const share = formatPercent(owner.detention_part, i18n.language)
              return (
                <div key={owner.name ?? ''} className="flex items-center justify-between gap-3">
                  <Text element="span" size="xs" className="text-[var(--bellum-text-primary)]">
                    {owner.name}
                  </Text>
                  {share ? (
                    <Text element="span" size="xs" className="text-right text-[var(--bellum-text-secondary)]">
                      {t('publicData.leadership.ownerShare', { value: share })}
                    </Text>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </SectionCard>
  )
}

/* ─── Annonces légales (BODACC) — #3916 ─────────────────────────────────────── */

/** Au-delà, la liste se replie : toutes les annonces restent à un geste. */
const LEGAL_NOTICES_FOLDED = 8

function LegalNoticesCard({
  signals,
  registry,
  recentSignals,
}: {
  signals: LegalSignal[] | undefined
  registry: AccountRegistryAnnouncements | null
  /** #3916 — R25 : les annonces BODACC que seul `recent_signals` porte. */
  recentSignals?: unknown
}) {
  const { t } = useTranslation('accountDetail')
  const [expanded, setExpanded] = useState(false)
  // #3916.b — TOUTES les annonces, pas seulement les 8 de l'analyse.
  const all = groupClosureNotices(mergeLegalNotices(signals, registry?.announcements, recentSignals))
  if (all.length === 0) return null
  const notices = expanded ? all : all.slice(0, LEGAL_NOTICES_FOLDED)
  const checkedAt = registry?.checkedAt ? formatSignalDateIfKnown(registry.checkedAt.slice(0, 10)) : null

  return (
    <SectionCard
      icon={<Scale className="size-4" />}
      title={t('publicData.legal.title')}
      source={t('publicData.legal.source')}
      help={t('publicData.legal.help')}
    >
      <div className="flex flex-col gap-2.5 px-4 py-3">
        {notices.map((notice, idx) => {
          const href = safeHref(notice.url ?? undefined)
          const date = formatSignalDateIfKnown(notice.date)
          // The registry kind decides the wording; the source id itself never reaches the screen.
          const fromRegistry = notice.source === 'sirene' || notice.source === 'rne'
          // #3921.11 — les fermetures d'établissement regroupées : UNE ligne dépliable (« 80 établissements fermés
          // entre <date> et <date> »), chaque fermeture reste lisible dedans.
          if (notice.members) {
            const dates = notice.members.map(member => member.date).filter((day): day is string => Boolean(day))
            const oldest = dates.length > 0 ? dates.reduce((a, b) => (a < b ? a : b)) : null
            const newest = dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null
            return (
              <details key={`closures-${idx}`} className="flex flex-col gap-0.5" data-testid="legal-closures-group">
                <summary className="min-h-11 cursor-pointer py-1 text-xs font-medium text-[var(--bellum-text-primary)]">
                  {oldest && newest
                    ? t('publicData.legal.closedGroup', {
                        count: notice.members.length,
                        from: formatSignalDateIfKnown(oldest),
                        to: formatSignalDateIfKnown(newest),
                      })
                    : t('publicData.legal.closedGroupUndated', { count: notice.members.length })}
                </summary>
                <ul className="mt-1 flex flex-col gap-0.5 pl-3">
                  {notice.members.map((member, memberIdx) => (
                    <li key={`${member.date ?? ''}-${memberIdx}`}>
                      <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                        {[member.type, formatSignalDateIfKnown(member.date)].filter(Boolean).join(' · ')}
                      </Text>
                    </li>
                  ))}
                </ul>
              </details>
            )
          }
          return (
            <div key={`${notice.type}-${notice.date ?? ''}-${idx}`} className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <Text element="span" size="xs" weight="medium" className="text-[var(--bellum-text-primary)]">
                  {notice.type}
                </Text>
                {notice.severity === 'risk' ? (
                  <Badge className="border-0 bg-[var(--warning-soft-bg)] px-1.5 py-0.5 text-xs font-normal text-[var(--warning-soft-text)]">
                    {t('publicData.legal.risk')}
                  </Badge>
                ) : null}
              </div>
              <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                {[
                  date,
                  notice.tribunal,
                  notice.source === 'sirene' ? t('publicData.legal.sireneSource') : null,
                  notice.source === 'rne' ? t('publicData.legal.rneSource') : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--bellum-text-accent)] hover:underline"
                >
                  {fromRegistry ? t('publicData.legal.viewRegistry') : t('publicData.legal.viewNotice')}
                </a>
              ) : (
                <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('publicData.legal.noLink')}
                </Text>
              )}
            </div>
          )
        })}
        {all.length > LEGAL_NOTICES_FOLDED ? (
          <button
            type="button"
            onClick={() => setExpanded(value => !value)}
            className="min-h-11 self-start text-xs text-[var(--bellum-text-accent)] hover:underline"
          >
            {expanded
              ? t('publicData.legal.showLess')
              : t('publicData.legal.showAll', { count: all.length - LEGAL_NOTICES_FOLDED })}
          </button>
        ) : null}
        {registry ? (
          <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
            {checkedAt ? t('publicData.legal.checkedAt', { date: checkedAt }) : t('publicData.legal.notWatched')}
            {registry.truncated ? ` ${t('publicData.legal.truncated')}` : ''}
          </Text>
        ) : null}
      </div>
    </SectionCard>
  )
}

/* ─── Public tenders (BOAMP) + awarded contracts (DECP) ─────────────────────── */

function publishedLabel(value: string | null | undefined): string | null {
  return formatDate(value, { day: 'numeric', month: 'long', year: 'numeric' })
}

function TendersCard({
  tenders,
  awarded,
  registry,
}: {
  tenders: PublicTender[] | undefined
  awarded: AwardedContract[] | undefined
  /** #3915.decp — les marchés attribués relus en continu par SIREN (veille). */
  registry: RegistryAnnouncement[] | undefined
}) {
  const { t, i18n } = useTranslation('accountDetail')
  const openTenders = (tenders ?? []).filter((x): x is PublicTender => Boolean(x?.title)).slice(0, 5)
  const awardedList = mergeAwardedContracts(awarded, registry).slice(0, 5)
  if (openTenders.length === 0 && awardedList.length === 0) return null

  return (
    <SectionCard
      icon={<FileText className="size-4" />}
      title={t('publicData.tenders.title')}
      source={t('publicData.tenders.source')}
      help={t('publicData.tenders.help')}
    >
      {openTenders.length > 0 ? (
        <div className="px-4 py-3">
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
            {t('publicData.tenders.open')}
          </Text>
          <div className="mt-2 flex flex-col gap-2.5">
            {openTenders.map((tender, idx) => {
              const href = safeHref(tender.url ?? undefined)
              return (
                <div key={tender.url ?? idx} className="flex flex-col gap-0.5">
                  <Text element="span" size="xs" weight="medium" className="text-[var(--bellum-text-primary)]">
                    {tender.title}
                  </Text>
                  <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                    {[
                      tender.buyer,
                      // #4116 — la date de publication ; absente (ou illisible) = rien.
                      publishedLabel(tender.published_date)
                        ? t('publicData.tenders.published', { value: publishedLabel(tender.published_date) })
                        : null,
                      tender.deadline ? t('publicData.tenders.deadline', { value: tender.deadline }) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--bellum-text-accent)] hover:underline"
                    >
                      {t('publicData.tenders.viewSource')}
                    </a>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {awardedList.length > 0 ? (
        <div className="border-t border-[var(--bellum-border)] px-4 py-3">
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
            {t('publicData.tenders.awarded')}
          </Text>
          <div className="mt-2 flex flex-col gap-2.5">
            {awardedList.map((contract, idx) => {
              const amount = formatEuros(contract.amount, i18n.language)
              const href = safeHref(contract.url ?? undefined)
              return (
                <div
                  key={contract.url ?? `${contract.title}|${contract.date ?? idx}`}
                  className="flex flex-col gap-0.5"
                >
                  <Text element="span" size="xs" weight="medium" className="text-[var(--bellum-text-primary)]">
                    {contract.title}
                  </Text>
                  <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                    {[
                      // #3915.decp — le compte TITULAIRE : l'acheteur est nommé quand le registre le connaît.
                      contract.won
                        ? contract.buyer
                          ? t('publicData.tenders.wonFrom', { value: contract.buyer })
                          : t('publicData.tenders.won')
                        : contract.winner
                          ? t('publicData.tenders.winner', { value: contract.winner })
                          : null,
                      // #4286.1 — l'acheteur d'un marché figé par l'analyse se nomme aussi (jamais seul le titulaire).
                      !contract.won && contract.buyer ? t('publicData.tenders.buyer', { value: contract.buyer }) : null,
                      amount,
                      // #3915.decp — un marché attribué est un signal DATÉ ; sans date, rien.
                      publishedLabel(contract.date)
                        ? t('publicData.tenders.notified', { value: publishedLabel(contract.date) })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--bellum-text-accent)] hover:underline"
                    >
                      {t('publicData.tenders.viewSource')}
                    </a>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </SectionCard>
  )
}

/* ─── IT job postings (France Travail / APEC / WTTJ) ────────────────────────── */

type FoldedJob = JobSignal & { offerCount?: number; offerPlaces: string[] }

// K3 22/10 — cette liste ne porte QUE des offres (flux « jobs ») : tout s'y plie, sans condition de source_kind.
function foldJobPostings(jobs: JobSignal[]): FoldedJob[] {
  const out: FoldedJob[] = []
  const byTitle = new Map<string, FoldedJob>()
  for (const job of jobs) {
    const key = offerTitleKey(job.title ?? '')
    const first = key ? byTitle.get(key) : undefined
    const place = job.location?.trim()
    if (!first) {
      const entry: FoldedJob = { ...job, offerPlaces: place ? [place] : [] }
      out.push(entry)
      if (key) byTitle.set(key, entry)
      continue
    }
    first.offerCount = (first.offerCount ?? 1) + 1
    if (place && !first.offerPlaces.includes(place)) first.offerPlaces.push(place)
  }
  return out
}

// #4757 — au-delà de six mois une offre est pourvue ou abandonnée : même fenêtre que l'estampillage de fraîcheur
// côté IA (`_ARCHIVE_AFTER_DAYS_BY_TYPE['recrutement']`, signal_freshness.py). Un réglage, deux lectures (GA-26).
const JOB_RECENT_WINDOW_DAYS = 180
const JOB_RECENT_PAGE = 6
const JOB_HISTORY_PAGE = 10
// #4754 — la capacité qui rend l'historique complet ; une collecte antérieure le DIT (rattrapage, Louis 18/09/2026).
const JOB_HISTORY_CAPABILITY_ISSUE = '#4754'

// Même critère que le bandeau (GA-26) ; évalué ICI pour ne monter le bandeau que s'il a quelque chose à dire
// (tant que #4754 n'est pas inscrit à l'historique des capacités, la carte reste byte-identique).
function jobsHistoryCollectionIsOlder(signalsCollectedAt: string | null | undefined): boolean {
  const capabilityAt = segmentCapabilityAt('signals', JOB_HISTORY_CAPABILITY_ISSUE)
  return Boolean(capabilityAt && signalsCollectedAt && isSegmentCollectionStale(signalsCollectedAt, capabilityAt))
}

/** La FIN de la période que la date nomme (un mois = son dernier jour), `null` si elle ne se lit pas : jamais devinée. */
function jobDateMs(raw: string | null | undefined): number | null {
  const value = parseSignalDate(raw)
  switch (value.kind) {
    case 'day':
      return Date.UTC(value.year, value.month - 1, value.day)
    case 'month':
      return Date.UTC(value.year, value.month, 0)
    case 'year':
      return Date.UTC(value.year, 11, 31)
    default:
      return null
  }
}

/** Récent = daté dans la fenêtre, OU sans date lisible (on ne range pas dans l'historique ce qu'on ne sait pas dater). */
function splitJobsByAge(jobs: JobSignal[], nowMs: number): { recent: JobSignal[]; history: JobSignal[] } {
  const limit = nowMs - JOB_RECENT_WINDOW_DAYS * 86_400_000
  const recent: JobSignal[] = []
  const history: JobSignal[] = []
  for (const job of jobs) {
    const at = jobDateMs(job.date)
    ;(at !== null && at < limit ? history : recent).push(job)
  }
  return { recent, history }
}

/** Du plus récent au moins récent ; les offres sans date lisible après les datées (tri stable). */
function sortJobsByDateDesc<T extends { date?: string | null }>(jobs: T[]): T[] {
  return jobs
    .map((job, idx) => ({ job, idx, at: jobDateMs(job.date) }))
    .sort((x, y) => (y.at ?? Number.NEGATIVE_INFINITY) - (x.at ?? Number.NEGATIVE_INFINITY) || x.idx - y.idx)
    .map(entry => entry.job)
}

/** #2322.70 — pourquoi l'offre est « en tension » : la raison que l'offre prouve, sinon la mention d'origine (source). */
function tensionHelp(t: TFunction, job: JobSignal): string {
  const reason = job.tension_reason
  if (!reason) return t('publicData.jobs.tensionHelp')
  // Une durée absente n'est jamais « 0 jour » : sans elle, la phrase qui la cite cède la place à la mention d'origine.
  if (reason === 'online_long' && job.tension_days == null) return t('publicData.jobs.tensionHelp')
  return t(`publicData.jobs.tensionReason.${reason}`, {
    days: job.tension_days,
    defaultValue: t('publicData.jobs.tensionHelp'),
  })
}

function JobRow({ job, kind }: { job: FoldedJob; kind: 'recent' | 'history' }) {
  const { t } = useTranslation('accountDetail')
  const href = safeHref(job.url ?? undefined)
  // #2322.70 — une famille inconnue du dictionnaire ne fait aucune ligne (jamais la clé brute à l'écran).
  const roleLabel = job.role ? t(`publicData.jobs.role.${job.role}`, { defaultValue: '' }) : ''
  const skills = (job.skills ?? []).filter(Boolean)
  // #3097 — la séniorité recherchée (le niveau d'expérience affiché
  // par la source) et le salaire/TJM, seulement quand LA SOURCE les
  // affiche (`experience`/`salary` sont `null` sinon) — jamais
  // estimés. Ces deux champs existaient déjà au contrat
  // (`jobSignalSchema`) sans jamais atteindre cette carte.
  // #3499 — la date de l'offre arrive en ISO brut : formatée, ou omise.
  const meta = [
    job.contract_type,
    job.experience,
    job.salary,
    job.offerCount
      ? t(job.offerPlaces.length > 0 ? 'publicData.jobs.folded' : 'publicData.jobs.foldedNoPlace', {
          count: job.offerCount,
          places: job.offerPlaces.join(', '),
        })
      : job.location,
    formatSignalDateIfKnown(job.date),
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div data-testid={`job-row-${kind}`} className="flex flex-col gap-0.5">
      <Text element="span" size="xs" weight="medium" className="text-[var(--bellum-text-primary)]" data-job-title>
        {job.title}
      </Text>
      {/* #2322.70 — seulement quand la SOURCE signale le manque de candidats ; absent = rien. */}
      {job.tension === true ? (
        <Text
          element="span"
          size="xs"
          weight="medium"
          className="text-[var(--bellum-warning-text)]"
          title={tensionHelp(t, job)}
        >
          {t('publicData.jobs.tension')}
        </Text>
      ) : null}
      {/* #2322.70 — rôle, équipe, compétences : chacun seulement quand l'offre le porte (absent = aucune ligne). */}
      {roleLabel ? (
        <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]" data-testid="job-role">
          {roleLabel}
        </Text>
      ) : null}
      {job.team ? (
        <Text
          element="span"
          size="xs"
          className="break-words text-[var(--bellum-text-secondary)]"
          data-testid="job-team"
        >
          {t('publicData.jobs.team', { value: job.team })}
        </Text>
      ) : null}
      {skills.length > 0 ? (
        <Text
          element="span"
          size="xs"
          className="break-words text-[var(--bellum-text-secondary)]"
          data-testid="job-skills"
        >
          {skills.join(' · ')}
        </Text>
      ) : null}
      {meta ? (
        <Text element="span" size="xs" className="break-words text-[var(--bellum-text-secondary)]">
          {meta}
        </Text>
      ) : null}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[var(--bellum-text-accent)] hover:underline"
        >
          {t('publicData.jobs.viewOffer')}
        </a>
      ) : null}
    </div>
  )
}

/** Un bloc daté : son titre dit son compte TOTAL, la liste se déplie par pages — jamais une troncature muette. */
function JobsBlock({
  kind,
  jobs,
  firstPage,
  pageSize,
}: {
  kind: 'recent' | 'history'
  jobs: FoldedJob[]
  firstPage: number
  pageSize: number
}) {
  const { t } = useTranslation('accountDetail')
  const [shown, setShown] = useState(firstPage)
  if (jobs.length === 0) return null
  const remaining = jobs.length - shown
  return (
    <div data-testid={`jobs-${kind}`} className="mt-3 first:mt-2">
      <Text element="h4" size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
        {t(`publicData.jobs.${kind}Title`, { count: jobs.length })}
      </Text>
      <div className="mt-2 flex flex-col gap-2.5">
        {jobs.slice(0, shown).map((job, idx) => (
          <JobRow key={`${job.url ?? ''}-${idx}`} job={job} kind={kind} />
        ))}
      </div>
      {remaining > 0 ? (
        <button
          type="button"
          onClick={() => setShown(value => value + pageSize)}
          className="mt-1 min-h-11 text-xs text-[var(--bellum-text-accent)] hover:underline"
        >
          {t('publicData.jobs.showMore', { count: remaining })}
        </button>
      ) : null}
    </div>
  )
}

function JobSignalsCard({
  jobs,
  profile,
  signalsCollectedAt,
}: {
  jobs: JobSignal[] | undefined
  profile: SalesProfileForRelevance | undefined
  signalsCollectedAt?: string | null | undefined
}) {
  const { t } = useTranslation('accountDetail')
  // #4757 — le tri se fait ICI, au rendu : récent / historique d'abord, puis le pli par intitulé DANS chaque bloc
  // (deux offres au même intitulé à deux ans d'écart sont deux besoins, pas un).
  const { recent, history } = splitJobsByAge(
    (jobs ?? []).filter((x): x is JobSignal => Boolean(x?.title)),
    Date.now(),
  )
  // Recette 21/10 K3 — deux offres au même intitulé (deux villes) = UNE ligne, comme partout ailleurs.
  // #4396.1 — seules les offres du métier de l'ESN sont des signaux ; les autres sont rangées à part, nommées.
  const recentSplit = splitJobsByTrade(foldJobPostings(sortJobsByDateDesc(recent)), profile)
  const historySplit = splitJobsByTrade(foldJobPostings(sortJobsByDateDesc(history)), profile)
  const offTrade = [...recentSplit.offTrade, ...historySplit.offTrade]
  if (recentSplit.inTrade.length === 0 && historySplit.inTrade.length === 0 && offTrade.length === 0) return null

  return (
    <SectionCard
      icon={<Briefcase className="size-4" />}
      title={t('publicData.jobs.title')}
      source={t('publicData.jobs.source')}
      help={t('publicData.jobs.help')}
    >
      <div className="px-4 py-3">
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('publicData.jobs.subtitle')}
        </Text>
        <JobsBlock kind="recent" jobs={recentSplit.inTrade} firstPage={JOB_RECENT_PAGE} pageSize={Infinity} />
        <JobsBlock
          kind="history"
          jobs={historySplit.inTrade}
          firstPage={JOB_HISTORY_PAGE}
          pageSize={JOB_HISTORY_PAGE}
        />
        {jobsHistoryCollectionIsOlder(signalsCollectedAt) ? (
          <div className="mt-3">
            <SegmentStaleCollectionNotice
              dimension="signals"
              capabilityIssue={JOB_HISTORY_CAPABILITY_ISSUE}
              i18nPrefix="overviewTab.jobsHistoryStaleCollection"
              collectedAt={signalsCollectedAt ?? null}
              hideWhenUndated
            />
          </div>
        ) : null}
        {offTrade.length > 0 ? (
          <details className="mt-3" data-testid="jobs-off-trade">
            <summary className="cursor-pointer text-xs text-[var(--bellum-text-muted)]">
              {t('publicData.jobs.offTrade', { count: offTrade.length })}
            </summary>
            <ul className="mt-1 flex flex-col gap-0.5">
              {offTrade.map((job, idx) => (
                <li key={job.url ?? idx} className="text-xs text-[var(--bellum-text-secondary)]">
                  {job.title}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </SectionCard>
  )
}

/* ─── Mentions légales du site (#4743.2) ────────────────────────────────────── */

const SITE_LEGAL_FIELD_ORDER = [
  'raison_sociale',
  'forme_juridique',
  'capital',
  'immatriculation',
  'siege',
  'dirigeant',
  'hebergeur',
] as const

/** #4743.5 — une ligne par champ PUBLIÉ et connu ; un champ absent ou vide ne fait aucune ligne. */
function siteLegalRows(fields: AccountAnalysis['legal_notice']) {
  const rows: Array<{ field: (typeof SITE_LEGAL_FIELD_ORDER)[number]; value: string; sourceUrl?: string | null }> = []
  for (const field of SITE_LEGAL_FIELD_ORDER) {
    const hit = (fields ?? []).find(f => f.field === field && f.value.trim())
    if (hit) rows.push({ field, value: hit.value.trim(), sourceUrl: hit.sourceUrl })
  }
  return rows
}

function SiteLegalNoticeCard({ fields }: { fields: AccountAnalysis['legal_notice'] }) {
  const { t } = useTranslation('accountDetail')
  const rows = siteLegalRows(fields)
  // #4805 — une carte ne disparaît pas en silence : l'absence de mentions publiées se NOMME.
  if (rows.length === 0)
    return <NamedAbsence what={t('publicData.siteLegalNotice.title')} testId="site-legal-notice-absence" />
  const href = safeHref(rows.find(r => r.sourceUrl)?.sourceUrl ?? undefined)
  return (
    <SectionCard
      icon={<Scale className="size-4" />}
      title={t('publicData.siteLegalNotice.title')}
      help={t('publicData.siteLegalNotice.help')}
    >
      <div className="flex flex-col gap-2 px-4 py-3" data-testid="site-legal-notice">
        {rows.map(row => (
          <div key={row.field} className="flex flex-col gap-0.5">
            <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
              {t(`publicData.siteLegalNotice.fields.${row.field}`)}
            </Text>
            <Text element="span" size="xs" weight="medium" className="text-[var(--bellum-text-primary)]">
              {row.value}
            </Text>
          </div>
        ))}
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center text-xs text-[var(--bellum-text-accent)] hover:underline"
          >
            {t('publicData.siteLegalNotice.viewPage')}
          </a>
        ) : null}
      </div>
    </SectionCard>
  )
}

/* ─── GitHub engineering signal ─────────────────────────────────────────────── */

function GithubCard({ signals }: { signals: GithubSignals | undefined }) {
  const { t, i18n } = useTranslation('accountDetail')
  if (!signals || !signals.org) return null
  const languages = (signals.top_languages ?? []).slice(0, 8)
  const repos = formatCount(signals.public_repos, i18n.language)
  const active = formatCount(signals.active_recent_repos, i18n.language)
  const href = safeHref(signals.url ?? undefined)

  return (
    <SectionCard
      icon={<Github className="size-4" />}
      title={t('publicData.github.title')}
      help={t('publicData.github.help')}
    >
      <div className="flex flex-col gap-2 px-4 py-3">
        <Text element="span" size="xs" weight="medium" className="text-[var(--bellum-text-primary)]">
          {signals.org}
        </Text>
        <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
          {[
            repos ? t('publicData.github.repos', { count: signals.public_repos ?? 0 }) : null,
            active ? t('publicData.github.activeRepos', { count: signals.active_recent_repos ?? 0 }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {languages.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {languages.map(lang => (
              <Badge
                key={lang}
                className="border-0 bg-[var(--bellum-surface-2)] px-1.5 py-0.5 text-xs font-normal text-[var(--bellum-text-secondary)]"
              >
                {lang}
              </Badge>
            ))}
          </div>
        ) : null}
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--bellum-text-accent)] hover:underline"
          >
            {t('publicData.github.viewOrg')}
          </a>
        ) : null}
      </div>
    </SectionCard>
  )
}

/* ─── #2291.2 (lot R) — Modèle de contrat OBSERVÉ (jamais déduit) ───────────── */

const CONTRACT_MODEL_JOB_KINDS = ['permanent', 'fixed_term', 'interim', 'freelance', 'other'] as const

/**
 * Seule carte de cette section qui n'est pas present-only (voir le gate dans
 * `CompanyPublicDataSection` : `hasContractModel`). Trois états, jamais un
 * silence :
 *  - `isStale` — ce compte a été analysé AVANT que #2291.2 ne fasse de la
 *    phase 1 un émetteur réel (doctrine « un correctif de collecte rattrape
 *    l'existant ») : le DIT, propose « Actualiser » (rafraîchissement par axe
 *    déjà existant — `useRefreshDimension('signals')`, menu « ··· », son coût
 *    déjà annoncé là — rien de neuf ici) ;
 *  - `model === null` — signaux à jour, cherché, rien d'attribuable :
 *    « non observé », jamais un silence qui se lirait « n'y recourt pas » ;
 *  - `model` — la même observation que Découvrir, avec sa source, sa période
 *    et son jour de constat.
 */
function ContractModelCard({ model, isStale }: { model: ContractModel | null | undefined; isStale: boolean }) {
  const { t } = useTranslation('accountDetail')
  const offers = model?.job_offers
  const notices = model?.public_contracts
  const period = (since: string, until: string) => formatDateRange(since, until) ?? until

  const noticeModes = notices
    ? [
        notices.regie > 0 ? t('publicData.contractModel.regie', { count: notices.regie }) : null,
        notices.fixed_price > 0 ? t('publicData.contractModel.fixedPrice', { count: notices.fixed_price }) : null,
      ].filter((part): part is string => part !== null)
    : []

  return (
    <SectionCard
      icon={<FileSignature className="size-4" />}
      title={t('publicData.contractModel.title')}
      source={t('publicData.contractModel.source')}
      help={t('publicData.contractModel.help')}
    >
      <div className="flex flex-col gap-2 px-4 py-3">
        {isStale ? (
          <>
            <Text element="span" size="xs" weight="medium" className="text-[var(--warning-soft-text)]">
              {t('publicData.contractModel.staleCollection')}
            </Text>
            <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
              {t('publicData.contractModel.staleCollectionHint')}
            </Text>
          </>
        ) : model === null ? (
          <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('publicData.contractModel.notObserved')}
          </Text>
        ) : (
          <>
            {offers ? (
              <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('publicData.contractModel.jobOffers', {
                  count: offers.total,
                  breakdown: CONTRACT_MODEL_JOB_KINDS.filter(kind => offers.counts[kind] > 0)
                    .map(kind => t(`publicData.contractModel.kind.${kind}`, { count: offers.counts[kind] }))
                    .join(' · '),
                  source: offers.source,
                  period: period(offers.since, offers.until),
                })}
              </Text>
            ) : null}
            {notices ? (
              <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('publicData.contractModel.publicContracts', {
                  count: notices.total,
                  breakdown:
                    noticeModes.length > 0 ? noticeModes.join(' · ') : t('publicData.contractModel.modeUnstated'),
                  source: notices.source,
                  period: period(notices.since, notices.until),
                })}
              </Text>
            ) : null}
            <Text element="span" size="xs" className="italic text-[var(--bellum-text-muted)]">
              {t('publicData.contractModel.disclaimer')}
            </Text>
          </>
        )}
      </div>
    </SectionCard>
  )
}
