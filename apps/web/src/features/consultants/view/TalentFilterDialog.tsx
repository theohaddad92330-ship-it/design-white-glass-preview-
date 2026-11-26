import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SelectField,
  Switch,
  Text,
} from '@bellum/ui'
import { cloneElement, isValidElement, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CONSENT_STATES,
  ENGAGEMENT_KINDS,
  TALENT_VIEWS,
  consultantAvailabilitySchema,
  consultantSenioritySchema,
  talentViewFilters,
  type TalentSearchQuery,
  type TalentView,
} from '@bellum/contracts'
import { TALENT_ADVANCED_FILTERS_UNAVAILABLE } from '../lib/talentAdvancedFilters'
import { SavedTalentViews } from './SavedTalentViews'

const AVAILABILITIES = consultantAvailabilitySchema.options
const SENIORITIES = consultantSenioritySchema.options
/** #2182.51 — le vocabulaire de `consentState()` (`talent-consent.ts`), pas un
 *  état inventé pour ce filtre. */
const CONSENT_STATE_OPTIONS = CONSENT_STATES
const REMOTE_PREFERENCES = ['sur_site', 'hybride', 'full_remote', 'indifferent'] as const
const ON_MISSION_OPTIONS = ['yes', 'no'] as const
/** Le rayon, en km — bornes usuelles d'un déplacement de mission. `''` = pas
 *  de rayon posé, ce qui garde la correspondance EXACTE de `zone` sur
 *  `zones[]` (voir `TalentService.search`). */
const RADIUS_OPTIONS = ['10', '25', '50', '100', '200'] as const
/** Le plancher d'années d'expérience. `''` = indifférent — un talent SANS
 *  années saisies n'est jamais écarté, même filtre posé (§ décision du
 *  31/08/2026). */
const YEARS_EXPERIENCE_OPTIONS = ['2', '5', '10', '15'] as const
/**
 * #2182.54 — LA FRAÎCHEUR, en mois SANS ÉCHANGE.
 *
 * `dormantMonths` existait dans le contrat ET en SQL (`talent.service.ts:354`)
 * depuis des mois, et n'était atteignable QUE par la vue « Dormants », figée à
 * six. On ne pouvait donc pas demander « qui n'a pas été touché depuis un an »
 * sans quitter l'écran — et la colonne « Dernière interaction » qu'on vient
 * d'ouvrir rendait ce trou visible à chaque ligne.
 *
 * Trois bornes, pas une saisie libre : un nombre tapé à la main inventerait une
 * précision que le métier n'a pas (« 7 mois » ne veut rien dire de plus que
 * « plus de six »). 6 reste la borne que la vue « Dormants » emploie — un
 * réglage vit à un seul endroit, et celui-ci est le même.
 *
 * ⚠️ Un talent SANS dernier contact enregistré n'est pas « dormant depuis
 * toujours » : c'est le SQL qui décide, et il ne le range pas dans un seuil
 * qu'il ne peut pas mesurer. Le filtre ne promet donc rien à sa place.
 */
const DORMANT_MONTHS_OPTIONS = ['3', '6', '12'] as const
/**
 * #2182.23 / #2182.53 — « SANS MISSION », en mois SANS mission en cours ni
 * terminée.
 *
 * Mêmes bornes que `DORMANT_MONTHS_OPTIONS` juste au-dessus, et c'est
 * délibéré : « sans contact » et « sans mission » sont deux questions
 * voisines qu'un recruteur pose au même rythme, mais JAMAIS la même — un
 * profil peut être dormant ET en mission, ou recontacté récemment ET sans
 * placement depuis un an (registre du 16/09/2026, #2182.23).
 */
const NO_MISSION_MONTHS_OPTIONS = ['3', '6', '12'] as const
/** #2182.21 — même vocabulaire que `TalentSearchQuery['completeness']`
 *  (`@bellum/contracts`), jamais un état inventé pour ce filtre. */
const COMPLETENESS_OPTIONS = ['incomplete', 'enriched'] as const

/** Les critères qu'une VUE RAPIDE pose et qu'aucun champ de la modale ne montre (`talentViewFilters`). */
type ViewCarried = Pick<TalentSearchQuery, 'kind' | 'derived' | 'freeBefore' | 'neverSubmitted'>

