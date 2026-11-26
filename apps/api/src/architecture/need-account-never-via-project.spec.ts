import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #2558.1 — UN BESOIN NE REJOINT PLUS SON COMPTE PAR SON PROJET.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * `project_needs.project_id` est NULLABLE depuis la migration `1795711263408` :
 * un besoin peut n'appartenir à aucun projet, parce que la majorité des
 * missions d'ESN ne produisent aucun signal public (retour bêta du 17/09/2026).
 *
 * Deux façons d'écrire du SQL rendent alors un besoin INVISIBLE, sans erreur,
 * sans ligne, sans rien à voir en CI :
 *
 *  1. joindre `opportunities` en INNER depuis `project_needs` — la ligne dont
 *     `project_id` est nul ne survit pas à la jointure ;
 *  2. lire le compte sur l'ALIAS DU PROJET (`o.account_id`) — le compte s'en va
 *     alors avec le projet, et un besoin sans projet devient un besoin sans
 *     compte, joignable par personne.
 *
 * Le bon geste est le même dans les deux cas : `LEFT JOIN`, et `n.account_id`.
 *
 * ⚠️ Cette garde PROTÈGE une règle, elle ne l'invente pas. Elle ne regarde que
 * le SQL écrit à la main dans `apps/api/src`, elle ne se déclenche que si
 * `project_needs` est réellement nommée, et elle n'attrape PAS les jointures
 * vers `opportunities` qui partent d'une autre table (`submissions.project_id`,
 * `tasks.project_id`, `missions.opportunity_id` — ces colonnes-là n'ont pas
 * changé).
 */
const SRC = join(__dirname, '..')

/** ⚠️ Un bloc retiré laisse ses RETOURS À LA LIGNE : sans ça, les numéros de
 *  ligne du rapport désignent un endroit qui n'existe pas. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, ' '))
    .replace(/(?<!:)\/\/[^\n]*/g, ' ')
    .replace(/--[^\n]*/g, ' ')
}

function typescriptFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      typescriptFiles(path, out)
      continue
    }
    if (!path.endsWith('.ts')) continue
    // Une spec DÉCRIT le code, elle ne l'est pas : une assertion CITE.
    if (path.endsWith('.spec.ts') || path.endsWith('.test.ts')) continue
    // Une migration passée ne se réécrit pas — et c'est justement une migration
    // qui REPORTE `account_id` depuis `opportunities`, ce qui est son travail.
    if (path.includes(`${'/'}migrations${'/'}`)) continue
    out.push(path)
  }
  return out
}

type Finding = { line: number; excerpt: string; why: string }

/** Les alias de `project_needs` dans ce SQL. Vide = la table n'y est pas. */
function needAliases(sql: string): Set<string> {
  const aliases = new Set<string>()
  for (const match of sql.matchAll(/\b(?:FROM|JOIN)\s+project_needs\s+(?:AS\s+)?([a-z_][a-z0-9_]*)\b/gi)) {
    const alias = (match[1] ?? '').toLowerCase()
    if (!SQL_KEYWORDS.has(alias.toUpperCase())) aliases.add(alias)
  }
  return aliases
}

const SQL_KEYWORDS = new Set(['WHERE', 'GROUP', 'ORDER', 'LIMIT', 'HAVING', 'ON', 'SET', 'RETURNING', 'USING'])

/**
 * Les deux fautes, sur un fichier déjà débarrassé de ses commentaires.
 *
 * Exportée pour que la garde puisse se prouver elle-même sur du SQL fabriqué :
 * une garde qui ne sait pas dire NON n'est pas une garde.
 */
