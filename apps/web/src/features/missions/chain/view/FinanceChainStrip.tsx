import { Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

type FinanceChainStepKey = 'activity' | 'controls' | 'invoice' | 'settlement'

// Théo C missions-cra.N1 — le bandeau « Activité → Contrôles → Facture → Règlement ».
// Chaque étape renvoie à l'écran qui la porte ; l'étape courante n'est pas un lien.
const STEPS: ReadonlyArray<{
  key: FinanceChainStepKey
  to: '/missions/cra' | '/missions/facturation' | '/missions/encaissements'
}> = [
  { key: 'activity', to: '/missions/cra' },
  { key: 'controls', to: '/missions/facturation' },
  { key: 'invoice', to: '/missions/facturation' },
  { key: 'settlement', to: '/missions/encaissements' },
]

/**
 * LE BANDEAU DE CHAÎNE FINANCIÈRE (partagé) — quatre étapes en tête des écrans
 * « Relevés d'activité » et « Prêt à facturer ». Il relie, il ne mesure rien :
 * aucun compte, aucun taux d'avancement.
 */
export function FinanceChainStrip({ current }: { current: FinanceChainStepKey }) {
  const { t } = useTranslation('missions')
  return (
    <nav aria-label={t('financeChain.label')}>
      {/* Théo .chain — UNE barre à quatre segments séparés d'un filet ; l'étape courante en accent. */}
      <ol
        data-slot="finance-chain"
        className="grid list-none grid-cols-2 overflow-hidden rounded-card border border-border p-0 lg:grid-cols-4"
      >
        {STEPS.map((step, index) => {
          const isCurrent = step.key === current
          const body = (
            <>
              <Text
                element="span"
                size="sm"
                weight="semibold"
                color={isCurrent ? 'text-[var(--bellum-text-accent)]' : undefined}
                className="block"
              >
                {index + 1}. {t(`financeChain.${step.key}.title`)}
              </Text>
              <Text
                element="span"
                size="xs"
                color={isCurrent ? 'text-[var(--bellum-text-accent)]' : 'text-[var(--bellum-text-muted)]'}
                className="block"
              >
                {t(`financeChain.${step.key}.hint`)}
              </Text>
            </>
          )
          return (
            <li
              key={step.key}
              aria-current={isCurrent ? 'step' : undefined}
              className={`border-border px-4 py-3 [&:nth-child(n+2)]:border-l max-lg:[&:nth-child(3)]:border-l-0 max-lg:[&:nth-child(n+3)]:border-t ${
                isCurrent ? 'bg-[var(--bellum-accent-bg)]' : 'bg-card'
              }`}
            >
              {isCurrent ? (
                body
              ) : (
                <Link to={step.to} className="block min-h-11 hover:underline">
                  {body}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
