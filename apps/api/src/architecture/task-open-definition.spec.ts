import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { TASK_CLOSED_STATUSES, TASK_OPEN_STATUSES, TASK_STATUSES } from '@bellum/contracts'

/**
 * GA-54 — « ENCORE À FAIRE » SE DEMANDE AU CONTRAT, JAMAIS À LA MAIN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le 28/08/2026, la même tâche recevait deux réponses sur deux écrans voisins :
 *
 *   · `taskBucket` (contrats) écrivait `status !== 'todo'` → une tâche ANNULÉE
 *     n'avait aucun panier dans l'agenda ;
 *   · le cockpit de qualité écrivait `status <> 'done'` → la même tâche annulée
 *     comptait comme « prochaine action programmée » sur le compte.
 *
 * Un compte dont la seule tâche avait été ANNULÉE se disait donc couvert au
 * contrôle de qualité et vide à l'agenda. Le faux négatif était du mauvais
 * côté : l'écran dont le métier est de MONTRER du travail en cachait.
 *
 * L'arbitrage est écrit dans `packages/contracts/src/schemas/task.ts`
 * (`TASK_STATUS_OPENNESS`) : une tâche annulée est CLOSE. Cette garde empêche un
 * troisième endroit de le redécider.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMMENT ELLE REGARDE — DES IDENTIFIANTS, PAS DES MOTS
 * ─────────────────────────────────────────────────────────────────────────────
 * Une garde qui cherche le MOT « todo » trouve les commentaires qui en parlent
 * et se croit verte. Celle-ci :
 *
 *  1. retire les commentaires du source avant de regarder quoi que ce soit ;
 *  2. RÉSOUT les alias : elle relève les identifiants liés à la table `tasks`
 *     (`FROM tasks t`, `JOIN tasks AS x`) et ne s'intéresse qu'à eux — un
 *     `sequence.status = 'cancelled'` d'une autre table ne la concerne pas ;
 *  3. compare des ENSEMBLES : les littéraux d'un prédicat contre l'ensemble
 *     `TASK_STATUSES`, et les statuts cherchés contre `TASK_OPEN_STATUSES`.
 *     Aucune de ces listes n'est recopiée ici — toutes viennent du contrat.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX RÈGLES, ET POURQUOI ELLES NE SONT PAS SYMÉTRIQUES
 * ─────────────────────────────────────────────────────────────────────────────
 * **En SQL — aucun prédicat de statut écrit à la main sur une tâche.** Pas même
 * un qui aurait l'air juste. La raison est que la forme fautive du 28/08 était
 * `<> 'done'` : elle ne NOMME aucun statut ouvert, et une garde qui n'aurait
 * cherché que `'todo'` l'aurait laissée passer. Y sont assimilés les PROXIES —
 * `completed_at IS NULL` disait la même chose sous un autre nom dans la sonde
 * de Laura. Le SQL passe par `taskStillOpenSql`.
 *
 * **En TypeScript — aucune comparaison à un statut OUVERT.** Comparer à un
 * statut ouvert, c'est demander « est-ce que ça attend encore quelqu'un ? », et
 * cette question a une réponse : `isTaskOpen`. Nommer un statut CLOS reste
 * permis, parce que c'est nommer une ISSUE et non poser la question : « l'a-t-il
 * marquée FAITE ? » n'est pas « est-elle ouverte ? » — une tâche annulée
 * n'enregistre pas d'achèvement, et cette distinction-là doit rester écrivable.
 * L'asymétrie tient au fait qu'en TypeScript le type dit de quel objet on parle,
 * ce qu'aucune chaîne de SQL ne dit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne lit pas `apps/web` : le front ne construit pas de SQL et consomme
 * `buildTaskAgenda`. Elle ne juge pas non plus les autres tables qui ont un
 * `status` — `execution_status`, les séquences, les besoins ont leurs propres
 * définitions et leurs propres gardes.
 */

const API_SRC = join(__dirname, '..')
const CONTRACT_TASK = join(__dirname, '..', '..', '..', '..', 'packages', 'contracts', 'src', 'schemas', 'task.ts')

/** Le fichier qui PORTE la définition : lui seul a le droit de l'écrire. */
const DEFINITION = join('packages', 'contracts', 'src', 'schemas', 'task.ts')

/**
 * Le source débarrassé de ce qui n'est pas du code.
 *
 * Blocs `/* … *\/`, lignes `//`, et commentaires SQL `--`. Une règle qui ne vit
 * plus que dans une phrase n'est pas une règle, et une phrase qui cite la règle
 * ne doit pas la faire passer pour appliquée.
 *
 * ⚠️ Un bloc retiré laisse ses RETOURS À LA LIGNE derrière lui. Sans ça, les
 * numéros de ligne du rapport désignent un endroit qui n'existe pas — et une
 * garde qui envoie au mauvais endroit se fait contourner au lieu d'être lue.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, ' '))
    .replace(/(?<!:)\/\/[^\n]*/g, ' ')
    .replace(/--[^\n]*/g, ' ')
}

