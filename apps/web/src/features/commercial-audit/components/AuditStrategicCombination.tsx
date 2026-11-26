import { useTranslation } from 'react-i18next'
import type { CommercialAuditContext } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { AuditCard } from './AuditCard'

type Props = {
  strategicOptions: CommercialAuditContext['strategicOptions']
}

/**
 * #2066.19 / #2066.27 — DÉCISION Louis 17/09 (QCM) : la combinaison de voies
 * GÉNÉRÉE (`buildStrategicOptions`, `commercial-audit-signals.ts:465`, 2 à 5
 * canaux DÉCLARÉS par la personne — `go_to_market_channels`) s'affiche dans
 * l'AUDIT (`/settings/profile/audit`), à côté de la stratégie VALIDÉE
 * (`AuditStrategyOptions`, badge « Stratégie retenue »). `/welcome` garde la
 * seule stratégie retenue — inchangé par ce lot.
 *
 * LECTURE SEULE : aucun bouton ici ne réécrit quoi que ce soit —
 * `buildStrategicOptions` ne calcule ni ne persiste de choix, c'est un
 * dérivé du questionnaire. « Revoir mes réponses » (onboarding) et
 * « Choisir cette stratégie » (`AuditStrategyOptions`) existent déjà
 * ailleurs et ne sont pas dupliqués ici.
 *
 * La combinaison EST déjà « recommandée LIMITÉE » par construction — bornée
 * à 5, réduite à l'ordre du catalogue au-delà (#2066.27, « ne pas tout
 * garder actif ») : tous ses éléments sont donc mis en avant ENSEMBLE,
 * chacun VISIBLE ET NOMMÉ, jamais résumé en « +N autres ». Les libellés sont
 * VERBATIM (réponses du questionnaire), jamais reformulés — seules les
 * phrases de cadre viennent de l'i18n, aux deux langues (même doctrine que
 * `AuditDeclaredSignals`).
 *
 * `null` (moins de 2 canaux déclarés, ou profil non établi) → RIEN : pas de
 * bloc vide, pas de « 0 » — décision explicite de ce lot, distincte du
 * placeholder « non mesuré » des autres blocs de l'audit.
 */
export function AuditStrategicCombination({ strategicOptions }: Props) {
  const { t } = useTranslation('commercialAudit')

  if (strategicOptions === null) return null

  return (
    <section className="space-y-3">
      <Text element="h2" size="lg" weight="semibold">
        {t('strategicCombination.title')}
      </Text>
      <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('strategicCombination.description')}
      </Text>
      <AuditCard>
        <ul className="space-y-1">
          {strategicOptions.map(option => (
            <li key={option.label}>
              <Text element="p" size="sm" weight="medium">
                {option.label}
              </Text>
            </li>
          ))}
        </ul>
      </AuditCard>
    </section>
  )
}
