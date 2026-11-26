/**
 * #4016 L4.1 — L'E-MAIL DÉDUIT DU MOTIF DE L'ENTREPRISE (décision Louis
 * 11/10/2026, `c95_estimation_badgee`).
 *
 * Une entreprise écrit ses adresses selon UN motif (`prenom.nom@`, `p.nom@`…).
 * Quand Bellum connaît déjà plusieurs adresses VÉRIFIÉES d'un domaine, il peut
 * en déduire celle d'une personne dont on n'a que le nom — puis la VÉRIFIER
 * (MX + SMTP, sans jamais envoyer de message, côté API). Elle s'affiche alors
 * « estimé, vérifié le … », provenance `inferred` ; invérifiable, elle ne
 * s'écrit pas.
 *
 * Ce fichier est la moitié PURE : apprendre, appliquer. Ce qu'il lit : un nom
 * et des adresses. Rien d'autre — aucun critère protégé (c58) n'entre ici, ni
 * âge, ni genre, ni origine : le motif est celui de l'ENTREPRISE.
 */
import { emailDomainOf, isPublicEmailDomain } from './professional-email.js'

/** Les motifs reconnus. L'ordre départage deux motifs qui rendent la même adresse
 *  pour un nom donné (le premier gagne) — il ne départage JAMAIS deux motifs à
 *  égalité de soutien, qui ne désignent rien. */
export const EMAIL_PATTERNS = [
  'first.last',
  'firstlast',
  'f.last',
  'flast',
  'first_last',
  'first-last',
  'last.first',
  'lastfirst',
  'first',
  'last',
] as const
type EmailPattern = (typeof EMAIL_PATTERNS)[number]

/** Combien d'adresses vérifiées doivent porter le motif pour qu'il soit appris.
 *  Une seule adresse ne fait pas un motif : elle peut être une exception. */
export const EMAIL_PATTERN_MIN_SUPPORT = 2

type NameParts = { first: string; last: string }

/** Minuscules, sans accents, sans rien d'autre que a-z. */
function normalizePart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
}

/**
 * Le prénom (premier mot) et le nom (le reste), normalisés. `null` quand l'un
 * des deux manque — un prénom seul ne s'estime pas, il se cherche.
 */
export function splitPersonName(fullName: string | null | undefined): NameParts | null {
  const words = (fullName ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length < 2) return null
  const first = normalizePart(words[0] as string)
  const last = normalizePart(words.slice(1).join(''))
  if (!first || !last) return null
  return { first, last }
}

function localPart(pattern: EmailPattern, { first, last }: NameParts): string {
  const f = first.charAt(0)
  switch (pattern) {
    case 'first.last':
      return `${first}.${last}`
    case 'firstlast':
      return `${first}${last}`
    case 'f.last':
      return `${f}.${last}`
    case 'flast':
      return `${f}${last}`
    case 'first_last':
      return `${first}_${last}`
    case 'first-last':
      return `${first}-${last}`
    case 'last.first':
      return `${last}.${first}`
    case 'lastfirst':
      return `${last}${first}`
    case 'first':
      return first
    case 'last':
      return last
  }
}

/** Les motifs qui rendent EXACTEMENT cette partie locale pour ce nom. */
export function matchingEmailPatterns(local: string, name: NameParts): EmailPattern[] {
  const normalized = local.trim().toLowerCase()
  return EMAIL_PATTERNS.filter(pattern => localPart(pattern, name) === normalized)
}

/** L'adresse que ce motif donne pour ce nom, sur ce domaine. */
export function renderEmailPattern(pattern: EmailPattern, name: NameParts, domain: string): string {
  return `${localPart(pattern, name)}@${domain.trim().toLowerCase()}`
}

type EmailSample = { email: string | null; fullName: string | null; verified: boolean }

type LearnedEmailPattern = {
  pattern: EmailPattern
  domain: string
  /** Combien d'adresses vérifiées portent ce motif. */
  support: number
  /** Combien d'adresses vérifiées du domaine ont été lues. */
  samples: number
}

/**
 * Le motif d'un domaine, appris des seules adresses VÉRIFIÉES.
 *
 * Trois refus, et chacun est une protection :
 *  - une adresse non vérifiée n'enseigne rien — une estimation n'apprend jamais
 *    d'une autre estimation ;
 *  - sous {@link EMAIL_PATTERN_MIN_SUPPORT} adresses, pas de motif ;
 *  - deux motifs à égalité ne désignent rien ;
 *  - une messagerie grand public n'enseigne rien (ce n'est pas l'entreprise).
 *
 * Le domaine retenu est le plus représenté parmi les adresses vérifiées (une
 * filiale peut écrire sur un autre domaine que le groupe).
 */
export function learnEmailPattern(samples: readonly EmailSample[]): LearnedEmailPattern | null {
  const byDomain = new Map<string, { local: string; name: NameParts }[]>()
  for (const sample of samples) {
    if (!sample.verified) continue
    const domain = sample.email ? emailDomainOf(sample.email) : null
    const name = splitPersonName(sample.fullName)
    // Une messagerie grand public (gmail…) n'a pas de motif d'ENTREPRISE.
    if (!domain || isPublicEmailDomain(domain) || !name) continue
    const local = (sample.email as string).trim().toLowerCase().split('@')[0] as string
    byDomain.set(domain, [...(byDomain.get(domain) ?? []), { local, name }])
  }
  const [domain, entries] = [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? []
  if (!domain || !entries) return null

  const support = new Map<EmailPattern, number>()
  for (const { local, name } of entries) {
    const first = matchingEmailPatterns(local, name)[0]
    if (first) support.set(first, (support.get(first) ?? 0) + 1)
  }
  const ranked = [...support.entries()].sort((a, b) => b[1] - a[1])
  const [best, runnerUp] = ranked
  if (!best || best[1] < EMAIL_PATTERN_MIN_SUPPORT) return null
  if (runnerUp && runnerUp[1] === best[1]) return null
  return { pattern: best[0], domain, support: best[1], samples: entries.length }
}
