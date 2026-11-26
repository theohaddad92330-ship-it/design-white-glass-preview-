import { computeContactLifecycleState, type CommercialBrief } from '@bellum/contracts'
import { familyFromTitle, seniorityOf, type BpceContactKind } from './bpce-csv-mapping'
import { briefContactSeeds, formatPhone, normalizePersonName } from './commercial-brief-seed'
import type { CompteCsvRow } from './compte-csv-parser'

/**
 * Le relevé Orange déposé par Théo dans le Drive « DÉMO CLIENTS » (12/10/2026) :
 * `Orange_consultants_verifiables_annexe.csv`, 614 lignes, une ligne par couple (personne, entité Orange).
 *
 * Décisions Louis 12/10/2026 :
 *  - noms recopiés EN CLAIR tels quels (y compris les 45 abrégés « Alan D. ») ;
 *  - le relevé lui-même ne porte que des DRAPEAUX (`has_email`, `has_tel`, `has_linkedin`), jamais une valeur. Les
 *    COORDONNÉES viennent du dossier de compte que Théo a déposé ensuite (`data/commercial-briefs/orange.json`, fusion
 *    par nom, aucune perte) : e-mails du groupe Orange, mobiles et LinkedIn recopiés EN CLAIR, jamais inventés ; les
 *    adresses hors du groupe (boîte personnelle, employeur tiers) n'y sont pas reprises et le résumé le DIT ;
 *  - les décideurs du dossier remontent en tête (priorité 1) avec leur rôle ;
 *  - en poste = contacts du compte (export 2024, à revalider) ; anciens = « Ancien du compte » ; ESN observée =
 *    « Prestataire externe » quand la personne est en poste, nommée dans la fiche quand elle est partie (même traitement
 *    que le relevé BPCE) ;
 *  - hors France (Côte d'Ivoire, Tunisie, Caraïbe…) : gardé SOUS SON ENTITÉ, étiqueté, jamais mêlé au siège France.
 */

export const DEMO_ORANGE_COMPANY = 'Orange'
export const ORANGE_IMPORT_DATE = '12/10/2026'

/** Entités du relevé qui ne sont pas en France (filiales étrangères ; les DOM — Caraïbe, Réunion/Mayotte — sont la France). */
const FOREIGN_ENTITY = /côte d'ivoire|tunisie|cameroun|egypt|jordan|maroc|polska|communications sa/i

/**
 * Recette écran du 12/10/2026 — « Hors France » était invisible : le marquage vivait dans une étiquette de contact, or
 * « Par où entrer », la colonne « Entité » et le regroupement par entité ne lisent QUE le nom de l'entité. Le marquage
 * voyage donc dans le libellé lui-même, et le pays (code ISO, comme `FR` des autres entités) dans `country` du graphe
 * et `region` de `entities_exhaustive`. Les DOM restent la France.
 */
