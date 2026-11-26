import type { Contact } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { contactCurrentPost, contactDeparture } from './contactDeparture'

function withHistory(history: unknown[] | undefined, extra: Partial<Contact> = {}): Contact {
  return {
    id: 'c1',
    full_name: 'Augustin Mustafovic',
    apollo_enrichment: history ? { employment_history: history } : null,
    ...extra,
  } as unknown as Contact
}

const TROIS_POSTES = [
  { organization_name: 'Safran', title: 'Head of IT Transformation', start_date: '2024-02-01', current: true },
  {
    organization_name: 'Safran Aircraft Engines',
    title: 'IT Manager',
    start_date: '2022-01-01',
    end_date: '2024-01-31',
  },
  { organization_name: 'Capgemini', title: 'Consultant', start_date: '2018-01-01', end_date: '2021-12-31' },
]

describe('contactCurrentPost — le poste marqué « actuel », jamais le plus récent par défaut', () => {
  it('rend le poste `current` parmi trois', () => {
    expect(contactCurrentPost(withHistory(TROIS_POSTES))?.title).toBe('Head of IT Transformation')
  })

  it('NON : aucun poste `current` ⇒ null, même si un poste est plus récent que les autres', () => {
    const sansCurrent = TROIS_POSTES.map(entry => ({ ...entry, current: false }))
    expect(contactCurrentPost(withHistory(sansCurrent))).toBeNull()
  })
})

describe('contactDeparture — le départ se déduit à la lecture', () => {
  it('poste `current` dans une autre entreprise que le compte ⇒ parti, employeur nommé', () => {
    const history = [
      { organization_name: 'Orange', title: 'Directrice', start_date: '2025-05-01', current: true },
      { organization_name: 'Safran', title: 'Responsable IT', end_date: '2025-03-31', current: false },
    ]
    expect(contactDeparture(withHistory(history), 'Safran')).toEqual({ organization: 'Orange', at: '2025-03-31' })
  })

  it('NON : poste `current` chez le compte (forme juridique près) ⇒ pas parti', () => {
    expect(contactDeparture(withHistory(TROIS_POSTES), 'Safran SA')).toBeNull()
  })

  it('date de fin sur le poste du compte, rien en cours ailleurs ⇒ parti, sans employeur deviné', () => {
    const history = [{ organization_name: 'Safran', title: 'DSI', end_date: '2025-06-30' }]
    expect(contactDeparture(withHistory(history), 'Safran')).toEqual({ organization: null, at: '2025-06-30' })
  })

  it('parti chez un autre employeur sans date de fin connue ⇒ parti, date absente (jamais inventée)', () => {
    const history = [{ organization_name: 'Orange', title: 'Directrice', current: true }]
    expect(contactDeparture(withHistory(history), 'Safran')).toEqual({ organization: 'Orange', at: null })
  })

  it('NON : aucun historique ⇒ aucune mention de départ', () => {
    expect(contactDeparture(withHistory(undefined), 'Safran')).toBeNull()
    expect(contactDeparture(withHistory([]), 'Safran')).toBeNull()
  })

  it('NON : nom du compte inconnu ⇒ on ne compare rien, on ne conclut rien', () => {
    expect(contactDeparture(withHistory(TROIS_POSTES), null)).toBeNull()
    expect(contactDeparture(withHistory(TROIS_POSTES), '  ')).toBeNull()
  })

  it('la preuve datée déjà projetée par le serveur gagne', () => {
    const contact = withHistory(undefined, { employment_left: { organization: 'Thales', at: '2025-01-15' } })
    expect(contactDeparture(contact, 'Safran')).toEqual({ organization: 'Thales', at: '2025-01-15' })
  })
})
