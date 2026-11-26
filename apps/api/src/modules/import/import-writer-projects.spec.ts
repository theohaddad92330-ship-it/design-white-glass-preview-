import type { Repository } from 'typeorm'
import { dedupKeyOf, withDedupInputs } from '@bellum/contracts'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { ProjectEntity } from '../../database/entities/project.entity'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { ImportWriterService } from './import-writer.service'

/**
 * #1889 — LA REPRISE DES PROJETS ÉCRIT, et elle n'invente rien en chemin.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Avant ce lot, `apply` refusait par son nom : « la reprise des project se
 * simule mais ne s'écrit pas encore ». Le refus était honnête, et il coûtait la
 * moitié du retour — on pouvait préparer un import de projets, voir son rapport,
 * et repartir avec rien.
 *
 * L'écriture branchée, les risques changent de camp. Ce fichier tient les
 * quatre qui comptent, et chacun a déjà été payé ailleurs dans ce dépôt :
 *
 * 1. **Le rattachement au compte** — une ligne dont la société n'est pas dans
 *    l'espace est ÉCARTÉE, jamais accompagnée d'un compte créé au passage.
 * 2. **La nature n'est pas devinée** — `imported`, jamais l'une des cinq
 *    provenances dérivées d'une analyse.
 * 3. **Rien n'est écrasé** — un ré-import remplit les trous et ne touche ni
 *    l'étape, ni le libellé, ni ce qu'un commercial a saisi depuis.
 * 4. **« Non mesuré » n'est jamais « 0 »** — un montant illisible reste `null`,
 *    et le pipe valorisé ne le somme pas.
 */

type Ligne = Record<string, unknown>

function monter(options: { comptes?: { id: string; company_name: string }[]; projets?: ProjetEnBase[] } = {}) {
  const comptes = options.comptes ?? [{ id: 'acc-1', company_name: 'Société Générale' }]
  const projets = options.projets ?? []

  const accounts = {
    find: jest.fn(async () => comptes),
  } as unknown as Repository<AccountEntity>

  const contacts = {} as unknown as Repository<ContactEntity>

  const créés: Ligne[] = []
  const misÀJour: { id: string; patch: Ligne }[] = []
  const projectsRepo = {
    create: jest.fn((value: Ligne) => value),
    save: jest.fn(async (value: Ligne) => {
      créés.push(value)
      return { ...value, id: `proj-${créés.length}` }
    }),
    update: jest.fn(async (where: { id: string }, patch: Ligne) => {
      misÀJour.push({ id: where.id, patch })
      return undefined
    }),
    findOne: jest.fn(async ({ where }: { where: { id: string } }) => projets.find(p => p.id === where.id) ?? null),
    createQueryBuilder: jest.fn(() => ({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(async () => projets.map(p => ({ id: p.id, label: p.label, company_name: p.company_name }))),
    })),
  } as unknown as Repository<ProjectEntity>

  return {
    writer: new ImportWriterService(
      accounts,
      contacts,
      projectsRepo,
      {} as unknown as Repository<ProjectNeedEntity>,
      {} as unknown as Repository<ConsultantEntity>,
    ),
    créés,
    misÀJour,
  }
}

type ProjetEnBase = {
  id: string
  label: string
  company_name: string
  detail: string | null
  amount_cents: string | null
  expected_close_on: string | null
}

const ÉCRITURE = { workspaceId: 'ws-1', userId: 'user-1', startAt: 0 }

describe('#1889 — la reprise des projets rattache, ou écarte', () => {
  it('crée un projet sur le compte que le fichier NOMME', async () => {
    const { writer, créés } = monter()
    const out = await writer.writeProjects({
      ...ÉCRITURE,
      rows: [{ company: 'Société Générale', label: 'Refonte du socle data' }],
    })
    expect(out.created).toBe(1)
    expect(créés[0]).toMatchObject({ account_id: 'acc-1', label: 'Refonte du socle data', workspace_id: 'ws-1' })
  })

  it('rapproche la société malgré la casse, les accents et la forme juridique', async () => {
    // La normalisation est la SEULE chose qui fasse se rencontrer « SG SOCIETE
    // GENERALE » et « Société Générale ». Sans elle, le rapprochement échoue
    // sans jamais rien dire — le défaut « jointure par nom » déjà payé ici.
    const { writer, créés } = monter()
    const out = await writer.writeProjects({
      ...ÉCRITURE,
      rows: [{ company: 'SOCIETE GENERALE SA', label: 'Cyber 2027' }],
    })
    expect(out.created).toBe(1)
    expect(créés[0]).toMatchObject({ account_id: 'acc-1' })
  })

  it('ÉCARTE la ligne dont la société est inconnue, et ne crée AUCUN compte', async () => {
    const { writer, créés } = monter()
    const out = await writer.writeProjects({
      ...ÉCRITURE,
      rows: [{ company: 'Entreprise Absente', label: 'Un projet' }],
    })
    expect(out).toMatchObject({ created: 0, skippedUnknownCompany: 1 })
    expect(créés).toEqual([])
  })

  it('ignore une ligne sans libellé — un projet sans nom n’est pas un projet', async () => {
    const { writer, créés } = monter()
    const out = await writer.writeProjects({ ...ÉCRITURE, rows: [{ company: 'Société Générale', label: '  ' }] })
    expect(out).toMatchObject({ created: 0, skippedUnknownCompany: 0 })
    expect(créés).toEqual([])
  })
})

