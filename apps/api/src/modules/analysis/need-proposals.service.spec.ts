import { NeedProposalsService } from './need-proposals.service'

/**
 * #2647.1 — la section « Besoins » du dossier compte lit les propositions
 * EN ATTENTE d'un compte précis. `pending()` ne filtrait que par ESPACE
 * (`workspace_id`) : deux comptes du MÊME espace partageaient la même liste.
 * Un compte ne doit jamais voir les propositions d'un autre — c'est une
 * question de cloisonnement, pas d'affichage : ce test verrouille le `where`
 * envoyé à la base, pas seulement ce que l'écran finirait par filtrer.
 */
describe('NeedProposalsService.pending (#2647.1) — cloisonnement par compte', () => {
  function build() {
    const find = jest.fn().mockResolvedValue([])
    const proposals = { find }
    const service = new NeedProposalsService(proposals as never)
    return { service, find }
  }

  const WORKSPACE = 'ws-1'
  const ACCOUNT = 'acc-1'

  it('sans accountId : ne filtre QUE par espace, comme avant (vue transverse workspace/needs/proposals)', async () => {
    const { service, find } = build()
    await service.pending(WORKSPACE)
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspace_id: WORKSPACE, status: 'pending' } }),
    )
  })

  it('avec accountId : filtre par espace ET par compte — un compte ne voit pas les besoins d’un autre', async () => {
    const { service, find } = build()
    await service.pending(WORKSPACE, ACCOUNT)
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspace_id: WORKSPACE, status: 'pending', account_id: ACCOUNT },
      }),
    )
  })
})
