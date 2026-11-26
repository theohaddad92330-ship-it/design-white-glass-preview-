import { Link } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { ArrowLeft, History, Lock, Pencil, RefreshCw, Rocket, ShieldCheck, Target } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, cn, LauraFace } from '@bellum/ui'
import { ScreenGuideLink } from '@/components/shell/ScreenGuideLink'
import {
  ANALYSIS_DEPTH_PRESETS,
  DEFAULT_ANALYSIS_DEPTH,
  SELECTABLE_ANALYSIS_RUN_DEPTHS,
  estimateAnalysisCredits,
  widenGeoScopeToFrance,
  type AnalysisContext,
  type AnalysisContextPreset,
  type AnalysisRunDepth,
  type AnalysisScopeSelection,
  type RefreshDimension,
  type RefreshScopeMode,
} from '@bellum/contracts'
import { SoftBrake } from '@/features/credits/components/SoftBrake'
import { useCreditGate } from '@/features/credits/hooks/useCreditGate'
import { angleOf, withAngle } from '../lib/angleField'
import { INTENT_SUGGESTIONS } from '../lib/intentSuggestions'
import { objectiveLabelKeyForPreset } from '../lib/objectiveMapping'
import type { ScopeSummary } from '../lib/scope-summary'
import { CompanyLogo, HEADER_LINK, QuietButton } from './AnalyzeChrome'
import { GeoPerimeterField } from './GeoPerimeterField'
import { RefreshPlanCard } from './RefreshPlanCard'
import { ScopeKindRow } from './ScopeKindRow'

type ScopeConfirmPanelProps = {
  summary: ScopeSummary
  country: string
  /** Cadrage en cours — le MÊME état que l'écran de départ : modifier ici, c'est modifier là. */
  selection: AnalysisScopeSelection
  onSelectionChange: (next: AnalysisScopeSelection) => void
  /** L'objectif choisi (preset) et le contexte entier, pour la phrase d'angle. */
  preset: AnalysisContextPreset
  context: AnalysisContext
  onContextChange: (next: AnalysisContext) => void
  /** Les libellés d'objectifs cochés (plusieurs possibles), dans l'ordre des clics. */
  intents: readonly string[]
  /** Les phrases de « ce que Bellum sait déjà » ; vide = compte jamais analysé. */
  knownLines: readonly string[]
  onOpenKnown: () => void
  onEdit: () => void
  /** Confirmé — avec le mode du mini-plan quand c'est une relance (#2125.42). */
  onConfirm: (refreshMode?: RefreshScopeMode) => void
  disabled?: boolean
  /**
   * Ce lancement RELANCE un dossier existant (`/search?accountId=…`) — #1133. « En espérant que ça
   * n'écrase pas les infos. » C'est ici, juste au-dessus du bouton qui débite, que la question se
   * pose vraiment : après, c'est écrit.
   */
  relaunch?: boolean
  /** #2125.35 — la fraîcheur PAR AXE du dossier relancé ; absente, le mini-plan dit « date inconnue ». */
  relaunchFreshness?: Partial<Record<RefreshDimension, string | null>> | undefined
  /** #3288 — la durée MÉDIANE mesurée de chaque palier (secondes) ; absente = « non mesurée ». */
  depthMedians?: Partial<Record<AnalysisRunDepth, number | null>> | undefined
  /**
   * Solde restant (`null`/absent = inconnu : on ne dit rien, « non mesuré » ≠ 0) — #4464 (PR11) : un solde trop
   * court pour le palier choisi se dit par le frein doux au geste qui lance, et « Passer en Rapide » n'est proposé
   * que si Rapide est réellement permis. Jamais affiché : il ne sert qu'à décider.
   */
  remaining?: number | null
}

/** Le texte de description d'un objectif, par libellé (`intent.openAccount` → `intent.descriptions.openAccount`). */
function descriptionKey(labelKey: string): string {
  return `intent.descriptions.${labelKey.replace('intent.', '')}`
}

