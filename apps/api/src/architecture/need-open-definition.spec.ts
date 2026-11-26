import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { NEED_CLOSED_STATUSES, NEED_OPEN_STATUSES, PROJECT_NEED_STATUSES, needStillOpenSql } from '@bellum/contracts'

/**
 * GA-62 — « UN BESOIN ENCORE OUVERT » SE DEMANDE AU CONTRAT, JAMAIS À LA MAIN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE (28/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Cinq requêtes portaient l'idée « un besoin encore ouvert », avec QUATRE
 * contenus différents — et deux d'entre elles nommaient des statuts qui
 * n'existent pas :
 *
 *   · la routine « besoins sans shortlist » et deux KPI CRM :
 *     `status NOT IN ('closed', 'cancelled', 'filled')` ;
 *   · le matching inverse : `NOT IN ('lost','cancelled','won','staffed')` ;
 *   · l'hygiène de données : `NOT IN ('staffed','lost','cancelled')` ;
 *   · les scores de mission : `NOT IN ('cancelled','lost')`.
 *
 * `closed` et `filled` NE SONT PAS DES STATUTS DE BESOIN. Ils ne sont ni dans
 * {@link PROJECT_NEED_STATUSES}, ni admis par la contrainte
 * `project_needs_status_check`. Ce sont les mots qu'on emploie en PARLANT d'un
 * besoin, pas ceux que la base écrit. Un `NOT IN` sur une valeur qui n'existe
 * pas ne lève rien et n'exclut rien : il est simplement INERTE. Les trois
 * requêtes n'excluaient donc que `cancelled` — un besoin GAGNÉ, PERDU ou POURVU
 * comptait comme ouvert, et remontait dans une routine hebdomadaire comme s'il
 * attendait encore quelqu'un.
 *
 * Les deux dernières listes sont incomplètes autrement : elles oublient `won`,
 * qui est justement la valeur que la reprise `1789534912778-NeedWorkStatuses` a
 * substituée à `staffed`. Elles comptent donc chaque besoin gagné parmi les
 * ouverts.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI AUCUNE GARDE NE L'A VU — ET C'EST LE POINT DE CE FICHIER
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-57 (sous-ensembles de stades de PROJET) écrit noir sur blanc, à son §2 :
 *
 *   « Un `n.status NOT IN ('lost','cancelled','won','staffed')` appartient aux
 *     besoins, qui ont leur propre taxonomie et LEUR PROPRE GARDE. »
 *
 * Cette garde-là n'existait pas. GA-54 fait ce travail pour les TÂCHES, et son
 * en-tête referme la même porte : « les besoins ont leurs propres définitions et
 * leurs propres gardes ». Deux gardes se renvoyaient donc à une troisième que
 * personne n'avait écrite — et chacune était verte, à juste titre, dans son
 * périmètre.
 *
 * La leçon n'est pas qu'il manquait un fichier : c'est qu'une garde qui DÉCLARE
 * qu'un domaine voisin est couvert énonce une hypothèse que rien ne vérifie.
 * Celle-ci vérifie donc, en plus du reste, que le contrat porte bien la
 * définition qu'elle prétend faire respecter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX RÈGLES, ET UNE SEULE ADMET DES EXCEPTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * **A. Aucun prédicat de statut de besoin ne nomme une valeur inexistante.**
 * Sans exception possible : une valeur hors de {@link PROJECT_NEED_STATUSES} ne
 * filtre rien, jamais, dans aucun contexte. C'est un défaut certain.
 *
 * **B. Aucune LISTE de statuts de besoin ne s'écrit à la main en SQL.** La
 * question « ce besoin attend-il encore quelqu'un ? » a une réponse unique :
 * `needStillOpenSql` en SQL, `isNeedOpen` en TypeScript. Nommer UN seul statut
 * reste permis — c'est nommer une issue, pas redéfinir un ensemble.
 */

const API_SRC = join(__dirname, '..')

