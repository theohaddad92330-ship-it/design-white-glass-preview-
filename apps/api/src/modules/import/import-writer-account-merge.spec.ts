import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { ProjectEntity } from '../../database/entities/project.entity'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { ImportWriterService } from './import-writer.service'

/**
 * #2079.13 — AUCUNE fusion sur le nom seul.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DOCTRINE, ET LE TROU QU'ELLE FERMAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * « On PROPOSE une fusion de doublons, on ne fusionne JAMAIS — irréversible côté
 * CRM, un faux positif détruit l'historique d'un vrai client. Deux homonymes
 * chez deux sociétés différentes ne sont pas rapprochés. »
 *
 * `DEDUP_KEYS.account` porte trois clés dans l'ORDRE `siren → domain →
 * normalizedName` : la troisième est un repli, pour que deux lignes du MÊME
 * fichier parlant de la même société (mais sans SIREN ni domaine) se
 * consolident en un seul compte plutôt qu'un par ligne — c'est nécessaire, ou
 * une importation de 50 contacts d'« Acme Corp » poserait 50 comptes « Acme
 * Corp ».
 *
 * Mais ce même repli, appliqué à un compte DÉJÀ EN BASE, fusionnait en silence
 * n'importe quel « Acme Corp » du fichier dans le PREMIER « Acme Corp » de
 * l'espace — deux clients homonymes, deux SIRET différents, réunis sous un
 * identifiant unique parce qu'aucun des deux n'avait de SIREN ni de domaine
 * dans ce fichier précis. C'est exactement le faux positif que la doctrine
 * refuse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUE CE FICHIER TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 *  · Une correspondance SIREN ou DOMAINE (signal fort, quasi jamais partagé par
 *    deux entreprises distinctes) continue d'autoriser la mise à jour.
 *  · Une correspondance NOM SEUL contre un compte déjà présent en base
 *    n'écrit JAMAIS dans ce compte : la ligne crée un nouveau compte, que le
 *    mécanisme de proposition de doublons (#2079.3, déjà là) signalera —
 *    proposé, jamais imposé.
 *  · Une correspondance NOM SEUL contre un compte créé PENDANT CETTE MÊME
 *    passe continue de consolider — ce n'est pas une fusion avec un tiers
 *    inconnu, c'est la même ligne de fichier revue deux fois.
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
  return { writer, accounts, updateCalls, createdCount: () => created }
}

describe('#2079.13 — aucune fusion sur le nom seul', () => {
  it('NE fusionne PAS un compte du fichier dans un compte déjà en base qui ne partage que le nom', async () => {
    const { writer, updateCalls, createdCount } = makeWriter([
      { id: 'existing-acme', company_name: 'Acme Corp', siren: null, website: null },
    ])

    const outcome = await writer.writeAccounts({
      workspaceId: WS,
      userId: 'u-1',
      rows: [{ company: 'Acme Corp' }],
      startAt: 0,
    })

    // Aucune écriture dans le compte déjà présent.
    expect(updateCalls).toHaveLength(0)
    // La ligne devient un NOUVEAU compte — jamais fusionnée sans preuve.
    expect(createdCount()).toBe(1)
    expect(outcome.created).toBe(1)
    expect(outcome.updated).toBe(0)
  })

  it('refuse ENCORE quand la ligne porte un SIREN et RETOMBE sur le nom (#2079.10)', async () => {
    // Le risque que #2079.10 introduit, et qu'il faut tenir : depuis
    // l'unification, la ligne essaie ses clés DANS L'ORDRE au lieu de n'en
    // essayer qu'une. Une ligne qui porte un SIREN inconnu de la base ne
    // s'arrête donc plus là — elle continue vers le domaine, puis vers le nom.
    // C'est exactement la porte que #2079.13 ferme, et elle doit rester fermée :
    // « Acme Corp » du fichier, avec SON SIREN, n'est pas « Acme Corp » de la
    // base, qui n'en a aucun. Deux homonymes ne se rapprochent pas.
    const { writer, updateCalls, createdCount } = makeWriter([
      { id: 'existing-acme', company_name: 'Acme Corp', siren: null, website: null },
    ])

    const outcome = await writer.writeAccounts({
      workspaceId: WS,
      userId: 'u-1',
      rows: [{ company: 'Acme Corp', siren: '123456789' }],
      startAt: 0,
    })

    expect(updateCalls).toHaveLength(0)
    expect(createdCount()).toBe(1)
    expect(outcome.created).toBe(1)
    expect(outcome.updated).toBe(0)
  })

  it('témoin — une correspondance SIREN continue d’autoriser la mise à jour', async () => {
    const { writer, updateCalls, createdCount } = makeWriter([
      { id: 'existing-acme', company_name: 'Acme Corp', siren: '123456789', website: null },
    ])

    const outcome = await writer.writeAccounts({
      workspaceId: WS,
      userId: 'u-1',
      rows: [{ company: 'Acme Corp', siren: '123456789', domain: 'acme-updated.example' }],
      startAt: 0,
    })

    expect(createdCount()).toBe(0)
    expect(updateCalls).toHaveLength(1)
    expect(outcome.updated).toBe(1)
    expect(outcome.created).toBe(0)
  })

  it('témoin — deux lignes du MÊME fichier pour la même société (sans SIREN ni domaine) se consolident toujours en un seul compte', async () => {
    const { writer, createdCount } = makeWriter([])

    const outcome = await writer.writeAccounts({
      workspaceId: WS,
      userId: 'u-1',
      rows: [{ company: 'Nouvelle SARL' }, { company: 'Nouvelle SARL' }],
      startAt: 0,
    })

    // Une seule création : la seconde ligne retrouve le compte que la
    // première, DANS CETTE MÊME PASSE, vient de créer — ce n'est pas une
    // fusion avec un tiers inconnu, c'est la même ligne de fichier revue
    // deux fois. Le garde-fou ne s'applique qu'aux comptes déjà en base.
    expect(createdCount()).toBe(1)
    expect(outcome.created).toBe(1)
  })
})

describe('#4053.3 — secteur, effectif et ville du fichier arrivent sur le COMPTE', () => {
  it('un compte créé reçoit secteur, effectif et siège de sa ligne', async () => {
    const { writer, accounts } = makeWriter([])
    await writer.writeAccounts({
      workspaceId: WS,
      userId: 'u-1',
      rows: [{ company: 'Nova SA', sector: 'Services numériques', employees: '250', headquarters: 'Lyon' }],
      startAt: 0,
    })
    expect(accounts.create).toHaveBeenCalledWith(
      expect.objectContaining({ sector: 'Services numériques', employees: '250', headquarters: 'Lyon' }),
    )
  })

  it('un compte reconnu par son SIREN ne reçoit que ce qui lui MANQUE, et l’annulation peut le restaurer', async () => {
    const { writer, updateCalls } = makeWriter([
      {
        id: 'a-1',
        company_name: 'Nova SA',
        siren: '123456789',
        website: null,
        sector: 'Conseil',
        employees: null,
        headquarters: null,
      },
    ])
    const outcome = await writer.writeAccounts({
      workspaceId: WS,
      userId: 'u-1',
      rows: [{ company: 'Nova SA', siren: '123456789', sector: 'Autre', employees: '250', headquarters: 'Lyon' }],
      startAt: 0,
    })
    // Le secteur déjà renseigné n'est JAMAIS écrasé ; l'effectif et la ville, vides, se remplissent.
    expect(updateCalls[0]?.patch).toEqual({ employees: '250', headquarters: 'Lyon' })
    expect(outcome.updated).toBe(1)
    expect(outcome.snapshot[0]).toMatchObject({
      id: 'a-1',
      created: false,
      fields: { employees: null, headquarters: null },
    })
  })
})
