import { NotFoundException } from '@nestjs/common'
import { NeedVerdictService } from './need-verdict.service'

/**
 * LE VERDICT « GO / NO-GO » D'UN BESOIN, côté serveur.
 *
 * Ce que ces tests tiennent, et qui n'est pas le calcul (il vit au contrat,
 * `need-verdict.ts`, avec ses trente-six tests) : que chaque axe est alimenté
 * par la BONNE lecture, et surtout qu'une lecture VIDE devient un axe NON
 * RENSEIGNÉ plutôt qu'un zéro. C'est là que la faute se produit — le contrat
 * refuse de confondre absence et zéro, un service peut très bien lui passer un
 * zéro fabriqué et rendre la discipline inopérante.
 */
describe('NeedVerdictService', () => {
  const WORKSPACE = 'w-1'
  const NEED_ID = '11111111-1111-4111-8111-111111111111'
  const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
  const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333'
  const RUN_ID = '44444444-4444-4444-8444-444444444444'
  const SOPHIE = '55555555-5555-4555-8555-555555555555'

  const NEED_ROW = {
    id: NEED_ID,
    target_tjm_cents: '65000',
    min_tjm_cents: '60000',
    start_on: '2026-10-01',
    project_id: PROJECT_ID,
    account_id: ACCOUNT_ID,
    // #3389 — le dossier de référence déclare ses achats et son risque : les
    // huit axes sont lus, et les tests plus anciens gardent leurs décomptes.
    procurement_involvement: 'non_implique',
    project_risks: 'Clause de pénalités de retard',
  }

  /** L'axe 8 du rapprochement, tel que le moteur l'écrit dans le journal. */
  function axes(availability: number | null, rate: number | null = 100, sector: number | null = 100) {
    return [
      { axis: 'availability', score: availability, weight: 12, detail: '', evidence: [] },
      { axis: 'rate', score: rate, weight: 8, detail: '', evidence: [] },
      { axis: 'sector', score: sector, weight: 8, detail: '', evidence: [] },
    ]
  }

  /**
   * Un faux `manager.query` routé par un fragment de SQL. Chaque clé est une
   * table : c'est ce qui rend lisible « cette lecture-là n'a rien rendu ».
   */
  function buildManager(over: Partial<Record<string, unknown[]>> = {}) {
    const answers: Record<string, unknown[]> = {
      project_needs: [NEED_ROW],
      match_runs: [{ id: RUN_ID, threshold: 60, evaluated_count: 12, created_at: '2026-08-30T09:00:00.000Z' }],
      above_threshold: [{ above: 3 }],
      match_run_entries: [{ consultant_id: SOPHIE, correspondence_score: 92, pushable_score: 78, axes: axes(100) }],
      consultants: [
        {
          id: SOPHIE,
          full_name: 'Sophie Martin',
          consent_given_at: '2026-01-01T00:00:00.000Z',
          consent_expires_at: '2027-01-01T00:00:00.000Z',
        },
      ],
      missions: [{ active: 2 }],
      account_partners: [{ total: 9, competitors: 8 }],
      project_contacts: [{ contacts: 4, deciders: 1 }],
      submissions: [{ consultant_id: SOPHIE, accepted: 2, rejected: 0 }],
      ...over,
    }
    return {
      query: jest.fn(async (sql: string) => {
        const lowered = sql.toLowerCase()
        // ⚠️ Le routage se fait sur `FROM <table>`, jamais sur le nom nu :
        // « submissions » CONTIENT « missions », et la première version de ce
        // faux servait donc le compteur de missions à la lecture des
        // positionnements. Le décompte des profils retenus se reconnaît en
        // plus à son agrégat, puisqu'il lit la même table que le détail.
        if (lowered.includes('count(*)::int as above')) return answers.above_threshold ?? []
        for (const table of [
          'project_needs',
          'match_runs',
          'match_run_entries',
          'consultants',
          'submissions',
          'missions',
          'account_partners',
          'project_contacts',
          'access_facts',
          'workspace_commercial_load_settings',
          'tasks',
        ]) {
          if (lowered.includes(`from ${table}`)) return answers[table] ?? []
        }
        return []
      }),
    }
  }

  function build(over: Partial<Record<string, unknown[]>> = {}) {
    const manager = buildManager(over)
    const needs = { manager }
    return { service: new NeedVerdictService(needs as never), manager }
  }

  const NOW = new Date('2026-09-01T00:00:00.000Z')

  it('refuse un besoin hors de l’espace — avant toute autre lecture', async () => {
    const { service, manager } = build({ project_needs: [] })
    await expect(service.forNeed(WORKSPACE, NEED_ID, NOW)).rejects.toBeInstanceOf(NotFoundException)
    // Une seule requête : on ne va pas chercher les missions d'un compte qu'on
    // n'a pas le droit de lire.
    expect(manager.query).toHaveBeenCalledTimes(1)
  })

  it('le dossier complet rend OUI, huit axes, et la date du rapprochement', async () => {
    const { service } = build()
    const response = await service.forNeed(WORKSPACE, NEED_ID, NOW)

    expect(response.verdict.verdict).toBe('go')
    expect(response.verdict.axisCount).toBe(8)
    expect(response.verdict.measuredCount).toBe(8)
    // Huit fournisseurs en face, plus le risque déclaré (#3389.10).
    expect(response.verdict.attentionCount).toBe(2)
    expect(response.runAt).toBe('2026-08-30T09:00:00.000Z')
  })

  it('#3389.8 — un fait de verrou FRAIS verrouille l’accès organisationnel ; périmé, il ne dit rien', async () => {
    const lockFact = (observed_at: string) => ({
      kind: 'lock',
      value: 'verrouille',
      provenance: 'human',
      observed_at,
    })
    const fresh = build({ access_facts: [lockFact('2026-06-01T00:00:00.000Z')] })
    const locked = await fresh.service.forNeed(WORKSPACE, NEED_ID, NOW)
    const accessAxis = locked.verdict.axes.find(axis => axis.axis === 'access')
    expect(accessAxis?.state).toBe('attention')
    expect(accessAxis?.measured).toMatchObject({ lock: 'verrouille' })

    const stale = build({ access_facts: [lockFact('2020-01-01T00:00:00.000Z')] })
    const unknown = await stale.service.forNeed(WORKSPACE, NEED_ID, NOW)
    const staleAxis = unknown.verdict.axes.find(axis => axis.axis === 'access')
    expect(staleAxis?.state).toBe('positive')
    expect(staleAxis?.measured).not.toHaveProperty('lock')
  })

  it('#3390 — la méthode se lit sur LE MÊME verdict, jamais un second calcul', async () => {
    const { service } = build()
    const response = await service.forNeed(WORKSPACE, NEED_ID, NOW)

    // GO, décideur connu (1), client déjà connu (2 missions actives), pas
    // stagnant (le faux `manager` ne sert aucune ligne `shortlists`, donc la
    // sous-requête EXISTS reste fausse par construction du mock) : l'ouverture
    // capitalise sur la relation, la trajectoire passe par le haut.
    expect(response.method?.effortLevel).toBe('sprint_court')
    expect(response.method?.openingRoute).toBe('reactivation_chaude')
    expect(response.method?.trajectory).toBe('par_le_haut')
    expect(response.method?.usefulPeople).toEqual(['decision_maker'])
  })

  it('#3390 — NO-GO : la méthode arrête tout, aucune route ni trajectoire', async () => {
    const { service } = build({
      project_contacts: [{ contacts: 4, deciders: 1 }],
      account_partners: [{ total: 9, competitors: 8 }],
    })
    // TJM cible sous le plancher ⇒ économie BLOQUANTE ⇒ verdict NO-GO.
    const manager = {
      query: jest.fn(async (sql: string) => {
        const lowered = sql.toLowerCase()
        if (lowered.includes('from project_needs') && lowered.includes('exists')) return [{ stale: false }]
        if (lowered.includes('from project_needs')) return [{ ...NEED_ROW, target_tjm_cents: '50000' }]
        if (lowered.includes('count(*)::int as above')) return [{ above: 3 }]
        if (lowered.includes('from match_runs'))
          return [{ id: RUN_ID, threshold: 60, evaluated_count: 12, created_at: '2026-08-30T09:00:00.000Z' }]
        if (lowered.includes('from match_run_entries'))
          return [{ consultant_id: SOPHIE, correspondence_score: 92, pushable_score: 78, axes: axes(100) }]
        if (lowered.includes('from missions')) return [{ active: 2 }]
        if (lowered.includes('from account_partners')) return [{ total: 9, competitors: 8 }]
        if (lowered.includes('from project_contacts')) return [{ contacts: 4, deciders: 1 }]
        return []
      }),
    }
    const service2 = new NeedVerdictService({ manager } as never)
    const response = await service2.forNeed(WORKSPACE, NEED_ID, NOW)

    expect(response.verdict.verdict).toBe('no_go')
    expect(response.method?.effortLevel).toBe('pause_sortie')
    expect(response.method?.openingRoute).toBeNull()
    expect(response.method?.trajectory).toBeNull()
    expect(response.method?.switchCondition).toBe('on_human_reopens')
  })

  it('les centimes arrivent en TEXTE du pilote pg — ils sont lus comme des nombres', async () => {
    // `bigint` sort en `string` chez node-postgres. Un `>=` entre deux chaînes
    // comparerait « 9000 » à « 65000 » lexicographiquement, et déclarerait le
    // besoin sous son plancher.
    const { service } = build({
      project_needs: [{ ...NEED_ROW, target_tjm_cents: '9000', min_tjm_cents: '65000' }],
    })
    const response = await service.forNeed(WORKSPACE, NEED_ID, NOW)
    expect(response.verdict.blockingAxes).toEqual(['economics'])
    expect(response.verdict.verdict).toBe('no_go')
  })

  it('⚠️ AUCUN rapprochement ⇒ les axes 1 et 5 sont NON RENSEIGNÉS, jamais zéro', async () => {
    const { service } = build({ match_runs: [] })
    const response = await service.forNeed(WORKSPACE, NEED_ID, NOW)

    expect(response.verdict.unmeasuredAxes).toEqual(['staffing_capacity', 'feasibility'])
    // Et l'axe décisif manquant interdit le OUI — une ignorance n'est pas une promesse.
    expect(response.verdict.verdict).toBe('insufficient_data')
    expect(response.profiles).toEqual([])
    expect(response.runAt).toBeNull()
  })

  it('⚠️ un panel JAMAIS renseigné n’est pas « zéro concurrent »', async () => {
    const { service } = build({ account_partners: [{ total: 0, competitors: 0 }] })
    const response = await service.forNeed(WORKSPACE, NEED_ID, NOW)
    expect(response.verdict.unmeasuredAxes).toEqual(['competition'])
    expect(response.verdict.measuredCount).toBe(7)
  })

  it('⚠️ aucun contact sur l’affaire ⇒ l’accès n’est pas renseigné', async () => {
    const { service } = build({ project_contacts: [{ contacts: 0, deciders: 0 }] })
    const response = await service.forNeed(WORKSPACE, NEED_ID, NOW)
    expect(response.verdict.unmeasuredAxes).toEqual(['access'])
  })

  it('des contacts sans décideur ⇒ ATTENTION mesurée, pas un axe vide', async () => {
    const { service } = build({ project_contacts: [{ contacts: 4, deciders: 0 }] })
    const response = await service.forNeed(WORKSPACE, NEED_ID, NOW)
    const access = response.verdict.axes.find(axis => axis.axis === 'access')
    expect(access?.state).toBe('attention')
    expect(access?.measured).toEqual({ contacts: 4, decisionMaker: false })
  })

  it('un besoin sans compte : relation ET concurrence sortent, sans requête inutile', async () => {
    const { service } = build({ project_needs: [{ ...NEED_ROW, account_id: null }] })
    const response = await service.forNeed(WORKSPACE, NEED_ID, NOW)
    expect(response.verdict.unmeasuredAxes).toEqual(['relationship', 'competition'])
  })

  it('la lecture d’acceptation est faite de FAITS, et le consentement est AFFICHÉ', async () => {
    const { service } = build()
    const [sophie] = (await service.forNeed(WORKSPACE, NEED_ID, NOW)).profiles

    expect(sophie.fullName).toBe('Sophie Martin')
    expect(sophie.correspondenceScore).toBe(92)
    expect(sophie.pushableScore).toBe(78)
    expect(sophie.acceptance).toEqual([
      { fact: 'accepted_here', count: 2 },
      { fact: 'rate_within_target', count: null },
      { fact: 'available_by_start', count: null },
      { fact: 'sector_practised', count: null },
    ])
    expect(sophie.consentState).toBe('valid')
  })

  it('refonte Théo — la correspondance s’écrit en clair, sur les axes du même rapprochement', async () => {
    const { service } = build({
      match_run_entries: [
        {
          consultant_id: SOPHIE,
          correspondence_score: 92,
          pushable_score: 78,
          axes: [
            {
              axis: 'must_have',
              score: 50,
              weight: 30,
              detail: '1/2 couvertes — manque Migration',
              evidence: [{ label: 'SAP S/4HANA — mission', source: 'mission' }],
            },
            ...axes(100, null),
          ],
        },
      ],
    })
    const response = await service.forNeed(WORKSPACE, NEED_ID, NOW)
    const [sophie] = response.profiles
    expect(sophie.inClear?.correspondsSkills).toEqual(['SAP S/4HANA'])
    expect(sophie.inClear?.lacksSkills).toEqual(['Migration'])
    expect(sophie.inClear?.toConfirmAxes).toEqual(['rate'])
    // Les profils POSITIONNÉS reçoivent la même lecture, par la même fonction.
    expect(response.positionedInClear?.[0]).toEqual({ consultantId: SOPHIE, inClear: sophie.inClear })
  })

  it('sans rapprochement, aucun positionné ne reçoit de correspondance devinée', async () => {
    const { service } = build({ match_runs: [] })
    const response = await service.forNeed(WORKSPACE, NEED_ID, NOW)
    expect(response.positionedInClear).toEqual([])
  })

  it('jamais présenté ici est un FAIT, pas un silence', async () => {
    const { service } = build({ submissions: [] })
    const [profile] = (await service.forNeed(WORKSPACE, NEED_ID, NOW)).profiles
    expect(profile.acceptance[0]).toEqual({ fact: 'never_presented_here', count: null })
  })

  it('⚠️ un consentement JAMAIS RECUEILLI est affiché, et n’écarte PAS le profil', async () => {
    // `c45_consentement_positionnement` : `expired` refuse, `none` avertit et
    // laisse passer. Ce verdict n'a aucun chemin pour durcir le second.
    const { service } = build({
      consultants: [{ id: SOPHIE, full_name: 'Sophie Martin', consent_given_at: null, consent_expires_at: null }],
    })
    const response = await service.forNeed(WORKSPACE, NEED_ID, NOW)
    expect(response.profiles).toHaveLength(1)
    expect(response.profiles[0].consentState).toBe('none')
    expect(response.profiles[0].consentDaysLeft).toBeNull()
    // Le profil compte toujours dans « qui passe le seuil ».
    expect(response.verdict.verdict).toBe('go')
  })

  it('un consentement qui approche porte SES jours restants', async () => {
    const { service } = build({
      consultants: [
        {
          id: SOPHIE,
          full_name: 'Sophie Martin',
          consent_given_at: '2026-01-01T00:00:00.000Z',
          consent_expires_at: '2026-09-29T00:00:00.000Z',
        },
      ],
    })
    const [profile] = (await service.forNeed(WORKSPACE, NEED_ID, NOW)).profiles
    expect(profile.consentState).toBe('expiring')
    expect(profile.consentDaysLeft).toBe(28)
  })

  it('un profil dont le nom ne se résout pas est ÉCARTÉ, jamais nommé « inconnu »', async () => {
    const { service } = build({ consultants: [] })
    const response = await service.forNeed(WORKSPACE, NEED_ID, NOW)
    expect(response.profiles).toEqual([])
    // Mais il compte toujours au seuil : le compteur vient de la base, pas des noms.
    const staffing = response.verdict.axes.find(axis => axis.axis === 'staffing_capacity')
    expect(staffing?.measured).toEqual({ count: 3, threshold: 60 })
  })

  it('⚠️ aucune requête ne demande une photo, un âge ni une adresse', async () => {
    const { service, manager } = build()
    await service.forNeed(WORKSPACE, NEED_ID, NOW)
    const all = manager.query.mock.calls.map(call => String(call[0]).toLowerCase()).join(' ')
    // La garde LIT quelque chose : ces deux témoins existent dans le SQL émis.
    expect(all).toContain('full_name')
    expect(all).toContain('consent_expires_at')
    for (const forbidden of ['photo', 'birth', 'naissance', 'gender', 'genre', 'nationalit', 'address', 'adresse']) {
      expect(`${forbidden} → ${all.includes(forbidden)}`).toBe(`${forbidden} → false`)
    }
  })

  it('lit le cadre d’achat du besoin et le risque du projet, sans rien recalculer', async () => {
    const { service } = build({
      project_needs: [{ ...NEED_ROW, procurement_involvement: 'implique', project_risks: 'Clause de pénalités' }],
    })
    const { verdict } = await service.forNeed(WORKSPACE, NEED_ID, new Date('2026-09-01T00:00:00.000Z'))
    expect(verdict.axes.find(a => a.axis === 'procurement')).toMatchObject({ state: 'attention' })
    expect(verdict.axes.find(a => a.axis === 'contract_risk')).toMatchObject({ state: 'attention' })
    expect(verdict.verdict).toBe('go')
  })

  it('une valeur d’achat inattendue en base se lit « non renseigné », jamais devinée', async () => {
    const { service } = build({
      project_needs: [{ ...NEED_ROW, procurement_involvement: 'peut-etre', project_risks: '  ' }],
    })
    const { verdict } = await service.forNeed(WORKSPACE, NEED_ID, new Date('2026-09-01T00:00:00.000Z'))
    // Cadre d'achat inconnu et risque non saisi : HORS décompte, nommés.
    expect(verdict.unmeasuredAxes).toEqual(['procurement', 'contract_risk'])
  })
  // #3390.9 — la capacité DÉCLARÉE du commercial voyage avec le verdict ; absente = `null`, jamais 0 h.
  it('porte la capacité hebdomadaire déclarée de l’espace (#3390.9)', async () => {
    const { service } = build({ workspace_commercial_load_settings: [{ weekly_available_hours: 12 }] })
    const result = await service.forNeed(WORKSPACE, NEED_ID, NOW)
    expect(result.commercialContext).toEqual({ weeklyAvailableHours: 12, fiveP: null, overdueActions: null })
  })

  it('sans réglage de charge : `null`, jamais zéro heure (#3390.9)', async () => {
    const { service } = build()
    const result = await service.forNeed(WORKSPACE, NEED_ID, NOW)
    expect(result.commercialContext?.weeklyAvailableHours).toBeNull()
  })

  it('un réglage à 0 heure se lit non déclaré, pas « 0 h » (#3390.9)', async () => {
    const { service } = build({ workspace_commercial_load_settings: [{ weekly_available_hours: 0 }] })
    const result = await service.forNeed(WORKSPACE, NEED_ID, NOW)
    expect(result.commercialContext?.weeklyAvailableHours).toBeNull()
  })

  // #3390.9 (reste) — la charge RÉELLE du commercial : ses actions en retard, DITES, jamais pondérées.
  it('porte le nombre d’actions en retard du commercial qui ouvre la fiche (#3390.9)', async () => {
    const { service, manager } = build({ tasks: [{ overdue: 4 }] })
    const result = await service.forNeed(WORKSPACE, NEED_ID, NOW, 'user-1')
    expect(result.commercialContext?.overdueActions).toBe(4)
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('FROM tasks'), [WORKSPACE, 'user-1'])
  })

  it('sans lecteur identifié : `null`, aucune lecture des tâches — jamais « 0 retard » (#3390.9)', async () => {
    const { service, manager } = build({ tasks: [{ overdue: 4 }] })
    const result = await service.forNeed(WORKSPACE, NEED_ID, NOW)
    expect(result.commercialContext?.overdueActions).toBeNull()
    expect(manager.query).not.toHaveBeenCalledWith(expect.stringContaining('FROM tasks'), expect.anything())
  })

  it('accountIdOf rend le compte du besoin, et refuse un besoin hors de l’espace (#3390.9)', async () => {
    const { service } = build()
    await expect(service.accountIdOf(WORKSPACE, NEED_ID)).resolves.toBe(ACCOUNT_ID)
    const empty = build({ project_needs: [] })
    await expect(empty.service.accountIdOf(WORKSPACE, NEED_ID)).rejects.toBeInstanceOf(NotFoundException)
  })

  // #3390.10/.11 — Laura lit la méthode du besoin OUVERT du compte actif.
  it('#3390.10 — openNeedIdOfAccount : le besoin ouvert le plus récent du compte, borné à l’espace', async () => {
    const { service, manager } = build({ project_needs: [{ id: NEED_ID }] })
    await expect(service.openNeedIdOfAccount(WORKSPACE, ACCOUNT_ID)).resolves.toBe(NEED_ID)
    const [sql, params] = manager.query.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toContain('n.workspace_id = $1')
    expect(sql).toContain('n.account_id = $2')
    // La même définition d'« ouvert » que le verdict et le briefing (GA-26).
    expect(sql).toMatch(/n\.status IN \(/)
    expect(sql).toMatch(/ORDER BY n\.created_at DESC/i)
    expect(params).toEqual([WORKSPACE, ACCOUNT_ID])
  })

  it('#3390.10 — aucun besoin ouvert sur le compte ⇒ null, jamais une méthode devinée', async () => {
    const { service } = build({ project_needs: [] })
    await expect(service.openNeedIdOfAccount(WORKSPACE, ACCOUNT_ID)).resolves.toBeNull()
  })
})
