import { success } from '@bellum/utils'
import type { AccountEntity } from '../../database/entities/account.entity'
import { AnalysisController } from './analysis.controller'
import { AnalysisOnDemandService } from './analysis-ondemand.service'
import { AccountsService } from '../accounts/accounts.service'
import { ContactsService } from '../contacts/contacts.service'
import { IaClient } from '../ia/ia.client'
import { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import { AnalysisPersistenceService } from './analysis.persistence'
import { OrgGraphVersionService } from '../org-graph/org-graph.service'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { DeclareOrgPeopleDto } from './dto/declare-org-people.dto'

/**
 * #3740 — « importer un organigramme et, si des personnes correspondent,
 * l'enrichir avec les données de Bellum ». Rejoue le tour sur le VRAI
 * contrôleur : fichier lu → aperçu (ce que Bellum sait) → validation (la
 * déclaration reçoit le titre / LinkedIn manquants). Un seul rapprochement
 * pour les deux, donc l'aperçu ne promet pas autre chose que l'écriture.
 */

const USER: CurrentUserPayload = { userId: 'u-1', email: 'sales@example.com' }
const account = { id: 'acc-1', user_id: 'u-1', company_name: 'Acme', raw_analysis: null } as unknown as AccountEntity

const dupont = {
  full_name: 'Jean Dupont',
  title: 'DSI',
  email: 'jean.dupont@acme.fr',
  phone: '+33 1 02 03 04 05',
  linkedin_url: 'https://linkedin.com/in/jdupont',
}

function buildController() {
  const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
  const contacts = { findByAccount: jest.fn().mockResolvedValue([dupont]) }
  const declarePeople = jest.fn().mockResolvedValue({ graphVersion: 2, declared: 2, grafted: true })
  const stub = {} as never
  const onDemand = new AnalysisOnDemandService(
    accounts as unknown as AccountsService,
    contacts as unknown as ContactsService,
    {} as IaClient,
    {} as AnalysisPersistenceService,
    { getAnswers: jest.fn(), resolveProfileData: jest.fn() } as unknown as EsnProfileReader,
    undefined,
    undefined,
    undefined,
    undefined,
    { declarePeople } as unknown as OrgGraphVersionService,
  )
  const controller = new AnalysisController(stub, onDemand, stub, stub, stub, stub, stub, stub, stub, stub, stub)
  return { controller, declarePeople }
}

const body = (people: Array<{ fullName: string; title?: string }>) => ({ people }) as unknown as DeclareOrgPeopleDto

describe('AnalysisController — import d’organigramme enrichi par Bellum (#3740)', () => {
  it('aperçu : une personne connue est rendue avec ses coordonnées en clair, une inconnue est « new »', async () => {
    const { controller, declarePeople } = buildController()

    const result = await controller.previewOrgPeople(
      'acc-1',
      body([{ fullName: 'jean dupont' }, { fullName: 'Inconnue Totale' }]),
      USER,
    )

    expect(result.rows[0]).toMatchObject({
      match: 'known_contact',
      bellum: { email: 'jean.dupont@acme.fr', phone: '+33 1 02 03 04 05' },
      fills: ['title', 'linkedinUrl'],
    })
    expect(result.rows[1]).toMatchObject({ match: 'new', fills: [] })
    expect(declarePeople).not.toHaveBeenCalled() // l'aperçu n'écrit rien
  })

  it('validation : la personne connue reçoit le titre et LinkedIn de Bellum, le fichier gagne sur le titre', async () => {
    const { controller, declarePeople } = buildController()

    await controller.declareOrgPeople('acc-1', body([{ fullName: 'Jean Dupont', title: 'Directeur SI' }]), USER)

    const written = declarePeople.mock.calls[0]![0].people[0]
    expect(written).toMatchObject({ title: 'Directeur SI', linkedinUrl: 'https://linkedin.com/in/jdupont' })
  })
})
