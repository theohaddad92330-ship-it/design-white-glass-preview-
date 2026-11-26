import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AuditMoveDecisionMove, AuditMoveDecisionStatus, ProfileContextResponse } from '@bellum/contracts'
import { profileContextApi, profileContextKeys } from '@/features/profile-context/api'

/**
 * #2074.16 — « Valider » / « Modifier » / « Écarter » UN mouvement d'audit
 * PROPOSÉ (`AuditMove`). PERSISTE le geste dans `profiles.audit_move_decisions`,
 * clé sur `AuditMove.ruleId` — jamais dans `profile_context`.
 *
 * Le clic EST la décision (geste utilisateur = auto-approuvé) : cette
 * mutation part sans confirmation, et sa réponse REMPLACE directement le
 * cache de `GET /profile-context/me` — même précédent que
 * `useChooseEntryStrategy`/`useValidateProfileContext`.
 */
export function useRecordAuditMoveDecision() {
  const queryClient = useQueryClient()
  // #2074.16 — `move` : l'objet montré, qui devient la tâche dans Actions (Valider/Modifier).
  return useMutation<
    ProfileContextResponse,
    Error,
    { ruleId: string; status: AuditMoveDecisionStatus; move?: AuditMoveDecisionMove }
  >({
    mutationKey: ['profile-context', 'record-audit-move-decision'],
    mutationFn: ({ ruleId, status, move }) => profileContextApi.recordAuditMoveDecision(ruleId, status, move),
    onSuccess: data => {
      queryClient.setQueryData(profileContextKeys.me, data)
    },
  })
}
