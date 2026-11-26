import { decideFieldWrite, type FieldSource } from './provenance.js'

/**
 * #3935.2b (lot M07, 09/10) — LES EXPÉRIENCES LUES DANS UN CV, STRUCTURÉES, ARBITRÉES.
 *
 * Le bloc `experiences` du CV était lu en TEXTE LIBRE et jamais écrit : la table
 * `consultant_experiences` existait (#2793) mais n'avait aucune provenance par
 * champ — l'écrire depuis un CV aurait pu écraser une expérience saisie à la
 * main sans le détecter (mesure du lot Z02, #3935.1). Deux pièces, pures :
 *
 *  - {@link readExperiencesFromDetection} DÉCOUPE ce que le modèle a rendu au
 *    format fermé « rôle | entreprise | début | fin | réalisations ». Un segment
 *    vide reste `null` ; une ligne hors format est IGNORÉE, jamais devinée ;
 *  - {@link planExperienceWrites} décide, champ par champ, ce qu'une lecture a le
 *    droit d'écrire — par le MÊME arbitre que la fiche (`decideFieldWrite`) :
 *    une correction humaine gagne toujours, une provenance inconnue (ligne
 *    antérieure à ce lot) n'est jamais écrasée par le modèle.
 */

/**
 * #3935 (lot P03, décision Louis 09/10) — la PRÉCISION d'une date d'expérience
 * lue dans un CV : `year` (« 2019 ») ou `month` (« 03/2019 »). Colonnes
 * `consultant_experiences.date_debut_precision` / `date_fin_precision`, CHECK
 * nommés (`1796437902201-ConsultantExperienceDatePrecision`, GA-12). `NULL` =
 * la date se lit telle qu'elle est stockée (saisie à la main, ligne antérieure).
 */
export const EXPERIENCE_DATE_PRECISIONS = ['year', 'month'] as const
export type ExperienceDatePrecision = (typeof EXPERIENCE_DATE_PRECISIONS)[number]

/** Les champs qu'une lecture de CV peut écrire — noms de colonnes de `consultant_experiences`. */
export const CV_EXPERIENCE_FIELDS = ['role', 'entreprise', 'date_debut', 'date_fin', 'realisations'] as const
type CvExperienceField = (typeof CV_EXPERIENCE_FIELDS)[number]

export type CvExperience = Record<CvExperienceField, string | null>

/** La provenance par champ d'une ligne — la colonne `consultant_experiences.field_provenance`. */
export type ExperienceFieldProvenance = Partial<Record<string, FieldSource>>

/**
 * Une date telle que le CV l'écrit → sa forme CANONIQUE, à SA précision, ou `null`.
 *
 * #3935 (lot P03, décision Louis 09/10) — la précision voyage DANS la valeur :
 * `AAAA` (année seule, « 2019 – 2021 »), `AAAA-MM` (`MM/AAAA` aussi), `AAAA-MM-JJ`.
 * Une année n'est JAMAIS complétée en mois, un mois jamais en jour : l'arbitre
 * (`planExperienceWrites`, inchangé) compare des valeurs telles que lues, et
 * le stockage ({@link toStoredExperienceDate}) sépare date et précision.
 * « En cours », « aujourd'hui » : `null` (la ligne reste ouverte, sans fin inventée).
 */
function readExperienceDate(raw: string): string | null {
  const text = raw.trim()
  if (/^\d{4}$/.test(text)) return text
  if (/^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/.test(text)) return text
  const slashed = /^(0?[1-9]|1[0-2])\/(\d{4})$/.exec(text)
  if (slashed) return `${slashed[2]}-${slashed[1].padStart(2, '0')}`
  return null
}

/**
 * #3935 (lot P03) — la forme lue → les colonnes `date` + `*_precision`. Le 1er
 * janvier (année) ou le 1er du mois n'est qu'une CONVENTION de stockage : la
 * précision dit ce qu'on sait, et l'écran n'affiche rien au-delà.
 */
export function toStoredExperienceDate(value: string | null): {
  date: string | null
  precision: ExperienceDatePrecision | null
} {
  if (value === null) return { date: null, precision: null }
  if (/^\d{4}$/.test(value)) return { date: `${value}-01-01`, precision: 'year' }
  if (/^\d{4}-\d{2}$/.test(value)) return { date: `${value}-01`, precision: 'month' }
  return { date: value, precision: null }
}

/** #3935 (lot P03) — les colonnes stockées → la forme lue, pour que l'arbitre compare à précision égale. */
export function fromStoredExperienceDate(
  date: string | null,
  precision: ExperienceDatePrecision | null,
): string | null {
  if (date === null) return null
  if (precision === 'year') return date.slice(0, 4)
  if (precision === 'month') return date.slice(0, 7)
  return date
}

