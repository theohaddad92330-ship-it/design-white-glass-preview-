import { NotFoundException } from '@nestjs/common'
import { MEMORY_POLICY_DEFAULTS, memoryBridgeViewSchema } from '@bellum/contracts'
import { WorkspaceMemoryCrossingsService } from './workspace-memory-crossings.service'

/**
 * LA MÉMOIRE COLLECTIVE — ce que ces tests tiennent.
 *
 *  1. **L'isolation.** Toute requête porte `workspace_id = $1`, et l'espace
 *     n'entre jamais par un paramètre d'appel. Les espaces sont des ESN, donc
 *     des concurrents (GA-43).
 *  2. **Le corps des messages est hors de portée.** Aucune requête ne nomme
 *     `activities` — la table qui porte `body`. Ce n'est pas un filtre à ne pas
 *     oublier : c'est une table qu'on ne lit pas.
 *  3. **Une source tombée est NOMMÉE**, elle ne se confond pas avec « rien à
 *     signaler ».
 *  4. **« Non mesuré » n'est jamais « 0 »** sur le compteur de mises en relation.
 *  5. **Rien ne se réattribue.** Le seul `INSERT` du service écrit une trace.
 *  6. **Aucun classement entre pairs**, et aucun croisement C3 tant qu'aucun
 *     agrégat n'est k-anonymisé.
 */
