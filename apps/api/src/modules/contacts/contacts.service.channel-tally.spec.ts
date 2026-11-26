/**
 * #4527.1/.2/.4/.6 + #4526.4 — les chiffres des tuiles « Avec e-mail · Avec téléphone ·
 * À rattacher » et de la puce « Mon CRM » se COMPTENT CÔTÉ SERVEUR, sur la population de
 * la liste, jamais en filtrant les pages déjà chargées (garde 549f2b2753 : jamais un
 * compte partiel présenté comme un total).
 */
import { ContactsService } from './contacts.service'
import { recordedPhoneSql } from './contact-completeness'
import { importedContactSql, monCrmContactSql } from './contact-crm-origin'
import { createMockRepository } from '../../database/test-utils'
import { placeholderEmailSqlPattern, recordedEmailSql } from './placeholder-email'
import { IMPORT_SOURCE_VALUE } from '@bellum/contracts'

const build = () => {
  const contacts = createMockRepository()
  const workspace = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }) }
  const service = new ContactsService(
    contacts as never,
    createMockRepository() as never,
    { enrichContact: jest.fn() } as never,
    {} as never,
    workspace as never,
    {} as never,
    {} as never,
    { get: jest.fn() } as never,
    {} as never,
    createMockRepository() as never,
    createMockRepository() as never,
    {} as never,
    {} as never,
    createMockRepository() as never,
    {} as never,
  )
  return { service, qb: contacts._qb }
}

const TALLY_ROW = { with_email: '12', with_phone: '7', unattached: '3', mon_crm: '5', imported: '9' }

