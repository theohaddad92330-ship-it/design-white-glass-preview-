import { SELECTABLE_ANALYSIS_RUN_DEPTHS, type AnalysisScopeSelection, type ContextMode } from '@bellum/contracts'
import { ChevronDown, FileUp, Layers, MapPin, RefreshCw, UserRound } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SurfaceContextChip } from '@/features/context-contract/view/SurfaceContextChip'
import { useSurfaceContextContract } from '@/features/context-contract/api'
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SelectField,
} from '@bellum/ui'
import { removeNewlySharedLabels } from '../lib/scope-exclusivity'
import { ANALYSIS_ATTACHMENT_ACCEPT } from '../lib/analysis-attachments'
import { FIELD_TITLE, StepTitle } from './AnalyzeChrome'
import { scopeKindOf } from '../lib/scopeKind'
import { ScopeKindRow } from './ScopeKindRow'
import { BusinessFamilyField } from './BusinessFamilyField'
import { ContactLevelField } from './ContactLevelField'
import { GeoPerimeterField } from './GeoPerimeterField'
import { HeadcountField } from './HeadcountField'
import { ScopeChipsField } from './ScopeChipsField'
import { SourceExclusionsField } from './SourceExclusionsField'

type EntityKey = 'included_entities' | 'excluded_entities' | 'selected_angles' | 'excluded_angles'

type CadrageColumnProps = {
  selection: AnalysisScopeSelection
  onSelectionChange: (next: AnalysisScopeSelection) => void
  country: string
  /** Les entités DÉJÀ connues du dossier : l'autocomplétion de « Quelle partie du groupe ? ». */
  entitySuggestions: string[]
  prioritySuggestions: string[]
  recommendedPriorities: readonly string[]
  focusLookedUp: boolean
  /** Ce lancement RELANCE un dossier existant : pas de palier, un bloc « ce que la relance va faire ». */
  relaunch: boolean
  relaunchedOn: string | null
  /** La durée MÉDIANE mesurée de chaque palier (secondes) ; `null` = « non mesurée », jamais inventée. */
  depthMedians?: Partial<Record<'quick' | 'verified' | 'deep', number | null>> | undefined
  contextMode: ContextMode | undefined
  onContextModeChange: (mode: ContextMode) => void
  onAttachFiles: (files: File[]) => void
  attachmentsStrip: ReactNode
  disabled?: boolean
}

/** Une ligne de réglage qui ouvre sa fenêtre : intitulé, valeur courante, chevron. */
function SettingRow({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: typeof MapPin
  label: string
  value: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 w-full min-w-0 items-center gap-2.5 border-b border-[var(--bellum-border)] px-0.5 py-2 text-left transition-colors duration-immediate hover:bg-[var(--bellum-accent-bg)]"
    >
      <Icon className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <small className="text-xs text-[var(--bellum-text-secondary)]">{label}</small>
        <strong className="text-xs font-medium text-[var(--bellum-text-primary)] [overflow-wrap:anywhere]">
          {value}
        </strong>
      </span>
      <ChevronDown className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />
    </button>
  )
}

/** Une zone du périmètre, nommée en toutes lettres. */
function useZoneLabel(selection: AnalysisScopeSelection): string {
  const { t } = useTranslation('search')
  const perimeter = selection.geo_perimeter
  const areas = selection.geo_areas ?? []
  if (!perimeter) return t('analyze.cadrage.zoneUnset')
  const base = t(`confirm.geo.perimeters.${perimeter}`)
  return areas.length > 0 && (perimeter === 'region' || perimeter === 'city') ? areas.join(', ') : base
}

/**
 * « Quel périmètre travailler ? » — un groupe, une entité ou un site, puis la zone et les entités
 * ciblées / exclues. Le périmètre envoyé au serveur se DÉDUIT toujours de la zone (cadrage du
 * 15/10) : cette fenêtre ne crée pas de réglage de plus, elle regroupe ceux qui existaient.
 */
