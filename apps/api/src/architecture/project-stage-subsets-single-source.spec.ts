import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  CLOSED_STAGES,
  CLOSED_UNWON_STAGES,
  DECIDED_STAGES,
  INTAKE_STAGES,
  LIVE_STAGES,
  PROJECT_STAGES,
  TRIAGED_STAGES,
} from '@bellum/contracts'

/**
 * GA-57 — UN SOUS-ENSEMBLE DE STADES DE PROJET SE DEMANDE AU CONTRAT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE (D37, 28/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois endroits portaient l'idée « un projet encore en jeu », avec trois
 * contenus différents :
 *
 *   · `LIVE_STAGES` (contrat) — les six non clos, intake compris, et AUCUN
 *     consommateur ;
 *   · le Pilotage — `stage NOT IN (intake ∪ clos)`, soit les quatre du milieu ;
 *   · `summarizeLearning` — trois stades tapés à la main, sans `qualified`, qui
 *     n'entrait donc dans AUCUN des trois paniers de la boucle d'apprentissage
 *     tout en étant compté dans sa population.
 *
 * Le fond n'était pas « trois copies » mais DEUX questions distinctes dont une
 * seule avait un nom. Les deux sont désormais nommées dans
 * `opportunity-ontology.ts`, et la seconde DÉRIVE de la première :
 *
 *   · « en jeu »        = pas clos, intake compris   → `LIVE_STAGES`
 *   · « pris en charge » = en jeu, moins l'intake     → `TRIAGED_STAGES`
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI « LES DEUX FICHIERS CONTIENNENT LE MÊME TEXTE » NE SUFFIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Une garde qui exigerait que deux endroits écrivent la même liste est
 * satisfaite par deux copies identiques — c'est-à-dire par l'état exact d'où
 * part toute divergence. Celle-ci demande l'inverse : que le second endroit
 * n'écrive AUCUNE liste et RÉFÉRENCE le premier (`projectStageInSql(...,
 * TRIAGED_STAGES)`). Un fichier qui appelle la fabrique ne contient plus aucun
 * littéral de stade : c'est ce qui rend la règle vérifiable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMMENT ELLE REGARDE
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. Elle retire les commentaires : une phrase qui CITE un prédicat ne doit pas
 *     le faire passer pour appliqué, ni pour une faute.
 *  2. En SQL, elle ne regarde que les prédicats sur une colonne nommée `stage`.
 *     Un `n.status NOT IN ('lost','cancelled','won','staffed')` appartient aux
 *     besoins, qui ont leur propre taxonomie et leur propre garde.
 *  3. Elle compare des ENSEMBLES contre `PROJECT_STAGES`, jamais des mots.
 *  4. En TypeScript, elle ne relève qu'un tableau dont TOUTES les valeurs sont
 *     des stades — `['won','lost','cancelled','staffed']` mélange deux
 *     taxonomies et n'est pas un sous-ensemble de stades déguisé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne juge pas une comparaison à UN seul stade (`stage === 'won'`) : nommer
 * un stade est nommer une issue, pas redéfinir un sous-ensemble. Elle ne lit ni
 * les migrations (le `CHECK` est justement l'endroit où l'énumération s'écrit),
 * ni les tests (une assertion CITE, elle ne définit pas).
 */

const REPO = join(__dirname, '..', '..', '..', '..')
const CONTRACTS = join(REPO, 'packages', 'contracts', 'src')

/** Le fichier qui PORTE les sous-ensembles : lui seul a le droit de les écrire. */
const DEFINITION = join('packages', 'contracts', 'src', 'schemas', 'opportunity-ontology.ts')

/**
 * Les fichiers qui ont le droit d'écrire une liste de stades, et pourquoi.
 *
 * `project.ts` déclare la taxonomie elle-même (`PROJECT_STAGES`, `INTAKE_STAGES`,
 * `CLOSED_STAGES`, `PIPELINE_STAGES`) — sans elle, il n'y aurait rien à dériver.
 * `opportunity-ontology.ts` en dérive les sous-ensembles. `enum-baseline.ts` est
 * la photo figée de GA-08 : la recopier est sa raison d'être.
 */
const HOMES = new Set(['project.ts', 'opportunity-ontology.ts', 'enum-baseline.ts'])

