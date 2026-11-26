import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NotFoundException } from '@nestjs/common'
import { ProposalsController } from './proposals.controller'

const USER = { userId: 'user-1', email: 'rep@esn.fr' }
const VIEW = {
  project: { id: 'proj-1', label: 'Refonte data', accountId: 'acc-1', accountName: 'Contoso' },
  outline: { sections: [], readyCount: 0, complete: false },
}

function makeController() {
  const proposals = {
    listCandidates: jest
      .fn()
      .mockResolvedValue([{ id: 'proj-1', label: 'Refonte data', accountId: 'acc-1', accountName: 'Contoso' }]),
    buildForProject: jest.fn().mockResolvedValue(VIEW),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
  }
  const controller = new ProposalsController(proposals as never, workspaceContext as never)
  return { controller, proposals, workspaceContext }
}

describe('ProposalsController', () => {
  it('liste les besoins de l’espace RÉSOLU, jamais d’un espace passé en paramètre', async () => {
    const { controller, proposals, workspaceContext } = makeController()
    const res = await controller.list(USER)

    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
    expect(proposals.listCandidates).toHaveBeenCalledWith('ws-1')
    expect(res.projects).toHaveLength(1)
  })

  it('assemble le plan du besoin dans l’espace de l’appelant', async () => {
    const { controller, proposals } = makeController()
    const res = await controller.get('proj-1', USER)

    expect(proposals.buildForProject).toHaveBeenCalledWith('proj-1', 'ws-1')
    expect(res).toEqual(VIEW)
  })

  it('rend 404 — et pas 403 — sur un besoin hors de l’espace', async () => {
    const { controller, proposals } = makeController()
    proposals.buildForProject.mockResolvedValue(null)

    // Un 403 confirmerait au passage que le besoin existe ailleurs.
    await expect(controller.get('proj-x', USER)).rejects.toBeInstanceOf(NotFoundException)
  })

  describe('le studio prépare, il n’envoie pas', () => {
    const source = readFileSync(join(__dirname, 'proposals.controller.ts'), 'utf8')

    it('lit bien le contrôleur (une garde qui ne lit rien passe toujours)', () => {
      expect(source).toContain("@Controller('proposals')")
      expect(source.length).toBeGreaterThan(500)
    })

    it('n’expose AUCUN verbe d’écriture', () => {
      // Ce n'est pas une convention : c'est l'absence de code. Le jour où une
      // route d'écriture apparaît, elle se discute — elle ne se glisse pas.
      const writeVerbs = ['@Post(', '@Put(', '@Patch(', '@Delete(']
      expect(writeVerbs.filter(verb => source.includes(verb))).toEqual([])
    })
  })
})
