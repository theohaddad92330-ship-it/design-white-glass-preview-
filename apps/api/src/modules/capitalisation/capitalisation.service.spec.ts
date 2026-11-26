import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { PROOF_CHANNELS, PROOF_CONTENT_TYPES } from '@bellum/contracts'
import { CapitalisationService } from './capitalisation.service'

/**
 * La capitalisation (PDF 2 §12).
 *
 * Deux règles se paient cher si elles manquent : une preuve INTERNE qui sort
 * chez un prospect (le §12 en fait sa règle unique), et un témoignage publié
 * sans trace d'accord écrit. Les deux se règlent entre avocats.
 */
describe('CapitalisationService', () => {
  const build = (
    over: {
      proofs?: unknown[]
      missions?: unknown[]
      rex?: unknown[]
      existingRex?: unknown
      accounts?: unknown[]
      // #2124.49 à .55 — le besoin d'origine d'une mission, d'où le PROBLÈME
      // traité est proposé.
      needs?: unknown[]
      oneProof?: unknown
      oneMission?: unknown
      missionCount?: number
      lostDealRexRows?: unknown[]
      lostDealRuleProposal?: unknown
      lostProjects?: unknown[]
      partnerRows?: unknown[]
      /** #3210.3 — l'opportunité ouverte du compte cible et les opportunités liées aux missions. */
      projectRows?: unknown[]
      targetAccount?: unknown
      /** #3210.1 (lot R17) — contacts du compte (`channels`) et témoignages publiables (`testimonials`). */
      contactRows?: unknown[]
      outreachRows?: unknown[]
      /** #3210.1 (lot M11) — le lecteur des rendez-vous captés. */
      activities?: unknown
      testimonialRows?: unknown[]
    } = {},
  ) => {
    const proofs = {
      find: jest.fn().mockResolvedValue(over.proofs ?? []),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: Record<string, unknown>) => ({ id: 'p-1', created_at: new Date(), ...value })),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    }
    const rex = {
      find: jest.fn().mockResolvedValue(over.rex ?? []),
      findOne: jest.fn().mockResolvedValue(over.existingRex ?? null),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: Record<string, unknown>) => ({ id: 'r-1', collected_at: new Date(), ...value })),
    }
    const testimonials = {
      find: jest.fn().mockResolvedValue(over.testimonialRows ?? []),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: Record<string, unknown>) => ({ id: 't-1', created_at: new Date(), ...value })),
    }
    const missions = {
      find: jest.fn().mockResolvedValue(over.missions ?? []),
      findOne: jest.fn().mockResolvedValue(over.oneMission ?? null),
      // #2045.8 (épopée #2859) — `workspaceMissionCount`.
      count: jest.fn().mockResolvedValue(over.missionCount ?? 0),
    }
    const accounts = {
      find: jest.fn().mockResolvedValue(over.accounts ?? []),
      // #3210 — `similarCases` lit le compte CIBLE par identifiant.
      findOne: jest.fn().mockResolvedValue(over.targetAccount ?? null),
    }
    const needs = {
      find: jest.fn().mockResolvedValue(over.needs ?? []),
      findOne: jest.fn().mockResolvedValue((over.needs ?? [])[0] ?? null),
    }
    // #2424.14 — le journal d'audit des écritures de preuve. EN DERNIER, comme
    // `needs` juste au-dessus : un dépôt inséré au milieu décale les specs qui
    // construisent le service positionnellement.
    const auditLog = { save: jest.fn(async (value: Record<string, unknown>) => ({ id: 'audit-1', ...value })) }
    Object.assign(proofs, { findOne: jest.fn().mockResolvedValue(over.oneProof ?? null) })
    // BEL-SC-243 (#3272) — EN DERNIER, même règle que `needs`/`auditLog`
    // ci-dessus : un dépôt inséré au milieu décale les specs positionnelles.
    const lostDealRex = {
      find: jest.fn().mockResolvedValue(over.lostDealRexRows ?? []),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: Record<string, unknown>) => ({ id: 'ldr-1', created_at: new Date(), ...value })),
    }
    const lostDealRuleProposals = {
      findOne: jest.fn().mockResolvedValue(over.lostDealRuleProposal ?? null),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: Record<string, unknown>) => ({ id: 'ldp-1', created_at: new Date(), ...value })),
    }
    // #3210 — les opportunités `lost`, EN DERNIER pour la même raison que `auditLog`.
    const projects = {
      find: jest.fn(async (args?: { where?: { stage?: string } }) =>
        args?.where?.stage === 'lost' ? (over.lostProjects ?? []) : (over.projectRows ?? []),
      ),
    }
    // #3210.1 — les ESN en place (`account_partners`), EN DERNIER : même règle.
    const accountPartners = {
      find: jest.fn().mockResolvedValue(over.partnerRows ?? []),
    }
    // #3210.1 (lot R17) — les canaux déjà utilisés, EN DERNIER : même règle.
    const contacts = {
      find: jest.fn().mockResolvedValue(over.contactRows ?? []),
    }
    const outreachMessages = {
      find: jest.fn().mockResolvedValue(over.outreachRows ?? []),
    }
    return {
      service: new CapitalisationService(
        proofs as never,
        rex as never,
        testimonials as never,
        missions as never,
        accounts as never,
        needs as never,
        auditLog as never,
        projects as never,
        lostDealRex as never,
        lostDealRuleProposals as never,
        accountPartners as never,
        contacts as never,
        outreachMessages as never,
        (over.activities ?? undefined) as never,
      ),
      accountPartners,
      contacts,
      outreachMessages,
      proofs,
      rex,
      missions,
      accounts,
      needs,
      auditLog,
      projects,
      lostDealRex,
      lostDealRuleProposals,
    }
  }

  // #2045.8 (épopée #2859) — l'onboarding demande le nombre de missions déjà
  // tracées, agrégé sur l'espace entier, jamais une bande auto-déclarée.
  describe('workspaceMissionCount (#2045.8, épopée #2859)', () => {
    it('compte les missions sur l’espace, jamais scopé à un compte', async () => {
      const { service, missions } = build({ missionCount: 12 })
      await expect(service.workspaceMissionCount('w-1')).resolves.toBe(12)
      expect(missions.count).toHaveBeenCalledWith({ where: { workspace_id: 'w-1' } })
    })

    it('un espace tout neuf rend un vrai zéro — mesuré, jamais une absence déguisée', async () => {
      const { service } = build({ missionCount: 0 })
      await expect(service.workspaceMissionCount('w-1')).resolves.toBe(0)
    })
  })

  it('crée une preuve INTERNE par défaut — une preuve non relue ne sort pas', async () => {
    const { service } = build()
    const proof = await service.createProof('w-1', 'u-1', { claim: 'Migration de 400 To en 6 mois' })
    expect(proof.scope).toBe('internal')
    expect(proof.strength).toBe('declared')
  })

  // #1612.1 / #1638.1 — la technologie sur une preuve, saisie par qui la
  // déclare : personne d'autre dans le pipeline ne peut la deviner.
  it('porte les technologies déclarées à la création', async () => {
    const { service } = build()
    const proof = await service.createProof('w-1', 'u-1', {
      claim: 'Migration de 400 To en 6 mois',
      technologies: ['Java', 'AWS'],
    })
    expect(proof.technologies).toEqual(['Java', 'AWS'])
  })

  // #2424.6 — huit types NOMMÉS, un champ dédié distinct de `source` (l'ORIGINE).
  it.each(PROOF_CONTENT_TYPES)('accepte le type de preuve « %s » sur un champ dédié', async contentType => {
    const { service } = build()
    const proof = await service.createProof('w-1', 'u-1', {
      claim: 'Migration de 400 To en 6 mois',
      content_type: contentType,
    })
    expect(proof.content_type).toBe(contentType)
  })

  it('une preuve sans type déclaré reste « pas encore classée », jamais devinée', async () => {
    const { service } = build()
    const proof = await service.createProof('w-1', 'u-1', { claim: 'Migration de 400 To en 6 mois' })
    expect(proof.content_type).toBeNull()
  })

  // #2424.4 — LA RÉFÉRENCE EXTERNE, les huit sous-champs : cinq tenaient déjà
  // (citation_allowed, scope, claim/detail, anonymised, result/strength), les
  // trois qui manquaient sont ici.
  it.each(PROOF_CHANNELS)('accepte le canal autorisé « %s »', async channel => {
    const { service } = build()
    const proof = await service.createProof('w-1', 'u-1', {
      claim: 'Migration de 400 To en 6 mois',
      allowed_channels: [channel],
    })
    expect(proof.allowed_channels).toEqual([channel])
  })

  it('porte la durée de validité accordée ET l’échéance qui en découle — deux champs distincts', async () => {
    const { service } = build()
    const proof = await service.createProof('w-1', 'u-1', {
      claim: 'Migration de 400 To en 6 mois',
      validity_duration_months: 12,
      valid_until: '2027-09-23T00:00:00.000Z',
    })
    expect(proof.validity_duration_months).toBe(12)
    expect(proof.valid_until).toBe('2027-09-23T00:00:00.000Z')
  })

  it('une preuve sans référence externe déclarée garde des canaux VIDES et une durée/échéance NULLES, jamais devinées', async () => {
    const { service } = build()
    const proof = await service.createProof('w-1', 'u-1', { claim: 'Migration de 400 To en 6 mois' })
    expect(proof.allowed_channels).toEqual([])
    expect(proof.validity_duration_months).toBeNull()
    expect(proof.valid_until).toBeNull()
  })

  it('une preuve sans technologie déclarée garde une liste VIDE, jamais absente', async () => {
    const { service } = build()
    const proof = await service.createProof('w-1', 'u-1', { claim: 'Autre preuve' })
    expect(proof.technologies).toEqual([])
  })

  it('ne rend mobilisable que ce qui est marqué montrable', async () => {
    const { service, proofs } = build()
    await service.usableProofs('w-1', null)
    expect(proofs.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ scope: 'client_safe' }) }),
    )
  })

  it('écarte une preuve NOMINATIVE du client à qui on l’enverrait', async () => {
    const { service } = build({
      proofs: [
        {
          id: 'p-1',
          account_id: 'a-1',
          claim: 'x',
          scope: 'client_safe',
          anonymised: false,
          strength: 'measured',
          created_at: new Date(),
        },
        {
          id: 'p-2',
          account_id: 'a-1',
          claim: 'y',
          scope: 'client_safe',
          anonymised: true,
          strength: 'measured',
          created_at: new Date(),
        },
      ],
    })
    const usable = await service.usableProofs('w-1', 'a-1')
    // La lui renvoyer nommément ne lui apprend rien — il était là — et lui
    // révèle qu'on cite ses voisins de la même façon.
    expect(usable.map(proof => proof.id)).toEqual(['p-2'])
  })

  // #2424.10 — câblage restant : `hasPositiveRex`, lu depuis un REX RÉELLEMENT
  // recueilli (jamais une sentiment déduit d'un texte libre — juste « au moins
  // un retour porte un `what_worked` »). Consommé par `recommend_actions_from_context`
  // côté IA (`action_recommender.py`), câblé depuis `phase4_plan.py`.
  describe('hasPositiveRex', () => {
    it('est vrai dès qu’un REX du compte porte un « ce qui a marché »', async () => {
      const { service } = build({
        rex: [{ mission_id: 'm-1', account_id: 'a-1', what_worked: 'Le binôme', what_failed: null }],
      })
      await expect(service.hasPositiveRex('w-1', 'a-1')).resolves.toBe(true)
    })

    it('est FAUX sans REX, et faux sur un REX sans « ce qui a marché » — jamais deviné', async () => {
      const { service } = build({
        rex: [{ mission_id: 'm-1', account_id: 'a-1', what_worked: null, what_failed: 'Le sponsor a changé' }],
      })
      await expect(service.hasPositiveRex('w-1', 'a-1')).resolves.toBe(false)
    })
  })

  // #2424.12 — LA BIBLIOTHÈQUE indexée par facette. Tranche livrée : les trois
  // facettes déjà PORTÉES par `proof.entity.ts` (secteur, expertise,
  // technologies) deviennent FILTRABLES sur `usableProofs`, le seul endroit où
  // le filtre de confidentialité est déjà tenu. Ce qui reste : l'autorisation
  // et le périmètre comme facettes explicites (déjà des gates, pas des
  // filtres), et les quatre facettes sans colonne à ce jour (type de mission,
  // taille, géographie, résultat structuré).
  describe('usableProofs — filtre par facette (#2424.12)', () => {
    const build3 = () =>
      build({
        proofs: [
          {
            id: 'p-sector',
            account_id: null,
            claim: 'x',
            scope: 'client_safe',
            anonymised: false,
            strength: 'measured',
            sector: 'banque',
            expertise: ['cloud'],
            technologies: ['Java'],
            created_at: new Date(),
          },
          {
            id: 'p-other',
            account_id: null,
            claim: 'y',
            scope: 'client_safe',
            anonymised: false,
            strength: 'measured',
            sector: 'assurance',
            expertise: ['data'],
            technologies: ['Python'],
            created_at: new Date(),
          },
        ],
      })

    it('filtre par secteur', async () => {
      const { service } = build3()
      const usable = await service.usableProofs('w-1', null, { sector: 'banque' })
      expect(usable.map(proof => proof.id)).toEqual(['p-sector'])
    })

    it('filtre par expertise', async () => {
      const { service } = build3()
      const usable = await service.usableProofs('w-1', null, { expertise: ['data'] })
      expect(usable.map(proof => proof.id)).toEqual(['p-other'])
    })

    it('filtre par technologie', async () => {
      const { service } = build3()
      const usable = await service.usableProofs('w-1', null, { technologies: ['Java'] })
      expect(usable.map(proof => proof.id)).toEqual(['p-sector'])
    })

    it('sans facette, rend tout ce qui est mobilisable — inchangé', async () => {
      const { service } = build3()
      const usable = await service.usableProofs('w-1', null)
      expect(usable.map(proof => proof.id).sort()).toEqual(['p-other', 'p-sector'])
    })
  })

  it('refuse un témoignage publiable sans référence d’accord écrit', async () => {
    const { service } = build()
    await expect(
      service.createTestimonial('w-1', { quote: 'Excellente équipe.', publishable: true }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('accepte un témoignage non publiable sans accord — il reste interne', async () => {
    const { service } = build()
    await expect(service.createTestimonial('w-1', { quote: 'Excellente équipe.' })).resolves.toBeTruthy()
  })

  it('refuse un second retour sur la même mission — deux retours se corrigent, ils ne se contredisent pas', async () => {
    const { service } = build({ existingRex: { id: 'r-0' } })
    await expect(
      service.createRex('w-1', 'u-1', { mission_id: '11111111-1111-4111-8111-111111111111', summary: 'Bien passé' }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  // #2424.3 — trois des quinze champs nommés (équipe, compétences,
  // contraintes) : tranche livrée, saisis par l'humain, jamais déduits.
  it('porte l’équipe, les compétences et les contraintes quand elles sont saisies', async () => {
    const { service } = build()
    const rex = await service.createRex('w-1', 'u-1', {
      mission_id: '11111111-1111-4111-8111-111111111111',
      summary: 'Bien passé',
      team: 'Julie (lead), Marc (dev)',
      skills: 'React, PostgreSQL',
      constraints: 'Budget serré, accès VPN limité',
    })
    expect(rex.team).toBe('Julie (lead), Marc (dev)')
    expect(rex.skills).toBe('React, PostgreSQL')
    expect(rex.constraints).toBe('Budget serré, accès VPN limité')
  })

  it('un REX sans équipe/compétences/contraintes saisies les garde NULLES, jamais devinées', async () => {
    const { service } = build()
    const rex = await service.createRex('w-1', 'u-1', {
      mission_id: '11111111-1111-4111-8111-111111111111',
      summary: 'Bien passé',
    })
    expect(rex.team).toBeNull()
    expect(rex.skills).toBeNull()
    expect(rex.constraints).toBeNull()
  })

  // #3210.2 (épopée #3246) — sept des douze champs restants d'un cas validé
  // (offre, expertise, voie d'accès, première porte, preuve mobilisée, durée
  // du cycle, partenaire) : saisis par l'humain, jamais déduits.
  it('porte les sept champs restants d’un cas validé quand ils sont saisis', async () => {
    const { service } = build()
    const rex = await service.createRex('w-1', 'u-1', {
      mission_id: '11111111-1111-4111-8111-111111111111',
      summary: 'Bien passé',
      offer: 'Audit puis TMA',
      expertise: 'Cloud, DevOps',
      access_path: 'Référencement panel',
      first_door: 'DSI',
      proof_used: 'Référence comparable',
      cycle_duration: '4 mois',
      partner: 'ACME Conseil',
    })
    expect(rex.offer).toBe('Audit puis TMA')
    expect(rex.expertise).toBe('Cloud, DevOps')
    expect(rex.access_path).toBe('Référencement panel')
    expect(rex.first_door).toBe('DSI')
    expect(rex.proof_used).toBe('Référence comparable')
    expect(rex.cycle_duration).toBe('4 mois')
    expect(rex.partner).toBe('ACME Conseil')
  })

  it('un REX sans ces sept champs saisis les garde NULS, jamais devinés', async () => {
    const { service } = build()
    const rex = await service.createRex('w-1', 'u-1', {
      mission_id: '11111111-1111-4111-8111-111111111111',
      summary: 'Bien passé',
    })
    expect(rex.offer).toBeNull()
    expect(rex.expertise).toBeNull()
    expect(rex.access_path).toBeNull()
    expect(rex.first_door).toBeNull()
    expect(rex.proof_used).toBeNull()
    expect(rex.cycle_duration).toBeNull()
    expect(rex.partner).toBeNull()
  })

  it('ne compte comme « REX en attente » que les missions FINIES sans retour', async () => {
    const { service } = build({
      missions: [
        { id: 'm-1', status: 'ended', label: 'Data lake', account_id: 'a-1', ends_on: new Date(), started_on: null },
        { id: 'm-2', status: 'active', label: 'En cours', account_id: 'a-1', ends_on: null, started_on: null },
        { id: 'm-3', status: 'ended', label: 'Déjà debriefée', account_id: 'a-1', ends_on: null, started_on: null },
      ],
      rex: [{ mission_id: 'm-3' }],
    })
    const result = await service.forAccount('w-1', 'a-1')
    // Une mission en cours n'attend rien ; une mission déjà débriefée non plus.
    expect(result.pendingRex.map(item => item.mission_id)).toEqual(['m-1'])
    expect(result.delivered).toHaveLength(3)
  })

  // #2424.2 — `completed` est un statut FINI au même titre que `ended`/
  // `terminated` (`MISSION_STATUS_PHASE.completed = 'finished'`), et il en
  // manquait : une mission qui finit par ce statut ne demandait jamais son REX.
  it('compte aussi une mission « completed » comme REX en attente', async () => {
    const { service } = build({
      missions: [
        {
          id: 'm-1',
          status: 'completed',
          label: 'Refonte SI',
          account_id: 'a-1',
          ends_on: new Date(),
          started_on: null,
        },
      ],
      rex: [],
    })
    const result = await service.forAccount('w-1', 'a-1')
    expect(result.pendingRex.map(item => item.mission_id)).toEqual(['m-1'])
  })

  /**
   * #2124.34 — LE RETOUR RECUEILLI ÉTAIT LU, PUIS JETÉ.
   *
   * `forAccount` lisait déjà `rex_entries` — mais uniquement pour SOUSTRAIRE les
   * missions déjà débriefées de « REX en attente ». Le contenu du retour
   * (`summary`, `what_worked`, `what_failed`) ne sortait d'aucune réponse de
   * compte : écrit, stocké, relu en base à chaque ouverture du dossier, et
   * jamais rendu. C'est le défaut n°1 du dépôt dans sa forme « lu et jeté ».
   */
  it('rend les retours DÉJÀ recueillis du compte, avec le libellé de leur mission', async () => {
    const collectedAt = new Date('2026-03-12T09:00:00.000Z')
    const { service } = build({
      missions: [
        { id: 'm-3', status: 'ended', label: 'Data lake', account_id: 'a-1', ends_on: null, started_on: null },
      ],
      rex: [
        {
          id: 'r-9',
          mission_id: 'm-3',
          account_id: 'a-1',
          summary: 'Le sponsor a changé en cours de route.',
          what_worked: 'Le cadrage à trois semaines.',
          what_failed: null,
          collected_at: collectedAt,
        },
      ],
    })
    const result = await service.forAccount('w-1', 'a-1')
    expect(result.collectedRex).toEqual([
      {
        id: 'r-9',
        mission_id: 'm-3',
        mission_label: 'Data lake',
        summary: 'Le sponsor a changé en cours de route.',
        what_worked: 'Le cadrage à trois semaines.',
        what_failed: null,
        team: null,
        skills: null,
        constraints: null,
        offer: null,
        expertise: null,
        access_path: null,
        first_door: null,
        proof_used: null,
        cycle_duration: null,
        partner: null,
        strategy: null,
        buying_model: null,
        organisation: null,
        collected_at: collectedAt.toISOString(),
      },
    ])
  })

  it('un retour dont la mission n’est pas dans ce compte n’invente PAS de libellé', async () => {
    const { service } = build({
      missions: [],
      rex: [
        {
          id: 'r-10',
          mission_id: 'm-hors',
          account_id: 'a-1',
          summary: 'Retour orphelin.',
          what_worked: null,
          what_failed: null,
          collected_at: new Date('2026-03-12T09:00:00.000Z'),
        },
      ],
    })
    const result = await service.forAccount('w-1', 'a-1')
    // `null`, jamais « Mission inconnue » : un libellé de remplissage est une
    // donnée inventée, et l'écran doit pouvoir dire que le nom manque.
    expect(result.collectedRex[0]?.mission_label).toBeNull()
  })

  /**
   * L'écran d'espace `/pilotage/rex`.
   *
   * Ce qui manquait n'était NI la table NI le calcul : `pendingRexForWorkspace`
   * existait, juste, testé, et personne ne l'appelait — le motif n°1 de ce
   * dépôt. Ce que cette lecture ajoute est ce qu'un écran ne peut pas inventer :
   * le NOM du compte derrière l'identifiant, et les retours DÉJÀ recueillis,
   * sans quoi l'écran ne serait qu'une liste de choses à faire.
   */
  describe('rexForWorkspace', () => {
    it('ne lit JAMAIS hors de l’espace — missions, retours et comptes portent tous le filtre', async () => {
      const { service, rex, missions, accounts } = build({
        missions: [
          {
            id: 'm-1',
            status: 'ended',
            label: 'Data lake',
            account_id: 'a-1',
            ends_on: '2026-06-30',
            started_on: null,
          },
        ],
        rex: [{ id: 'r-1', mission_id: 'm-9', account_id: 'a-2', summary: 'Ok', collected_at: new Date() }],
        accounts: [{ id: 'a-1', company_name: 'Vinci' }],
      })
      await service.rexForWorkspace('w-1')

      // Un espace est une ESN, donc un concurrent de son voisin : un libellé de
      // compte qui traverse la cloison est une fuite, pas un confort.
      for (const repository of [rex, missions, accounts]) {
        for (const call of repository.find.mock.calls) {
          const where = (call[0] as { where: unknown }).where
          const clauses = Array.isArray(where) ? where : [where]
          for (const clause of clauses) {
            expect((clause as { workspace_id?: string }).workspace_id).toBe('w-1')
          }
        }
      }
    })

    it('nomme le compte de chaque mission en attente, et n’en invente aucun', async () => {
      const { service } = build({
        missions: [
          {
            id: 'm-1',
            status: 'ended',
            label: 'Data lake',
            account_id: 'a-1',
            ends_on: '2026-06-30',
            started_on: null,
          },
          {
            id: 'm-2',
            status: 'terminated',
            label: 'Socle',
            account_id: 'a-inconnu',
            ends_on: '2026-05-02',
            started_on: null,
          },
        ],
        accounts: [{ id: 'a-1', company_name: 'Vinci' }],
      })
      const result = await service.rexForWorkspace('w-1')

      expect(result.pending.map(row => [row.mission_id, row.account_label])).toEqual([
        ['m-1', 'Vinci'],
        // Un compte que cet espace ne porte pas reste SANS nom : « Compte
        // inconnu » serait une donnée inventée, et l'écran a besoin de savoir
        // que le nom manque pour le dire lui-même.
        ['m-2', null],
      ])
    })

    it('rend les retours DÉJÀ recueillis, du plus récent au plus ancien, avec le nom de leur mission', async () => {
      const { service, rex } = build({
        missions: [
          {
            id: 'm-1',
            status: 'ended',
            label: 'Data lake',
            account_id: 'a-1',
            ends_on: '2026-06-30',
            started_on: null,
          },
        ],
        rex: [
          {
            id: 'r-1',
            mission_id: 'm-1',
            account_id: 'a-1',
            summary: 'Livré dans les temps',
            what_worked: 'Le binôme',
            what_failed: null,
            collected_at: new Date('2026-07-02T09:00:00Z'),
          },
        ],
        accounts: [{ id: 'a-1', company_name: 'Vinci' }],
      })
      const result = await service.rexForWorkspace('w-1')

      expect(rex.find).toHaveBeenCalledWith(expect.objectContaining({ order: { collected_at: 'DESC' } }))
      expect(result.collected).toEqual([
        {
          id: 'r-1',
          mission_id: 'm-1',
          mission_label: 'Data lake',
          account_id: 'a-1',
          account_label: 'Vinci',
          summary: 'Livré dans les temps',
          what_worked: 'Le binôme',
          what_failed: null,
          team: null,
          skills: null,
          constraints: null,
          offer: null,
          expertise: null,
          access_path: null,
          first_door: null,
          proof_used: null,
          cycle_duration: null,
          partner: null,
          strategy: null,
          buying_model: null,
          organisation: null,
          collected_at: '2026-07-02T09:00:00.000Z',
        },
      ])
      // La mission débriefée SORT de la file : sinon l'écran demanderait deux
      // fois le même retour.
      expect(result.pending).toEqual([])
    })

    it('ne va chercher AUCUN compte quand rien n’en référence — pas de requête à vide', async () => {
      const { service, accounts } = build({ missions: [], rex: [] })
      const result = await service.rexForWorkspace('w-1')
      expect(accounts.find).not.toHaveBeenCalled()
      expect(result).toEqual({ pending: [], collected: [] })
    })
  })

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * #2124.49 à .55 — « Laura les propose, l'humain valide » (Louis, 14/09/2026)
   * ───────────────────────────────────────────────────────────────────────────
   *
   * Deux moitiés, et les deux se gardent ici : la proposition n'écrit RIEN, et
   * la validation humaine est le SEUL chemin d'écriture.
   */
  describe('les champs de preuve', () => {
    const mission = {
      id: 'm-1',
      label: 'Migration du socle vers les conteneurs',
      role_title: 'Architecte plateforme',
      need_id: 'n-1',
      ends_on: '2026-07-01',
    }

    it('propose depuis la mission, le besoin et le retour — et n’écrit RIEN', async () => {
      const { service, proofs, rex, missions } = build({
        oneMission: mission,
        needs: [{ id: 'n-1', title: 'Réduire le délai de mise en production', skills: [{ term: 'Kubernetes' }] }],
        existingRex: {
          mission_id: 'm-1',
          summary: 'Close en juillet.',
          what_worked: 'Délai passé de 3 semaines à 2 jours.',
        },
      })

      const read = await service.proofProposalForMission('w-1', 'm-1')

      expect(read.proposal.claim?.value).toBe('Migration du socle vers les conteneurs')
      expect(read.proposal.problem?.value).toBe('Réduire le délai de mise en production')
      expect(read.proposal.result?.value).toBe('Délai passé de 3 semaines à 2 jours.')
      expect(read.proposal.expertise?.value).toEqual(['Architecte plateforme', 'Kubernetes'])
      expect(read.proposal.source).toBe('rex')
      // AUCUNE écriture : c'est la doctrine, pas une préférence.
      expect(proofs.save).not.toHaveBeenCalled()
      expect(rex.save).not.toHaveBeenCalled()
      expect(missions.findOne).toHaveBeenCalled()
    })

    it('SAIT DIRE NON : ne propose pas par-dessus une valeur déjà posée', async () => {
      const { service } = build({
        oneMission: mission,
        needs: [{ id: 'n-1', title: 'Réduire le délai', skills: [] }],
        oneProof: {
          id: 'p-9',
          mission_id: 'm-1',
          claim: 'Migration de 400 To',
          problem: 'Le client ne savait pas livrer',
        },
      })

      const read = await service.proofProposalForMission('w-1', 'm-1')

      expect(read.proof_id).toBe('p-9')
      expect(read.proposal.claim).toBeNull()
      expect(read.proposal.problem).toBeNull()
    })

    it('#4559 — le besoin d’un AUTRE espace ne fournit jamais son intitulé (proposition et validation)', async () => {
      const foreign = { id: 'n-1', workspace_id: 'w-autre', title: 'Besoin confidentiel', skills: [] }
      // Le dépôt ne rend le besoin que si la requête n'est PAS filtrée sur l'espace.
      const filtered = (args: { where: { workspace_id?: string } }) =>
        Promise.resolve(
          args.where.workspace_id === undefined || args.where.workspace_id === foreign.workspace_id ? foreign : null,
        )
      const { service, needs } = build({ oneMission: mission })
      needs.findOne.mockImplementation(filtered)

      const read = await service.proofProposalForMission('w-1', 'm-1')
      expect(needs.findOne).toHaveBeenCalledWith({ where: { id: 'n-1', workspace_id: 'w-1' } })
      expect(JSON.stringify(read)).not.toContain('Besoin confidentiel')

      needs.findOne.mockClear()
      await service.proofProposalForMission('w-1', 'm-1')
      expect(needs.findOne.mock.calls.every(([a]) => a.where.workspace_id === 'w-1')).toBe(true)
    })

    it('une mission d’un autre espace est introuvable', async () => {
      const { service } = build({ oneMission: null })
      await expect(service.proofProposalForMission('w-1', 'm-1')).rejects.toThrow(NotFoundException)
    })

    it('la validation humaine écrit, date la provenance et incrémente la version', async () => {
      const { service, proofs } = build({
        oneProof: {
          id: 'p-9',
          workspace_id: 'w-1',
          mission_id: null,
          claim: 'Migration de 400 To',
          version: 1,
          field_provenance: {},
        },
      })

      const proof = await service.validateProofFields('w-1', 'u-1', 'p-9', {
        problem: 'Le client ne savait pas livrer',
        citation_allowed: true,
      })

      expect(proof.problem).toBe('Le client ne savait pas livrer')
      expect(proof.citation_allowed).toBe(true)
      expect(proof.version).toBe(2)
      expect(proof.field_provenance?.problem?.origin).toBe('human')
      expect(proof.field_provenance?.problem?.at).toEqual(expect.any(String))
      expect(proofs.save).toHaveBeenCalled()
    })

    it('un champ validé TEL QUEL garde l’enregistrement d’origine dans sa provenance', async () => {
      const { service } = build({
        oneMission: mission,
        needs: [{ id: 'n-1', title: 'Réduire le délai de mise en production', skills: [] }],
        oneProof: {
          id: 'p-9',
          workspace_id: 'w-1',
          mission_id: 'm-1',
          claim: 'Migration de 400 To',
          version: 3,
          field_provenance: {},
        },
      })

      const proof = await service.validateProofFields('w-1', 'u-1', 'p-9', {
        problem: 'Réduire le délai de mise en production',
        kept_from_proposal: ['problem'],
      })

      expect(proof.field_provenance?.problem).toEqual({
        origin: 'proposed',
        at: expect.any(String),
        from: 'need',
      })
      expect(proof.version).toBe(4)
    })

    it('un champ ABSENT n’est pas touché, un champ à null est effacé volontairement', async () => {
      const { service } = build({
        oneProof: {
          id: 'p-9',
          workspace_id: 'w-1',
          mission_id: null,
          claim: 'Migration de 400 To',
          problem: 'Un problème posé avant',
          result: 'Un résultat posé avant',
          version: 1,
          field_provenance: {},
        },
      })

      const proof = await service.validateProofFields('w-1', 'u-1', 'p-9', { result: null })

      expect(proof.problem).toBe('Un problème posé avant')
      expect(proof.result).toBeNull()
    })
  })

  /**
   * #2424.14 — RBAC et masquage tenaient déjà (`records:write`, `scope`) ;
   * l'audit manquait : aucune trace de QUI a écrit une preuve, ni quand.
   * `record_field_audit` porte déjà ce rôle pour le CRM (`ProvenanceService`) —
   * une preuve écrit dedans directement, `entity_type: 'proof'`, sans passer
   * par l'arbitrage `field_provenance` du CRM (une preuve a son PROPRE modèle
   * de provenance, déjà porté par sa colonne `field_provenance` jsonb).
   */
  describe('#2424.14 — audit des écritures de preuve', () => {
    it('createProof journalise la création', async () => {
      const { service, auditLog } = build()
      const proof = await service.createProof('w-1', 'u-1', { claim: 'Migration de 400 To en 6 mois' })
      expect(auditLog.save).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: 'w-1',
          entity_type: 'proof',
          entity_id: proof.id,
          field: 'proof',
          old_value: null,
          source: 'human',
          actor_id: 'u-1',
        }),
      )
    })

    it('validateProofFields journalise chaque champ VALIDÉ', async () => {
      const { service, auditLog } = build({
        oneProof: {
          id: 'p-9',
          workspace_id: 'w-1',
          mission_id: null,
          claim: 'Migration de 400 To',
          version: 1,
          field_provenance: {},
        },
      })
      await service.validateProofFields('w-1', 'u-2', 'p-9', { claim: 'Migration de 400 To en 6 mois' })
      expect(auditLog.save).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: 'w-1',
          entity_type: 'proof',
          entity_id: 'p-9',
          field: 'claim',
          old_value: 'Migration de 400 To',
          new_value: 'Migration de 400 To en 6 mois',
          source: 'human',
          actor_id: 'u-2',
        }),
      )
    })

    // #4158.49 — la référence client est lisible par toute l'équipe ; la MODIFIER
    // revient à son auteur ou à un détenteur de `team:manage`.
    describe('assertCanModifyProof (#4158.49)', () => {
      it('l’auteur peut modifier sa référence', async () => {
        const { service } = build({ oneProof: { id: 'p-1', workspace_id: 'w-1', created_by: 'u-1' } })
        await expect(service.assertCanModifyProof('w-1', 'u-1', 'p-1', false)).resolves.toBeUndefined()
      })

      it('un détenteur de team:manage peut modifier la référence d’un collègue', async () => {
        const { service } = build({ oneProof: { id: 'p-1', workspace_id: 'w-1', created_by: 'u-1' } })
        await expect(service.assertCanModifyProof('w-1', 'u-2', 'p-1', true)).resolves.toBeUndefined()
      })

      it('un autre membre ordinaire reçoit 403', async () => {
        const { service } = build({ oneProof: { id: 'p-1', workspace_id: 'w-1', created_by: 'u-1' } })
        await expect(service.assertCanModifyProof('w-1', 'u-2', 'p-1', false)).rejects.toThrow(ForbiddenException)
      })

      it('une référence d’un AUTRE espace est introuvable (404), même pour un manager', async () => {
        const { service, proofs } = build({})
        await expect(service.assertCanModifyProof('w-2', 'u-2', 'p-1', true)).rejects.toThrow(NotFoundException)
        expect((proofs as unknown as { findOne: jest.Mock }).findOne).toHaveBeenCalledWith({
          where: { id: 'p-1', workspace_id: 'w-2' },
        })
      })

      it('une référence sans auteur enregistré reste modifiable (on ne verrouille pas ce qu’on ne sait pas attribuer)', async () => {
        const { service } = build({ oneProof: { id: 'p-1', workspace_id: 'w-1', created_by: null } })
        await expect(service.assertCanModifyProof('w-1', 'u-2', 'p-1', false)).resolves.toBeUndefined()
      })
    })

    it('removeProof journalise la suppression, avec QUI l’a demandée', async () => {
      const { service, proofs, auditLog } = build({ oneProof: { id: 'p-9', workspace_id: 'w-1', claim: 'x' } })
      await service.removeProof('w-1', 'u-3', 'p-9')
      expect(proofs.delete).toHaveBeenCalledWith({ id: 'p-9', workspace_id: 'w-1' })
      expect(auditLog.save).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: 'w-1',
          entity_type: 'proof',
          entity_id: 'p-9',
          field: 'proof',
          new_value: null,
          source: 'human',
          actor_id: 'u-3',
        }),
      )
    })
  })

  describe('similarCases (#3210, LAU-FINAL-216)', () => {
    it('#3210.1 — compare les ESN partenaires du compte cible à celles d’un cas gagné, sans lire les concurrents ni les lignes écartées', async () => {
      const { service, accountPartners } = build({
        targetAccount: { id: 'target', sector: 'Banque', employees: '500-1000', group_role: null },
        missions: [{ id: 'm-1', label: 'Audit', account_id: 'geodis', workspace_id: 'w-1' }],
        rex: [
          {
            mission_id: 'm-1',
            account_id: null,
            what_worked: 'x',
            what_failed: null,
            collected_at: new Date('2026-06-01'),
          },
        ],
        accounts: [{ id: 'geodis', company_name: 'Geodis', sector: 'Banque', employees: '500-1000', group_role: null }],
        partnerRows: [
          { account_id: 'target', name: 'Alten', relationship: 'partner', dismissed_at: null },
          { account_id: 'geodis', name: 'alten', relationship: 'partner', dismissed_at: null },
          { account_id: 'geodis', name: 'Sopra', relationship: 'competitor', dismissed_at: null },
          { account_id: 'target', name: 'Cap', relationship: 'partner', dismissed_at: new Date() },
        ],
      })
      const result = await service.similarCases('w-1', 'target')
      expect(result?.cases[0].similarities).toContain('Partenaire en place en commun (Alten).')
      expect(accountPartners.find).toHaveBeenCalledTimes(1)
      expect(JSON.stringify(accountPartners.find.mock.calls[0][0])).toContain('w-1')
    })

    it('#3246 (lot W9) — compare stratégie et modèle d’achat : REX gagné et opportunité perdue contre la demande ouverte du compte cible', async () => {
      const { service } = build({
        targetAccount: { id: 'target', sector: 'Banque', employees: '500-1000', group_role: null },
        projectRows: [
          {
            id: 'open',
            account_id: 'target',
            stage: 'qualified',
            archived_at: null,
            strategy: 'via_partenaire',
            buying_model: 'appel_offres',
          },
        ],
        missions: [{ id: 'm-1', label: 'Audit', account_id: 'geodis', workspace_id: 'w-1' }],
        rex: [
          {
            mission_id: 'm-1',
            account_id: null,
            what_worked: 'x',
            what_failed: null,
            strategy: 'via_partenaire',
            buying_model: 'gre_a_gre',
            collected_at: new Date('2026-06-01'),
          },
        ],
        lostProjects: [
          { id: 'l-1', label: 'Refonte', account_id: 'lostco', loss_reason: 'Prix', strategy: 'conquete_directe' },
        ],
        accounts: [
          { id: 'geodis', company_name: 'Geodis', sector: 'Banque', employees: '500-1000', group_role: null },
          { id: 'lostco', company_name: 'LostCo', sector: 'Banque', employees: '500-1000', group_role: null },
        ],
      })
      const result = await service.similarCases('w-1', 'target')
      const won = result?.cases.find(c => c.outcome === 'won')
      const lost = result?.cases.find(c => c.outcome === 'lost')
      expect(won?.similarities).toContain('Même stratégie d’approche (via un partenaire).')
      expect(won?.differences).toContain('Modèle d’achat différent (gré à gré contre appel d’offres).')
      expect(lost?.differences).toContain(
        'Stratégie d’approche différente (conquête directe contre via un partenaire).',
      )
    })

    it('#3246 (lot cloud 14/10) — compare l’organisation de la décision : REX gagné et opportunité perdue contre la demande ouverte du compte cible', async () => {
      const { service } = build({
        targetAccount: { id: 'target', sector: 'Banque', employees: '500-1000', group_role: null },
        projectRows: [
          {
            id: 'open',
            account_id: 'target',
            stage: 'qualified',
            archived_at: null,
            organisation: 'comite_elargi',
          },
        ],
        missions: [{ id: 'm-1', label: 'Audit', account_id: 'geodis', workspace_id: 'w-1' }],
        rex: [
          {
            mission_id: 'm-1',
            account_id: null,
            what_worked: 'x',
            what_failed: null,
            organisation: 'comite_elargi',
            collected_at: new Date('2026-06-01'),
          },
        ],
        lostProjects: [
          { id: 'l-1', label: 'Refonte', account_id: 'lostco', loss_reason: 'Prix', organisation: 'decideur_unique' },
        ],
        accounts: [
          { id: 'geodis', company_name: 'Geodis', sector: 'Banque', employees: '500-1000', group_role: null },
          { id: 'lostco', company_name: 'LostCo', sector: 'Banque', employees: '500-1000', group_role: null },
        ],
      })
      const result = await service.similarCases('w-1', 'target')
      const won = result?.cases.find(c => c.outcome === 'won')
      const lost = result?.cases.find(c => c.outcome === 'lost')
      expect(won?.similarities).toContain('Même organisation de la décision (comité élargi).')
      expect(lost?.differences).toContain(
        'Organisation de la décision différente (décideur unique contre comité élargi).',
      )
    })

    it('#3246.timing — position de l’affaire ouverte dans le cycle habituel (médiane des cycles clos de l’espace), contre celle de chaque perte', async () => {
      const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)
      const lost = (id: string, cycle: number) => ({
        id,
        label: `Perte ${id}`,
        account_id: `acc-${id}`,
        loss_reason: 'Prix',
        first_detected_at: daysAgo(400 + cycle),
        closed_at: daysAgo(400),
      })
      const { service } = build({
        targetAccount: { id: 'target', sector: 'Banque', employees: '500-1000', group_role: null },
        // Ouverte depuis 200 jours, médiane des cycles clos = 90 jours → au-delà du cycle habituel.
        projectRows: [
          { id: 'open', account_id: 'target', stage: 'qualified', archived_at: null, first_detected_at: daysAgo(200) },
        ],
        lostProjects: [lost('a', 60), lost('b', 90), lost('c', 120)],
        accounts: ['a', 'b', 'c'].map(id => ({
          id: `acc-${id}`,
          company_name: `Co ${id}`,
          sector: 'Banque',
          employees: '500-1000',
          group_role: null,
        })),
      })
      const result = await service.similarCases('w-1', 'target')
      const byId = (id: string) => result?.cases.find(c => c.accountId === `acc-${id}`)
      expect(byId('c')?.similarities).toContain('Même position dans le cycle habituel (au-delà du cycle habituel).')
      expect(byId('a')?.differences).toContain(
        'Position différente dans le cycle habituel (dans le cycle habituel sur ce cas, contre au-delà du cycle habituel ici).',
      )
      expect(result?.unavailableDimensions.map(d => d.dimension)).not.toContain('timing')
    })

    it('#3246.timing — SAIT DIRE NON : deux cycles clos seulement, le timing ne compte NI pour NI contre et se NOMME non évaluable', async () => {
      const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)
      const { service } = build({
        targetAccount: { id: 'target', sector: 'Banque', employees: '500-1000', group_role: null },
        projectRows: [
          { id: 'open', account_id: 'target', stage: 'qualified', archived_at: null, first_detected_at: daysAgo(200) },
        ],
        lostProjects: [
          {
            id: 'l-1',
            label: 'A',
            account_id: 'lostco',
            loss_reason: 'Prix',
            first_detected_at: daysAgo(500),
            closed_at: daysAgo(400),
          },
          {
            id: 'l-2',
            label: 'B',
            account_id: 'lostco',
            loss_reason: 'Prix',
            first_detected_at: daysAgo(450),
            closed_at: daysAgo(400),
          },
        ],
        accounts: [{ id: 'lostco', company_name: 'LostCo', sector: 'Banque', employees: '500-1000', group_role: null }],
      })
      const result = await service.similarCases('w-1', 'target')
      for (const found of result?.cases ?? []) {
        expect([...found.similarities, ...found.differences].join(' ')).not.toMatch(/cycle/i)
      }
      expect(result?.unavailableDimensions).toContainEqual({
        dimension: 'timing',
        reason: expect.stringContaining('2 cycles clos'),
      })
    })

    it('#3246.relation — compare le stade SAISI (mémoire de relation) ; le texte libre n’est jamais parsé', async () => {
      const { service } = build({
        targetAccount: {
          id: 'target',
          sector: 'Banque',
          employees: '500-1000',
          group_role: null,
          relationship_memory: { relation: 'ancien client', relationStage: 'ancien_client' },
        },
        lostProjects: [
          { id: 'l-1', label: 'A', account_id: 'same', loss_reason: 'Prix' },
          { id: 'l-2', label: 'B', account_id: 'textonly', loss_reason: 'Prix' },
        ],
        accounts: [
          {
            id: 'same',
            company_name: 'Same',
            sector: 'Banque',
            employees: '500-1000',
            group_role: null,
            relationship_memory: { relationStage: 'ancien_client' },
          },
          {
            id: 'textonly',
            company_name: 'TextOnly',
            sector: 'Banque',
            employees: '500-1000',
            group_role: null,
            // Le texte dit « ancien client » mais AUCUN stade n'est saisi : rien n'est déduit.
            relationship_memory: { relation: 'ancien client' },
          },
        ],
      })
      const result = await service.similarCases('w-1', 'target')
      expect(result?.cases.find(c => c.accountId === 'same')?.similarities).toContain(
        'Même stade de relation (ancien client).',
      )
      const textOnly = result?.cases.find(c => c.accountId === 'textonly')
      expect([...(textOnly?.similarities ?? []), ...(textOnly?.differences ?? [])].join(' ')).not.toMatch(/relation/i)
      expect(result?.unavailableDimensions.map(d => d.dimension)).not.toContain('relation')
    })

    it('#3210.1 (lot R17) — compare les canaux déjà utilisés et la référence client publiable, lus via les contacts et les témoignages', async () => {
      const { service } = build({
        targetAccount: { id: 'target', sector: 'Banque', employees: '500-1000', group_role: null },
        missions: [{ id: 'm-1', label: 'Audit', account_id: 'geodis', workspace_id: 'w-1' }],
        rex: [
          {
            mission_id: 'm-1',
            account_id: null,
            what_worked: 'x',
            what_failed: null,
            collected_at: new Date('2026-06-01'),
          },
        ],
        accounts: [{ id: 'geodis', company_name: 'Geodis', sector: 'Banque', employees: '500-1000', group_role: null }],
        contactRows: [
          { id: 'contact-target', account_id: 'target' },
          { id: 'contact-geodis', account_id: 'geodis' },
        ],
        outreachRows: [
          { contact_id: 'contact-target', channel: 'linkedin' },
          { contact_id: 'contact-geodis', channel: 'linkedin' },
        ],
        testimonialRows: [{ account_id: 'geodis' }],
      })
      const result = await service.similarCases('w-1', 'target')
      expect(result?.cases[0].similarities).toContain('Même canal déjà utilisé (linkedin).')
      // La cible elle-même n'a pas de référence publiable : absente d'un côté, jamais devinée.
      expect(result?.cases[0].similarities.join(' ')).not.toMatch(/[Rr]éférence/)
    })

    it('#3246 — une liste vide NOMME ce qui a été regardé : combien de retours et d’opportunités perdues', async () => {
      // Un cas existe dans l'espace, mais rien de mesurable en commun : l'absence
      // est dite avec son périmètre, jamais un « aucun cas » nu.
      const { service } = build({
        targetAccount: { id: 'target', sector: 'Banque', employees: '500-1000', group_role: null },
        missions: [{ id: 'm-1', label: 'Audit', account_id: 'geodis', workspace_id: 'w-1' }],
        rex: [{ mission_id: 'm-1', account_id: null, what_worked: 'x', what_failed: null, collected_at: new Date() }],
        accounts: [{ id: 'geodis', company_name: 'Geodis', sector: 'Logistique', employees: '50', group_role: null }],
      })
      const result = await service.similarCases('w-1', 'target')
      expect(result?.cases).toEqual([])
      expect(result?.examined).toEqual({ won: 1, lost: 0 })
    })

    it('#3246 — un espace sans aucun retour ni opportunité perdue le dit : 0 et 0', async () => {
      const { service } = build({ targetAccount: { id: 'target', sector: 'Banque', employees: '1', group_role: null } })
      const result = await service.similarCases('w-1', 'target')
      expect(result).toEqual({
        cases: [],
        examined: { won: 0, lost: 0 },
        // #3246 — relation non saisie et 0 cycle clos : les deux NOMMÉES non évaluables, jamais 0.
        unavailableDimensions: [
          { dimension: 'organisation', reason: expect.stringContaining('non renseignée') },
          { dimension: 'relation', reason: expect.stringContaining('non saisi') },
          { dimension: 'timing', reason: expect.stringContaining('0 cycles clos') },
        ],
        caseMemory: [],
        targetKnown: { sector: true, size: true },
        // #3210.1 (lot M11) — sans lecteur d'activités, la source se nomme indisponible.
        unavailableSources: [{ source: 'rendez-vous', reason: expect.stringContaining('lecture indisponible') }],
      })
    })

    // #3246 (lot RAA 10/10) — « non mesuré » ≠ « aucun » : le compte dit ce qu'il renseigne.
    it('#3246 — targetKnown : une taille ou un secteur absents du compte ne se lisent pas comme « 0 cas »', async () => {
      const { service } = build({
        targetAccount: { id: 'target', sector: 'Banque', employees: null, group_role: null },
      })
      const result = await service.similarCases('w-1', 'target')
      expect(result?.targetKnown).toEqual({ sector: true, size: false })
    })

    // #3210.1 (lot M11 09/10) — rendez-vous et mémoire par cas, sur l'appelant réel.
    it('#3210.1 — un rendez-vous des deux côtés devient une similitude ; la mémoire par cas compte sans nommer', async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce([{ count: '4' }])
        .mockResolvedValueOnce([{ account_id: 'target' }, { account_id: 'geodis' }])
      const { service } = build({
        targetAccount: { id: 'target', sector: 'Banque', employees: '500-1000', group_role: null },
        missions: [{ id: 'm-1', label: 'Audit', account_id: 'geodis', workspace_id: 'w-1' }],
        rex: [{ mission_id: 'm-1', account_id: null, what_worked: 'x', what_failed: null, collected_at: new Date() }],
        accounts: [{ id: 'geodis', company_name: 'Geodis', sector: 'Banque', employees: '50', group_role: null }],
        activities: { manager: { query } },
      })
      const result = await service.similarCases('w-1', 'target')
      expect(result?.cases[0]?.similarities).toContain('Un rendez-vous a déjà été tenu des deux côtés.')
      expect(result?.caseMemory).toEqual([{ dimension: 'secteur', value: 'Banque', won: 1, lost: 0 }])
      expect(JSON.stringify(result?.caseMemory)).not.toContain('Geodis')
      expect(result?.unavailableSources).toEqual([])
      const [sql, params] = query.mock.calls[1] as [string, unknown[]]
      expect(sql).toContain("kind = 'meeting'")
      expect(sql).not.toMatch(/\bbody\b|\bsubject\b/)
      expect(params[0]).toBe('w-1')
    })

    it('#3210.1 — SAIT DIRE NON : un espace sans aucun rendez-vous capté nomme la source absente', async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([])
      const { service } = build({
        targetAccount: { id: 'target', sector: 'Banque', employees: '1', group_role: null },
        activities: { manager: { query } },
      })
      const result = await service.similarCases('w-1', 'target')
      expect(result?.unavailableSources).toEqual([
        { source: 'rendez-vous', reason: expect.stringContaining('aucun rendez-vous enregistré') },
      ])
    })

    it('rend null quand le compte cible est introuvable dans cet espace', async () => {
      const { service } = build({ targetAccount: null })
      expect(await service.similarCases('w-1', 'missing')).toBeNull()
    })

    it('compose un cas GAGNÉ depuis un REX validé, avec le nom réel du compte', async () => {
      const { service } = build({
        targetAccount: { id: 'target', sector: 'Banque', employees: '500-1000', group_role: null },
        missions: [{ id: 'm-1', label: 'Audit d’entrée', account_id: 'geodis', workspace_id: 'w-1' }],
        rex: [
          {
            mission_id: 'm-1',
            account_id: null,
            what_worked: 'Verticalisation et direction de programme identifiable.',
            what_failed: null,
            collected_at: new Date('2026-06-01T00:00:00Z'),
          },
        ],
        accounts: [{ id: 'geodis', company_name: 'Geodis', sector: 'Banque', employees: '500-1000', group_role: null }],
      })
      const result = await service.similarCases('w-1', 'target')
      expect(result?.cases).toEqual([
        expect.objectContaining({
          accountId: 'geodis',
          accountLabel: 'Geodis',
          outcome: 'won',
          whatWorked: 'Verticalisation et direction de programme identifiable.',
        }),
      ])
    })

    it('compose un cas PERDU depuis une opportunité `lost`, avec son motif', async () => {
      const { service } = build({
        targetAccount: { id: 'target', sector: 'Banque', employees: '500-1000', group_role: null },
        lostProjects: [
          {
            id: 'proj-1',
            label: 'Grand groupe bancaire',
            account_id: 'other',
            loss_reason: 'Aucune relation préalable.',
            closed_at: new Date('2026-05-01T00:00:00Z'),
          },
        ],
        accounts: [
          { id: 'other', company_name: 'Autre Banque', sector: 'Banque', employees: '10-50', group_role: null },
        ],
      })
      const result = await service.similarCases('w-1', 'target')
      expect(result?.cases).toEqual([
        expect.objectContaining({ accountId: 'other', outcome: 'lost', lossReason: 'Aucune relation préalable.' }),
      ])
    })

    it('#3210.3 — compare territoire, expertise, accès et offre du compte cible à ceux du cas (opportunité ouverte vs mission)', async () => {
      const { service } = build({
        targetAccount: {
          id: 'target',
          sector: null,
          employees: null,
          group_role: null,
          registry_country: 'FR',
        },
        projectRows: [
          {
            id: 'p-open',
            account_id: 'target',
            stage: 'qualification',
            archived_at: null,
            updated_at: new Date('2026-09-01T00:00:00Z'),
            primary_domain_code: 'data_engineering',
            application_sector_codes: ['banque'],
            access_mode: 'direct_reference',
            offer: 'TMA',
          },
          { id: 'p-won', account_id: 'geodis', stage: 'won', access_mode: 'direct_reference', offer: 'TMA' },
        ],
        missions: [
          {
            id: 'm-1',
            label: 'TMA Geodis',
            account_id: 'geodis',
            opportunity_id: 'p-won',
            primary_domain_code: 'data_engineering',
            application_sector_codes: ['banque', 'assurance'],
          },
        ],
        rex: [{ mission_id: 'm-1', account_id: null, what_worked: 'Sponsor identifié.', collected_at: new Date() }],
        accounts: [
          {
            id: 'geodis',
            company_name: 'Geodis',
            sector: null,
            employees: null,
            group_role: null,
            registry_country: 'FR',
          },
        ],
      })
      const result = await service.similarCases('w-1', 'target')
      expect(result?.cases[0]?.similarities).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Même territoire'),
          expect.stringContaining('Même expertise'),
          expect.stringContaining('Même niveau d’accès'),
          expect.stringContaining('Même offre'),
          expect.stringContaining('Périmètre applicatif en commun'),
        ]),
      )
    })

    it('#3210.3 — sans opportunité ouverte côté cible, ces axes ne sont pas comparés (pas de ressemblance devinée)', async () => {
      const { service } = build({
        targetAccount: { id: 'target', sector: 'Banque', employees: null, group_role: null, registry_country: 'FR' },
        projectRows: [],
        missions: [{ id: 'm-1', label: 'X', account_id: 'geodis', primary_domain_code: 'cloud' }],
        rex: [{ mission_id: 'm-1', account_id: null, what_worked: 'ok', collected_at: new Date() }],
        accounts: [
          {
            id: 'geodis',
            company_name: 'Geodis',
            sector: 'Banque',
            employees: null,
            group_role: null,
            registry_country: 'FR',
          },
        ],
      })
      const result = await service.similarCases('w-1', 'target')
      const all = [...(result?.cases[0]?.similarities ?? []), ...(result?.cases[0]?.differences ?? [])].join(' ')
      expect(all).not.toMatch(/expertise|accès|offre/i)
    })
  })
})
