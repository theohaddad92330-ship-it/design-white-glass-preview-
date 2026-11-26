import { describe, expect, it } from 'vitest'
import { resources } from './resources'

/**
 * « Brouillon » et « message préparé » ne sont pas synonymes (PDF 1 §13, PDF 5
 * §7.4, PDF 9 §6.4).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA DISTINCTION, ET POURQUOI ELLE COÛTE CHER
 * ─────────────────────────────────────────────────────────────────────────
 * Un **brouillon** est un objet qui existe DANS la messagerie de l'utilisateur.
 * Il s'ouvre depuis son client, il survit à Bellum, et le lien qu'on lui donne
 * mène quelque part. Un **message préparé** vit chez nous et n'existe nulle part
 * ailleurs tant que personne ne l'a envoyé.
 *
 * Dire « brouillon » pour le second promet un objet qui n'existe pas : quelqu'un
 * ouvre sa boîte, cherche, ne trouve rien, et en conclut que le produit a raté
 * un envoi. C'est le mode d'échec le plus coûteux qui soit — il ne se voit pas
 * dans les logs, il se voit chez le client qui n'a rien reçu.
 *
 * Le cas limite qui a fait écrire la règle : une **messagerie d'équipe n'a
 * aucune notion de brouillon**. Le message part, ou il ne part pas. D'où
 * « on ne dit JAMAIS brouillon Teams » (PDF 1 §13, conséquence n°1).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Elle n'interdit PAS le mot. Un vrai brouillon est livré (`mailbox.*`, l'outil
 * `prepare_mail_draft` du copilote, les portées OAuth de Réglages ›
 * Intégrations) et doit continuer de s'appeler par son nom. Une garde qui
 * bannirait « brouillon » partout casserait le jour où un second connecteur de
 * messagerie arriverait — et deux gardes de ce dépôt ont déjà dû être
 * rétrécies pour avoir gardé trop large.
 *
 * Elle refuse trois choses précises :
 *  1. un brouillon annoncé comme vivant DANS Bellum — contradiction dans les
 *     termes ;
 *  2. un brouillon accolé à un canal qui n'en a pas (messagerie d'équipe,
 *     LinkedIn, script d'appel), sauf pour le NIER ;
 *  3. le mot sur les surfaces NOMMÉES ci-dessous, dont on sait que l'objet
 *     produit reste chez nous.
 *
 * Et elle prouve qu'elle voit quelque chose : taille du corpus, présence des
 * deux langues, et résolution effective de chaque clé nommée — une clé renommée
 * fait ROUGIR la garde au lieu de la rendre aveugle.
 */

/** `namespace.chemin.de.clé` → texte, pour pouvoir nommer le coupable. */
function flatten(value: unknown, path: string, out: Map<string, string>): void {
  if (typeof value === 'string') {
    out.set(path, value)
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, path ? `${path}.${key}` : key, out)
    }
  }
}

const ALL_STRINGS: Map<string, string> = (() => {
  const out = new Map<string, string>()
  for (const [locale, namespaces] of Object.entries(resources)) {
    flatten(namespaces, locale, out)
  }
  return out
})()

const LOCALES = ['fr', 'en'] as const

/**
 * Les balises `<draft>…</draft>` d'un `<Trans>` portent un nom de composant, pas
 * un mot lu par quelqu'un. Les laisser dans le texte ferait échouer une phrase
 * parfaitement corrigée — c'est le genre de faux rouge qui pousse à désactiver
 * une garde plutôt qu'à la lire.
 */
function readable(text: string): string {
  return text.replace(/<\/?[^>]*>/g, ' ')
}

/** Le mot « brouillon », dans les deux langues. */
const DRAFT_WORD = /\b(?:brouillons?|drafts?)\b/gi

/**
 * « Draft » est aussi un VERBE en anglais — « Draft an email », « anything she
 * drafts ». Un impératif en tête de libellé ou un verbe conjugué ne promet aucun
 * objet ; le confondre avec le nom ferait refuser des phrases justes.
 */
const EN_VERB_BEFORE = /\b(?:to|she|he|they|we|i|you|laura|and|or|please)\s+$/i

function isVerbUsage(text: string, index: number): boolean {
  if (!/^drafts?$/i.test(text.slice(index).match(/^\w+/)?.[0] ?? '')) return false
  if (index === 0) return true
  return EN_VERB_BEFORE.test(text.slice(Math.max(0, index - 10), index))
}

