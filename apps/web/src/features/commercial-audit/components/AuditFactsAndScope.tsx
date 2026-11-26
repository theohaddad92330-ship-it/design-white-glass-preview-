import { useTranslation } from 'react-i18next'
import type { CommercialAuditContext } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { AuditCard } from './AuditCard'
import { ConfidenceBadge } from './ConfidenceBadge'

type Props = {
  scope: CommercialAuditContext['scope']
  facts: CommercialAuditContext['facts']
}

/**
 * #2061.2 / #2061.3 — LE PÉRIMÈTRE DE L'AUDIT ET LES FAITS ÉTABLIS.
 *
 * Réouverture du 24/09/2026 (#2061, rouverte par un audit du soir) : les deux
 * champs étaient écrits `null` EN DUR dans `buildCommercialAuditContext`
 * (`lib/build-audit.ts`, ~l. 950-1026) et RENDUS PAR AUCUN COMPOSANT —
 * exactement le défaut n°1 de ce dépôt. `buildScope`/`buildFacts`
 * (`lib/build-audit.ts`) les dérivent maintenant de la cible visée, de la
 * profondeur d'analyse et des champs déjà lus par ce fichier (positionnement,
 * archétype, cadence, objectifs, point de friction, angle de valeur) —
 * jamais une nouvelle requête, jamais une valeur devinée.
 *
 * `null` = non établi, NOMMÉ avec ce qui manque — jamais une phrase de
 * remplissage générique (doctrine « si cette valeur est absente, une phrase
 * est-elle VRAIE ? »).
 */
export function AuditFactsAndScope({ scope, facts }: Props) {
  const { t } = useTranslation('commercialAudit')

  return (
    <section className="space-y-3">
      <Text element="h2" size="lg" weight="semibold">
        {t('factsAndScope.title')}
      </Text>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <AuditCard className="space-y-2">
          <Text element="h3" size="sm" weight="semibold">
            {t('factsAndScope.scopeTitle')}
          </Text>
          {scope === null ? (
            <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
              {t('factsAndScope.scopeUnmeasured')}
            </Text>
          ) : (
            <Text element="p" size="sm" data-testid="audit-scope-value">
              {scope}
            </Text>
          )}
        </AuditCard>

        <AuditCard className="space-y-2">
          <Text element="h3" size="sm" weight="semibold">
            {t('factsAndScope.factsTitle')}
          </Text>
          {facts === null || facts.length === 0 ? (
            <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
              {facts === null ? t('factsAndScope.factsUnmeasured') : t('factsAndScope.factsEmpty')}
            </Text>
          ) : (
            <ul className="space-y-1.5" data-testid="audit-facts-list">
              {facts.map(fact => (
                <li key={fact.statement} className="flex items-start justify-between gap-2">
                  <Text element="p" size="sm">
                    {fact.statement}
                  </Text>
                  <ConfidenceBadge confidence={fact.confidence} />
                </li>
              ))}
            </ul>
          )}
        </AuditCard>
      </div>
    </section>
  )
}
