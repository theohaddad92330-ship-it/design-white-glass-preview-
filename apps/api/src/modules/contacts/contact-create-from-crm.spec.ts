import { ContactsService } from './contacts.service'

/**
 * #1995 — CRÉER LA FICHE D'UNE PERSONNE QUE SEUL LE CRM CONNECTÉ CONNAÎT.
 *
 * Mesuré en production le 14/09/2026 : Sandrine Pata est citée par le CRM
 * connecté sur THALES, le compte porte 2 027 fiches Bellum, aucune « Pata ».
 * Laura annonçait « fiche Bellum absente » puis renvoyait vers une fiche qui
 * n'existe pas, et le rappel restait impossible (il exige un `contact_id`).
 *
 * CE QUE CES TESTS SAVENT DIRE NON :
 *   1. un doublon par E-MAIL n'est jamais créé en double ;
 *   2. un doublon par NOM (casse ET accents pliés — le MÊME critère que
 *      `resolveCrmContactToBellum`) non plus ;
 *   3. une AMBIGUÏTÉ (deux fiches répondent) ne crée rien et ne fusionne rien :
 *      « on PROPOSE une fusion de doublons, on ne fusionne JAMAIS » ;
 *   4. une création écrit une provenance `connector`, pas `'manual'` brut —
 *      sinon la première correction humaine ne survivrait à aucun import.
 */