/**
 * LA DETTE DE D37, NOMMÉE ET GELÉE.
 *
 * Ces prédicats disent « encore en jeu » à la main, et ils sont HORS du
 * périmètre que Louis a ouvert le 28/08 (projets + pilotage + contrat). Ils ne
 * sont pas tolérés : ils sont INVENTORIÉS, et l'inventaire ne peut ni grandir
 * ni changer sans qu'un humain le relise. Deux d'entre eux posent une question
 * PRODUIT avant d'être convertibles — ils traitent `dormant` comme encore en
 * jeu, ce que ni le Pilotage ni la boucle d'apprentissage ne font.
 *
 * ⚠️ Cet inventaire est comparé par ÉGALITÉ, pas par inclusion : réparer une
 * entrée fait tomber la garde tant qu'on ne l'a pas retirée d'ici. C'est
 * volontaire — une dette qu'on peut oublier de rayer n'est pas une dette, c'est
 * une permission.
 */
const DETTE_D37: readonly { file: string; excerpt: string; why: string }[] = [
  // ⚠️ VIDE, et c'est le résultat de D52 · 26/08 : les cinq listes que D37
  // avait gelées ici sont converties. Deux l'étaient mécaniquement (même
  // population, autre écriture) ; les trois autres posaient une question
  // produit, tranchée par Louis — `dormant` reste EN JEU pour les routines,
  // parce qu'une routine de réveil existe précisément pour ce qui dort.
  // La cinquième portait `to_qualify`, qui n'est PAS un stade de projet : un
  // reste du cycle FR d'avant le pivot, dont il est PROUVÉ qu'il ne désigne
  // aucune ligne (la contrainte `opportunities_stage_check` ne l'admet pas).
  //
  // L'inventaire est comparé par ÉGALITÉ, dans les deux sens : une entrée
  // périmée fait rougir autant qu'une liste oubliée. Le laisser vide est donc
  // une affirmation vérifiée, pas un oubli.
]

type Finding = { file: string; line: number; excerpt: string; why: string }

/**
 * Le source débarrassé de ce qui n'est pas du code.
 *
 * Les blocs perdent leur contenu mais GARDENT leurs retours à la ligne : sans
 * ça, les numéros de ligne du rapport désignent un endroit qui n'existe pas, et
 * une garde qui envoie au mauvais endroit se fait contourner au lieu d'être lue.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, ' '))
    .replace(/(?<!:)\/\/[^\n]*/g, ' ')
    .replace(/--[^\n]*/g, ' ')
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      sourceFiles(path, out)
      continue
    }
    if (!/\.(ts|tsx)$/.test(path)) continue
    if (/\.(spec|test)\.tsx?$/.test(path)) continue
    if (path.includes(`${'/'}migrations${'/'}`)) continue
    out.push(path)
  }
  return out
}

const KNOWN_STAGES = new Set<string>(PROJECT_STAGES)

/** Les stades cités dans un fragment, sans doublon et dans l'ordre rencontré. */
function stagesIn(fragment: string): string[] {
  const seen = new Set<string>()
  for (const match of fragment.matchAll(/'([a-z_]+)'/g)) {
    const value = match[1] ?? ''
    if (KNOWN_STAGES.has(value)) seen.add(value)
  }
  return [...seen]
}

/** Toutes les chaînes citées d'un fragment — stades ou non. */
function literalsIn(fragment: string): string[] {
  return [...fragment.matchAll(/'([a-z_]*)'/g)].map(match => match[1] ?? '')
}

/**
 * Les sous-ensembles de stades écrits à la main dans un source.
 *
 * ⚠️ `RegExp.exec` avec le drapeau `g` est STATEFUL — il reprend où il s'était
 * arrêté et saute une occurrence sur deux. `matchAll` sur une expression
 * FRAÎCHE est la seule forme qui les voit toutes.
 */
