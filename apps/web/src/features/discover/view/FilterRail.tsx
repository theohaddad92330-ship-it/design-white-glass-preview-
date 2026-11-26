import type { DiscoverResultType } from '@bellum/contracts'
import { usePackVocabulary } from '@/features/profile/hooks/usePackVocabulary'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  Building2,
  ChevronDown,
  ChevronRight,
  Layers,
  MapPin,
  Route,
  Search,
  SlidersHorizontal,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  FilterChips,
  cn,
} from '@bellum/ui'
import {
  refinesWithoutLaunching,
  DECISION_LEVEL_FILTERS,
  DELIVERY_FIT_FILTERS,
  detectInconsistentFilters,
  emptyUnifiedFilters,
  hasIntentSignals,
  isUnifiedRunnable,
  FIT_FILTERS,
  REMOTE_POLICY_FILTERS,
  SENIORITY_FILTERS,
  type FitFilter,
  type UnifiedFilters,
  skillsFieldValue,
  withSkills,
} from '@/features/discover/lib/discover-filters'
import {
  FRAMING_SECTIONS,
  countFramingCriteria,
  type FramingExtras,
  type FramingOpenRequest,
  type FramingSection,
} from '@/features/discover/lib/discover-framing'
import { skillChipLabel, skillChipTitle } from '@/features/discover/lib/discover-skill-chip'
import {
  applicationSectorLabel,
  privateSectorActive,
  togglePrivateSector,
} from '@/features/discover/lib/discover-sectors'
import { SectorPicker } from './SectorPicker'
import { FilterSummary } from './FilterSummary'
import { NeedsFiltersBlock, type NeedsConsultantOption } from './NeedsFiltersBlock'
import { SignalChips } from './SignalChips'
import { SizeFilter } from './SizeFilter'
import { SIZE_BANDS, STARTUP_SEGMENT_HEADCOUNT } from '@/features/discover/lib/discover-size-bounds'
import { isMiddleMarketActive, toggleMiddleMarket } from '@/features/discover/lib/discover-presets'
import { LEGAL_FORMS, REGISTRY_REGIONS } from '@/features/discover/lib/discover-registry-vocab'
import {
  CITY_RADIUS_OPTIONS,
  COMPANY_AGE_BUCKETS,
  GROUP_ROLE_OPTIONS,
  SIGNAL_SOURCES,
  SITE_BASIS_OPTIONS,
  type CityRadiusOption,
  type CompanyAgeBucket,
  type GroupRoleOption,
  type SiteBasisOption,
} from '@/features/discover/lib/discover-types'
import {
  isStartupSegmentActive,
  RECENCY_WINDOWS,
  STARTUP_SEGMENT_AGE,
  STARTUP_SEGMENT_LEGAL_FORM,
} from '@/features/discover/lib/discover-query'
import { dataSourceLabels } from '@/lib/data-source-label'
import { guideAnchorProps } from '@/features/guide/guide-anchors'
import { OnboardingSectorProposal } from './OnboardingSectorProposal'
import { Field, SelectInput, TextInput, ToggleChip } from './filter-controls'
import { hasUnrecognizedZone, ZoneSuggestField } from './ZoneSuggestField'

/* ------------------------------------------------------------------ */
/*  #4493 / #4494 (Louis 24/10) — la barre « Quel marché veux-tu        */
/*  explorer ? » et la modale « Cadrer la recherche » de la maquette    */
/*  V22.                                                                */
/*                                                                     */
/*  · La BARRE : un champ libre + « Explorer » (revient sur #3646), puis */
/*    les puces Territoire · Secteurs · Expertises · Besoins & signaux   */
/*    · Tous les filtres — chacune ouvre la modale SUR SA RUBRIQUE.      */
/*  · La MODALE : deux colonnes. À gauche les rubriques (parcours        */
/*    libre), le compte de critères et « Réinitialiser les critères » ;  */
/*    à droite la rubrique ouverte ; en pied « N comptes » recalculé en   */
/*    direct, « Annuler » et « Appliquer et explorer ».                   */
/*                                                                     */
/*  La modale travaille sur un BROUILLON : rien ne bouge à l'écran tant  */
/*  qu'on n'a pas appliqué, et « Annuler » le jette. AUCUN filtre de      */
/*  l'ancien rail n'est perdu — chacun a sa rubrique (`FRAMING_FIELDS`,  */
/*  `discover-framing.ts`), et la requête envoyée pour un même cadrage   */
/*  est identique (aucun appel changé).                                 */
/* ------------------------------------------------------------------ */

/** Sentinelle du chip « Toute la France » : jamais un code de région, jamais écrite dans les filtres. */
const WHOLE_FRANCE = 'whole-france'

/** #5000 — les choix de contrat sont exclusifs : poser l'un remet les autres à faux. */
const NO_CONTRACT = { cdiOnly: false, freelanceOnly: false, cddOnly: false, interimOnly: false } as const

const SECTION_ICON: Readonly<Record<FramingSection, LucideIcon>> = {
  companies: Building2,
  territory: MapPin,
  expertise: Layers,
  signals: Zap,
  relation: Route,
  size: Users,
}

function toggled<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter(item => item !== value) : [...list, value]
}

function SectionBlock({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-[var(--bellum-border)] pt-5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-base font-semibold text-[var(--bellum-text-primary)]">{title}</h4>
        {aside && <span className="text-xs text-[var(--bellum-text-secondary)]">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

/** Les champs d'une rubrique, mesurés au CONTENEUR (la colonne de droite), jamais à la fenêtre (GA-373). */
function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4">{children}</div>
}

function ChevronSelect<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (value: T) => void
  options: readonly T[]
  label: (option: T) => string
}) {
  return (
    <SelectInput
      value={value}
      onChange={next => onChange(next as T)}
      options={options.map(option => ({ value: option, label: label(option) }))}
    />
  )
}

