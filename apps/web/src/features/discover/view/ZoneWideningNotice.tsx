import { useTranslation } from 'react-i18next'
import { MapPin } from 'lucide-react'
import {
  zoneCeilingBefore,
  zoneRevertLabel,
  zoneStepBackLabel,
  zoneStepLabel,
  zoneWideningHeadline,
  type DiscoverZoneWidening,
  type ZoneCeiling,
} from '@bellum/contracts'

export const BANNER_STYLE = {
  background: 'var(--surface-raised, rgba(148,163,184,0.06))',
  border: '1px solid rgba(148,163,184,0.22)',
} as const

/**
 * #4429.4 — le palier de zone appliqué, ÉCRIT au-dessus de la liste (décision Louis 21/10/2026).
 *
 * La phrase vient du contrat (`zoneWideningHeadline`) : Laura dit la même, mot pour mot. ⚠️ c144 (Louis
 * 27/10/2026 au soir) : 50 km, puis le département, la région — l'échelle AUTOMATIQUE s'arrête à la région, même
 * sous le seuil, et le bandeau le DIT d'une ligne (renverse c143, qui montait jusqu'à la France). Un barreau à la fois : chaque
 * barreau franchi est NOMMÉ (ligne « Paliers franchis ») et le geste revient au barreau d'avant — « Revenir à 50 km »
 * depuis le département, « Revenir à Toulouse seule » depuis 50 km (ville stricte). Sans élargissement, `null` :
 * aucun palier n'a été tenté, il n'y a rien à dire (#3876).
 */
export function ZoneWideningNotice({
  widening,
  allLabelled = true,
  onRevert,
  onStepBack = () => {},
  strictPlace = null,
  ceilingStep = null,
  onWiden = () => {},
  embedded = false,
  radiusKm,
}: {
  widening: DiscoverZoneWidening | undefined
  /** #4627 — chaque ligne élargie porte son étiquette : seule condition pour que la phrase le dise. */
  allLabelled?: boolean
  /** Revient à la ville seule (depuis le premier barreau, 50 km). */
  onRevert: (place: string) => void
  /** Revient au barreau d'AVANT (depuis le département, la région ou la France) : la recherche est bornée à ce barreau. */
  onStepBack?: (place: string, ceiling: ZoneCeiling, radiusKm?: number) => void
  /** #4429.4 — la ville dont la zone est stricte (« Revenir à Albi seule » posé) : l'état se DIT tant qu'il dure. */
  strictPlace?: string | null
  /** #4429.4 — le barreau posé par « Revenir à 50 km » (ou au département) : l'état se DIT, avec le geste inverse. */
  ceilingStep?: { place: string; ceiling: ZoneCeiling } | null
  /** Le geste inverse : retrouver les paliers de zone. */
  onWiden?: () => void
  /** Dans le bandeau commun (`WideningBanner`) : ni cadre ni rôle propres. */
  embedded?: boolean
  /** #4627.9 — le rayon RÉELLEMENT posé sur la recherche : le geste de retour le nomme et le repose. */
  radiusKm?: number
}) {
  const { t, i18n } = useTranslation('discover')
  const locale = i18n.language?.startsWith('en') ? 'en' : 'fr'
  if (!widening) {
    if (!strictPlace && !ceilingStep) return null
    return (
      <div
        data-testid={strictPlace ? 'zone-strict-notice' : 'zone-ceiling-notice'}
        role={embedded ? undefined : 'status'}
        className={
          embedded
            ? 'flex flex-wrap items-center justify-between gap-2'
            : 'mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg p-3'
        }
        style={embedded ? undefined : BANNER_STYLE}
      >
        <p className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          <MapPin aria-hidden="true" className="h-[13px] w-[13px]" />
          {strictPlace
            ? t('zoneWidening.strict', { place: strictPlace })
            : t('zoneWidening.ceiling', {
                step: zoneStepLabel(ceilingStep!.ceiling, locale),
                place: ceilingStep!.place,
              })}
        </p>
        <button
          type="button"
          onClick={onWiden}
          className="inline-flex min-h-11 items-center rounded-md px-3 py-1.5 text-sm font-medium"
          style={{ color: 'var(--text-primary)', border: '1px solid rgba(148,163,184,0.32)' }}
        >
          {t('zoneWidening.widenAgain', { place: strictPlace ?? ceilingStep?.place })}
        </button>
      </div>
    )
  }

  const ceiling = zoneCeilingBefore(widening.tier)
  const stepBackLabel = zoneStepBackLabel(widening.tier, locale)
  const steps = widening.steps ?? []
  // c144 / 2710N — le service dit un FAIT (`autoCapReached` : l'échelle est allée jusqu'à son plafond et la liste reste
  // courte) ; l'écran ne le DEVINE plus d'après `tier`, qui ne dit que le barreau qui a ajouté un compte.
  const stopsAtRegion = widening.autoCapReached === true
  return (
    <div
      role={embedded ? undefined : 'status'}
      className={
        embedded
          ? 'flex flex-wrap items-center justify-between gap-2'
          : 'mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg p-3'
      }
      style={embedded ? undefined : BANNER_STYLE}
    >
      <div>
        <p className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          <MapPin aria-hidden="true" className="h-[13px] w-[13px]" />
          {zoneWideningHeadline(widening, locale)}
        </p>
        <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
          {t(allLabelled ? 'zoneWidening.counts' : 'zoneWidening.countsPlain', {
            count: widening.exactCount,
            place: widening.place,
            widened: widening.widenedCount,
          })}
        </p>
        {stopsAtRegion && (
          <p
            data-testid="zone-stops-at-region"
            className="mt-1 text-xs leading-snug"
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('zoneWidening.stopsAtRegion')}
          </p>
        )}
        {steps.length > 1 && (
          <p data-testid="zone-steps" className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
            {t('zoneWidening.steps', { steps: steps.map(step => zoneStepLabel(step, locale)).join(' → ') })}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          if (!ceiling) return onRevert(widening.place)
          // #4627.9 — le rayon n'est transmis que s'il est réellement posé : le clic le repose.
          if (radiusKm === undefined) return onStepBack(widening.place, ceiling)
          onStepBack(widening.place, ceiling, radiusKm)
        }}
        className="inline-flex min-h-11 items-center rounded-md px-3 py-1.5 text-sm font-medium"
        style={{ color: 'var(--text-primary)', border: '1px solid rgba(148,163,184,0.32)' }}
      >
        {stepBackLabel ?? zoneRevertLabel(widening.place, locale)}
      </button>
    </div>
  )
}
