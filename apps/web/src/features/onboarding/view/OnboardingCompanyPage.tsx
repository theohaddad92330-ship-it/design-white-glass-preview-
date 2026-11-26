import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CompanySuggestion, EsnPrefillResponse, PrefillCandidate, PrefillCompany } from '@bellum/contracts'
import { BrailleLoader, Button, Card, CardContent, MOTION, Text } from '@bellum/ui'
import { ContactDialog } from '@/components/ContactDialog'
import { InlineProfileValue } from '@/components/primitives/InlineProfileValue'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { useBrand } from '@/features/brand/brand-context'
import { ExistingOfferNotice } from '@/features/onboarding/components/ExistingOfferNotice'
import { OnboardingBusinessUnitStep } from '@/features/onboarding/components/OnboardingBusinessUnitStep'
import { useEsnPrefill } from '@/features/onboarding/hooks/useEsnPrefill'
import { useOnboardingState } from '@/features/onboarding/hooks/useOnboarding'
import { firstSlugOfStage, TEMPS1_STAGE_CODES } from '@/features/onboarding/lib/questions'
import { SearchAutocomplete } from '@/features/search/components/SearchAutocomplete'
import { useCompanySearch } from '@/features/search/hooks/useCompanySearch'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { ParcoursInfo, ParcoursShell } from '@/features/onboarding/view/parcours/ParcoursShell'
import { ParcoursFooter, ParcoursHeading } from '@/features/onboarding/view/parcours/ParcoursHeading'

const MIN_NAME_LENGTH = 2

/** A prefill that resolved nothing — the shape we fall back to on any failure so
 *  a network hiccup never traps the user on the first screen. */
const NO_MATCH: EsnPrefillResponse = { matched: false, company: null, fields: {}, candidates: [], ambiguous: false }

/**
 * First onboarding screen — « Quelle est votre ESN ? ».
 *
 * One field. The typed name (or the picked registry suggestion) is sent to
 * `POST /esn-profile/prefill`, which resolves the legal identity and a first
 * pass of questionnaire answers from PUBLIC sources only. The user confirms the
 * match, then walks the EXISTING 8-sub-step wizard with the answers already
 * filled in and badged with their provenance.
 *
 * Nothing here is a commitment: « Remplir manuellement » (and « Ce n'est pas ma
 * société ») always lead back to the untouched blank questionnaire.
 */
