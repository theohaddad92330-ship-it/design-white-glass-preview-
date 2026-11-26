import { normalizeAgendaEventVisibility, type AgendaEvent } from '@bellum/contracts'

/**
 * À quel compte du portefeuille se rattache ce rendez-vous ?
 *
 * Préparer une réunion suppose de savoir de QUI on parle. La question se pose
 * dans le sens rendez-vous → compte, alors que le produit ne savait la traiter
 * que dans l'autre sens (les réunions d'un compte donné).
 *
 * Deux indices, dans cet ordre, et c'est l'ordre qui compte :
 *
 *  1. le DOMAINE d'un invité externe. C'est une preuve : `j.morvan@acme.fr` est
 *     chez ACME, quel que soit le titre qu'on a donné à la réunion ;
 *  2. le nom de la société dans le titre. C'est un indice, pas une preuve — on
 *     ne s'en sert que si aucun domaine ne tranche.
 *
 * Rien ne correspond ⇒ `null`. Rattacher un rendez-vous au mauvais compte est
 * pire que ne pas le rattacher : le commercial préparerait la mauvaise réunion.
 */

export type MatchableAccount = {
  id: string
  company_name: string
  website?: string | null
}

/**
 * #2319.18 — UNE RÉUNION PERSONNELLE, distincte d'un point interne.
 *
 * Un point interne n'a pas de fiche client à préparer (aucun invité externe) ;
 * une réunion personnelle (Microsoft `sensitivity: personal` — le rendez-vous
 * chez le dentiste posé dans le même agenda) n'en a pas non plus, mais pour
 * une raison différente : ce n'est PAS un moment de travail. La distinction
 * compte parce qu'un point interne peut légitimement nommer un client dans
 * son titre (« Cadrage ACME avant le call ») alors qu'une réunion personnelle
 * ne doit JAMAIS être rattachée, même par coïncidence de titre.
 */
export function isPersonalAgendaEvent(event: Pick<AgendaEvent, 'visibility'>): boolean {
  return normalizeAgendaEventVisibility(event.visibility) === 'personal'
}

/**
 * #2319.10 — LE NIVEAU DE CONFIDENTIALITÉ, résolu pour l'affichage.
 *
 * Un rendez-vous marqué confidentiel reste un rendez-vous de TRAVAIL — le
 * brief se prépare normalement — mais l'écran le nomme : un commercial qui
 * partage son écran ou lit son agenda à voix haute doit savoir que CE
 * rendez-vous porte une confidentialité posée par son propre calendrier.
 */
export function isConfidentialAgendaEvent(event: Pick<AgendaEvent, 'visibility'>): boolean {
  return normalizeAgendaEventVisibility(event.visibility) === 'confidential'
}

/**
 * #2319.14 — ÉVÉNEMENT RÉCURRENT, nommé dans la Résolution du rendez-vous.
 *
 * `event.recurring` est déjà calculé (#2103.29) depuis `recurringEventId`
 * (Google) / `seriesMasterId` (Microsoft) — jamais deviné ici, seulement lu.
 * `undefined` (réponse antérieure à ce champ) se lit comme « non récurrent »,
 * jamais comme « inconnu » : le champ ne porte pas de troisième état.
 */
export function isRecurringAgendaEvent(event: Pick<AgendaEvent, 'recurring'>): boolean {
  return event.recurring === true
}

