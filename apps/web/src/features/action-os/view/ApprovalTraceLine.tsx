import { useTranslation } from 'react-i18next'
import { approvalAuthorship } from '../approvalAuthorship'
import { QueueTraceLine } from './QueueTraceLine'

/**
 * #2200.13 / #2200.14 / #2200.21 — LA MÊME TRAÇABILITÉ QUE `RunTraceLine`, sur
 * une carte qui n'a PAS encore de run terminé à montrer : qui a déclenché,
 * depuis quoi, et la prochaine étape si la demande est approuvée.
 *
 * UN seul composant (GA-26) pour la liste du Centre d'actions ET la carte
 * « À valider » de /actions › Aujourd'hui : la carte portait une COPIE de cette
 * logique (`WhyLine`), et le composant n'était atteint que depuis le tiroir
 * Historique.
 *
 * ⚠️ Volontairement plus courte que `RunTraceLine` : `approvedByName`,
 * `accountName` et la référence externe n'ont pas de sens sur une demande
 * encore `pending` — rien n'a été décidé, rien n'a fini. Les afficher quand
 * même inventerait un état qui n'existe pas encore.
 */
export function ApprovalTraceLine({
  trace,
  nextStepKey,
}: {
  trace?: { triggeredByName?: string | null; trigger?: string | null }
  nextStepKey: string | null
}) {
  const { t, i18n } = useTranslation('actions')
  // #2200.13 — la formule d'auteur PARTAGÉE avec la rangée de /actions › Aujourd'hui (GA-26).
  const who = approvalAuthorship(t, trace)
  // Lot L-A (#4164) — « prochaine étape : Effect » n'était qu'une clé technique mise en
  // forme. Un pas sans libellé humain ne s'écrit PAS : mieux vaut rien qu'un mot interne.
  const stepKey = nextStepKey && i18n.exists(`actions:center.step.${nextStepKey}`) ? nextStepKey : null
  return (
    <QueueTraceLine
      parts={[...who, stepKey ? t('center.trace.nextStep', { step: t(`center.step.${stepKey}`) }) : null]}
    />
  )
}
