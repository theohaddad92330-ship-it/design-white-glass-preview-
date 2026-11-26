import { rfpNeedPreviewSchema, type RfpRequirement } from '@bellum/contracts'
import { needFromRfp, previewNeedFromRfp } from './rfp-to-need'

/**
 * #1097 — « est-ce que ça sert à Bellum de charger les AO reçus d'un compte ? »
 * Oui : ils deviennent des besoins ouverts, donc de la matière pour le moteur de
 * matching. Ce test garde la seule chose qui pourrait mal tourner — inventer.
 */
describe('needFromRfp', () => {
  const base = { title: 'Refonte du SI de facturation — lot 2', due_at: '2026-11-30T17:00:00.000Z' }

  it('reprend le titre du document', () => {
    expect(needFromRfp(base).title).toBe('Refonte du SI de facturation — lot 2')
  })

  it('marque la source « tender » et une provenance humaine', () => {
    const need = needFromRfp(base)
    expect(need.source).toBe('tender')
    expect(need.provenance).toBe('human')
  })

  it('porte la date limite de remise comme échéance', () => {
    expect(needFromRfp(base).deadline_at).toBe('2026-11-30T17:00:00.000Z')
  })

  it("n'invente AUCUNE compétence", () => {
    // Le garde-fou du lot. Les exigences d'un appel d'offres sont de la prose ;
    // en tirer une liste de technologies ferait classer des profils sur des mots
    // qu'on aurait fabriqués. Le recruteur les saisit.
    expect(needFromRfp(base).skills ?? []).toEqual([])
  })

  it("n'écrit pas d'échéance quand le document n'en porte pas", () => {
    // « Non renseigné » n'est pas « aujourd'hui » : une échéance devinée ferait
    // remonter le besoin en tête d'une file d'urgences.
    expect('deadline_at' in needFromRfp({ title: 'AO sans date', due_at: null })).toBe(false)
  })

  it('borne un titre trop long au lieu de refuser le besoin', () => {
    const need = needFromRfp({ title: 'x'.repeat(400), due_at: null })
    expect(need.title.length).toBe(200)
  })
})

/**
 * #2571.1 — la prévisualisation : ce que le document DIT (critères) et ce
 * qu'il ne dit pas (inconnues, NOMMÉES, jamais devinées ni remplies par
 * défaut). #2571.2 — c'est une fonction PURE : aucune écriture, elle rend ce
 * que `POST /rfp/:id/need` écrirait si on le confirmait.
 */
describe('previewNeedFromRfp', () => {
  function requirement(over: Partial<RfpRequirement> = {}): RfpRequirement {
    return {
      id: '11111111-1111-4111-8111-111111111111',
      rfp_id: '22222222-2222-4222-8222-222222222222',
      section: null,
      text: 'Hébergement des données en France',
      weight: 'mandatory',
      kind: 'security',
      owner_role: 'security',
      answer_status: 'to_produce',
      answer_source: null,
      answer_text: null,
      risk: null,
      source_document: null,
      ...over,
    }
  }

  const base = {
    title: 'Refonte du SI de facturation — lot 2',
    due_at: '2026-11-30T17:00:00.000Z' as string | null,
    issuer: 'Client Grand Est' as string | null,
    lots: ['Lot 1 — développement', 'Lot 2 — support'],
    requirements: [requirement()],
  }

  it('rend une prévisualisation que le contrat accepte', () => {
    expect(() => rfpNeedPreviewSchema.parse(previewNeedFromRfp(base))).not.toThrow()
  })

  it("reprend needFromRfp pour le besoin, sans jamais l'inventer deux fois", () => {
    const preview = previewNeedFromRfp(base)
    expect(preview.need).toEqual(needFromRfp(base))
  })

  it("liste l'émetteur, l'échéance, les lots et les exigences non ambiguës comme critères", () => {
    const preview = previewNeedFromRfp(base)
    expect(preview.criteria).toEqual([
      { kind: 'issuer', value: 'Client Grand Est' },
      { kind: 'deadline', value: '2026-11-30T17:00:00.000Z' },
      { kind: 'lot', value: 'Lot 1 — développement' },
      { kind: 'lot', value: 'Lot 2 — support' },
      { kind: 'requirement', value: 'Hébergement des données en France' },
    ])
  })

  it("nomme toujours l'absence de compétences — jamais dérivées d'une prose", () => {
    const preview = previewNeedFromRfp(base)
    expect(preview.unknowns).toContainEqual({ kind: 'skills', value: null })
  })

  it('nomme une exigence AMBIGUË comme inconnue, avec son texte source', () => {
    const preview = previewNeedFromRfp({
      ...base,
      requirements: [requirement({ weight: 'ambiguous', text: 'Pénalités de retard non chiffrées' })],
    })
    expect(preview.unknowns).toContainEqual({
      kind: 'ambiguous_requirement',
      value: 'Pénalités de retard non chiffrées',
    })
    // Une exigence ambiguë n'est PAS aussi listée comme un critère acquis :
    // elle est une question ouverte, pas un fait établi.
    expect(preview.criteria.some(criterion => criterion.kind === 'requirement')).toBe(false)
  })

  it("nomme l'émetteur ET l'échéance absents plutôt que de les taire", () => {
    const preview = previewNeedFromRfp({ ...base, issuer: null, due_at: null })
    expect(preview.unknowns).toContainEqual({ kind: 'issuer', value: null })
    expect(preview.unknowns).toContainEqual({ kind: 'deadline', value: null })
    expect(preview.criteria.some(criterion => criterion.kind === 'issuer')).toBe(false)
    expect(preview.criteria.some(criterion => criterion.kind === 'deadline')).toBe(false)
  })
})