const FOREIGN_COUNTRY: readonly (readonly [RegExp, string])[] = [
  [/côte d'ivoire/i, 'CI'],
  [/tunisie/i, 'TN'],
  [/cameroun/i, 'CM'],
  [/egypt/i, 'EG'],
  [/jordan/i, 'JO'],
  [/maroc/i, 'MA'],
  [/polska/i, 'PL'],
  [/communications sa/i, 'CH'],
]

const FOREIGN_SUFFIX = ' (hors France)'

/** Le libellé d'une entité du relevé : une entité étrangère le DIT dans son nom (jamais deux fois). */
function orangeEntityLabel(name: string): string {
  return FOREIGN_ENTITY.test(name) && !name.endsWith(FOREIGN_SUFFIX) ? `${name}${FOREIGN_SUFFIX}` : name
}

/** Le pays d'une entité Orange : `FR` (DOM compris) sauf une entité étrangère connue, dont le code est celui du pays. */
export function orangeEntityCountry(label: string): string {
  return FOREIGN_COUNTRY.find(([pattern]) => pattern.test(label))?.[1] ?? 'FR'
}

const KIND_TAG: Record<'ancien' | 'externe' | 'poste', string> = {
  poste: 'Contact en poste',
  externe: 'Prestataire externe',
  ancien: 'Ancien du compte',
}

const KIND_LABEL: Record<'ancien' | 'externe' | 'poste', string> = {
  poste: 'Contact en poste chez le compte (export 2024, à revalider)',
  externe: 'Prestataire externe en poste chez le compte (export 2024, à revalider)',
  ancien: 'Profil ayant exercé chez le compte, aujourd’hui ailleurs',
}

const KIND_SCORE: Record<'ancien' | 'externe' | 'poste', number> = { poste: 30, externe: 30, ancien: 20 }

/** Un décideur identifié au dossier de compte : le rang des briefs (`ROLE_META.decision_maker`). */
/** 15/10/2026 (recette R24) — `economic`, le rôle que lit le badge « Décideur » ET le compteur « Décideurs » : une seule source. */
const DECISION_MAKER_ROLE = 'economic'
const DECISION_MAKER = { tag: 'Décideur', priority: 1, score: 50 } as const

const KIND_FOR_SENIORITY: Record<'ancien' | 'externe' | 'poste', BpceContactKind> = {
  poste: 'operationnel',
  externe: 'externe',
  ancien: 'ancien',
}

/** La famille du relevé vers les familles de `contactFamilySchema`. Sans correspondance → titre, sinon VIDE. */
const FAMILY_MAP: Record<string, string> = {
  'Développement logiciel': 'Dev',
  Développement: 'Dev',
  'Data / IA': 'Data',
  'Chef de projet': 'PMO',
  'Gestion de projet / PMO': 'PMO',
  'Infrastructure / Cloud / SRE': 'Infra',
  'Infra / Cloud': 'Infra',
  Cybersécurité: 'Cyber',
}

type OrangeContact = {
  full_name: string
  title: string
  entity: string
  family: string
  decision_role: string
  priority: number
  email: string | null
  phone: string | null
  linkedin_url: string | null
  profile_summary: string
  why_contact: string
  contact_score: number
  seniority: string
  lifecycle_state: string
  key_points: string[]
  tags: string[]
  /** Les `person_key` du relevé que cette fiche porte (plusieurs si deux clés ont le même nom). */
  personKeys: string[]
}

type Person = {
  rows: CompteCsvRow[]
  personKeys: string[]
}

type BriefPerson = CommercialBrief['people'][number]

const isCurrent = (row: CompteCsvRow): boolean => /#current/.test(row.source ?? '')
const isFormer = (row: CompteCsvRow): boolean => /#previous/.test(row.source ?? '')

const frequencyOrder = (labels: string[]): string[] => {
  const counts = new Map<string, number>()
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label)
}

function groupPeople(rows: readonly CompteCsvRow[]): Person[] {
  const byKey = new Map<string, Person>()
  const byName = new Map<string, Person>()
  const people: Person[] = []
  for (const row of rows) {
    const key = row.person_key ?? ''
    const name = (row.full_name ?? '').trim().toLowerCase()
    const person = byKey.get(key) ?? byName.get(name) ?? { rows: [], personKeys: [] }
    if (person.rows.length === 0) people.push(person)
    person.rows.push(row)
    if (!person.personKeys.includes(key)) person.personKeys.push(key)
    byKey.set(key, person)
    byName.set(name, person)
  }
  return people
}