describe('#1889 — ce que la reprise n’invente pas', () => {
  it('pose `imported`, jamais l’une des cinq natures dérivées d’une analyse', async () => {
    const { writer, créés } = monter()
    await writer.writeProjects({ ...ÉCRITURE, rows: [{ company: 'Société Générale', label: 'Socle data' }] })
    expect(créés[0]).toMatchObject({ kind: 'imported', source: 'import' })
  })

  it('garde l’étape du fichier quand c’est l’UNE DES NÔTRES', async () => {
    const { writer, créés } = monter()
    await writer.writeProjects({
      ...ÉCRITURE,
      rows: [{ company: 'Société Générale', label: 'Socle data', stage: 'negotiation' }],
    })
    expect(créés[0]).toMatchObject({ stage: 'negotiation' })
  })

  it('⚠️ ne DEVINE pas une étape à partir d’un vocabulaire étranger', async () => {
    // « Négociation » de l'ancien outil n'est pas notre `negotiation` : les
    // libellés d'étape se renomment par espace, et rapprocher deux vocabulaires
    // par ressemblance est la devinette que ce dépôt refuse partout.
    const { writer, créés } = monter()
    await writer.writeProjects({
      ...ÉCRITURE,
      rows: [
        { company: 'Société Générale', label: 'A', stage: 'Négociation' },
        { company: 'Société Générale', label: 'B', stage: 'Closed Won' },
        { company: 'Société Générale', label: 'C' },
      ],
    })
    for (const créé of créés) expect(créé).toMatchObject({ stage: 'detected' })
  })

  it('⚠️ le montant arrive DÉJÀ en centimes — il ne se remultiplie pas', async () => {
    // MESURÉ EN PRODUCTION le 11/09 : « 180000 » dans le fichier a écrit
    // 1 800 000 000 centimes — 18 M€ pour une affaire à 180 k€. La ligne qui
    // arrive ici est normalisée : `applyNormalisation` a déjà fait tourner
    // `normaliseAmountCents`. Multiplier une seconde fois était une deuxième
    // dérivation du même calcul.
    const { writer, créés } = monter()
    await writer.writeProjects({
      ...ÉCRITURE,
      rows: [{ company: 'Société Générale', label: 'Chiffré', amount: 18_000_000 }],
    })
    expect(créés[0]).toMatchObject({ amount_cents: '18000000', currency: 'EUR' })
  })

  it('convertit une CHAÎNE avec la fonction du moteur — la règle a pu être désactivée', async () => {
    // `disabledRules` peut retirer `amount_cents` : la valeur arrive alors
    // brute. On appelle la MÊME fonction que le moteur, jamais une conversion
    // réécrite ici — c'est ce doublon qui a produit le facteur 100.
    const { writer, créés } = monter()
    await writer.writeProjects({
      ...ÉCRITURE,
      rows: [{ company: 'Société Générale', label: 'Brut', amount: '180 000,50 €' }],
    })
    expect(créés[0]).toMatchObject({ amount_cents: '18000050' })
  })

  it('n’écrit aucun montant quand il est illisible, vide ou nul — « non mesuré » n’est jamais « 0 »', async () => {
    const { writer, créés } = monter()
    await writer.writeProjects({
      ...ÉCRITURE,
      rows: [
        { company: 'Société Générale', label: 'Illisible', amount: 'à définir' },
        { company: 'Société Générale', label: 'Vide' },
        { company: 'Société Générale', label: 'Zéro', amount: 0 },
        { company: 'Société Générale', label: 'Négatif', amount: -500 },
      ],
    })
    for (const sans of créés) expect(sans).toMatchObject({ amount_cents: null, currency: null })
  })

  it('ne pose la clôture espérée que sur une date ISO', async () => {
    const { writer, créés } = monter()
    await writer.writeProjects({
      ...ÉCRITURE,
      rows: [
        { company: 'Société Générale', label: 'Datée', endDate: '2026-12-31' },
        { company: 'Société Générale', label: 'Floue', endDate: 'fin d’année' },
      ],
    })
    expect(créés[0]).toMatchObject({ expected_close_on: '2026-12-31' })
    expect(créés[1]).toMatchObject({ expected_close_on: null })
  })
})

