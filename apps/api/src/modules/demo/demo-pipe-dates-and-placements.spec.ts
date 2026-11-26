import { pipelineSummary, PIPELINE_STAGES } from '@bellum/contracts'
import { PIPE_TENSION_DAYS } from '../laura/laura-detector'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountEntityRow } from '../../database/entities/account-entity.entity'
import { ActionPlanEntity } from '../../database/entities/action-plan.entity'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { AttackAngleEntity } from '../../database/entities/attack-angle.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ConsultantDocumentEntity } from '../../database/entities/consultant-document.entity'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { ConsultantSkillEntity } from '../../database/entities/consultant-skill.entity'
import { ConsultantExperienceEntity } from '../../database/entities/consultant-experience.entity'
import { TalentPreparedMessageEntity } from '../../database/entities/talent-prepared-message.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { MemberObjectiveEntity } from '../../database/entities/member-objective.entity'
import { NoteEntity } from '../../database/entities/note.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { RagDocumentEntity } from '../../database/entities/rag-document.entity'
import { RfpEntity } from '../../database/entities/rfp.entity'
import { TaskEntity } from '../../database/entities/task.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { ApprovalRequestEntity } from '../../database/entities/approval-request.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { UserFavoriteEntity } from '../favorites/user-favorite.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { DEMO_PIPELINE_STATES } from './demo-coverage'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'
import { DemoSeedService } from './demo-seed.service'

/**
 * CE QUE LA SALLE MONTRE DU PIPE, ET DU PROFIL QU'UN CLIENT REDEMANDE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE À CÔTÉ DES AUTRES
 * ─────────────────────────────────────────────────────────────────────────────
 * `demo-coverage.spec.ts` classe des TABLES, `demo-propagation-coverage.spec.ts`
 * recompte des agrégats sur le JEU DE DONNÉES. Aucune des deux ne peut voir ce
 * qui se joue ici : trois propriétés qui ne dépendent ni d'une table de plus, ni
 * d'un champ du jeu, mais de ce que le semis ÉCRIT RÉELLEMENT et de ce que la
 * dérivation en fait.
 *
 *  1. un consultant placé TROIS fois chez le même client — sans quoi le
 *     compteur « placé N fois » du vivier ne montre jamais ce qu'il compte ;
 *  2. des dates de signature attendue ÉTALÉES, dont au moins une AU-DELÀ DE
 *     SOIXANTE JOURS — sans quoi la salle raconte une ESN qui n'a plus rien à
 *     signer au-delà du trimestre ;
 *  3. un pipe où COEXISTENT des affaires chiffrées et une affaire non chiffrée
 *     — sans quoi le plancher (« au moins X € sur N projets »), le compteur
 *     « 1 projet sans montant saisi » et la pastille de colonne sont livrés et
 *     invisibles en démonstration.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ ELLE LIT LE SQL RÉELLEMENT ÉMIS, PAS LE JEU DE DONNÉES
 * ─────────────────────────────────────────────────────────────────────────────
 * Un champ ajouté à `demo-dataset.ts` que `DemoSeedService` n'écrirait pas
 * laisserait cette garde verte si elle relisait le jeu — c'est le défaut
 * « chemin d'écriture non branché », déjà payé trois fois dans ce dépôt. Chaque
 * test part donc des paramètres que le semis a réellement passés à Postgres.
 *
 * ⚠️ ET ELLE NE JOINT RIEN PAR RANG. Les quatre `INSERT INTO opportunities` du
 * semis n'ont pas la même liste de colonnes : lire `params[6]` pour « le
 * montant » marcherait sur trois et mentirait sur la quatrième. La liste de
 * colonnes est donc APPARIÉE à la liste de valeurs, et chaque champ est demandé
 * PAR SON NOM — la version de « jointure par position » qu'on ne voit pas
 * passer.
 */