/**
 * Les fichiers qui écrivent encore une liste à la main, et POURQUOI.
 *
 * ⚠️ CE N'EST PAS UNE LISTE DE CAS ADMIS — c'est une dette, datée et nommée.
 * L'entrée ci-dessous porte un DÉFAUT VIVANT : `NOT IN ('cancelled','lost')`
 * oublie `won` et `staffed`, donc un besoin gagné compte comme ouvert dans le
 * dénombrement « besoins du compte » d'un score de mission. Il n'est pas corrigé
 * ici parce que `modules/delivery/**` était tenu par un autre chantier le
 * 28/08/2026, et qu'une correction concurrente sur le même fichier se serait
 * perdue dans un conflit.
 *
 * La marche à suivre pour qui reprend `delivery` : remplacer le prédicat par
 * `needStillOpenSql('n.status')` et SUPPRIMER cette entrée. Le test « la dette
 * ne grossit pas » plus bas refuse qu'on en ajoute une autre.
 */
const HAND_WRITTEN_DEBT: readonly { file: string; why: string }[] = [
  {
    file: 'modules/delivery/mission-scores.service.ts',
    why: 'oublie `won` et `staffed` — défaut VIVANT, hors périmètre du lot du 28/08/2026 (chantier concurrent sur `delivery/**`)',
  },
]

/** Le fichier qui PORTE la définition : lui seul a le droit de l'écrire. */
const DEFINITION = join('packages', 'contracts', 'src', 'schemas', 'need-status.ts')

/**
 * Le source débarrassé de ce qui n'est pas du code.
 *
 * Blocs, lignes `//`, commentaires SQL `--`. Une phrase qui CITE un prédicat ne
 * doit ni le faire passer pour appliqué, ni pour une faute — et l'en-tête de ce
 * fichier en cite six.
 *
 * ⚠️ Un bloc retiré laisse ses RETOURS À LA LIGNE : sans ça, les numéros de
 * ligne du rapport désignent un endroit qui n'existe pas.
 */
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
    // Une migration passée ne se réécrit pas, et son `CHECK` est justement
    // l'endroit où l'énumération s'écrit.
    if (path.includes(`${'/'}migrations${'/'}`)) continue
    // Le jeu de démonstration POSE des besoins, il n'en interroge pas : y écrire
    // `status: 'matching'` est une donnée, pas une définition d'ensemble.
    if (path.endsWith(`${'/'}demo-dataset.ts`)) continue
    out.push(path)
  }
  return out
}

/**
 * Les identifiants par lesquels une requête désigne `project_needs`.
 *
 * `null` quand la table n'apparaît pas. Une chaîne vide dans l'ensemble signifie
 * « colonne NUE » : la requête ne nomme qu'une table, donc `status` sans préfixe
 * lui appartient. C'est la forme du KPI fautif, et celle qu'une garde qui
 * n'aurait résolu que les alias aurait manquée.
 */
export function needHandles(sql: string): Set<string> | null {
  if (!/\bproject_needs\b/i.test(sql)) return null
  const handles = new Set<string>()
  for (const match of sql.matchAll(/\b(?:FROM|JOIN)\s+project_needs\s+(?:AS\s+)?([a-z_][a-z0-9_]*)\b/gi)) {
    const alias = match[1]!
    if (!SQL_KEYWORDS.has(alias.toUpperCase())) handles.add(alias.toLowerCase())
  }
  const tables = new Set<string>()
  for (const match of sql.matchAll(/\b(?:FROM|JOIN)\s+([a-z_][a-zA-Z0-9_]*)/gi)) tables.add(match[1]!.toLowerCase())
  if (tables.size === 1 && tables.has('project_needs')) handles.add('')
  return handles.size > 0 ? handles : null
}

const SQL_KEYWORDS = new Set(['WHERE', 'GROUP', 'ORDER', 'LIMIT', 'HAVING', 'ON', 'SET', 'RETURNING', 'USING'])

