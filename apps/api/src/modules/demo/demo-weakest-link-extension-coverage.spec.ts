import { DEMO_WEAKEST_LINK_EXTENSION_COVERAGE } from './demo-coverage'
import { DEMO_ANALYSED_ACCOUNTS, DEMO_DOSSIERS, DEMO_EXTENSION_ACCOUNTS } from './demo-dataset'

/**
 * #3294 / #3278 — « comptes ouverts non étendus » (le diagnostic du maillon faible veut ≥ 3 comptes ouverts à UN seul
 * contact, la moitié ou plus des comptes ouverts joignables).
 *
 * LOUIS 12/10/2026 — RETRAIT ASSUMÉ (craft rule n°9, pas un contournement de test) : « un compte ouvert à un seul contact
 * n'arrive jamais dans la vraie vie ». Les comptes minces (siège sans nom) qui démontraient ce diagnostic — Safran,
 * BoursoBank et dix grands clients — sont retirés ; la démo ne fabrique pas de comptes quasi vides pour le montrer. La
 * classification passe en « vide à dessein », avec la raison écrite. Cette garde ÉCHOUE si un compte à un seul contact
 * (ou un siège sans nom) revient dans le jeu semé.
 */
const OPEN = ['watching', 'opportunity']

function seededOpenAccounts(): { name: string; contacts: { full_name: string; title: string }[] }[] {
  return [
    ...DEMO_DOSSIERS.filter(d => OPEN.includes(d.account.commercial_status)).map(d => ({
      name: d.account.company_name,
      contacts: d.contacts,
    })),
    ...DEMO_EXTENSION_ACCOUNTS.map(a => ({ name: a.company_name, contacts: a.contacts })),
    ...DEMO_ANALYSED_ACCOUNTS.map(a => ({ name: a.company_name, contacts: a.contacts })),
  ]
}

describe('démo — plus aucun compte ouvert « non étendu » (Louis 12/10/2026)', () => {
  it('aucun compte ouvert du jeu semé ne porte un seul contact', () => {
    const thin = seededOpenAccounts().filter(account => account.contacts.length === 1)
    expect(thin.map(account => account.name)).toEqual([])
  })

  it('aucun siège sans nom (nom = intitulé de poste) sur un compte d’extension ou analysé', () => {
    for (const account of [...DEMO_EXTENSION_ACCOUNTS, ...DEMO_ANALYSED_ACCOUNTS]) {
      expect(account.contacts.length).toBeGreaterThan(1)
      const seats = account.contacts.filter(contact => contact.full_name === contact.title)
      expect({ account: account.company_name, seats: seats.map(contact => contact.title) }).toEqual({
        account: account.company_name,
        seats: [],
      })
    }
  })

  it('les anciens comptes minces ne reviennent pas', () => {
    const names = new Set(seededOpenAccounts().map(account => account.name))
    // 15/10/2026 — Safran et VINCI ne sont plus dans cette liste : ils reviennent RICHES (test suivant).
    for (const retired of [
      'BoursoBank',
      'Michelin',
      'Saint-Gobain',
      'Schneider Electric',
      'Air France-KLM',
      'La Poste',
      'Carrefour',
      'Bouygues',
      'AXA',
      'L’Oréal',
    ])
      expect(names.has(retired)).toBe(false)
  })

  it('15/10/2026 — Safran et VINCI reviennent RICHES, avec Crédit Agricole et Enedis : un dossier de compte chacun', () => {
    for (const name of ['Crédit Agricole', 'VINCI', 'Enedis', 'Safran']) {
      const account = DEMO_EXTENSION_ACCOUNTS.find(candidate => candidate.company_name === name)
      expect({ name, found: Boolean(account) }).toEqual({ name, found: true })
      // riche = des dizaines de personnes nommées, des entités, et le brief du dossier lu par « Ce que je sais »
      expect(account?.contacts.length).toBeGreaterThan(50)
      expect(account?.subsidiaries.length).toBeGreaterThan(3)
      expect(account?.raw_analysis['commercial_brief']).toBeDefined()
    }
    // jamais la version mince d'avant (« Vinci » à siège sans nom) à côté de la riche
    expect(DEMO_EXTENSION_ACCOUNTS.some(account => account.company_name === 'Vinci')).toBe(false)
  })

  it('comptes d’extension lisibles dans /accounts : secteur, siège, ligne de lecture, aucune ESN (#3294, décision 05/10)', () => {
    expect(DEMO_EXTENSION_ACCOUNTS.length).toBeGreaterThan(0)
    for (const account of DEMO_EXTENSION_ACCOUNTS) {
      expect(account.company_name).not.toMatch(/exemple/i)
      expect(account.sector).not.toMatch(/services du numérique/i)
      expect(account.headquarters.length).toBeGreaterThan(2)
      expect(account.priority_justification.length).toBeGreaterThan(20)
      expect(account.commercial_status).toBe('watching')
    }
  })

  it('classé « vide à dessein » avec la raison de Louis écrite', () => {
    expect(DEMO_WEAKEST_LINK_EXTENSION_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_WEAKEST_LINK_EXTENSION_COVERAGE.reason).toContain('Louis 12/10/2026')
    expect(DEMO_WEAKEST_LINK_EXTENSION_COVERAGE.reason).toContain('n’arrive jamais dans la vraie vie')
    expect(DEMO_WEAKEST_LINK_EXTENSION_COVERAGE.reason).toContain('ne fabrique pas de comptes quasi vides')
  })

  it('sait dire NON : un compte à un seul contact serait attrapé', () => {
    const fake = [{ name: 'Faux', contacts: [{ full_name: 'DSI', title: 'DSI' }] }]
    expect(fake.filter(account => account.contacts.length === 1)).toHaveLength(1)
  })
})
