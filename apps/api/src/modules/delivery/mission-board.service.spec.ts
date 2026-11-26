import { MissionBoardService } from './mission-board.service'

/**
 * Le board à douze colonnes (décision D2) — une VUE, et rien d'autre.
 *
 * Ce que ces tests protègent : la vue ne possède aucun état, elle n'écrit rien,
 * et elle ne cache rien en silence. Le troisième point est le plus facile à
 * perdre — écarter l'entonnoir de détection sans le compter ferait disparaître
 * des centaines de projets d'un écran censé tout montrer.
 */
describe('MissionBoardService', () => {
  const build = (projects: unknown[], missions: unknown[], loadedCosts: unknown[] = []) => {
    const projectRepo = { find: jest.fn().mockResolvedValue(projects) }
    // Le board lit quatre tables ANNEXES (comptes, affectations, facturation,
    // relevés). Chaque lecture est isolée : ici elles rendent vide, ce qui
    // vérifie au passage qu'un board sans décoration reste un board.
    const missionRepo = {
      find: jest.fn().mockResolvedValue(missions),
      manager: {
        // Chaque lecture annexe est reconnue par SA table : un mock qui rend la
        // même chose à toutes ferait passer un coût pour un nom de compte.
        query: jest.fn(async (sql: string) => (sql.includes('mission_commercial_terms') ? loadedCosts : [])),
      },
    }
    return {
      service: new MissionBoardService(missionRepo as never, projectRepo as never),
      projectRepo,
      missionRepo,
    }
  }

  it('projette un projet et une mission dans leurs colonnes', async () => {
    const { service } = build(
      [{ id: 'p1', stage: 'negotiation', label: 'Migration Cloud' }],
      [{ id: 'm1', status: 'active', label: 'TMA ACME' }],
    )

    const board = await service.board('w-1', { canReadFinance: false })

    expect(board.cards).toEqual([
      expect.objectContaining({ id: 'project:p1', column: 'validation_client', source: 'project' }),
      expect.objectContaining({ id: 'mission:m1', column: 'en_cours', source: 'mission' }),
    ])
  })

  it('#3547 — une mission en forfait encadré n’est jamais « sans consultant » : elle n’en attend pas', async () => {
    const { service } = build(
      [],
      [
        { id: 'm-staffed', status: 'active', label: 'TMA', ends_on: '2027-01-01', delivery_mode: 'staffed' },
        { id: 'm-encadre', status: 'active', label: 'Cadrage', ends_on: '2027-01-01', delivery_mode: 'supervised' },
        // Une API antérieure à la colonne : absent = staffed, l'alerte historique reste.
        { id: 'm-ancienne', status: 'active', label: 'Ancienne', ends_on: '2027-01-01' },
      ],
    )

    const board = await service.board('w-1', { canReadFinance: false })
    const alertOf = (id: string) => board.cards.find(card => card.id === `mission:${id}`)?.alert

    expect(alertOf('m-staffed')).toBe('unstaffed')
    expect(alertOf('m-ancienne')).toBe('unstaffed')
    expect(alertOf('m-encadre')).not.toBe('unstaffed')
  })

  it('COMPTE l’entonnoir de détection au lieu de le masquer', async () => {
    // « 2 non affichés » est une information ; leur disparition n'en est pas
    // une, et ferait chercher des projets qu'on croit perdus.
    const { service } = build(
      [
        { id: 'p1', stage: 'detected', label: 'Signal' },
        { id: 'p2', stage: 'potential', label: 'Piste' },
        { id: 'p3', stage: 'won', label: 'Signé' },
      ],
      [],
    )

    const board = await service.board('w-1', { canReadFinance: false })

    expect(board.intakeCount).toBe(2)
    expect(board.cards).toHaveLength(1)
  })

  it('porte l’état d’ORIGINE sur chaque carte — c’est ce qui dit où la déplacer', async () => {
    const { service } = build(
      [{ id: 'p1', stage: 'won', label: 'Signé' }],
      [{ id: 'm1', status: 'onboarding', label: 'M' }],
    )

    const board = await service.board('w-1', { canReadFinance: false })

    expect(board.cards.map(card => card.originState)).toEqual(['won', 'onboarding'])
  })

  it('range un projet SIGNÉ que rien ne porte encore dans « à créer »', async () => {
    // C'est la colonne 1 du document, et elle n'était alimentée par rien : un
    // projet gagné restait avec les missions démarrées, donc personne ne voyait
    // qu'il manquait une mission.
    const { service } = build(
      [{ id: 'p1', stage: 'won', label: 'Signé' }],
      [{ id: 'm1', status: 'onboarding', label: 'M' }],
    )

    const board = await service.board('w-1', { canReadFinance: false })

    expect(board.cards.find(card => card.source === 'project')?.column).toBe('a_creer')
    expect(board.cards.find(card => card.source === 'mission')?.column).toBe('gagnee')
    expect(new Set(board.cards.map(card => card.source)).size).toBe(2)
  })

  it('lit les DEUX tables sur l’espace demandé, et n’écrit rien', async () => {
    const { service, projectRepo, missionRepo } = build([], [])

    await service.board('w-1', { canReadFinance: false })

    expect(projectRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { workspace_id: 'w-1' } }))
    expect(missionRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { workspace_id: 'w-1' } }))
    expect((projectRepo as { save?: unknown }).save).toBeUndefined()
  })

  it('rend un board vide avec ses douze en-têtes, et aucune carte', async () => {
    // Les colonnes existent même vides : une colonne qui disparaîtrait quand
    // elle n'a rien ferait bouger toutes les autres d'un cran.
    const { service } = build([], [])

    const board = await service.board('w-1', { canReadFinance: false })

    expect(board.cards).toEqual([])
    expect(board.intakeCount).toBe(0)
    expect(board.columns).toHaveLength(12)
    // Une colonne vide n'annonce pas « 0 € » : elle n'annonce rien.
    expect(board.columns.every(column => column.remainingRevenueCents === null)).toBe(true)
  })

  it('remplace un libellé manquant par un mot neutre plutôt que par une chaîne vide', async () => {
    const { service } = build([{ id: 'p1', stage: 'qualified', label: null }], [])

    const board = await service.board('w-1', { canReadFinance: false })

    expect(board.cards[0]?.label).toBe('Projet')
  })

  /* ------------------------------------------------------------------------ */
  /*  La rédaction financière — D45 du 28/08/2026                              */
  /* ------------------------------------------------------------------------ */

  describe('la marge d’une carte est un champ FINANCIER', () => {
    // ⚠️ Le coût vient des CONDITIONS COMMERCIALES (D43 · 26/08), jamais de
    // `missions.daily_cost` — que rien dans l'application n'écrit. La fixture
    // le posait sur la colonne morte : le board rendait donc `null` alors que
    // le test attendait 30 %, ce qui est exactement le défaut que D43 corrige.
    const CHIFFREE = [{ id: 'm1', status: 'active', label: 'TMA ACME', daily_rate: 600 }]
    const COUT_CHARGE = [{ mission_id: 'm1', loaded_daily_cost_cents: '42000' }]

    it('la VIDE sans `finance:read` — présente, `null`, jamais un zéro', async () => {
      // Le board RETIRAIT la clé. `delivery.service` aussi, `staffing` la
      // mettait à `null` : trois rédactions écrites à la main, trois formes de
      // réponse. D45 tranche pour une seule — `redactFinance`, qui vide.
      const { service } = build([], CHIFFREE, COUT_CHARGE)

      const board = await service.board('w-1', { canReadFinance: false })

      expect(board.cards[0]).toHaveProperty('marginPercent')
      expect(board.cards[0]?.marginPercent).toBeNull()
      expect(board.cards[0]?.marginPercent).not.toBe(0)
    })

    it('la rend à qui l’a', async () => {
      const { service } = build([], CHIFFREE, COUT_CHARGE)

      const board = await service.board('w-1', { canReadFinance: true })

      expect(board.cards[0]?.marginPercent).toBe(30)
    })

    it('laisse passer le TJM FACTURÉ sans le droit — il est visible par design', async () => {
      // Deux fausses alertes ont déjà été levées là-dessus dans ce dépôt. Le
      // prix de VENTE sort sans `finance:read` ; ce qui se garde, c'est le COÛT
      // et la MARGE. Élargir la rédaction au TJM masquerait un chiffre que le
      // produit montre exprès — et viderait au passage le CA restant des
      // en-têtes de colonnes, qui se calcule dessus.
      const { service } = build([], [{ ...CHIFFREE[0], ends_on: '2099-01-01' }], COUT_CHARGE)

      const board = await service.board('w-1', { canReadFinance: false })

      expect(board.cards[0]?.dailyRateCents).toBe(60_000)
    })

    it('rend le DROIT avec le board — sans lui, « pas mesuré » et « pas le droit » sont le même `null`', async () => {
      const { service } = build([], CHIFFREE, COUT_CHARGE)

      await expect(service.board('w-1', { canReadFinance: false })).resolves.toMatchObject({ canReadFinance: false })
      await expect(service.board('w-1', { canReadFinance: true })).resolves.toMatchObject({ canReadFinance: true })
    })

    it('donne la MÊME forme aux cartes de projet et de mission', async () => {
      // Un projet n'a pas de marge — mais sa carte porte quand même la clé, à
      // `null`. Deux formes de carte obligeraient l'écran à deviner laquelle il
      // tient, et c'est ce genre de divergence qui a fait naître D45.
      const { service } = build([{ id: 'p1', stage: 'negotiation', label: 'Migration' }], CHIFFREE, COUT_CHARGE)

      const board = await service.board('w-1', { canReadFinance: true })

      const [project, mission] = board.cards
      expect(Object.keys(project ?? {}).sort()).toEqual(Object.keys(mission ?? {}).sort())
      expect(project?.marginPercent).toBeNull()
    })
  })
})
