import {
  resolveSequenceVariables,
  type CreateOutreachStepInput,
  type SequenceBlockedStep,
  type SequenceBlockedVariable,
  type SequenceTemplateStep,
} from '@bellum/contracts'

/**
 * #3756.2/.3 — préparer les étapes d'un modèle pour UN contact. Fonctions PURES.
 *
 * Le copilote PRÉPARE (brouillon résolu), le commercial envoie : rien ici n'envoie.
 */

type VariableValues = {
  firstName: string | null
  lastName: string | null
  companyName: string | null
  signature: string | null
  jobTitle: string | null
}

/**
 * Valeurs des variables depuis le contact, son compte et le profil vendeur.
 * Le contact ne porte qu'un nom COMPLET : prénom = premier mot, nom = le
 * reste, à partir de deux mots. Un nom en un seul mot ne dit pas s'il s'agit
 * du prénom ou du nom — ni l'un ni l'autre n'est deviné (l'étape se bloque).
 */
export function contactVariableValues(
  contact: { full_name: string | null; title: string | null },
  companyName: string | null,
  signature: string | null,
): VariableValues {
  const words = (contact.full_name ?? '').trim().split(/\s+/).filter(Boolean)
  const named = words.length >= 2
  return {
    firstName: named ? (words[0] ?? null) : null,
    lastName: named ? words.slice(1).join(' ') : null,
    companyName: companyName?.trim() || null,
    signature: signature?.trim() || null,
    jobTitle: contact.title?.trim() || null,
  }
}

export function prepareTemplateSteps(
  template: { name: string; steps: readonly SequenceTemplateStep[] },
  values: VariableValues,
): { steps: CreateOutreachStepInput[]; blockedSteps: SequenceBlockedStep[] } {
  const steps: CreateOutreachStepInput[] = []
  const blockedSteps: SequenceBlockedStep[] = []
  for (const step of template.steps) {
    const label = `${template.name} — étape ${step.position + 1} (J+${step.delay_days})`
    const subject = resolveSequenceVariables(step.subject, values)
    const body = resolveSequenceVariables(step.body, values)
    const blocked: SequenceBlockedVariable[] = []
    for (const part of [subject, body]) {
      if (part.ok) continue
      for (const b of part.blocked) if (!blocked.some(x => x.variable === b.variable)) blocked.push(b)
    }
    if (subject.ok && body.ok) {
      steps.push({
        kind: 'email',
        offset_days: step.delay_days,
        label,
        draft: { subject: subject.text, body: body.text },
      })
    } else {
      steps.push({ kind: 'email', offset_days: step.delay_days, label, blocked_variables: blocked.map(b => b.message) })
      blockedSteps.push({ position: step.position, blocked })
    }
  }
  return { steps, blockedSteps }
}