type Draft = {
  /** Théo C talents-vivier.R5 — la vue rapide (« Tous les profils » = aucune). Un raccourci vers des filtres. */
  view: TalentView | ''
  carried: ViewCarried
  /** Le texte brut des compétences, séparées par des virgules (#3830 : jamais dérivé de `skills.join`). */
  skills: string
  sector: string
  engagementKind: NonNullable<TalentSearchQuery['engagementKind']> | ''
  /** #2662.2 — les archivés restent cherchables ; ce réglage est le SEUL qui les montre. */
  includeArchived: boolean
  availability: NonNullable<TalentSearchQuery['availability']> | ''
  seniority: NonNullable<TalentSearchQuery['seniority']> | ''
  zone: string
  radiusKm: string
  minTjm: string
  maxTjm: string
  minYearsExperience: string
  language: string
  cvAvailable: boolean
  onMission: NonNullable<TalentSearchQuery['onMission']> | ''
  remotePreference: NonNullable<TalentSearchQuery['remotePreference']> | ''
  /** #2182.54 — mois sans échange. `''` = indifférent. */
  dormantMonths: string
  /** #2182.23 / #2182.53 — mois sans mission. `''` = indifférent. */
  noMissionMonths: string
  /** #2182.51 — l'état du consentement. `''` = indifférent. */
  consentState: NonNullable<TalentSearchQuery['consentState']> | ''
  /** #2182.21 — la complétude de fiche. `''` = indifférent. */
  completeness: NonNullable<TalentSearchQuery['completeness']> | ''
  /** #2182.55 — au moins une compétence PROUVÉE (mission/entretien). */
  provenSkillsOnly: boolean
  /** #4500 (maquette A12) — MES favoris, jamais ceux d'un collègue (`user_favorites`). */
  favorite: boolean
}

const draftFrom = (query: Partial<TalentSearchQuery>, view: TalentView | null): Draft => ({
  view: view ?? '',
  carried: {
    kind: query.kind,
    derived: query.derived,
    freeBefore: query.freeBefore,
    neverSubmitted: query.neverSubmitted,
  },
  skills: query.skills?.join(', ') ?? '',
  sector: query.sector ?? '',
  engagementKind: query.engagementKind ?? '',
  includeArchived: query.includeArchived === true,
  availability: query.availability ?? '',
  seniority: query.seniority ?? '',
  zone: query.zone ?? '',
  radiusKm: query.radiusKm !== undefined ? String(query.radiusKm) : '',
  minTjm: query.minTjm !== undefined ? String(query.minTjm) : '',
  maxTjm: query.maxTjm !== undefined ? String(query.maxTjm) : '',
  minYearsExperience: query.minYearsExperience !== undefined ? String(query.minYearsExperience) : '',
  language: query.language ?? '',
  cvAvailable: query.cvAvailable === true,
  onMission: query.onMission ?? '',
  remotePreference: query.remotePreference ?? '',
  dormantMonths: query.dormantMonths !== undefined ? String(query.dormantMonths) : '',
  noMissionMonths: query.noMissionMonths !== undefined ? String(query.noMissionMonths) : '',
  consentState: query.consentState ?? '',
  completeness: query.completeness ?? '',
  provenSkillsOnly: query.provenSkillsOnly === true,
  favorite: query.favorite === 'mine',
})

const EMPTY_DRAFT: Draft = draftFrom({}, null)

const parseSkills = (text: string) =>
  text
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)

