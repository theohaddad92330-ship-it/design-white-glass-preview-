import type { Account } from '@bellum/contracts'
import { EntityAvatar, FilterChips } from '@bellum/ui'
import { Check, Network, RefreshCw, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTimeAgo } from '@/lib/relative-time'
import { guideAnchorProps } from '@/features/guide/guide-anchors'
import { CompanyLogo, QuietButton, StepTitle } from './AnalyzeChrome'

const NOTE_ROW = 'flex flex-wrap items-center gap-3 bg-[var(--bellum-bg)] px-3.5 py-2 text-sm'
const NOTE_BODY = 'grid min-w-56 flex-1 gap-px'

/** Ce que l'écran sait de l'entreprise retenue — une identité, jamais une valeur devinée. */
export type PickedCompany = {
  name: string
  /** « Paris · Banque / Finance · SIREN 493 455 042 » — déjà composé, chaque fait seulement s'il existe. */
  meta: string
  logo?: string | null | undefined
}

type CompanyStepProps = {
  picked: PickedCompany | null
  onChange: () => void
  /** Le champ de recherche (monté tel quel : son focus ne doit jamais être démonté par un changement d'état). */
  searchBox: ReactNode
  /** Plusieurs entités portent ce nom au registre (#1111) : on le DIT avant de payer. */
  nameGroup: { label: string; count: number; names: string } | null
  groupWhole: boolean
  onGroupWholeChange: (whole: boolean) => void
  /** Un collègue a déjà une analyse EN COURS sur ce compte (#2128.19). */
  colleague: Account['active_analysis_by_colleague']
  onFollowColleague: (() => void) | null
  /**
   * Théo B r1-recherche.A12 (PR11, rebranché) — un run déjà EN VOL sur ce nom, lu sur le plan de lancement, et la
   * phrase qui le dit (« lancée par Inès. », ou honnête sans prénom). Il prime sur `colleague` : c'est le même fait,
   * lu sans attendre qu'une entité soit retenue.
   */
  inFlight?: { text: string; onFollow: () => void } | null
  /** Théo B r1-recherche.R11 — les dossiers DÉJÀ présents dans l'espace ; un clic préremplit le nom, il ne lance rien. */
  recentDossiers?: readonly { id: string; company_name: string; logo_url?: string | null }[]
  onPickDossier?: (name: string) => void
  /** Les phrases de « ce que Bellum sait déjà » ; vide = rien à dire (compte jamais analysé). */
  knownLines: readonly string[]
  onOpenKnown: () => void
}

/**
 * Étape 1 — « Ton entreprise » (refonte Théo R1). Deux états d'un même bloc : la recherche, et
 * l'entreprise retenue avec, dessous, les trois bandeaux qui peuvent changer la décision — les
 * homonymes (ils changent CE qui sera analysé), le collègue déjà en route, et ce que l'espace sait.
 */
