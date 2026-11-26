import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SelectField,
  Text,
} from '@bellum/ui'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { useAssignAccount } from '@/features/manager/hooks/useAssignAccount'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'

/* ------------------------------------------------------------------ */
/*  #2166.58 — attribuer une SÉLECTION de Découvrir à un membre.         */
/*                                                                     */
/*  MÊME chemin d'écriture que `AccountAssignSubmenu` (`useAssignAccount`, */
/*  `PATCH /accounts/:id/assign`, une porte, GA-05 « records:write ») —   */
/*  un second chemin pour le même geste aurait violé la loi 1 du tome 7. */
/*                                                                     */
/*  Même patron que `AddToTargetListDialog` : PRÉVISUALISATION avant     */
/*  envoi (#2166.61), et seuls les candidats déjà éligibles (`accountId`  */
/*  connu) sont attribuables — le reste est COMPTÉ, jamais tu.           */
/* ------------------------------------------------------------------ */

interface AssignSelectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  eligible: DiscoverCandidate[]
  ineligibleCount: number
  /** Appelé une fois l'attribution confirmée — le caller vide sa sélection. */
  onDone: () => void
}

export function AssignSelectionDialog({
  open,
  onOpenChange,
  eligible,
  ineligibleCount,
  onDone,
}: AssignSelectionDialogProps) {
  const { t } = useTranslation('discover')
  const members = useWorkspaceMembers().data ?? []
  const assign = useAssignAccount()
  const [assignedTo, setAssignedTo] = useState('')
  const [pending, setPending] = useState(false)

  const canSubmit = eligible.length > 0 && assignedTo.length > 0 && !pending

  const submit = async () => {
    if (!canSubmit) return
    setPending(true)
    try {
      for (const candidate of eligible) {
        if (!candidate.accountId) continue
        await assign.mutateAsync({ accountId: candidate.accountId, assignedTo })
      }
      toast.success(t('assignDialog.success', { count: eligible.length }))
      setAssignedTo('')
      onDone()
      onOpenChange(false)
    } catch {
      toast.error(t('assignDialog.failed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('assignDialog.cancel')} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('assignDialog.title')}</DialogTitle>
          <DialogDescription>{t('assignDialog.previewTitle')}</DialogDescription>
        </DialogHeader>

        <Box display="flex" className="max-h-40 flex-col gap-1 overflow-y-auto">
          {eligible.map(candidate => (
            <Text key={candidate.siren} size="sm">
              {candidate.name}
            </Text>
          ))}
        </Box>

        {ineligibleCount > 0 && (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('assignDialog.excludedNote', { count: ineligibleCount })}
          </Text>
        )}

        {members.length === 0 ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('assignDialog.noMembers')}
          </Text>
        ) : (
          // GA-251 — un <select> natif ne suit pas le thème.
          <SelectField
            value={assignedTo}
            onChange={setAssignedTo}
            options={members.map(member => ({
              value: member.userId,
              label: member.fullName ?? member.email ?? member.userId,
            }))}
            placeholder={t('assignDialog.memberLabel')}
            ariaLabel={t('assignDialog.memberLabel')}
          />
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('assignDialog.cancel')}
          </Button>
          <Button disabled={!canSubmit} onClick={() => void submit()}>
            {t('assignDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
