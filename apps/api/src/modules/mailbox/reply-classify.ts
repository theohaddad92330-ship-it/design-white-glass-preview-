import type { MailMessage, MailThread, OutreachReplyClass } from '@bellum/contracts'
import { looksLikeAutoReply, POSITIVE_MARKERS } from './no-reply'

/**
 * #2381.4 (LAU-FINAL-095) — la classification d'une réponse en l'une des
 * ONZE classes fermées (`OUTREACH_REPLY_CLASSES`), pour que
 * `outreachReplyEffect` (`@bellum/contracts`) en tire une conséquence
 * DÉTERMINISTE — jamais un avis de modèle seul sur les conséquences fortes.
 *
 * Lit `subject` + `snippet` SEULEMENT — jamais le corps complet du message
 * (doctrine, `mailbox.ts` : « ce qu'on ne lit pas ne peut pas fuiter »),
 * exactement le même périmètre que `looksLikeAutoReply`/`selectPositiveReplies`
 * (`no-reply.ts`) : un chemin déjà autorisé, pas un nouveau.
 *
 * Le lexique est un ENSEMBLE FERMÉ, volontairement court. Un texte qui ne
 * correspond à rien tombe sur `neutral` (du contenu existe, aucun signal
 * fort) ou `unknown` (rien d'exploitable) — jamais une classe devinée.
 *
 * ORDRE de reconnaissance : une auto-réponse d'absence est vérifiée EN
 * PREMIER, avant tout le reste — un OOO qui contient par hasard un mot
 * positif ne doit jamais devenir une réponse positive (#2381.5).
 */

const BOUNCE_MARKERS = [
  'undelivered mail returned to sender',
  'mail delivery failed',
  'delivery status notification',
  'undeliverable',
  'échec de la remise',
  'non distribué',
  'non remis',
]

const OPT_OUT_MARKERS = [
  'désinscri',
  'se désabonner',
  'désabonn',
  'retirez-moi',
  'retirer de cette liste',
  'ne plus recevoir',
  'unsubscribe',
  'opt out',
  'opt-out',
  'remove me from',
]

const WRONG_PERSON_MARKERS = [
  "ce n'est plus moi",
  "ce n'est pas moi",
  "n'est plus le bon contact",
  "j'ai quitté l'entreprise",
  'a quitté la société',
  'ne travaille plus',
  'mauvaise personne',
  'mauvais interlocuteur',
  'wrong person',
  'no longer work here',
  'no longer with the company',
  'has left the company',
]

const REFUSAL_MARKERS = [
  'pas intéressé',
  "n'est pas intéressé",
  'ne nous intéresse pas',
  'non merci',
  'sans suite',
  'not interested',
  'no longer interested',
  'we pass',
  'not a fit',
]

const NOT_NOW_MARKERS = [
  'plus tard',
  'pas maintenant',
  'pas le bon moment',
  'recontactez-moi',
  'revenez vers moi dans',
  'maybe later',
  'not right now',
  'not the right time',
  'reach out again in',
]

const ORIENTATION_MARKERS = [
  'contacter plutôt',
  'adressez-vous à',
  'transféré à',
  'plus compétent pour',
  'contact our',
  'contact instead',
  'redirecting you to',
  'please reach out to',
]

function haystackOf(input: { subject: string | null; snippet: string | null }): string {
  return `${input.subject ?? ''} ${input.snippet ?? ''}`.toLowerCase().trim()
}

function includesAny(haystack: string, markers: readonly string[]): boolean {
  return markers.some(marker => haystack.includes(marker))
}

export function classifyReply(input: { subject: string | null; snippet: string | null }): OutreachReplyClass {
  const haystack = haystackOf(input)
  if (!haystack) return 'unknown'

  // #2381.5 — vérifié EN PREMIER : une absence du bureau n'est jamais une
  // réponse commerciale, quoi que le texte contienne par ailleurs.
  if (looksLikeAutoReply(input.subject, input.snippet)) return 'out_of_office'
  if (includesAny(haystack, BOUNCE_MARKERS)) return 'bounce'
  if (includesAny(haystack, OPT_OUT_MARKERS)) return 'opt_out'
  if (includesAny(haystack, WRONG_PERSON_MARKERS)) return 'wrong_person'
  if (includesAny(haystack, REFUSAL_MARKERS)) return 'refusal'
  if (includesAny(haystack, NOT_NOW_MARKERS)) return 'not_now'
  if (includesAny(haystack, ORIENTATION_MARKERS)) return 'orientation'
  if (includesAny(haystack, POSITIVE_MARKERS)) return 'positive'
  if (haystack.includes('?')) return 'question'
  return 'neutral'
}

/**
 * #2381.3/.4 — la classe d'un FIL, à partir de son dernier message ENTRANT
 * (`thread.messages`, déjà transporté par `groupIntoThreads` — #1400, jamais
 * un appel de plus). `null` quand le fil n'est pas une réponse (dernier
 * message SORTANT, ou aucun message transporté) : rien à classifier, rien à
 * arrêter.
 */
export function classifyThread(thread: Pick<MailThread, 'lastDirection' | 'messages'>): OutreachReplyClass | null {
  if (thread.lastDirection !== 'inbound') return null
  const messages = thread.messages ?? []
  const lastInbound = [...messages].reverse().find((m: MailMessage) => m.direction === 'inbound')
  if (!lastInbound) return null
  return classifyReply({ subject: lastInbound.subject, snippet: lastInbound.snippet })
}
