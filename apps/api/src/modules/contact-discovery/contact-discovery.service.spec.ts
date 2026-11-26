/**
 * #2809 (#2293.11, #2294.*) — découverte FRAÎCHE de contacts sur un compte.
 *
 * Vérifie : le devis annonce le coût exact avant tout lancement ; l'exécution
 * appelle l'IA avec les ancres d'organisation du compte (id > domaine >
 * nom) ; les seeds trouvés sont persistés par le chemin de collecte normal
 * (`ContactsService.bulkInsert`, dédup incluse) ; le débit n'a lieu QUE sur
 * un résultat exploitable — un compte sans résultat ne coûte rien.
 */
import { CREDIT_WEIGHTS } from '@bellum/contracts'
import type { AccountEntity } from '../../database/entities/account.entity'
import { ContactDiscoveryService } from './contact-discovery.service'

function account(overrides: Partial<AccountEntity> = {}): AccountEntity {
  return {
    id: 'acc-1',
    company_name: 'ARQUUS',
    website: 'https://www.arquus-defense.com/fr',
    apollo_enrichment: null,
    ...overrides,
  } as AccountEntity
}

describe('ContactDiscoveryService', () => {
  describe('quote', () => {
    it('annonce le coût EXACT (CREDIT_WEIGHTS.contact_discovery par compte) avant tout lancement', () => {
      const service = new ContactDiscoveryService({} as never, {} as never, {} as never)
      const accounts = [account({ id: 'a1', company_name: 'ARQUUS' }), account({ id: 'a2', company_name: 'SNCF' })]

      const quote = service.quote(accounts, 10)

      expect(quote.lines).toEqual([
        { accountId: 'a1', companyName: 'ARQUUS', cost: CREDIT_WEIGHTS.contact_discovery },
        { accountId: 'a2', companyName: 'SNCF', cost: CREDIT_WEIGHTS.contact_discovery },
      ])
      expect(quote.delta).toBe(CREDIT_WEIGHTS.contact_discovery * 2)
      expect(quote.remaining).toBe(10)
      expect(quote.sufficient).toBe(true)
    })

    it('sufficient=false quand le devis dépasse le solde restant', () => {
      const service = new ContactDiscoveryService({} as never, {} as never, {} as never)
      const accounts = Array.from({ length: 5 }, (_, i) => account({ id: `a${i}` }))

      const quote = service.quote(accounts, 1)

      expect(quote.sufficient).toBe(false)
    })

    it('borne le lot à MAX_ACCOUNTS — jamais un devis sans plafond', () => {
      const service = new ContactDiscoveryService({} as never, {} as never, {} as never)
      const accounts = Array.from({ length: ContactDiscoveryService.MAX_ACCOUNTS + 5 }, (_, i) =>
        account({ id: `a${i}` }),
      )

      const quote = service.quote(accounts, 1000)

      expect(quote.lines).toHaveLength(ContactDiscoveryService.MAX_ACCOUNTS)
    })
  })

  describe('run', () => {
    function buildService(opts: { seeds?: unknown[]; status?: string; created?: unknown[]; consumeOk?: boolean }) {
      const ia = { discoverContacts: jest.fn(async () => ({ seeds: opts.seeds ?? [], status: opts.status ?? 'ok' })) }
      const contacts = { bulkInsert: jest.fn(async () => opts.created ?? []) }
      const credits = {
        consumeEnrichmentCredit: jest.fn(async () => ({ ok: opts.consumeOk ?? true, remaining: 9 })),
      }
      const service = new ContactDiscoveryService(contacts as never, credits as never, ia as never)
      return { service, ia, contacts, credits }
    }

    it("transmet les ancres d'organisation du compte dans l'ordre id > domaine > nom", async () => {
      const { service, ia } = buildService({ seeds: [] })
      const acc = account({
        company_name: 'ARQUUS',
        website: 'https://www.arquus-defense.com/fr',
        apollo_enrichment: { organizationId: 'org-1', domain: 'arquus.fr' } as never,
      })

      await service.run(acc, 'user-1', ['RSSI'], false)

      expect(ia.discoverContacts).toHaveBeenCalledWith({
        companyName: 'ARQUUS',
        organizationDomain: 'arquus.fr',
        organizationId: 'org-1',
        titles: ['RSSI'],
      })
    })

    it('sans domaine Apollo persisté, retombe sur le domaine extrait du site du compte', async () => {
      const { service, ia } = buildService({ seeds: [] })
      const acc = account({ website: 'https://www.arquus-defense.com/fr', apollo_enrichment: null })

      await service.run(acc, 'user-1', undefined, false)

      expect(ia.discoverContacts).toHaveBeenCalledWith(
        expect.objectContaining({ organizationDomain: 'arquus-defense.com', organizationId: undefined }),
      )
    })

    it('persiste les seeds trouvés par le chemin de collecte NORMAL (bulkInsert, dédup incluse)', async () => {
      const seeds = [{ fullName: 'Camille Durand', source: 'apollo' }]
      const { service, contacts } = buildService({ seeds, created: seeds })

      const outcome = await service.run(account(), 'user-1', undefined, false)

      expect(contacts.bulkInsert).toHaveBeenCalledWith('acc-1', 'user-1', seeds)
      expect(outcome.found).toBe(1)
      expect(outcome.created).toBe(1)
    })

    it('débite le crédit UNIQUEMENT quand la recherche trouve au moins un résultat exploitable', async () => {
      const { service, credits } = buildService({ seeds: [], status: 'empty' })

      const outcome = await service.run(account(), 'user-1', undefined, false)

      expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
      expect(outcome.cost).toBe(0)
      expect(outcome.status).toBe('empty')
    })

    it('un résultat trouvé débite le coût EXACT annoncé au devis', async () => {
      const seeds = [{ fullName: 'Camille Durand', source: 'apollo' }]
      const { service, credits } = buildService({ seeds, created: seeds })

      const outcome = await service.run(account(), 'user-1', undefined, false)

      expect(credits.consumeEnrichmentCredit).toHaveBeenCalledWith('user-1', {
        reason: 'contact_discovery',
        accountId: 'acc-1',
        cost: CREDIT_WEIGHTS.contact_discovery,
      })
      expect(outcome.cost).toBe(CREDIT_WEIGHTS.contact_discovery)
    })

    it('une course perdue sur le débit garde les contacts déjà créés, coût rendu à 0', async () => {
      const seeds = [{ fullName: 'Camille Durand', source: 'apollo' }]
      const { service, contacts } = buildService({ seeds, created: seeds, consumeOk: false })

      const outcome = await service.run(account(), 'user-1', undefined, false)

      expect(contacts.bulkInsert).toHaveBeenCalled()
      expect(outcome.created).toBe(1)
      expect(outcome.cost).toBe(0)
    })

    it('sans clé fournisseur (status unconfigured), no-op strict — jamais de débit ni de contact inventé', async () => {
      const { service, contacts, credits } = buildService({ seeds: [], status: 'unconfigured' })

      const outcome = await service.run(account(), 'user-1', undefined, false)

      expect(contacts.bulkInsert).not.toHaveBeenCalled()
      expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
      expect(outcome).toEqual({ accountId: 'acc-1', status: 'unconfigured', found: 0, created: 0, cost: 0 })
    })

    it('en espace de démonstration, AUCUN appel réseau — jamais une personne inventée sur une société réelle', async () => {
      const { service, ia, contacts, credits } = buildService({ seeds: [{ fullName: 'Ne devrait jamais être vu' }] })

      const outcome = await service.run(account(), 'user-1', undefined, true)

      expect(ia.discoverContacts).not.toHaveBeenCalled()
      expect(contacts.bulkInsert).not.toHaveBeenCalled()
      expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
      expect(outcome).toEqual({ accountId: 'acc-1', status: 'empty', found: 0, created: 0, cost: 0 })
    })
  })
})
