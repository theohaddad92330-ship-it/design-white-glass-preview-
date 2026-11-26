import { AlertTriangle, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Tooltip, TooltipContent, TooltipTrigger } from '@bellum/ui'
import { formatDate } from '@/lib/locale'
import type { PrefillFieldMeta } from '@/stores/onboardingStore'

type Props = {
  meta: PrefillFieldMeta
  /** #2028.3 — la valeur suggérée devient la réponse de l'utilisateur. */
  onConfirm: () => void
  /** #2028.3 — rend la main sur le champ, sans rien changer d'autre. */
  onCorrect: () => void
  /** #2028.3 — retire la valeur suggérée plutôt que de la laisser passer. */
  onIgnore: () => void
}

/**
 * Provenance chip shown next to a question whose answer was PREFILLED from the
 * company name (first onboarding screen). Deliberately discreet — the value is
 * a suggestion, not a claim — with the `rationale` behind a tooltip.
 *
 * `confidence: 'low'` switches to the cautious (warning) treatment so the user
 * reads it as "check me" rather than as a fact. The badge disappears as soon as
 * the field is edited (the store drops its meta on `setAnswer`).
 *
 * #2028.3 — le badge n'est plus en LECTURE SEULE. Il annonçait une valeur
 * devinée et laissait l'utilisateur deviner, lui, ce qu'il était censé en
 * faire. Trois gestes, trois effets distincts, et aucun qui invente une donnée.
 *
 * #2028.2 — la DATE réclamée par l'issue. `prefilledFieldSchema` (packages/contracts)
 * porte désormais `as_of` (additif), mais le producteur côté IA n'en émet pas
 * encore (#2028.8, `à trancher`) : `meta.asOf` vaut donc `null` en pratique
 * aujourd'hui. Le badge dit alors « date inconnue » plutôt que de se taire —
 * afficher « 2025 » ou la date du jour à sa place serait une donnée fictive.
 */
export function PrefillBadge({ meta, onConfirm, onCorrect, onIgnore }: Props) {
  const { t } = useTranslation('onboarding')

  const isLow = meta.confidence === 'low'
  const source = t(`prefill.badge.sources.${meta.source}`)
  const label = isLow ? t('prefill.badge.labelLow', { source }) : t('prefill.badge.label', { source })
  const rationale = meta.rationale?.trim() || t('prefill.badge.noRationale')
  const confidence = t(`prefill.badge.confidence.${meta.confidence}`)
  // #2028.2 — `formatDate` (pas `Intl` nu) : la locale d'AFFICHAGE, jamais
  // celle du runtime (garde `locale-is-the-app-not-the-runtime.test.ts`).
  const dateText = formatDate(meta.asOf ?? null, { year: 'numeric' }) ?? t('prefill.badge.unknownDate')
  const description = `${rationale} — ${confidence} — ${dateText}`

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Badge
              variant={isLow ? 'warning' : 'primary'}
              className="cursor-help gap-1 px-2 py-0.5 text-xs font-medium"
              aria-label={`${label} — ${description}`}
            >
              {isLow ? <AlertTriangle className="size-3 shrink-0" /> : <Sparkles className="size-3 shrink-0" />}
              {label}
            </Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="max-w-[260px] leading-relaxed">
          {description}
        </TooltipContent>
      </Tooltip>

      <Button type="button" variant="ghost" size="xs" onClick={onConfirm}>
        {t('prefill.badge.actions.confirm')}
      </Button>
      <Button type="button" variant="ghost" size="xs" onClick={onCorrect}>
        {t('prefill.badge.actions.correct')}
      </Button>
      <Button type="button" variant="ghost" size="xs" onClick={onIgnore}>
        {t('prefill.badge.actions.ignore')}
      </Button>
    </div>
  )
}
