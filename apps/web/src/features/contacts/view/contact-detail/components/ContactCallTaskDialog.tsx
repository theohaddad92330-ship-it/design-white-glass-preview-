import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
  Textarea,
} from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateOutreachCallTask } from '@/features/outreach/hooks/useOutreachMutations'

/**
 * #2366.5 — le SEUL appelant manquant.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE CARTE RÉPARE
 * ─────────────────────────────────────────────────────────────────────────
 * `POST /outreach/call-tasks` existait déjà : gardé (`messages:send`), testé
 * côté serveur (`outreach-message.service.spec.ts`), lu par le centre
 * d'approbation (`OutreachApprovalCenter` › section « Appels », #2366.5 —
 * corrigée le 23/09 pour ne plus se taire quand seuls des appels existent).
 * Réfuté en prod le 23/09 : la section restait vide parce que RIEN ne créait
 * jamais de tâche d'appel — aucun bouton, aucune carte Laura. Cette carte est
 * ce créateur, posée sur la fiche Contact — même surface que les messages
 * préparés (#2366.1, `ContactOutreachMessagesCard`), `source: 'contacts'`
 * (une des dix surfaces canoniques, `OUTREACH_SURFACES`).
 *
 * #3688 — depuis la recomposition en zones, le créateur n'est plus une carte
 * empilée mais le geste « Planifier un appel » de la barre de travail
 * (`ContactWorkBar`) : même route, même garde, un dialogue ouvert à la demande.
 *
 * Reste HORS de cette tranche : une carte Laura qui proposerait l'appel
 * depuis le fil de conversation — décision produit distincte (quelle
 * intention déclenche la proposition), non tranchée ici.
 */
export function ContactCallTaskDialog({
  contactId,
  open,
  onOpenChange,
}: {
  contactId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('outreach')
  const [reason, setReason] = useState('')
  const [objective, setObjective] = useState('')
  // #2395.8 — un objectif seul ne suffit pas : le résultat attendu est
  // EXIGÉ à la création, pas seulement affiché quand il est déjà là.
  const [expectedOutcome, setExpectedOutcome] = useState('')
  const create = useCreateOutreachCallTask()

  const canSubmit = reason.trim().length > 0 && objective.trim().length > 0 && expectedOutcome.trim().length > 0

  function reset() {
    setReason('')
    setObjective('')
    setExpectedOutcome('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('callCard.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('callCard.explain')}</DialogDescription>
        </DialogHeader>
        <Box className="space-y-3">
          <Box className="space-y-1.5">
            <Text element="label" htmlFor="call-task-reason" size="sm" weight="medium">
              {t('callCard.reasonLabel')}
            </Text>
            <Input
              id="call-task-reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={t('callCard.reasonPlaceholder')}
            />
          </Box>
          <Box className="space-y-1.5">
            <Text element="label" htmlFor="call-task-objective" size="sm" weight="medium">
              {t('callCard.objectiveLabel')}
            </Text>
            <Textarea
              id="call-task-objective"
              value={objective}
              onChange={e => setObjective(e.target.value)}
              placeholder={t('callCard.objectivePlaceholder')}
            />
          </Box>
          <Box className="space-y-1.5">
            <Text element="label" htmlFor="call-task-expected-outcome" size="sm" weight="medium">
              {t('callCard.expectedOutcomeLabel')}
            </Text>
            <Textarea
              id="call-task-expected-outcome"
              value={expectedOutcome}
              onChange={e => setExpectedOutcome(e.target.value)}
              placeholder={t('callCard.expectedOutcomePlaceholder')}
            />
          </Box>
        </Box>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t('callCard.cancel')}
          </Button>
          <Button
            size="sm"
            disabled={!canSubmit || create.isPending}
            onClick={() => {
              create.mutate(
                {
                  contact_id: contactId,
                  source: 'contacts',
                  reason: reason.trim(),
                  objective: objective.trim(),
                  expected_outcome: expectedOutcome.trim(),
                },
                {
                  onSuccess: () => {
                    onOpenChange(false)
                    reset()
                  },
                },
              )
            }}
          >
            {t('callCard.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