export function needsReachingAccountThroughProject(source: string): Finding[] {
  const code = withoutComments(source)
  const findings: Finding[] = []
  // ⚠️ REQUÊTE PAR REQUÊTE, jamais fichier par fichier : `chain-projectors.ts`
  // porte une dizaine de requêtes qui appellent toutes leur opportunité `o`.
  // Une garde qui résoudrait les alias sur le FICHIER accuserait la requête
  // d'à-côté — une garde aveugle n'est pas une garde, c'est du bruit qu'on
  // finit par exempter en bloc.
  for (const block of code.matchAll(/`[^`]*`/g)) {
    const sql = block[0]
    const offset = code.slice(0, block.index ?? 0).split('\n').length - 1
    for (const finding of inOneQuery(sql)) {
      findings.push({ ...finding, line: finding.line + offset })
    }
  }
  return findings
}

function inOneQuery(sql: string): Finding[] {
  const code = sql
  const aliases = needAliases(code)
  if (aliases.size === 0) return []

  const findings: Finding[] = []
  const lines = code.split('\n')
  const projectAliases = new Set<string>()

  // 1. Les jointures `opportunities <alias> ON <alias>.id = <need>.project_id`.
  //    On retient l'alias du projet : c'est par lui que la seconde faute passe.
  const joinPattern = new RegExp(
    String.raw`(LEFT\s+(?:OUTER\s+)?|INNER\s+|RIGHT\s+(?:OUTER\s+)?)?JOIN\s+opportunities\s+(?:AS\s+)?([a-z_][a-z0-9_]*)\s+ON\s+\2\.id\s*=\s*([a-z_][a-z0-9_]*)\.project_id`,
    'gi',
  )
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    for (const match of line.matchAll(joinPattern)) {
      const kind = (match[1] ?? '').trim().toUpperCase()
      const projectAlias = (match[2] ?? '').toLowerCase()
      const driving = (match[3] ?? '').toLowerCase()
      // La jointure part-elle bien d'un BESOIN ? `submissions.project_id` et
      // `tasks.project_id` portent le même nom de colonne et n'ont pas changé.
      if (!aliases.has(driving)) continue
      projectAliases.add(projectAlias)
      if (!kind.startsWith('LEFT')) {
        findings.push({
          line: index + 1,
          excerpt: match[0].trim(),
          why: 'jointure OBLIGATOIRE vers le projet — un besoin sans projet disparaît de cette lecture, sans erreur et sans ligne',
        })
      }
    }
  }
  if (projectAliases.size === 0) return findings

  // 2. Le compte lu sur l'alias du PROJET plutôt que sur celui du besoin.
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    for (const projectAlias of projectAliases) {
      const reach = new RegExp(String.raw`\b${projectAlias}\.account_id\b`, 'gi')
      for (const match of line.matchAll(reach)) {
        findings.push({
          line: index + 1,
          excerpt: match[0].trim(),
          why: `le compte est pris sur le PROJET (\`${projectAlias}\`) — il s'en irait avec lui ; c'est \`project_needs.account_id\` qui le porte`,
        })
      }
    }
  }
  return findings
}

describe('#2558.1 — un besoin ne rejoint plus son compte par son projet', () => {
  const files = typescriptFiles(SRC)

  it('lit quelque chose — un corpus vide rendrait un vert qui ne mesure rien', () => {
    expect(files.length).toBeGreaterThan(200)
    const withNeeds = files.filter(path => /\bproject_needs\b/.test(readFileSync(path, 'utf8')))
    expect(withNeeds.length).toBeGreaterThan(5)
  })

  it('sait dire NON — sur du SQL fabriqué qui commet chacune des deux fautes', () => {
    const inner = needsReachingAccountThroughProject(
      `const sql = \`SELECT n.id FROM project_needs n JOIN opportunities o ON o.id = n.project_id WHERE n.workspace_id = $1\``,
    )
    expect(inner).toHaveLength(1)
    expect(inner[0]?.why).toContain('OBLIGATOIRE')

    const viaProject = needsReachingAccountThroughProject(
      `const sql = \`SELECT o.account_id FROM project_needs n LEFT JOIN opportunities o ON o.id = n.project_id\``,
    )
    expect(viaProject).toHaveLength(1)
    expect(viaProject[0]?.why).toContain('PROJET')
  })

  it("n'attrape pas ce qu'elle ne vise pas — une autre table, un commentaire, la bonne forme", () => {
    // `submissions.project_id` n'a pas changé : cette jointure reste légitime.
    expect(
      needsReachingAccountThroughProject(
        `const sql = \`SELECT o.account_id FROM submissions s JOIN opportunities o ON o.id = s.project_id JOIN project_needs n ON n.id = s.need_id\``,
      ),
    ).toEqual([])
    // Un COMMENTAIRE qui décrit la faute n'est pas la faute.
    expect(
      needsReachingAccountThroughProject(
        `// FROM project_needs n JOIN opportunities o ON o.id = n.project_id — interdit\nconst sql = 'SELECT 1'`,
      ),
    ).toEqual([])
    // La bonne forme passe.
    expect(
      needsReachingAccountThroughProject(
        `const sql = \`SELECT n.account_id FROM project_needs n LEFT JOIN opportunities o ON o.id = n.project_id\``,
      ),
    ).toEqual([])
    // Aucune mention de `project_needs` : rien à dire.
    expect(needsReachingAccountThroughProject(`const sql = \`SELECT o.account_id FROM opportunities o\``)).toEqual([])
  })

  it('aucune lecture du dépôt ne remonte au compte par le projet', () => {
    const findings: string[] = []
    for (const path of files) {
      for (const finding of needsReachingAccountThroughProject(readFileSync(path, 'utf8'))) {
        findings.push(`${path.slice(SRC.length + 1)}:${finding.line} — ${finding.excerpt} : ${finding.why}`)
      }
    }
    expect(findings).toEqual([])
  })
})
