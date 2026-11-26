import {
  describeGround,
  type ConsultantAvailability,
  type DecisionRole,
  type MeetingBriefBlockInput,
  type MeetingBriefSource,
} from '@bellum/contracts'

/**
 * De la matière du produit vers les six blocs de DONNÉES du brief d'avant
 * rendez-vous.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER DÉCIDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une seule chose, mais elle est la raison d'être du brief : **d'où chaque bloc
 * tient ce qu'il dit**. `describeGround` (`@bellum/contracts`) rend le verdict ;
 * ce fichier ne fait que lui présenter honnêtement ce qu'on a — et surtout, ce
 * qu'on n'a PAS.
 *
 * Trois refus se répètent d'un bloc à l'autre, et ils viennent tous de la même
 * règle (« non mesuré n'est jamais 0 ») :
 *
 *  1. **Une liste `null` n'est pas une liste vide.** `activities: null` veut dire
 *     « on n'a pas pu lire l'historique » ; `activities: []` veut dire « on a lu,
 *     il n'y a rien ». Les confondre annoncerait un premier contact à quelqu'un
 *     qui se parle depuis deux ans, parce qu'un connecteur était en panne. Dans
 *     les DEUX cas le bloc se tait — mais pour des raisons différentes, et c'est
 *     la raison qu'on affiche.
 *  2. **Un élément sans date ne date pas le bloc.** Un signal sans date n'est pas
 *     un signal ; une disponibilité jamais vérifiée n'est pas une disponibilité.
 *     Ils sont écartés, et si plus rien ne reste, `describeGround` rend
 *     `unattributed` et `buildMeetingBrief` retire le bloc.
 *  3. **Le bloc des enjeux est TOUJOURS déduit.** Il n'existe aucune date
 *     d'observation sur `pains` / `it_challenges` — les présenter comme sourcés
 *     serait le mensonge le plus facile du brief, parce que ce sont les phrases
 *     les plus convaincantes de l'écran.
 *
 * ⚠️ Le bloc 07 (« ce que tu veux obtenir ») N'EST PAS ici : son contenu est une
 * suite de clés traduites, donc il s'assemble dans la vue, avec `t`. Ce fichier
 * ne connaît pas i18n et ne rédige aucune phrase — il n'assemble que de la
 * donnée (des noms, des intitulés, des dates).
 *
 * ⚠️ Aucun critère protégé n'entre ici. Les types d'entrée ne portent ni photo,
 * ni adresse, ni date de naissance : ce que le type ne contient pas ne peut pas
 * peser dans un classement.
 */

/* -------------------------------------------------------------------------- */
/*  CE QUE L'ASSEMBLEUR SAIT LIRE                                              */
/* -------------------------------------------------------------------------- */

/** Une personne du compte, réduite à ce que le brief a le droit de lire. */
export type BriefContact = {
  readonly id: string
  readonly full_name: string
  readonly email: string | null
  readonly title: string | null
  /** La direction / l'entité de rattachement, telle qu'elle est tenue. */
  readonly entity: string | null
  readonly decision_role: DecisionRole | null
  readonly seniority?: string | null
  readonly scope?: string | null
  /** `HYPOTHÈSE` ⇒ le rôle est une lecture, pas un fait. `ARRIVEE` (#2632.1) :
   *  miroir de `RISQUE`, employeur détecté conforme précédé d'un employeur
   *  différent — la personne vient d'arriver. */
  readonly source_tag?: 'INTERNE' | 'PUBLIC' | 'HYPOTHÈSE' | 'RISQUE' | 'ARRIVEE' | null
  readonly relations?:
    | readonly {
        readonly id?: string | null
        readonly name: string
        readonly title?: string | null
        readonly decision_role?: DecisionRole | null
      }[]
    | null
  readonly key_points?: readonly string[] | null
  readonly why_contact?: string | null
  /** La date à laquelle la fiche a été rafraîchie. Sans elle, pas de bloc. */
  readonly updated_at: string
}

/** Un échange, réduit à ce que le brief affiche. Le CORPS n'entre jamais ici. */
export type BriefActivity = {
  readonly kind: string
  /** La capacité traversée, telle que le journal d'activité la nomme. */
  readonly source: string | null
  readonly subject: string | null
  /** Quand l'échange a eu lieu. */
  readonly occurredAt: string | null
  /** Quand Bellum l'a enregistré — c'est CELA qui date la source. */
  readonly recordedAt: string | null
}

