import { useTranslation } from 'react-i18next'
import type { AuditActiveLoad as AuditActiveLoadValue } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { activeLoadMissingAnswers } from '../lib/active-load-missing-answers'
import { AuditCard } from './AuditCard'

type Translate = ReturnType<typeof useTranslation>['t']
type QuantityName = keyof AuditActiveLoadValue

/** L'ordre du récit de #2067 : partenaires, créneaux, réserve, éléments à reporter. */
const QUANTITIES: readonly QuantityName[] = ['partners', 'slots', 'reserve', 'deferred']

type QuantityView = { established: true; lines: string[]; rule: string } | { established: false; reason: string }

function viewOf(name: QuantityName, activeLoad: AuditActiveLoadValue, t: Translate): QuantityView {
  const quantity = activeLoad[name]
  if (quantity.kind === 'answerMissing') {
    return {
      established: false,
      reason: t('activeLoad.missing', { answers: activeLoadMissingAnswers(quantity.missingAnswers, t) }),
    }
  }
  switch (quantity.kind) {
    case 'regularPartners':
      // #2067.2 — les RÉGULIERS forment la charge active ; les ponctuels sont
      // cités hors d'elle, jamais additionnés.
      return {
        established: true,
        lines: [
          t('activeLoad.partners.regular', { regular: quantity.regular, doors: quantity.partnerDoors.join(', ') }),
          ...(quantity.occasional ? [t('activeLoad.partners.occasional', { occasional: quantity.occasional })] : []),
        ],
        rule: t('activeLoad.partners.ruleRegular'),
      }
    case 'noPartnerDoor':
      return {
        established: true,
        lines: [t('activeLoad.partners.noPartnerDoor', { doors: quantity.doors.join(', ') })],
        rule: t('activeLoad.partners.rule'),
      }
    case 'slots':
      return {
        established: true,
        lines: [
          t('activeLoad.slots.slots', { slots: quantity.slots.join(', ') }),
          ...(quantity.holding ? [t('activeLoad.slots.holding', { holding: quantity.holding })] : []),
        ],
        rule: t('activeLoad.slots.rule'),
      }
    case 'noRegularSlot':
      return { established: true, lines: [t('activeLoad.slots.noRegularSlot')], rule: t('activeLoad.slots.rule') }
    case 'reserve':
    case 'noReserve':
      return {
        established: true,
        lines: [
          quantity.kind === 'reserve'
            ? t('activeLoad.reserve.reserve', { count: quantity.freeFronts })
            : t('activeLoad.reserve.noReserve'),
          // L'érosion déclarée est CITÉE, jamais retranchée : le nombre au-dessus ne bouge pas.
          ...(quantity.erosionRisks.length > 0
            ? [t('activeLoad.reserve.erosion', { risks: quantity.erosionRisks.join(' ; ') })]
            : []),
        ],
        rule: t('activeLoad.reserve.rule', { maxFronts: quantity.maxFronts, doorCount: quantity.doorCount }),
      }
    case 'toDefer':
      return {
        established: true,
        lines: [
          t('activeLoad.deferred.toDefer', { count: quantity.count, candidates: quantity.candidates.join(', ') }),
          t('activeLoad.deferred.choice'),
        ],
        rule: t('activeLoad.deferred.rule', { maxFronts: quantity.maxFronts, doorCount: quantity.candidates.length }),
      }
    case 'nothingToDefer':
      return {
        established: true,
        lines: [t('activeLoad.deferred.nothingToDefer')],
        rule: t('activeLoad.deferred.rule', { maxFronts: quantity.maxFronts, doorCount: quantity.doorCount }),
      }
  }
}

/**
 * #2067.2 / #2067.4 / #2067.5 / #2067.6 — L'ARBITRAGE DE LA CHARGE ACTIVE.
 *
 * Les deux premiers repères de #2067 (comptes actifs, volume de suivi) vivent
 * dans « À partir de maintenant, … va… » (`AuditConsequences`) ; celui-ci rend
 * les quatre autres, JUSTE APRÈS, sur le même cadre (`AuditCard`) et le même
 * catalogue i18n. Chaque grandeur établie porte la RÈGLE qui la produit ; une
 * grandeur non établie le DIT et nomme la réponse qui manque — jamais un
 * chiffre, jamais 0 (GA-18 / GA-19). Toute la décision vit dans la dérivation
 * du contrat (`commercial-audit-active-load.ts`) : ce composant ne fait que
 * rendre.
 *
 * Le repère de volume porte son hypothèse (#2067.8-.11) : la MÊME phrase que
 * sous la cadence et le rythme mensuel, jamais une seconde formulation.
 */
export function AuditActiveLoad({ activeLoad }: { activeLoad: AuditActiveLoadValue }) {
  const { t } = useTranslation('commercialAudit')

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <Text element="h2" size="lg" weight="semibold">
          {t('activeLoad.title')}
        </Text>
        <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('activeLoad.description')}
        </Text>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {QUANTITIES.map(name => {
          const view = viewOf(name, activeLoad, t)
          return (
            <AuditCard key={name} className="space-y-2">
              <Text element="h3" size="sm" weight="semibold">
                {t(`activeLoad.${name}.title`)}
              </Text>
              {view.established ? (
                <>
                  {view.lines.map(line => (
                    <Text key={line} element="p" size="sm">
                      {line}
                    </Text>
                  ))}
                  <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                    {view.rule}
                  </Text>
                </>
              ) : (
                <>
                  <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
                    {t('activeLoad.unmeasured')}
                  </Text>
                  <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
                    {view.reason}
                  </Text>
                </>
              )}
            </AuditCard>
          )
        })}
      </div>
      <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
        {t('consequences.loadHypothesis')}
      </Text>
    </section>
  )
}
