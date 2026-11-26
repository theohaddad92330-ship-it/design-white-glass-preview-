import { describe, expect, it } from 'vitest'
import { importSequenceLibraryRequestSchema, resolveSequenceVariables } from './sequence-template.js'

// #3756.3 — le moteur de variables : une variable sans valeur BLOQUE l'étape
// et se nomme, jamais un `{{…}}` littéral envoyé, jamais une valeur devinée.
describe('resolveSequenceVariables', () => {
  const values = { firstName: 'Camille', lastName: 'Durand', companyName: 'Acme Logistics', signature: 'Louis' }

  it('résout les variables connues, avec ou sans espaces dans les accolades', () => {
    const out = resolveSequenceVariables('Bonjour {{firstName}} et {{ companyName }}', values)
    expect(out).toEqual({ ok: true, text: 'Bonjour Camille et Acme Logistics' })
  })

  it('bloque et nomme une variable sans valeur', () => {
    const out = resolveSequenceVariables('Bonjour {{firstName}}', { ...values, firstName: null })
    expect(out).toEqual({
      ok: false,
      blocked: [{ variable: 'firstName', reason: 'missing', message: 'Prénom manquant : {{firstName}}' }],
    })
  })

  it('traite une valeur vide ou blanche comme absente', () => {
    const out = resolveSequenceVariables('{{companyName}}', { ...values, companyName: '   ' })
    expect(out.ok).toBe(false)
  })

  it('bloque une variable inconnue au lieu de la laisser passer', () => {
    const out = resolveSequenceVariables('Salut {{nomDuChat}}', values)
    expect(out).toEqual({
      ok: false,
      blocked: [{ variable: 'nomDuChat', reason: 'unknown', message: 'Variable inconnue : {{nomDuChat}}' }],
    })
  })

  it('ne liste chaque variable bloquante qu’une fois', () => {
    const out = resolveSequenceVariables('{{firstName}} {{firstName}} {{signature}}', {
      firstName: null,
      signature: null,
    })
    expect(out.ok === false && out.blocked.map(b => b.variable)).toEqual(['firstName', 'signature'])
  })

  it('un texte sans variable passe tel quel', () => {
    expect(resolveSequenceVariables('Bonjour', {})).toEqual({ ok: true, text: 'Bonjour' })
  })

  it('une valeur contenant des accolades n’est pas réinterprétée', () => {
    const out = resolveSequenceVariables('{{firstName}}', { firstName: '{{lastName}}', lastName: 'X' })
    expect(out).toEqual({ ok: true, text: '{{lastName}}' })
  })
})

describe('importSequenceLibraryRequestSchema', () => {
  it('exige un nom de fichier csv/xlsx et un contenu base64', () => {
    expect(importSequenceLibraryRequestSchema.safeParse({ filename: 'a.xlsx', content_base64: 'QQ==' }).success).toBe(
      true,
    )
    expect(importSequenceLibraryRequestSchema.safeParse({ filename: 'a.pdf', content_base64: 'QQ==' }).success).toBe(
      false,
    )
  })
})