/** Un signal daté sur l'entreprise. */
export type BriefSignal = {
  readonly label: string
  /** La nature de la source, déjà normalisée par l'appelant. */
  readonly kind: MeetingBriefSource
  readonly date: string | null
}

/** Un profil du vivier, et la date à laquelle sa disponibilité a été vérifiée. */
export type BriefConsultant = {
  readonly id: string
  readonly full_name: string | null
  readonly title: string | null
  readonly availability: ConsultantAvailability
  readonly available_from: string | null
  readonly availability_checked_at: string | null
}

/**
 * #2319.30 — un fait utile sur l'entreprise, avec sa source et sa date. Le
 * libellé arrive TRADUIT (« Effectif : 1 200 ») : ce fichier ne rédige rien.
 */
export type BriefFact = {
  readonly label: string
  readonly kind: MeetingBriefSource
  readonly date: string | null
}

/** #2319.33 — une fiche de l'espace liée au compte (opportunité, mission). */
export type BriefLinkedRecord = {
  /** « Opportunité », « Mission » — déjà traduit par l'appelant. */
  readonly kindLabel: string
  readonly label: string
  /** La dernière écriture de la fiche. Sans elle, la fiche ne date rien. */
  readonly date: string | null
}

/** #2319.34 — un risque lu sur une fiche contact, et la date de la fiche. */
export type BriefRisk = {
  readonly label: string
  readonly date: string | null
}

/** #2319.30 — trois faits, pas un annuaire de l'entreprise. */
const FACTS_MAX = 3

type MeetingBriefDataInput = {
  /** La personne du rendez-vous. Sans elle, il n'y a pas de brief. */
  readonly contact: BriefContact | null
  /** `null` = on n'a PAS PU lire. `[]` = on a lu, il n'y a rien. */
  readonly activities: readonly BriefActivity[] | null
  readonly signals: readonly BriefSignal[] | null
  /** Les enjeux lus dans le dossier. Toujours étiquetés déduits. */
  readonly stakes: readonly string[]
  readonly consultants: readonly BriefConsultant[] | null
  /**
   * Les objections probables — #1934.10. Comme `stakes`, c'est une PRODUCTION
   * de l'analyse (phase 1, section stratégie), jamais un relevé daté : aucun
   * champ du dépôt ne porte de date d'observation sur une objection.
   */
  readonly objections: readonly string[]
  readonly language: string
  /** #2319.30 — `null` = on n'a pas pu lire. */
  readonly facts?: readonly BriefFact[] | null
  /** #2319.31 — les limites, déjà traduites (`deriveMeetingBriefLimits`). */
  readonly limits?: readonly string[]
  /** #2319.33 — `null` = on n'a pas pu lire. */
  readonly linked?: readonly BriefLinkedRecord[] | null
  /** #2319.34 */
  readonly risks?: readonly BriefRisk[] | null
  /** #2319.38 — déjà traduit (`deriveMeetingBriefToVerify`). */
  readonly toVerify?: readonly string[]
}

/* -------------------------------------------------------------------------- */
/*  LE RATTACHEMENT                                                            */
/* -------------------------------------------------------------------------- */

/**
 * La personne du rendez-vous, ou `null`.
 *
 * Seuls les invités EXTERNES sont regardés : un point interne n'a pas de fiche
 * client à préparer. Et l'appariement se fait sur l'adresse e-mail exacte —
 * rattacher un homonyme ferait préparer la mauvaise réunion, ce qui est pire
 * que de ne rien proposer (c'est déjà la règle de `matchAccountForEvent`).
 */
export function matchAttendeeContact(
  attendees: readonly { readonly email: string; readonly external: boolean; readonly resource?: boolean }[],
  contacts: readonly BriefContact[],
): BriefContact | null {
  // #2390.9 — une salle réservée (`resource: true`) n'est jamais une personne :
  // elle n'est jamais rattachée à un contact, même quand son adresse correspond.
  const externals = attendees
    .filter(attendee => attendee.external && attendee.resource !== true)
    .map(attendee => attendee.email.trim().toLowerCase())
  if (externals.length === 0) return null
  return (
    contacts.find(contact => {
      const email = contact.email?.trim().toLowerCase()
      return !!email && externals.includes(email)
    }) ?? null
  )
}