function handWrittenSubsets(source: string, file = '<inline>'): Finding[] {
  const lines = withoutComments(source).split('\n')
  const findings: Finding[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''

    // ── SQL : un prédicat sur une colonne `stage` ────────────────────────────
    for (const match of line.matchAll(/\b(?:[a-z_][a-z0-9_]*\.)?stage\b\s*(?:NOT\s+IN|IN)\s*\(([^)]*)\)/gi)) {
      const stages = stagesIn(match[1] ?? '')
      if (stages.length < 2) continue
      findings.push({
        file,
        line: index + 1,
        excerpt: (match[0] ?? '').trim(),
        why: `sous-ensemble de stades écrit à la main (${stages.join(', ')})`,
      })
    }

    // ── TypeScript : un tableau qui n'est QUE des stades ─────────────────────
    for (const match of line.matchAll(/\[([^\][]*)\]/g)) {
      const body = match[1] ?? ''
      const all = literalsIn(body)
      const stages = stagesIn(body)
      if (stages.length < 2 || all.length !== stages.length) continue
      findings.push({
        file,
        line: index + 1,
        excerpt: (match[0] ?? '').trim(),
        why: `liste de stades écrite à la main (${stages.join(', ')})`,
      })
    }
  }
  return findings
}

function relative(path: string): string {
  return path.startsWith(REPO) ? path.slice(REPO.length + 1) : path
}

