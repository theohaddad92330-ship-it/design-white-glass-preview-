import { ANALYSIS_BATCH_MAX_ITEMS, type AnalysisBatchInput, type AnalysisBatchSource } from '@bellum/contracts'

/**
 * #2293.3 — une liste COLLÉE (noms, identifiants, ou « Nom SIREN ») devient
 * l'entrée d'un lot. Rien n'est tronqué en silence : au-delà de la limite du
 * lot, l'excédent est compté et l'écran le DIT.
 *
 * Source : `identifiers` quand chaque ligne est un SIREN seul, `names` sinon.
 */
export function parseBatchInput(text: string): {
  source: AnalysisBatchSource
  items: AnalysisBatchInput[]
  overLimit: number
} {
  const lines = text
    .split(/[\n;,]+/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
  const parsed = lines.map(parseLine)
  const items = parsed.slice(0, ANALYSIS_BATCH_MAX_ITEMS)
  const onlyIdentifiers = items.length > 0 && items.every(item => item.name === item.siren)
  return {
    source: onlyIdentifiers ? 'identifiers' : 'names',
    items,
    overLimit: Math.max(0, parsed.length - ANALYSIS_BATCH_MAX_ITEMS),
  }
}

function parseLine(line: string): AnalysisBatchInput {
  const compact = line.replace(/\s+/g, '')
  if (/^\d{9}$/.test(compact)) return { name: compact, siren: compact }
  const match = line.match(/^(.*?)[\s(]*(\d{3}\s?\d{3}\s?\d{3})\)?$/)
  if (match && match[1] && match[1].trim().length > 0) {
    return { name: match[1].trim(), siren: (match[2] as string).replace(/\s+/g, '') }
  }
  return { name: line }
}
