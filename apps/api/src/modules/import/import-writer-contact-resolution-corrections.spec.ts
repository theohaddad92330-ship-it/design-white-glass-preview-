import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { ProjectEntity } from '../../database/entities/project.entity'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import type { ContactResolutionCorrectionsService } from '../contacts/contact-resolution-corrections.service'
import { ImportWriterService } from './import-writer.service'

/**
 * #2159.35 — UNE FICHE REJETÉE PAR UN HUMAIN NE MET PLUS À JOUR PAR E-MAIL.
 *
 * `existingKeys('contact', …)` indexe chaque fiche de l'espace par
 * `email:<adresse>` pour que l'import sache quelle ligne du fichier mettrait
 * à jour QUI. Un e-mail générique partagé (`accueil@`, `secretariat@`) peut
 * faire matcher une ligne sur la MAUVAISE personne réelle — et jusqu'ici rien
 * ne permettait à un humain de corriger ce rapprochement une fois pour toutes.
 *
 * Ce fichier vérifie que la fiche visée par la correction LA PLUS RÉCENTE
 * (« rejected ») sort du map, et RIEN d'autre : `@Optional()` absent ⇒
 * comportement byte-identique d'avant ce point.
 */

const WS = 'ws-1'

function makeWriter(
  existingContacts: Partial<ContactEntity>[],
  contactCorrections?: Pick<ContactResolutionCorrectionsService, 'rejectedContactIds'>,
) {
  const accounts = {} as unknown as Repository<AccountEntity>
  const contacts = {
    find: jest.fn(async () => existingContacts as ContactEntity[]),
  } as unknown as Repository<ContactEntity>
  const projects = {} as unknown as Repository<ProjectEntity>
  const writer = new ImportWriterService(
    accounts,
    contacts,
    projects,
    {} as unknown as Repository<ProjectNeedEntity>,
    {} as unknown as Repository<ConsultantEntity>,
    contactCorrections as ContactResolutionCorrectionsService | undefined,
  )
  return { writer }
}

describe("#2159.35 — existingKeys('contact', …) respecte les corrections de rapprochement", () => {
  it('sans registre câblé (`@Optional()` absent), le comportement reste EXACTEMENT celui d’avant', async () => {
    const { writer } = makeWriter([{ id: 'existing-1', email: 'accueil@acme.fr' }])
    const keys = await writer.existingKeys(WS, 'contact')
    expect(keys).toEqual({ 'email:accueil@acme.fr': 'existing-1' })
  })

  it('une fiche dont la DERNIÈRE correction est un rejet ne matche plus par e-mail', async () => {
    const rejectedContactIds = jest.fn(async () => new Set(['existing-1']))
    const { writer } = makeWriter([{ id: 'existing-1', email: 'accueil@acme.fr' }], { rejectedContactIds })

    const keys = await writer.existingKeys(WS, 'contact')

    expect(rejectedContactIds).toHaveBeenCalledWith(WS)
    expect(keys).toEqual({})
  })

  it('une fiche NON rejetée continue de matcher normalement, à côté d’une fiche rejetée', async () => {
    const rejectedContactIds = jest.fn(async () => new Set(['existing-1']))
    const { writer } = makeWriter(
      [
        { id: 'existing-1', email: 'accueil@acme.fr' },
        { id: 'existing-2', email: 'jean.dupont@acme.fr' },
      ],
      { rejectedContactIds },
    )

    const keys = await writer.existingKeys(WS, 'contact')

    expect(keys).toEqual({ 'email:jean.dupont@acme.fr': 'existing-2' })
  })

  it('un rejet sur une fiche SANS e-mail ne produit aucune clé fantôme', async () => {
    const rejectedContactIds = jest.fn(async () => new Set(['existing-1']))
    const { writer } = makeWriter([{ id: 'existing-1', email: null }], { rejectedContactIds })

    const keys = await writer.existingKeys(WS, 'contact')

    expect(keys).toEqual({})
  })
})
