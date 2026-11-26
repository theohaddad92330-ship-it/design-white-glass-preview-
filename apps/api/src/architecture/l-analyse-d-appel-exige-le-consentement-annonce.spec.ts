import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #4016 L12 (Louis 11/10) — L'ANALYSE D'UN APPEL ENREGISTRÉ EXIGE LE CONSENTEMENT ANNONCÉ.
 *
 * Renversement daté de GA-399 (« enregistrement avec consentement seulement ») :
 * l'analyse d'appels est PERMISE, la règle devient « jamais SANS consentement ».
 * Non négociable (art. 226-1 du Code pénal) : dans `TelephonyService.analyzeCall`,
 * le refus `callAnalysisRefusal(` est consulté AVANT la lecture de la transcription
 * (`fetchTranscript(`) et AVANT l'envoi au modèle (`structureMeetingNotes(`). Sans
 * la déclaration, le texte d'une conversation ne quitte même pas l'outil d'appel.
 *
 * ⚠️ Elle lit du TEXTE : elle tient l'ORDRE des trois appels, pas la sémantique du
 * refus (tenue par les tests de comportement de `telephony.service.spec.ts`).
 */

const SERVICE = join(__dirname, '..', 'modules', 'telephony', 'telephony.service.ts')

export function analysisBody(source: string): string {
  const start = source.indexOf('async analyzeCall(')
  if (start < 0) return ''
  const end = source.indexOf('\n  }\n', start)
  return end < 0 ? '' : source.slice(start, end)
}

/** Les verrous manquants ou dans le mauvais ordre. */
export function orderingFaults(body: string): string[] {
  const gate = body.indexOf('callAnalysisRefusal(')
  const read = body.indexOf('fetchTranscript(')
  const model = body.indexOf('structureMeetingNotes(')
  const faults: string[] = []
  if (gate < 0) faults.push('callAnalysisRefusal( absent')
  if (read < 0) faults.push('fetchTranscript( absent')
  if (model < 0) faults.push('structureMeetingNotes( absent')
  if (gate >= 0 && read >= 0 && gate > read) faults.push('le refus vient APRÈS la lecture de la transcription')
  if (gate >= 0 && model >= 0 && gate > model) faults.push('le refus vient APRÈS l’envoi au modèle')
  return faults
}

describe('#4016 L12 — l’analyse d’un appel exige le consentement annoncé', () => {
  const body = analysisBody(readFileSync(SERVICE, 'utf8'))

  it('LIT vraiment la méthode — pas un corps vide qui rendrait la garde verte à tort', () => {
    expect(body.length).toBeGreaterThan(400)
  })

  it('le refus passe avant la lecture de la transcription et avant le modèle', () => {
    expect(orderingFaults(body)).toEqual([])
  })

  it('sait dire NON — un refus placé après la lecture est nommé', () => {
    const bad =
      'await fetchTranscript(a, id)\nconst r = callAnalysisRefusal(s)\nawait this.ia.structureMeetingNotes({})'
    expect(orderingFaults(bad)).toEqual(['le refus vient APRÈS la lecture de la transcription'])
  })

  it('sait dire NON — un refus absent est nommé', () => {
    expect(orderingFaults('await fetchTranscript(a, id)\nawait this.ia.structureMeetingNotes({})')).toEqual([
      'callAnalysisRefusal( absent',
    ])
  })

  it('n’attrape pas ce qu’elle ne vise pas — un corps complet et bien ordonné passe', () => {
    const good =
      'const r = callAnalysisRefusal(s)\nawait fetchTranscript(a, id)\nawait this.ia.structureMeetingNotes({})'
    expect(orderingFaults(good)).toEqual([])
  })
})
