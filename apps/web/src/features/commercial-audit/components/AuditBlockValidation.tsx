import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button, Text } from '@bellum/ui'
import { useCommercialAuditFeedback, useCreateCommercialAuditFeedback } from '../hooks/useCommercialAuditFeedback'

/**
 * #2075.14 (épopée #2880, lot V33) — « Valider par BLOC ». Chaque conséquence
 * de l'audit (« À partir de maintenant, BellumAI va… », les six blocs de
 * #2075.2-.7) se valide SEULE, à côté de « Valider l'ensemble »
 * (`ValidateContextStatus`, #2075.15), qui reste le geste qui débloque la
 * régénération.
 *
 * Tranché sans Louis : le bloc validé est un geste de la MÊME table que
 * commenter/refuser (`commercial_audit_feedback`, #2075.12/.13) — même
 * lecture « le geste le plus récent par cible », aucune seconde source.
 * Le clic EST la décision (geste utilisateur = auto-approuvé).
 */
export function AuditBlockValidation({ targetKey }: { targetKey: string }) {
  const { t } = useTranslation('commercialAudit')
  const { data } = useCommercialAuditFeedback()
  const { mutate, isPending } = useCreateCommercialAuditFeedback()
  const current = data?.feedback[targetKey] ?? null

  if (current?.kind === 'validated') {
    return (
      <Text element="p" size="xs" className="text-[var(--success-soft-text)]">
        {t('feedback.validatedNote')}
      </Text>
    )
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="pointer-coarse:min-h-11"
      disabled={isPending}
      onClick={() =>
        mutate({ target_key: targetKey, kind: 'validated' }, { onError: () => toast.error(t('feedback.errorBody')) })
      }
    >
      {t('feedback.validateTrigger')}
    </Button>
  )
}
