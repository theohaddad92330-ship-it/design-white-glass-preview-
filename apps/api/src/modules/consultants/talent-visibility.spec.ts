import { talentVisibility } from './talent-visibility'

/**
 * Qui voit quoi sur une fiche talent (PDF 3 §13.1, décision D20 du 20/08).
 *
 * Ce que ces tests protègent : un réglage d'espace ne doit jamais devenir une
 * porte dérobée (un rôle qui contourne) ni une prison (l'admin qui ne peut plus
 * vérifier ce qu'il a réglé).
 */
describe('talentVisibility', () => {
  it('ne masque RIEN par défaut — aucun espace existant ne change', () => {
    const seen = talentVisibility({ role: 'sales', hideContactsFromSales: false })
    expect(seen.contacts).toBe(true)
  })

  it('masque les coordonnées aux commerciaux quand l’espace le demande', () => {
    expect(talentVisibility({ role: 'sales', hideContactsFromSales: true }).contacts).toBe(false)
    expect(talentVisibility({ role: 'sales_ops', hideContactsFromSales: true }).contacts).toBe(false)
  })

  it('les laisse au recrutement, dont c’est le métier', () => {
    expect(talentVisibility({ role: 'recruiter', hideContactsFromSales: true }).contacts).toBe(true)
  })

  it('les laisse à l’administration — sinon régler la confidentialité rendrait la vérification impossible', () => {
    expect(talentVisibility({ role: 'admin', hideContactsFromSales: true }).contacts).toBe(true)
    expect(talentVisibility({ role: 'owner', hideContactsFromSales: true }).contacts).toBe(true)
  })

  it('réserve les montants à `finance:read`', () => {
    // Le vivier suit la même règle que la marge d'une mission : ce qui n'est
    // pas du périmètre de quelqu'un est retiré, pas mis à zéro.
    expect(talentVisibility({ role: 'sales', hideContactsFromSales: false }).finance).toBe(false)
    expect(talentVisibility({ role: 'recruiter', hideContactsFromSales: false }).finance).toBe(false)
    expect(talentVisibility({ role: 'finance', hideContactsFromSales: false }).finance).toBe(true)
    expect(talentVisibility({ role: 'admin', hideContactsFromSales: false }).finance).toBe(true)
  })

  it('honore une permission accordée au MEMBRE, pas seulement à son rôle', () => {
    // Les permissions additives par membre existent depuis le 19/08 ; les
    // ignorer ici ferait mentir l'écran d'équipe, qui les affiche.
    const seen = talentVisibility({
      role: 'recruiter',
      extraPermissions: ['finance:read'],
      hideContactsFromSales: false,
    })
    expect(seen.finance).toBe(true)
  })

  it('ne donne RIEN de plus à un lecteur seul', () => {
    const seen = talentVisibility({ role: 'viewer', hideContactsFromSales: true })
    expect(seen).toEqual({ contacts: false, finance: false })
  })
})
