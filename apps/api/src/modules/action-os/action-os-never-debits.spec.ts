import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * I2 — ACTION OS NE DÉBITE JAMAIS LUI-MÊME (arrêt obligatoire facturation, lot 4).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE GARDE EN PLUS DE LA SIMULATION
 * ─────────────────────────────────────────────────────────────────────────────
 * `credit-invariants.simulation.spec.ts` tient I2 par CONSTRUCTION : son monde de
 * facturation ne fait bouger le registre que depuis les faux services métier
 * (contacts, analyse). Elle prouve donc que les chemins QU'ELLE REJOUE ne débitent
 * pas depuis Action OS — elle ne dit rien d'un appel neuf posé sur un chemin
 * qu'elle ne rejoue pas. Or depuis L3, `ActionOsModule` importe `CreditsModule`
 * (pour lire le remboursement d'une analyse suivie) : `CreditsService` est à une
 * injection d'un débit, et la simulation ne le verrait pas.
 *
 * La règle, lue dans le SOURCE : aucun fichier de production de `action-os/`
 * n'appelle une méthode d'ÉCRITURE de `CreditsService` — les méthodes
 * `consume*`, `refund*`, `debit*` et `attach*Debit`, DÉRIVÉES de
 * `credits.service.ts` à chaque exécution (une méthode d'écriture ajoutée
 * demain est couverte sans toucher ce fichier). Le débit réel reste chez les
 * services métier (enrichissement, analyse) ; Action OS RÉSERVE (registre des
 * crédits promis, `CreditReservationService`) et OBSERVE (`getLedger`).
 */

const ACTION_OS = __dirname
const CREDITS_SERVICE = join(__dirname, '..', 'credits', 'credits.service.ts')

/** Le source SANS ses commentaires, blancs de même longueur — un docblock qui cite la règle ne s'accuse pas. */
function codeOnly(source: string): string {
  const blank = (match: string) => match.replace(/[^\n]/g, ' ')
  return source.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank)
}

/** Les méthodes d'ÉCRITURE de crédits déclarées par `CreditsService`. */
function creditWriteMethods(source: string): string[] {
  const declared = [...codeOnly(source).matchAll(/^\s{2}(?:public\s+)?(?:async\s+)?([a-z]\w*)\s*\(/gm)].map(
    match => match[1] as string,
  )
  return [...new Set(declared.filter(name => /^(consume|refund|debit)|^attach\w*Debit$/.test(name)))].sort()
}

/** Chaque appel `.<méthode>(` d'une méthode d'écriture, avec sa ligne. */
function writeCallsIn(source: string, methods: readonly string[]): { method: string; line: number }[] {
  const code = codeOnly(source)
  const calls: { method: string; line: number }[] = []
  for (const method of methods) {
    for (const match of code.matchAll(new RegExp(`\\.${method}\\s*\\(`, 'g'))) {
      calls.push({ method, line: code.slice(0, match.index).split('\n').length })
    }
  }
  return calls
}

function productionFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'testing' ? [] : productionFiles(full)
    return /\.ts$/.test(entry.name) && !/\.(spec|test)\.ts$/.test(entry.name) ? [full] : []
  })
}

describe('I2 — Action OS ne débite jamais lui-même', () => {
  const methods = creditWriteMethods(readFileSync(CREDITS_SERVICE, 'utf8'))
  const files = productionFiles(ACTION_OS)

  it('LIT quelque chose — les méthodes d’écriture de CreditsService et les fichiers d’Action OS', () => {
    expect(methods).toEqual(
      expect.arrayContaining([
        'consumeAnalysisSlot',
        'consumeEnrichmentCredit',
        'refundAnalysisSlot',
        'refundEnrichmentCredit',
      ]),
    )
    const names = files.map(file => file.slice(ACTION_OS.length + 1))
    expect(names).toEqual(
      expect.arrayContaining(['action-os.module.ts', 'copilot-card.service.ts', 'workflow-runner.service.ts']),
    )
  })

  it('aucun fichier de production d’Action OS n’appelle une méthode d’écriture de crédits', () => {
    const offenders = files.flatMap(file =>
      writeCallsIn(readFileSync(file, 'utf8'), methods).map(
        call => `${file.slice(ACTION_OS.length + 1)}:${call.line} → .${call.method}(`,
      ),
    )
    expect(offenders).toEqual([])
  })

  describe('elle sait dire NON — par LA MÊME fonction', () => {
    it('attrape un débit posé sur un chemin que la simulation ne rejoue pas', () => {
      const fabricated = [
        'async confirm(runId: string) {',
        '  await this.credits.consumeEnrichmentCredit(principal.userId)',
        '  await this.credits.refundAnalysisSlot(userId, accountId)',
        '}',
      ].join('\n')
      expect(writeCallsIn(fabricated, methods)).toEqual([
        { method: 'consumeEnrichmentCredit', line: 2 },
        { method: 'refundAnalysisSlot', line: 3 },
      ])
    })

    it('n’attrape PAS ce qu’elle ne vise pas — lire le registre, nommer un débit observé, citer la règle', () => {
      const legitimate = [
        '// jamais this.credits.consumeEnrichmentCredit( ici',
        'const { entries } = await ledger.getLedger(userId, 100)',
        "const refunded = entries.filter(entry => entry.kind === 'refund_analysis')",
        'return { debitObserved: input.debitObserved, refundObserved: 0 }',
      ].join('\n')
      expect(writeCallsIn(legitimate, methods)).toEqual([])
    })
  })
})