/**
 * #3935 (lot P03) — ce que l'écran affiche : « 2019 » pour une année, « 2019-03 »
 * pour un mois. Sans précision (saisie à la main, ligne antérieure), la date se
 * lit au mois, comme avant ce lot.
 */
export function formatExperienceDate(date: string | null, precision: ExperienceDatePrecision | null): string | null {
  if (date === null) return null
  return precision === 'year' ? date.slice(0, 4) : date.slice(0, 7)
}

function readSegment(raw: string | undefined): string | null {
  const text = raw?.trim() ?? ''
  return text === '' ? null : text
}

/**
 * Le bloc `experiences` → des expériences structurées. Une entrée par ligne au
 * format « rôle | entreprise | début | fin | réalisations » (quatre barres ;
 * les réalisations peuvent manquer). Une ligne sans rôle NI entreprise n'a
 * rien qui la désigne : ignorée. Une ligne en texte libre (sans barres, ou
 * avec un nombre de segments inattendu) : ignorée — on ne devine pas quel
 * morceau est le client.
 */
export function readExperiencesFromDetection(value: string | readonly string[] | number | null): CvExperience[] {
  if (value === null || typeof value === 'number') return []
  const lines = typeof value === 'string' ? value.split('\n') : value
  const experiences: CvExperience[] = []
  for (const line of lines) {
    const segments = line.split('|')
    if (segments.length < 4 || segments.length > 5) continue
    const [role, entreprise, start, end, realisations] = segments
    const experience: CvExperience = {
      role: readSegment(role),
      entreprise: readSegment(entreprise),
      date_debut: readExperienceDate(start ?? ''),
      date_fin: readExperienceDate(end ?? ''),
      realisations: readSegment(realisations),
    }
    if (experience.role === null && experience.entreprise === null) continue
    experiences.push(experience)
  }
  return experiences
}

function normalized(value: string | null): string {
  return (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Même expérience = même rôle ET même entreprise (casse, accents, espaces ignorés). */
function sameExperience(a: CvExperience, b: CvExperience): boolean {
  return normalized(a.role) === normalized(b.role) && normalized(a.entreprise) === normalized(b.entreprise)
}

type ExistingExperience = { id: string; values: CvExperience; provenance: ExperienceFieldProvenance }

type ExperienceWritePlan = {
  inserts: { values: CvExperience; provenance: ExperienceFieldProvenance }[]
  updates: { id: string; patch: Partial<CvExperience>; provenance: ExperienceFieldProvenance }[]
}

/**
 * Ce qu'une lecture a le droit d'écrire dans `consultant_experiences`.
 *
 * - une expérience INCONNUE de la fiche → une ligne neuve, chaque champ lu
 *   porté par la provenance de la lecture ;
 * - une expérience DÉJÀ là (même rôle, même entreprise) → seuls les champs que
 *   `decideFieldWrite` autorise : jamais au-dessus d'un humain, jamais un blanc
 *   sur une valeur, jamais au-dessus d'une provenance inconnue ;
 * - une ligne absente de la nouvelle lecture n'est JAMAIS retirée (on
 *   archive, on ne supprime pas) — et une ressemblance n'est jamais fusionnée.
 */
export function planExperienceWrites(input: {
  incoming: readonly CvExperience[]
  existing: readonly ExistingExperience[]
  source: FieldSource
}): ExperienceWritePlan {
  const plan: ExperienceWritePlan = { inserts: [], updates: [] }
  const seen: CvExperience[] = []
  for (const experience of input.incoming) {
    if (seen.some(other => sameExperience(other, experience))) continue
    seen.push(experience)

    const match = input.existing.find(row => sameExperience(row.values, experience))
    if (!match) {
      const provenance: ExperienceFieldProvenance = {}
      for (const field of CV_EXPERIENCE_FIELDS) {
        if (experience[field] !== null) provenance[field] = input.source
      }
      plan.inserts.push({ values: experience, provenance })
      continue
    }

    const patch: Partial<CvExperience> = {}
    const provenance: ExperienceFieldProvenance = {}
    for (const field of CV_EXPERIENCE_FIELDS) {
      const decision = decideFieldWrite({
        incomingValue: experience[field],
        incomingSource: input.source,
        currentValue: match.values[field],
        currentSource: match.provenance[field] ?? null,
      })
      if (!decision.write) continue
      patch[field] = experience[field]
      provenance[field] = input.source
    }
    if (Object.keys(patch).length > 0) plan.updates.push({ id: match.id, patch, provenance })
  }
  return plan
}