export function CompanyStep({
  picked,
  onChange,
  searchBox,
  nameGroup,
  groupWhole,
  onGroupWholeChange,
  colleague,
  onFollowColleague,
  inFlight = null,
  recentDossiers = [],
  onPickDossier,
  knownLines,
  onOpenKnown,
}: CompanyStepProps) {
  const { t } = useTranslation('search')

  // Le run en vol et ce que l'espace sait : ils changent la décision AVANT qu'une entité soit retenue (PR11 A3/A12) —
  // donc dits sous le champ aussi, pas seulement sous l'entreprise choisie.
  const inFlightNote = inFlight ? (
    <div key="in-flight" role="status" data-company-note="colleague" className={NOTE_ROW}>
      <div className={NOTE_BODY}>
        <strong className="font-semibold text-[var(--bellum-text-primary)]">{inFlight.text}</strong>
      </div>
      <QuietButton onClick={inFlight.onFollow} className="font-semibold">
        {t('frame.inFlightFollow')}
      </QuietButton>
    </div>
  ) : null
  const knownNote =
    knownLines.length > 0 ? (
      <section key="known" aria-label={t('analyze.known.title')} data-company-note="known" className={NOTE_ROW}>
        <ShieldCheck className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden="true" />
        <div className={NOTE_BODY}>
          <strong className="font-semibold text-[var(--bellum-text-primary)]">{t('analyze.known.title')}</strong>
          <span className="text-xs text-[var(--bellum-text-secondary)]">{knownLines.join(' · ')}</span>
        </div>
        <QuietButton onClick={onOpenKnown} className="font-semibold">
          {t('analyze.known.seeDetail')}
        </QuietButton>
      </section>
    ) : null

  if (picked) {
    const notes = [
      nameGroup ? (
        <div key="group" data-company-note="homonyms" className={NOTE_ROW}>
          <Network className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden="true" />
          <div className={NOTE_BODY}>
            <strong className="font-semibold text-[var(--bellum-text-primary)]">
              {t('related.heading', { count: nameGroup.count, label: nameGroup.label })}
            </strong>
            <span className="text-xs text-[var(--bellum-text-secondary)]">{nameGroup.names}</span>
          </div>
          <FilterChips
            ariaLabel={t('analyze.company.groupChoice')}
            size="sm"
            options={[
              { value: 'whole', label: t('analyze.company.groupWhole') },
              { value: 'alone', label: t('analyze.company.groupAlone', { name: picked.name }) },
            ]}
            value={groupWhole ? 'whole' : 'alone'}
            onChange={next => onGroupWholeChange(next !== 'alone')}
          />
        </div>
      ) : null,
      inFlightNote ??
        (colleague ? (
          <div key="colleague" data-company-note="colleague" className={NOTE_ROW}>
            <EntityAvatar name={colleague.colleague.name} size="xs" className="size-7 shrink-0" />
            <div className={NOTE_BODY}>
              <strong className="font-semibold text-[var(--bellum-text-primary)]">
                {t('analyze.company.colleagueRunning', { name: colleague.colleague.name })}
              </strong>
              <span className="text-xs text-[var(--bellum-text-secondary)]">
                {t('analyze.company.colleagueSince', { since: formatTimeAgo(colleague.started_at) })}
              </span>
            </div>
            {onFollowColleague ? (
              <QuietButton onClick={onFollowColleague} className="font-semibold">
                {t('analyze.company.colleagueFollow')}
              </QuietButton>
            ) : null}
          </div>
        ) : null),
      knownNote,
    ].filter(Boolean)

    return (
      <section aria-labelledby="analyze-company-title">
        <StepTitle
          step={1}
          id="analyze-company-title"
          title={t('analyze.company.pickedTitle')}
          hint={t('analyze.company.pickedHint')}
          complete
        />
        {/* `.an21-picked` : l'entreprise retenue, teintée d'accent. */}
        <div
          data-company="picked"
          className="flex min-h-16 flex-wrap items-center gap-3 rounded-xl border border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] px-3.5 py-2.5"
        >
          <CompanyLogo name={picked.name} src={picked.logo} className="size-9 shrink-0" />
          <div className="min-w-32 flex-1">
            <strong className="block truncate text-base font-semibold text-[var(--bellum-text-primary)]">
              {picked.name}
            </strong>
            {picked.meta ? <p className="truncate text-xs text-[var(--bellum-text-secondary)]">{picked.meta}</p> : null}
          </div>
          <span className="order-3 flex w-full items-center gap-1.5 pl-12 text-xs text-[var(--bellum-text-secondary)] md:order-none md:mr-1 md:w-auto md:pl-0">
            <Check className="size-3.5 text-[var(--bellum-text-accent)]" aria-hidden="true" />
            {t('analyze.company.selected')}
          </span>
          <QuietButton onClick={onChange} className="text-[var(--bellum-text-secondary)]">
            <RefreshCw className="size-3.5" aria-hidden="true" />
            {t('analyze.company.change')}
          </QuietButton>
        </div>

        {/* `.co-notes` : les bandeaux qui peuvent changer la décision, serrés dans UNE liste. */}
        {notes.length > 0 ? (
          <div
            data-company="notes"
            className="mt-2.5 overflow-hidden rounded-xl border border-[var(--bellum-border)] [&>*+*]:border-t [&>*+*]:border-[var(--bellum-border)]"
          >
            {notes}
          </div>
        ) : null}
      </section>
    )
  }

  return (
    <section aria-labelledby="analyze-company-title" {...guideAnchorProps('analyse.composer')}>
      <StepTitle
        step={1}
        id="analyze-company-title"
        title={t('analyze.company.searchTitle')}
        hint={t('analyze.company.searchHint')}
        accent
      />
      {searchBox}
      {inFlightNote || knownNote ? (
        <div
          data-company="notes"
          className="mt-2.5 overflow-hidden rounded-xl border border-[var(--bellum-border)] [&>*+*]:border-t [&>*+*]:border-[var(--bellum-border)]"
        >
          {inFlightNote}
          {knownNote}
        </div>
      ) : null}
      {/* #4512 — « Ou essaie un dossier : » ne nomme que des dossiers DÉJÀ dans l'espace (démo : les dossiers semés).
          Aucun dossier = aucune ligne : plus d'exemples de saisie inventés (« Essaie par exemple », revient sur PR11). */}
      {recentDossiers.length > 0 && onPickDossier ? (
        <div data-company="try-dossiers" className="mt-2.5 flex min-h-7 flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-xs text-[var(--bellum-text-secondary)]">{t('frame.tryDossier')}</span>
          {recentDossiers.slice(0, 3).map(dossier => (
            <button
              key={dossier.id}
              type="button"
              onClick={() => onPickDossier(dossier.company_name)}
              className="inline-flex min-h-11 max-w-full items-center gap-1.5 truncate whitespace-nowrap rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-2 text-xs font-medium text-[var(--bellum-text-primary)] transition-colors duration-immediate hover:border-[var(--bellum-accent-line)] md:min-h-8"
            >
              <CompanyLogo name={dossier.company_name} src={dossier.logo_url} className="size-5 text-xs" />
              {dossier.company_name}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
