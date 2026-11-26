import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-399 — LA TRANSCRIPTION D'UNE RÉUNION NE CONSERVE JAMAIS L'AUDIO (#2434.65).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * #2434 (VOICE INPUT — AUDIO) exige que « toute conservation durable soit
 * EXPLICITE et visible » et que le mode vocal ne soit « pas un enregistreur de
 * réunion implicite ». Deux chemins déposent de l'audio dans ce dépôt, avec deux
 * politiques DIFFÉRENTES et volontaires (tranché sans Louis, #2434.65) :
 *
 *  - le message vocal de Laura (`ia-proxy.controller.ts#transcribeVoiceMessage`)
 *    RANGE l'enregistrement (`storage.put(`), purgé après 30 jours — gardé par
 *    `voice-retention-reachability.spec.ts` — parce que c'est un artefact de
 *    conversation qui peut être réécouté ;
 *  - le compte rendu de réunion (`MeetingNotesService.transcribe`) ne range RIEN :
 *    l'organisateur dépose SON fichier, il part en mémoire vers le fournisseur de
 *    transcription et le buffer est abandonné à la fin de l'appel. La politique de
 *    rétention est donc la plus simple possible : AUCUNE conservation, jamais —
 *    plutôt qu'une purge à écrire et à tenir.
 *
 * Cette garde lit la SOURCE de `transcribe(` : un futur ajout qui rangerait
 * l'enregistrement (un bucket, une entité, un `fs.writeFile`) la ferait rougir même
 * si aucun test de comportement ne rejoue ce chemin précis — même famille que
 * `la-transcription-vocale-necrit-jamais-de-message.spec.ts`.
 */

const SERVICE_FILE = join(__dirname, '..', 'modules', 'meeting-notes', 'meeting-notes.service.ts')

/** Les identifiants qui, présents dans le corps, conserveraient l'audio quelque part. */
const FORBIDDEN: readonly string[] = ['storage.put(', 'storage.write(', 'writeFile(', '.save(audio', 'Repository<']

/**
 * Le corps d'une méthode, trouvée par sa signature, extrait par équilibrage d'accolades.
 *
 * La signature ET le type de retour sont d'abord SAUTÉS par équilibrage combiné de
 * `(`/`<`/`{` — une signature multi-lignes avec un paramètre typé objet
 * (`input: { audioB64: ... }`) ou un type de retour `Promise<{ text: string }>`
 * contient déjà des accolades avant celle du corps ; la chercher naïvement dès la
 * signature attraperait l'une de celles-là, pas celle du corps. La vraie accolade du
 * corps est la première qui ouvre depuis une profondeur combinée revenue à ZÉRO —
 * la précédente (celle des paramètres) ne compte pas, elle ouvre depuis la
 * parenthèse de la signature elle-même.
 */
function methodBody(source: string, signature: string): string {
  const start = source.indexOf(signature)
  if (start < 0) return ''
  const parenStart = source.indexOf('(', start)
  if (parenStart < 0) return ''
  let combinedDepth = 0
  let braceStart = -1
  for (let i = parenStart; i < source.length; i += 1) {
    const char = source[i]
    const isOpener = char === '(' || char === '<' || char === '{'
    const isCloser = char === ')' || char === '>' || char === '}'
    const before = combinedDepth
    if (isOpener) combinedDepth += 1
    else if (isCloser) combinedDepth -= 1
    if (isOpener && before === 0 && char === '{' && i !== parenStart) {
      braceStart = i
      break
    }
  }
  if (braceStart < 0) return ''
  let depth = 0
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(braceStart + 1, i)
    }
  }
  return ''
}

describe('GA-399 (api) — la transcription d’une réunion ne conserve jamais l’audio', () => {
  const source = readFileSync(SERVICE_FILE, 'utf8')
  const body = methodBody(source, 'async transcribe(')

  it('LIT vraiment la méthode — pas un corps vide qui rendrait la garde verte à tort', () => {
    expect(source.length).toBeGreaterThan(10_000)
    expect(body.length).toBeGreaterThan(300)
    expect(body).toContain('transcribeAudio(')
    expect(body).toContain('recordingConsent')
  })

  it('aucun identifiant de conservation dans le corps de transcribe()', () => {
    const offenders = FORBIDDEN.filter(name => body.includes(name))
    expect(`identifiants de conservation trouvés : ${offenders.join(', ')}`).toBe(
      'identifiants de conservation trouvés : ',
    )
  })

  it('sait dire NON — un rangement de l’audio dans le corps est reproché', () => {
    const leaky = [
      'async transcribe(userId, input) {',
      '  if (input.recordingConsent !== true) throw new Error()',
      '  await this.storage.put(input.audioB64)',
      '  return { text: await transcribeAudio(config, input) }',
      '}',
    ].join('\n')
    const leakyBody = methodBody(leaky, 'async transcribe(')
    const offenders = FORBIDDEN.filter(name => leakyBody.includes(name))
    expect(offenders).toEqual(['storage.put('])
  })

  it('n’attrape pas ce qu’elle ne vise pas — une AUTRE méthode qui range de l’audio ne fait pas rougir celle-ci', () => {
    const fine = [
      'async transcribe(userId, input) {',
      '  return { text: await transcribeAudio(config, input) }',
      '}',
      'async archiveSomethingElse() {',
      '  await this.storage.put(other)',
      '}',
    ].join('\n')
    const fineBody = methodBody(fine, 'async transcribe(')
    expect(FORBIDDEN.some(name => fineBody.includes(name))).toBe(false)
  })
})
