import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-66 — UN TOTAL DE COÛT QUI ABSORBE UNE ABSENCE DIT QU'IL EST UN PLANCHER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE (29/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le modèle d'unit-economics du 18/08/2026 porte quatre postes de coût fixe à
 * **0 €** faute de facture, et l'écrit lui-même :
 *
 *   « Facture non fournie : **le zéro est un trou, pas un fait**. »
 *   « Ce total est un plancher : quatre lignes "À VÉRIFIER" y figurent à 0 €. »
 *
 * C'est mot pour mot la doctrine du dépôt — « non mesuré n'est jamais 0 » —
 * appliquée à la comptabilité. En SQL, elle a une forme exacte et une seule :
 *
 *   `COALESCE(SUM(cout), 0)`  —  `SUM()` sur zéro ligne rend `NULL`,
 *                                le `COALESCE` le convertit en `0`,
 *                                et l'écran lit « ça n'a rien coûté ».
 *
 * Le dépôt a déjà payé ce défaut trois fois côté revenus (`revenue.service.ts`,
 * `forecast-lines.spec.ts`, `propagation.service.ts` en portent le récit). Côté
 * COÛT, il vivait toujours :
 *
 *   · `provider-cost.service.ts` le faisait BIEN — le `COALESCE(SUM(cost_usd),0)`
 *     y voyage avec `COUNT(*) FILTER (WHERE cost_usd IS NULL)`, si bien que le
 *     zéro n'est jamais lu seul ;
 *   · `admin-ops.service.ts` faisait la MÊME chose sans le compte, sur les trois
 *     requêtes de l'écran opérateur — et ajoutait `COALESCE(AVG(...), 0)`, qui
 *     annonçait « 0,0000 $ de coût moyen par analyse » quand AUCUNE analyse
 *     n'avait jamais été tarifée.
 *
 * Une garde protège une règle, elle ne l'invente pas : celle-ci reprend
 * exactement la discipline que `provider_costs` tenait déjà seule.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX RÈGLES
 * ─────────────────────────────────────────────────────────────────────────────
 * **A. `COALESCE(AVG(<coût>), 0)` est INTERDIT, sans exception.** Une moyenne
 * sur zéro valeur n'est pas nulle : elle n'existe pas. Aucun compte à côté ne
 * rattrape un « coût moyen » faux — le lecteur lit un prix unitaire.
 *
 * **B. `COALESCE(SUM|AVG(<coût>), 0)` doit être ACCOMPAGNÉ, dans la MÊME
 * requête, du compte des lignes qu'il n'a pas pu mesurer** (`COUNT(...) FILTER
 * (WHERE <colonne> IS NULL)`). Un `SUM()` NU, qui laisse le `NULL` remonter,
 * est déjà honnête : la garde ne le touche pas — c'est le choix de
 * `analysis-runs.service.ts:421`, et il est juste.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE NE COUVRE PAS, ET POURQUOI C'EST ÉCRIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle lit du SQL écrit dans du TypeScript. Elle ne voit ni les agrégats faits
 * en mémoire (`reduce((s, x) => s + (x.cost ?? 0), 0)`), ni le service IA en
 * Python. Deux endroits mesurés et laissés en l'état ce jour-là, parqués plutôt
 * que corrigés en passant :
 * `analysis-telemetry.service.ts:221,435,674` (`?? 0` sur un coût de phase).
 * Une garde qui DÉCLARE couvrir un domaine voisin énonce une hypothèse que rien
 * ne vérifie — GA-62 l'a appris. Celle-ci déclare donc l'inverse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PREUVE DESTRUCTIVE (29/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * · Règle A : rétabli `COALESCE(AVG(a.api_cost_euros), 0)` dans
 *   `admin-ops.service.ts` → ROUGE, `1 agrégat de coût` listé avec sa ligne.
 * · Règle B : retiré la ligne `COUNT(*) FILTER (WHERE cost_usd IS NULL)` de
 *   `provider-cost.service.ts` → ROUGE, la requête est nommée.
 * · Corpus : forcé `API_SRC` sur un dossier vide → ROUGE au test « la garde lit
 *   un corpus non vide ».
 * Les trois restaurés ensuite ; la suite repasse au VERT.
 */

const API_SRC = join(__dirname, '..')

/** Une colonne dont le nom dit qu'elle porte un coût. */
const COST_COLUMN = /cost/i

/** `COALESCE( SUM|AVG ( … ) , 0 )` — la forme exacte du défaut. */
const COALESCED_AGGREGATE = /COALESCE\s*\(\s*(SUM|AVG)\s*\(\s*([^()]*)\)/gi

/** Le compte des lignes non mesurées, qui rend le total lisible comme un plancher. */
const UNMEASURED_COUNTER = /COUNT\s*\([^)]*\)\s*FILTER\s*\(\s*WHERE\s+[\w."]*\s+IS\s+NULL\s*\)/i

type Finding = { file: string; line: number; excerpt: string; rule: 'A' | 'B' }

function typescriptFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue
      out.push(...typescriptFiles(path))
      continue
    }
    // Les fichiers de test CITENT le défaut pour l'interdire : les scanner
    // ferait échouer la garde sur les assertions qui la défendent.
    if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts') || entry.endsWith('.test.ts')) continue
    out.push(path)
  }
  return out
}

