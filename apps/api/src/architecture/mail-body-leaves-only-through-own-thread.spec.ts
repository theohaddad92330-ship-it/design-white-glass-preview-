import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Le CORPS d'un message ne sort de la boîte du commercial que par DEUX chemins
 * nommés (`c96_corps_mails_boite_du_commercial`, décision Louis 11/10/2026) :
 *
 *  1. la capture d'activités (arbitrage du 16/08, stockée au journal du commercial) ;
 *  2. `MailboxService.readOwnThread`, lu pour Laura avec le jeton de l'utilisateur
 *     authentifié, jamais conservé.
 *
 * Toute AUTRE lecture d'un corps (`fetchBody`, `readOwnThread`) est une porte neuve :
 * elle doit être décidée, pas arriver par un import. La garde sait dire NON (fixture)
 * et LIRE (le relevé des appelants réels n'est pas vide).
 */
const SRC = join(__dirname, '..')

/** Les fichiers (hors tests) autorisés à APPELER une lecture de corps. */
const ALLOWED_BODY_READERS: ReadonlySet<string> = new Set([
  'modules/activities/activity-capture.service.ts', // capture d'activités (16/08)
  'modules/mailbox/mailbox.service.ts', // définit les deux lectures
  'modules/copilot-bridge/copilot-bridge.controller.ts', // Laura, boîte de l'utilisateur authentifié
  // #4405.1 (intégration PR n°3) — « Préparer la réponse » : Laura rédige sur la boîte de l'utilisateur authentifié,
  // via `readOwnThread` (jeton de CET utilisateur, jamais conservé) — le second chemin de c96, pas une porte neuve.
  'modules/mailbox/mailbox.controller.ts',
])

const CALL = /\.(fetchBody|readOwnThread|readThreadBodies)\s*\(/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return full.endsWith('.ts') && !full.endsWith('.spec.ts') && !full.endsWith('.test.ts') ? [full] : []
  })
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function bodyReadersIn(files: ReadonlyArray<{ path: string; source: string }>): string[] {
  return files.filter(file => CALL.test(stripComments(file.source))).map(file => file.path)
}

describe('le corps d’un message ne sort que par deux chemins nommés', () => {
  const files = sourceFiles(SRC).map(path => ({ path: relative(SRC, path), source: readFileSync(path, 'utf8') }))

  it('aucun appelant hors liste (les backends définissent, ils n’appellent pas)', () => {
    const readers = bodyReadersIn(files).filter(path => !ALLOWED_BODY_READERS.has(path))
    expect(readers).toEqual([])
  })

  it('LIT quelque chose : les appelants autorisés existent bien', () => {
    expect(bodyReadersIn(files).sort()).toEqual([...ALLOWED_BODY_READERS].sort())
  })

  it('sait dire NON : un appel neuf est attrapé, un commentaire ne l’est pas', () => {
    const fixture = [
      { path: 'modules/x/leak.service.ts', source: 'const b = await this.mailbox.fetchBody(u, m)' },
      { path: 'modules/x/doc.service.ts', source: '// this.mailbox.fetchBody(u, m)\n/* .readOwnThread(u) */' },
    ]
    expect(bodyReadersIn(fixture)).toEqual(['modules/x/leak.service.ts'])
  })

  it('readOwnThread n’écrit rien : ni base, ni cache, ni journal du texte', () => {
    const service = readFileSync(join(SRC, 'modules/mailbox/mailbox.service.ts'), 'utf8')
    const start = service.indexOf('async readOwnThread(')
    const end = service.indexOf('async fetchBody(', start)
    const body = stripComments(service.slice(start, end))
    expect(start).toBeGreaterThan(0)
    expect(body).not.toMatch(/\.(save|insert|update|upsert|query|delete)\s*\(/)
    expect(body).not.toMatch(/logger\.\w+\([^)]*(text|body|plain|html)\b/)
  })
})