export function OnboardingCompanyPage() {
  const { t } = useTranslation('onboarding')
  const navigate = useNavigate()

  const { data: state } = useOnboardingState()
  const prefill = useEsnPrefill()
  const applyPrefill = useOnboardingStore(s => s.applyPrefill)
  const setAnswer = useOnboardingStore(s => s.setAnswer)
  const reset = useOnboardingStore(s => s.reset)

  const [query, setQuery] = useState<string>('')
  const [showDropdown, setShowDropdown] = useState<boolean>(false)
  const [result, setResult] = useState<EsnPrefillResponse | null>(null)
  /** #2084.1 — the REQUEST failed before the registry could answer (network,
   *  5xx). Distinct from `result.matched === false`, which means the registry
   *  DID answer and simply has nothing under that name. Conflating the two
   *  used to render "no public record found" on a bare 503 — a claim about
   *  the company that a failed request cannot support. */
  const [prefillUnavailable, setPrefillUnavailable] = useState<boolean>(false)
  /** The name actually submitted — kept so the "no match" copy quotes it. */
  const [submittedName, setSubmittedName] = useState<string>('')
  // #2017.1 — « Toute l'entreprise ou un périmètre ? », posée après l'étape
  // entreprise (ce screen) et avant le questionnaire Temps-1. `goToWizard`
  // n'appelle plus directement la navigation : il ouvre ce sous-écran, dont
  // le « Continuer » (`navigateToWizard`) porte l'ancien comportement, à
  // l'octet près pour qui choisit « Toute l'entreprise » (2017.19, le défaut).
  const [showBusinessUnitStep, setShowBusinessUnitStep] = useState<boolean>(false)

  // `lens: 'esn'` ranks the dropdown by ESN plausibility. Without it the free
  // registry's full-text order surfaces namesake SCIs and garages with the same
  // apparent legitimacy as the real company — and picking one PINS its SIREN,
  // which by construction skips the disambiguation below.
  const {
    suggestions,
    loading: suggestionsLoading,
    // #2086 — critère de recette : « toutes les actions disposent d'un état
    // loading et error explicite ». Le hook distingue déjà « rien trouvé » de
    // « la source n'a pas répondu » (`sourceUnavailable`) — ce screen jetait ce
    // second signal, si bien qu'une panne réseau se lisait comme un registre
    // qui ne connaît pas l'entreprise, jamais comme une panne.
    sourceUnavailable,
    search,
    clearSuggestions,
  } = useCompanySearch('FR', 'esn')

  const navigateToWizard = (): void => {
    const stage = TEMPS1_STAGE_CODES[0]
    const slug = firstSlugOfStage(stage) ?? ''
    if (!state?.id) return
    navigate({ to: '/onboarding/$id/$stage/$slug', params: { id: state.id, stage, slug }, replace: true })
  }

  /** #2017.1 — chaque chemin de confirmation de cet écran ouvrait directement
   *  le questionnaire ; il ouvre maintenant « Toute l'entreprise ou un
   *  périmètre ? », dont le propre « Continuer » appelle `navigateToWizard`. */
  const goToWizard = (): void => {
    setShowBusinessUnitStep(true)
  }

  const runPrefill = async (name: string, siren: string | null): Promise<void> => {
    const trimmed = name.trim()
    if (trimmed.length < MIN_NAME_LENGTH) return

    setSubmittedName(trimmed)
    setShowDropdown(false)
    setPrefillUnavailable(false)
    clearSuggestions()

    try {
      // A SIREN pins the match, skipping the name→SIREN homonym resolution.
      const response = await prefill.mutateAsync({ name: trimmed, siren: siren || null })
      setResult(response ?? NO_MATCH)
    } catch {
      // #2084.1 — never block onboarding on the prefill: degrade to the manual
      // path with the typed name kept. No error toast — this is an optional
      // accelerator. But the request itself failing is NOT the same fact as
      // the registry answering "nothing under that name" — `result` stays
      // `null` so the "not found" screen never renders on a plain outage.
      setPrefillUnavailable(true)
    }
  }

  const onSelectSuggestion = (suggestion: CompanySuggestion): void => {
    setQuery(suggestion?.name ?? '')
    void runPrefill(suggestion?.name ?? '', suggestion?.siren || null)
  }

  const onQueryChange = (value: string): void => {
    setQuery(value)
    search(value)
    setShowDropdown(value.trim().length >= MIN_NAME_LENGTH)
  }

  /** "Ce n'est pas ma société" / "Modifier le nom" — back to a clean field. */
  const onRetry = (): void => {
    setResult(null)
    setPrefillUnavailable(false)
    setQuery('')
    clearSuggestions()
  }

  /** Accepts the match: seeds the wizard with the prefilled answers + badges. */
  const onConfirm = (corrections: CompanyCorrections): void => {
    if (!result) return
    applyPrefill(result.fields ?? {})
    // The company name is the one answer we always know — the user typed it.
    // Only set it when the prefill did not ground it itself (then it carries no
    // badge, which is correct: it is their own input, not a suggestion).
    if (!result.fields?.esn_name) setAnswer('esn_name', result.company?.name ?? submittedName)
    // #4425.2 — ce que la personne a corrigé sur la carte gagne sur le
    // registre (une correction humaine gagne toujours) ; sans correction, rien
    // n'est écrit ici et le chemin reste byte-identique.
    if (corrections.website !== null) setAnswer('esn_website', corrections.website)
    if (corrections.consultantCount !== null) setAnswer('consultant_count', corrections.consultantCount)
    goToWizard()
  }

  /** "Remplir manuellement" — the historical blank questionnaire, byte-identical. */
  const onSkip = (): void => {
    reset()
    goToWizard()
  }

  /** Continues to the wizard with only what the user actually typed. Shared by
   *  "no match" and "none of these companies" — both mean « the registry didn't
   *  settle it, let me fill it in myself », the historical behaviour. */
  const onContinueManually = (): void => {
    setAnswer('esn_name', submittedName)
    goToWizard()
  }

  /**
   * #2086.33 — "no match" is never a dead end with only one exit. These two
   * extra choices pre-answer a REAL later question with the SAME wording the
   * person just picked here, rather than leaving them to answer it twice —
   * never a fabricated value: it is the option they clicked, verbatim.
   */
  const onStartingUp = (): void => {
    setAnswer('esn_name', submittedName)
    setAnswer('esn_maturity_situation', 'Activité en création')
    goToWizard()
  }

  const onSolo = (): void => {
    setAnswer('esn_name', submittedName)
    setAnswer('sales_team_size', 'Je suis seul (fondateur / indépendant)')
    goToWizard()
  }

  const company = result?.company ?? null
  const candidates = result?.candidates ?? []
  /** Several registry entities plausibly match: the user picks, we never guess.
   *  Guarded on a non-empty list so an "ambiguous" verdict with nothing to show
   *  degrades to the "no match" screen instead of an empty dead end. */
  const ambiguous = result?.ambiguous === true && candidates.length > 0
  const matched = !ambiguous && result?.matched === true && company !== null

  // Every exit of this screen routes to `/onboarding/{id}/…`; without the id
  // the buttons would be dead clicks, so wait for the state rather than show them.
  if (!state?.id) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[var(--bellum-bg)]">
        <BrailleLoader variant="grid-searching" />
      </div>
    )
  }

  // #2017.1 — « Toute l'entreprise ou un périmètre ? », juste après l'étape
  // entreprise ci-dessus et avant le questionnaire Temps-1.
  if (showBusinessUnitStep) {
    return (
      <ParcoursShell width="narrow">
        <OnboardingBusinessUnitStep onContinue={navigateToWizard} />
      </ParcoursShell>
    )
  }

  return (
    <ParcoursShell width="narrow">
      {prefill.isPending ? (
        <PrefillSpinner label={t('prefill.loading')} />
      ) : result ? (
        ambiguous ? (
          <CandidateChoice
            name={submittedName}
            candidates={candidates}
            onPick={picked => void runPrefill(picked.name, picked.siren)}
            onNoneOfThese={onContinueManually}
            onRetry={onRetry}
          />
        ) : matched ? (
          <MatchConfirmation
            company={company}
            onConfirm={onConfirm}
            onRetry={onRetry}
            onContinueManually={onContinueManually}
            onSkip={onSkip}
          />
        ) : (
          <NoMatch
            name={submittedName}
            onContinue={onContinueManually}
            onRetry={onRetry}
            onStartingUp={onStartingUp}
            onSolo={onSolo}
          />
        )
      ) : prefillUnavailable ? (
        <SourceDown name={submittedName} onContinue={onContinueManually} onRetry={onRetry} />
      ) : (
        <div className="space-y-6">
          {/* Arrivée d'un compte DÉJÀ servi (redirigé par `/onboarding/plan`,
                qui n'avait rien à lui faire choisir) : on lui nomme son palier
                au lieu de le laisser sur un écran disparu sans explication. Un
                vrai nouveau venu ne voit rien de plus. */}
          <ExistingOfferNotice />

          <ParcoursHeading kicker={t('prefill.kicker')} title={t('prefill.title')} lead={t('prefill.subtitle')} />

          <SearchAutocomplete
            query={query}
            onChange={onQueryChange}
            onEnter={() => void runPrefill(query, null)}
            suggestions={suggestions}
            suggestionsLoading={suggestionsLoading}
            showDropdown={showDropdown}
            onShowDropdown={setShowDropdown}
            onSelectSuggestion={onSelectSuggestion}
            placeholder={t('prefill.placeholder')}
            ariaLabel={t('prefill.inputAriaLabel')}
            autoFocus
          />

          <SourceUnavailableNotice show={sourceUnavailable} />

          <ParcoursFooter
            start={
              <Button type="button" variant="ghost" size="sm" onClick={onSkip}>
                {t('prefill.skip')}
              </Button>
            }
            end={
              <Button
                type="button"
                variant="default"
                icon={ArrowRight}
                iconPosition="right"
                disabled={query.trim().length < MIN_NAME_LENGTH}
                onClick={() => void runPrefill(query, null)}
              >
                {t('prefill.submit')}
              </Button>
            }
          />
        </div>
      )}
    </ParcoursShell>
  )
}

function PrefillSpinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16" role="status" aria-live="polite">
      <BrailleLoader variant="grid-searching" />
      <Text element="p" size="base" className="text-[var(--bellum-text-secondary)]">
        {label}
      </Text>
    </div>
  )
}

/**
 * "The company search did not answer" — shown under the field whenever
 * `useCompanySearch` reports `sourceUnavailable`, i.e. the autocomplete's own
 * request failed or timed out (#2086, recette: every action needs an explicit
 * loading AND error state). Distinct from an empty dropdown, which means the
 * source answered and simply knows nothing under that name.
 */
function SourceUnavailableNotice({ show }: { show: boolean }) {
  const { t } = useTranslation('onboarding')
  if (!show) return null
  return (
    <ParcoursInfo tone="warning" icon={<AlertTriangle className="size-4" />}>
      {t('prefill.sourceUnavailable')}
    </ParcoursInfo>
  )
}

/** The facts that let a human tell two namesakes apart, in one readable line.
 *  Only what the registry actually returned — a missing fact is simply absent. */
function candidateSummary(candidate: PrefillCandidate): string {
  return [candidate.city, candidate.naf_label, candidate.headcount_label].filter(Boolean).join(' · ')
}

type DifferentiatorKey = 'city' | 'naf_label' | 'headcount_label' | 'is_esn_naf'
const DIFFERENTIATOR_KEYS: readonly DifferentiatorKey[] = ['city', 'naf_label', 'headcount_label', 'is_esn_naf']

