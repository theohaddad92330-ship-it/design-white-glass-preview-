import { formatDate } from '@/lib/locale'

/** `2026-10-13T21:21:04Z` — l'heure est obligatoire : une date seule n'est jamais réécrite. */
const ISO_TIMESTAMP = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})\b/g
const BULLET = /^\s*[-•*]\s+(.*)$/
const HEADING = /^#{1,6}\s+(.*)$/
const FENCE = /^```/
/** Une puce « nue » : un ou deux mots, sans ponctuation de phrase — un libellé, pas une idée. */
const BARE = /^[\p{L}\p{N}'’./&-]+(?: [\p{L}\p{N}'’./&-]+)?$/u
const MAX_BARE = 3

const fold = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * R10B-FIX.5 — ce que la mise en page du modèle laisse traîner : un horodatage ISO écrit tel quel,
 * des puces isolées qui répètent le titre (« THALES », « RÉSERVE »).
 *
 * - l'horodatage est réécrit en date lisible (`formatDate`, langue de l'app) ;
 * - un groupe de 1 à 3 puces nues dont CHAQUE puce répète un titre ou la ligne juste au-dessus est retiré ;
 * - quand la ligne au-dessus est un libellé (« Verdict : »), les puces nues s'y rattachent sur une ligne ;
 * - tout le reste — vraies listes, blocs de code — passe intact.
 */
export function tidyReplyText(text: string): string {
  const lines = text.split('\n')
  const headings = lines.map(line => HEADING.exec(line.trim())?.[1]).filter((h): h is string => Boolean(h))
  const foldedHeadings = headings.map(fold)
  const repeatsTitle = (item: string, above: string): boolean => {
    const needle = fold(item).trim()
    return needle !== '' && [...foldedHeadings, fold(above)].some(hay => hay.includes(needle))
  }

  const out: string[] = []
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (FENCE.test(line.trim())) inFence = !inFence
    if (inFence || FENCE.test(line.trim())) {
      out.push(line)
      continue
    }
    const first = BULLET.exec(line)
    const previous = out.length > 0 ? out[out.length - 1] : ''
    const previousIsList = BULLET.test(previous)
    if (first && !previousIsList) {
      const group: string[] = []
      let j = i
      while (j < lines.length) {
        const match = BULLET.exec(lines[j])
        if (!match) break
        group.push(match[1].trim().replace(/\*\*/g, ''))
        j++
      }
      const above = [...out].reverse().find(l => l.trim() !== '') ?? ''
      const aboveText = above.replace(/^#+\s*/, '')
      const allBare = group.length <= MAX_BARE && group.every(item => BARE.test(item))
      if (allBare && group.every(item => repeatsTitle(item, aboveText))) {
        // Retirées : elles répètent le titre. La ligne vide qui les suivait ne double pas celle d'avant.
        if (lines[j]?.trim() === '' && out[out.length - 1]?.trim() === '') j++
        i = j - 1
        continue
      }
      if (allBare && above.trim().endsWith(':') && out[out.length - 1]?.trim() === above.trim()) {
        out[out.length - 1] = readableStamps(`${above.trim()} ${group.join(' · ')}`)
        i = j - 1
        continue
      }
    }
    out.push(readableStamps(line))
  }

  return out.join('\n')
}

const readableStamps = (line: string): string =>
  line.replace(ISO_TIMESTAMP, stamp => formatDate(stamp, { day: 'numeric', month: 'long', year: 'numeric' }) ?? stamp)
