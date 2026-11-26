import { PLAYBOOK_ENGINE_CHANNEL, type OutreachStepKind } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import type { StepDraft } from './playbooks'

/**
 * Lot L-C (#4166) — LAURA PRÉPARE LE MESSAGE D'UNE ÉTAPE.
 *
 * Le moteur de rédaction existant (`POST /ia/message`, déjà servi au composer et
 * à `prepareEmailDraft`) : aucun second moteur. Une invitation LinkedIn part
 * SANS note (le modèle le dit) ; une tâche ne se rédige pas. Un échec rend
 * `null` : l'étape reste vide, l'utilisateur écrit ou laisse — jamais un texte
 * de repli inventé. Rien n'est écrit sur le contact, rien n'est envoyé.
 */

export async function prepareStepMessage(input: {
  contactId: string
  kind: OutreachStepKind
  context: string
}): Promise<StepDraft | null> {
  const channel = PLAYBOOK_ENGINE_CHANNEL[input.kind]
  if (!channel) return null
  try {
    const res = await apiFetch<
      { success: boolean; data?: { subject?: string; body?: string } },
      { contactId: string; channel: 'email' | 'linkedin' | 'phone'; context: string }
    >({
      path: '/ia/message',
      method: 'POST',
      body: { contactId: input.contactId, channel, context: input.context },
    })
    const body = res?.data?.body?.trim()
    if (!res?.success || !body) return null
    return { subject: channel === 'email' ? (res.data?.subject?.trim() ?? '') : '', body }
  } catch {
    return null
  }
}
