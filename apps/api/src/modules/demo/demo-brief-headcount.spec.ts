import { DEMO_DOSSIERS, briefHeadcount } from './demo-dataset'

describe('briefHeadcount — l’effectif affiché dans l’en-tête d’un compte de la salle', () => {
  it('réduit une trajectoire à son nombre de tête (Chantiers de l’Atlantique)', () => {
    expect(briefHeadcount('Environ 4 100 en 2025 ; vers 4 500 ; 400 embauches en 2026')).toBe('Environ 4 100')
  })

  it('garde tel quel un effectif qui porte déjà son mot', () => {
    expect(briefHeadcount('Plus de 75 000 collaborateurs')).toBe('Plus de 75 000 collaborateurs')
    expect(briefHeadcount('Environ 15 300 salariés, 17 pays')).toBe('Environ 15 300 salariés, 17 pays')
  })

  it('rend une valeur vide telle quelle (non renseigné, jamais un repli)', () => {
    expect(briefHeadcount('')).toBe('')
  })

  it('le dossier Chantiers de l’Atlantique porte « Environ 4 100 »', () => {
    const dossier = DEMO_DOSSIERS.find(d => d.account.company_name === "Chantiers de l'Atlantique")
    expect(dossier?.account.employees).toBe('Environ 4 100')
  })
})
