import { Button } from '@bellum/ui'
import { CheckCheck, ListPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { planItemsApi } from '@/features/actions/planItems.api'
import type { MissionView } from '../api'

/**
 * « CRÉER UNE ACTION » DEPUIS LE TIROIR — #2192.35, PAR LA PORTE DE #2195.36.
 *
 * Même patron que `CreateRenewalActionButton` (`RenewalDecisionPanel.tsx`) :
 * `planItemsApi.create` est « LA porte de création d'une action du plan, et la
 * SEULE » (docblock de `planItems.api.ts`) — ce bouton en est un appelant de
 * plus, jamais un second moteur. `target: null` pour la même raison que
 * là-bas : `ACTION_TARGET_KINDS` ne compte aucune nature « mission », et lui
 * en ajouter une suppose une migration hors du périmètre de ce lot (GA-11 /
 * GA-12) — la mission reste nommée dans le LIBELLÉ et le compte visé.
 */
export function CreateMissionActionButton({ mission }: { mission: MissionView }) {
  const { t } = useTranslation('missions')
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle')

  const create = async () => {
    setState('pending')
    try {
      await planItemsApi.create({
        account_id: mission.account_id,
        label: t('dossier.quickActions.createAction.defaultLabel', { mission: mission.label }),
        reason: t('dossier.quickActions.createAction.defaultReason', { mission: mission.label }),
        // #2395.8 — résultat attendu écrit d'après la mission nommée, jamais un verbe seul.
        expected_outcome: t('dossier.quickActions.createAction.defaultExpectedOutcome', { mission: mission.label }),
        target: null,
        owner_name: null,
      })
      setState('done')
      toast.success(t('dossier.quickActions.createAction.created'))
    } catch {
      setState('error')
      toast.error(t('dossier.quickActions.createAction.createError'))
    }
  }

  const done = state === 'done'
  return (
    <Button
      type="button"
      size="sm"
      variant={done ? 'ghost' : 'outline'}
      icon={done ? CheckCheck : ListPlus}
      disabled={state === 'pending' || done}
      isLoading={state === 'pending'}
      onClick={() => void create()}
      className="pointer-coarse:min-h-11"
    >
      {done ? t('dossier.quickActions.createAction.createdLabel') : t('dossier.quickActions.createAction.label')}
    </Button>
  )
}
