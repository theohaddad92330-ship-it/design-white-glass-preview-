import { buildSourceMaterial, needKey, sanitizeNeedPlay } from './need-play-guard'

/**
 * Le prompt du plan d'attaque demande à un modèle de vendre — donc de citer des
 * références. Ce garde ne lui fait pas confiance : il confronte chaque citation
 * à la matière que l'ESN et le dossier fournissent réellement.
 */
describe('garde-fou du plan d’attaque', () => {
  const source = buildSourceMaterial({
    profile: { offers: ['Data'], references: ['Groupe Helios — refonte du socle data'] },
    account: { company_name: 'ACME', context: 'Plan de transformation 2027' },
  })

  it('garde une preuve réellement citée dans la matière source', () => {
    const play = sanitizeNeedPlay(
      { proofs: [{ claim: 'Nous avons refait un socle data', proof: 'refonte du socle data' }] },
      source,
      [],
    )

    expect(play.proofs).toEqual([{ claim: 'Nous avons refait un socle data', proof: 'refonte du socle data' }])
    expect(play.missing).toEqual([])
  })

  it('RETIRE une référence inventée — et le DIT', () => {
    // Le mensonge silencieux est pire que l'invention : il la rend invisible.
    const play = sanitizeNeedPlay(
      { proofs: [{ claim: 'Nous avons livré chez votre concurrent', proof: 'projet mené chez Contoso Industries' }] },
      source,
      [],
    )

    expect(play.proofs).toEqual([])
    expect(play.missing).toContain('Nous avons livré chez votre concurrent')
  })

  it('refuse une citation trop courte pour prouver quoi que ce soit', () => {
    const play = sanitizeNeedPlay({ proofs: [{ claim: 'Expertise Data', proof: 'Data' }] }, source, [])

    expect(play.proofs).toEqual([])
    expect(play.missing).toContain('Expertise Data')
  })

  it('ignore la casse et les accents (une re-analyse reformule)', () => {
    const play = sanitizeNeedPlay({ proofs: [{ claim: 'Socle data', proof: 'REFONTE DU SOCLE DATA' }] }, source, [])

    expect(play.proofs).toHaveLength(1)
  })

  it('garde un contact du dossier avec son nom', () => {
    const play = sanitizeNeedPlay(
      { targets: [{ name: 'Claire Vasseur', role: 'DSI', why: 'porte le sujet' }] },
      source,
      [{ full_name: 'Claire Vasseur' }],
    )

    expect(play.targets[0]).toEqual({ name: 'Claire Vasseur', role: 'DSI', why: 'porte le sujet' })
  })

  it('transforme une personne inventée en RÔLE à identifier', () => {
    // Un nom fantôme envoie le commercial chercher quelqu'un qui n'existe pas.
    const play = sanitizeNeedPlay(
      { targets: [{ name: 'Jean Dupont', role: 'Directeur des achats', why: 'décide du budget' }] },
      source,
      [{ full_name: 'Claire Vasseur' }],
    )

    expect(play.targets[0]!.name).toBe('')
    expect(play.targets[0]!.role).toBe('Directeur des achats')
  })

  it('ne rend jamais autre chose qu’un plan bien formé, même sur une sortie vide', () => {
    const play = sanitizeNeedPlay(null, source, [])

    expect(play).toEqual({ angle: '', targets: [], message: '', proofs: [], missing: [], next_action: '' })
  })
})

describe('clé de besoin', () => {
  it('survit à une reformulation de surface (casse, accents, ponctuation)', () => {
    // Sinon l'équipe repaie un plan qu'elle possède déjà — exactement le
    // reproche qu'on évitait en choisissant « le crédit paie une génération ».
    expect(needKey('acc-1', 'program', 'Migration ERP')).toBe(needKey('acc-1', 'PROGRAM', 'migration erp !'))
    expect(needKey('acc-1', 'program', 'Refonte du SI Achats')).toBe(
      needKey('acc-1', 'program', 'refonte du si achats'),
    )
  })

  it('distingue deux besoins différents, et deux comptes différents', () => {
    expect(needKey('acc-1', 'program', 'Migration ERP')).not.toBe(needKey('acc-1', 'program', 'Refonte réseau'))
    expect(needKey('acc-1', 'program', 'Migration ERP')).not.toBe(needKey('acc-2', 'program', 'Migration ERP'))
  })
})
