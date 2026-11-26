/**
 * #3763 (BEL-LAU-1007) — dense au premier niveau, dépliable au second.
 *
 * Deux règles, chacune pour ne JAMAIS cacher une information critique :
 *  - la RAISON COURTE d'un « Pourquoi » reste visible (premier paragraphe, ou
 *    trois premières puces) ; seule la suite — la preuve détaillée — se plie ;
 *  - une section ne se plie que si son intitulé dit que c'est du DÉTAIL
 *    (sources, limites, méthode, contexte…). Un intitulé inconnu reste visible :
 *    on ne devine pas qu'un contenu est secondaire.
 * « Ce qui manque », le verdict et la prochaine action ne se plient jamais.
 */

export type DetailKind = 'sources' | 'limits' | 'method' | 'detail'

const LEAD_BULLETS = 3
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s:.-]+$/, '')
    .trim()
}

const DETAIL_PATTERNS: ReadonlyArray<readonly [RegExp, DetailKind]> = [
  [/^(sources?|references?)\b/, 'sources'],
  [/^(limites?|limits?|limitations?|reserves? methodologiques?)\b/, 'limits'],
  [/^(methode|methodes|methodologie|methodology|method|approche methodologique)\b/, 'method'],
  [
    /^(details?|detail de la preuve|contexte|context|nuances?|preuves?|evidence|tags?|hypotheses|assumptions)\b/,
    'detail',
  ],
]

export function detailKindOf(title: string): DetailKind | null {
  const key = normalize(title)
  for (const [pattern, kind] of DETAIL_PATTERNS) if (pattern.test(key)) return kind
  return null
}

export function splitWhyForDisclosure(body: string): { lead: string; rest: string } {
  const text = body.trim()
  if (!text) return { lead: '', rest: '' }
  const lines = text.split('\n')
  if (BULLET.test(lines[0])) {
    const bullets = lines.filter(line => BULLET.test(line))
    if (bullets.length <= LEAD_BULLETS) return { lead: text, rest: '' }
    const cut = lines.indexOf(bullets[LEAD_BULLETS])
    return { lead: lines.slice(0, cut).join('\n').trim(), rest: lines.slice(cut).join('\n').trim() }
  }
  const [lead, ...others] = text.split(/\n\s*\n/)
  return { lead: lead.trim(), rest: others.join('\n\n').trim() }
}