/** Tous les `.ts` d'un dossier, récursivement. `dist` et les tests exclus. */
function typescriptFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      typescriptFiles(path, out)
      continue
    }
    if (!path.endsWith('.ts')) continue
    // Les specs décrivent le code, elles ne le sont pas : une assertion qui
    // CITE un prédicat est une citation, pas une seconde définition.
    if (path.endsWith('.spec.ts') || path.endsWith('.test.ts')) continue
    // Les migrations sont l'histoire de la base : une migration passée ne se
    // réécrit pas, et son `CHECK` est justement ce qui autorise l'énumération.
    if (path.includes(`${'/'}migrations${'/'}`)) continue
    out.push(path)
  }
  return out
}

/** Les identifiants liés à la table `tasks` dans un source SQL. */
function taskAliases(source: string): string[] {
  const aliases = new Set<string>()
  const binding = /\b(?:FROM|JOIN)\s+tasks\s+(?:AS\s+)?([a-z_][a-z0-9_]*)\b/gi
  for (const match of source.matchAll(binding)) {
    const alias = match[1]
    // `FROM tasks WHERE` : `WHERE` n'est pas un alias, c'est le mot suivant.
    if (alias && !SQL_KEYWORDS.has(alias.toUpperCase())) aliases.add(alias)
  }
  return [...aliases]
}

const SQL_KEYWORDS = new Set(['WHERE', 'GROUP', 'ORDER', 'LIMIT', 'HAVING', 'ON', 'SET', 'RETURNING', 'USING'])

/** Les noms par lesquels le contrat se laisse citer. */
const SHARED_LIST = ['TASK_OPEN_STATUSES', 'taskStillOpenSql'] as const

type Finding = { line: number; excerpt: string; why: string }

/**
 * Les prédicats de statut de tâche écrits à la main dans du SQL.
 *
 * Deux formes, parce que la seconde est celle qui a échappé au premier examen :
 * une comparaison de `status` à des littéraux de `TASK_STATUSES`, et l'usage de
 * `completed_at` comme PROXY d'ouverture.
 */
function handWrittenSqlPredicates(source: string): Finding[] {
  const code = withoutComments(source)
  const aliases = taskAliases(code)
  if (aliases.length === 0) return []

  const findings: Finding[] = []
  const known = new Set<string>(TASK_STATUSES)
  const lines = code.split('\n')

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    for (const alias of aliases) {
      // ⚠️ `RegExp.exec` avec le drapeau `g` est STATEFUL — il reprend là où il
      // s'était arrêté et saute une occurrence sur deux. `matchAll` sur une
      // expression FRAÎCHE est la seule forme qui les voit toutes.
      for (const match of line.matchAll(
        new RegExp(
          `\\b${alias}\\.status\\b\\s*(?:=|<>|!=|NOT\\s+IN|IN)\\s*\\(?\\s*((?:'[a-z_]+'\\s*,?\\s*)+)\\)?`,
          'gi',
        ),
      )) {
        const literals = [...(match[1] ?? '').matchAll(/'([a-z_]+)'/gi)].map(m => m[1] ?? '')
        // Compare des ENSEMBLES : si aucun littéral n'est un statut de tâche,
        // c'est un `status` homonyme d'une autre table jointe.
        if (!literals.some(value => known.has(value))) continue
        findings.push({
          line: index + 1,
          excerpt: match[0].trim(),
          why: `prédicat de statut écrit à la main sur la table \`tasks\` (alias \`${alias}\`)`,
        })
      }
      for (const match of line.matchAll(new RegExp(`\\b${alias}\\.completed_at\\b\\s+IS\\s+(?:NOT\\s+)?NULL`, 'gi'))) {
        findings.push({
          line: index + 1,
          excerpt: match[0].trim(),
          why: `\`completed_at\` employé comme PROXY d'ouverture sur la table \`tasks\` (alias \`${alias}\`)`,
        })
      }
      // La liste LIÉE : `status = ANY($2)`. Le SQL ne dit pas ce qu'il y a dans
      // le paramètre — mais le fichier, lui, le dit. Il doit nommer la liste du
      // contrat, sinon elle a été retapée en JavaScript juste à côté.
      for (const match of line.matchAll(new RegExp(`\\b${alias}\\.status\\b\\s*=\\s*ANY\\s*\\(`, 'gi'))) {
        if (SHARED_LIST.some(name => code.includes(name))) continue
        findings.push({
          line: index + 1,
          excerpt: match[0].trim(),
          why: `liste de statuts LIÉE sans nommer \`TASK_OPEN_STATUSES\` — d'où sort-elle ?`,
        })
      }
    }
  }
  return findings
}