/**
 * #4500 (Louis 23/10/2026, refonte V22) — LA MODALE « FILTRER MON VIVIER ».
 *
 * La barre du Vivier ne garde que la recherche et un bouton « Filtres » ; TOUS les filtres d'avant vivent ici,
 * même forme que « Filtrer mon portefeuille » de la maquette (titre, phrase, grille de champs, cases, puis
 * « Réinitialiser » · « Appliquer les filtres »). Liste comptée au commit : la barre portait 6 critères (vue rapide,
 * Mes vues, compétences, secteur, archivés, type de profil) et le tiroir 16 (ville, rayon, TJM min, TJM max,
 * disponibilité, séniorité, années d'expérience, fraîcheur, dernière mission, consentement, complétude, langue,
 * CV disponible, compétences prouvées, en mission, mode de travail) + les vues enregistrées : les 22 sont ici, aucun
 * perdu, chacun UNE fois (GA-26).
 *
 * Comme le tiroir qu'elle remplace, on n'applique qu'au clic : une modale qui filtre à chaque frappe relance une
 * requête par caractère sur un écran paginé. Tous les critères sont réels côté serveur (`talentSearchQuerySchema`) :
 * le RAYON (géocodage, un talent non géocodé sort du filtre, il ne vaut jamais « à 0 km »), les ANNÉES (un talent
 * sans années saisies n'est jamais écarté), la DERNIÈRE MISSION (fin de mission, distincte du dernier contact).
 *
 * La VUE RAPIDE est un raccourci, pas un état parallèle : la choisir REMPLIT les champs qu'elle touche (« À
 * recontacter » pose la fraîcheur à six mois, visible et modifiable juste en dessous).
 */