/** Un `INSERT` décodé : chaque colonne rendue par son NOM, jamais par son rang. */
type DecodedInsert = (column: string) => unknown

/**
 * Apparie `INSERT INTO t (a, b, c) VALUES ($1, 'litt', $2::date)` avec ses
 * paramètres, et rend un accesseur par nom de colonne.
 *
 * Les littéraux SQL (`'won'`, `'EUR'`) sont rendus tels quels : sans eux, une
 * étape écrite en dur dans la requête ressortirait `undefined` et le projet
 * gagné disparaîtrait silencieusement du pipe reconstruit.
 */
function decodeInsert(sql: string, params: readonly unknown[]): DecodedInsert | null {
  const match = /INSERT INTO \w+\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/i.exec(sql)
  if (!match?.[1] || !match[2]) return null
  const columns = match[1].split(',').map(part => part.trim())
  const values = match[2].split(',').map(part => part.trim())
  if (columns.length !== values.length) return null
  return (column: string): unknown => {
    const index = columns.indexOf(column)
    if (index < 0) return undefined
    const token = values[index] ?? ''
    const placeholder = /^\$(\d+)/.exec(token)
    if (placeholder?.[1]) return params[Number(placeholder[1]) - 1]
    const literal = /^'([^']*)'$/.exec(token)
    return literal ? literal[1] : undefined
  }
}

/** Aujourd'hui, en date nue — la forme que Postgres compare à `current_date`. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Combien de jours séparent une date nue d'aujourd'hui. Positif = à venir. */
function daysFromToday(date: string): number {
  const at = Date.parse(`${date}T00:00:00Z`)
  const now = Date.parse(`${today()}T00:00:00Z`)
  return Math.round((at - now) / 86_400_000)
}

/**
 * Le seuil au-delà duquel une affaire datée prouve que le pipe porte encore
 * quelque chose. Deux mois — la question qu'un directeur d'agence pose.
 *
 * ⚠️ IMPORTÉ du détecteur, jamais recopié : `60` écrit ici aurait laissé cette
 * garde verte le jour où le seuil réel passe à 90, pendant que la salle de
 * démonstration se mettrait à crier « ton pipe se vide » devant un prospect.
 */
const DRY_PIPE_HORIZON_DAYS = PIPE_TENSION_DAYS

/**
 * Le prédicat, ISOLÉ pour qu'on puisse le prendre en défaut : « toutes les
 * affaires datées tombent-elles sous l'horizon ? ». Vrai = le pipe s'assèche.
 *
 * Une salle de démonstration ne doit JAMAIS le rendre vrai : elle raconterait
 * une ESN à l'agonie à un prospect.
 */
function pipeRunsDry(expectedCloseDates: readonly string[]): boolean {
  if (expectedCloseDates.length === 0) return false
  return expectedCloseDates.every(date => daysFromToday(date) <= DRY_PIPE_HORIZON_DAYS)
}