/** Les comparaisons TypeScript à un statut OUVERT — la question déguisée. */
function handWrittenOpenComparisons(source: string): Finding[] {
  const code = withoutComments(source)
  const findings: Finding[] = []
  const open = new Set<string>(TASK_OPEN_STATUSES)
  const lines = code.split('\n')

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    for (const match of line.matchAll(/\.status\s*(?:===|!==|==|!=)\s*'([a-z_]+)'/g)) {
      const value = match[1] ?? ''
      if (!open.has(value)) continue
      findings.push({
        line: index + 1,
        excerpt: match[0].trim(),
        why: `comparaison à un statut OUVERT (\`${value}\`) — c'est \`isTaskOpen\` qui répond à ça`,
      })
    }
  }
  return findings
}

function relative(path: string): string {
  const marker = `${'/'}apps${'/'}api${'/'}`
  const at = path.indexOf(marker)
  return at === -1 ? path : `apps/api/${path.slice(at + marker.length)}`
}

function report(title: string, offenders: { path: string; findings: Finding[] }[]): string {
  return [
    title,
    '',
    'La définition de « une tâche encore à faire » vit à UN seul endroit :',
    `  ${DEFINITION} — \`TASK_STATUS_OPENNESS\`, \`isTaskOpen\`, \`taskStillOpenSql\`.`,
    '',
    "Le 28/08/2026, deux définitions coexistaient : `status !== 'todo'` à",
    "l'agenda et `status <> 'done'` au cockpit de qualité. La même tâche annulée",
    'était « une action programmée » d’un côté et « sans panier » de l’autre.',
    '',
    ...offenders.flatMap(({ path, findings }) => [
      `  ${relative(path)}`,
      ...findings.map(finding => `      L${finding.line} : ${finding.excerpt}   ← ${finding.why}`),
    ]),
  ].join('\n')
}