export function FilterRail({
  filters,
  onChange,
  onSubmit,
  onApply,
  onReset,
  loading,
  extras,
  countFor,
  partnerFilters = false,
  consultantOptions = [],
  unapplied,
  listEmpty = false,
  observedClientsUnknownCount,
  expertiseUnknownCount,
  contractRecourseImpact,
  complementarityUnknownCount,
  resultType,
  onOpenSimilar,
  openRequest,
  onboardingSectors = [],
}: {
  filters: UnifiedFilters
  /** La saisie libre de la barre écrit ICI (`filters.freetext`), en direct ; la modale, elle, n'écrit qu'à l'application. */
  onChange: (next: UnifiedFilters) => void
  /** « Explorer » : lance la recherche sur les critères posés (texte libre compris). */
  onSubmit: () => void
  /** « Appliquer et explorer » : le brouillon de la modale devient la recherche, et elle part. */
  onApply: (draft: UnifiedFilters, extras: FramingExtras) => void
  /** #4317 — un cadrage VIDÉ puis appliqué repart de zéro (recherche lancée, URL et tranche du profil comprises). */
  onReset?: () => void
  loading: boolean
  /** Les affinages d'écran que la modale règle aussi (fit, filtres du panneau Partenaires) : leur valeur ACTUELLE. */
  extras: FramingExtras
  /** « N comptes » en direct : `null` = non calculable sans relancer (aucun chiffre n'est alors affiché). */
  countFor?: (draft: UnifiedFilters, extras: FramingExtras) => number | null
  /** #2151.31-.34 / #2165.51/.55 — les filtres du panneau Partenaires sont branchés par l'appelant. */
  partnerFilters?: boolean
  /** #5203 — les consultants de l'espace (poste + pile) pour « Depuis un consultant » ; vide = sélecteur muet. */
  consultantOptions?: readonly NeedsConsultantOption[]
  /** Critère d'écran → sources qui n'ont pas su l'appliquer (capacité, pas panne). Dit À CÔTÉ du champ. */
  unapplied?: ReadonlyMap<string, string[]>
  /** #4588 — la liste rendue est VIDE : « non appliqué » ne promet pas des résultats « plus larges ». */
  listEmpty?: boolean
  /** #2151.32 / #2165.51 / #2291.2 / #2165.55 — ce que les filtres d'écran ont retiré faute de savoir, jamais tu. */
  observedClientsUnknownCount?: number
  expertiseUnknownCount?: number
  contractRecourseImpact?: { removedCount: number; unknownCount: number } | null
  complementarityUnknownCount?: number
  /** Le TYPE DE RÉSULTAT affiché : « Partenaires » montre les filtres partenaires même hors mode ESN. */
  resultType?: DiscoverResultType
  /** Théo `decouvrir.A1` — « Comme tes comptes » : la recherche par comptes comparables, depuis la rubrique Relation. */
  onOpenSimilar?: () => void
  /**
   * #4493 — une piste (ex. « Une expertise ») ouvre la modale SUR SA RUBRIQUE, le brouillon pré-rempli de ce que
   * l'espace a déclaré : on VOIT le cadrage avant de l'appliquer. Ouvrir n'est jamais lancer (#4490).
   */
  openRequest?: FramingOpenRequest | null
  /** #4973 — codes des secteurs choisis à l'onboarding : PROPOSÉS sous le sélecteur, jamais posés d'office. */
  onboardingSectors?: readonly string[]
}) {
  const { t, i18n } = useTranslation('discover')
  const { context } = usePackVocabulary()

  /* ---------------- La barre de la page ---------------- */

  /**
   * #3878.1 / #4303.2 — une contradiction (CA min > max, secteur coché ET exclu) ou une zone hors référentiel ne
   * lance JAMAIS une recherche : le bouton se désactive et la raison est NOMMÉE (barre ET pied de modale).
   */
  const runnableOf = (value: UnifiedFilters) =>
    isUnifiedRunnable(value) && !detectInconsistentFilters(value) && !hasUnrecognizedZone(value)
  const hintOf = (value: UnifiedFilters): string | null =>
    runnableOf(value)
      ? null
      : detectInconsistentFilters(value)
        ? t('rail.inconsistentCriteria')
        : hasUnrecognizedZone(value)
          ? t('rail.zoneUnrecognized')
          : refinesWithoutLaunching(value)
            ? t('rail.refineOnly')
            : t('rail.needCriterion')
  const runnable = runnableOf(filters)
  const runnableHint = hintOf(filters)
  // #4607.2 / #4607.3 — le badge et le pied de la modale lisent le MÊME compteur (GA-26).
  const activeCount = countFramingCriteria(filters, extras)

  /* ---------------- La modale, sur un brouillon ---------------- */

  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<FramingSection>('companies')
  const [draft, setDraft] = useState<UnifiedFilters>(filters)
  const [draftExtras, setDraftExtras] = useState<FramingExtras>(extras)
  /* #3879.2 — la garde « un critère, un mot » reconnaît un critère au nom du champ lu dans `value={…}` :
     deux champs qui lisent `draft.<critère>` se confondent sous un seul mot. Un champ nomme son critère. */
  const { roleFamilyObserved, ecosystemObserved } = draft

  const openAt = (next: FramingSection) => {
    setDraft(filters)
    setDraftExtras(extras)
    setSection(next)
    setOpen(true)
  }
  const cancel = () => setOpen(false)
  // Une demande d'ouverture venue de la page (une piste) : chaque `nonce` neuf ouvre une fois.
  useEffect(() => {
    if (!openRequest) return
    setDraft({ ...filters, ...openRequest.patch })
    setDraftExtras(extras)
    setSection(openRequest.section)
    setOpen(true)
    // Seul le `nonce` déclenche : les filtres courants sont lus au moment de la demande.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.nonce])
  const set = <K extends keyof UnifiedFilters>(key: K, value: UnifiedFilters[K]) =>
    setDraft(current => ({ ...current, [key]: value }))
  const setMany = (patch: Partial<UnifiedFilters>) => setDraft(current => ({ ...current, ...patch }))
  const setExtra = <K extends keyof FramingExtras>(key: K, value: FramingExtras[K]) =>
    setDraftExtras(current => ({ ...current, [key]: value }))

  const draftCount = countFramingCriteria(draft, draftExtras)
  const draftEmpty = draftCount === 0
  const draftRunnable = runnableOf(draft)
  const draftHint = draftEmpty ? null : hintOf(draft)
  const liveCount = open && countFor ? countFor(draft, draftExtras) : null
  const apply = () => {
    if (!draftRunnable && !draftEmpty) return
    setOpen(false)
    // Un cadrage vidé puis appliqué n'est pas une recherche : on repart de zéro, comme « Nouvelle recherche ».
    if (draftEmpty) {
      if (onReset) onReset()
      else onChange(emptyUnifiedFilters())
      return
    }
    onApply(draft, draftExtras)
  }
  const enter = draftRunnable ? apply : undefined

  const notApplied = (key: string) => {
    const sources = unapplied?.get(key)
    if (!sources?.length) return undefined
    // #1912 — la CAPACITÉ, jamais l'identifiant du fournisseur.
    const labels = dataSourceLabels(t, sources)
    // #4588 (jumeau du panneau, lot DÉCOUVRIR-MOTEUR 27/10) — liste vide : rien n'est « plus large », on dit le fait seul.
    return t(listEmpty ? 'registry.unappliedEmpty' : 'registry.unapplied', {
      sources: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(labels),
    })
  }
  /** #1766 — un critère du registre qui n'agit pas quand un signal est coché le DIT, avec la sortie. */
  const registryOnly = hasIntentSignals(draft) ? t('rail.registryOnlyIdle') : undefined
  const partnerView = partnerFilters && (draft.entityType === 'esn' || resultType === 'partners')

  // #3941.1 — préréglage « Startup » : trois champs déjà affichés, posés en UN geste.
  const toggleStartupSegment = () =>
    setDraft(current =>
      isStartupSegmentActive(current)
        ? {
            ...current,
            age: 'any',
            legalForm: '',
            headcount: current.headcount.filter(range => !STARTUP_SEGMENT_HEADCOUNT.includes(range)),
          }
        : {
            ...current,
            age: STARTUP_SEGMENT_AGE,
            legalForm: STARTUP_SEGMENT_LEGAL_FORM,
            headcount: [...new Set([...current.headcount, ...STARTUP_SEGMENT_HEADCOUNT])],
          },
    )

  const unknownNote = (count: number | undefined, key: string) =>
    count ? <span className="text-xs text-[var(--bellum-text-secondary)]">{t(key, { count })}</span> : null

  function renderSection(current: FramingSection) {
    switch (current) {
      case 'companies':
        return (
          <>
            {/* #4746.2 (lot P) — « Le type de compte » a QUITTÉ cette fenêtre : il vit dans l'onglet « Comptes / Autres
                acteurs » de la liste (GA-26 : un réglage à un seul endroit). */}
            <SectionBlock title={t('framing.includeSectors')} aside={t('framing.includeSectorsHint')}>
              <Field
                mode="include"
                label={t('rail.sectorsLabel')}
                hint={t('rail.sectorsHint')}
                notApplied={notApplied('sector')}
              >
                <SectorPicker layout="families" selected={draft.sectors} onChange={next => set('sectors', next)} />
                <OnboardingSectorProposal
                  proposed={onboardingSectors}
                  selected={draft.sectors}
                  onAdd={code => set('sectors', [...draft.sectors, code])}
                />
              </Field>
              {/* #4294.7 — « Secteur privé », symétrique de « Secteur public » : même source (NAF), par le filtre
                  d'exclusion existant — les secteurs du groupe public sortent, rien d'autre ne change. */}
              <Field mode="include" label={t('rail.privateSectorLabel')} hint={t('rail.privateSectorHint')}>
                <ToggleChip
                  active={privateSectorActive(draft.excludeSectors)}
                  onClick={() => set('excludeSectors', togglePrivateSector(draft.excludeSectors))}
                >
                  {t('rail.privateSectorChip')}
                </ToggleChip>
              </Field>
              {/* #4294.7 — rangé sous Entreprises (il vivait sous Relation) : le rôle change l'ORDRE, jamais le CONTENU. */}
              {/* « Déjà travaillées » : les comptes que l'espace a déjà travaillés (relation ou mission
                    passée). Se COMBINE avec le secteur et tous les autres filtres (un ET), jamais une liste à part. */}
              <Field mode="include" label={t('rail.workedLabel')} hint={t('rail.workedHint')}>
                <ToggleChip active={draft.workedOnly} onClick={() => set('workedOnly', !draft.workedOnly)}>
                  {t('rail.workedChip')}
                </ToggleChip>
              </Field>
            </SectionBlock>

            <SectionBlock title={t('framing.excludeSectors')} aside={t('framing.excludeSectorsHint')}>
              <Field mode="exclude" label={t('rail.excludeSectorsLabel')} hint={t('rail.excludeSectorsHint')}>
                <SectorPicker
                  tone="exclude"
                  selected={draft.excludeSectors}
                  onChange={next => set('excludeSectors', next)}
                />
              </Field>
            </SectionBlock>

            <SectionBlock title={t('framing.registryBlock')}>
              <FieldGrid>
                <Field mode="include" label={t('registry.ageLabel')} notApplied={notApplied('age')}>
                  <ChevronSelect<CompanyAgeBucket>
                    value={draft.age}
                    onChange={value => set('age', value)}
                    options={COMPANY_AGE_BUCKETS}
                    label={bucket => t(`age.${bucket}`)}
                  />
                </Field>
                <Field
                  mode="include"
                  label={t('rail.legalFormLabel')}
                  hint={t('rail.legalFormHint')}
                  notApplied={registryOnly}
                >
                  <ChevronSelect<string>
                    value={draft.legalForm}
                    onChange={value => set('legalForm', value)}
                    options={['', ...LEGAL_FORMS.map(form => form.code)]}
                    label={code => {
                      const form = LEGAL_FORMS.find(entry => entry.code === code)
                      return form ? t(form.labelKey) : t('rail.legalFormAny')
                    }}
                  />
                </Field>
                {/* Deux bornes, chacune facultative : un champ vide reste VIDE, il ne vaut pas zéro. */}
                <Field
                  mode="include"
                  label={t('rail.revenueLabel')}
                  hint={t('rail.revenueHint')}
                  notApplied={registryOnly}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <TextInput
                      value={draft.revenueMin}
                      onChange={value => set('revenueMin', value)}
                      placeholder={t('rail.revenueMinPlaceholder')}
                      onEnter={enter}
                    />
                    <TextInput
                      value={draft.revenueMax}
                      onChange={value => set('revenueMax', value)}
                      placeholder={t('rail.revenueMaxPlaceholder')}
                      onEnter={enter}
                    />
                  </div>
                </Field>
                <Field
                  mode="include"
                  label={t('registry.nafLabel')}
                  hint={t('registry.nafHint')}
                  notApplied={notApplied('nafCode')}
                >
                  <TextInput
                    value={draft.nafCode}
                    onChange={value => set('nafCode', value)}
                    placeholder={t('registry.nafPlaceholder')}
                    onEnter={enter}
                  />
                </Field>
              </FieldGrid>
            </SectionBlock>
          </>
        )
      case 'territory':
        return (
          <>
            <SectionBlock title={t('framing.cityBlock')}>
              <FieldGrid>
                <Field mode="include" label={t('registry.cityLabel')} notApplied={notApplied('city')}>
                  <ZoneSuggestField
                    kind="city"
                    value={draft.city}
                    onChange={value => set('city', value)}
                    placeholder={t('registry.cityPlaceholder')}
                    onEnter={enter}
                  />
                </Field>
                {/* #2642.2 — un CERCLE autour de la ville, résolu sur ses coordonnées réelles ; sans ville, sans effet. */}
                <Field
                  mode="include"
                  label={t('rail.cityRadiusLabel')}
                  // #4607.1 — l'aide « sans effet sans ville » tombe dès qu'une ville est saisie.
                  hint={draft.city.trim() ? undefined : t('rail.cityRadiusHint')}
                  notApplied={registryOnly}
                >
                  <ChevronSelect<CityRadiusOption>
                    value={draft.cityRadiusKm}
                    onChange={value => set('cityRadiusKm', value)}
                    options={CITY_RADIUS_OPTIONS}
                    label={option => t(`rail.cityRadius.${option}`)}
                  />
                </Field>
                <Field
                  mode="include"
                  label={t('registry.departmentsLabel')}
                  hint={t('registry.departmentsHint')}
                  notApplied={notApplied('department')}
                >
                  <ZoneSuggestField
                    kind="department"
                    value={draft.department}
                    onChange={value => set('department', value)}
                    placeholder={t('registry.departmentsPlaceholder')}
                    onEnter={enter}
                  />
                </Field>
                {/* #3983.2 — siège ≠ implantation : sans ce choix, « à Lyon » inclut les groupes dont seule une agence l'est. */}
                <Field
                  mode="include"
                  label={t('rail.siteBasisLabel')}
                  hint={t('rail.siteBasisHint')}
                  notApplied={registryOnly}
                >
                  <ChevronSelect<SiteBasisOption>
                    value={draft.siteBasis}
                    onChange={value => set('siteBasis', value)}
                    options={SITE_BASIS_OPTIONS}
                    label={option => t(`rail.siteBasis.${option}`)}
                  />
                </Field>
              </FieldGrid>
            </SectionBlock>
            {/* #2642.1 — PLUSIEURS régions se cochent ensemble ; « Toute la France » les retire d'un clic. */}
            <SectionBlock title={t('framing.regionsBlock')} aside={t('framing.regionsHint')}>
              <Field
                mode="include"
                label={t('rail.regionLabel')}
                hint={t('rail.regionHint')}
                notApplied={registryOnly ?? notApplied('region')}
              >
                <FilterChips
                  ariaLabel={t('rail.regionLabel')}
                  multiple
                  size="sm"
                  options={[
                    { value: WHOLE_FRANCE, label: t('rail.regionAll') },
                    ...REGISTRY_REGIONS.map(region => ({ value: region.code, label: region.label })),
                  ]}
                  values={draft.region.length === 0 ? [WHOLE_FRANCE] : draft.region}
                  onToggle={code => set('region', code === WHOLE_FRANCE ? [] : toggled(draft.region, code))}
                />
              </Field>
            </SectionBlock>
          </>
        )
      case 'expertise':
        return (
          <>
            {/* #4316.1 — UN champ « Compétences » : offres ET techno observée (`withSkills`). */}
            <SectionBlock title={t('framing.skillsBlock')}>
              <Field mode="include" label={t('rail.keywordsLabel')} hint={t('rail.keywordsHint', { context })}>
                <TextInput
                  value={skillsFieldValue(draft)}
                  onChange={value => setDraft(current => withSkills(current, value))}
                  placeholder={t('rail.keywordsPlaceholder', { context })}
                  onEnter={enter}
                />
              </Field>
            </SectionBlock>
            {/* #5203 (lot 782) — période et nature des besoins (RETIRENT) ; « Tous » par défaut ; depuis un consultant. */}
            <SectionBlock title={t('needsFilters.block')} aside={t('needsFilters.blockHint')}>
              <FieldGrid>
                <NeedsFiltersBlock draft={draft} onChange={setDraft} consultants={consultantOptions} />
              </FieldGrid>
            </SectionBlock>
            <SectionBlock title={t('framing.recourseBlock')} aside={t('framing.recourseHint')}>
              <FieldGrid>
                {/* #2165.30 — au moins une ESN OBSERVÉE ; décocher n'affirme jamais « sans recours externe ». */}
                <Field
                  mode="include"
                  label={t('rail.externalRecourseObservedLabel')}
                  hint={t('rail.externalRecourseObservedHint')}
                >
                  <ToggleChip
                    active={draft.externalRecourseObserved}
                    onClick={() => set('externalRecourseObserved', !draft.externalRecourseObserved)}
                  >
                    {t('rail.externalRecourseObservedChip')}
                  </ToggleChip>
                </Field>
                {/* #2291.2 — le modèle de contrat s'OBSERVE, jamais déduit ; un compte jamais observé est COMPTÉ. */}
                <Field mode="include" label={t('rail.contractRecourseLabel')} hint={t('rail.contractRecourseHint')}>
                  <div className="flex flex-col gap-1">
                    <ToggleChip
                      active={draft.contractRecourseObserved}
                      onClick={() => set('contractRecourseObserved', !draft.contractRecourseObserved)}
                    >
                      {t('rail.contractRecourseChip')}
                    </ToggleChip>
                    {draft.contractRecourseObserved &&
                      unknownNote(contractRecourseImpact?.unknownCount, 'rail.contractRecourseUnknownCount')}
                  </div>
                </Field>
              </FieldGrid>
            </SectionBlock>
            {/* #4632 — les deux critères du panneau « Contexte marché observé » sans jumeau dans le rail. Ils
                cadrent la section « Marché observé » (mémoire marché, jamais le registre). Vocabulaire tenu :
                « observé », jamais « en place » ; « Écosystèmes liés à », jamais « ESN présente » ni « Clients de ». */}
            <SectionBlock title={t('framing.marketObservedBlock')} aside={t('framing.marketObservedHint')}>
              <FieldGrid>
                <Field label={t('rail.roleFamilyObservedLabel')} mode="include" hint={t('rail.roleFamilyObservedHint')}>
                  <TextInput
                    value={roleFamilyObserved}
                    onChange={value => set('roleFamilyObserved', value)}
                    placeholder={t('rail.roleFamilyObservedPlaceholder', { context })}
                    onEnter={enter}
                  />
                </Field>
                <Field label={t('rail.ecosystemObservedLabel')} mode="include" hint={t('rail.ecosystemObservedHint')}>
                  <TextInput
                    value={ecosystemObserved}
                    onChange={value => set('ecosystemObserved', value)}
                    placeholder={t('rail.ecosystemObservedPlaceholder')}
                    onEnter={enter}
                  />
                </Field>
              </FieldGrid>
            </SectionBlock>
          </>
        )
      case 'signals': {
        const hiring = draft.signalSources.includes('hiring')
        return (
          <>
            {/* #4315.3 — chaque case dit en une phrase ce qu'elle capte. « Augmentation de capital » y est, une fois. */}
            <SectionBlock title={t('framing.signalTypesBlock')}>
              <Field mode="include" label={t('rail.intentLabel')} hint={t('rail.intentHint')}>
                <SignalChips
                  sources={SIGNAL_SOURCES}
                  active={draft.signalSources}
                  onToggle={source => set('signalSources', toggled(draft.signalSources, source))}
                />
              </Field>
              <FieldGrid>
                <Field mode="include" label={t('signalsMode.recencyLabel')} hint={t('rail.recencyHint')}>
                  <ChevronSelect<string>
                    value={String(draft.sinceDays)}
                    onChange={value => set('sinceDays', Number(value))}
                    options={RECENCY_WINDOWS.map(String)}
                    label={days => t(`signalsMode.recency.${days}`)}
                  />
                </Field>
              </FieldGrid>
            </SectionBlock>
            {/* #2616.1 / #3096 / #3097 / #3226 — propres au signal « recrutement » : visibles quand il est coché. */}
            {hiring && (
              <SectionBlock title={t('framing.hiringBlock')} aside={t('framing.hiringHint')}>
                <FieldGrid>
                  <Field mode="include" label={t('rail.cdiOnlyLabel')} hint={t('rail.cdiOnlyHint')}>
                    {/* #4999 — CDI, CDD, intérim et freelance sont EXCLUSIFS (#5000) : en cocher un décoche les autres. */}
                    <div className="flex flex-wrap gap-1.5">
                      <ToggleChip
                        active={draft.cdiOnly}
                        onClick={() => setMany({ ...NO_CONTRACT, cdiOnly: !draft.cdiOnly })}
                      >
                        {t('rail.cdiOnlyChip')}
                      </ToggleChip>
                      <ToggleChip
                        active={draft.freelanceOnly}
                        onClick={() => setMany({ ...NO_CONTRACT, freelanceOnly: !draft.freelanceOnly })}
                      >
                        {t('rail.freelanceOnlyChip')}
                      </ToggleChip>
                      <ToggleChip
                        active={draft.cddOnly}
                        onClick={() => setMany({ ...NO_CONTRACT, cddOnly: !draft.cddOnly })}
                      >
                        {t('rail.cddOnlyChip')}
                      </ToggleChip>
                      <ToggleChip
                        active={draft.interimOnly}
                        onClick={() => setMany({ ...NO_CONTRACT, interimOnly: !draft.interimOnly })}
                      >
                        {t('rail.interimOnlyChip')}
                      </ToggleChip>
                    </div>
                  </Field>
                  <Field mode="include" label={t('rail.remotePolicyLabel')} hint={t('rail.remotePolicyHint')}>
                    <div className="flex flex-wrap gap-1.5">
                      {REMOTE_POLICY_FILTERS.map(policy => (
                        <ToggleChip
                          key={policy}
                          active={draft.remotePolicies.includes(policy)}
                          onClick={() => set('remotePolicies', toggled(draft.remotePolicies, policy))}
                        >
                          {t(`rail.remotePolicy.${policy}`)}
                        </ToggleChip>
                      ))}
                    </div>
                  </Field>
                  <Field mode="include" label={t('rail.seniorityLabel')} hint={t('rail.seniorityHint')}>
                    <div className="flex flex-wrap gap-1.5">
                      {SENIORITY_FILTERS.map(seniority => (
                        <ToggleChip
                          key={seniority}
                          active={draft.seniorities.includes(seniority)}
                          onClick={() => set('seniorities', toggled(draft.seniorities, seniority))}
                        >
                          {t(`rail.seniority.${seniority}`)}
                        </ToggleChip>
                      ))}
                    </div>
                  </Field>
                  <Field mode="include" label={t('rail.deliveryFitLabel')} hint={t('rail.deliveryFitHint')}>
                    <div className="flex flex-wrap gap-1.5">
                      {DELIVERY_FIT_FILTERS.map(level => (
                        <ToggleChip
                          key={level}
                          active={draft.deliveryFitFilter.includes(level)}
                          onClick={() => set('deliveryFitFilter', toggled(draft.deliveryFitFilter, level))}
                        >
                          {t(`rail.deliveryFit.${level}`)}
                        </ToggleChip>
                      ))}
                    </div>
                  </Field>
                </FieldGrid>
              </SectionBlock>
            )}
          </>
        )
      }
      case 'relation':
        return (
          <>
            <SectionBlock title={t('framing.accessBlock')}>
              <FieldGrid>
                {/* #3528.3 / #3879.2 — même libellé et mêmes valeurs que les vues Contacts et Liste d'appels. */}
                <Field mode="include" label={t('filters.decisionLevel')} hint={t('rail.decisionLevelHint')}>
                  <div className="flex flex-wrap gap-1.5">
                    {DECISION_LEVEL_FILTERS.map(level => (
                      <ToggleChip
                        key={level}
                        active={draft.decisionLevels.includes(level)}
                        onClick={() => set('decisionLevels', toggled(draft.decisionLevels, level))}
                      >
                        {t(`filters.decisionLevelValue.${level}`)}
                      </ToggleChip>
                    ))}
                  </div>
                </Field>
                <Field mode="include" label={t('rail.fitLabel')} hint={t('rail.fitHint')}>
                  <ChevronSelect<FitFilter>
                    value={draftExtras.fit}
                    onChange={value => setExtra('fit', value)}
                    options={FIT_FILTERS}
                    label={option => t(`rail.fit.${option}`)}
                  />
                </Field>
              </FieldGrid>
            </SectionBlock>

            {/* #2151.31-.34 / #2165.51/.55 — DÉCISION Louis 17-18/09 : les filtres partenaires, en mode ESN ou vue Partenaires. */}
            {partnerView && (
              <SectionBlock title={t('framing.partnerBlock')}>
                <FieldGrid>
                  <Field mode="include" label={t('rail.minAccountsSeenLabel')} hint={t('rail.minAccountsSeenHint')}>
                    <TextInput
                      value={draftExtras.minAccountsSeen ? String(draftExtras.minAccountsSeen) : ''}
                      onChange={value => {
                        const parsed = Number.parseInt(value.trim(), 10)
                        // Un champ vidé repose `null`, jamais 0 : l'absence de seuil n'est pas un seuil de zéro.
                        setExtra('minAccountsSeen', Number.isFinite(parsed) && parsed > 0 ? parsed : null)
                      }}
                      placeholder={t('rail.minAccountsSeenPlaceholder')}
                      onEnter={enter}
                    />
                  </Field>
                  <Field
                    mode="include"
                    label={t('rail.existingRelationshipLabel')}
                    hint={t('rail.existingRelationshipHint')}
                  >
                    <ToggleChip
                      active={draftExtras.existingRelationshipOnly}
                      onClick={() => setExtra('existingRelationshipOnly', !draftExtras.existingRelationshipOnly)}
                    >
                      {t('rail.existingRelationshipChip')}
                    </ToggleChip>
                  </Field>
                  <Field mode="include" label={t('rail.rank2OpeningLabel')} hint={t('rail.rank2OpeningHint')}>
                    <ToggleChip
                      active={draftExtras.rank2OpeningOnly}
                      onClick={() => setExtra('rank2OpeningOnly', !draftExtras.rank2OpeningOnly)}
                    >
                      {t('rail.rank2OpeningChip')}
                    </ToggleChip>
                  </Field>
                  <Field mode="include" label={t('rail.observedClientsLabel')} hint={t('rail.observedClientsHint')}>
                    <div className="flex flex-col gap-1">
                      <ToggleChip
                        active={draftExtras.observedClientsOnly}
                        onClick={() => setExtra('observedClientsOnly', !draftExtras.observedClientsOnly)}
                      >
                        {t('rail.observedClientsChip')}
                      </ToggleChip>
                      {draftExtras.observedClientsOnly &&
                        unknownNote(observedClientsUnknownCount, 'rail.observedClientsUnknownCount')}
                    </div>
                  </Field>
                  <Field mode="include" label={t('rail.expertiseKnownLabel')} hint={t('rail.expertiseKnownHint')}>
                    <div className="flex flex-col gap-1">
                      <ToggleChip
                        active={draftExtras.expertiseKnownOnly}
                        onClick={() => setExtra('expertiseKnownOnly', !draftExtras.expertiseKnownOnly)}
                      >
                        {t('rail.expertiseKnownChip')}
                      </ToggleChip>
                      {draftExtras.expertiseKnownOnly &&
                        unknownNote(expertiseUnknownCount, 'rail.expertiseUnknownCount')}
                    </div>
                  </Field>
                  <Field
                    mode="include"
                    label={t('rail.complementarityKnownLabel')}
                    hint={t('rail.complementarityKnownHint')}
                  >
                    <div className="flex flex-col gap-1">
                      <ToggleChip
                        active={draftExtras.complementarityKnownOnly}
                        onClick={() => setExtra('complementarityKnownOnly', !draftExtras.complementarityKnownOnly)}
                      >
                        {t('rail.complementarityKnownChip')}
                      </ToggleChip>
                      {draftExtras.complementarityKnownOnly &&
                        unknownNote(complementarityUnknownCount, 'rail.complementarityUnknownCount')}
                    </div>
                  </Field>
                </FieldGrid>
              </SectionBlock>
            )}

            {onOpenSimilar && (
              <SectionBlock title={t('framing.similarBlock')}>
                <p className="text-sm text-[var(--bellum-text-secondary)]">{t('framing.similarHint')}</p>
                <Button
                  variant="outline"
                  className="self-start"
                  onClick={() => {
                    setOpen(false)
                    onOpenSimilar()
                  }}
                >
                  {t('rail.similarToggle')}
                  <ArrowRight aria-hidden="true" />
                </Button>
              </SectionBlock>
            )}
            <p className="text-xs text-[var(--bellum-text-secondary)]">{t('framing.relationPromise')}</p>
          </>
        )
      case 'size':
        return (
          <>
            {/* #4362.2 — UN SEUL filtre de taille (TPE < 10 · PME 10–249 · ETI 250–999 · GC ≥ 1 000). */}
            <SectionBlock title={t('framing.sizeBlock')} aside={t('overview.sizeDefinition')}>
              <Field
                mode="include"
                label={t('rail.companyCategoryLabel')}
                hint={t('rail.companyCategoryHint')}
                notApplied={notApplied('headcount')}
              >
                <SizeFilter headcount={draft.headcount} onChange={next => set('headcount', next)} />
              </Field>
            </SectionBlock>
            <SectionBlock title={t('framing.structureBlock')}>
              <FieldGrid>
                {/* #4361.1 — « Middle market » : 250 à 4 999 salariés ET non coté, en une puce (GA-26). */}
                <Field mode="include" label={t('rail.middleMarketLabel')} hint={t('rail.middleMarketHint')}>
                  <div className="flex flex-wrap gap-1.5">
                    <ToggleChip
                      active={isMiddleMarketActive(draft)}
                      onClick={() => setDraft(current => ({ ...current, ...toggleMiddleMarket(current) }))}
                    >
                      {t('rail.middleMarketChip')}
                    </ToggleChip>
                  </div>
                </Field>
                {/* #4361.2 — l'interrupteur SÉPARÉ, combinable avec n'importe quelle tranche. */}
                <Field
                  mode="exclude"
                  label={t('rail.excludeListedLabel')}
                  hint={t('rail.excludeListedHint')}
                  notApplied={registryOnly}
                >
                  <div className="flex flex-wrap gap-1.5">
                    <ToggleChip
                      tone="exclude"
                      active={draft.excludeListed}
                      onClick={() => set('excludeListed', !draft.excludeListed)}
                    >
                      {t('rail.excludeListedChip')}
                    </ToggleChip>
                  </div>
                </Field>
                {/* #3941.1 — préréglage « Startup » : il ÉCRIT dans l'âge, la forme et la taille, jamais caché. */}
                <Field
                  mode="include"
                  label={t('rail.startupSegmentLabel')}
                  hint={t('rail.startupSegmentHint')}
                  notApplied={registryOnly}
                >
                  <ToggleChip active={isStartupSegmentActive(draft)} onClick={toggleStartupSegment}>
                    {t('rail.startupSegmentChip')}
                  </ToggleChip>
                </Field>
                {/* #2165.24 — Groupe / filiale : croisé côté écran, sur le lien capitalistique déjà résolu. */}
                <Field mode="include" label={t('rail.groupRoleLabel')} hint={t('rail.groupRoleHint')}>
                  <ChevronSelect<GroupRoleOption>
                    value={draft.groupRole}
                    onChange={value => set('groupRole', value)}
                    options={GROUP_ROLE_OPTIONS}
                    label={role => t(`groupRole.${role}`)}
                  />
                </Field>
              </FieldGrid>
            </SectionBlock>
          </>
        )
    }
  }

  const index = FRAMING_SECTIONS.indexOf(section)
  const nextSection = FRAMING_SECTIONS[index + 1]
  const previousSection = index > 0 ? FRAMING_SECTIONS[index - 1] : undefined
  const SectionIcon = SECTION_ICON[section]

  const dialog = (
    <Dialog open={open} onOpenChange={next => (next ? setOpen(true) : cancel())}>
      <DialogContent
        closeLabel={t('common:actions.close')}
        aria-label={t('framing.title')}
        className="flex h-[min(52rem,92dvh)] w-[calc(100%-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl"
      >
        <DialogHeader className="shrink-0 border-b border-[var(--bellum-border)] px-5 py-4 text-left sm:px-6">
          <DialogTitle>{t('framing.title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('rail.hint')}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* ---------- À gauche : TA RECHERCHE · N rubriques · parcours libre ---------- */}
          <nav
            aria-label={t('framing.navAria')}
            className="flex shrink-0 flex-col border-b border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] md:w-72 md:border-b-0 md:border-r"
          >
            <div className="hidden px-5 pb-2 pt-5 md:block">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--bellum-text-accent)]">
                {t('framing.eyebrow')}
              </p>
              <p className="mt-1 text-xs text-[var(--bellum-text-secondary)]">
                {t('framing.sectionsCount', { count: FRAMING_SECTIONS.length })}
              </p>
            </div>
            <ol className="flex gap-1 overflow-x-auto p-2 md:flex-col md:overflow-y-auto md:p-3">
              {FRAMING_SECTIONS.map(item => {
                const Icon = SECTION_ICON[item]
                const current = item === section
                return (
                  <li key={item} className="shrink-0">
                    <button
                      type="button"
                      data-testid={`framing-section-${item}`}
                      aria-current={current ? 'step' : undefined}
                      onClick={() => setSection(item)}
                      className={cn(
                        'flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors',
                        current
                          ? 'border-[var(--bellum-accent-line)] bg-[var(--bellum-surface-1)] text-[var(--bellum-text-primary)]'
                          : 'border-transparent text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-1)]',
                      )}
                    >
                      <Icon
                        className={cn(
                          'size-4 shrink-0',
                          current ? 'text-[var(--bellum-text-accent)]' : 'text-[var(--bellum-text-muted)]',
                        )}
                        aria-hidden="true"
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm font-semibold">{t(`framing.${item}Label`)}</span>
                        <span className="hidden text-xs text-[var(--bellum-text-secondary)] md:block">
                          {t(`framing.${item}Hint`)}
                        </span>
                      </span>
                      <ChevronRight
                        className="hidden size-4 shrink-0 text-[var(--bellum-text-muted)] md:block"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                )
              })}
            </ol>
            <div className="mt-auto hidden flex-col gap-2 border-t border-[var(--bellum-border)] p-4 md:flex">
              <p data-testid="framing-criteria-count" className="text-sm font-medium text-[var(--bellum-text-primary)]">
                {t('framing.criteriaCount', { count: draftCount })}
              </p>
              <button
                type="button"
                onClick={() => {
                  setDraft(emptyUnifiedFilters())
                  setDraftExtras(current => ({ ...current, fit: 'any' }))
                }}
                className="min-h-11 self-start text-sm font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
              >
                {t('framing.reset')}
              </button>
            </div>
          </nav>

          {/* ---------- À droite : la rubrique ouverte ---------- */}
          <div
            data-testid="filter-rail-modal-body"
            className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6"
          >
            <header className="mb-6">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--bellum-text-accent)]">
                  <SectionIcon className="size-3.5" aria-hidden="true" />
                  {t(`framing.${section}Eyebrow`)}
                </span>
                <span className="tabular-nums text-[var(--bellum-text-secondary)]">
                  {t('framing.step', { index: index + 1, total: FRAMING_SECTIONS.length })}
                </span>
              </div>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--bellum-text-primary)]">
                {t(`framing.${section}Title`)}
              </h3>
              <p className="mt-2 text-sm text-[var(--bellum-text-secondary)]">{t(`framing.${section}Intro`)}</p>
            </header>
            <div className="flex flex-col gap-6">{renderSection(section)}</div>
            {/* #4301.3 — ce que la recherche RETIENT et ÉCARTE, dit en mots, sur le brouillon. */}
            <div className="mt-8">
              <FilterSummary filters={draft} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--bellum-border)] pt-4">
              {previousSection ? (
                <Button variant="plain" onClick={() => setSection(previousSection)}>
                  {t('framing.previous')}
                </Button>
              ) : (
                <span />
              )}
              {nextSection ? (
                <Button variant="outline" onClick={() => setSection(nextSection)}>
                  {t('framing.next', { section: t(`framing.${nextSection}Label`) })}
                  <ArrowRight aria-hidden="true" />
                </Button>
              ) : (
                <span className="text-sm text-[var(--bellum-text-secondary)]">{t('framing.ready')}</span>
              )}
            </div>
          </div>
        </div>

        {/* ---------- Le pied : N comptes · Annuler · Appliquer et explorer ---------- */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--bellum-border)] px-5 py-3 sm:px-6">
          <div data-testid="framing-live-count" aria-live="polite" className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-[var(--bellum-text-accent)]" />
            {liveCount !== null ? (
              <span className="flex flex-col">
                <span className="text-lg font-semibold tabular-nums text-[var(--bellum-text-accent)]">
                  {t('framing.accounts', { count: liveCount })}
                </span>
                <span className="text-xs text-[var(--bellum-text-secondary)]">{t('framing.accountsScope')}</span>
              </span>
            ) : (
              <span className="flex flex-col">
                <span className="text-sm font-semibold text-[var(--bellum-text-primary)]">
                  {t('framing.accountsUnknown')}
                </span>
                <span className="text-xs text-[var(--bellum-text-secondary)]">{t('framing.accountsUnknownHint')}</span>
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(emptyUnifiedFilters())
                setDraftExtras(current => ({ ...current, fit: 'any' }))
              }}
              className="min-h-11 px-2 text-sm font-medium text-[var(--bellum-text-accent)] md:hidden"
            >
              {t('framing.reset')}
            </button>
            {draftHint && <span className="max-w-xs text-xs text-[var(--bellum-text-secondary)]">{draftHint}</span>}
            <Button variant="outline" onClick={cancel}>
              {t('framing.cancel')}
            </Button>
            <Button onClick={apply} disabled={(!draftRunnable && !draftEmpty) || loading}>
              <ArrowRight aria-hidden="true" />
              {t('framing.apply')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )

  /* ---------------- La barre : champ libre, Explorer, puces ---------------- */

  const chipClass =
    'inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 text-sm font-medium text-[var(--bellum-text-primary)] transition-colors hover:border-[var(--bellum-text-muted)]'
  const chipIcon = 'size-4 shrink-0 text-[var(--bellum-text-accent)]'
  const regionLabels = REGISTRY_REGIONS.filter(region => filters.region.includes(region.code)).map(r => r.label)
  const zoneParts = [...regionLabels, filters.department.trim(), filters.city.trim()].filter(Boolean)
  const firstAndMore = (parts: readonly string[], none: string) =>
    parts.length === 0
      ? none
      : parts.length === 1
        ? (parts[0] ?? none)
        : t('chips.firstAndMore', { first: parts[0], count: parts.length - 1 })
  const skills = skillsFieldValue(filters).trim()
  const chips: { key: string; section: FramingSection; icon: LucideIcon; label: string }[] = [
    // #4572 — la zone se NOMME en entier : « première +N » désignait la première du REGISTRE, pas celle du clic.
    { key: 'territory', section: 'territory', icon: MapPin, label: zoneParts.join(', ') || t('chips.territoryAll') },
    {
      key: 'sectors',
      section: 'companies',
      icon: Building2,
      label: firstAndMore(
        filters.sectors.map(code => applicationSectorLabel(code, i18n.language)),
        t('chips.sectorsAll'),
      ),
    },
    // #4516 (Louis 24/10) — maquette appliquée V22 : la taille a SA puce. Sans tranche posée elle dit « Toutes les
    // tailles » (aucune n'est jamais choisie pour l'utilisateur) ; une taille choisie se lit en codes maison.
    {
      key: 'size',
      section: 'size',
      icon: Users,
      label: firstAndMore(
        SIZE_BANDS.filter(band => band.ranges.some(range => filters.headcount.includes(range))).map(band => band.code),
        t('chips.sizesAll'),
      ),
    },
    { key: 'skills', section: 'expertise', icon: Layers, label: skillChipLabel(skills) || t('chips.skills') },
    {
      key: 'signals',
      section: 'signals',
      icon: Zap,
      label:
        filters.signalSources.length === 0
          ? t('chips.signals')
          : t('chips.signalsSome', { count: filters.signalSources.length }),
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <form
        role="search"
        aria-label={t('overview.exploreTitle')}
        onSubmit={event => {
          event.preventDefault()
          if (runnable && !loading) onSubmit()
        }}
        className="flex min-h-14 items-center gap-2 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-1.5 pl-4 focus-within:border-[var(--bellum-text-accent)]"
      >
        <Search className="size-5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />
        <input
          id="discover-explore-text"
          type="search"
          value={filters.freetext}
          onChange={event => onChange({ ...filters, freetext: event.target.value })}
          aria-label={t('explore.label')}
          placeholder={t('explore.placeholder')}
          className="min-h-11 min-w-0 flex-1 bg-transparent text-base text-[var(--bellum-text-primary)] outline-none placeholder:text-[var(--bellum-text-muted)]"
        />
        {/* KEVIN-FIX (d) — le geste principal de Découvrir est une cible ≥ 44 px (GA-35) : `h-11`, jamais `h-9`. */}
        <Button
          {...guideAnchorProps('decouvrir.lancer')}
          type="submit"
          size="lg"
          className="h-11"
          disabled={!runnable || loading}
        >
          {/* #4517.1 — le spinner de la recherche est celui de la zone de résultats : jamais un second ici. */}
          {t('explore.submit')}
          {loading ? null : <ArrowRight aria-hidden="true" />}
        </Button>
      </form>

      <div role="group" aria-label={t('chips.aria')} className="flex flex-wrap items-center gap-2">
        {chips.map(chip => {
          const Icon = chip.icon
          return (
            <button
              key={chip.key}
              type="button"
              className={chipClass}
              onClick={() => openAt(chip.section)}
              aria-haspopup="dialog"
              data-testid={`discover-chip-${chip.key}`}
              title={chip.key === 'skills' ? (skillChipTitle(skills) ?? undefined) : undefined}
            >
              <Icon className={chipIcon} aria-hidden="true" />
              {chip.label}
              {/* Maquette appliquée V22 : la puce Taille porte un chevron (elle ouvre un choix, pas une rubrique). */}
              {chip.key === 'size' && (
                <ChevronDown className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />
              )}
            </button>
          )
        })}
        <span className="hidden flex-1 sm:block" aria-hidden="true" />
        <button
          type="button"
          onClick={() => openAt('companies')}
          aria-haspopup="dialog"
          className={chipClass}
          data-testid="discover-chip-all"
        >
          <SlidersHorizontal className={chipIcon} aria-hidden="true" />
          {t('rail.moreFilters')}
          {/* COMBIEN de critères sont posés : ranger des filtres sans le dire produirait des résultats inexplicables. */}
          {activeCount > 0 && (
            <span className="rounded-full bg-[var(--bellum-accent-bg)] px-1.5 text-xs font-semibold text-[var(--bellum-text-accent)]">
              {activeCount}
            </span>
          )}
        </button>
      </div>
      {runnableHint && <p className="text-xs text-[var(--bellum-text-secondary)]">{runnableHint}</p>}
      {dialog}
    </div>
  )
}