function relative(path: string): string {
  const marker = `${'/'}apps${'/'}api${'/'}src${'/'}`
  const at = path.indexOf(marker)
  return at === -1 ? path : path.slice(at + marker.length)
}

/**
 * La requête qui ENTOURE une position : du dernier `SELECT` qui la précède au
 * `SELECT` suivant. Trois requêtes écrites l'une après l'autre dans le même
 * fichier sont donc jugées séparément — c'est nécessaire : `admin-ops` en
 * enchaîne trois, et le compte de la première ne dit rien de la deuxième.
 */
function enclosingStatement(content: string, at: number): string {
  const before = content.lastIndexOf('SELECT', at)
  const after = content.indexOf('SELECT', at + 1)
  return content.slice(before === -1 ? 0 : before, after === -1 ? content.length : after)
}

function lineOf(content: string, at: number): number {
  return content.slice(0, at).split('\n').length
}

function scan(): { findings: Finding[]; aggregatesRead: number; filesRead: number } {
  const findings: Finding[] = []
  let aggregatesRead = 0
  const files = typescriptFiles(API_SRC)

  for (const file of files) {
    const content = readFileSync(file, 'utf8')
    if (!content.includes('COALESCE')) continue
    // ⚠️ `RegExp.test`/`exec` avec le drapeau `g` est STATEFUL : réutiliser la
    // constante d'un fichier à l'autre sauterait des occurrences. On repart de
    // zéro à chaque fichier.
    const pattern = new RegExp(COALESCED_AGGREGATE.source, 'gi')
    let match: RegExpExecArray | null
    while ((match = pattern.exec(content)) !== null) {
      const fn = (match[1] ?? '').toUpperCase()
      const inner = match[2] ?? ''
      if (!COST_COLUMN.test(inner)) continue
      aggregatesRead += 1

      const statement = enclosingStatement(content, match.index)
      const excerpt = match[0].replace(/\s+/g, ' ').trim()
      if (fn === 'AVG') {
        findings.push({ file: relative(file), line: lineOf(content, match.index), excerpt, rule: 'A' })
        continue
      }
      if (!UNMEASURED_COUNTER.test(statement)) {
        findings.push({ file: relative(file), line: lineOf(content, match.index), excerpt, rule: 'B' })
      }
    }
  }

  return { findings, aggregatesRead, filesRead: files.length }
}

describe('GA-66 — un total de coût dit qu’il est un plancher', () => {
  const { findings, aggregatesRead, filesRead } = scan()

  it('la garde LIT un corpus non vide', () => {
    // Une garde qui ne lit rien est verte pour la mauvaise raison. Deux
    // vérifications, pas une : des fichiers, ET des agrégats de coût trouvés
    // dedans. La première seule passerait sur une expression régulière cassée.
    expect(filesRead).toBeGreaterThan(100)
    expect(aggregatesRead).toBeGreaterThanOrEqual(2)
  })

  it('aucune MOYENNE de coût ne retombe sur zéro', () => {
    const offenders = findings.filter(finding => finding.rule === 'A')
    if (offenders.length > 0) {
      throw new Error(
        [
          'Une moyenne de coût est ramenée à zéro quand il n’y a rien à moyenner.',
          '',
          'Une moyenne sur zéro valeur n’est pas nulle : elle n’existe pas. Rendre',
          '`0` fait lire « chaque analyse coûte 0,0000 $ » à un opérateur dont AUCUNE',
          'analyse n’a jamais été tarifée. Retirer le COALESCE et laisser remonter',
          '`null` — l’écran écrit « — ».',
          '',
          ...offenders.map(o => `  ${o.file}:${o.line}   ${o.excerpt}`),
        ].join('\n'),
      )
    }
    expect(offenders).toEqual([])
  })

  it('un total de coût qui absorbe une absence compte ce qu’il n’a pas mesuré', () => {
    const offenders = findings.filter(finding => finding.rule === 'B')
    if (offenders.length > 0) {
      throw new Error(
        [
          'Un total de coût transforme une absence en zéro sans le dire.',
          '',
          '`SUM()` sur zéro ligne rend NULL ; le COALESCE en fait `0`, et le lecteur',
          'décide dessus. Deux issues, les deux acceptables :',
          '  · retirer le COALESCE et laisser remonter `null` (cf. `analysis-runs.service.ts`) ;',
          '  · le garder ET ajouter, dans LA MÊME requête,',
          '    `COUNT(*) FILTER (WHERE <colonne> IS NULL)::int AS "…"` — le total devient',
          '    un plancher qui DIT combien de lignes il laisse de côté',
          '    (cf. `analytics/provider-cost.service.ts`).',
          '',
          ...offenders.map(o => `  ${o.file}:${o.line}   ${o.excerpt}`),
        ].join('\n'),
      )
    }
    expect(offenders).toEqual([])
  })
})