/**
 * La vérification avant lancement (refonte Théo R2) : « Le bon périmètre, dès le départ. » Rien n'est
 * collecté tant qu'on n'a pas confirmé. À gauche, ce qu'on peut encore régler (périmètre, zone,
 * angle, profondeur) et ce que Bellum sait déjà ; à droite, le dossier qu'on prépare et l'unique
 * bouton qui lance. Aucun prix, aucun solde : un solde épuisé se dit par le frein doux.
 */
export function ScopeConfirmPanel({
  summary,
  country,
  selection,
  onSelectionChange,
  preset,
  context,
  onContextChange,
  intents,
  knownLines,
  onOpenKnown,
  onEdit,
  onConfirm,
  disabled = false,
  relaunch = false,
  relaunchFreshness,
  depthMedians,
  remaining = null,
}: ScopeConfirmPanelProps) {
  const { t } = useTranslation('search')
  const gate = useCreditGate()
  // #2125.42 — le mode choisi dans le mini-plan. Il vit ici parce que c'est ici qu'on le choisit, et il
  // part avec la confirmation : le bouton qui débite envoie CE que le plan vient d'annoncer.
  const [refreshMode, setRefreshMode] = useState<RefreshScopeMode>('full')
  const depth: AnalysisRunDepth = selection.depth ?? DEFAULT_ANALYSIS_DEPTH
  // Louis 10/10 + #4464 (PR11) — solde insuffisant pour le palier choisi : jamais un lancement silencieux à un autre
  // prix. Pas de palier en relance : le mini-plan porte son propre mode.
  const excludedCount = selection.excluded_entities?.length ?? 0
  const shortBalance =
    !relaunch && remaining !== null && estimateAnalysisCredits(summary.scopeMode, excludedCount, depth) > remaining
      ? remaining
      : null
  const canSwitchToQuick =
    shortBalance !== null &&
    depth !== 'quick' &&
    estimateAnalysisCredits(summary.scopeMode, excludedCount, 'quick') <= shortBalance
  const blocked = (gate.known && (!gate.canAnalyze || gate.locked)) || shortBalance !== null
  const patch = (next: Partial<AnalysisScopeSelection>) => onSelectionChange({ ...selection, ...next })

  // Les objectifs cochés, nommés ; sans coche, celui que le contexte porte (jamais un vide).
  const objectiveKeys =
    intents.length > 0
      ? intents
      : INTENT_SUGGESTIONS.filter(s => s.preset === preset)
          .slice(0, 1)
          .map(s => s.labelKey)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex w-full flex-1 flex-col"
    >
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3.5 px-4 pb-8 pt-3 md:px-8">
        <ScreenGuideLink />
        {/* Le hero de la vérification : le sur-titre, le nom de l'entreprise, sa carte d'identité ; à droite
            « Modifier » (retour au cadrage) et « Mes analyses ». */}
        <header data-confirm-section="hero" className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <CompanyLogo name={summary.objectName} className="size-10 shrink-0 text-sm" />
            <div className="min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--bellum-text-accent)]">
                {t('confirm.eyebrow')}
              </span>
              <h1 className="truncate text-2xl font-semibold tracking-tight text-[var(--bellum-text-primary)] md:text-3xl">
                {summary.objectName}
              </h1>
              <p className="truncate text-xs text-[var(--bellum-text-secondary)]">
                {[summary.location, summary.registryLabel ?? t('confirm.byName')].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <QuietButton onClick={onEdit} className="text-xs text-[var(--bellum-text-secondary)]">
              <Pencil className="size-3.5" aria-hidden="true" />
              {t('confirm.modify')}
            </QuietButton>
            <Link to="/search" search={{ vue: 'historique' }} className={HEADER_LINK}>
              <History className="size-4" aria-hidden="true" />
              {t('analyze.myAnalyses')}
            </Link>
          </div>
        </header>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section
            aria-labelledby="confirm-scope-title"
            data-confirm-section="scope"
            className="flex min-w-0 flex-col gap-4 rounded-2xl border border-[var(--bellum-border)] bg-card p-4 md:p-5"
          >
            <h2
              id="confirm-scope-title"
              className="text-base font-semibold tracking-tight text-[var(--bellum-text-primary)]"
            >
              {t('confirm.title')}
            </h2>
            <ScopeKindRow selection={selection} patch={patch} country={country} />
            <GeoPerimeterField
              value={selection.geo_perimeter}
              onChange={next => patch({ geo_perimeter: next })}
              geoAreas={selection.geo_areas ?? []}
              onGeoAreasChange={next => patch({ geo_areas: next })}
              disabled={disabled}
            />
            {/* #4432.2 — la zone venue de Découvrir s'enlève d'un geste, sans re-saisie ; sur le marché français
                seulement (main, PR10). */}
            {country === 'FR' &&
            (selection.geo_areas ?? []).length > 0 &&
            (selection.geo_perimeter === 'region' || selection.geo_perimeter === 'city') ? (
              <button
                type="button"
                onClick={() => onSelectionChange(widenGeoScopeToFrance(selection))}
                disabled={disabled}
                className="-mt-2 self-start text-xs font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline disabled:opacity-50 pointer-coarse:min-h-11"
              >
                {t('confirm.geo.widenToFrance')}
              </button>
            ) : null}
            <p className="-mt-3 text-xs text-[var(--bellum-text-muted)]">{t('analyze.scope.zoneHelp')}</p>

            <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--bellum-text-primary)]">
              {t('confirm.angleLabel')}
              <textarea
                rows={3}
                value={angleOf(context)}
                onChange={event => onContextChange(withAngle(context, event.target.value))}
                disabled={disabled}
                className="w-full rounded-control border border-[var(--bellum-border-strong)] bg-[var(--bellum-bg)] px-3 py-2 text-sm font-normal leading-relaxed text-[var(--bellum-text-primary)] outline-none focus:border-[var(--bellum-text-accent)] focus:ring-[3px] focus:ring-[var(--bellum-accent-bg)]"
              />
            </label>

            {relaunch ? null : (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-[var(--bellum-text-primary)]">
                  {t('confirm.depth.label')}
                </span>
                <div role="radiogroup" aria-label={t('confirm.depth.label')} className="grid gap-2 sm:grid-cols-2">
                  {SELECTABLE_ANALYSIS_RUN_DEPTHS.map(option => {
                    const median = depthMedians?.[option] ?? null
                    const checked = option === depth
                    return (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        disabled={disabled}
                        onClick={() => patch({ depth: option })}
                        className={cn(
                          'flex min-h-14 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left text-xs transition-colors pointer-coarse:min-h-14',
                          checked
                            ? 'border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)]'
                            : 'border-[var(--bellum-border)] bg-[var(--bellum-bg)] hover:bg-[var(--bellum-surface-2)]',
                        )}
                      >
                        <span
                          className={cn(
                            'text-xs font-semibold',
                            checked ? 'text-[var(--bellum-text-accent)]' : 'text-[var(--bellum-text-primary)]',
                          )}
                        >
                          {t(`confirm.depth.${option}`)}
                        </span>
                        <span className="text-[var(--bellum-text-secondary)]">
                          {median === null
                            ? t('confirm.depth.durationUnmeasured')
                            : t('confirm.depth.durationMeasured', { min: Math.max(1, Math.round(median / 60)) })}
                          {' · '}
                          {t('confirm.depth.pages', { count: ANALYSIS_DEPTH_PRESETS[option].pages })}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-[var(--bellum-text-muted)]">{t('confirm.depth.help')}</p>
              </div>
            )}

            {knownLines.length > 0 ? (
              <div className="flex flex-col gap-2 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-bg)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--bellum-text-primary)]">
                    <ShieldCheck className="size-4 text-[var(--bellum-text-accent)]" aria-hidden="true" />
                    {t('analyze.known.title')}
                  </h3>
                  <QuietButton onClick={onOpenKnown}>{t('analyze.known.seeDetail')}</QuietButton>
                </div>
                <p className="text-sm text-[var(--bellum-text-secondary)]">
                  {knownLines.join(' · ')}. {t('confirm.known.included')}
                </p>
              </div>
            ) : null}

            {relaunch ? (
              <div className="flex flex-col gap-2 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-bg)] p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--bellum-text-primary)]">
                  <RefreshCw className="size-4 text-[var(--bellum-text-accent)]" aria-hidden="true" />
                  {t('confirm.relaunch.title')}
                </h3>
                <dl className="grid gap-x-4 gap-y-1.5 text-sm md:grid-cols-[auto_minmax(0,1fr)]">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--bellum-text-primary)]">
                    {t('analyze.relaunch.redo')}
                  </dt>
                  <dd className="text-[var(--bellum-text-secondary)]">{t('confirm.relaunch.redone')}</dd>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--bellum-text-primary)]">
                    {t('analyze.relaunch.keep')}
                  </dt>
                  <dd className="text-[var(--bellum-text-secondary)]">{t('confirm.relaunch.kept')}</dd>
                </dl>
                {/* #2125.35-.38, .42, .46, .49 — LE MINI-PLAN : ce qui est devenu VIEUX (et depuis quand),
                    ce qu'on peut ne relire QU'EN PARTIE. */}
                <RefreshPlanCard freshness={relaunchFreshness ?? {}} mode={refreshMode} onModeChange={setRefreshMode} />
              </div>
            ) : null}
          </section>

          <aside
            aria-labelledby="confirm-prepare-title"
            data-confirm-section="prepare"
            className="flex min-w-0 flex-col gap-3.5 rounded-2xl border border-[var(--bellum-border)] bg-card p-4 md:p-5 lg:sticky lg:top-4"
          >
            <h2
              id="confirm-prepare-title"
              className="text-base font-semibold tracking-tight text-[var(--bellum-text-primary)]"
            >
              {t('confirm.prepareTitle')}
            </h2>
            <ul className="flex flex-col gap-3">
              {objectiveKeys.map(labelKey => (
                <li key={labelKey} className="flex gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-accent)]">
                    <Target className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-sm font-semibold text-[var(--bellum-text-primary)]">
                      {t(labelKey)}
                    </strong>
                    <span className="text-xs text-[var(--bellum-text-secondary)]">{t(descriptionKey(labelKey))}</span>
                  </span>
                </li>
              ))}
              {intents.length === 0 && objectiveKeys.length === 0 ? (
                <li className="rounded-lg border border-[var(--bellum-border)] px-3 py-2 text-sm text-[var(--bellum-text-secondary)]">
                  {t(objectiveLabelKeyForPreset(preset))}
                </li>
              ) : null}
            </ul>
            <p className="text-sm text-[var(--bellum-text-secondary)]">
              <b className="text-[var(--bellum-text-primary)]">{t('confirm.expectedLead')}</b>{' '}
              {relaunch && refreshMode === 'organisation'
                ? t('confirm.expectedResultOrganisation')
                : t('confirm.expectedResultFull')}
            </p>
            {/* #4464.1 — le refus est LE frein doux commun, collé au bouton qu'il grise ; #4464.3 — Rapide n'est
                proposé que s'il est réellement permis. */}
            <div data-testid="scope-confirm-actions" className="flex flex-col gap-2">
              {blocked ? <SoftBrake /> : null}
              {canSwitchToQuick ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => patch({ depth: 'quick' })}
                  className="self-start"
                >
                  {t('confirm.insufficient.switchToQuick')}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="violet"
                onClick={() => onConfirm(relaunch ? refreshMode : undefined)}
                disabled={disabled || blocked}
                aria-disabled={disabled || blocked}
                isLoading={disabled}
                icon={Rocket}
                className="min-h-12 w-full gap-2"
              >
                {/* #4463 — plus de coût sur le bouton : le geste part directement. */}
                {t('confirm.launch')}
              </Button>
            </div>
            <div className="flex items-start gap-2.5 text-xs">
              <LauraFace decorative size={30} className="shrink-0" />
              <span className="flex flex-col gap-0.5">
                <strong className="text-[var(--bellum-text-primary)]">{t('confirm.noDuplicate')}</strong>
                <span className="text-[var(--bellum-text-secondary)]">{t('confirm.noSideEffects')}</span>
              </span>
            </div>
            <QuietButton onClick={onEdit} className="self-start text-xs text-[var(--bellum-text-secondary)]">
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              {t('confirm.backToFraming')}
            </QuietButton>
          </aside>
        </div>
        <p className="flex items-center gap-2 text-xs text-[var(--bellum-text-secondary)]">
          <Lock className="size-3.5" aria-hidden="true" />
          {t('confirm.footnote')}
        </p>
      </div>
    </motion.div>
  )
}
