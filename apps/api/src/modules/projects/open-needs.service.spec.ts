import type { ReverseProspectMatch } from '@bellum/contracts'
import { OpenNeedsService } from './open-needs.service'
// #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations concurrentes :
// le défaut du plafond vit dans le contrat partagé, plus dans un service de
// module (GA-26).
import { DEFAULT_MAX_OPEN_NEEDS } from '@bellum/contracts'

/**
 * L'écran « Besoins ouverts » (BEL-CRM-101).
 *
 * Ce qui mérite un test ici n'est pas le SQL — c'est ce qu'une erreur de
 * lecture ferait afficher : un TJM non communiqué rendu « 0 € » (donc gratuit),
 * un besoin qui presse enterré sous ceux qui n'ont pas de date, et une
 * recherche de compétence qui fait remonter « JavaScript » sur « Java ».
 */
describe('OpenNeedsService', () => {
  /**
   * #2035.11 — `ownerCounts` (vide par défaut) est la carte que
   * `openNeedsCountByOwner` aurait rendue : vide = personne à charge, donc le
   * tri de `sortByCommercialLoad` est un NO-OP et l'ordre déjà posé par le
   * SQL (deadline, création) reste celui que tous les tests ci-dessous
   * vérifient — aucun test existant n'a besoin de connaître ce lot.
   */
  const build = (
    rows: Record<string, unknown>[] = [],
    ownerCounts: Record<string, number> = {},
    maxOpenNeeds: number = DEFAULT_MAX_OPEN_NEEDS,
  ) => {
    const qb: Record<string, unknown> = {}
    const chain = (...names: string[]) => {
      for (const name of names) qb[name] = jest.fn(() => qb)
    }
    chain('innerJoin', 'leftJoin', 'where', 'andWhere', 'select', 'orderBy', 'addOrderBy', 'offset', 'limit', 'clone')
    qb['getCount'] = jest.fn().mockResolvedValue(rows.length)
    qb['getRawMany'] = jest.fn().mockResolvedValue(rows)
    const manager = {
      query: jest.fn().mockResolvedValue(Object.entries(ownerCounts).map(([owner_id, count]) => ({ owner_id, count }))),
    }
    const needs = { createQueryBuilder: jest.fn(() => qb), manager }
    const commercialLoadSettings = { maxOpenNeedsFor: jest.fn().mockResolvedValue(maxOpenNeeds) }
    return { service: new OpenNeedsService(needs as never, commercialLoadSettings as never), qb, manager }
  }

  const raw = (over: Record<string, unknown> = {}) => ({
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Tech lead Java',
    urgency: null,
    skills: [{ term: 'Java', required: true }],
    seniority: 'senior',
    headcount: 2,
    target_tjm_cents: null,
    start_on: null,
    duration_months: null,
    location: 'Lyon',
    contract_kind: 'regie',
    deadline_at: null,
    status: 'to_qualify',
    status_reason: null,
    status_changed_at: null,
    source: null,
    provenance: null,
    owner_id: null,
    shortlist_count: '0',
    project_id: '22222222-2222-4222-8222-222222222222',
    project_label: 'Migration data lake',
    project_stage: 'qualified',
    account_id: null,
    account_name: 'EDF',
    entity_id: null,
    entity_name: null,
    ...over,
  })

  it('garde un TJM non communiqué à null — `Number(null)` vaudrait 0, donc « gratuit »', async () => {
    const { service } = build([raw({ target_tjm_cents: null })])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data[0]?.target_tjm_cents).toBeNull()
  })

  it('#3348 — pose `next_action` avec la MÊME dérivation que l’écran, jamais un second calcul', async () => {
    const { service } = build([raw({ start_on: '2020-01-01T00:00:00.000Z', shortlist_count: '0' })])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data[0]?.next_action).toBe('decide_stale_start')
  })

  it('#3348 — sans date dépassée, `next_action` retombe sur le geste normal', async () => {
    const { service } = build([raw({ start_on: null, deadline_at: null, skills: [{ term: 'Java', required: true }] })])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data[0]?.next_action).toBe('run_matching')
  })

  it('#4016 L11 — une SÉLECTION par identité filtre sur les ids et lève les replis de la vue (ouvert, non archivé)', async () => {
    const { service, qb } = build([raw()])
    await service.list('w-1', { offset: 0, limit: 200 }, { needIds: ['11111111-1111-4111-8111-111111111111'] })
    const clauses = (qb['andWhere'] as jest.Mock).mock.calls.map(call => String(call[0]))
    expect(clauses).toContain('need.id IN (:...selectedNeedIds)')
    expect(clauses.some(clause => clause.includes('archived_at'))).toBe(false)
    expect(clauses.some(clause => clause.includes('openStatuses'))).toBe(false)
    // Le workspace filtre TOUJOURS.
    expect(qb['where']).toHaveBeenCalledWith('need.workspace_id = :workspaceId', { workspaceId: 'w-1' })
  })

  it('#4016 L11 — sans sélection, la vue garde ses replis (non archivé, ouvert)', async () => {
    const { service, qb } = build([raw()])
    await service.list('w-1', { offset: 0, limit: 50 })
    const clauses = (qb['andWhere'] as jest.Mock).mock.calls.map(call => String(call[0]))
    expect(clauses).toContain('need.archived_at IS NULL')
    expect(clauses.some(clause => clause.includes('openStatuses'))).toBe(true)
  })

  it('lit un bigint rendu en chaîne par le pilote', async () => {
    const { service } = build([raw({ target_tjm_cents: '65000' })])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data[0]?.target_tjm_cents).toBe(65000)
  })

  it('#2173.29 — lit le télétravail sélectionné, jamais un défaut `sur_site`', async () => {
    const { service } = build([raw({ remote: 'hybride' })])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data[0]?.remote).toBe('hybride')
  })

  it('#2173.29 — `null` reste `null` : non renseigné n’est jamais `sur_site`', async () => {
    const { service } = build([raw({ remote: null })])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data[0]?.remote).toBeNull()
  })

  it('X66 / #3547 — lit le forfait encadré du besoin : mode, rôle tenu, équipe côté client', async () => {
    const { service } = build([
      raw({
        delivery_mode: 'supervised',
        supervision_role: 'both',
        client_team_size: 8,
        client_team_names: ['Marie Dupont'],
      }),
    ])
    const row = (await service.list('w-1', { offset: 0, limit: 50 })).data[0]
    expect(row).toMatchObject({
      delivery_mode: 'supervised',
      supervision_role: 'both',
      client_team_size: 8,
      client_team_names: ['Marie Dupont'],
    })
  })

  it('X66 / #3547 — sans forfait encadré : staffé, équipe `null` (jamais 0), noms vides', async () => {
    const { service } = build([raw({})])
    const row = (await service.list('w-1', { offset: 0, limit: 50 })).data[0]
    expect(row).toMatchObject({
      delivery_mode: 'staffed',
      supervision_role: null,
      client_team_size: null,
      client_team_names: [],
    })
  })

  it('compte la shortlist, y compris quand elle est vide — c’est l’alerte du §16', async () => {
    const { service } = build([raw({ shortlist_count: '3' })])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data[0]?.shortlist_count).toBe(3)
  })

  it('trie par échéance en mettant les besoins SANS date à la fin', async () => {
    const { service, qb } = build([raw()])
    await service.list('w-1', { offset: 0, limit: 50 })
    // Sans `NULLS LAST`, Postgres remonte les besoins sans échéance en tête et
    // enterre exactement ceux qui pressent.
    expect(qb['orderBy']).toHaveBeenCalledWith('need.deadline_at', 'ASC', 'NULLS LAST')
  })

  /**
   * #2035.11 — LA CHARGE COMMERCIALE REPRIORISE LA PAGE, PAS LE SQL.
   *
   * `sortByCommercialLoad` est déjà testée seule (`commercial-load-priority.spec.ts`) ;
   * ce test-ci prouve l'APPELANT : `list()` lit vraiment
   * `WorkspaceCommercialLoadSettingsService.maxOpenNeedsFor` et le compte par porteur
   * (`manager.query`), et applique le résultat à LA PAGE reçue.
   */
  it('#2035.11 — un besoin dont le porteur est à charge passe après les autres', async () => {
    const overOwner = 'aaaaaaaa-0000-4000-8000-000000000001'
    const underOwner = 'bbbbbbbb-0000-4000-8000-000000000002'
    const rows = [
      raw({ id: 'need-over', owner_id: overOwner, deadline_at: null }),
      raw({ id: 'need-under', owner_id: underOwner, deadline_at: null }),
    ]
    const { service, manager } = build(rows, { [overOwner]: 20, [underOwner]: 2 }, 15)
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data.map(row => row.id)).toEqual(['need-under', 'need-over'])
    // L'APPELANT : la charge se lit dans CET espace, jamais un autre.
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('GROUP BY owner_id'),
      expect.arrayContaining(['w-1']),
    )
  })

  it('#2035.11 — sous le plafond, l’ordre par échéance ne bouge pas', async () => {
    const owner = 'aaaaaaaa-0000-4000-8000-000000000001'
    const rows = [raw({ id: 'need-a', owner_id: owner }), raw({ id: 'need-b', owner_id: owner })]
    const { service } = build(rows, { [owner]: 2 }, 15)
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data.map(row => row.id)).toEqual(['need-a', 'need-b'])
  })

  it('cherche une compétence DANS le tableau typé, pas dans le JSON entier', async () => {
    const { service, qb } = build([])
    await service.list('w-1', { offset: 0, limit: 50, skill: 'Java' })
    const clauses = (qb['andWhere'] as jest.Mock).mock.calls.map(call => String(call[0]))
    // Un ILIKE sur le JSON ferait matcher « Java » sur « JavaScript ».
    expect(clauses.some(clause => clause.includes("s->>'term'"))).toBe(true)
  })

  /**
   * #2872 — « propose un consultant pour Développeur Java/Spring Boot »
   * (`find_needs`, `apps/ia/app/services/chat_tools.py`) répondait « aucun
   * besoin correspondant trouvé » sur un besoin pourtant OUVERT et visible sur
   * `/projects/needs`. Cause : `q` posait UN SEUL `ILIKE` sur la phrase
   * ENTIÈRE — un besoin en base doit alors porter EXACTEMENT ce texte, virgule
   * et espaces compris, dans son titre, le libellé de l'affaire ou le nom du
   * compte. Il ne cherchait JAMAIS les compétences, alors que l'outil
   * `find_needs` promet lui-même « cherchables par libellé, COMPÉTENCE ou nom
   * de compte » (FIND_NEEDS_TOOL, chat_tools.py) — une recherche par rôle+stack
   * ("Java/Spring Boot") ne matche presque jamais un TITRE mot pour mot.
   */
  it('#2872 — découpe la recherche en mots et couvre aussi les compétences, pas seulement le titre exact', async () => {
    const { service, qb } = build([])
    await service.list('w-1', { offset: 0, limit: 50, q: 'Développeur Java/Spring Boot' })
    const searchCalls = (qb['andWhere'] as jest.Mock).mock.calls.filter(
      call => typeof call[0] === 'string' && (call[0] as string).includes('need.title ILIKE'),
    )
    // Un appel PAR MOT — jamais un seul ILIKE sur la phrase entière avec sa ponctuation.
    expect(searchCalls).toHaveLength(4)
    // Chaque terme cherche aussi dans les compétences, pas seulement titre/affaire/compte.
    expect(searchCalls.every(call => (call[0] as string).includes('jsonb_array_elements(need.skills)'))).toBe(true)
    const values = searchCalls.map(call => Object.values(call[1] as Record<string, string>)[0])
    expect(values).toEqual(['%Développeur%', '%Java%', '%Spring%', '%Boot%'])
  })

  it('#2872 — une recherche vide ou sans mot exploitable ne pose aucun filtre supplémentaire', async () => {
    const { service, qb } = build([])
    await service.list('w-1', { offset: 0, limit: 50, q: '   ' })
    const searchCalls = (qb['andWhere'] as jest.Mock).mock.calls.filter(
      call => typeof call[0] === 'string' && (call[0] as string).includes('need.title ILIKE'),
    )
    expect(searchCalls).toHaveLength(0)
  })

  /**
   * #2872 (reste, constat PRODUCTION 27/09 18:18) — « Quels besoins ouverts
   * demandent du Java ? » posé à Laura répondait « Je n'ai trouvé aucun besoin
   * ouvert mentionnant Java », alors que le besoin LVMH « Développeur Java /
   * Spring Boot » (compétences Java/Spring Boot/Kafka) était bien OUVERT et
   * visible sur `/projects/needs`. Le découpage mot-par-mot de #2872 exigeait
   * déjà (AND) chaque mot de la phrase — « besoins », « ouverts », « du »,
   * « demandent » ne se retrouvent dans AUCUN titre, AUCUNE compétence, AUCUN
   * nom de compte, donc UN SEUL de ces mots vidait le résultat. Bout en bout
   * au niveau du service (comme `OpenNeedsController.findOpenNeeds` et le pont
   * `copilotBridge.findNeeds` le rejouent) : la question complète doit
   * retrouver le besoin dont seule la compétence porte le mot qui compte.
   */
  it('#2872 (reste) — une QUESTION complète (« Quels besoins ouverts demandent du Java ? ») retrouve un besoin dont seule la compétence porte « Java »', async () => {
    const lvmhNeed = raw({
      id: 'need-lvmh-java',
      title: 'Développeur Java / Spring Boot',
      account_name: 'LVMH',
      skills: [
        { term: 'Java', required: true },
        { term: 'Spring Boot', required: true },
        { term: 'Kafka', required: false },
      ],
    })
    const { service, qb } = build([lvmhNeed])
    const result = await service.list('w-1', { offset: 0, limit: 20, q: 'Quels besoins ouverts demandent du Java ?' })
    const searchCalls = (qb['andWhere'] as jest.Mock).mock.calls.filter(
      call => typeof call[0] === 'string' && (call[0] as string).includes('need.title ILIKE'),
    )
    // Les mots grammaticaux (« quels », « du ») et les mots qui décrivent la
    // RECHERCHE elle-même (« besoins », « ouverts », « demandent ») ne posent
    // AUCUN terme — seul « Java » reste un critère.
    expect(searchCalls).toHaveLength(1)
    expect(Object.values(searchCalls[0]![1] as Record<string, string>)).toEqual(['%Java%'])
    expect(result.data.map(row => row.id)).toEqual(['need-lvmh-java'])
  })

  it('#2872 (reste) — une question tout en mots vides (aucun critère exploitable) ne pose aucun filtre, comme une recherche vide', async () => {
    const { service, qb } = build([])
    await service.list('w-1', { offset: 0, limit: 20, q: 'Quels sont les besoins ouverts ?' })
    const searchCalls = (qb['andWhere'] as jest.Mock).mock.calls.filter(
      call => typeof call[0] === 'string' && (call[0] as string).includes('need.title ILIKE'),
    )
    expect(searchCalls).toHaveLength(0)
  })

  it('#2872 (reste) — insensible à la casse et aux accents : « Où » retombe sur la même entrée que « ou »', async () => {
    const { service, qb } = build([])
    await service.list('w-1', { offset: 0, limit: 20, q: 'Où sont les besoins Java ?' })
    const searchCalls = (qb['andWhere'] as jest.Mock).mock.calls.filter(
      call => typeof call[0] === 'string' && (call[0] as string).includes('need.title ILIKE'),
    )
    expect(searchCalls).toHaveLength(1)
    expect(Object.values(searchCalls[0]![1] as Record<string, string>)).toEqual(['%Java%'])
  })

  it('ne montre que les besoins OUVERTS par défaut — c’est le nom de l’écran', async () => {
    const { service, qb } = build([])
    await service.list('w-1', { offset: 0, limit: 50 })
    const clauses = (qb['andWhere'] as jest.Mock).mock.calls.map(call => String(call[0]))
    expect(clauses.some(clause => clause.includes('openStatuses'))).toBe(true)
  })

  it('ouvre la vue à tout quand on le demande', async () => {
    const { service, qb } = build([])
    await service.list('w-1', { offset: 0, limit: 50, include_closed: true })
    const clauses = (qb['andWhere'] as jest.Mock).mock.calls.map(call => String(call[0]))
    expect(clauses.some(clause => clause.includes('openStatuses'))).toBe(false)
  })

  // Théo C projects-besoins.SOURCES — le lien vers l'offre d'origine voyage sur la ligne ;
  // jamais inventé : une valeur absente ou non http(s) reste `null`.
  it('Théo C projects-besoins — rend l’URL de la source http(s) quand le besoin vient d’une offre repérée', async () => {
    const { service } = build([raw({ source_url: 'https://careers.airbus.com/offre/sap-s4' })])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data[0]?.source_url).toBe('https://careers.airbus.com/offre/sap-s4')
  })
  it('Théo C projects-besoins — SAIT DIRE NON : pas d’URL, ou une URL qui n’est pas http(s), donne null', async () => {
    const { service } = build([
      raw({ source_url: null }),
      raw({ id: '33333333-3333-4333-8333-333333333333', source_url: 'javascript:alert(1)' }),
    ])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data.map(row => row.source_url)).toEqual([null, null])
  })

  // Théo C projects-besoins.A8 — « Périmé — à revérifier » : même prédicat que la routine
  // des besoins sans shortlist (un seul seuil, NEED_STALE_AFTER_DAYS).
  it('Théo C projects-besoins.A8 — stale=true ne garde que les besoins ouverts anciens sans shortlist', async () => {
    const { service, qb } = build([])
    await service.list('w-1', { offset: 0, limit: 50, stale: true })
    const clauses = (qb['andWhere'] as jest.Mock).mock.calls.map(call => String(call[0]))
    const stale = clauses.find(clause => clause.includes('NOT EXISTS (SELECT 1 FROM shortlists'))
    expect(stale).toBeDefined()
    expect(stale).toContain('created_at <')
  })

  // Théo C projects-besoins.R3 — le statut affiché (À qualifier · Ouvert · Couvert)
  // se traduit en états stockés ; « Couvert » contourne le repli « ouverts seulement ».
  it('Théo C projects-besoins.R3 — theo_status=covered filtre sur won/staffed et ouvre la vue aux clos', async () => {
    const { service, qb } = build([])
    await service.list('w-1', { offset: 0, limit: 50, theo_status: 'covered' })
    const calls = (qb['andWhere'] as jest.Mock).mock.calls
    const clause = calls.find(call => String(call[0]).includes('theoStatuses'))
    expect(clause).toBeDefined()
    expect([...(clause![1] as { theoStatuses: string[] }).theoStatuses].sort()).toEqual(['staffed', 'won'])
    expect(calls.some(call => String(call[0]).includes('openStatuses'))).toBe(false)
  })

  it('Théo C projects-besoins.R3 — theo_status=open ne ramène aucun état clos ni « à qualifier »', async () => {
    const { service, qb } = build([])
    await service.list('w-1', { offset: 0, limit: 50, theo_status: 'open' })
    const clause = (qb['andWhere'] as jest.Mock).mock.calls.find(call => String(call[0]).includes('theoStatuses'))
    const statuses = (clause![1] as { theoStatuses: string[] }).theoStatuses
    expect(statuses).toContain('matching')
    expect(statuses).toContain('on_hold')
    for (const closed of ['won', 'lost', 'cancelled', 'to_qualify']) expect(statuses).not.toContain(closed)
  })

  /**
   * #2173.49 — ARCHIVÉ n'est pas un statut : c'est un rangement NEUTRE
   * (décision Louis 17/09/2026). Trois preuves, chacune contre ce qu'une
   * implémentation pressée aurait fait.
   */
  it('exclut les besoins archivés par défaut, quel que soit leur statut', async () => {
    const { service, qb } = build([])
    await service.list('w-1', { offset: 0, limit: 50 })
    const clauses = (qb['andWhere'] as jest.Mock).mock.calls.map(call => String(call[0]))
    expect(clauses.some(clause => clause.includes('need.archived_at IS NULL'))).toBe(true)
  })

  it('la vue « Archivés » montre SEULEMENT les archivés, et contourne le repli « ouverts seulement »', async () => {
    const { service, qb } = build([])
    await service.list('w-1', { offset: 0, limit: 50, archived: true })
    const clauses = (qb['andWhere'] as jest.Mock).mock.calls.map(call => String(call[0]))
    expect(clauses.some(clause => clause.includes('need.archived_at IS NOT NULL'))).toBe(true)
    // Un besoin rangé peut être `won`, `lost`, ou encore `to_qualify` — le
    // repli « ouverts seulement » présupposerait un avancement que le
    // rangement, neutre, ne dit pas.
    expect(clauses.some(clause => clause.includes('openStatuses'))).toBe(false)
  })

  it('SÉLECTIONNE la date d’archivage, et la rend telle quelle — `null` reste `null`', async () => {
    const { service } = build([raw({ archived_at: '2026-09-17T09:00:00.000Z' })])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data[0]?.archived_at).toBe('2026-09-17T09:00:00.000Z')

    const { service: other } = build([raw({ archived_at: null })])
    const untouched = await other.list('w-1', { offset: 0, limit: 50 })
    expect(untouched.data[0]?.archived_at).toBeNull()
  })

  it('FILTRE sur l’origine du besoin — la colonne était servie et interrogeable par personne', async () => {
    // `need.source` était déjà dans le SELECT et sur chaque ligne rendue : la
    // moitié qui manquait est le critère. « Ne me montre que ce qui vient d'un
    // e-mail client » est la question qui dit si un canal vaut la peine.
    const { service, qb } = build([])
    await service.list('w-1', { offset: 0, limit: 50, source: 'client_email' })
    const clauses = (qb['andWhere'] as jest.Mock).mock.calls.map(call => String(call[0]))
    expect(clauses.some(clause => clause.includes('need.source = :source'))).toBe(true)
  })

  it('ne pose AUCUN critère d’origine quand on n’en demande pas', async () => {
    // Un `WHERE need.source IS NULL` par défaut viderait la liste de tous les
    // besoins qui en portent une — un tableau vide se lit « il n'y a rien ».
    const { service, qb } = build([])
    await service.list('w-1', { offset: 0, limit: 50 })
    const clauses = (qb['andWhere'] as jest.Mock).mock.calls.map(call => String(call[0]))
    expect(clauses.some(clause => clause.includes('need.source'))).toBe(false)
  })

  it('#2173.15 — FILTRE la vue rapide « Entretiens » sur le stade du positionnement', async () => {
    const { service, qb } = build([])
    await service.list('w-1', { offset: 0, limit: 50, with_interview: true })
    const clauses = (qb['andWhere'] as jest.Mock).mock.calls.map(call => String(call[0]))
    expect(clauses.some(clause => clause.includes("sub.stage = 'interview'"))).toBe(true)
  })

  it('#2173.9 — FILTRE « à clôturer » sur un positionnement accepté', async () => {
    const { service, qb } = build([])
    await service.list('w-1', { offset: 0, limit: 50, ready_to_close: true })
    const clauses = (qb['andWhere'] as jest.Mock).mock.calls.map(call => String(call[0]))
    expect(clauses.some(clause => clause.includes("sub.stage = 'accepted'"))).toBe(true)
  })

  it('#2173.17 — la vue « Perdus / clôturés » contourne le défaut « ouverts seulement »', async () => {
    const { service, qb } = build([])
    await service.list('w-1', { offset: 0, limit: 50, closed_lost_or_cancelled: true })
    const clauses = (qb['andWhere'] as jest.Mock).mock.calls.map(call => String(call[0]))
    expect(clauses.some(clause => clause.includes('openStatuses'))).toBe(false)
    // GA-62 n'admet qu'un littéral par prédicat — deux comparaisons à un seul
    // statut chacune, jamais une liste recopiée à la main (`IN (...)`).
    expect(clauses.some(clause => clause.includes("need.status = 'lost' OR need.status = 'cancelled'"))).toBe(true)
  })

  it('SÉLECTIONNE l’origine, et la rend telle quelle — `null` reste `null`', async () => {
    const { service } = build([raw({ source: 'client_email' }), raw({ source: null })])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data[0]?.source).toBe('client_email')
    // Personne n'a dit d'où vient le second : l'écran écrira « origine
    // inconnue ». Le ranger d'office dans « saisi à la main » inventerait une
    // provenance, et une provenance inventée se relit comme un fait.
    expect(result.data[1]?.source).toBeNull()
  })

  it('SÉLECTIONNE la date d’entrée dans l’étape — la colonne existait, personne ne la lisait', async () => {
    // `project_needs.status_changed_at` est écrite depuis le PDF 2 par
    // `project-pipeline.service`. Elle n'était dans aucun SELECT de cet écran,
    // donc l'âge dans l'étape n'atteignait jamais le tableau du recruteur.
    const { service, qb } = build([])
    await service.list('w-1', { offset: 0, limit: 50 })
    const selected = ((qb['select'] as jest.Mock).mock.calls[0]?.[0] as string[]) ?? []
    expect(selected).toContain('need.status_changed_at AS status_changed_at')
  })

  it('rend la date en ISO', async () => {
    const { service } = build([raw({ status_changed_at: new Date('2026-08-15T09:00:00.000Z') })])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data[0]?.status_changed_at).toBe('2026-08-15T09:00:00.000Z')
  })

  it('garde `null` quand le besoin n’a jamais changé d’état', async () => {
    // Le repli honnête : l'écran écrira « non mesuré ». Fabriquer une date ici
    // — la création, « maintenant » — inventerait un âge, et l'âge inventé
    // serait toujours zéro, c'est-à-dire toujours rassurant.
    const { service } = build([raw({ status_changed_at: null })])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data[0]?.status_changed_at).toBeNull()
  })

  /**
   * #2175.8 (lot W20, registre 16/09) — L'INTERLOCUTEUR.
   *
   * `project_needs.contact_id` existe en base et dans `ProjectNeed` (contrat
   * de lecture) depuis longtemps — « le DEMANDEUR, la personne qui a exprimé
   * le besoin » — mais `OpenNeedRow` (celui que sert `GET /projects/needs` et
   * que lit `NeedDetailPage.tsx`) ne le portait pas : la donnée existait,
   * aucune requête de CET écran ne la lisait.
   */
  it('SÉLECTIONNE l’interlocuteur (`need.contact_id`) — la colonne existe, aucune requête de cet écran ne la lisait', async () => {
    const { service, qb } = build([])
    await service.list('w-1', { offset: 0, limit: 50 })
    const selected = ((qb['select'] as jest.Mock).mock.calls[0]?.[0] as string[]) ?? []
    expect(selected).toContain('need.contact_id AS contact_id')
  })

  it('rend le nom de l’interlocuteur, lu SUR LA MÊME requête — jamais un second aller-retour par besoin', async () => {
    const { service } = build([raw({ contact_id: 'c-1', contact_name: 'Camille Petit' })])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data[0]?.contact_id).toBe('c-1')
    expect(result.data[0]?.contact_name).toBe('Camille Petit')
  })

  it('garde `null` sur les deux quand aucun interlocuteur n’a été désigné — jamais un nom inventé', async () => {
    const { service } = build([raw({ contact_id: null, contact_name: null })])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data[0]?.contact_id).toBeNull()
    expect(result.data[0]?.contact_name).toBeNull()
  })

  /* ── LA FICHE D'UN BESOIN — la même ligne, demandée par son identité ────── */

  it('sert UN besoin par son identité — la lecture qui porte sa fiche', async () => {
    const { service, qb } = build([raw()])
    await service.list('w-1', { offset: 0, limit: 50, id: '11111111-1111-4111-8111-111111111111' })
    const clauses = (qb['andWhere'] as jest.Mock).mock.calls.map(call => String(call[0]))
    expect(clauses.some(clause => clause.includes('need.id = :needId'))).toBe(true)
  })

  it('sert un besoin CLOS demandé par son identité — un lien collé il y a trois semaines s’ouvre', async () => {
    // Le défaut de la liste dit ce qu'on montre quand on ne demande RIEN de
    // précis ; il ne dit rien de ce qu'on a le droit de lire. Sans cette
    // exception, la fiche d'un besoin perdu rendrait « introuvable » à
    // quelqu'un qui le voit encore dans son historique.
    const { service, qb } = build([raw({ status: 'lost' })])
    await service.list('w-1', { offset: 0, limit: 50, id: '11111111-1111-4111-8111-111111111111' })
    const clauses = (qb['andWhere'] as jest.Mock).mock.calls.map(call => String(call[0]))
    expect(clauses.some(clause => clause.includes('openStatuses'))).toBe(false)
  })

  it('garde le repli « seulement ce qui est ouvert » quand aucune identité n’est demandée', async () => {
    // La contrepartie du test au-dessus : l'exception ne doit pas fuir sur la
    // liste, sinon l'écran « Besoins ouverts » cesserait de porter son nom.
    const { service, qb } = build([])
    await service.list('w-1', { offset: 0, limit: 50 })
    const clauses = (qb['andWhere'] as jest.Mock).mock.calls.map(call => String(call[0]))
    expect(clauses.some(clause => clause.includes('openStatuses'))).toBe(true)
    expect(clauses.some(clause => clause.includes('need.id = :needId'))).toBe(false)
  })

  it('garde le filtre d’ESPACE sur une lecture par identité — c’est la garde qui compte', async () => {
    // Un identifiant deviné ne doit pas ouvrir le besoin d'une autre ESN. Le
    // `WHERE workspace_id` est posé avant tout le reste et n'est jamais levé.
    const { service, qb } = build([raw()])
    await service.list('w-1', { offset: 0, limit: 50, id: '11111111-1111-4111-8111-111111111111' })
    expect(qb['where']).toHaveBeenCalledWith('need.workspace_id = :workspaceId', { workspaceId: 'w-1' })
  })

  it('pagine côté serveur', async () => {
    const { service, qb } = build([raw()])
    const result = await service.list('w-1', { offset: 50, limit: 50 })
    expect(qb['offset']).toHaveBeenCalledWith(50)
    expect(qb['limit']).toHaveBeenCalledWith(50)
    expect(result.pagination.currentPage).toBe(2)
  })

  /**
   * #2558.1 — LE TEST QUI SAIT DIRE NON : un besoin SANS projet ne doit
   * jamais DISPARAÎTRE de cette liste. `project_needs.project_id` est
   * NULLABLE (migration `1795711263408-NeedWithoutProject`) ; si `project`
   * redevenait un `innerJoin`, ce besoin serait exclu du résultat SQL réel —
   * ce que ce mock ne peut pas simuler directement, donc on prouve la forme
   * du code : jamais d'INNER JOIN vers `opportunities`, toujours un LEFT
   * JOIN. Le compte, lui, se lit directement sur `need.account_id` — la
   * colonne est `NOT NULL` en base, c'est elle le vrai lien, jamais un repli
   * déduit du projet (#2558.1, migration `1795711263408`).
   */
  it('joint le projet en LEFT, jamais en INNER — un besoin sans projet doit rester dans la liste', async () => {
    const { service, qb } = build([])
    await service.list('w-1', { offset: 0, limit: 50 })
    expect(qb['innerJoin']).not.toHaveBeenCalledWith('opportunities', expect.anything(), expect.anything())
    expect(qb['leftJoin']).toHaveBeenCalledWith('opportunities', 'project', 'project.id = need.project_id')
  })

  it('lit le compte par need.account_id — jamais déduit du projet', async () => {
    const { service, qb } = build([])
    await service.list('w-1', { offset: 0, limit: 50 })
    expect(qb['leftJoin']).toHaveBeenCalledWith('accounts', 'account', 'account.id = need.account_id')
  })

  it('rend `project_id` à `null` pour un besoin sans projet — jamais la CHAÎNE "null"', async () => {
    // `String(null)` vaudrait `"null"`, une chaîne non vide qui se lirait
    // comme un identifiant réel côté écran.
    const { service } = build([
      raw({ project_id: null, project_label: null, project_stage: null, account_id: 'acc-sans-projet' }),
    ])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data[0]?.project_id).toBeNull()
    expect(result.data[0]?.project_label).toBeNull()
    expect(result.data[0]?.account_id).toBe('acc-sans-projet')
  })

  it('garde le comportement d’un besoin AVEC projet inchangé — même ligne, même mapping', async () => {
    const { service } = build([raw()])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data[0]?.project_id).toBe('22222222-2222-4222-8222-222222222222')
    expect(result.data[0]?.project_label).toBe('Migration data lake')
  })

  it('#3409.2 — SÉLECTIONNE la nature du besoin — la colonne était écrite par la porte de convergence, jamais lue ici', async () => {
    // `project_needs.convergence_state` existe depuis le 26/09
    // (`ProjectPipelineService.changeNeedConvergenceState`), mais aucune
    // requête de cet écran ne la sélectionnait : la fiche ne pouvait ni
    // l'afficher ni proposer de la faire changer.
    const { service, qb } = build([])
    await service.list('w-1', { offset: 0, limit: 50 })
    const selected = ((qb['select'] as jest.Mock).mock.calls[0]?.[0] as string[]) ?? []
    expect(selected).toContain('need.convergence_state AS convergence_state')
  })

  it('#3409.2 — rend la nature telle quelle, et `null` quand jamais évaluée', async () => {
    const { service } = build([raw({ convergence_state: 'besoin_detecte' }), raw({ convergence_state: null })])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data[0]?.convergence_state).toBe('besoin_detecte')
    // Un défaut deviné (par exemple « signal ») afficherait une conviction
    // que personne n'a posée.
    expect(result.data[1]?.convergence_state).toBeNull()
  })
})