export function TalentFilterDialog({
  open,
  onOpenChange,
  query,
  activeView,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  query: Partial<TalentSearchQuery>
  activeView: TalentView | null
  onApply: (patch: Partial<TalentSearchQuery>, view: TalentView | null) => void
}) {
  const { t } = useTranslation('consultants')
  const [draft, setDraft] = useState<Draft>(draftFrom(query, activeView))

  // Rouvrir montre ce qui est RÉELLEMENT appliqué, pas le brouillon abandonné la fois d'avant.
  useEffect(() => {
    if (open) setDraft(draftFrom(query, activeView))
  }, [open, query, activeView])

  const chooseView = (value: string) => {
    if (!value) {
      setDraft(current => ({ ...current, view: '', carried: {} }))
      return
    }
    const view = value as TalentView
    const filled = talentViewFilters(view, new Date())
    setDraft(current => ({
      ...current,
      view,
      carried: {
        kind: filled.kind,
        derived: filled.derived,
        freeBefore: filled.freeBefore,
        neverSubmitted: filled.neverSubmitted,
      },
      ...(filled.dormantMonths !== undefined ? { dormantMonths: String(filled.dormantMonths) } : {}),
      ...(filled.noMissionMonths !== undefined ? { noMissionMonths: String(filled.noMissionMonths) } : {}),
    }))
  }

  const apply = () => {
    const zone = draft.zone.trim() || undefined
    onApply(
      {
        kind: draft.carried.kind,
        derived: draft.carried.derived,
        freeBefore: draft.carried.freeBefore,
        neverSubmitted: draft.carried.neverSubmitted,
        skills: parseSkills(draft.skills),
        sector: draft.sector.trim() || undefined,
        engagementKind: draft.engagementKind || undefined,
        // `false` n'est jamais envoyé : c'est « actifs seulement », l'absence du critère.
        includeArchived: draft.includeArchived ? true : undefined,
        availability: draft.availability || undefined,
        seniority: draft.seniority || undefined,
        zone,
        // Un rayon SANS ville n'a pas de centre : `TalentService.search` l'ignore, ne pas l'envoyer évite une requête
        // qui prétendrait poser un critère sans effet.
        radiusKm: zone && draft.radiusKm.trim() ? Number(draft.radiusKm) : undefined,
        minTjm: draft.minTjm.trim() ? Number(draft.minTjm) : undefined,
        maxTjm: draft.maxTjm.trim() ? Number(draft.maxTjm) : undefined,
        minYearsExperience: draft.minYearsExperience.trim() ? Number(draft.minYearsExperience) : undefined,
        language: draft.language.trim() || undefined,
        // `false` n'est jamais envoyé : c'est « indifférent », pas « uniquement sans CV ».
        cvAvailable: draft.cvAvailable ? true : undefined,
        onMission: draft.onMission || undefined,
        remotePreference: draft.remotePreference || undefined,
        // Absent = indifférent, jamais « 0 mois », qui se lirait « contacté aujourd'hui ».
        dormantMonths: draft.dormantMonths.trim() ? Number(draft.dormantMonths) : undefined,
        noMissionMonths: draft.noMissionMonths.trim() ? Number(draft.noMissionMonths) : undefined,
        consentState: draft.consentState || undefined,
        completeness: draft.completeness || undefined,
        provenSkillsOnly: draft.provenSkillsOnly ? true : undefined,
        // `false` n'est jamais envoyé : c'est « tout le vivier », l'absence du critère.
        favorite: draft.favorite ? 'mine' : undefined,
      },
      draft.view || null,
    )
    onOpenChange(false)
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('filters.dialog.title')}</DialogTitle>
          <DialogDescription>{t('filters.dialog.description')}</DialogDescription>
        </DialogHeader>

        <Box className="space-y-5">
          <Section title={t('filters.dialog.sections.profile')}>
            <Field label={t('filters.dialog.view')}>
              <Choice
                value={draft.view}
                onChange={chooseView}
                anyLabel={t('views.all')}
                options={TALENT_VIEWS.map(view => ({
                  value: view,
                  label: view === 'to_revalidate' ? t('staffing.unknown') : t(`views.${view}`),
                }))}
              />
            </Field>
            <Field label={t('filters.engagementKind')}>
              <Choice
                value={draft.engagementKind}
                onChange={value => set('engagementKind', value as Draft['engagementKind'])}
                anyLabel={t('filters.engagementKindAny')}
                options={ENGAGEMENT_KINDS.map(value => ({ value, label: t(`engagement.${value}`) }))}
              />
            </Field>
            <Field label={t('filters.skills')} hint={t('filters.dialog.skillsHint')}>
              <Input
                value={draft.skills}
                placeholder={t('filters.skillsPlaceholder')}
                onChange={event => set('skills', event.target.value)}
              />
            </Field>
            {/* « Secteur » — texte libre, comme les compétences : une liste fermée trahirait le vocabulaire de chaque ESN. */}
            <Field label={t('filters.sector')}>
              <Input
                value={draft.sector}
                placeholder={t('filters.sectorPlaceholder')}
                onChange={event => set('sector', event.target.value)}
              />
            </Field>
            <Field label={t('filters.seniority')}>
              <Choice
                value={draft.seniority}
                onChange={value => set('seniority', value as Draft['seniority'])}
                anyLabel={t('filters.any')}
                options={SENIORITIES.map(value => ({ value, label: t(`seniority.${value}`) }))}
              />
            </Field>
            {/* Un champ SAISI sur la personne, distinct de la séniorité et des années d'UNE compétence. */}
            <Field label={t('filters.drawer.yearsExperience')} hint={t('filters.drawer.yearsExperienceHint')}>
              <Choice
                value={draft.minYearsExperience}
                onChange={value => set('minYearsExperience', value)}
                anyLabel={t('filters.drawer.indifferent')}
                options={YEARS_EXPERIENCE_OPTIONS.map(value => ({
                  value,
                  label: t('filters.drawer.yearsExperienceOption', { count: Number(value) }),
                }))}
              />
            </Field>
            {/* #2182.21 — même calcul/seuil que `talentPipelineStatus` (GA-26). */}
            <Field label={t('filters.drawer.completeness')}>
              <Choice
                value={draft.completeness}
                onChange={value => set('completeness', value as Draft['completeness'])}
                anyLabel={t('filters.drawer.indifferent')}
                options={COMPLETENESS_OPTIONS.map(value => ({
                  value,
                  label: t(`filters.drawer.completenessOptions.${value}`),
                }))}
              />
            </Field>
            <Field label={t('filters.drawer.language')} hint={t('filters.drawer.languageHint')}>
              <Input
                value={draft.language}
                placeholder={t('filters.drawer.languagePlaceholder')}
                onChange={event => set('language', event.target.value)}
              />
            </Field>
          </Section>

          <Section title={t('filters.dialog.sections.availability')}>
            <Field label={t('filters.availability')} hint={t('filters.availabilityHint')}>
              <Choice
                value={draft.availability}
                onChange={value => set('availability', value as Draft['availability'])}
                anyLabel={t('filters.any')}
                options={AVAILABILITIES.map(value => ({ value, label: t(`availability.${value}`) }))}
              />
            </Field>
            <Field label={t('filters.drawer.onMission')}>
              <Choice
                value={draft.onMission}
                onChange={value => set('onMission', value as Draft['onMission'])}
                anyLabel={t('filters.drawer.indifferent')}
                options={ON_MISSION_OPTIONS.map(value => ({
                  value,
                  label: t(`filters.drawer.onMissionOptions.${value}`),
                }))}
              />
            </Field>
            {/* #2182.54 — LA FRAÎCHEUR (dernier CONTACT). */}
            <Field label={t('filters.drawer.dormant')} hint={t('filters.drawer.dormantHint')}>
              <Choice
                value={draft.dormantMonths}
                onChange={value => set('dormantMonths', value)}
                anyLabel={t('filters.drawer.indifferent')}
                options={DORMANT_MONTHS_OPTIONS.map(value => ({
                  value,
                  label: t('filters.drawer.dormantOption', { count: Number(value) }),
                }))}
              />
            </Field>
            {/* #2182.23 / #2182.53 — « SANS MISSION » : ne pas avoir parlé à quelqu'un et ne pas l'avoir placé sont
                deux faits différents. */}
            <Field label={t('filters.drawer.noMissionMonths')} hint={t('filters.drawer.noMissionMonthsHint')}>
              <Choice
                value={draft.noMissionMonths}
                onChange={value => set('noMissionMonths', value)}
                anyLabel={t('filters.drawer.indifferent')}
                options={NO_MISSION_MONTHS_OPTIONS.map(value => ({
                  value,
                  label: t('filters.drawer.noMissionMonthsOption', { count: Number(value) }),
                }))}
              />
            </Field>
          </Section>

          <Section title={t('filters.dialog.sections.place')}>
            {/* La ville reste un texte libre, le rayon un rayon PRÉDÉFINI, sans effet sans ville. */}
            <Field label={t('filters.drawer.city')}>
              <Input
                value={draft.zone}
                placeholder={t('filters.drawer.cityPlaceholder')}
                onChange={event => set('zone', event.target.value)}
              />
            </Field>
            <Field
              label={t('filters.drawer.radius')}
              hint={!draft.zone.trim() ? t('filters.drawer.radiusHint') : undefined}
            >
              <Choice
                value={draft.radiusKm}
                onChange={value => set('radiusKm', value)}
                anyLabel={t('filters.drawer.indifferent')}
                options={RADIUS_OPTIONS.map(value => ({
                  value,
                  label: t('filters.drawer.radiusOption', { km: value }),
                }))}
              />
            </Field>
            <Field label={t('filters.drawer.mobility')}>
              <Choice
                value={draft.remotePreference}
                onChange={value => set('remotePreference', value as Draft['remotePreference'])}
                anyLabel={t('filters.drawer.indifferent')}
                options={REMOTE_PREFERENCES.map(value => ({ value, label: t(`workMode.${value}`) }))}
              />
            </Field>
            {/* #2182.51 — libellés repris de `consent.states.*` (badge de la fiche) : un seul vocabulaire (GA-26). */}
            <Field label={t('filters.drawer.consentState')}>
              <Choice
                value={draft.consentState}
                onChange={value => set('consentState', value as Draft['consentState'])}
                anyLabel={t('filters.drawer.indifferent')}
                options={CONSENT_STATE_OPTIONS.map(value => ({ value, label: t(`consent.states.${value}`) }))}
              />
            </Field>
            <Field label={t('filters.drawer.minTjm')}>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={draft.minTjm}
                onChange={event => set('minTjm', event.target.value)}
              />
            </Field>
            <Field label={t('filters.drawer.maxTjm')}>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={draft.maxTjm}
                onChange={event => set('maxTjm', event.target.value)}
              />
            </Field>
          </Section>

          <Box className="space-y-2">
            <Toggle
              label={t('filters.drawer.cvAvailable')}
              hint={t('filters.drawer.cvAvailableHint')}
              checked={draft.cvAvailable}
              onChange={checked => set('cvAvailable', checked)}
            />
            {/* #2182.55 — une compétence PROUVÉE vient d'une mission ou d'un entretien (`isSkillSourceProven`, GA-26). */}
            <Toggle
              label={t('filters.drawer.provenSkillsOnly')}
              hint={t('filters.drawer.provenSkillsOnlyHint')}
              checked={draft.provenSkillsOnly}
              onChange={checked => set('provenSkillsOnly', checked)}
            />
            {/* #4500 (maquette A12) — « Mes favoris » : l'API le filtrait (`favorite=mine`), aucun écran ne le posait. */}
            <Toggle
              label={t('filters.drawer.favorites')}
              hint={t('filters.drawer.favoritesHint')}
              checked={draft.favorite}
              onChange={checked => set('favorite', checked)}
            />
            {/* #2662.2 — « nettoyer mon vivier » archive, ça ne supprime pas : ce réglage est le SEUL qui les retrouve. */}
            <Toggle
              label={t('filters.includeArchived')}
              hint={t('filters.dialog.includeArchivedHint')}
              checked={draft.includeArchived}
              onChange={checked => set('includeArchived', checked)}
            />
          </Box>

          {/* Ce que la modale ne sait pas filtrer, DIT — le registre est VIDE depuis le 31/08/2026. */}
          {TALENT_ADVANCED_FILTERS_UNAVAILABLE.length > 0 ? (
            <Box className="border-t border-border pt-3">
              <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
                {t('filters.drawer.unavailableTitle')}
              </Text>
              <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
                {TALENT_ADVANCED_FILTERS_UNAVAILABLE.map(entry =>
                  t(`filters.drawer.unavailable.${entry.key}`, entry.key),
                ).join(' · ')}
              </Text>
            </Box>
          ) : null}

          {/* #2152.37 — « Mes vues » : ce qu'on refait tous les matins s'enregistre une fois. `query` (déjà appliqué),
              pas le brouillon : on enregistre ce qui est VISIBLE à l'écran (voir `SavedTalentViews.tsx`). */}
          <Box className="border-t border-border pt-4">
            <SavedTalentViews
              draft={query}
              onApply={next => {
                onApply(next, null)
                onOpenChange(false)
              }}
            />
          </Box>
        </Box>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => setDraft(EMPTY_DRAFT)}>
            {t('filters.dialog.reset')}
          </Button>
          <Button onClick={apply}>{t('filters.dialog.apply')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Une rubrique de la modale : un intitulé, puis sa grille de champs (deux colonnes dès 640 px). */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box as="section" className="space-y-2">
      <Text element="h3" size="sm" weight="semibold">
        {title}
      </Text>
      <Box className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</Box>
    </Box>
  )
}