/**
 * Les canaux qui n'ont PAS de brouillon. La messagerie d'équipe d'abord — c'est
 * le cas nommé par le document — puis les deux autres qui n'en ont pas non
 * plus : un message LinkedIn et un script d'appel ne se déposent nulle part.
 */
const NO_DRAFT_CHANNEL =
  /messagerie\s+d[’']équipe|team\s+chat|\bteams\b|\bslack\b|\bdiscord\b|\bmattermost\b|google\s?chat|\blinkedin\b|script\s+d[’']appel|call\s+script/i

/** « Aucun brouillon », « has no draft » : la phrase honnête, à laisser passer. */
const NEGATION = /\b(?:aucun|aucune|jamais|sans|pas|plus|ni)\b|\b(?:no|not|never|without)\b/i
const NEGATION_WINDOW = 30

/** Un brouillon annoncé comme vivant DANS Bellum : contradiction dans les termes. */
const DRAFT_INSIDE_BELLUM =
  /\b(?:brouillons?|drafts?)\b[^.!?]{0,40}\b(?:dans|in|inside|au\s+sein\s+de)\s+bellum|\b(?:dans|in|inside|au\s+sein\s+de)\s+bellum[^.!?]{0,40}\b(?:brouillons?|drafts?)\b/i

function draftOccurrences(text: string): number[] {
  const found: number[] = []
  for (const match of text.matchAll(DRAFT_WORD)) {
    const index = match.index ?? 0
    if (isVerbUsage(text, index)) continue
    found.push(index)
  }
  return found
}

/** Le mot est-il accolé à un canal sans brouillon, sans le NIER ? */
function promisesDraftOnADraftlessChannel(raw: string): boolean {
  const text = readable(raw)
  return draftOccurrences(text).some(index => {
    const window = text.slice(Math.max(0, index - 70), index + 70)
    if (!NO_DRAFT_CHANNEL.test(window)) return false
    const before = text.slice(Math.max(0, index - NEGATION_WINDOW), index)
    return !NEGATION.test(before)
  })
}

function claimsDraftInsideBellum(raw: string): boolean {
  return DRAFT_INSIDE_BELLUM.test(readable(raw))
}

function mentionsDraft(raw: string): boolean {
  return draftOccurrences(readable(raw)).length > 0
}

/**
 * LES SURFACES QUI PRÉPARENT, ET NE DÉPOSENT RIEN.
 *
 * Chacune a été vérifiée dans le code, pas devinée :
 *  - `chat.pending.*` — l'action `prepare_message` du copilote. `PendingActions`
 *    AFFICHE le texte et propose de le COPIER ; aucun appel de messagerie n'est
 *    fait. (L'outil `prepare_mail_draft`, lui, dépose vraiment — ses clés
 *    `*MailDraft*` restent donc hors de cette liste.)
 *  - `contacts.bulkSend.*` — l'envoi groupé part du champ `email_message`
 *    stocké chez nous, jamais d'un brouillon de la boîte.
 *  - `outreach.dialog.description` — une étape e-mail recopie `email_message`
 *    dans le payload de l'étape (`outreach.service.ts`) ; rien n'atteint la
 *    messagerie, et le statut d'affichage `ready_to_copy` le dit.
 *
 * Le jour où l'une de ces surfaces déposera un VRAI brouillon, on retire sa
 * ligne — et le retrait sera une décision écrite, pas un oubli.
 */
const PREPARED_MESSAGE_KEYS = [
  'chat.pending.describeMessage.email',
  'chat.pending.describeMessage.linkedin',
  'chat.pending.describeMessage.phone',
  'chat.pending.confirmMessage',
  'chat.pending.copied',
  'chat.pending.draftOnly',
  'chat.pending.writesDraftOnly',
  'contacts.bulkSend.description',
  'contacts.bulkSend.skipReasons.no_draft',
  'outreach.dialog.description',
] as const

/**
 * LES SURFACES QUI DÉPOSENT VRAIMENT UN BROUILLON.
 *
 * Elles doivent CONTINUER de dire « brouillon » : c'est le mot juste, et la
 * garde doit le prouver. Sans ce bloc, rien ne distinguerait cette garde d'une
 * interdiction pure et simple du mot — laquelle serait fausse.
 */
