import type { TodayItem } from './todayQueue'

/**
 * Lot L-A (#4164) — LE MODE RAFALE : la machine d'état et les raccourcis, purs.
 *
 * Le panneau plein écran montre UNE carte à la fois d'un paquet figé à
 * l'ouverture (un groupe d'une section). Le paquet est une liste d'identifiants
 * qui NE BOUGE PAS pendant la rafale : traiter une carte la fait sortir de la
 * file côté serveur, mais pas du paquet — la progression « 3/12 » reste donc
 * stable sous les yeux. Ce fichier ne sait rien d'une maison native : le geste
 * qui écrit (valider, cocher, reporter) est exécuté par l'appelant, puis
 * `handled` en prend acte ici.
 */

type BurstOutcome = 'done' | 'validated' | 'postponed' | 'skipped'

export type BurstState = {
  index: number
  handled: Record<string, BurstOutcome>
  editing: boolean
  helpOpen: boolean
  /** Toutes les cartes sont traitées. */
  finished: boolean
  /** L'utilisateur a quitté (Échap). */
  exited: boolean
}

type BurstEvent =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'handled'; id: string; outcome: BurstOutcome }
  | { type: 'edit' }
  | { type: 'stopEdit' }
  | { type: 'help' }
  | { type: 'exit' }

export function initialBurst(): BurstState {
  return { index: 0, handled: {}, editing: false, helpOpen: false, finished: false, exited: false }
}

export function reduceBurst(state: BurstState, event: BurstEvent, deck: readonly string[]): BurstState {
  const last = Math.max(deck.length - 1, 0)
  switch (event.type) {
    case 'next':
      return { ...state, index: Math.min(state.index + 1, last), editing: false }
    case 'prev':
      return { ...state, index: Math.max(state.index - 1, 0), editing: false }
    case 'edit':
      return { ...state, editing: true }
    case 'stopEdit':
      return { ...state, editing: false }
    case 'help':
      return { ...state, helpOpen: !state.helpOpen }
    case 'exit':
      // Échap défait d'abord la couche la plus proche : l'aide, puis l'édition, puis la rafale.
      if (state.helpOpen) return { ...state, helpOpen: false }
      if (state.editing) return { ...state, editing: false }
      return { ...state, exited: true }
    case 'handled': {
      const handled = { ...state.handled, [event.id]: event.outcome }
      const at = deck.indexOf(event.id)
      const from = at < 0 ? state.index : at
      // La prochaine carte non traitée APRÈS celle-ci, sinon la première non traitée avant.
      const after = deck.findIndex((id, position) => position > from && !handled[id])
      const before = deck.findIndex(id => !handled[id])
      const next = after >= 0 ? after : before
      return next < 0
        ? { ...state, handled, editing: false, finished: true }
        : { ...state, handled, index: next, editing: false }
    }
  }
}

export function burstProgress(state: BurstState, total: number): { current: number; total: number; handled: number } {
  return {
    current: total === 0 ? 0 : Math.min(state.index + 1, total),
    total,
    handled: Object.keys(state.handled).length,
  }
}

export type BurstCommand = 'next' | 'prev' | 'edit' | 'primary' | 'postpone' | 'skip' | 'help' | 'exit'

type KeyInput = {
  key: string
  ctrl: boolean
  meta: boolean
  alt: boolean
  /** Où le clavier est posé : un champ de saisie, un bouton/lien, ou ailleurs. */
  target: 'editable' | 'interactive' | 'other'
}

const LETTER_COMMANDS: Record<string, BurstCommand> = {
  j: 'next',
  k: 'prev',
  e: 'edit',
  s: 'postpone',
  x: 'skip',
}

export function keyToBurstCommand(input: KeyInput): BurstCommand | null {
  const withModifier = input.ctrl || input.meta
  if (input.key === 'Escape') return 'exit'
  if (input.key === 'Enter') {
    if (input.target === 'editable') return withModifier ? 'primary' : null
    // Sur un bouton ou un lien, Entrée est déjà son clic : ne jamais le doubler.
    return input.target === 'interactive' ? null : 'primary'
  }
  if (input.target === 'editable' || withModifier || input.alt) return null
  if (input.key === '?') return 'help'
  return LETTER_COMMANDS[input.key.toLowerCase()] ?? null
}

export type BurstPrimary = 'validate' | 'copyOpen' | 'done'

/** Les natures dont « valider » FAIT PARTIR un message vers quelqu'un. */
const OUTWARD_KINDS: readonly TodayItem['kind'][] = ['message', 'playbook_send']

/**
 * Ce que fait Entrée sur la carte courante — et ce qu'elle ne fait JAMAIS.
 *
 * Doctrine c82 (« le copilote prépare, le commercial envoie ») : le geste final
 * de la rafale n'envoie jamais tout seul. « Valider » un message ou un envoi de
 * playbook n'est donc proposé à Entrée que sous un MANDAT signé (le dispatcher
 * n'envoie qu'à cette condition, c'est lui qui porte l'envoi) ; sans mandat,
 * Entrée copie le brouillon et ouvre la messagerie — le commercial envoie lui-même.
 * Les approbations et écritures CRM/ERP n'envoient aucun message : elles se
 * valident. `opened` : le brouillon a déjà été copié et ouvert, le geste suivant
 * est de marquer FAIT (déclaratif, c73 — jamais une preuve d'envoi).
 */