describe('ContactsService — channelTally (#4527)', () => {
  it('rend les cinq chiffres EXACTS lus en base sur la 1re page', async () => {
    const { service, qb } = build()
    qb.getRawOne.mockResolvedValue(TALLY_ROW)
    const result = await service.findAllForUser('user-1', {})
    expect(result.channelTally).toEqual({ withEmail: 12, withPhone: 7, unattached: 3, monCrm: 5, imported: 9 })
  })

  it('#4527.4 : « a un téléphone » est le MÊME prédicat que le filtre `channel=with_phone`', async () => {
    const { service, qb } = build()
    qb.getRawOne.mockResolvedValue(TALLY_ROW)
    await service.findAllForUser('user-1', {})
    const selected = qb.addSelect.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')
    expect(selected).toContain(recordedPhoneSql('contact'))
    qb.andWhere.mockClear()
    await service.findAllForUser('user-1', { channel: 'with_phone' } as never)
    expect(qb.andWhere.mock.calls.map((c: unknown[]) => c[0])).toContain(recordedPhoneSql('contact'))
  })

  it("#4599 : « Avec e-mail » ne compte pas les gabarits, et c'est le MÊME prédicat que le filtre `channel=with_email`", async () => {
    const { service, qb } = build()
    qb.getRawOne.mockResolvedValue(TALLY_ROW)
    await service.findAllForUser('user-1', {})
    const emailSelect = qb.select.mock.calls.find((c: unknown[]) => String(c[1]) === 'with_email')?.[0] ?? ''
    expect(emailSelect).toContain(recordedEmailSql('contact'))
    qb.andWhere.mockClear()
    await service.findAllForUser('user-1', { channel: 'with_email' } as never)
    expect(qb.andWhere.mock.calls.map((c: unknown[]) => c[0])).toContain(recordedEmailSql('contact'))
  })

  it('#4527.3 sait dire NON : échec de lecture ⇒ champ ABSENT, jamais 0', async () => {
    const { service, qb } = build()
    qb.getRawOne.mockRejectedValue(new Error('boom'))
    const result = await service.findAllForUser('user-1', {})
    expect(result.channelTally).toBeUndefined()
  })

  // #4597.1 — la puce « Importés » ne s'invente pas : compteur d'import illisible ⇒ clé absente, le reste survit.
  it("#4597.1 un compteur « Importés » illisible n'emporte PAS les autres chiffres, et n'est jamais 0", async () => {
    const { service, qb } = build()
    qb.getRawOne.mockResolvedValue({ ...TALLY_ROW, imported: undefined })
    const result = await service.findAllForUser('user-1', {})
    expect(result.channelTally).toEqual({ withEmail: 12, withPhone: 7, unattached: 3, monCrm: 5 })
    expect(result.channelTally).not.toHaveProperty('imported')
  })

  // #4597.4/.5 (Louis 26/10) — « HubSpot 12 » = douze lignes HubSpot et rien d'autre : un contact importé d'un fichier ne
  // compte PAS dans la puce du CRM, et compte dans « Importés » (sa propre puce — aucun accès perdu).
  it("#4597.4 un contact importé d'un fichier ne compte pas dans la puce du CRM, il compte dans « Importés »", async () => {
    const { service, qb } = build()
    qb.getRawOne.mockResolvedValue(TALLY_ROW)
    await service.findAllForUser('user-1', {})
    const calls = qb.addSelect.mock.calls.map((c: unknown[]) => [String(c[0]), String(c[1])])
    const crm = calls.find(([, alias]) => alias === 'mon_crm')?.[0] ?? ''
    const imported = calls.find(([, alias]) => alias === 'imported')?.[0] ?? ''
    expect(crm).toBe(`COUNT(*) FILTER (WHERE ${monCrmContactSql('contact')})::int`)
    expect(crm).not.toContain(`'${IMPORT_SOURCE_VALUE}'`)
    expect(imported).toContain(importedContactSql('contact'))
  })

  it('une réponse illisible (champ manquant) ⇒ champ ABSENT, jamais un chiffre inventé', async () => {
    const { service, qb } = build()
    qb.getRawOne.mockResolvedValue({ with_email: '4' })
    const result = await service.findAllForUser('user-1', {})
    expect(result.channelTally).toBeUndefined()
  })

  it('pas de recalcul au scroll infini : absent hors 1re page', async () => {
    const { service, qb } = build()
    qb.getRawOne.mockResolvedValue(TALLY_ROW)
    const result = await service.findAllForUser('user-1', { offset: 25 } as never)
    expect(result.channelTally).toBeUndefined()
  })

  it('#4527.2 : la population du chiffre n’applique PAS le filtre de la puce elle-même', async () => {
    const { service, qb } = build()
    qb.getRawOne.mockResolvedValue(TALLY_ROW)
    qb.andWhere.mockClear()
    await service.findAllForUser('user-1', { channel: 'with_email', unassigned: true, source: 'mon_crm' } as never)
    // La liste applique 3 fois ces filtres (liste + total + cloisons), le chiffre aucune :
    // on compte le prédicat « e-mail réel » — 1 seul appel (la liste), pas 2.
    const wheres = qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
    expect(wheres.filter((w: unknown) => w === recordedEmailSql('contact'))).toHaveLength(1)
    expect(wheres.filter((w: unknown) => w === 'contact.account_id IS NULL')).toHaveLength(1)
  })

  it('la population du chiffre garde la borne d’espace (workspace_id) — un autre espace n’est jamais compté', async () => {
    const { service, qb } = build()
    qb.getRawOne.mockResolvedValue(TALLY_ROW)
    qb.andWhere.mockClear()
    qb.where.mockClear()
    await service.findAllForUser('user-1', {})
    const scoped = [...qb.where.mock.calls, ...qb.andWhere.mock.calls].filter(c => /workspace_id/.test(String(c[0])))
    // une fois pour la liste, une fois pour la population des chiffres
    expect(scoped.length).toBeGreaterThanOrEqual(2)
  })
})

