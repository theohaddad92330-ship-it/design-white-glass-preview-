import { isPublicEmailDomain as isPublicEmailDomainShared, type ActivityLinkReason } from '@bellum/contracts'

/**
 * À QUOI rattacher une activité — la décision la plus risquée de la tranche.
 *
 * Un rattachement faux est pire qu'un rattachement absent : il place un échange
 * dans l'historique d'un compte où il n'a jamais eu lieu, et cet historique est
 * ce qu'on relit avant un rendez-vous. Le module est donc PUR, testé, et
 * délibérément avare.
 *
 * Trois règles, par ordre de force de preuve :
 *
 * 1. **L'adresse exacte d'un contact connu.** C'est la même personne — il n'y a
 *    rien à interpréter.
 * 2. **Le numéro de téléphone d'un contact connu**, comparé sur ses chiffres :
 *    `+33 6 12 34 56 78`, `0612345678` et `0033612345678` sont le même numéro,
 *    et un CRM qui ne le sait pas crée un doublon par format.
 * 3. **Le domaine d'un compte**, et seulement pour rattacher au COMPTE — jamais
 *    à une personne. Savoir qu'un message vient de `@acme.fr` ne dit pas de qui.
 *
 * Et un refus explicite : les **domaines grand public**. Rattacher par
 * `@gmail.com` collerait tous les indépendants du carnet d'adresses au premier
 * compte dont un contact utilise Gmail. La liste est courte et fermée : allonger
 * indéfiniment une liste noire est un jeu perdu, alors que la règle « un domaine
 * partagé par des milliers de gens ne prouve rien » couvre le vrai risque.
 */

/**
 * ⚠️ GA-26 (22/09/2026, #2705) — la liste elle-même a DÉMÉNAGÉ dans
 * `@bellum/contracts` (`schemas/professional-email.ts`) : le formulaire de
 * `/demo` doit refuser la même adresse personnelle CÔTÉ NAVIGATEUR, et
 * `apps/web` ne peut pas importer un fichier de `apps/api`. Cette fonction
 * garde son nom et sa signature — aucun appelant existant
 * (`workspace-join.service.ts`, ce fichier lui-même) n'a dû changer.
 */
export function isPublicEmailDomain(domain: string): boolean {
  return isPublicEmailDomainShared(domain)
}

/** Le domaine d'une adresse, en minuscules. `null` si ce n'est pas une adresse. */
export function emailDomain(value: string | null | undefined): string | null {
  if (!value) return null
  const at = value.lastIndexOf('@')
  if (at <= 0 || at === value.length - 1) return null
  const domain = value
    .slice(at + 1)
    .trim()
    .toLowerCase()
  // Une adresse rendue sous la forme « Marie <marie@acme.fr> » laisse un chevron.
  const cleaned = domain.replace(/[>\s,;]+$/g, '')
  return cleaned.includes('.') ? cleaned : null
}

/**
 * L'adresse nue d'une chaîne d'en-tête RFC 5322.
 *
 * Les fournisseurs rendent indifféremment `marie@acme.fr` et
 * `"Dupont, Marie" <marie@acme.fr>`. Comparer les deux formes telles quelles
 * fait rater un contact sur deux.
 */