export function burstPrimary(item: TodayItem, context: { hasMandate: boolean; opened: boolean }): BurstPrimary | null {
  const canCopyOpen = item.draft !== null && (item.channel === 'email' || item.channel === 'linkedin')
  if (item.gestures.validate) {
    if (!OUTWARD_KINDS.includes(item.kind)) return 'validate'
    if (context.hasMandate) return 'validate'
    return canCopyOpen ? 'copyOpen' : null
  }
  if (item.gestures.done) {
    return canCopyOpen && !context.opened ? 'copyOpen' : 'done'
  }
  return null
}

type BurstChannel = NonNullable<TodayItem['channel']>
const CHANNEL_ORDER: readonly BurstChannel[] = ['email', 'linkedin', 'phone']

/** Une personne visée par le lot : l'identité sert à la dédoublonner, le nom à la NOMMER. */
type BurstRecipient = { key: string; name: string | null; accountName: string | null }

export type BurstSummary = {
  total: number
  /** Personnes DISTINCTES visées — `null` quand aucune carte du lot ne nomme de destinataire (jamais « 0 », GA-18). */
  recipients: number | null
  /** Les cartes dont on ne sait PAS à qui elles vont : le récap les dit, il ne les efface pas. */
  unnamed: number
  /** Les canaux PRÉSENTS dans le lot ; un canal absent ne fait aucune ligne. `people` = qui y reçoit quelque chose. */
  channels: { channel: BurstChannel; count: number; people: BurstRecipient[]; unnamed: number }[]
  /** Les cartes dont la validation fait partir un message vers quelqu'un. */
  outward: number
  /** Le premier brouillon du lot, montré comme texte TYPE (chaque message reste rédigé pour son destinataire). */
  sample: { subject: string | null; body: string } | null
}

/**
 * F1-FIX #4354 — L'IDENTITÉ D'UN DESTINATAIRE : l'identifiant du contact, sinon l'adresse, sinon le NOM.
 *
 * Recette prod 20/10 : « 89 actions · 1 destinataire / E-mail : 89 » alors que les e-mails partaient à
 * Frederic, Steve Anavi, Enrique Martinez… Cause : on ne comptait que `contactId ?? recipient` ; une carte
 * qui porte le nom du contact sans son identifiant (ou aucun des deux) ne comptait pour PERSONNE, donc le
 * « 1 » ne mesurait que les cartes identifiées. Le nom normalisé est maintenant une identité de dernier
 * recours, et ce qui reste anonyme est DIT (`unnamed`) au lieu d'être tu.
 */
function recipientOf(item: TodayItem): BurstRecipient | null {
  const name = item.contactName?.trim() || null
  const key = item.contactId ?? item.recipient ?? (name ? `name:${name.toLowerCase()}` : null)
  return key ? { key, name: name ?? item.recipient, accountName: item.accountName } : null
}

function distinctPeople(items: readonly TodayItem[]): BurstRecipient[] {
  const byKey = new Map<string, BurstRecipient>()
  for (const item of items) {
    const person = recipientOf(item)
    if (!person) continue
    const known = byKey.get(person.key)
    // Le premier nom connu gagne, mais un nom ne se perd pas quand une carte suivante n'en porte pas.
    if (!known) byKey.set(person.key, person)
    else if (!known.name && person.name) byKey.set(person.key, { ...known, name: person.name })
  }
  return [...byKey.values()]
}

/** Au-delà de `limit` personnes la liste se replie ; ce qui est caché est COMPTÉ (« + 3 autres »). */
export function foldRecipients<T>(people: readonly T[], limit: number): { shown: T[]; hidden: number } {
  return { shown: people.slice(0, limit), hidden: Math.max(people.length - limit, 0) }
}

/**
 * #4354.1 — « Est-ce que tous ces gens vont recevoir un mail ? » : ce que le lot contient, AVANT de le
 * traiter. Lu sur le paquet figé à l'ouverture, jamais recalculé pendant la rafale.
 */
export function summarizeBurst(deck: readonly TodayItem[]): BurstSummary {
  const people = distinctPeople(deck)
  return {
    total: deck.length,
    recipients: people.length > 0 ? people.length : null,
    unnamed: deck.filter(item => recipientOf(item) === null).length,
    channels: CHANNEL_ORDER.flatMap(channel => {
      const items = deck.filter(item => item.channel === channel)
      return items.length > 0
        ? [
            {
              channel,
              count: items.length,
              people: distinctPeople(items),
              unnamed: items.filter(item => recipientOf(item) === null).length,
            },
          ]
        : []
    }),
    outward: deck.filter(item => OUTWARD_KINDS.includes(item.kind)).length,
    sample: deck.find(item => item.draft !== null)?.draft ?? null,
  }
}