const REAL_DRAFT_KEYS = [
  'mailbox.draft.description',
  'mailbox.contactCompose.draftExplain',
  'chat.pending.guaranteeMailDraft',
  'chat.pending.writesMailDraft',
  'missions.channel.mailDraft.action',
  'missions.channel.mailDraft.confirmation',
] as const

function read(locale: (typeof LOCALES)[number], key: string): string | undefined {
  return ALL_STRINGS.get(`${locale}.${key}`)
}

/**
 * Le changelog RACONTE, il ne promet pas.
 *
 * Ses entrées sont datées et décrivent ce qui a été corrigé — « un brouillon
 * annoncé sans vérifier que ta messagerie l'autorise » est le récit d'un défaut
 * réparé, pas une promesse tenue aujourd'hui. Le soumettre aux deux règles
 * textuelles obligerait à réécrire l'histoire pour faire passer un test, ce qui
 * est exactement l'inverse de ce qu'un journal sert à faire.
 *
 * L'exemption porte sur UN namespace, et les tests vérifient plus bas que le
 * corpus restant est encore massif : une exemption qui viderait la garde se
 * verrait.
 */
const NARRATIVE_NAMESPACE = /^(?:fr|en)\.changelog\./

function screenStrings(locale: (typeof LOCALES)[number]): [string, string][] {
  return [...ALL_STRINGS.entries()].filter(([key]) => key.startsWith(`${locale}.`) && !NARRATIVE_NAMESPACE.test(key))
}

