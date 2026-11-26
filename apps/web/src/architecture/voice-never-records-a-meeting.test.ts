import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { CHAT_VOICE_MESSAGE_MAX_SECONDS } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'

/**
 * GARDE #2319.58 — LE MODE VOCAL N'ENREGISTRE JAMAIS UNE RÉUNION TOUT SEUL (#2319.58).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Aucun enregistrement audio sans consentement explicite. Le mode vocal ne
 * doit pas enregistrer automatiquement une réunion. » Le micro du produit sert
 * UN usage : le message vocal adressé à Laura, que l'utilisateur déclenche d'un
 * geste et qui s'arrête seul à la durée maximale. Trois choses le garantissent,
 * et chacune se casse sans bruit :
 *
 *  1. **Un seul enregistreur dans l'application.** Un second `MediaRecorder`
 *     (un « mode réunion », un widget d'écoute) ouvrirait un chemin que rien ne
 *     borne. Le dépôt d'un enregistrement de réunion, lui, n'ouvre pas le micro :
 *     c'est un FICHIER, derrière une case d'accord des participants
 *     (`MeetingNotesCard`, et `recordingConsent` exigé par l'API).
 *  2. **Une durée de MESSAGE, pas de réunion.** Au-delà de deux minutes, on
 *     n'enregistre plus une question, on écoute une conversation.
 *  3. **Aucun démarrage sans geste.** L'enregistreur ne démarre jamais depuis un
 *     effet React (au montage, au changement de fil, à l'ouverture d'un
 *     rendez-vous) : `start()` ne s'appelle que depuis un gestionnaire.
 *
 * Elle prouve qu'elle LIT (corpus non vide, l'enregistreur est trouvé) et
 * qu'elle sait dire NON (des sources fabriquées la font rougir).
 */

const WEB_SRC = join(__dirname, '..')
/** Le seul fichier qui a le droit d'ouvrir le micro. */
const RECORDER_FILE = 'features/chat/voice/useVoiceMode.ts'
/** Une réunion commerciale dure bien plus ; un message vocal, bien moins. */
const VOICE_MESSAGE_CEILING_SECONDS = 120

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** Les commentaires se retirent AVANT lecture : ce docblock cite ce qu'il surveille. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const CORPUS = sourceFiles(WEB_SRC).map(file => ({
  path: relative(WEB_SRC, file),
  source: stripComments(readFileSync(file, 'utf8')),
}))

/** Les fichiers qui ouvrent le micro ou construisent un enregistreur. */
function recorderFiles(corpus: readonly { path: string; source: string }[]): string[] {
  return corpus
    .filter(({ source }) => /new\s+MediaRecorder\s*\(/.test(source) || /\.getUserMedia\s*\(/.test(source))
    .map(({ path }) => path)
    .sort()
}

/**
 * Le corps de chaque `useEffect(...)` : de l'ouverture à la parenthèse qui la
 * ferme, en comptant les imbrications. Un découpage naïf s'arrête à la première
 * flèche ou accolade — la faute de plusieurs gardes borgnes du dépôt.
 */
function effectBodies(source: string): string[] {
  const bodies: string[] = []
  const opener = /useEffect\s*\(/g
  let match: RegExpExecArray | null
  while ((match = opener.exec(source)) !== null) {
    let depth = 1
    let index = match.index + match[0].length
    while (index < source.length && depth > 0) {
      const char = source[index]
      if (char === '(') depth += 1
      else if (char === ')') depth -= 1
      index += 1
    }
    bodies.push(source.slice(match.index, index))
  }
  return bodies
}

/** Un effet qui DÉMARRE un enregistrement : `start()`, `voice.start()`, `recorder.start()`. */
function effectsThatStart(source: string): string[] {
  return effectBodies(source).filter(body => /(^|[^\w])(?:\w+\.)?start\s*\(/.test(body))
}

describe('#2319.58 — le mode vocal n’enregistre jamais une réunion tout seul', () => {
  it('lit un corpus non vide, et y trouve l’enregistreur', () => {
    expect(CORPUS.length).toBeGreaterThan(500)
    expect(CORPUS.some(({ path }) => path === RECORDER_FILE)).toBe(true)
  })

  it('un seul fichier ouvre le micro dans toute l’application', () => {
    expect(recorderFiles(CORPUS)).toEqual([RECORDER_FILE])
  })

  it('la durée maximale est celle d’un MESSAGE, pas d’une réunion', () => {
    expect(CHAT_VOICE_MESSAGE_MAX_SECONDS).toBeGreaterThan(0)
    expect(CHAT_VOICE_MESSAGE_MAX_SECONDS).toBeLessThanOrEqual(VOICE_MESSAGE_CEILING_SECONDS)
  })

  it('aucun effet ne démarre un enregistrement — seul un geste le fait', () => {
    const recorderUsers = CORPUS.filter(({ source }) => /useVoiceMode|MediaRecorder/.test(source))
    expect(recorderUsers.length).toBeGreaterThan(1)
    const offenders = recorderUsers.filter(({ source }) => effectsThatStart(source).length > 0).map(({ path }) => path)
    expect(offenders).toEqual([])
    // Et l'enregistreur a bien des effets : la lecture n'est pas vide.
    const recorder = CORPUS.find(({ path }) => path === RECORDER_FILE)
    expect(effectBodies(recorder?.source ?? '').length).toBeGreaterThan(1)
  })

  it('sait dire NON — un second enregistreur est vu', () => {
    const fake = [
      ...CORPUS.filter(({ path }) => path === RECORDER_FILE),
      { path: 'features/agenda/view/MeetingRecorder.tsx', source: 'const r = new MediaRecorder(stream)' },
    ]
    expect(recorderFiles(fake)).toEqual(['features/agenda/view/MeetingRecorder.tsx', RECORDER_FILE])
  })

  it('sait dire NON — un démarrage au montage est vu, même imbriqué', () => {
    const autoStart = `useEffect(() => { if (open) { voice.start() } }, [open])`
    expect(effectsThatStart(autoStart)).toHaveLength(1)
    const stopOnly = `useEffect(() => () => cancel(), [resetKey, cancel])
      useEffect(() => { const onHide = () => stop(); return () => onHide() }, [stop])`
    expect(effectsThatStart(stopOnly)).toEqual([])
  })

  it('n’attrape pas ce qu’elle ne vise pas — `startedAt` ou `restart` ne sont pas un démarrage', () => {
    expect(effectsThatStart('useEffect(() => { setAt(session.startedAt); restartTimer() }, [])')).toEqual([])
  })
})
