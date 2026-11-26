import type { AccountEntity } from '../../database/entities/account.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { AccountPartnerEntity } from '../../database/entities/account-partner.entity'
import { createMockRepository } from '../../database/test-utils'
import { AccountInterestPenetrabilityService } from './account-interest-penetrability.service'
import { AccountStrategy5PService } from './account-strategy-5p.service'

const WORKSPACE = 'ws-1'
const ACCOUNT = 'acc-1'

function build() {
  const accounts = createMockRepository<AccountEntity>()
  const contacts = createMockRepository<ContactEntity>()
  const partners = createMockRepository<AccountPartnerEntity>()
  const strategy5P = new AccountStrategy5PService(accounts as never, contacts as never)
  const service = new AccountInterestPenetrabilityService(
    accounts as never,
    contacts as never,
    partners as never,
    strategy5P,
  )
  return { service, accounts, contacts, partners }
}

describe('AccountInterestPenetrabilityService — la maison canonique de la matrice intérêt × pénétrabilité', () => {
  it('rend `null` pour un compte hors du périmètre de l’appelant — jamais une matrice devinée', async () => {
    const { service, accounts } = build()
    accounts.findOne.mockResolvedValueOnce(null)

    const result = await service.matrixFor(ACCOUNT, WORKSPACE)

    expect(result).toBeNull()
    expect(accounts.findOne).toHaveBeenCalledWith({ where: { id: ACCOUNT, workspace_id: WORKSPACE } })
  })

  it('porte les deux axes nommés (8 intérêt, 11 pénétrabilité) pour un compte sans donnée', async () => {
    const { service, accounts } = build()
    accounts.findOne.mockResolvedValue({ id: ACCOUNT, raw_analysis: {} })

    const result = await service.matrixFor(ACCOUNT, WORKSPACE)

    expect(result?.interest.factors).toHaveLength(8)
    expect(result?.penetrability.factors).toHaveLength(11)
    expect(result?.quadrant).toBeNull()
  })

  it('lit account_partners (relationship=partner, non écarté) pour le facteur partner_in_place', async () => {
    const { service, accounts, partners } = build()
    accounts.findOne.mockResolvedValue({ id: ACCOUNT, raw_analysis: {} })
    partners.find.mockResolvedValueOnce([{ relationship: 'partner', placements: 3, dismissed_at: null }])

    const result = await service.matrixFor(ACCOUNT, WORKSPACE)

    expect(result?.penetrability.factors.find(f => f.key === 'partner_in_place')?.signal).toBe('favorable')
  })

  it("filtre account_partners par workspace_id ET account_id — jamais un partenaire d'un autre espace ou d'un autre compte", async () => {
    const { service, accounts, partners } = build()
    accounts.findOne.mockResolvedValue({ id: ACCOUNT, raw_analysis: {} })

    await service.matrixFor(ACCOUNT, WORKSPACE)

    expect(partners.find).toHaveBeenCalledWith({ where: { account_id: ACCOUNT, workspace_id: WORKSPACE } })
  })

  it('aucune écriture — la façade est en LECTURE seule (même discipline que AccountStrategy5PService)', async () => {
    const { service, accounts, contacts, partners } = build()
    accounts.findOne.mockResolvedValue({ id: ACCOUNT, raw_analysis: {} })

    await service.matrixFor(ACCOUNT, WORKSPACE)

    expect(accounts.save).not.toHaveBeenCalled()
    expect(contacts.save).not.toHaveBeenCalled()
    expect(partners.save).not.toHaveBeenCalled()
  })
})

/**
 * #3258.13 (épopée #3362, lot P01) — `portfolioFor` compose `matrixFor`,
 * jamais un second calcul de quadrant (GA-26) : chaque entrée du
 * portefeuille est EXACTEMENT ce que `matrixFor` aurait rendu pour ce
 * compte, appelé un par un.
 */
describe('AccountInterestPenetrabilityService.portfolioFor — la lecture portefeuille (#3258.13)', () => {
  it("porte le quadrant de chaque compte, dans l'ordre reçu", async () => {
    const { service, accounts } = build()
    // `matrixFor` relit le compte deux fois (le sien, puis celui de
    // `AccountStrategy5PService.strategyFor`, même mock de repo) — une
    // valeur PERSISTANTE plutôt qu'une file de deux : ce test vérifie
    // l'assemblage des `accountId`/`companyName` des lookups, pas les
    // données du compte mocké.
    accounts.findOne.mockResolvedValue({ id: 'acc', raw_analysis: {} })

    const result = await service.portfolioFor(
      [
        { id: 'acc-1', company_name: 'Alpha' },
        { id: 'acc-2', company_name: 'Beta' },
      ],
      WORKSPACE,
    )

    expect(result.entries).toHaveLength(2)
    expect(result.entries[0]).toMatchObject({ accountId: 'acc-1', companyName: 'Alpha' })
    expect(result.entries[1]).toMatchObject({ accountId: 'acc-2', companyName: 'Beta' })
    expect(result.totalAccounts).toBe(2)
    expect(result.truncated).toBe(false)
  })

  it("un compte introuvable entre-temps (course avec une suppression) n'ajoute aucune entrée — jamais un quadrant deviné", async () => {
    const { service, accounts } = build()
    accounts.findOne.mockResolvedValueOnce(null)

    const result = await service.portfolioFor([{ id: 'acc-1', company_name: 'Alpha' }], WORKSPACE)

    expect(result.entries).toHaveLength(0)
    expect(result.totalAccounts).toBe(1)
  })

  it('un portefeuille vide rend zéro entrée, zéro total — jamais une erreur', async () => {
    const { service } = build()

    const result = await service.portfolioFor([], WORKSPACE)

    expect(result).toEqual({ entries: [], totalAccounts: 0, truncated: false })
  })

  it('au-delà du plafond, la lecture se coupe et le dit (`truncated`) plutôt que de tout lire', async () => {
    const { service, accounts } = build()
    accounts.findOne.mockResolvedValue({ id: 'acc', raw_analysis: {} })
    const lookups = Array.from({ length: 301 }, (_, i) => ({ id: `acc-${i}`, company_name: `Compte ${i}` }))

    const result = await service.portfolioFor(lookups, WORKSPACE)

    expect(result.entries).toHaveLength(300)
    expect(result.totalAccounts).toBe(301)
    expect(result.truncated).toBe(true)
  })
})