describe('OpenNeedsService — les cinq compteurs de tête (I-33)', () => {
  /** Un constructeur qui rend un compte DIFFÉRENT à chaque appel, dans l'ordre
   *  où le service les demande : total, sans shortlist, échéance, démarrage,
   *  non staffable. C'est ce qui permet de vérifier qu'ils ne sont pas
   *  confondus — cinq fois le même nombre passerait n'importe quel test. */
  const buildCounting = (counts: number[]) => {
    const qb: Record<string, unknown> = {}
    const chain = (...names: string[]) => {
      for (const name of names) qb[name] = jest.fn(() => qb)
    }
    chain('innerJoin', 'leftJoin', 'where', 'andWhere', 'select', 'orderBy', 'addOrderBy', 'offset', 'limit', 'clone')
    let call = 0
    qb['getCount'] = jest.fn().mockImplementation(() => Promise.resolve(counts[call++] ?? 0))
    qb['getRawMany'] = jest.fn().mockResolvedValue([])
    // #2035.11 — `manager.query` : vide = personne à charge côté
    // `openNeedsCountByOwner`, donc `sortByCommercialLoad` est un NO-OP et
    // l'ordre déjà posé par le SQL ci-dessus reste celui que ce test vérifie.
    const needs = { createQueryBuilder: jest.fn(() => qb), manager: { query: jest.fn().mockResolvedValue([]) } }
    return {
      service: new OpenNeedsService(
        needs as never,
        { maxOpenNeedsFor: jest.fn().mockResolvedValue(DEFAULT_MAX_OPEN_NEEDS) } as never,
      ),
      qb,
    }
  }

  it('rend les compteurs, distincts', async () => {
    const { service } = buildCounting([42, 7, 3, 11, 2, 5, 6, 9, 4, 1])
    const page = await service.list('ws-1', { offset: 0, limit: 50 } as never)
    expect(page.counters).toEqual({
      total: 42,
      withoutShortlist: 7,
      deadlinePassed: 3,
      startingSoon: 11,
      notStaffable: 2,
      // #2173.8 / #2173.9
      withInterview: 5,
      readyToClose: 6,
      outcomes: { won: 9, lost: 4, cancelled: 1 },
    })
  })

  it('les compte sur le MÊME filtre que la liste — en CLONANT la requête', async () => {
    // Un SQL brut écrit à côté finirait par diverger d'une condition, et le
    // compteur dirait alors autre chose que le tableau qu'il surmonte.
    const { service, qb } = buildCounting([1, 1, 1, 1, 1])
    await service.list('ws-1', { offset: 0, limit: 50 } as never)
    // Un clone pour le total, puis un par compteur.
    expect((qb['clone'] as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(5)
  })

  it('ne compte JAMAIS sur la page affichée', async () => {
    // Un « 3 urgents » calculé sur la première page de cinq diminuerait en
    // tournant les pages — pire que pas de compteur.
    const { service } = buildCounting([120, 40, 5, 9, 1])
    const page = await service.list('ws-1', { offset: 0, limit: 10 } as never)
    expect(page.data).toHaveLength(0)
    expect(page.counters.total).toBe(120)
  })
})

/**
 * LES ISSUES — le dénominateur du taux de conversion (31/08/2026).
 *
 * Le rail « Laura peut traiter ces besoins » affichait « taux de conversion non
 * mesuré », et c'était vrai : l'écran ne charge que des besoins OUVERTS, donc
 * ni le numérateur (gagnés) ni deux tiers du dénominateur (perdus, annulés)
 * n'arrivaient jusqu'à lui. Louis a tranché — on les compte.
 *
 * Ce qui se teste ici n'est pas le SQL : c'est l'ORDRE. Le clone qui sert aux
 * issues est pris AVANT que les conditions de statut ne soient posées. Pris
 * après, il compterait « les gagnés parmi les ouverts », donc zéro — et le rail
 * afficherait « 0 % », le zéro le plus rassurant et le plus faux du lot.
 */
describe('OpenNeedsService — les trois issues (taux de conversion)', () => {
  const buildCounting = (counts: number[]) => {
    const calls: string[] = []
    const qb: Record<string, unknown> = {}
    const chain = (...names: string[]) => {
      for (const name of names) qb[name] = jest.fn(() => qb)
    }
    chain('innerJoin', 'leftJoin', 'where', 'select', 'orderBy', 'addOrderBy', 'offset', 'limit')
    // ⚠️ Le clone RECOPIE les clauses déjà posées — c'est exactement ce que le
    // service exploite, et un mock qui rend le même objet mutable ne pourrait
    // pas le montrer. On enregistre donc l'INSTANT du clone dans la trace.
    qb['clone'] = jest.fn(() => {
      calls.push('clone')
      return qb
    })
    qb['andWhere'] = jest.fn((clause: unknown) => {
      calls.push(`where:${String(clause)}`)
      return qb
    })
    let call = 0
    qb['getCount'] = jest.fn().mockImplementation(() => Promise.resolve(counts[call++] ?? 0))
    qb['getRawMany'] = jest.fn().mockResolvedValue([])
    // #2035.11 — `manager.query` : vide = personne à charge côté
    // `openNeedsCountByOwner`, donc `sortByCommercialLoad` est un NO-OP et
    // l'ordre déjà posé par le SQL ci-dessus reste celui que ce test vérifie.
    const needs = { createQueryBuilder: jest.fn(() => qb), manager: { query: jest.fn().mockResolvedValue([]) } }
    return {
      service: new OpenNeedsService(
        needs as never,
        { maxOpenNeedsFor: jest.fn().mockResolvedValue(DEFAULT_MAX_OPEN_NEEDS) } as never,
      ),
      qb,
      calls,
    }
  }

  it('compte gagnés, perdus et annulés SÉPARÉMENT — jamais un « clos » unique', async () => {
    // Un besoin annulé chez nous n'est pas un besoin perdu chez le client : les
    // réunir fausserait le taux de perte, l'un des rares chiffres qu'une ESN
    // regarde vraiment.
    const { service } = buildCounting([10, 0, 0, 0, 0, 0, 0, 6, 3, 2])
    const page = await service.list('ws-1', { offset: 0, limit: 50 } as never)
    expect(page.counters.outcomes).toEqual({ won: 6, lost: 3, cancelled: 2 })
  })

  it('le clone des issues est pris AVANT la condition « seulement les ouverts »', async () => {
    const { service, calls } = buildCounting([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
    await service.list('ws-1', { offset: 0, limit: 50 } as never)
    const openClause = calls.findIndex(entry => entry.includes(':...openStatuses'))
    const wonClause = calls.findIndex(entry => entry.includes("'won'"))
    // La garde LIT quelque chose : les deux clauses existent bel et bien.
    expect(openClause).toBeGreaterThanOrEqual(0)
    expect(wonClause).toBeGreaterThanOrEqual(0)
    // Et le clone des issues a été pris avant que le filtre « ouverts » ne soit
    // posé : il y a donc au moins un `clone` entre le début et cette clause.
    expect(calls.slice(0, openClause).filter(entry => entry === 'clone').length).toBeGreaterThanOrEqual(1)
  })

  it('un statut demandé explicitement ne vide PAS les issues', async () => {
    // `?status=matching` posé sur la liste ne doit pas se retrouver dans le
    // compteur des gagnés : `status = 'matching' AND status = 'won'` rend zéro,
    // et le rail afficherait « 0 % » sans avoir mesuré personne.
    const { service, calls } = buildCounting([3, 0, 0, 0, 0, 0, 0, 5, 2, 0])
    const page = await service.list('ws-1', { offset: 0, limit: 50, status: 'matching' } as never)
    expect(page.counters.outcomes).toEqual({ won: 5, lost: 2, cancelled: 0 })
    const statusClause = calls.findIndex(entry => entry.includes('need.status = :status'))
    const wonClause = calls.findIndex(entry => entry.includes("'won'"))
    expect(statusClause).toBeGreaterThanOrEqual(0)
    expect(calls.slice(0, statusClause).filter(entry => entry === 'clone').length).toBeGreaterThanOrEqual(1)
    expect(wonClause).toBeGreaterThan(statusClause)
  })
})

/**
 * LES MISSIONS NÉES D'UN BESOIN — et celles dont on ignore le rôle d'origine.
 *
 * Le bandeau « Staffing » écrivait « non mesuré » sur ce chiffre, pour une
 * raison juste : `missions` ne portait que `opportunity_id`. La colonne
 * `missions.need_id` (migration `1791001000001`) existe désormais ; ce qui se
 * teste ici est que la ligne rend les DEUX comptes, parce que le premier tout
 * seul mentirait sur les missions créées avant le lien.
 */
describe('OpenNeedsService — les missions attribuées', () => {
  const build = (rows: Record<string, unknown>[] = []) => {
    const qb: Record<string, unknown> = {}
    const chain = (...names: string[]) => {
      for (const name of names) qb[name] = jest.fn(() => qb)
    }
    chain('innerJoin', 'leftJoin', 'where', 'andWhere', 'select', 'orderBy', 'addOrderBy', 'offset', 'limit', 'clone')
    qb['getCount'] = jest.fn().mockResolvedValue(rows.length)
    qb['getRawMany'] = jest.fn().mockResolvedValue(rows)
    // #2035.11 — `manager.query` : vide = personne à charge côté
    // `openNeedsCountByOwner`, donc `sortByCommercialLoad` est un NO-OP et
    // l'ordre déjà posé par le SQL ci-dessus reste celui que ce test vérifie.
    const needs = { createQueryBuilder: jest.fn(() => qb), manager: { query: jest.fn().mockResolvedValue([]) } }
    return {
      service: new OpenNeedsService(
        needs as never,
        { maxOpenNeedsFor: jest.fn().mockResolvedValue(DEFAULT_MAX_OPEN_NEEDS) } as never,
      ),
      qb,
    }
  }

  const raw = (over: Record<string, unknown> = {}) => ({
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Tech lead Java',
    skills: [],
    headcount: 1,
    contract_kind: 'regie',
    status: 'won',
    shortlist_count: '0',
    project_id: '22222222-2222-4222-8222-222222222222',
    project_label: 'Migration data lake',
    project_stage: 'won',
    ...over,
  })

  it('rend les deux comptes — celui du rôle, et celui des missions sans rôle', async () => {
    const { service } = build([raw({ missions_assigned: '1', project_missions_unlinked: '2' })])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data[0]?.missions_assigned).toBe(1)
    expect(result.data[0]?.project_missions_unlinked).toBe(2)
  })

  it('demande le logo RÉEL du compte, et jamais son site', async () => {
    // Le site sert à DEVINER un favicon. Sur une carte de kanban, une image
    // devinée se lit comme une identité visuelle vérifiée : on ne la demande pas.
    const { service, qb } = build([raw()])
    await service.list('w-1', { offset: 0, limit: 50 })
    const selected = ((qb['select'] as jest.Mock).mock.calls[0]?.[0] as string[]) ?? []
    expect(selected.some(column => column.includes('account.logo_url'))).toBe(true)
    expect(selected.some(column => column.includes('account.website'))).toBe(false)
  })

  it('compte les missions du rôle SANS filtrer sur leur statut', async () => {
    // Une mission terminée est née de ce besoin autant qu'une mission active :
    // l'exclure ferait retomber le compteur à zéro le jour où elle s'achève.
    const { service, qb } = build([raw()])
    await service.list('w-1', { offset: 0, limit: 50 })
    const selected = ((qb['select'] as jest.Mock).mock.calls[0]?.[0] as string[]) ?? []
    const missionColumn = selected.find(column => column.includes('AS missions_assigned')) ?? ''
    expect(missionColumn).toContain('m.need_id = need.id')
    expect(missionColumn).not.toContain('m.status')
  })
})

/**
 * #2067.21 / #2067.22 — LA DÉCISION ET LA VOIE D'ACHAT du rail CLIENT.
 *
 * Le BTMMP (`opportunities.btmmp`) porte déjà ces deux axes (`management`,
 * `process`), saisis sur la fiche du PROJET — mais la jointure `opportunities`
 * existe déjà dans cette requête (compte, libellé…), donc la présence d'un
 * texte sur l'axe se lit SANS colonne neuve en base : c'est une dérivation, pas
 * une donnée. `need-discovery-rails.ts` n'a besoin que du booléen, jamais du
 * texte — le contenu reste sur `BtmmpPanel.tsx`.
 */
describe('OpenNeedsService — décision et voie d’achat (BTMMP du projet)', () => {
  const build = (rows: Record<string, unknown>[] = []) => {
    const qb: Record<string, unknown> = {}
    const chain = (...names: string[]) => {
      for (const name of names) qb[name] = jest.fn(() => qb)
    }
    chain('innerJoin', 'leftJoin', 'where', 'andWhere', 'select', 'orderBy', 'addOrderBy', 'offset', 'limit', 'clone')
    qb['getCount'] = jest.fn().mockResolvedValue(rows.length)
    qb['getRawMany'] = jest.fn().mockResolvedValue(rows)
    // #2035.11 — `manager.query` : vide = personne à charge côté
    // `openNeedsCountByOwner`, donc `sortByCommercialLoad` est un NO-OP et
    // l'ordre déjà posé par le SQL ci-dessus reste celui que ce test vérifie.
    const needs = { createQueryBuilder: jest.fn(() => qb), manager: { query: jest.fn().mockResolvedValue([]) } }
    return {
      service: new OpenNeedsService(
        needs as never,
        { maxOpenNeedsFor: jest.fn().mockResolvedValue(DEFAULT_MAX_OPEN_NEEDS) } as never,
      ),
      qb,
    }
  }

  const raw = (over: Record<string, unknown> = {}) => ({
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Tech lead Java',
    skills: [],
    headcount: 1,
    contract_kind: 'regie',
    status: 'to_qualify',
    shortlist_count: '0',
    project_id: '22222222-2222-4222-8222-222222222222',
    project_label: 'Migration data lake',
    project_stage: 'qualified',
    ...over,
  })

  it('rend `true` quand le texte de l’axe existe, `false` quand il est absent', async () => {
    const { service } = build([raw({ decision_known: true, buying_process_known: false })])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data[0]?.decision_known).toBe(true)
    expect(result.data[0]?.buying_process_known).toBe(false)
  })

  it('ne sélectionne jamais le TEXTE de l’axe — seulement sa présence', async () => {
    // Réexposer `btmmp->>'management'` ici referait le rendu de `BtmmpPanel.tsx`
    // sous une autre forme (loi 4 du tome 7) ; seule la présence voyage.
    const { service, qb } = build([raw()])
    await service.list('w-1', { offset: 0, limit: 50 })
    const selected = ((qb['select'] as jest.Mock).mock.calls[0]?.[0] as string[]) ?? []
    const decisionColumn = selected.find(column => column.includes('AS decision_known')) ?? ''
    const processColumn = selected.find(column => column.includes('AS buying_process_known')) ?? ''
    expect(decisionColumn).toContain("btmmp->>'management'")
    expect(decisionColumn).not.toBe('')
    expect(processColumn).toContain("btmmp->>'process'")
    expect(processColumn).not.toBe('')
  })
})

/**
 * #2175.12 — « RÉSULTAT ATTENDU » DE LA SYNTHÈSE, relu sur `project.objective`
 * (`ProjectRow.objective`, project.ts). Contrairement à décision/voie d'achat
 * ci-dessus, c'est le TEXTE lui-même qui voyage — aucun écran ne le rend
 * déjà à partir de cette ligne (`objective` n'est affiché QUE sur le pipe et
 * la fiche projet, jamais sur la fiche besoin avant ce lot).
 */
describe('OpenNeedsService — résultat attendu (objectif du projet)', () => {
  const build = (rows: Record<string, unknown>[] = []) => {
    const qb: Record<string, unknown> = {}
    const chain = (...names: string[]) => {
      for (const name of names) qb[name] = jest.fn(() => qb)
    }
    chain('innerJoin', 'leftJoin', 'where', 'andWhere', 'select', 'orderBy', 'addOrderBy', 'offset', 'limit', 'clone')
    qb['getCount'] = jest.fn().mockResolvedValue(rows.length)
    qb['getRawMany'] = jest.fn().mockResolvedValue(rows)
    const needs = { createQueryBuilder: jest.fn(() => qb), manager: { query: jest.fn().mockResolvedValue([]) } }
    return {
      service: new OpenNeedsService(
        needs as never,
        { maxOpenNeedsFor: jest.fn().mockResolvedValue(DEFAULT_MAX_OPEN_NEEDS) } as never,
      ),
      qb,
    }
  }

  const raw = (over: Record<string, unknown> = {}) => ({
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Tech lead Java',
    skills: [],
    headcount: 1,
    contract_kind: 'regie',
    status: 'to_qualify',
    shortlist_count: '0',
    project_id: '22222222-2222-4222-8222-222222222222',
    project_label: 'Migration data lake',
    project_stage: 'qualified',
    ...over,
  })

  it('relit le texte tel quel, `null` compris — jamais deviné dans le contexte', async () => {
    const { service } = build([raw({ project_objective: 'Uniformiser les temps de réponse client' })])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data[0]?.project_objective).toBe('Uniformiser les temps de réponse client')
  })

  it('rend `null`, jamais une chaîne vide, quand aucun objectif n’a été écrit', async () => {
    const { service } = build([raw({ project_objective: null })])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data[0]?.project_objective).toBeNull()
  })

  it('sélectionne `project.objective`, la même colonne que le pipe', async () => {
    const { service, qb } = build([raw()])
    await service.list('w-1', { offset: 0, limit: 50 })
    const selected = ((qb['select'] as jest.Mock).mock.calls[0]?.[0] as string[]) ?? []
    const column = selected.find(entry => entry.includes('AS project_objective')) ?? ''
    expect(column).toContain('project.objective')
  })
})

