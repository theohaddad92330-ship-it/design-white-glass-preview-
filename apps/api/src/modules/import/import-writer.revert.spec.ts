import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { ProjectEntity } from '../../database/entities/project.entity'
import type { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { ImportWriterService } from './import-writer.service'

/**
 * « ANNULER CET IMPORT » DOIT DÉFAIRE CE QUE L'IMPORT A CRÉÉ — POUR CHAQUE OBJET.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MESURÉ EN PRODUCTION LE 11/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Une session « Projets — annulé · 3 créé(s) », et les TROIS projets toujours
 * dans le pipe, avec leur montant. La branche « objet créé » n'archivait que les
 * comptes ; tout le reste tombait dans `leftInPlace`, c'est-à-dire était laissé
 * tel quel. La porte d'écriture s'était élargie aux projets le matin même, celle
 * du retour n'avait pas suivi — une porte plus étroite que son flux.
 *
 * Et le docblock affirmait « ni les contacts ni les projets n'ont d'état
 * d'archive », ce qui était faux : `deleted_at` pour l'un, l'étape `dormant` et
 * l'issue `abandoned` pour l'autre. Un commentaire qui ment se relit comme la
 * règle en vigueur.
 *
 * Ces tests EXÉCUTENT le revert, ils ne lisent pas le fichier : la garde
 * voisine (`rollback-reachable.spec.ts`) lit du texte, et un texte juste n'a
 * jamais prouvé qu'un `UPDATE` partait.
 */
type Updates = Array<{ where: unknown; values: Record<string, unknown> }>

function repoSpy(affected = 1): { repo: Repository<never>; updates: Updates } {
  const updates: Updates = []
  const repo = {
    update: (where: unknown, values: Record<string, unknown>) => {
      updates.push({ where, values })
      return Promise.resolve({ affected })
    },
  } as unknown as Repository<never>
  return { repo, updates }
}

function writerWith(affected = 1) {
  const accounts = repoSpy(affected)
  const contacts = repoSpy(affected)
  const projects = repoSpy(affected)
  const needs = repoSpy(affected)
  const talents = repoSpy(affected)
  const writer = new ImportWriterService(
    accounts.repo as unknown as Repository<AccountEntity>,
    contacts.repo as unknown as Repository<ContactEntity>,
    projects.repo as unknown as Repository<ProjectEntity>,
    needs.repo as unknown as Repository<ProjectNeedEntity>,
    talents.repo as unknown as Repository<ConsultantEntity>,
  )
  return { writer, accounts, contacts, projects, needs, talents }
}

const created = (id: string) => ({ id, created: true, fields: {} })

describe('annulation d’import — un objet CRÉÉ est archivé, quel que soit l’objet', () => {
  it('un PROJET créé sort du pipe : dormant, abandonné, daté', async () => {
    const { writer, projects } = writerWith()

    const outcome = await writer.revert({ object: 'project', snapshot: [created('p-1')], ids: ['p-1'] })

    expect(outcome.archived).toBe(1)
    expect(outcome.leftInPlace).toBe(0)
    expect(projects.updates).toHaveLength(1)
    expect(projects.updates[0]?.where).toEqual({ id: 'p-1' })
    // `abandoned` et non `lost` : personne n'a perdu, l'import a été défait.
    expect(projects.updates[0]?.values).toMatchObject({ stage: 'dormant', outcome: 'abandoned' })
    expect(projects.updates[0]?.values['closed_at']).toBeInstanceOf(Date)
  })

  it('un CONTACT créé prend sa suppression réversible', async () => {
    const { writer, contacts } = writerWith()

    const outcome = await writer.revert({ object: 'contact', snapshot: [created('c-1')], ids: ['c-1'] })

    expect(outcome.archived).toBe(1)
    expect(contacts.updates[0]?.values['deleted_at']).toBeInstanceOf(Date)
  })

  // #4053.9 (recette prod 14/10) — « annulé · 1 créé(s) » et le compte restait listé dans /accounts, sous
  // « À trier », avec « Archiver le compte » grisé : l'annulation ne posait que l'état d'ANALYSE
  // (`status`), pas le tri COMMERCIAL (`commercial_status`) que la liste lit — le geste « Archiver »
  // (`AccountsService.archive`) pose les DEUX. Un compte archivé par l'annulation doit quitter la liste
  // exactement comme s'il l'avait été à la main.
  it('un COMPTE créé est archivé comme le geste « Archiver » : état d’analyse ET tri commercial', async () => {
    const { writer, accounts } = writerWith()

    const outcome = await writer.revert({ object: 'account', snapshot: [created('a-1')], ids: ['a-1'] })

    expect(outcome.archived).toBe(1)
    expect(accounts.updates[0]?.values).toEqual({ status: 'archived', commercial_status: 'archived' })
  })

  /**
   * #2148.25/#2850 — un BESOIN créé prend `archived_at`, la MÊME colonne que
   * le rangement manuel (#2173.49) : `status` ne bouge jamais pour ce geste.
   */
  it('un BESOIN créé prend `archived_at` — jamais son `status`', async () => {
    const { writer, needs } = writerWith()

    const outcome = await writer.revert({ object: 'need', snapshot: [created('n-1')], ids: ['n-1'] })

    expect(outcome.archived).toBe(1)
    expect(needs.updates[0]?.where).toEqual({ id: 'n-1' })
    expect(needs.updates[0]?.values['archived_at']).toBeInstanceOf(Date)
    expect(needs.updates[0]?.values).not.toHaveProperty('status')
  })

  /**
   * #2148.25/#2850 (reste, 27/09) — un TALENT créé prend `archived_at`, la
   * MÊME colonne que `ConsultantsService.archive()` (« sorti du vivier
   * ACTIF, données conservées »). `archived_reason` n'est jamais posé : aucun
   * humain n'a donné de raison, en inventer une romprait un champ texte libre.
   */
  it('un TALENT créé prend `archived_at` — aucune raison inventée', async () => {
    const { writer, talents } = writerWith()

    const outcome = await writer.revert({ object: 'talent', snapshot: [created('t-1')], ids: ['t-1'] })

    expect(outcome.archived).toBe(1)
    expect(talents.updates[0]?.where).toEqual({ id: 't-1' })
    expect(talents.updates[0]?.values['archived_at']).toBeInstanceOf(Date)
    expect(talents.updates[0]?.values).not.toHaveProperty('archived_reason')
  })

  it('rien n’est SUPPRIMÉ : aucune ligne ne disparaît, elle change d’état', async () => {
    const { writer, projects } = writerWith()

    await writer.revert({ object: 'project', snapshot: [created('p-1')], ids: ['p-1'] })

    // Le témoin : si un jour quelqu'un remplace l'archive par un `delete`, ce
    // test reste vert — d'où la garde de texte VOISINE, qui refuse `.delete(`.
    // Ici on vérifie la seule chose qu'un test d'exécution peut prouver : ce
    // qui part vers la base est une MISE À JOUR, avec un état lisible.
    expect(Object.keys(projects.updates[0]?.values ?? {})).toContain('stage')
  })

  it('une ligne qui n’existe plus est COMPTÉE À PART, jamais annoncée archivée', async () => {
    const { writer } = writerWith(0)

    const outcome = await writer.revert({ object: 'project', snapshot: [created('p-1')], ids: ['p-1'] })

    expect(outcome.archived).toBe(0)
    expect(outcome.leftInPlace).toBe(1)
  })

  it('un objet MODIFIÉ retrouve ses valeurs d’avant — la seconde moitié du revert', async () => {
    const { writer, projects } = writerWith()

    const outcome = await writer.revert({
      object: 'project',
      snapshot: [{ id: 'p-2', created: false, fields: { label: 'Avant' } }],
      ids: ['p-2'],
    })

    expect(outcome.restored).toBe(1)
    expect(outcome.archived).toBe(0)
    expect(projects.updates[0]?.values).toEqual({ label: 'Avant' })
  })

  it('ce qui n’est PAS dans le plan n’est pas touché', async () => {
    const { writer, projects } = writerWith()

    const outcome = await writer.revert({ object: 'project', snapshot: [created('p-1')], ids: [] })

    expect(outcome.archived).toBe(0)
    expect(projects.updates).toHaveLength(0)
  })
})
