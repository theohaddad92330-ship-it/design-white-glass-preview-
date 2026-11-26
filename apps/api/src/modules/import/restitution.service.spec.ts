import { ESN_ANSWER_OPTIONS } from '@bellum/contracts'
import { RestitutionService } from './restitution.service'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { ImportSessionEntity } from '../../database/entities/import-session.entity'

/**
 * #2080.3 / .4 / .6 / .7 / .8 — les cinq blocs, et la règle qui les tient tous :
 * « non mesuré » n'est JAMAIS « 0 ».
 *
 * Chaque bloc a donc deux tests jumeaux — un nombre quand la source répond, un
 * `null` quand elle ne répond pas. Un seul des deux ne prouverait rien : c'est
 * précisément le zéro qui ment qu'on cherche à interdire, et il ne se voit que
 * dans le second.
 */

const NOW = new Date('2026-09-16T10:00:00.000Z')

const account = (over: Partial<AccountEntity>): AccountEntity =>
  ({ id: 'a', status: 'imported', relationship_memory: null, siren: null, website: null, ...over }) as AccountEntity

const contact = (over: Partial<ContactEntity>): ContactEntity =>
  ({ id: 'c', email: null, phone: null, ...over }) as ContactEntity

function build(options: {
  accounts?: AccountEntity[]
  contacts?: ContactEntity[]
  session?: Partial<ImportSessionEntity> | null
  agenda?: { listEvents: (userId: string, request: unknown) => Promise<readonly unknown[]> }
  answers?: { getAnswers: (userId: string) => Promise<Record<string, unknown>> }
}) {
  const accountsRepo = { find: jest.fn(async () => options.accounts ?? []) }
  const contactsRepo = { find: jest.fn(async () => options.contacts ?? []) }
  const sessionsRepo = { findOne: jest.fn(async () => options.session ?? null) }
  return new RestitutionService(
    accountsRepo as never,
    contactsRepo as never,
    sessionsRepo as never,
    options.agenda as never,
    options.answers as never,
  )
}