/**
 * #2086.31/.32 — the facts that actually DISTINGUISH the homonyms, never the
 * ones they share. A field every candidate agrees on doesn't help pick
 * between them — highlighting it would draw attention to a non-fact.
 */
function determinantDifferences(candidates: PrefillCandidate[]): DifferentiatorKey[] {
  return DIFFERENTIATOR_KEYS.filter(key => new Set(candidates.map(c => String(c[key] ?? ''))).size > 1)
}

/**
 * "This company doesn't look like an IT services company" — shown whenever the
 * registry NAF code CONTRADICTS an ESN activity (`is_esn_naf === false`).
 *
 * Strictly tri-state: `null` (no NAF code at all) renders nothing. Warning on
 * "we don't know" would train the user to dismiss the banner, which is exactly
 * how a real mismatch ends up ignored.
 */
function NafWarning({ isEsnNaf }: { isEsnNaf: boolean | null }) {
  const { t } = useTranslation('onboarding')
  if (isEsnNaf !== false) return null
  return (
    <ParcoursInfo tone="warning" icon={<AlertTriangle className="size-4" />}>
      {t('prefill.nafWarning')}
    </ParcoursInfo>
  )
}

/**
 * #2015.8 — « le registre dit cette entreprise cessée ». Tri-état comme
 * `NafWarning` : `false` alerte, `true`/`null` restent silencieux — un statut
 * NORMAL ou NON MESURÉ n'a rien à signaler ici (il est repris dans les lignes
 * de fait de la carte, jamais dans cette bannière).
 */