/**
 * #2390.10 (épopée #2926) — DES CONTACTS CONNUS DU COMPTE, ABSENTS DE CE
 * RENDEZ-VOUS.
 *
 * Le lien meeting↔contact existe déjà dans l'autre sens (`matchAttendeeContact`
 * ci-dessus) : un invité EXTERNE rattaché à une fiche. Ce point regarde
 * l'inverse — une fiche du COMPTE déjà rattaché (`resolveAssociatedAccount`)
 * qui n'apparaît PAS parmi les invités.
 *
 * Le signal ne prétend rien sur l'intention du commercial — un point de
 * cadrage n'a pas besoin de tout le monde. Il NOMME ce qui pourrait manquer,
 * à charge pour la personne de juger. Un contact sans adresse connue n'est
 * jamais compté : rien ne prouve qu'il aurait pu être invité, et une absence
 * devinée serait pire qu'aucune absence signalée.
 */
export function missingKnownContacts(
  attendees: readonly { readonly email: string; readonly resource?: boolean }[],
  accountContacts: readonly BriefContact[],
): BriefContact[] {
  // #2390.9 — une salle réservée n'est jamais comptée comme invitée : un
  // contact connu qui ne partage le rendez-vous qu'avec la salle ressort donc
  // toujours comme manquant.
  const invited = new Set(
    attendees
      .filter(attendee => attendee.resource !== true)
      .map(attendee => attendee.email.trim().toLowerCase())
      .filter(email => email.length > 0),
  )
  return accountContacts.filter(contact => {
    const email = contact.email?.trim().toLowerCase()
    return !!email && !invited.has(email)
  })
}

/* -------------------------------------------------------------------------- */
/*  L'ASSEMBLAGE                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Les six blocs de données. Rend `[]` quand aucune personne n'est rattachée :
 * un brief sur personne n'est pas un brief vide, c'est une absence de brief.
 *
 * Les blocs qui ne savent pas dire d'où ils viennent sortent d'ici avec un
 * `ground` `unattributed` — c'est `buildMeetingBrief` qui les retire, à un seul
 * endroit, pour que la règle ne soit pas réécrite six fois de suite.
 */
export function buildMeetingBriefInputs(input: MeetingBriefDataInput): MeetingBriefBlockInput[] {
  const contact = input.contact
  if (!contact) return []
  const day = new Intl.DateTimeFormat(input.language, { day: '2-digit', month: '2-digit' })

  return [
    whoBlock(contact),
    historyBlock(input.activities, day),
    movingBlock(input.signals),
    stakesBlock(input.stakes),
    aroundBlock(contact),
    positionableBlock(input.consultants, day),
    objectionsBlock(input.objections),
    // #2319 — les cinq rubriques ajoutées. L'ordre de LECTURE est celui du
    // contrat (`MEETING_BRIEF_READING_ORDER`), pas celui de cette liste.
    factsBlock(input.facts ?? null),
    limitsBlock(input.limits ?? []),
    linkedBlock(input.linked ?? null),
    risksBlock(input.risks ?? null),
    toVerifyBlock(input.toVerify ?? []),
  ]
}

/**
 * #2319.30 — TROIS FAITS UTILES : les plus récents, datés. Un fait sans date
 * n'en est pas un — « CA : 300 M€ » sans année se lit « cette année ».
 */
function factsBlock(facts: readonly BriefFact[] | null): MeetingBriefBlockInput {
  const dated = datedItems(facts ?? []).slice(0, FACTS_MAX)
  return {
    key: 'facts',
    lines: dated.map(({ item }) => item.label.trim()),
    note: null,
    ground: describeGround({
      sources: [...new Set(dated.map(({ item }) => item.kind))].sort(),
      observedAt: dated[0] ? new Date(dated[0].at).toISOString() : null,
    }),
  }
}

/**
 * #2319.31 — LIMITES : ce que le brief n'a pas pu lire. Ce n'est pas une
 * source, c'est un CALCUL sur la lecture — il le dit.
 */
function limitsBlock(limits: readonly string[]): MeetingBriefBlockInput {
  return {
    key: 'limits',
    lines: [...limits],
    note: null,
    ground: describeGround({ derivedFrom: ['brief_coverage'] }),
  }
}

