import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { ProjectEntity } from '../../database/entities/project.entity'
import type { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import type { TargetListEntity } from '../../database/entities/target-list.entity'
import type { TargetListItemEntity } from '../../database/entities/target-list-item.entity'
import { ImportTargetListWriter } from './import-target-list.writer'
import { ImportWriterService } from './import-writer.service'

/**
 * #3753 — un fichier de comptes DÉJÀ tiérés devient une liste cible.
 *
 *  · tier A/B/C → `priority` high/medium/low ET la lettre gardée (`tier_label`) ;
 *  · raison → `selection_reason`, problématiques/projets → `seller_hypotheses` ;
 *  · dédoublonnage par domaine : la ligne se RATTACHE au compte existant (lien,
 *    jamais fusion) ; même nom + autre domaine = quasi-doublon PROPOSÉ ;
 *  · AUCUNE analyse lancée à l'import (aucun débit de crédits).
 */

const WS = 'ws-1'

function makeWriter(existingAccounts: Partial<AccountEntity>[], existingItems: Partial<TargetListItemEntity>[] = []) {
  let created = 0
  const accounts = {
    find: jest.fn(async () => existingAccounts as AccountEntity[]),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: Record<string, unknown>) => {
      created += 1
      return { ...value, id: `new-${created}` }
    }),
    update: jest.fn(async () => undefined),
  } as unknown as Repository<AccountEntity>
  const savedItems: Record<string, unknown>[] = []
  const lists = {
    findOne: jest.fn(async () => null),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: Record<string, unknown>) => ({ ...value, id: 'list-1' })),
  } as unknown as Repository<TargetListEntity>
  const items = {
    find: jest.fn(async () => existingItems as TargetListItemEntity[]),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: Record<string, unknown>) => {
      savedItems.push(value)
      return value
    }),
  } as unknown as Repository<TargetListItemEntity>
  const writer = new ImportWriterService(
    accounts,
    {} as unknown as Repository<ContactEntity>,
    {} as unknown as Repository<ProjectEntity>,
    {} as unknown as Repository<ProjectNeedEntity>,
    {} as unknown as Repository<ConsultantEntity>,
    undefined,
    new ImportTargetListWriter(lists, items),
  )
  return { writer, accounts, lists, savedItems }
}

const base = { workspaceId: WS, userId: 'u1', startAt: 0 }

describe('#3753 — import de comptes tiérés → liste cible', () => {
  it('tier A/B/C → priority + lettre gardée ; raison et hypothèses conservées, provenance « import »', async () => {
    const { writer, savedItems, lists } = makeWriter([])
    const outcome = await writer.writeAccounts({
      ...base,
      targetList: { name: 'Tiering 2026' },
      rows: [
        {
          company: 'Alpha',
          domain: 'alpha.fr',
          tier: 'A',
          selection_reason: 'Plan de transformation SI',
          addressable_issues: 'Dette applicative',
          upcoming_it_projects: 'Migration ERP 2027',
        },
        { company: 'Beta', domain: 'beta.fr', tier: 'Tier b' },
        { company: 'Gamma', domain: 'gamma.fr', tier: 'C' },
        { company: 'Delta', domain: 'delta.fr' },
      ],
    })

    expect(lists.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Tiering 2026', source: 'import' }))
    expect(savedItems.map(i => [i.tier_label, i.priority])).toEqual([
      ['A', 'high'],
      ['B', 'medium'],
      ['C', 'low'],
      [null, null], // absence de tier : ni lettre ni priorité devinées
    ])
    expect(savedItems[0]).toMatchObject({
      selection_reason: 'Plan de transformation SI',
      seller_hypotheses: { addressable_issues: 'Dette applicative', upcoming_it_projects: 'Migration ERP 2027' },
      provenance: 'import',
      account_id: 'new-1',
    })
    expect(savedItems[3]!['seller_hypotheses']).toBeNull()
    expect(outcome.targetList).toMatchObject({ id: 'list-1', added: 4 })
  })

  it('un domaine déjà connu RATTACHE la ligne au compte existant : aucun compte créé, aucune fusion', async () => {
    const { writer, savedItems, accounts } = makeWriter([
      { id: 'acc-existing', company_name: 'Alpha SA', siren: null, website: 'https://www.alpha.fr/' },
    ])
    const outcome = await writer.writeAccounts({
      ...base,
      targetList: { name: 'Tiering' },
      rows: [{ company: 'Alpha', domain: 'alpha.fr', tier: 'A' }],
    })

    expect(accounts.save).not.toHaveBeenCalled()
    expect(savedItems[0]).toMatchObject({ account_id: 'acc-existing', tier_label: 'A' })
    expect(outcome.targetList).toMatchObject({ added: 1, attachedToExisting: 1 })
  })

  it('même nom, autre domaine : un compte propre, et un quasi-doublon PROPOSÉ (jamais fusionné)', async () => {
    const { writer, accounts, savedItems } = makeWriter([
      { id: 'acc-existing', company_name: 'Alpha', siren: null, website: 'alpha.com' },
    ])
    const outcome = await writer.writeAccounts({
      ...base,
      targetList: { name: 'Tiering' },
      rows: [{ company: 'Alpha', domain: 'alpha-groupe.fr', tier: 'B' }],
    })

    expect(accounts.save).toHaveBeenCalledTimes(1)
    expect(savedItems[0]).toMatchObject({ account_id: 'new-1' })
    expect(outcome.targetList?.nearDuplicates).toEqual([
      { company: 'Alpha', existingAccountId: 'acc-existing', newAccountId: 'new-1' },
    ])
  })

  it('ne lance AUCUNE analyse : le seul chemin d’écriture est le compte (status « imported ») et l’élément', async () => {
    const { writer, accounts } = makeWriter([])
    await writer.writeAccounts({
      ...base,
      targetList: { name: 'Tiering' },
      rows: [{ company: 'Alpha', domain: 'alpha.fr', tier: 'A' }],
    })
    expect(accounts.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'imported' }))
  })

  it('sans demande de liste, rien n’est créé : le chemin d’avant est inchangé', async () => {
    const { writer, lists, savedItems } = makeWriter([])
    const outcome = await writer.writeAccounts({ ...base, rows: [{ company: 'Alpha', tier: 'A' }] })
    expect(lists.save).not.toHaveBeenCalled()
    expect(savedItems).toEqual([])
    expect(outcome.targetList).toBeUndefined()
  })

  it('ne remet pas deux fois le même compte dans la liste (reprise, doublon dans le fichier)', async () => {
    const { writer, savedItems } = makeWriter([])
    await writer.writeAccounts({
      ...base,
      targetList: { name: 'Tiering' },
      rows: [
        { company: 'Alpha', domain: 'alpha.fr', tier: 'A' },
        { company: 'Alpha', domain: 'alpha.fr', tier: 'A' },
      ],
    })
    expect(savedItems).toHaveLength(1)
  })
})