function buildContact(person: Person, dossier: BriefPerson | undefined): OrangeContact {
  const current = person.rows.filter(isCurrent)
  const decisive = current.length > 0 ? current : person.rows
  // L'entité la plus précise : une entité nommée bat le groupe lui-même.
  const entityRow = decisive.find(row => row.account_name !== DEMO_ORANGE_COMPANY) ?? decisive[0]
  const entity = orangeEntityLabel(entityRow?.account_name ?? DEMO_ORANGE_COMPANY)
  const first = decisive[0]
  const named = person.rows[0]
  const esn = [...new Set(person.rows.map(row => row.esn_current).filter((v): v is string => Boolean(v)))]
  const kind: 'ancien' | 'externe' | 'poste' = current.length === 0 ? 'ancien' : esn.length > 0 ? 'externe' : 'poste'
  const title = first?.title ?? named?.title ?? ''
  const city = person.rows.map(row => row.city).find(Boolean)
  const otherEntities = [
    ...new Set(person.rows.map(row => orangeEntityLabel(row.account_name ?? '')).filter(v => v && v !== entity)),
  ]
  const flagged = [
    person.rows.some(row => row.has_email) && 'e-mail',
    person.rows.some(row => row.has_tel) && 'téléphone',
    person.rows.some(row => row.has_linkedin) && 'LinkedIn',
  ].filter((v): v is string => typeof v === 'string')
  const family = FAMILY_MAP[first?.profile_family ?? ''] ?? familyFromTitle(title)
  const foreign = FOREIGN_ENTITY.test(entity)
  const full_name = (named?.full_name ?? '').trim()

  // Les coordonnées du dossier de compte (12/10/2026) : EN CLAIR, jamais inventées. Plusieurs adresses du groupe →
  // la première en e-mail, les suivantes au résumé (rien n'est perdu).
  const emails = (dossier?.email ?? '')
    .split('|')
    .map(value => value.trim())
    .filter(Boolean)
  const email = emails[0] ?? null
  const phone = dossier?.mobile ? formatPhone(dossier.mobile) : null
  const linkedin_url = dossier?.linkedin ?? null
  const held = [email && 'e-mail du groupe Orange', phone && 'mobile', linkedin_url && 'LinkedIn'].filter(
    (v): v is string => typeof v === 'string',
  )
  const notHeld = [
    flagged.includes('e-mail') && !email && 'e-mail',
    flagged.includes('téléphone') && !phone && 'téléphone',
    flagged.includes('LinkedIn') && !linkedin_url && 'LinkedIn',
  ].filter((v): v is string => typeof v === 'string')
  const decisionMaker = dossier?.role === 'decision_maker'

  const profile_summary = [
    `${KIND_LABEL[kind]}.`,
    decisionMaker && 'Décideur identifié au dossier de compte du 12/10/2026.',
    title && `Fonction : ${title}.`,
    `Entité : ${entity}.`,
    otherEntities.length > 0 && `Aussi relevé chez : ${otherEntities.join(', ')}.`,
    city && `Ville : ${city}.`,
    first?.profile_family && `Famille métier : ${first.profile_family}.`,
    esn.length > 0 && `ESN observée : ${esn.join(', ')}.`,
    held.length > 0 &&
      `Coordonnées reprises du dossier de compte du ${ORANGE_IMPORT_DATE} : ${held.join(', ')} (adresses du groupe Orange seulement).`,
    emails.length > 1 && `Autres adresses du groupe : ${emails.slice(1).join(', ')}.`,
    notHeld.length > 0 &&
      `Signalé par le relevé mais non repris (absent du dossier ou hors du groupe Orange — boîte personnelle, employeur tiers) : ${notHeld.join(', ')}.`,
    `Relevé importé le ${ORANGE_IMPORT_DATE} (annexe Orange du Drive « DÉMO CLIENTS », ${first?.source_date ?? 'date inconnue'}, fiabilité : ${first?.confidence ?? 'non précisée'}).`,
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ')

  const why_contact = decisionMaker
    ? `Décideur identifié au dossier de compte${title ? ` (${title})` : ''}, entité ${entity}.`
    : kind === 'ancien'
      ? `Personne relevée comme ayant exercé chez ${entity}${esn.length > 0 ? `, aujourd’hui observée chez ${esn.join(', ')}` : ''}.`
      : kind === 'externe'
        ? `Prestataire relevé en poste chez ${entity} (ESN observée : ${esn.join(', ')}).`
        : `Personne relevée en poste chez ${entity}.`

  const contact: OrangeContact = {
    full_name,
    title,
    entity,
    family,
    // Recette 12/10 : les 478 fiches tombaient dans « Persona à qualifier ». Un décideur du dossier porte le rôle du
    // comité d'achat de l'organigramme (`influencer` : le dossier ne dit pas qui tient le budget) ; les autres : `unknown`.
    decision_role: decisionMaker ? DECISION_MAKER_ROLE : 'unknown',
    priority: decisionMaker ? DECISION_MAKER.priority : 3,
    email,
    phone,
    linkedin_url,
    profile_summary,
    why_contact,
    contact_score: decisionMaker ? DECISION_MAKER.score : KIND_SCORE[kind],
    seniority: seniorityOf(title, decisionMaker ? 'manager' : KIND_FOR_SENIORITY[kind]),
    lifecycle_state: 'detecte',
    key_points: [
      decisionMaker && 'Décideur identifié au dossier de compte',
      title && `Fonction relevée : ${title}`,
      esn.length > 0 && `ESN observée : ${esn.join(', ')}`,
      foreign && `Entité hors France : ${entity}`,
    ].filter((part): part is string => typeof part === 'string' && part.length > 0),
    tags: [
      ...(decisionMaker ? [DECISION_MAKER.tag] : []),
      KIND_TAG[kind],
      ...(esn.length > 0 ? ['ESN observée'] : []),
      ...(foreign ? ['Hors France'] : []),
    ],
    personKeys: person.personKeys,
  }
  contact.lifecycle_state = computeContactLifecycleState({
    fullName: contact.full_name,
    title: contact.title,
    entity: contact.entity,
    role: contact.decision_role,
    email: contact.email,
    phone: contact.phone,
    linkedinUrl: contact.linkedin_url,
  })
  return contact
}

/**
 * Les fiches du compte : le relevé (une fiche par personne) ENRICHI du dossier de compte quand il le porte (`dossier`),
 * puis les personnes que SEUL le dossier cite (le CIO d'une étude de cas, un contact de besoin) — jamais redoublées.
 * Ordre = celui du dossier (les décideurs d'abord, puis le classement d'exploitabilité) ; une fiche que le dossier
 * ignore ferme la marche.
 */
export function routeOrangeRows(rows: readonly CompteCsvRow[], dossier?: CommercialBrief) {
  const byName = new Map((dossier?.people ?? []).map(person => [normalizePersonName(person.name), person]))
  const fromReleve = groupPeople(rows).map(person =>
    buildContact(person, byName.get(normalizePersonName(person.rows[0]?.full_name ?? ''))),
  )
  const known = new Set(fromReleve.map(contact => normalizePersonName(contact.full_name)))
  const onlyInDossier: OrangeContact[] = dossier
    ? briefContactSeeds(dossier, known).map(seed => ({
        ...seed,
        // Le même rôle que les décideurs du relevé (voir `buildContact`) — le CIO cité par un tiers en est un.
        ...(seed.tags.includes(DECISION_MAKER.tag)
          ? {
              decision_role: DECISION_MAKER_ROLE,
              lifecycle_state: computeContactLifecycleState({
                fullName: seed.full_name,
                title: seed.title,
                entity: seed.entity,
                role: DECISION_MAKER_ROLE,
                email: seed.email,
                phone: seed.phone,
                linkedinUrl: seed.linkedin_url,
              }),
            }
          : {}),
        // Une personne que le relevé ne porte pas : pas de clé de relevé, jamais de ligne du relevé perdue.
        personKeys: [],
      }))
    : []
  const rank = new Map((dossier?.people ?? []).map((person, index) => [normalizePersonName(person.name), index]))
  const END = Number.MAX_SAFE_INTEGER
  const contacts = [...fromReleve, ...onlyInDossier].sort(
    (a, b) => (rank.get(normalizePersonName(a.full_name)) ?? END) - (rank.get(normalizePersonName(b.full_name)) ?? END),
  )
  const allEntities = frequencyOrder(rows.map(row => orangeEntityLabel(row.account_name ?? '')).filter(Boolean))
  // Le groupe d'abord, puis les entités par effectif décroissant dans le relevé.
  const entities = [DEMO_ORANGE_COMPANY, ...allEntities.filter(entity => entity !== DEMO_ORANGE_COMPANY)]
  return {
    contacts,
    entities,
    foreignEntities: entities.filter(entity => FOREIGN_ENTITY.test(entity)),
    stats: {
      rows: rows.length,
      currentRows: rows.filter(isCurrent).length,
      formerRows: rows.filter(isFormer).length,
    },
  }
}
