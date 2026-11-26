import type { PilotageLevelReport } from '@bellum/contracts'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@bellum/ui'
import { useRouter } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useInterventions } from '@/features/playbooks/api'
import { InterventionsBlock } from '@/features/playbooks/view/InterventionsBlock'
import { knownDestinations } from '../../quality/lib/destinations'
import { DecisionCardView, useDecisionCards } from '../DecisionStrip'
import { DataToComplete } from '../DataToComplete'
import { SectionTitle } from './cockpit-ui'

const SHOWN = 3

/**
 * « Trois décisions à prendre » — les trois premières décisions qui attendent, rédigées
 * en phrase, avec un seul lien d'action chacune. Les autres ne disparaissent pas :
 * « Voir toutes les décisions · N » ouvre la file d'arbitrage complète (classée par
 * gravité, assignable) dans une fenêtre, à côté de « Données à compléter » qui garde
 * ses contrôles d'hygiène. Rien n'attend : le bloc entier disparaît, il n'annonce pas
 * trois zéros.
 */
export function CockpitDecisions({ levels, loading }: { levels: PilotageLevelReport[]; loading: boolean }) {
  const { t } = useTranslation(['pilotage', 'common'])
  const router = useRouter()
  const known = useMemo(() => knownDestinations(router.routesByPath as unknown as Record<string, unknown>), [router])
  const cards = useDecisionCards(levels)
  const shown = loading ? [] : cards.slice(0, SHOWN)
  // « Toutes les décisions » = les cartes de la chaîne + la file d'arbitrage : deux listes, une seule somme.
  const { data: interventions } = useInterventions()
  const total = cards.length + (interventions?.length ?? 0)

  return (
    <section
      id="cockpit-decisions"
      aria-label={t('cockpit.decisions.region')}
      data-testid="cockpit-decisions"
      className="space-y-3"
    >
      <div className="space-y-4">
        {shown.length > 0 ? (
          <>
            <SectionTitle>{t('cockpit.decisions.title', { count: shown.length })}</SectionTitle>
            <div className="grid gap-4 md:grid-cols-3">
              {shown.map(card => (
                <DecisionCardView key={card.key} card={card} known={known} variant="theo" />
              ))}
            </div>
          </>
        ) : null}
        {total > 0 ? (
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-lg border border-[var(--bellum-border)] px-4 text-sm font-medium text-[var(--bellum-text-primary)] hover:bg-[var(--bellum-row-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
              >
                {t('cockpit.decisions.all')}
                {` · ${total}`}
              </button>
            </DialogTrigger>
            <DialogContent
              closeLabel={t('common:actions.close')}
              className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl"
            >
              <DialogHeader>
                <DialogTitle>{t('cockpit.decisions.dialogTitle')}</DialogTitle>
                <DialogDescription>{t('cockpit.decisions.dialogDescription')}</DialogDescription>
              </DialogHeader>
              {/* Le compte du bouton additionne les deux listes : la fenêtre montre donc les deux —
                  les décisions de la chaîne, puis la file d'arbitrage. */}
              {cards.length > 0 ? (
                <div data-testid="cockpit-decisions-all-cards" className="grid gap-3 md:grid-cols-2">
                  {cards.map(card => (
                    <DecisionCardView key={card.key} card={card} known={known} variant="theo" />
                  ))}
                </div>
              ) : null}
              <InterventionsBlock />
            </DialogContent>
          </Dialog>
        ) : null}
        <DataToComplete />
      </div>
    </section>
  )
}