describe('#1995 — ContactsService.createFromCrmPresence', () => {
  const ACCOUNT = 'acc-1'
  const USER = 'u-1'

  function build(existing: { id: string; full_name: string | null; email: string | null }[]) {
    const saved: Record<string, unknown>[] = []
    const contacts = {
      find: jest.fn().mockResolvedValue(existing),
      create: jest.fn((row: Record<string, unknown>) => row),
      save: jest.fn(async (row: Record<string, unknown>) => {
        saved.push(row)
        return { ...row, id: 'new-1' }
      }),
    }
    const lifecycleTransitions = { insert: jest.fn().mockResolvedValue(undefined) }
    const provenance = { commit: jest.fn().mockResolvedValue(undefined) }
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
    // #2309.16/.19 — le journal des candidats jamais devenus une fiche.
    const intakeExclusions = { insert: jest.fn().mockResolvedValue(undefined) }
    // Les quatorze autres dépendances ne sont pas touchées par ce chemin : il
    // lit les fiches du compte, en écrit une, journalise et pose la provenance.
    const service = new ContactsService(
      contacts as never,
      {} as never,
      {} as never,
      {} as never,
      workspaceContext as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      lifecycleTransitions as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      provenance as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      intakeExclusions as never,
    )
    return { service, contacts, provenance, intakeExclusions, saved }
  }

  it('crée la fiche, l’estampille `crm` et écrit une provenance `connector`', async () => {
    const { service, contacts, provenance, saved } = build([])
    const result = await service.createFromCrmPresence(ACCOUNT, USER, {
      full_name: 'Sandrine Pata',
      title: 'Directrice des achats',
      email: 'sandrine.pata@example.com',
      crm_reference: 'crm-42',
    })
    expect(result).toEqual({ status: 'created', contact_id: 'new-1' })
    expect(saved[0]).toMatchObject({
      account_id: ACCOUNT,
      user_id: USER,
      workspace_id: 'ws-1',
      full_name: 'Sandrine Pata',
      source: 'crm',
      raw_data: { crm_reference: 'crm-42' },
    })
    // `connector` place l'écriture SOUS `human` dans l'arbitre : une correction
    // faite à la main survivra à tous les imports suivants.
    expect(provenance.commit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'contact', entityId: 'new-1', source: 'connector', actorId: USER }),
    )
    expect(contacts.save).toHaveBeenCalledTimes(1)
  })

  /**
   * #2861 (#2437.2, niveau ESPACE) — la langue du marché de l'espace sert de
   * DÉFAUT au contact créé, jamais posée sur une fiche déjà là (ces tests-ci
   * ne créent rien de nouveau, voir les cas « doublon »/« ambigu » plus bas).
   */
  it('#2861 — pose la langue de l’espace comme défaut du contact créé', async () => {
    const { saved, service } = build([])
    await service.createFromCrmPresence(
      ACCOUNT,
      USER,
      { full_name: 'Sandrine Pata', email: 'sandrine.pata@example.com' },
      'de',
    )
    expect(saved[0]).toMatchObject({ locale: 'de' })
  })

  it('#2861 — sans langue résolue (service optionnel absent), `locale` reste `null`', async () => {
    const { saved, service } = build([])
    await service.createFromCrmPresence(ACCOUNT, USER, { full_name: 'Sandrine Pata' })
    expect(saved[0]).toMatchObject({ locale: null })
  })

  it('SAIT DIRE NON — un doublon par e-mail ne crée rien et rend la fiche existante', async () => {
    const { service, contacts, intakeExclusions } = build([
      { id: 'c-9', full_name: 'S. Pata', email: 'Sandrine.Pata@Example.com' },
    ])
    const result = await service.createFromCrmPresence(ACCOUNT, USER, {
      full_name: 'Sandrine Pata',
      email: 'sandrine.pata@example.com',
    })
    expect(result).toEqual({ status: 'duplicate', contact_id: 'c-9' })
    expect(contacts.save).not.toHaveBeenCalled()
    // #2309.19 — ce candidat ne deviendra JAMAIS une fiche : le funnel de
    // couverture doit pouvoir le compter.
    expect(intakeExclusions.insert).toHaveBeenCalledWith([
      { workspace_id: 'ws-1', account_id: ACCOUNT, reason: 'duplicate_identity' },
    ])
  })

  it('SAIT DIRE NON — un doublon par NOM, accents et casse pliés, ne crée rien', async () => {
    const { service, contacts } = build([{ id: 'c-7', full_name: 'sandrine pàta', email: null }])
    const result = await service.createFromCrmPresence(ACCOUNT, USER, { full_name: 'Sandrine Pata' })
    expect(result).toEqual({ status: 'duplicate', contact_id: 'c-7' })
    expect(contacts.save).not.toHaveBeenCalled()
  })

  it('SAIT DIRE NON — deux fiches répondent : on le DIT, on ne fusionne ni ne choisit', async () => {
    const { service, contacts, intakeExclusions } = build([
      { id: 'c-1', full_name: 'Sandrine Pata', email: null },
      { id: 'c-2', full_name: 'Sandrine PATA', email: null },
    ])
    const result = await service.createFromCrmPresence(ACCOUNT, USER, { full_name: 'Sandrine Pata' })
    expect(result).toEqual({ status: 'ambiguous', matches: 2 })
    expect(contacts.save).not.toHaveBeenCalled()
    // #2309.16 — l'identité ambiguë est désormais NOMMÉE au funnel, jamais
    // silencieusement perdue.
    expect(intakeExclusions.insert).toHaveBeenCalledWith([
      { workspace_id: 'ws-1', account_id: ACCOUNT, reason: 'ambiguous_identity' },
    ])
  })

  it('N’ATTRAPE PAS CE QU’ELLE NE VISE PAS — un homonyme partiel n’est pas un doublon', async () => {
    // Le témoin du cas légitime voisin : « Sandrine Patat » n'est pas
    // « Sandrine Pata ». Un rapprochement approximatif créerait le défaut que
    // la doctrine refuse — deux personnes différentes confondues.
    const { service, contacts } = build([{ id: 'c-3', full_name: 'Sandrine Patat', email: 'autre@example.com' }])
    const result = await service.createFromCrmPresence(ACCOUNT, USER, {
      full_name: 'Sandrine Pata',
      email: 'sandrine.pata@example.com',
    })
    expect(result).toEqual({ status: 'created', contact_id: 'new-1' })
    expect(contacts.save).toHaveBeenCalledTimes(1)
  })
})
