import type { CommercialBrief } from '../schemas/commercial-brief.js'
import { PRICE_CHANNELS } from '../schemas/commercial-brief.js'

/**
 * Contrôles MÉTIER du brief commercial (chantier « briefs comptes », 01/10/2026).
 *
 * Le schéma zod tient la FORME ; ces fonctions PURES tiennent ce qu'une forme
 * valide peut encore mentir : un siège contredit par un site (incident BPCE :
 * « Strasbourg » sorti comme siège, alors que le siège est Tours Duo, Paris
 * 13e), une personne d'une entité sortie du groupe non marquée, un prix
 * moyenné entre canaux, notre propre activité commerciale affichée comme un
 * fait sur le compte…
 *
 * Elles tournent aussi sur un brief NON parsé (seeder démo, pipeline IA en
 * cours de construction) : chaque lecture est défensive, et les codes que le
 * schéma tient déjà (HQ_MISSING, PRICE_CHANNEL_MISSING, ESN_EVIDENCE_MISSING,
 * MEANING_MISSING, GUARDRAILS_MISSING) sont revérifiés ici pour porter un code
 * et un chemin lisibles, pas une erreur zod.
 */

export type BriefViolationCode =
  | 'NOT_FRANCE'
  | 'NOT_SWITZERLAND'
  | 'HQ_MISSING'
  | 'HQ_CONTRADICTED'
  | 'EXITED_ENTITY_UNMARKED'
  | 'PRICE_CHANNEL_MISSING'
  | 'PRICE_AVERAGED'
  | 'ESN_EVIDENCE_MISSING'
  | 'OWN_PERFORMANCE'
  | 'MEANING_MISSING'
  | 'GUARDRAILS_MISSING'

type BriefViolation = { code: BriefViolationCode; path: string; message: string }

/**
 * Ce qui décrit NOTRE activité commerciale (statut de relation, tentatives,
 * faux numéros, taux de réponse, nos relances…) et n'a rien à faire dans un
 * brief sur le COMPTE. FR + EN, écrit sous forme normalisée (minuscules, sans
 * accents, ponctuation → espace) ; comparé mot entier.
 */
export const OWN_PERFORMANCE_LEXICON = [
  // FR
  'statut relation',
  'statut de relation',
  'statut de la relation',
  'tentative',
  'tentatives',
  'faux numero',
  'mauvais numero',
  'numero errone',
  'taux de reponse',
  'taux d ouverture',
  'taux de rappel',
  'nos relances',
  'notre relance',
  'nb relances',
  'nombre de relances',
  'derniere relance',
  'date de relance',
  'injoignable',
  'repondeur',
  'messagerie vocale',
  'pas de reponse',
  'sans reponse',
  'deja contacte',
  'contacte le',
  'rdv obtenu',
  // EN
  'relationship status',
  'relation status',
  'call attempt',
  'call attempts',
  'contact attempts',
  'wrong number',
  'response rate',
  'reply rate',
  'open rate',
  'callback rate',
  'our follow up',
  'follow ups',
  'last follow up',
  'no answer',
  'no reply',
  'voicemail',
  'unreachable',
  'contacted on',
  'already contacted',
] as const

