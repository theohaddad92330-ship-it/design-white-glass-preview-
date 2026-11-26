import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ContactEntity } from '../../database/entities/contact.entity'
import { LinkedInInteractionEntity } from '../../database/entities/linkedin-interaction.entity'
import { CrmService } from '../crm/crm.service'
import { EsnProfileService } from '../esn-profile/esn-profile.service'
import { IaClient } from '../ia/ia.client'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { LinkedInService } from './linkedin.service'

const USER = '11111111-1111-1111-1111-111111111111'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'

describe('LinkedInService — sujets de publication', () => {
  let service: LinkedInService
  let ia: { postIdeas: jest.Mock }
  let isDemoWorkspace: jest.Mock

  beforeEach(async () => {
    ia = { postIdeas: jest.fn().mockResolvedValue({ data: { ideas: [] } }) }
    isDemoWorkspace = jest.fn().mockResolvedValue(false)

    const moduleRef = await Test.createTestingModule({
      providers: [
        LinkedInService,
        { provide: getRepositoryToken(LinkedInInteractionEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(ContactEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
        {
          provide: WorkspaceContextService,
          useValue: {
            resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }),
            isDemoWorkspace,
          },
        },
        { provide: IaClient, useValue: ia },
        { provide: EsnProfileService, useValue: { getAnswers: jest.fn().mockResolvedValue({}) } },
        { provide: CrmService, useValue: { findContactRecord: jest.fn(), logActivity: jest.fn() } },
      ],
    }).compile()

    service = moduleRef.get(LinkedInService)
  })

  it('n’appelle AUCUN modèle depuis une salle de démonstration', async () => {
    // Vu en production : cette route appelait bien Claude depuis l'espace de
    // démonstration, dont le bandeau promet « aucun crédit consommé ».
    isDemoWorkspace.mockResolvedValue(true)

    const ideas = await service.postIdeas(USER)

    expect(ia.postIdeas).not.toHaveBeenCalled()
    expect(ideas.length).toBeGreaterThan(0)
  })

  it('les sujets de démonstration portent tous leur ancrage', async () => {
    // La règle du lot vaut aussi pour le jeu scripté : un sujet sans source
    // affichée est une généralité, et la démonstration montrerait le contraire
    // de ce que le produit garantit.
    isDemoWorkspace.mockResolvedValue(true)

    for (const idea of await service.postIdeas(USER)) {
      expect(idea.angle.trim().length).toBeGreaterThan(0)
      expect(idea.groundedOn.trim().length).toBeGreaterThan(0)
    }
  })

  it('appelle le modèle dans un espace normal', async () => {
    await service.postIdeas(USER, 'obtenir trois rendez-vous')
    expect(ia.postIdeas).toHaveBeenCalled()
  })

  it('écarte un sujet rendu sans ancrage', async () => {
    ia.postIdeas.mockResolvedValue({
      data: {
        ideas: [
          { angle: 'Un angle', grounded_on: '' },
          { angle: 'Un autre', grounded_on: 'Mission ACME' },
        ],
      },
    })
    const ideas = await service.postIdeas(USER)
    expect(ideas.map(idea => idea.angle)).toEqual(['Un autre'])
  })
})
