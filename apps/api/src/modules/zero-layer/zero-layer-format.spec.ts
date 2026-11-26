import { accountSearchTerms, formatInternalHistory, type ZeroLayerSource } from './zero-layer-format'

/**
 * Le format des traces internes (annexe méthodo p8).
 *
 * L'enjeu : ce texte finit dans un prompt Claude. Une absence de résultat qui s'y
 * écrirait « aucun document trouvé » se lirait comme un FAIT établi et pousserait
 * le modèle à conclure que personne ne connaît le compte — la conclusion inverse
 * de celle que la couche zéro doit permettre.
 */

function source(over: Partial<ZeroLayerSource> = {}): ZeroLayerSource {
  return {
    key: 'drive',
    label: 'Documents internes (Google Drive)',
    findings: [{ title: 'Proposition commerciale ACME', date: '2026-03-04T10:00:00Z', detail: 'Google Doc' }],
    ...over,
  }
}

describe('formatInternalHistory', () => {
  it('rend le bloc quand une source a trouvé quelque chose', () => {
    const block = formatInternalHistory([source()])
    expect(block).toContain('Documents internes (Google Drive)')
    expect(block).toContain('Proposition commerciale ACME')
    expect(block).toContain('2026-03-04')
  })

  it('rend `undefined` quand AUCUNE source n’a rien trouvé', () => {
    expect(formatInternalHistory([source({ findings: [] })])).toBeUndefined()
    expect(formatInternalHistory([])).toBeUndefined()
  })

  it('n’écrit PAS la source vide quand une autre a trouvé', () => {
    // Une source muette doit disparaître, pas s'annoncer comme « rien trouvé ».
    const block = formatInternalHistory([
      source({ findings: [] }),
      source({ key: 'notion', label: 'Notes (Notion)', findings: [{ title: 'CR réunion ACME' }] }),
    ])
    expect(block).toContain('Notes (Notion)')
    expect(block).not.toContain('Google Drive')
  })

  it('borne le nombre de traces par source', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ title: `Document ${i}` }))
    const block = formatInternalHistory([source({ findings: many })]) ?? ''
    expect(block).toContain('Document 0')
    expect(block).not.toContain('Document 9')
  })

  it('omet une date invalide au lieu de la recopier', () => {
    const block = formatInternalHistory([source({ findings: [{ title: 'Note', date: 'pas une date' }] })]) ?? ''
    expect(block).toContain('Note')
    expect(block).not.toContain('pas une date')
  })

  it('ignore une trace sans titre — il n’y aurait rien à citer', () => {
    expect(formatInternalHistory([source({ findings: [{ title: '   ' }] })])).toBeUndefined()
  })

  it('borne le bloc entier — il part dans un prompt', () => {
    const huge = Array.from({ length: 6 }, (_, i) => ({ title: `${i} ${'x'.repeat(2000)}` }))
    const block = formatInternalHistory([source({ findings: huge })]) ?? ''
    expect(block.length).toBeLessThanOrEqual(4000)
  })
})

describe('accountSearchTerms', () => {
  it('cherche par nom puis par domaine', () => {
    expect(accountSearchTerms({ companyName: 'ACME Industries', domain: 'acme.com' })).toEqual([
      'ACME Industries',
      'acme.com',
    ])
  })

  it('écarte un nom trop court — il ramènerait n’importe quoi', () => {
    expect(accountSearchTerms({ companyName: 'SG', domain: null })).toEqual([])
  })

  it('TÉMOIN — le même compte avec un nom exploitable rend bien un terme', () => {
    // Prouve que le rejet vient de la LONGUEUR, pas d'un bug de lecture.
    expect(accountSearchTerms({ companyName: 'Société Générale', domain: null })).toEqual(['Société Générale'])
  })
})
