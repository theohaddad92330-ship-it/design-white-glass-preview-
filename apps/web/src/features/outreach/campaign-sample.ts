import { useState } from 'react'
import { apiFetch } from '@/lib/api'

/**
 * #2874 / #2367.17 — L'ÉCHANTILLON AVANT DE VALIDER UNE CAMPAGNE.
 *
 * « Fais-moi un mail pour les cinquante contacts » (#2367, LAU-FINAL-082) ne
 * doit PAS générer cinquante e-mails d'un coup — mais jusqu'ici, rien ne
 * générait non plus le seul qui compte avant de cliquer « Créer » :
 * `prepare_campaign` (`apps/ia/app/services/chat_tools.py:3902-4038`) déduplique,
 * exclut les contacts écartés (en les nommant) et plafonne à 25, puis rend une
 * PROPOSITION — jamais un message rédigé (registre #2367.17).
 *
 * L'épopée #2874 décrit deux voies, ni l'une ni l'autre bâtie : un appel
 * modèle SUPPLÉMENTAIRE au moment de la proposition (coût/latence non cadrés
 * sur un chemin appelé à CHAQUE proposition de campagne), ou un templating
 * déterministe (`message_brief.py` ne rend que des blocs de prompt, pas un
 * message autonome).
 *
 * La troisième voie, retenue ici : réutiliser TEL QUEL le chemin de
 * génération déjà servi au composer (`POST /ia/message`,
 * `resolveGeneratedDraft` dans `contact-engagement/conversation.ts`) —
 * `message_generation` a un poids de CRÉDIT ZÉRO
 * (`packages/contracts/src/billing/credit-weights.ts:94`, action « incluse ») —
 * pour UN SEUL contact réel de l'audience, sur un geste EXPLICITE (le bouton
 * de l'écran Séquences), jamais au chargement de la fenêtre ni à la
 * proposition du chat. Le coût ajouté est donc celui, déjà budgété, d'UN
 * contact — jamais des cinquante.
 *
 * Doctrine c74 (`campaign_label` mono-contact) : l'échantillon montre un
 * message d'un contact RÉEL de la campagne, jamais un contact inventé. Le
 * copilote ne l'envoie jamais : ceci est une lecture avant validation, rien
 * ne part.
 */
type CampaignSample =
  | { state: 'idle' }
  | { state: 'loading'; contactId: string }
  | { state: 'ready'; contactId: string; contactName: string; subject: string; body: string }
  | { state: 'error'; contactId: string }

const IDLE: CampaignSample = { state: 'idle' }

type SampleContact = { id: string; full_name: string }

/**
 * Le premier contact de l'audience pour qui un échantillon e-mail a un sens —
 * celui qui a une adresse. `null` si aucun n'en a : l'écran porte déjà, par
 * contact, le badge « pas d'e-mail » (`audience.noEmail`) — rien à ajouter ici.
 */
export function firstSampleCandidate<T extends { email: string | null }>(contacts: readonly T[]): T | null {
  return contacts.find(contact => Boolean(contact.email)) ?? null
}

/**
 * Un e-mail rédigé par Laura pour UN contact réel (`POST /ia/message`, crédit 0), ou `null` si elle n'a rien rendu :
 * jamais un texte de repli inventé. Partagé par l'échantillon d'une campagne et par l'assistant « Créer une séquence »
 * (Théo C sequences-assistant) — une seule façon de demander un message (GA-26).
 */
export async function requestEmailDraft(
  contactId: string,
  context?: string | null,
): Promise<{ subject: string; body: string } | null> {
  try {
    const res = await apiFetch<
      { success: boolean; data?: { subject?: string; body?: string } },
      { contactId: string; channel: 'email'; context?: string }
    >({
      path: '/ia/message',
      method: 'POST',
      body: { contactId, channel: 'email', context: context?.trim() || undefined },
    })
    if (!res?.success || !res.data?.body) return null
    return { subject: res.data.subject ?? '', body: res.data.body }
  } catch {
    return null
  }
}

/**
 * Génère et garde UN échantillon à la fois. Un nouvel appel remplace le
 * précédent — jamais d'accumulation, jamais deux échantillons en vol qui
 * pourraient résoudre dans le désordre (même garde que `useEngagementConversation`
 * : le dernier appelé gagne).
 */
export function useCampaignSample() {
  const [sample, setSample] = useState<CampaignSample>(IDLE)

  const generate = async (contact: SampleContact, objective?: string | null) => {
    setSample({ state: 'loading', contactId: contact.id })
    const draft = await requestEmailDraft(contact.id, objective)
    setSample(
      draft
        ? {
            state: 'ready',
            contactId: contact.id,
            contactName: contact.full_name,
            subject: draft.subject,
            body: draft.body,
          }
        : { state: 'error', contactId: contact.id },
    )
  }

  const reset = () => setSample(IDLE)

  return { sample, generate, reset }
}