/** Domaine enregistrable nu d'une URL ou d'une adresse. `null` si rien d'exploitable. */
function domainOf(value: string | null | undefined): string | null {
  let s = String(value ?? '')
    .trim()
    .toLowerCase()
  if (!s) return null
  if (s.includes('@')) s = s.slice(s.lastIndexOf('@') + 1)
  s = s.replace(/^https?:\/\//, '')
  s = s.split('/')[0]!.split('?')[0]!
  s = s.replace(/^www\./, '')
  return s.includes('.') ? s : null
}

/** Normalise un nom pour une comparaison textuelle tolérante. */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Le compte auquel ce rendez-vous se rattache, ou `null`.
 *
 * Un nom de société trop court n'est jamais recherché dans un titre : « SG »
 * apparaîtrait dans « Réunion SGDF » et dans la moitié des phrases françaises.
 */
export function matchAccountForEvent(
  event: Pick<AgendaEvent, 'summary' | 'attendees' | 'visibility'>,
  accounts: readonly MatchableAccount[],
): MatchableAccount | null {
  // #2319.18 — une réunion PERSONNELLE ne se rattache à AUCUN compte, même si
  // son titre nomme un client par coïncidence : ce n'est pas un rendez-vous de
  // travail, et lui prêter un dossier client serait une fuite, pas une aide.
  if (isPersonalAgendaEvent(event)) return null
  const externalDomains = new Set(
    (event.attendees ?? [])
      .filter(attendee => attendee.external)
      .map(attendee => domainOf(attendee.email))
      .filter((domain): domain is string => Boolean(domain)),
  )

  if (externalDomains.size > 0) {
    const byDomain = accounts.find(account => {
      const domain = domainOf(account.website)
      return domain !== null && externalDomains.has(domain)
    })
    if (byDomain) return byDomain
  }

  const title = normalizeName(String(event.summary ?? ''))
  if (!title) return null
  // Le plus LONG nom qui apparaît gagne : « TF1 » et « TF1 Publicité » peuvent
  // coexister au portefeuille, et le plus précis est le bon.
  const candidates = accounts
    .filter(account => {
      const name = normalizeName(account.company_name)
      return name.length >= 4 && title.includes(name)
    })
    .sort((a, b) => normalizeName(b.company_name).length - normalizeName(a.company_name).length)
  return candidates[0] ?? null
}

/**
 * #2103.30 — TOUS les comptes que les domaines EXTERNES de cet événement
 * désignent, dans l'ordre où ces domaines apparaissent chez les invités.
 *
 * `matchAccountForEvent` choisit un SEUL compte — le premier domaine externe
 * qui matche — ce qui devine silencieusement le bon périmètre quand PLUSIEURS
 * entreprises sont invitées (un point à trois avec deux clients du
 * portefeuille, par exemple). Cette fonction ne devine rien : elle rend la
 * liste ENTIÈRE des comptes distincts désignés. `length > 1` est le signal
 * qu'un choix humain est nécessaire — c'est `MeetingPrepDialog` qui l'affiche
 * plutôt que de rattacher au hasard.
 */
export function externalAccountCandidatesForEvent(
  event: Pick<AgendaEvent, 'attendees' | 'visibility'>,
  accounts: readonly MatchableAccount[],
): MatchableAccount[] {
  if (isPersonalAgendaEvent(event)) return []
  const externalDomains = (event.attendees ?? [])
    .filter(attendee => attendee.external)
    .map(attendee => domainOf(attendee.email))
    .filter((domain): domain is string => Boolean(domain))

  const seen = new Set<string>()
  const candidates: MatchableAccount[] = []
  for (const domain of externalDomains) {
    const account = accounts.find(a => domainOf(a.website) === domain)
    if (account && !seen.has(account.id)) {
      seen.add(account.id)
      candidates.push(account)
    }
  }
  return candidates
}

/** Une fiche de l'espace, réduite à ce qu'un titre de rendez-vous peut citer. */
export type MatchableLinkedRecord = { readonly id: string; readonly label: string }

/**
 * #2319.6 / #2319.7 / #2319.8 — LAQUELLE, parmi les fiches DÉJÀ liées au
 * compte (opportunités, besoins, missions), CE rendez-vous vise-t-il ?
 *
 * Même principe que le nom de société dans `matchAccountForEvent` — et la
 * même prudence : un libellé trop court n'est jamais cherché (`length >= 4`),
 * et le plus LONG qui apparaît gagne, pour départager deux fiches dont l'une
 * est le préfixe de l'autre. Rien ne correspond ⇒ `null` : une fiche devinée
 * au hasard parmi celles du compte serait pire qu'aucune fiche nommée.
 */
export function matchLinkedRecordForEvent(
  event: Pick<AgendaEvent, 'summary'>,
  candidates: readonly MatchableLinkedRecord[],
): MatchableLinkedRecord | null {
  const title = normalizeName(String(event.summary ?? ''))
  if (!title) return null
  const matches = candidates
    .filter(candidate => {
      const name = normalizeName(candidate.label)
      return name.length >= 4 && title.includes(name)
    })
    .sort((a, b) => normalizeName(b.label).length - normalizeName(a.label).length)
  return matches[0] ?? null
}

/**
 * #2319.16 / #2319.131 — LE COMPTE ASSOCIÉ, CORRIGIBLE.
 *
 * `matchAccountForEvent` (déterministe, domaine puis titre) reste un INDICE,
 * jamais un fait intouchable : un titre peut ressembler par erreur à un
 * client qui n'est pas le bon, ou un domaine peut désigner deux comptes à la
 * fois (`externalAccountCandidatesForEvent`, #2103.30). `override` — posé par
 * un geste explicite de l'utilisateur, JAMAIS deviné — gagne toujours, qu'il
 * corrige un rattachement automatique ou qu'il tranche une ambiguïté.
 *
 * Sans `override` : `null` candidat s'il y a AMBIGUÏTÉ (plusieurs entreprises
 * invitées, sans qu'aucune ne l'ait encore emporté) — proposer une entreprise
 * au hasard parmi deux serait exactement l'erreur que #2103.30 corrige.
 */
export function resolveAssociatedAccount(
  event: Pick<AgendaEvent, 'summary' | 'attendees' | 'visibility'>,
  accounts: readonly MatchableAccount[],
  override: string | null,
): MatchableAccount | null {
  if (override) return accounts.find(account => account.id === override) ?? null
  const domainCandidates = externalAccountCandidatesForEvent(event, accounts)
  if (domainCandidates.length > 1) return null
  return matchAccountForEvent(event, accounts)
}

/**
 * #2103.1 — LE DÉCLENCHEUR post-RDV : ce rendez-vous appelle-t-il la
 * proposition d'un compte rendu ?
 *
 * Trois conditions, et les trois excluent : un rendez-vous à venir n'a rien à
 * rendre compte ; un point interne ou une réunion personnelle n'a pas de
 * fiche client à préparer (mêmes gardes que `isPersonalAgendaEvent` et le
 * calcul du type de rendez-vous) — leur proposer un CR fabriquerait un geste
 * que personne ne demande.
 *
 * `now` est un paramètre, pas `Date.now()` lu ici : un calcul déterministe se
 * teste sans horloge système à simuler.
 */
export function isPostMeetingRecapCandidate(
  event: Pick<AgendaEvent, 'end'>,
  options: { isPersonal: boolean; isInternalMeeting: boolean; now: Date },
): boolean {
  if (options.isPersonal || options.isInternalMeeting) return false
  if (!event.end) return false
  return new Date(event.end).getTime() < options.now.getTime()
}
