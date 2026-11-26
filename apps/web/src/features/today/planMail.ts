import { apiFetch } from '@/lib/api'
import type { TodayItem } from './todayQueue'

/** #4521.3 — la consigne d'une carte du plan est ce que le moteur de rédaction lit comme « angle » (2000 max). */
const CONTEXT_MAX = 2000
const SIGNAL_MAX = 300

type PlanMailDraft = { subject: string | null; body: string }

/**
 * #4521.3 — « Générer le mail » ne s'offre que sur une carte e-mail ISSUE DU PLAN dont le contact est résolu :
 * sans contact, le moteur n'a personne à qui écrire (rien d'inventé, la carte garde ses gestes de base).
 */
export function canGenerateMail(item: TodayItem): boolean {
  return item.kind === 'plan_item' && item.channel === 'email' && item.contactId !== null
}

/**
 * #4521.3 — le brouillon d'UN mail, à la demande : le moteur de rédaction DÉJÀ servi au composer et aux séquences
 * (`POST /ia/message`, crédit zéro — `prepare-email-draft.ts`, #3702). Aucun nouveau prompt : la consigne du plan
 * fait l'angle, le signal cité va dans son paramètre. Rien n'est enregistré ni envoyé : le brouillon vit dans la
 * carte, le commercial le relit, le copie et envoie lui-même (c82).
 */
export async function generatePlanMail(item: TodayItem): Promise<PlanMailDraft> {
  if (!canGenerateMail(item) || !item.contactId) throw new Error('plan_mail_not_available')
  const res = await apiFetch<
    { success: boolean; data?: { subject?: string; body?: string } },
    { contactId: string; channel: 'email'; context?: string; parameters?: { signal: string } }
  >({
    path: '/ia/message',
    method: 'POST',
    body: {
      contactId: item.contactId,
      channel: 'email',
      context: item.title.trim().slice(0, CONTEXT_MAX) || undefined,
      ...(item.signal ? { parameters: { signal: item.signal.text.slice(0, SIGNAL_MAX) } } : {}),
    },
  })
  const body = res?.success ? res.data?.body?.trim() : ''
  if (!body) throw new Error('plan_mail_generation_failed')
  return { subject: res.data?.subject?.trim() || null, body }
}
