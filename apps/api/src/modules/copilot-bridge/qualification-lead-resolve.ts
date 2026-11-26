import { INTAKE_STAGES, type ProjectReadRow } from '@bellum/contracts'

/**
 * #3345 (recette prod 03/10) — l'utilisateur nomme une piste par son LIBELLÉ
 * (« piste ACTIA Group ») ; Laura demandait l'identifiant interne. Cette
 * résolution se fait côté serveur, sur les lignes d'INTAKE de l'espace — les
 * mêmes qui font la file « Pistes à qualifier » de l'écran Opportunités.
 *
 * Un libellé qui correspond gagne sur un simple nom de compte : « piste ACTIA
 * Group » ne désigne pas toutes les pistes d'ACTIA, mais si aucun libellé ne
 * correspond, le compte seul cadre la liste à choisir. Jamais d'identifiant
 * deviné : zéro correspondance reste zéro.
 */
type QualificationLeadMatch = {
  lead_key: string
  label: string
  account_id: string
  company_name: string | null
}

type QualificationLeadResolution = {
  /** `label` : le libellé a correspondu ; `account` : seul le compte a cadré. */
  matched_on: 'label' | 'account' | 'none'
  matches: QualificationLeadMatch[]
}

const MAX_MATCHES = 10

/** Minuscules, sans accents ni ponctuation — « Risque… » et « risque » se valent. */
export function foldForMatch(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** « piste », « opportunité »… : le mot de la catégorie ne désigne aucune piste. */
const FILLER_WORDS = new Set(['piste', 'pistes', 'opportunite', 'opportunites', 'la', 'le', 'les', 'de', 'du', 'cette'])

function significant(folded: string): string {
  return folded
    .split(' ')
    .filter(word => word && !FILLER_WORDS.has(word))
    .join(' ')
}

export function resolveQualificationLeads(
  rows: readonly ProjectReadRow[],
  query: { label?: string | null; accountId?: string | null },
): QualificationLeadResolution {
  const needle = significant(foldForMatch(query.label))
  const intake = rows.filter(
    row =>
      (INTAKE_STAGES as readonly string[]).includes(row.stage) &&
      (!query.accountId || row.account_id === query.accountId),
  )
  const toMatch = (row: ProjectReadRow): QualificationLeadMatch => ({
    lead_key: row.id,
    label: row.label,
    account_id: row.account_id,
    company_name: row.company_name ?? null,
  })
  if (!needle) return { matched_on: 'none', matches: [] }

  const byLabel = intake.filter(row => {
    const label = significant(foldForMatch(row.label))
    return label.length > 0 && (label.includes(needle) || needle.includes(label))
  })
  if (byLabel.length > 0) return { matched_on: 'label', matches: byLabel.slice(0, MAX_MATCHES).map(toMatch) }

  const byAccount = intake.filter(row => {
    const company = foldForMatch(row.company_name)
    return company.length > 0 && (needle.includes(company) || company.includes(needle))
  })
  if (byAccount.length > 0) return { matched_on: 'account', matches: byAccount.slice(0, MAX_MATCHES).map(toMatch) }
  return { matched_on: 'none', matches: [] }
}
