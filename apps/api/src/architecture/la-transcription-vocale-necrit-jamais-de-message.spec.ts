import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-387 — LA TRANSCRIPTION D'UN MESSAGE VOCAL N'ÉCRIT JAMAIS DE MESSAGE, ET
 * N'APPELLE JAMAIS LE MODÈLE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * #2434.6 / #2434.7 / #2434.52 (« dictée n'envoie jamais automatiquement »,
 * « validation vocale seule insuffisante ») tiennent parce que
 * `POST chat/voice/transcribe` (`transcribeVoiceMessage`) ne fait QUE transcrire
 * et ranger l'enregistrement — le texte revient dans la zone de saisie, jamais
 * dans un tour de conversation. `chat-voice.controller.spec.ts` le vérifie déjà
 * en FAISANT tourner la méthode (`ia.chatStream` non appelé). Cette garde tient
 * la même promesse AUTREMENT : en lisant la SOURCE de la méthode, un futur ajout
 * qui appellerait le modèle ou créerait un message rougirait même si aucun test
 * de comportement ne rejoue exactement ce chemin.
 *
 * Même famille que `google-writes-check-granted-level.spec.ts` : on ne liste pas
 * un identifiant deviné, on lit le corps réel de la méthode par équilibrage
 * d'accolades, comme `chat-actions-cross-language.test.ts` le fait pour
 * `ACTION_ICON`.
 */

const CONTROLLER_FILE = join(__dirname, '..', 'modules', 'ia-proxy', 'ia-proxy.controller.ts')

/**
 * Les identifiants qui, présents dans le corps, écriraient un message ou parleraient au modèle.
 *
 * ⚠️ 11/10/2026 — #4016 L5 (décision Louis) : Laura peut envoyer SOUS MANDAT
 * SIGNÉ. Une dictée n'est pas un mandat : déposer un message « en attente de
 * mandat » (`enqueueUnderMandate`) depuis la transcription le ferait partir sans
 * que le commercial ait relu son propre texte. La règle nouvelle reste donc tenue
 * ici : transcrire ne dépose RIEN dans la file d'envoi.
 */
const FORBIDDEN: readonly string[] = [
  'chatStream',
  'chatMessages.create',
  'chatMessages.save',
  'sendMessage(',
  'enqueueUnderMandate(',
  // #4016 L5 (reprise 20/10) — la seconde porte d'entrée de la file « attend un mandat ».
  'awaitIfMandated(',
  'awaitMandate(',
]

/** Le corps d'une méthode, trouvée par sa signature, extrait par équilibrage d'accolades. */
function methodBody(source: string, signature: string): string {
  const start = source.indexOf(signature)
  if (start < 0) return ''
  const braceStart = source.indexOf('{', start)
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

describe("GA-387 (api) — transcrire un message vocal n'écrit rien et n'appelle pas le modèle", () => {
  const source = readFileSync(CONTROLLER_FILE, 'utf8')
  const body = methodBody(source, 'async transcribeVoiceMessage(')

  it('LIT vraiment la méthode — pas un corps vide qui rendrait la garde verte à tort', () => {
    expect(source.length).toBeGreaterThan(10_000)
    expect(body.length).toBeGreaterThan(500)
    // #2434.40 / #2434.85 — `transcribeAudioDetailed` porte aussi le verdict par
    // mot (`word-confidence.ts`) depuis le même appel : toujours aucun appel au modèle.
    expect(body).toContain('transcribeAudioDetailed(')
    expect(body).toContain('storage.put(')
  })

  it('aucun appel au modèle ni à l’écriture d’un message dans cette méthode', () => {
    const offenders = FORBIDDEN.filter(name => body.includes(name))
    expect(`identifiants interdits trouvés : ${offenders.join(', ')}`).toBe('identifiants interdits trouvés : ')
  })

  it('sait dire NON — un appel au modèle dans le corps est reproché', () => {
    const leaky = ['async transcribeVoiceMessage() {', '  await this.ia.chatStream(input)', '}'].join('\n')
    const leakyBody = methodBody(leaky, 'async transcribeVoiceMessage(')
    const offenders = FORBIDDEN.filter(name => leakyBody.includes(name))
    expect(offenders).toEqual(['chatStream'])
  })

  it('#4016 L5 — sait dire NON : une dictée qui dépose un message sous mandat est reprochée', () => {
    const leaky = [
      'async transcribeVoiceMessage() {',
      "  await this.delegations.enqueueUnderMandate(ctx, 'laura_send', dto, stops, new Date())",
      '}',
    ].join('\n')
    const leakyBody = methodBody(leaky, 'async transcribeVoiceMessage(')
    expect(FORBIDDEN.filter(name => leakyBody.includes(name))).toEqual(['enqueueUnderMandate('])
  })

  it('n’attrape pas ce qu’elle ne vise pas — une AUTRE méthode qui parlerait au modèle ne fait pas rougir celle-ci', () => {
    const fine = [
      'async transcribeVoiceMessage() {',
      '  return this.doTranscribe()',
      '}',
      'async anotherMethod() {',
      '  await this.ia.chatStream(input)',
      '}',
    ].join('\n')
    const fineBody = methodBody(fine, 'async transcribeVoiceMessage(')
    expect(FORBIDDEN.some(name => fineBody.includes(name))).toBe(false)
  })
})