describe('#1889 — un ré-import ne piétine rien', () => {
  const déjàLà: ProjetEnBase = {
    id: 'proj-existant',
    label: 'Refonte du socle data',
    company_name: 'Société Générale',
    detail: null,
    amount_cents: '5000000',
    expected_close_on: null,
  }

  it('reconnaît la MÊME ligne et ne crée pas de doublon à l’écran', async () => {
    const { writer, créés, misÀJour } = monter({ projets: [déjàLà] })
    const out = await writer.writeProjects({
      ...ÉCRITURE,
      rows: [{ company: 'Société Générale', label: 'Refonte du socle data', detail: 'Reprise du socle' }],
    })
    expect(out).toMatchObject({ created: 0, updated: 1 })
    expect(créés).toEqual([])
    expect(misÀJour[0]).toMatchObject({ id: 'proj-existant', patch: { detail: 'Reprise du socle' } })
  })

  it('ne remplit QUE les trous — un montant déjà saisi n’est jamais remplacé', async () => {
    const { writer, misÀJour } = monter({ projets: [déjàLà] })
    await writer.writeProjects({
      ...ÉCRITURE,
      rows: [{ company: 'Société Générale', label: 'Refonte du socle data', amount: 999_999, detail: 'x' }],
    })
    expect(misÀJour[0]?.patch).not.toHaveProperty('amount_cents')
  })

  it('ne touche NI l’étape NI le libellé, même si le fichier en porte d’autres', async () => {
    const { writer, misÀJour } = monter({ projets: [déjàLà] })
    await writer.writeProjects({
      ...ÉCRITURE,
      rows: [{ company: 'Société Générale', label: 'Refonte du socle data', stage: 'won', detail: 'x' }],
    })
    expect(misÀJour[0]?.patch).not.toHaveProperty('stage')
    expect(misÀJour[0]?.patch).not.toHaveProperty('label')
  })

  it('n’écrit RIEN quand il n’y a aucun trou à remplir', async () => {
    const { writer, misÀJour } = monter({ projets: [{ ...déjàLà, detail: 'déjà', expected_close_on: '2026-01-01' }] })
    const out = await writer.writeProjects({
      ...ÉCRITURE,
      rows: [{ company: 'Société Générale', label: 'Refonte du socle data', detail: 'autre chose' }],
    })
    expect(out).toMatchObject({ created: 0, updated: 0 })
    expect(misÀJour).toEqual([])
  })

  it('garde l’INSTANTANÉ de ce qu’il remplace — sans lui, l’annulation ment', async () => {
    const { writer } = monter({ projets: [déjàLà] })
    const out = await writer.writeProjects({
      ...ÉCRITURE,
      rows: [{ company: 'Société Générale', label: 'Refonte du socle data', detail: 'Reprise' }],
    })
    expect(out.snapshot[0]).toMatchObject({
      id: 'proj-existant',
      created: false,
      fields: { detail: null, amount_cents: '5000000', expected_close_on: null },
    })
  })
})

describe('#1889 — la simulation et l’écriture se rencontrent', () => {
  it('la clé lue en base a la MÊME forme que celle dérivée du fichier', async () => {
    // Le défaut qui ne se voit pas : deux dérivations de la même clé finissent
    // par différer, et le rapport annonce alors des créations là où l'écriture
    // fera des mises à jour. Ici, les deux passent par `dedupKeyOf`.
    const { writer } = monter({
      projets: [{ ...{ id: 'p1', label: 'Socle data', company_name: 'Société Générale' } } as ProjetEnBase],
    })
    const enBase = await writer.existingKeys('ws-1', 'project')
    const duFichier = dedupKeyOf(
      'project',
      withDedupInputs('project', { company: 'SOCIETE GENERALE', label: 'Socle data' }),
    )
    expect(duFichier).not.toBeNull()
    expect(enBase[duFichier as string]).toBe('p1')
  })
})
