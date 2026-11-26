import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * #2078.22 — TOUTE ÉCRITURE GOOGLE VÉRIFIE LE NIVEAU ACCORDÉ AVANT D'ÉCRIRE.
 *
 * Une connexion peut désormais être en LECTURE SEULE. La règle ne vaut que si
 * elle ne connaît aucune exception : un seul chemin d'écriture oublié (un
 * brouillon dans un fil, une réponse d'absence, un déplacement d'évènement) et
 * la promesse « Laura ne fait que lire » devient fausse sans que rien ne
 * rougisse — le fournisseur refuserait l'appel, certes, mais après qu'on l'a
 * TENTÉ, et avec une erreur que personne ne sait lire.
 *
 * Ce que la garde tient : dans tout fichier qui parle à Google, chaque appel à
 * une méthode d'ÉCRITURE du client (`GoogleClient`) se trouve dans une fonction
 * qui passe d'abord par `requireWriteAccess(` ou `authorizeWrite(`.
 *
 * Les méthodes d'écriture ne sont PAS listées à la main : elles se lisent dans
 * `google.client.ts` (toute méthode qui envoie un POST / PUT / PATCH / DELETE).
 * Une méthode d'écriture ajoutée demain est donc couverte sans que personne
 * n'ait à s'en souvenir. Seuls les trois appels au point de jeton sont écartés,
 * NOMMÉS avec leur raison.
 */

const SRC = join(__dirname, '..')
const CLIENT_FILE = join(SRC, 'modules/google/google.client.ts')

/** Les appels au point de JETON : ils écrivent chez le fournisseur OAuth, pas dans les données de l'utilisateur. */
const TOKEN_ENDPOINT_METHODS: Record<string, string> = {
  exchangeCode: 'échange du code d’autorisation contre un jeton — c’est le consentement lui-même',
  refresh: 'renouvellement du jeton d’accès — aucune donnée de l’utilisateur n’est écrite',
  revoke: 'révocation à la déconnexion — elle RETIRE un accès, elle n’en exerce aucun',
}

const GATES = ['requireWriteAccess(', 'authorizeWrite(']

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

/** Les méthodes du client qui ÉCRIVENT, lues dans sa source. */
function writeMethodsOf(clientSource: string): string[] {
  const source = stripComments(clientSource)
  const headers = [...source.matchAll(/^ {2}async (\w+)\(/gm)]
  return headers
    .filter((header, index) => {
      const name = header[1] ?? ''
      const body = source.slice(header.index ?? 0, headers[index + 1]?.index ?? source.length)
      return /method:\s*'(?:POST|PUT|PATCH|DELETE)'/.test(body) && !(name in TOKEN_ENDPOINT_METHODS)
    })
    .map(header => header[1] ?? '')
}

type Violation = { file: string; method: string }
type Scan = { calls: number; violations: Violation[] }

/**
 * Les appels d'écriture d'un fichier, et ceux qui ne passent par aucune porte.
 * Le receveur est tout identifiant qui finit par `client`/`Client` : c'est ainsi
 * que le code nomme l'instance remise par `authorize()`.
 */
function scanSource(file: string, rawSource: string, writeMethods: readonly string[]): Scan {
  const source = stripComments(rawSource)
  const headerPattern =
    /^(?: {2}(?:(?:private|public|protected|static|async)\s+)*\w+\s*(?:<[^>\n]*>)?\(|(?:export\s+)?(?:async\s+)?function\s+\w+)/gm
  const headers = [...source.matchAll(headerPattern)].map(match => match.index ?? 0)
  const callPattern = new RegExp(`\\b\\w*[cC]lient\\.(${writeMethods.join('|')})\\(`, 'g')
  const violations: Violation[] = []
  let calls = 0
  for (const call of source.matchAll(callPattern)) {
    calls += 1
    const at = call.index ?? 0
    const start = headers.filter(index => index < at).pop() ?? 0
    const enclosing = source.slice(start, at)
    if (!GATES.some(gate => enclosing.includes(gate))) {
      violations.push({ file, method: call[1] ?? '' })
    }
  }
  return { calls, violations }
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : []
  })
}

