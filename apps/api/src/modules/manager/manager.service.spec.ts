import { ForbiddenException } from '@nestjs/common'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { DEMO_COLLEAGUES } from '../demo/demo-dataset'
import { ManagerService } from './manager.service'

describe('ManagerService', () => {
  let dataSource: { query: jest.Mock }
  let workspaceContext: { resolveActiveWorkspace: jest.Mock; extraPermissionsOf: jest.Mock }
  let service: ManagerService

  // Route each aggregation query to its fixture by SQL content — robust to the
  // concurrent Promise.all order (mockResolvedValueOnce would be order-fragile).
  const wireQueries = () => {
    dataSource.query.mockImplementation(async (sql: string) => {
      // Tendance mensuelle — matchée EN PREMIER : les trois requêtes portent sur
      // des tables déjà routées plus bas (accounts / contacts / analysis_runs) et
      // seraient sinon servies par les agrégats « par membre ».
      if (sql.includes("date_trunc('month'") && sql.includes('FROM accounts')) return [{ current: 6, previous: 4 }]
      if (sql.includes("date_trunc('month'") && sql.includes('FROM contacts'))
        return [{ current: 20, previous: 25, emailsCurrent: 9, emailsPrevious: 12 }]
      if (sql.includes("date_trunc('month'") && sql.includes('FROM analysis_runs')) return [{ current: 3, previous: 3 }]
      // Agenda (bloc 7) — matché AVANT les autres requêtes `action_plan_items` :
      // la tête de file (COALESCE porteur) puis le compteur de la fenêtre.
      if (sql.includes('"holderUserId"'))
        return [
          {
            id: 'rem-1',
            label: 'Appeler la DSI',
            accountId: 'acc-1',
            companyName: 'Decathlon',
            // ⚠️ Un objet `Date`, et non `'2026-07-24'` : c'est ce que le pilote
            // `pg` rend pour une colonne `DATE`. Simuler la chaîne rendait le
            // test vert pendant que la production affichait « Fri Jul 24 », que
            // le navigateur relisait en **2001**.
            dueDate: new Date(2026, 6, 24),
            // Déléguée à u2 : le porteur est le délégataire, pas l'auteur du plan.
            holderUserId: 'u2',
          },
          {
            id: 'rem-2',
            label: 'Envoyer la proposition',
            accountId: 'acc-2',
            companyName: 'Doctolib',
            dueDate: new Date(2026, 6, 26),
            // Non déléguée : le porteur retombe sur le propriétaire du plan.
            holderUserId: 'u1',
          },
        ]
      if (sql.includes('i.due_date >= CURRENT_DATE') && sql.includes('AS "total"')) return [{ total: 5 }]
      // Actions partagées : le compteur (dénominateur) puis la tête de file.
      if (sql.includes('FROM action_plan_items') && sql.includes('AS "open"'))
        return [{ open: 9, overdue: 3, delegated: 4 }]
      if (sql.includes('FROM action_plan_items'))
        return [
          {
            id: 'act-1',
            label: 'Relancer le DSI',
            accountId: 'acc-1',
            companyName: 'Decathlon',
            // Même règle que l'agenda : la forme RÉELLE d'une colonne `DATE`.
            dueDate: new Date(2026, 6, 10),
            ownerUserId: 'u1',
            assignedTo: 'u2',
            overdue: true,
          },
          {
            id: 'act-2',
            label: 'Préparer la soutenance',
            accountId: 'acc-2',
            companyName: 'Doctolib',
            dueDate: null,
            ownerUserId: 'u2',
            assignedTo: null,
            overdue: false,
          },
        ]
      // Fil d'activité — avant le `FROM user_actions` générique (dernière activité).
      if (sql.includes('ua.action_type'))
        return [
          {
            id: 'ev-1',
            userId: 'u1',
            actionType: 'message_sent',
            accountId: 'acc-1',
            companyName: 'Decathlon',
            createdAt: '2026-07-22T08:30:00.000Z',
          },
        ]
      // Crédits & usage : l'abonnement du propriétaire, puis le ledger du cycle.
      if (sql.includes('JOIN subscriptions'))
        return [
          {
            creditsUsed: 42,
            creditsTotal: 140,
            periodStart: '2026-07-01T00:00:00.000Z',
          },
        ]
      // Ventilation du cycle — matchée AVANT le `FROM credit_ledger` générique
      // (consommation tout-temps par membre), que cette requête contient aussi.
      if (sql.includes('AS "credits"'))
        return [
          { userId: 'u1', credits: 28 },
          { userId: 'u2', credits: 7 },
          { userId: null, credits: 6 },
        ]
      // Pipeline valorisé (§10) — matché AVANT le `FROM opportunities` générique
      // (opportunités ouvertes par membre), que cette requête contient aussi.
      if (sql.includes('SUM(o.estimated_amount)'))
        return [
          // Deux montants saisis sur 3 projets « détecté » → 30000, 1 sans montant.
          { lifecycle: 'detected', amount: 30000, valued: 2, total: 3 },
          { lifecycle: 'qualified', amount: 50000, valued: 1, total: 1 },
          // Un étage sans aucun montant saisi : compté à part, jamais sommé à 0 €.
          // ⚠️ `negotiation` et non `won` : depuis le 29/08 la requête filtre sur
          // `LIVE_STAGES`, donc la base ne peut PLUS rendre de ligne signée ici.
          // Une fixture qui en rendrait une ferait passer au vert un total qui
          // additionne deux statuts — le défaut que le filtre vient de fermer.
          { lifecycle: 'negotiation', amount: 0, valued: 0, total: 2 },
        ]
      // #2405.6 — opportunités sans action, matchée AVANT le `FROM opportunities`
      // générique (opportunités ouvertes) que cette requête contient aussi.
      if (sql.includes('o.stage_entered_at'))
        return [
          { userId: 'u1', count: 3 },
          { userId: 'u2', count: 1 },
        ]
      if (sql.includes('FROM opportunities'))
        return [
          { userId: 'u1', count: 5 },
          { userId: 'u2', count: 1 },
        ]
      // Playbooks partagés (bloc 11) : le compteur complet puis la tête de liste.
      if (sql.includes('FROM library_items') && sql.includes('AS "total"')) return [{ total: 4 }]
      if (sql.includes('FROM library_items'))
        return [
          { id: 'pb-1', title: 'Séquence de prospection DSI', category: 'Prospection', kind: 'playbook' },
          { id: 'pb-2', title: 'Méthode MEDDIC', category: 'Qualification', kind: 'method_playbook' },
        ]
      if (sql.includes('FROM workspace_members'))
        return [
          { userId: 'u1', role: 'owner', firstName: 'Alice', lastName: 'Martin', email: 'alice@esn.fr' },
          { userId: 'u2', role: 'member', firstName: null, lastName: null, email: 'bob@esn.fr' },
        ]
      // Portfolio queries are matched BEFORE the generic `FROM accounts`
      // created-by count, which they would otherwise shadow.
      if (sql.includes('make_interval')) return [{ userId: 'u1', count: 2 }]
      if (sql.includes('GROUP BY assigned_to'))
        return [
          { userId: 'u1', count: 7 },
          { userId: 'u2', count: 3 },
        ]
      if (sql.includes('FILTER (WHERE assigned_to IS NOT NULL)')) return [{ total: 14, assigned: 10 }]
      if (sql.includes('assigned_to IS NULL'))
        return [
          {
            id: 'acc-9',
            companyName: 'Carrefour',
            sector: 'Retail',
            priorityScore: 8,
            commercialStatus: 'inbox',
            createdAt: '2026-07-18T10:00:00.000Z',
          },
        ]
      // Carte de couverture — matchée AVANT le `FROM accounts` générique, que
      // ses trois requêtes contiennent aussi.
      if (sql.includes('btrim(sector)'))
        return [
          { label: 'Banque', userId: 'u1', count: 4 },
          // Même maille, casse différente : doit fusionner sur « Banque ».
          { label: 'banque', userId: 'u2', count: 1 },
          { label: 'Banque', userId: null, count: 2 },
          { label: 'Retail', userId: null, count: 3 },
        ]
      if (sql.includes('split_part(headquarters'))
        return [
          { label: 'Paris', userId: 'u1', count: 6 },
          { label: 'Lyon', userId: null, count: 2 },
          { label: '', userId: 'u2', count: 9 },
        ]
      if (sql.includes('decision_role'))
        return [
          { label: 'technical', userId: 'u1', count: 12 },
          { label: 'economic', userId: null, count: 5 },
        ]
      if (sql.includes('FROM accounts'))
        return [
          { userId: 'u1', count: 5 },
          { userId: 'u2', count: 2 },
        ]
      if (sql.includes('FROM contacts') && sql.includes('email_sent_at'))
        return [
          { userId: 'u1', contacts: 30, emailsSent: 10 },
          { userId: 'u2', contacts: 12, emailsSent: 0 },
        ]
      if (sql.includes('FROM analysis_runs')) return [{ userId: 'u1', count: 4 }]
      if (sql.includes('FROM credit_ledger'))
        return [
          { userId: 'u1', consumed: 42 },
          { userId: 'u2', consumed: 7 },
        ]
      // Duplicate-coverage (user_actions JOIN accounts) — match BEFORE the generic
      // `FROM user_actions` last-activity branch, which would otherwise shadow it.
      if (sql.includes('HAVING COUNT(DISTINCT'))
        return [{ accountId: 'acc-3', companyName: 'Doctolib', repCount: 2, reps: ['u1', 'u2'] }]
      if (sql.includes('FROM user_actions')) return [{ userId: 'u1', lastAt: '2026-07-15T09:00:00.000Z' }]
      if (sql.includes('GROUP BY user_status'))
        return [
          { status: 'contacted', count: 22 },
          { status: 'new', count: 20 },
        ]
      if (sql.includes('FROM workspaces')) return [{ name: 'ESN Skaizen' }]
      return []
    })
  }

  beforeEach(() => {
    dataSource = { query: jest.fn() }
    workspaceContext = {
      extraPermissionsOf: jest.fn(async () => []),
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    }
    service = new ManagerService(
      dataSource as never,
      workspaceContext as unknown as WorkspaceContextService,
      { scopeFor: jest.fn().mockResolvedValue(null) } as never,
    )
  })

  it('ouvre le cockpit à sales_ops — « commercial + gestion d’équipe »', async () => {
    // Le rôle était comparé littéralement à owner/admin. `sales_ops`, dont la
    // définition MÊME est « commercial + gestion d'équipe » et qui porte
    // `team:manage`, se voyait refuser l'écran qu'il est censé tenir.
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'sales_ops' })
    // La porte s'ouvre : le service passe à la LECTURE (que ce test ne stubbe
    // pas). Ce qu'on vérifie est l'absence de refus, pas le contenu.
    await expect(service.getTeamStats('u3')).rejects.not.toBeInstanceOf(ForbiddenException)
    expect(dataSource.query).toHaveBeenCalled()
  })

  it('ouvre le cockpit à un membre à qui team:manage a été accordé nominativement', async () => {
    // Un test de rôle en dur ignore par construction les permissions accordées
    // membre par membre — la moitié du RBAC devenait invisible.
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' })
    workspaceContext.extraPermissionsOf.mockResolvedValue(['team:manage'])
    await expect(service.getTeamStats('u4')).rejects.not.toBeInstanceOf(ForbiddenException)
    expect(dataSource.query).toHaveBeenCalled()
  })

  it('rejects a non-manager (member role) without running any query', async () => {
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'member' })
    await expect(service.getTeamStats('u2')).rejects.toBeInstanceOf(ForbiddenException)
    expect(dataSource.query).not.toHaveBeenCalled()
  })

  it('allows an admin', async () => {
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'admin' })
    wireQueries()
    const stats = await service.getTeamStats('u1')
    expect(stats.workspace.member_count).toBe(2)
  })

  it('aggregates per-rep stats + team totals, sorted by portfolio desc', async () => {
    wireQueries()
    const stats = await service.getTeamStats('u1')

    expect(stats.workspace).toEqual({ id: 'ws-1', name: 'ESN Skaizen', member_count: 2 })
    // u1 (7 assigned) ranks above u2 (3)
    expect(stats.members.map(m => m.user_id)).toEqual(['u1', 'u2'])
    expect(stats.members[0]).toMatchObject({
      name: 'Alice Martin',
      email: 'alice@esn.fr',
      role: 'owner',
      accounts: 5,
      contacts: 30,
      emails_sent: 10,
      analyses: 4,
      last_activity_at: '2026-07-15T09:00:00.000Z',
    })
    // bob: no profile name → derived from email local-part; no rows in some aggregates → 0 / null
    expect(stats.members[1]).toMatchObject({
      name: 'bob',
      accounts: 2,
      contacts: 12,
      emails_sent: 0,
      analyses: 0,
      last_activity_at: null,
    })
    expect(stats.totals).toEqual({ accounts: 7, contacts: 42, emails_sent: 10, analyses: 4 })
    expect(stats.pipeline).toEqual([
      { status: 'contacted', count: 22 },
      { status: 'new', count: 20 },
    ])
  })

  it('reports the portfolio per member, distinct from accounts created', async () => {
    wireQueries()
    const stats = await service.getTeamStats('u1')

    // Alice CREATED 5 accounts but CARRIES 7 — the two are different questions.
    expect(stats.members[0]).toMatchObject({ accounts: 5, assigned_accounts: 7, stale_accounts: 2 })
    // Bob carries 3 and has none stale (no row in the stale aggregate → 0).
    expect(stats.members[1]).toMatchObject({ accounts: 2, assigned_accounts: 3, stale_accounts: 0 })
  })

  // #2405.6 — un fait daté, jamais un jugement : Alice a 3 opportunités sans
  // action depuis 9 jours (au-dessus du seuil de bruit), Bob n'en a qu'une —
  // sous le seuil, donc absent du bloc plutôt qu'un « 0 » qui inviterait à
  // comparer les deux.
  it('#2405.6 — coaching cite un fait daté par commercial, jamais un score ni un classement', async () => {
    wireQueries()
    const stats = await service.getTeamStats('u1')

    expect(stats.coaching).toEqual({
      stale_opportunities: [{ member_user_id: 'u1', member_name: 'Alice Martin', count: 3, days: 9 }],
    })
    // Bob (1 < seuil de 3) ne fait AUCUNE ligne — jamais un 0 affiché.
    expect(stats.coaching?.stale_opportunities.some(entry => entry.member_user_id === 'u2')).toBe(false)
  })

  it('reports portfolio coverage and the head of the to-assign queue', async () => {
    wireQueries()
    const stats = await service.getTeamStats('u1')

    expect(stats.coverage).toEqual({ total_accounts: 14, assigned: 10, unassigned: 4 })
    expect(stats.unassigned_sample).toEqual([
      {
        id: 'acc-9',
        company_name: 'Carrefour',
        sector: 'Retail',
        priority_score: 8,
        commercial_status: 'inbox',
        created_at: '2026-07-18T10:00:00.000Z',
      },
    ])
  })

  it('reports per-member credits and flags duplicate-covered accounts (restitution V2 §9-10)', async () => {
    wireQueries()
    const stats = await service.getTeamStats('u1')

    // Attribution via credit_ledger.actor_user_id (le membre qui a déclenché).
    expect(stats.members[0]).toMatchObject({ credits_consumed: 42 })
    expect(stats.members[1]).toMatchObject({ credits_consumed: 7 })
    // Deux commerciaux sur le même compte = alerte de coordination.
    expect(stats.duplicate_coverage).toEqual({
      accounts: [{ account_id: 'acc-3', company_name: 'Doctolib', rep_count: 2, reps: ['u1', 'u2'] }],
    })
  })

  // Carte de couverture (restitution V2 §10) : qui couvre quel secteur /
  // territoire / persona, et surtout ce que personne ne couvre.
  it('builds the coverage map on the three axes, owners first', async () => {
    wireQueries()
    const stats = await service.getTeamStats('u1')

    // « Banque » et « banque » sont la même maille : 4 (u1) + 1 (u2) + 2 sans
    // responsable = 7, et le libellé retenu est celui du plus gros volume.
    expect(stats.coverage_map?.sectors[0]).toEqual({
      label: 'Banque',
      total: 7,
      unassigned: 2,
      owners: [
        { user_id: 'u1', count: 4 },
        { user_id: 'u2', count: 1 },
      ],
    })
    // Zone blanche : des comptes, aucun propriétaire.
    expect(stats.coverage_map?.sectors[1]).toEqual({ label: 'Retail', total: 3, unassigned: 3, owners: [] })

    // Territoire : un siège vide n'invente pas une maille « inconnue ».
    expect(stats.coverage_map?.territories.map(s => s.label)).toEqual(['Paris', 'Lyon'])
    // Persona : compté en CONTACTS, rattaché au responsable de leur compte.
    expect(stats.coverage_map?.personas).toEqual([
      { label: 'technical', total: 12, unassigned: 0, owners: [{ user_id: 'u1', count: 12 }] },
      { label: 'economic', total: 5, unassigned: 5, owners: [] },
    ])
  })

  // Never invent a plausible number: an empty workspace reports zeroes and an
  // empty queue, which the UI renders as "aucune donnée".
  it('reports honest zeroes when the workspace has no accounts at all', async () => {
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM workspace_members'))
        return [{ userId: 'u1', role: 'owner', firstName: 'Alice', lastName: null, email: 'alice@esn.fr' }]
      if (sql.includes('FILTER (WHERE assigned_to IS NOT NULL)')) return [{ total: 0, assigned: 0 }]
      // Le nom du workspace et l'abonnement se lisent tous deux depuis
      // `workspaces` : router l'abonnement AVANT, sinon la ligne « nom » se fait
      // passer pour une ligne de quota.
      if (sql.includes('JOIN subscriptions')) return []
      if (sql.includes('FROM workspaces')) return [{ name: 'ESN Vide' }]
      return []
    })

    const stats = await service.getTeamStats('u1')
    expect(stats.coverage).toEqual({ total_accounts: 0, assigned: 0, unassigned: 0 })
    expect(stats.unassigned_sample).toEqual([])
    // Trois axes vides, jamais un segment fabriqué.
    expect(stats.coverage_map).toEqual({ sectors: [], territories: [], personas: [] })
    expect(stats.members[0]).toMatchObject({ assigned_accounts: 0, stale_accounts: 0 })
  })

  // Point 1 (recette 14/10) : l'e-mail d'un compte RÉEL (le profil du propriétaire de la
  // salle est celui d'un vrai compte du pool) sortait sur /team en démonstration.
  it("n'expose en démo aucun e-mail hors domaine démo", async () => {
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM workspace_members'))
        return [
          {
            userId: 'u1',
            role: 'owner',
            firstName: 'Maëlle',
            lastName: 'Lorquin',
            email: 'antoine.guillaud@gomindfactory.com',
            isDemo: true,
          },
        ]
      if (sql.includes('FILTER (WHERE assigned_to IS NOT NULL)')) return [{ total: 0, assigned: 0 }]
      if (sql.includes('JOIN subscriptions')) return []
      if (sql.includes('FROM workspaces')) return [{ name: 'Bellum Conseil' }]
      return []
    })

    const stats = await service.getTeamStats('u1')
    expect(JSON.stringify(stats)).not.toContain('gomindfactory')
    expect(stats.members[0].email).toMatch(/@exemple\.test$/)
  })

  // R21-FIX point 1 (recette 15/10) : les 4 membres de la salle affichaient le MÊME e-mail (celui de
  // la propriétaire) — chaque collègue fictif porte le sien, sans jamais retomber sur un compte réel.
  it('donne à chaque collègue démo son propre e-mail et son nom, distincts de la propriétaire', async () => {
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM workspace_members'))
        return [
          {
            userId: 'u1',
            role: 'owner',
            firstName: 'Maëlle',
            lastName: 'Lorquin',
            email: 'reel@pool.com',
            isDemo: true,
          },
          ...DEMO_COLLEAGUES.map(c => ({
            userId: c.userId,
            role: c.role,
            firstName: 'Maëlle',
            lastName: 'Lorquin',
            email: 'reel@pool.com',
            isDemo: true,
          })),
        ]
      if (sql.includes('FILTER (WHERE assigned_to IS NOT NULL)')) return [{ total: 0, assigned: 0 }]
      if (sql.includes('JOIN subscriptions')) return []
      if (sql.includes('FROM workspaces')) return [{ name: 'Bellum Conseil' }]
      return []
    })

    const stats = await service.getTeamStats('u1')
    const emails = stats.members.map(m => m.email)
    expect(new Set(emails).size).toBe(4)
    for (const email of emails) expect(email).toMatch(/@exemple\.test$/)
    expect(stats.members.map(m => m.name)).toEqual(
      expect.arrayContaining(['Léa Marchand', 'Karim Benali', 'Sophie Vasseur']),
    )
    expect(JSON.stringify(stats)).not.toContain('pool.com')
  })

  // The four RBAC roles added after this screen shipped must survive the round
  // trip — the UI used to render them as raw untranslated strings.
  it('passes newer RBAC roles through untouched', async () => {
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM workspace_members'))
        return [{ userId: 'u3', role: 'sales_ops', firstName: 'Théo', lastName: 'H', email: 't@esn.fr' }]
      if (sql.includes('FILTER (WHERE assigned_to IS NOT NULL)')) return [{ total: 0, assigned: 0 }]
      return []
    })

    const stats = await service.getTeamStats('u1')
    expect(stats.members[0]?.role).toBe('sales_ops')
  })

  // Maquette p.11, bloc 8 — la délégation existait en base mais aucune vue
  // d'équipe ne l'agrégeait.
  it('aggregates the shared action queue with its full counters', async () => {
    wireQueries()
    const stats = await service.getTeamStats('u1')

    // Le compteur porte sur TOUTE la file, pas sur l'échantillon renvoyé.
    expect(stats.shared_actions).toMatchObject({ open: 9, overdue: 3, delegated: 4 })
    expect(stats.shared_actions?.items).toHaveLength(2)
    expect(stats.shared_actions?.items[0]).toEqual({
      id: 'act-1',
      label: 'Relancer le DSI',
      account_id: 'acc-1',
      company_name: 'Decathlon',
      due_date: '2026-07-10',
      overdue: true,
      owner_user_id: 'u1',
      // Déléguée : c'est ce qui alimente l'onglet « déléguées à moi ».
      assigned_to: 'u2',
    })
    expect(stats.shared_actions?.items[1]).toMatchObject({ due_date: null, overdue: false, assigned_to: null })
  })

  // Maquette p.11, bloc 6 — le fil d'activité, ramené sur le cockpit.
  it('ships the recent activity feed with its account context', async () => {
    wireQueries()
    const stats = await service.getTeamStats('u1')

    expect(stats.recent_activity).toEqual([
      {
        id: 'ev-1',
        user_id: 'u1',
        action_type: 'message_sent',
        account_id: 'acc-1',
        company_name: 'Decathlon',
        created_at: '2026-07-22T08:30:00.000Z',
      },
    ])
  })

  // Maquette p.11, bloc 9 — la consommation RAPPORTÉE au quota du cycle.
  it('reports credit usage against the cycle quota, ventilated per member', async () => {
    wireQueries()
    const stats = await service.getTeamStats('u1')

    expect(stats.credits?.period_start).toBe('2026-07-01T00:00:00.000Z')
    // MONNAIE UNIQUE : un seul pool (`accounts_used` sur limite + top-ups), donc
    // un seul compteur — analyses et enrichissements y puisent tous les deux.
    expect(stats.credits?.credits).toEqual({ used: 42, total: 140 })
    // #3544.2 : la capacité compte le report ENCORE valide, comme `creditCapacity`
    // (barre latérale) — « 23 restants » à côté de « 89 crédits » ne se refait pas.
    const subSql = String(
      dataSource.query.mock.calls
        .map((c: unknown[]) => String(c[0]))
        .find((q: string) => q.includes('JOIN subscriptions')),
    )
    expect(subSql).toContain('rollover_expires_at > now()')
    expect(subSql).toContain('s.rollover_credits')
    // Le mouvement sans acteur compte dans le total mais ne s'invente pas un
    // propriétaire dans le classement.
    expect(stats.credits?.by_member).toEqual([
      { user_id: 'u1', credits: 28 },
      { user_id: 'u2', credits: 7 },
    ])
  })

  // Le solde d'enrichissement n'est plus lu nulle part : plus rien ne le débite
  // (cf. `consumeEnrichmentCredit`), donc l'afficher annoncerait « 0 restant »
  // à côté d'un pool plein.
  it('never reads the legacy enrichment balance', async () => {
    wireQueries()
    await service.getTeamStats('u1')

    const queries = dataSource.query.mock.calls.map(([sql]: [string]) => sql)
    expect(queries.some(sql => sql.includes('enrichment_credits'))).toBe(false)
  })

  it('omits the credits block entirely when no subscription is readable', async () => {
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM workspace_members'))
        return [{ userId: 'u1', role: 'owner', firstName: 'Alice', lastName: null, email: 'a@esn.fr' }]
      return []
    })

    const stats = await service.getTeamStats('u1')
    // Pas de quota lisible ⇒ pas de bloc, jamais un quota deviné.
    expect(stats.credits).toBeUndefined()
    expect(stats.shared_actions).toEqual({ open: 0, overdue: 0, delegated: 0, items: [] })
    expect(stats.trend).toEqual({
      accounts: { current: 0, previous: 0 },
      contacts: { current: 0, previous: 0 },
      emails_sent: { current: 0, previous: 0 },
      analyses: { current: 0, previous: 0 },
    })
  })

  // Maquette p.11, blocs 2 et 4 — le rythme mensuel et les opportunités portées.
  it('reports month-over-month trend and open opportunities per owner', async () => {
    wireQueries()
    const stats = await service.getTeamStats('u1')

    expect(stats.trend).toEqual({
      accounts: { current: 6, previous: 4 },
      contacts: { current: 20, previous: 25 },
      emails_sent: { current: 9, previous: 12 },
      analyses: { current: 3, previous: 3 },
    })
    expect(stats.members[0]).toMatchObject({ user_id: 'u1', opportunities: 5 })
    expect(stats.members[1]).toMatchObject({ user_id: 'u2', opportunities: 1 })
  })

  // Maquette p.11, bloc 7 — les échéances proches, rattachées à leur porteur réel
  // (délégataire sinon auteur du plan). La donnée existait mais n'était lisible
  // que compte par compte.
  it('lists the upcoming agenda reminders with their real holder', async () => {
    wireQueries()
    const stats = await service.getTeamStats('u1')

    // La fenêtre est annoncée (agenda borné, jamais « à venir » à l'infini) et le
    // total porte sur toute la fenêtre, pas sur l'échantillon.
    expect(stats.agenda?.window_days).toBe(7)
    expect(stats.agenda?.total).toBe(5)
    expect(stats.agenda?.items).toHaveLength(2)
    // Action déléguée : le porteur est le délégataire (u2), pas l'auteur du plan.
    expect(stats.agenda?.items[0]).toEqual({
      id: 'rem-1',
      label: 'Appeler la DSI',
      account_id: 'acc-1',
      company_name: 'Decathlon',
      due_date: '2026-07-24',
      holder_user_id: 'u2',
    })
    // Action non déléguée : le porteur retombe sur le propriétaire du plan (u1).
    expect(stats.agenda?.items[1]).toMatchObject({ holder_user_id: 'u1', due_date: '2026-07-26' })
  })

  // Cockpit §10 — le pipeline partagé valorisé : ne somme QUE les montants saisis,
  // compte à part ceux qui n'en ont pas, jamais un total fabriqué.
  it('values the shared pipeline by lifecycle stage, counting unvalued apart', async () => {
    wireQueries()
    const stats = await service.getTeamStats('u1')

    expect(stats.pipeline_value?.currency).toBe('EUR')
    // 30000 (détecté) + 50000 (qualifié) + 0 (négociation, aucun montant) = 80000.
    expect(stats.pipeline_value?.total_amount).toBe(80000)
    // 2 + 1 + 0 opportunités portent un montant ; 1 + 0 + 2 n'en portent pas.
    expect(stats.pipeline_value?.valued_count).toBe(3)
    expect(stats.pipeline_value?.without_amount).toBe(3)
    // Étages triés selon l'ordre canonique du cycle de vie.
    expect(stats.pipeline_value?.by_stage.map(s => s.stage)).toEqual(['detected', 'qualified', 'negotiation'])
    expect(stats.pipeline_value?.by_stage[0]).toEqual({
      stage: 'detected',
      amount: 30000,
      valued_count: 2,
      total_count: 3,
    })
  })

  // Maquette p.11, bloc 11 — les playbooks partagés de l'espace, SANS taux de
  // réussite inventé (aucun compteur d'usage n'existe sur `library_items`).
  it('surfaces the shared playbooks without fabricating a success rate', async () => {
    wireQueries()
    const stats = await service.getTeamStats('u1')

    expect(stats.playbooks?.total).toBe(4)
    expect(stats.playbooks?.items).toEqual([
      { id: 'pb-1', title: 'Séquence de prospection DSI', category: 'Prospection', kind: 'playbook' },
      { id: 'pb-2', title: 'Méthode MEDDIC', category: 'Qualification', kind: 'method_playbook' },
    ])
  })
})
