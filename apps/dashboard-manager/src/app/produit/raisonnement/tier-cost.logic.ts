import type { CostAggregate } from '@/lib/costs'

// #3861.R2 — le coût PAR PALIER de raisonnement de Laura. Les trois clés sont les noms de coût du tour
// posés par `chat_orchestrator` (`ProviderCostService.overview().byTier`) ; rien d'autre n'est lu ici.
// La LATENCE par palier n'est pas persistée (`provider_costs` n'a pas de durée) : l'écran le dit.
const PALIERS = {
  bellum_chat_fast: { fr: 'Rapide', en: 'Fast' },
  bellum_chat_deep: { fr: 'Approfondi', en: 'Deep' },
  bellum_chat: { fr: 'Non routé (palier unique)', en: 'Unrouted (single tier)' },
} as const

type ClePalier = keyof typeof PALIERS
const ORDRE: readonly ClePalier[] = ['bellum_chat_fast', 'bellum_chat_deep', 'bellum_chat']

function estUnPalier(cle: string): cle is ClePalier {
  return cle in PALIERS
}

export function libelleDuPalier(cle: string, lang: 'fr' | 'en'): string {
  return estUnPalier(cle) ? PALIERS[cle][lang] : cle
}

/** `null` sans appel ou dès qu'une ligne n'a pas de prix : une moyenne sur un plancher ne se présente pas comme un coût. */
export function coutMoyenParAppel(ligne: CostAggregate): number | null {
  if (ligne.calls <= 0 || ligne.untariffed > 0) return null
  return ligne.cost_usd / ligne.calls
}

type LignePalier = { palier: string; ligne: CostAggregate; moyenne: number | null }

export function lignesDesPaliers(byTier: readonly CostAggregate[], lang: 'fr' | 'en'): LignePalier[] {
  return ORDRE.flatMap(cle => {
    const ligne = byTier.find(l => l.key === cle)
    return ligne ? [{ palier: libelleDuPalier(cle, lang), ligne, moyenne: coutMoyenParAppel(ligne) }] : []
  })
}