/** #2319.33 — les fiches de l'espace, la plus récente d'abord. */
function linkedBlock(linked: readonly BriefLinkedRecord[] | null): MeetingBriefBlockInput {
  const dated = datedItems(linked ?? [])
  return {
    key: 'linked',
    lines: dated.map(({ item }) => `${item.kindLabel.trim()} · ${item.label.trim()}`),
    note: null,
    ground: describeGround({
      sources: ['workspace'],
      observedAt: dated[0] ? new Date(dated[0].at).toISOString() : null,
    }),
  }
}

/**
 * #2319.34 — RISQUES : le fait est sur la fiche (un employeur qui ne
 * correspond plus, un bloqueur nommé) ; ce qu'il change pour CE rendez-vous
 * reste probable. Les deux moitiés sont nommées.
 */
function risksBlock(risks: readonly BriefRisk[] | null): MeetingBriefBlockInput {
  const dated = datedItems(risks ?? [])
  return {
    key: 'risks',
    lines: dated.map(({ item }) => item.label.trim()),
    note: null,
    ground: describeGround({
      sources: ['contact_record'],
      observedAt: dated[0] ? new Date(dated[0].at).toISOString() : null,
      probable: ['risk'],
    }),
  }
}

/** #2319.38 — CE QUI RESTE À VÉRIFIER : déduit par nature. */
function toVerifyBlock(toVerify: readonly string[]): MeetingBriefBlockInput {
  return { key: 'to_verify', lines: [...toVerify], note: null, ground: describeGround({ inferred: true }) }
}

/** Les éléments DATÉS et nommés, le plus récent d'abord. */
function datedItems<T extends { readonly date: string | null; readonly label: string }>(
  items: readonly T[],
): { item: T; at: number }[] {
  return items
    .map(item => ({ item, at: readTime(item.date) }))
    .filter((entry): entry is { item: T; at: number } => entry.at !== null && entry.item.label.trim().length > 0)
    .sort((a, b) => b.at - a.at)
}

/** 01 · QUI — la personne, telle que sa fiche la tient. */
function whoBlock(contact: BriefContact): MeetingBriefBlockInput {
  const role = [contact.title?.trim(), contact.entity?.trim()].filter(Boolean).join(', ')
  const note = [contact.seniority?.trim(), contact.scope?.trim()].filter(Boolean).join(' · ')
  return {
    key: 'who',
    lines: [[contact.full_name.trim(), role].filter(Boolean).join(' — ')],
    note: note || null,
    // #2102.31 — ce que la fiche ne sait pas : le rôle de décision (absent ou `unknown`), et l'ancienneté
    // dans le poste (aucun champ ne la porte, voir ci-dessous) — nommées, jamais comblées.
    unknowns: [...(roleEstablished(contact.decision_role) ? [] : (['decision_role'] as const)), 'tenure'],
    // La fiche, et la date à laquelle elle a été rafraîchie. Rien d'autre n'est
    // su : ni ancienneté dans le poste, ni employeur précédent — aucun champ du
    // dépôt ne les porte, et les déduire d'un intitulé serait les inventer.
    ground: describeGround({ sources: ['contact_record'], observedAt: contact.updated_at }),
  }
}

/**
 * 02 · CE QU'ON S'EST DIT — les trois derniers échanges, datés.
 *
 * La date de la SOURCE est celle du dernier enregistrement (`recordedAt`), pas
 * celle du dernier échange : elle répond à « jusqu'à quand a-t-on regardé ? »,
 * qui est la question que pose un historique. Un échange de mars enregistré hier
 * date donc le bloc d'hier, ce qui est vrai.
 */
function historyBlock(activities: readonly BriefActivity[] | null, day: Intl.DateTimeFormat): MeetingBriefBlockInput {
  const dated = (activities ?? [])
    .map(activity => ({ activity, at: readTime(activity.occurredAt) }))
    .filter((entry): entry is { activity: BriefActivity; at: number } => entry.at !== null)
    .sort((a, b) => b.at - a.at)

  const recordedAt = latestIso((activities ?? []).map(activity => activity.recordedAt))
  const sources = [...new Set((activities ?? []).map(activity => activitySource(activity.source)))].sort()

  return {
    key: 'history',
    lines: dated.slice(0, HISTORY_MAX_LINES).map(({ activity, at }) => {
      const label = activity.subject?.trim() || activity.kind
      return `${day.format(new Date(at))} · ${label}`
    }),
    note: null,
    ground: describeGround({ sources, observedAt: recordedAt }),
  }
}

