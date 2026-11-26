import { meetingRecapApprovalInput, type MeetingInternalOutputKind } from '@bellum/contracts'
import { Box, Button, Text } from '@bellum/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApproveInternal, useMeetingCascade, type MeetingApprovalOutcome } from '@/features/meetings/api'
import { MeetingCascade } from '@/features/meetings/view/MeetingCascade'

/**
 * #2777 — recette écran 27/09 : une note enregistrée depuis le dossier compte
 * (« Noter un échange », `TimelinePanel`) enregistrait bien la note, mais ne
 * proposait AUCUNE cascade (récap / opportunité / besoin / contacts) — le
 * service existe déjà (`MeetingNotesService.cascade`, câblé sur `TabPlan` via
 * `MeetingNotesCard`), il lui manquait cet APPELANT : le dossier compte
 * propose lui aussi la cascade, sur la note qu'on vient d'enregistrer, sans
 * repasser par le formulaire dédié.
 *
 * Prévisualisation figée, comme `MeetingNotesCard` : `useMeetingCascade` ne
 * fait que LIRE (calculer des propositions), rien ne s'écrit avant
 * `useApproveInternal` — la même porte, le même geste utilisateur.
 */
export function NoteCascadeProposal({
  accountId,
  notes,
  onDismiss,
}: {
  accountId: string
  notes: string
  onDismiss: () => void
}) {
  const { t } = useTranslation('activities')
  const structure = useMeetingCascade()
  const approve = useApproveInternal()
  const [outcomes, setOutcomes] = useState<MeetingApprovalOutcome[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    structure.mutate(
      { notes, accountId },
      { onError: cause => setError(cause instanceof Error ? cause.message : String(cause)) },
    )
    // Une proposition par note enregistrée : l'appelant remonte une nouvelle
    // clé (`key={...}`) à chaque note, ce composant ne se remonte jamais avec
    // un `notes` différent en place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onApprove = async (kinds: MeetingInternalOutputKind[]) => {
    const recap = structure.data?.recap
    if (!recap) return
    setError(null)
    const dueAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
    const tasks = recap.nextSteps.map(step => ({
      subject: step.action,
      body: [step.owner, step.due].filter(Boolean).join(' · '),
      dueAt,
    }))
    const recapInput = meetingRecapApprovalInput(recap, accountId)
    const mentioned = recap.mentionedContacts
      .map(contact => ({ fullName: contact.fullName.trim(), role: contact.role?.trim() ?? '' }))
      .filter(contact => contact.fullName.length > 0)
      .map(contact => ({ fullName: contact.fullName, ...(contact.role ? { role: contact.role } : {}) }))
    const opportunityInput = recap.opportunity ? { accountId, title: recap.opportunity.title } : null
    const needInput = recap.need
      ? { accountId, title: recap.need.title, ...(recap.need.detail ? { detail: recap.need.detail } : {}) }
      : null
    const learningEntries = recap.learnings.map(learning => ({ kind: learning.kind, content: learning.content }))
    try {
      const result = await approve.mutateAsync({
        kinds,
        ...(tasks.length > 0 ? { tasks } : {}),
        ...(kinds.includes('recap') && recapInput.body ? { recap: recapInput } : {}),
        ...(kinds.includes('contacts') && mentioned.length > 0 ? { contacts: { accountId, mentioned } } : {}),
        ...(kinds.includes('opportunity') && opportunityInput ? { opportunity: opportunityInput } : {}),
        ...(kinds.includes('need') && needInput ? { need: needInput } : {}),
        ...(kinds.includes('learnings') && learningEntries.length > 0
          ? { learnings: { accountId, entries: learningEntries } }
          : {}),
      })
      setOutcomes(result.outcomes)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  if (structure.isPending) {
    return (
      <Box className="rounded-lg border border-dashed border-[var(--bellum-border)] p-3">
        <Text size="xs" color="text-muted-foreground">
          {t('cascadeProposal.structuring')}
        </Text>
      </Box>
    )
  }

  if (error) {
    return (
      <Box className="rounded-lg border border-dashed border-[var(--bellum-border)] p-3">
        <Text size="xs" className="text-[var(--danger-soft-text)]">
          {error}
        </Text>
      </Box>
    )
  }

  const cascade = structure.data?.cascade
  const recap = structure.data?.recap
  // Une cascade vide est un état VALABLE (la note ne portait rien à proposer)
  // : elle se tait plutôt que d'ouvrir un bloc sans rien dedans.
  if (!cascade || !recap || cascade.cards.length === 0) return null

  return (
    <Box className="space-y-2 rounded-lg border border-[var(--bellum-border)] p-3">
      <Box display="flex" className="items-center justify-between gap-2">
        <Text size="xs" weight="medium">
          {t('cascadeProposal.title')}
        </Text>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          {t('cascadeProposal.dismiss')}
        </Button>
      </Box>
      <MeetingCascade
        cascade={cascade}
        fromTranscript={false}
        drafts={{
          ...(recap.followUpEmail ? { follow_up_email: recap.followUpEmail } : {}),
          ...(recap.reminder ? { reminder: recap.reminder.content } : {}),
        }}
        onApprove={kinds => void onApprove(kinds)}
        approving={approve.isPending}
        {...(outcomes ? { outcomes } : {})}
      />
    </Box>
  )
}
