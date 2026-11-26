import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { ProjectEntity } from '../../database/entities/project.entity'
import type { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { ImportWriterService } from './import-writer.service'

/**
 * #2148.25/#2850 — LA REPRISE DES BESOINS ÉCRIT, ENFIN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Avant ce lot, `apply` refusait par son nom : « la reprise des need se simule
 * mais ne s'écrit pas encore » — `ImportWriterService` le disait noir sur
 * blanc dans son propre docblock (« trois objets seulement écrivent »).
 *
 * 1. **Le rattachement au compte** — MÊME porte que `writeProjects` : une
 *    ligne dont la société n'est pas dans l'espace est ÉCARTÉE, jamais
 *    accompagnée d'un compte inventé.
 * 2. **Jamais de mise à jour, jamais de doublon deviné** — `DEDUP_KEYS.need`
 *    est vide PAR CONCEPTION (§7.6) : deux lignes identiques sont deux
 *    besoins. `writeNeeds` ne cherche donc aucun besoin existant.
 * 3. **`title` vide écarte la ligne** — un besoin sans intitulé ne veut rien
 *    dire, comme un projet sans libellé.
 * 4. **`owner_id` reste `null`** — rien dans une ligne de fichier ne dit qui
 *    porte ce besoin.
 */

type Ligne = Record<string, unknown>

function monter(options: { comptes?: { id: string; company_name: string }[] } = {}) {
  const comptes = options.comptes ?? [{ id: 'acc-1', company_name: 'Société Générale' }]

  const accounts = {
    find: jest.fn(async () => comptes),
  } as unknown as Repository<AccountEntity>

  const contacts = {} as unknown as Repository<ContactEntity>
  const projects = {} as unknown as Repository<ProjectEntity>

  const créés: Ligne[] = []
  const needsRepo = {
    create: jest.fn((value: Ligne) => value),
    save: jest.fn(async (value: Ligne) => {
      créés.push(value)
      return { ...value, id: `need-${créés.length}` }
    }),
  } as unknown as Repository<ProjectNeedEntity>

  return {
    writer: new ImportWriterService(
      accounts,
      contacts,
      projects,
      needsRepo,
      {} as unknown as Repository<ConsultantEntity>,
    ),
    créés,
  }
}

const ÉCRITURE = { workspaceId: 'ws-1', userId: 'user-1', startAt: 0 }

describe('#2148.25/#2850 — la reprise des besoins rattache, ou écarte', () => {
  it('crée un besoin sur le compte que le fichier NOMME', async () => {
    const { writer, créés } = monter()

    const out = await writer.writeNeeds({
      ...ÉCRITURE,
      rows: [{ company: 'Société Générale', title: 'Architecte Cloud Senior' }],
    })

    expect(out.created).toBe(1)
    expect(créés[0]).toMatchObject({
      workspace_id: 'ws-1',
      account_id: 'acc-1',
      title: 'Architecte Cloud Senior',
      source: 'csv_import',
      provenance: 'human',
    })
  })

  it('écarte une ligne dont la société n’est pas déjà dans l’espace', async () => {
    const { writer, créés } = monter()

    const out = await writer.writeNeeds({
      ...ÉCRITURE,
      rows: [{ company: 'Entreprise inconnue', title: 'Chef de projet' }],
    })

    expect(out.created).toBe(0)
    expect(out.skippedUnknownCompany).toBe(1)
    expect(créés).toHaveLength(0)
  })

  it('écarte une ligne sans intitulé — un besoin sans titre ne veut rien dire', async () => {
    const { writer, créés } = monter()

    const out = await writer.writeNeeds({
      ...ÉCRITURE,
      rows: [{ company: 'Société Générale', title: '  ' }],
    })

    expect(out.created).toBe(0)
    expect(créés).toHaveLength(0)
  })

  it('ne devine jamais un propriétaire — `owner_id` reste `null`', async () => {
    const { writer, créés } = monter()

    await writer.writeNeeds({ ...ÉCRITURE, rows: [{ company: 'Société Générale', title: 'DevOps' }] })

    expect(créés[0]?.['owner_id']).toBeUndefined()
  })

  /**
   * `DEDUP_KEYS.need` est vide par conception (§7.6) : deux besoins
   * identiques le même jour SONT deux besoins, jamais un doublon à fusionner.
   */
  it('ne dédoublonne JAMAIS — deux lignes identiques créent deux besoins', async () => {
    const { writer, créés } = monter()

    const out = await writer.writeNeeds({
      ...ÉCRITURE,
      rows: [
        { company: 'Société Générale', title: 'Développeur Java' },
        { company: 'Société Générale', title: 'Développeur Java' },
      ],
    })

    expect(out.created).toBe(2)
    expect(créés).toHaveLength(2)
  })
})
