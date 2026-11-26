/**
 * #3740.3 — « écriture inverse » : un organigramme importé qui
 * porte le LinkedIn d'une personne déjà connue comme contact complète ce
 * contact, SEULEMENT s'il n'en a aucun. `planOrgChartContacts` décide
 * (`org-chart-contacts.spec.ts`) ; ce test vérifie l'ÉCRITURE elle-même,
 * faite par `ContactsService.importOrgChartPeople`.
 */
import { ContactsService } from './contacts.service'
import { createMockRepository } from '../../database/test-utils'

const build = () => {
  const contacts = createMockRepository()
  const service = new ContactsService(
    contacts as never,
    createMockRepository() as never,
    { enrichContact: jest.fn() } as never,
    {} as never,
    // #3942.5 — résolu désormais même sur le chemin « écriture inverse seule
    // » (sans création), voir `contacts.service.ts`.
    { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) } as never,
    {} as never,
    {} as never,
    { get: jest.fn() } as never,
    {} as never,
    createMockRepository() as never,
    createMockRepository() as never,
    {} as never,
    {} as never,
    createMockRepository() as never,
    {} as never,
  )
  return { service, contacts }
}

describe('ContactsService.importOrgChartPeople — écriture inverse du LinkedIn', () => {
  it('un contact lié sans LinkedIn reçoit celui du fichier importé', async () => {
    const { service, contacts } = build()
    contacts.find.mockResolvedValue([
      { id: 'c-1', full_name: 'Éloïse Martin', email: null, phone: null, linkedin_url: null },
    ])

    const result = await service.importOrgChartPeople('acc-1', 'u-1', [
      { fullName: 'Éloïse Martin', linkedinUrl: 'https://linkedin.com/in/eloise-martin' },
    ])

    expect(contacts.update).toHaveBeenCalledWith(
      { id: 'c-1' },
      { linkedin_url: 'https://linkedin.com/in/eloise-martin' },
    )
    expect(result.contacts).toEqual([{ fullName: 'Éloïse Martin', contactId: 'c-1', status: 'linked' }])
  })

  it('un contact lié qui a déjà un LinkedIn n’est jamais réécrit', async () => {
    const { service, contacts } = build()
    contacts.find.mockResolvedValue([
      {
        id: 'c-1',
        full_name: 'Éloïse Martin',
        email: null,
        phone: null,
        linkedin_url: 'https://linkedin.com/in/deja-la',
      },
    ])

    await service.importOrgChartPeople('acc-1', 'u-1', [
      { fullName: 'Éloïse Martin', linkedinUrl: 'https://linkedin.com/in/eloise-martin' },
    ])

    expect(contacts.update).not.toHaveBeenCalled()
  })

  it('un fichier sans LinkedIn ne déclenche aucune écriture', async () => {
    const { service, contacts } = build()
    contacts.find.mockResolvedValue([
      { id: 'c-1', full_name: 'Éloïse Martin', email: null, phone: null, linkedin_url: null },
    ])

    await service.importOrgChartPeople('acc-1', 'u-1', [{ fullName: 'Éloïse Martin', title: 'DAF' }])

    expect(contacts.update).not.toHaveBeenCalled()
  })
})