describe('#2080 — la restitution mesure, ou dit qu’elle n’a pas mesuré', () => {
  it('relations : compte les comptes qui portent déjà une mémoire de relation', async () => {
    const service = build({
      accounts: [
        account({ id: '1', relationship_memory: { relation: 'client historique' } }),
        account({ id: '2', relationship_memory: { relation: '   ' } }),
        account({ id: '3', relationship_memory: null }),
        // Un compte archivé n'est plus du portefeuille — ni au numérateur, ni
        // au dénominateur.
        account({ id: '4', status: 'archived', relationship_memory: { relation: 'ancien client' } }),
      ],
    })
    const summary = await service.summary('u', 'w', undefined, NOW)
    expect(summary.relations.value).toBe(1)
    expect(summary.relations.provenance.sources).toEqual(['bellum'])
    expect(summary.relations.provenance.population).toBe(3)
    expect(summary.relations.provenance.computed_at).toBe(NOW.toISOString())
  })

  it('échéances : seules les revues à venir DANS la fenêtre comptent', async () => {
    const service = build({
      accounts: [
        account({ id: '1', relationship_memory: { nextReviewAt: '2026-09-20T09:00:00.000Z' } }),
        // Passée : c'est un retard, pas une prochaine échéance.
        account({ id: '2', relationship_memory: { nextReviewAt: '2026-09-01T09:00:00.000Z' } }),
        // Au-delà de l'horizon.
        account({ id: '3', relationship_memory: { nextReviewAt: '2026-12-01T09:00:00.000Z' } }),
        // Illisible : une chaîne qui n'est pas une date n'en devient pas une.
        account({ id: '4', relationship_memory: { nextReviewAt: 'bientôt' } }),
      ],
    })
    const summary = await service.summary('u', 'w', undefined, NOW)
    expect(summary.upcoming.value).toBe(1)
    expect(summary.upcoming.provenance.window_days).toBe(30)
  })

  it('portefeuille illisible : les deux blocs disent « non mesuré », jamais 0', async () => {
    const service = build({})
    ;(service as unknown as { accounts: { find: jest.Mock } }).accounts.find = jest.fn(async () => {
      throw new Error('base indisponible')
    })
    const summary = await service.summary('u', 'w', undefined, NOW)
    expect(summary.relations.value).toBeNull()
    expect(summary.upcoming.value).toBeNull()
    expect(summary.relations.provenance.sources).toEqual([])
  })

  it('rendez-vous : lit l’agenda de la personne CONNECTÉE, borné à la fenêtre (D58)', async () => {
    const listEvents = jest.fn(async () => [{ id: 'e1' }, { id: 'e2' }])
    const service = build({ agenda: { listEvents } })
    const summary = await service.summary('moi', 'w', undefined, NOW)
    expect(summary.meetings.value).toBe(2)
    expect(summary.meetings.provenance.sources).toEqual(['calendar'])
    // L'identifiant qui traverse est celui de l'appelant, et la fenêtre est
    // celle de l'horizon — aucun agrégat vers un autre membre de l'espace.
    expect(listEvents).toHaveBeenCalledWith('moi', {
      from: NOW.toISOString(),
      to: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      limit: 250,
    })
  })

  it('agenda non branché : « non mesuré », surtout pas « zéro rendez-vous »', async () => {
    const service = build({
      agenda: {
        listEvents: async () => {
          throw new Error('aucun agenda connecté')
        },
      },
    })
    const summary = await service.summary('u', 'w', undefined, NOW)
    expect(summary.meetings.value).toBeNull()
    expect(summary.meetings.provenance.sources).toEqual([])
  })

  it('données manquantes : compte le LOT importé, pas le portefeuille (#2080.7)', async () => {
    const service = build({
      session: {
        id: 's',
        object_type: 'account',
        snapshot: [
          { id: '1', created: true, fields: {} },
          { id: '2', created: true, fields: {} },
          { id: '3', created: false, fields: {} },
        ],
      },
      accounts: [
        account({ id: '1', siren: '123456789' }),
        account({ id: '2', website: 'acme.fr' }),
        // Ni SIREN ni site : ce compte ne se recoupe à aucun registre.
        account({ id: '3' }),
      ],
    })
    const summary = await service.summary('u', 'w', '11111111-1111-1111-1111-111111111111', NOW)
    expect(summary.missing_data.value).toBe(1)
    expect(summary.missing_data.provenance.population).toBe(3)
  })

  it('données manquantes sur des personnes : e-mail OU téléphone suffit', async () => {
    const service = build({
      session: { id: 's', object_type: 'contact', snapshot: [{ id: '1', created: true, fields: {} }] },
      contacts: [contact({ id: '1', phone: null, email: null })],
    })
    const summary = await service.summary('u', 'w', '11111111-1111-1111-1111-111111111111', NOW)
    expect(summary.missing_data.value).toBe(1)
  })

  it('sans lot, « données manquantes » n’est pas zéro — il n’a rien à compter', async () => {
    const service = build({ accounts: [account({ id: '1' })] })
    const summary = await service.summary('u', 'w', undefined, NOW)
    expect(summary.missing_data.value).toBeNull()
    expect(summary.missing_data.provenance.sources).toEqual([])
  })

  it('contradictions : le questionnaire avec LUI-MÊME, par le moteur qui existe', async () => {
    // Le nombre vient des huit détecteurs du contrat, pas d'une règle réécrite
    // ici : une dérivation vit à un seul endroit. On déclenche le premier —
    // « uniquement des freelances » et « zéro consultant en pipe ».
    const service = build({
      answers: {
        getAnswers: async () => ({
          staffing_model: ESN_ANSWER_OPTIONS.staffing_model[4],
          consultants_in_pipe: '0',
        }),
      },
    })
    const summary = await service.summary('u', 'w', undefined, NOW)
    expect(summary.contradictions.value).toBe(1)
    expect(summary.contradictions.provenance.sources).toEqual(['bellum'])
  })

  it('un questionnaire cohérent rend ZÉRO — et ce zéro-là est VRAI', async () => {
    // Le témoin du cas voisin : ici, `0` n'est pas un remplissage, c'est une
    // mesure. C'est ce qui distingue un zéro mesuré d'un `null` non mesuré, et
    // les deux doivent exister pour que la distinction veuille dire quelque
    // chose.
    const service = build({ answers: { getAnswers: async () => ({}) } })
    const summary = await service.summary('u', 'w', undefined, NOW)
    expect(summary.contradictions.value).toBe(0)
    expect(summary.contradictions.provenance.sources).toEqual(['bellum'])
  })

  it('réponses illisibles : « non mesuré », pas « aucune contradiction »', async () => {
    const service = build({
      answers: {
        getAnswers: async () => {
          throw new Error('profil introuvable')
        },
      },
    })
    const summary = await service.summary('u', 'w', undefined, NOW)
    expect(summary.contradictions.value).toBeNull()
    expect(summary.contradictions.provenance.sources).toEqual([])
  })

  it('ports absents : tous les blocs externes sont « non mesuré »', async () => {
    const service = build({})
    const summary = await service.summary('u', 'w', undefined, NOW)
    expect(summary.meetings.value).toBeNull()
    expect(summary.contradictions.value).toBeNull()
  })
})
