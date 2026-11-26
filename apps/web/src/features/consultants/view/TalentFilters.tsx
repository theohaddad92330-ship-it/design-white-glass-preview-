import { Badge, Button, FilterChips, Input } from '@bellum/ui'
import { SlidersHorizontal, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TalentSearchQuery, TalentView } from '@bellum/contracts'
import { TalentFilterDialog } from './TalentFilterDialog'

/**
 * La barre du vivier (PDF 3 §6.3 et §6.4).
 *
 * #4500 (Louis 23/10/2026, refonte V22) — « trop surchargé, pas lisible » : la barre ne garde que la RECHERCHE et
 * un bouton « Filtres » qui ouvre la modale « Filtrer mon vivier » (`TalentFilterDialog`), où vivent TOUS les
 * critères d'avant — la vue rapide, « Mes vues », les compétences, le secteur, le type de profil, les archivés et les
 * seize du tiroir. Chacun y vit UNE fois (GA-26). Au bout, la bascule Liste · Cartes de la maquette.
 *
 * Les vues sont des raccourcis vers des filtres, pas un état parallèle : la pastille posée sous la barre dit ce qui
 * filtre la liste, et « Tout effacer » le retire — un recruteur qui ne sait pas pourquoi quelqu'un manque cesse de
 * faire confiance à l'écran.
 */