/** Trois échanges : de quoi reprendre le fil, pas de quoi relire un dossier. */
const HISTORY_MAX_LINES = 3

/**
 * La CAPACITÉ traversée par un échange, jamais l'éditeur.
 *
 * `manual` et `system` deviennent `workspace` : quelqu'un — ou quelque chose —
 * l'a écrit DANS Bellum. Une valeur inconnue y tombe aussi, faute de mieux : le
 * dire « CRM » serait une source inventée.
 */
function activitySource(source: string | null): MeetingBriefSource {
  switch (source) {
    case 'mailbox':
      return 'mailbox'
    case 'agenda':
      return 'agenda'
    case 'crm':
      return 'crm'
    case 'telephony':
      return 'telephony'
    default:
      return 'workspace'
  }
}

/**
 * 03 · CE QUI BOUGE CHEZ EUX — les signaux, et rien qu'eux.
 *
 * Un signal SANS date est écarté, pas affiché sans sa date : « budget annoncé »
 * sans quand se lit « cette semaine », et c'est peut-être de l'an dernier.
 */
function movingBlock(signals: readonly BriefSignal[] | null): MeetingBriefBlockInput {
  const dated = (signals ?? [])
    .map(signal => ({ signal, at: readTime(signal.date) }))
    .filter((entry): entry is { signal: BriefSignal; at: number } => entry.at !== null)
    .sort((a, b) => b.at - a.at)

  return {
    key: 'moving',
    lines: dated.map(({ signal }) => signal.label.trim()),
    note: null,
    // #2102.31 — des signaux sans date ont été écartés : le bloc le dit au lieu de se croire complet.
    unknowns:
      dated.length < (signals ?? []).filter(signal => signal.label.trim().length > 0).length ? ['undated_signals'] : [],
    ground: describeGround({
      sources: [...new Set(dated.map(({ signal }) => signal.kind))],
      observedAt: dated[0] ? new Date(dated[0].at).toISOString() : null,
    }),
  }
}

/**
 * 04 · SES ENJEUX PROBABLES — déduit, toujours, sans exception.
 *
 * Aucun champ du dépôt ne porte de date d'observation sur les enjeux (`pains`,
 * `it_challenges`) : ils sont produits par l'analyse, pas relevés. Les
 * présenter comme sourcés serait le mensonge le plus facile de l'écran, parce
 * que ce sont ses phrases les plus convaincantes.
 */
function stakesBlock(stakes: readonly string[]): MeetingBriefBlockInput {
  return { key: 'stakes', lines: [...stakes], note: null, ground: describeGround({ inferred: true }) }
}

/**
 * 08 · OBJECTIONS PROBABLES — #1934.10, déduit comme le bloc des enjeux.
 *
 * La phase 1 les écrit dans `raw_analysis.objections` (section stratégie) ; le
 * plan (phase 4) les LIT pour construire son prompt, il ne les produit pas —
 * et aucun des deux ne les date. Les présenter comme sourcées inventerait une
 * preuve qui n'existe pas.
 */
function objectionsBlock(objections: readonly string[]): MeetingBriefBlockInput {
  return { key: 'objections', lines: [...objections], note: null, ground: describeGround({ inferred: true }) }
}

/**
 * #2102.22 — le poids d'un rôle de décision dans la carte d'influence (0 = pèse le plus). Un rôle
 * absent ou `unknown` vaut le plus grand rang : non établi, donc après les rôles établis.
 */
const INFLUENCE_ORDER: readonly DecisionRole[] = [
  'economic',
  'sponsor',
  'technical',
  'champion',
  'influencer',
  'blocker',
  'procurement',
  'purchasing',
  'user',
  'operational',
]
/** Un rôle de décision est ÉTABLI s'il est présent et autre que `unknown`. */
function roleEstablished(role: DecisionRole | null | undefined): boolean {
  return !!role && role !== 'unknown'
}
function influenceRank(role: DecisionRole | null | undefined): number {
  const index = role ? INFLUENCE_ORDER.indexOf(role) : -1
  return index === -1 ? INFLUENCE_ORDER.length : index
}

