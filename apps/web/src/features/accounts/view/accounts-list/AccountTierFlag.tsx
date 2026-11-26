import { parseTierLabel } from '@bellum/contracts'

const ORDER = ['A', 'B', 'C'] as const

/**
 * #4426.4 — le tier A/B/C que le client a importé (étiquette « Tier X » posée par l'import) se lit sur la ligne.
 * Une seule dérivation (`parseTierLabel`, GA-26) ; aucune étiquette de tier ⇒ RIEN, jamais un tier deviné.
 */
export function AccountTierFlag({ tags }: { tags?: readonly string[] | null }) {
  const tiers = new Set((tags ?? []).filter(tag => /^\s*tier\b/i.test(tag)).map(parseTierLabel))
  const tier = ORDER.find(letter => tiers.has(letter))
  if (!tier) return null
  return (
    <span
      data-testid="account-tier-flag"
      className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-[var(--bellum-surface-2)] px-1.5 text-xs leading-4 font-medium"
    >
      Tier {tier}
    </span>
  )
}