type Finding = { line: number; excerpt: string; why: string }

/**
 * Les prédicats de statut de besoin écrits à la main dans du SQL.
 *
 * Elle compare des ENSEMBLES, jamais des mots : un prédicat dont aucun littéral
 * n'est un statut de besoin appartient à un `status` homonyme d'une autre table.
 * Et elle sépare les deux fautes — nommer l'inexistant, et recopier une liste.
 */
export function handWrittenNeedStatus(source: string): Finding[] {
  const code = withoutComments(source)
  const findings: Finding[] = []
  const real = new Set<string>(PROJECT_NEED_STATUSES)
  const lines = code.split('\n')

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    // Les poignées se résolvent sur le FICHIER : une requête s'étale sur
    // plusieurs lignes, et le `FROM` n'est presque jamais sur celle du `WHERE`.
    const handles = needHandles(code)
    if (!handles) break

    for (const handle of handles) {
      const prefix = handle === '' ? '(?<![a-z0-9_.])' : `\\b${handle}\\.`
      // ⚠️ `RegExp.exec` avec le drapeau `g` est STATEFUL : il reprend où il
      // s'était arrêté et saute une occurrence sur deux. `matchAll` sur une
      // expression FRAÎCHE est la seule forme qui les voie toutes.
      const predicate = new RegExp(
        `${prefix}status\\b\\s*(?:=|<>|!=|NOT\\s+IN|IN)\\s*\\(?\\s*((?:'[a-z_]+'\\s*,?\\s*)+)\\)?`,
        'gi',
      )
      for (const match of line.matchAll(predicate)) {
        const literals = [...(match[1] ?? '').matchAll(/'([a-z_]+)'/gi)].map(m => m[1] ?? '')
        const invented = literals.filter(value => !real.has(value))
        // Aucun littéral réel ET aucun inventé reconnaissable : c'est le
        // `status` d'une autre table, pas le nôtre.
        if (!literals.some(value => real.has(value))) continue

        if (invented.length > 0) {
          findings.push({
            line: index + 1,
            excerpt: match[0].trim(),
            why: `nomme ${invented.map(value => `\`${value}\``).join(', ')} — aucun n'est un statut de besoin, donc le prédicat ne filtre RIEN`,
          })
          continue
        }
        if (literals.length > 1) {
          findings.push({
            line: index + 1,
            excerpt: match[0].trim(),
            why: 'liste de statuts recopiée à la main — la définition vit au contrat',
          })
        }
      }
    }
  }
  return findings
}

function relative(path: string): string {
  const marker = `${'/'}apps${'/'}api${'/'}src${'/'}`
  const at = path.indexOf(marker)
  return at === -1 ? path : path.slice(at + marker.length)
}

