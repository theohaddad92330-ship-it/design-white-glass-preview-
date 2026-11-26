import type { MailThread } from '@bellum/contracts'
import { normalizeAddress } from './no-reply'

/**
 * À QUEL COMPTE appartient ce fil de messagerie (MAIL-01, audit du 17/08).
 *
 * L'écran triait déjà les fils par intention — « sans réponse », « réponses
 * favorables », « factures » — et le rapport le dit bien : la base est bonne. Ce
 * qui manquait est le CONTEXTE. Une ligne qui affiche « Re: Changement projet ·
 * s.dean@meilleurtaux.com · silencieux depuis 19 jours » oblige à se rappeler de
 * qui est cette personne et de quelle affaire il s'agit. Sans ce rappel, la
 * messagerie reste un filtre e-mail un peu joli, pas un poste de travail
 * commercial.
 *
 * Le rattachement se fait sur ce qu'on a VRAIMENT, dans cet ordre :
 *
 *  1. **l'adresse exacte d'un contact connu** — le seul lien certain, parce que
 *     quelqu'un l'a saisi ou qu'un fournisseur l'a résolu ;
 *  2. **le domaine de l'adresse**, quand ce domaine n'appartient qu'à UN compte
 *     du portefeuille. Un domaine partagé par deux comptes ne rattache rien : se
 *     tromper de compte est pire que ne pas en proposer, parce que la ligne
 *     devient un mensonge vérifiable.
 *
 * Les domaines GRAND PUBLIC sont exclus du second niveau : `gmail.com` est
 * partagé par la moitié de la planète, et rattacher un fil à un compte parce que
 * son interlocuteur a une adresse Gmail produirait exactement le faux
 * rapprochement qu'on veut éviter.
 *
 * Le module est PUR — il reçoit des contacts, il rend des liens — pour que la
 * règle se relise sans base de données.
 */

/** Ce qu'il faut savoir d'un contact pour rattacher un fil. */
export type ContactAnchor = {
  email: string | null
  contactId: string
  accountId: string
  accountName: string
  /** #5003 — le compte est une ESN (`accounts.is_intermediary`) : le fil sera ÉTIQUETÉ, jamais retiré. */
  accountIsEsn?: boolean | null
}

/** Le compte rattaché à un fil, et comment il a été trouvé. */
type ThreadAccountLink = {
  accountId: string
  accountName: string
  /** `contact` = adresse exacte connue ; `domain` = domaine sans ambiguïté. */
  via: 'contact' | 'domain'
  /**
   * #2104.3 — LA PERSONNE, quand l'adresse exacte la désigne. Absent pour un
   * rattachement par domaine : un domaine dit à quel compte ça appartient,
   * jamais qui précisément — plusieurs contacts peuvent le partager.
   */
  contactId?: string
  /** #5003 — étiquette « ESN » du compte rattaché. */
  isEsn?: true
}

/**
 * Les domaines de messagerie GRAND PUBLIC — jamais un signal d'appartenance.
 *
 * La liste est volontairement courte : elle ne sert qu'à couvrir ce qui revient
 * réellement dans une boîte professionnelle française. Un domaine oublié ne
 * produit pas un faux rattachement à lui seul — il faudrait encore qu'un seul
 * compte du portefeuille le porte —, alors qu'un domaine d'entreprise ajouté
 * par erreur ferait perdre un vrai rattachement.
 */
const PUBLIC_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'outlook.fr',
  'hotmail.com',
  'hotmail.fr',
  'live.fr',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.fr',
  'orange.fr',
  'wanadoo.fr',
  'free.fr',
  'sfr.fr',
  'laposte.net',
  'bbox.fr',
  'icloud.com',
  'me.com',
  'protonmail.com',
  'proton.me',
])

function domainOf(address: string | null | undefined): string | null {
  const normalized = normalizeAddress(address ?? '')
  const at = normalized.lastIndexOf('@')
  if (at <= 0 || at === normalized.length - 1) return null
  const domain = normalized.slice(at + 1)
  return domain || null
}

/**
 * L'index de rattachement, construit une fois pour toute une liste de fils.
 *
 * Séparé de la résolution parce qu'il se construit sur les contacts du
 * portefeuille — une lecture — alors que la résolution se fait par fil.
 */
export function buildThreadAccountIndex(contacts: readonly ContactAnchor[]): {
  byAddress: Map<string, ThreadAccountLink>
  byDomain: Map<string, ThreadAccountLink | null>
} {
  const byAddress = new Map<string, ThreadAccountLink>()
  /** `null` = domaine AMBIGU (plusieurs comptes) : il ne rattache plus rien. */
  const byDomain = new Map<string, ThreadAccountLink | null>()

  for (const contact of contacts) {
    const address = normalizeAddress(contact.email ?? '')
    if (!address) continue
    const link: ThreadAccountLink = {
      accountId: contact.accountId,
      accountName: contact.accountName,
      via: 'contact',
      contactId: contact.contactId,
      ...(contact.accountIsEsn === true ? { isEsn: true as const } : {}),
    }
    // La première adresse gagne : deux contacts homonymes sur la même adresse
    // appartiennent de toute façon au même compte dans la quasi-totalité des
    // cas, et l'ordre d'insertion est stable.
    if (!byAddress.has(address)) byAddress.set(address, link)

    const domain = domainOf(address)
    if (!domain || PUBLIC_MAIL_DOMAINS.has(domain)) continue
    const known = byDomain.get(domain)
    if (known === undefined) {
      // #2104.3 — `contactId` ne voyage PAS jusqu'au domaine : lui seul ne
      // désigne jamais une personne en particulier.
      byDomain.set(domain, {
        accountId: contact.accountId,
        accountName: contact.accountName,
        via: 'domain',
        ...(contact.accountIsEsn === true ? { isEsn: true as const } : {}),
      })
    } else if (known !== null && known.accountId !== contact.accountId) {
      // Deux comptes derrière le même domaine : on ne tranche pas.
      byDomain.set(domain, null)
    }
  }

  return { byAddress, byDomain }
}

/** Le compte de ce fil, ou `null` quand rien ne le rattache avec certitude. */
export function linkThreadToAccount(
  thread: Pick<MailThread, 'counterpart'>,
  index: ReturnType<typeof buildThreadAccountIndex>,
): ThreadAccountLink | null {
  const address = normalizeAddress(thread.counterpart ?? '')
  if (!address) return null

  const exact = index.byAddress.get(address)
  if (exact) return exact

  const domain = domainOf(address)
  if (!domain) return null
  return index.byDomain.get(domain) ?? null
}

/** La forme WIRE du lien (`MailThread.account`), ou `null`. */
export function toAccountRef(
  link: ThreadAccountLink | null,
): { id: string; name: string; via: 'contact' | 'domain' | 'manual'; isEsn?: boolean } | null {
  return link
    ? { id: link.accountId, name: link.accountName, via: link.via, ...(link.isEsn ? { isEsn: true } : {}) }
    : null
}

/**
 * La forme WIRE du contact (`MailThread.contactId`), ou `null` (#2104.3).
 *
 * Séparée de `toAccountRef` : un rattachement par domaine a un compte mais
 * jamais de contact précis, les deux champs ne voyagent donc pas ensemble.
 */
export function toContactRef(link: ThreadAccountLink | null): string | null {
  return link?.contactId ?? null
}