describe('GA-57 — un sous-ensemble de stades vient du contrat', () => {
  const files = [...sourceFiles(join(__dirname, '..')), ...sourceFiles(CONTRACTS)].filter(
    path => !HOMES.has(path.split('/').pop() ?? ''),
  )

  const findings = files.flatMap(path => handWrittenSubsets(readFileSync(path, 'utf8'), relative(path)))

  it('aucune liste de stades « en jeu » écrite à la main, hors la dette inventoriée', () => {
    const key = (entry: { file: string; excerpt: string }) => `${entry.file} :: ${entry.excerpt}`
    const found = findings.map(key).sort()
    const declared = DETTE_D37.map(key).sort()

    const surprises = findings.filter(finding => !declared.includes(key(finding)))
    const settled = DETTE_D37.filter(entry => !found.includes(key(entry)))

    if (surprises.length > 0 || settled.length > 0) {
      throw new Error(
        [
          'La définition d’un sous-ensemble de stades vit à UN seul endroit :',
          `  ${DEFINITION} — LIVE_STAGES, TRIAGED_STAGES, CLOSED_UNWON_STAGES, DECIDED_STAGES.`,
          'Le SQL les rend par projectStageInSql / projectStageNotInSql, importés de @bellum/contracts.',
          '',
          ...(surprises.length > 0
            ? [
                'Une liste de stades ÉCRITE À LA MAIN est apparue :',
                ...surprises.map(f => `  ${f.file}:${f.line}  ${f.excerpt}   ← ${f.why}`),
                '',
                'Remplace-la par la constante qui porte la question posée :',
                '  « reste-t-il quelque chose à faire ? »  → LIVE_STAGES',
                '  « un humain s’en occupe-t-il ? »        → TRIAGED_STAGES',
                '  « l’issue est-elle connue ? »           → DECIDED_STAGES',
                '  « clos sans affaire »                   → CLOSED_UNWON_STAGES',
                '',
              ]
            : []),
          ...(settled.length > 0
            ? [
                'Une entrée de DETTE_D37 n’existe plus dans le code — RAYE-LA de l’inventaire :',
                ...settled.map(entry => `  ${entry.file}  ${entry.excerpt}`),
              ]
            : []),
        ].join('\n'),
      )
    }
    expect({ surprises, settled }).toEqual({ surprises: [], settled: [] })
  })

  it('les deux services convergés RÉFÉRENCENT le contrat au lieu de le recopier', () => {
    // Le point qui manque à toute garde « les deux fichiers disent la même
    // chose » : ici le second ne dit RIEN, il cite le premier.
    for (const path of [
      join(__dirname, '..', 'modules', 'projects', 'projects.service.ts'),
      join(__dirname, '..', 'modules', 'pilotage', 'pilotage.service.ts'),
      join(__dirname, '..', 'modules', 'pilotage', 'data-hygiene.service.ts'),
    ]) {
      const code = withoutComments(readFileSync(path, 'utf8'))
      expect(code).toContain('@bellum/contracts')
      // #4191 G2 — `OPPORTUNITIES_ACTIVE_SQL` est lui-même bâti sur `projectStageInSql` DANS le contrat
      // (`crm-counters.ts`) : le citer, c'est encore citer le contrat, pas recopier un sous-ensemble.
      expect(code).toMatch(/projectStage(Not)?InSql\(|\bOPPORTUNITIES_ACTIVE_SQL\b/)
      expect(handWrittenSubsets(code, relative(path))).toEqual([])
    }
  })

  it('la garde LIT vraiment, et sait dire NON', () => {
    // ── Elle LIT ────────────────────────────────────────────────────────────
    // Un corpus vide passerait au vert éternellement. Bornes basses et larges :
    // elles tombent si l'arborescence bouge sous la garde, pas à chaque fichier.
    expect(files.length).toBeGreaterThan(300)
    const bodies = files.map(path => readFileSync(path, 'utf8'))
    expect(bodies.join('').length).toBeGreaterThan(1_000_000)
    // Elle voit bien la table : plusieurs fichiers interrogent `stage`.
    expect(bodies.filter(body => /\bstage\b/.test(withoutComments(body))).length).toBeGreaterThanOrEqual(10)
    // Et elle lit le contrat, pas une recopie : les sous-ensembles dérivent.
    expect([...TRIAGED_STAGES, ...INTAKE_STAGES].sort()).toEqual([...LIVE_STAGES].sort())
    expect([...LIVE_STAGES, ...CLOSED_STAGES].sort()).toEqual([...PROJECT_STAGES].sort())
    expect([...CLOSED_UNWON_STAGES, 'won'].sort()).toEqual([...CLOSED_STAGES].sort())
    expect(DECIDED_STAGES.length).toBe(2)

    // ── Elle sait dire NON ──────────────────────────────────────────────────
    // Les formes qui ont RÉELLEMENT existé dans le dépôt le 28/08/2026.
    const learning = `const q = \`COUNT(*) FILTER (WHERE o.stage IN ('confirmed','profiles_submitted','negotiation'))\``
    expect(handWrittenSubsets(learning)).toHaveLength(1)
    expect(handWrittenSubsets(learning)[0]?.why).toContain('confirmed')

    const hygiene = `const q = \`WHERE workspace_id = $1 AND stage NOT IN ('won', 'lost', 'dormant')\``
    expect(handWrittenSubsets(hygiene)).toHaveLength(1)

    const pilotage = `const untriaged = ['detected', 'potential', 'won', 'lost', 'dormant']`
    expect(handWrittenSubsets(pilotage)).toHaveLength(1)
    expect(handWrittenSubsets(pilotage)[0]?.why).toContain('liste de stades')

    // Une QUATRIÈME liste, qui n'a jamais existé, dirait la même chose.
    const fourth = `export const OPEN_STAGES = ['qualified', 'confirmed', 'negotiation'] as const`
    expect(handWrittenSubsets(fourth)).toHaveLength(1)

    // ── Et elle ne crie pas au loup ─────────────────────────────────────────
    // Un COMMENTAIRE qui cite le prédicat n'est pas le prédicat.
    expect(handWrittenSubsets(`// stage NOT IN ('won','lost','dormant') expliqué ici`)).toEqual([])
    expect(handWrittenSubsets(`/* o.stage IN ('confirmed','negotiation') */\nconst q = 1`)).toEqual([])
    // UN seul stade nommé est une issue, pas un sous-ensemble.
    expect(handWrittenSubsets(`const won = row.stage === 'won'`)).toEqual([])
    expect(handWrittenSubsets(`const q = \`COUNT(*) FILTER (WHERE o.stage = 'won')\``)).toEqual([])
    // Une AUTRE taxonomie qui partage des mots n'est pas concernée.
    expect(handWrittenSubsets(`const q = \`WHERE n.status NOT IN ('lost','cancelled','won','staffed')\``)).toEqual([])
    expect(handWrittenSubsets(`const SETTLED = ['won', 'lost', 'cancelled', 'staffed', 'on_hold']`)).toEqual([])
    expect(
      handWrittenSubsets(`const NEED_STAGES = ['signal', 'plausible', 'qualified', 'confirmed'] as const`),
    ).toEqual([])
    // Et la forme CONVERGÉE passe : plus aucun littéral, une référence.
    const fixed = `const q = \`COUNT(*) FILTER (WHERE \${projectStageInSql('o.stage', TRIAGED_STAGES)})\``
    expect(handWrittenSubsets(fixed)).toEqual([])
  })
})
