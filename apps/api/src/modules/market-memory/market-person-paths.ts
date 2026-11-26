import { createHash, createHmac } from 'node:crypto'
import { findDirectIdentifierColumn, stripDirectIdentifiers } from './market-memory-identifiers'
import { marketMatchKey } from './market-company-key'
import { optionalDecimal, optionalText } from './market-memory-import'

/**
 * Les PARCOURS individuels du pack (05_freelances.csv), lus SANS identité — lot 775, décision Louis 02/11/2026.
 *
 * ⚠️ HYPOTHÈSE EXPLICITE : le schéma des colonnes de `05_freelances.csv` n'est documenté nulle part dans le dépôt
 * (seul son nom l'est). On lit donc par ALIAS tolérants (ci-dessous) ; une colonne inconnue est IGNORÉE, jamais
 * devinée. À confirmer sur le vrai pack par l'opérateur (la commande est dans la PR).
 *
 * Ordre à la lecture : (1) on calcule le pseudonyme `person_key` (HMAC salé) depuis un identifiant OPAQUE du pack
 * (`id`, `id_freelance`…) ou, à défaut, depuis les identifiants directs présents — seulement en mémoire, le temps
 * du calcul ; (2) `stripDirectIdentifiers` retire toute colonne d'identifiant direct ; (3) le brouillon est bâti sur
 * l'enregistrement RESTANT. Aucun identifiant direct n'existe donc dans le brouillon, ni en base, ni dans un journal.
 */

export interface PersonPathContext {
  /** `MARKET_MEMORY_PERSON_HASH_KEY`. Vide ⇒ l'import REFUSE. */
  readonly hashKey: string
  readonly corpusLabel: string
  readonly datasetVersion: string | null
  readonly sourceChecksum: string | null
  /** Résolution de l'entreprise par le MÊME mécanisme que les autres market_* (clé du corpus ou clé normalisée). */
  readonly resolveCompanyKey: (input: {
    companyKey: string | null
    matchKey: string
    siren: string | null
  }) => string | null
}

type PersonWorkStatus = 'freelance' | 'esn' | 'salarie' | 'inconnu'

interface PersonPathDraft {
  personKey: string
  companyKey: string
  companyName: string | null
  matchKey: string | null
  siren: string | null
  jobTitle: string | null
  roleFamily: string | null
  skills: string[]
  startDate: string | null
  endDate: string | null
  datePrecision: 'day' | 'month' | 'year' | null
  workStatus: PersonWorkStatus
  esnName: string | null
  esnKey: string | null
  dailyRateEur: number | null
  missionCity: string | null
  missionRegion: string | null
  corpusLabel: string
  datasetVersion: string | null
  sourceChecksum: string | null
}

const first = (record: Readonly<Record<string, string>>, aliases: readonly string[]): string | null => {
  for (const alias of aliases) {
    const value = optionalText(record[alias])
    if (value !== null) return value
  }
  return null
}

const OPAQUE_ID = ['id', 'id_freelance', 'freelance_id', 'id_personne', 'person_id', 'cle_personne']

/** Une date `YYYY`, `YYYY-MM` ou `YYYY-MM-DD` → `YYYY-MM-DD` + sa précision ; sinon `null`. */
export function parsePathDate(value: string | null): { date: string; precision: 'day' | 'month' | 'year' } | null {
  if (value === null) return null
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(value.trim())
  if (!match) return null
  const [, year, month, day] = match
  if (month === undefined) return { date: `${year}-01-01`, precision: 'year' }
  if (day === undefined) return { date: `${year}-${month}-01`, precision: 'month' }
  return { date: `${year}-${month}-${day}`, precision: 'day' }
}

