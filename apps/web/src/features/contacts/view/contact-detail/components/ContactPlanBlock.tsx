import type { Contact } from '@bellum/contracts'
import { generatedPlanWeeks } from '@bellum/contracts'
import { Button, Card, CardContent } from '@bellum/ui'
import { ClipboardList } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePlanItems } from '@/features/actions/hooks/usePlanItems'
import { PlanStepsList } from '@/features/accounts/view/account-detail/tabs/plan/PlanStepsList'
import { selectContactPlanSteps } from '@/features/accounts/view/account-detail/tabs/plan/planSteps'
import { usePrepareContactPlan } from '@/features/contacts/hooks/usePrepareContactPlan'

/** Le prénom : le premier mot du nom complet (la fiche ne porte pas de prénom séparé). */
function firstNameOf(contact: Contact): string {
  return contact.full_name.trim().split(/\s+/)[0] || contact.full_name
}

/**
 * #4416 (décision Louis 21/10 : « vue filtrée + générer ») — « Plan pour <prénom> » sur la fiche contact.
 *
 * Il MONTRE les étapes du plan DU COMPTE qui visent ce contact (2-3, message prêt + Préparer — le même composant
 * d'étape que l'onglet Plan). S'il n'en a aucune, un bouton en range 2-3 dans ce même plan : un seul plan, jamais
 * deux sources. Ni liste vide, ni « 0 » : sans étape ET sans canal joignable (rien à proposer), le bloc se retire.
 */
export function ContactPlanBlock({
  contact,
  rawAnalysis,
}: {
  contact: Contact
  rawAnalysis: Record<string, unknown> | undefined
}) {
  const { t } = useTranslation('accountDetail')
  const accountId = contact.account_id ?? ''
  const plan = usePlanItems(accountId)
  const prepare = usePrepareContactPlan(accountId, contact.id)
  if (!accountId || plan.isLoading) return null

  const raw = rawAnalysis ?? {}
  const firstName = firstNameOf(contact)
  const steps = selectContactPlanSteps({
    weeks: generatedPlanWeeks(raw),
    contact,
    rawAnalysis: raw,
    isDone: (weekIndex, stepIndex) => plan.itemFor(weekIndex, stepIndex)?.done ?? false,
    items: plan.items,
  })

  if (steps.length > 0) {
    return <PlanStepsList steps={steps} rawAnalysis={raw} title={t('planSteps.contactTitle', { firstName })} />
  }

  // Rien à proposer sans canal : la génération refuserait (`contact_no_reachable_channel`) — on ne montre pas le geste.
  if (!contact.email && !contact.phone && !contact.linkedin_url) return null

  return (
    <Card>
      <CardContent className="flex p-4">
        <Button
          type="button"
          variant="outline"
          icon={ClipboardList}
          iconPosition="left"
          className="min-h-11"
          disabled={prepare.isPending}
          onClick={() => prepare.mutate()}
        >
          {prepare.isPending ? t('planSteps.generating') : t('planSteps.generate', { firstName })}
        </Button>
      </CardContent>
    </Card>
  )
}