describe('GA-62 — « un besoin encore ouvert » se demande au contrat', () => {
  const files = typescriptFiles(API_SRC)
  const offenders = files
    .map(path => ({ path, findings: handWrittenNeedStatus(readFileSync(path, 'utf8')) }))
    .filter(entry => entry.findings.length > 0)

  it('aucun prédicat de statut de besoin ne nomme une valeur inexistante', () => {
    const invented = offenders
      .map(entry => ({ ...entry, findings: entry.findings.filter(finding => finding.why.includes('filtre RIEN')) }))
      .filter(entry => entry.findings.length > 0)

    if (invented.length > 0) {
      throw new Error(
        [
          'Une requête filtre sur un statut de besoin qui n’existe pas.',
          '',
          'Un `NOT IN` sur une valeur absente de l’énumération ne lève pas : il est',
          'INERTE. Le prédicat a l’air d’exclure, et n’exclut rien.',
          '',
          ...invented.flatMap(({ path, findings }) => [
            `  ${relative(path)}`,
            ...findings.map(finding => `      L${finding.line} : ${finding.excerpt}   ← ${finding.why}`),
          ]),
          '',
          `Les statuts réels vivent dans ${DEFINITION} et \`project.ts\`.`,
        ].join('\n'),
      )
    }
    expect(invented).toEqual([])
  })

  it('aucune liste de statuts de besoin recopiée à la main, hors dette déclarée', () => {
    const copied = offenders
      .map(entry => ({ ...entry, findings: entry.findings.filter(finding => finding.why.includes('recopiée')) }))
      .filter(entry => entry.findings.length > 0)
      .filter(entry => !HAND_WRITTEN_DEBT.some(debt => relative(entry.path) === debt.file))

    if (copied.length > 0) {
      throw new Error(
        [
          'Du SQL redécide lui-même ce qu’est un besoin ouvert.',
          '',
          ...copied.flatMap(({ path, findings }) => [
            `  ${relative(path)}`,
            ...findings.map(finding => `      L${finding.line} : ${finding.excerpt}   ← ${finding.why}`),
          ]),
          '',
          'Remplace le prédicat par `needStillOpenSql(<colonne>)`, importé de',
          '`@bellum/contracts`. Nommer UN statut reste permis : c’est nommer une',
          'issue, pas redéfinir un ensemble.',
        ].join('\n'),
      )
    }
    expect(copied).toEqual([])
  })

  it('la dette déclarée existe encore, et elle ne grossit pas', () => {
    // Une dette qui a été payée doit sortir de la liste, sinon la liste devient
    // une décoration — et la prochaine entrée s'y glissera sans être lue.
    const paid = HAND_WRITTEN_DEBT.filter(
      debt => !offenders.some(offender => relative(offender.path) === debt.file),
    ).map(debt => debt.file)

    if (paid.length > 0) {
      throw new Error(
        [
          'Une dette déclarée a été payée — retire-la de `HAND_WRITTEN_DEBT` :',
          ...paid.map(file => `  ${file}`),
          '',
          'Une liste de dettes qu’on ne vide jamais devient une décoration, et la',
          'prochaine entrée s’y glisse sans être lue.',
        ].join('\n'),
      )
    }
    expect(paid).toEqual([])
    expect(HAND_WRITTEN_DEBT.length).toBeLessThanOrEqual(1)
  })

  it('la garde LIT vraiment un corpus, et il n’est pas vide', () => {
    expect(files.length).toBeGreaterThan(300)
    const bodies = files.map(path => readFileSync(path, 'utf8'))
    expect(bodies.join('').length).toBeGreaterThan(1_000_000)

    // Elle voit la table : plusieurs fichiers de l'API interrogent bien
    // `project_needs`, donc la résolution travaille sur du vrai code.
    const withNeeds = bodies.filter(body => needHandles(withoutComments(body)) !== null)
    expect(withNeeds.length).toBeGreaterThanOrEqual(3)

    // Et elle lit le contrat, pas une recopie : les deux ensembles viennent de
    // l'énumération, ils sont disjoints.
    const openAndClosed = [...NEED_OPEN_STATUSES, ...NEED_CLOSED_STATUSES]
    expect(new Set(openAndClosed).size).toBe(openAndClosed.length)
    // Ils couvrent l'énumération entière, À L'EXCEPTION du bucket documenté et
    // délibérément tiers (#2323.1, `need-status.ts`) : `detected` n'est ni
    // ouvert ni clos tant qu'il n'a pas été confirmé (`to_qualify`) ou écarté.
    const DELIBERATELY_NEITHER_OPEN_NOR_CLOSED = ['detected']
    expect([...openAndClosed, ...DELIBERATELY_NEITHER_OPEN_NOR_CLOSED].sort()).toEqual(
      [...PROJECT_NEED_STATUSES].sort(),
    )
    // Les deux valeurs du défaut ne sont PAS des statuts — c'est tout le sujet.
    expect(PROJECT_NEED_STATUSES as readonly string[]).not.toContain('closed')
    expect(PROJECT_NEED_STATUSES as readonly string[]).not.toContain('filled')
  })

  it('la garde sait dire NON — sur les quatre formes qui ont réellement existé', () => {
    const routine = `const q = \`SELECT n.title FROM project_needs n
                      WHERE n.status NOT IN ('closed', 'cancelled', 'filled')\``
    expect(handWrittenNeedStatus(routine)).toHaveLength(1)
    expect(handWrittenNeedStatus(routine)[0]?.why).toContain('filtre RIEN')

    // La colonne NUE : une seule table, pas d'alias — la forme du KPI.
    const kpi = `const q = \`SELECT count(*) FROM project_needs
                   WHERE workspace_id = $1 AND status NOT IN ('closed', 'cancelled', 'filled')\``
    expect(handWrittenNeedStatus(kpi)).toHaveLength(1)

    // La liste JUSTE mais recopiée : refusée aussi, c'est une seconde vérité.
    const copied = `const q = \`SELECT 1 FROM project_needs n
                     WHERE n.status NOT IN ('lost', 'cancelled', 'won', 'staffed')\``
    expect(handWrittenNeedStatus(copied)).toHaveLength(1)
    expect(handWrittenNeedStatus(copied)[0]?.why).toContain('recopiée')

    // La liste incomplète de `delivery` : vue elle aussi (elle est en dette).
    const partial = `const q = \`SELECT 1 FROM project_needs n JOIN opportunities o ON o.id = n.project_id
                      WHERE n.status NOT IN ('cancelled', 'lost')\``
    expect(handWrittenNeedStatus(partial)).toHaveLength(1)

    // ── Et elle laisse passer ce qui est JUSTE ──────────────────────────────
    // ⚠️ LE GABARIT SE LIT DANS LE SOURCE, PAS APRÈS INTERPOLATION. Une garde
    // lit des fichiers : à l'endroit où elle regarde, l'appel au contrat est
    // encore un `${…}` et les statuts n'y figurent pas. Écrire ici la chaîne
    // DÉJÀ interpolée ferait échouer la garde sur son propre correctif — c'est
    // ce qu'a fait la première version de ce test, et c'est le test qui avait
    // tort. La forme ci-dessous est celle du vrai fichier, au caractère près.
    const fixed = "const q = `SELECT 1 FROM project_needs n WHERE ${needStillOpenSql('n.status')}`"
    expect(fixed).toContain('needStillOpenSql')
    expect(handWrittenNeedStatus(fixed)).toEqual([])

    // Et la fabrique du contrat produit bien, elle, la liste complète : c'est
    // la preuve que le `${…}` ci-dessus ne cache pas un ensemble vide.
    for (const status of NEED_OPEN_STATUSES) expect(needStillOpenSql('n.status')).toContain(`'${status}'`)
    for (const status of NEED_CLOSED_STATUSES) expect(needStillOpenSql('n.status')).not.toContain(`'${status}'`)

    // Nommer UN statut est nommer une issue, pas un ensemble.
    expect(handWrittenNeedStatus(`const q = \`SELECT 1 FROM project_needs n WHERE n.status = 'won'\``)).toEqual([])

    // Un commentaire qui CITE le prédicat fautif ne le fait pas exister…
    const quoted = `// n.status NOT IN ('closed', 'cancelled', 'filled')
      const q = \`SELECT 1 FROM project_needs n WHERE n.id = $1\``
    expect(handWrittenNeedStatus(quoted)).toEqual([])

    // …ni un \`status\` homonyme appartenant à une AUTRE table.
    const other = `const q = \`SELECT 1 FROM project_needs n JOIN missions m ON m.id = n.id
                     WHERE m.status IN ('active', 'onboarding')\``
    expect(handWrittenNeedStatus(other)).toEqual([])

    // …et sans la table, aucune poignée, donc aucun verdict.
    expect(handWrittenNeedStatus(`const q = \`SELECT 1 FROM tasks t WHERE t.status = 'todo'\``)).toEqual([])
  })
})
