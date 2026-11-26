import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { OPEN_PIPELINE_STAGES, PROJECT_STAGES, pipelineSummary } from '@bellum/contracts'

/**
 * GA-73 — UN TOTAL EN EUROS SUR DES AFFAIRES NOMME LES STATUTS QU'IL SOMME.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI ÉTAIT MESURÉ (29/08/2026, feuille `ANOMALIES CRM` du CRM de Louis)
 * ─────────────────────────────────────────────────────────────────────────────
 * « Consolider SANS ADDITIONNER LES STATUTS » (l. 14), et la feuille
 * `MULTIOFFRES` : « additionner leurs statuts gonfle artificiellement le pipe ».
 * Deux chiffres du produit le faisaient :
 *
 *  · `manager.service.ts` › `pipelineValue` — AUCUN prédicat de stade. Le
 *    « Pipeline partagé » en gras du cockpit manager additionnait le détecté,
 *    l'ouvert, le SIGNÉ, le PERDU et le DORMANT ;
 *  · `pipelineSummary()` (contrat) — sommait les cinq colonnes du tableau,
 *    `won` compris, sous « X € sur N projets au pipe » et « Mon pipe ».
 *
 * Le défaut n'est pas qu'un chiffre soit faux de peu : c'est qu'il ne veut RIEN
 * DIRE. Il ne mesure ni ce qui reste à gagner (il contient du gagné, et du
 * perdu), ni ce qui a été fait (il contient de l'ouvert). Et il ne baisse jamais
 * quand on gagne — une affaire signée change de colonne sans quitter le total.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX BRAS, PARCE QU'IL Y A DEUX FAÇONS DE LE REFAIRE
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. COMPORTEMENTAL — la dérivation pure. On lui donne un jeu de lignes qui
 *     couvre les NEUF stades du contrat, avec un montant DIFFÉRENT sur chacun,
 *     et on vérifie que le total ne vaut que la somme des étapes en jeu. Une
 *     garde de source (« la fonction importe bien `OPEN_PIPELINE_STAGES` »)
 *     passerait au vert le jour où elle l'importe et l'ignore.
 *  2. SOURCE — le SQL. Une requête qui somme un montant d'opportunité en base
 *     ne se teste pas par son résultat : le service somme ce que Postgres lui
 *     rend, donc une fixture qui ne contiendrait pas de ligne perdue ferait
 *     passer au vert une requête sans filtre. C'est exactement ce que faisait
 *     `manager.service.spec.ts` (« 30000 + 50000 + 0 = 80000 » sur trois stades
 *     choisis à la main). La seule chose vérifiable est le PÉRIMÈTRE demandé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne dit pas QUEL sous-ensemble une requête doit choisir — `= 'won'` est un
 * périmètre parfaitement légitime pour du chiffre d'affaires signé
 * (`objectives.service.ts`). Elle exige qu'il y en ait UN, écrit, dans la même
 * requête que la somme. Un total sans périmètre est un total qui mélange.
 *
 * ⚠️ Numérotation : le dépôt était monté à GA-67 au moment de l'écriture. Si un
 * autre chantier a pris GA-73 en parallèle, c'est CETTE garde qui se renumérote
 * — la collision est possible, elle n'est pas silencieuse.
 */

const MODULES = join(__dirname, '..', 'modules')

/* ─── Bras 1 — la dérivation pure ─────────────────────────────────────────── */