/**
 * « Un besoin sans candidat ouvre une piste ».
 *
 * `findReverseProspects` tombe en SQL brut (comme `ProjectsService.findSimilar`),
 * donc le double `manager.query` — la référence, puis les candidats — est ce
 * que ces tests vérifient, pas le classement (déjà couvert par
 * `reverse-need-prospects.spec.ts`).
 */
describe('OpenNeedsService — findReverseProspects', () => {
  const buildManager = () => {
    const manager = { query: jest.fn() }
    const needs = { manager }
    return {
      service: new OpenNeedsService(
        needs as never,
        { maxOpenNeedsFor: jest.fn().mockResolvedValue(DEFAULT_MAX_OPEN_NEEDS) } as never,
      ),
      manager,
    }
  }

  const reference = (over: Record<string, unknown> = {}) => ({
    id: 'n-1',
    location: 'Lyon',
    skills: [{ term: 'Java', required: true }],
    account_id: 'acc-1',
    ...over,
  })

  it('404-material : rend null quand le besoin est absent ou hors espace, sans second appel', async () => {
    const { service, manager } = buildManager()
    manager.query.mockResolvedValueOnce([])

    const result = await service.findReverseProspects('n-1', 'ws-1', 'user-1')

    expect(result).toBeNull()
    const [sql, params] = manager.query.mock.calls[0] as [string, unknown[]]
    expect(params).toEqual(['n-1', 'ws-1'])
    expect(sql).toContain('need.workspace_id = $2')
    expect(manager.query).toHaveBeenCalledTimes(1)
  })

  it('dit pourquoi le croisement ne tourne pas quand la ZONE manque — pas de deuxième requête', async () => {
    const { service, manager } = buildManager()
    manager.query.mockResolvedValueOnce([reference({ location: null })])

    const result = await service.findReverseProspects('n-1', 'ws-1', 'user-1')

    expect(result).toEqual({
      needId: 'n-1',
      location: null,
      skillTerms: ['Java'],
      unavailableReason: 'location_missing',
      matches: [],
    })
    expect(manager.query).toHaveBeenCalledTimes(1)
  })

  it('dit pourquoi le croisement ne tourne pas quand aucune COMPÉTENCE n’est typée', async () => {
    const { service, manager } = buildManager()
    manager.query.mockResolvedValueOnce([reference({ skills: [] })])

    const result = await service.findReverseProspects('n-1', 'ws-1', 'user-1')

    expect(result).toEqual({
      needId: 'n-1',
      location: 'Lyon',
      skillTerms: [],
      unavailableReason: 'skills_missing',
      matches: [],
    })
    expect(manager.query).toHaveBeenCalledTimes(1)
  })

  it('cherche sur les AUTRES comptes de l’espace, sur la même zone et les mêmes compétences', async () => {
    const { service, manager } = buildManager()
    manager.query.mockResolvedValueOnce([reference()]).mockResolvedValueOnce([])

    await service.findReverseProspects('n-1', 'ws-1', 'user-1')

    const [sql, params] = manager.query.mock.calls[1] as [string, unknown[]]
    // #2558.1 — « un AUTRE compte » se lit sur le compte du BESOIN : en
    // passant par le projet, les besoins sans projet n'auraient été ni
    // exclus (quand c'est le même compte) ni proposés (quand c'en est un autre).
    expect(sql).toContain('need.account_id <> $3')
    expect(sql).toContain('need.id <> $2')
    expect(sql).toContain('need.status = ANY($4')
    expect(sql).toContain('LOWER(need.location) = LOWER($5)')
    expect(sql).toContain('jsonb_array_elements(need.skills)')
    expect(params[0]).toBe('ws-1')
    expect(params[1]).toBe('n-1')
    expect(params[2]).toBe('acc-1')
    expect(params[4]).toBe('Lyon')
    expect(params[5]).toEqual(['java'])
  })

  it('dit « rien trouvé » plutôt que d’inventer — aucun candidat, mais le croisement A tourné', async () => {
    const { service, manager } = buildManager()
    manager.query.mockResolvedValueOnce([reference()]).mockResolvedValueOnce([])

    const result = await service.findReverseProspects('n-1', 'ws-1', 'user-1')

    // ⚠️ La distinction qui compte : `unavailableReason: null` dit que ça a
    // tourné, contrairement aux deux cas ci-dessus.
    expect(result).toEqual({
      needId: 'n-1',
      location: 'Lyon',
      skillTerms: ['Java'],
      unavailableReason: null,
      matches: [],
    })
  })

  it('rend les pistes avec les compétences PARTAGÉES et si le compte est déjà au portefeuille', async () => {
    const { service, manager } = buildManager()
    manager.query
      .mockResolvedValueOnce([
        reference({
          skills: [
            { term: 'Java', required: true },
            { term: 'Kubernetes', required: false },
          ],
        }),
      ])
      .mockResolvedValueOnce([
        {
          id: 'n-9',
          title: 'Tech lead Java',
          skills: [{ term: 'Java' }, { term: 'Kubernetes' }],
          project_id: 'p-9',
          project_label: 'Refonte SI',
          account_id: 'acc-9',
          account_name: 'ACME',
          location: 'lyon',
          assigned_to: 'user-1',
        },
        {
          id: 'n-8',
          title: 'Dev Java',
          skills: [{ term: 'Java' }],
          project_id: 'p-8',
          project_label: 'Portail',
          account_id: 'acc-8',
          account_name: 'GLOBEX',
          location: 'Lyon',
          assigned_to: 'user-2',
        },
      ])

    const result = await service.findReverseProspects('n-1', 'ws-1', 'user-1')

    expect(result?.unavailableReason).toBeNull()
    const matches = result?.matches as ReverseProspectMatch[]
    expect(matches.map(match => match.need_id)).toEqual(['n-9', 'n-8'])
    expect(matches[0].shared_skills).toEqual(['Java', 'Kubernetes'])
    // Le compte porte SA propre écriture de la zone, pas celle de la référence.
    expect(matches[0].location).toBe('lyon')
    // Assigné à L'APPELANT : c'est déjà un client à lui.
    expect(matches[0].already_in_portfolio).toBe(true)
    // Assigné à quelqu'un d'autre (ou personne) : une VRAIE piste neuve.
    expect(matches[1].already_in_portfolio).toBe(false)
  })
})

