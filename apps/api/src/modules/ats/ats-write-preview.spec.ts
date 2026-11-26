import { buildPreview, isExpired } from './ats-write-preview'

describe('buildPreview', () => {
  it('énumère les champs qui seront écrits, dans l’ordre', () => {
    const preview = buildPreview('create_mission', {
      clientName: 'ACME',
      consultantName: 'Marc Dupuis',
      startDate: '2026-09-01',
      endDate: '2026-12-31',
      dailyRate: 620,
    })
    expect(preview).toContain('Client : ACME')
    expect(preview).toContain('Consultant : Marc Dupuis')
    expect(preview).toContain('TJM : 620 €')
  })

  it('nomme une valeur absente plutôt que de laisser un blanc', () => {
    // « TJM : » suivi de rien se lit comme un bug d'affichage ; « non
    // renseigné » dit que le champ partira vide.
    const preview = buildPreview('create_mission', {
      clientName: 'ACME',
      consultantName: 'Marc',
      startDate: '2026-09-01',
    })
    expect(preview).toContain('Fin : non renseigné')
    expect(preview).toContain('TJM : non renseigné')
  })

  it('rappelle la conséquence sur un changement de TJM', () => {
    const preview = buildPreview('update_tjm', {
      resourceId: 'D-42',
      consultantName: 'Marc',
      missionReference: 'M-42',
      dailyRate: 700,
    })
    expect(preview).toContain('Nouveau TJM : 700 €')
    expect(preview).toContain('Ce montant alimente la facturation.')
  })

  it('nomme la ressource ERP visée — le responsable valide CETTE mission précise', () => {
    const preview = buildPreview('update_tjm', {
      resourceId: 'D-42',
      consultantName: 'Marc',
      missionReference: 'M-42',
      dailyRate: 700,
    })
    expect(preview).toContain('Ressource ERP : D-42')
  })

  it('ne laisse pas passer un montant illisible pour un montant', () => {
    const preview = buildPreview('update_tjm', {
      resourceId: 'D-42',
      consultantName: 'Marc',
      missionReference: 'M-42',
      dailyRate: Number.NaN,
    })
    expect(preview).toContain('Nouveau TJM : non renseigné')
  })

  it('décrit un changement de statut de besoin', () => {
    const preview = buildPreview('update_need_status', { resourceId: 'O-7', needReference: 'B-7', status: 'Gagné' })
    expect(preview).toContain('Ressource ERP : O-7')
    expect(preview).toContain('Besoin : B-7')
    expect(preview).toContain('Nouveau statut : Gagné')
    expect(preview).toContain('Commentaire : non renseigné')
  })
})

describe('isExpired', () => {
  const now = new Date('2026-08-10T12:00:00.000Z')

  it('périme une demande en attente au-delà de son échéance', () => {
    expect(isExpired({ state: 'pending', expires_at: new Date('2026-08-09T12:00:00.000Z') }, now)).toBe(true)
  })

  it('ne périme pas une demande encore dans les temps', () => {
    expect(isExpired({ state: 'pending', expires_at: new Date('2026-08-11T12:00:00.000Z') }, now)).toBe(false)
  })

  it('ne touche pas à une demande déjà tranchée', () => {
    // Une demande approuvée hier reste approuvée : l'expiration porte sur
    // l'attente, pas sur la décision.
    expect(isExpired({ state: 'approved', expires_at: new Date('2026-01-01T00:00:00.000Z') }, now)).toBe(false)
  })
})
