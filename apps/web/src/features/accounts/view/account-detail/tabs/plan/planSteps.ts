import type { ActionPlanItem, Contact } from '@bellum/contracts'
import { findContactByName, MANUAL_ACTION_WEEK_INDEX, NEXT_ACTIONS_MAX } from '@bellum/contracts'
import { buildContactMessage, getInitialDraft } from '../../components/contact-engagement/message'
import type { PlanWeek } from '../../helpers/plan'

/** Les trois canaux qu'une étape sait PRÉPARER ; un autre (événement, contenu) n'a pas de message à écrire. */
export type PlanStepChannel = 'email' | 'linkedin' | 'phone'

export type PlanStepView = {
  /** 1, 2, 3 — le rang AFFICHÉ, pas la position dans le plan. */
  number: number
  /** La position réelle dans le plan : la clé d'état (fait / pas fait) du tableau. */
  weekIndex: number
  stepIndex: number
  label: string
  channel: PlanStepChannel
  /** Nom complet en clair, tel que le plan le nomme. */
  recipient: string
  /** Le contact connu qui porte ce nom — `null` si le plan nomme quelqu'un que le compte n'a pas enrichi. */
  contact: Contact | null
  /** Le message prêt ; `''` quand l'analyse n'en porte pas (rien d'inventé). */
  message: string
  /**
   * #4399.6 — le numéro de l'étape qui porte DÉJÀ ce même message (même contact, même canal) : l'affichage le
   * renvoie à elle au lieu de le réécrire. `message` reste porté (« Préparer » / « Copier » s'en servent).
   */
  sameMessageAs?: number
}

/**
 * #4399.6 — la cause : le message prêt ne dépend que du contact et du canal ; deux étapes du même contact sur
 * le même canal affichaient donc le même texte mot pour mot. Un message vide n'est jamais « le même ».
 */
function flagRepeatedMessages(steps: PlanStepView[]): PlanStepView[] {
  const seen = new Map<string, number>()
  return steps.map(step => {
    const text = step.message.trim()
    if (!text) return step
    const key = `${step.channel}\u0000${text}`
    const first = seen.get(key)
    if (first === undefined) {
      seen.set(key, step.number)
      return step
    }
    return { ...step, sameMessageAs: first }
  })
}

function channelOf(tool: string | undefined): PlanStepChannel | null {
  const value = tool?.toLowerCase() ?? ''
  if (value.includes('linkedin')) return 'linkedin'
  if (value.includes('email') || value.includes('mail')) return 'email'
  if (value.includes('phone') || value.includes('tel') || value.includes('appel') || value.includes('call'))
    return 'phone'
  return null
}

/**
 * #4415.1 — les étapes à mettre EN TÊTE de l'onglet Plan : les prochaines
 * actions OUVERTES du plan, dans l'ordre du plan, au plus {@link NEXT_ACTIONS_MAX}.
 * Aucune génération : on relit ce que le plan porte déjà.
 *
 * Une étape sans canal préparable ou sans destinataire nommé est écartée — elle
 * reste lisible dans le détail replié du plan. `onlyContactId` (#4416) restreint
 * aux étapes qui visent CE contact, avec la même numérotation.
 */
export function selectPlanSteps({
  weeks,
  contacts,
  rawAnalysis,
  isDone,
  onlyContactId,
  limit = NEXT_ACTIONS_MAX,
}: {
  weeks: PlanWeek[]
  contacts: readonly Contact[]
  rawAnalysis: Record<string, unknown>
  isDone: (weekIndex: number, stepIndex: number) => boolean
  onlyContactId?: string
  limit?: number
}): PlanStepView[] {
  const steps: PlanStepView[] = []
  for (const [weekIndex, week] of weeks.entries()) {
    for (const [stepIndex, item] of week.items.entries()) {
      if (steps.length >= limit) return steps
      const channel = channelOf(item.outil)
      const recipient = item.responsable?.trim() ?? ''
      if (!channel || !recipient || isDone(weekIndex, stepIndex)) continue
      // #4415.2 — un nom écrit autrement par le plan (casse, rôle) ne doit pas retirer « Préparer » de l'étape.
      const contact = findContactByName(contacts, recipient)
      if (onlyContactId && contact?.id !== onlyContactId) continue
      steps.push({
        number: steps.length + 1,
        weekIndex,
        stepIndex,
        label: item.text,
        channel,
        recipient,
        contact,
        message: contact ? getInitialDraft(channel, buildContactMessage(contact, rawAnalysis)) : '',
      })
    }
  }
  return flagRepeatedMessages(steps)
}

/**
 * #4416 — les étapes du plan DU COMPTE qui visent ce contact : celles du plan généré qui le nomment, puis les
 * lignes rangées pour lui (« Préparer un plan pour <prénom> », bande manuelle). Un seul plan, deux endroits
 * où il s'écrit, une seule liste ici. Même forme d'étape que l'onglet Plan, renumérotée, au plus
 * {@link NEXT_ACTIONS_MAX} — jamais une liste vide inventée : `[]` veut dire « aucune étape ».
 */
export function selectContactPlanSteps({
  weeks,
  contact,
  rawAnalysis,
  isDone,
  items,
  limit = NEXT_ACTIONS_MAX,
}: {
  weeks: PlanWeek[]
  contact: Contact
  rawAnalysis: Record<string, unknown>
  isDone: (weekIndex: number, stepIndex: number) => boolean
  items: readonly ActionPlanItem[]
  limit?: number
}): PlanStepView[] {
  const generated = selectPlanSteps({
    weeks,
    contacts: [contact],
    rawAnalysis,
    isDone,
    onlyContactId: contact.id,
    limit,
  })
  const message = buildContactMessage(contact, rawAnalysis)
  const filed: PlanStepView[] = []
  for (const item of items) {
    const channel =
      item.channel === 'email' || item.channel === 'linkedin' || item.channel === 'phone' ? item.channel : null
    if (!channel || item.done || item.contact_id !== contact.id || item.week_index < MANUAL_ACTION_WEEK_INDEX) continue
    filed.push({
      number: 0,
      weekIndex: item.week_index,
      stepIndex: item.step_index,
      label: item.label,
      channel,
      recipient: contact.full_name,
      contact,
      message: getInitialDraft(channel, message),
    })
  }
  return flagRepeatedMessages(
    [...generated, ...filed]
      .slice(0, limit)
      .map((step, index) => ({ ...step, number: index + 1, sameMessageAs: undefined })),
  )
}