type DeepPartial<T> = T extends readonly (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T
type LooseBrief = DeepPartial<CommercialBrief>

/** Minuscules, sans accents, toute ponctuation → un espace. */
const norm = (value: unknown): string =>
  typeof value === 'string'
    ? value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    : ''

/** « PARIS 13e », « Paris 75013 », « Paris Cedex » → « paris ». */
const normCity = (value: unknown): string =>
  norm(value)
    .replace(/\s+cedex(\s+\d+)?$/, '')
    .replace(/\s+\d{1,5}\s*(e|er|eme)?$/, '')
    .trim()

const hasPhrase = (text: string, phrase: string): boolean => ` ${text} `.includes(` ${phrase} `)

const PRICE_WORDS = ['prix', 'tjm', 'tarif', 'tarifs', 'taux journalier', 'day rate', 'daily rate', 'price', 'prices']
const AVERAGE_WORDS = [
  'moyen',
  'moyenne',
  'moyens',
  'moyennes',
  'average',
  'avg',
  'mean',
  'blended',
  'mixte',
  'tous canaux',
  'inter canaux',
  'all channels',
  'cross channel',
]
const isAveragedPrice = (value: unknown): boolean => {
  const text = norm(value)
  return PRICE_WORDS.some(w => hasPhrase(text, w)) && AVERAGE_WORDS.some(w => hasPhrase(text, w))
}

const ownPerformanceTerm = (value: unknown): string | undefined => {
  const text = norm(value)
  return text ? OWN_PERFORMANCE_LEXICON.find(term => hasPhrase(text, term)) : undefined
}

const v = (code: BriefViolationCode, path: string, message: string): BriefViolation => ({ code, path, message })

// NOT_FRANCE : aucune exception, pas même `kind: 'other'` — une référence de coût
// étrangère se range dans `prices` (canal `sector_reference`), qui n'a pas de pays.
// Périmètre « suisse » (ABB Suisse, décision Louis 04/10/2026) : même règle, le pays attendu est CH — jamais FR + CH mêlés.
const checkFrance = (b: LooseBrief): BriefViolation[] => {
  const swiss = b.scope === 'suisse'
  const country = swiss ? 'CH' : 'FR'
  const code: BriefViolationCode = swiss ? 'NOT_SWITZERLAND' : 'NOT_FRANCE'
  const where = swiss ? 'hors de Suisse' : 'hors de France'
  return [
    ...(b.sites ?? []).flatMap((site, i) =>
      site?.country && site.country !== country
        ? [v(code, `sites[${i}].country`, `Site « ${site.name ?? '?'} » ${where} (${site.country}).`)]
        : [],
    ),
    ...(b.entities ?? []).flatMap((entity, i) =>
      entity?.country && entity.country !== country
        ? [v(code, `entities[${i}].country`, `Entité « ${entity.name ?? '?'} » ${where} (${entity.country}).`)]
        : [],
    ),
  ]
}

const checkHeadquarters = (b: LooseBrief): BriefViolation[] => {
  const hqCity = normCity(b.headquarters?.city)
  if (!norm(b.headquarters?.label) || !hqCity) {
    return [v('HQ_MISSING', 'headquarters', 'Le siège social (libellé et ville) est obligatoire.')]
  }
  const out: BriefViolation[] = []
  let hqSites = 0
  ;(b.sites ?? []).forEach((site, i) => {
    if (site?.kind !== 'headquarters') return
    hqSites += 1
    if (normCity(site.city) !== hqCity) {
      out.push(
        v(
          'HQ_CONTRADICTED',
          `sites[${i}].city`,
          `Le site siège « ${site.name ?? '?'} » est à ${site.city ?? '?'}, le siège déclaré à ${b.headquarters?.city ?? '?'}.`,
        ),
      )
    } else if (hqSites > 1) {
      out.push(v('HQ_CONTRADICTED', `sites[${i}].kind`, 'Plus d’un site est déclaré siège.'))
    }
  })
  return out
}

const checkExitedEntities = (b: LooseBrief): BriefViolation[] => {
  const exited = new Set((b.entities ?? []).filter(e => e?.status === 'exited').map(e => norm(e?.name)))
  exited.delete('')
  if (exited.size === 0) return []
  const message = (entity: unknown): string =>
    `« ${String(entity)} » est sortie du groupe : la ligne doit porter exited: true.`
  return [
    ...(b.people ?? []).flatMap((person, i) =>
      exited.has(norm(person?.entity)) && person?.exited !== true
        ? [v('EXITED_ENTITY_UNMARKED', `people[${i}].entity`, message(person?.entity))]
        : [],
    ),
    ...(b.sections ?? []).flatMap((section, s) =>
      (section?.rows ?? []).flatMap((row, r) =>
        exited.has(norm(row?.entity)) && row?.exited !== true
          ? [v('EXITED_ENTITY_UNMARKED', `sections[${s}].rows[${r}].entity`, message(row?.entity))]
          : [],
      ),
    ),
  ]
}

const checkPrices = (b: LooseBrief): BriefViolation[] => {
  const channels: readonly string[] = PRICE_CHANNELS
  const averaged = (path: string, label: unknown): BriefViolation[] =>
    isAveragedPrice(label)
      ? [v('PRICE_AVERAGED', path, `« ${String(label)} » : un prix se donne par canal, jamais en moyenne.`)]
      : []
  return [
    ...(b.prices ?? []).flatMap((price, i) => [
      ...(price?.channel && channels.includes(price.channel)
        ? []
        : [v('PRICE_CHANNEL_MISSING', `prices[${i}].channel`, `Prix « ${price?.label ?? '?'} » sans canal reconnu.`)]),
      ...averaged(`prices[${i}].label`, price?.label),
    ]),
    ...(b.kpis ?? []).flatMap((kpi, i) => [
      ...averaged(`kpis[${i}].label`, kpi?.label),
      ...averaged(`kpis[${i}].caption`, kpi?.caption),
    ]),
    ...(b.charts ?? []).flatMap((chart, i) => averaged(`charts[${i}].title`, chart?.title)),
  ]
}

const checkEsn = (b: LooseBrief): BriefViolation[] => {
  const levels: readonly string[] = ['confirmed', 'observed', 'hint']
  return (b.esn ?? []).flatMap((esn, i) =>
    !norm(esn?.proof) || !esn?.evidence_level || !levels.includes(esn.evidence_level)
      ? [v('ESN_EVIDENCE_MISSING', `esn[${i}]`, `ESN « ${esn?.name ?? '?'} » sans niveau de preuve ni preuve.`)]
      : [],
  )
}

/** Ne lit PAS `meaning` (un conseil peut dire « relancer ») ni les garde-fous
 *  (ils NOMMENT l'interdit) : seulement ce qui se présente comme un fait. */
const checkOwnPerformance = (b: LooseBrief): BriefViolation[] => {
  const targets: [string, unknown][] = [
    ...(b.kpis ?? []).flatMap((k, i): [string, unknown][] => [
      [`kpis[${i}].label`, k?.label],
      [`kpis[${i}].caption`, k?.caption],
      [`kpis[${i}].value`, k?.value],
    ]),
    ...(b.charts ?? []).flatMap((c, i): [string, unknown][] => [
      [`charts[${i}].title`, c?.title],
      ...(c?.items ?? []).map((it, j): [string, unknown] => [`charts[${i}].items[${j}].label`, it?.label]),
    ]),
    ...(b.what_i_know ?? []).map((w, i): [string, unknown] => [`what_i_know[${i}].known`, w?.known]),
    ...(b.people ?? []).map((p, i): [string, unknown] => [`people[${i}].hook`, p?.hook]),
    ...(b.sections ?? []).flatMap((s, i): [string, unknown][] => [
      [`sections[${i}].title`, s?.title],
      ...(s?.columns ?? []).flatMap((c, j): [string, unknown][] => [
        [`sections[${i}].columns[${j}].key`, c?.key],
        [`sections[${i}].columns[${j}].label`, c?.label],
      ]),
      ...(s?.rows ?? []).flatMap((row, r) =>
        Object.entries(row ?? {}).flatMap(([key, cell]): [string, unknown][] => [
          [`sections[${i}].rows[${r}].${key}`, key],
          [`sections[${i}].rows[${r}].${key}`, cell],
        ]),
      ),
    ]),
  ]
  const seen = new Set<string>()
  return targets.flatMap(([path, value]) => {
    const term = ownPerformanceTerm(value)
    if (!term || seen.has(path)) return []
    seen.add(path)
    return [
      v('OWN_PERFORMANCE', path, `« ${String(value)} » décrit notre activité commerciale (${term}), pas le compte.`),
    ]
  })
}

const checkMeaning = (b: LooseBrief): BriefViolation[] =>
  (b.what_i_know ?? []).flatMap((row, i) => {
    const meaning = norm(row?.meaning)
    return !meaning || meaning === norm(row?.known)
      ? [
          v(
            'MEANING_MISSING',
            `what_i_know[${i}].meaning`,
            `Rubrique « ${row?.rubric ?? '?'} » : ce que ça veut dire manque.`,
          ),
        ]
      : []
  })

const checkGuardrails = (b: LooseBrief): BriefViolation[] => {
  const guardrails = b.guardrails ?? []
  if (guardrails.length === 0) return [v('GUARDRAILS_MISSING', 'guardrails', 'Un brief se termine par ses garde-fous.')]
  return guardrails.flatMap((g, i) =>
    !norm(g?.point) || !norm(g?.detail)
      ? [v('GUARDRAILS_MISSING', `guardrails[${i}]`, 'Garde-fou vide (point et détail obligatoires).')]
      : [],
  )
}

/** Toutes les violations métier d'un brief ; `[]` = brief publiable. */
export const checkCommercialBrief = (brief: CommercialBrief): BriefViolation[] => {
  const b = brief as LooseBrief
  return [
    ...checkFrance(b),
    ...checkHeadquarters(b),
    ...checkExitedEntities(b),
    ...checkPrices(b),
    ...checkEsn(b),
    ...checkOwnPerformance(b),
    ...checkMeaning(b),
    ...checkGuardrails(b),
  ]
}