/**
 * #2067.25-.29 — DÉCISION Louis 17/09 : LE RAIL CONSULTANT EST PORTÉ PAR LE
 * CONSULTANT POSITIONNÉ (SOUMIS) SUR LE BESOIN.
 *
 * Chaque fait voyage tel qu'il est STOCKÉ (`submissions`, `consultants`),
 * jamais recalculé — ce test ne vérifie donc PAS un classement, seulement
 * que la lecture relit les bonnes colonnes et ne devine rien.
 */
describe('OpenNeedsService — le consultant POSITIONNÉ', () => {
  const build = (rows: Record<string, unknown>[] = []) => {
    const qb: Record<string, unknown> = {}
    const chain = (...names: string[]) => {
      for (const name of names) qb[name] = jest.fn(() => qb)
    }
    chain('innerJoin', 'leftJoin', 'where', 'andWhere', 'select', 'orderBy', 'addOrderBy', 'offset', 'limit', 'clone')
    qb['getCount'] = jest.fn().mockResolvedValue(rows.length)
    qb['getRawMany'] = jest.fn().mockResolvedValue(rows)
    // #2035.11 — `manager.query` : vide = personne à charge côté
    // `openNeedsCountByOwner`, donc `sortByCommercialLoad` est un NO-OP et
    // l'ordre déjà posé par le SQL ci-dessus reste celui que ce test vérifie.
    const needs = { createQueryBuilder: jest.fn(() => qb), manager: { query: jest.fn().mockResolvedValue([]) } }
    return {
      service: new OpenNeedsService(
        needs as never,
        { maxOpenNeedsFor: jest.fn().mockResolvedValue(DEFAULT_MAX_OPEN_NEEDS) } as never,
      ),
      qb,
    }
  }

  const raw = (over: Record<string, unknown> = {}) => ({
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Consultant sécurité applicative',
    skills: [],
    headcount: 1,
    contract_kind: 'regie',
    status: 'to_qualify',
    shortlist_count: '0',
    project_id: '22222222-2222-4222-8222-222222222222',
    project_label: 'Portail',
    project_stage: 'qualified',
    ...over,
  })

  it('rend le fait tel qu’il est stocké, sans rien recalculer', async () => {
    const { service } = build([
      raw({
        positioned_consultant: {
          submissionId: '33333333-3333-4333-8333-333333333333',
          consultantId: '44444444-4444-4444-8444-444444444444',
          consultantName: 'Inès Kaczmarek',
          submittedAt: '2026-09-09T00:00:00.000Z',
          fitScore: null,
          availability: 'sous_1_mois',
          proposedRateCents: 72_000,
          mobilityKnown: true,
          otherActiveSubmissions: 0,
          agreementConfirmed: true,
        },
        positioned_consultants_count: 1,
      }),
    ])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data[0]?.positioned_consultant).toEqual({
      submissionId: '33333333-3333-4333-8333-333333333333',
      consultantId: '44444444-4444-4444-8444-444444444444',
      consultantName: 'Inès Kaczmarek',
      submittedAt: '2026-09-09T00:00:00.000Z',
      fitScore: null,
      availability: 'sous_1_mois',
      proposedRateCents: 72_000,
      mobilityKnown: true,
      otherActiveSubmissions: 0,
      agreementConfirmed: true,
    })
    expect(result.data[0]?.positioned_consultants_count).toBe(1)
  })

  it('#2175.29 — lit l’accord réel dans la sous-requête, depuis les deux gestes de validation', async () => {
    const { service, qb } = build([raw()])
    await service.list('w-1', { offset: 0, limit: 50 })
    const selects = JSON.stringify((qb['select'] as jest.Mock).mock.calls)
    expect(selects).toContain("'agreementConfirmed'")
    expect(selects).toContain('c.tjm_validated_at IS NOT NULL AND c.cv_validated_at IS NOT NULL')
  })

  it('rend `null` — jamais un objet vide — quand aucun consultant n’est positionné', async () => {
    const { service } = build([raw({ positioned_consultant: null, positioned_consultants_count: 0 })])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    expect(result.data[0]?.positioned_consultant).toBeNull()
    expect(result.data[0]?.positioned_consultants_count).toBe(0)
  })

  it('la colonne du positionné filtre sur `submitted_at IS NOT NULL` et joint `need.id`', async () => {
    const { service, qb } = build([raw()])
    await service.list('w-1', { offset: 0, limit: 50 })
    const selected = ((qb['select'] as jest.Mock).mock.calls[0]?.[0] as string[]) ?? []
    const column = selected.find(c => c.includes('AS positioned_consultant')) ?? ''
    expect(column).toContain('sub.need_id = need.id')
    expect(column).toContain('sub.submitted_at IS NOT NULL')
    expect(column).toContain('ORDER BY sub.submitted_at DESC')
    const countColumn = selected.find(c => c.includes('AS positioned_consultants_count')) ?? ''
    expect(countColumn).toContain('sub3.submitted_at IS NOT NULL')
  })

  it('l’adéquation lit `pushable_score` déjà STOCKÉ — jamais un second classement', async () => {
    const { service, qb } = build([raw()])
    await service.list('w-1', { offset: 0, limit: 50 })
    const selected = ((qb['select'] as jest.Mock).mock.calls[0]?.[0] as string[]) ?? []
    const column = selected.find(c => c.includes('AS positioned_consultant')) ?? ''
    expect(column).toContain('sub.pushable_score')
    expect(column).not.toContain('correspondence_score')
  })
})

