/**
 * Couche zéro — traces internes de l'ESN sur un compte (annexe méthodo p8).
 *
 * La règle de la page : « Bellum doit toujours chercher ce qui EXISTE avant de
 * proposer du froid ». Le CRM était déjà branché (`CrmReadService`), mais la p8
 * liste explicitement d'autres endroits où dort l'historique d'une ESN : l'ATS,
 * le Drive, les e-mails, les notes, les CV déjà envoyés. Tant qu'ils ne sont pas
 * lus, le produit continue de recommander une approche froide sur un compte que
 * trois personnes de la boîte connaissent déjà.
 *
 * Ce module est la partie PURE : il met en forme des trouvailles déjà collectées.
 * Aucun réseau, aucun NestJS — c'est ce qui rend le format testable, et c'est là
 * que vivent les règles de prudence :
 *
 *   - une source qui ne trouve rien n'écrit RIEN (pas de « aucun document
 *     trouvé » : une absence de résultat n'est pas une information, et injectée
 *     dans un prompt elle se lit comme un fait établi) ;
 *   - aucune trouvaille n'est interprétée. On cite un titre, une date, un
 *     expéditeur. Ce que ça VEUT DIRE, c'est au commercial de le lire ;
 *   - tout est borné : ces lignes finissent dans un prompt Claude.
 */

/** Une trace trouvée dans un outil interne de l'ESN. */
export type ZeroLayerFinding = {
  /** Le titre/sujet tel qu'il est écrit dans l'outil. Jamais reformulé. */
  title: string
  /** Date ISO quand l'outil la donne — « quand » est la moitié de l'information. */
  date?: string | null
  /** Qui/où, quand c'est disponible (expéditeur, dossier, statut). */
  detail?: string | null
}

/** Le résultat d'UNE source. `findings` vide = rien trouvé, donc rien à dire. */
export type ZeroLayerSource = {
  /** Clé technique de la source (`drive`, `gmail`, `notion`, `outlook`, `ats`). */
  key: string
  /** L'intitulé lisible, celui qui apparaîtra dans le prompt. */
  label: string
  findings: ZeroLayerFinding[]
  /**
   * Place laissée au titre de CETTE source. Absent ⇒ le plafond commun.
   *
   * Une source ne cite pas toujours la même nature de texte : un titre de
   * document tient en 160 caractères, une note écrite à la main est de la prose
   * et se retrouverait coupée en son milieu. Le plafond du BLOC, lui, ne bouge
   * pas — c'est lui qui protège le prompt.
   */
  titleMaxChars?: number
}

/** Nombre de traces citées par source. Au-delà, ce n'est plus un signal, c'est
 *  un export — et ça noie le prompt. */
const MAX_FINDINGS_PER_SOURCE = 6
/** Cap dur du bloc entier : il est concaténé dans un prompt Claude. */
const MAX_BLOCK_CHARS = 4000
const MAX_TITLE_CHARS = 160
const MAX_DETAIL_CHARS = 120

function clean(value: string | null | undefined, max: number): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

/** `2026-07-24T09:12:00Z` → `2026-07-24`. Une heure ne dit rien de plus ici, et
 *  une date invalide est simplement omise plutôt que rendue telle quelle. */
function formatDate(value: string | null | undefined): string {
  if (typeof value !== 'string') return ''
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())
  if (match) return match[1] as string
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '' : (parsed.toISOString().slice(0, 10) as string)
}

function formatFinding(finding: ZeroLayerFinding, titleMaxChars = MAX_TITLE_CHARS): string {
  const title = clean(finding.title, titleMaxChars)
  if (!title) return ''
  const bits = [title]
  const detail = clean(finding.detail, MAX_DETAIL_CHARS)
  if (detail) bits.push(detail)
  const date = formatDate(finding.date)
  if (date) bits.push(date)
  return `- ${bits.join(' — ')}`
}

/**
 * Le bloc « traces internes », ou `undefined` quand aucune source n'a rien
 * trouvé.
 *
 * `undefined` (et non une chaîne vide) est délibéré : c'est ce que l'appelant
 * transmet — ou ne transmet pas — au pipeline. Sans trace, la clé ne part pas et
 * le run reste byte-identique à ce qu'il était avant la feature.
 */
export function formatInternalHistory(sources: ZeroLayerSource[]): string | undefined {
  const blocks: string[] = []

  for (const source of sources) {
    const lines = source.findings
      .slice(0, MAX_FINDINGS_PER_SOURCE)
      .map(finding => formatFinding(finding, source.titleMaxChars))
      .filter(Boolean)
    if (lines.length === 0) continue
    blocks.push(`${source.label} :\n${lines.join('\n')}`)
  }

  if (blocks.length === 0) return undefined

  const body = blocks.join('\n\n')
  return body.length > MAX_BLOCK_CHARS ? `${body.slice(0, MAX_BLOCK_CHARS - 1)}…` : body
}

/**
 * Les termes de recherche d'un compte dans les outils internes.
 *
 * Le nom commercial d'abord, le domaine ensuite (un e-mail ou un fichier porte
 * souvent l'un sans l'autre). Dédupliqué, et surtout BORNÉ : chaque terme est un
 * appel réseau par source, on n'en lance pas dix pour un compte.
 *
 * Un nom trop court (« SG », « IBM » sur deux caractères) est écarté : il
 * ramènerait n'importe quoi, et une trace hors sujet injectée dans le prompt est
 * pire qu'une absence de trace.
 */
export function accountSearchTerms(account: { companyName: string; domain?: string | null }): string[] {
  const out: string[] = []
  const name = clean(account.companyName, 80)
  if (name.length >= 3) out.push(name)
  const domain = clean(account.domain, 80).toLowerCase()
  if (domain && domain.length >= 4 && !out.includes(domain)) out.push(domain)
  return out
}