describe('ContactsService — filtre `source=mon_crm` (#4526.4)', () => {
  // #4526.1 — l'origine CRM est une facette distincte du statut d'analyse, et ne retient que ce qu'un CONNECTEUR prouve.
  // CAUSE du « 0 » mesuré le 27/10 : le filtre ne lisait que `contacts.source = 'crm'`, valeur écrite UNIQUEMENT à la
  // création d'une fiche neuve ; une fiche que la synchro rattache à l'existant garde sa source d'origine, et sa
  // preuve de connecteur vit dans `sync_links`, que le filtre ne lisait pas.
  it('= source `crm` OU un lien de connecteur (`sync_links`, hors fichier) — jamais `import`', async () => {
    const { service, qb } = build()
    await service.findAllForUser('user-1', { source: 'mon_crm' } as never)
    const hit = (qb.andWhere.mock.calls as [string][]).find(([c]) => /sync_links/.test(c))
    expect(hit?.[0]).toBe(monCrmContactSql('contact'))
    expect(hit?.[0]).toContain("contact.source = 'crm'")
    expect(hit?.[0]).toContain("sl.provider <> 'csv'")
    expect(hit?.[0]).not.toContain(`'${IMPORT_SOURCE_VALUE}'`)
  })

  it('#4526.1 sait dire NON : « Importé par fichier » et « Mon CRM » ne rendent pas le même ensemble', () => {
    const crm = monCrmContactSql('contact')
    const file = importedContactSql('contact')
    expect(crm).not.toEqual(file)
    // un lien posé par un fichier (provider csv) ne fait JAMAIS entrer dans « Mon CRM »
    expect(crm).toContain("sl.provider <> 'csv'")
    // et une fiche `source = 'crm'` n'entre pas dans « Importés »
    expect(file).not.toContain("'crm'")
  })

  it('une source ordinaire garde l’égalité exacte', async () => {
    const { service, qb } = build()
    await service.findAllForUser('user-1', { source: 'apollo' } as never)
    const calls = qb.andWhere.mock.calls as [string, Record<string, unknown>][]
    expect(calls.find(([c]) => c === 'contact.source = :source')?.[1]).toEqual({ source: 'apollo' })
    expect(calls.some(([c]) => /contact\.source IN/.test(c))).toBe(false)
  })
})

describe('ContactsService — « Importés » et un import précis (#4597)', () => {
  it('#4597.1 `source=import` est le filtre de la puce « Importés » : égalité exacte sur la source', async () => {
    const { service, qb } = build()
    await service.findAllForUser('user-1', { source: 'import' } as never)
    const calls = qb.andWhere.mock.calls as [string, Record<string, unknown>][]
    expect(calls.find(([c]) => c === 'contact.source = :source')?.[1]).toEqual({ source: 'import' })
  })

  it("#4597.3 `importJob` : égalité sur l'identifiant de l'import, jamais une date", async () => {
    const { service, qb } = build()
    const job = '33333333-3333-4333-8333-333333333333'
    await service.findAllForUser('user-1', { importJob: job } as never)
    const calls = qb.andWhere.mock.calls as [string, Record<string, unknown>][]
    expect(calls.find(([c]) => c === 'contact.import_job_id = :importJob')?.[1]).toEqual({ importJob: job })
  })

  it('#4597.3 sans `importJob`, aucune restriction (un filtre AJOUTE une vue)', async () => {
    const { service, qb } = build()
    await service.findAllForUser('user-1', {} as never)
    const calls = qb.andWhere.mock.calls as [string, unknown][]
    expect(calls.some(([c]) => /import_job_id/.test(c))).toBe(false)
  })
})

describe('ContactsService — filtre `placeholderEmail` (#4599)', () => {
  it('compte les adresses GABARIT en base : le motif de la garde d’écriture, en SQL', async () => {
    const { service, qb } = build()
    await service.findAllForUser('user-1', { placeholderEmail: true } as never)
    const calls = qb.andWhere.mock.calls as [string, Record<string, unknown>][]
    const hit = calls.find(([c]) => /contact\.email ~\* :placeholderEmailPattern/.test(c))
    expect(hit?.[1]).toEqual({ placeholderEmailPattern: placeholderEmailSqlPattern() })
  })

  it('sans le filtre, aucune restriction (un filtre AJOUTE une vue)', async () => {
    const { service, qb } = build()
    await service.findAllForUser('user-1', {} as never)
    expect((qb.andWhere.mock.calls as [string][]).some(([c]) => /placeholderEmailPattern/.test(c))).toBe(false)
  })
})