export function parseWorkStatus(value: string | null): PersonWorkStatus {
  const text = (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (/freelance|independant|portage/.test(text)) return 'freelance'
  if (/\besn\b|ssii|societe de services|consultant/.test(text)) return 'esn'
  if (/salarie|cdi|cdd|employe/.test(text)) return 'salarie'
  return 'inconnu'
}

const splitSkills = (value: string | null): string[] =>
  value === null
    ? []
    : [
        ...new Set(
          value
            .split(/[,|·/]/)
            .map(item => item.trim())
            .filter(item => item.length > 0),
        ),
      ]

/**
 * Un enregistrement du pack → un parcours, ou `null` (entreprise non résolue : jamais devinée).
 * Lève si la clé de hash manque — l'import refuse, no-op strict.
 */
export function parsePersonPath(
  raw: Readonly<Record<string, string>>,
  context: PersonPathContext,
): PersonPathDraft | null {
  if (context.hashKey.trim().length === 0) {
    throw new Error('MARKET_MEMORY_PERSON_HASH_KEY absente : l’import des parcours refuse (no-op strict).')
  }

  // (1) Pseudonyme — l'identité n'existe qu'ici, en mémoire, le temps du calcul.
  const opaque = first(raw, OPAQUE_ID)
  const identitySeed =
    opaque !== null
      ? `id:${opaque}`
      : Object.entries(raw)
          .filter(([column, value]) => value.trim().length > 0 && findDirectIdentifierColumn([column]) !== null)
          .map(([column, value]) => `${column}=${value.trim().toLowerCase()}`)
          .sort()
          .join('|')
  const personKey = createHmac('sha256', context.hashKey)
    .update(identitySeed.length > 0 ? identitySeed : `row:${JSON.stringify(raw)}`)
    .digest('hex')

  // (2) Retrait des identifiants directs, AVANT toute autre lecture.
  const record = stripDirectIdentifiers(raw)

  const companyName = first(record, ['entreprise', 'entreprise_nom', 'client_nom', 'societe'])
  const matchKey = companyName === null ? '' : marketMatchKey(companyName)
  const siren = (first(record, ['siren']) ?? '').replace(/\D/g, '')
  const companyKey = context.resolveCompanyKey({
    companyKey: first(record, ['cle_entreprise', 'entreprise_cle', 'cle']),
    matchKey,
    siren: siren.length === 9 ? siren : null,
  })
  if (companyKey === null) return null

  const start = parsePathDate(first(record, ['date_debut', 'debut', 'annee_debut']))
  const end = parsePathDate(first(record, ['date_fin', 'fin', 'annee_fin']))
  const rate = optionalDecimal(first(record, ['tjm', 'tjm_eur', 'taux_journalier']) ?? undefined)
  const dailyRateEur = rate !== null && Number(rate) > 0 ? Math.round(Number(rate)) : null
  const esnName = first(record, ['esn', 'esn_nom'])
  const status = parseWorkStatus(first(record, ['statut', 'type_contrat', 'statut_professionnel']))

  return {
    personKey,
    companyKey,
    companyName,
    matchKey: matchKey.length > 0 ? matchKey : null,
    siren: siren.length === 9 ? siren : null,
    jobTitle: first(record, ['poste', 'intitule', 'titre']),
    roleFamily: first(record, ['famille_role', 'famille_de_role', 'famille']),
    skills: splitSkills(first(record, ['competences', 'technos', 'techno'])),
    startDate: start?.date ?? null,
    endDate: end?.date ?? null,
    datePrecision: start?.precision ?? end?.precision ?? null,
    workStatus: status,
    esnName,
    esnKey: esnName === null ? null : marketMatchKey(esnName),
    dailyRateEur,
    missionCity: first(record, ['ville_mission', 'ville']),
    missionRegion: first(record, ['region_mission', 'region']),
    corpusLabel: context.corpusLabel,
    datasetVersion: context.datasetVersion,
    sourceChecksum: context.sourceChecksum,
  }
}

/** L'empreinte d'une ligne : rejouer le même pack donne les mêmes clés (idempotent, reprenable). */
export function personPathRowKey(
  draft: Pick<PersonPathDraft, 'personKey' | 'companyKey' | 'jobTitle' | 'startDate' | 'endDate'>,
): string {
  return createHash('sha256')
    .update(
      [draft.personKey, draft.companyKey, draft.jobTitle ?? '', draft.startDate ?? '', draft.endDate ?? ''].join(
        '\u0000',
      ),
    )
    .digest('hex')
}