export function TalentFilters({
  query,
  activeView = null,
  onChange,
  onView,
  layout,
  onLayoutChange,
}: {
  query: Partial<TalentSearchQuery>
  /** La vue rapide posée (« Tous les profils » = aucune). */
  activeView?: TalentView | null
  onChange: (patch: Partial<TalentSearchQuery>) => void
  onView: (view: TalentView | null) => void
  /** Refonte Théo — la bascule Liste / Cartes, au bout de la barre (maquette `.bo11-switch`). */
  layout: 'list' | 'cards'
  onLayoutChange: (layout: 'list' | 'cards') => void
}) {
  const { t } = useTranslation('consultants')
  const [dialogOpen, setDialogOpen] = useState(false)
  // Ce que la modale porte — le bouton dit COMBIEN de critères sont posés. Les champs qu'une vue rapide remplit
  // (`kind`, `derived`, `freeBefore`, `neverSubmitted`) comptent pour UN : c'est un clic, pas quatre critères.
  const viewCarried = Boolean(query.kind || query.derived || query.freeBefore || query.neverSubmitted)
  const activeCount =
    [
      query.skills && query.skills.length > 0 ? true : undefined,
      query.sector,
      query.engagementKind,
      query.includeArchived,
      query.availability,
      query.seniority,
      query.zone,
      query.minTjm,
      query.maxTjm,
      query.minYearsExperience,
      query.language,
      query.cvAvailable,
      query.onMission,
      query.remotePreference,
      query.dormantMonths,
      query.noMissionMonths,
      query.consentState,
      query.completeness,
      query.provenSkillsOnly,
      query.favorite,
    ].filter(value => value !== undefined && value !== '' && value !== false).length + (viewCarried ? 1 : 0)
  const hasFilters = Boolean(query.q) || activeCount > 0

  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* La recherche ouvre la barre, toujours visible. Un `id` stable : les liens et les guides la visent sans lire
            son texte. */}
        <Input
          id="vivier-search-input"
          value={query.q ?? ''}
          aria-label={t('search.label')}
          placeholder={t('search.placeholder')}
          onChange={event => onChange({ q: event.target.value || undefined })}
          className="h-9 min-w-48 flex-1 sm:max-w-sm"
        />
        <Button
          variant={activeCount > 0 ? 'default' : 'outline'}
          className="gap-1.5"
          onClick={() => setDialogOpen(true)}
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          {activeCount > 0 ? t('filters.dialog.openActive', { count: activeCount }) : t('filters.dialog.open')}
        </Button>
        <div className="ml-auto flex items-center">
          <FilterChips
            ariaLabel={t('layout.aria')}
            options={[
              { value: 'list', label: t('layout.list') },
              { value: 'cards', label: t('layout.cards') },
            ]}
            value={layout}
            onChange={next => onLayoutChange(next === 'cards' ? 'cards' : 'list')}
          />
        </div>
      </div>

      {hasFilters ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Une vue rapide se nomme UNE fois : les critères qu'elle a posés ne refont pas de pastille. */}
          {activeView ? (
            <Badge variant="outline">
              {activeView === 'to_revalidate' ? t('staffing.unknown') : t(`views.${activeView}`)}
            </Badge>
          ) : null}
          {query.skills && query.skills.length > 0 ? (
            <Badge variant="outline">
              {t('filters.skills')} : {(query.skills ?? []).join(', ')}
            </Badge>
          ) : null}
          {query.includeArchived ? <Badge variant="outline">{t('filters.includeArchived')}</Badge> : null}
          {!activeView && query.derived ? <Badge variant="outline">{t(`staffing.${query.derived}`)}</Badge> : null}
          {!activeView && query.kind ? <Badge variant="outline">{t(`kind.${query.kind}`)}</Badge> : null}
          {query.engagementKind ? <Badge variant="outline">{t(`engagement.${query.engagementKind}`)}</Badge> : null}
          {query.sector ? (
            <Badge variant="outline">
              {t('filters.sector')} : {query.sector}
            </Badge>
          ) : null}
          {query.zone ? (
            <Badge variant="outline">
              {t('filters.zone')} : {query.zone}
              {/* Un rayon SANS ville n'existe jamais en pratique (le tiroir ne
                  l'envoie pas) — l'afficher accolé à la ville dit ce que le
                  rayon mesure réellement : autour de CETTE ville. */}
              {query.radiusKm !== undefined ? ` · ${t('filters.drawer.radiusOption', { km: query.radiusKm })}` : ''}
            </Badge>
          ) : null}
          {query.minYearsExperience !== undefined ? (
            <Badge variant="outline">
              {t('filters.drawer.yearsExperienceOption', { count: query.minYearsExperience })}
            </Badge>
          ) : null}
          {query.minTjm !== undefined ? (
            <Badge variant="outline">
              {t('filters.minTjm')} : {query.minTjm}
            </Badge>
          ) : null}
          {query.maxTjm !== undefined ? (
            <Badge variant="outline">
              {t('filters.maxTjm')} : {query.maxTjm}
            </Badge>
          ) : null}
          {query.language ? (
            <Badge variant="outline">
              {t('filters.drawer.language')} : {query.language}
            </Badge>
          ) : null}
          {query.cvAvailable ? <Badge variant="outline">{t('filters.drawer.cvAvailable')}</Badge> : null}
          {query.onMission ? (
            <Badge variant="outline">{t(`filters.drawer.onMissionOptions.${query.onMission}`)}</Badge>
          ) : null}
          {query.remotePreference ? <Badge variant="outline">{t(`workMode.${query.remotePreference}`)}</Badge> : null}
          {!activeView && query.freeBefore ? (
            <Badge variant="outline">{t('filters.freeBefore', { date: query.freeBefore })}</Badge>
          ) : null}
          {!activeView && query.neverSubmitted ? <Badge variant="outline">{t('views.never_submitted')}</Badge> : null}
          {query.dormantMonths !== undefined ? (
            <Badge variant="outline">{t('filters.dormant', { count: query.dormantMonths })}</Badge>
          ) : null}
          {query.noMissionMonths !== undefined ? (
            <Badge variant="outline">
              {t('filters.drawer.noMissionMonthsOption', { count: query.noMissionMonths })}
            </Badge>
          ) : null}
          {query.consentState ? <Badge variant="outline">{t(`consent.states.${query.consentState}`)}</Badge> : null}
          {query.completeness ? (
            <Badge variant="outline">{t(`filters.drawer.completenessOptions.${query.completeness}`)}</Badge>
          ) : null}
          {query.provenSkillsOnly ? <Badge variant="outline">{t('filters.drawer.provenSkillsOnly')}</Badge> : null}
          {query.favorite ? <Badge variant="outline">{t('filters.drawer.favorites')}</Badge> : null}
          {query.availability ? <Badge variant="outline">{t(`availability.${query.availability}`)}</Badge> : null}
          {query.seniority ? <Badge variant="outline">{t(`seniority.${query.seniority}`)}</Badge> : null}
          <Button
            size="xs"
            variant="ghost"
            className="gap-1"
            onClick={() => {
              onView(null)
              onChange({
                q: undefined,
                includeArchived: undefined,
                kind: undefined,
                derived: undefined,
                engagementKind: undefined,
                sector: undefined,
                freeBefore: undefined,
                neverSubmitted: undefined,
                dormantMonths: undefined,
                noMissionMonths: undefined,
                consentState: undefined,
                completeness: undefined,
                provenSkillsOnly: undefined,
                favorite: undefined,
                maxTjm: undefined,
                minTjm: undefined,
                minYearsExperience: undefined,
                zone: undefined,
                radiusKm: undefined,
                language: undefined,
                cvAvailable: undefined,
                onMission: undefined,
                remotePreference: undefined,
                availability: undefined,
                seniority: undefined,
                skills: [],
              })
            }}
          >
            <X className="size-3" />
            {t('filters.clear')}
          </Button>
        </div>
      ) : null}

      <TalentFilterDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        query={query}
        activeView={activeView}
        onApply={(patch, view) => {
          onView(view)
          onChange(patch)
        }}
      />
    </div>
  )
}