/**
 * 05 · AUTOUR D'ELLE — hiérarchie sourcée, influence probable.
 *
 * Les deux moitiés sont nommées séparément parce qu'elles n'ont pas la même
 * valeur : que M. Alaoui dirige l'ingénierie est écrit sur sa fiche ; qu'il
 * pèse sur cette décision-ci est une lecture.
 */
function aroundBlock(contact: BriefContact): MeetingBriefBlockInput {
  // #2102.22 — hiérarchisée : le poids de décision d'abord. Le tri est STABLE : à poids égal, l'ordre du
  // dossier ; un rôle non établi passe en dernier, il n'est ni promu ni écarté.
  const relations = (contact.relations ?? [])
    .filter(relation => relation.name.trim().length > 0)
    .map((relation, position) => ({ relation, position }))
    .sort(
      (a, b) =>
        influenceRank(a.relation.decision_role) - influenceRank(b.relation.decision_role) || a.position - b.position,
    )
    .map(({ relation }) => relation)
  return {
    key: 'around',
    lines: relations.map(relation => [relation.name.trim(), relation.title?.trim()].filter(Boolean).join(' — ')),
    note: null,
    // #2102.31 — le rôle de décision d'au moins une personne n'est pas établi : on le dit.
    unknowns: relations.some(relation => !roleEstablished(relation.decision_role)) ? ['relation_roles'] : [],
    ground: describeGround({
      sources: ['contact_record'],
      observedAt: contact.updated_at,
      probable: ['influence'],
    }),
  }
}

/**
 * 06 · CE QUE TU PEUX POSITIONNER — les profils réellement disponibles.
 *
 * Deux exclusions, et la seconde est celle qu'on oublie :
 *  · `indisponible` et `inconnu` ne sont jamais présentés comme disponibles —
 *    c'est déjà la règle de `consultantAvailabilitySchema` ;
 *  · une disponibilité JAMAIS VÉRIFIÉE ne date pas le bloc. « Dispo immédiate »
 *    saisi il y a six mois est faux, et c'est le genre de phrase qu'on répète en
 *    réunion avant de découvrir que la personne est en mission depuis mai.
 */
function positionableBlock(
  consultants: readonly BriefConsultant[] | null,
  day: Intl.DateTimeFormat,
): MeetingBriefBlockInput {
  const usable = (consultants ?? []).filter(
    consultant =>
      consultant.availability !== 'indisponible' &&
      consultant.availability !== 'inconnu' &&
      !!consultant.full_name?.trim() &&
      readTime(consultant.availability_checked_at) !== null,
  )

  // #2102.31 — un profil écarté faute de disponibilité VÉRIFIÉE est une inconnue nommée ; un profil
  // `indisponible` est une réponse, pas une inconnue.
  const unverified = (consultants ?? []).some(
    consultant =>
      !!consultant.full_name?.trim() &&
      consultant.availability !== 'indisponible' &&
      (consultant.availability === 'inconnu' || readTime(consultant.availability_checked_at) === null),
  )

  return {
    key: 'positionable',
    unknowns: unverified ? ['availability_unverified'] : [],
    lines: usable.map(consultant => {
      const from = readTime(consultant.available_from)
      const head = [consultant.full_name?.trim(), consultant.title?.trim()].filter(Boolean).join(' — ')
      return from === null ? head : `${head}, dispo ${day.format(new Date(from))}`
    }),
    note: null,
    ground: describeGround({
      sources: ['bench'],
      observedAt: latestIso(usable.map(consultant => consultant.availability_checked_at)),
    }),
  }
}

/* -------------------------------------------------------------------------- */
/*  DEUX LECTURES DE DATE, ÉCRITES UNE FOIS                                    */
/* -------------------------------------------------------------------------- */

/** Le temps d'une date lisible, ou `null`. Jamais `NaN`, jamais « maintenant ». */
function readTime(value: string | null | undefined): number | null {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

/** La plus récente des dates lisibles, en ISO — `null` s'il n'y en a aucune. */
function latestIso(values: readonly (string | null | undefined)[]): string | null {
  const times = values.map(readTime).filter((time): time is number => time !== null)
  return times.length === 0 ? null : new Date(Math.max(...times)).toISOString()
}
