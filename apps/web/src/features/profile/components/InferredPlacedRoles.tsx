import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { PlacedRolesInferenceResponse } from '@bellum/contracts'
import { Badge, Button, Text } from '@bellum/ui'
import { useDismissInferredPlacedRole, usePlacedRolesInference } from '../hooks/usePlacedRolesInference'

type InferredRole = PlacedRolesInferenceResponse['roles'][number]

/**
 * Métiers placés DÉDUITS du contexte de l'espace (décision Louis 11/10/2026 —
 * « Tout le contexte, et sinon on pose la question »).
 *
 * Chaque métier déduit porte le badge « déduit » (même mot que #4016 L4) et
 * les INDICES qui l'ont fait naître : on n'affiche jamais une déduction sans
 * sa raison. « Confirmer » l'ajoute aux métiers DÉCLARÉS (la même sauvegarde
 * que le champ juste au-dessus) ; « Retirer » est une correction humaine
 * qu'aucun recalcul ne ramène. Rien de déductible : on pose la question.
 */
export const InferredPlacedRoles = memo(function InferredPlacedRoles({
  locked,
  onConfirm,
}: {
  locked: boolean
  onConfirm: (role: string) => void
}) {
  const { t } = useTranslation('profile')
  const inference = usePlacedRolesInference()
  const dismiss = useDismissInferredPlacedRole()
  if (inference.isLoading || inference.isError || !inference.data) return null
  const { roles, declared, needsQuestion } = inference.data

  if (needsQuestion) {
    return (
      <div className="space-y-1 rounded-md border border-[var(--bellum-border)] p-3">
        <Text size="sm" className="font-medium">
          {t('placedRoles.inferred.questionTitle')}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('placedRoles.inferred.questionBody')}
        </Text>
      </div>
    )
  }
  if (roles.length === 0) return null

  return (
    <div className="space-y-2">
      <Text size="sm" className="font-medium">
        {t('placedRoles.inferred.title')}
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {declared ? t('placedRoles.inferred.whenDeclared') : t('placedRoles.inferred.whenNotDeclared')}
      </Text>
      <ul className="space-y-2">
        {roles.map(role => (
          <InferredRoleRow
            key={role.role}
            role={role}
            locked={locked}
            pending={dismiss.isPending}
            onConfirm={() => onConfirm(role.role)}
            onDismiss={() =>
              dismiss.mutate(role.role, {
                onSuccess: () => toast.success(t('placedRoles.inferred.dismissed')),
                onError: () => toast.error(t('placedRoles.error')),
              })
            }
          />
        ))}
      </ul>
    </div>
  )
})

function InferredRoleRow({
  role,
  locked,
  pending,
  onConfirm,
  onDismiss,
}: {
  role: InferredRole
  locked: boolean
  pending: boolean
  onConfirm: () => void
  onDismiss: () => void
}) {
  const { t } = useTranslation('profile')
  return (
    <li className="space-y-1 rounded-md border border-[var(--bellum-border)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Text size="sm" className="font-medium">
          {role.role}
        </Text>
        <Badge variant="outline">{t('placedRoles.inferred.badge')}</Badge>
      </div>
      <ul className="space-y-0.5">
        {role.evidence.map((evidence, index) => (
          <li key={`${evidence.source}-${index}`}>
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('placedRoles.inferred.evidenceLine', {
                source: t(`placedRoles.inferred.source.${evidence.source}`),
                excerpt: evidence.excerpt,
              })}
            </Text>
          </li>
        ))}
      </ul>
      {role.evidenceCount > role.evidence.length ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('placedRoles.inferred.moreEvidence', { count: role.evidenceCount - role.evidence.length })}
        </Text>
      ) : null}
      {locked ? null : (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={t('placedRoles.inferred.confirmAria', { role: role.role })}
            onClick={onConfirm}
          >
            {t('placedRoles.inferred.confirm')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            aria-label={t('placedRoles.inferred.dismissAria', { role: role.role })}
            onClick={onDismiss}
          >
            {t('placedRoles.inferred.dismiss')}
          </Button>
        </div>
      )}
    </li>
  )
}
