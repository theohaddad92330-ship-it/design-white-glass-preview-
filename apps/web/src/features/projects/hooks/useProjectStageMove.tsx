import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from '@bellum/ui'
import type { ProjectRow, ProjectStage } from '@bellum/contracts'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LostDealRexDialog } from '../view/LostDealRexDialog'
import { StageMovePanel } from '../view/StageMovePanel'
import { useLossReasons } from './useLossReasons'
import { useUpdateProjectStage } from './useUpdateProjectStage'

/** Le contrat serveur borne le motif à 200 caractères ; on le borne aussi ici,
 *  pour que la limite se voie à la saisie plutôt qu'au refus. */
const LOSS_REASON_MAX = 200

/**
 * Théo C projects-fiche.R2 — LE DÉPLACEMENT D'ÉTAPE, extrait du sélecteur pour être partagé.
 *
 * Le sélecteur à pastille (`ProjectStageControl`) et la frise d'étapes de la fiche affaire posent le MÊME
 * geste, gouverné : le panneau d'effet du §8.5 d'abord, le motif pour une perte, l'offre de REX APRÈS une
 * perte confirmée. Deux chemins pour le même geste, un gouverné et un non, est la porte de côté que le
 * produit refuse ailleurs — la logique vit donc ICI, une fois (GA-26).
 *
 * Aucune transition n'est interdite : reculer est un geste de correction. « Perdu » pose son motif AVANT
 * l'envoi — un champ obligatoire se lit comme une question, un 400 comme une panne.
 */
export function useProjectStageMove(opportunity: ProjectRow): {
  choose: (state: ProjectStage) => void
  isPending: boolean
  layer: ReactNode
} {
  const { t } = useTranslation('projects')
  const update = useUpdateProjectStage()
  const [askingLoss, setAskingLoss] = useState(false)
  const [reason, setReason] = useState('')
  const suggestions = useLossReasons(askingLoss)
  const [pendingStage, setPendingStage] = useState<ProjectStage | null>(null)
  const [offeringRex, setOfferingRex] = useState(false)
  const trimmed = reason.trim()

  const choose = (state: ProjectStage) => {
    if (state === opportunity.stage) return
    setPendingStage(state)
  }

  const confirmLoss = () => {
    if (!trimmed) return
    update.mutate({ id: opportunity.id, stage: 'lost', lossReason: trimmed }, { onSuccess: () => setAskingLoss(false) })
  }

  const layer = (
    <>
      {pendingStage ? (
        <StageMovePanel
          project={opportunity}
          target={pendingStage}
          hasMission={opportunity.has_mission === true}
          onCancel={() => setPendingStage(null)}
          onConfirm={({ reason: moveReason, lossReasonCode, accepted, strategy, buying_model, organisation }) => {
            const targetWasLost = pendingStage === 'lost'
            update.mutate(
              {
                id: opportunity.id,
                stage: pendingStage,
                lossReason: moveReason,
                lossReasonCode,
                acceptedActions: accepted,
                ...(strategy || buying_model || organisation
                  ? { caseDimensions: { strategy, buying_model, organisation } }
                  : {}),
              },
              { onSuccess: () => targetWasLost && setOfferingRex(true) },
            )
            setPendingStage(null)
          }}
        />
      ) : null}

      {offeringRex ? (
        <LostDealRexDialog
          open={offeringRex}
          onOpenChange={setOfferingRex}
          projectId={opportunity.id}
          accountId={opportunity.account_id ?? null}
        />
      ) : null}

      <Dialog open={askingLoss} onOpenChange={setAskingLoss}>
        <DialogContent closeLabel={t('common:actions.close')}>
          <DialogHeader>
            <DialogTitle>{t('stage.loss.title')}</DialogTitle>
            <DialogDescription>{t('stage.loss.description')}</DialogDescription>
          </DialogHeader>

          <Textarea
            value={reason}
            maxLength={LOSS_REASON_MAX}
            rows={3}
            placeholder={t('stage.loss.placeholder')}
            aria-label={t('stage.loss.label')}
            onChange={event => setReason(event.target.value)}
          />

          {suggestions.data?.items.length ? (
            <div className="flex flex-wrap gap-2">
              {suggestions.data.items.map(item => (
                <Button key={item.id} type="button" variant="outline" size="sm" onClick={() => setReason(item.label)}>
                  {item.label}
                </Button>
              ))}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAskingLoss(false)}>
              {t('stage.loss.cancel')}
            </Button>
            <Button type="button" disabled={!trimmed || update.isPending} onClick={confirmLoss}>
              {t('stage.loss.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )

  return { choose, isPending: update.isPending, layer }
}