function ScopeDialog({
  open,
  onOpenChange,
  selection,
  patch,
  patchExclusive,
  country,
  entitySuggestions,
  disabled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selection: AnalysisScopeSelection
  patch: (next: Partial<AnalysisScopeSelection>) => void
  patchExclusive: (
    key: 'included_entities' | 'excluded_entities',
    other: 'included_entities' | 'excluded_entities',
    next: string[],
  ) => void
  country: string
  entitySuggestions: string[]
  disabled: boolean
}) {
  const { t } = useTranslation('search')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" closeLabel={t('common:actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('analyze.scope.title')}</DialogTitle>
          <DialogDescription>{t('analyze.scope.description')}</DialogDescription>
        </DialogHeader>
        <ScopeKindRow selection={selection} patch={patch} country={country} />
        <div className="flex flex-col gap-4">
          <GeoPerimeterField
            value={selection.geo_perimeter}
            onChange={next => patch({ geo_perimeter: next })}
            geoAreas={selection.geo_areas ?? []}
            onGeoAreasChange={next => patch({ geo_areas: next })}
            disabled={disabled}
          />
          <p className="text-xs text-[var(--bellum-text-muted)]">{t('analyze.scope.zoneHelp')}</p>
          <ScopeChipsField
            label={t('confirm.focus.includedEntitiesLabel')}
            hint={t('confirm.focus.includedEntitiesHint')}
            warning={(selection.included_entities ?? []).length > 1 ? t('confirm.focus.anchorWarning') : undefined}
            placeholder={t('confirm.focus.includedEntitiesPlaceholder')}
            values={selection.included_entities ?? []}
            onChange={next => patchExclusive('included_entities', 'excluded_entities', next)}
            removeLabel={value => t('confirm.focus.remove', { value })}
            addLabel={value => t('confirm.focus.entityAdd', { value })}
            suggestions={entitySuggestions}
            disabled={disabled}
          />
          <ScopeChipsField
            label={t('confirm.focus.excludedEntitiesLabel')}
            hint={t('confirm.focus.excludedEntitiesHint')}
            placeholder={t('confirm.focus.excludedEntitiesPlaceholder')}
            values={selection.excluded_entities ?? []}
            onChange={next => patchExclusive('excluded_entities', 'included_entities', next)}
            removeLabel={value => t('confirm.focus.remove', { value })}
            addLabel={value => t('confirm.focus.entityExclude', { value })}
            suggestions={entitySuggestions}
            disabled={disabled}
          />
          <p className="text-xs text-[var(--bellum-text-muted)]">{t('analyze.scope.kept')}</p>
        </div>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t('analyze.scope.done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Le nombre de réglages fins posés sous « Personnalisation » (un champ vide ne compte pas). */
function refineCount(selection: AnalysisScopeSelection): number {
  const lists = [
    selection.hierarchy_levels,
    selection.business_families,
    selection.selected_angles,
    selection.excluded_angles,
  ]
  const fromLists = lists.filter(list => list !== undefined && list.length > 0).length
  const toggles = [selection.exclude_public_sector === true, selection.exclude_worked_accounts === true]
  const headcount = selection.headcount_min !== undefined || selection.headcount_max !== undefined
  return fromLists + toggles.filter(Boolean).length + (headcount ? 1 : 0)
}

/**
 * Étape 3 — « Ton cadrage » (refonte V22, #4512) : les quatre réglages de la maquette — personnalisation,
 * périmètre, profondeur, document facultatif — et la relance quand il y en a une.
 *
 * #4512 (revient sur #4142) — les réglages fins (niveau de contact, postes, priorités, ce qu'on écarte, effectif)
 * ne vivent plus dans un panneau « Affiner » à part : ils sont REPLIÉS sous « Personnalisation ▾ », fermé par défaut
 * (AM.44, « mode avancé replié »), avec le choix du contexte. Un titre par notion. Aucun réglage retiré : la requête
 * envoyée pour un même cadrage est celle d'avant (`Search.requestParity.test.tsx`).
 */
export function CadrageColumn({
  selection,
  onSelectionChange,
  country,
  entitySuggestions,
  prioritySuggestions,
  recommendedPriorities,
  focusLookedUp,
  relaunch,
  relaunchedOn,
  depthMedians,
  contextMode,
  onContextModeChange,
  onAttachFiles,
  attachmentsStrip,
  disabled = false,
}: CadrageColumnProps) {
  const { t } = useTranslation('search')
  const [scopeOpen, setScopeOpen] = useState(false)
  // AM.44 — le mode avancé est REPLIÉ par défaut.
  const [personalOpen, setPersonalOpen] = useState(false)
  const personalPanelId = useId()
  const fileInput = useRef<HTMLInputElement>(null)
  const { data: contextContract } = useSurfaceContextContract('analyze', contextMode)
  const zone = useZoneLabel(selection)

  const patch = (next: Partial<AnalysisScopeSelection>) => onSelectionChange({ ...selection, ...next })
  // #4142 — ciblé / exclu, thèmes retenus / écartés sont deux champs opposés : un ajout dans l'un retire
  // le même libellé de l'autre, SEULEMENT quand un retrait a réellement lieu.
  const patchExclusive = (key: EntityKey, otherKey: EntityKey, next: string[]) => {
    const current = selection[key] ?? []
    const otherCurrent = selection[otherKey] ?? []
    const otherNext = removeNewlySharedLabels(otherCurrent, current, next)
    patch(otherNext === otherCurrent ? { [key]: next } : { [key]: next, [otherKey]: otherNext })
  }

  const included = (selection.included_entities ?? []).length
  const excluded = (selection.excluded_entities ?? []).length
  const scopeKind = scopeKindOf(selection)
  const scopeSub = [
    t(`analyze.scope.kind.${scopeKind}`),
    included > 0 ? t('analyze.scope.targeted', { count: included }) : null,
    excluded > 0 ? t('analyze.scope.excluded', { count: excluded }) : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const depth = selection.depth ?? 'deep'
  const median = depthMedians?.[depth] ?? null
  const refined = refineCount(selection)
  const retainedThemes = selection.selected_angles ?? []
  const themesLine =
    retainedThemes.length > 0
      ? t('analyze.cadrage.themesRetained', { values: retainedThemes.join(', ') })
      : recommendedPriorities.length > 0
        ? t('analyze.cadrage.themesRecommended', { values: recommendedPriorities.join(', ') })
        : prioritySuggestions.length > 0
          ? t('analyze.cadrage.themesSuggested', { values: prioritySuggestions.slice(0, 5).join(', ') })
          : t('confirm.focus.suggestionsEmpty')

  return (
    // Une ÉTAPE du cadrage (3), comme les deux autres : une région nommée, pas un complément de page (Théo B r1-recherche.R1).
    <section aria-labelledby="analyze-cadrage-title" className="min-w-0">
      <StepTitle step={3} id="analyze-cadrage-title" title={t('analyze.cadrage.title')} />
      <div data-cadrage="settings" className="flex flex-col">
        <button
          type="button"
          aria-expanded={personalOpen}
          aria-controls={personalPanelId}
          onClick={() => setPersonalOpen(open => !open)}
          className="flex min-h-12 w-full min-w-0 items-center gap-2.5 border-b border-[var(--bellum-border)] px-0.5 py-2 text-left transition-colors duration-immediate hover:bg-[var(--bellum-accent-bg)]"
        >
          <UserRound className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden="true" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <small className="text-xs text-[var(--bellum-text-secondary)]">
              {t('analyze.cadrage.personalisation')}
            </small>
            <strong className="text-xs font-medium text-[var(--bellum-text-primary)] [overflow-wrap:anywhere]">
              {contextContract
                ? t(`contextContract.modes.${contextContract.mode}`, { ns: 'chat' })
                : t('analyze.cadrage.personalisationDefault')}
              {/* Replié, un réglage posé se DIT : rien de caché en silence sous le chevron. */}
              {refined > 0 ? (
                <span className="font-normal text-[var(--bellum-text-secondary)]">
                  {' · '}
                  {t('analyze.cadrage.refinedCount', { count: refined })}
                </span>
              ) : null}
            </strong>
          </span>
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 text-[var(--bellum-text-muted)] transition-transform duration-immediate',
              personalOpen && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </button>
        {/* #4294.5 — les thèmes se DISENT replié : retenus, sinon recommandés, sinon proposés par le profil, sinon la
            raison de leur absence. Jamais un bloc vide ni un « 0 ». */}
        <p
          data-testid="cadrage-themes"
          className="border-b border-[var(--bellum-border)] px-0.5 py-2 text-xs text-[var(--bellum-text-secondary)]"
        >
          {themesLine}
        </p>
        {personalOpen ? (
          <div
            id={personalPanelId}
            data-cadrage="personalisation"
            className="flex flex-col gap-4 border-b border-[var(--bellum-border)] px-0.5 pb-4 pt-3"
          >
            <section aria-labelledby={`${personalPanelId}-context`} className="flex flex-col gap-1.5">
              <h3 id={`${personalPanelId}-context`} className={FIELD_TITLE}>
                {t('analyze.context.title')}
              </h3>
              <p className="text-xs text-[var(--bellum-text-secondary)]">{t('analyze.context.description')}</p>
              <SurfaceContextChip
                surface="analyze"
                {...(contextMode ? { mode: contextMode } : {})}
                onModeChange={onContextModeChange}
              />
              <Link
                to="/settings/profile"
                className="inline-flex min-h-8 w-fit items-center text-xs font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline pointer-coarse:min-h-11"
              >
                {t('composer.correctProfileCta')}
              </Link>
            </section>
            <ContactLevelField
              value={selection.hierarchy_levels ?? []}
              onChange={next => patch({ hierarchy_levels: next })}
              disabled={disabled}
            />
            <BusinessFamilyField
              value={selection.business_families ?? []}
              onChange={next => patch({ business_families: next })}
              disabled={disabled}
            />
            <div className="flex flex-col gap-1.5">
              {/* Un seul champ à pastilles : ce que tu vends, avec les suggestions du profil DEDANS. */}
              <ScopeChipsField
                label={t('analyze.refine.priorities')}
                warning={(selection.selected_angles ?? []).length > 1 ? t('confirm.focus.anchorWarning') : undefined}
                placeholder={t('confirm.focus.prioritiesPlaceholder')}
                values={selection.selected_angles ?? []}
                onChange={next => patchExclusive('selected_angles', 'excluded_angles', next)}
                removeLabel={value => t('confirm.focus.remove', { value })}
                addLabel={value => t('confirm.focus.suggestionAdd', { value })}
                disabled={disabled}
                suggestions={prioritySuggestions}
                suggestionsInside
                recommended={recommendedPriorities}
                recommendedLabel={t('marketPreview.focusRecommended')}
                emptySuggestionsHint={t('confirm.focus.suggestionsEmpty')}
                suggestionsSource={
                  <Link
                    to="/settings/profile/$stage"
                    params={{ stage: 'offer_expertise' }}
                    className="inline-flex min-h-6 w-fit items-center text-xs text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11"
                  >
                    {t('confirm.focus.suggestionsSource')}
                  </Link>
                }
              />
              {recommendedPriorities.length > 0 ? (
                <p className="text-xs text-[var(--bellum-text-muted)]">{t('marketPreview.focusWhy')}</p>
              ) : focusLookedUp ? (
                <p className="text-xs text-[var(--bellum-text-muted)]">{t('marketPreview.focusNoMatch')}</p>
              ) : null}
            </div>
            {/* Un seul champ « Ce qu'on écarte » : les thèmes, puis les deux exclusions de source, sans second titre. */}
            <ScopeChipsField
              label={t('analyze.refine.exclude')}
              hint={t('confirm.focus.excludedAnglesHint')}
              placeholder={t('confirm.focus.excludedAnglesPlaceholder')}
              values={selection.excluded_angles ?? []}
              onChange={next => patchExclusive('excluded_angles', 'selected_angles', next)}
              removeLabel={value => t('confirm.focus.remove', { value })}
              disabled={disabled}
              after={
                <SourceExclusionsField
                  publicSector={selection.exclude_public_sector === true}
                  workedAccounts={selection.exclude_worked_accounts === true}
                  onChange={patch}
                  disabled={disabled}
                />
              }
            />
            <HeadcountField
              min={selection.headcount_min}
              max={selection.headcount_max}
              onChange={({ min, max }) => patch({ headcount_min: min, headcount_max: max })}
              disabled={disabled}
            />
          </div>
        ) : null}
        <SettingRow
          icon={MapPin}
          label={t('analyze.cadrage.perimeter', { zone })}
          value={scopeSub}
          onClick={() => setScopeOpen(true)}
        />
        {relaunch ? null : (
          <div className="flex min-h-12 min-w-0 items-center gap-2.5 border-b border-[var(--bellum-border)] px-0.5 py-2">
            <Layers className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden="true" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <strong className="text-xs font-medium text-[var(--bellum-text-primary)]">
                {t('confirm.depth.label')}
              </strong>
              <small className="text-xs text-[var(--bellum-text-secondary)]">
                {median === null
                  ? t('confirm.depth.durationUnmeasured')
                  : t('confirm.depth.durationMeasured', { min: Math.max(1, Math.round(median / 60)) })}
              </small>
            </span>
            <SelectField
              value={depth}
              onChange={next => patch({ depth: next as 'quick' | 'deep' })}
              options={SELECTABLE_ANALYSIS_RUN_DEPTHS.map(option => ({
                value: option,
                label: t(`confirm.depth.${option}`),
              }))}
              ariaLabel={t('confirm.depth.label')}
              size="sm"
              disabled={disabled}
              className="w-36 shrink-0"
            />
          </div>
        )}
      </div>

      <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-[var(--bellum-border)] px-0.5">
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          accept={ANALYSIS_ATTACHMENT_ACCEPT}
          onChange={event => {
            const files = Array.from(event.target.files ?? [])
            event.target.value = ''
            if (files.length > 0) onAttachFiles(files)
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="inline-flex min-h-11 items-center gap-2.5 text-xs text-[var(--bellum-text-secondary)] transition-colors duration-immediate hover:text-[var(--bellum-text-accent)] md:min-h-9"
        >
          <FileUp className="size-4" aria-hidden="true" />
          {t('analyze.cadrage.addDocument')}
        </button>
        <span className="text-xs text-[var(--bellum-text-secondary)]">{t('analyze.purpose.optional')}</span>
      </div>
      {attachmentsStrip}

      {relaunch ? (
        <details className="group border-b border-[var(--bellum-border)] px-0.5">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2.5 py-2 text-xs font-semibold text-[var(--bellum-text-primary)] [&::-webkit-details-marker]:hidden">
            <RefreshCw className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              {t('analyze.relaunch.title')}
              {relaunchedOn ? (
                <small className="block text-xs font-normal text-[var(--bellum-text-secondary)]">
                  {t('analyze.relaunch.analysedOn', { date: relaunchedOn })}
                </small>
              ) : null}
            </span>
            <ChevronDown
              className="size-4 shrink-0 text-[var(--bellum-text-muted)] transition-transform duration-immediate group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <dl className="flex flex-col gap-2 pb-3 text-xs">
            <div>
              <dt className="font-medium text-[var(--info-soft-text)]">{t('analyze.relaunch.redo')}</dt>
              <dd className="text-[var(--bellum-text-secondary)]">{t('confirm.relaunch.redone')}</dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--success-soft-text)]">{t('analyze.relaunch.keep')}</dt>
              <dd className="text-[var(--bellum-text-secondary)]">{t('confirm.relaunch.kept')}</dd>
            </div>
          </dl>
        </details>
      ) : null}

      <ScopeDialog
        open={scopeOpen}
        onOpenChange={setScopeOpen}
        selection={selection}
        patch={patch}
        patchExclusive={patchExclusive}
        country={country}
        entitySuggestions={entitySuggestions}
        disabled={disabled}
      />
    </section>
  )
}