describe('GA-73 · le résumé du pipe ne somme qu’un seul statut', () => {
  /** Un montant distinct par stade : un total faux ne peut pas tomber juste. */
  const rows = PROJECT_STAGES.map((stage, index) => ({ stage, amount_cents: (index + 1) * 1_000 }))

  it('LIT un corpus qui couvre les NEUF stades du contrat', () => {
    // Sans cette assertion, la garde resterait verte sur un corpus vide — et
    // « aucune ligne ne mélange les statuts » est trivialement vrai de zéro ligne.
    expect(PROJECT_STAGES.length).toBe(9)
    expect(new Set(rows.map(row => row.stage)).size).toBe(PROJECT_STAGES.length)
    expect(OPEN_PIPELINE_STAGES.length).toBe(4)
  })

  it('ne compte QUE les étapes encore en jeu dans le total', () => {
    const summary = pipelineSummary(rows)
    const expected = rows
      .filter(row => (OPEN_PIPELINE_STAGES as readonly string[]).includes(row.stage))
      .reduce((sum, row) => sum + row.amount_cents, 0)

    expect(summary.total_amount_cents).toBe(expected)
    expect(summary.total_count).toBe(OPEN_PIPELINE_STAGES.length)
  })

  it('compte le signé À PART, et laisse le perdu et le dormant hors des deux', () => {
    const summary = pipelineSummary(rows)
    const amountOf = (stage: string) => rows.find(row => row.stage === stage)!.amount_cents
    const inThePipe = [...OPEN_PIPELINE_STAGES, 'won'].reduce((sum, stage) => sum + amountOf(stage), 0)

    expect(summary.signed_amount_cents).toBe(amountOf('won'))
    expect(summary.signed_count).toBe(1)
    // Les deux totaux réunis valent EXACTEMENT les cinq colonnes du tableau :
    // ni le perdu, ni le dormant, ni l'entonnoir n'entrent nulle part. C'est
    // une égalité, pas un « moins que » — un « moins que » resterait vrai si le
    // perdu entrait dans le total et le signé en sortait.
    expect(summary.total_amount_cents + summary.signed_amount_cents).toBe(inThePipe)
    expect(inThePipe).toBeLessThan(rows.reduce((sum, row) => sum + row.amount_cents, 0))
  })

  it('ne remonte PAS quand une affaire se gagne — c’est ce qui rendait le chiffre faux', () => {
    const before = pipelineSummary([
      { stage: 'negotiation', amount_cents: 500_000 },
      { stage: 'qualified', amount_cents: 100_000 },
    ])
    // La MÊME affaire, une semaine plus tard : elle est signée.
    const after = pipelineSummary([
      { stage: 'won', amount_cents: 500_000 },
      { stage: 'qualified', amount_cents: 100_000 },
    ])

    expect(after.total_amount_cents).toBeLessThan(before.total_amount_cents)
    expect(after.signed_amount_cents).toBe(500_000)
  })
})

/* ─── Bras 2 — le SQL ─────────────────────────────────────────────────────── */

/** Fichiers de production du service (les specs CITENT, elles ne calculent pas). */
function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) sourceFiles(path, found)
    else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) found.push(path)
  }
  return found
}

/** Les commentaires sont retirés : une phrase qui CITE un SQL n'en est pas un. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ')
}

/** Un montant d'opportunité agrégé : c'est ça, et rien d'autre, qu'on garde. */
const AGGREGATES_DEAL_MONEY = /SUM\(\s*(?:o|opp|opportunities)\.(estimated_amount|amount_cents)/i
/** Un périmètre de stade, quel qu'il soit — la fabrique du contrat ou un stade nommé. */
const NAMES_A_STAGE = /projectStageInSql\(|projectStageNotInSql\(|\bstage\s*(?:=|<>|!=|IN|NOT\s+IN)\s*/i

type Statement = { file: string; sql: string }

function dealMoneyStatements(): Statement[] {
  const statements: Statement[] = []
  for (const file of sourceFiles(MODULES)) {
    const source = withoutComments(readFileSync(file, 'utf8'))
    // Chaque littéral gabarit du fichier : c'est l'unité « une requête ».
    for (const match of source.matchAll(/`([^`]*)`/g)) {
      const sql = match[1] ?? ''
      if (!/FROM\s+opportunities/i.test(sql)) continue
      if (!AGGREGATES_DEAL_MONEY.test(sql)) continue
      statements.push({ file: file.slice(MODULES.length + 1), sql })
    }
  }
  return statements
}

describe('GA-73 · une somme d’euros sur des opportunités dit sur quels stades', () => {
  const statements = dealMoneyStatements()

  it('LIT un corpus non vide de requêtes qui valorisent des affaires', () => {
    // Le jour où ce nombre tombe à zéro, ce n'est pas que le dépôt est propre :
    // c'est que la garde ne trouve plus rien à lire (renommage de colonne,
    // requête sortie d'un littéral gabarit). Elle doit alors être RÉÉCRITE.
    expect(statements.length).toBeGreaterThanOrEqual(3)
    expect(statements.map(statement => statement.file)).toContain(join('manager', 'manager.service.ts'))
  })

  it('n’en laisse aucune sans périmètre de stade', () => {
    const unscoped = statements.filter(statement => !NAMES_A_STAGE.test(statement.sql))
    expect(unscoped.map(statement => `${statement.file}\n${statement.sql.trim()}`)).toEqual([])
  })
})