describe('WorkspaceMemoryCrossingsService', () => {
  const WS = 'ws-1'
  const ME = '11111111-1111-4111-8111-111111111111'
  const DAVID = '22222222-2222-4222-8222-222222222222'
  const ACCOUNT = '33333333-3333-4333-8333-333333333333'
  const MISSION = '44444444-4444-4444-8444-444444444444'

  type Build = {
    /** Chaque appel SQL, dans l'ordre : le test répond selon ce que la requête dit. */
    answer?: (sql: string, params: unknown[]) => unknown[] | Error
    account?: { id: string; company_name: string } | null
    portfolioVisibility?: string
  }

  const build = (over: Build = {}) => {
    const queries: { sql: string; params: unknown[] }[] = []
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      const answered = over.answer?.(sql, params)
      if (answered instanceof Error) throw answered
      return answered ?? []
    })

    const accounts = {
      findOne: jest
        .fn()
        .mockResolvedValue(over.account === undefined ? { id: ACCOUNT, company_name: 'BNP Paribas' } : over.account),
      count: jest.fn().mockResolvedValue(1),
      manager: { query },
    }
    const workspaces = {
      findOne: jest.fn().mockResolvedValue({ id: WS, portfolio_visibility: over.portfolioVisibility ?? 'open' }),
    }
    const bridges = { manager: { query } }
    const context = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS, role: 'sales' }) }

    const service = new WorkspaceMemoryCrossingsService(
      accounts as never,
      workspaces as never,
      bridges as never,
      context as never,
    )
    return { service, queries, accounts, context }
  }

  /** Une ligne G1 plausible, telle que la requête la rendrait. */
  const openDoorRow = {
    mission_id: MISSION,
    role_title: 'Consultant Java',
    label: 'Mission BNP',
    started_on: '2026-03-04',
    status: 'active',
    owner_id: DAVID,
    first_name: 'David',
    role: 'sales',
  }

  describe('l’isolation — un croisement naît dans un espace et y reste', () => {
    it('borne CHAQUE requête sur `workspace_id = $1`, et l’espace ne vient jamais de l’appelant', async () => {
      const { service, queries, context } = build()
      await service.view(ME, ACCOUNT)

      // Preuve que la garde LIT : il y a bien des requêtes à inspecter.
      expect(queries.length).toBeGreaterThanOrEqual(5)
      for (const { sql, params } of queries) {
        expect(sql).toMatch(/workspace_id\s*=\s*\$1/)
        expect(params[0]).toBe(WS)
      }
      // L'espace est résolu côté serveur depuis l'identité, pas reçu.
      expect(context.resolveActiveWorkspace).toHaveBeenCalledWith(ME)
    })

    it('sait dire NON — une requête sans borne d’espace ne satisferait pas ce contrôle', () => {
      const nue = `SELECT company_name FROM accounts ORDER BY created_at DESC`
      const bornee = `SELECT company_name FROM accounts WHERE workspace_id = $1`
      expect(/workspace_id\s*=\s*\$1/.test(nue)).toBe(false)
      expect(/workspace_id\s*=\s*\$1/.test(bornee)).toBe(true)
    })
  })

  describe('le corps des messages n’est pas dans le rayon de la requête', () => {
    it('ne lit JAMAIS `activities` — la table qui porte `body`', async () => {
      const { service, queries } = build()
      await service.view(ME, ACCOUNT)
      await service.listAccounts(ME)

      const all = queries.map(entry => entry.sql).join('\n')
      expect(all).not.toMatch(/\bFROM\s+activities\b/i)
      expect(all).not.toMatch(/\bJOIN\s+activities\b/i)
      expect(all).not.toMatch(/\bbody\b/)
      expect(all).not.toMatch(/\bteam_comments\b/)
      expect(all).not.toMatch(/\bnotes\b/)
      // Et la source qui EST lue pour la collision, elle, y est.
      expect(all).toMatch(/\bFROM\s+user_actions\b/i)
    })

    it('ne sélectionne aucune colonne d’économie du deal', async () => {
      const { service, queries } = build()
      await service.view(ME, ACCOUNT)
      const all = queries.map(entry => entry.sql).join('\n')
      for (const forbidden of ['daily_rate', 'daily_cost', 'tjm', 'margin', 'amount_cents', 'cost_rate_cents']) {
        expect(all).not.toContain(forbidden)
      }
    })
  })

  describe('G1 — porte d’entrée déjà ouverte', () => {
    it('rend un croisement complet, valide au contrat', async () => {
      const { service } = build({
        answer: sql => (sql.includes('FROM missions m') && sql.includes('LIMIT 1') ? [openDoorRow] : []),
      })
      const view = await service.view(ME, ACCOUNT)

      // Le contrat est la garde : si la charge portait un champ de trop, ou une
      // chaîne libre, `parse` lèverait ici.
      expect(() => memoryBridgeViewSchema.parse(view)).not.toThrow()

      const g1 = view.crossings.find(crossing => crossing.kind === 'openDoor')
      expect(g1).toBeDefined()
      expect(g1?.circle).toBe('c2')
      expect(g1?.action).toBe('talkToOwnerFirst')
      expect(g1?.colleague).toEqual({ kind: 'member', userId: DAVID, displayName: 'David', role: 'sales' })
      expect(g1?.detail).toEqual({
        kind: 'openDoor',
        mission: { kind: 'mission', id: MISSION, label: 'Consultant Java' },
        startedOn: '2026-03-04',
        stillActive: true,
      })
    })

    /**
     * `missions.started_on` est une colonne `date` : en SQL brut, `pg` en rend
     * un objet `Date` à minuit LOCAL — pas la chaîne que le type annonce. Le
     * test d'à côté passait une chaîne, donc ne voyait rien ; en production,
     * `new Date(`${row.started_on}T00:00:00.000Z`)` composait « Wed Mar 04 2026
     * … T00:00:00.000Z », donc `Invalid Date`, donc `RangeError: Invalid time
     * value` — le croisement G1 faisait tomber tout l'écran de mémoire.
     */
    it('accepte une date rendue en objet par le pilote SQL', async () => {
      const { service } = build({
        answer: sql =>
          sql.includes('FROM missions m') && sql.includes('LIMIT 1')
            ? [{ ...openDoorRow, started_on: new Date(2026, 2, 4) }]
            : [],
      })
      const view = await service.view(ME, ACCOUNT)
      const g1 = view.crossings.find(crossing => crossing.kind === 'openDoor')
      expect(g1?.observedAt).toBe('2026-03-04T00:00:00.000Z')
      expect(g1?.detail).toMatchObject({ startedOn: '2026-03-04' })
    })

    it('exclut le porteur QUI DEMANDE — un pont vers soi-même n’est pas un pont', async () => {
      const { service, queries } = build({ answer: () => [] })
      await service.view(ME, ACCOUNT)
      const missionQuery = queries.find(entry => entry.sql.includes('FROM missions m')) as {
        sql: string
        params: unknown[]
      }
      expect(missionQuery.sql).toContain('m.owner_id <> $3')
      expect(missionQuery.params[2]).toBe(ME)
    })

    it('exclut une mission INTERROMPUE — le contraire d’une porte ouverte', async () => {
      const { service, queries } = build({ answer: () => [] })
      await service.view(ME, ACCOUNT)
      const missionQuery = queries.find(entry => entry.sql.includes('FROM missions m')) as { sql: string }
      expect(missionQuery.sql).toContain("m.status <> 'terminated'")
      // Et une mission sans consultant affecté n'est pas une porte : la jointure
      // sur les affectations est ce qui le dit.
      expect(missionQuery.sql).toContain('JOIN mission_assignments')
    })

    it('dit « la mission est terminée » quand elle l’est — `stillActive` VARIE', async () => {
      const { service } = build({
        answer: sql =>
          sql.includes('FROM missions m') && sql.includes('LIMIT 1') ? [{ ...openDoorRow, status: 'ended' }] : [],
      })
      const view = await service.view(ME, ACCOUNT)
      const g1 = view.crossings.find(crossing => crossing.kind === 'openDoor')
      expect(g1?.detail).toMatchObject({ stillActive: false })
    })

    it('n’émet rien plutôt qu’un intitulé deviné, quand la mission n’a pas de nom lisible', async () => {
      const { service } = build({
        answer: sql =>
          sql.includes('FROM missions m') && sql.includes('LIMIT 1')
            ? [{ ...openDoorRow, role_title: null, label: null }]
            : [],
      })
      const view = await service.view(ME, ACCOUNT)
      expect(view.crossings.filter(crossing => crossing.kind === 'openDoor')).toEqual([])
    })
  })

  describe('G4 — collision de prospection', () => {
    it('emprunte sa fenêtre au réglage « porteur prioritaire », lu à un seul endroit', async () => {
      const { service, queries } = build({
        answer: sql =>
          sql.includes('FROM user_actions ua') && sql.includes('LIMIT 1')
            ? [{ user_id: DAVID, last_touch: new Date('2026-08-30T10:00:00Z'), first_name: 'Sarah', role: 'sales' }]
            : [],
      })
      const view = await service.view(ME, ACCOUNT)

      const g4 = view.crossings.find(crossing => crossing.kind === 'prospectionCollision')
      expect(g4?.detail).toEqual({
        kind: 'prospectionCollision',
        lastTouchOn: '2026-08-30',
        withinDays: MEMORY_POLICY_DEFAULTS.ownerPriorityDays,
      })
      // Le nombre voyage jusqu'à la requête : il n'est pas réécrit en dur.
      const collision = queries.find(entry => entry.sql.includes('FROM user_actions ua')) as { params: unknown[] }
      expect(collision.params[3]).toBe(MEMORY_POLICY_DEFAULTS.ownerPriorityDays)
    })

    it('ne prend qu’UN collègue, le plus récent — pas un palmarès des plus actifs', async () => {
      const { service, queries } = build({ answer: () => [] })
      await service.view(ME, ACCOUNT)
      const collision = queries.find(entry => entry.sql.includes('FROM user_actions ua')) as { sql: string }
      expect(collision.sql).toContain('ORDER BY last_touch DESC')
      expect(collision.sql).toContain('LIMIT 1')
      // Aucun comptage de touches : compter les gestes de quelqu'un est un
      // classement entre pairs, que la doctrine refuse (§24 Red Team).
      expect(collision.sql).not.toMatch(/COUNT\s*\(/i)
    })
  })

  describe('G9 — intercontrat qui matche', () => {
    it('demande « un besoin encore ouvert » au contrat, jamais à la main (GA-62)', async () => {
      const { service, queries } = build({ answer: () => [] })
      await service.view(ME, ACCOUNT)
      const staffing = queries.find(entry => entry.sql.includes('FROM project_needs n')) as { sql: string }
      // La liste vient de `needStillOpenSql` : elle contient les ouverts…
      expect(staffing.sql).toContain("n.status IN ('to_qualify'")
      // …et jamais un statut clos.
      expect(staffing.sql).not.toContain("'won'")
      expect(staffing.sql).not.toContain("'cancelled'")
    })

    it('ne propose jamais un consultant dont la disponibilité est INCONNUE', async () => {
      const { service, queries } = build({ answer: () => [] })
      await service.view(ME, ACCOUNT)
      const staffing = queries.find(entry => entry.sql.includes('FROM project_needs n')) as { sql: string }
      expect(staffing.sql).toContain("c.availability IN ('immediate', 'sous_1_mois')")
      expect(staffing.sql).not.toContain("'inconnu'")
    })

    it('exige une compétence COMMUNE — « correspond » a une définition, pas un score', async () => {
      const { service, queries } = build({ answer: () => [] })
      await service.view(ME, ACCOUNT)
      const staffing = queries.find(entry => entry.sql.includes('FROM project_needs n')) as { sql: string }
      expect(staffing.sql).toContain('jsonb_array_elements(n.skills)')
      expect(staffing.sql).toContain('unnest(c.stack)')
    })

    it('ne lit AUCUN critère protégé sur la personne du consultant (GA-06)', async () => {
      const { service, queries } = build()
      await service.view(ME, ACCOUNT)
      const all = queries.map(entry => entry.sql).join('\n')
      for (const forbidden of ['photo_url', 'birth', 'gender', 'nationality', 'address']) {
        expect(all).not.toContain(forbidden)
      }
    })
  })

  describe('G11 — référencement déjà connu', () => {
    it('déduit le rang du MODE d’entrée, jamais d’un champ libre', async () => {
      const { service } = build({
        answer: sql =>
          sql.includes('FROM access_facts af')
            ? [
                {
                  value: 'rang2_soustraitance',
                  observed_at: new Date('2024-05-02T00:00:00Z'),
                  created_at: new Date('2026-01-01T00:00:00Z'),
                },
              ]
            : [],
      })
      const view = await service.view(ME, ACCOUNT)
      const g11 = view.crossings.find(crossing => crossing.kind === 'knownReferencing')
      expect(g11?.circle).toBe('c1')
      expect(g11?.colleague).toEqual({ kind: 'role', role: 'sales_ops' })
      expect(g11?.detail).toEqual({ kind: 'knownReferencing', rank: 2, sinceYear: 2024 })
    })

    it('n’invente pas d’année quand le fait n’a pas de date d’observation', async () => {
      const { service } = build({
        answer: sql =>
          sql.includes('FROM access_facts af')
            ? [{ value: 'direct_reference', observed_at: null, created_at: new Date('2026-01-01T00:00:00Z') }]
            : [],
      })
      const view = await service.view(ME, ACCOUNT)
      const g11 = view.crossings.find(crossing => crossing.kind === 'knownReferencing')
      expect(g11?.detail).toEqual({ kind: 'knownReferencing', rank: 1, sinceYear: null })
    })

    it('ne lit pas le COÛT d’accès — il ne s’agrège jamais (GA-43), et n’a rien à faire sur un pont', async () => {
      const { service, queries } = build({ answer: () => [] })
      await service.view(ME, ACCOUNT)
      const facts = queries.find(entry => entry.sql.includes('FROM access_facts af')) as { sql: string }
      expect(facts.sql).toContain("af.kind = 'mode'")
      expect(facts.sql).not.toContain("'cost'")
      expect(facts.sql).not.toContain('af.detail')
    })
  })

  describe('une source qui tombe est NOMMÉE', () => {
    it('ne confond pas « illisible » avec « rien à signaler »', async () => {
      const { service } = build({
        answer: sql => (sql.includes('FROM project_needs n') ? new Error('relation manquante') : []),
      })
      const view = await service.view(ME, ACCOUNT)
      expect(view.unreadableSources).toEqual(['projectNeeds'])
      expect(view.crossings).toEqual([])
    })

    it('une source qui répond ne se nomme pas', async () => {
      const { service } = build({ answer: () => [] })
      const view = await service.view(ME, ACCOUNT)
      expect(view.unreadableSources).toEqual([])
    })
  })

  describe('le compteur de mises en relation', () => {
    it('rend `null` — « pas assez d’historique » — quand le journal est vide pour cet espace', async () => {
      const { service } = build({
        answer: sql => (sql.includes('workspace_bridge_contacts') ? [{ total: '0', since: null }] : []),
      })
      const view = await service.view(ME, ACCOUNT)
      expect(view.connections).toEqual({ connectionsThisMonth: null, measuredSince: null })
    })

    it('rend `0` quand il y a de l’historique et rien ce mois-ci — une mesure VRAIE', async () => {
      const { service } = build({
        answer: sql =>
          sql.includes('workspace_bridge_contacts') ? [{ total: '0', since: new Date('2026-06-01T00:00:00Z') }] : [],
      })
      const view = await service.view(ME, ACCOUNT)
      expect(view.connections.connectionsThisMonth).toBe(0)
      expect(view.connections.measuredSince).toBe('2026-06-01T00:00:00.000Z')
    })

    it('compte l’ESPACE, jamais les personnes — aucun regroupement par membre', async () => {
      const { service, queries } = build({ answer: () => [] })
      await service.view(ME, ACCOUNT)
      const counter = queries.find(entry => entry.sql.includes('FROM workspace_bridge_contacts')) as { sql: string }
      expect(counter.sql).not.toMatch(/GROUP BY[^)]*user/i)
      expect(counter.sql).toContain('workspace_id = $1')
    })
  })

  describe('la politique de l’espace', () => {
    it('LIT le cloisonnement là où il se règle déjà — un réglage vit à un seul endroit (GA-26)', async () => {
      const ouvert = build({ answer: () => [], portfolioVisibility: 'open' })
      expect((await ouvert.service.view(ME, ACCOUNT)).policy.restrictedAccounts).toBe(false)

      const cloisonne = build({ answer: () => [], portfolioVisibility: 'restricted' })
      expect((await cloisonne.service.view(ME, ACCOUNT)).policy.restrictedAccounts).toBe(true)
    })

    it('rend les deux seuils de la maquette, depuis leur source unique', async () => {
      const { service } = build({ answer: () => [] })
      const { policy } = await service.view(ME, ACCOUNT)
      expect(policy.ownerPriorityDays).toBe(MEMORY_POLICY_DEFAULTS.ownerPriorityDays)
      expect(policy.kAnonymityThreshold).toBe(MEMORY_POLICY_DEFAULTS.kAnonymityThreshold)
      expect(policy.sharingMode).toBe('bridge')
    })
  })

  describe('aucun croisement C3 tant qu’aucun agrégat n’est k-anonymisé', () => {
    it('n’émet que du C1 et du C2 — le seuil k n’a rien à garder pour l’instant', async () => {
      const { service } = build({
        answer: sql => {
          if (sql.includes('FROM missions m') && sql.includes('LIMIT 1')) return [openDoorRow]
          if (sql.includes('FROM access_facts af')) {
            return [{ value: 'rang2_soustraitance', observed_at: new Date('2024-05-02Z'), created_at: new Date() }]
          }
          return []
        },
      })
      const view = await service.view(ME, ACCOUNT)
      expect(view.crossings.length).toBeGreaterThan(0)
      // Si un jour un croisement C3 apparaît, ce test tombe — et c'est le moment
      // où le seuil k doit devenir un `if`, pas un affichage.
      expect(view.crossings.map(crossing => crossing.circle).filter(circle => circle === 'c3')).toEqual([])
    })
  })

  describe('rien ne se réattribue', () => {
    it('le seul chemin d’écriture est une TRACE, et il n’UPDATE rien', async () => {
      const { service, queries } = build({
        answer: sql => (sql.includes('INSERT INTO workspace_bridge_contacts') ? [{ id: 'b-1' }] : []),
      })
      const result = await service.recordContact(ME, {
        accountId: ACCOUNT,
        kind: 'openDoor',
        colleagueUserId: DAVID,
      })
      expect(result).toEqual({ recorded: true })

      const written = queries.map(entry => entry.sql).join('\n')
      expect(written).toContain('INSERT INTO workspace_bridge_contacts')
      expect(written).not.toMatch(/\bUPDATE\b/)
      expect(written).not.toMatch(/\bDELETE\b/)
      // Ni `assigned_to`, ni `owner_id` : le portefeuille de personne ne bouge.
      expect(written).not.toContain('assigned_to')
      expect(written).not.toContain('owner_id')
    })

    it('trois clics ne font pas trois mises en relation', async () => {
      const { service } = build({ answer: () => [] })
      // `ON CONFLICT DO NOTHING` : la deuxième insertion ne rend aucune ligne.
      expect(await service.recordContact(ME, { accountId: ACCOUNT, kind: 'openDoor', colleagueUserId: DAVID })).toEqual(
        { recorded: false },
      )
    })

    it('refuse un compte qui n’est pas de l’espace, AVANT d’écrire', async () => {
      const { service, accounts, queries } = build({ answer: () => [] })
      accounts.count.mockResolvedValue(0)
      await expect(
        service.recordContact(ME, { accountId: ACCOUNT, kind: 'openDoor', colleagueUserId: DAVID }),
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(queries).toEqual([])
    })
  })

  describe('le compte doit exister dans l’espace', () => {
    it('refuse un compte d’un autre espace', async () => {
      const { service } = build({ account: null })
      await expect(service.view(ME, ACCOUNT)).rejects.toBeInstanceOf(NotFoundException)
    })

    // #2532 — les DEUX 404 possibles de `view()` se ressemblent à l'appelant
    // (même exception, même statut HTTP) mais ne disent pas la même chose :
    // ici, le compte EST dans l'espace, seul son nom manque. Un test qui ne
    // distinguerait pas les deux laisserait un défaut se déguiser en
    // frontière de sécurité.
    it('refuse aussi un compte SANS nom lisible, même s’il est dans l’espace', async () => {
      const { service } = build({ account: { id: ACCOUNT, company_name: '' } })
      await expect(service.view(ME, ACCOUNT)).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  // #2532 — « rien de connu » n'est pas « introuvable » : un compte DE
  // L'ESPACE qui n'a simplement encore rien croisé n'est pas une erreur, et
  // ne doit surtout pas se confondre avec les deux 404 ci-dessus.
  describe('un compte de l’espace sans croisement rend une vue VIDE, sans erreur', () => {
    it('ne jette pas, et rend `crossings: []`', async () => {
      const { service } = build()
      const view = await service.view(ME, ACCOUNT)
      expect(view.crossings).toEqual([])
      expect(view.unreadableSources).toEqual([])
    })
  })
})
