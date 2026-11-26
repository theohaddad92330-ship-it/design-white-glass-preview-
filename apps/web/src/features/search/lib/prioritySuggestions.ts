import { CONSULTING_DOMAIN_BY_CODE, type EsnAnswers } from '@bellum/contracts'

/**
 * Ce que TON ESN vend — proposé comme priorités de collecte.
 *
 * #1110 — « c'est dur d'identifier des thématiques […] faudrait savoir sur quoi
 * on peut chercher, connaître un peu le glossaire pour orienter BELLUM ».
 *
 * Le champ reste LIBRE : ce sont des propositions, pas une liste fermée. Mais
 * un champ sans la moindre amorce laisse chacun deviner le vocabulaire de
 * l'outil, et deviner coûte un run.
 *
 * D'où viennent les propositions, et d'où elles ne viennent PAS. Un glossaire
 * produit figé (DATA, CYBER, CLOUD, ERP…) parlerait d'informatique à une ESN
 * d'ingénierie industrielle — le dépôt a un 8ᵉ prisme métier précisément parce
 * que le produit n'est pas IT par défaut. On ne propose donc que ce que CETTE
 * ESN a elle-même déclaré : ses domaines d'expertise saisis à l'onboarding, et
 * les libellés de son portefeuille de domaines de conseil. Rien d'inventé.
 *
 * Aucune offre saisie ⇒ AUCUNE proposition. L'écran le dit plutôt que de
 * remplir avec un vocabulaire qui n'est celui de personne.
 */

/** Au-delà, la rangée de chips devient un mur qu'on ne lit plus. */
const MAX_SUGGESTIONS = 12

/**
 * #4142 (recette R8a, Veolia, 14/10) — un domaine saisi librement par l'ESN
 * (« Cybersécurité & Conformité ») et le libellé LONG du même domaine de
 * conseil (« Cybersécurité, IAM, GRC, SOC & résilience numérique ») sont le
 * MÊME thème : le dédoublonnage à la casse près ne les voyait pas comme
 * doublons. On compare par DOMAINE D'OFFRE — le premier segment avant un
 * séparateur d'énumération (« , » / « & » / « et »), normalisé comme les
 * autres rapprochements de libellés du dépôt (minuscules, accents retirés).
 * Un domaine SANS séparateur (« Cybersécurité » seule) reste sa propre clé.
 */
function offerDomainKey(label: string): string {
  const leadingSegment = label.replace(/\([^)]*\)/g, ' ').split(/[,&/]|\bet\b/i)[0] ?? label
  const key = leadingSegment
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return THEME_SYNONYMS.get(key) ?? key
}

/**
 * #4142 (recette R16, Veolia) — deux MOTS différents pour le même thème
 * (« Développement applicatif » côté ESN, « Développement logiciel » côté
 * domaine SW_ENGINEERING) : une table de normalisation vers UN thème canonique.
 * Clés = premier segment normalisé (minuscules, sans accents).
 */
const THEME_SYNONYMS: ReadonlyMap<string, string> = new Map([
  ['developpement applicatif', 'developpement logiciel'],
  ['developpement d applications', 'developpement logiciel'],
  ['software development', 'developpement logiciel'],
  ['application development', 'developpement logiciel'],
  ['software engineering', 'developpement logiciel'],
])

export function prioritySuggestions(
  answers: Pick<EsnAnswers, 'expertise_areas' | 'offer_domains'> | undefined | null,
  language: string,
): string[] {
  if (!answers) return []
  const wanted = language.toLowerCase().startsWith('en') ? 'labelEn' : 'labelFr'
  const raw = [
    // Les domaines d'expertise sont écrits PAR l'ESN : on les rend tels quels.
    // Les normaliser produirait une chip que son auteur ne reconnaît pas.
    ...(answers.expertise_areas ?? []),
    ...(answers.offer_domains ?? []).map(code => CONSULTING_DOMAIN_BY_CODE.get(code)?.[wanted] ?? ''),
  ]

  const seen = new Set<string>()
  const seenDomains = new Set<string>()
  const out: string[] = []
  for (const value of raw) {
    const label = value.trim()
    if (!label) continue
    // Dédoublonnage à la casse près, comme la saisie du champ lui-même : deux
    // fois le même thème n'oriente pas deux fois plus.
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    // #4142 — même thème sous deux formulations (ESN vs libellé du domaine de
    // conseil) : on garde la PREMIÈRE rencontrée (l'ESN passe avant le
    // portefeuille dans `raw`, donc ses propres mots l'emportent).
    const domainKey = offerDomainKey(label)
    if (domainKey && seenDomains.has(domainKey)) continue
    seen.add(key)
    if (domainKey) seenDomains.add(domainKey)
    out.push(label)
    if (out.length === MAX_SUGGESTIONS) break
  }
  return out
}
