import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * #4406.3 — une réponse Beeper ne part QUE sur le geste de l'utilisateur, par la porte d'écriture.
 * Laura prépare ; elle n'envoie jamais (décision Louis 21/10/2026, « jamais seul »).
 *
 * #4406.5 (c96) — le CORPS d'une conversation Beeper n'est lu que par deux appelants nommés
 * (Messagerie, et Laura par le pont) et n'est écrit nulle part.
 *
 * La garde lit les SOURCES : elle sait dire NON (fixtures), elle LIT (les appelants réels existent).
 */
const SRC = join(__dirname, '..')
const IA_APP = join(__dirname, '..', '..', '..', 'ia', 'app')

function files(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return entry === 'node_modules' || entry === '__pycache__' ? [] : files(full, ext)
    return full.endsWith(ext) && !/\.(spec|test)\.ts$/.test(full) ? [full] : []
  })
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

type Source = { path: string; source: string }
const callersOf = (corpus: readonly Source[], method: string): string[] =>
  corpus
    .filter(f => new RegExp(`\\.${method}\\s*\\(`).test(stripComments(f.source)))
    .map(f => f.path)
    .sort()

/** Le corps d'une méthode `async name(` jusqu'à la méthode suivante de la classe. */
function methodBody(source: string, name: string): string {
  const start = source.indexOf(`async ${name}(`)
  if (start < 0) return ''
  const next = source.slice(start + 1).search(/\n {2}(?:private |async |[a-zA-Z]+\()/)
  return stripComments(next < 0 ? source.slice(start) : source.slice(start, start + 1 + next))
}

describe('Beeper — l’envoi ne part que par la porte, jamais par Laura (#4406.3)', () => {
  const corpus: Source[] = files(SRC, '.ts').map(path => ({
    path: relative(SRC, path),
    source: readFileSync(path, 'utf8'),
  }))
  const service = readFileSync(join(SRC, 'modules/beeper/beeper.service.ts'), 'utf8')

  it('`sendMessage` (l’appel réseau d’envoi) n’est appelé que par BeeperService', () => {
    expect(
      callersOf(corpus, 'sendMessage').filter(
        p => p.includes('beeper') || corpus.find(f => f.path === p)?.source.includes('BeeperClient'),
      ),
    ).toEqual(['modules/beeper/beeper.service.ts'])
  })

  it('`sendReply` n’est appelé que par le contrôleur Beeper — le geste de l’utilisateur', () => {
    expect(callersOf(corpus, 'sendReply')).toEqual(['modules/beeper/beeper.controller.ts'])
  })

  it('aucun chemin Laura (pont, laura, ia) ne connaît l’envoi Beeper', () => {
    const lauraSide = corpus.filter(f => /^modules\/(copilot-bridge|laura|ia|ia-proxy|chat-[a-z-]+)\//.test(f.path))
    expect(lauraSide.length).toBeGreaterThan(0)
    const leaks = lauraSide.filter(f =>
      /sendReply|sendMessage|beeper\/chats\/[^'"`]*send/.test(stripComments(f.source)),
    )
    expect(leaks.map(f => f.path)).toEqual([])
    // Côté service IA : seules les deux LECTURES du pont sont appelées.
    const py = files(IA_APP, '.py').map(path => readFileSync(path, 'utf8'))
    expect(py.some(src => src.includes('/internal/copilot/beeper/chat'))).toBe(true)
    expect(py.filter(src => /beeper\/(chats|send)|beeper[^\n]*\/send/.test(src))).toEqual([])
  })

  it('`sendReply` franchit la porte AVANT d’appeler Beeper, en origine `user`', () => {
    const body = methodBody(service, 'sendReply')
    const gate = body.indexOf('this.outboundWrites.request(')
    const send = body.indexOf('.sendMessage(')
    expect(gate).toBeGreaterThan(0)
    expect(send).toBeGreaterThan(gate)
    expect(body).toMatch(/origin:\s*'user'/)
    // La charge utile de la porte ne porte pas le texte (c96).
    expect(body.slice(gate, send)).not.toMatch(/text:\s*input\.text/)
  })

  it('sait dire NON : un appel d’envoi neuf est attrapé, un commentaire ne l’est pas', () => {
    const fixture: Source[] = [
      { path: 'modules/laura/leak.service.ts', source: 'await this.beeper.sendReply(u, c, d)' },
      { path: 'modules/x/doc.service.ts', source: '// this.beeper.sendReply(u, c, d)\n/* .sendReply( */' },
    ]
    expect(callersOf(fixture, 'sendReply')).toEqual(['modules/laura/leak.service.ts'])
  })
})

describe('Beeper — le corps d’une conversation ne sort que par deux chemins nommés (#4406.5, c96)', () => {
  const corpus: Source[] = files(SRC, '.ts').map(path => ({
    path: relative(SRC, path),
    source: readFileSync(path, 'utf8'),
  }))

  it('`readOwnChat` : Messagerie (contrôleur Beeper) et Laura (pont) seulement', () => {
    expect(callersOf(corpus, 'readOwnChat')).toEqual([
      'modules/beeper/beeper.controller.ts',
      'modules/copilot-bridge/copilot-bridge.controller.ts',
    ])
  })

  it('`listMessages` (l’appel réseau de lecture) n’est appelé que par BeeperService', () => {
    expect(callersOf(corpus, 'listMessages').filter(p => p.includes('beeper'))).toEqual([
      'modules/beeper/beeper.service.ts',
    ])
  })

  it('rien n’écrit un corps : ni base, ni journal, dans les lectures Beeper', () => {
    const service = readFileSync(join(SRC, 'modules/beeper/beeper.service.ts'), 'utf8')
    for (const name of ['readOwnChat', 'listConversations']) {
      const body = methodBody(service, name)
      expect(body.length).toBeGreaterThan(50)
      expect(body).not.toMatch(/\.(save|insert|update|upsert|query|delete)\s*\(/)
      expect(body).not.toMatch(/logger\.\w+\(/)
    }
    // Aucune entité ne porte un texte de message Beeper.
    const entity = readFileSync(join(SRC, 'database/entities/beeper-connection.entity.ts'), 'utf8')
    expect(stripComments(entity)).not.toMatch(/\b(text|body|message)\b\s*:/)
  })
})
