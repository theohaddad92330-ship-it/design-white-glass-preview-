import type { ReplyTransformRequest } from '@bellum/contracts'

/**
 * #3768 (BEL-LAU-1014) — LES GESTES QUI SE DÉDUISENT DU TEXTE, rendus sans modèle.
 *
 * Sert l'espace de DÉMONSTRATION (`demo-turn.ts` ne fait aucun appel réseau) :
 * ce qu'on peut faire d'une réponse avec la réponse seule — garder les premiers
 * éléments, ne garder que le nom et la raison, la mettre en tableau ou en plan.
 * Chaque sortie est faite de lignes de la source ; rien n'est inventé.
 *
 * Les trois gestes qui demandent de NOUVELLES données (approfondir, plus de
 * comptes, mieux justifier) rendent `null` : le modèle seul sait les faire, et
 * une démonstration qui les simulerait fabriquerait de la donnée.
 */
export type LocalTransformLabels = {
  setAside: (count: number) => string
  planTitle: string
  tableHead: readonly [string, string, string]
}

const ITEM = /^\s*(?:[-*•]|\d+[.)])\s+(.*\S)\s*$/
const TABLE_ROW = /^\s*\|.+\|\s*$/
const TOP = 3
// Le nom d'un élément se sépare de sa suite au premier tiret long ou deux-points.
const HEAD_SPLIT = /\s[—–]\s|\s:\s/

type Parsed = { intro: string[]; items: string[]; reserves: string[] }

function parse(request: ReplyTransformRequest): Parsed {
  const items: string[] = []
  const intro: string[] = []
  for (const raw of request.sourceText.split('\n')) {
    const line = raw.trim()
    if (!line || TABLE_ROW.test(line) || request.reserves.includes(line)) continue
    const item = ITEM.exec(line)
    if (item?.[1]) items.push(item[1])
    else if (items.length === 0) intro.push(line)
  }
  return { intro, items, reserves: request.reserves }
}

function split(item: string): { head: string; reason: string } {
  const parts = item.split(HEAD_SPLIT)
  const head = (parts[0] ?? item).trim()
  // La raison s'arrête à sa première phrase : le reste est le détail qu'on retire.
  const reason = (parts[1] ?? '').split(/\.\s/)[0]?.replace(/\.$/, '').trim() ?? ''
  return { head, reason }
}

const numbered = (lines: readonly string[]) => lines.map((line, index) => `${index + 1}. ${line}`)

export function localReplyTransform(request: ReplyTransformRequest, labels: LocalTransformLabels): string | null {
  const { intro, items, reserves } = parse(request)
  const tail = reserves.length ? ['', ...reserves] : []
  const lead = intro.length ? [intro[0] as string, ''] : []

  switch (request.id) {
    case 'priorities_only': {
      if (items.length === 0) return null
      const kept = items.slice(0, TOP)
      const aside = items.length - kept.length
      return [...lead, ...numbered(kept), ...(aside > 0 ? ['', labels.setAside(aside)] : []), ...tail].join('\n')
    }
    case 'less_detail': {
      if (items.length === 0) return null
      const short = items.map(item => {
        const { head, reason } = split(item)
        return reason ? `${head} — ${reason}` : head
      })
      return [...lead, ...numbered(short), ...tail].join('\n')
    }
    case 'exportable_list': {
      if (items.length === 0) return null
      const [a, b, c] = labels.tableHead
      const rows = items.map((item, index) => {
        const { head, reason } = split(item)
        return `| ${index + 1} | ${head} | ${reason} |`
      })
      return [`| ${a} | ${b} | ${c} |`, '| --- | --- | --- |', ...rows, ...tail].join('\n')
    }
    case 'action_plan': {
      if (items.length === 0) return null
      const steps = items.map(item => {
        const { head, reason } = split(item)
        return reason ? `${head} — ${reason}` : head
      })
      return [`## ${labels.planTitle}`, '', ...numbered(steps), ...tail].join('\n')
    }
    case 'synthesize': {
      const first = (intro[0] ?? items[0] ?? '').trim()
      if (!first) return null
      const heads = items.slice(0, TOP).map(item => split(item).head)
      return [first, ...(heads.length ? [heads.join(' · ')] : []), ...tail].join('\n')
    }
    default:
      return null
  }
}
