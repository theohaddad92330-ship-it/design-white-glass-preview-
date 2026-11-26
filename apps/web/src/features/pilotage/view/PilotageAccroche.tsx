import { Text, TYPE_SCALE, cn } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { PilotageReport } from '@bellum/contracts'
import { FigureScope } from '@/components/primitives/FigureScope'
import { usePlanFeature } from '@/features/plan-features/usePlanFeature'
import { useSession } from '@/lib/hooks/use-session'
import { pilotageApi } from '../api'
import { pilotageHeadline } from '../accroche'

/**
 * #2108.1 / #2108.21 → .25 / #2108.107 / #2208.29 / #2208.64 — L'ACCROCHE DU
 * PILOTAGE, SUR LA PAGE D'ARRIVÉE (arbitrage de Louis, 16/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS CHIFFRES ET UN LIEN — PAS UN SECOND COCKPIT
 * ─────────────────────────────────────────────────────────────────────────
 * #2108 demandait un persona Dirigeant sur `/dashboard`. Un second pilotage
 * aurait été « exactement ce que GA-254 dit qui se refait toujours,
 * additivement » : le même contenu à deux endroits, sous deux formes, sans
 * savoir lequel fait foi. La LECTURE reste donc sur `/pilotage` ; ici, trois
 * chiffres qui s'additionnent et un lien.
 *
 * ⚠️ La MÊME clé de cache que `PilotagePage` (`['pilotage-chain', userId]`) :
 * une seule lecture, un seul cache, et surtout un seul chiffre. Deux lectures
 * de la même chaîne divergeraient au premier rafraîchissement, et c'est
 * précisément le défaut qu'on refuse.
 *
 * ⚠️ La PORTE, pas la page (#2108.1) : `manager_cockpit`, la même capacité que
 * la route `/pilotage`. Ce qui change par rôle, ce sont les portes ouvertes,
 * pas l'architecture de l'écran. `retry: false` — un refus d'offre ne devient
 * pas vrai en réessayant.
 *
 * ⚠️ Rien n'est rendu tant que la chaîne n'a pas été lue : trois zéros
 * diraient « aucune alerte », et c'est la pire phrase à rendre fausse sur une
 * page d'arrivée (`accroche.ts`).
 */
export function PilotageAccroche() {
  const { t } = useTranslation('pilotage')
  const { user } = useSession()
  const plan = usePlanFeature('manager_cockpit')
  const { data } = useQuery<PilotageReport>({
    queryKey: ['pilotage-chain', user?.id],
    queryFn: pilotageApi.chain,
    enabled: Boolean(user) && plan.allowed,
    staleTime: 60_000,
    retry: false,
  })

  const headline = pilotageHeadline(data)
  if (!headline) return null

  const figures = [
    { key: 'alerting', value: headline.alerting },
    { key: 'unmeasured', value: headline.unmeasured },
    { key: 'healthy', value: headline.healthy },
  ] as const

  // #4298.1 — grammaire Cockpit : une LIGNE (titre, trois chiffres, portée,
  // lien) au lieu d'une carte d'ouverture à chiffres `xl`. Même contenu.
  return (
    <section
      aria-label={t('accroche.title')}
      className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-[var(--bellum-border)] pb-2"
    >
      <Text size="sm" weight="semibold">
        {t('accroche.title')}
      </Text>
      {figures.map(figure => (
        <span key={figure.key} className="inline-flex items-baseline gap-1">
          <span className={cn(TYPE_SCALE.keyFigure, 'text-[var(--bellum-text-primary)]')}>{figure.value}</span>
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t(`accroche.${figure.key}`, { count: figure.value, total: headline.total })}
          </Text>
        </span>
      ))}
      {/* #4298.2 — l'état de la chaîne de l'espace, au moment de la lecture. */}
      <FigureScope scope={{ period: { kind: 'now' }, sources: ['workspace'] }} />
      {/* Le LIEN, et un seul : la lecture vit sur `/pilotage`. */}
      <Link to="/pilotage" className="text-sm text-[var(--bellum-text-accent)] underline underline-offset-2">
        {t('accroche.link')}
      </Link>
    </section>
  )
}
