import type { Account } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { PlayCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAccountRelaunch } from '@/features/accounts/hooks/useAccountRelaunch'
import { planAbsence } from './planAbsence'

type ColdAccount = Pick<Account, 'id' | 'company_name' | 'status' | 'sector' | 'employees' | 'headquarters'> &
  Partial<Pick<Account, 'last_analyzed_at'>>

/**
 * #3670 (R2 07/10) — LE PLAN D'UN COMPTE SANS ANALYSE : trois lignes, jamais « Plan à préciser ».
 *
 * La recette prod du 07/10 a lu, sur un compte froid (Thales), « Plan à préciser » et « 0 actions » :
 * ni ce qui est établi, ni ce qui manque, ni quoi faire. Le résumé nomme maintenant
 *  · ce qui est ÉTABLI — seulement ce que la fiche porte (secteur, effectif, siège) et l'état de l'analyse ;
 *  · ce qui MANQUE — la stratégie, les angles, la première action, que seule l'analyse produit ;
 *  · UNE prochaine action — lancer (ou relancer) l'analyse ; le geste mène à l'écran de lancement, le
 *    crédit n'est débité qu'au clic de CET écran (jamais ici).
 * Doctrine : aucune donnée inventée, une valeur absente ne fait AUCUNE ligne (pas de tiret, pas de 0).
 */
export function PlanColdSummary({ account }: { account: ColdAccount }) {
  const { t } = useTranslation('accountDetail')
  const { relaunch } = useAccountRelaunch(account)
  const absence = planAbsence(account)

  const facts = [
    account.sector?.trim() ? t('planSummary.cold.fact.sector', { value: account.sector.trim() }) : null,
    account.employees?.trim() ? t('planSummary.cold.fact.employees', { value: account.employees.trim() }) : null,
    account.headquarters?.trim()
      ? t('planSummary.cold.fact.headquarters', { value: account.headquarters.trim() })
      : null,
  ].filter((line): line is string => line !== null)
  const canLaunch = absence === 'not-analyzed' || absence === 'analysis-incomplete'

  return (
    <div className="space-y-4 px-5 py-5" data-testid="plan-cold-summary">
      <section className="space-y-1">
        <Text element="h4" size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
          {t('planSummary.cold.establishedTitle')}
        </Text>
        <ul className="space-y-0.5">
          <li>
            <Text size="sm" className="text-[var(--bellum-text-primary)]">
              {t(`planSummary.cold.status.${absence}`)}
            </Text>
          </li>
          {facts.map(fact => (
            <li key={fact}>
              <Text size="sm" className="break-words text-[var(--bellum-text-primary)]">
                {fact}
              </Text>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-1">
        <Text element="h4" size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
          {t('planSummary.cold.missingTitle')}
        </Text>
        <Text size="sm" className="text-[var(--bellum-text-primary)]">
          {t(`planSummary.cold.missing.${absence}`)}
        </Text>
      </section>
      <section className="space-y-2">
        <Text element="h4" size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
          {t('planSummary.cold.nextTitle')}
        </Text>
        {canLaunch ? (
          <Button type="button" variant="violet" size="sm" icon={PlayCircle} onClick={relaunch}>
            {t(absence === 'not-analyzed' ? 'planSummary.cold.launch' : 'planSummary.cold.relaunch')}
          </Button>
        ) : (
          <Text size="sm" className="text-[var(--bellum-text-primary)]">
            {t(`planSummary.cold.next.${absence}`)}
          </Text>
        )}
      </section>
    </div>
  )
}