/** Une case « oui / indifférent » : `false` n'est jamais un critère, c'est son absence. */
function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <Box className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 py-2.5">
      <Box className="min-w-0 flex-1">
        <Text size="sm" weight="medium">
          {label}
        </Text>
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {hint}
        </Text>
      </Box>
      <Switch checked={checked} aria-label={label} onCheckedChange={onChange} />
    </Box>
  )
}

/** Associe l'étiquette au contrôle par un `id` généré (`useId`) — sans quoi
 *  le champ n'est ni tabulable par son nom ni trouvable par un lecteur
 *  d'écran. Même construction que `ConsultantFormDialog.Field`. */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const id = useId()
  return (
    <Box className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {isValidElement<{ id?: string }>(children) ? cloneElement(children, { id }) : children}
      {hint ? (
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {hint}
        </Text>
      ) : null}
    </Box>
  )
}

/** Un `<select>` natif : tabulable, annoncé par les lecteurs d'écran, utilisable
 *  au pouce sans code supplémentaire — même choix que `NeedsFilterDrawer`. */
function Choice({
  id,
  value,
  onChange,
  options,
  anyLabel,
}: {
  /** Posé par {@link Field}, qui porte l'étiquette. */
  id?: string
  value: string
  onChange: (value: string) => void
  options: readonly { value: string; label: string }[]
  anyLabel: string
}) {
  return (
    <SelectField
      id={id}
      value={value}
      onChange={next => onChange(next)}
      emptyOption={{ label: anyLabel }}
      options={options.map(option => ({ value: option.value, label: option.label }))}
      size="sm"
      className="w-full"
    />
  )
}