describe('la salle de démonstration — dates du pipe et placements répétés', () => {
  let service: DemoSeedService
  let accounts: MockRepository<AccountEntity>

  /** Les consultants que le semis retrouve par leur nom, et leur identifiant. */
  const CONSULTANTS: { id: string; full_name: string }[] = [
    { id: 'cons-1', full_name: 'Yanis Berthier' },
    { id: 'cons-2', full_name: 'Salomé Dufour' },
    { id: 'cons-3', full_name: 'Antoine Rivière' },
    { id: 'cons-4', full_name: 'Inès Kaczmarek' },
    { id: 'cons-5', full_name: 'Camille Roussel' },
    { id: 'cons-6', full_name: 'Hakim Barreau' },
    { id: 'cons-7', full_name: 'Marc Ouedraogo' },
  ]

  beforeEach(async () => {
    const workspaces = createMockRepository<WorkspaceEntity>()
    const members = createMockRepository<WorkspaceMemberEntity>()
    const profiles = createMockRepository<ProfileEntity>()
    accounts = createMockRepository<AccountEntity>()
    const favorites = createMockRepository<UserFavoriteEntity>()
    const contacts = createMockRepository<ContactEntity>()
    const attackAngles = createMockRepository<AttackAngleEntity>()
    const actionPlans = createMockRepository<ActionPlanEntity>()
    const consultants = createMockRepository<ConsultantEntity>()
    // #2569.4 — les documents d'origine du lot N (import ZIP/messagerie).
    const consultantDocuments = createMockRepository<ConsultantDocumentEntity>()
    const userActions = createMockRepository<UserActionEntity>()
    const memberObjectives = createMockRepository<MemberObjectiveEntity>()
    const workflowRuns = createMockRepository<WorkflowRunEntity>()
    const ragDocuments = createMockRepository<RagDocumentEntity>()
    const notes = createMockRepository<NoteEntity>()
    const activities = createMockRepository<ActivityEntity>()
    const tasks = createMockRepository<TaskEntity>()
    const consultantSkills = createMockRepository<ConsultantSkillEntity>()
    const talentPreparedMessages = createMockRepository<TalentPreparedMessageEntity>()
    const accountEntities = createMockRepository<AccountEntityRow>()
    // #2571.5 — l'appel d'offres scripté de la salle : sans repo, `seedRfp`
    // (appelé par `seedWorkspace`) ferait tomber CETTE spec, sans rapport avec
    // ce qu'elle mesure.
    const rfps = createMockRepository<RfpEntity>()
    const chatMessages = createMockRepository<ChatMessageEntity>()

    let nextEntityId = 1
    accountEntities.save.mockImplementation(async (rows: Partial<AccountEntityRow>[]) =>
      rows.map(row => ({ ...row, id: row.id ?? `entity-${nextEntityId++}` })),
    )
    let nextAccountId = 1
    accounts.save.mockImplementation(async (entity: Partial<AccountEntity>) => ({
      ...entity,
      id: entity.id ?? `acc-${nextAccountId++}`,
    }))
    let nextContactId = 1
    contacts.save.mockImplementation(async (entities: Partial<ContactEntity>[]) =>
      entities.map(entity => ({ ...entity, id: entity.id ?? `contact-${nextContactId++}` })),
    )

    let nextMissionId = 1
    let nextProjectId = 1
    let nextNeedId = 1
    accounts.count.mockResolvedValueOnce(0)
    accounts.manager.query.mockImplementation(async (query: string) => {
      const text = String(query)
      if (text.includes('FROM consultants')) return CONSULTANTS
      // Chaque mission et chaque projet doivent rendre un id DISTINCT : partagé,
      // deux affectations pendraient de la même mission et le compteur de
      // placements lirait un jeu qui n'existe pas en base.
      if (text.includes('INSERT INTO missions')) return [{ id: `mission-${nextMissionId++}` }]
      if (text.includes('INSERT INTO opportunities')) return [{ id: `project-${nextProjectId++}` }]
      if (text.includes('INSERT INTO project_needs')) return [{ id: `need-${nextNeedId++}` }]
      // ⚠️ Le repli sur `RETURNING id` n'est pas décoratif : le semis relit
      // l'identifiant du COMPTE qu'il vient d'écrire, et sans lui
      // `seedDeliveryClient` sort en silence — la salle entière manquerait, et
      // tous les tests d'en dessous compareraient des listes vides.
      if (text.includes('RETURNING id')) return [{ id: 'row-1' }]
      return []
    })

    service = new DemoSeedService(
      workspaces as never,
      members as never,
      profiles as never,
      accounts as never,
      favorites as never,
      contacts as never,
      accountEntities as never,
      attackAngles as never,
      actionPlans as never,
      consultants as never,
      consultantDocuments as never,
      userActions as never,
      memberObjectives as never,
      workflowRuns as never,
      ragDocuments as never,
      notes as never,
      activities as never,
      tasks as never,
      consultantSkills as never,
      createMockRepository<ConsultantExperienceEntity>() as never,
      talentPreparedMessages as never,
      { materialize: jest.fn().mockResolvedValue(undefined) } as never,
      // BEL-SC-224 (#3253, P0) — hors du périmètre de ce fichier (pipe /
      // placements), un double générique suffit.
      { seedDiagnosisFor: jest.fn().mockResolvedValue(undefined) } as never,
      // Le dépôt des fichiers de la salle (31/08/2026). Un double qui accepte
      // tout : ce qui est vérifié ici est ce qui part en BASE, pas les octets.
      { put: jest.fn().mockResolvedValue(undefined) } as never,
      rfps as never,
      chatMessages as never,
      // #2946 — la demande d'approbation Action OS EN ATTENTE derrière la
      // tâche `source = 'action_os_approval'` : hors du périmètre de ce
      // fichier (pipe / placements), un double générique suffit.
      createMockRepository<ApprovalRequestEntity>() as never,
    )

    await service.seedWorkspace('ws-demo', 'owner-1')
  })

  /** Les `INSERT INTO <table>` réellement émis, décodés par nom de colonne. */
  function inserts(table: string): DecodedInsert[] {
    return accounts.manager.query.mock.calls
      .filter(call => String(call[0]).includes(`INSERT INTO ${table}`))
      .map(call => decodeInsert(String(call[0]), (call[1] ?? []) as unknown[]))
      .filter((row): row is DecodedInsert => row !== null)
  }

  // #4191.9 (R23) — « Par commercial » n'affichait que « Non attribué » : les affaires du pipe de la
  // salle étaient écrites SANS porteur. Elles portent l'utilisateur de la salle (le seul qui existe) ;
  // un porteur inventé ou une répartition fictive entre commerciaux mentirait sur l'équipe.
  it('#4191.9 — chaque affaire du pipe de la salle porte un porteur (owner_id)', () => {
    const labels = new Set(DEMO_DELIVERY_CLIENT.pipelineProjects.map(deal => deal.label))
    const dealInserts = inserts('opportunities').filter(row => labels.has(String(row('label'))))
    expect(dealInserts.length).toBe(DEMO_DELIVERY_CLIENT.pipelineProjects.length)
    expect(dealInserts.every(row => row('owner_id') === 'owner-1')).toBe(true)
  })

  it('la garde LIT quelque chose — le semis a bien émis ses INSERT', () => {
    // La contrepartie obligatoire de toute garde du dépôt. Sans elle, un semis
    // qui n'écrirait plus rien rendrait tous les tests suivants verts en
    // comparant des listes vides.
    expect(inserts('opportunities').length).toBeGreaterThanOrEqual(4)
    expect(inserts('missions').length).toBeGreaterThanOrEqual(8)
    expect(inserts('mission_assignments').length).toBeGreaterThanOrEqual(8)
    // …et le décodage par NOM marche : une regex cassée rendrait tout `undefined`.
    expect(inserts('opportunities').every(row => typeof row('label') === 'string')).toBe(true)
  })

  /* ────────────────────────────────────────────────────────────────────────── */
  /*  1. « Placé trois fois chez le même client »                              */
  /* ────────────────────────────────────────────────────────────────────────── */

  describe('le profil qu’un client redemande', () => {
    /**
     * La dérivation de `PropagationService.placementsOf`, rejouée à l'identique
     * sur les lignes que le semis a écrites :
     *
     *   SELECT ma.consultant_id, COUNT(DISTINCT ma.mission_id)
     *     FROM mission_assignments ma JOIN missions m ON m.id = ma.mission_id
     *    WHERE m.workspace_id = $1 AND m.started_on IS NOT NULL
     *      AND m.started_on <= CURRENT_DATE
     *    GROUP BY ma.consultant_id
     */
    function placementsByConsultant(): Map<string, Set<string>> {
      const startedMissions = new Set<string>()
      const missionIds = accounts.manager.query.mock.calls
        .filter(call => String(call[0]).includes('INSERT INTO missions'))
        .map((_call, index) => `mission-${index + 1}`)
      inserts('missions').forEach((row, index) => {
        const startedOn = row('started_on')
        const id = missionIds[index]
        if (!id || typeof startedOn !== 'string') return
        if (startedOn <= today()) startedMissions.add(id)
      })

      const byName = new Map(CONSULTANTS.map(entry => [entry.id, entry.full_name]))
      const placements = new Map<string, Set<string>>()
      for (const row of inserts('mission_assignments')) {
        const missionId = String(row('mission_id'))
        const name = byName.get(String(row('consultant_id')))
        if (!name || !startedMissions.has(missionId)) continue
        const seen = placements.get(name) ?? new Set<string>()
        seen.add(missionId)
        placements.set(name, seen)
      }
      return placements
    }

    it('nomme quelqu’un placé TROIS fois, et c’est Yanis Berthier', () => {
      const placements = placementsByConsultant()
      const repeated = [...placements.entries()].filter(([, missions]) => missions.size >= 3).map(([name]) => name)

      // Le compteur « placé N fois » du vivier lit exactement cette dérivation.
      // Sous trois, il n'a jamais montré ce qu'il compte : tout le monde était
      // placé une ou deux fois.
      expect(repeated).toContain('Yanis Berthier')
      expect(placements.get('Yanis Berthier')?.size).toBe(3)
    })

    it('les trois missions sont chez le MÊME client, et ne se chevauchent pas toutes', () => {
      // Le jeu ne porte qu'un client de delivery : les trois placements sont
      // donc chez lui par construction, et ce test le VÉRIFIE plutôt que de le
      // supposer — un second compte d'accueil casserait la démonstration sans
      // faire rougir le compteur.
      const accountIds = new Set(
        inserts('missions')
          .filter(row => {
            const label = String(row('label'))
            return DEMO_DELIVERY_CLIENT.missions.some(
              mission => mission.label === label && mission.consultant === 'Yanis Berthier',
            )
          })
          .map(row => String(row('account_id'))),
      )
      expect(accountIds.size).toBe(1)

      // Et la troisième est bien dans le PASSÉ : trois affectations à 100 %
      // qui se chevaucheraient montreraient quelqu'un affecté à 300 %.
      const yanis = DEMO_DELIVERY_CLIENT.missions.filter(mission => mission.consultant === 'Yanis Berthier')
      expect(yanis).toHaveLength(3)
      const finished = yanis.filter(mission => mission.ends_in_days !== null && mission.ends_in_days < 0)
      expect(finished.length).toBeGreaterThanOrEqual(1)
    })

    it('sait dire NON — sans la troisième mission, plus personne n’est placé trois fois', () => {
      // La seconde contrepartie : prouver que la garde REFUSE. On retire une
      // mission de Yanis du corpus et le prédicat doit cesser d'être satisfait.
      const placements = placementsByConsultant()
      const missions = placements.get('Yanis Berthier')
      expect(missions).toBeDefined()
      const [first] = [...(missions ?? [])]
      missions?.delete(String(first))
      const stillRepeated = [...placements.values()].some(entry => entry.size >= 3)
      expect(stillRepeated).toBe(false)
    })
  })

  /* ────────────────────────────────────────────────────────────────────────── */
  /*  2. Les dates de signature attendue                                       */
  /* ────────────────────────────────────────────────────────────────────────── */

  describe('les dates de signature attendue', () => {
    /** Les `expected_close_on` réellement écrites, dans l'ordre du semis. */
    function expectedCloseDates(): string[] {
      return inserts('opportunities')
        .map(row => row('expected_close_on'))
        .filter((value): value is string => typeof value === 'string')
    }

    it('écrit des DATES NUES — la forme que la colonne `date` accepte', () => {
      const dates = expectedCloseDates()
      expect(dates.length).toBeGreaterThanOrEqual(4)
      for (const date of dates) {
        // Un `toISOString()` complet passerait le typage et ferait dépendre la
        // valeur de l'heure de la visite : c'est le défaut « un seed doit avoir
        // la forme que l'écran lit », déjà payé deux fois dans ce module.
        expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      }
    })

    it('les étale — du déjà signé aux six mois, en passant par les semaines', () => {
      const offsets = expectedCloseDates()
        .map(daysFromToday)
        .sort((a, b) => a - b)
      // Une affaire déjà signée, dont l'échéance est derrière elle.
      expect(offsets.some(days => days < 0)).toBe(true)
      // Une échéance PROCHE, dans les semaines.
      expect(offsets.some(days => days > 0 && days <= 45)).toBe(true)
      // Une à trois mois, une à six.
      expect(offsets.some(days => days > 80 && days <= 120)).toBe(true)
      expect(offsets.some(days => days > 150)).toBe(true)
    })

    it('le pipe ne s’assèche PAS — au moins une affaire datée est au-delà de 60 jours', () => {
      const dates = expectedCloseDates()
      const beyond = dates.filter(date => daysFromToday(date) > DRY_PIPE_HORIZON_DAYS)

      // ⚠️ On asserte la RAISON, pas seulement l'absence d'alerte. « Aucune
      // alerte » serait aussi vrai sur une salle où PLUS AUCUNE affaire n'est
      // datée — c'est-à-dire sur le trou qu'on vient de combler.
      expect(beyond.length).toBeGreaterThanOrEqual(1)
      expect(pipeRunsDry(dates)).toBe(false)

      // Et deux affaires la tiennent, pas une : perdre l'une des deux ne fait
      // donc pas basculer la salle au premier réglage de date.
      expect(beyond.length).toBeGreaterThanOrEqual(2)
    })

    it('sait dire NON — un pipe dont tout tombe sous 60 jours est bien détecté', () => {
      // La contrepartie : sans elle, un prédicat toujours faux ferait passer
      // n'importe quelle salle pour saine.
      const near = [7, 21, 55].map(days => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10))
      expect(pipeRunsDry(near)).toBe(true)
    })
  })

  /* ────────────────────────────────────────────────────────────────────────── */
  /*  3. Le plancher du pipe                                                   */
  /* ────────────────────────────────────────────────────────────────────────── */

  describe('le plancher du pipe', () => {
    /**
     * Le résumé du pipe, calculé par la VRAIE fonction de production
     * (`pipelineSummary`) sur les lignes que le semis a écrites. Une seconde
     * formule écrite ici divergerait de l'écran au premier changement.
     */
    function summary(): ReturnType<typeof pipelineSummary> {
      const rows = inserts('opportunities').map(row => {
        const amount = row('amount_cents')
        return {
          stage: String(row('stage')),
          kind: typeof row('kind') === 'string' ? String(row('kind')) : 'besoin',
          // `null` reste `null` : le transformer en 0 ici annulerait exactement
          // la règle que ce test existe pour vérifier.
          amount_cents: typeof amount === 'number' ? amount : null,
        }
      })
      return pipelineSummary(rows)
    }

    it('porte À LA FOIS des affaires chiffrées et une affaire non chiffrée', () => {
      const pipe = summary()
      expect(pipe.total_count).toBeGreaterThan(0)
      // Sans montant du tout, l'écran bascule sur « non mesuré » en tête de
      // pipe et se lit comme un produit vide — le cas explicitement refusé.
      expect(pipe.total_amount_cents).toBeGreaterThan(0)
      // Sans aucune ligne non chiffrée, le plancher, le compteur et la pastille
      // restent invisibles en démonstration.
      expect(pipe.total_without_amount).toBeGreaterThanOrEqual(1)
    })

    it('montre la ligne « Signé », séparée du total du pipe', () => {
      // Depuis le 29/08 le total du pipe n'additionne plus le signé : il est
      // NOMMÉ à côté (« Signé : 111 600 € sur 1 affaire »). Une salle de démo
      // sans affaire signée chiffrée ouvrirait donc l'écran sans cette ligne —
      // le prospect verrait une règle appliquée à un cas invisible. La table
      // est seedée depuis des mois ; ce qui se vérifie ici, c'est que ce que
      // l'ÉCRAN lit y répond.
      const pipe = summary()
      expect(pipe.signed_count).toBeGreaterThan(0)
      expect(pipe.signed_amount_cents).toBeGreaterThan(0)
      // …et le montant signé ne se retrouve PAS dans le total du pipe.
      expect(pipe.total_amount_cents).toBeLessThan(pipe.total_amount_cents + pipe.signed_amount_cents)
      const openAmount = pipe.columns
        .filter(column => column.stage !== 'won')
        .reduce((sum, column) => sum + column.amount_cents, 0)
      expect(pipe.total_amount_cents).toBe(openAmount)
    })

    it('rend le plancher CALCULABLE, et son filtre actionnable', () => {
      const pipe = summary()
      // `PipelineBoard` : le libellé « Au moins X € sur N projets au pipe »
      // s'affiche quand des lignes non chiffrées coexistent avec des chiffrées.
      const showsFloor = pipe.total_without_amount > 0 && pipe.total_without_amount < pipe.total_count
      expect(showsFloor).toBe(true)
      // …et c'est la même condition qui rend le compteur CLIQUABLE plutôt que
      // simple texte (`canFilterAll`).
      expect(pipe.total_without_amount).toBeLessThan(pipe.total_count)
    })

    it('montre la pastille « N sans montant » sur une étape OUVERTE, pas seulement sur « Signé »', () => {
      const pipe = summary()
      const open = pipe.columns.filter(column => column.stage !== 'won')
      // Le trou que ce lot comble : la seule ligne non chiffrée de la salle
      // était le projet du FORFAIT, en étape « Signé ». Un prospect qui regarde
      // son pipe ouvert ne voyait donc jamais la pastille.
      expect(open.some(column => column.without_amount > 0)).toBe(true)
      // Et le pipe ouvert reste chiffré par ailleurs : la colonne qui porte la
      // ligne non chiffrée n'est pas la seule occupée.
      expect(open.filter(column => column.count > 0).length).toBeGreaterThanOrEqual(2)
    })

    it('n’écrit JAMAIS un montant absent comme un zéro', () => {
      // La règle du dépôt, vérifiée à la source plutôt que sur le total : un
      // `amount_cents: 0` passerait `total_without_amount` à zéro sans que rien
      // d'autre ne bouge, et le plancher redeviendrait un total.
      const amounts = inserts('opportunities').map(row => row('amount_cents'))
      expect(amounts.some(amount => amount === null)).toBe(true)
      expect(amounts.some(amount => amount === 0)).toBe(false)
    })

    // #2324.37 — craft rule 9 : la fiche opportunité montre ses RISQUES en démo.
    // Lu sur l'INSERT réellement émis (colonne `risks`), pas sur le jeu : une
    // valeur du jeu que le semis n'écrirait pas laisserait la fiche vide.
    it('sème un risque sur l’affaire ouverte — et sur elle seule, jamais un risque vide', () => {
      const risks = inserts('opportunities')
        .filter(row => row('label') === DEMO_DELIVERY_CLIENT.openProject.label)
        .map(row => row('risks'))
      expect(risks).toEqual([DEMO_DELIVERY_CLIENT.openProject.risks])
      expect(String(risks[0]).trim().length).toBeGreaterThan(20)
    })

    // #3266.1 (#3292, tranché sans Louis) — craft rule 9 : le grain équipe/site
    // /projet de l'affaire se voit en démo, sur le même INSERT réellement émis.
    it('sème le grain équipe/site/projet sur l’affaire ouverte — et sur elle seule', () => {
      const scopeLabels = inserts('opportunities')
        .filter(row => row('label') === DEMO_DELIVERY_CLIENT.openProject.label)
        .map(row => row('scope_label'))
      expect(scopeLabels).toEqual([DEMO_DELIVERY_CLIENT.openProject.scope_label])
      expect(String(scopeLabels[0]).trim().length).toBeGreaterThan(5)
    })

    it('lit un corpus NON VIDE — les cinq étapes du pipe existent toujours', () => {
      // Un `PIPELINE_STAGES` vidé par un import cassé rendrait `columns` vide et
      // les tests ci-dessus compareraient des zéros entre eux.
      expect(PIPELINE_STAGES.length).toBe(5)
      expect(summary().columns).toHaveLength(PIPELINE_STAGES.length)
    })

    /* ────────────────────────────────────────────────────────────────────── */
    /*  La parité démo des trois états d'affichage du pipe                    */
    /* ────────────────────────────────────────────────────────────────────── */

    /**
     * ⚠️ Cette garde ne LIT PAS la prose de `demo-coverage.ts` : une raison
     * écrite est une AFFIRMATION sur les données, et le dépôt a déjà payé
     * « un audit documentaire n'est pas le code » (cinq affirmations sur cinq
     * fausses). Chaque état déclaré est RECOMPTÉ sur le pipe réel.
     */
    describe('parité démo — les trois états d’affichage du pipe', () => {
      const KNOWN = ['total_floor', 'column_without_amount_pill', 'total_unknown'] as const

      it('les trois états sont classés — aucun ne passe sans réponse écrite', () => {
        expect(Object.keys(DEMO_PIPELINE_STATES).sort()).toEqual([...KNOWN].sort())
        for (const key of KNOWN) {
          const entry = DEMO_PIPELINE_STATES[key]
          expect(entry).toBeDefined()
          // Une raison d'une ligne n'est pas une raison : elle doit tenir devant
          // quelqu'un qui présente le produit.
          expect((entry?.reason ?? '').length).toBeGreaterThan(180)
        }
      })

      it('« seedé » est VRAI — le plancher et la pastille sont réellement atteignables', () => {
        const pipe = summary()
        expect(DEMO_PIPELINE_STATES['total_floor']?.state).toBe('seede')
        expect(pipe.total_without_amount).toBeGreaterThan(0)
        expect(pipe.total_amount_cents).toBeGreaterThan(0)

        expect(DEMO_PIPELINE_STATES['column_without_amount_pill']?.state).toBe('seede')
        expect(pipe.columns.some(column => column.stage !== 'won' && column.without_amount > 0)).toBe(true)
      })

      it('« vide à dessein » est VRAI AUSSI — le total du pipe n’est jamais « non mesuré »', () => {
        const pipe = summary()
        expect(DEMO_PIPELINE_STATES['total_unknown']?.state).toBe('vide_a_dessein')
        // La condition exacte de `PipelineBoard` (`nothingPriced`). Elle doit
        // rester FAUSSE : un total « non mesuré » en tête de pipe se lit comme
        // un produit vide devant un prospect.
        const nothingPriced = pipe.total_count > 0 && pipe.total_without_amount >= pipe.total_count
        expect(nothingPriced).toBe(false)
      })

      it('sait dire NON — un pipe entièrement non chiffré est bien reconnu', () => {
        // La contrepartie obligatoire : sans elle, un prédicat toujours faux
        // ferait passer n'importe quelle salle pour correctement classée.
        const unpriced = pipelineSummary([
          { stage: 'qualified', kind: 'besoin', amount_cents: null },
          { stage: 'negotiation', kind: 'besoin', amount_cents: null },
        ])
        expect(unpriced.total_count > 0 && unpriced.total_without_amount >= unpriced.total_count).toBe(true)
      })
    })
  })
})
