import { useTranslation } from 'react-i18next'
import { Layers } from 'lucide-react'
import {
  CRITERIA_WIDEN_MIN_RESULTS,
  widenedByLabel,
  type CriteriaWidenedBy,
  type CriteriaWidening,
  type DiscoverZoneWidening,
  type SurfaceWidening,
  type ZoneCeiling,
} from '@bellum/contracts'
import { BANNER_STYLE, ZoneWideningNotice } from './ZoneWideningNotice'

function languageOf(language: string | undefined): 'fr' | 'en' {
  return language?.startsWith('en') ? 'en' : 'fr'
}

/**
 * #4433 (épopée, Louis 21/10) — l'élargissement se DIT au-dessus de la liste : moins de 10 résultats exacts, ce
 * qui a été ouvert (compétences proches, secteurs voisins, tailles voisines), et le geste « revenir au strict ».
 * En strict, l'état reste visible et se rouvre d'un geste. Sans élargissement ni geste : rien (on n'affiche pas
 * ce qu'on n'a pas).
 */
export function WideningNotice({
  widening,
  strict,
  onStrictChange,
  embedded = false,
}: {
  widening: CriteriaWidening | null
  strict: boolean
  /** L'appelant réémet la MÊME recherche, strict ou non. */
  onStrictChange: (strict: boolean) => void
  /** Dans le bandeau commun (`WideningBanner`) : ni cadre ni rôle propres. */
  embedded?: boolean
}) {
  const { t, i18n } = useTranslation('discover')
  if (!widening && !strict) return null
  const language = languageOf(i18n.language)

  const buttonClass =
    'rounded-full border border-[var(--bellum-border)] px-3 py-1.5 text-sm text-[var(--bellum-text-secondary)] transition-colors pointer-coarse:min-h-11 hover:border-[var(--bellum-primary-500)] hover:text-[var(--bellum-text-primary)]'

  return (
    <div
      role={embedded ? undefined : 'status'}
      data-testid="widening-notice"
      className={embedded ? undefined : 'mb-4 rounded-lg p-3'}
      style={embedded ? undefined : BANNER_STYLE}
    >
      <p className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        <Layers className="h-[13px] w-[13px]" aria-hidden="true" />
        {widening
          ? // #4433.3 — UN seuil (`CRITERIA_WIDEN_MIN_RESULTS`), jamais la longueur de page demandée.
            widening.exactCount >= CRITERIA_WIDEN_MIN_RESULTS
            ? t('widening.titleMore')
            : t('widening.title', { count: CRITERIA_WIDEN_MIN_RESULTS })
          : t('widening.strictTitle')}
      </p>
      {widening && (
        <ul className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
          {widening.steps.map(step => (
            <li key={`${step.axis}-${step.tier}`}>
              {t(`widening.axis.${step.axis}`, {
                values: step.codes
                  .map(code => widenedByLabel({ axis: step.axis, tier: step.tier, code }, language) ?? code)
                  .join(', '),
                count: step.added,
              })}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2">
        <button type="button" onClick={() => onStrictChange(!strict)} className={buttonClass}>
          {strict ? t('widening.widenAgain') : t('widening.backToStrict')}
        </button>
      </div>
    </div>
  )
}

/**
 * #4433.9 — le MÊME bandeau pour les autres surfaces (Mes cibles, veille, analyse de compte) : le palier atteint
 * se dit en une ligne, sans question, avec le geste de retour au strict. Rien à dire et pas de strict : rien.
 * Le seuil du titre est celui des critères (`minResults`), jamais un nombre propre à la surface.
 */
export function SurfaceWideningNotice({
  widening,
  strict,
  onStrictChange,
  embedded = false,
}: {
  widening: SurfaceWidening | null
  strict: boolean
  /** Absent quand l'élargissement a déjà eu lieu côté serveur (analyse) : rien à défaire d'ici. */
  onStrictChange?: (strict: boolean) => void
  embedded?: boolean
}) {
  const { t } = useTranslation('discover')
  if (!widening && !strict) return null
  const buttonClass =
    'rounded-full border border-[var(--bellum-border)] px-3 py-1.5 text-sm text-[var(--bellum-text-secondary)] transition-colors pointer-coarse:min-h-11 hover:border-[var(--bellum-primary-500)] hover:text-[var(--bellum-text-primary)]'
  return (
    <div
      role={embedded ? undefined : 'status'}
      data-testid="surface-widening-notice"
      className={embedded ? undefined : 'mb-4 rounded-lg p-3'}
      style={embedded ? undefined : BANNER_STYLE}
    >
      <p className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        <Layers className="h-[13px] w-[13px]" aria-hidden="true" />
        {widening ? t('widening.title', { count: widening.minResults }) : t('widening.surface.strictTitle')}
      </p>
      {widening && (
        <ul className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
          {widening.steps.map(step => (
            <li key={step.tier}>{t(`widening.surface.tier.${step.tier}`, { count: step.added })}</li>
          ))}
        </ul>
      )}
      {onStrictChange && (
        <div className="mt-2">
          <button type="button" onClick={() => onStrictChange(!strict)} className={buttonClass}>
            {strict ? t('widening.surface.widenAgain') : t('widening.backToStrict')}
          </button>
        </div>
      )}
    </div>
  )
}

/** L'étiquette d'un résultat élargi (« proche : JavaScript ») ; un résultat exact n'en porte aucune. */
export function WidenedChip({ widenedBy }: { widenedBy: CriteriaWidenedBy | undefined }) {
  const { t, i18n } = useTranslation('discover')
  if (!widenedBy) return null
  const value = widenedByLabel(widenedBy, languageOf(i18n.language))
  return (
    <p data-testid="widened-chip" className="text-xs" style={{ color: 'var(--text-secondary)' }}>
      {value === null ? t('widening.sizeUnpublished') : t(`widening.chip.${widenedBy.axis}`, { value })}
    </p>
  )
}

/**
 * UN seul bandeau « recherche élargie » au-dessus de la liste : la zone (#4429) et les critères (#4433) s'y
 * disent ensemble, chacun avec son geste de retour au strict. Rien à dire sur aucun des deux : rien.
 */
export function WideningBanner({
  criteria,
  strict,
  onStrictChange,
  zone,
  zoneAllLabelled = true,
  onZoneRevert,
  onZoneStepBack = () => {},
  zoneRadiusKm,
  zoneStrictPlace = null,
  zoneCeilingStep = null,
  onZoneWiden = () => {},
  surface = null,
  surfaceStrict = false,
  onSurfaceStrictChange = () => {},
}: {
  criteria: CriteriaWidening | null
  strict: boolean
  onStrictChange: (strict: boolean) => void
  zone: DiscoverZoneWidening | undefined
  /** #4627 — chaque ligne élargie porte-t-elle son étiquette ? Sinon la phrase ne le prétend pas. */
  zoneAllLabelled?: boolean
  onZoneRevert: (place: string) => void
  /** #4429.4 (25/10) — « Revenir au barreau d'avant » : la recherche ne dépasse plus ce barreau. */
  onZoneStepBack?: (place: string, ceiling: ZoneCeiling, radiusKm?: number) => void
  /** #4627.9 — le rayon posé sur la recherche, nommé par le geste de retour. */
  zoneRadiusKm?: number
  /** #4429.4 — la zone stricte posée par « Revenir à Albi seule » : visible tant qu'elle dure, réversible. */
  zoneStrictPlace?: string | null
  /** #4429.4 — le barreau posé par « Revenir à 100 km » : visible tant qu'il dure, réversible. */
  zoneCeilingStep?: { place: string; ceiling: ZoneCeiling } | null
  onZoneWiden?: () => void
  /** #4433.9 — le palier des autres surfaces ; Découvrir ne le passe pas. */
  surface?: SurfaceWidening | null
  surfaceStrict?: boolean
  onSurfaceStrictChange?: (strict: boolean) => void
}) {
  if (!criteria && !strict && !zone && !zoneStrictPlace && !zoneCeilingStep && !surface && !surfaceStrict) return null
  return (
    <div role="status" data-testid="widening-banner" className="mb-4 space-y-3 rounded-lg p-3" style={BANNER_STYLE}>
      <ZoneWideningNotice
        widening={zone}
        allLabelled={zoneAllLabelled}
        onRevert={onZoneRevert}
        onStepBack={onZoneStepBack}
        radiusKm={zoneRadiusKm}
        strictPlace={zoneStrictPlace}
        ceilingStep={zoneCeilingStep}
        onWiden={onZoneWiden}
        embedded
      />
      <WideningNotice widening={criteria} strict={strict} onStrictChange={onStrictChange} embedded />
      <SurfaceWideningNotice
        widening={surface}
        strict={surfaceStrict}
        onStrictChange={onSurfaceStrictChange}
        embedded
      />
    </div>
  )
}