/**
 * #2842 (reste, 26/09) — épopée #2074.13-.19, tranché sans Louis :
 * `clientNeeds`/`needDetailing` (`CommercialTensionExternalSignals`,
 * `apps/web/src/features/commercial-audit/lib/tension-detectors.ts`), le
 * PREMIER comptage backend neuf du lot. « Qualifié » = le statut `qualified`
 * du terrain (`NEED_STATUS_ORDER`), jamais un statut en aval deviné.
 * « Réduit à un intitulé » = aucune compétence, aucune séniorité, aucune
 * localisation, aucune date de démarrage — ni contexte, ni contrainte, ni
 * échéance.
 */
describe('OpenNeedsService — commercialAuditSignals (#2842)', () => {
  const buildRaw = (row: Record<string, string>) => {
    const qb: Record<string, unknown> = {}
    const chain = (...names: string[]) => {
      for (const name of names) qb[name] = jest.fn(() => qb)
    }
    chain('select', 'addSelect', 'where', 'andWhere')
    qb['getRawOne'] = jest.fn().mockResolvedValue(row)
    const needs = { createQueryBuilder: jest.fn(() => qb) }
    return {
      service: new OpenNeedsService(needs as never, { maxOpenNeedsFor: jest.fn() } as never),
      qb,
    }
  }

  it('un espace sans besoin ouvert rend deux zéros MESURÉS, pas une absence', async () => {
    const { service } = buildRaw({ total: '0', qualified: '0', with_only_a_title: '0' })
    const signals = await service.commercialAuditSignals('w-1')
    expect(signals.clientNeeds).toEqual({ total: 0, qualified: 0 })
    expect(signals.needDetailing).toEqual({ total: 0, withOnlyATitle: 0 })
  })

  it('lit les trois compteurs, distincts', async () => {
    const { service } = buildRaw({ total: '9', qualified: '4', with_only_a_title: '2' })
    const signals = await service.commercialAuditSignals('w-1')
    expect(signals.clientNeeds).toEqual({ total: 9, qualified: 4 })
    expect(signals.needDetailing).toEqual({ total: 9, withOnlyATitle: 2 })
  })

  it('se borne au workspace ET aux besoins non archivés', async () => {
    const { service, qb } = buildRaw({ total: '0', qualified: '0', with_only_a_title: '0' })
    await service.commercialAuditSignals('w-1')
    const whereCall = (qb['where'] as jest.Mock).mock.calls[0]?.[1] as Record<string, unknown>
    expect(whereCall).toEqual({ workspaceId: 'w-1' })
    const andWhereCalls = (qb['andWhere'] as jest.Mock).mock.calls.map(call => call[0] as string)
    expect(andWhereCalls.some(sql => sql.includes('archived_at IS NULL'))).toBe(true)
  })
})
