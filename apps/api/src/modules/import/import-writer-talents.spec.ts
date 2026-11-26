import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { ProjectEntity } from '../../database/entities/project.entity'
import type { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { ImportWriterService } from './import-writer.service'

/**
 * #2148.25/#2850 (reste, 27/09) — LA REPRISE DU VIVIER (`talent`) ÉCRIT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrairement à `need`, `DEDUP_KEYS.talent` n'était PAS vide
 * (`email`/`phone`/`name+lastEmployer`, déclarées depuis toujours dans le
 * contrat) : la clé de dédup existait déjà, sans aucun appelant qui l'utilise
 * en écriture — le motif exact que le registre des chantiers documente.
 *
 * 1. **Aucune dépendance de compte** — `talent` n'a pas d'entrée dans
 *    `PARENT_OF` : un consultant ou un candidat s'importe sans société.
 * 2. **Dédup par e-mail, puis téléphone** — les deux SEULES clés que
 *    l'écriture indexe contre la base (même restriction que `writeContacts`,
 *    qui ne dédoublonne que par e-mail malgré une seconde clé déclarée) :
 *    une ligne déjà connue REMPLIT les trous, elle n'écrase rien.
 * 3. **`review_status: 'needs_review'`** — la règle que `consultant.entity.ts`
 *    documente lui-même : une fiche née d'une extraction (ici, un import en
 *    masse) n'est jamais rangée sous le défaut `qualified`, réservé aux fiches
 *    saisies à la main.
 * 4. **Un nom vide n'écrit jamais une chaîne vide** — `consultants_full_name_
 *    not_blank` l'interdit ; `full_name` reste `null` plutôt que deviné.
 */

type Ligne = Record<string, unknown>

function monter() {
  const accounts = {} as unknown as Repository<AccountEntity>
  const contacts = {} as unknown as Repository<ContactEntity>
  const projects = {} as unknown as Repository<ProjectEntity>
  const needs = {} as unknown as Repository<ProjectNeedEntity>

  const créés: Ligne[] = []
  const misÀJour: Array<{ where: unknown; values: Ligne }> = []
  const connus: Array<{ id: string; email: string | null; phone: string | null }> = []

  const talents = {
    find: jest.fn(async () => connus),
    create: jest.fn((value: Ligne) => value),
    save: jest.fn(async (value: Ligne) => {
      créés.push(value)
      return { ...value, id: `talent-${créés.length}` }
    }),
    update: jest.fn(async (where: unknown, values: Ligne) => {
      misÀJour.push({ where, values })
      return { affected: 1 }
    }),
  } as unknown as Repository<ConsultantEntity>

  return {
    writer: new ImportWriterService(accounts, contacts, projects, needs, talents),
    créés,
    misÀJour,
    connus,
  }
}

const ÉCRITURE = { workspaceId: 'ws-1', userId: 'user-1', startAt: 0 }

describe('#2148.25/#2850 (reste) — la reprise du vivier écrit, enfin', () => {
  it('crée un talent sans exiger de compte', async () => {
    const { writer, créés } = monter()

    const out = await writer.writeTalents({
      ...ÉCRITURE,
      rows: [{ name: 'Nadia Bensalem', email: 'nadia.bensalem@example.com', phone: '0601020304' }],
    })

    expect(out.created).toBe(1)
    expect(out.skippedUnknownCompany).toBe(0)
    expect(créés[0]).toMatchObject({
      workspace_id: 'ws-1',
      user_id: 'user-1',
      full_name: 'Nadia Bensalem',
      email: 'nadia.bensalem@example.com',
      phone: '0601020304',
      source: 'csv_import',
      review_status: 'needs_review',
    })
  })

  it('ne devine jamais un nom : une ligne sans nom écrit `null`, jamais une chaîne vide', async () => {
    const { writer, créés } = monter()

    await writer.writeTalents({ ...ÉCRITURE, rows: [{ email: 'sans-nom@example.com' }] })

    expect(créés[0]?.['full_name']).toBeNull()
  })

  it('met à jour un talent déjà connu par e-mail — remplit les trous, n’écrase rien', async () => {
    const { writer, misÀJour, connus } = monter()
    connus.push({ id: 'talent-existant', email: 'connu@example.com', phone: null })

    const out = await writer.writeTalents({
      ...ÉCRITURE,
      rows: [{ name: 'Ignoré', email: 'connu@example.com', phone: '0611223344' }],
    })

    expect(out.updated).toBe(1)
    expect(out.created).toBe(0)
    expect(misÀJour[0]?.where).toEqual({ id: 'talent-existant', workspace_id: 'ws-1' })
    expect(misÀJour[0]?.values).toMatchObject({ phone: '0611223344' })
  })

  it('retrouve un talent connu par téléphone quand l’e-mail manque', async () => {
    const { writer, misÀJour, connus } = monter()
    connus.push({ id: 'talent-tel', email: null, phone: '0699887766' })

    const out = await writer.writeTalents({
      ...ÉCRITURE,
      rows: [{ name: 'Retrouvé par téléphone', phone: '0699887766' }],
    })

    expect(out.updated).toBe(1)
    expect(misÀJour[0]?.where).toEqual({ id: 'talent-tel', workspace_id: 'ws-1' })
  })

  it('deux lignes sans e-mail ni téléphone créent deux talents — aucune clé à matcher', async () => {
    const { writer, créés } = monter()

    const out = await writer.writeTalents({
      ...ÉCRITURE,
      rows: [{ name: 'Sans contact A' }, { name: 'Sans contact B' }],
    })

    expect(out.created).toBe(2)
    expect(créés).toHaveLength(2)
  })
})