function CeasedWarning({ isActive }: { isActive: boolean | null }) {
  const { t } = useTranslation('onboarding')
  if (isActive !== false) return null
  return (
    <ParcoursInfo tone="warning" icon={<AlertTriangle className="size-4" />}>
      {t('prefill.ceasedWarning')}
    </ParcoursInfo>
  )
}

/**
 * Disambiguation screen — « laquelle de ces entreprises ? ».
 *
 * The free registry (`recherche-entreprises.api.gouv.fr`) is a FULL-TEXT search:
 * its top hit is routinely a namesake with nothing to do with the user's company
 * (« Carrefour » → a SCI, « Alan » → a garage). Whenever several entities are
 * plausible we show them rather than pick one, because a wrong ESN profile then
 * silently feeds every downstream analysis prompt.
 *
 * Picking a row re-runs the prefill with that SIREN pinned — which skips the
 * resolution entirely on the second pass.
 */
function CandidateChoice({
  name,
  candidates,
  onPick,
  onNoneOfThese,
  onRetry,
}: {
  name: string
  candidates: PrefillCandidate[]
  onPick: (candidate: PrefillCandidate) => void
  onNoneOfThese: () => void
  onRetry: () => void
}) {
  const { t } = useTranslation('onboarding')

  const differentiatorLabels: Record<DifferentiatorKey, string> = {
    city: t('prefill.confirm.city'),
    naf_label: t('prefill.confirm.naf'),
    headcount_label: t('prefill.confirm.headcount'),
    is_esn_naf: t('prefill.disambiguation.statusLabel'),
  }
  const differentiators = determinantDifferences(candidates)

  return (
    <div className="space-y-6">
      <ParcoursHeading
        kicker={t('prefill.kicker')}
        title={t('prefill.disambiguation.title', { name })}
        lead={t('prefill.disambiguation.subtitle')}
      >
        {differentiators.length > 0 && (
          <p className="text-sm font-semibold text-[var(--bellum-text-accent)]">
            {t('prefill.disambiguation.differentiators', {
              fields: differentiators.map(key => differentiatorLabels[key]).join(', '),
            })}
          </p>
        )}
      </ParcoursHeading>

      <ul className="space-y-2">
        {candidates.map(candidate => {
          const summary = candidateSummary(candidate)
          return (
            <li key={candidate.siren}>
              <button
                type="button"
                onClick={() => onPick(candidate)}
                className="w-full rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4 text-left transition-colors hover:border-[var(--bellum-primary-500)] hover:bg-[var(--bellum-surface-2)] focus-visible:border-[var(--bellum-primary-500)] focus-visible:outline-none md:p-5"
              >
                <div className="flex items-center gap-3">
                  {/* #2086.21 — vraies cartes : un avatar par candidat, jamais
                      une icône générique. Aucun site connu par homonyme (le
                      registre gratuit ne le porte pas) : repli à l'initiale
                      du nom RÉEL, jamais un logo deviné. */}
                  <CompanyAvatar name={candidate.name} website={null} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <Text element="span" size="base" weight="semibold" className="text-[var(--bellum-text-primary)]">
                        {candidate.name}
                      </Text>
                      <span className="shrink-0 text-xs text-[var(--bellum-text-muted)]">
                        {t('prefill.confirm.siren')} {candidate.siren}
                      </span>
                    </div>
                    {summary.length > 0 && (
                      <Text element="p" size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
                        {summary}
                      </Text>
                    )}
                    {candidate.is_esn_naf === false && (
                      <Text
                        element="p"
                        size="sm"
                        className="mt-1 text-[var(--warning-soft-text)] dark:text-[var(--warning-soft-text)]"
                      >
                        {t('prefill.disambiguation.notAnEsn')}
                      </Text>
                    )}
                  </div>
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      <ParcoursFooter
        start={
          <Button type="button" variant="ghost" size="sm" icon={RotateCcw} iconPosition="left" onClick={onRetry}>
            {t('prefill.disambiguation.retry')}
          </Button>
        }
        end={
          <Button type="button" variant="secondary" icon={ArrowRight} iconPosition="right" onClick={onNoneOfThese}>
            {t('prefill.disambiguation.noneOfThese')}
          </Button>
        }
      />
    </div>
  )
}

/** #4425.2 — `null` = la personne n'a rien corrigé (rien n'est écrit). */
type CompanyCorrections = { website: string | null; consultantCount: string | null }

function MatchConfirmation({
  company,
  onConfirm,
  onRetry,
  onContinueManually,
  onSkip,
}: {
  company: PrefillCompany
  onConfirm: (corrections: CompanyCorrections) => void
  onRetry: () => void
  onContinueManually: () => void
  onSkip: () => void
}) {
  const { t } = useTranslation('onboarding')
  // #4425.2 — site web et nombre de consultants : éditables sur la carte, sur
  // les MÊMES clés que `company_info` (`esn_website`, `consultant_count`).
  const [corrections, setCorrections] = useState<CompanyCorrections>({ website: null, consultantCount: null })

  // #2015.8 — tri-état : la ligne de fait n'existe QUE quand le registre a pu
  // trancher (`true`/`false`) ; sur `null` elle disparaît plutôt que de
  // mentir par un statut par défaut (la bannière `CeasedWarning` porte déjà
  // le cas `false`, plus visible qu'une simple ligne).
  const statusLabel =
    company?.is_active === true
      ? t('prefill.confirm.statusActive')
      : company?.is_active === false
        ? t('prefill.confirm.statusCeased')
        : ''

  // #2086.25 — DÉCISION Louis 17/09 : groupe/filiale, APRÈS confirmation
  // seulement (cette carte, jamais la liste d'homonymes — `CandidateChoice`
  // ne lit pas `company.group`). `null` = aucun lien capitalistique trouvé :
  // les deux lignes restent filtrées comme les autres, pas de bloc vide.
  const group = company?.group ?? null

  const rows: Array<{ label: string; value: string }> = [
    { label: t('prefill.confirm.siren'), value: company?.siren ?? '' },
    { label: t('prefill.confirm.city'), value: company?.city ?? '' },
    { label: t('prefill.confirm.country'), value: company?.country ?? '' },
    { label: t('prefill.confirm.naf'), value: company?.naf_label ?? '' },
    { label: t('prefill.confirm.headcount'), value: company?.headcount_label ?? '' },
    { label: t('prefill.confirm.status'), value: statusLabel },
    // Libellé VERBATIM (nom de registre, jamais reformulé) — même doctrine
    // que `naf_label`/`city` ci-dessus.
    { label: t('prefill.confirm.parentCompany'), value: group ? group.parentCompanies.join(', ') : '' },
    {
      label: t('prefill.confirm.subsidiaries'),
      value:
        group && group.subsidiaryCount > 0
          ? t('prefill.confirm.subsidiariesCount', { count: group.subsidiaryCount })
          : '',
    },
  ].filter(row => row.value.trim().length > 0)

  // #2015.3 — raison sociale ET nom commercial. `name` reste le titre
  // (nom commercial préféré) ; la raison sociale n'apparaît qu'en LIGNE
  // SECONDAIRE, et seulement quand elle dit quelque chose de plus que le
  // titre — sinon la même valeur s'afficherait deux fois (loi 4).
  const legalName = company?.legal_name?.trim() || ''
  const showLegalName = legalName.length > 0 && legalName !== (company?.name ?? '').trim()

  return (
    // #2086.36 — M9 « c'est fait » (`MOTION.confirm`) : la transition annonce
    // qu'une recherche vient d'ABOUTIR, une fois, jamais une boucle.
    <motion.div className="space-y-6" {...MOTION.confirm}>
      <ParcoursHeading
        kicker={t('prefill.confirm.transition')}
        title={t('prefill.confirm.title')}
        lead={t('prefill.confirm.subtitle')}
      />

      <Card className="rounded-card border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-3">
            {/* #2015.2 — le vrai logo (favicon du site connu), jamais une
                icône générique : `CompanyAvatar` retombe sur l'initiale s'il
                n'y a rien à charger. */}
            <CompanyAvatar name={company?.name ?? ''} website={company?.website ?? null} size="lg" />
            <div className="min-w-0">
              <Text element="h2" size="lg" weight="semibold" className="text-[var(--bellum-text-primary)]">
                {company?.name ?? ''}
              </Text>
              {showLegalName && (
                <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
                  {legalName}
                </Text>
              )}
            </div>
          </div>

          {rows.length > 0 && (
            <div className="space-y-2">
              {/* #2086.28 — nomme le bloc : ce ne sont pas des réponses de
                  l'utilisateur, c'est ce que la recherche publique a déjà
                  trouvé, avant toute correction possible. */}
              <Text
                element="p"
                size="xs"
                weight="semibold"
                className="uppercase tracking-widest text-[var(--bellum-text-accent)]"
              >
                {t('prefill.confirm.foundLabel')}
              </Text>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {rows.map(row => (
                  <div key={row.label} className="flex flex-col">
                    <dt className="text-xs text-[var(--bellum-text-muted)]">{row.label}</dt>
                    <dd className="truncate text-sm text-[var(--bellum-text-primary)]">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* #4425.2 — les deux faits qu'une erreur du registre rend faux se
              corrigent ICI, avant d'entrer dans le questionnaire. */}
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            <InlineProfileValue
              label={t('prefill.confirm.website')}
              value={corrections.website ?? company?.website ?? null}
              inputType="url"
              onSave={next => setCorrections(c => ({ ...c, website: next === '' ? null : next }))}
            />
            <InlineProfileValue
              label={t('prefill.confirm.consultants')}
              value={corrections.consultantCount}
              inputType="number"
              onSave={next => {
                if (next !== '' && !/^\d+$/.test(next)) throw new Error('not-a-count')
                setCorrections(c => ({ ...c, consultantCount: next === '' ? null : next }))
              }}
            />
          </div>

          {/* The doubt is surfaced HERE, next to the accept button — not buried
              once the whole questionnaire is already prefilled. */}
          <NafWarning isEsnNaf={company?.is_esn_naf ?? null} />
          <CeasedWarning isActive={company?.is_active ?? null} />
        </CardContent>
      </Card>

      {/* #2086.29 — vrai, pas rassurant par convention : `applyPrefill` n'écrit
          qu'en store LOCAL (voir `onConfirm` ci-dessus), rien n'est persisté
          avant `PUT /esn-profile` au fil du questionnaire. */}
      <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
        {t('prefill.confirm.notSavedYet')}
      </Text>

      <ParcoursFooter
        start={
          <Button type="button" variant="ghost" size="sm" icon={RotateCcw} iconPosition="left" onClick={onRetry}>
            {t('prefill.confirm.reject')}
          </Button>
        }
        end={
          <Button
            type="button"
            variant="default"
            icon={ArrowRight}
            iconPosition="right"
            onClick={() => onConfirm(corrections)}
          >
            {t('prefill.confirm.accept')}
          </Button>
        }
      />

      {/* #2015.10 — cinq échappatoires NOMMÉES sur un match retenu à tort :
          « Ce n'est pas ma société » (bouton ci-dessus) n'était que la seule
          sortie explicite ; le reste retombait sur un `onSkip` générique qui
          ne dit jamais LAQUELLE des raisons pousse l'utilisateur à sortir. */}
      <div className="space-y-2 rounded-r-lg border-l-2 border-[var(--bellum-primary-500)] bg-[var(--bellum-surface-2)] px-4 py-3">
        <Text element="p" size="sm" weight="medium" className="text-[var(--bellum-text-secondary)]">
          {t('prefill.confirm.escapes.title')}
        </Text>
        <div className="flex flex-col items-start gap-1">
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-[var(--bellum-text-accent)]"
            onClick={onRetry}
          >
            {t('prefill.confirm.escapes.wrongEstablishment')}
          </Button>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-[var(--bellum-text-accent)]"
            onClick={onContinueManually}
          >
            {t('prefill.confirm.escapes.notYetRegistered')}
          </Button>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-[var(--bellum-text-accent)]"
            onClick={onContinueManually}
          >
            {t('prefill.confirm.escapes.dataIncorrect')}
          </Button>
          <Button type="button" variant="link" className="h-auto p-0 text-[var(--bellum-text-accent)]" onClick={onSkip}>
            {t('prefill.confirm.escapes.preferManual')}
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

/**
 * #2084.21 — un lien de support attaché à CHAQUE état d'erreur du parcours,
 * pas seulement l'aide générique de la colonne latérale (`OnboardingHelpCard`,
 * absente de cet écran plein-largeur et jamais liée à un échec précis).
 * Réutilise le MÊME canal que `OnboardingHelpCard` (`ContactDialog`), gardé
 * derrière `!isCustom` pour la même raison de doctrine : un espace en marque
 * blanche ne promet pas « notre équipe ».
 */
function ErrorSupportLink() {
  const { t } = useTranslation('onboarding')
  const [open, setOpen] = useState(false)
  const { isCustom } = useBrand()
  if (isCustom) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left text-xs text-[var(--bellum-text-muted)] underline-offset-4 hover:underline hover:text-[var(--bellum-text-accent)]"
      >
        {t('help.cta')}
      </button>
      <ContactDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

/**
 * #2084.1 — « registre indisponible », distinct de « entreprise introuvable ».
 *
 * Shown when the prefill REQUEST itself failed (network, 5xx) — never once
 * the registry has actually answered. `NoMatch` states a fact about the
 * company (nothing under that name); this states a fact about OUR request
 * (it never got an answer), which is why the copy never claims the company
 * doesn't exist and offers a real retry, not just "fill in manually".
 */
function SourceDown({ name, onContinue, onRetry }: { name: string; onContinue: () => void; onRetry: () => void }) {
  const { t } = useTranslation('onboarding')
  return (
    <div className="space-y-6">
      <ParcoursHeading
        kicker={t('prefill.kicker')}
        title={t('prefill.down.title')}
        lead={t('prefill.down.description', { name })}
      />

      <ParcoursFooter
        start={
          <Button type="button" variant="ghost" size="sm" icon={RotateCcw} iconPosition="left" onClick={onRetry}>
            {t('prefill.down.retry')}
          </Button>
        }
        end={
          <Button type="button" variant="default" icon={ArrowRight} iconPosition="right" onClick={onContinue}>
            {t('prefill.down.continue')}
          </Button>
        }
      />

      <ErrorSupportLink />
    </div>
  )
}

function NoMatch({
  name,
  onContinue,
  onRetry,
  onStartingUp,
  onSolo,
}: {
  name: string
  onContinue: () => void
  onRetry: () => void
  onStartingUp: () => void
  onSolo: () => void
}) {
  const { t } = useTranslation('onboarding')
  return (
    <div className="space-y-6">
      <ParcoursHeading
        kicker={t('prefill.kicker')}
        title={t('prefill.notFound.title', { name })}
        lead={t('prefill.notFound.description')}
      />

      {/* #2086.33 — pas une phrase et deux boutons : QUATRE choix, jamais une
          erreur sèche. Les deux ajoutés pré-répondent une vraie question du
          questionnaire, avec le libellé même que la personne vient de choisir. */}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onStartingUp}>
          {t('prefill.notFound.startingUp')}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onSolo}>
          {t('prefill.notFound.solo')}
        </Button>
      </div>

      <ParcoursFooter
        start={
          <Button type="button" variant="ghost" size="sm" icon={RotateCcw} iconPosition="left" onClick={onRetry}>
            {t('prefill.notFound.retry')}
          </Button>
        }
        end={
          <Button type="button" variant="default" icon={ArrowRight} iconPosition="right" onClick={onContinue}>
            {t('prefill.notFound.continue')}
          </Button>
        }
      />

      <ErrorSupportLink />
    </div>
  )
}
