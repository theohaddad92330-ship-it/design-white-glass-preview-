import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { ProjectEntity } from '../../database/entities/project.entity'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { ImportWriterService } from './import-writer.service'

/**
 * #2079.10 — UNE SEULE DÉRIVATION POUR RÉSOUDRE UNE ENTREPRISE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI DIVERGEAIT, ET CE QUE ÇA COÛTAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * L'écriture d'import comparait deux jeux de clés produits par DEUX chemins :
 *
 *  · la LIGNE du fichier passait par le moteur partagé — `withDedupInputs`
 *    puis `dedupKeyOf` (`@bellum/contracts`), qui fait passer le domaine par
 *    `normaliseDomain` (protocole, `www.`, chemin retirés) ;
 *  · le compte DÉJÀ EN BASE passait par un `accountKeys` local, qui écrivait
 *    `domain:${account.website.toLowerCase()}` — la valeur BRUTE.
 *
 * Un compte dont le site est enregistré « https://www.acme.fr/ » produisait
 * donc la clé `domain:https://www.acme.fr/`, et la ligne qui portait
 * « acme.fr » produisait `domain:acme.fr`. Les deux ne se rencontraient jamais.
 * Conséquence : un SECOND compte créé pour une société déjà suivie, sur le
 * signal le plus fort après le SIREN — exactement le défaut que la doctrine
 * nomme, « deux chemins qui refont la même dérivation divergent toujours ».
 *
 * ⚠️ Ce fichier NE remet PAS en cause #2079.13 (`import-writer-account-merge.spec.ts`),
 * qui garde l'autre bout : une correspondance sur le NOM SEUL contre un compte
 * déjà en base ne fusionne jamais. Unifier la dérivation ne change rien à cette
 * règle — elle porte sur QUELLE clé a matché, pas sur la façon de la calculer.
 */

const WS = 'ws-1'

function makeWriter(existingAccounts: Partial<AccountEntity>[]) {
  let created = 0
  const updateCalls: { criteria: unknown; patch: unknown }[] = []
  const accounts = {
    find: jest.fn(async () => existingAccounts as AccountEntity[]),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: Record<string, unknown>) => {
      created += 1
      return { ...value, id: `new-${created}` }
    }),
    update: jest.fn(async (criteria: unknown, patch: unknown) => {
      updateCalls.push({ criteria, patch })
      return undefined
    }),
  } as unknown as Repository<AccountEntity>
  const contacts = {
    find: jest.fn(async () => []),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: Record<string, unknown>) => ({ ...value, id: 'c-1' })),
    update: jest.fn(async () => undefined),
  } as unknown as Repository<ContactEntity>
  const projects = {
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: Record<string, unknown>) => ({ ...value, id: 'p-1' })),
    update: jest.fn(async () => undefined),
    createQueryBuilder: jest.fn(() => ({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(async () => []),
    })),
  } as unknown as Repository<ProjectEntity>
  const writer = new ImportWriterService(
    accounts,
    contacts,
    projects,
    {} as unknown as Repository<ProjectNeedEntity>,
    {} as unknown as Repository<ConsultantEntity>,
  )
  return { writer, updateCalls, createdCount: () => created }
}

describe('#2079.10 — le compte en base et la ligne du fichier sont résolus PAREIL', () => {
  it('retrouve un compte dont le site est enregistré avec son protocole et son `www.`', async () => {
    const { writer, updateCalls, createdCount } = makeWriter([
      { id: 'existing-acme', company_name: 'Acme Corp', siren: null, website: 'https://www.acme.fr/' },
    ])

    const outcome = await writer.writeAccounts({
      workspaceId: WS,
      userId: 'u-1',
      // Une AUTRE raison sociale, pour que seul le domaine puisse faire la
      // correspondance : si elle passait par le nom, le test ne prouverait rien.
      rows: [{ company: 'Acme Corporation France', domain: 'acme.fr', siren: '123456789' }],
      startAt: 0,
    })

    expect(createdCount()).toBe(0)
    expect(outcome.created).toBe(0)
    expect(outcome.updated).toBe(1)
    expect(updateCalls).toHaveLength(1)
  })

  it('retrouve aussi un compte dont le site est une URL complète avec chemin', async () => {
    const { writer, createdCount } = makeWriter([
      { id: 'existing-beta', company_name: 'Beta SAS', siren: null, website: 'HTTP://Beta.example/contact' },
    ])

    const outcome = await writer.writeAccounts({
      workspaceId: WS,
      userId: 'u-1',
      rows: [{ company: 'Beta Services', domain: 'beta.example', siren: '987654321' }],
      startAt: 0,
    })

    expect(createdCount()).toBe(0)
    expect(outcome.updated).toBe(1)
  })

  it('n’attrape pas ce qu’elle ne vise pas : deux domaines DIFFÉRENTS restent deux comptes', async () => {
    // Le témoin voisin légitime. Normaliser plus fort ne doit pas rapprocher
    // deux sociétés — c'est la même prudence que le refus de fusionner sur le
    // nom seul (#2079.13).
    const { writer, updateCalls, createdCount } = makeWriter([
      { id: 'existing-acme', company_name: 'Acme Corp', siren: null, website: 'https://www.acme.fr/' },
    ])

    const outcome = await writer.writeAccounts({
      workspaceId: WS,
      userId: 'u-1',
      rows: [{ company: 'Acme Belgique', domain: 'acme.be' }],
      startAt: 0,
    })

    expect(updateCalls).toHaveLength(0)
    expect(createdCount()).toBe(1)
    expect(outcome.created).toBe(1)
  })

  it('garde le SIREN prioritaire sur le domaine, comme DEDUP_KEYS l’ordonne', async () => {
    // Deux comptes en base : l'un porte le SIREN de la ligne, l'autre son
    // domaine. La ligne doit atterrir sur le SIREN — sinon l'ordre des clés
    // du moteur ne voudrait plus rien dire côté base.
    const { writer, updateCalls } = makeWriter([
      { id: 'by-domain', company_name: 'Autre', siren: null, website: 'acme.fr' },
      { id: 'by-siren', company_name: 'Acme Corp', siren: '123456789', website: null },
    ])

    await writer.writeAccounts({
      workspaceId: WS,
      userId: 'u-1',
      rows: [{ company: 'Acme Corp', siren: '123456789', domain: 'acme.fr' }],
      startAt: 0,
    })

    expect(updateCalls).toHaveLength(1)
    expect((updateCalls[0]?.criteria as { id: string }).id).toBe('by-siren')
  })
})