describe('ContactsService — une tuile ne compte jamais moins que son filtre (#4660)', () => {
  // Mesuré en prod 27/10 : « À rattacher » 0 sans filtre (portée « Recommandés » par défaut — un contact sans compte n'a
  // pas de chemin recommandé) et 964 avec `q=@` (la recherche lève la portée). Un sous-ensemble plus grand que l'ensemble.
  it('« À rattacher » est compté HORS portée « Recommandés » : la population que son geste affiche', async () => {
    const { service, qb } = build()
    qb.getRawOne.mockResolvedValue(TALLY_ROW)
    const narrow = jest.spyOn(service as never, 'narrowToRecommendedScope' as never)
    narrow.mockResolvedValue({ ids: new Set(['c1']), rankByContact: new Map(), pathSizeByAccount: new Map() } as never)
    await service.findAllForUser('user-1', { recommendedScope: 'recommended' } as never)
    // `unattached` a SA lecture (un `select` à lui), faite avant que la portée ne rogne la population des autres chiffres
    const own = qb.select.mock.calls.filter((c: unknown[]) => String(c[1]) === 'unattached')
    expect(own).toHaveLength(1)
    expect(String(own[0]?.[0])).toContain('account_id IS NULL')
    // jumeaux : « HubSpot » et « Importés » (fiches sans compte) sont lus dans la MÊME population large
    const aliases = qb.addSelect.mock.calls.map((c: unknown[]) => String(c[1]))
    expect(aliases.filter(a => a === 'mon_crm' || a === 'imported')).toHaveLength(4)
  })

  it('choisir « À rattacher » LÈVE la portée « Recommandés » (comme un état de sortie, #3871) : la liste montre le chiffre', async () => {
    const { service } = build()
    const narrow = jest.spyOn(service as never, 'narrowToRecommendedScope' as never)
    await service.findAllForUser('user-1', { recommendedScope: 'recommended', unassigned: true } as never)
    expect(narrow).not.toHaveBeenCalled()
  })

  it('jumeaux : les puces « HubSpot », « Importés » et « cet import » lèvent aussi la portée « Recommandés »', async () => {
    for (const filters of [
      { source: 'mon_crm' },
      { source: IMPORT_SOURCE_VALUE },
      { importJob: '33333333-3333-4333-8333-333333333333' },
    ]) {
      const { service } = build()
      const narrow = jest.spyOn(service as never, 'narrowToRecommendedScope' as never)
      await service.findAllForUser('user-1', { recommendedScope: 'recommended', ...filters } as never)
      expect(narrow).not.toHaveBeenCalled()
    }
  })

  it('SAIT DIRE NON : sans « À rattacher », la portée « Recommandés » s’applique toujours', async () => {
    const { service } = build()
    const narrow = jest.spyOn(service as never, 'narrowToRecommendedScope' as never)
    narrow.mockResolvedValue({ ids: new Set(['c1']), rankByContact: new Map(), pathSizeByAccount: new Map() } as never)
    await service.findAllForUser('user-1', { recommendedScope: 'recommended' } as never)
    expect(narrow).toHaveBeenCalled()
  })
})

describe('ContactsService — la liste ne nomme jamais une personne par son adresse (#4586)', () => {
  it('une fiche « à qualifier » déjà en base, nommée par son adresse, sort avec sa partie locale lisible', async () => {
    const { service, qb } = build()
    qb.getRawMany.mockResolvedValue([
      { id: 'c1', full_name: 'menette.sebastien@capgemini.com', email: 'menette.sebastien@capgemini.com' },
      { id: 'c2', full_name: 'Emmanuel Legros Capgemini', email: null },
    ])
    qb.getRawOne.mockResolvedValue(TALLY_ROW)
    const result = await service.findAllForUser('user-1', { q: 'menette' } as never)
    expect(result.data.map(row => row.full_name)).toEqual(['Menette Sebastien', 'Emmanuel Legros Capgemini'])
  })

  it('#4586.5 — la liste dit QUELLE ligne porte un nom déduit de l’adresse, et seulement celle-là', async () => {
    const { service, qb } = build()
    qb.getRawMany.mockResolvedValue([
      { id: 'c1', full_name: 'menette.sebastien@capgemini.com', email: 'menette.sebastien@capgemini.com' },
      { id: 'c2', full_name: 'Marie Dupont', email: 'marie@x.fr', name_derived_from_email: 'true' },
      { id: 'c3', full_name: 'Emmanuel Legros Capgemini', email: null },
      { id: 'c4', full_name: 'contact@capgemini.com', email: null },
    ])
    qb.getRawOne.mockResolvedValue(TALLY_ROW)
    const result = await service.findAllForUser('user-1', { q: 'x' } as never)
    expect(result.data.map(row => row.name_derived_from_email)).toEqual([true, true, false, false])
    expect(
      result.data.every(row => !('name_derived_from_email' in row) || typeof row.name_derived_from_email === 'boolean'),
    ).toBe(true)
  })
})
