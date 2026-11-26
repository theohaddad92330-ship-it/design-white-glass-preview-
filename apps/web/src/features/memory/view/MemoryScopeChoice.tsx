import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, MessagesSquare, Users } from 'lucide-react'
import type { MemoryItemScope, MemoryScopeOffer } from '@bellum/contracts'
import { Text, cn } from '@bellum/ui'

/**
 * #1917.3 / #1917.4 / #1918.9 — « POUR QUI ? », demandé AVANT d'épingler.
 *
 * Pas un menu : des boutons, et la phrase qui suit dit QUI pourra le voir — la
 * permission est visible avant la validation, pas découverte après (#1918.9).
 *
 * UN seul composant pour les écrans qui épinglent en demandant (la carte de
 * confirmation de Laura, la carte Mémoire) : deux formulations du même choix
 * divergeraient au premier mot changé. Le DÉFAUT n'est pas décidé ici — il vient
 * de `defaultMemoryScope` (`@bellum/contracts`), à un seul endroit.
 *
 * ⚠️ #1918.2 / #1918.5 — LES CHOIX ARRIVENT EN PROP, ils ne se déduisent plus de
 * l'énumération. Ce composant parcourait `memoryItemScopes` ; les deux portées
 * ajoutées y seraient apparues toutes seules, y compris là où elles ne veulent
 * rien dire — « cette conversation » hors d'un fil ne désigne rien, « mon
 * périmètre » ne veut rien dire pour qui n'en porte aucun. Ce qui est offrable
 * se décide dans le contrat (`offerableMemoryScopes`), pas ici.
 *
 * Des boutons radio natifs dans des `<label>` de 44 px (GA-30) : ils se tabulent,
 * se cochent aux flèches et s'annoncent sans rien réinventer (GA-35).
 */
const ICON_OF: Record<MemoryItemScope, typeof Lock> = {
  user: Lock,
  workspace: Users,
  business_unit: Users,
  conversation: MessagesSquare,
}

/** La clé d'un choix : la portée, et le périmètre quand elle en désigne un. */
function keyOf(offer: MemoryScopeOffer): string {
  return `${offer.scope}:${offer.businessUnitId ?? ''}`
}

export function MemoryScopeChoice({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: readonly MemoryScopeOffer[]
  value: MemoryScopeOffer
  onChange: (offer: MemoryScopeOffer) => void
  disabled?: boolean
}) {
  const { t } = useTranslation('knowledge')
  const name = useId()
  const selected = keyOf(value)
  return (
    <fieldset disabled={disabled} className="mt-2.5 min-w-0 space-y-1.5">
      <legend className="mb-1 text-xs font-medium text-[var(--bellum-text-secondary)]">
        {t('memory.scopeLegend')}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map(option => {
          const key = keyOf(option)
          const checked = selected === key
          const Icon = ICON_OF[option.scope]
          return (
            <label
              key={key}
              className={cn(
                'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs transition-colors',
                'focus-within:ring-2 focus-within:ring-[var(--bellum-primary-500)]',
                checked
                  ? 'border-[var(--bellum-primary-500)] bg-[var(--bellum-surface-2)] text-[var(--bellum-text-primary)]'
                  : 'border-[var(--bellum-border)] text-[var(--bellum-text-secondary)]',
              )}
            >
              <input
                type="radio"
                name={name}
                value={key}
                checked={checked}
                onChange={() => onChange(option)}
                className="size-4 shrink-0 accent-[var(--bellum-primary-500)]"
              />
              <Icon className="size-3.5 shrink-0" aria-hidden />
              {/* #1918.2 — un périmètre se NOMME. « Mon équipe » sans dire
                  laquelle serait exactement le libellé déclaratif qu'on refuse. */}
              {t(`memory.scope.${option.scope}`, { name: option.businessUnitName ?? '' })}
            </label>
          )
        })}
      </div>
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t(`memory.scopeWho.${value.scope}`, { name: value.businessUnitName ?? '' })}
      </Text>
    </fieldset>
  )
}
