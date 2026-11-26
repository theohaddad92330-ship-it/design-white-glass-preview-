import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp } from 'lucide-react'

/**
 * #3237 (reste de #3203.4) — l'ORDRE du ticket, même ordre que
 * `DELIVERY_FIT_AXES` côté IA (`apps/ia/app/services/delivery_fit.py`,
 * source de vérité — GA-26, un seul endroit décide de l'ordre).
 */
const DELIVERY_FIT_AXIS_ORDER = [
  'site_presence',
  'presence_frequency',
  'authorized_countries',
  'languages',
  'timezones',
  'security',
  'sensitive_data',
  'mandated_equipment',
  'clearances',
  'contractual_status',
  'team_model',
  'travel',
  'source_freshness',
] as const

/**
 * Le détail dépliable des treize axes derrière `deliveryFit` (le niveau
 * composé, déjà rendu juste au-dessus par l'appelant). `deliveryFitAxes`
 * était calculé côté IA sans AUCUN appelant côté écran avant ce lot — même
 * anti-motif que CLAUDE.md nomme lui-même.
 *
 * Bouton affiché seulement quand AU MOINS un axe est évalué (sinon rien à
 * auditer — « on n'affiche pas ce qu'on n'a pas »). Une fois ouvert, les
 * TREIZE axes sont rendus, y compris ceux `unknown` : sous un SCORE, les
 * axes non évaluables restent NOMMÉS (doctrine CLAUDE.md) — à la différence
 * de la ligne compacte `deliveryFit` juste au-dessus, qui suit la règle
 * inverse d'une LISTE (GA-18/GA-19, un `unknown` n'y fait aucune ligne).
 * Même patron que `CandidateScore` (`scoreFactorsShow`/`Hide`) — tranché
 * sans Louis (résumé dépliable plutôt que treize lignes toujours visibles).
 */
export function DeliveryFitAxesDisclosure({
  axes,
  open: controlledOpen,
  onOpenChange,
}: {
  axes: Record<string, string>
  /** #3237 — la ligne « Besoins » ouvre le MÊME détail d'un clic sur son corps. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const { t } = useTranslation('discover')
  const [ownOpen, setOwnOpen] = useState(false)
  const open = controlledOpen ?? ownOpen
  const setOpen = (next: (current: boolean) => boolean) => (onOpenChange ?? setOwnOpen)(next(open))
  const hasEvaluatedAxis = DELIVERY_FIT_AXIS_ORDER.some(axis => axes[axis] && axes[axis] !== 'unknown')
  if (!hasEvaluatedAxis) return null

  return (
    <div className="ml-3.5 mt-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs"
        style={{ color: 'var(--text-ghost)' }}
      >
        {open ? t('card.deliveryFitAxesHide') : t('card.deliveryFitAxesShow')}
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div
          className="mt-1 rounded-md p-2"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
        >
          <p className="mb-1 text-xs uppercase tracking-wider" style={{ color: 'var(--text-ghost)' }}>
            {t('card.deliveryFitAxesTitle')}
          </p>
          <dl className="grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2">
            {DELIVERY_FIT_AXIS_ORDER.map(axis => (
              <div key={axis} className="flex items-baseline justify-between gap-2 text-xs">
                <dt style={{ color: 'var(--text-ghost)' }}>{t(`rail.deliveryFitAxis.${axis}`)}</dt>
                <dd style={{ color: 'var(--text-secondary)' }}>{t(`rail.deliveryFit.${axes[axis] ?? 'unknown'}`)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
