/**
 * #4290.12 — la preuve « a quitté l'entreprise » d'un contact, lue de `raw_data.employmentCheck` (posée par la
 * relecture d'employeur). Seul `state: 'left'` AVEC un employeur observé ET une date lisible compte : « non
 * retrouvé » ne vaut pas départ, et une relecture sans date ne prouve rien. Même règle que l'écran de la fiche
 * (`contactEmploymentStatus`, web) — la liste ne la contredit pas.
 */
export function employmentLeftOf(check: unknown): { organization: string; at: string } | null {
  if (typeof check !== 'object' || check === null) return null
  const record = check as Record<string, unknown>
  const organization = typeof record['organization'] === 'string' ? record['organization'].trim() : ''
  const at = record['at']
  if (record['state'] !== 'left' || !organization) return null
  if (typeof at !== 'string' || Number.isNaN(new Date(at).getTime())) return null
  return { organization, at }
}

const LEGAL_WORDS = /\b(sa|sas|sasu|sarl|eurl|snc|se|spa|gmbh|ltd|inc|plc|group|groupe|holding|societe|the)\b/g

function foldEmployer(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(LEGAL_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Même rapprochement que `same_employer` (apps/ia `current_position`) : l'un contient l'autre, à la forme juridique près. */
function sameEmployer(left: unknown, right: unknown): boolean {
  const a = foldEmployer(left)
  const b = foldEmployer(right)
  return a !== '' && b !== '' && (a.includes(b) || b.includes(a))
}

/**
 * #4465.2 (recette 23/10, CAFPI) — la preuve « a quitté l'entreprise » lue sur le PARCOURS (`raw_data.apolloDetails
 * .employmentHistory`) : l'expérience chez `employer` (l'employeur du compte) porte une date de fin et AUCUNE autre n'y
 * est en cours (même règle que `pick_current_position`, IA). `at` = la fin la plus récente ; `organization` = l'employeur
 * actuel quand le parcours le dit, sinon vide — jamais un employeur deviné. Sans parcours lisible, sans date de fin
 * lisible, ou avec un poste en cours chez l'employeur ⇒ `null`.
 */
export function employmentLeftFromHistory(
  rawData: Record<string, unknown> | null | undefined,
  employer: string | null | undefined,
): { organization: string; at: string } | null {
  if (!employer || employer.trim() === '') return null
  const details = rawData?.['apolloDetails']
  const history =
    typeof details === 'object' && details !== null ? (details as Record<string, unknown>)['employmentHistory'] : null
  if (!Array.isArray(history)) return null
  const organizationOf = (entry: Record<string, unknown>) =>
    String(entry['organization'] ?? entry['organization_name'] ?? '').trim()
  const entries = history.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
  const here = entries.filter(entry => sameEmployer(organizationOf(entry), employer))
  if (here.length === 0) return null
  const ongoing = (entry: Record<string, unknown>) =>
    String(entry['end_date'] ?? '').trim() === '' && entry['current'] !== false
  if (here.some(ongoing)) return null
  const ends = here
    .map(entry => String(entry['end_date'] ?? '').trim())
    .filter(end => end !== '' && !Number.isNaN(new Date(end).getTime()))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
  const at = ends[0]
  if (!at) return null
  const now = entries.find(entry => entry['current'] === true && !sameEmployer(organizationOf(entry), employer))
  return { organization: now ? organizationOf(now) : '', at }
}