describe('GA-54 — « encore à faire » se demande au contrat', () => {
  const files = typescriptFiles(API_SRC)

  it('aucun prédicat de statut de tâche écrit à la main dans du SQL', () => {
    const offenders = files
      .map(path => ({ path, findings: handWrittenSqlPredicates(readFileSync(path, 'utf8')) }))
      .filter(entry => entry.findings.length > 0)

    if (offenders.length > 0) {
      throw new Error(
        report('Du SQL décide lui-même si une tâche est encore à faire.', offenders) +
          '\n\nRemplace le prédicat par `taskStillOpenSql(<alias>)`, importé de `@bellum/contracts`.',
      )
    }
    expect(offenders).toEqual([])
  })

  it('aucune comparaison TypeScript à un statut ouvert hors du contrat', () => {
    const offenders = files
      .map(path => ({ path, findings: handWrittenOpenComparisons(readFileSync(path, 'utf8')) }))
      .filter(entry => entry.findings.length > 0)

    if (offenders.length > 0) {
      throw new Error(
        report('Du TypeScript redemande lui-même si une tâche est ouverte.', offenders) +
          '\n\nRemplace la comparaison par `isTaskOpen(...)`, importé de `@bellum/contracts`.' +
          '\nNommer un statut CLOS reste permis : « marquée FAITE » n’est pas « ouverte ».',
      )
    }
    expect(offenders).toEqual([])
  })

  it('le contrat porte la définition, et `taskBucket` ne la réécrit pas', () => {
    const source = readFileSync(CONTRACT_TASK, 'utf8')
    expect(source).toContain('TASK_STATUS_OPENNESS')

    // `taskBucket` DEMANDE, il ne décide pas. Le jour où il redécide — c'est
    // l'état exact du 28/08/2026 —, la ligne qu'il écrira sera une comparaison
    // à un statut ouvert.
    const findings = handWrittenOpenComparisons(source)
    if (findings.length > 0) {
      throw new Error(
        [
          `Le contrat REDÉCIDE ce qu'il est censé définir : ${DEFINITION}`,
          '',
          ...findings.map(finding => `      L${finding.line} : ${finding.excerpt}   ← ${finding.why}`),
          '',
          'Le classement vit dans `TASK_STATUS_OPENNESS`, et tout en dérive —',
          '`taskBucket` compris. C’est exactement ce qui manquait le 28/08/2026 :',
          "`taskBucket` écrivait `status !== 'todo'` pendant que le cockpit de",
          "qualité écrivait `status <> 'done'`.",
        ].join('\n'),
      )
    }
    expect(findings).toEqual([])
    expect(withoutComments(source)).toContain('isTaskOpen(task.status)')
  })

  it('la garde LIT vraiment, et sait dire NON', () => {
    // ── Elle LIT ────────────────────────────────────────────────────────────
    // Un corpus vide passerait au vert éternellement. Bornes basses, larges :
    // elles tombent si l'arborescence bouge sous la garde, pas à chaque fichier
    // ajouté.
    expect(files.length).toBeGreaterThan(300)
    const bodies = files.map(path => readFileSync(path, 'utf8'))
    expect(bodies.join('').length).toBeGreaterThan(1_000_000)

    // Elle voit la table : plusieurs fichiers de l'API parlent bien à `tasks`,
    // donc la résolution d'alias travaille sur du vrai code et pas sur du vide.
    const withTasks = bodies.filter(body => taskAliases(withoutComments(body)).length > 0)
    expect(withTasks.length).toBeGreaterThanOrEqual(3)

    // Et elle lit le contrat, pas une recopie : les deux ensembles viennent de
    // l'énumération, ils sont disjoints et ils la couvrent entièrement.
    expect(TASK_OPEN_STATUSES.length).toBeGreaterThan(0)
    expect(TASK_CLOSED_STATUSES.length).toBeGreaterThan(0)
    expect([...TASK_OPEN_STATUSES, ...TASK_CLOSED_STATUSES].sort()).toEqual([...TASK_STATUSES].sort())

    // ── Elle sait dire NON ──────────────────────────────────────────────────
    // Les trois formes qui ont réellement existé dans le dépôt, et une qui n'y
    // a jamais existé mais qui dirait la même chose.
    const cockpit = `const q = \`SELECT 1 FROM tasks t WHERE t.account_id = a.id AND t.status <> 'done'\``
    expect(handWrittenSqlPredicates(cockpit)).toHaveLength(1)
    expect(handWrittenSqlPredicates(cockpit)[0]?.excerpt).toContain("<> 'done'")

    const agenda = `const q = \`SELECT * FROM tasks t WHERE t.status = 'todo'\``
    expect(handWrittenSqlPredicates(agenda)).toHaveLength(1)

    const proxy = `const q = \`SELECT 1 FROM tasks t WHERE t.completed_at IS NULL\``
    expect(handWrittenSqlPredicates(proxy)).toHaveLength(1)
    expect(handWrittenSqlPredicates(proxy)[0]?.why).toContain('PROXY')

    const inList = `const q = \`SELECT * FROM tasks AS task WHERE task.status IN ('todo', 'cancelled')\``
    expect(handWrittenSqlPredicates(inList)).toHaveLength(1)

    // La liste LIÉE : le SQL ne montre plus les statuts, le fichier doit dire
    // d'où ils viennent. Retapée à côté → refusée ; citée du contrat → admise.
    const bound = `const q = \`SELECT 1 FROM tasks t WHERE t.status = ANY($2)\`\nconst p = [['todo']]`
    expect(handWrittenSqlPredicates(bound)).toHaveLength(1)
    expect(handWrittenSqlPredicates(bound)[0]?.why).toContain('TASK_OPEN_STATUSES')
    const boundFromContract = `import { TASK_OPEN_STATUSES } from '@bellum/contracts'
      const q = \`SELECT 1 FROM tasks t WHERE t.status = ANY($2)\`
      const p = [[...TASK_OPEN_STATUSES]]`
    expect(handWrittenSqlPredicates(boundFromContract)).toEqual([])

    // Elle ne se laisse pas berner par un COMMENTAIRE qui cite le prédicat…
    const quoted = `/* voir \`t.status <> 'done'\` */\nconst q = \`SELECT 1 FROM tasks t WHERE t.id = $1\``
    expect(handWrittenSqlPredicates(quoted)).toEqual([])
    // …ni par un \`status\` homonyme appartenant à une AUTRE table.
    const other = `const q = \`SELECT 1 FROM tasks t JOIN outreach_sequences s ON s.id = t.id
                    WHERE s.status = 'cancelled' AND t.id = $1\``
    expect(handWrittenSqlPredicates(other)).toEqual([])
    // …et elle ne s'invente pas de tâche quand la table n'est pas là.
    const unrelated = `const q = \`SELECT 1 FROM project_needs n WHERE n.status = 'todo'\``
    expect(handWrittenSqlPredicates(unrelated)).toEqual([])

    // Côté TypeScript : la question déguisée est vue, l'issue nommée passe.
    expect(handWrittenOpenComparisons(`const open = task.status === 'todo'`)).toHaveLength(1)
    expect(handWrittenOpenComparisons(`if (task.status !== 'todo') return null`)).toHaveLength(1)
    expect(handWrittenOpenComparisons(`if (input.status === 'done') record()`)).toEqual([])
    expect(handWrittenOpenComparisons(`// task.status === 'todo' expliqué ici`)).toEqual([])
  })
})
