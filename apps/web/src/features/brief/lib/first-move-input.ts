import { displayableAngleProof } from '@bellum/contracts'
import type { Account, Contact, FirstMoveInput } from '@bellum/contracts'

/**
 * Ce que le dossier sait déjà, mis en forme pour le premier mouvement.
 *
 * ⚠️ Ce fichier est la moitié qui manquait. `firstMove()` peut être allumé et
 * ne rien produire si on l'appelle avec des `null` partout — c'est le défaut
 * récurrent de cette série : une fonction juste, testée, nourrie de vide.
 * Chaque champ ci-dessous est lu depuis `raw_analysis`, qui les porte déjà.
 *
 * Règle constante : ce qui n'est pas dans le dossier reste `null`. Une valeur
 * par défaut ferait tirer une règle d'interdit sur une supposition, et un
 * interdit faux coûte un compte.
 */

/** Le registre dit une scale-up, ou personne ne le dit. */
const SCALEUP_STATUTS = new Set(['scaleup'])

/**
 * Mots d'un intitulé qui désignent un poste PRODUIT (interdit de vocabulaire).
 *
 * ⚠️ Trouvé en recette live le 23/08 : `product` seul matche **« production »**,
 * qui en français désigne l'usine ou l'exploitation, pas le produit. Sur un
 * compte industriel — le premier essayé — « Responsable production » et
 * « Opérateur de tests, production et réparation » comptaient tous les deux
 * comme des postes produit, et l'interdit de vocabulaire se serait déclenché sur
 * une entreprise qui n'a aucune équipe produit.
 *
 * D'où des expressions ENTIÈRES plutôt que des racines. `produit` reste seul
 * parce que « production » ne le contient pas (produ-c-t-ion / produ-i-t), et
 * `po ` disparaît : deux lettres et une espace attrapent « dépôt », « poste »,
 * « point ». Un interdit tire toute sa valeur de sa rareté ; un faux positif en
 * coûte cinq.
 */
const PRODUCT_ROLE_WORDS = [
  'product owner',
  'product manager',
  'product designer',
  'produit',
  'ux',
  'design',
  'data engineer',
  'data scientist',
  'data analyst',
]

/** Technologies dont la présence signe une stack moderne. */
const MODERN_STACK = [
  'kubernetes',
  'react',
  'typescript',
  'go',
  'rust',
  'kafka',
  'snowflake',
  'databricks',
  'terraform',
]

type Raw = Record<string, unknown>

function asArray(value: unknown): Raw[] {
  return Array.isArray(value) ? (value.filter(item => item && typeof item === 'object') as Raw[]) : []
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Le département depuis un siège écrit en clair (« 93210 Saint-Denis »). */
export function departmentFromHeadquarters(headquarters: string | null | undefined): string | null {
  const match = /\b(\d{5})\b/.exec(headquarters ?? '')
  if (!match) return null
  const code = match[1] as string
  // Corse : 2A/2B ne se déduisent pas d'un code postal 20xxx, et se tromper de
  // département ferait tirer l'interdit de registre sur la mauvaise région.
  return code.startsWith('20') ? null : code.slice(0, 2)
}

export function buildFirstMoveInput(
  account: Account,
  _contacts: readonly Contact[],
  entities: readonly { name: string; score: number }[] = [],
): FirstMoveInput {
  const raw = (account.raw_analysis ?? {}) as Raw
  const barrier = (raw['access_barrier'] ?? raw['accessBarrier'] ?? null) as Raw | null
  const jobs = asArray(raw['it_job_signals'])
  const awarded = asArray(raw['awarded_contracts'])
  const stack = asArray(raw['technology_stack']).map(item => text(item['name']).toLowerCase())
  const angles = asArray(raw['angles'])
  const partners = asArray(raw['esn_presence'] ?? raw['esnPresence'])

  const productRoles = jobs.filter(job => {
    const title = ` ${text(job['title'] ?? job['label']).toLowerCase()} `
    return PRODUCT_ROLE_WORDS.some(word => title.includes(word))
  }).length

  // L'entité la mieux classée vient du CLASSEMENT réel (onglet Accès), jamais
  // du premier nom trouvé : proposer une entité au hasard est exactement ce que
  // l'interdit d'entité cherche à empêcher.
  const ranked = [...entities].sort((left, right) => right.score - left.score)
  const best = ranked[0]
  const fallback = ranked[1]

  const headcountMatch = /\d[\d\s ]*/.exec(text(account.employees))
  const headcount = headcountMatch ? Number(headcountMatch[0].replace(/[\s ]/g, '')) : null

  const partnerWithDate = partners.find(partner => text(partner['detectedAt'] ?? partner['detected_at']))
  const partnerName = text(partnerWithDate?.['name'])

  return {
    accountName: account.company_name,
    barrierScore: typeof barrier?.['score'] === 'number' ? (barrier['score'] as number) : null,
    barrierClass: (barrier?.['access_class'] as FirstMoveInput['barrierClass']) ?? null,
    bestEntity: best ? { name: best.name, score: best.score, city: null } : null,
    fallbackEntity: fallback ? { name: fallback.name } : null,
    headquartersCity: account.headquarters ?? null,
    headquartersDepartment: departmentFromHeadquarters(account.headquarters),
    publicContracts: awarded.length > 0 ? awarded.length : null,
    openProductRoles: jobs.length > 0 ? productRoles : null,
    modernStack: stack.some(tech => MODERN_STACK.some(modern => tech.includes(modern))),
    integratorPartnership: partnerName
      ? {
          name: partnerName,
          announcedAt: text(partnerWithDate?.['detectedAt'] ?? partnerWithDate?.['detected_at']) || null,
        }
      : null,
    isScaleup: SCALEUP_STATUTS.has(text(barrier?.['statut'])),
    headcount: Number.isFinite(headcount) ? headcount : null,
    // Une structure produit autonome se lit sur l'effectif d'une entité ; sans
    // cet effectif, on ne l'invente pas.
    autonomousProductTeam: null,
    sector: account.sector ?? null,
    angle: text(angles[0]?.['title']) || null,
    // ⚠️ Ce champ a écrit `null` EN DUR pendant tout ce temps, si bien que le
    // bloc « ce qu'on peut prouver » annonçait « aucune preuve mobilisable » sur
    // TOUS les comptes, y compris ceux qui en avaient une. Ce n'était pas un
    // oubli : la preuve n'avait pas de champ où être lue — elle vivait noyée
    // dans la prose de `strategy`. Elle en a un depuis le 29/08/2026, et
    // `displayableAngleProof` est ce qui décide si elle est soutenable ; une
    // preuve non vérifiable ne se relaie pas parce qu'elle est écrite.
    proof: displayableAngleProof(angles[0] ?? {}),
    silenceDays: 7,
  } satisfies FirstMoveInput
}
