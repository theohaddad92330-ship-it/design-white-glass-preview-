/**
 * #3935 (12/10) — la QUALITÉ du texte extrait d'un CV, miroir TypeScript de
 * `apps/ia/app/services/text_quality.py` (mêmes seuils, mêmes raisons, mêmes
 * verdicts : les tests sont jumeaux). Sert au rattrapage des fiches dont le
 * `cv_text` stocké est espacé lettre à lettre (« L a m i s ») : le fichier
 * d'origine n'est pas conservé, mais le recollage est déterministe.
 *
 * Fonctions PURES — aucun réseau, aucune dépendance.
 */

/** Part de tokens d'UNE lettre au-delà de laquelle le texte est espacé (prose : ~5-10 %, CV espacé : > 60 %). */
const SPACED_TOKEN_RATIO_MAX = 0.35
/** Sous ce nombre de tokens, le ratio ne veut rien dire (un titre court). */
const SPACED_MIN_TOKENS = 15
/** Une page de CV porte 1 500 à 3 000 caractères ; sous 300, elle est quasi vide. */
const MIN_CHARS_PER_PAGE = 300
/** Part de caractères non lisibles tolérée : 5 % suffit à casser des noms propres. */
const UNREADABLE_RATIO_MAX = 0.05
const LINE_SPACED_RATIO = 0.7
const LINE_MIN_TOKENS = 3

type CvTextQualityReason = 'lettre_a_lettre' | 'quasi_vide' | 'illisible'

type CvTextQuality = { score: number; reasons: CvTextQualityReason[] }

const WORD_GAP = /[ \t\u00a0]{2,}/
const CID_TOKEN = /\(cid:\d+\)/g

export function assessCvTextQuality(text: string, pages?: number): CvTextQuality {
  const reasons: CvTextQualityReason[] = []
  const penalties: number[] = [0]

  const tokens = text.split(/\s+/).filter(token => token !== '')
  if (tokens.length >= SPACED_MIN_TOKENS) {
    const single = tokens.filter(token => [...token].length === 1 && /\p{L}/u.test(token)).length
    const ratio = single / tokens.length
    if (ratio > SPACED_TOKEN_RATIO_MAX) {
      reasons.push('lettre_a_lettre')
      penalties.push(ratio)
    }
  }

  const compact = text.replace(/\s+/g, '')
  if (compact.length > 0) {
    const cid = (compact.match(CID_TOKEN) ?? []).join('').length
    // eslint-disable-next-line no-control-regex
    const other = (compact.match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f�]/g) ?? []).length
    const unreadable = (cid + other) / compact.length
    if (unreadable > UNREADABLE_RATIO_MAX) {
      reasons.push('illisible')
      penalties.push(Math.min(1, unreadable * 5))
    }
  }

  if (pages !== undefined && pages > 0) {
    const perPage = compact.length / pages
    if (perPage < MIN_CHARS_PER_PAGE) {
      reasons.push('quasi_vide')
      penalties.push(1 - perPage / MIN_CHARS_PER_PAGE)
    }
  } else if (compact.length === 0) {
    reasons.push('quasi_vide')
    penalties.push(1)
  }

  return { score: Math.max(0, 1 - Math.max(...penalties)), reasons }
}

function repairLine(line: string): string {
  const tokens = line.split(/\s+/).filter(token => token !== '')
  if (tokens.length < LINE_MIN_TOKENS) return line
  const singles = tokens.filter(token => [...token].length === 1).length
  if (singles / tokens.length < LINE_SPACED_RATIO) return line
  const words: string[] = []
  for (const group of line.trim().split(WORD_GAP)) {
    const parts: string[] = []
    let glued = ''
    for (const token of group.split(/\s+/).filter(item => item !== '')) {
      if ([...token].length === 1) {
        glued += token
      } else {
        if (glued) parts.push(glued)
        glued = ''
        parts.push(token)
      }
    }
    if (glued) parts.push(glued)
    words.push(parts.join(' '))
  }
  return words.filter(word => word !== '').join(' ')
}

/** Recolle les lignes espacées lettre à lettre ; toute autre ligne reste INTACTE. */
export function repairLetterSpacing(text: string): string {
  return text.split('\n').map(repairLine).join('\n')
}