export function bareEmail(value: string | null | undefined): string | null {
  if (!value) return null
  const angled = /<([^>]+)>/.exec(value)
  const candidate = (angled?.[1] ?? value).trim().toLowerCase()
  return candidate.includes('@') ? candidate.replace(/^[<"'\s]+|[>"'\s,;]+$/g, '') : null
}

/**
 * Le nom affiché d'un en-tête, quand il y en a un.
 *
 * `null` plutôt que l'adresse recopiée : une timeline qui affiche
 * `marie@acme.fr — marie@acme.fr` a l'air cassée.
 */
export function displayNameOf(value: string | null | undefined): string | null {
  if (!value) return null
  const angled = /^(.*)<[^>]+>\s*$/.exec(value.trim())
  if (!angled) return null
  const name = angled[1]
    ?.trim()
    .replace(/^["']|["']$/g, '')
    .trim()
  return name ? name : null
}

/**
 * Les chiffres significatifs d'un numéro.
 *
 * On garde les **neuf derniers** : c'est ce qui reste commun entre
 * `+33612345678`, `0612345678` et `0033612345678`, sans supposer un pays. Neuf
 * et pas six — six chiffres se répètent trop souvent pour prouver quoi que ce
 * soit. `null` en dessous de neuf : un numéro court (standard interne, numéro
 * spécial) ne doit pas rattacher.
 */
export function phoneKey(value: string | null | undefined): string | null {
  if (!value) return null
  const digits = value.replace(/\D+/g, '')
  if (digits.length < 9) return null
  return digits.slice(-9)
}

/** Un contact de l'espace, réduit à ce qui sert au rattachement. */
export type LinkableContact = {
  id: string
  accountId: string | null
  email: string | null
  phone?: string | null
  mobile?: string | null
}

/** Un compte de l'espace, réduit à son domaine. */
export type LinkableAccount = {
  id: string
  domain: string | null
}

type ActivityLink = {
  accountId: string | null
  contactId: string | null
  reason: ActivityLinkReason | null
}

const NO_LINK: ActivityLink = { accountId: null, contactId: null, reason: null }

/**
 * Index préparé une fois pour tout un lot. Reconstruire les tables de hachage à
 * chaque message rendrait une capture de 200 e-mails quadratique.
 */
export type LinkIndex = {
  byEmail: Map<string, LinkableContact>
  byPhone: Map<string, LinkableContact>
  byDomain: Map<string, string>
}

export function buildLinkIndex(contacts: readonly LinkableContact[], accounts: readonly LinkableAccount[]): LinkIndex {
  const byEmail = new Map<string, LinkableContact>()
  const byPhone = new Map<string, LinkableContact>()
  const byDomain = new Map<string, string>()

  for (const contact of contacts) {
    const email = bareEmail(contact.email)
    // Le premier gagne : deux contacts qui partagent une adresse sont un
    // doublon à traiter ailleurs (T10), pas une raison de ne rien rattacher.
    if (email && !byEmail.has(email)) byEmail.set(email, contact)
    for (const raw of [contact.phone, contact.mobile]) {
      const key = phoneKey(raw)
      if (key && !byPhone.has(key)) byPhone.set(key, contact)
    }
  }

  for (const account of accounts) {
    const domain = account.domain?.trim().toLowerCase()
    if (!domain || isPublicEmailDomain(domain)) continue
    if (!byDomain.has(domain)) byDomain.set(domain, account.id)
  }

  return { byEmail, byPhone, byDomain }
}

/**
 * Rattache une activité à partir des adresses et numéros qu'elle porte.
 *
 * `handles` contient toutes les parties de l'échange — expéditeur, destinataires,
 * copies, numéro appelé. `selfHandles` en retire l'utilisateur et ses collègues :
 * sans ça, un e-mail interne se rattacherait au compte de sa propre ESN, qui est
 * parfois dans la base comme n'importe quel autre.
 */
export function resolveActivityLink(
  handles: readonly (string | null | undefined)[],
  index: LinkIndex,
  selfHandles: ReadonlySet<string> = new Set(),
): ActivityLink {
  const emails: string[] = []
  const phones: string[] = []

  for (const handle of handles) {
    const email = bareEmail(handle)
    if (email) {
      if (!selfHandles.has(email)) emails.push(email)
      continue
    }
    const phone = phoneKey(handle)
    if (phone && !selfHandles.has(phone)) phones.push(phone)
  }

  // 1. Adresse exacte — la seule preuve d'identité de personne.
  for (const email of emails) {
    const contact = index.byEmail.get(email)
    if (contact) return { accountId: contact.accountId, contactId: contact.id, reason: 'contact_email' }
  }

  // 2. Numéro, normalisé sur ses neuf derniers chiffres.
  for (const phone of phones) {
    const contact = index.byPhone.get(phone)
    if (contact) return { accountId: contact.accountId, contactId: contact.id, reason: 'contact_phone' }
  }

  // 3. Domaine — le COMPTE seulement. Savoir qu'un message vient de `@acme.fr`
  //    ne dit pas de qui, et deviner la personne serait une invention.
  for (const email of emails) {
    const domain = emailDomain(email)
    if (!domain || isPublicEmailDomain(domain)) continue
    const accountId = index.byDomain.get(domain)
    if (accountId) return { accountId, contactId: null, reason: 'account_domain' }
  }

  return NO_LINK
}

/**
 * Le sens d'un échange, du point de vue de l'ESN.
 *
 * `internal` quand TOUTES les parties sont de la maison : c'est ce qui empêche
 * une réunion de préparation entre collègues de passer pour une touche client
 * et de repousser la date de relance.
 */
export function resolveDirection(
  fromHandle: string | null | undefined,
  toHandles: readonly (string | null | undefined)[],
  selfHandles: ReadonlySet<string>,
): 'inbound' | 'outbound' | 'internal' {
  const from = bareEmail(fromHandle) ?? phoneKey(fromHandle)
  const recipients = toHandles.map(handle => bareEmail(handle) ?? phoneKey(handle)).filter((v): v is string => !!v)

  const fromSelf = from !== null && selfHandles.has(from)
  const allRecipientsSelf = recipients.length > 0 && recipients.every(handle => selfHandles.has(handle))

  if (fromSelf && allRecipientsSelf) return 'internal'
  if (fromSelf) return 'outbound'
  // Un expéditeur inconnu ET aucun destinataire lisible : on ne devine pas un
  // sens, on prend le cas le plus fréquent d'une boîte lue — ça nous arrive.
  return 'inbound'
}