/** Les fichiers qui parlent à Google : ceux qui nomment le client ou le service. */
function googleFiles(): Array<{ file: string; source: string }> {
  return sourceFiles(SRC)
    .filter(path => path !== CLIENT_FILE)
    .map(path => ({ file: relative(SRC, path), source: readFileSync(path, 'utf8') }))
    .filter(({ source }) => /\bGoogleClient\b|\bGoogleService\b/.test(source))
}

const WRITE_METHODS = writeMethodsOf(readFileSync(CLIENT_FILE, 'utf8'))

describe('#2078.22 — une écriture Google passe par le contrôle du niveau accordé', () => {
  it('LIT vraiment : les méthodes d’écriture du client et leurs appels sont trouvés', () => {
    expect(WRITE_METHODS).toEqual(
      expect.arrayContaining(['createEvent', 'patchEventSchedule', 'sendMessage', 'createDraft', 'updateVacation']),
    )
    expect(WRITE_METHODS.length).toBeGreaterThanOrEqual(9)
    const calls = googleFiles().reduce(
      (sum, { file, source }) => sum + scanSource(file, source, WRITE_METHODS).calls,
      0,
    )
    expect(calls).toBeGreaterThanOrEqual(9)
  })

  it('les exceptions nommées existent encore dans le client', () => {
    const source = readFileSync(CLIENT_FILE, 'utf8')
    for (const name of Object.keys(TOKEN_ENDPOINT_METHODS)) {
      expect(source).toMatch(new RegExp(`^ {2}async ${name}\\(`, 'm'))
    }
  })

  it('sait dire NON : une écriture sans contrôle est signalée', () => {
    const source = [
      'export class Leaky {',
      '  async setAbsence(userId: string) {',
      '    const { client, accessToken } = await this.google.authorize(userId)',
      '    return client.updateVacation(accessToken, {})',
      '  }',
      '}',
    ].join('\n')
    expect(scanSource('leaky.ts', source, WRITE_METHODS).violations).toEqual([
      { file: 'leaky.ts', method: 'updateVacation' },
    ])
  })

  it('un contrôle posé dans une AUTRE fonction ne couvre pas celle-ci', () => {
    const source = [
      'export class Leaky {',
      '  async guarded(userId: string) {',
      '    await this.google.requireWriteAccess(userId, "gmail")',
      '  }',
      '  async leaky(userId: string) {',
      '    const { client, accessToken } = await this.google.authorize(userId)',
      '    return googleClient.sendMessage(accessToken, "raw")',
      '  }',
      '}',
    ].join('\n')
    expect(scanSource('leaky.ts', source, WRITE_METHODS).violations).toHaveLength(1)
  })

  it('TÉMOIN — une lecture sans contrôle et une écriture contrôlée passent', () => {
    const source = [
      'export class Fine {',
      '  async read(userId: string) {',
      '    const { client, accessToken } = await this.google.authorize(userId)',
      '    return client.getVacation(accessToken)',
      '  }',
      '  async write(userId: string) {',
      '    const { client, accessToken } = await this.google.authorizeWrite(userId, "gmailSettings")',
      '    return client.updateVacation(accessToken, {})',
      '  }',
      '}',
    ].join('\n')
    const scan = scanSource('fine.ts', source, WRITE_METHODS)
    expect(scan.calls).toBe(1)
    expect(scan.violations).toEqual([])
  })

  it('aucun chemin d’écriture du dépôt n’oublie le contrôle', () => {
    const violations = googleFiles().flatMap(({ file, source }) => scanSource(file, source, WRITE_METHODS).violations)
    expect(violations).toEqual([])
  })
})