describe('brouillon réel vs message préparé (PDF 1 §13)', () => {
  it('lit un corpus RÉEL — sinon la garde ne prouve rien', () => {
    expect(ALL_STRINGS.size).toBeGreaterThan(2000)
    expect([...ALL_STRINGS.keys()].filter(key => key.startsWith('fr.')).length).toBeGreaterThan(1000)
    expect([...ALL_STRINGS.keys()].filter(key => key.startsWith('en.')).length).toBeGreaterThan(1000)
    // Le corpus contient bien le mot surveillé : une garde qui cherche un mot
    // absent partout est verte pour la mauvaise raison.
    expect([...ALL_STRINGS.values()].filter(mentionsDraft).length).toBeGreaterThan(10)
    // L'exemption du changelog ne doit pas vider la garde : ce qui reste
    // examiné est l'essentiel des écrans, dans les deux langues.
    for (const locale of LOCALES) {
      expect(screenStrings(locale).length).toBeGreaterThan(1000)
      expect(screenStrings(locale).filter(([, text]) => mentionsDraft(text)).length).toBeGreaterThan(5)
    }
  })

  it('résout chaque clé qu’elle surveille, dans les deux langues', () => {
    // Un renommage de clé rendrait la surveillance muette. Ici il la fait
    // ROUGIR : c'est la différence entre une garde et un commentaire.
    const missing: string[] = []
    for (const locale of LOCALES) {
      for (const key of [...PREPARED_MESSAGE_KEYS, ...REAL_DRAFT_KEYS]) {
        const text = read(locale, key)
        if (!text || !text.trim()) missing.push(`${locale}.${key}`)
      }
    }
    expect(missing).toEqual([])
  })

  it.each(LOCALES)('%s — aucun brouillon annoncé comme vivant DANS Bellum', locale => {
    const offenders = screenStrings(locale)
      .filter(([, text]) => claimsDraftInsideBellum(text))
      .map(([key, text]) => `${key} → « ${text.slice(0, 140)} »`)

    expect(
      offenders,
      '\nUn brouillon est un objet DE LA MESSAGERIE. « Un brouillon dans Bellum » est une ' +
        'contradiction : ce qui vit chez nous est un MESSAGE PRÉPARÉ, et quelqu’un qui lit ' +
        '« brouillon » ira le chercher dans sa boîte.\n\nLibellés fautifs :\n' +
        offenders.join('\n') +
        '\n',
    ).toEqual([])
  })

  it.each(LOCALES)('%s — jamais « brouillon » sur un canal qui n’en a pas', locale => {
    const offenders = screenStrings(locale)
      .filter(([, text]) => promisesDraftOnADraftlessChannel(text))
      .map(([key, text]) => `${key} → « ${text.slice(0, 140)} »`)

    expect(
      offenders,
      '\nUne messagerie d’équipe n’a AUCUNE notion de brouillon : le message part, ou il ne part ' +
        'pas (PDF 1 §13, conséquence n°1 — « on ne dit jamais brouillon Teams »). Un message ' +
        'LinkedIn et un script d’appel non plus. Dire « message préparé », ou NIER le brouillon.' +
        '\n\nLibellés fautifs :\n' +
        offenders.join('\n') +
        '\n',
    ).toEqual([])
  })

  it.each(LOCALES)('%s — les surfaces qui PRÉPARENT ne disent pas « brouillon »', locale => {
    const offenders = PREPARED_MESSAGE_KEYS.filter(key => mentionsDraft(read(locale, key) ?? '')).map(
      key => `${locale}.${key} → « ${read(locale, key)} »`,
    )

    expect(
      offenders,
      '\nCes surfaces produisent un message qui reste DANS Bellum — vérifié dans le code, pas ' +
        'supposé. Rien n’atteint la messagerie, donc rien ne s’appelle « brouillon » : ' +
        'l’utilisateur le chercherait dans sa boîte et ne le trouverait pas.\n\nLibellés fautifs :\n' +
        offenders.join('\n') +
        '\n',
    ).toEqual([])
  })

  it.each(LOCALES)('%s — un VRAI brouillon garde son nom (la garde n’interdit pas le mot)', locale => {
    // Le contre-poids du test précédent. Une garde qui bannirait « brouillon »
    // partout serait fausse : le dépôt DÉPOSE de vrais brouillons.
    for (const key of REAL_DRAFT_KEYS) {
      const text = read(locale, key) ?? ''
      expect(mentionsDraft(text), `${locale}.${key} devrait parler de brouillon : « ${text} »`).toBe(true)
      expect(claimsDraftInsideBellum(text), `${locale}.${key}`).toBe(false)
      expect(promisesDraftOnADraftlessChannel(text), `${locale}.${key}`).toBe(false)
    }
  })

  it.each(LOCALES)('%s — la NÉGATION du brouillon reste dicible', locale => {
    // « Une messagerie d’équipe n’a pas de brouillon » est exactement la phrase
    // qu'on veut voir. Une garde qui la refuse pousse à la supprimer, donc à
    // retirer la seule mention honnête de la limite.
    const confirmation = read(locale, 'missions.channel.teamChat.confirmation') ?? ''
    expect(confirmation).not.toEqual('')
    expect(mentionsDraft(confirmation)).toBe(true)
    expect(promisesDraftOnADraftlessChannel(confirmation)).toBe(false)
  })

  it('sait dire NON — les détecteurs attrapent les formulations fautives', () => {
    // Les motifs eux-mêmes sont testés : une regex cassée rendrait les cinq
    // tests précédents verts sans rien vérifier.
    expect(claimsDraftInsideBellum('un brouillon dans Bellum — rien n’est envoyé')).toBe(true)
    expect(claimsDraftInsideBellum('a draft inside Bellum — nothing is sent')).toBe(true)
    expect(promisesDraftOnADraftlessChannel('4 brouillons créés dans Teams')).toBe(true)
    expect(promisesDraftOnADraftlessChannel('Prepare a LinkedIn draft for {{name}}')).toBe(true)
    expect(promisesDraftOnADraftlessChannel('Le brouillon de ton script d’appel est prêt.')).toBe(true)
    expect(mentionsDraft('Le brouillon <draft>email_message</draft> part')).toBe(true)

    // …et laissent passer ce qui est vrai.
    expect(claimsDraftInsideBellum('Connecte ta messagerie pour rédiger depuis Bellum — le brouillon en part.')).toBe(
      false,
    )
    expect(promisesDraftOnADraftlessChannel('une messagerie d’équipe n’a pas de brouillon')).toBe(false)
    expect(promisesDraftOnADraftlessChannel('a team chat has no draft')).toBe(false)
    expect(promisesDraftOnADraftlessChannel('Le brouillon atterrit dans ta messagerie.')).toBe(false)
    // « Draft » verbe : un impératif ne promet aucun objet.
    expect(mentionsDraft('Draft a LinkedIn message for {{name}}')).toBe(false)
    expect(mentionsDraft('Laura stops using them in anything she drafts.')).toBe(false)
    // …mais le NOM, lui, est bien vu.
    expect(mentionsDraft('Generate the draft')).toBe(true)
    expect(mentionsDraft('Le message préparé de chaque contact est envoyé.')).toBe(false)
  })
})
