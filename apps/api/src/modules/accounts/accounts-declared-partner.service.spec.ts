import { AccountDeclaredPartnerService } from './account-declared-partner.service'

/**
 * #2265.5 (épopée #2851) — le partenaire DÉCLARÉ par l'espace, marqué sur les
 * comptes de même nom. Le test sait dire NON : sans ligne `partner`, sans
 * dépôt, ou sur un autre nom, rien n'est marqué.
 */
function build(rawNames: string[]) {
  const qb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rawNames.map(name => ({ name }))),
  }
  const repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) }
  return { service: new AccountDeclaredPartnerService(repo as never), qb, repo }
}

describe('AccountDeclaredPartnerService.flag (#2265.5)', () => {
  it('marque le compte dont le nom est celui d’un partenaire déclaré (casse et espaces repliés)', async () => {
    const { service, qb } = build(['  alten  SA '])
    const rows = await service.flag('ws-1', [{ company_name: 'ALTEN SA' }, { company_name: 'Sopra Steria' }])
    expect(rows[0]).toEqual({ company_name: 'ALTEN SA', is_declared_partner: true })
    expect(rows[1]).toEqual({ company_name: 'Sopra Steria' })
    expect(qb.andWhere).toHaveBeenCalledWith("p.relationship = 'partner'")
  })

  it('ne marque rien sans partenaire déclaré', async () => {
    const { service } = build([])
    expect(await service.flag('ws-1', [{ company_name: 'ALTEN SA' }])).toEqual([{ company_name: 'ALTEN SA' }])
  })

  it('ne lit rien quand aucun nom n’est à vérifier', async () => {
    const { service, repo } = build(['alten'])
    expect(await service.flag('ws-1', [])).toEqual([])
    expect(repo.createQueryBuilder).not.toHaveBeenCalled()
  })
})
