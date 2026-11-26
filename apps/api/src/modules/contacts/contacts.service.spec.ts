import { IsNull, type EntityManager } from 'typeorm'
import { Logger, ServiceUnavailableException } from '@nestjs/common'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { MailTransportRejectedError } from '../mailer/mail-transport-rejected.error'
import { failure, isFailure, isSuccess, success } from '@bellum/utils'
import { HttpError, TechnicalError } from '@bellum/errors'
import type { AnalysisContactSeed } from '@bellum/contracts'
import { detectFieldConflict, isEnrichmentForbiddenField, taskStillOpenSql } from '@bellum/contracts'
import { ALLOWED_DECISION_ROLES, ALLOWED_SOURCES, ContactsService } from './contacts.service'
import { missingContactDetailsSql } from './contact-completeness'
import { ZONE_DEPARTMENT_SELECT_SQL, ZONE_REGION_SQL } from './contact-seller-focus'
import { ACCOUNT_HYGIENE_PREDICATES } from '../accounts/account-hygiene.sql'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ContactLifecycleTransitionEntity } from '../../database/entities/contact-lifecycle-transition.entity'
import { ContactMergeEntity } from '../../database/entities/contact-merge.entity'
import { ContactStopEntity } from '../../database/entities/contact-stop.entity'
import type { ContactIntakeExclusionEntity } from '../../database/entities/contact-intake-exclusion.entity'
import { PersonErasureEntity } from '../../database/entities/person-erasure.entity'
import { personErasureFingerprints } from './person-erasure-fingerprint'
import { PERSON_ERASURE_HMAC_KEY_ENV } from '../../common/person-erasure-hmac'
import { AccountEntity } from '../../database/entities/account.entity'
import { EsnTargetPersonaEntity } from '../../database/entities/esn-target-persona.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import type { CreditsService } from '../credits/credits.service'
import type { IaClient } from '../ia/ia.client'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { SprintProgressionBus } from '../sprints/sprint-progression.bus'
import { SprintProgressionListener } from '../sprints/sprint-progression.listener'
import { SprintsService } from '../sprints/sprints.service'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { computeContactFieldStatus, creditCostOf, resolveBrand } from '@bellum/contracts'

/**
 * Le service de marque, réduit à ce que le code testé lui demande.
 *
 * `null` = aucune adresse déclarée par l'espace, donc le mailer retombe sur
 * l'adresse d'environnement — c'est le cas par défaut, et celui que ces tests
 * décrivent. La marque blanche a son propre test, dans `mailer`.
 */
/**
 * Le service de marque, réduit à ce que le code testé lui demande : la marque
 * du PRODUIT, c'est-à-dire un espace qui n'a rien posé — et `null` pour
 * l'adresse d'expédition, donc repli sur celle d'environnement.
 */
const brandsStub = {
  getForUser: jest.fn().mockResolvedValue(resolveBrand(null)),
  getForWorkspace: jest.fn().mockResolvedValue(resolveBrand(null)),
  getSendingAddress: jest.fn().mockResolvedValue(null),
}

describe('ContactsService', () => {
  let service: ContactsService
  let repo: MockRepository<ContactEntity>
  let userActions: MockRepository<UserActionEntity>
  let ia: { enrichContact: jest.Mock; searchPeopleByName: jest.Mock; searchPersonByNameCascade: jest.Mock }
  let credits: { hasEnrichmentCredit: jest.Mock; consumeEnrichmentCredit: jest.Mock; getCredits: jest.Mock }
  // Multi-user Phase 2: the caller's active workspace. Default resolves to a
  // single owned workspace, mirroring "1 user = 1 workspace" today.
  let workspace: { resolveActiveWorkspace: jest.Mock; isDemoWorkspace: jest.Mock }
  let mailer: { sendOutreachEmail: jest.Mock; resolveSenderAddress: jest.Mock }
  let suppression: { isSuppressed: jest.Mock; suppress: jest.Mock }
  let config: { get: jest.Mock }
  // Cadence engine (Drive #8) — mocked so contact tests stay unit-scoped; the
  // scheduling/date logic is covered in cadence.service.spec.
  let cadence: {
    scheduleForContact: jest.Mock
    buildCadence: jest.Mock
    cancelPendingForBounce: jest.Mock
    completeOpenItemsByProof: jest.Mock
  }
  // Account repo — read for its `raw_analysis` cartography so the /100 contact
  // score reflects proximité périmètre. Defaults to null (no account) → degraded
  // but still-numeric score; the Grille-A test overrides it with a cartography.
  let accounts: MockRepository<AccountEntity>
  // Append-only lifecycle journal (P0 « états + providers »).
  let transitions: MockRepository<ContactLifecycleTransitionEntity>
  // RGPD-safe enrichment fallback. Default = disabled (no key) so every existing
  // test keeps its Apollo-only behaviour and Dropcontact is never called.
  let dropcontact: { isEnabled: jest.Mock; enrich: jest.Mock }
  // Dernier recours (Hunter/Lusha, #3022). Default = disabled, same reasoning
  // as `dropcontact` above — existing tests keep their Apollo-only behaviour.
  let extraEnrichers: { isEnabled: jest.Mock; enrich: jest.Mock }
  // Merge log (old contact id → survivor). Default: no row, i.e. an unknown id
  // is genuinely unknown rather than merged away.
  let merges: MockRepository<ContactMergeEntity>
  // Arbitre de provenance. Défaut : AUCUNE provenance enregistrée — l'arbitre
  // traite alors la valeur en place comme `pipeline`, l'enrichissement l'écrit
  // comme avant, et tous les tests existants gardent leur comportement.
  let provenance: {
    currentSources: jest.Mock
    currentSourcesDetailed: jest.Mock
    commit: jest.Mock
    estimatedAmong: jest.Mock
    recordContradictions: jest.Mock
    contradictionsFor: jest.Mock
  }
  // m13 — board de sprints (tome 5) : une réponse positive / un RDV obtenu
  // doit faire basculer l'effort du compte. m18 : `ContactsService` n'appelle
  // plus `SprintsService` directement (GA-07) — il ÉMET sur
  // `SprintProgressionBus`. Mocké pour la plupart des tests ; un bloc dédié
  // plus bas branche un VRAI `SprintProgressionListener` + `SprintsService`
  // pour prouver le scénario de bout en bout (bascule une fois, rejeu sans
  // effet, correction humaine qui survit).
  let sprintBus: { emit: jest.Mock }

  beforeEach(() => {
    repo = createMockRepository<ContactEntity>()
    merges = createMockRepository<ContactMergeEntity>()
    merges.findOne.mockResolvedValue(null)
    userActions = createMockRepository<UserActionEntity>()
    accounts = createMockRepository<AccountEntity>()
    transitions = createMockRepository<ContactLifecycleTransitionEntity>()
    ia = { enrichContact: jest.fn(), searchPeopleByName: jest.fn(), searchPersonByNameCascade: jest.fn() }
    dropcontact = { isEnabled: jest.fn().mockReturnValue(false), enrich: jest.fn() }
    extraEnrichers = { isEnabled: jest.fn().mockReturnValue(false), enrich: jest.fn() }
    credits = {
      hasEnrichmentCredit: jest.fn().mockResolvedValue(true),
      consumeEnrichmentCredit: jest.fn().mockResolvedValue({ ok: true, remaining: 9 }),
      // Lu par le chemin de démonstration : les crédits n'y bougent pas, on rend
      // donc le solde tel quel plutôt qu'un zéro qui mentirait sur le compteur.
      getCredits: jest.fn().mockResolvedValue({ credits_remaining: 42 }),
    }
    workspace = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      // Défaut : espace RÉEL. Le chemin de démonstration est opt-in par test,
      // sinon tous les tests d'enrichissement basculeraient sur les fausses
      // coordonnées sans le dire.
      isDemoWorkspace: jest.fn().mockResolvedValue(false),
    }
    // #2733 — `sendOutreachEmail` rend désormais `{ providerId }` (la clé qui
    // reliera un futur rebond Resend au contact) ; `undefined` mime l'absence
    // d'identifiant fournisseur (Mailpit), le défaut d'avant ce lot.
    mailer = {
      sendOutreachEmail: jest.fn().mockResolvedValue({ providerId: undefined }),
      resolveSenderAddress: jest.fn().mockReturnValue('noreply@bellum.test'),
    }
    suppression = { isSuppressed: jest.fn().mockResolvedValue(false), suppress: jest.fn() }
    // Default: no public URL configured → no unsubscribe link built (keeps the
    // existing sendOutreachEmail arg assertions clean). Overridden per-test.
    config = { get: jest.fn().mockReturnValue(undefined) }
    cadence = {
      scheduleForContact: jest.fn().mockResolvedValue(undefined),
      buildCadence: jest.fn(),
      cancelPendingForBounce: jest.fn().mockResolvedValue(undefined),
      completeOpenItemsByProof: jest.fn().mockResolvedValue(undefined),
    }
    provenance = {
      currentSources: jest.fn().mockResolvedValue({}),
      currentSourcesDetailed: jest.fn().mockResolvedValue({}),
      // #4016 L4.1 — aucune adresse estimée par défaut.
      estimatedAmong: jest.fn().mockResolvedValue(new Map()),
      commit: jest.fn().mockResolvedValue(undefined),
      // #4016.L13 — aucune contradiction par défaut.
      recordContradictions: jest.fn().mockResolvedValue(undefined),
      contradictionsFor: jest.fn().mockResolvedValue([]),
    }
    sprintBus = { emit: jest.fn().mockResolvedValue(undefined) }
    service = new ContactsService(
      repo as never,
      userActions as never,
      ia as unknown as IaClient,
      credits as unknown as CreditsService,
      workspace as unknown as WorkspaceContextService,
      mailer as never,
      suppression as never,
      config as never,
      cadence as never,
      accounts as never,
      transitions as never,
      dropcontact as never,
      extraEnrichers as never,
      merges as never,
      brandsStub as never,
      // `analytics` et `providerCosts` restent absents : ils sont `@Optional()`
      // et sans effet sur ce qui est testé ici.
      undefined,
      undefined,
      provenance as never,
      sprintBus as never,
    )
  })

  // #2120.57 / #2297.23 — un `ContactsService` construit avec un
  // `EnrichmentDurationService` mocké, pour vérifier QUAND `record()` est
  // appelé (et quand il ne l'est pas). Portée fichier : utilisé par le
  // chemin réel ET par le chemin de démonstration, ci-dessous.
  function serviceWithEnrichmentDuration() {
    const enrichmentDuration = { record: jest.fn().mockResolvedValue(undefined) }
    const withDuration = new ContactsService(
      repo as never,
      userActions as never,
      ia as unknown as IaClient,
      credits as unknown as CreditsService,
      workspace as unknown as WorkspaceContextService,
      mailer as never,
      suppression as never,
      config as never,
      cadence as never,
      accounts as never,
      transitions as never,
      dropcontact as never,
      extraEnrichers as never,
      merges as never,
      brandsStub as never,
      undefined,
      undefined,
      provenance as never,
      sprintBus as never,
      undefined,
      enrichmentDuration as never,
    )
    return { withDuration, enrichmentDuration }
  }

  // #2309.16/.19 — un `ContactsService` construit avec le journal des
  // candidats jamais devenus une fiche, pour vérifier QUAND il est écrit.
  function serviceWithIntakeExclusions() {
    const intakeExclusions = createMockRepository<ContactIntakeExclusionEntity>()
    const withIntakeExclusions = new ContactsService(
      repo as never,
      userActions as never,
      ia as unknown as IaClient,
      credits as unknown as CreditsService,
      workspace as unknown as WorkspaceContextService,
      mailer as never,
      suppression as never,
      config as never,
      cadence as never,
      accounts as never,
      transitions as never,
      dropcontact as never,
      extraEnrichers as never,
      merges as never,
      brandsStub as never,
      undefined,
      undefined,
      provenance as never,
      sprintBus as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      intakeExclusions as never,
    )
    return { withIntakeExclusions, intakeExclusions }
  }

  describe('findByAccount', () => {
    it('returns contacts with a numeric /100 score', async () => {
      const rows = [{ id: '1' }, { id: '2' }] as ContactEntity[]
      repo.find.mockResolvedValueOnce(rows)
      const result = await service.findByAccount('acc-1', 'user-1')
      expect(result.map(r => r.id)).toEqual(['1', '2'])
      // Every contact now carries the deterministic /100 score (Théo §3), even
      // with no cartography loaded (degraded but bounded, never null/NaN).
      expect(
        result.every(r => typeof r.contact_score === 'number' && r.contact_score >= 0 && r.contact_score <= 100),
      ).toBe(true)
    })

    it('scores by Théo 03_BUSINESS_RULES §3: a P1-perimeter decision-maker outranks an out-of-sector blocker', async () => {
      // Cartography from the account's raw_analysis: ACME Digital is the P1
      // perimeter (operating), Autre SARL is out-of-sector; the recommended angle
      // is "Migration Cloud".
      accounts.findOne.mockResolvedValueOnce({
        id: 'acc-1',
        company_name: 'ACME',
        raw_analysis: {
          entities_exhaustive: [
            { name: 'ACME Digital', relevance: 'operating' },
            { name: 'Autre SARL', relevance: 'out_of_sector' },
          ],
          priority_perimeters: [{ name: 'ACME Digital', tier: 'P1' }],
          angles: [{ title: 'Migration Cloud' }],
        },
      } as unknown as AccountEntity)
      repo.find.mockResolvedValueOnce([
        {
          id: 'eco',
          full_name: 'Claire Martin',
          title: 'Directrice Administrative et Financière',
          decision_role: 'economic',
          entity: 'ACME Digital',
          email: 'claire@acme.fr',
          email_verified: true,
          source: 'apollo',
        },
        {
          id: 'blk',
          full_name: 'Paul Junior',
          title: 'Stagiaire Achats',
          decision_role: 'blocker',
          entity: 'Autre SARL',
          email: null,
          email_verified: false,
          source: 'ia_reconstruction',
        },
      ] as unknown as ContactEntity[])

      const result = await service.findByAccount('acc-1', 'user-1')
      const eco = result.find(r => r.id === 'eco')
      const blk = result.find(r => r.id === 'blk')
      expect(eco).toBeDefined()
      expect(blk).toBeDefined()
      const ecoScore = eco?.contact_score ?? 0
      const blkScore = blk?.contact_score ?? 0

      expect(ecoScore).toBeGreaterThan(blkScore)
      // economic + P1 proximité + fresh apollo → top band (lot 758 : the verified e-mail
      // is a pastille, it no longer counts).
      expect(ecoScore).toBeGreaterThanOrEqual(80)
      expect(eco?.contact_reachability).toBe('verified_email')
      expect(blk?.contact_reachability).toBeNull()
      // blocker + out-of-sector + no reachability + stale source → secondary.
      expect(blkScore).toBeLessThan(40)

      // The EXPLANATION travels with the score. The fiche used to receive only the
      // number and re-derive its own breakdown in the browser from the contact row
      // alone — no perimeter tier, no angles — so the header and the "6 criteria"
      // card showed two different /100 (79 vs 69) under two different names.
      const breakdown = eco?.contact_score_breakdown
      // Lot 758 — five relevance criteria; reachability is NOT one of them.
      expect(breakdown).toHaveLength(5)
      expect(breakdown?.some(c => c.key === 'accessibility')).toBe(false)
      const proximity = breakdown?.find(c => c.key === 'proximity')
      // Scored WITH the cartography: P1, not the context-less "non rattaché".
      expect(proximity).toMatchObject({ points: 20, max: 20, evaluated: true })
      expect(proximity?.proof).toContain('P1')
      // …and the total is exactly what the shipped criteria add up to.
      const evaluated = (breakdown ?? []).filter(c => c.evaluated)
      const denominator = evaluated.reduce((sum, c) => sum + c.max, 0)
      const points = evaluated.reduce((sum, c) => sum + c.points, 0)
      expect(ecoScore).toBe(Math.round((points * 100) / denominator))
    })

    it('marks a criterion the account context cannot evaluate instead of scoring it a neutral middle', async () => {
      // Account analysed but with no cartography and no angles at all.
      accounts.findOne.mockResolvedValueOnce({
        id: 'acc-1',
        company_name: 'ACME',
        raw_analysis: {},
      } as unknown as AccountEntity)
      repo.find.mockResolvedValueOnce([
        {
          id: 'dsi',
          full_name: 'Claire Martin',
          title: 'DSI',
          decision_role: 'technical',
          entity: 'ACME',
          email: 'claire@acme.fr',
          email_verified: true,
          source: 'apollo',
        },
      ] as unknown as ContactEntity[])

      const [row] = await service.findByAccount('acc-1', 'user-1')
      const byKey = Object.fromEntries((row?.contact_score_breakdown ?? []).map(c => [c.key, c]))
      // The two context-dependent criteria are reported as unevaluated…
      expect(byKey.proximity).toMatchObject({ evaluated: false, points: 0 })
      expect(byKey.angleFit).toMatchObject({ evaluated: false, points: 0 })
      // …and cost the contact nothing: the score is read over the other 55 points
      // (lot 758 : rôle 30 + séniorité 15 + fraîcheur 10 — the e-mail is a pastille).
      expect(row?.contact_score).toBe(Math.round(((28 + 12 + 10) * 100) / 55))
    })

    it('returns [] on repo failure', async () => {
      repo.find.mockRejectedValueOnce(new Error('x'))
      expect(await service.findByAccount('acc-1', 'user-1')).toEqual([])
    })
  })

  /**
   * GA-297 — LOT 4 (perf). Mesuré en prod le 12/09/2026 : `GET
   * /contacts/account/:id` rendait 59 champs par contact — 4,1 Mo décompressés
   * sur 2 027 contacts (THALES) — pour un onglet Contacts qui n'en affiche
   * qu'une quinzaine. `findByAccountForHttp` PROJETTE la sortie (inchangée) de
   * `findByAccount` : ces tests comptent des CHAMPS, pas des octets — un compte
   * se reproduit chez tout le monde, un chronomètre ne se reproduit nulle
   * part.
   */
  describe('rankForAccount — #2120.30-38', () => {
    const base = {
      title: 'Responsable Data',
      entity: 'ACME',
      decision_role: 'user',
      email: 'a@acme.fr',
      email_verified: false,
      phone: null,
      linkedin_url: null,
      source: 'apollo',
      user_status: 'new',
      email_sent_at: null,
      last_enrichment_at: null,
      priority: 2,
      hidden: false,
      excluded_at: null,
    }

    it("classe les seuls contacts actifs de l'espace — ni masqués ni écartés", async () => {
      repo.find.mockResolvedValueOnce([
        { ...base, id: 'c1' },
        { ...base, id: 'c2', hidden: true },
        { ...base, id: 'c3', excluded_at: new Date('2026-09-01T00:00:00.000Z') },
      ] as unknown as ContactEntity[])
      accounts.findOne.mockResolvedValueOnce({
        id: 'acc-1',
        raw_analysis: { angles: [{ title: 'Plateforme Data' }] },
      } as unknown as AccountEntity)

      const res = await service.rankForAccount('acc-1', 'user-1', {})

      expect(res.ranked.map(r => r.contact_id)).toEqual(['c1'])
      expect(res.total).toBe(1)
      expect(res.context.subject_source).toBe('account')
      expect(repo.find).toHaveBeenCalledWith({ where: expect.objectContaining({ account_id: 'acc-1' }) })
    })

    it('#3282.19 — la PROCHAINE action planifiée de chaque contact classé ; null quand aucune (jamais une date inventée)', async () => {
      repo.find.mockResolvedValueOnce([
        { ...base, id: 'c1' },
        { ...base, id: 'c2' },
      ] as unknown as ContactEntity[])
      accounts.findOne.mockResolvedValueOnce({ id: 'acc-1', raw_analysis: {} } as unknown as AccountEntity)
      repo.manager.query.mockResolvedValueOnce([{ contact_id: 'c1', next_due: '2026-10-03' }])

      const res = await service.rankForAccount('acc-1', 'user-1', {})

      const byId = new Map(res.ranked.map(r => [r.contact_id, r.next_action_due_date]))
      expect(byId.get('c1')).toBe('2026-10-03')
      expect(byId.get('c2')).toBeNull()
      const [sql] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('action_plan_items')
      expect(sql).toContain('done = false')
    })

    // #3282 / #3263.19 (recette prod 05/10, fiche SG ?tab=committee, 1 778 contacts) — le classement ne
    // rend que les DIX premiers : un siège du comité hors de ce chemin portait sa tâche datée sans que
    // l'écran la voie. La date d'un contact éligible HORS chemin voyage dans `scheduled_actions`.
    it('#3282 — la prochaine action d’un contact éligible hors du chemin recommandé voyage dans scheduled_actions', async () => {
      const ids = Array.from({ length: 12 }, (_, i) => `c${i + 1}`)
      repo.find.mockResolvedValueOnce(
        ids.map(id => ({ ...base, id, full_name: `Contact ${id}` })) as unknown as ContactEntity[],
      )
      accounts.findOne.mockResolvedValueOnce({ id: 'acc-1', raw_analysis: {} } as unknown as AccountEntity)
      repo.manager.query.mockResolvedValueOnce(ids.map(id => ({ contact_id: id, next_due: '2026-10-11' })))

      const res = await service.rankForAccount('acc-1', 'user-1', {})

      expect(res.ranked).toHaveLength(10)
      const rankedIds = new Set(res.ranked.map(r => r.contact_id))
      const outside = ids.filter(id => !rankedIds.has(id))
      expect(outside).toHaveLength(2)
      expect(res.scheduled_actions?.map(s => s.contact_id).sort()).toEqual([...outside].sort())
      expect(res.scheduled_actions?.[0]?.next_action_due_date).toBe('2026-10-11')
    })

    it('#3282 — aucun contact hors chemin daté : scheduled_actions reste vide (jamais une date inventée)', async () => {
      repo.find.mockResolvedValueOnce([{ ...base, id: 'c1', full_name: 'Contact c1' }] as unknown as ContactEntity[])
      accounts.findOne.mockResolvedValueOnce({ id: 'acc-1', raw_analysis: {} } as unknown as AccountEntity)
      repo.manager.query.mockResolvedValueOnce([])

      const res = await service.rankForAccount('acc-1', 'user-1', {})

      expect(res.scheduled_actions ?? []).toEqual([])
    })

    // #3282.19 (recette prod 02/10, « prochaine action : aucune mention sur 50 sièges ») — une
    // tâche (`tasks`) posée sur le contact EST une prochaine action : la lecture ne se limitait
    // qu'aux lignes de plan portant un `contact_id`.
    it('#3282.19 — la prochaine action lit AUSSI les tâches ouvertes du contact, la plus proche des deux', async () => {
      repo.find.mockResolvedValueOnce([{ ...base, id: 'c1' }] as unknown as ContactEntity[])
      accounts.findOne.mockResolvedValueOnce({ id: 'acc-1', raw_analysis: {} } as unknown as AccountEntity)
      repo.manager.query.mockResolvedValueOnce([{ contact_id: 'c1', next_due: '2026-10-05' }])

      const res = await service.rankForAccount('acc-1', 'user-1', {})

      expect(res.ranked[0]?.next_action_due_date).toBe('2026-10-05')
      const [sql] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toMatch(/FROM tasks/)
      expect(sql).toMatch(/status = 'todo'/)
      expect(sql).toMatch(/UNION ALL/)
    })

    // #3282 / #3263.18 — recette prod 02/10 : « aucun siège du comité ne porte de
    // dernière action ». La seule source était `email_sent_at` ; les gestes que le
    // journal garde déjà (fiche ouverte, message préparé, appel renseigné…) n'y
    // comptaient pas. La dernière ACTION est la plus récente de l'un ou l'autre.
    it('#3282 — la DERNIÈRE action d’un contact lit aussi le journal des gestes, jamais un événement système', async () => {
      repo.find.mockResolvedValueOnce([
        { ...base, id: 'c1' },
        { ...base, id: 'c2' },
      ] as unknown as ContactEntity[])
      accounts.findOne.mockResolvedValueOnce({ id: 'acc-1', raw_analysis: {} } as unknown as AccountEntity)
      repo.manager.query
        .mockResolvedValueOnce([]) // prochaine action
        .mockResolvedValueOnce([{ contact_id: 'c1', last_at: new Date('2026-10-01T09:30:00.000Z') }])

      const res = await service.rankForAccount('acc-1', 'user-1', {})

      const byId = new Map(res.ranked.map(r => [r.contact_id, r.last_action_at]))
      expect(byId.get('c1')).toBe('2026-10-01T09:30:00.000Z')
      expect(byId.get('c2')).toBeNull()
      const [sql, params] = repo.manager.query.mock.calls[1] as [string, unknown[]]
      expect(sql).toContain('user_actions')
      expect(sql).not.toContain('account_score_changed')
      expect((params[1] as string[]).includes('plan_action_contact_opened')).toBe(true)
      expect((params[1] as string[]).includes('profile_updated')).toBe(false)
    })

    it("aucun contact dans l'espace : le compte n'est jamais lu, sa cartographie ne fuit pas", async () => {
      repo.find.mockResolvedValueOnce([])

      const res = await service.rankForAccount('acc-autre-espace', 'user-1', { subject: 'Cloud' })

      expect(accounts.findOne).not.toHaveBeenCalled()
      expect(res.ranked).toEqual([])
      expect(res.context.perimeter_source).toBe('none')
    })

    it('#2295.3 — un contact masqué ou écarté sort à la PORTE, avec sa raison, avant le rang', async () => {
      repo.find.mockResolvedValueOnce([
        { ...base, id: 'c1', full_name: 'Jean Dupont' },
        { ...base, id: 'c2', full_name: 'Alice Martin', hidden: true },
        { ...base, id: 'c3', full_name: 'Bob Lenoir', excluded_at: new Date('2026-09-01T00:00:00.000Z') },
      ] as unknown as ContactEntity[])
      accounts.findOne.mockResolvedValueOnce({
        id: 'acc-1',
        raw_analysis: { angles: [{ title: 'Plateforme Data' }] },
      } as unknown as AccountEntity)

      const res = await service.rankForAccount('acc-1', 'user-1', {})

      expect(res.ranked.map(r => r.contact_id)).toEqual(['c1'])
      expect(res.excluded.sort((a, b) => a.contact_id.localeCompare(b.contact_id))).toEqual([
        { contact_id: 'c2', reason: 'permission_denied' },
        { contact_id: 'c3', reason: 'permission_denied' },
      ])
    })
  })

  /**
   * PERF 29/09/2026 — `GET /briefing/today` mesuré 8,5 s en prod. Le brief
   * appelait `rankForAccount` UNE FOIS PAR COMPTE À SURVEILLER (résolution de
   * l'espace, lecture des contacts ENTIERS, lecture du compte entier, lecture
   * des fiches signalées — ≥ 6 requêtes par compte). `topAccessPaths` lit tout
   * en UNE fois : le nombre de requêtes ne dépend plus du nombre de comptes, et
   * le rang retenu est LE MÊME (même éligibilité, même noyau de classement).
   */
  describe('topAccessPaths — budget de requêtes (perf 29/09)', () => {
    const base = {
      title: 'Responsable Data',
      entity: 'ACME',
      decision_role: 'user',
      email: 'a@acme.fr',
      email_verified: false,
      phone: null,
      linkedin_url: null,
      source: 'apollo',
      user_status: 'new',
      email_sent_at: null,
      last_enrichment_at: null,
      priority: 2,
      hidden: false,
      excluded_at: null,
    }
    const accountIds = (n: number) => Array.from({ length: n }, (_, i) => `acc-${i}`)
    function seed(n: number) {
      repo.find.mockResolvedValue(
        accountIds(n).map((id, i) => ({ ...base, id: `c-${i}`, account_id: id })) as unknown as ContactEntity[],
      )
      accounts.find.mockResolvedValue(
        accountIds(n).map(id => ({ id, raw_analysis: { angles: [{ title: 'Plateforme Data' }] } })) as never,
      )
    }
    const queries = () => repo.find.mock.calls.length + accounts.find.mock.calls.length
    const MAX_QUERIES = 2

    it.each([3, 30])('%i comptes : deux lectures et une seule résolution d’espace', async n => {
      seed(n)
      const paths = await service.topAccessPaths(accountIds(n), 'user-1')
      expect(paths.size).toBe(n)
      expect(queries()).toBeLessThanOrEqual(MAX_QUERIES)
      expect(workspace.resolveActiveWorkspace).toHaveBeenCalledTimes(1)
    })

    it('donne, pour chaque compte, la voie d’accès que rankForAccount donnerait', async () => {
      seed(2)
      const batch = await service.topAccessPaths(['acc-0', 'acc-1'], 'user-1')
      repo.find.mockResolvedValueOnce([{ ...base, id: 'c-0', account_id: 'acc-0' }] as unknown as ContactEntity[])
      accounts.findOne.mockResolvedValueOnce({
        id: 'acc-0',
        raw_analysis: { angles: [{ title: 'Plateforme Data' }] },
      } as unknown as AccountEntity)
      const single = await service.rankForAccount('acc-0', 'user-1', {})
      expect(batch.get('acc-0')).toEqual(single.ranked[0]?.access_path ?? null)
    })

    /**
     * #3749 — `rankForAccount` lit déjà les postes cibles de l'espace
     * (`loadTargetPersonas`, ligne ~1690) ; `topAccessPaths` ne les passait
     * pas à `rankAccountContacts` (`{}` en dernier argument, jamais
     * `targetPersonas`) — la MÊME omission que `rankForAccount` avant #3754,
     * sur le chemin BULK de `/briefing/today`. Le niveau ORDONNE le chemin
     * retenu, jamais ne le filtre (doctrine c76) : sans poste cible rapproché,
     * le contact avec un e-mail gagne (`access_path.kind: 'email'`) ; avec un
     * niveau décideur 1, le VP sans e-mail passe devant (`kind: null`).
     */
    it('#3749 — les postes cibles de l’espace ORDONNENT le chemin d’accès retenu, comme pour un seul compte', async () => {
      const techLead = {
        ...base,
        id: 'c-tech-lead',
        account_id: 'acc-0',
        title: 'Tech Lead',
        decision_role: 'economic',
        email: 'a@x.fr',
      }
      const vp = {
        ...base,
        id: 'c-vp',
        account_id: 'acc-0',
        title: 'VP Tech & Architecture',
        decision_role: 'user',
        email: null,
      }
      repo.find.mockResolvedValue([techLead, vp] as unknown as ContactEntity[])
      accounts.find.mockResolvedValue([
        { id: 'acc-0', raw_analysis: { angles: [{ title: 'Plateforme Data' }] } },
      ] as never)

      const withoutTargets = await service.topAccessPaths(['acc-0'], 'user-1')
      expect(withoutTargets.get('acc-0')?.kind).toBe('email')

      const targetPersonasRepo = createMockRepository<EsnTargetPersonaEntity>()
      targetPersonasRepo.find.mockResolvedValue([{ title: 'VP Tech & Architecture', decision_level: 1 }] as never)
      const withTargets = new ContactsService(
        repo as never,
        userActions as never,
        ia as unknown as IaClient,
        credits as unknown as CreditsService,
        workspace as unknown as WorkspaceContextService,
        mailer as never,
        suppression as never,
        config as never,
        cadence as never,
        accounts as never,
        transitions as never,
        dropcontact as never,
        extraEnrichers as never,
        merges as never,
        brandsStub as never,
        undefined,
        undefined,
        provenance as never,
        sprintBus as never,
        undefined, // crmConnections
        undefined, // enrichmentDuration
        undefined, // personErasures
        undefined, // contactStops
        undefined, // outcomes
        undefined, // intakeExclusions
        targetPersonasRepo as never,
      )

      const result = await withTargets.topAccessPaths(['acc-0'], 'user-1')
      expect(result.get('acc-0')?.kind).toBeNull()
    })

    it('un compte sans contact classable vaut null, jamais une voie devinée', async () => {
      repo.find.mockResolvedValue([{ ...base, id: 'c-0', account_id: 'acc-0' }] as unknown as ContactEntity[])
      accounts.find.mockResolvedValue([{ id: 'acc-0', raw_analysis: null }] as never)
      const paths = await service.topAccessPaths(['acc-0', 'acc-vide'], 'user-1')
      expect(paths.get('acc-vide')).toBeNull()
    })

    it('n’interroge rien quand il n’y a aucun compte', async () => {
      const paths = await service.topAccessPaths([], 'user-1')
      expect(paths.size).toBe(0)
      expect(queries()).toBe(0)
    })
  })

  /**
   * #4088.2 — « QUI ÇA CONCERNE » dans la Veille : le contact en tête du chemin
   * recommandé de chaque compte, par le MÊME classement que `rankForAccount`.
   */
  describe('topDecisionMakers — le décideur de tête d’un compte (#4088.2)', () => {
    const row = (id: string, accountId: string, over: Record<string, unknown> = {}) =>
      ({
        id,
        account_id: accountId,
        full_name: `Nom ${id}`,
        title: 'Responsable Data',
        entity: 'ACME',
        decision_role: 'user',
        email: 'a@acme.fr',
        email_verified: false,
        phone: null,
        linkedin_url: null,
        source: 'apollo',
        user_status: 'new',
        email_sent_at: null,
        last_enrichment_at: null,
        priority: 2,
        hidden: false,
        excluded_at: null,
        ...over,
      }) as unknown as ContactEntity

    it('rend nom + poste du premier du classement, comme rankForAccount, et null sans contact', async () => {
      const rows = [
        row('c-1', 'acc-0', { full_name: 'Marie Durand', title: 'Directrice des systèmes d’information' }),
        row('c-2', 'acc-0', { full_name: 'Paul Petit', title: 'Chef de projet', decision_role: 'operational' }),
      ]
      repo.find.mockResolvedValue(rows)
      accounts.find.mockResolvedValue([
        { id: 'acc-0', raw_analysis: { angles: [{ title: 'Plateforme Data' }] } },
      ] as never)

      const heads = await service.topDecisionMakers(['acc-0', 'acc-vide'], 'user-1')

      accounts.findOne.mockResolvedValue({
        id: 'acc-0',
        raw_analysis: { angles: [{ title: 'Plateforme Data' }] },
      } as unknown as AccountEntity)
      repo.manager.query.mockResolvedValue([])
      const single = await service.rankForAccount('acc-0', 'user-1', {})
      const expectedId = heads.get('acc-0')?.contact_id
      expect(expectedId).toBeDefined()
      expect(['c-1', 'c-2']).toContain(expectedId)
      expect(single.ranked[0]?.contact_id).toBe(expectedId)
      expect(heads.get('acc-0')?.name).toBe(rows.find(r => r.id === expectedId)?.full_name)
      expect(heads.get('acc-0')?.title).toBe(rows.find(r => r.id === expectedId)?.title)
      expect(heads.get('acc-vide')).toBeNull()
    })

    // #4292.11 — les classements en masse appliquent le statut d'accès (#4271) comme la fiche compte : « référencé »
    // met l'acheteur devant le décideur, et le décideur de tête de la Veille est le MÊME que celui de la fiche.
    it('applique le statut d’accès du compte, comme rankForAccount (#4292.11)', async () => {
      const rows = [
        row('c-1', 'acc-0', {
          full_name: 'Marie Durand',
          title: 'Directrice des systèmes d’information',
          decision_role: 'economic',
        }),
        row('c-2', 'acc-0', { full_name: 'Paul Petit', title: 'Acheteur IT', decision_role: 'procurement' }),
      ]
      repo.find.mockResolvedValue(rows)
      const raw = { priority_perimeters: [{ name: 'ACME', tier: 'P1' }], angles: [] }
      accounts.find.mockResolvedValue([{ id: 'acc-0', raw_analysis: raw }] as never)
      accounts.findOne.mockResolvedValue({ id: 'acc-0', raw_analysis: raw } as unknown as AccountEntity)
      const referenced = (sql: string) => (sql.includes('account_partners') ? [{ account_id: 'acc-0' }] : [])
      repo.query.mockImplementation(async (sql: string) => referenced(sql))

      const heads = await service.topDecisionMakers(['acc-0'], 'user-1')
      const single = await service.rankForAccount('acc-0', 'user-1', {})
      expect(single.ranked[0]?.contact_id).toBe('c-2')
      expect(heads.get('acc-0')?.contact_id).toBe('c-2')
    })

    // #4802 — l'état d'accès posé à la main prime sur le calcul ; il réordonne, il ne filtre pas (c76).
    it('l’état d’accès déclaré à la main prime sur le calcul, et réordonne sans filtrer (#4802)', async () => {
      const rows = [
        row('c-1', 'acc-0', {
          full_name: 'Marie Durand',
          title: 'Directrice des systèmes d’information',
          decision_role: 'economic',
        }),
        row('c-2', 'acc-0', { full_name: 'Paul Petit', title: 'Acheteur IT', decision_role: 'procurement' }),
      ]
      repo.find.mockResolvedValue(rows)
      const raw = { priority_perimeters: [{ name: 'ACME', tier: 'P1' }], angles: [] }
      accounts.find.mockResolvedValue([{ id: 'acc-0', raw_analysis: raw }] as never)
      accounts.findOne.mockResolvedValue({ id: 'acc-0', raw_analysis: raw } as unknown as AccountEntity)
      const declare = (value: string) => async (sql: string) =>
        sql.includes('access_facts')
          ? [{ account_id: 'acc-0', value }]
          : sql.includes('account_partners')
            ? [{ account_id: 'acc-0' }]
            : []

      repo.query.mockImplementation(declare('to_build'))
      const toBuild = await service.rankForAccount('acc-0', 'user-1', {})
      repo.query.mockImplementation(declare('referenced'))
      const referenced = await service.rankForAccount('acc-0', 'user-1', {})
      expect(toBuild.ranked[0]?.contact_id).toBe('c-1')
      expect(referenced.ranked[0]?.contact_id).toBe('c-2')
      expect(toBuild.ranked.map(r => r.contact_id).sort()).toEqual(referenced.ranked.map(r => r.contact_id).sort())

      repo.query.mockImplementation(declare('inconnu'))
      const heads = await service.topDecisionMakers(['acc-0'], 'user-1')
      const unknown = await service.rankForAccount('acc-0', 'user-1', {})
      expect(unknown.ranked[0]?.contact_id).toBe(heads.get('acc-0')?.contact_id)
    })

    it('n’invente pas : un contact de tête sans nom ne donne aucun décideur', async () => {
      repo.find.mockResolvedValue([row('c-1', 'acc-0', { full_name: '   ' })])
      accounts.find.mockResolvedValue([{ id: 'acc-0', raw_analysis: null }] as never)
      const heads = await service.topDecisionMakers(['acc-0'], 'user-1')
      expect(heads.get('acc-0')).toBeNull()
    })

    it('budget : une résolution d’espace, trois lectures au plus, quel que soit le nombre de comptes', async () => {
      const ids = Array.from({ length: 30 }, (_, i) => `acc-${i}`)
      repo.find.mockResolvedValue(ids.map((id, i) => row(`c-${i}`, id)))
      accounts.find.mockResolvedValue(ids.map(id => ({ id, raw_analysis: null })) as never)
      const heads = await service.topDecisionMakers(ids, 'user-1')
      expect(heads.size).toBe(30)
      expect(repo.find.mock.calls.length + accounts.find.mock.calls.length).toBeLessThanOrEqual(3)
      expect(workspace.resolveActiveWorkspace).toHaveBeenCalledTimes(1)
    })

    it('n’interroge rien sans compte', async () => {
      expect((await service.topDecisionMakers([], 'user-1')).size).toBe(0)
      expect(repo.find).not.toHaveBeenCalled()
    })
  })

  /**
   * #2671.5 — le compte d'un contact se lit SOUS la borne d'espace. Le faux
   * dépôt ci-dessous se comporte comme la base : il rend le compte de l'AUTRE
   * espace dès que la requête ne porte pas de `workspace_id`, et le refuse dès
   * qu'elle en porte un autre que le sien. Une lecture par id seule fuit donc
   * ici exactement comme elle fuirait en production.
   */
  describe('#2671.5 — une lecture de compte par id ne sort jamais de l’espace', () => {
    const foreignAccount = {
      id: 'acc-autre-espace',
      workspace_id: 'ws-autre',
      company_name: 'Concurrent SA',
      headquarters: 'Lyon, Auvergne-Rhône-Alpes',
      sector: 'Santé privée',
      recent_signals: [],
      raw_analysis: { angles: [{ title: 'Plateforme Data' }] },
    } as unknown as AccountEntity
    let leaks: AccountEntity[]

    beforeEach(() => {
      leaks = []
      accounts.findOne.mockReset()
      accounts.findOne.mockImplementation(async (opts: { where?: Record<string, unknown> }) => {
        const where = opts?.where ?? {}
        if (where.id !== foreignAccount.id) return null
        // Comme la base : pas de colonne dans le WHERE = pas de filtre.
        if ('workspace_id' in where && where.workspace_id !== foreignAccount.workspace_id) return null
        leaks.push(foreignAccount)
        return foreignAccount
      })
      jest
        .spyOn(service as unknown as { accountIsInScope: () => Promise<boolean> }, 'accountIsInScope')
        .mockResolvedValue(true)
    })

    it('findByAccount (scoreContacts) : un contact de ws-1 pointant un compte de ws-autre ne lit pas ce compte', async () => {
      repo.find.mockResolvedValueOnce([
        { id: 'c1', workspace_id: 'ws-1', account_id: foreignAccount.id },
      ] as unknown as ContactEntity[])

      await service.findByAccount(foreignAccount.id, 'user-1')

      expect(leaks).toEqual([])
      expect(accounts.findOne).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: foreignAccount.id, workspace_id: 'ws-1' }),
      })
    })

    it('findOne (scoreContacts) : la fiche d’un contact de ws-1 ne prête pas la cartographie d’un compte de ws-autre', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 'c1',
        workspace_id: 'ws-1',
        account_id: foreignAccount.id,
      } as unknown as ContactEntity)
      userActions.find.mockResolvedValueOnce([])

      await service.findOne('c1', 'user-1')

      expect(leaks).toEqual([])
    })

    it('rankForAccount : le classement ne lit pas le compte d’un autre espace', async () => {
      repo.find.mockResolvedValueOnce([
        { id: 'c1', workspace_id: 'ws-1', account_id: foreignAccount.id },
      ] as unknown as ContactEntity[])

      await service.rankForAccount(foreignAccount.id, 'user-1', {})

      expect(leaks).toEqual([])
      expect(accounts.findOne).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: foreignAccount.id, workspace_id: 'ws-1' }),
      })
    })

    it('enrichContact en démo (enrichContactInDemo) : le dossier d’un autre espace ne nourrit pas la fiche', async () => {
      workspace.isDemoWorkspace.mockResolvedValue(true)
      repo.findOne.mockResolvedValueOnce({
        id: 'c-demo',
        user_id: 'user-1',
        workspace_id: 'ws-1',
        account_id: foreignAccount.id,
        full_name: 'Amandine Costa',
        title: 'Cheffe de projet SI',
      } as unknown as ContactEntity)
      repo.find.mockResolvedValue([])

      await service.enrichContact('c-demo', 'user-1', {
        first_name: 'Amandine',
        last_name: 'Costa',
        organization_name: 'Cliniques Mireval',
      })

      expect(leaks).toEqual([])
    })
  })

  describe('findByAccountForHttp', () => {
    it('GA-297 — un contact à 58 champs (ContactEntity complet) en rend 55 : -8 retirés +1 source_tag +1 last_name_obfuscated +1 email_estimated_at (#4016) +1 place (#4044) +1 employment_left (#4055.8)', async () => {
      // Les 58 champs déclarés par ContactEntity (apps/api/src/database/entities/
      // contact.entity.ts), un par un — c'est le COMPTE que la garde protège,
      // pas un chronomètre. `scoreContacts` en ajoute un 59e à la lecture
      // (`source_tag`), jamais une colonne : 58 + 1 = 59, le chiffre mesuré en
      // prod le 12/09/2026 sur THALES/Societe Generale/DEVOTEAM.
      const fullRow = {
        id: 'c1',
        account_id: 'acc-1',
        user_id: 'user-1',
        workspace_id: 'ws-1',
        assigned_to: null,
        full_name: 'Claire Martin',
        title: 'DSI',
        entity: 'ACME',
        entity_id: null,
        family: null,
        decision_role: 'technical',
        priority: 1,
        email: 'claire@acme.fr',
        email_verified: true,
        phone: null,
        linkedin_url: null,
        photo_url: null,
        profile_summary: null,
        why_contact: null,
        email_message: null,
        linkedin_message: null,
        phone_script: null,
        cadence_messages: null,
        followup_message: null,
        user_status: 'new',
        email_sent_at: null,
        note: null,
        hidden: false,
        deleted_at: null,
        source: 'apollo',
        lifecycle_state: null,
        raw_data: null,
        contact_score: null,
        contact_score_breakdown: null,
        language: null,
        timezone: null,
        location: null,
        seniority: null,
        scope: null,
        budget_authority: null,
        key_points: null,
        signals: null,
        activity: null,
        relations: null,
        apollo_enrichment: null,
        last_enrichment_at: null,
        last_enrichment_provider: null,
        last_enrichment_result: null,
        last_enrichment_missing: null,
        career_levers: null,
        implicit_fears: null,
        anonymized_at: null,
        crm_record_id: null,
        crm_synced_at: null,
        excluded_at: null,
        exclusion_reason: null,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-02T00:00:00.000Z'),
      }
      expect(Object.keys(fullRow)).toHaveLength(58)
      repo.find.mockResolvedValueOnce([fullRow] as unknown as ContactEntity[])

      const [row] = await service.findByAccountForHttp('acc-1', 'user-1')

      expect(Object.keys(row as unknown as Record<string, unknown>)).toHaveLength(55)
    })

    it('GA-297 — retire les six champs mesurés inutiles et projette last_name_obfuscated hors de raw_data', async () => {
      repo.find.mockResolvedValueOnce([
        {
          id: 'c1',
          account_id: 'acc-1',
          user_id: 'user-1',
          workspace_id: 'ws-1',
          full_name: 'Claire Martin',
          title: 'DSI',
          raw_data: { lastNameObfuscated: 'Ma***n', apolloDetails: { seniority: 'director' } },
          created_at: new Date('2026-01-01T00:00:00.000Z'),
          updated_at: new Date('2026-01-02T00:00:00.000Z'),
          apollo_enrichment: { employment_history: [{ current: true, title: 'DSI', start_date: '2022' }] },
        },
      ] as unknown as ContactEntity[])

      const [row] = await service.findByAccountForHttp('acc-1', 'user-1')

      // Retirés — voir AccountContactView dans contacts.service.ts pour la
      // raison de chacun.
      expect(Object.prototype.hasOwnProperty.call(row, 'user_id')).toBe(false)
      expect(Object.prototype.hasOwnProperty.call(row, 'workspace_id')).toBe(false)
      expect(Object.prototype.hasOwnProperty.call(row, 'contact_score')).toBe(false)
      expect(Object.prototype.hasOwnProperty.call(row, 'contact_score_breakdown')).toBe(false)
      expect(Object.prototype.hasOwnProperty.call(row, 'raw_data')).toBe(false)
      expect(Object.prototype.hasOwnProperty.call(row, 'created_at')).toBe(false)
      // perf P6 — `cadence_messages` / `followup_message` : aucun consommateur
      // web (seul `toEngagementContact` les FORCE à null), ni IA, ni pont.
      expect(Object.prototype.hasOwnProperty.call(row, 'cadence_messages')).toBe(false)
      expect(Object.prototype.hasOwnProperty.call(row, 'followup_message')).toBe(false)

      // Gardés — des consommateurs réels les lisent sur CETTE route
      // (ContactOutcomeSubmenu/EngagementPanel pour account_id,
      // RelationshipMemoryCard pour apollo_enrichment/updated_at).
      expect(row.account_id).toBe('acc-1')
      expect(row.updated_at).toBeDefined()
      expect(row.apollo_enrichment).toBeDefined()
      expect(row.full_name).toBe('Claire Martin')
      expect(row.title).toBe('DSI')
      // Le masque de nom de famille voyage désormais comme un CHAMP projeté,
      // pas au fond de `raw_data` (même motif que `findAllForUser`).
      expect(row.last_name_obfuscated).toBe('Ma***n')
    })

    it("GA-297 — sait dire NON : un champ retiré qui réapparaîtrait ferait échouer l'assertion d'absence", async () => {
      // Témoin, pas un doublon du test précédent : celui-ci isole UN SEUL champ
      // pour que la preuve « la garde sait dire NON » (voir le rapport du lot,
      // qui rejoue ce test après avoir remis `contact_score_breakdown` dans la
      // projection) porte sur une assertion unique et sans ambiguïté.
      repo.find.mockResolvedValueOnce([
        { id: 'c1', account_id: 'acc-1', full_name: 'Témoin' },
      ] as unknown as ContactEntity[])
      const [row] = await service.findByAccountForHttp('acc-1', 'user-1')
      expect(Object.prototype.hasOwnProperty.call(row, 'contact_score_breakdown')).toBe(false)
    })

    it("GA-297 — n'attrape pas ce qu'elle ne vise pas : un champ riche légitime traverse intact", async () => {
      repo.find.mockResolvedValueOnce([
        {
          id: 'c1',
          account_id: 'acc-1',
          full_name: 'Claire Martin',
          // Champs riches, jamais visés par cette garde : ils doivent survivre
          // intacts, sinon la garde deviendrait trop gourmande (doctrine « une
          // garde qui n'attrape pas ce qu'elle ne vise pas »).
          career_levers: ['budget Q4'],
          implicit_fears: ['perte de contrôle IT'],
          signals: [{ type: 'job_change', detail: 'Promu DSI' }],
          key_points: ['Pilote la migration cloud'],
        },
      ] as unknown as ContactEntity[])

      const [row] = await service.findByAccountForHttp('acc-1', 'user-1')

      expect(row.career_levers).toEqual(['budget Q4'])
      expect(row.implicit_fears).toEqual(['perte de contrôle IT'])
      expect(row.signals).toEqual([{ type: 'job_change', detail: 'Promu DSI' }])
      expect(row.key_points).toEqual(['Pilote la migration cloud'])
    })

    it("#4055.8 — employment_left : la preuve datée d'un autre employeur voyage projetée, jamais sans employeur ni date", async () => {
      repo.find.mockResolvedValueOnce([
        {
          id: 'c1',
          account_id: 'acc-1',
          full_name: 'Parti',
          raw_data: { employmentCheck: { state: 'left', at: '2026-10-07T10:00:00.000Z', organization: 'BPCE' } },
        },
        {
          id: 'c2',
          account_id: 'acc-1',
          full_name: 'Sans employeur',
          raw_data: { employmentCheck: { state: 'left', at: '2026-10-07T10:00:00.000Z' } },
        },
        {
          id: 'c3',
          account_id: 'acc-1',
          full_name: 'Non retrouvé',
          raw_data: { employmentCheck: { state: 'not_found', at: '2026-10-07T10:00:00.000Z' } },
        },
        { id: 'c4', account_id: 'acc-1', full_name: 'Sans relecture', raw_data: null },
      ] as unknown as ContactEntity[])

      const result = await service.findByAccountForHttp('acc-1', 'user-1')

      const byName = Object.fromEntries(result.map(r => [r.full_name, r.employment_left]))
      expect(byName).toEqual({
        Parti: { organization: 'BPCE', at: '2026-10-07T10:00:00.000Z' },
        'Sans employeur': null,
        'Non retrouvé': null,
        'Sans relecture': null,
      })
    })

    it("#4465.2 — employment_left : le poste chez l'employeur du compte daté de fin ⇒ parti ; un poste en cours ⇒ présent", async () => {
      accounts.findOne.mockResolvedValue({ id: 'acc-1', company_name: 'CAFPI' } as unknown as AccountEntity)
      repo.find.mockResolvedValueOnce([
        {
          id: 'c1',
          account_id: 'acc-1',
          full_name: 'Partie',
          raw_data: {
            apolloDetails: {
              employmentHistory: [
                { title: 'Directrice', organization: 'Orange', current: true, start_date: '2024-05-01' },
                { title: 'Responsable IT', organization: 'Cafpi SA', current: false, end_date: '2024-03-31' },
              ],
            },
          },
        },
        {
          id: 'c2',
          account_id: 'acc-1',
          full_name: 'Présent',
          raw_data: {
            apolloDetails: { employmentHistory: [{ title: 'DSI', organization: 'CAFPI', current: true }] },
          },
        },
      ] as unknown as ContactEntity[])

      const result = await service.findByAccountForHttp('acc-1', 'user-1')

      const byName = Object.fromEntries(result.map(r => [r.full_name, r.employment_left]))
      expect(byName).toEqual({ Partie: { organization: 'Orange', at: '2024-03-31' }, Présent: null })
    })

    it('last_name_obfuscated est `null` quand raw_data est absent ou ne porte pas la clé', async () => {
      repo.find.mockResolvedValueOnce([
        { id: 'c1', account_id: 'acc-1', full_name: 'Sans masque', raw_data: null },
        { id: 'c2', account_id: 'acc-1', full_name: 'Autre clé', raw_data: { apolloDetails: {} } },
      ] as unknown as ContactEntity[])

      const result = await service.findByAccountForHttp('acc-1', 'user-1')

      expect(result.map(r => r.last_name_obfuscated)).toEqual([null, null])
    })

    it('returns [] on repo failure (findByAccount sous-jacente inchangée)', async () => {
      repo.find.mockRejectedValueOnce(new Error('x'))
      expect(await service.findByAccountForHttp('acc-1', 'user-1')).toEqual([])
    })
  })

  describe('findAllForUser', () => {
    // #4982.1 — tri « zone » (proche d'abord) EN SQL : la liste est paginée, jamais triée sur la seule page chargée.
    it('#4982.1 sort=zone : ordonne EN SQL par palier de zone puis par ville, zone inconnue en dernier', async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([])

      await service.findAllForUser('user-1', { sort: 'zone' })

      // Le palier de zone REMPLACE l'ordre d'avant (`orderBy`) ; la date de création ne départage que les égalités.
      const orderBys = repo._qb.orderBy.mock.calls.map((c: unknown[]) => String(c[0]))
      const zoneOrder = orderBys.find((expr: string) => expr.includes('CASE')) ?? ''
      expect(zoneOrder).toContain('contact.location')
      expect(orderBys.indexOf(zoneOrder)).toBeGreaterThan(orderBys.indexOf('contact.created_at'))
      const addOrders = repo._qb.addOrderBy.mock.calls.map((c: unknown[]) => String(c[0]))
      expect(addOrders).toContain('contact.created_at')
      // La ville du groupe voyage sur chaque ligne pour que le web pose ses en-têtes.
      const selected = [...repo._qb.select.mock.calls, ...repo._qb.addSelect.mock.calls].map(c => JSON.stringify(c))
      expect(selected.some(call => call.includes('zone_city'))).toBe(true)
      // #4982 — région d'abord (Louis 31/10) : le département voyage aussi, et la région départage avant la ville.
      expect(selected.some(call => call.includes('zone_department'))).toBe(true)
      expect(addOrders.some(expr => expr.includes('hauts_de_france'))).toBe(true)
    })

    it('#4982.3 zoneBreakdown : GROUP BY de la MÊME zone que le tri, borné à l’espace, lieux inconnus comptés à part', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([
        { region: 'ile_de_france', department: '75', count: '4' },
        { region: 'hauts_de_france', department: '59', count: '2' },
        { region: null, department: null, count: '7' },
      ])

      const out = await service.zoneBreakdown('user-1', {})

      expect(out).toEqual({
        zones: [
          { region: 'ile_de_france', department: '75', count: 4 },
          { region: 'hauts_de_france', department: '59', count: 2 },
        ],
        unknown_zone: 7,
        total: 13,
      })
      // Borne d'espace (jamais un autre espace compté) posée en `andWhere`, groupement sur la zone du tri.
      const wheres = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(wheres).toContain('contact.workspace_id = :workspaceId')
      expect(
        repo._qb.andWhere.mock.calls.find((c: unknown[]) => c[0] === 'contact.workspace_id = :workspaceId')?.[1],
      ).toEqual({
        workspaceId: 'ws-1',
      })
      expect(repo._qb.groupBy).toHaveBeenCalled()
    })

    it('#4982.3b zoneBreakdown : une région connue SANS département compte dans les zones, seule la région inconnue est à part', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([
        { region: 'ile_de_france', department: null, count: '5' },
        { region: 'ile_de_france', department: '75', count: '4' },
        { region: null, department: null, count: '3' },
      ])

      const out = await service.zoneBreakdown('user-1', {})

      expect(out.zones).toEqual([
        { region: 'ile_de_france', department: null, count: 5 },
        { region: 'ile_de_france', department: '75', count: 4 },
      ])
      expect(out.unknown_zone).toBe(3)
      expect(out.total).toBe(12)
    })

    it('#4982.3b le SQL de zone lit aussi le lieu écrit (nom de région, ville nommée), généré depuis les contrats', () => {
      expect(ZONE_REGION_SQL).toContain('COALESCE')
      expect(ZONE_REGION_SQL).toContain('% ile de france %')
      expect(ZONE_REGION_SQL).toContain(`'lyon'`)
      expect(ZONE_REGION_SQL).toContain('united states')
      expect(ZONE_DEPARTMENT_SELECT_SQL).toContain(`WHEN `)
    })

    it('#4982.1 sans sort : l’ordre d’avant (plus récent d’abord), aucun palier de zone', async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([])

      await service.findAllForUser('user-1', {})

      const orders = [...repo._qb.orderBy.mock.calls, ...repo._qb.addOrderBy.mock.calls].map(c => String(c[0]))
      expect(orders.some(expr => expr.includes('CASE') && expr.includes('contact.location'))).toBe(false)
      expect(orders[0]).toBe('contact.created_at')
    })

    it('exposes provenance (source + created_at/updated_at) as ISO strings — Théo p.16 colonnes Source/Date', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          id: 'c2',
          account_id: 'acc-1',
          full_name: 'Marie Curie',
          title: 'CTO',
          entity: null,
          decision_role: 'technical',
          priority: 1,
          email: 'marie@acme.fr',
          phone: null,
          linkedin_url: null,
          why_contact: null,
          user_status: 'new',
          source: 'apollo',
          // The pg driver yields `Date` objects for timestamptz in getRawMany —
          // the service must serialize them to ISO strings for the contract.
          created_at: new Date('2026-07-01T10:00:00.000Z'),
          updated_at: new Date('2026-07-02T12:30:00.000Z'),
          company_name: 'Acme',
        },
      ])

      const result = await service.findAllForUser('user-1')

      expect(result.data[0]).toMatchObject({
        source: 'apollo',
        created_at: '2026-07-01T10:00:00.000Z',
        updated_at: '2026-07-02T12:30:00.000Z',
      })
    })

    /**
     * #2165.38 — LE LIEU DE TRAVAIL VOYAGE JUSQU'À LA LISTE.
     *
     * La colonne `contacts.location` existait, l'enrichissement la remplissait,
     * la FICHE l'affichait — et cette projection de liste la jetait. Le filtre
     * « Localisation » de Découvrir se déclarait donc inconditionnellement
     * inconnu, avec un motif exact de la liste et faux de la donnée.
     *
     * Ce test lit DEUX choses, pour pouvoir dire NON à deux régressions
     * différentes : que la colonne est bien SÉLECTIONNÉE (sinon la requête ne
     * la ramènerait jamais, quoi qu'en dise le mapping), et que sa valeur
     * ABSENTE reste `null` — jamais une chaîne vide qui s'afficherait comme un
     * lieu.
     */
    it('#2165.38 — sélectionne `contact.location` et la rend telle quelle, `null` compris', async () => {
      repo._qb.getCount.mockResolvedValueOnce(2)
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          id: 'c3',
          account_id: 'acc-1',
          full_name: 'Alix Renard',
          title: 'DSI',
          entity: null,
          decision_role: 'technical',
          priority: 1,
          email: null,
          phone: null,
          linkedin_url: null,
          why_contact: null,
          user_status: 'new',
          source: 'apollo',
          created_at: new Date('2026-07-01T10:00:00.000Z'),
          updated_at: new Date('2026-07-02T12:30:00.000Z'),
          company_name: 'Acme',
          location: 'Lyon, France',
        },
        {
          id: 'c4',
          account_id: 'acc-1',
          full_name: 'Sans Lieu',
          title: null,
          entity: null,
          decision_role: null,
          priority: null,
          email: null,
          phone: null,
          linkedin_url: null,
          why_contact: null,
          user_status: 'new',
          source: null,
          created_at: new Date('2026-07-01T10:00:00.000Z'),
          updated_at: new Date('2026-07-02T12:30:00.000Z'),
          company_name: 'Acme',
          location: null,
        },
      ])

      const result = await service.findAllForUser('user-1')

      const selected = repo._qb.select.mock.calls.flatMap((call: unknown[]) => call[0] as string[])
      expect(selected).toContain('contact.location AS location')
      expect(result.data[0]?.location).toBe('Lyon, France')
      expect(result.data[1]?.location).toBeNull()
    })

    /**
     * #4503 (recette prod 25/10) — « la ville n'apparaît que sur une ligne sur trois dans la colonne Compte ». La colonne
     * « Compte » (maquette V22 : nom + ville) ne recevait que le lieu de TRAVAIL de la personne (`contact.location`,
     * rempli par l'enrichissement seulement). La ville du COMPTE est un fait sur l'organisation (`accounts.headquarters`,
     * le même que la liste des comptes lit, #4497.a) : elle voyage sous son propre nom, jamais versée dans `location`.
     */
    it('#4503 — sélectionne le siège du compte sous `account_headquarters`, `null` compris, sans toucher `location`', async () => {
      repo._qb.getCount.mockResolvedValueOnce(2)
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          id: 'c8',
          account_id: 'acc-1',
          full_name: 'Avec Siège',
          title: null,
          entity: null,
          decision_role: null,
          priority: null,
          email: null,
          phone: null,
          linkedin_url: null,
          why_contact: null,
          user_status: 'new',
          source: null,
          created_at: new Date('2026-07-01T10:00:00.000Z'),
          updated_at: new Date('2026-07-02T12:30:00.000Z'),
          company_name: 'Acme',
          location: null,
          account_headquarters: '29 boulevard Haussmann, 75009 Paris',
        },
        {
          id: 'c9',
          account_id: null,
          full_name: 'Sans Compte',
          title: null,
          entity: null,
          decision_role: null,
          priority: null,
          email: null,
          phone: null,
          linkedin_url: null,
          why_contact: null,
          user_status: 'new',
          source: null,
          created_at: new Date('2026-07-01T10:00:00.000Z'),
          updated_at: new Date('2026-07-02T12:30:00.000Z'),
          company_name: null,
          location: 'Lille',
          account_headquarters: null,
        },
      ])

      const result = await service.findAllForUser('user-1')

      const selected = repo._qb.select.mock.calls.flatMap((call: unknown[]) => call[0] as string[])
      expect(selected).toContain('account.headquarters AS account_headquarters')
      expect(result.data[0]?.account_headquarters).toBe('29 boulevard Haussmann, 75009 Paris')
      expect(result.data[0]?.location).toBeNull()
      expect(result.data[1]?.account_headquarters).toBeNull()
      expect(result.data[1]?.location).toBe('Lille')
    })

    /**
     * #2297.26 (30/09/2026, recette RÉFUTÉ) — LE RÉSULTAT ET LES CANAUX
     * MANQUANTS DE LA DERNIÈRE TENTATIVE VOYAGENT JUSQU'À LA LISTE.
     *
     * Cette projection ne sélectionnait que `last_enrichment_at` : côté écran,
     * `bulkEnrichmentExclusionReason` → `enrichmentCooldown` exige
     * `last_enrichment_result === 'no_new_data'` pour reconnaître un contact
     * sous délai de protection — recevant toujours `undefined`, la ligne
     * « récemment enrichis » ne pouvait JAMAIS apparaître dans l'aperçu de lot,
     * quel que soit l'état réel (ou seedé en démo) du contact. Comme pour
     * `location` (#2165.38) juste au-dessus : la colonne SÉLECTIONNÉE, et la
     * valeur transmise telle quelle, `null` compris.
     */
    it('#2297.26 — sélectionne `last_enrichment_result`/`last_enrichment_missing` et les rend tels quels', async () => {
      repo._qb.getCount.mockResolvedValueOnce(2)
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          id: 'c6',
          account_id: 'acc-1',
          full_name: 'Sous Cooldown',
          title: null,
          entity: null,
          decision_role: null,
          priority: null,
          email: null,
          phone: null,
          linkedin_url: null,
          why_contact: null,
          user_status: 'new',
          source: null,
          created_at: new Date('2026-07-01T10:00:00.000Z'),
          updated_at: new Date('2026-07-02T12:30:00.000Z'),
          company_name: 'Acme',
          last_enrichment_at: new Date('2026-09-25T10:00:00.000Z'),
          last_enrichment_result: 'no_new_data',
          last_enrichment_missing: ['email', 'phone'],
        },
        {
          id: 'c7',
          account_id: 'acc-1',
          full_name: 'Jamais Tenté',
          title: null,
          entity: null,
          decision_role: null,
          priority: null,
          email: null,
          phone: null,
          linkedin_url: null,
          why_contact: null,
          user_status: 'new',
          source: null,
          created_at: new Date('2026-07-01T10:00:00.000Z'),
          updated_at: new Date('2026-07-02T12:30:00.000Z'),
          company_name: 'Acme',
          last_enrichment_at: null,
          last_enrichment_result: null,
          last_enrichment_missing: null,
        },
      ])

      const result = await service.findAllForUser('user-1')

      const selected = repo._qb.select.mock.calls.flatMap((call: unknown[]) => call[0] as string[])
      expect(selected).toContain('contact.last_enrichment_result AS last_enrichment_result')
      expect(selected).toContain('contact.last_enrichment_missing AS last_enrichment_missing')
      expect(result.data[0]?.last_enrichment_result).toBe('no_new_data')
      expect(result.data[0]?.last_enrichment_missing).toEqual(['email', 'phone'])
      expect(result.data[1]?.last_enrichment_result).toBeNull()
      expect(result.data[1]?.last_enrichment_missing).toBeNull()
    })

    /**
     * #3098 — LA PROCHAINE RELANCE VOYAGE JUSQU'À LA LISTE.
     *
     * La carte du Kanban de prospection (colonnes par `user_status`) a besoin
     * de savoir QUAND relancer sans rejouer tout le moteur de cadence par
     * ligne. Ce test lit deux choses : que la sous-requête est bien
     * SÉLECTIONNÉE (sinon la carte n'aurait jamais la date, quoi qu'en dise le
     * mapping), et qu'une absence de touche planifiée reste `null` — jamais
     * une date inventée.
     */
    it('#3098 — sélectionne la prochaine touche de cadence planifiée (`next_relance_due_date`), `null` compris', async () => {
      repo._qb.getCount.mockResolvedValueOnce(2)
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          id: 'c5',
          account_id: 'acc-1',
          full_name: 'Avec Relance',
          title: null,
          entity: null,
          decision_role: null,
          priority: null,
          email: null,
          phone: null,
          linkedin_url: null,
          why_contact: null,
          user_status: 'contacted',
          source: null,
          created_at: new Date('2026-07-01T10:00:00.000Z'),
          updated_at: new Date('2026-07-02T12:30:00.000Z'),
          company_name: 'Acme',
          next_relance_due_date: new Date('2026-07-05T00:00:00.000Z'),
        },
        {
          id: 'c6',
          account_id: 'acc-1',
          full_name: 'Sans Relance',
          title: null,
          entity: null,
          decision_role: null,
          priority: null,
          email: null,
          phone: null,
          linkedin_url: null,
          why_contact: null,
          user_status: 'new',
          source: null,
          created_at: new Date('2026-07-01T10:00:00.000Z'),
          updated_at: new Date('2026-07-02T12:30:00.000Z'),
          company_name: 'Acme',
          next_relance_due_date: null,
        },
      ])

      const result = await service.findAllForUser('user-1')

      const selected = repo._qb.select.mock.calls.flatMap((call: unknown[]) => call[0] as string[])
      expect(selected.some(column => column.includes('AS next_relance_due_date'))).toBe(true)
      expect(result.data[0]?.next_relance_due_date).toBe('2026-07-05T00:00:00.000Z')
      expect(result.data[1]?.next_relance_due_date).toBeNull()
    })

    /**
     * V4-CORRECTIFS 4290.12 (#4055.8) — « A QUITTÉ L'ENTREPRISE » VOYAGE JUSQU'À LA LISTE.
     *
     * La liste ne porte pas `raw_data` : sans projection, l'écran /contacts ne pouvait pas marquer un contact parti
     * (recette prod 20/10 : 25 lignes, 0 occurrence).
     */
    it('V4-CORRECTIFS 4290.12 — projette la preuve « a quitté » (employeur + date) ; sans preuve, null', async () => {
      repo._qb.getCount.mockResolvedValueOnce(2)
      const base = {
        account_id: 'acc-1',
        title: null,
        entity: null,
        decision_role: null,
        priority: null,
        email: null,
        phone: null,
        linkedin_url: null,
        why_contact: null,
        user_status: 'new',
        source: 'demo',
        created_at: new Date('2026-07-01T10:00:00.000Z'),
        updated_at: new Date('2026-07-02T12:30:00.000Z'),
        company_name: 'SNCF',
      }
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          ...base,
          id: 'gone',
          full_name: 'Parti',
          employment_check: { state: 'left', organization: 'Orange Business', at: '2026-10-11T10:00:00.000Z' },
        },
        { ...base, id: 'here', full_name: 'Resté', employment_check: null },
      ])

      const result = await service.findAllForUser('user-1')

      expect(result.data[0]?.employment_left).toEqual({
        organization: 'Orange Business',
        at: '2026-10-11T10:00:00.000Z',
      })
      expect(result.data[1]?.employment_left).toBeNull()
    })

    /**
     * #3911.1 — HOMONYME D'ENTREPRISE : LE SIGNAL VOYAGE JUSQU'À LA LISTE.
     *
     * `source_tag` se recalcule ici avec le MÊME extrait `apollo_current_org`
     * que la fiche (GA-26), mais cet extrait ne portait que le nom de
     * l'employeur courant — jamais si la recherche qui l'a trouvé avait une
     * ancre EXACTE (id/domaine) ou seulement le nom en texte libre (deux
     * entités homonymes le passent toutes les deux). Sans le second extrait,
     * la liste affichait PUBLIC avec la même confiance qu'un contact
     * réellement ancré.
     */
    it('#3911.1 — sélectionne le signal d’ancre faible et dégrade le badge en HYPOTHÈSE', async () => {
      repo._qb.getCount.mockResolvedValueOnce(2)
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          id: 'c8',
          account_id: 'acc-1',
          full_name: 'Ancre Faible',
          title: null,
          entity: null,
          decision_role: null,
          priority: null,
          email: null,
          phone: null,
          linkedin_url: null,
          why_contact: null,
          user_status: 'new',
          source: 'apollo',
          created_at: new Date('2026-07-01T10:00:00.000Z'),
          updated_at: new Date('2026-07-02T12:30:00.000Z'),
          company_name: 'Acme',
          apollo_current_org: 'Acme',
          employer_unverified: true,
        },
        {
          id: 'c9',
          account_id: 'acc-1',
          full_name: 'Ancre Exacte',
          title: null,
          entity: null,
          decision_role: null,
          priority: null,
          email: null,
          phone: null,
          linkedin_url: null,
          why_contact: null,
          user_status: 'new',
          source: 'apollo',
          created_at: new Date('2026-07-01T10:00:00.000Z'),
          updated_at: new Date('2026-07-02T12:30:00.000Z'),
          company_name: 'Acme',
          apollo_current_org: 'Acme',
          employer_unverified: false,
        },
      ])

      const result = await service.findAllForUser('user-1')

      const selected = repo._qb.select.mock.calls.flatMap((call: unknown[]) => call[0] as string[])
      expect(selected.some(column => column.includes('AS employer_unverified'))).toBe(true)
      expect(result.data[0]?.source_tag).toBe('HYPOTHÈSE')
      expect(result.data[1]?.source_tag).toBe('PUBLIC')
    })

    /**
     * #2733 — LE REBOND VOYAGE JUSQU'À LA LISTE.
     *
     * `email_bounced_at` existait déjà côté contact (posé par le webhook
     * Resend) mais cette projection de liste le jetait — exactement le même
     * défaut que `location` en #2165.38, sur la colonne qui permet à
     * `ContactTableRow` de ne plus dire « envoyé » sur un e-mail qui a rebondi.
     */
    it('#2733 — sélectionne `contact.email_bounced_at` et le rend tel quel, `null` compris', async () => {
      repo._qb.getCount.mockResolvedValueOnce(2)
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          id: 'c5',
          account_id: 'acc-1',
          full_name: 'Rebond Détecté',
          title: null,
          entity: null,
          decision_role: null,
          priority: null,
          email: 'inexistant@exemple-invalide.test',
          phone: null,
          linkedin_url: null,
          why_contact: null,
          user_status: 'contacted',
          source: null,
          created_at: new Date('2026-07-01T10:00:00.000Z'),
          updated_at: new Date('2026-07-02T12:30:00.000Z'),
          company_name: 'Acme',
          email_bounced_at: new Date('2026-09-22T11:00:00.000Z'),
        },
        {
          id: 'c6',
          account_id: 'acc-1',
          full_name: 'Sans Rebond',
          title: null,
          entity: null,
          decision_role: null,
          priority: null,
          email: null,
          phone: null,
          linkedin_url: null,
          why_contact: null,
          user_status: 'new',
          source: null,
          created_at: new Date('2026-07-01T10:00:00.000Z'),
          updated_at: new Date('2026-07-02T12:30:00.000Z'),
          company_name: 'Acme',
          email_bounced_at: null,
        },
      ])

      const result = await service.findAllForUser('user-1')

      const selected = repo._qb.select.mock.calls.flatMap((call: unknown[]) => call[0] as string[])
      expect(selected).toContain('contact.email_bounced_at AS email_bounced_at')
      expect(result.data[0]?.email_bounced_at).toBe('2026-09-22T11:00:00.000Z')
      expect(result.data[1]?.email_bounced_at).toBeNull()
    })

    /**
     * #2158.51 — LA RECHERCHE TEXTE (`q`) PORTE AUSSI SUR LE TÉLÉPHONE.
     *
     * `contact.phone` voyage déjà jusqu'à la liste (`contactSchema`) et est
     * déjà affiché — mais absent du ILIKE, un commercial qui retape un numéro
     * griffonné n'obtenait aucun résultat alors que la fiche existe. Même
     * geste que `full_name`/`title`/`email`/`company_name` : un OR de plus
     * dans la MÊME clause, pas une seconde requête.
     */
    it('#2158.51 — la recherche `q` ajoute un ILIKE sur `contact.phone`', async () => {
      await service.findAllForUser('user-1', { q: '0612345678' })
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('contact.phone ILIKE'))
      expect(hit).toBeDefined()
      expect(hit?.[1]).toMatchObject({ q: '%0612345678%', qWorkspaceId: 'ws-1' })
    })

    /**
     * #2158.54 — LA RECHERCHE TEXTE (`q`) PORTE AUSSI SUR LA CIBLE.
     *
     * Même jointure que le filtre `targetListId` (#2158.68), reposée dans le
     * même OR que `full_name`/`title`/`email`/`phone`/`company_name` — la
     * jointure que le message de l'épopée #2997 cite comme absente.
     */
    it('#2158.54 — la recherche `q` ajoute un EXISTS sur `target_lists.name`', async () => {
      await service.findAllForUser('user-1', { q: 'grands comptes' })
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('tl.name ILIKE'))
      expect(hit).toBeDefined()
      expect(hit?.[0]).toContain('tli.removed_at IS NULL')
      expect(hit?.[1]).toMatchObject({ q: '%grands comptes%', qWorkspaceId: 'ws-1' })
    })

    /**
     * #2158.55 — LA RECHERCHE TEXTE (`q`) PORTE AUSSI SUR LE NOM DU PORTEUR.
     *
     * `assignedTo` (#2158.65) filtre déjà par IDENTIFIANT exact ; rien ne
     * permettait de retrouver un contact en tapant le NOM de son porteur dans
     * la recherche libre. Même OR que `full_name`/`title`/…, une jointure de
     * plus sur `profiles` (`contacts.assigned_to = profiles.user_id`).
     */
    it('#2158.55 — la recherche `q` ajoute un EXISTS sur le nom du porteur (`profiles`)', async () => {
      await service.findAllForUser('user-1', { q: 'Camille Roussel' })
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('profiles'))
      expect(hit).toBeDefined()
      expect(hit?.[0]).toContain('contact.assigned_to')
      expect(hit?.[1]).toMatchObject({ q: '%Camille Roussel%', qWorkspaceId: 'ws-1' })
    })

    // #3489 — le nom se cherche par mots, sans accent ni ordre.
    /**
     * #3278 (recette prod 14/10) — `/contacts?q=` dépassait 30 s. La clause `q` portait deux EXISTS
     * CORRÉLÉS à la ligne (cible, porteur) : au sein d'un OR, Postgres les rejoue pour CHAQUE contact lu, et
     * la même clause part dans cinq requêtes de la 1re page (total, page, trois agrégats). Ils deviennent
     * des sous-requêtes NON corrélées (`IN (SELECT …)`), évaluées une fois par requête.
     */
    it('#3278 — la clause `q` ne porte aucune sous-requête corrélée à la ligne du contact', async () => {
      await service.findAllForUser('user-1', { q: 'grands comptes' })
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('tl.name ILIKE'))
      expect(hit).toBeDefined()
      expect(hit?.[0]).not.toMatch(/=\s*contact\./)
      expect(hit?.[0]).not.toContain('EXISTS')
      expect(hit?.[0]).toContain('contact.assigned_to IN')
      expect(hit?.[0]).toContain('contact.id = ANY')
    })

    it('#3278 — une recherche `q` exécute au plus une page et un total sur la requête principale', async () => {
      await service.findAllForUser('user-1', { q: 'thales', offset: 25 })
      expect(repo._qb.getRawMany).toHaveBeenCalledTimes(1)
      expect(repo._qb.getCount).toHaveBeenCalledTimes(1)
    })

    it('#3489 — la recherche `q` « Soussin Armelle » ajoute un ET par mot sur le nom plié', async () => {
      await service.findAllForUser('user-1', { q: 'Soussin Armelle' })
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes(':qn0'))
      expect(hit).toBeDefined()
      expect(hit?.[0]).toContain('translate(lower(contact.full_name)')
      expect(hit?.[1]).toMatchObject({ qn0: '%soussin%', qn1: '%armelle%' })
    })

    // #4386.2 — « theo haddad bellum » : prénom + nom + entreprise, chaque mot dans le nom OU l'entreprise,
    // sur la requête DÉJÀ bornée à l'espace (le scope s'applique avant la clause `q`).
    it('#4386.2 — la recherche `q` « Haddad Théo BELLUM SAS » cherche chaque mot dans le nom OU l’entreprise', async () => {
      await service.findAllForUser('user-1', { q: 'Haddad Théo BELLUM SAS' })
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes(':qx0'))
      expect(hit).toBeDefined()
      expect(hit?.[0]).toContain('translate(lower(account.company_name)')
      expect(hit?.[1]).toMatchObject({ qx0: '%haddad%', qx1: '%theo%', qx2: '%bellum%' })
      expect(hit?.[1]).not.toHaveProperty('qx3')
    })

    // #3710.6 — « directeur d'information » ne retrouvait que les titres à apostrophe droite et
    // phrase exacte ; la fiche « Directeur des systèmes d’information groupe » (SG) restait à 0.
    // Le TITRE se cherche donc aussi par mots plié (accents + apostrophes), comme le nom.
    it("#3710.6 — la recherche `q` ajoute un ET par mot sur le titre plié (apostrophes ’ et ')", async () => {
      await service.findAllForUser('user-1', { q: "directeur d'information" })
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes(':qt0'))
      expect(hit).toBeDefined()
      expect(hit?.[0]).toContain('translate(lower(contact.title)')
      expect(hit?.[1]).toMatchObject({ qt0: '%directeur%', qt1: "%d'information%" })
    })

    // #4057 / #4058 (recette R15, 15/10) — « interlocuteurs cyber GRC de EDF » : `q` « cyber GRC »
    // exigeait les DEUX mots dans le titre ; un RSSI / CISO déjà en base restait introuvable. Une
    // expertise reconnue ajoute les intitulés de son catalogue (même source que la découverte).
    it('#4057 — une expertise reconnue dans `q` ajoute les intitulés du catalogue (RSSI, CISO…)', async () => {
      await service.findAllForUser('user-1', { q: 'cyber GRC', company: 'EDF' })
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes(':qe0'))
      expect(hit).toBeDefined()
      expect(Object.values(hit?.[1] ?? {}).some(value => value === '%rssi%')).toBe(true)
    })

    it('#4057 — un texte qui n’est pas une expertise ne change pas la clause', async () => {
      await service.findAllForUser('user-1', { q: 'thales' })
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      expect(calls.some(([clause]) => typeof clause === 'string' && clause.includes(':qe0'))).toBe(false)
    })

    /**
     * #2158.61 — LE FILTRE « LOCALISATION » DE LA LISTE DE CONTACTS ELLE-MÊME.
     *
     * `contact.location` voyageait déjà jusqu'à la liste (#2165.38, pour le
     * filtre de Découvrir) mais restait un simple AFFICHAGE sur `/contacts` :
     * rien ne permettait de RESTREINDRE la liste à une ville. Même geste que
     * `company` (ILIKE, insensible à la casse et aux extraits) : la ville et
     * le pays sont les deux seules exceptions nommées à l'interdit des
     * critères protégés (doctrine c58) — jamais une adresse personnelle.
     */
    it('#2158.61 — filtre `location` ajoute un ILIKE sur `contact.location`', async () => {
      await service.findAllForUser('user-1', { location: 'Lyon' })
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('contact.location ILIKE'))
      expect(hit).toBeDefined()
      expect(hit?.[1]).toEqual({ location: '%Lyon%' })
    })

    it('#2158.61 — sans filtre `location`, aucun `andWhere` sur `contact.location`', async () => {
      await service.findAllForUser('user-1', {})
      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: string) => sql.includes('contact.location ILIKE'))).toBe(false)
    })

    /**
     * #2158.57 — LE FILTRE « ENTITÉ » DE LA LISTE DE CONTACTS.
     *
     * `contact.entity` voyage déjà jusqu'à la liste (colonne « Entité ») mais
     * restait un simple AFFICHAGE : rien ne permettait de RESTREINDRE la
     * liste à une entité précise. Même geste que `location`/`company` : ILIKE.
     */
    it('#2158.57 — filtre `entity` ajoute un ILIKE sur `contact.entity`', async () => {
      await service.findAllForUser('user-1', { entity: 'DSI' } as never)
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('contact.entity ILIKE'))
      expect(hit).toBeDefined()
      expect(hit?.[1]).toEqual({ entity: '%DSI%' })
    })

    it('#2158.57 — sans filtre `entity`, aucun `andWhere` sur `contact.entity`', async () => {
      await service.findAllForUser('user-1', {})
      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: string) => sql.includes('contact.entity ILIKE'))).toBe(false)
    })

    /**
     * #2158.58 — LE FILTRE « FONCTION » DE LA LISTE DE CONTACTS.
     *
     * `contact.title` alimente déjà la recherche libre `q`, mais rien ne
     * permettait de le filtrer SEUL — chercher « DSI » via `q` remonte aussi
     * toute société/email/téléphone contenant la chaîne.
     */
    it('#2158.58 — filtre `title` ajoute un ILIKE sur `contact.title`', async () => {
      await service.findAllForUser('user-1', { title: 'DSI' } as never)
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('contact.title ILIKE'))
      expect(hit).toBeDefined()
      expect(hit?.[1]).toEqual({ title: '%DSI%' })
    })

    it('#2158.58 — sans filtre `title`, aucun `andWhere` sur `contact.title`', async () => {
      await service.findAllForUser('user-1', {})
      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: string) => sql.includes('contact.title ILIKE'))).toBe(false)
    })

    /**
     * #2294.2 — LE SECTEUR DU COMPTE. Même geste que `location`/`company` :
     * `account` est DÉJÀ joint (pour `company_name`), donc un ILIKE sur
     * `account.sector` n'ajoute aucune jointure — juste un `andWhere` de plus.
     */
    it('#2294.2 — filtre `sector` ajoute un ILIKE sur `account.sector`', async () => {
      await service.findAllForUser('user-1', { sector: 'SSII' })
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('account.sector ILIKE'))
      expect(hit).toBeDefined()
      expect(hit?.[1]).toEqual({ sector: '%SSII%' })
    })

    it('#2294.2 — sans filtre `sector`, aucun `andWhere` sur `account.sector`', async () => {
      await service.findAllForUser('user-1', {})
      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: string) => sql.includes('account.sector ILIKE'))).toBe(false)
    })

    /**
     * #2294.2 — GROUPE OU FILIALE. Égalité exacte (`accounts.group_role`,
     * même vocabulaire que `DiscoverAccountRow.groupRole`) — jamais un ILIKE,
     * ce sont deux valeurs fermées.
     */
    it('#2294.2 — filtre `groupRole` ajoute une égalité sur `account.group_role`', async () => {
      await service.findAllForUser('user-1', { groupRole: 'filiale' })
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('account.group_role ='))
      expect(hit).toBeDefined()
      expect(hit?.[1]).toEqual({ groupRole: 'filiale' })
    })

    /**
     * #2294.2 — FRAÎCHEUR MIN. `accounts.contacts_collected_at` — un compte
     * jamais collecté (`NULL`) ne correspond à AUCUNE fraîcheur : il n'est
     * pas datable, donc jamais compté comme frais (même prudence que
     * `dormantMonths`, qui exige explicitement une activité datée).
     */
    it('#2294.2 — filtre `contactsFreshWithinMonths` restreint sur `account.contacts_collected_at`', async () => {
      await service.findAllForUser('user-1', { contactsFreshWithinMonths: 6 })
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(
        ([clause]) => typeof clause === 'string' && clause.includes('account.contacts_collected_at'),
      )
      expect(hit).toBeDefined()
      expect(hit?.[1]).toEqual({ contactsFreshWithinMonths: 6 })
    })

    it('#2294.2 — sans filtre `contactsFreshWithinMonths`, aucun `andWhere` sur `contacts_collected_at`', async () => {
      await service.findAllForUser('user-1', {})
      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: string) => sql.includes('account.contacts_collected_at'))).toBe(false)
    })

    /**
     * #2158.65 — LE FILTRE « OWNER » DE LA LISTE DE CONTACTS.
     *
     * `contact.assigned_to` est déjà LU (projection de liste) et ÉCRIT (l'action
     * de lot « Assigner »), mais rien ne permettait de RESTREINDRE la liste à
     * un porteur précis. Correspondance EXACTE (`=`), jamais un ILIKE : c'est
     * un identifiant de membre, pas un texte cherché.
     */
    it('#2158.65 — filtre `assignedTo` ajoute une égalité sur `contact.assigned_to`', async () => {
      await service.findAllForUser('user-1', { assignedTo: 'member-1' } as never)
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('contact.assigned_to ='))
      expect(hit).toBeDefined()
      expect(hit?.[1]).toEqual({ assignedTo: 'member-1' })
    })

    it('#2158.65 — sans filtre `assignedTo`, aucun `andWhere` sur `contact.assigned_to`', async () => {
      await service.findAllForUser('user-1', {})
      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: string) => sql.includes('contact.assigned_to ='))).toBe(false)
    })

    /**
     * #2158.67 — LE FILTRE « FRAÎCHEUR » DE LA LISTE DE CONTACTS.
     *
     * Distinct de `dormantMonths` (dernier ÉCHANGE, `activities`) et de
     * `contactsFreshWithinMonths` (collecte du COMPTE) : ici, la dernière
     * fois que LA FICHE elle-même a été mise à jour (`contact.updated_at`).
     */
    it('#2158.67 — filtre `updatedWithinMonths` restreint sur `contact.updated_at`', async () => {
      await service.findAllForUser('user-1', { updatedWithinMonths: 3 })
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('contact.updated_at >='))
      expect(hit).toBeDefined()
      expect(hit?.[1]).toEqual({ updatedWithinMonths: 3 })
    })

    it('#2158.67 — sans filtre `updatedWithinMonths`, aucun `andWhere` sur `contact.updated_at`', async () => {
      await service.findAllForUser('user-1', {})
      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: string) => sql.includes('contact.updated_at >='))).toBe(false)
    })

    /**
     * #2158.68 — LE FILTRE « CIBLE » DE LA LISTE DE CONTACTS.
     *
     * La jointure que le message de l'épopée #2997 cite comme absente :
     * `target_list_items.contact_id`. `workspace_id` reposé ICI, même
     * prudence que partout ailleurs — jamais une confiance transitoire.
     */
    it('#2158.68 — filtre `targetListId` ajoute un EXISTS sur `target_list_items`', async () => {
      await service.findAllForUser('user-1', { targetListId: 'list-1' } as never)
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('target_list_items'))
      expect(hit).toBeDefined()
      expect(hit?.[0]).toContain('tli.removed_at IS NULL')
      expect(hit?.[1]).toEqual({ targetListId: 'list-1', targetListWorkspaceId: 'ws-1' })
    })

    it('#2158.68 — sans filtre `targetListId`, aucun `andWhere` sur `target_list_items`', async () => {
      await service.findAllForUser('user-1', {})
      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: string) => sql.includes('target_list_items'))).toBe(false)
    })

    /**
     * #2158.60 — LE FILTRE « FAMILLE MÉTIER » DE LA LISTE DE CONTACTS.
     *
     * `contact.family` existe en base (migration `1782000000000`) et est
     * peuplé par le classifieur d'import, mais rien ne permettait de
     * RESTREINDRE la liste à une famille précise. Même geste que `role` :
     * égalité EXACTE, taxonomie fermée, `'all'` = pas de filtre.
     */
    it('#2158.60 — filtre `family` ajoute une égalité sur `contact.family`', async () => {
      await service.findAllForUser('user-1', { family: 'IT' })
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('contact.family ='))
      expect(hit).toBeDefined()
      expect(hit?.[1]).toEqual({ family: 'IT' })
    })

    it("#2158.60 — filtre `family` à 'all' n'ajoute aucun `andWhere` sur `contact.family`", async () => {
      await service.findAllForUser('user-1', { family: 'all' })
      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: string) => sql.includes('contact.family ='))).toBe(false)
    })

    it('#2158.60 — sans filtre `family`, aucun `andWhere` sur `contact.family`', async () => {
      await service.findAllForUser('user-1', {})
      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: string) => sql.includes('contact.family ='))).toBe(false)
    })

    /**
     * #2158.66 — LE FILTRE « SOURCE » DE LA LISTE DE CONTACTS.
     *
     * `c.source AS source` voyage déjà jusqu'à la liste (colonne « Source »,
     * affichée via `contactSourceLabel` — jamais le nom brut du fournisseur,
     * doctrine « nos fournisseurs ne se nomment jamais ») mais rien ne
     * permettait de RESTREINDRE la liste à une source précise. Même geste
     * que `family`/`role` : égalité EXACTE, taxonomie fermée
     * (`contactSourceSchema`), `'all'` = pas de filtre.
     */
    it('#2158.66 — filtre `source` ajoute une égalité sur `contact.source`', async () => {
      await service.findAllForUser('user-1', { source: 'apollo' } as never)
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('contact.source ='))
      expect(hit).toBeDefined()
      expect(hit?.[1]).toEqual({ source: 'apollo' })
    })

    it("#2158.66 — filtre `source` à 'all' n'ajoute aucun `andWhere` sur `contact.source`", async () => {
      await service.findAllForUser('user-1', { source: 'all' } as never)
      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: string) => sql.includes('contact.source ='))).toBe(false)
    })

    it('#2158.66 — sans filtre `source`, aucun `andWhere` sur `contact.source`', async () => {
      await service.findAllForUser('user-1', {})
      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: string) => sql.includes('contact.source ='))).toBe(false)
    })

    /**
     * #2158.14 (#2997) / #2159.61 — LA VUE « SANS PROCHAINE ACTION », POSÉE
     * EN FILTRE — dérivée de la VRAIE prochaine action planifiée (cadence OU
     * manuelle), pas du seul champ de cadence : un rappel posé à la main
     * (`schedule_reminder_for_contact`) écrit `action_plan_items` avec
     * `cadence_step: null`, invisible à l'ancien sous-select — la fiche
     * comptait « sans prochaine action » alors qu'un humain en avait posé une.
     */
    it('#2159.61 — filtre `withoutNextAction` : toute touche OUVERTE compte, cadence ou manuelle', async () => {
      await service.findAllForUser('user-1', { withoutNextAction: true } as never)
      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      const hit = calls.find(
        (sql: string) => typeof sql === 'string' && sql.includes('action_plan_items') && sql.includes('IS NULL'),
      )
      expect(hit).toBeDefined()
      expect(hit).toContain('api.done = false')
      // Le défaut #2159.61 : le filtre ne se restreint PLUS aux seules
      // touches de cadence — un rappel manuel (`cadence_step` NULL) compte
      // désormais comme une prochaine action.
      expect(hit).not.toContain('cadence_step')
    })

    it('#2159.61 — distinct de `next_relance_due_date` (carte Kanban), qui reste réservé à la cadence', async () => {
      // La colonne AFFICHÉE sur la carte Kanban répond à une question
      // différente (« quand la prochaine RELANCE ») et garde son filtre de
      // cadence — seul le FILTRE de liste change de dérivation.
      await service.findAllForUser('user-1', {})
      const columns = repo._qb.select.mock.calls.flatMap((c: unknown[]) => c[0] as string[])
      const column = columns.find(sql => sql.includes('AS next_relance_due_date'))
      expect(column).toContain('api.cadence_step IS NOT NULL')
    })

    it('#2158.14 — sans filtre `withoutNextAction`, aucun `andWhere` sur `action_plan_items`', async () => {
      await service.findAllForUser('user-1', {})
      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: string) => sql.includes('action_plan_items'))).toBe(false)
    })

    /**
     * #2158.69 (#2997) — LE FILTRE « DERNIÈRE ACTION » (type), DISTINCT DE
     * `dormantMonths` (l'ancienneté). Borné sur le MAX(`occurred_at`) PARMI
     * les seuls échanges (`INTERACTION_ACTIVITY_KINDS` — jamais une note ou
     * un changement d'étape), même périmètre que le réseau dormant.
     */
    it('#2158.69 — filtre `lastActivityKind` restreint à `activities.kind` sur la dernière ligne d’échange', async () => {
      await service.findAllForUser('user-1', { lastActivityKind: 'call' } as never)
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(
        ([clause]) => typeof clause === 'string' && clause.includes('act.kind = :lastActivityKind'),
      )
      expect(hit).toBeDefined()
      expect(hit?.[0]).toContain('MAX(act2.occurred_at)')
      expect(hit?.[1]).toEqual({ lastActivityKind: 'call' })
    })

    it('#2158.69 — sans filtre `lastActivityKind`, aucun `andWhere` sur `act.kind`', async () => {
      await service.findAllForUser('user-1', {})
      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: string) => sql.includes('act.kind ='))).toBe(false)
    })

    /**
     * #1903.15 — LE BON COMPTE, QUAND LAURA OUVRE `/contacts` DEPUIS LE CHAT.
     *
     * `company` (ILIKE) reste le filtre saisi À LA MAIN dans le FilterBar —
     * il ne bouge pas. Mais un lien profond posé par Laura connaît déjà
     * l'identifiant du compte discuté : une égalité EXACTE sur
     * `contact.account_id`, jamais un ILIKE sur un nom qui peut se
     * dupliquer entre deux comptes homonymes.
     */
    it('#1903.15 — filtre `accountId` ajoute une égalité sur `contact.account_id`', async () => {
      await service.findAllForUser('user-1', { accountId: 'acc-1' } as never)
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('contact.account_id ='))
      expect(hit).toBeDefined()
      expect(hit?.[1]).toEqual({ accountId: 'acc-1' })
    })

    it('#1903.15 — sans filtre `accountId`, aucun `andWhere` sur `contact.account_id =`', async () => {
      await service.findAllForUser('user-1', {})
      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: string) => sql.includes('contact.account_id ='))).toBe(false)
    })

    /**
     * #1800 — TDD, sens « no network call / no dead filter » : `favorite`
     * n'existe plus au contrat (`ContactListQuery`). Même transmis quand même
     * par un appelant qui n'aurait pas lu ce lot, il ne produit plus AUCUN
     * `andWhere` sur `favorite` — la jointure elle-même a disparu.
     */
    it("#1800 — n'ajoute plus aucun `andWhere` sur `favorite`, même si le filtre est passé", async () => {
      await service.findAllForUser('user-1', { favorite: true } as never)
      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: string) => sql.includes('favorite'))).toBe(false)
    })

    /**
     * #2167.51 — la recette E2E demande « cinq contacts avec email ET
     * téléphone » ; le filtre de canal n'avait que with_email/with_linkedin/
     * with_both/missing_details, aucune variante téléphone. `contact.phone`
     * porte déjà `missingContactDetailsSql` (email OU téléphone) — ce filtre
     * en est le pendant positif, un canal DIRECT à part (comme with_email),
     * pas une combinaison.
     */
    it('#2167.51 — filtre `with_phone` ajoute `contact.phone IS NOT NULL`', async () => {
      await service.findAllForUser('user-1', { channel: 'with_phone' } as never)
      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: string) => sql.includes('contact.phone IS NOT NULL'))).toBe(true)
    })
  })

  /**
   * #2799 (épopée) / #2374.16-17 — le CONTEXTE des sept axes du score de
   * réactivation dormante que `findAllForUser` ne porte pas déjà : signaux,
   * score/porteur du COMPTE, historique d'activité TOUTE PÉRIODE (compte +
   * dernier sujet). Une requête, en SQL brut (`manager.query`), comme
   * `cancelOutreachSequences` un peu plus haut dans ce fichier.
   */
  describe('dormantReactivationSignals (#2799)', () => {
    it('rend une Map vide sans identifiant, sans toucher la base', async () => {
      const out = await service.dormantReactivationSignals([], 'user-1')
      expect(out.size).toBe(0)
      expect(repo.manager.query).not.toHaveBeenCalled()
    })

    it('convertit chaque ligne brute en contexte typé, indexé par contact', async () => {
      const oneMonthAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
      repo.manager.query.mockResolvedValueOnce([
        {
          id: 'c-1',
          signals: [{ label: 'A changé de poste' }],
          account_priority_score: 18,
          account_assigned_to: 'member-1',
          activity_count: '4',
          last_activity_subject: 'Renouvellement infogérance',
          last_activity_at: oneMonthAgo,
        },
      ])
      const out = await service.dormantReactivationSignals(['c-1'], 'user-1')
      const ctx = out.get('c-1')
      expect(ctx).toBeDefined()
      expect(ctx?.signals).toEqual([{ label: 'A changé de poste' }])
      expect(ctx?.accountPriorityScore).toBe(18)
      expect(ctx?.accountAssignedTo).toBe('member-1')
      expect(ctx?.pastActivityCount).toBe(4)
      expect(ctx?.lastActivitySubject).toBe('Renouvellement infogérance')
      expect(ctx?.monthsSinceLastActivity).toBe(1)
    })

    it("un contact JAMAIS contacté (aucune ligne d'activité) rend des champs `null`, jamais 0 deviné", async () => {
      repo.manager.query.mockResolvedValueOnce([
        {
          id: 'c-2',
          signals: null,
          account_priority_score: null,
          account_assigned_to: null,
          activity_count: '0',
          last_activity_subject: null,
          last_activity_at: null,
        },
      ])
      const out = await service.dormantReactivationSignals(['c-2'], 'user-1')
      const ctx = out.get('c-2')
      expect(ctx?.signals).toBeNull()
      expect(ctx?.accountPriorityScore).toBeNull()
      expect(ctx?.accountAssignedTo).toBeNull()
      expect(ctx?.pastActivityCount).toBe(0)
      expect(ctx?.lastActivitySubject).toBeNull()
      expect(ctx?.monthsSinceLastActivity).toBeNull()
    })

    it('scope la requête au contact ET au workspace (défense en profondeur)', async () => {
      await service.dormantReactivationSignals(['c-1', 'c-2'], 'workspace-9')
      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('contact.workspace_id')
      expect(params).toEqual([['c-1', 'c-2'], 'workspace-9'])
    })
  })

  /**
   * #2834 (#2106.24) — LE FILTRE « CONTACTS AYANT CHANGÉ » DE LA LISTE.
   *
   * `source_tag` (`contactSourceTag`) se calcule ligne par ligne, jamais en
   * SQL : ces tests prouvent que le filtre appelle la MÊME fonction — pas une
   * réécriture de sa règle de correspondance — sur les candidats sous les
   * filtres courants, puis referme la requête sur les identifiants retenus.
   */
  describe('#2834 (#2106.24) — filtre `sourceTag=RISQUE`', () => {
    it('ne retient que les candidats dont `contactSourceTag` vaut RISQUE', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([
        // Employeur détecté différent du compte ET de l'entité → RISQUE.
        { id: 'risque-1', source: 'apollo', entity: null, company_name: 'Acme', apollo_current_org: 'Autre SA' },
        // Employeur détecté = le compte → toujours en poste, pas RISQUE.
        { id: 'reste-1', source: 'apollo', entity: null, company_name: 'Acme', apollo_current_org: 'Acme' },
      ])

      await service.findAllForUser('user-1', { sourceTag: 'RISQUE' } as never)

      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('contact.id IN'))
      expect(hit?.[1]).toEqual({ sourceTagIds: ['risque-1'] })
    })

    it('aucun candidat en RISQUE → `1 = 0`, jamais un `IN` vide (SQL invalide)', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([
        { id: 'reste-1', source: 'apollo', entity: null, company_name: 'Acme', apollo_current_org: 'Acme' },
      ])

      await service.findAllForUser('user-1', { sourceTag: 'RISQUE' } as never)

      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls).toContain('1 = 0')
      expect(calls.some((sql: string) => typeof sql === 'string' && sql.includes('contact.id IN'))).toBe(false)
    })

    it('sans `sourceTag`, aucun prédicat `contact.id IN` ni `1 = 0`', async () => {
      await service.findAllForUser('user-1', {})

      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: string) => typeof sql === 'string' && sql.includes('contact.id IN'))).toBe(false)
      expect(calls).not.toContain('1 = 0')
    })

    it('`countForUser` applique le MÊME filtre — jamais compté que RISQUE diverge de la liste', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([
        { id: 'risque-1', source: 'apollo', entity: null, company_name: 'Acme', apollo_current_org: 'Autre SA' },
      ])
      repo._qb.getCount.mockResolvedValueOnce(1)

      const total = await service.countForUser('user-1', { sourceTag: 'RISQUE' } as never)

      expect(total).toBe(1)
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('contact.id IN'))
      expect(hit?.[1]).toEqual({ sourceTagIds: ['risque-1'] })
    })
  })

  /**
   * #2158.59 (épopée #2997) — LE FILTRE « NIVEAU », même patron que
   * `sourceTag` juste au-dessus : la classification reste la MÊME fonction
   * PURE (`computeHierarchyLevel`), jamais réécrite en SQL.
   */
  describe('#2158.59 (épopée #2997) — filtre `hierarchyLevel`', () => {
    it('ne retient que les candidats dont `computeHierarchyLevel(title)` correspond', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([
        { id: 'mgr-1', title: 'Responsable transformation' }, // management
        { id: 'dsi-1', title: 'DSI' }, // direction
      ])

      await service.findAllForUser('user-1', { hierarchyLevel: 'management' } as never)

      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('contact.id IN'))
      expect(hit?.[1]).toEqual({ hierarchyLevelIds: ['mgr-1'] })
    })

    it('aucun candidat au niveau demandé → `1 = 0`, jamais un `IN` vide (SQL invalide)', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([{ id: 'dsi-1', title: 'DSI' }])

      await service.findAllForUser('user-1', { hierarchyLevel: 'management' } as never)

      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls).toContain('1 = 0')
      expect(calls.some((sql: string) => typeof sql === 'string' && sql.includes('contact.id IN'))).toBe(false)
    })

    it("filtre `hierarchyLevel` à 'all' n'ajoute aucun `andWhere` sur `contact.id IN`", async () => {
      await service.findAllForUser('user-1', { hierarchyLevel: 'all' } as never)
      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: string) => typeof sql === 'string' && sql.includes('contact.id IN'))).toBe(false)
    })

    it('sans `hierarchyLevel`, aucun prédicat `contact.id IN` ni `1 = 0`', async () => {
      await service.findAllForUser('user-1', {})
      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: string) => typeof sql === 'string' && sql.includes('contact.id IN'))).toBe(false)
      expect(calls).not.toContain('1 = 0')
    })

    it('`countForUser` applique le MÊME filtre — jamais compté que le niveau diverge de la liste', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([{ id: 'mgr-1', title: 'Responsable transformation' }])
      repo._qb.getCount.mockResolvedValueOnce(1)

      const total = await service.countForUser('user-1', { hierarchyLevel: 'management' } as never)

      expect(total).toBe(1)
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('contact.id IN'))
      expect(hit?.[1]).toEqual({ hierarchyLevelIds: ['mgr-1'] })
    })
  })

  /**
   * #3942.2 — recette prod 09/10 (#3942, PARTIEL) : LA PORTÉE « RECOMMANDÉS »
   * FILTRE CÔTÉ SERVEUR, AVANT PAGINATION.
   *
   * Avant ce lot, `useRecommendedContactIds` (web) ne classait que les
   * comptes représentés sur la page DÉJÀ chargée : sur un compte de 200
   * contacts dont seulement 3 recommandés, rien ne garantissait qu'ils
   * tombent dans les 25 premiers — ils pouvaient être en page 4, et la page
   * 1 annonçait « aucun recommandé ». Même patron que `sourceTag`/
   * `hierarchyLevel` juste au-dessus : les candidats sous les AUTRES filtres
   * sont relus, le classement PAR COMPTE (même noyau que `topAccessPaths`/
   * `rankForAccount`, GA-26) retient son chemin recommandé, et la requête se
   * referme sur ces identifiants AVANT `OFFSET`/`LIMIT` — c'est cette clause
   * SQL qui garantit la page 1, jamais une page après coup.
   */
  describe('#3942.2 — portée `recommendedScope=recommended`', () => {
    const eligibleBase = {
      title: 'DSI',
      entity: null,
      decision_role: 'economic',
      email_verified: true,
      phone: null,
      linkedin_url: null,
      source: 'apollo',
      user_status: 'new',
      email_sent_at: null,
      last_enrichment_at: null,
      priority: 2,
      hidden: false,
      excluded_at: null,
      lifecycle_state: null,
      account_id: 'acc-1',
    }

    /** Un compte de 200 contacts : 197 masqués (jamais éligibles), 3 recommandés. */
    function seedAccountOf200() {
      const noise = Array.from({ length: 197 }, (_, i) => ({
        ...eligibleBase,
        id: `noise-${i}`,
        full_name: `Contact Bruit ${i}`,
        email: null,
        hidden: true,
      }))
      const recommended = ['rec-1', 'rec-2', 'rec-3'].map(id => ({
        ...eligibleBase,
        id,
        full_name: `Décideur ${id}`,
        email: `${id}@acme.fr`,
      }))
      const all = [...noise, ...recommended]
      repo._qb.getRawMany.mockResolvedValueOnce(all.map(row => ({ id: row.id, account_id: row.account_id })))
      repo.find.mockResolvedValueOnce(all as unknown as ContactEntity[])
      accounts.find.mockResolvedValueOnce([{ id: 'acc-1', raw_analysis: null }] as never)
      return { recommendedIds: recommended.map(row => row.id) }
    }

    it('sur 200 contacts d’un compte, ne retient que les 3 du chemin recommandé', async () => {
      const { recommendedIds } = seedAccountOf200()

      await service.findAllForUser('user-1', { recommendedScope: 'recommended' } as never)

      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('contact.id IN'))
      expect(hit?.[1]).toEqual({ recommendedScopeIds: recommendedIds })
    })

    it("un offset tardif (page 4) n'y change rien : la portée reste le MÊME chemin recommandé, posé AVANT pagination", async () => {
      const { recommendedIds } = seedAccountOf200()

      await service.findAllForUser('user-1', { recommendedScope: 'recommended', offset: 75, limit: 25 } as never)

      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('contact.id IN'))
      expect(hit?.[1]).toEqual({ recommendedScopeIds: recommendedIds })
    })

    it('un compte entièrement hors éligibilité (tout masqué) → `1 = 0`, jamais un `IN` vide (SQL invalide)', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([{ id: 'c-1', account_id: 'acc-1' }])
      repo.find.mockResolvedValueOnce([
        { ...eligibleBase, id: 'c-1', full_name: 'Masqué', hidden: true },
      ] as unknown as ContactEntity[])
      accounts.find.mockResolvedValueOnce([{ id: 'acc-1', raw_analysis: null }] as never)

      await service.findAllForUser('user-1', { recommendedScope: 'recommended' } as never)

      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls).toContain('1 = 0')
    })

    it('un contact sans compte (file « à qualifier ») n’est jamais recommandé — aucune lecture compte en plus', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([{ id: 'c-1', account_id: null }])

      await service.findAllForUser('user-1', { recommendedScope: 'recommended' } as never)

      expect(repo.find).not.toHaveBeenCalled()
      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls).toContain('1 = 0')
    })

    it("`recommendedScope: 'all'` ou absent n'ajoute aucun prédicat — comportement HISTORIQUE inchangé", async () => {
      await service.findAllForUser('user-1', { recommendedScope: 'all' } as never)
      let calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: unknown) => typeof sql === 'string' && sql.includes('contact.id IN'))).toBe(false)
      expect(calls).not.toContain('1 = 0')
      expect(repo.find).not.toHaveBeenCalled()

      await service.findAllForUser('user-1', {})
      calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: unknown) => typeof sql === 'string' && sql.includes('contact.id IN'))).toBe(false)
    })

    // #3871 — recette prod 10/10 : /contacts?state=historique affichait « Historique 1 »
    // (tally SANS la portée) mais « Aucun contact ne correspond » (liste restreinte au
    // chemin recommandé, qui n'a jamais un contact parti). Un état de SORTIE choisi
    // explicitement gagne sur la portée.
    it('#3871 : un état de sortie (historique/rejete) choisi lève la portée « Recommandés » — compteur = lignes', async () => {
      for (const state of ['historique', 'rejete']) {
        repo._qb.andWhere.mockClear()
        await service.findAllForUser('user-1', { recommendedScope: 'recommended', state } as never)
        const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
        expect(calls.some((sql: unknown) => typeof sql === 'string' && sql.includes('contact.id IN'))).toBe(false)
        expect(calls).not.toContain('1 = 0')
        expect(repo.find).not.toHaveBeenCalled()
      }
    })

    it('#3871 : `countForUser` lève la portée de la même façon (GA-26)', async () => {
      repo._qb.andWhere.mockClear()
      await service.countForUser('user-1', { recommendedScope: 'recommended', state: 'historique' } as never)
      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: unknown) => typeof sql === 'string' && sql.includes('contact.id IN'))).toBe(false)
    })

    it('#3718 : une recherche nommée (`q`) ou le filtre statut « Répondu » lèvent la portée — Nadia Perrin reste atteignable', async () => {
      for (const extra of [{ q: 'Perrin' }, { userStatus: 'replied' }]) {
        repo._qb.andWhere.mockClear()
        await service.findAllForUser('user-1', { recommendedScope: 'recommended', ...extra } as never)
        const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
        expect(calls.some((sql: unknown) => typeof sql === 'string' && sql.includes('contact.id IN'))).toBe(false)
        expect(calls).not.toContain('1 = 0')
      }
    })

    it('#3718 : `userStatus` filtre sur `contact.user_status` (égalité exacte)', async () => {
      repo._qb.andWhere.mockClear()
      await service.findAllForUser('user-1', { userStatus: 'replied' } as never)
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => clause === 'contact.user_status = :userStatusFilter')
      expect(hit?.[1]).toEqual({ userStatusFilter: 'replied' })
      repo._qb.andWhere.mockClear()
      await service.findAllForUser('user-1', {} as never)
      expect(
        (repo._qb.andWhere.mock.calls as [string][]).some(([c]) => c === 'contact.user_status = :userStatusFilter'),
      ).toBe(false)
    })

    it('#3871 sait dire NON : un état actif (actionnable) garde la portée « Recommandés »', async () => {
      const { recommendedIds } = seedAccountOf200()
      repo._qb.andWhere.mockClear()
      await service.findAllForUser('user-1', { recommendedScope: 'recommended', state: 'actionnable' } as never)
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('contact.id IN'))
      expect(hit?.[1]).toEqual({ recommendedScopeIds: recommendedIds })
    })

    it('`countForUser` applique le MÊME filtre — jamais compté que « Recommandés » diverge de la liste', async () => {
      const { recommendedIds } = seedAccountOf200()
      repo._qb.getCount.mockResolvedValueOnce(3)

      const total = await service.countForUser('user-1', { recommendedScope: 'recommended' } as never)

      expect(total).toBe(3)
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('contact.id IN'))
      expect(hit?.[1]).toEqual({ recommendedScopeIds: recommendedIds })
    })

    it('le compteur « Recommandés X / Tous Y » (`recommendedTally`) se calcule sur la 1re page, quand la portée est active', async () => {
      seedAccountOf200()
      repo._qb.getCount.mockResolvedValueOnce(200) // tallyQb.clone().getCount() — « Tous », SANS la portée
      repo._qb.getCount.mockResolvedValueOnce(3) // totalPromise — narrowé par la portée

      const result = await service.findAllForUser('user-1', { recommendedScope: 'recommended' } as never)

      expect(result.recommendedTally).toEqual({ recommended: 3, all: 200 })
    })

    // #4770.4 — Louis 31/10 : le compteur « Tous » est le compte de l'ESPACE seulement, jamais un référentiel de marché
    // partagé. Le décompte « Tous » (`tallyQb`) est cloné APRÈS le périmètre d'espace : sans lui, il compterait tout.
    it('#4770.4 — le compteur « Tous » porte le périmètre d’espace, avant d’être cloné', async () => {
      seedAccountOf200()
      repo._qb.andWhere.mockClear()
      repo._qb.getCount.mockResolvedValueOnce(200)
      repo._qb.getCount.mockResolvedValueOnce(3)
      await service.findAllForUser('user-1', { recommendedScope: 'recommended' } as never)
      const clauses = (repo._qb.andWhere.mock.calls as [string][]).map(([clause]) => clause)
      expect(clauses).toContain('contact.workspace_id = :workspaceId')
    })

    it('sans la portée, `recommendedTally` est absent — jamais un second classement payé pour rien', async () => {
      const result = await service.findAllForUser('user-1', {})
      expect(result.recommendedTally).toBeUndefined()
      expect(repo.find).not.toHaveBeenCalled()
    })
  })

  describe('#3942.5 — ORDRE, LISIBILITÉ, PERF et PARITÉ du chemin recommandé (brief F05, 07/10)', () => {
    const eligibleBase = {
      title: 'DSI',
      entity: null,
      decision_role: 'economic',
      email_verified: true,
      phone: null,
      linkedin_url: null,
      source: 'apollo',
      user_status: 'new',
      email_sent_at: null,
      last_enrichment_at: null,
      priority: 2,
      hidden: false,
      excluded_at: null,
      lifecycle_state: null,
    }

    /**
     * Point 1 du brief : les comptes se groupent à la MÊME priorité que
     * `/accounts` par défaut (`SORT_MAP.date_desc`, `LAST_ANALYZED_SQL DESC
     * NULLS LAST`), PUIS par rang dans le chemin recommandé de chacun.
     * `array_position` sur la liste combinée est ce qui pose les deux en une
     * seule passe — ce test lit l'ORDRE qu'il produit, pas seulement le
     * `WHERE` (déjà couvert plus haut).
     */
    it('groupe par compte à la priorité `/accounts`, PUIS par rang dans le chemin recommandé de chacun', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([
        { id: 'c-acc1', account_id: 'acc-1' },
        { id: 'c-acc2', account_id: 'acc-2' },
      ])
      repo.find.mockResolvedValueOnce([
        { ...eligibleBase, id: 'c-acc1', full_name: 'Décideur du compte 1', email: 'c1@acme.fr', account_id: 'acc-1' },
        { ...eligibleBase, id: 'c-acc2', full_name: 'Décideur du compte 2', email: 'c2@acme.fr', account_id: 'acc-2' },
      ] as unknown as ContactEntity[])
      accounts.find.mockResolvedValueOnce([
        { id: 'acc-1', raw_analysis: null },
        { id: 'acc-2', raw_analysis: null },
      ] as never)
      // Simule la MÊME priorité que `/accounts` par défaut : acc-2 analysé plus
      // récemment, passe en tête (ce que la vraie requête `LAST_ANALYZED_SQL`
      // déciderait côté Postgres).
      accounts._qb.getRawMany.mockResolvedValueOnce([{ id: 'acc-2' }, { id: 'acc-1' }])

      await service.findAllForUser('user-1', { recommendedScope: 'recommended' } as never)

      const orderCall = (repo._qb.orderBy.mock.calls as unknown[][]).find(
        c => typeof c[0] === 'string' && (c[0] as string).includes('array_position'),
      )
      expect(orderCall).toBeTruthy()
      const paramCall = (repo._qb.setParameter.mock.calls as unknown[][]).find(c => c[0] === 'recommendedOrderIds')
      expect(paramCall?.[1]).toEqual(['c-acc2', 'c-acc1'])

      // La requête d'ordre ne lit QUE les comptes candidats, scopée à l'espace —
      // jamais tout `/accounts`.
      expect(accounts._qb.where).toHaveBeenCalledWith('account.id IN (:...accountIds)', {
        accountIds: expect.arrayContaining(['acc-1', 'acc-2']),
      })
      expect(accounts._qb.andWhere).toHaveBeenCalledWith('account.workspace_id = :recommendedOrderWorkspaceId', {
        recommendedOrderWorkspaceId: 'ws-1',
      })
    })

    /**
     * Point 2 du brief : chaque ligne porte son rang (« N° k ») et la taille du
     * chemin de son compte (« le vrai nombre »), pour l'en-tête de groupe et le
     * libellé de ligne. Offset non nul : tous les agrégats de 1re page
     * (lifecycleTally, etc.) se désarment, pour lire `data` sans leur bruit.
     */
    it('pose `recommended_rank` et `recommended_path_size` sur chaque ligne rendue', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([{ id: 'c-1', account_id: 'acc-1' }])
      repo.find.mockResolvedValueOnce([
        { ...eligibleBase, id: 'c-1', full_name: 'Alice', email: 'alice@acme.fr', account_id: 'acc-1' },
      ] as unknown as ContactEntity[])
      accounts.find.mockResolvedValueOnce([{ id: 'acc-1', raw_analysis: null }] as never)
      accounts._qb.getRawMany.mockResolvedValueOnce([{ id: 'acc-1' }])
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          id: 'c-1',
          account_id: 'acc-1',
          full_name: 'Alice',
          title: 'DSI',
          entity: null,
          decision_role: 'economic',
          priority: 2,
          email: 'alice@acme.fr',
          phone: null,
          linkedin_url: null,
          why_contact: null,
          user_status: 'new',
          source: 'apollo',
          created_at: new Date('2026-07-01T10:00:00.000Z'),
          updated_at: new Date('2026-07-01T10:00:00.000Z'),
          company_name: 'Acme',
        },
      ])

      const result = await service.findAllForUser('user-1', {
        recommendedScope: 'recommended',
        offset: 25,
        limit: 25,
      } as never)

      expect(result.data[0]?.recommended_rank).toBe(1)
      expect(result.data[0]?.recommended_path_size).toBe(1)
    })

    /**
     * Point 4 du brief — « un test qui sait dire NON » : l'ordre DANS un
     * compte doit être STRICTEMENT celui de `rankForAccount` (même fonction,
     * mêmes paramètres par défaut), jamais une seconde règle qui pourrait
     * diverger (GA-26).
     */
    it('#3942.5.4 — classe un compte EXACTEMENT comme `rankForAccount` (même fonction, mêmes paramètres)', async () => {
      const contacts = [
        { ...eligibleBase, id: 'c-eco', full_name: 'DSI décideur', email: 'dsi@acme.fr', decision_role: 'economic' },
        { ...eligibleBase, id: 'c-user', full_name: 'Simple utilisateur', email: null, decision_role: 'user' },
      ]

      repo.find.mockResolvedValueOnce(contacts.map(c => ({ ...c, account_id: 'acc-1' })) as unknown as ContactEntity[])
      accounts.findOne.mockResolvedValueOnce({ id: 'acc-1', raw_analysis: null } as unknown as AccountEntity)
      const direct = await service.rankForAccount('acc-1', 'user-1', {})

      repo._qb.getRawMany.mockResolvedValueOnce([{ id: 'c-eco', account_id: 'acc-1' }])
      repo.find.mockResolvedValueOnce(contacts.map(c => ({ ...c, account_id: 'acc-1' })) as unknown as ContactEntity[])
      accounts.find.mockResolvedValueOnce([{ id: 'acc-1', raw_analysis: null }] as never)
      accounts._qb.getRawMany.mockResolvedValueOnce([{ id: 'acc-1' }])

      await service.findAllForUser('user-2', { recommendedScope: 'recommended' } as never)
      const paramCall = (repo._qb.setParameter.mock.calls as unknown[][]).find(c => c[0] === 'recommendedOrderIds')

      expect(paramCall?.[1]).toEqual(direct.ranked.map(r => r.contact_id))
    })

    /**
     * Point 3 du brief (perf, incident prod 05/10 CPU API saturé) : un compte
     * déjà classé ne relit AUCUNE ligne et ne relance AUCUN classement sur la
     * requête SUIVANTE — même convention « budget de requêtes » que
     * `topAccessPaths` (ligne ~533).
     */
    it('#3942.5.3 — un compte déjà classé ne relit ni ne reclasse à la requête suivante (budget de requêtes)', async () => {
      repo._qb.getRawMany.mockResolvedValue([{ id: 'c-1', account_id: 'acc-1' }])
      repo.find.mockResolvedValueOnce([
        { ...eligibleBase, id: 'c-1', full_name: 'Alice', email: 'alice@acme.fr', account_id: 'acc-1' },
      ] as unknown as ContactEntity[])
      accounts.find.mockResolvedValueOnce([{ id: 'acc-1', raw_analysis: null }] as never)
      accounts._qb.getRawMany.mockResolvedValue([{ id: 'acc-1' }])

      await service.findAllForUser('user-1', { recommendedScope: 'recommended', offset: 25, limit: 25 } as never)
      expect(repo.find).toHaveBeenCalledTimes(1)
      expect(accounts.find).toHaveBeenCalledTimes(1)

      // Page suivante, même espace, même compte déjà chaud (TTL 60 s) : AUCUNE
      // relecture, AUCUN reclassement.
      await service.findAllForUser('user-1', { recommendedScope: 'recommended', offset: 50, limit: 25 } as never)
      expect(repo.find).toHaveBeenCalledTimes(1)
      expect(accounts.find).toHaveBeenCalledTimes(1)
    })

    /**
     * Symétrique du test précédent : une écriture en masse sur les contacts du
     * compte (ici `excludeContact`) périme le cache — la requête suivante relit
     * et reclasse, elle ne sert JAMAIS un chemin recommandé périmé.
     */
    it('#3942.5.3 — un contact écarté périme le chemin recommandé en cache de son compte', async () => {
      repo._qb.getRawMany.mockResolvedValue([{ id: 'c-1', account_id: 'acc-1' }])
      repo.find.mockResolvedValueOnce([
        { ...eligibleBase, id: 'c-1', full_name: 'Alice', email: 'alice@acme.fr', account_id: 'acc-1' },
      ] as unknown as ContactEntity[])
      accounts.find.mockResolvedValueOnce([{ id: 'acc-1', raw_analysis: null }] as never)
      accounts._qb.getRawMany.mockResolvedValue([{ id: 'acc-1' }])

      await service.findAllForUser('user-1', { recommendedScope: 'recommended', offset: 25, limit: 25 } as never)
      expect(repo.find).toHaveBeenCalledTimes(1)

      repo.findOne.mockResolvedValueOnce({
        id: 'c-1',
        account_id: 'acc-1',
        workspace_id: 'ws-1',
      } as unknown as ContactEntity)
      await service.excludeContact('c-1', 'user-1', 'a quitté l’entreprise')

      repo.find.mockResolvedValueOnce([
        { ...eligibleBase, id: 'c-2', full_name: 'Bob', email: 'bob@acme.fr', account_id: 'acc-1' },
      ] as unknown as ContactEntity[])
      accounts.find.mockResolvedValueOnce([{ id: 'acc-1', raw_analysis: null }] as never)

      await service.findAllForUser('user-1', { recommendedScope: 'recommended', offset: 25, limit: 25 } as never)
      expect(repo.find).toHaveBeenCalledTimes(2)
    })
  })

  describe('#2159.26 — les étiquettes dans la liste de contacts', () => {
    // #2159.26 — graphie de la première saisie (décision Louis 19/09) : les
    // étiquettes ne sont plus stockées en minuscules, le filtre compare donc
    // par CLÉ (`lower`), pas par containment `@>` exact.
    it('filtre sur une étiquette NORMALISÉE : « SAP » et « sap » filtrent pareil', async () => {
      await service.findAllForUser('user-1', { tag: '  SAP ' })
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => typeof clause === 'string' && clause.includes('unnest(contact.tags)'))
      expect(String(hit?.[0])).toContain('lower(')
      expect(hit?.[1]).toEqual({ tagKey: 'sap' })
    })

    it('projette les étiquettes de chaque ligne', async () => {
      await service.findAllForUser('user-1')
      const selected = repo._qb.select.mock.calls.flatMap((call: unknown[]) => call[0] as string[])
      expect(selected).toContain('contact.tags AS tags')
    })
  })

  /**
   * #2159.26 — le filtre « Étiquette » regroupe SANS tenir compte de la casse
   * (décision Louis 19/09). Si « SAP » est posé sur une fiche et « sap » sur
   * une autre, le filtre ne propose qu'UNE option : la graphie la plus
   * fréquente, à égalité la première rencontrée (la fiche la plus ancienne).
   */
  describe('listTags (#2159.26)', () => {
    it('une clé, une option — la graphie la plus fréquente gagne, triée alphabétiquement', async () => {
      repo.query.mockResolvedValueOnce([{ tag: 'SAP' }, { tag: 'cloud' }, { tag: 'sap' }, { tag: 'SAP' }] as never)
      const tags = await service.listTags('user-1')
      expect(tags).toEqual(['cloud', 'SAP'])
    })

    it('interroge dans l’ordre de création — la clé du départage par « première rencontrée »', async () => {
      await service.listTags('user-1')
      expect(repo.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY c.created_at ASC'), ['ws-1'])
    })

    it('une erreur de requête rend [] plutôt que de casser l’écran', async () => {
      repo.query.mockRejectedValueOnce(new Error('boom'))
      expect(await service.listTags('user-1')).toEqual([])
    })
  })

  describe('countForUser — Laura compte avant de proposer (15/09/2026)', () => {
    it('rend le compte du query builder, filtré comme `findAllForUser`', async () => {
      repo._qb.getCount.mockResolvedValueOnce(7)

      const total = await service.countForUser('user-1', { company: 'SNCF' })

      expect(total).toBe(7)
      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: string) => sql.includes('company_name ILIKE'))).toBe(true)
    })

    it('applique le filtre `state`, comme le `total` de `findAllForUser`', async () => {
      repo._qb.getCount.mockResolvedValueOnce(3)

      await service.countForUser('user-1', { state: 'disqualified' as never })

      const calls = repo._qb.andWhere.mock.calls.map((c: unknown[]) => c[0])
      expect(calls.some((sql: string) => sql.includes('= :state'))).toBe(true)
    })

    it("NE RATTRAPE PAS une erreur en 0 — « non mesuré » n'est jamais « 0 » (CLAUDE.md)", async () => {
      repo._qb.getCount.mockRejectedValueOnce(new Error('connexion perdue'))

      await expect(service.countForUser('user-1')).rejects.toThrow('connexion perdue')
    })
  })

  describe('findOne', () => {
    it('returns a success result with the contact', async () => {
      const c = { id: '1' } as ContactEntity
      repo.findOne.mockResolvedValueOnce(c)
      userActions.find.mockResolvedValueOnce([])
      const result = await service.findOne('1', 'user-1')
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) {
        expect(result.output).toMatchObject({ ...c, activity: [] })
        // Detail page also carries the deterministic /100 score.
        expect(typeof result.output.contact_score).toBe('number')
      }
    })

    it('#4016.L13 — la fiche porte les contradictions qui tiennent, à côté du fait confirmé', async () => {
      repo.findOne.mockResolvedValueOnce({ id: '1', email: 'g.denoyel@edf.fr' } as ContactEntity)
      userActions.find.mockResolvedValueOnce([])
      const contradiction = {
        field: 'email',
        value: 'gilles.denoyel@edf.fr',
        source: 'pipeline',
        observedAt: '2026-10-10T10:00:00.000Z',
      }
      provenance.contradictionsFor.mockResolvedValueOnce([contradiction])
      const result = await service.findOne('1', 'user-1')
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) {
        expect(result.output.email).toBe('g.denoyel@edf.fr')
        expect(result.output.field_contradictions).toEqual([contradiction])
      }
    })

    it('merges tracked user actions into contact activity', async () => {
      const c = { id: '1', activity: [{ label: 'Ancienne action' }] } as ContactEntity
      repo.findOne.mockResolvedValueOnce(c)
      userActions.find.mockResolvedValueOnce([
        {
          id: 'ua-1',
          user_id: 'user-1',
          // Backfilled team scope (multi-user Phase 2) — required on the entity.
          workspace_id: 'ws-1',
          account_id: 'acc-1',
          contact_id: '1',
          action_type: 'plan_action_contact_opened',
          channel: 'other',
          created_at: new Date('2026-07-01T10:00:00.000Z'),
          metadata: { label: 'Fiche contact ouverte', detail: 'Yann Martin' },
        } as UserActionEntity,
      ])

      const result = await service.findOne('1', 'user-1')

      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) {
        expect(result.output.activity?.[0]).toEqual({
          label: 'Fiche contact ouverte',
          detail: 'Yann Martin',
          status: null,
          at: '2026-07-01T10:00:00.000Z',
        })
      }
    })

    // #2715.1 — le plan montrait l'envoi LinkedIn (badge « Succès ») mais pas
    // l'envoi e-mail : `actionStatus` ne reconnaissait que
    // `plan_action_message_sent` (déclaré) et `plan_action_call_logged`, jamais
    // `message_sent` (vérifié, écrit par `recordEmailSent` avec `via: 'bellum'`).
    // Les deux canaux doivent porter le même statut de succès — sans jamais
    // confondre leur NATURE (vérifié / déclaré), déjà distincte dans
    // `message-send-provenance.ts`.
    it("#2715.1 — un e-mail vérifié porte le même statut « Succès » qu'une déclaration LinkedIn", async () => {
      const c = { id: '1' } as ContactEntity
      repo.findOne.mockResolvedValueOnce(c)
      userActions.find.mockResolvedValueOnce([
        {
          id: 'ua-2',
          user_id: 'user-1',
          workspace_id: 'ws-1',
          account_id: 'acc-1',
          contact_id: '1',
          action_type: 'message_sent',
          channel: 'email',
          created_at: new Date('2026-07-02T10:00:00.000Z'),
          metadata: { label: 'Email envoyé', subject: 'Bonjour', via: 'bellum' },
        } as UserActionEntity,
      ])

      const result = await service.findOne('1', 'user-1')

      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) {
        expect(result.output.activity?.[0]).toEqual({
          label: 'Email envoyé',
          detail: 'Email',
          status: 'Succès',
          at: '2026-07-02T10:00:00.000Z',
        })
      }
    })

    it('returns a not_found failure when missing', async () => {
      repo.findOne.mockResolvedValueOnce(null)
      merges.findOne.mockResolvedValueOnce(null)
      const result = await service.findOne('1', 'user-1')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('not_found')
    })

    // Dedup deleted the loser row, so every link a rep had already shared to it
    // — bookmark, URL pasted in an email — answered « Contact introuvable » for
    // a person who still exists under a new id. The merge log makes the old id
    // resolve to its survivor instead.
    it('resolves an id that was merged away into its survivor', async () => {
      const survivor = { id: 'new-id', full_name: 'Sébastien Chauffray' } as ContactEntity
      repo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(survivor)
      merges.findOne.mockResolvedValueOnce({ loser_id: 'old-id', winner_id: 'new-id' })
      repo.query.mockResolvedValueOnce([])
      userActions.find.mockResolvedValueOnce([])

      const result = await service.findOne('old-id', 'user-1')

      expect(isSuccess(result)).toBe(true)
      // `merged_from` is what lets the front rewrite the address bar to the
      // canonical URL instead of leaving a stale id in the user's history.
      if (isSuccess(result)) {
        expect(result.output.id).toBe('new-id')
        expect(result.output.merged_from).toBe('old-id')
      }
    })

    it('follows a chain of merges to the final survivor', async () => {
      // A merged into B, later B merged into C. One hop is not enough.
      const survivor = { id: 'c', full_name: 'Sébastien Chauffray' } as ContactEntity
      repo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(survivor)
      merges.findOne
        .mockResolvedValueOnce({ loser_id: 'a', winner_id: 'b' })
        .mockResolvedValueOnce({ loser_id: 'b', winner_id: 'c' })
        .mockResolvedValueOnce(null)
      repo.query.mockResolvedValueOnce([])
      userActions.find.mockResolvedValueOnce([])

      const result = await service.findOne('a', 'user-1')

      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output.id).toBe('c')
    })

    it('still 404s when the survivor is outside the caller workspace', async () => {
      // The alias must not become a way to read another tenant's contact: the
      // survivor is re-fetched through the SAME workspace scope as any other read.
      repo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      merges.findOne.mockResolvedValueOnce({ loser_id: 'old-id', winner_id: 'other-tenant' })

      const result = await service.findOne('old-id', 'user-1')

      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('not_found')
    })

    // #2160.9 — le porteur en tête de fiche : `assigned_to` était déjà envoyé,
    // jamais résolu en nom (voir `contact.ts` — le champ `owner`).
    it('#2160.9 — résout le porteur nommé depuis `assigned_to`', async () => {
      const c = { id: '1', assigned_to: 'user-42' } as ContactEntity
      repo.findOne.mockResolvedValueOnce(c)
      userActions.find.mockResolvedValueOnce([])
      repo.query.mockResolvedValueOnce([
        { userId: 'user-42', firstName: 'Camille', lastName: 'Dubois', email: 'camille@bellum-it.com' },
      ])

      const result = await service.findOne('1', 'user-1')

      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) {
        expect(result.output.owner).toEqual({ user_id: 'user-42', name: 'Camille Dubois' })
      }
      expect(repo.query).toHaveBeenCalledWith(expect.stringContaining('FROM profiles'), ['user-42'])
    })

    // Un contact JAMAIS attribué ne doit ni interroger `profiles` ni deviner un
    // porteur — `null` est le seul fait vrai (GA-18/19).
    it('#2160.9 — aucun porteur attribué : `owner: null`, aucune requête profils', async () => {
      const c = { id: '1', assigned_to: null } as ContactEntity
      repo.findOne.mockResolvedValueOnce(c)
      userActions.find.mockResolvedValueOnce([])
      repo.query.mockClear()

      const result = await service.findOne('1', 'user-1')

      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output.owner).toBeNull()
      expect(repo.query).not.toHaveBeenCalled()
    })

    // Un profil illisible (membre parti) reste `null` — jamais un uuid affiché
    // en guise de nom, jamais une erreur qui casse la fiche.
    it('#2160.9 — profil introuvable : `owner: null`, la fiche reste servie', async () => {
      const c = { id: '1', assigned_to: 'user-ghost' } as ContactEntity
      repo.findOne.mockResolvedValueOnce(c)
      userActions.find.mockResolvedValueOnce([])
      repo.query.mockResolvedValueOnce([])

      const result = await service.findOne('1', 'user-1')

      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output.owner).toBeNull()
    })

    // #2128.17 — CE CONTACT PRÉCIS a-t-il déjà été sollicité par un collègue
    // récemment ? Même fenêtre que la collision de prospection au niveau du
    // compte (workspace-memory-crossings.service.ts G4), bornée au contact
    // (user_actions.contact_id) — lue via `userActions.query`, jamais
    // `repo.query` (le repo ContactEntity), pour ne rien mélanger avec la
    // résolution du porteur ci-dessus.
    it('#2128.17 — signale un collègue qui a déjà touché CE contact dans la fenêtre de 7 jours', async () => {
      const c = { id: '1', assigned_to: null } as ContactEntity
      repo.findOne.mockResolvedValueOnce(c)
      userActions.find.mockResolvedValueOnce([])
      userActions.query.mockResolvedValueOnce([
        { userId: 'user-7', lastTouch: new Date('2026-09-20T10:00:00.000Z'), firstName: 'Sarah', lastName: 'Nasri' },
      ])

      const result = await service.findOne('1', 'user-1')

      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) {
        expect(result.output.solicitation).toEqual({
          colleague: { user_id: 'user-7', name: 'Sarah Nasri' },
          lastTouchOn: '2026-09-20',
          withinDays: 7,
        })
      }
      expect(userActions.query).toHaveBeenCalledWith(expect.stringContaining('ua.contact_id'), [
        'ws-1',
        '1',
        'user-1',
        7,
      ])
    })

    it("#2128.17 — aucun collègue n'a touché ce contact récemment : `solicitation: null`", async () => {
      const c = { id: '1', assigned_to: null } as ContactEntity
      repo.findOne.mockResolvedValueOnce(c)
      userActions.find.mockResolvedValueOnce([])
      userActions.query.mockResolvedValueOnce([])

      const result = await service.findOne('1', 'user-1')

      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output.solicitation).toBeNull()
    })
  })

  /*
   * #2386.6 — la MÊME collision (#2128.17), groupée : la session de
   * prospection (`prospecting-session.ts`) construit sa liste sans appel
   * réseau ; nommer une collision par contact ne doit pas en coûter UN PAR
   * CONTACT.
   */
  describe('resolveContactsSolicitations — #2386.6', () => {
    it('regroupe la collision par contact, en un seul appel groupé', async () => {
      repo.find.mockResolvedValueOnce([{ id: 'c1' }, { id: 'c2' }])
      userActions.query.mockResolvedValueOnce([
        {
          contactId: 'c1',
          userId: 'user-7',
          lastTouch: new Date('2026-09-20T10:00:00.000Z'),
          firstName: 'Sarah',
          lastName: 'Nasri',
        },
      ])

      const result = await service.resolveContactsSolicitations('user-1', ['c1', 'c2'])

      expect(result).toEqual({
        c1: { colleague: { user_id: 'user-7', name: 'Sarah Nasri' }, lastTouchOn: '2026-09-20', withinDays: 7 },
        c2: null,
      })
      expect(userActions.query).toHaveBeenCalledTimes(1)
    })

    it("un id hors de l'espace (ou introuvable) est ABSENT de la réponse — jamais un `null` deviné", async () => {
      repo.find.mockResolvedValueOnce([{ id: 'c1' }])
      userActions.query.mockResolvedValueOnce([])

      const result = await service.resolveContactsSolicitations('user-1', ['c1', 'c-other-tenant'])

      expect(Object.keys(result)).toEqual(['c1'])
    })

    it('une liste vide ne déclenche aucun appel réseau', async () => {
      const result = await service.resolveContactsSolicitations('user-1', [])

      expect(result).toEqual({})
      expect(repo.find).not.toHaveBeenCalled()
    })
  })

  describe('findOwnedForAction', () => {
    it('resolves a contact within the caller’s WORKSPACE (legacy NULL rows stay with their owner)', async () => {
      const contact = { id: 'c1', user_id: 'user-1' } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      const result = await service.findOwnedForAction('c1', 'user-1')
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output).toBe(contact)
      // #4731 — le geste est borné par l'ESPACE (ws-1), plus par le seul `user_id` : un coéquipier agit
      // sur les lignes de son espace. La ligne ancienne (`workspace_id` NULL) reste à son propriétaire.
      expect(repo.findOne).toHaveBeenCalledWith({
        where: [
          { id: 'c1', workspace_id: 'ws-1', deleted_at: IsNull() },
          { id: 'c1', workspace_id: IsNull(), user_id: 'user-1', deleted_at: IsNull() },
        ],
      })
    })

    it('fails not_found when the contact is not owned by the caller', async () => {
      repo.findOne.mockResolvedValueOnce(null)
      const result = await service.findOwnedForAction('c1', 'user-2')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('not_found')
    })
  })

  describe('enrichContact — espace de démonstration', () => {
    /** Une fiche de démo type + son dossier + deux collègues sur le même compte. */
    function stageDemoContact() {
      workspace.isDemoWorkspace.mockResolvedValue(true)
      const contact = {
        id: 'c-demo',
        user_id: 'user-1',
        account_id: 'acc-demo',
        full_name: 'Amandine Costa',
        title: 'Cheffe de projet SI',
        entity: 'Cliniques Mireval',
        family: 'PMO',
        decision_role: 'user',
        priority: 3,
        seniority: 'manager',
        key_points: ['Pilote l’intégration'],
        why_contact: 'Elle vit la convergence au quotidien.',
      } as unknown as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      accounts.findOne.mockResolvedValueOnce({
        id: 'acc-demo',
        company_name: 'NovaSanté',
        sector: 'Santé privée',
        headquarters: 'Lyon, Auvergne-Rhône-Alpes',
        recent_signals: [{ signal: 'Acquisition du groupe Mireval', source: 'Presse (démo)' }],
      } as unknown as AccountEntity)
      repo.find.mockResolvedValueOnce([
        {
          id: 'c-demo',
          full_name: 'Amandine Costa',
          title: 'Cheffe de projet SI',
          entity: 'Cliniques Mireval',
          decision_role: 'user',
          priority: 3,
        },
        {
          id: 'c-rssi',
          full_name: 'Karim Delorme',
          title: 'RSSI',
          entity: 'NovaSanté',
          decision_role: 'technical',
          priority: 1,
        },
      ] as unknown as ContactEntity[])
      return contact
    }

    /**
     * Ce test vérifiait que la démonstration REMPLISSAIT la fiche : adresse en
     * `.example`, téléphone hors plage, adresse de profil, parcours
     * professionnel. C'était juste tant que les personnes du jeu étaient
     * inventées.
     *
     * Les cinq dossiers portent désormais des sociétés RÉELLES et des
     * mandataires sociaux publiés au registre. Fabriquer une coordonnée ou un
     * parcours pour l'un d'eux, sur un lien public, serait la donnée inventée
     * que tout le reste du produit s'interdit. Le clic remplit donc ce qui est
     * VRAI (périmètre, ville, entourage) et rien d'autre.
     */
    it('remplit ce qui est vrai — et ne fabrique aucune coordonnée ni aucun parcours', async () => {
      stageDemoContact()

      const result = await service.enrichContact('c-demo', 'user-1', {
        first_name: 'Amandine',
        last_name: 'Costa',
        organization_name: 'Cliniques Mireval',
      })

      expect(isSuccess(result)).toBe(true)
      if (!isSuccess(result)) return
      const output = result.output
      // Rien d'inventé sur la personne.
      expect(output.email).toBeFalsy()
      expect(output.phone).toBeFalsy()
      expect(output.linkedin_url).toBeFalsy()
      expect(output.apollo_enrichment?.employment_history).toEqual([])
      expect(output.apollo_enrichment?.education).toEqual([])
      // Ce qui reste renseigné l'est parce que la fiche le contient déjà.
      expect(output.apollo_enrichment?.headline).toBeTruthy()
      expect(output.location).toBe('Lyon, France')
      // L'onglet « Relations » n'est plus vide, et son lien mène à une fiche
      // réellement seedée (jamais un nom inventé de plus).
      expect(output.relations?.map(relation => relation.id)).toEqual(['c-rssi'])
      // Aucun appel réseau : ni le fournisseur, ni le débit de crédit.
      expect(ia.enrichContact).not.toHaveBeenCalled()
      expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
    })

    // #2159.62 — le chemin démo rend TOUJOURS `last_enrichment_result: 'matched'`
    // (voir `updates` dans `enrichContactInDemo`) : la MÊME porte qu'en réel
    // (`if (matched) updates.employment_verified_at = new Date()`) doit donc
    // s'ouvrir ici aussi, sans quoi la fiche de démo n'aurait jamais cette date
    // — `demo-contact-profile.spec.ts` (couverture des colonnes) la trouverait
    // non classifiable.
    it('#2159.62 — pose la date de vérification d’emploi, comme le chemin réel', async () => {
      stageDemoContact()

      const result = await service.enrichContact('c-demo', 'user-1', {
        first_name: 'Amandine',
        last_name: 'Costa',
        organization_name: 'Cliniques Mireval',
      })

      expect(isSuccess(result)).toBe(true)
      if (!isSuccess(result)) return
      expect(result.output.employment_verified_at).toBeInstanceOf(Date)
    })

    it('ne laisse JAMAIS partir un appel fournisseur, même si le pré-contrôle a dit oui', async () => {
      stageDemoContact()
      // Le pré-contrôle n'est pas terminal : son résultat repartait dans le vrai
      // chemin juste en dessous, si bien qu'un espace de démonstration appelait
      // réellement Apollo/SalesQL/Dropcontact — et pouvait ramener les
      // coordonnées d'une VRAIE personne dans un espace ouvert à des inconnus.
      // Ce mock est armé pour exploser : le seul moyen de passer est de ne pas
      // l'appeler.
      ia.enrichContact.mockRejectedValue(new Error('aucun appel fournisseur ne doit partir en démo'))
      dropcontact.isEnabled.mockReturnValue(true)

      const result = await service.enrichContact('c-demo', 'user-1', {
        first_name: 'Amandine',
        last_name: 'Costa',
        organization_name: 'Cliniques Mireval',
      })

      expect(isSuccess(result)).toBe(true)
      expect(ia.enrichContact).not.toHaveBeenCalled()
      expect(dropcontact.enrich).not.toHaveBeenCalled()
    })

    it('ne consomme pas de crédit et ne refuse jamais pour « crédits épuisés »', async () => {
      stageDemoContact()
      // Un espace de démonstration à sec ne doit pas pouvoir bloquer la démo.
      credits.hasEnrichmentCredit.mockResolvedValue(false)

      const result = await service.enrichContact('c-demo', 'user-1', {
        first_name: 'Amandine',
        last_name: 'Costa',
        organization_name: 'Cliniques Mireval',
      })

      expect(isSuccess(result)).toBe(true)
      expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
    })

    it('n’invente aucune relation quand la personne est seule sur son compte', async () => {
      workspace.isDemoWorkspace.mockResolvedValue(true)
      repo.findOne.mockResolvedValueOnce({
        id: 'c-seul',
        user_id: 'user-1',
        account_id: 'acc-demo',
        full_name: 'Seule Ici',
        entity: 'NovaSanté',
      } as unknown as ContactEntity)
      accounts.findOne.mockResolvedValueOnce({
        id: 'acc-demo',
        company_name: 'NovaSanté',
        sector: 'Santé',
        headquarters: 'Lyon, ARA',
        recent_signals: [],
      } as unknown as AccountEntity)
      repo.find.mockResolvedValueOnce([{ id: 'c-seul' }] as unknown as ContactEntity[])

      const result = await service.enrichContact('c-seul', 'user-1', {
        first_name: 'Seule',
        last_name: 'Ici',
        organization_name: 'NovaSanté',
      })

      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output.relations ?? null).toBeNull()
    })

    // #2120.57 / #2297.23 — la démo ne mesure RIEN. `enrichContactInDemo` rend
    // la main avant tout appel fournisseur ; journaliser une durée ici
    // écrirait une mesure SYNTHÉTIQUE dans une table qui agrège tous les
    // espaces, réels compris — voir la décision écrite dans `demo-coverage.ts`.
    it('ne journalise AUCUNE durée — le court-circuit démo rend la main avant l’appel fournisseur', async () => {
      const { withDuration, enrichmentDuration } = serviceWithEnrichmentDuration()
      workspace.isDemoWorkspace.mockResolvedValue(true)
      repo.findOne.mockResolvedValueOnce({
        id: 'c-demo',
        user_id: 'user-1',
        account_id: 'acc-demo',
        full_name: 'Amandine Costa',
      } as unknown as ContactEntity)
      accounts.findOne.mockResolvedValueOnce({
        id: 'acc-demo',
        company_name: 'NovaSanté',
        sector: 'Santé',
        headquarters: 'Lyon, ARA',
        recent_signals: [],
      } as unknown as AccountEntity)
      repo.find.mockResolvedValueOnce([{ id: 'c-demo' }] as unknown as ContactEntity[])

      const result = await withDuration.enrichContact('c-demo', 'user-1', {
        first_name: 'Amandine',
        last_name: 'Costa',
        organization_name: 'NovaSanté',
      })

      expect(isSuccess(result)).toBe(true)
      expect(ia.enrichContact).not.toHaveBeenCalled()
      expect(enrichmentDuration.record).not.toHaveBeenCalled()
    })

    // #2297.18 — la démo doit tenir la MÊME doctrine qu'un espace réel
    // (`identité ambiguë (#2120.61)` ci-dessous) : sans ce garde-fou,
    // `enrichContactInDemo` remplissait TOUJOURS la fiche, y compris pour un
    // contact dont le nom+société simule un fournisseur qui a trouvé deux
    // personnes. Recette du 27/09 : l'ambiguïté ne peut PAS venir de deux
    // fiches du même compte partageant le même nom normalisé — l'index unique
    // `idx_contacts_account_normalized_name` interdit exactement ça, en démo
    // comme en réel — donc `enrichContactInDemo` simule le même ÉVÉNEMENT que
    // le fournisseur produirait en réel (réponse à deux candidats), sur un nom
    // + société connus à l'avance (`isDemoAmbiguousProviderMatch`,
    // `demo-enrichment.ts`), jamais sur une paire de lignes en base.
    it('un contact de démo dont le nom+société simule une réponse fournisseur à deux candidats : `ambiguous`, rien d’inventé, rien de débité', async () => {
      workspace.isDemoWorkspace.mockResolvedValue(true)
      repo.findOne.mockResolvedValueOnce({
        id: 'c-demo-1',
        user_id: 'user-1',
        account_id: 'acc-demo',
        full_name: 'Mathis Fontenelle',
        title: 'Responsable support technique',
        entity: 'SNCF Voyageurs',
      } as unknown as ContactEntity)
      repo.find.mockResolvedValueOnce([
        { id: 'c-demo-1', full_name: 'Mathis Fontenelle' },
      ] as unknown as ContactEntity[])

      const result = await service.enrichContact('c-demo-1', 'user-1', {
        first_name: 'Mathis',
        last_name: 'Fontenelle',
        organization_name: 'SNCF Voyageurs',
      })

      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) {
        expect(result.output.last_enrichment_result).toBe('ambiguous')
        expect(result.output.email).toBeFalsy()
        expect(result.output.phone).toBeFalsy()
        expect(result.output.credits_debited).toBe(0)
      }
      const written = repo._qb.set.mock.calls.at(-1)?.[0] as Record<string, unknown>
      expect(written).toHaveProperty('last_enrichment_result', 'ambiguous')
      expect(written).not.toHaveProperty('email')
      expect(written).not.toHaveProperty('phone')
      // Aucun appel réseau, comme partout ailleurs en démo — et surtout aucune
      // lecture du dossier : une identité ambiguë ne mérite pas de profil fictif.
      expect(ia.enrichContact).not.toHaveBeenCalled()
      expect(accounts.findOne).not.toHaveBeenCalled()
      expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
    })

    // #2297.18 — garde de non-régression : deux fiches actives du même compte
    // de démo qui partagent un nom ne doivent PLUS, à elles seules, rendre
    // `ambiguous` (l'ancien mécanisme, retiré — il ne peut de toute façon plus
    // se produire, l'index unique empêchant deux fiches actives du même
    // compte de partager un nom normalisé). Seul le fournisseur fictif décide.
    it('deux fiches actives du même compte de démo partageant un nom NE suffisent PLUS à rendre `ambiguous`', async () => {
      workspace.isDemoWorkspace.mockResolvedValue(true)
      repo.findOne.mockResolvedValueOnce({
        id: 'c-demo-1',
        user_id: 'user-1',
        account_id: 'acc-demo',
        full_name: 'Jean Dupont',
        title: 'Cheffe de projet SI',
        entity: 'Cliniques Mireval',
      } as unknown as ContactEntity)
      accounts.findOne.mockResolvedValueOnce({
        id: 'acc-demo',
        company_name: 'Cliniques Mireval',
        sector: 'Santé',
        headquarters: 'Lyon, ARA',
        recent_signals: [],
      } as unknown as AccountEntity)
      repo.find.mockResolvedValueOnce([
        { id: 'c-demo-1', full_name: 'Jean Dupont' },
        { id: 'c-demo-2', full_name: 'Jean Dupont' },
      ] as unknown as ContactEntity[])

      const result = await service.enrichContact('c-demo-1', 'user-1', {
        first_name: 'Jean',
        last_name: 'Dupont',
        organization_name: 'Cliniques Mireval',
      })

      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output.last_enrichment_result).not.toBe('ambiguous')
    })
  })

  describe('#4268.b — « Enrichir » lit d’abord la base commune, avant tout appel payant', () => {
    const TEST_KEY = 'test-only-person-erasure-key-0123456789abcdef'
    const savedKey = process.env[PERSON_ERASURE_HMAC_KEY_ENV]
    afterAll(() => {
      if (savedKey === undefined) delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
      else process.env[PERSON_ERASURE_HMAC_KEY_ENV] = savedKey
    })
    const claire = (): ContactEntity =>
      ({
        id: 'c1',
        user_id: 'user-1',
        workspace_id: 'ws-1',
        account_id: 'a1',
        full_name: 'Claire Perrin',
        linkedin_url: 'https://www.linkedin.com/in/claire-perrin/',
        email: null,
        phone: null,
      }) as ContactEntity
    const commonRead = (row: { email: string | null; phone: string | null } | null) =>
      repo.manager.query.mockImplementation(async (sql: string) =>
        /FROM shared_company_people/.test(sql) && row ? [row] : [],
      )
    const dto = { first_name: 'Claire', last_name: 'Perrin', organization_name: 'Airbus' }

    beforeEach(() => {
      process.env[PERSON_ERASURE_HMAC_KEY_ENV] = TEST_KEY
      accounts.findOne.mockResolvedValue({ id: 'a1', siren: '383474814', company_name: 'Airbus' } as AccountEntity)
    })

    it('les deux coordonnées connues du commun : aucun appel fournisseur, aucun crédit, source « shared_base »', async () => {
      repo.findOne.mockResolvedValueOnce(claire())
      commonRead({ email: 'claire.perrin@airbus.com', phone: '+33612345678' })
      const result = await service.enrichContact('c1', 'user-1', dto)
      expect(ia.enrichContact).not.toHaveBeenCalled()
      expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) {
        expect(result.output.email).toBe('claire.perrin@airbus.com')
        expect(result.output.phone).toBe('+33612345678')
        expect(result.output.last_enrichment_provider).toBe('shared_base')
        expect(result.output.credits_debited).toBe(0)
        expect(result.output.credits_remaining).toBe(42)
      }
      const read = repo.manager.query.mock.calls.find(([sql]) => /FROM shared_company_people/.test(String(sql)))
      expect(read?.[1]).toEqual(expect.arrayContaining(['live', 'siren_383474814']))
      expect(provenance.commit).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: 'c1', source: 'pipeline', workspaceId: 'ws-1' }),
      )
    })

    it('le commun ne connaît que l’e-mail : il le pose, et la cascade ne cherche plus que le téléphone', async () => {
      repo.findOne.mockResolvedValueOnce(claire())
      commonRead({ email: 'claire.perrin@airbus.com', phone: null })
      ia.enrichContact.mockResolvedValueOnce({
        data: { email: null, email_status: null, phone: '+33699999999', linkedin_url: null },
      })
      const result = await service.enrichContact('c1', 'user-1', dto)
      expect(ia.enrichContact).toHaveBeenCalledTimes(1)
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) {
        expect(result.output.email).toBe('claire.perrin@airbus.com')
        expect(result.output.phone).toBe('+33699999999')
      }
    })

    it('#4268.d — sait dire NON : une coordonnée retirée À LA MAIN dans l’espace ne revient pas par le commun', async () => {
      repo.findOne.mockResolvedValueOnce(claire())
      commonRead({ email: 'claire.perrin@airbus.com', phone: null })
      provenance.currentSources.mockResolvedValue({ email: 'human' })
      ia.enrichContact.mockResolvedValueOnce({
        data: { matched: false, email: null, email_status: null, phone: null, linkedin_url: null },
      })
      const result = await service.enrichContact('c1', 'user-1', dto)
      expect(ia.enrichContact).toHaveBeenCalledTimes(1)
      if (isSuccess(result)) expect(result.output.email ?? null).toBeNull()
    })

    it('sait dire NON — sans clé d’empreinte, le commun n’est pas lu et la cascade part comme avant', async () => {
      delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
      repo.findOne.mockResolvedValueOnce(claire())
      commonRead({ email: 'claire.perrin@airbus.com', phone: '+33612345678' })
      ia.enrichContact.mockResolvedValueOnce({
        data: { matched: false, email: null, email_status: null, phone: null, linkedin_url: null },
      })
      await service.enrichContact('c1', 'user-1', dto)
      expect(ia.enrichContact).toHaveBeenCalledTimes(1)
      expect(repo.manager.query.mock.calls.some(([sql]) => /shared_company_people/.test(String(sql)))).toBe(false)
    })
  })

  describe('enrichContact', () => {
    it('returns a success result with the merged enrichment', async () => {
      const contact = { id: 'c1', user_id: 'user-1' } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      ia.enrichContact.mockResolvedValueOnce({
        data: { email: 'a@b.com', email_status: 'verified', phone: null, linkedin_url: null },
      })
      const result = await service.enrichContact('c1', 'user-1', {
        first_name: 'Jean',
        last_name: 'Dupont',
        organization_name: 'Acme',
      })
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) {
        expect(result.output.email).toBe('a@b.com')
        expect(result.output.email_verified).toBe(true)
      }
      expect(repo._qb.execute).toHaveBeenCalled()
    })

    /**
     * #2988 (#2161) — provenance PAR CHAMP (source + date) sur le chemin
     * d'enrichissement À L'UNITÉ. Avant ce commit, seul le lot phase 3
     * (`writeEnrichment`, testé plus bas dans ce fichier) posait
     * `field_provenance` ; ce chemin-ci (le bouton « Enrichir » d'une fiche)
     * écrivait email/téléphone SANS jamais committer leur provenance.
     */
    it('committe la provenance (source pipeline) des champs réellement écrits (#2988, #2161)', async () => {
      const contact = { id: 'c1', user_id: 'user-1', workspace_id: 'w1', email: null, phone: null } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      ia.enrichContact.mockResolvedValueOnce({
        data: { email: 'a@b.com', email_status: 'verified', phone: '+33600000000', linkedin_url: null },
      })

      await service.enrichContact('c1', 'user-1', {
        first_name: 'Jean',
        last_name: 'Dupont',
        organization_name: 'Acme',
      })

      expect(provenance.commit).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'contact',
          entityId: 'c1',
          source: 'pipeline',
          actorId: null,
          changes: expect.arrayContaining([
            { field: 'email', oldValue: null, newValue: 'a@b.com' },
            { field: 'phone', oldValue: null, newValue: '+33600000000' },
          ]),
        }),
      )
    })

    it('ne committe rien quand rien n’a été écrit (aucun canal trouvé)', async () => {
      const contact = { id: 'c1', user_id: 'user-1', workspace_id: 'w1', email: null, phone: null } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      ia.enrichContact.mockResolvedValueOnce({
        data: { matched: false, email: null, email_status: null, phone: null, linkedin_url: null },
      })
      provenance.commit.mockClear()

      await service.enrichContact('c1', 'user-1', {
        first_name: 'Jean',
        last_name: 'Dupont',
        organization_name: 'Acme',
      })

      expect(provenance.commit).not.toHaveBeenCalled()
    })

    /*
     * #2120.57 / #2297.23 — la durée d'un enrichissement se MESURE.
     *
     * ⚠️ CE QUE CE BLOC NE PEUT PAS VOIR. `serviceWithEnrichmentDuration()`
     * CONSTRUIT le service à la main avec un bouchon : il ne passe jamais par
     * l'injection, donc il est vert que le conteneur fournisse la mesure ou
     * qu'il injecte `undefined`. Il prouve que `record()` est APPELÉ au bon
     * endroit — rien de plus. Que la dépendance soit réellement FOURNIE se
     * prouve sur le graphe réel (`architecture/app-module-boots.spec.ts`), et
     * la classe entière est tenue par GA-365
     * (`architecture/optional-dependencies-are-resolvable.spec.ts`).
     */
    describe('mesure de durée (#2120.57, #2297.23)', () => {
      // #2120.57 (b) — mesuré en production le 20/09 : une réponse « rien
      // trouvé » (quasi instantanée) et un enrichissement ABOUTI (30-85 s)
      // tombaient dans la même médiane, au point d'afficher « environ 0 s ».
      // `record()` prend désormais un second argument `found`, lu sur CE
      // signal (email / téléphone / LinkedIn rendus par CET appel).
      it('journalise une durée MESURÉE (>= 0) et `found: false` sur un « rien trouvé »', async () => {
        const { withDuration, enrichmentDuration } = serviceWithEnrichmentDuration()
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: false, email: null, email_status: null, phone: null, linkedin_url: null },
        })

        const result = await withDuration.enrichContact('c1', 'user-1', {
          first_name: 'Owen',
          organization_name: 'Dirigo',
        })

        expect(isSuccess(result)).toBe(true)
        expect(enrichmentDuration.record).toHaveBeenCalledTimes(1)
        expect(enrichmentDuration.record).toHaveBeenCalledWith(expect.any(Number), false)
        expect(enrichmentDuration.record.mock.calls[0]![0]).toBeGreaterThanOrEqual(0)
      })

      it('journalise `found: true` quand le fournisseur rend une coordonnée exploitable', async () => {
        const { withDuration, enrichmentDuration } = serviceWithEnrichmentDuration()
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: 'owen@dirigo.fr', email_status: 'verified', phone: null, linkedin_url: null },
        })

        const result = await withDuration.enrichContact('c1', 'user-1', {
          first_name: 'Owen',
          organization_name: 'Dirigo',
        })

        expect(isSuccess(result)).toBe(true)
        expect(enrichmentDuration.record).toHaveBeenCalledWith(expect.any(Number), true)
      })

      it('NE journalise RIEN quand le fournisseur échoue techniquement — timeout, 5xx', async () => {
        const { withDuration, enrichmentDuration } = serviceWithEnrichmentDuration()
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockRejectedValueOnce(
          new TechnicalError('HTTP request failed', {
            cause: new HttpError(
              502,
              JSON.stringify({ detail: { message: 'boom', code: 'upstream_error' } }),
              false,
              '/phase/2/enrich',
            ),
          }),
        )

        const result = await withDuration.enrichContact('c1', 'user-1', {
          first_name: 'Owen',
          organization_name: 'Dirigo',
        })

        expect(isFailure(result)).toBe(true)
        expect(enrichmentDuration.record).not.toHaveBeenCalled()
      })
    })

    // ── Cascade tronquée (budget de temps IA) ───────────────────────────────────
    // `truncated` dit « je n'ai pas fini de chercher ». L'écrire comme une
    // tentative vide armerait le cooldown de 30 jours : le bouton refuserait
    // ensuite de rappeler le fournisseur sur une question jamais posée en entier.
    it("n'écrit AUCUNE trace quand la cascade a été tronquée sans rien trouver", async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: { matched: false, email: null, email_status: null, phone: null, linkedin_url: null, truncated: true },
      })

      const result = await service.enrichContact('c1', 'user-1', {
        first_name: 'Owen',
        organization_name: 'Dirigo',
      })

      expect(isSuccess(result)).toBe(true)
      // Rien à persister ⇒ pas d'UPDATE du tout (un `SET` vide serait une erreur SQL).
      expect(repo._qb.set).not.toHaveBeenCalled()
      expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
      // Le drapeau remonte au client, qui doit dire « recherche interrompue »
      // plutôt que « personne introuvable ».
      if (isSuccess(result)) expect(result.output.enrichment.truncated).toBe(true)
    })

    it('journalise normalement une tentative tronquée qui a QUAND MÊME trouvé quelque chose', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: {
          matched: true,
          email: 'owen@dirigo.fr',
          email_status: 'verified',
          phone: null,
          linkedin_url: null,
          truncated: true,
        },
      })

      const result = await service.enrichContact('c1', 'user-1', {
        first_name: 'Owen',
        organization_name: 'Dirigo',
      })

      expect(isSuccess(result)).toBe(true)
      expect(repo._qb.set).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'owen@dirigo.fr', last_enrichment_result: 'matched' }),
      )
      expect(credits.consumeEnrichmentCredit).toHaveBeenCalledTimes(1)
      // #1931 L2 (D3 / I4) — le débit OBSERVÉ voyage avec le résultat.
      expect(isSuccess(result) && result.output.credits_debited).toBe(creditCostOf('contact_enrichment'))
    })

    it('une cascade COMPLÈTE restée vide arme bien le cooldown (comportement inchangé)', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: { matched: false, email: null, email_status: null, phone: null, linkedin_url: null },
      })

      const result = await service.enrichContact('c1', 'user-1', { first_name: 'Owen', organization_name: 'Dirigo' })

      expect(repo._qb.set).toHaveBeenCalledWith(expect.objectContaining({ last_enrichment_result: 'no_new_data' }))
      // #1931 L2 (D3) — « fait » sans rien trouver débite 0, et le DIT : c'est ce
      // zéro, rapporté, qu'Action OS compte — plus l'estimation du pas.
      expect(isSuccess(result) && result.output.credits_debited).toBe(0)
    })

    it('returns a not_found failure if contact does not belong to user', async () => {
      repo.findOne.mockResolvedValueOnce(null)
      const result = await service.enrichContact('c1', 'user-1', {
        first_name: 'a',
        last_name: 'b',
        organization_name: 'c',
      })
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('not_found')
    })

    // #3850.1 — mesuré en prod le 08/10 : un code postal brésilien n'a ni
    // indicatif ni la forme locale FR — Apollo est un POINT D'ÉCRITURE comme
    // n'importe quel autre fournisseur, la garde s'applique de la même façon.
    it("#3850.1 — un téléphone Apollo sans la forme d'un numéro n'est jamais écrit", async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: {
          matched: true,
          email: 'owen@dirigo.fr',
          email_status: 'verified',
          phone: '90480-000',
          linkedin_url: null,
        },
      })

      const result = await service.enrichContact('c1', 'user-1', { first_name: 'Owen', organization_name: 'Dirigo' })

      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output.phone).toBeFalsy()
      expect(repo._qb.set).toHaveBeenCalledWith(expect.not.objectContaining({ phone: expect.anything() }))
    })

    // ── #2988 — enrichissement ciblé PAR coordonnée (email pro seul / téléphone
    // pro seul) ─────────────────────────────────────────────────────────────
    //
    // Le dernier commentaire de l'épopée est explicite : un paramètre additif
    // de schéma ne suffit pas seul, il doit ARRÊTER l'écriture et le débit de
    // la coordonnée non demandée — même quand le fournisseur l'a rendue dans
    // le MÊME appel (Apollo répond souvent email+téléphone d'un coup).
    // ── #4178.1 — la NATURE du numéro écrit, jamais « pro » par déduction ────
    describe('#4178.1 — nature du numéro écrit', () => {
      const enrichWith = async (
        extra: Record<string, unknown>,
        contact: Record<string, unknown> = {},
      ): Promise<Record<string, unknown>> => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1', ...contact } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: null, email_status: null, phone: '+33611223344', linkedin_url: null, ...extra },
        })
        const result = await service.enrichContact('c1', 'user-1', {
          first_name: 'Owen',
          organization_name: 'Dirigo',
          only: 'phone',
        })
        expect(isSuccess(result)).toBe(true)
        return repo._qb.set.mock.calls[0]![0] as Record<string, unknown>
      }

      it('un mobile Apollo est écrit « inconnue », jamais pro d’après son format', async () => {
        const written = await enrichWith({ phone_numbers: [{ number: '+33611223344', type: 'mobile' }] })
        expect(written).toMatchObject({
          phone: '+33611223344',
          phone_nature: 'unknown',
          phone_nature_source: 'provider',
        })
      })

      it('une ligne typée « travail » par le fournisseur est écrite « déclarée »', async () => {
        const written = await enrichWith({ phone_numbers: [{ number: '+33611223344', type: 'work_direct' }] })
        expect(written).toMatchObject({ phone_nature: 'professional_declared' })
      })

      it('sans métadonnée : « inconnue »', async () => {
        const written = await enrichWith({})
        expect(written).toMatchObject({ phone_nature: 'unknown' })
      })

      it('une correction humaine n’est jamais écrasée', async () => {
        const written = await enrichWith(
          { phone_numbers: [{ number: '+33611223344', type: 'work_direct' }] },
          { phone_nature: 'personal', phone_nature_source: 'human' },
        )
        expect(written).not.toHaveProperty('phone_nature')
        expect(written).not.toHaveProperty('phone_nature_source')
      })
    })

    describe('#2988 — `only` (email | phone)', () => {
      it('only=email — le téléphone rendu par le même appel est GARDÉ (LOT 15/10) mais jamais facturé', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: {
            matched: true,
            email: 'owen@dirigo.fr',
            email_status: 'verified',
            phone: '+33600000000',
            linkedin_url: null,
          },
        })

        const result = await service.enrichContact('c1', 'user-1', {
          first_name: 'Owen',
          organization_name: 'Dirigo',
          only: 'email',
        })

        expect(isSuccess(result)).toBe(true)
        const written = repo._qb.set.mock.calls[0]![0]
        expect(written).toMatchObject({ email: 'owen@dirigo.fr', phone: '+33600000000' })
        expect(written).not.toHaveProperty('phone_cost_credits')
        if (isSuccess(result)) expect(result.output.phone).toBe('+33600000000')
      })

      it('only=phone — l’email rendu par le même appel est GARDÉ (LOT 15/10) mais jamais facturé', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: {
            matched: true,
            email: 'owen@dirigo.fr',
            email_status: 'verified',
            phone: '+33600000000',
            linkedin_url: null,
          },
        })

        const result = await service.enrichContact('c1', 'user-1', {
          first_name: 'Owen',
          organization_name: 'Dirigo',
          only: 'phone',
        })

        expect(isSuccess(result)).toBe(true)
        const written = repo._qb.set.mock.calls[0]![0]
        // LOT (15/10) DATA-A point 6 — déjà payé par le fournisseur : on le garde, sans confiance ni coût.
        expect(written).toMatchObject({ phone: '+33600000000', email: 'owen@dirigo.fr' })
        expect(written).not.toHaveProperty('email_confidence')
        expect(written).not.toHaveProperty('email_cost_credits')
        if (isSuccess(result)) expect(result.output.email).toBe('owen@dirigo.fr')
      })

      // Le cœur de la doctrine « aucun crédit débité pour une coordonnée non
      // demandée » : le fournisseur a répondu, mais SEULEMENT sur le champ
      // écarté — ce n'est donc pas une réponse à la question posée, et ça ne
      // vaut RIEN, ni écriture ni crédit.
      it('only=phone + le fournisseur ne rend QUE un email — l’email est gardé, rien n’est débité', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: 'owen@dirigo.fr', email_status: 'verified', phone: null, linkedin_url: null },
        })

        const result = await service.enrichContact('c1', 'user-1', {
          first_name: 'Owen',
          organization_name: 'Dirigo',
          only: 'phone',
        })

        expect(isSuccess(result)).toBe(true)
        expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
        if (isSuccess(result)) expect(result.output.credits_debited).toBe(0)
      })

      // LOT (15/10) DATA-A point 1 — Hunter/Lusha ne remplacent jamais l'e-mail d'Apollo.
      it('e-mail Apollo trouvé + repli fournisseur → l’e-mail Apollo n’est pas écrasé', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: 'owen@dirigo.fr', email_status: 'verified', phone: null, linkedin_url: null },
        })
        extraEnrichers.isEnabled.mockReturnValue(true)
        extraEnrichers.enrich.mockResolvedValueOnce({
          provider: 'hunter',
          email: 'autre@dirigo.fr',
          phone: '+33611111111',
        })

        await service.enrichContact('c1', 'user-1', { first_name: 'Owen', organization_name: 'Dirigo' })

        const written = repo._qb.set.mock.calls[0]![0]
        expect(written).toMatchObject({ email: 'owen@dirigo.fr' })
      })

      it('sans `only` — comportement historique inchangé (email ET téléphone écrits/facturés)', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: {
            matched: true,
            email: 'owen@dirigo.fr',
            email_status: 'verified',
            phone: '+33600000000',
            linkedin_url: null,
          },
        })

        const result = await service.enrichContact('c1', 'user-1', {
          first_name: 'Owen',
          organization_name: 'Dirigo',
        })

        expect(isSuccess(result)).toBe(true)
        expect(repo._qb.set).toHaveBeenCalledWith(
          expect.objectContaining({ email: 'owen@dirigo.fr', phone: '+33600000000' }),
        )
      })

      // Le fallback Dropcontact ne rend JAMAIS de téléphone (email FR de
      // dernier recours) — l'appeler pour `only: 'phone'` serait un appel
      // fournisseur pour une question qu'il ne peut structurellement pas
      // répondre. Doctrine : coordonnée non demandée = aucun appel fournisseur.
      it('only=phone — Dropcontact n’est PAS appelé (il ne rend jamais de téléphone)', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: false, email: null, email_status: null, phone: null, linkedin_url: null },
        })
        dropcontact.isEnabled.mockReturnValue(true)

        await service.enrichContact('c1', 'user-1', {
          first_name: 'Owen',
          organization_name: 'Dirigo',
          only: 'phone',
        })

        expect(dropcontact.enrich).not.toHaveBeenCalled()
      })

      it('only=phone — le relais aux enrichisseurs de secours transmet `only` (Hunter, email seul, doit être sauté)', async () => {
        const extraEnrichers = { isEnabled: jest.fn().mockReturnValue(true), enrich: jest.fn().mockResolvedValue(null) }
        const withExtra = new ContactsService(
          repo as never,
          userActions as never,
          ia as unknown as IaClient,
          credits as unknown as CreditsService,
          workspace as unknown as WorkspaceContextService,
          mailer as never,
          suppression as never,
          config as never,
          cadence as never,
          accounts as never,
          transitions as never,
          dropcontact as never,
          extraEnrichers as never,
          merges as never,
          brandsStub as never,
          undefined,
          undefined,
          provenance as never,
          sprintBus as never,
        )
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: false, email: null, email_status: null, phone: null, linkedin_url: null },
        })

        await withExtra.enrichContact('c1', 'user-1', {
          first_name: 'Owen',
          organization_name: 'Dirigo',
          only: 'phone',
        })

        expect(extraEnrichers.enrich).toHaveBeenCalledWith(
          expect.objectContaining({ only: 'phone' }),
          expect.anything(),
        )
      })
    })

    // ── Org scoping (retour Théo P0) — the account's clean Apollo anchors ───────
    it("scopes the IA enrich by the account's Apollo org id + domain + canonical name (not the entity label)", async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1', account_id: 'acc-1' } as ContactEntity)
      accounts.findOne.mockResolvedValueOnce({
        id: 'acc-1',
        user_id: 'user-1',
        company_name: 'Groupe TF1',
        website: 'https://www.tf1.fr/',
        apollo_enrichment: { organizationId: '54abc', domain: 'tf1.fr' },
      } as unknown as AccountEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: { matched: true, email: 'a@tf1.fr', email_status: 'verified', phone: null, linkedin_url: null },
      })

      // The web sends the messy entity sub-label as organization_name — it must
      // be overridden by the account's canonical name + strong anchors.
      await service.enrichContact('c1', 'user-1', {
        first_name: 'Julien',
        organization_name: 'TF1 PUB',
      })

      // #4731 — le compte est lu par l'ESPACE : le coéquipier garde l'ancrage Apollo du compte.
      expect(accounts.findOne).toHaveBeenCalledWith({
        where: [
          { id: 'acc-1', workspace_id: 'ws-1' },
          { id: 'acc-1', workspace_id: IsNull(), user_id: 'user-1' },
        ],
      })
      expect(ia.enrichContact).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationName: 'Groupe TF1',
          organizationId: '54abc',
          organizationDomain: 'tf1.fr',
        }),
        // 2e argument : lecture de l'en-tête de coûts (D19).
        expect.anything(),
      )
    })

    it('derives the org domain from the account website when Apollo has none', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1', account_id: 'acc-1' } as ContactEntity)
      accounts.findOne.mockResolvedValueOnce({
        id: 'acc-1',
        user_id: 'user-1',
        company_name: 'Doctolib',
        website: 'https://www.doctolib.fr/about',
        apollo_enrichment: null,
      } as unknown as AccountEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: { matched: true, email: 'a@doctolib.fr', email_status: 'verified', phone: null, linkedin_url: null },
      })

      await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Doctolib SAS' })

      expect(ia.enrichContact).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationName: 'Doctolib',
          organizationId: undefined,
          organizationDomain: 'doctolib.fr',
        }),
        // 2e argument : lecture de l'en-tête de coûts (D19).
        expect.anything(),
      )
      // Exactly one credit — no double debit across the cascade.
      expect(credits.consumeEnrichmentCredit).toHaveBeenCalledTimes(1)
    })

    // ── Person Apollo id (strongest key) forwarded from the persisted seed ─────
    it('forwards the persisted Apollo person id (raw_data.apolloId) + title as match keys', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 'c1',
        user_id: 'user-1',
        account_id: 'acc-1',
        title: 'CTO',
        raw_data: { apolloId: 'apollo-person-9' },
      } as unknown as ContactEntity)
      accounts.findOne.mockResolvedValueOnce({
        id: 'acc-1',
        user_id: 'user-1',
        company_name: 'Qonto',
        apollo_enrichment: { organizationId: 'org-1', domain: 'qonto.com' },
      } as unknown as AccountEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: { matched: true, email: 'a@qonto.com', email_status: 'verified', phone: null, linkedin_url: null },
      })

      await service.enrichContact('c1', 'user-1', { first_name: 'Julien', organization_name: 'QONTO SAS' })

      expect(ia.enrichContact).toHaveBeenCalledWith(
        expect.objectContaining({ apolloId: 'apollo-person-9', title: 'CTO' }),
        // 2e argument : lecture de l'en-tête de coûts (D19).
        expect.anything(),
      )
    })

    it('forwards apolloId undefined when the contact carries no persisted person id', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: { matched: false, email: null, email_status: null, phone: null, linkedin_url: null },
      })
      await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })
      expect(ia.enrichContact).toHaveBeenCalledWith(expect.objectContaining({ apolloId: undefined }), expect.anything())
    })

    // ── Photo Apollo (champ gratuit du même appel People-Match) ───────────────
    it('persists the Apollo photo alongside the reachability fields', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: {
          matched: true,
          email: 'a@b.com',
          email_status: 'verified',
          phone: null,
          linkedin_url: null,
          photo_url: 'https://cdn.apollo.io/p/jean.jpg',
        },
      })
      const result = await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })
      expect(isSuccess(result)).toBe(true)
      expect(repo._qb.set).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'a@b.com', photo_url: 'https://cdn.apollo.io/p/jean.jpg' }),
      )
      // The reachability match is what debits the credit — photo rides along free.
      expect(credits.consumeEnrichmentCredit).toHaveBeenCalledTimes(1)
    })

    it('a photo alone is persisted but NEVER burns a credit nor moves the lifecycle', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: {
          matched: true,
          email: null,
          email_status: null,
          phone: null,
          linkedin_url: null,
          photo_url: 'https://cdn.apollo.io/p/jean.jpg',
        },
      })
      await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })
      // La photo est persistée ; la trace d'idempotence l'accompagne désormais
      // systématiquement (elle n'est pas facturable non plus).
      const setArg = repo._qb.set.mock.calls[0]?.[0] as Record<string, unknown>
      expect(setArg.photo_url).toBe('https://cdn.apollo.io/p/jean.jpg')
      expect(setArg.last_enrichment_result).toBe('no_new_data')
      expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
      expect(transitions.insert).not.toHaveBeenCalled()
    })

    it('rafraîchit la photo : ces URL expirent, et le même appel payant en rend une valide', async () => {
      // La règle était « seulement si la colonne est vide ». Or ces URL sont
      // SIGNÉES : une photo collectée il y a des mois répond 403, l'écran montre
      // l'initiale, le commercial clique « Enrichir »… et on jetait l'URL
      // fraîche parce que la colonne n'était pas vide. C'est l'autre moitié du
      // « même quand je clique sur Enrichir » du retour bêta.
      repo.findOne.mockResolvedValueOnce({
        id: 'c1',
        user_id: 'user-1',
        photo_url: 'https://media.licdn.com/dms/image/ancienne?e=perimee',
      } as ContactEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: {
          matched: true,
          email: 'a@b.com',
          email_status: 'verified',
          phone: null,
          linkedin_url: null,
          photo_url: 'https://media.licdn.com/dms/image/fraiche?e=valide',
        },
      })
      await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })
      const setArg = repo._qb.set.mock.calls[0]?.[0] as Record<string, unknown>
      expect(setArg.photo_url).toBe('https://media.licdn.com/dms/image/fraiche?e=valide')
    })

    it('ne réécrit rien quand la photo rendue est exactement celle déjà stockée', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 'c1',
        user_id: 'user-1',
        photo_url: 'https://cdn.apollo.io/p/existing.jpg',
      } as ContactEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: {
          matched: true,
          email: 'a@b.com',
          email_status: 'verified',
          phone: null,
          linkedin_url: null,
          photo_url: 'https://cdn.apollo.io/p/existing.jpg',
        },
      })
      await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })
      const setArg = repo._qb.set.mock.calls[0]?.[0] as Record<string, unknown>
      expect('photo_url' in setArg).toBe(false)
    })

    it('ne persiste JAMAIS la silhouette générique — un contact sans photo garde son initiale', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: {
          matched: true,
          email: 'a@b.com',
          email_status: 'verified',
          phone: null,
          linkedin_url: null,
          // L'URL EXACTE du retour bêta : une image, mais celle de personne.
          photo_url: 'https://static.licdn.com/aero-v1/sc/h/9c8pery4andzj6ohjkjp54ma2',
        },
      })
      await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })
      const setArg = repo._qb.set.mock.calls[0]?.[0] as Record<string, unknown>
      expect('photo_url' in setArg).toBe(false)
    })

    it('n’écrase pas une vraie photo par une silhouette', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 'c1',
        user_id: 'user-1',
        photo_url: 'https://media.licdn.com/dms/image/vraie?e=1',
      } as ContactEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: {
          matched: true,
          email: 'a@b.com',
          email_status: 'verified',
          phone: null,
          linkedin_url: null,
          photo_url: 'https://static.licdn.com/aero-v1/sc/h/9c8pery4andzj6ohjkjp54ma2',
        },
      })
      await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })
      const setArg = repo._qb.set.mock.calls[0]?.[0] as Record<string, unknown>
      expect('photo_url' in setArg).toBe(false)
    })

    // ── Profil riche Apollo (parcours, formation, liens…) — JSONB apollo_enrichment ─
    it('persists the rich Apollo profile into apollo_enrichment + mirrors seniority/location', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: {
          matched: true,
          email: 'a@b.com',
          email_status: 'verified',
          phone: null,
          linkedin_url: 'https://linkedin.com/in/x',
          headline: 'CIO @ Veolia',
          seniority: 'c_suite',
          city: 'Paris',
          country: 'France',
          twitter_url: 'https://twitter.com/x',
          departments: ['information_technology'],
          functions: ['engineering'],
          employment_history: [{ organization_name: 'Veolia', title: 'CIO', current: true }],
          education: [{ school: 'Télécom Paris', degree: 'Ingénieur' }],
          personal_emails: ['x@gmail.com'],
          phone_numbers: [{ number: '+33611223344', type: 'mobile', status: 'valid' }],
        },
      })
      await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })
      const setArg = repo._qb.set.mock.calls[0]?.[0] as Record<string, unknown>
      expect(setArg.apollo_enrichment).toMatchObject({
        headline: 'CIO @ Veolia',
        seniority: 'c_suite',
        twitter_url: 'https://twitter.com/x',
        departments: ['information_technology'],
        employment_history: [{ organization_name: 'Veolia', title: 'CIO', current: true }],
        education: [{ school: 'Télécom Paris', degree: 'Ingénieur' }],
        personal_emails: ['x@gmail.com'],
        phone_numbers: [{ number: '+33611223344', type: 'mobile', status: 'valid' }],
      })
      // Mirrored into the existing scalar columns (only because they were empty).
      expect(setArg.seniority).toBe('c_suite')
      expect(setArg.location).toBe('Paris, France')
    })

    it('persists a profile-only Apollo response but NEVER burns a credit', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: {
          matched: true,
          email: null,
          email_status: null,
          phone: null,
          linkedin_url: null,
          headline: 'Head of Data',
          seniority: 'director',
        },
      })
      await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })
      const setArg = repo._qb.set.mock.calls[0]?.[0] as Record<string, unknown>
      expect(setArg.apollo_enrichment).toMatchObject({ headline: 'Head of Data', seniority: 'director' })
      // Free profile field of the same call — must never trigger the credit charge.
      expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
    })

    it('writes no apollo_enrichment key when Apollo returned no profile (present-only)', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: { matched: true, email: 'a@b.com', email_status: 'verified', phone: null, linkedin_url: null },
      })
      await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })
      const setArg = repo._qb.set.mock.calls[0]?.[0] as Record<string, unknown>
      expect('apollo_enrichment' in setArg).toBe(false)
    })

    it('does not clobber an existing seniority/location with the Apollo one', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 'c1',
        user_id: 'user-1',
        seniority: 'manager',
        location: 'Lyon',
      } as ContactEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: {
          matched: true,
          email: 'a@b.com',
          email_status: 'verified',
          phone: null,
          linkedin_url: null,
          seniority: 'c_suite',
          city: 'Paris',
          country: 'France',
        },
      })
      await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })
      const setArg = repo._qb.set.mock.calls[0]?.[0] as Record<string, unknown>
      // The scalar columns keep their existing value; the full truth still lands
      // in apollo_enrichment (self-contained snapshot).
      expect('seniority' in setArg).toBe(false)
      expect('location' in setArg).toBe(false)
      expect(setArg.apollo_enrichment).toMatchObject({ seniority: 'c_suite', city: 'Paris', country: 'France' })
    })

    // ── Identité incomplète : complétion via le fallback People-Search ─────────
    describe('incomplete-identity resolution', () => {
      it('forwards the contact title to the IA so the fallback can search by role', async () => {
        repo.findOne.mockResolvedValueOnce({
          id: 'c1',
          user_id: 'user-1',
          full_name: 'Isabelle',
          title: 'Global Head of Procurement',
        } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: false, email: null, email_status: null, phone: null, linkedin_url: null },
        })
        await service.enrichContact('c1', 'user-1', { first_name: 'Isabelle', organization_name: 'BNP Paribas' })
        expect(ia.enrichContact).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Global Head of Procurement', organizationName: 'BNP Paribas' }),
          // 2e argument : lecture de l'en-tête de coûts (D19).
          expect.anything(),
        )
      })

      it('overwrites a placeholder name with the REAL person the search resolved (+ 1 credit)', async () => {
        repo.findOne.mockResolvedValueOnce({
          id: 'c1',
          user_id: 'user-1',
          full_name: 'Isabelle', // role-persona placeholder
          title: 'Global Head of Procurement',
        } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: {
            matched: true,
            first_name: 'Marie-Claire',
            last_name: 'Durand',
            email: null,
            email_status: null,
            phone: null,
            linkedin_url: 'https://linkedin.com/in/mcdurand',
          },
        })
        const result = await service.enrichContact('c1', 'user-1', {
          first_name: 'Isabelle',
          organization_name: 'BNP Paribas',
        })
        expect(isSuccess(result)).toBe(true)
        // Real name resolved → placeholder overwritten (badge disappears client-side).
        expect(repo._qb.set).toHaveBeenCalledWith(
          expect.objectContaining({
            full_name: 'Marie-Claire Durand',
            linkedin_url: 'https://linkedin.com/in/mcdurand',
          }),
        )
        if (isSuccess(result)) expect(result.output.full_name).toBe('Marie-Claire Durand')
        // E1 (#3698, décision Louis 07/10) — renversement ASSUMÉ : on ne débite
        // QUE sur une coordonnée manquante trouvée. Une identité complétée sans
        // e-mail ni téléphone ne se facture plus.
        expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
      })

      it('charges a SINGLE credit when the fallback resolves both identity and email', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1', full_name: 'Isabelle' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: {
            matched: true,
            first_name: 'Marie-Claire',
            last_name: 'Durand',
            email: 'mc.durand@bnp.fr',
            email_status: 'verified',
            phone: null,
            linkedin_url: null,
          },
        })
        const result = await service.enrichContact('c1', 'user-1', {
          first_name: 'Isabelle',
          organization_name: 'BNP Paribas',
        })
        expect(isSuccess(result)).toBe(true)
        expect(repo._qb.set).toHaveBeenCalledWith(
          expect.objectContaining({ full_name: 'Marie-Claire Durand', email: 'mc.durand@bnp.fr' }),
        )
        expect(credits.consumeEnrichmentCredit).toHaveBeenCalledTimes(1)
      })

      it('never overwrites an already-complete name with the resolved one', async () => {
        repo.findOne.mockResolvedValueOnce({
          id: 'c1',
          user_id: 'user-1',
          full_name: 'Jean Dupont', // already complete (2 tokens)
          title: 'DSI',
        } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: {
            matched: true,
            first_name: 'Other',
            last_name: 'Person',
            email: 'a@b.com',
            email_status: 'verified',
            phone: null,
            linkedin_url: null,
          },
        })
        await service.enrichContact('c1', 'user-1', {
          first_name: 'Jean',
          last_name: 'Dupont',
          organization_name: 'Acme',
        })
        const setArg = repo._qb.set.mock.calls[0]?.[0] as Record<string, unknown>
        expect('full_name' in setArg).toBe(false)
      })
    })

    // ── Dropcontact fallback (env-gated, additive to Apollo) ──────────────────
    describe('Dropcontact fallback', () => {
      const emptyApollo = {
        data: { matched: false, email: null, email_status: null, phone: null, linkedin_url: null },
      }

      it('no-ops (Apollo intact) when no key is configured — Dropcontact never called', async () => {
        // Default mock: isEnabled() = false. Apollo matches email AND phone, so
        // there is nothing left for the fallback leg to chase — the whole block
        // short-circuits before even reading `isEnabled()`.
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: {
            matched: true,
            email: 'a@b.com',
            email_status: 'verified',
            phone: '+33 1 00 00 00 00',
            linkedin_url: null,
          },
        })
        const result = await service.enrichContact('c1', 'user-1', {
          first_name: 'Jean',
          organization_name: 'Acme',
        })
        expect(isSuccess(result)).toBe(true)
        expect(dropcontact.isEnabled).not.toHaveBeenCalled()
        expect(dropcontact.enrich).not.toHaveBeenCalled()
      })

      it('does NOT call Dropcontact when Apollo already matched email AND phone (even if enabled)', async () => {
        dropcontact.isEnabled.mockReturnValue(true)
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: {
            matched: true,
            email: 'apollo@b.com',
            email_status: 'verified',
            phone: '+33 1 00 00 00 00',
            linkedin_url: null,
          },
        })
        await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })
        expect(dropcontact.enrich).not.toHaveBeenCalled()
      })

      // #3022 (retour bêta Louis) — reproduit le bug rapporté : Apollo résout
      // l'email (son reveal EST demandé, `apollo.py` `_build_enrich_payload`)
      // mais jamais le téléphone (webhook hors scope, même fichier). Avant le
      // correctif, la garde ne testait QUE `Object.keys(updates).length === 0` :
      // un email déjà là rendait `updates` non vide, et TOUT le reste de la
      // cascade — Dropcontact ici — était sauté alors que le téléphone
      // manquait toujours.
      // LOT (15/10) DATA-A point 8 — le domaine du compte affine la résolution de Dropcontact (`website`).
      it('passe le domaine du compte à Dropcontact (website)', async () => {
        dropcontact.isEnabled.mockReturnValue(true)
        repo.findOne.mockResolvedValueOnce({
          id: 'c1',
          user_id: 'user-1',
          account_id: 'acc-1',
          full_name: 'Jean Dupont',
        } as ContactEntity)
        accounts.findOne.mockResolvedValueOnce({
          id: 'acc-1',
          company_name: 'Acme',
          website: 'https://www.acme.fr/about',
          raw_analysis: {},
        } as unknown as AccountEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: false, email: null, email_status: null, phone: null, linkedin_url: null },
        })
        dropcontact.enrich.mockResolvedValueOnce(null)
        await service.enrichContact('c1', 'user-1', {
          first_name: 'Jean',
          last_name: 'Dupont',
          organization_name: 'Acme',
        })
        expect(dropcontact.enrich).toHaveBeenCalledWith(expect.objectContaining({ website: 'acme.fr' }))
      })

      it('DOES call Dropcontact for the phone when Apollo found the email but NOT the phone (#3022)', async () => {
        dropcontact.isEnabled.mockReturnValue(true)
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1', full_name: 'Jean Dupont' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: 'apollo@b.com', email_status: 'verified', phone: null, linkedin_url: null },
        })
        dropcontact.enrich.mockResolvedValueOnce({
          matched: true,
          email: null,
          email_status: null,
          phone: '+33 6 12 34 56 78',
          linkedin_url: null,
          title: null,
          organization_name: 'Acme',
          city: null,
          country: null,
        })

        const result = await service.enrichContact('c1', 'user-1', {
          first_name: 'Jean',
          last_name: 'Dupont',
          organization_name: 'Acme',
        })

        expect(dropcontact.enrich).toHaveBeenCalledTimes(1)
        expect(isSuccess(result)).toBe(true)
        if (isSuccess(result)) {
          // Apollo's email is KEPT (present-only fold), Dropcontact's phone is ADDED.
          expect(result.output.email).toBe('apollo@b.com')
          expect(result.output.phone).toBe('+33612345678')
        }
      })

      it('does NOT call Dropcontact for the phone when the contact already HAS one on file', async () => {
        // The phone is "missing" from THIS round's Apollo fold, but the contact
        // already carries one from an earlier enrichment — chasing a paid
        // fallback for a number already known would be a wasted call.
        dropcontact.isEnabled.mockReturnValue(true)
        repo.findOne.mockResolvedValueOnce({
          id: 'c1',
          user_id: 'user-1',
          phone: '+33 1 99 99 99 99',
        } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: 'apollo@b.com', email_status: 'verified', phone: null, linkedin_url: null },
        })
        await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })
        expect(dropcontact.enrich).not.toHaveBeenCalled()
      })

      // #2297.54 — la GARDE du catalogue : quel que soit le fournisseur, aucune
      // clé de `ENRICHMENT_FORBIDDEN_FIELDS` n'atteint l'écriture ni la réponse.
      describe('#2297.54 — le catalogue des champs interdits, filtré à l’entrée', () => {
        const POISONED = {
          gender: 'female',
          birth_date: '1980-01-01',
          nationality: 'FR',
          employment_history: [{ title: 'DSI', organization_name: 'Acme', maritalStatus: 'married' }],
          education: [{ school: 'École', religion: 'x', home_address: '1 rue X' }],
        }
        const forbiddenKeysIn = (value: unknown, found: string[] = []): string[] => {
          if (Array.isArray(value)) value.forEach(item => forbiddenKeysIn(item, found))
          else if (value && typeof value === 'object') {
            for (const [key, item] of Object.entries(value)) {
              if (isEnrichmentForbiddenField(key)) found.push(key)
              forbiddenKeysIn(item, found)
            }
          }
          return found
        }

        it('la cascade IA (Apollo…) : rien du catalogue dans l’UPDATE ni dans la réponse', async () => {
          repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
          ia.enrichContact.mockResolvedValueOnce({
            data: {
              matched: true,
              email: 'a@b.com',
              email_status: 'verified',
              phone: null,
              linkedin_url: null,
              ...POISONED,
            },
          })
          const result = await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })
          const setArg = repo._qb.set.mock.calls[0]?.[0] as Record<string, unknown>
          // Le filtre sait dire NON sans emporter le reste : le parcours reste.
          expect(setArg.apollo_enrichment).toMatchObject({ employment_history: [{ title: 'DSI' }] })
          expect(forbiddenKeysIn(setArg)).toEqual([])
          expect(isSuccess(result) && forbiddenKeysIn(result.output)).toEqual([])
        })

        it('le repli Dropcontact : même filtre, même preuve', async () => {
          dropcontact.isEnabled.mockReturnValue(true)
          repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1', full_name: 'Jean Dupont' } as ContactEntity)
          ia.enrichContact.mockResolvedValueOnce(emptyApollo)
          dropcontact.enrich.mockResolvedValueOnce({
            matched: true,
            email: 'jean@acme.fr',
            email_status: 'unverified',
            phone: null,
            linkedin_url: null,
            title: 'DSI',
            organization_name: 'Acme',
            city: null,
            country: null,
            ...POISONED,
          })
          await service.enrichContact('c1', 'user-1', {
            first_name: 'Jean',
            last_name: 'Dupont',
            organization_name: 'Acme',
          })
          const setArg = repo._qb.set.mock.calls[0]?.[0] as Record<string, unknown>
          expect(setArg).toMatchObject({ email: 'jean@acme.fr', source: 'dropcontact' })
          expect(forbiddenKeysIn(setArg)).toEqual([])
        })
      })

      it('falls back to Dropcontact when Apollo finds nothing, stamps source=dropcontact + debits a credit', async () => {
        dropcontact.isEnabled.mockReturnValue(true)
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1', full_name: 'Jean Dupont' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce(emptyApollo)
        dropcontact.enrich.mockResolvedValueOnce({
          matched: true,
          email: 'jean@acme.fr',
          email_status: 'unverified',
          phone: null,
          linkedin_url: null,
          title: 'DSI',
          organization_name: 'Acme',
          city: null,
          country: null,
        })
        const result = await service.enrichContact('c1', 'user-1', {
          first_name: 'Jean',
          last_name: 'Dupont',
          organization_name: 'Acme',
        })
        expect(isSuccess(result)).toBe(true)
        if (isSuccess(result)) {
          expect(result.output.email).toBe('jean@acme.fr')
          expect(result.output.source).toBe('dropcontact')
          expect(result.output.enrichment.email).toBe('jean@acme.fr')
        }
        // The UPDATE carried source=dropcontact + the resolved poste.
        expect(repo._qb.set).toHaveBeenCalledWith(
          expect.objectContaining({ email: 'jean@acme.fr', source: 'dropcontact', title: 'DSI' }),
        )
        // Exactly one credit debited on the successful fallback.
        expect(credits.consumeEnrichmentCredit).toHaveBeenCalledTimes(1)
        // Lifecycle journalled against the resolving provider.
        expect(transitions.insert).toHaveBeenCalledWith(expect.objectContaining({ source: 'dropcontact' }))
      })

      it('does NOT overwrite an existing title with the Dropcontact poste', async () => {
        dropcontact.isEnabled.mockReturnValue(true)
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1', title: 'CTO' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce(emptyApollo)
        dropcontact.enrich.mockResolvedValueOnce({
          matched: true,
          email: 'jean@acme.fr',
          email_status: 'unverified',
          phone: null,
          linkedin_url: null,
          title: 'DSI',
          organization_name: 'Acme',
          city: null,
          country: null,
        })
        await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })
        const setArg = repo._qb.set.mock.calls[0]?.[0] as Record<string, unknown>
        expect(setArg).not.toHaveProperty('title')
        expect(setArg.source).toBe('dropcontact')
      })

      it('charges NO credit when neither Apollo nor Dropcontact match', async () => {
        dropcontact.isEnabled.mockReturnValue(true)
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce(emptyApollo)
        dropcontact.enrich.mockResolvedValueOnce(null)
        const result = await service.enrichContact('c1', 'user-1', {
          first_name: 'Jean',
          organization_name: 'Acme',
        })
        expect(isSuccess(result)).toBe(true)
        // #3822.3 (recette prod 08/10, W 5b4b10d2f3) — rien de débité ne veut
        // pas dire solde à zéro : le récapitulatif affichait « 0 crédit
        // restant » à côté d'un compteur latéral à 484 (deux sources de
        // solde). Sans débit, `credits_remaining` lit le solde RÉEL
        // (`CreditsService.getCredits`, la même source que le compteur
        // latéral) — jamais un 0 qui n'est que « aucun débit cette fois ».
        if (isSuccess(result)) expect(result.output.credits_remaining).toBe(42)
        expect(credits.getCredits).toHaveBeenCalledWith('user-1')
        expect(dropcontact.enrich).toHaveBeenCalledTimes(1)
        expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
        // L'écriture n'est plus « rien trouvé ⇒ rien écrit » : on persiste
        // désormais la trace de l'échec — c'est elle qui empêchera de reproposer
        // (et refacturer) ce même clic stérile. Aucun champ métier n'est touché.
        const setArg = repo._qb.set.mock.calls[0]?.[0] as Record<string, unknown>
        expect(setArg.last_enrichment_result).toBe('no_new_data')
        expect(setArg.email).toBeUndefined()
        expect(setArg.phone).toBeUndefined()
      })

      it('charges NO credit when Dropcontact returns matched:false with no reachable data', async () => {
        dropcontact.isEnabled.mockReturnValue(true)
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce(emptyApollo)
        dropcontact.enrich.mockResolvedValueOnce({
          matched: false,
          email: null,
          email_status: null,
          phone: null,
          linkedin_url: null,
          title: null,
          organization_name: null,
          city: null,
          country: null,
        })
        await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })
        expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
      })
    })

    // ── Hunter/Lusha fallback (dernier recours, env-gated) — #3022 ────────────
    describe('extraEnrichers (Hunter/Lusha) fallback', () => {
      it('no-ops (Apollo intact) when disabled (default) — never called', async () => {
        // Apollo matches email AND phone → nothing left to chase, the whole
        // fallback chain (Dropcontact then extraEnrichers) short-circuits
        // before either `isEnabled()` is even read.
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: {
            matched: true,
            email: 'apollo@b.com',
            email_status: 'verified',
            phone: '+33 1 00 00 00 00',
            linkedin_url: null,
          },
        })
        await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })
        expect(extraEnrichers.isEnabled).not.toHaveBeenCalled()
        expect(extraEnrichers.enrich).not.toHaveBeenCalled()
      })

      it('does NOT call it when Apollo already matched email AND phone', async () => {
        extraEnrichers.isEnabled.mockReturnValue(true)
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: {
            matched: true,
            email: 'apollo@b.com',
            email_status: 'verified',
            phone: '+33 1 00 00 00 00',
            linkedin_url: null,
          },
        })
        await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })
        expect(extraEnrichers.enrich).not.toHaveBeenCalled()
      })

      // #3022 — même correctif que Dropcontact ci-dessus, un cran plus loin dans
      // la cascade : Apollo a trouvé l'email mais pas le téléphone, ni Dropcontact
      // (désactivé ici) ; Hunter/Lusha sont le DERNIER recours et doivent quand
      // même être essayés pour le téléphone.
      it('DOES call it for the phone when Apollo found the email but NOT the phone', async () => {
        extraEnrichers.isEnabled.mockReturnValue(true)
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: 'apollo@b.com', email_status: 'verified', phone: null, linkedin_url: null },
        })
        extraEnrichers.enrich.mockResolvedValueOnce({ provider: 'lusha', phone: '+33 6 99 88 77 66' })

        const result = await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

        expect(extraEnrichers.enrich).toHaveBeenCalledTimes(1)
        expect(isSuccess(result)).toBe(true)
        if (isSuccess(result)) {
          expect(result.output.email).toBe('apollo@b.com')
          expect(result.output.phone).toBe('+33699887766')
        }
      })

      it('does NOT call it for the phone when the contact already HAS one on file', async () => {
        extraEnrichers.isEnabled.mockReturnValue(true)
        repo.findOne.mockResolvedValueOnce({
          id: 'c1',
          user_id: 'user-1',
          phone: '+33 1 99 99 99 99',
        } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: 'apollo@b.com', email_status: 'verified', phone: null, linkedin_url: null },
        })
        await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })
        expect(extraEnrichers.enrich).not.toHaveBeenCalled()
      })
    })

    // ── E1 (07/10/2026, #3698, #3822) — téléphone + e-mail + LinkedIn ─────────
    // Ordre décidé par Louis : Apollo (match) → FullEnrich si téléphone OU
    // e-mail manque → révélation du mobile Apollo (webhook) seulement si le
    // téléphone manque toujours. État par coordonnée écrit, débit uniquement
    // sur une coordonnée manquante trouvée.
    describe('E1 — cascade complète et état par coordonnée', () => {
      let phoneReveal: { isConfigured: jest.Mock; request: jest.Mock }
      beforeEach(() => {
        phoneReveal = {
          isConfigured: jest.fn().mockReturnValue(true),
          request: jest.fn().mockResolvedValue({ state: 'pending' }),
        }
        Object.assign(service, { phoneReveal })
        extraEnrichers.isEnabled.mockReturnValue(true)
      })

      const coordinatesWritten = (): Record<string, { state: string; sources_queried: number }> | undefined => {
        const call = repo._qb.set.mock.calls.find(
          ([value]) => value && typeof value === 'object' && 'enrichment_coordinates' in (value as object),
        )
        return (call?.[0] as { enrichment_coordinates?: Record<string, { state: string; sources_queried: number }> })
          ?.enrichment_coordinates
      }

      it('FullEnrich interrogé quand l’e-mail manque alors que le téléphone est déjà là', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1', phone: '+33 1 99 99 99 99' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: null, email_status: null, phone: null, linkedin_url: null },
        })
        extraEnrichers.enrich.mockResolvedValueOnce({ provider: 'fullenrich', email: 'jean@acme.fr' })

        const result = await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

        expect(extraEnrichers.enrich).toHaveBeenCalledWith(
          expect.objectContaining({ have: { email: false, phone: true } }),
          expect.anything(),
        )
        expect(isSuccess(result) && result.output.email).toBe('jean@acme.fr')
        expect(phoneReveal.request).not.toHaveBeenCalled()
      })

      it('persiste le LinkedIn rendu par une source de secours quand la fiche n’en a pas — sans débit pour lui seul', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1', email: 'a@b.fr' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: 'a@b.fr', email_status: 'verified', phone: null, linkedin_url: null },
        })
        extraEnrichers.enrich.mockResolvedValueOnce({
          provider: 'fullenrich',
          linkedinUrl: 'https://www.linkedin.com/in/jean',
        })

        const result = await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

        expect(isSuccess(result) && result.output.linkedin_url).toBe('https://www.linkedin.com/in/jean')
        expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
      })

      it('n’écrase jamais un LinkedIn déjà présent', async () => {
        repo.findOne.mockResolvedValueOnce({
          id: 'c1',
          user_id: 'user-1',
          email: 'a@b.fr',
          linkedin_url: 'https://www.linkedin.com/in/original',
        } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: 'a@b.fr', email_status: 'verified', phone: null, linkedin_url: null },
        })
        extraEnrichers.enrich.mockResolvedValueOnce({
          provider: 'fullenrich',
          linkedinUrl: 'https://www.linkedin.com/in/x',
        })

        const result = await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

        expect(isSuccess(result) && result.output.linkedin_url).toBe('https://www.linkedin.com/in/original')
      })

      it('téléphone toujours absent après FullEnrich ⇒ révélation du mobile demandée, état « en attente », AUCUN débit', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1', email: 'a@b.fr' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: 'a@b.fr', email_status: 'verified', phone: null, linkedin_url: null },
        })
        extraEnrichers.enrich.mockImplementationOnce(async (_query: unknown, report?: { attempts: unknown[] }) => {
          report?.attempts.push({ source: 'fullenrich', coordinate: 'phone', outcome: 'not_found' })
          return null
        })

        const result = await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

        expect(phoneReveal.request).toHaveBeenCalledWith(
          { id: 'c1', workspace_id: null },
          expect.objectContaining({ firstName: 'Jean', organizationName: 'Acme' }),
          { debited: false, free: false },
        )
        expect(coordinatesWritten()?.phone?.state).toBe('pending')
        expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()

        // #3782 — RÉGRESSION bêta 06/10 : CETTE sortie exacte du service
        // (téléphone vide, mais `last_enrichment_at` posé par le match sur
        // l'e-mail — `matched` est vrai) est ce que la fiche contact lit pour
        // calculer le statut affiché. Sans le statut `pending` (ajouté par ce
        // correctif), `computeContactFieldStatus` retombait sur `not_found` —
        // la fiche aurait dit « numéro introuvable » alors que ce même retour
        // porte une révélation encore EN VOL (`enrichment_coordinates.phone.state
        // === 'pending'`). Le service et l'écran doivent s'accorder : une
        // attente ne devient jamais un « non trouvé ».
        expect(isSuccess(result)).toBe(true)
        if (isSuccess(result)) {
          const { output } = result
          expect(output.last_enrichment_at).toBeTruthy()
          expect(output.phone).toBeFalsy()
          expect(output.enrichment_coordinates?.phone?.state).toBe('pending')
          expect(
            computeContactFieldStatus({
              value: output.phone,
              enrichmentAttempted: Boolean(output.last_enrichment_at),
              pending: output.enrichment_coordinates?.phone?.state === 'pending',
              errored: output.enrichment_coordinates?.phone?.state === 'unknown',
            }),
          ).toBe('pending')
        }
      })

      // #3850.2 — mesuré en prod le 08/10 : 18 recherches FullEnrich sur 19
      // restaient `unknown` (sonde bornée expirée) sans jamais reprendre leur
      // sonde, parce que ce round armait le cooldown de 30 jours sur une
      // question qui n'avait, en réalité, jamais été posée jusqu'au bout — le
      // même traitement qu'une cascade tronquée par budget (voir plus haut),
      // mais déclenché cette fois par le `async_lookup` que FullEnrich laisse
      // derrière lui.
      it("#3850.2 — un FullEnrich resté `unknown` (sonde à reprendre) n'arme pas le cooldown de 30 jours", async () => {
        phoneReveal.isConfigured.mockReturnValue(false)
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: false, email: null, email_status: null, phone: null, linkedin_url: null },
        })
        extraEnrichers.enrich.mockImplementationOnce(
          async (_query: unknown, report?: { attempts: unknown[]; asyncLookup?: { id: string } }) => {
            report?.attempts.push({ source: 'fullenrich', coordinate: 'phone', outcome: 'unknown' })
            if (report) report.asyncLookup = { id: 'fe-123' }
            return null
          },
        )

        const result = await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

        expect(isSuccess(result)).toBe(true)
        // Aucune trace de résultat (`no_new_data`/`matched`…) : le bouton reste
        // disponible, et surtout la sonde reste reprenable au prochain clic.
        const resultWrite = repo._qb.set.mock.calls.find(
          (call: unknown[]) => (call[0] as Record<string, unknown>).last_enrichment_result !== undefined,
        )
        expect(resultWrite).toBeUndefined()
        expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
        // L'état se NOMME quand même à l'écran plutôt qu'un silence.
        expect(coordinatesWritten()?.phone?.state).toBe('unknown')
        // L'identifiant à reprendre est écrit — sinon le passage suivant
        // repartirait d'une recherche FullEnrich neuve, payée une seconde fois.
        const tracePatchCall = repo._qb.setParameter.mock.calls.find(([key]: [string]) => key === 'tracePatch')
        const tracePatch = JSON.parse(tracePatchCall?.[1] as string)
        expect(tracePatch.async_lookup).toEqual({ id: 'fe-123', requested_at: expect.any(String) })
      })

      it('introuvable PARTOUT ⇒ « introuvable chez N sources » (N = sources interrogées), aucun débit', async () => {
        phoneReveal.request.mockResolvedValue({ state: 'not_found' })
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: false, email: null, email_status: null, phone: null, linkedin_url: null },
        })
        extraEnrichers.enrich.mockImplementationOnce(async (_query: unknown, report?: { attempts: unknown[] }) => {
          report?.attempts.push(
            { source: 'fullenrich', coordinate: 'email', outcome: 'not_found' },
            { source: 'fullenrich', coordinate: 'phone', outcome: 'not_found' },
          )
          return null
        })

        const result = await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

        expect(coordinatesWritten()?.phone).toMatchObject({ state: 'not_found', sources_queried: 2 })
        expect(coordinatesWritten()?.email).toMatchObject({ state: 'not_found', sources_queried: 2 })
        expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
        if (isSuccess(result)) expect(result.output.credits_debited).toBe(0)
      })

      it('trouvé ⇒ débit UNE fois, et la révélation (si elle part) sait que c’est déjà débité', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: 'a@b.fr', email_status: 'verified', phone: null, linkedin_url: null },
        })
        extraEnrichers.enrich.mockResolvedValueOnce(null)

        await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

        expect(credits.consumeEnrichmentCredit).toHaveBeenCalledTimes(1)
        expect(phoneReveal.request).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), expect.anything(), {
          debited: true,
          free: false,
        })
      })

      it('only: "email" ⇒ jamais de révélation du mobile', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: false, email: null, email_status: null, phone: null, linkedin_url: null },
        })
        extraEnrichers.enrich.mockResolvedValueOnce(null)

        await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme', only: 'email' })

        expect(phoneReveal.request).not.toHaveBeenCalled()
      })

      it('sans révélation configurée : rien ne part, l’état reste vrai', async () => {
        phoneReveal.isConfigured.mockReturnValue(false)
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1', email: 'a@b.fr' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: 'a@b.fr', email_status: 'verified', phone: null, linkedin_url: null },
        })
        extraEnrichers.enrich.mockResolvedValueOnce(null)

        await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

        expect(phoneReveal.request).not.toHaveBeenCalled()
        expect(coordinatesWritten()?.phone).toMatchObject({ state: 'not_found', sources_queried: 1 })
      })
    })

    // ── Idempotence (défaut #2) ───────────────────────────────────────────────
    // Le provider re-renvoyant ce qu'on a déjà ne vaut PAS un crédit, et une
    // re-tentative connue-stérile ne doit même pas partir. Règle partagée avec
    // le web : `enrichmentCooldown` (@bellum/contracts).
    describe('idempotence', () => {
      const apolloSameEmail = {
        data: { matched: true, email: 'a@b.com', email_status: 'verified', phone: null, linkedin_url: null },
      }

      it('does NOT debit when the provider only re-returns data the contact already has', async () => {
        // Le bug de prod : Apollo re-renvoie l'email connu, `updates` est non
        // vide → un crédit partait pour zéro information nouvelle.
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1', email: 'a@b.com' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce(apolloSameEmail)

        const result = await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

        expect(isSuccess(result)).toBe(true)
        expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
      })

      // E1 (#3698, décision Louis 07/10, point 4) — renversement ASSUMÉ : on ne
      // débite QUE si une coordonnée MANQUANTE est trouvée. Rafraîchir une
      // adresse déjà présente ne se facture plus (ce test disait l'inverse).
      it('does NOT debit when the provider only REFRESHES a value the contact already had (E1)', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1', email: 'old@b.com' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce(apolloSameEmail)

        const result = await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

        expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
        if (isSuccess(result)) expect(result.output.credits_debited).toBe(0)
      })

      it('DOES debit when a MISSING coordinate is found (E1)', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1', email: null } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce(apolloSameEmail)

        await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

        expect(credits.consumeEnrichmentCredit).toHaveBeenCalledTimes(1)
      })

      it('#3549 — `free` (rattrapage) : ni pré-contrôle de crédits, ni débit, ni coût inscrit sur la fiche', async () => {
        // Un correctif de collecte rattrape l'existant À NOTRE charge : un espace
        // sans crédit est quand même rattrapé, et la fiche ne porte aucun coût.
        credits.hasEnrichmentCredit.mockResolvedValue(false)
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: {
            matched: true,
            email: 'a@b.com',
            email_status: 'verified',
            phone: '+33 6 11 22 33 44',
            linkedin_url: null,
          },
        })

        const result = await service.enrichContact('c1', 'user-1', {
          first_name: 'Jean',
          organization_name: 'Acme',
          free: true,
        })

        expect(isSuccess(result)).toBe(true)
        expect(credits.hasEnrichmentCredit).not.toHaveBeenCalled()
        expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
        if (isSuccess(result)) {
          expect(result.output.phone).toBe('+33611223344')
          expect(result.output.credits_debited).toBe(0)
          expect(result.output.email_cost_credits).toBeUndefined()
        }
      })

      it('persists the attempt trace (date, provider, result, remaining gaps) on a match', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce(apolloSameEmail)

        await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

        const setArg = repo._qb.set.mock.calls[0]?.[0] as Record<string, unknown>
        expect(setArg.last_enrichment_result).toBe('matched')
        expect(setArg.last_enrichment_provider).toBe('apollo')
        expect(setArg.last_enrichment_at).toBeInstanceOf(Date)
        // L'email est arrivé, il ne reste que LinkedIn + téléphone.
        expect(setArg.last_enrichment_missing).toEqual(['linkedin', 'phone'])
        // #2159.62 — un MATCH reconfirme l'emploi de la personne (même
        // organisation retrouvée par le fournisseur) : la date de vérification
        // avance avec la trace de la tentative, jamais un second calcul.
        expect(setArg.employment_verified_at).toBeInstanceOf(Date)
      })

      it('persists a no_new_data trace even when the provider found nothing at all', async () => {
        // Sans écriture dans ce cas, rien ne mémoriserait l'échec → l'action
        // serait reproposée en boucle. C'est le cœur du défaut.
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1', email: 'a@b.com' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: false, email: null, email_status: null, phone: null, linkedin_url: null },
        })

        await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

        const setArg = repo._qb.set.mock.calls[0]?.[0] as Record<string, unknown>
        expect(setArg.last_enrichment_result).toBe('no_new_data')
        expect(setArg.last_enrichment_missing).toEqual(['linkedin', 'phone'])
        expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
        // #2159.62 — un fournisseur qui n'a RIEN retrouvé ne reconfirme rien
        // sur l'employeur : la vérification n'avance pas sur un essai stérile.
        expect(setArg).not.toHaveProperty('employment_verified_at')
      })

      it('refuses a known-sterile retry: no provider call, no debit', async () => {
        repo.findOne.mockResolvedValueOnce({
          id: 'c1',
          user_id: 'user-1',
          email: 'a@b.com',
          last_enrichment_at: new Date(Date.now() - 3 * 86_400_000),
          last_enrichment_result: 'no_new_data',
          last_enrichment_missing: ['linkedin', 'phone'],
        } as ContactEntity)

        const result = await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

        expect(isFailure(result)).toBe(true)
        if (isFailure(result)) expect(result.problem.code).toBe('enrichment_unchanged')
        expect(ia.enrichContact).not.toHaveBeenCalled()
        expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
      })

      it('lets an explicit force override the cooldown (« réessayer quand même »)', async () => {
        repo.findOne.mockResolvedValueOnce({
          id: 'c1',
          user_id: 'user-1',
          email: 'a@b.com',
          last_enrichment_at: new Date(Date.now() - 3 * 86_400_000),
          last_enrichment_result: 'no_new_data',
          last_enrichment_missing: ['linkedin', 'phone'],
        } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce(apolloSameEmail)

        await service.enrichContact('c1', 'user-1', {
          first_name: 'Jean',
          organization_name: 'Acme',
          force: true,
        })

        expect(ia.enrichContact).toHaveBeenCalled()
      })

      it('reopens the door once the cooldown has elapsed — never a permanent block', async () => {
        repo.findOne.mockResolvedValueOnce({
          id: 'c1',
          user_id: 'user-1',
          email: 'a@b.com',
          last_enrichment_at: new Date(Date.now() - 40 * 86_400_000),
          last_enrichment_result: 'no_new_data',
          last_enrichment_missing: ['linkedin', 'phone'],
        } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce(apolloSameEmail)

        await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

        expect(ia.enrichContact).toHaveBeenCalled()
      })

      it('reopens the door as soon as the gaps changed (the rep filled a channel by hand)', async () => {
        repo.findOne.mockResolvedValueOnce({
          id: 'c1',
          user_id: 'user-1',
          email: 'a@b.com',
          phone: '+33600000000', // saisi à la main depuis la tentative vide
          last_enrichment_at: new Date(Date.now() - 3 * 86_400_000),
          last_enrichment_result: 'no_new_data',
          last_enrichment_missing: ['linkedin', 'phone'],
        } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce(apolloSameEmail)

        await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

        expect(ia.enrichContact).toHaveBeenCalled()
      })

      it('still never bills a photo-only / profile-only response (existing guarantee kept)', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1', email: 'a@b.com' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: {
            matched: true,
            email: 'a@b.com',
            email_status: 'verified',
            phone: null,
            linkedin_url: null,
            photo_url: 'https://cdn/photo.jpg',
            headline: 'CTO chez Acme',
          },
        })

        await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

        const setArg = repo._qb.set.mock.calls[0]?.[0] as Record<string, unknown>
        // La photo est bien persistée…
        expect(setArg.photo_url).toBe('https://cdn/photo.jpg')
        // …mais ne déclenche à elle seule aucun débit.
        expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
      })
    })

    /**
     * THE CREDIT QUESTION.
     *
     * CLAUDE.md promises « 1 crédit d'enrichissement par succès », « 0 résultat
     * = 0 débit ». A provider ERROR is a third case the promise never names, and
     * it is the one the seller hit in production: the cascade blew up and the
     * toast said « API error ». If that click had also cost a credit, the user
     * would have paid for an outage.
     *
     * These tests are the answer, and they are the ones that must never go red.
     */
    describe('credit safety on a provider failure', () => {
      const iaFailure = (code: string): TechnicalError =>
        new TechnicalError('HTTP request failed', {
          cause: new HttpError(502, JSON.stringify({ detail: { message: 'boom', code } }), false, '/phase/2/enrich'),
        })

      it.each(['unauthorized', 'quota_exceeded', 'rate_limited', 'missing_api_key', 'upstream_error'])(
        'debits NOTHING when the provider fails with %s',
        async code => {
          repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
          ia.enrichContact.mockRejectedValueOnce(iaFailure(code))

          const result = await service.enrichContact('c1', 'user-1', {
            first_name: 'Gilles',
            last_name: 'Denoyel',
            organization_name: 'EDF',
          })

          expect(isFailure(result)).toBe(true)
          expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
        },
      )

      // #3698.6 — l'équipe est prévenue quand la panne vient de NOTRE côté.
      describe('operator alert', () => {
        const buildWithAlert = (outageAlert: jest.Mock) =>
          new ContactsService(
            repo as never,
            userActions as never,
            ia as unknown as IaClient,
            credits as unknown as CreditsService,
            workspace as unknown as WorkspaceContextService,
            mailer as never,
            suppression as never,
            config as never,
            cadence as never,
            accounts as never,
            transitions as never,
            dropcontact as never,
            extraEnrichers as never,
            merges as never,
            brandsStub as never,
            undefined,
            undefined,
            provenance as never,
            sprintBus as never,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            outageAlert as never,
          )
        const dto = { first_name: 'Gilles', last_name: 'Denoyel', organization_name: 'EDF' }

        it.each(['unauthorized', 'quota_exceeded', 'missing_api_key', 'upstream_error'])(
          'warns the team once when the provider fails with %s',
          async code => {
            const alert = jest.fn().mockResolvedValue(undefined)
            repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
            ia.enrichContact.mockRejectedValueOnce(iaFailure(code))
            await buildWithAlert(alert).enrichContact('c1', 'user-1', dto)
            expect(alert).toHaveBeenCalledTimes(1)
            expect(alert).toHaveBeenCalledWith(code)
          },
        )

        it('does not page the team for a passing rate limit', async () => {
          const alert = jest.fn().mockResolvedValue(undefined)
          repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
          ia.enrichContact.mockRejectedValueOnce(iaFailure('rate_limited'))
          await buildWithAlert(alert).enrichContact('c1', 'user-1', dto)
          expect(alert).not.toHaveBeenCalled()
        })

        it('an alert channel that throws never changes the answer the seller gets', async () => {
          const alert = jest.fn().mockRejectedValue(new Error('smtp down'))
          repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
          ia.enrichContact.mockRejectedValueOnce(iaFailure('upstream_error'))
          const result = await buildWithAlert(alert).enrichContact('c1', 'user-1', dto)
          expect(isFailure(result)).toBe(true)
          if (isFailure(result)) expect(result.problem.code).toBe('enrichment_unavailable')
        })
      })

      // Cascade d'enrichissement (décision Louis 01/11/2026) : Apollo à sec (422 « insufficient
      // credits », 402, plan refusé) = Apollo INDISPONIBLE pour cet appel, pas la fin de la cascade.
      describe('Apollo à sec — les autres sources prennent le relais', () => {
        const apolloDry = (status: number, body: unknown): TechnicalError =>
          new TechnicalError('HTTP request failed', {
            cause: new HttpError(status, JSON.stringify(body), false, '/phase/2/enrich'),
          })
        const dryCredits = (): TechnicalError =>
          apolloDry(502, {
            detail: {
              message: 'Apollo upstream_error [HTTP 422] (enrich name_org) — "You have insufficient credits!"',
              code: 'upstream_error',
            },
          })
        const dto = { first_name: 'Gilles', last_name: 'Denoyel', organization_name: 'EDF' }

        it('Apollo 422 crédits + FullEnrich/Kaspr trouve → succès, source nommée, alerte de panne partie', async () => {
          const alert = jest.fn().mockResolvedValue(undefined)
          repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
          ia.enrichContact.mockRejectedValueOnce(dryCredits())
          extraEnrichers.isEnabled.mockReturnValue(true)
          extraEnrichers.enrich.mockResolvedValueOnce({ provider: 'kaspr', email: 'gilles@edf.fr', phone: null })
          const svc = new ContactsService(
            repo as never,
            userActions as never,
            ia as unknown as IaClient,
            credits as unknown as CreditsService,
            workspace as unknown as WorkspaceContextService,
            mailer as never,
            suppression as never,
            config as never,
            cadence as never,
            accounts as never,
            transitions as never,
            dropcontact as never,
            extraEnrichers as never,
            merges as never,
            brandsStub as never,
            undefined,
            undefined,
            provenance as never,
            sprintBus as never,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            alert as never,
          )

          const result = await svc.enrichContact('c1', 'user-1', dto)

          expect(extraEnrichers.enrich).toHaveBeenCalledTimes(1)
          expect(isSuccess(result)).toBe(true)
          expect(repo._qb.set).toHaveBeenCalledWith(expect.objectContaining({ email: 'gilles@edf.fr' }))
          expect(alert).toHaveBeenCalledTimes(1)
        })

        it('Apollo 402 → les sources suivantes sont essayées aussi', async () => {
          repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
          ia.enrichContact.mockRejectedValueOnce(apolloDry(402, {}))
          extraEnrichers.isEnabled.mockReturnValue(true)
          extraEnrichers.enrich.mockResolvedValueOnce({ provider: 'fullenrich', email: 'g@edf.fr', phone: null })
          const result = await service.enrichContact('c1', 'user-1', dto)
          expect(extraEnrichers.enrich).toHaveBeenCalledTimes(1)
          expect(isSuccess(result)).toBe(true)
        })

        it('Apollo à sec + toutes les autres sources vides → échec actuel, aucun débit', async () => {
          repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
          ia.enrichContact.mockRejectedValueOnce(dryCredits())
          extraEnrichers.isEnabled.mockReturnValue(true)
          extraEnrichers.enrich.mockResolvedValueOnce(null)
          const result = await service.enrichContact('c1', 'user-1', dto)
          expect(isFailure(result)).toBe(true)
          if (isFailure(result)) expect(result.problem.code).toBe('enrichment_unavailable')
          expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
        })

        it('source sans clé (isEnabled faux) → jamais appelée, échec actuel', async () => {
          repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
          ia.enrichContact.mockRejectedValueOnce(dryCredits())
          extraEnrichers.isEnabled.mockReturnValue(false)
          const result = await service.enrichContact('c1', 'user-1', dto)
          expect(extraEnrichers.enrich).not.toHaveBeenCalled()
          expect(isFailure(result)).toBe(true)
        })

        it('un timeout n’est pas Apollo à sec : aucune autre source, échec actuel', async () => {
          repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
          ia.enrichContact.mockRejectedValueOnce(iaFailure('network_error'))
          extraEnrichers.isEnabled.mockReturnValue(true)
          const result = await service.enrichContact('c1', 'user-1', dto)
          expect(extraEnrichers.enrich).not.toHaveBeenCalled()
          expect(isFailure(result)).toBe(true)
        })
      })

      it('names the reason instead of leaving the body empty', async () => {
        // The defect in one assertion: the endpoint must never answer a failure
        // with nothing to say. `extractError`'s « API error » fallback is only
        // reachable when the server produces no message at all.
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockRejectedValueOnce(iaFailure('unauthorized'))

        const result = await service.enrichContact('c1', 'user-1', {
          first_name: 'Gilles',
          last_name: 'Denoyel',
          organization_name: 'EDF',
        })

        expect(isFailure(result)).toBe(true)
        if (isFailure(result)) {
          expect(result.problem.code).toBe('enrichment_unavailable')
          expect(result.problem.reason).toBe('unauthorized')
          expect(result.problem.message.length).toBeGreaterThan(0)
        }
      })

      it('does not write a « rien trouvé » trace when the provider never answered', async () => {
        // Persisting `last_enrichment_result = 'no_new_data'` here would record
        // an outage as a fact about this person — and the idempotence cooldown
        // would then refuse the retry that might actually work once Apollo is back.
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockRejectedValueOnce(iaFailure('upstream_error'))

        await service.enrichContact('c1', 'user-1', {
          first_name: 'Gilles',
          last_name: 'Denoyel',
          organization_name: 'EDF',
        })

        const errorWrite = repo._qb.set.mock.calls.find(
          (call: unknown[]) => (call[0] as Record<string, unknown>).last_enrichment_result !== undefined,
        )
        expect(errorWrite).toBeUndefined()
      })

      // #3822.2 — la panne se NOMME, par coordonnée, pour que la liste la
      // distingue d'un « recherché sans résultat » (`not_found`) après reload.
      it('#3822.2 — nomme la panne par coordonnée, sans toucher au cooldown', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockRejectedValueOnce(iaFailure('upstream_error'))

        await service.enrichContact('c1', 'user-1', {
          first_name: 'Gilles',
          last_name: 'Denoyel',
          organization_name: 'EDF',
        })

        // Intégration J1 — une seule source d'état : `enrichment_coordinates`
        // d'E1, la panne y est `unknown` (jamais `not_found`), 0 source répondue.
        expect(repo._qb.set).toHaveBeenCalledWith({
          enrichment_coordinates: {
            email: { state: 'unknown', sources_queried: 0, at: expect.any(String) },
            phone: { state: 'unknown', sources_queried: 0, at: expect.any(String) },
          },
        })
      })

      it('#3822.2 — ne nomme en panne QUE la coordonnée ciblée (`only`)', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockRejectedValueOnce(iaFailure('upstream_error'))

        await service.enrichContact('c1', 'user-1', {
          first_name: 'Gilles',
          last_name: 'Denoyel',
          organization_name: 'EDF',
          only: 'phone',
        })

        expect(repo._qb.set).toHaveBeenCalledWith({
          enrichment_coordinates: { phone: { state: 'unknown', sources_queried: 0, at: expect.any(String) } },
        })
      })

      it('#3822.2 — une coordonnée déjà renseignée garde son état malgré la panne', async () => {
        const found = { state: 'found', sources_queried: 1, at: '2026-10-01T09:00:00.000Z' } as const
        repo.findOne.mockResolvedValueOnce({
          id: 'c1',
          user_id: 'user-1',
          email: 'gilles@edf.fr',
          enrichment_coordinates: { email: found },
        } as ContactEntity)
        ia.enrichContact.mockRejectedValueOnce(iaFailure('upstream_error'))

        await service.enrichContact('c1', 'user-1', {
          first_name: 'Gilles',
          last_name: 'Denoyel',
          organization_name: 'EDF',
        })

        expect(repo._qb.set).toHaveBeenCalledWith({
          enrichment_coordinates: {
            email: found,
            phone: { state: 'unknown', sources_queried: 0, at: expect.any(String) },
          },
        })
      })

      it("#3822.2 — une panne qui ne peut pas s'écrire ne change pas la réponse d'échec", async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockRejectedValueOnce(iaFailure('upstream_error'))
        repo._qb.execute.mockRejectedValueOnce(new Error('db down'))

        const result = await service.enrichContact('c1', 'user-1', {
          first_name: 'Gilles',
          last_name: 'Denoyel',
          organization_name: 'EDF',
        })

        expect(isFailure(result)).toBe(true)
        if (isFailure(result)) expect(result.problem.code).toBe('enrichment_unavailable')
      })

      it('an outage and a genuine miss do not render alike', async () => {
        // The distinction the whole PR exists to preserve, asserted side by side.
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockRejectedValueOnce(iaFailure('unauthorized'))
        const outage = await service.enrichContact('c1', 'user-1', {
          first_name: 'Gilles',
          organization_name: 'EDF',
        })

        repo.findOne.mockResolvedValueOnce({ id: 'c2', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: false, email: null, email_status: null, phone: null, linkedin_url: null },
        })
        const miss = await service.enrichContact('c2', 'user-1', {
          first_name: 'Gilles',
          organization_name: 'EDF',
        })

        // Outage → a failure the UI can explain. Miss → a success carrying
        // « nobody found », which is a real answer about the person.
        expect(isFailure(outage)).toBe(true)
        expect(isSuccess(miss)).toBe(true)
        // Neither costs a credit, but for different reasons — and the user is
        // told which one happened.
        expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
      })

      it('debits exactly once when a later leg of the cascade succeeds', async () => {
        // Partial cascade: Apollo errored inside the IA, SalesQL answered. The
        // IA resolves that internally and returns a match, so the API sees a
        // plain success — one credit, never two, never zero.
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: {
            matched: true,
            email: 'gilles.denoyel@edf.fr',
            email_status: 'verified',
            phone: null,
            linkedin_url: null,
          },
        })

        const result = await service.enrichContact('c1', 'user-1', {
          first_name: 'Gilles',
          last_name: 'Denoyel',
          organization_name: 'EDF',
        })

        expect(isSuccess(result)).toBe(true)
        expect(credits.consumeEnrichmentCredit).toHaveBeenCalledTimes(1)
      })

      it('does NOT debit a Basic-plan match that reveals no email/phone on an already-named contact', async () => {
        // THE PRODUCTION BUG (Gilles Denoyel). On a plan that matches people but
        // cannot reveal contact info, Apollo returns the public linkedin_url +
        // title but no email/phone. The contact already has a complete name, so
        // no identity is completed either. The seller sees « Aucune personne
        // trouvée · Crédit non consommé » — and the balance must actually agree.
        repo.findOne.mockResolvedValueOnce({
          id: 'c1',
          user_id: 'user-1',
          full_name: 'Gilles Denoyel', // already complete — no identity to resolve
          linkedin_url: null,
          title: null,
        } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: {
            matched: true,
            first_name: 'Gilles',
            last_name: 'Denoyel',
            email: null, // reveal locked on the plan
            email_status: null,
            phone: null,
            linkedin_url: 'https://linkedin.com/in/gdenoyel',
            title: 'Senior Advisor',
          },
        })

        const result = await service.enrichContact('c1', 'user-1', {
          first_name: 'Gilles',
          last_name: 'Denoyel',
          organization_name: 'EDF',
        })

        // The linkedin/title are still persisted (present-only, free)…
        expect(isSuccess(result)).toBe(true)
        const setArg = repo._qb.set.mock.calls[0]?.[0] as Record<string, unknown>
        expect(setArg.linkedin_url).toBe('https://linkedin.com/in/gdenoyel')
        // …but nothing reveal-gated or identity-completing arrived, so the
        // « Crédit non consommé » the UI promises is TRUE.
        expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
      })

      it('E1 — a placeholder identity completed WITHOUT email/phone no longer debits', async () => {
        // ⚠️ E1 (#3698, décision Louis 07/10, point 4) — renversement ASSUMÉ et
        // daté de l'ancienne règle « identity completion IS a paid win » : on ne
        // débite QUE si une coordonnée manquante (e-mail, téléphone) est
        // trouvée. Le nom complété est écrit, gratuitement.
        repo.findOne.mockResolvedValueOnce({
          id: 'c1',
          user_id: 'user-1',
          full_name: 'Isabelle', // role-persona placeholder (< 2 tokens)
        } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: {
            matched: true,
            first_name: 'Isabelle',
            last_name: 'Rey',
            email: null,
            email_status: null,
            phone: null,
            linkedin_url: 'https://linkedin.com/in/irey',
          },
        })

        const result = await service.enrichContact('c1', 'user-1', {
          first_name: 'Isabelle',
          organization_name: 'EDF',
        })

        expect(isSuccess(result)).toBe(true)
        if (isSuccess(result)) expect(result.output.full_name).toBe('Isabelle Rey')
        expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
      })

      it('debits once — not twice — when Dropcontact is the leg that resolves', async () => {
        // The other partial-cascade shape, this one spanning both services:
        // the IA found nothing, the API's Dropcontact fallback did.
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: false, email: null, email_status: null, phone: null, linkedin_url: null },
        })
        dropcontact.isEnabled.mockReturnValue(true)
        dropcontact.enrich.mockResolvedValueOnce({
          matched: true,
          email: 'gilles.denoyel@edf.fr',
          email_status: 'verified',
          phone: null,
          linkedin_url: null,
        })

        const result = await service.enrichContact('c1', 'user-1', {
          first_name: 'Gilles',
          last_name: 'Denoyel',
          organization_name: 'EDF',
        })

        expect(isSuccess(result)).toBe(true)
        expect(credits.consumeEnrichmentCredit).toHaveBeenCalledTimes(1)
      })
    })

    /**
     * « Enrichir » ne peut pas écraser une coordonnée corrigée à la main (D380).
     *
     * Ce chemin construisait un objet `updates` et l'écrivait par `.set(updates)`
     * sans rien demander : `email`, `phone` et `linkedin_url` y étaient posés tels
     * que le fournisseur les rendait. Le clic de l'utilisateur est un ordre de
     * CHERCHER, pas une affirmation sur la valeur trouvée — celle-ci vient
     * d'Apollo, donc du pipeline, et ne passe pas devant un humain.
     */
    describe('face à une correction humaine déjà en base', () => {
      it('#2120.64 — n’écrase pas une adresse corrigée à la main, ne débite pas pour ça, et le résultat le DIT (newer_data_exists, jamais no_new_data)', async () => {
        repo.findOne.mockResolvedValueOnce({
          id: 'c1',
          user_id: 'user-1',
          email: 'g.denoyel@edf.fr',
        } as ContactEntity)
        provenance.currentSources.mockResolvedValueOnce({ email: 'human' })
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: 'gilles.denoyel@edf.fr', email_status: 'verified', phone: null },
        })

        const result = await service.enrichContact('c1', 'user-1', {
          first_name: 'Gilles',
          organization_name: 'EDF',
        })

        expect(isSuccess(result)).toBe(true)
        const written = repo._qb.set.mock.calls.at(-1)?.[0] as Record<string, unknown>
        expect(written).not.toHaveProperty('email')
        // `email_verified` n'a de sens qu'attaché à SON adresse : le poser sur
        // une adresse refusée déclarerait « vérifié » à propos d'une autre.
        expect(written).not.toHaveProperty('email_verified')
        // La trouvaille refusée n'était pas FACTURÉE non plus : ni confiance ni
        // coût ne s'attachent à une valeur qui n'a jamais atterri sur la fiche.
        expect(written).not.toHaveProperty('email_confidence')
        expect(written).not.toHaveProperty('email_cost_credits')
        // Rien de neuf n'a atterri sur la fiche : facturer serait facturer un
        // enrichissement qui n'a rien enrichi.
        expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
        // #2120.64 — la tentative reste tracée, mais PAS comme un simple
        // « rien trouvé » : le fournisseur A renvoyé quelque chose, une
        // correction humaine l'a protégé. Le résultat distingue les deux
        // (« une correction humaine gagne toujours, quelle que soit sa date »).
        expect(written).toHaveProperty('last_enrichment_result', 'newer_data_exists')
        if (isSuccess(result)) expect(result.output.last_enrichment_result).toBe('newer_data_exists')
      })

      it('#4016.L13 — la trouvaille refusée se NOMME : contradiction tracée, fait confirmé intact', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1', email: 'g.denoyel@edf.fr' } as ContactEntity)
        provenance.currentSources.mockResolvedValueOnce({ email: 'human' })
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: 'gilles.denoyel@edf.fr', email_status: 'verified', phone: null },
        })

        await service.enrichContact('c1', 'user-1', { first_name: 'Gilles', organization_name: 'EDF' })

        expect(provenance.recordContradictions).toHaveBeenCalledWith(
          expect.objectContaining({
            entityType: 'contact',
            entityId: 'c1',
            source: 'pipeline',
            contradictions: [{ field: 'email', value: 'gilles.denoyel@edf.fr' }],
          }),
        )
        const written = repo._qb.set.mock.calls.at(-1)?.[0] as Record<string, unknown>
        expect(written).not.toHaveProperty('email')
      })

      it('#4016.L13 — sait dire NON : une valeur non confirmée à la main ne trace aucune contradiction', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1', email: 'g.denoyel@edf.fr' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: 'gilles.denoyel@edf.fr', email_status: 'verified', phone: null },
        })

        await service.enrichContact('c1', 'user-1', { first_name: 'Gilles', organization_name: 'EDF' })

        expect(provenance.recordContradictions).not.toHaveBeenCalled()
      })

      it('#2120.64 — un simple « rien trouvé » (aucune protection en jeu) reste no_new_data', async () => {
        // Le contrôle négatif du test précédent : sans arbitre déclenché
        // (aucune provenance enregistrée), le résultat générique n'a PAS
        // basculé sur `newer_data_exists`.
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1', email: 'a@b.com' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: false, email: null, email_status: null, phone: null, linkedin_url: null },
        })

        await service.enrichContact('c1', 'user-1', { first_name: 'Gilles', organization_name: 'EDF' })

        const written = repo._qb.set.mock.calls.at(-1)?.[0] as Record<string, unknown>
        expect(written).toHaveProperty('last_enrichment_result', 'no_new_data')
      })

      it('préserve le téléphone tenu à la main SANS bloquer le reste de la trouvaille', async () => {
        repo.findOne.mockResolvedValueOnce({
          id: 'c1',
          user_id: 'user-1',
          phone: '+33 6 12 34 56 78',
        } as ContactEntity)
        provenance.currentSources.mockResolvedValueOnce({ phone: 'human' })
        ia.enrichContact.mockResolvedValueOnce({
          data: {
            matched: true,
            email: 'gilles.denoyel@edf.fr',
            email_status: 'verified',
            phone: '+33 1 40 42 22 22',
            linkedin_url: 'https://www.linkedin.com/in/gdenoyel',
          },
        })

        await service.enrichContact('c1', 'user-1', { first_name: 'Gilles', organization_name: 'EDF' })

        const written = repo._qb.set.mock.calls.at(-1)?.[0] as Record<string, unknown>
        expect(written).not.toHaveProperty('phone')
        expect(written).toHaveProperty('email', 'gilles.denoyel@edf.fr')
        expect(written).toHaveProperty('linkedin_url', 'https://www.linkedin.com/in/gdenoyel')
        // Un vrai gain sur les autres canaux : le crédit est dû.
        expect(credits.consumeEnrichmentCredit).toHaveBeenCalledTimes(1)
      })

      it('un lien professionnel corrigé à la main tient aussi', async () => {
        repo.findOne.mockResolvedValueOnce({
          id: 'c1',
          user_id: 'user-1',
          linkedin_url: 'https://www.linkedin.com/in/gilles-denoyel-edf',
        } as ContactEntity)
        provenance.currentSources.mockResolvedValueOnce({ linkedinUrl: 'human' })
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: null, phone: null, linkedin_url: 'https://www.linkedin.com/in/gdenoyel' },
        })

        await service.enrichContact('c1', 'user-1', { first_name: 'Gilles', organization_name: 'EDF' })

        const written = repo._qb.set.mock.calls.at(-1)?.[0] as Record<string, unknown>
        expect(written).not.toHaveProperty('linkedin_url')
      })

      it('RAFRAÎCHIT sans broncher ce que le fournisseur avait lui-même écrit', async () => {
        // La contrepartie, et elle est essentielle : l'arbitre n'oppose que les
        // autorités SUPÉRIEURES. Une adresse d'origine pipeline le reste, et une
        // adresse plus fraîche du même rang passe — « Enrichir » n'a pas cessé de
        // rafraîchir, il a cessé d'écraser une main.
        repo.findOne.mockResolvedValueOnce({
          id: 'c1',
          user_id: 'user-1',
          email: 'ancienne@edf.fr',
        } as ContactEntity)
        provenance.currentSources.mockResolvedValueOnce({ email: 'pipeline' })
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: 'gilles.denoyel@edf.fr', email_status: 'verified', phone: null },
        })

        await service.enrichContact('c1', 'user-1', { first_name: 'Gilles', organization_name: 'EDF' })

        const written = repo._qb.set.mock.calls.at(-1)?.[0] as Record<string, unknown>
        expect(written).toHaveProperty('email', 'gilles.denoyel@edf.fr')
        expect(written).toHaveProperty('email_verified', true)
      })

      it('ne PAIE pas la lecture de provenance quand rien d’arbitrable n’est écrit', async () => {
        // Le piège à ne pas reproduire : faire payer une jointure à chaque
        // écriture pour un cas qui ne se produit presque jamais. Une cascade qui
        // n'a trouvé aucune coordonnée n'écrit qu'une TRACE — aucune colonne de
        // fiche, donc rien à protéger, donc aucune requête.
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: false, email: null, email_status: null, phone: null, linkedin_url: null },
        })

        await service.enrichContact('c1', 'user-1', { first_name: 'Gilles', organization_name: 'EDF' })

        expect(provenance.currentSources).not.toHaveBeenCalled()
      })
    })

    describe('identité ambiguë (#2120.61)', () => {
      it('deux fiches actives du même compte partagent le nom résolu : rien n’est écrit, rien n’est débité, le résultat le DIT', async () => {
        repo.findOne.mockResolvedValueOnce({
          id: 'c1',
          user_id: 'user-1',
          account_id: 'acc-1',
          full_name: 'Jean Dupont',
        } as ContactEntity)
        repo.find.mockResolvedValueOnce([
          { id: 'c1', full_name: 'Jean Dupont' },
          { id: 'c2', full_name: 'Jean Dupont' },
        ] as ContactEntity[])
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: 'jean.dupont@acme.fr', email_status: 'verified', phone: '+33612345678' },
        })

        const result = await service.enrichContact('c1', 'user-1', {
          first_name: 'Jean',
          last_name: 'Dupont',
          organization_name: 'Acme',
        })

        expect(isSuccess(result)).toBe(true)
        if (isSuccess(result)) {
          expect(result.output.last_enrichment_result).toBe('ambiguous')
          // On ne SAIT pas laquelle des deux fiches Apollo a trouvée : rien
          // n'est choisi à sa place — ni l'email ni le téléphone.
          expect(result.output.email).toBeUndefined()
          // #3822.3 — même ici, rien de débité ne veut pas dire solde à zéro.
          expect(result.output.credits_remaining).toBe(42)
        }
        const written = repo._qb.set.mock.calls.at(-1)?.[0] as Record<string, unknown>
        expect(written).toHaveProperty('last_enrichment_result', 'ambiguous')
        expect(written).not.toHaveProperty('email')
        expect(written).not.toHaveProperty('phone')
        expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
      })

      it('#4479 — la comparaison suit la clé de la base : tout le COMPTE, fiches écartées comprises, pas seulement les fiches de l’appelant', async () => {
        repo.findOne.mockResolvedValueOnce({
          id: 'c1',
          user_id: 'user-1',
          account_id: 'acc-1',
          full_name: 'Jean',
        } as ContactEntity)
        // Le porteur du nom est une fiche ÉCARTÉE d'un autre utilisateur du compte : l'index unique la voit.
        repo.find.mockResolvedValueOnce([
          { id: 'c1', full_name: 'Jean' },
          { id: 'c9', full_name: 'Jean Dupont' },
        ] as ContactEntity[])
        ia.enrichContact.mockResolvedValueOnce({
          data: {
            matched: true,
            email: 'jean.dupont@acme.fr',
            email_status: 'verified',
            first_name: 'Jean',
            last_name: 'Dupont',
          },
        })

        const result = await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

        const where = (repo.find.mock.calls.at(-1)?.[0] as { where: Record<string, unknown> }).where
        expect(where).toEqual({ account_id: 'acc-1' })
        expect(isSuccess(result)).toBe(true)
        // Renommer c1 en « Jean Dupont » violerait l'index : la fiche n'est pas rebaptisée (le DIT : ambiguë).
        const written = repo._qb.set.mock.calls.at(-1)?.[0] as Record<string, unknown>
        expect(written).not.toHaveProperty('full_name')
      })

      it('un homonyme dans un AUTRE compte n’est pas une ambiguïté — la comparaison reste scopée au compte', async () => {
        repo.findOne.mockResolvedValueOnce({
          id: 'c1',
          user_id: 'user-1',
          account_id: 'acc-1',
          full_name: 'Jean Dupont',
        } as ContactEntity)
        // La requête est scopée à account_id: 'acc-1' — un « Jean Dupont »
        // d'un autre compte n'apparaît jamais dans ce lot.
        repo.find.mockResolvedValueOnce([{ id: 'c1', full_name: 'Jean Dupont' }] as ContactEntity[])
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: 'jean.dupont@acme.fr', email_status: 'verified', phone: null },
        })

        const result = await service.enrichContact('c1', 'user-1', {
          first_name: 'Jean',
          last_name: 'Dupont',
          organization_name: 'Acme',
        })

        expect(isSuccess(result)).toBe(true)
        if (isSuccess(result)) expect(result.output.email).toBe('jean.dupont@acme.fr')
        expect(credits.consumeEnrichmentCredit).toHaveBeenCalledTimes(1)
      })

      it('un rôle-persona (un seul token, pas encore une identité) n’est jamais déclaré ambigu', async () => {
        repo.findOne.mockResolvedValueOnce({
          id: 'c1',
          user_id: 'user-1',
          account_id: 'acc-1',
          full_name: 'Responsable',
        } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: 'r.it@acme.fr', email_status: 'verified', phone: null },
        })

        const result = await service.enrichContact('c1', 'user-1', {
          first_name: 'Responsable',
          organization_name: 'Acme',
        })

        expect(isSuccess(result)).toBe(true)
        // Rien à comparer : la requête d'homonymie n'est même pas partie.
        expect(repo.find).not.toHaveBeenCalled()
      })
    })

    describe('provenance par champ — confiance et coût (#2120.68 / #2120.70)', () => {
      it('#2120.68 — une adresse VÉRIFIÉE par le fournisseur reçoit une confiance "high" ; #2120.70 — son coût engagé est le poids crédit de l’action', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: 'jean@acme.fr', email_status: 'verified', phone: null },
        })

        const result = await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

        const written = repo._qb.set.mock.calls.at(-1)?.[0] as Record<string, unknown>
        expect(written.email_confidence).toBe('high')
        expect(written.email_cost_credits).toBe(creditCostOf('contact_enrichment'))
        if (isSuccess(result)) expect(result.output.email_confidence).toBe('high')
      })

      it('#2120.68 — une adresse "devinée" par le fournisseur reçoit une confiance "low", jamais "high" ni une probabilité chiffrée', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: 'jean@acme.fr', email_status: 'guessed', phone: null },
        })

        await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

        const written = repo._qb.set.mock.calls.at(-1)?.[0] as Record<string, unknown>
        expect(written.email_confidence).toBe('low')
      })

      it('#2120.68/#2120.70 — un e-mail INCHANGÉ (déjà connu) ne reçoit ni confiance ni coût neufs ; le téléphone, lui, vraiment neuf ce passage, reçoit le sien', async () => {
        repo.findOne.mockResolvedValueOnce({
          id: 'c1',
          user_id: 'user-1',
          email: 'jean@acme.fr',
          phone: '+33600000000',
        } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: 'jean@acme.fr', email_status: 'verified', phone: '+33611111111' },
        })

        await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

        const written = repo._qb.set.mock.calls.at(-1)?.[0] as Record<string, unknown>
        expect(written).not.toHaveProperty('email_confidence')
        expect(written).not.toHaveProperty('email_cost_credits')
        // E1 (#3698) — le téléphone était DÉJÀ là : le rafraîchir ne se facture
        // plus, il ne porte donc aucun coût engagé.
        expect(written).not.toHaveProperty('phone_cost_credits')
      })

      it('#2120.70 — le téléphone n’a aucun signal de confiance fiable : la colonne reste ABSENTE, jamais "low" par défaut', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
        ia.enrichContact.mockResolvedValueOnce({
          data: { matched: true, email: null, phone: '+33611111111' },
        })

        await service.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

        const written = repo._qb.set.mock.calls.at(-1)?.[0] as Record<string, unknown>
        expect(written).not.toHaveProperty('phone_confidence')
        expect(written.phone_cost_credits).toBe(creditCostOf('contact_enrichment'))
      })
    })
  })

  describe('applyMessages', () => {
    it('sets linkedin_message, phone_script and email_message by name; counts matches', async () => {
      repo._qb.execute.mockResolvedValue({ affected: 1 })
      const matched = await service.applyMessages('acc-1', [
        {
          contactName: 'Jean Dupont',
          linkedinMessage: 'Bonjour Jean...',
          emailSubject: 'Sujet',
          emailBody: 'Corps email',
          phoneOpener: 'Allo Jean...',
        },
      ])
      expect(matched).toBe(1)
      expect(repo._qb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          linkedin_message: 'Bonjour Jean...',
          phone_script: 'Allo Jean...',
          email_message: { subject: 'Sujet', body: 'Corps email', channel: 'email' },
        }),
      )
    })

    it('skips a contact with no message content (no update fired)', async () => {
      repo._qb.set.mockClear()
      const matched = await service.applyMessages('acc-1', [{ contactName: 'Sans message' }])
      expect(matched).toBe(0)
      expect(repo._qb.set).not.toHaveBeenCalled()
    })

    it('matches the stored contact regardless of accents', async () => {
      // `bellum_contacts.py` is written in unaccented French, and a model
      // imitates the orthography of its prompt: it answers "Sebastien
      // Chauffray" for a contact stored as "Sébastien Chauffray". `LOWER()` is
      // case-insensitive but NOT accent-insensitive, so the UPDATE matched zero
      // rows and the whole message set was dropped without a word.
      repo._qb.execute.mockResolvedValue({ affected: 1 })
      await service.applyMessages('acc-1', [{ contactName: 'Sebastien Chauffray', linkedinMessage: 'Bonjour' }])

      const [predicate] = repo._qb.where.mock.calls.at(-1) as [string]
      expect(predicate).toContain('bellum_normalize_name')
      expect(predicate).not.toContain('LOWER(full_name)')
    })
  })

  describe('applyEnrichment — accent-insensitive matching', () => {
    it('applies the enrichment even when the model dropped the accents', async () => {
      // Same root cause as applyMessages: an unaccented prompt yields an
      // unaccented `fullName`, which used to match nothing — so role, priority,
      // summary, whyContact, email and phone were all silently discarded for
      // every contact whose stored name carries an accent.
      repo._qb.execute.mockResolvedValue({ affected: 1 })
      // La ligne visée est RELUE avant l'écriture depuis le socle CRM : c'est
      // cette lecture qui permet à l'arbitre de provenance de comparer ce que
      // le fournisseur propose à ce qui est déjà en base.
      repo._qb.getOne.mockResolvedValueOnce({ id: 'c1', full_name: 'Sébastien Chauffray' } as ContactEntity)
      repo._qb.getOne.mockResolvedValue(null)

      const matched = await service.applyEnrichment('acc-1', [
        {
          fullName: 'Sebastien Chauffray',
          entity: 'Acme',
          role: 'technical',
          priority: 1,
          summary: 's',
          whyContact: 'w',
          email: '',
          phone: '',
          emailVerified: false,
        },
      ])

      expect(matched).toBe(1)
      const [predicate] = repo._qb.where.mock.calls[0] as [string]
      expect(predicate).toContain('bellum_normalize_name')
      expect(predicate).not.toContain('LOWER(full_name)')
    })
  })

  describe("applyEnrichment — homonyme marqué par l'IA (LUDB.5 bis)", () => {
    const base = {
      fullName: 'Jonas Berg',
      entity: 'Stillfront',
      role: 'decision',
      priority: 1,
      summary: 's',
      whyContact: 'w',
      email: '',
      phone: '',
      emailVerified: false,
    }

    it("NON : un contact @stillfront.com marqué homonyme par l'IA est écarté avec sa raison, jamais rattaché", async () => {
      repo._qb.getOne.mockResolvedValueOnce({
        id: 'c-still',
        full_name: 'Jonas Berg',
        excluded_at: null,
      } as ContactEntity)
      const matched = await service.applyEnrichment('acc-still', [
        { ...base, excluded: true, exclusionReason: 'homonyme : employeur hors du compte et de son groupe' },
      ])

      expect(matched).toBe(0)
      expect(repo.update).toHaveBeenCalledWith(
        { id: 'c-still' },
        expect.objectContaining({
          excluded_at: expect.any(Date),
          exclusion_reason: 'homonyme : employeur hors du compte et de son groupe',
        }),
      )
      // Aucune donnée du homonyme n'est écrite sur la ligne (ni e-mail ni rôle).
      expect(repo._qb.execute).not.toHaveBeenCalled()
    })

    it('une identité confirmée à la main gagne : jamais écartée par le marquage', async () => {
      repo._qb.getOne.mockResolvedValueOnce({
        id: 'c-1',
        full_name: 'Jonas Berg',
        excluded_at: null,
        identity_confirmed_at: new Date(),
      } as ContactEntity)
      await service.applyEnrichment('acc-still', [{ ...base, excluded: true, exclusionReason: 'homonyme : x' }])
      expect(repo.update).not.toHaveBeenCalled()
    })

    it('non-régression IT : sans marquage, le chemin est inchangé (aucune exclusion)', async () => {
      repo._qb.execute.mockResolvedValue({ affected: 1 })
      repo._qb.getOne.mockResolvedValueOnce({ id: 'c-it', full_name: 'Jonas Berg' } as ContactEntity)
      repo._qb.getOne.mockResolvedValue(null)
      const matched = await service.applyEnrichment('acc-it', [base])
      expect(matched).toBe(1)
      expect(repo.update).not.toHaveBeenCalled()
    })
  })

  describe('applyEnrichment — gabarit d’adresse refusé à l’écriture (#4599)', () => {
    const base = {
      fullName: 'Jean Dupont',
      entity: 'Filiale Ouest',
      role: 'technical',
      priority: 3,
      summary: '',
      whyContact: '',
      phone: '',
      emailVerified: false,
    }
    function arm() {
      repo._qb.execute.mockResolvedValue({ affected: 1 })
      repo._qb.getOne.mockResolvedValueOnce({
        id: 'c9',
        full_name: 'Jean Dupont',
        workspace_id: 'ws-1',
      } as ContactEntity)
      repo._qb.getOne.mockResolvedValue(null)
      provenance.commit.mockClear()
    }
    const committedFields = () =>
      ((provenance.commit.mock.calls[0]?.[0] as { changes: Array<{ field: string }> } | undefined)?.changes ?? []).map(
        c => c.field,
      )

    it('une réponse du modèle « prenom.nom@… » est refusée : le contact reste SANS e-mail', async () => {
      arm()
      await service.applyEnrichment('acc-1', [{ ...base, email: 'prenom.nom@exemple-societe.test' }])
      expect(committedFields()).not.toContain('email')
      expect(committedFields()).toContain('entity')
    })

    it('une vraie adresse passe toujours', async () => {
      arm()
      await service.applyEnrichment('acc-1', [{ ...base, email: 'jean.dupont@exemple-societe.test' }])
      expect(committedFields()).toContain('email')
    })
  })

  describe('applyEnrichment — portée DÉCLARÉE du périmètre (#3219, #190.2)', () => {
    const item = {
      fullName: 'Jean Dupont',
      entity: 'Filiale Ouest',
      role: 'technical',
      priority: 3,
      summary: '',
      whyContact: '',
      email: 'jean.dupont@exemple.fr',
      phone: '',
      emailVerified: true,
    }

    function arm() {
      repo._qb.execute.mockResolvedValue({ affected: 1 })
      repo._qb.getOne.mockResolvedValueOnce({
        id: 'c9',
        full_name: 'Jean Dupont',
        workspace_id: 'ws-1',
      } as ContactEntity)
      repo._qb.getOne.mockResolvedValue(null)
    }
    const committed = () =>
      (provenance.commit.mock.calls[0]?.[0] as { changes: Array<{ field: string; scope?: string | null }> }).changes

    it('un run au périmètre déclaré écrit sa portée sur les champs qui en dépendent (entité, rôle) — jamais sur l’e-mail', async () => {
      arm()
      await service.applyEnrichment('acc-1', [item], undefined, 'filiales')
      const changes = committed()
      expect(changes.find(c => c.field === 'entity')?.scope).toBe('Filiales')
      expect(changes.find(c => c.field === 'decisionRole')?.scope).toBe('Filiales')
      expect(changes.find(c => c.field === 'email')).toBeDefined()
      expect(changes.find(c => c.field === 'email')?.scope).toBeUndefined()
    })

    it('deux runs aux périmètres différents font ressortir `scope_difference` ; sans portée d’un côté, le désaccord reste ouvert', async () => {
      const scopeOfEntity = async (scopeMode?: string, entity = 'Filiale Ouest') => {
        provenance.commit.mockClear()
        arm()
        await service.applyEnrichment('acc-1', [{ ...item, entity }], undefined, scopeMode)
        return committed().find(c => c.field === 'entity')?.scope ?? undefined
      }
      const group = await scopeOfEntity('groupe', 'Groupe Exemple')
      const subsidiary = await scopeOfEntity('filiales')
      const undeclared = await scopeOfEntity(undefined)
      const contradiction = (currentScope?: string, incomingScope?: string) =>
        detectFieldConflict({
          field: 'entity',
          incomingValue: 'Filiale Ouest',
          incomingSource: 'pipeline',
          incomingAt: '2026-10-15T08:00:00Z',
          currentValue: 'Groupe Exemple',
          currentSource: 'pipeline',
          currentObservedAt: '2026-10-14T08:00:00Z',
          currentScope,
          incomingScope,
        })
      expect(contradiction(group, subsidiary)?.resolvedBy).toBe('scope_difference')
      expect(undeclared).toBeUndefined()
      expect(contradiction(group, undeclared)?.resolvedBy).toBe('unresolved')
    })

    it('sans périmètre déclaré, ou hors vocabulaire : aucune portée n’est écrite (rien n’est deviné)', async () => {
      arm()
      await service.applyEnrichment('acc-1', [item])
      expect(committed().every(c => c.scope === undefined)).toBe(true)
      provenance.commit.mockClear()
      arm()
      await service.applyEnrichment('acc-1', [item], undefined, 'inconnu')
      expect(committed().every(c => c.scope === undefined)).toBe(true)
    })
  })

  describe('applyEnrichment — Apollo id matching', () => {
    // Phase 2 stores the search-tier hit as "Severine" (Apollo obfuscates the last
    // name); the People-Match in phase 3 reveals "Severine Mondy". Matching on the
    // name alone therefore hits NOTHING and the revealed email is thrown away —
    // for exactly the top deciders the enrichment credit was spent on.
    it('matches on the stored Apollo id when the revealed name no longer matches', async () => {
      repo._qb.execute.mockResolvedValue({ affected: 1 })
      repo._qb.getOne.mockResolvedValueOnce({ id: 'c2', full_name: 'Severine' } as ContactEntity)
      repo._qb.getOne.mockResolvedValue(null)

      const matched = await service.applyEnrichment('acc-1', [
        {
          fullName: 'Severine Mondy',
          apolloId: '54a2617474686933187f271e',
          entity: 'Dassault Aviation',
          role: 'technical',
          priority: 1,
          summary: 's',
          whyContact: 'w',
          email: 'severine.mondy@dassault-aviation.com',
          phone: '',
          emailVerified: true,
        },
      ])

      expect(matched).toBe(1)
      const [predicate] = repo._qb.where.mock.calls[0] as [string]
      expect(predicate).toContain("raw_data->>'apolloId'")
    })

    it('folds the revealed full name onto the row it just matched by id', async () => {
      // The row still reads "Severine" — leaving it there would ship a dossier of
      // first names even though the real identity has been paid for and revealed.
      repo._qb.execute.mockResolvedValue({ affected: 1 })
      repo._qb.getOne.mockResolvedValueOnce({ id: 'c2', full_name: 'Severine' } as ContactEntity)
      repo._qb.getOne.mockResolvedValue(null)

      await service.applyEnrichment('acc-1', [
        {
          fullName: 'Severine Mondy',
          apolloId: '54a2617474686933187f271e',
          entity: '',
          role: 'user',
          priority: 3,
          summary: '',
          whyContact: '',
          email: '',
          phone: '',
          emailVerified: false,
        },
      ])

      expect(repo._qb.set).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'Severine Mondy' }))
    })

    it('falls back to the name predicate when the contact carries no Apollo id', async () => {
      repo._qb.execute.mockResolvedValue({ affected: 1 })
      // Nom stocké identique : seule la priorité bougera, ce qui suffit à
      // déclencher l'écriture et donc à observer le prédicat retenu.
      repo._qb.getOne.mockResolvedValueOnce({ id: 'c3', full_name: 'Jean Dupont', priority: 1 } as ContactEntity)
      repo._qb.getOne.mockResolvedValue(null)

      await service.applyEnrichment('acc-1', [
        {
          fullName: 'Jean Dupont',
          entity: '',
          role: 'user',
          priority: 3,
          summary: '',
          whyContact: '',
          email: '',
          phone: '',
          emailVerified: false,
        },
      ])

      const [predicate] = repo._qb.where.mock.calls[0] as [string]
      expect(predicate).toContain('bellum_normalize_name')
      expect(predicate).not.toContain('apolloId')
      // A name-matched row keeps its stored name: the classifier's spelling is not
      // an identity revelation, and overwriting on a name match could relabel.
      expect(repo._qb.set).toHaveBeenCalledWith(expect.not.objectContaining({ full_name: expect.anything() }))
    })

    it('retries on the name when the Apollo id matches no row', async () => {
      // Older rows persisted before the id was stored: the id predicate affects 0,
      // and the name is then the only bridge left. Losing the enrichment there
      // would be a silent regression for every pre-existing account.
      // L'id ne trouve AUCUNE ligne (première lecture nulle), le nom en trouve
      // une (seconde lecture) — c'est le repli qu'il faut garder.
      repo._qb.execute.mockResolvedValue({ affected: 1 })
      repo._qb.getOne.mockResolvedValueOnce(null)
      repo._qb.getOne.mockResolvedValueOnce({ id: 'c4', full_name: 'Severine Mondy', priority: 1 } as ContactEntity)
      repo._qb.getOne.mockResolvedValue(null)

      const matched = await service.applyEnrichment('acc-1', [
        {
          fullName: 'Severine Mondy',
          apolloId: '54a2617474686933187f271e',
          entity: '',
          role: 'user',
          priority: 3,
          summary: '',
          whyContact: '',
          email: '',
          phone: '',
          emailVerified: false,
        },
      ])

      expect(matched).toBe(1)
      const predicates = repo._qb.where.mock.calls.map(c => c[0] as string)
      expect(predicates[0]).toContain("raw_data->>'apolloId'")
      expect(predicates[1]).toContain('bellum_normalize_name')
    })
  })

  describe('applyEnrichment — un contact ne fait jamais tomber le run', () => {
    /**
     * Le défaut, vu en production sur EMERIA le 19/08 : la phase 3 révélait
     * « Bruno » en « Bruno Vaquette », nom DÉJÀ porté par une autre ligne du
     * compte. Le renommage violait l'unique `idx_contacts_account_normalized_name` ;
     * le 23505 abortait la transaction de la phase, remontait au worker en
     * `UnrecoverableError`, et faisait tomber le run entier — crédits débités,
     * dossier jamais livré.
     */
    it('renonce au renommage quand le nom révélé est déjà pris, et enrichit la ligne qui le porte', async () => {
      repo._qb.execute.mockResolvedValue({ affected: 1 })
      // 1. la cible, retrouvée par id Apollo ; 2. la ligne qui porte déjà le nom.
      repo._qb.getOne.mockResolvedValueOnce({ id: 'c-masque', full_name: 'Bruno' } as ContactEntity)
      repo._qb.getOne.mockResolvedValueOnce({ id: 'c-complet', full_name: 'Bruno Vaquette' } as ContactEntity)
      repo._qb.getOne.mockResolvedValue(null)

      await service.applyEnrichment('acc-1', [
        {
          fullName: 'Bruno Vaquette',
          apolloId: '54a2617474686933187f271e',
          entity: 'EMERIA',
          role: 'champion',
          priority: 2,
          summary: 's',
          whyContact: 'w',
          email: 'bruno.vaquette@emeria.eu',
          phone: '',
          emailVerified: true,
        },
      ])

      // Aucun renommage : c'est lui qui violait l'index.
      expect(repo._qb.set).not.toHaveBeenCalledWith(expect.objectContaining({ full_name: 'Bruno Vaquette' }))
      // Et l'enrichissement payé atterrit sur la ligne qui porte le vrai nom.
      const updateWhere = repo._qb.where.mock.calls.find(([sql]) => String(sql).includes('id = :targetId'))
      expect(updateWhere?.[1]).toEqual({ targetId: 'c-complet' })
    })

    it("isole l'échec d'écriture d'un contact : les suivants passent, le run continue", async () => {
      /**
       * La deuxième moitié, et la plus importante : en PostgreSQL une
       * instruction refusée abort la transaction ENTIÈRE. Sans point de
       * sauvegarde, un seul contact fautif emportait les autres, le point de
       * reprise de la phase, et le run.
       */
      const manager = { getRepository: () => repo, query: jest.fn(async (_sql: string) => []) }
      repo._qb.execute
        .mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }))
        .mockResolvedValue({ affected: 1 })
      // Aucun id Apollo ici : une seule lecture par contact (la cible).
      repo._qb.getOne.mockResolvedValueOnce({ id: 'c1', full_name: 'Alice Martin', priority: 1 } as ContactEntity)
      repo._qb.getOne.mockResolvedValueOnce({ id: 'c2', full_name: 'Bob Durand', priority: 1 } as ContactEntity)
      repo._qb.getOne.mockResolvedValue(null)

      const item = (fullName: string) => ({
        fullName,
        entity: '',
        role: 'user' as const,
        priority: 3,
        summary: '',
        whyContact: '',
        email: '',
        phone: '',
        emailVerified: false,
      })

      const matched = await service.applyEnrichment(
        'acc-1',
        [item('Alice Martin'), item('Bob Durand')],
        manager as unknown as EntityManager,
      )

      // Le run ne tombe pas, et le second contact a bien été écrit.
      expect(matched).toBe(1)
      const sql = manager.query.mock.calls.map(call => String(call[0]))
      expect(sql.some(q => q.startsWith('ROLLBACK TO SAVEPOINT'))).toBe(true)
    })
  })

  describe('applyEnrichment — decider psychology', () => {
    it('persists careerLevers / implicitFears when the model produced them', async () => {
      repo._qb.execute.mockResolvedValue({ affected: 1 })
      repo._qb.getOne.mockResolvedValueOnce({ id: 'c5', full_name: 'Jean Dupont' } as ContactEntity)
      repo._qb.getOne.mockResolvedValue(null)
      const matched = await service.applyEnrichment('acc-1', [
        {
          fullName: 'Jean Dupont',
          entity: 'Acme',
          role: 'technical',
          priority: 1,
          summary: 's',
          whyContact: 'w',
          email: '',
          phone: '',
          emailVerified: false,
          careerLevers: ['transformation', 'roadmap'],
          implicitFears: ['gap capacité'],
        },
      ])
      expect(matched).toBe(1)
      expect(repo._qb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          career_levers: ['transformation', 'roadmap'],
          implicit_fears: ['gap capacité'],
        }),
      )
    })

    it("n'écrit jamais [] quand le modèle n'a produit aucune psychologie", async () => {
      repo._qb.execute.mockResolvedValue({ affected: 1 })
      repo._qb.getOne.mockResolvedValueOnce({ id: 'c6', full_name: 'Sans psycho', priority: 1 } as ContactEntity)
      repo._qb.getOne.mockResolvedValue(null)
      await service.applyEnrichment('acc-1', [
        {
          fullName: 'Sans psycho',
          entity: '',
          role: 'user',
          priority: 3,
          summary: '',
          whyContact: '',
          email: '',
          phone: '',
          emailVerified: false,
        },
      ])
      const written = repo._qb.set.mock.calls.at(-1)?.[0] as Record<string, unknown>
      expect(written.career_levers).toBeUndefined()
      expect(written.implicit_fears).toBeUndefined()
    })
  })

  /**
   * La garde de fond du socle CRM : le run de la nuit ne doit pas défaire le
   * travail de la journée. Deux mécanismes, testés ici sur le VRAI writer du
   * pipeline (`applyEnrichment`), pas sur une copie de la règle.
   */
  describe('applyEnrichment — la saisie humaine survit au run suivant', () => {
    it("n'efface pas une adresse stockée quand le fournisseur ne trouve rien", async () => {
      // Le défaut historique : `email: c.email` partait tel quel dans l'UPDATE,
      // donc un `null` du fournisseur effaçait une adresse trouvée à la main —
      // sans message, sans trace, et sans lien visible avec le run de la nuit.
      repo._qb.execute.mockResolvedValue({ affected: 1 })
      repo._qb.getOne.mockResolvedValueOnce({
        id: 'c7',
        full_name: 'Camille Roux',
        email: 'camille.roux@acme.example',
        phone: '+33 1 23 45 67 89',
      } as ContactEntity)
      repo._qb.getOne.mockResolvedValue(null)

      await service.applyEnrichment('acc-1', [
        {
          fullName: 'Camille Roux',
          entity: 'ACME',
          role: 'technical',
          priority: 1,
          summary: 's',
          whyContact: 'w',
          email: '',
          phone: '',
          emailVerified: false,
        },
      ])

      const written = repo._qb.set.mock.calls.at(-1)?.[0] as Record<string, unknown>
      expect(written.email).toBeUndefined()
      expect(written.phone).toBeUndefined()
      // Le reste, lui, est bien écrit : protéger un champ ne gèle pas la fiche.
      expect(written.entity).toBe('ACME')
    })

    it('ne remplace pas une valeur corrigée à la main par celle du fournisseur', async () => {
      const provenance = { currentSources: jest.fn().mockResolvedValue({ entity: 'human' }), commit: jest.fn() }
      const guarded = new ContactsService(
        repo as never,
        userActions as never,
        ia as never,
        credits as never,
        workspace as never,
        mailer as never,
        suppression as never,
        config as never,
        cadence as never,
        accounts as never,
        transitions as never,
        dropcontact as never,
        { isEnabled: () => false } as never,
        merges as never,
        brandsStub as never,
        undefined,
        undefined,
        provenance as never,
      )
      repo._qb.execute.mockResolvedValue({ affected: 1 })
      repo._qb.getOne.mockResolvedValueOnce({
        id: 'c8',
        workspace_id: 'ws-1',
        full_name: 'Camille Roux',
        entity: 'TF1 PUB',
      } as ContactEntity)
      repo._qb.getOne.mockResolvedValue(null)

      await guarded.applyEnrichment('acc-1', [
        {
          fullName: 'Camille Roux',
          entity: 'Groupe TF1',
          role: 'technical',
          priority: 2,
          summary: 's',
          whyContact: 'w',
          email: '',
          phone: '',
          emailVerified: false,
        },
      ])

      const written = repo._qb.set.mock.calls.at(-1)?.[0] as Record<string, unknown>
      expect(written.entity).toBeUndefined()
      expect(written.priority).toBe(2)
      // La provenance des champs RÉELLEMENT écrits est enregistrée : sans ça,
      // le run suivant repartirait d'une ardoise vierge.
      expect(provenance.commit).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: 'c8', source: 'pipeline', actorId: null }),
      )
    })

    it('ne déclare pas « vérifié » une adresse dont la proposition a été refusée', async () => {
      repo._qb.execute.mockResolvedValue({ affected: 1 })
      repo._qb.getOne.mockResolvedValueOnce({
        id: 'c9',
        full_name: 'Camille Roux',
        email: 'camille.roux@acme.example',
        priority: 1,
      } as ContactEntity)
      repo._qb.getOne.mockResolvedValue(null)

      await service.applyEnrichment('acc-1', [
        {
          fullName: 'Camille Roux',
          entity: '',
          role: 'user',
          priority: 3,
          summary: '',
          whyContact: '',
          email: '',
          phone: '',
          emailVerified: true,
        },
      ])

      const written = repo._qb.set.mock.calls.at(-1)?.[0] as Record<string, unknown>
      expect(written.email_verified).toBeUndefined()
    })
  })

  describe('updateStatus', () => {
    it('returns a success result with the updated contact', async () => {
      const contact = { id: 'c1', user_id: 'user-1', user_status: 'new' } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      const result = await service.updateStatus('c1', 'user-1', 'contacted')
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output.user_status).toBe('contacted')
    })

    it('returns a not_found failure when contact is missing', async () => {
      repo.findOne.mockResolvedValueOnce(null)
      const result = await service.updateStatus('c1', 'user-1', 'contacted')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('not_found')
    })

    it('returns an update_failed failure on save error', async () => {
      const contact = { id: 'c1', user_id: 'user-1', user_status: 'new' } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockRejectedValueOnce(new Error('db error'))
      const result = await service.updateStatus('c1', 'user-1', 'contacted')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('update_failed')
    })

    // #2381.1/.6 (LAU-FINAL-095) — une réponse du contact ARRÊTE (jamais une
    // simple pause) ses séquences actives/en pause : « pas d'étape suivante
    // pour être sûr ». La cause va au journal `outreach_transitions`
    // (#2366.8, subject_kind='sequence').
    it.each([
      ['replied', 'reply_received'],
      ['meeting', 'meeting_booked'],
    ] as const)(
      'auto-STOPS (cancelled) the contact’s outreach sequences when status becomes %s (#2381.1)',
      async (userStatus, event) => {
        const contact = { id: 'c1', user_id: 'user-1', user_status: 'contacted' } as ContactEntity
        repo.findOne.mockResolvedValueOnce(contact)
        repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
        repo.query.mockImplementation(async (sql: string) =>
          typeof sql === 'string' && sql.includes('FROM previous')
            ? [{ id: 'seq-1', workspace_id: 'ws-1', previous_status: 'active' }]
            : [],
        )

        const result = await service.updateStatus('c1', 'user-1', userStatus)

        expect(isSuccess(result)).toBe(true)
        // 1) capture l'état précédent + arrête (CTE, une seule requête).
        expect(repo.query).toHaveBeenCalledWith(expect.stringContaining("SET status = 'cancelled'"), ['c1', 'user-1'])
        // 2) les étapes restantes passent skipped.
        expect(repo.query).toHaveBeenCalledWith(expect.stringContaining("SET status = 'skipped'"), [['seq-1']])
        // 3) le journal garde la CAUSE — l'un des dix-sept événements d'arrêt fermés.
        expect(repo.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO outreach_transitions'), [
          'ws-1',
          'user-1',
          'seq-1',
          'active',
          event,
        ])
      },
    )

    it('ne journalise ni ne requête les étapes quand aucune séquence n’était vivante', async () => {
      const contact = { id: 'c1', user_id: 'user-1', user_status: 'contacted' } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      repo.query.mockResolvedValueOnce([])

      const result = await service.updateStatus('c1', 'user-1', 'replied')

      expect(isSuccess(result)).toBe(true)
      expect(repo.query).not.toHaveBeenCalledWith(expect.stringContaining('outreach_sequence_steps'), expect.anything())
      expect(repo.query).not.toHaveBeenCalledWith(expect.stringContaining('outreach_transitions'), expect.anything())
    })

    // Le défaut que ce lot corrige : `response_received` / `rdv_obtained`
    // étaient LUS par les statistiques de la semaine, les KPIs d'équipe et le
    // flux d'activité — et ÉCRITS par personne. Le geste manquant est ce
    // changement de statut ; c'est donc lui qui laisse la trace.
    it.each([
      ['replied', 'response_received'],
      ['meeting', 'rdv_obtained'],
    ] as const)('consigne « %s » au journal d’activité comme %s', async (userStatus, actionType) => {
      const contact = {
        id: 'c1',
        account_id: 'acc-1',
        user_id: 'user-1',
        user_status: 'contacted',
        full_name: 'Camille Roux',
      } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)

      const result = await service.updateStatus('c1', 'user-1', userStatus)

      expect(isSuccess(result)).toBe(true)
      expect(userActions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: actionType,
          user_id: 'user-1',
          workspace_id: 'ws-1',
          account_id: 'acc-1',
          contact_id: 'c1',
          // La trace dit sa NATURE : une déclaration du commercial, pas une
          // lecture de sa boîte mail — Bellum n'en lit aucune.
          metadata: expect.objectContaining({ via: 'declaration', declared: true, previous_status: 'contacted' }),
        }),
      )
      expect(userActions.save).toHaveBeenCalled()
    })

    // m13 — le board de sprints (tome 5) avait sa règle de bascule écrite,
    // testée, et sans appelant (`applyEvent` existait, `POST
    // /sprints/accounts/:id/event` avait zéro appelant). Le geste manquant est
    // le même que ci-dessus : l'issue déclarée par le commercial. `saved.id` —
    // l'id de la ligne `user_actions` qu'on vient d'écrire — porte la
    // référence de cause : c'est elle qui rend la bascule idempotente côté
    // `SprintsService` (rejouer la même trace ne bascule pas deux fois).
    it.each([
      ['replied', 'positive_reply'],
      ['meeting', 'meeting_booked'],
    ] as const)('fait basculer le sprint du compte quand le statut devient « %s » (%s)', async (userStatus, event) => {
      const contact = {
        id: 'c1',
        account_id: 'acc-1',
        user_id: 'user-1',
        user_status: 'contacted',
        full_name: 'Camille Roux',
      } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      userActions.save.mockImplementationOnce(async (x: UserActionEntity) => ({ ...x, id: 'action-1' }))

      const result = await service.updateStatus('c1', 'user-1', userStatus)

      expect(isSuccess(result)).toBe(true)
      expect(sprintBus.emit).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        accountId: 'acc-1',
        event,
        sourceRef: 'action-1',
      })
    })

    it('un contact SANS compte rattaché ne fait rien basculer — et ne plante pas', async () => {
      // ⚠️ `contacts.account_id` est NOT NULL en base ; ce test couvre malgré
      // tout la défense en profondeur demandée : un compte absent ne doit
      // jamais faire planter l'enregistrement de l'issue.
      const contact = {
        id: 'c1',
        account_id: null,
        user_id: 'user-1',
        user_status: 'contacted',
        full_name: 'Camille Roux',
      } as unknown as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      userActions.save.mockImplementationOnce(async (x: UserActionEntity) => ({ ...x, id: 'action-1' }))

      const result = await service.updateStatus('c1', 'user-1', 'replied')

      expect(isSuccess(result)).toBe(true)
      expect(sprintBus.emit).not.toHaveBeenCalled()
    })

    it('la bascule de sprint est best-effort : son échec ne fait JAMAIS échouer l’enregistrement de l’issue', async () => {
      // Le geste de l'utilisateur (son issue déclarée) prime — même style que
      // l'auto-pause des séquences et le journal d'activité ci-dessus.
      const contact = {
        id: 'c1',
        account_id: 'acc-1',
        user_id: 'user-1',
        user_status: 'contacted',
        full_name: 'Camille Roux',
      } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      userActions.save.mockImplementationOnce(async (x: UserActionEntity) => ({ ...x, id: 'action-1' }))
      sprintBus.emit.mockRejectedValueOnce(new Error('sprints db down'))

      const result = await service.updateStatus('c1', 'user-1', 'replied')

      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output.user_status).toBe('replied')
      // Le journal d'activité, lui, a bien été écrit malgré l'échec de la bascule.
      expect(userActions.save).toHaveBeenCalled()
    })

    it('ne tente aucune bascule de sprint pour un statut qui n’est pas une issue', async () => {
      const contact = { id: 'c1', account_id: 'acc-1', user_id: 'user-1', user_status: 'new' } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)

      await service.updateStatus('c1', 'user-1', 'contacted')

      expect(sprintBus.emit).not.toHaveBeenCalled()
    })

    it('ne consigne RIEN quand le statut ne change pas — un re-clic n’est pas un second RDV', async () => {
      // Sans cette garde, re-choisir « Rendez-vous » sur un contact déjà en
      // rendez-vous fabriquerait un événement de plus à chaque clic, et le
      // compteur deviendrait auto-gonflable.
      const contact = { id: 'c1', account_id: 'acc-1', user_id: 'user-1', user_status: 'meeting' } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)

      await service.updateStatus('c1', 'user-1', 'meeting')

      expect(userActions.save).not.toHaveBeenCalled()
      expect(sprintBus.emit).not.toHaveBeenCalled()
    })

    it('ne consigne rien pour un statut qui n’est pas une issue lue par un compteur', async () => {
      const contact = { id: 'c1', account_id: 'acc-1', user_id: 'user-1', user_status: 'new' } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)

      await service.updateStatus('c1', 'user-1', 'contacted')

      expect(userActions.save).not.toHaveBeenCalled()
    })

    it('un journal en échec ne défait pas un statut déjà enregistré', async () => {
      // Le statut est persisté AVANT la trace : l'utilisateur a vu son geste
      // réussir, une écriture de journal ratée ne doit pas le lui reprendre.
      const contact = { id: 'c1', account_id: 'acc-1', user_id: 'user-1', user_status: 'contacted' } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      userActions.save.mockRejectedValueOnce(new Error('journal down'))

      const result = await service.updateStatus('c1', 'user-1', 'replied')

      expect(isSuccess(result)).toBe(true)
      // Sans trace écrite, il n'y a pas de référence de cause à porter : la
      // bascule de sprint n'est pas tentée.
      expect(sprintBus.emit).not.toHaveBeenCalled()
    })

    it('does NOT touch outreach sequences for other status transitions', async () => {
      const contact = { id: 'c1', user_id: 'user-1', user_status: 'new' } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)

      await service.updateStatus('c1', 'user-1', 'contacted')

      expect(repo.query).not.toHaveBeenCalledWith(expect.stringContaining('outreach_sequences'), expect.anything())
    })

    it('auto-pause is best-effort: a pause failure never fails the status update', async () => {
      const contact = { id: 'c1', user_id: 'user-1', user_status: 'contacted' } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      repo.query.mockRejectedValueOnce(new Error('table missing'))

      const result = await service.updateStatus('c1', 'user-1', 'replied')

      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output.user_status).toBe('replied')
    })
  })

  /**
   * m13 — le test qui compte : de bout en bout, avec un VRAI `SprintsService`
   * (pas un mock d'`applyEvent`), pour prouver le contrat complet — pas
   * seulement que `ContactsService` appelle la bonne méthode avec les bons
   * arguments.
   *
   * m18 : `ContactsService` n'appelle plus `SprintsService` — il ÉMET sur
   * `SprintProgressionBus`. Ce test câble donc le VRAI `SprintProgressionBus`
   * ET le VRAI `SprintProgressionListener` (comme `SprintsModule` le fait en
   * production), pour prouver le contrat complet à travers l'événement, pas
   * seulement que `ContactsService` sait émettre.
   *
   * Le mock de repo ci-dessous rejoue exactement le comportement de la table
   * `sprint_switches` : une seconde ligne `(account_id, event, source_ref)`
   * identique viole sa contrainte d'unicité (23505), et `SprintsService`
   * traite cette violation comme le rejeu d'une cause déjà traitée — voir
   * `sprints.spec.ts` pour le même contrat testé côté service. Ici, on prouve
   * que `ContactsService` s'y branche correctement, à travers le bus.
   */
  describe('m13/m18 — une réponse positive fait basculer le sprint (de bout en bout, via l’événement)', () => {
    function makeRealSprints(initialSprint: string) {
      let sprint: string | null = initialSprint
      const seen = new Set<string>()
      const runnerQuery = jest.fn(async (sql: string, params: unknown[]) => {
        if (sql.includes('INSERT INTO sprint_switches')) {
          const [, accountId, event, sourceRef] = params as string[]
          const key = `${accountId}:${event}:${sourceRef}`
          if (seen.has(key)) {
            const error = new Error(
              'duplicate key value violates unique constraint "sprint_switches_dedupe_idx"',
            ) as Error & { code: string }
            error.code = '23505'
            throw error
          }
          seen.add(key)
          return []
        }
        if (sql.includes('UPDATE accounts')) {
          sprint = params[2] as string
          return []
        }
        return [] // board() — le plafond du Focus : 0 compte, jamais bloquant ici.
      })
      const accountRepo = {
        findOne: jest.fn(async () => (sprint === null ? null : { id: 'acc-1', sprint })),
        query: runnerQuery,
        manager: {
          transaction: jest.fn(async (cb: (runner: { query: typeof runnerQuery }) => Promise<void>) => {
            await cb({ query: runnerQuery })
          }),
        },
      }
      const sprintsService = new SprintsService(accountRepo as never)
      // Câblage réel : le bus, et l'écouteur qui s'y abonne — exactement ce que
      // `SprintsModule` fait au démarrage (`onModuleInit`).
      const realBus = new SprintProgressionBus()
      new SprintProgressionListener(realBus, sprintsService).onModuleInit()
      return {
        sprintsService,
        realBus,
        getSprint: () => sprint,
        setSprint: (v: string | null) => (sprint = v),
      }
    }

    it('un RDV décroché fait passer le compte en Focus une seule fois ; le rejeu de la même cause ne rebascule pas ; une correction humaine posée entre-temps survit', async () => {
      const { sprintsService, realBus, getSprint, setSprint } = makeRealSprints('extension')
      service = new ContactsService(
        repo as never,
        userActions as never,
        ia as unknown as IaClient,
        credits as unknown as CreditsService,
        workspace as unknown as WorkspaceContextService,
        mailer as never,
        suppression as never,
        config as never,
        cadence as never,
        accounts as never,
        transitions as never,
        dropcontact as never,
        { isEnabled: () => false } as never,
        merges as never,
        brandsStub as never,
        undefined,
        undefined,
        provenance as never,
        realBus,
      )

      const contact = {
        id: 'c1',
        account_id: 'acc-1',
        user_id: 'user-1',
        user_status: 'contacted',
        full_name: 'Camille Roux',
      } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      userActions.save.mockImplementationOnce(async (x: UserActionEntity) => ({ ...x, id: 'action-1' }))

      // Un commercial marque le contact « rendez-vous décroché ».
      const result = await service.updateStatus('c1', 'user-1', 'meeting')
      expect(isSuccess(result)).toBe(true)
      expect(getSprint()).toBe('focus')

      // Une correction humaine remet le compte en 'extension' entre-temps.
      setSprint('extension')

      // Le rejeu de la MÊME cause (même `source_ref` : l'action 'action-1') —
      // ce que produirait un retry réseau ou une redélivrance — ne rebascule
      // pas et ne défait pas la correction.
      const replay = await sprintsService.applyEvent('ws-1', 'acc-1', 'meeting_booked', 'action-1')
      expect(replay.applied).toBe(false)
      expect(getSprint()).toBe('extension')
    })
  })

  describe('sendEmail', () => {
    const drafted = (over: Partial<ContactEntity> = {}): ContactEntity =>
      ({
        id: 'c1',
        user_id: 'user-1',
        account_id: 'acc-1',
        full_name: 'Jean Dupont',
        email: 'jean@corp.fr',
        email_message: { subject: 'Bonjour', body: 'Premier paragraphe.\n\nSecond.' },
        email_sent_at: null,
        ...over,
      }) as ContactEntity

    // #3699.3/.4/.5 — canal, réservation, états : le sort d'un envoi individuel.
    describe('channel and send state (#3699)', () => {
      const mailboxReady = { connected: true, provider: 'google', address: 'rep@boite.fr', can_send: true }
      const buildWith = (mailboxSender: unknown) =>
        new ContactsService(
          repo as never,
          userActions as never,
          ia as unknown as IaClient,
          credits as unknown as CreditsService,
          workspace as unknown as WorkspaceContextService,
          mailer as never,
          suppression as never,
          config as never,
          cadence as never,
          accounts as never,
          transitions as never,
          dropcontact as never,
          extraEnrichers as never,
          merges as never,
          brandsStub as never,
          undefined,
          undefined,
          provenance as never,
          sprintBus as never,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          mailboxSender as never,
        )

      it('reports the channel and the real sender, and records the state handed_off', async () => {
        repo.findOne.mockResolvedValueOnce(drafted())
        repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
        mailer.sendOutreachEmail.mockResolvedValueOnce({ providerId: 'prov-1' })
        const result = await service.sendEmail('c1', 'user-1', 'rep@esn.fr')
        expect(isSuccess(result)).toBe(true)
        if (isSuccess(result)) {
          expect(result.output).toMatchObject({
            channel: 'workspace',
            sent_from: 'noreply@bellum.test',
            state: 'handed_off',
          })
        }
        expect(repo.save).toHaveBeenCalledWith(
          expect.objectContaining({ email_send_state: 'handed_off', email_send_channel: 'workspace' }),
        )
      })

      it('sends from the connected mailbox when it is chosen — and never through the space transport', async () => {
        const sender = {
          status: jest.fn().mockResolvedValue(mailboxReady),
          send: jest.fn().mockResolvedValue(undefined),
        }
        repo.findOne.mockResolvedValueOnce(drafted())
        repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
        const result = await buildWith(sender).sendEmail('c1', 'user-1', 'rep@esn.fr', undefined, 'mailbox')
        expect(isSuccess(result)).toBe(true)
        expect(sender.send).toHaveBeenCalledWith('user-1', {
          to: 'jean@corp.fr',
          subject: 'Bonjour',
          body: 'Premier paragraphe.\n\nSecond.',
        })
        expect(mailer.sendOutreachEmail).not.toHaveBeenCalled()
        if (isSuccess(result)) expect(result.output).toMatchObject({ channel: 'mailbox', sent_from: 'rep@boite.fr' })
      })

      it('refuses — without any silent fallback to the space address — when the chosen mailbox cannot send', async () => {
        const sender = {
          status: jest.fn().mockResolvedValue({ ...mailboxReady, can_send: false }),
          send: jest.fn(),
        }
        repo.findOne.mockResolvedValueOnce(drafted())
        const result = await buildWith(sender).sendEmail('c1', 'user-1', 'rep@esn.fr', undefined, 'mailbox')
        expect(isFailure(result)).toBe(true)
        if (isFailure(result)) expect(result.problem.code).toBe('mailbox_unavailable')
        expect(mailer.sendOutreachEmail).not.toHaveBeenCalled()
        expect(sender.send).not.toHaveBeenCalled()
        expect(repo.update).not.toHaveBeenCalled()
      })

      // #4546.5 — l'expéditeur se CHOISIT parmi SES boîtes ; l'écran dit l'adresse qui part, jamais une adresse devinée.
      it('sends from the DESIGNATED mailbox and reports ITS address (#4546.5)', async () => {
        const sender = {
          status: jest.fn().mockResolvedValue({ ...mailboxReady, address: 'prospection@marque.fr' }),
          send: jest.fn().mockResolvedValue(undefined),
        }
        repo.findOne.mockResolvedValueOnce(drafted())
        repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
        const result = await buildWith(sender).sendEmail(
          'c1',
          'user-1',
          'rep@esn.fr',
          undefined,
          'mailbox',
          [],
          'conn-2',
        )
        expect(isSuccess(result)).toBe(true)
        expect(sender.status).toHaveBeenCalledWith('user-1', 'conn-2')
        expect(sender.send).toHaveBeenCalledWith('user-1', expect.objectContaining({ senderConnectionId: 'conn-2' }))
        if (isSuccess(result)) {
          expect(result.output).toMatchObject({ channel: 'mailbox', sent_from: 'prospection@marque.fr' })
        }
      })

      it('REFUSES a mailbox that is not the sender own — nothing leaves, no silent fallback (#4546.5)', async () => {
        const sender = {
          status: jest.fn().mockResolvedValue({ connected: false, provider: null, address: null, can_send: false }),
          send: jest.fn(),
        }
        repo.findOne.mockResolvedValueOnce(drafted())
        const result = await buildWith(sender).sendEmail(
          'c1',
          'user-1',
          'rep@esn.fr',
          undefined,
          'mailbox',
          [],
          'conn-x',
        )
        expect(isFailure(result)).toBe(true)
        if (isFailure(result)) {
          expect(result.problem.code).toBe('mailbox_unavailable')
          expect(result.problem.message).toMatch(/pas l'une des tiennes/)
        }
        expect(sender.send).not.toHaveBeenCalled()
        expect(mailer.sendOutreachEmail).not.toHaveBeenCalled()
        expect(repo.update).not.toHaveBeenCalled()
      })

      it('a designated mailbox without the send scope refuses too (#4546.5, #2078.22)', async () => {
        const sender = {
          status: jest.fn().mockResolvedValue({ ...mailboxReady, can_send: false }),
          send: jest.fn(),
        }
        repo.findOne.mockResolvedValueOnce(drafted())
        const result = await buildWith(sender).sendEmail(
          'c1',
          'user-1',
          'rep@esn.fr',
          undefined,
          'mailbox',
          [],
          'conn-ro',
        )
        expect(isFailure(result)).toBe(true)
        expect(sender.send).not.toHaveBeenCalled()
      })

      it('a concurrent attempt (double click, retry) loses the reservation and sends nothing', async () => {
        repo.findOne.mockResolvedValueOnce(drafted())
        repo.update.mockResolvedValue({ affected: 0 })
        const result = await service.sendEmail('c1', 'user-1', 'rep@esn.fr')
        expect(isFailure(result)).toBe(true)
        if (isFailure(result)) expect(result.problem.code).toBe('send_in_progress')
        expect(mailer.sendOutreachEmail).not.toHaveBeenCalled()
      })

      it('a transport that never answers is UNCERTAIN: recorded, and the retry is refused until verified', async () => {
        repo.findOne.mockResolvedValueOnce(drafted())
        mailer.sendOutreachEmail.mockRejectedValueOnce(Object.assign(new Error('fetch failed'), { name: 'TypeError' }))
        const result = await service.sendEmail('c1', 'user-1', 'rep@esn.fr')
        expect(isFailure(result)).toBe(true)
        if (isFailure(result)) expect(result.problem.code).toBe('send_uncertain')
        expect(repo.update).toHaveBeenLastCalledWith({ id: 'c1' }, { email_send_state: 'uncertain' })

        // La reprise : la fiche porte maintenant `uncertain` — aucun second envoi.
        mailer.sendOutreachEmail.mockClear()
        repo.findOne.mockResolvedValueOnce(drafted({ email_send_state: 'uncertain' }))
        const retry = await service.sendEmail('c1', 'user-1', 'rep@esn.fr')
        if (isFailure(retry)) expect(retry.problem.code).toBe('send_uncertain')
        expect(mailer.sendOutreachEmail).not.toHaveBeenCalled()
      })

      it('a transport that answers with a refusal is a plain FAILURE: nothing left, resend stays open', async () => {
        repo.findOne.mockResolvedValueOnce(drafted())
        mailer.sendOutreachEmail.mockRejectedValueOnce(new MailTransportRejectedError('Resend API error: nope'))
        const result = await service.sendEmail('c1', 'user-1', 'rep@esn.fr')
        if (isFailure(result)) expect(result.problem.code).toBe('send_failed')
        expect(repo.update).toHaveBeenLastCalledWith({ id: 'c1' }, { email_send_state: 'failed' })

        repo.findOne.mockResolvedValueOnce(drafted({ email_send_state: 'failed' }))
        repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
        const retry = await service.sendEmail('c1', 'user-1', 'rep@esn.fr')
        expect(isSuccess(retry)).toBe(true)
      })

      it('sends nothing from a demo room — and says so', async () => {
        workspace.isDemoWorkspace = jest.fn().mockResolvedValue(true)
        repo.findOne.mockResolvedValueOnce(drafted())
        const result = await service.sendEmail('c1', 'user-1', 'rep@esn.fr')
        expect(isFailure(result)).toBe(true)
        if (isFailure(result)) expect(result.problem.code).toBe('demo_send_blocked')
        expect(mailer.sendOutreachEmail).not.toHaveBeenCalled()
      })

      it('the activity trace says where from and keeps the means to find the message', async () => {
        repo.findOne.mockResolvedValueOnce(drafted())
        repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
        mailer.sendOutreachEmail.mockResolvedValueOnce({ providerId: 'prov-9' })
        await service.sendEmail('c1', 'user-1', 'rep@esn.fr')
        expect(userActions.create).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({
              channel: 'workspace',
              from: 'noreply@bellum.test',
              provider_message_id: 'prov-9',
            }),
          }),
        )
      })
    })

    // #3699.6 — les pièces jointes choisies par le commercial : relues, vérifiées, jointes, prouvées.
    describe('attachments (#3699.6)', () => {
      const pdf = {
        fileName: 'plaquette.pdf',
        contentType: 'application/pdf',
        contentBase64: 'JVBERi0=',
        byteSize: 5,
        sha256: 'ab'.repeat(32),
      }
      const buildWith = (emailAttachments: unknown, mailboxSender: unknown = undefined) =>
        new ContactsService(
          repo as never,
          userActions as never,
          ia as unknown as IaClient,
          credits as unknown as CreditsService,
          workspace as unknown as WorkspaceContextService,
          mailer as never,
          suppression as never,
          config as never,
          cadence as never,
          accounts as never,
          transitions as never,
          dropcontact as never,
          extraEnrichers as never,
          merges as never,
          brandsStub as never,
          undefined,
          undefined,
          provenance as never,
          sprintBus as never,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          mailboxSender as never,
          undefined,
          emailAttachments as never,
        )

      it('joint les pièces relues au transport, et la preuve dit nom, taille, empreinte — jamais le contenu', async () => {
        const picker = { attachableFor: jest.fn(), resolveForSend: jest.fn().mockResolvedValue(success([pdf])) }
        repo.findOne.mockResolvedValueOnce(drafted())
        repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
        mailer.sendOutreachEmail.mockResolvedValueOnce({ providerId: 'prov-9' })
        const result = await buildWith(picker).sendEmail('c1', 'user-1', 'rep@esn.fr', undefined, 'workspace', [
          '11111111-1111-4111-8111-111111111111',
        ])
        expect(isSuccess(result)).toBe(true)
        expect(picker.resolveForSend).toHaveBeenCalledWith(expect.any(String), 'c1', [
          '11111111-1111-4111-8111-111111111111',
        ])
        expect(mailer.sendOutreachEmail).toHaveBeenCalledWith(
          expect.objectContaining({
            attachments: [{ fileName: 'plaquette.pdf', contentType: 'application/pdf', contentBase64: 'JVBERi0=' }],
          }),
        )
        if (isSuccess(result)) {
          expect(result.output.attachments).toEqual([{ name: 'plaquette.pdf', byte_size: 5, sha256: 'ab'.repeat(32) }])
          expect(JSON.stringify(result.output)).not.toContain('JVBERi0=')
        }
      })

      it('joint aussi les pièces sur la boîte connectée', async () => {
        const picker = { attachableFor: jest.fn(), resolveForSend: jest.fn().mockResolvedValue(success([pdf])) }
        const sender = {
          status: jest
            .fn()
            .mockResolvedValue({ connected: true, provider: 'microsoft', address: 'rep@boite.fr', can_send: true }),
          send: jest.fn().mockResolvedValue(undefined),
        }
        repo.findOne.mockResolvedValueOnce(drafted())
        repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
        await buildWith(picker, sender).sendEmail('c1', 'user-1', 'rep@esn.fr', undefined, 'mailbox', [
          '11111111-1111-4111-8111-111111111111',
        ])
        expect(sender.send).toHaveBeenCalledWith(
          'user-1',
          expect.objectContaining({ attachments: [expect.objectContaining({ fileName: 'plaquette.pdf' })] }),
        )
      })

      it('SAIT DIRE NON — une pièce refusée refuse l’envoi entier : aucun transport, aucune réservation', async () => {
        const picker = {
          attachableFor: jest.fn(),
          resolveForSend: jest
            .fn()
            .mockResolvedValue(failure({ code: 'attachment_refused', message: 'ne se joint qu’après intérêt' })),
        }
        repo.findOne.mockResolvedValueOnce(drafted())
        const result = await buildWith(picker).sendEmail('c1', 'user-1', 'rep@esn.fr', undefined, 'workspace', [
          '11111111-1111-4111-8111-111111111111',
        ])
        expect(isSuccess(result)).toBe(false)
        if (!isSuccess(result)) expect(result.problem.code).toBe('attachment_refused')
        expect(mailer.sendOutreachEmail).not.toHaveBeenCalled()
        expect(repo.update).not.toHaveBeenCalled()
      })

      it('la preuve des pièces vit dans la réservation, sur le contact et au journal — jamais le contenu', async () => {
        const picker = { attachableFor: jest.fn(), resolveForSend: jest.fn().mockResolvedValue(success([pdf])) }
        repo.findOne.mockResolvedValueOnce(drafted())
        repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
        userActions.create.mockImplementation((x: unknown) => x as never)
        mailer.sendOutreachEmail.mockResolvedValueOnce({ providerId: 'prov-10' })
        await buildWith(picker).sendEmail('c1', 'user-1', 'rep@esn.fr', undefined, 'workspace', [
          '11111111-1111-4111-8111-111111111111',
        ])
        const proof = [{ name: 'plaquette.pdf', byte_size: 5, sha256: 'ab'.repeat(32) }]
        expect(repo.update).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ email_send_state: 'claimed', email_send_attachments: proof }),
        )
        expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ email_send_attachments: proof }))
        const logged = userActions.create.mock.calls.at(-1)?.[0] as { metadata: Record<string, unknown> }
        expect(logged.metadata['attachments']).toEqual(proof)
        expect(JSON.stringify(logged)).not.toContain('JVBERi0=')
      })

      it('sans pièce, la preuve reste vide (null), le journal ne porte aucune clé attachments', async () => {
        repo.findOne.mockResolvedValueOnce(drafted())
        repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
        userActions.create.mockImplementation((x: unknown) => x as never)
        mailer.sendOutreachEmail.mockResolvedValueOnce({ providerId: 'prov-11' })
        await service.sendEmail('c1', 'user-1', 'rep@esn.fr')
        expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ email_send_attachments: null }))
        const logged = userActions.create.mock.calls.at(-1)?.[0] as { metadata: Record<string, unknown> }
        expect(logged.metadata).not.toHaveProperty('attachments')
      })

      it('sans fournisseur de pièces, une pièce demandée est REFUSÉE, jamais ignorée', async () => {
        repo.findOne.mockResolvedValueOnce(drafted())
        const result = await service.sendEmail('c1', 'user-1', 'rep@esn.fr', undefined, 'workspace', [
          '11111111-1111-4111-8111-111111111111',
        ])
        expect(isSuccess(result)).toBe(false)
        expect(mailer.sendOutreachEmail).not.toHaveBeenCalled()
      })
    })

    describe('resolveSendAttempt (#3699.5)', () => {
      it('not_sent reopens the send after an uncertain attempt', async () => {
        repo.findOne.mockResolvedValueOnce(drafted({ email_send_state: 'uncertain' }))
        const result = await service.resolveSendAttempt('c1', 'user-1', 'not_sent')
        expect(isSuccess(result)).toBe(true)
        expect(repo.update).toHaveBeenCalledWith({ id: 'c1' }, { email_send_state: 'failed' })
      })

      it('sent is declarative: it stamps the date but logs no message_sent event and starts no cadence', async () => {
        repo.findOne.mockResolvedValueOnce(drafted({ email_send_state: 'uncertain' }))
        const result = await service.resolveSendAttempt('c1', 'user-1', 'sent')
        expect(isSuccess(result)).toBe(true)
        expect(repo.update).toHaveBeenCalledWith(
          { id: 'c1' },
          expect.objectContaining({ email_send_state: 'handed_off', email_sent_at: expect.any(Date) }),
        )
        expect(userActions.save).not.toHaveBeenCalled()
        expect(cadence.scheduleForContact).not.toHaveBeenCalled()
      })

      it('refuses when there is nothing uncertain to resolve', async () => {
        repo.findOne.mockResolvedValueOnce(drafted())
        const result = await service.resolveSendAttempt('c1', 'user-1', 'not_sent')
        if (isFailure(result)) expect(result.problem.code).toBe('invalid')
        expect(repo.update).not.toHaveBeenCalled()
      })
    })

    it('scopes the lookup to the caller’s workspace (no cross-workspace send)', async () => {
      repo.findOne.mockResolvedValueOnce(drafted())
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      await service.sendEmail('c1', 'user-1', 'rep@esn.fr')
      // #4731 — le geste est borné par l'ESPACE (ws-1), plus par le seul `user_id` : un coéquipier agit
      // sur les lignes de son espace. La ligne ancienne (`workspace_id` NULL) reste à son propriétaire.
      expect(repo.findOne).toHaveBeenCalledWith({
        where: [
          { id: 'c1', workspace_id: 'ws-1', deleted_at: IsNull() },
          { id: 'c1', workspace_id: IsNull(), user_id: 'user-1', deleted_at: IsNull() },
        ],
      })
    })

    it('sends the drafted email via the mailer, with the rep as Reply-To', async () => {
      repo.findOne.mockResolvedValueOnce(drafted())
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      const result = await service.sendEmail('c1', 'user-1', 'rep@esn.fr')

      expect(isSuccess(result)).toBe(true)
      expect(mailer.sendOutreachEmail).toHaveBeenCalledWith({
        to: 'jean@corp.fr',
        subject: 'Bonjour',
        body: 'Premier paragraphe.\n\nSecond.',
        replyTo: 'rep@esn.fr',
        unsubscribeUrl: undefined,
        // Marque blanche (01/09/2026) : `null` = l'espace n'a déclaré aucune
        // adresse, donc le mailer retombe sur celle d'environnement. Ce n'est
        // PAS la même chose que `undefined` — c'est une valeur lue, pas un
        // champ absent, et c'est ce qui distingue « rien à mettre » de « on
        // n'a pas regardé ».
        from: null,
      })
      if (isSuccess(result)) {
        expect(result.output.contact_id).toBe('c1')
        expect(result.output.sent_to).toBe('jean@corp.fr')
        expect(typeof result.output.email_sent_at).toBe('string')
      }
    })

    it('stamps email_sent_at and logs a real message_sent/email action', async () => {
      repo.findOne.mockResolvedValueOnce(drafted())
      let savedContact: ContactEntity | undefined
      repo.save.mockImplementationOnce(async (x: ContactEntity) => {
        savedContact = x
        return x
      })
      await service.sendEmail('c1', 'user-1', 'rep@esn.fr')

      expect(savedContact?.email_sent_at).toBeInstanceOf(Date)
      expect(userActions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          contact_id: 'c1',
          account_id: 'acc-1',
          workspace_id: 'ws-1',
          action_type: 'message_sent',
          channel: 'email',
        }),
      )
      expect(userActions.save).toHaveBeenCalled()
    })

    it('falls back to a default subject when the draft has none', async () => {
      repo.findOne.mockResolvedValueOnce(drafted({ email_message: { body: 'Corps.' } } as Partial<ContactEntity>))
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      await service.sendEmail('c1', 'user-1', 'rep@esn.fr')
      expect(mailer.sendOutreachEmail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Prise de contact — Jean Dupont' }),
      )
    })

    it('omits Reply-To when the rep email is not a valid address', async () => {
      repo.findOne.mockResolvedValueOnce(drafted())
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      await service.sendEmail('c1', 'user-1', '')
      expect(mailer.sendOutreachEmail).toHaveBeenCalledWith(expect.objectContaining({ replyTo: undefined }))
    })

    it('fails not_found when the contact is missing (or not owned)', async () => {
      repo.findOne.mockResolvedValueOnce(null)
      const result = await service.sendEmail('c1', 'user-1', 'rep@esn.fr')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('not_found')
      expect(mailer.sendOutreachEmail).not.toHaveBeenCalled()
    })

    it('fails no_email when the contact has no address', async () => {
      repo.findOne.mockResolvedValueOnce(drafted({ email: null }))
      const result = await service.sendEmail('c1', 'user-1', 'rep@esn.fr')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('no_email')
      expect(mailer.sendOutreachEmail).not.toHaveBeenCalled()
    })

    it('fails no_draft when there is no email_message body', async () => {
      repo.findOne.mockResolvedValueOnce(drafted({ email_message: null }))
      const result = await service.sendEmail('c1', 'user-1', 'rep@esn.fr')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('no_draft')
    })

    it('fails already_sent when the contact was already emailed (idempotency)', async () => {
      repo.findOne.mockResolvedValueOnce(drafted({ email_sent_at: new Date() }))
      const result = await service.sendEmail('c1', 'user-1', 'rep@esn.fr')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('already_sent')
      expect(mailer.sendOutreachEmail).not.toHaveBeenCalled()
    })

    it('fails send_failed and does NOT stamp/log when the transport throws', async () => {
      repo.findOne.mockResolvedValueOnce(drafted())
      mailer.sendOutreachEmail.mockRejectedValueOnce(new Error('Resend API error: invalid'))
      const result = await service.sendEmail('c1', 'user-1', 'rep@esn.fr')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('send_failed')
      expect(repo.save).not.toHaveBeenCalled()
      expect(userActions.save).not.toHaveBeenCalled()
      // A send that never left must not open a cadence (Drive #8).
      expect(cadence.scheduleForContact).not.toHaveBeenCalled()
    })

    it('opens the multi-touch cadence for the contact after a successful send', async () => {
      const c = drafted()
      repo.findOne.mockResolvedValueOnce(c)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      const result = await service.sendEmail('c1', 'user-1', 'rep@esn.fr')
      expect(isSuccess(result)).toBe(true)
      expect(cadence.scheduleForContact).toHaveBeenCalledWith(c, 'user-1')
    })

    it('still succeeds when cadence scheduling fails (email already sent, best-effort)', async () => {
      repo.findOne.mockResolvedValueOnce(drafted())
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      cadence.scheduleForContact.mockRejectedValueOnce(new Error('db down'))
      const result = await service.sendEmail('c1', 'user-1', 'rep@esn.fr')
      expect(isSuccess(result)).toBe(true)
    })

    // #2396.3 — l'envoi VÉRIFIÉ complète les actions ouvertes visant ce contact.
    it('completes the contact’s open actions by proof after a successful send', async () => {
      repo.findOne.mockResolvedValueOnce(drafted())
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      const result = await service.sendEmail('c1', 'user-1', 'rep@esn.fr')
      expect(isSuccess(result)).toBe(true)
      expect(cadence.completeOpenItemsByProof).toHaveBeenCalledWith('c1')
    })

    it('still succeeds when proof-completion fails (email already sent, best-effort)', async () => {
      repo.findOne.mockResolvedValueOnce(drafted())
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      cadence.completeOpenItemsByProof.mockRejectedValueOnce(new Error('db down'))
      const result = await service.sendEmail('c1', 'user-1', 'rep@esn.fr')
      expect(isSuccess(result)).toBe(true)
    })

    it('refuses to send to an opted-out contact (suppression list)', async () => {
      repo.findOne.mockResolvedValueOnce(drafted())
      suppression.isSuppressed.mockResolvedValueOnce(true)
      const result = await service.sendEmail('c1', 'user-1', 'rep@esn.fr')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('suppressed')
      expect(suppression.isSuppressed).toHaveBeenCalledWith('ws-1', 'jean@corp.fr')
      expect(mailer.sendOutreachEmail).not.toHaveBeenCalled()
    })

    it('attaches a signed unsubscribe URL when a public URL is configured', async () => {
      repo.findOne.mockResolvedValueOnce(drafted())
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      config.get.mockImplementation((k: string) =>
        k === 'apiPublicUrl'
          ? 'https://api.bellum-ai.com'
          : k === 'internalApiSecret'
            ? 'secret-0123456789'
            : undefined,
      )
      await service.sendEmail('c1', 'user-1', 'rep@esn.fr')
      const arg = mailer.sendOutreachEmail.mock.calls[0][0]
      expect(arg.unsubscribeUrl).toMatch(/^https:\/\/api\.bellum-ai\.com\/emails\/unsubscribe\?token=/)
    })

    /**
     * The engagement panel generates its draft live and never persists it. If
     * the send read `email_message` from the DB, the seller would review one
     * text and Bellum would mail another. `draft` closes that gap: what is sent
     * is exactly what was on screen — and the contact row is updated to match.
     */
    describe('reviewed draft (what you see is what is sent)', () => {
      const reviewed = { subject: 'Objet relu', body: 'Corps relu par le commercial.' }

      it('sends the reviewed draft instead of the stale stored one', async () => {
        repo.findOne.mockResolvedValueOnce(drafted())
        repo.save.mockImplementationOnce(async (x: ContactEntity) => x)

        await service.sendEmail('c1', 'user-1', 'rep@esn.fr', reviewed)

        expect(mailer.sendOutreachEmail).toHaveBeenCalledWith(
          expect.objectContaining({ subject: 'Objet relu', body: 'Corps relu par le commercial.' }),
        )
      })

      it('persists the reviewed draft so the stored record equals what was sent', async () => {
        repo.findOne.mockResolvedValueOnce(drafted())
        let saved: ContactEntity | undefined
        repo.save.mockImplementationOnce(async (x: ContactEntity) => {
          saved = x
          return x
        })

        await service.sendEmail('c1', 'user-1', 'rep@esn.fr', reviewed)

        expect(saved?.email_message).toEqual(reviewed)
        expect(saved?.email_sent_at).toBeInstanceOf(Date)
      })

      it('never lets the caller pick the recipient — always the contact address', async () => {
        repo.findOne.mockResolvedValueOnce(drafted())
        repo.save.mockImplementationOnce(async (x: ContactEntity) => x)

        await service.sendEmail('c1', 'user-1', 'rep@esn.fr', reviewed)

        expect(mailer.sendOutreachEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'jean@corp.fr' }))
      })

      it('keeps the idempotency guard — a reviewed draft cannot re-send', async () => {
        repo.findOne.mockResolvedValueOnce(drafted({ email_sent_at: new Date() }))

        const result = await service.sendEmail('c1', 'user-1', 'rep@esn.fr', reviewed)

        expect(isFailure(result)).toBe(true)
        if (isFailure(result)) expect(result.problem.code).toBe('already_sent')
        expect(mailer.sendOutreachEmail).not.toHaveBeenCalled()
        // The stored draft must stay untouched when the send is refused.
        expect(repo.save).not.toHaveBeenCalled()
      })

      it('keeps the opt-out guard — a reviewed draft cannot reach a suppressed contact', async () => {
        repo.findOne.mockResolvedValueOnce(drafted())
        suppression.isSuppressed.mockResolvedValueOnce(true)

        const result = await service.sendEmail('c1', 'user-1', 'rep@esn.fr', reviewed)

        expect(isFailure(result)).toBe(true)
        if (isFailure(result)) expect(result.problem.code).toBe('suppressed')
        expect(mailer.sendOutreachEmail).not.toHaveBeenCalled()
        expect(repo.save).not.toHaveBeenCalled()
      })

      it('keeps the no_email guard — a reviewed draft cannot invent a recipient', async () => {
        repo.findOne.mockResolvedValueOnce(drafted({ email: null }))

        const result = await service.sendEmail('c1', 'user-1', 'rep@esn.fr', reviewed)

        expect(isFailure(result)).toBe(true)
        if (isFailure(result)) expect(result.problem.code).toBe('no_email')
        expect(mailer.sendOutreachEmail).not.toHaveBeenCalled()
      })

      it('sends the reviewed draft even when the contact has no stored draft', async () => {
        repo.findOne.mockResolvedValueOnce(drafted({ email_message: null }))
        repo.save.mockImplementationOnce(async (x: ContactEntity) => x)

        const result = await service.sendEmail('c1', 'user-1', 'rep@esn.fr', reviewed)

        expect(isSuccess(result)).toBe(true)
        expect(mailer.sendOutreachEmail).toHaveBeenCalledWith(
          expect.objectContaining({ body: 'Corps relu par le commercial.' }),
        )
      })

      it('falls back to the default subject when the reviewed draft has none', async () => {
        repo.findOne.mockResolvedValueOnce(drafted())
        repo.save.mockImplementationOnce(async (x: ContactEntity) => x)

        await service.sendEmail('c1', 'user-1', 'rep@esn.fr', { body: 'Corps seul.' })

        expect(mailer.sendOutreachEmail).toHaveBeenCalledWith(
          expect.objectContaining({ subject: 'Prise de contact — Jean Dupont' }),
        )
      })

      it('ignores a blank reviewed body and falls back to the stored draft', async () => {
        repo.findOne.mockResolvedValueOnce(drafted())
        repo.save.mockImplementationOnce(async (x: ContactEntity) => x)

        await service.sendEmail('c1', 'user-1', 'rep@esn.fr', { subject: 'x', body: '   ' })

        expect(mailer.sendOutreachEmail).toHaveBeenCalledWith(
          expect.objectContaining({ body: 'Premier paragraphe.\n\nSecond.' }),
        )
      })

      it('traces the reviewed subject in the user_actions feed', async () => {
        repo.findOne.mockResolvedValueOnce(drafted())
        repo.save.mockImplementationOnce(async (x: ContactEntity) => x)

        await service.sendEmail('c1', 'user-1', 'rep@esn.fr', reviewed)

        expect(userActions.create).toHaveBeenCalledWith(
          expect.objectContaining({
            action_type: 'message_sent',
            metadata: expect.objectContaining({ subject: 'Objet relu' }),
          }),
        )
      })
    })
  })

  /**
   * #2733 (SKAIZen Group, 22/09/2026) — appelée par `ResendWebhookController`
   * quand Resend confirme un rebond (`email.bounced`). `email_sent_at` prouve
   * seulement que Resend a ACCEPTÉ le message ; `email_bounced_at` devient la
   * vérité de livraison, sans jamais écraser `email_sent_at` (on archive, on
   * ne supprime pas — doctrine c73_fait_ne_porte_pas_preuve_denvoi).
   */
  describe('applyEmailBounce', () => {
    const bounced = (over: Partial<ContactEntity> = {}): ContactEntity =>
      ({
        id: 'c1',
        user_id: 'user-1',
        account_id: 'acc-1',
        full_name: 'Jean Dupont',
        email: 'jean@corp.fr',
        email_sent_at: new Date('2026-09-22T10:00:00.000Z'),
        email_provider_message_id: 're_abc123',
        email_bounced_at: null,
        email_bounce_reason: null,
        ...over,
      }) as ContactEntity

    it("trouve le contact par l'identifiant Resend — la seule clé que le webhook connaît", async () => {
      repo.findOne.mockResolvedValueOnce(bounced())
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)

      await service.applyEmailBounce('re_abc123', 'permanent')

      expect(repo.findOne).toHaveBeenCalledWith({ where: { email_provider_message_id: 're_abc123' } })
    })

    it('pose email_bounced_at et la raison, SANS toucher email_sent_at (on archive, on ne supprime pas)', async () => {
      repo.findOne.mockResolvedValueOnce(bounced())
      let saved: ContactEntity | undefined
      repo.save.mockImplementationOnce(async (x: ContactEntity) => {
        saved = x
        return x
      })

      await service.applyEmailBounce('re_abc123', 'permanent')

      expect(saved?.email_bounced_at).toBeInstanceOf(Date)
      expect(saved?.email_bounce_reason).toBe('permanent')
      expect(saved?.email_sent_at).toEqual(new Date('2026-09-22T10:00:00.000Z'))
    })

    it('sort le contact des relances automatiques', async () => {
      repo.findOne.mockResolvedValueOnce(bounced())
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)

      await service.applyEmailBounce('re_abc123', 'permanent')

      expect(cadence.cancelPendingForBounce).toHaveBeenCalledWith('c1')
    })

    // #2378.3 — le webhook Resend (#2733) est un signal de rebond plus FIABLE
    // que la classification d'un message entrant (`mailbox.service.ts`,
    // #2381.1) : il vient du fournisseur, pas d'une notification qui peut ne
    // jamais arriver en boîte. Avant ce test, seules les touches `cadence`
    // (ancien moteur) s'arrêtaient sur rebond — les séquences `outreach`
    // vivantes continuaient de programmer des relances sur une adresse morte.
    it('arrête aussi les séquences outreach actives/en pause avec la cause hard_bounce (#2378.3)', async () => {
      repo.findOne.mockResolvedValueOnce(bounced())
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      repo.query.mockImplementation(async (sql: string) =>
        typeof sql === 'string' && sql.includes('FROM previous')
          ? [{ id: 'seq-1', workspace_id: 'ws-1', previous_status: 'active' }]
          : [],
      )

      await service.applyEmailBounce('re_abc123', 'permanent')

      expect(repo.query).toHaveBeenCalledWith(expect.stringContaining("SET status = 'cancelled'"), ['c1', 'user-1'])
      expect(repo.query).toHaveBeenCalledWith(expect.stringContaining("SET status = 'skipped'"), [['seq-1']])
      expect(repo.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO outreach_transitions'), [
        'ws-1',
        'user-1',
        'seq-1',
        'active',
        'hard_bounce',
      ])
    })

    it("l'arrêt des séquences reste best-effort : un échec n'empêche pas le rebond d'être posé", async () => {
      repo.findOne.mockResolvedValueOnce(bounced())
      let saved: ContactEntity | undefined
      repo.save.mockImplementationOnce(async (x: ContactEntity) => {
        saved = x
        return x
      })
      repo.query.mockRejectedValue(new Error('boom'))

      const result = await service.applyEmailBounce('re_abc123', 'permanent')

      expect(result).toEqual({ contactId: 'c1' })
      expect(saved?.email_bounced_at).toBeInstanceOf(Date)
    })

    it('rend le contactId trouvé', async () => {
      repo.findOne.mockResolvedValueOnce(bounced())
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)

      const result = await service.applyEmailBounce('re_abc123', 'permanent')

      expect(result).toEqual({ contactId: 'c1' })
    })

    it('rend `null` sans lever — un identifiant inconnu du webhook n’est pas une erreur de notre côté', async () => {
      repo.findOne.mockResolvedValueOnce(null)

      const result = await service.applyEmailBounce('re_unknown', 'permanent')

      expect(result).toBeNull()
      expect(repo.save).not.toHaveBeenCalled()
      expect(cadence.cancelPendingForBounce).not.toHaveBeenCalled()
    })
  })

  /**
   * #2384.5 — délivrabilité DISTINCTE du taux d'envoi : « combien de ce qui
   * est parti a réellement atteint la boîte », posé sur `email_bounced_at`/
   * `email_bounce_reason` (#2733, webhook fournisseur — jamais deviné).
   * `domainReputation`/`complaints` restent `null` : aucun connecteur ne les
   * mesure aujourd'hui (doctrine GA-18/19, « non mesuré n'est jamais 0 »).
   */
  describe('getDeliverability', () => {
    it("agrège envoyés/rebonds sur l'espace actif, calcule le taux, et nomme ce qui n'est pas mesuré", async () => {
      repo.query.mockImplementation(async (sql: string) => {
        if (typeof sql === 'string' && sql.includes('AS "sent"')) return [{ sent: 10, bounced: 2 }]
        if (typeof sql === 'string' && sql.includes('AS "reason"'))
          return [
            { reason: 'permanent', count: 1 },
            { reason: 'temporary', count: 1 },
          ]
        return []
      })

      const result = await service.getDeliverability('user-1')

      expect(repo.query).toHaveBeenCalledWith(expect.stringContaining('AS "sent"'), ['ws-1'])
      expect(repo.query).toHaveBeenCalledWith(expect.stringContaining('AS "reason"'), ['ws-1'])
      expect(result).toEqual({
        sent: 10,
        bounced: 2,
        bounceRate: 0.2,
        bounceReasons: [
          { reason: 'permanent', count: 1 },
          { reason: 'temporary', count: 1 },
        ],
        domainReputation: null,
        complaints: null,
      })
    })

    it('rend `bounceRate: null` sans envoi mesuré — jamais 0 sur un dénominateur nul', async () => {
      repo.query.mockResolvedValue([])

      const result = await service.getDeliverability('user-1')

      expect(result.bounceRate).toBeNull()
      expect(result.sent).toBe(0)
      expect(result.bounced).toBe(0)
    })

    it('rend un agrégat vide sans lever quand la requête échoue', async () => {
      repo.query.mockRejectedValue(new Error('boom'))

      const result = await service.getDeliverability('user-1')

      expect(result).toEqual({
        sent: 0,
        bounced: 0,
        bounceRate: null,
        bounceReasons: [],
        domainReputation: null,
        complaints: null,
      })
    })
  })

  /**
   * #2842 (reste, 26/09) — épopée #2074.13-.19, tranché sans Louis :
   * `contactFollowUps` de l'audit commercial. `total` = les contacts PRIS
   * (`email_sent_at`, même fait que `getDeliverability().sent`, GA-26) ;
   * `withNextStepDate` = ceux qui ont encore une touche de cadence OUVERTE
   * (`action_plan_items.cadence_step IS NOT NULL AND done = false`).
   */
  describe('getFollowUpStats', () => {
    it("agrège sur l'espace actif", async () => {
      repo.query.mockResolvedValue([{ total: 12, withNextStepDate: 5 }])

      const result = await service.getFollowUpStats('user-1')

      expect(repo.query).toHaveBeenCalledWith(expect.stringContaining('email_sent_at IS NOT NULL'), ['ws-1'])
      expect(repo.query).toHaveBeenCalledWith(expect.stringContaining('action_plan_items'), ['ws-1'])
      expect(result).toEqual({ total: 12, withNextStepDate: 5 })
    })

    it('rend un zéro MESURÉ, pas une absence, quand rien n’a jamais été pris', async () => {
      repo.query.mockResolvedValue([{ total: 0, withNextStepDate: 0 }])

      const result = await service.getFollowUpStats('user-1')

      expect(result).toEqual({ total: 0, withNextStepDate: 0 })
    })

    it('rend un agrégat vide sans lever quand la requête échoue', async () => {
      repo.query.mockRejectedValue(new Error('boom'))

      const result = await service.getFollowUpStats('user-1')

      expect(result).toEqual({ total: 0, withNextStepDate: 0 })
    })
  })

  /**
   * Lets the panel disable « Envoyer » BEFORE the seller invests time editing a
   * draft for someone who can never receive it. Opt-out lives in a separate
   * table, so it is the one blocker the client cannot deduce on its own.
   */
  describe('getSendability', () => {
    const sendable = (over: Partial<ContactEntity> = {}): ContactEntity =>
      ({
        id: 'c1',
        user_id: 'user-1',
        account_id: 'acc-1',
        full_name: 'Jean Dupont',
        email: 'jean@corp.fr',
        email_sent_at: null,
        ...over,
      }) as ContactEntity

    it('resolves the contact in the caller workspace (no cross-workspace probe)', async () => {
      repo.findOne.mockResolvedValueOnce(sendable())
      await service.getSendability('c1', 'user-1')
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'c1', deleted_at: IsNull(), workspace_id: 'ws-1' } })
    })

    it('says yes when the contact has an address, was never emailed and did not opt out', async () => {
      repo.findOne.mockResolvedValueOnce(sendable())
      const result = await service.getSendability('c1', 'user-1')
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) {
        expect(result.output).toEqual({
          contact_id: 'c1',
          can_send: true,
          reason: null,
          sender: 'noreply@bellum.test',
          reply_to: null,
        })
      }
    })

    // #3699.1 — l'expéditeur AFFICHÉ est celui que `deliverDraft` utilisera :
    // même source (adresse de l'espace, sinon celle de l'environnement), et
    // l'adresse de réponse du commercial quand elle est connue.
    it('shows the sender the send will really use, and the rep as reply-to (#3699.1)', async () => {
      repo.findOne.mockResolvedValueOnce(sendable())
      brandsStub.getSendingAddress.mockResolvedValueOnce('contact@acme-esn.fr')
      mailer.resolveSenderAddress.mockImplementationOnce((own: string | null) => own ?? 'noreply@bellum.test')
      const result = await service.getSendability('c1', 'user-1', null, 'rep@esn.fr')
      expect(mailer.resolveSenderAddress).toHaveBeenCalledWith('contact@acme-esn.fr')
      if (isSuccess(result)) {
        expect(result.output).toMatchObject({ can_send: true, sender: 'contact@acme-esn.fr', reply_to: 'rep@esn.fr' })
      }
    })

    it('reports the opt-out so the UI can block before composing', async () => {
      repo.findOne.mockResolvedValueOnce(sendable())
      suppression.isSuppressed.mockResolvedValueOnce(true)
      const result = await service.getSendability('c1', 'user-1')
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output).toEqual({ contact_id: 'c1', can_send: false, reason: 'suppressed' })
      expect(suppression.isSuppressed).toHaveBeenCalledWith('ws-1', 'jean@corp.fr')
    })

    // #3698.7 — un e-mail trouvé SANS téléphone reste préparable : l'absence d'un
    // numéro n'est ni un échec ni un motif de blocage, et un e-mail blanc est une absence.
    it('an email-only contact (no phone) is sendable (#3698.7)', async () => {
      repo.findOne.mockResolvedValueOnce(sendable({ phone: null }))
      const result = await service.getSendability('c1', 'user-1')
      if (isSuccess(result)) expect(result.output).toMatchObject({ can_send: true, reason: null })
    })

    it('a blank email counts as absent, like everywhere else (#3698.7)', async () => {
      repo.findOne.mockResolvedValueOnce(sendable({ email: '   ' }))
      const result = await service.getSendability('c1', 'user-1')
      if (isSuccess(result)) expect(result.output.reason).toBe('no_email')
    })

    // #3699.4/.5 — la boîte connectée et la dernière tentative, dites telles quelles.
    it('exposes the connected mailbox and what it can do, so the choice stays explicit (#3699.4)', async () => {
      const sender = {
        status: jest
          .fn()
          .mockResolvedValue({ connected: true, provider: 'google', address: 'rep@boite.fr', can_send: false }),
        send: jest.fn(),
      }
      const withMailbox = new ContactsService(
        repo as never,
        userActions as never,
        ia as unknown as IaClient,
        credits as unknown as CreditsService,
        workspace as unknown as WorkspaceContextService,
        mailer as never,
        suppression as never,
        config as never,
        cadence as never,
        accounts as never,
        transitions as never,
        dropcontact as never,
        extraEnrichers as never,
        merges as never,
        brandsStub as never,
        undefined,
        undefined,
        provenance as never,
        sprintBus as never,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        sender as never,
      )
      repo.findOne.mockResolvedValueOnce(sendable())
      const result = await withMailbox.getSendability('c1', 'user-1')
      if (isSuccess(result)) {
        expect(result.output).toMatchObject({
          can_send: true,
          mailbox: { connected: true, address: 'rep@boite.fr', can_send: false },
        })
      }
    })

    it.each([
      ['uncertain', 'send_uncertain'],
      ['claimed', 'send_in_progress'],
    ])(
      'blocks a resend while the last attempt is %s — verify before proposing to resend (#3699.5)',
      async (state, reason) => {
        repo.findOne.mockResolvedValueOnce(sendable({ email_send_state: state, email_send_attempted_at: new Date() }))
        const result = await service.getSendability('c1', 'user-1')
        if (isSuccess(result)) expect(result.output).toMatchObject({ can_send: false, reason, last_send: { state } })
      },
    )

    it('le compte rendu d’une tentative relit ses pièces : nom, taille, empreinte (#3699.6)', async () => {
      const proof = [{ name: 'plaquette.pdf', byte_size: 5, sha256: 'ab'.repeat(32) }]
      repo.findOne.mockResolvedValueOnce(
        sendable({
          email_sent_at: new Date(),
          email_send_state: 'handed_off',
          email_send_attempted_at: new Date(),
          email_send_attachments: proof,
        }),
      )
      const result = await service.getSendability('c1', 'user-1')
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) {
        expect(result.output).toMatchObject({ reason: 'already_sent', last_send: { attachments: proof } })
      }
    })

    it('#3699.6 — SAIT DIRE NON : une tentative sans pièce ne porte aucune liste de pièces', async () => {
      repo.findOne.mockResolvedValueOnce(
        sendable({ email_sent_at: new Date(), email_send_state: 'handed_off', email_send_attempted_at: new Date() }),
      )
      const result = await service.getSendability('c1', 'user-1')
      if (isSuccess(result)) expect(result.output.last_send).not.toHaveProperty('attachments')
    })

    it('#4179.2 — la présence dans les éléments envoyés n’est dite que si elle a été observée', async () => {
      const observed = new Date('2026-10-10T09:00:05.000Z')
      repo.findOne.mockResolvedValueOnce(
        sendable({
          email_sent_at: new Date(),
          email_send_state: 'handed_off',
          email_send_channel: 'mailbox',
          email_send_attempted_at: new Date(),
          email_sent_observed_at: observed,
        }),
      )
      const seen = await service.getSendability('c1', 'user-1')
      if (isSuccess(seen)) expect(seen.output.last_send).toMatchObject({ observed_at: observed.toISOString() })

      repo.findOne.mockResolvedValueOnce(
        sendable({
          email_sent_at: new Date(),
          email_send_state: 'handed_off',
          email_send_channel: 'mailbox',
          email_send_attempted_at: new Date(),
        }),
      )
      const unseen = await service.getSendability('c1', 'user-1')
      if (isSuccess(unseen)) expect(unseen.output.last_send).not.toHaveProperty('observed_at')
    })

    it('a claimed attempt older than two minutes reads as uncertain (the process may have died)', async () => {
      const old = new Date(Date.now() - 10 * 60 * 1000)
      repo.findOne.mockResolvedValueOnce(sendable({ email_send_state: 'claimed', email_send_attempted_at: old }))
      const result = await service.getSendability('c1', 'user-1')
      if (isSuccess(result)) expect(result.output.reason).toBe('send_uncertain')
    })

    it('flags a demo room so the dialog can show it and nothing leaves (#3699)', async () => {
      workspace.isDemoWorkspace = jest.fn().mockResolvedValue(true)
      repo.findOne.mockResolvedValueOnce(sendable())
      const result = await service.getSendability('c1', 'user-1')
      if (isSuccess(result)) expect(result.output).toMatchObject({ can_send: true, demo: true })
    })

    it('reports an address-less contact without touching the suppression list', async () => {
      repo.findOne.mockResolvedValueOnce(sendable({ email: null }))
      const result = await service.getSendability('c1', 'user-1')
      if (isSuccess(result)) expect(result.output.reason).toBe('no_email')
      expect(suppression.isSuppressed).not.toHaveBeenCalled()
    })

    it('reports an already-emailed contact (same idempotency rule as the send)', async () => {
      repo.findOne.mockResolvedValueOnce(sendable({ email_sent_at: new Date() }))
      const result = await service.getSendability('c1', 'user-1')
      if (isSuccess(result)) expect(result.output.reason).toBe('already_sent')
    })

    it('fails not_found when the contact is missing (or not in the workspace)', async () => {
      repo.findOne.mockResolvedValueOnce(null)
      const result = await service.getSendability('c1', 'user-1')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('not_found')
    })

    it('never leaks who else is on the suppression list — answer is one contact', async () => {
      repo.findOne.mockResolvedValueOnce(sendable())
      suppression.isSuppressed.mockResolvedValueOnce(true)
      const result = await service.getSendability('c1', 'user-1')
      if (isSuccess(result)) {
        expect(Object.keys(result.output).sort()).toEqual(['can_send', 'contact_id', 'reason'])
        expect(JSON.stringify(result.output)).not.toContain('jean@corp.fr')
      }
    })
  })

  describe('getCadence', () => {
    it('resolves the contact in the caller workspace and returns the built cadence', async () => {
      const contact = { id: 'c1', account_id: 'acc-1' } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      const built = { contact_id: 'c1', contacted: true, scheduled: true, steps: [], next_step: null }
      cadence.buildCadence.mockResolvedValueOnce(built)

      const result = await service.getCadence('c1', 'user-1')

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'c1', deleted_at: IsNull(), workspace_id: 'ws-1' } })
      expect(cadence.buildCadence).toHaveBeenCalledWith(contact)
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output).toEqual(built)
    })

    it('fails not_found when the contact is missing (or not in the workspace)', async () => {
      repo.findOne.mockResolvedValueOnce(null)
      const result = await service.getCadence('c1', 'user-1')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('not_found')
      expect(cadence.buildCadence).not.toHaveBeenCalled()
    })
  })

  describe('sendEmailBulk', () => {
    const draftedRow = (over: Partial<ContactEntity> = {}): ContactEntity =>
      ({
        id: 'c1',
        user_id: 'user-1',
        account_id: 'acc-1',
        full_name: 'Jean Dupont',
        email: 'jean@corp.fr',
        email_message: { subject: 'Bonjour', body: 'Corps.' },
        email_sent_at: null,
        ...over,
      }) as ContactEntity

    it('sends to each contact and reports per-contact results', async () => {
      // Un seul SELECT batché (`In(ids)`) remplace le `findOne` par identifiant
      // (perf/cliquet-compte-requetes, GA-313) : le double rend TOUTES les
      // lignes trouvées en un coup, plus dans l'ordre de la boucle.
      repo.find.mockResolvedValueOnce([
        draftedRow({ id: 'c1', email: 'a@corp.fr' }),
        draftedRow({ id: 'c2', email: 'b@corp.fr' }),
      ])
      repo.save.mockImplementation(async (x: ContactEntity) => x)

      const result = await service.sendEmailBulk(['c1', 'c2'], 'user-1', 'rep@esn.fr')

      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) {
        expect(result.output.sent).toEqual([
          { contact_id: 'c1', sent_to: 'a@corp.fr' },
          { contact_id: 'c2', sent_to: 'b@corp.fr' },
        ])
        expect(result.output.skipped).toEqual([])
      }
      expect(mailer.sendOutreachEmail).toHaveBeenCalledTimes(2)
    })

    it('skips (does not fail the batch) contacts that are missing / opted-out / already sent', async () => {
      // c1 absent du résultat batché (not found / not owned) ; c2 et c3 trouvés.
      repo.find.mockResolvedValueOnce([
        draftedRow({ id: 'c2', email_sent_at: new Date() }), // already sent
        draftedRow({ id: 'c3', email: 'c@corp.fr' }), // ok
      ])
      repo.save.mockImplementation(async (x: ContactEntity) => x)
      suppression.isSuppressed.mockImplementation(async (_ws: string, email: string) => email === 'c@corp.fr')

      const result = await service.sendEmailBulk(['c1', 'c2', 'c3'], 'user-1', 'rep@esn.fr')

      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) {
        expect(result.output.sent).toEqual([])
        expect(result.output.skipped).toEqual([
          { contact_id: 'c1', reason: 'not_found' },
          { contact_id: 'c2', reason: 'already_sent' },
          { contact_id: 'c3', reason: 'suppressed' },
        ])
      }
    })

    it('de-duplicates ids and returns empty for an empty list', async () => {
      const result = await service.sendEmailBulk([], 'user-1', 'rep@esn.fr')
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output).toEqual({ sent: [], skipped: [] })
      expect(repo.find).not.toHaveBeenCalled()
    })
  })

  describe('updateNote', () => {
    it('returns a success result with the saved note', async () => {
      const contact = { id: 'c1', user_id: 'user-1', note: null } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      const result = await service.updateNote('c1', 'user-1', 'Rencontré au salon IT')
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output.note).toBe('Rencontré au salon IT')
    })

    it('collapses a blank note to null', async () => {
      const contact = { id: 'c1', user_id: 'user-1', note: 'old' } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      const result = await service.updateNote('c1', 'user-1', '   ')
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output.note).toBeNull()
    })

    it('returns a not_found failure when contact is missing', async () => {
      repo.findOne.mockResolvedValueOnce(null)
      const result = await service.updateNote('c1', 'user-1', 'x')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('not_found')
    })

    it('returns an update_failed failure on save error', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
      repo.save.mockRejectedValueOnce(new Error('db error'))
      const result = await service.updateNote('c1', 'user-1', 'x')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('update_failed')
    })
  })

  describe('saveEmailDraft (#3942.2)', () => {
    it('écrit `email_message` SANS toucher au statut d’envoi — « préparé », jamais « envoyé »', async () => {
      const contact = {
        id: 'c1',
        user_id: 'user-1',
        email_message: null,
        email_sent_at: null,
        email_send_state: null,
      } as unknown as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)

      const result = await service.saveEmailDraft('c1', 'user-1', { subject: 'Bonjour', body: 'Un message.' })

      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) {
        expect(result.output.email_message).toEqual({ subject: 'Bonjour', body: 'Un message.' })
        expect(result.output.email_sent_at).toBeNull()
        expect(result.output.email_send_state).toBeNull()
      }
    })

    it('un sujet absent écrit un brouillon sans sujet, jamais une chaîne vide', async () => {
      const contact = { id: 'c1', user_id: 'user-1', email_message: null } as unknown as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)

      const result = await service.saveEmailDraft('c1', 'user-1', { body: 'Un message.' })

      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output.email_message).toEqual({ body: 'Un message.' })
    })

    it('remplace le brouillon existant — la dernière relecture gagne', async () => {
      const contact = {
        id: 'c1',
        user_id: 'user-1',
        email_message: { subject: 'Ancien', body: 'Ancien message' },
      } as unknown as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)

      const result = await service.saveEmailDraft('c1', 'user-1', { subject: 'Nouveau', body: 'Nouveau message' })

      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result))
        expect(result.output.email_message).toEqual({ subject: 'Nouveau', body: 'Nouveau message' })
    })

    it('retourne un échec « not_found » pour un contact d’un autre commercial', async () => {
      repo.findOne.mockResolvedValueOnce(null)
      const result = await service.saveEmailDraft('c1', 'user-1', { body: 'x' })
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('not_found')
    })

    it('retourne un échec « update_failed » si l’écriture échoue', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
      repo.save.mockRejectedValueOnce(new Error('db error'))
      const result = await service.saveEmailDraft('c1', 'user-1', { body: 'x' })
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('update_failed')
    })

    // #4412 — le brouillon part AUSSI chez le fournisseur (Gmail / Outlook), par le service mailbox.
    describe('brouillon dans la boîte connectée (#4412)', () => {
      const buildWithMailbox = (mailboxSender: unknown) =>
        new ContactsService(
          repo as never,
          userActions as never,
          ia as unknown as IaClient,
          credits as unknown as CreditsService,
          workspace as unknown as WorkspaceContextService,
          mailer as never,
          suppression as never,
          config as never,
          cadence as never,
          accounts as never,
          transitions as never,
          dropcontact as never,
          extraEnrichers as never,
          merges as never,
          brandsStub as never,
          undefined,
          undefined,
          provenance as never,
          sprintBus as never,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          mailboxSender as never,
        )
      const contactWithEmail = () =>
        ({ id: 'c1', user_id: 'user-1', email: 'ana@client.fr', email_message: null }) as unknown as ContactEntity
      const connected = { connected: true, provider: 'google', address: 'rep@boite.fr', can_send: true }

      it('boîte connectée : appelle le service mailbox avec destinataire, sujet, corps et contact', async () => {
        const draft = jest
          .fn()
          .mockResolvedValue({ provider: 'google', draftId: 'd1', messageId: 'm1', threadId: 't1', webUrl: null })
        const svc = buildWithMailbox({ status: jest.fn().mockResolvedValue(connected), send: jest.fn(), draft })
        repo.findOne.mockResolvedValueOnce(contactWithEmail())
        repo.save.mockImplementationOnce(async (x: ContactEntity) => x)

        const result = await svc.saveEmailDraft('c1', 'user-1', { subject: 'Bonjour', body: 'Un message.' })

        expect(draft).toHaveBeenCalledWith('user-1', {
          contactId: 'c1',
          to: 'ana@client.fr',
          subject: 'Bonjour',
          body: 'Un message.',
        })
        expect(isSuccess(result)).toBe(true)
        if (isSuccess(result)) expect(result.output.mailbox_draft).toEqual({ status: 'created', provider: 'google' })
      })

      it('#4546.5 — le brouillon est déposé dans la boîte DÉSIGNÉE (adresse lue parmi SES boîtes)', async () => {
        const draft = jest
          .fn()
          .mockResolvedValue({ provider: 'google', draftId: 'd1', messageId: 'm1', threadId: 't1', webUrl: null })
        const status = jest.fn().mockResolvedValue(connected)
        const svc = buildWithMailbox({ status, send: jest.fn(), draft })
        repo.findOne.mockResolvedValueOnce(contactWithEmail())
        repo.save.mockImplementationOnce(async (x: ContactEntity) => x)

        const result = await svc.saveEmailDraft('c1', 'user-1', {
          subject: 'Bonjour',
          body: 'Un message.',
          sender_connection_id: 'conn-2',
        })

        expect(status).toHaveBeenCalledWith('user-1', 'conn-2')
        expect(draft).toHaveBeenCalledWith('user-1', expect.objectContaining({ senderConnectionId: 'conn-2' }))
        expect(isSuccess(result)).toBe(true)
        // L'identifiant de boîte n'est pas du contenu : il ne s'écrit pas dans `email_message`.
        if (isSuccess(result)) expect(result.output.email_message).toEqual({ subject: 'Bonjour', body: 'Un message.' })
      })

      it('#4546.5 REFUS — la boîte d’un autre : aucun brouillon déposé, le brouillon Bellum reste écrit', async () => {
        const draft = jest.fn()
        const svc = buildWithMailbox({
          status: jest.fn().mockResolvedValue({ connected: false, provider: null, address: null, can_send: false }),
          send: jest.fn(),
          draft,
        })
        repo.findOne.mockResolvedValueOnce(contactWithEmail())
        repo.save.mockImplementationOnce(async (x: ContactEntity) => x)

        const result = await svc.saveEmailDraft('c1', 'user-1', {
          subject: 'Bonjour',
          body: 'Un message.',
          sender_connection_id: 'conn-x',
        })

        expect(draft).not.toHaveBeenCalled()
        expect(isSuccess(result)).toBe(true)
        if (isSuccess(result)) expect(result.output.mailbox_draft).toEqual({ status: 'not_connected' })
      })

      it('sans boîte connectée : le service mailbox n’est pas appelé, Bellum seul', async () => {
        const draft = jest.fn()
        const svc = buildWithMailbox({
          status: jest.fn().mockResolvedValue({ connected: false, provider: null, address: null, can_send: false }),
          send: jest.fn(),
          draft,
        })
        repo.findOne.mockResolvedValueOnce(contactWithEmail())
        repo.save.mockImplementationOnce(async (x: ContactEntity) => x)

        const result = await svc.saveEmailDraft('c1', 'user-1', { subject: 'Bonjour', body: 'Un message.' })

        expect(draft).not.toHaveBeenCalled()
        expect(isSuccess(result)).toBe(true)
        if (isSuccess(result)) {
          expect(result.output.email_message).toEqual({ subject: 'Bonjour', body: 'Un message.' })
          expect(result.output.mailbox_draft).toEqual({ status: 'not_connected' })
        }
      })

      it('fournisseur en échec : `email_message` écrit et la raison renvoyée, jamais un faux succès', async () => {
        const draft = jest.fn().mockRejectedValue(new Error('Jeton expiré — reconnecte ta messagerie.'))
        const svc = buildWithMailbox({ status: jest.fn().mockResolvedValue(connected), send: jest.fn(), draft })
        repo.findOne.mockResolvedValueOnce(contactWithEmail())
        repo.save.mockImplementationOnce(async (x: ContactEntity) => x)

        const result = await svc.saveEmailDraft('c1', 'user-1', { subject: 'Bonjour', body: 'Un message.' })

        expect(isSuccess(result)).toBe(true)
        if (isSuccess(result)) {
          expect(result.output.email_message).toEqual({ subject: 'Bonjour', body: 'Un message.' })
          expect(result.output.mailbox_draft).toEqual({
            status: 'failed',
            provider: 'google',
            reason: 'Jeton expiré — reconnecte ta messagerie.',
          })
        }
      })
    })
  })

  describe('confirmIdentity (#2160.58)', () => {
    it('stamps identity_confirmed_at and identity_confirmed_by on success', async () => {
      const contact = { id: 'c1', user_id: 'user-1', identity_confirmed_at: null } as unknown as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      const result = await service.confirmIdentity('c1', 'user-1')
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) {
        expect(result.output.identity_confirmed_at).toBeInstanceOf(Date)
        expect(result.output.identity_confirmed_by).toBe('user-1')
      }
    })

    it('returns a not_found failure when contact is missing', async () => {
      repo.findOne.mockResolvedValueOnce(null)
      const result = await service.confirmIdentity('c1', 'user-1')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('not_found')
    })

    it('returns an update_failed failure on save error', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1' } as ContactEntity)
      repo.save.mockRejectedValueOnce(new Error('db error'))
      const result = await service.confirmIdentity('c1', 'user-1')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('update_failed')
    })
  })

  describe('declareSent (#4418.1)', () => {
    // #4418.1 — « Marquer envoyé » sur un brouillon de contact : déclaratif, planifie les relances.
    it('logs a DECLARED send (never a proof) and schedules the J+3/J+6/J+9 cadence from today', async () => {
      const contact = {
        id: 'c1',
        workspace_id: 'ws-1',
        account_id: 'a1',
        email_sent_at: null,
      } as unknown as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      const result = await service.declareSent('c1', 'user-1', 'email')
      expect(isSuccess(result)).toBe(true)
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'c1', deleted_at: IsNull(), workspace_id: 'ws-1' } })
      const row = userActions.create.mock.calls[0][0]
      expect(row).toMatchObject({ action_type: 'plan_action_message_sent', channel: 'email', contact_id: 'c1' })
      expect(row.metadata).toMatchObject({ via: 'declaration', declared: true })
      expect(cadence.scheduleForContact).toHaveBeenCalledWith(contact, 'user-1', expect.any(Date))
      // Aucune preuve d'envoi : le contact n'est jamais écrit.
      expect(repo.save).not.toHaveBeenCalled()
    })

    // #4418 — un envoi déclaré n'a pas d'horodatage prouvé : la cadence part de la date DÉCLARÉE.
    it('anchors the cadence on the DECLARED day and records it in the declaration', async () => {
      const contact = { id: 'c1', workspace_id: 'ws-1', account_id: 'a1' } as unknown as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      const result = await service.declareSent('c1', 'user-1', 'email', '2026-10-10')
      expect(isSuccess(result)).toBe(true)
      const anchor = cadence.scheduleForContact.mock.calls[0][2] as Date
      expect(anchor.toISOString().slice(0, 10)).toBe('2026-10-10')
      expect(userActions.create.mock.calls[0][0].metadata).toMatchObject({
        declared: true,
        declared_sent_on: '2026-10-10',
      })
      expect(repo.save).not.toHaveBeenCalled()
    })

    it('refuses a declared day in the future (nothing logged, nothing scheduled)', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 'c1',
        workspace_id: 'ws-1',
        account_id: 'a1',
      } as unknown as ContactEntity)
      const result = await service.declareSent('c1', 'user-1', 'email', '2999-01-01')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('invalid')
      expect(userActions.save).not.toHaveBeenCalled()
      expect(cadence.scheduleForContact).not.toHaveBeenCalled()
    })

    it('returns not_found for a contact outside the workspace', async () => {
      repo.findOne.mockResolvedValueOnce(null)
      const result = await service.declareSent('c1', 'user-1', 'email')
      expect(isFailure(result)).toBe(true)
      expect(cadence.scheduleForContact).not.toHaveBeenCalled()
    })

    it('keeps the declaration when cadence scheduling fails', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 'c1',
        workspace_id: 'ws-1',
        account_id: 'a1',
      } as unknown as ContactEntity)
      cadence.scheduleForContact.mockRejectedValueOnce(new Error('boom'))
      const result = await service.declareSent('c1', 'user-1', 'email')
      expect(isSuccess(result)).toBe(true)
      expect(userActions.save).toHaveBeenCalled()
    })
  })

  describe('authorizeRecommendation / revokeRecommendationAuthorization (#2160.60)', () => {
    it('resolves the contact in the caller WORKSPACE, not user_id (any member can authorize)', async () => {
      const contact = { id: 'c1', user_id: 'someone-else', workspace_id: 'ws-1' } as unknown as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      await service.authorizeRecommendation('c1', 'user-1', 'homonym_conflict')
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'c1', deleted_at: IsNull(), workspace_id: 'ws-1' } })
    })

    it('stamps recommendation_authorized_at/_by/_reason on success', async () => {
      const contact = { id: 'c1', workspace_id: 'ws-1', recommendation_authorized_at: null } as unknown as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      const result = await service.authorizeRecommendation('c1', 'user-1', 'entity_mismatch')
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) {
        expect(result.output.recommendation_authorized_at).toBeInstanceOf(Date)
        expect(result.output.recommendation_authorized_by).toBe('user-1')
        expect(result.output.recommendation_authorized_reason).toBe('entity_mismatch')
      }
    })

    it('returns a not_found failure when the contact is not in the caller workspace', async () => {
      repo.findOne.mockResolvedValueOnce(null)
      const result = await service.authorizeRecommendation('c1', 'user-1', 'homonym_conflict')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('not_found')
    })

    it('returns an update_failed failure on save error', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'c1', workspace_id: 'ws-1' } as unknown as ContactEntity)
      repo.save.mockRejectedValueOnce(new Error('db error'))
      const result = await service.authorizeRecommendation('c1', 'user-1', 'homonym_conflict')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('update_failed')
    })

    it('revoke clears all three columns back to null — reversible, no second status', async () => {
      const contact = {
        id: 'c1',
        workspace_id: 'ws-1',
        recommendation_authorized_at: new Date('2026-09-20T00:00:00.000Z'),
        recommendation_authorized_by: 'user-1',
        recommendation_authorized_reason: 'homonym_conflict',
      } as unknown as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      const result = await service.revokeRecommendationAuthorization('c1', 'user-1')
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) {
        expect(result.output.recommendation_authorized_at).toBeNull()
        expect(result.output.recommendation_authorized_by).toBeNull()
        expect(result.output.recommendation_authorized_reason).toBeNull()
      }
    })

    it('revoke returns a not_found failure when the contact is not in the caller workspace', async () => {
      repo.findOne.mockResolvedValueOnce(null)
      const result = await service.revokeRecommendationAuthorization('c1', 'user-1')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('not_found')
    })
  })

  describe('setHidden', () => {
    it('returns a success result with hidden set to true', async () => {
      const contact = { id: 'c1', user_id: 'user-1', hidden: false } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      const result = await service.setHidden('c1', 'user-1', true)
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output.hidden).toBe(true)
    })

    it('can un-hide a contact', async () => {
      const contact = { id: 'c1', user_id: 'user-1', hidden: true } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      repo.save.mockImplementationOnce(async (x: ContactEntity) => x)
      const result = await service.setHidden('c1', 'user-1', false)
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output.hidden).toBe(false)
    })

    it('returns a not_found failure when contact is missing', async () => {
      repo.findOne.mockResolvedValueOnce(null)
      const result = await service.setHidden('c1', 'user-1', true)
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('not_found')
    })
  })

  describe('findAllForUser — hidden exclusion', () => {
    it('excludes hidden contacts from the default list', async () => {
      await service.findAllForUser('user-1')
      expect(repo._qb.andWhere).toHaveBeenCalledWith('contact.hidden = false')
    })
  })

  describe('findAllForUser — lifecycle tally (pastilles /contacts)', () => {
    /** Le mock de QB renvoie le MÊME objet sur `clone()`, donc les appels à
     *  `getRawMany` se suivent : 1) les lignes de la page, 2) l'agrégat. */
    const mockPageThenTally = (tallyRows: Array<{ state: string; count: number }>) => {
      repo._qb.getRawMany.mockResolvedValueOnce([])
      repo._qb.getRawMany.mockResolvedValueOnce(tallyRows)
    }

    it('compte chaque état sur TOUT le jeu filtré, pas sur la page chargée', async () => {
      // 210 contacts en base, page de 25 : les pastilles doivent annoncer 210.
      repo._qb.getCount.mockResolvedValueOnce(210)
      mockPageThenTally([
        { state: 'detecte', count: 120 },
        { state: 'identite_verifiee', count: 41 },
        { state: 'qualifie', count: 22 },
        { state: 'enrichi', count: 15 },
        { state: 'actionnable', count: 12 },
      ])

      const result = await service.findAllForUser('user-1', { limit: 25, offset: 0 })

      expect(result.pagination.totalItems).toBe(210)
      expect(result.lifecycleTally).toEqual({
        detecte: 120,
        identite_verifiee: 41,
        qualifie: 22,
        enrichi: 15,
        actionnable: 12,
        historique: 0,
        rejete: 0,
      })
      // L'invariant qui rend les deux chiffres non contradictoires à l'écran.
      const sum = Object.values(result.lifecycleTally ?? {}).reduce((a, b) => a + b, 0)
      expect(sum).toBe(result.pagination.totalItems)
    })

    it('compte le delta hebdomadaire sur la MÊME population que le funnel', async () => {
      /**
       * Mesuré sur la démonstration le 28/08 : le bandeau affichait
       * « 254 détectés » surmonté de « **+255 cette semaine** » — un delta plus
       * grand que son propre total. Les deux nombres venaient de deux requêtes
       * différentes : le funnel sur le jeu FILTRÉ, le delta sur tout l'espace,
       * sans filtre. Deux nombres voisins qui comptent des populations
       * différentes se contredisent, et le lecteur conclut que l'un est faux.
       */
      repo._qb.getCount.mockResolvedValueOnce(210)
      mockPageThenTally([{ state: 'detecte', count: 210 }])
      repo._qb.getRawOne.mockResolvedValueOnce({ count: 12 })

      const result = await service.findAllForUser('user-1', { limit: 25, offset: 0 })

      expect(result.lifecycleWeeklyNet).toBe(12)
      // La borne qui rend le bandeau non contradictoire.
      expect(result.lifecycleWeeklyNet ?? 0).toBeLessThanOrEqual(result.pagination.totalItems)
      // Et il est compté sur le query builder du TALLY, donc sous les mêmes filtres.
      expect(repo._qb.andWhere).toHaveBeenCalledWith('contact.created_at >= :weeklyFrom', expect.anything())
    })

    it('ne rend AUCUN delta quand le compte est illisible — jamais « 0 »', async () => {
      // « On n'a pas pu compter » n'est pas « personne n'est arrivé ». L'écran
      // n'affiche alors rien, plutôt qu'un « +0 » qui affirmerait une mesure.
      repo._qb.getCount.mockResolvedValueOnce(3)
      mockPageThenTally([{ state: 'detecte', count: 3 }])
      repo._qb.getRawOne.mockRejectedValueOnce(new Error('boom'))

      const result = await service.findAllForUser('user-1', { limit: 25, offset: 0 })

      expect(result.lifecycleWeeklyNet).toBeUndefined()
    })

    it('remplit à 0 les états absents de l’agrégat', async () => {
      repo._qb.getCount.mockResolvedValueOnce(3)
      mockPageThenTally([{ state: 'detecte', count: 3 }])

      const result = await service.findAllForUser('user-1')

      expect(result.lifecycleTally).toEqual({
        detecte: 3,
        identite_verifiee: 0,
        qualifie: 0,
        enrichi: 0,
        actionnable: 0,
        historique: 0,
        rejete: 0,
      })
    })

    it('ne recalcule PAS l’agrégat sur les pages suivantes (offset > 0)', async () => {
      repo._qb.getCount.mockResolvedValueOnce(210)
      repo._qb.getRawMany.mockResolvedValueOnce([])
      repo._qb.groupBy.mockClear()

      const result = await service.findAllForUser('user-1', { limit: 25, offset: 25 })

      expect(result.lifecycleTally).toBeUndefined()
      expect(repo._qb.groupBy).not.toHaveBeenCalled()
    })

    it('filtre la liste SERVER-side quand `state` est fourni', async () => {
      repo._qb.getCount.mockResolvedValueOnce(12)
      mockPageThenTally([{ state: 'actionnable', count: 12 }])

      await service.findAllForUser('user-1', { state: 'actionnable' })

      const stateCall = repo._qb.andWhere.mock.calls.find(c => typeof c[0] === 'string' && c[0].includes('= :state'))
      expect(stateCall).toBeDefined()
      expect(stateCall?.[1]).toEqual({ state: 'actionnable' })
    })

    it('calcule l’agrégat AVANT le filtre `state` — les autres pastilles gardent leur volume', async () => {
      repo._qb.getCount.mockResolvedValueOnce(12)
      mockPageThenTally([
        { state: 'detecte', count: 120 },
        { state: 'actionnable', count: 12 },
      ])

      const result = await service.findAllForUser('user-1', { state: 'actionnable' })

      // La pastille "Détecté" doit rester à 120 alors que la liste est filtrée
      // sur "Actionnable" — sinon les cinq autres tomberaient à zéro au clic.
      expect(result.lifecycleTally?.detecte).toBe(120)
      expect(result.pagination.totalItems).toBe(12)
    })

    it('n’affiche AUCUN compteur plutôt qu’un chiffre faux si l’agrégat échoue', async () => {
      repo._qb.getCount.mockResolvedValueOnce(210)
      repo._qb.getRawMany.mockResolvedValueOnce([])
      repo._qb.getRawMany.mockRejectedValueOnce(new Error('agg boom'))

      const result = await service.findAllForUser('user-1')

      expect(result.lifecycleTally).toBeUndefined()
      // La liste, elle, reste servie.
      expect(result.pagination.totalItems).toBe(210)
    })
  })

  // #4456 (BELLUM-API-1V / -N / -19 / -33) — le décompte des raisons d'exclusion (désinscrit / arrêt / doublon) :
  // trois sous-requêtes corrélées sur TOUTE la population filtrée, rejouées à chaque première page de GET /contacts,
  // pour un champ qu'aucun écran ne lit plus depuis #3933 (08/10/2026). Il finissait en « canceling statement due to
  // statement timeout » ET occupait le pool (le budget d'attente abandonne la promesse, pas la requête SQL) : la
  // même route sortait aussi en « Slow DB Query ». Il n'est plus calculé : l'absence se lit « on ne sait pas »,
  // jamais « 0 ».
  describe('findAllForUser — pas de décompte des raisons d’exclusion sur la liste (#4456)', () => {
    it('la première page n’émet AUCUNE sous-requête corrélée sur email_suppressions / contact_stops', async () => {
      repo._qb.getCount.mockResolvedValueOnce(3)
      repo._qb.getRawMany.mockResolvedValueOnce([])
      repo._qb.getRawMany.mockResolvedValueOnce([{ state: 'rejete', count: 3 }])
      repo._qb.getRawOne.mockResolvedValue({ count: 0 })

      const result = await service.findAllForUser('user-1', { limit: 25, offset: 0 })

      const emitted = [...repo._qb.select.mock.calls, ...repo._qb.addSelect.mock.calls].map(call => String(call[0]))
      expect(emitted.filter(sql => /email_suppressions|contact_stops/.test(sql))).toEqual([])
      expect(result.rejectionReasons).toBeUndefined()
      expect(result.pagination.totalItems).toBe(3)
    })
  })

  describe('findAllForUser — candidats jamais devenus une fiche (#2309.16/.19)', () => {
    it('rend le tally des exclusions d’intake, sur TOUT l’espace, une raison à zéro absente', async () => {
      const { withIntakeExclusions, intakeExclusions } = serviceWithIntakeExclusions()
      repo._qb.getCount.mockResolvedValueOnce(3)
      repo._qb.getRawMany.mockResolvedValueOnce([])
      repo._qb.getRawMany.mockResolvedValueOnce([{ state: 'detecte', count: 3 }])
      intakeExclusions._qb.getRawMany.mockResolvedValueOnce([
        { reason: 'duplicate_identity', count: 2 },
        { reason: 'ambiguous_identity', count: 0 },
      ])

      const result = await withIntakeExclusions.findAllForUser('user-1', { limit: 25, offset: 0 })

      // « on n'affiche pas ce qu'on n'a pas » : la raison à 0 est ABSENTE.
      expect(result.preCreationExclusions).toEqual({ duplicate_identity: 2 })
      expect(intakeExclusions._qb.where).toHaveBeenCalledWith('exclusion.workspace_id = :workspaceId', {
        workspaceId: 'ws-1',
      })
    })

    it('n’affiche AUCUNE ligne quand rien n’a jamais été exclu', async () => {
      const { withIntakeExclusions, intakeExclusions } = serviceWithIntakeExclusions()
      repo._qb.getCount.mockResolvedValueOnce(3)
      repo._qb.getRawMany.mockResolvedValueOnce([])
      repo._qb.getRawMany.mockResolvedValueOnce([{ state: 'detecte', count: 3 }])
      intakeExclusions._qb.getRawMany.mockResolvedValueOnce([])

      const result = await withIntakeExclusions.findAllForUser('user-1', { limit: 25, offset: 0 })

      expect(result.preCreationExclusions).toBeUndefined()
    })

    it('n’est PAS calculé quand le service n’a pas reçu le dépôt (comportement inchangé)', async () => {
      repo._qb.getCount.mockResolvedValueOnce(3)
      repo._qb.getRawMany.mockResolvedValueOnce([])
      repo._qb.getRawMany.mockResolvedValueOnce([{ state: 'detecte', count: 3 }])

      const result = await service.findAllForUser('user-1', { limit: 25, offset: 0 })

      expect(result.preCreationExclusions).toBeUndefined()
    })
  })

  describe('R22 a4 — bulkInsert conserve la disponibilité annoncée par la source', () => {
    it('le drapeau « existe » de la recherche gratuite devient une colonne par champ', async () => {
      repo.create.mockImplementation(input => input as ContactEntity)
      repo.save.mockImplementation(async rows => rows as ContactEntity[])

      await service.bulkInsert('acc-1', 'user-1', [
        {
          fullName: 'Jean Dupont',
          title: '',
          linkedinUrl: '',
          city: '',
          country: '',
          source: 'apollo',
          apolloDetails: { hasEmail: true, hasPhone: false },
        },
        { fullName: 'Anne Martin', title: '', linkedinUrl: '', city: '', country: '', source: 'apollo' },
      ])

      const rows = repo.create.mock.calls.map(c => c[0] as Partial<ContactEntity>)
      expect(rows[0]).toMatchObject({ email_availability: 'available', phone_availability: 'unknown' })
      expect(rows[1]).toMatchObject({ email_availability: null, phone_availability: null })
    })
  })

  describe('bulkInsert — source normalisation', () => {
    it('passes through valid sources verbatim', async () => {
      repo.create.mockImplementation(input => input as ContactEntity)
      repo.save.mockImplementation(async rows => rows as ContactEntity[])

      await service.bulkInsert('acc-1', 'user-1', [
        { fullName: 'Jean Dupont', title: '', linkedinUrl: '', city: '', country: '', source: 'apollo' },
        { fullName: 'Anne Martin', title: '', linkedinUrl: '', city: '', country: '', source: 'brave_search' },
      ])

      const created = repo.create.mock.calls.map(c => (c[0] as { source: string }).source)
      expect(created).toEqual(['apollo', 'brave_search'])
    })

    it('coerces unknown sources to ai_generated so the DB check constraint never rejects', async () => {
      repo.create.mockImplementation(input => input as ContactEntity)
      repo.save.mockImplementation(async rows => rows as ContactEntity[])

      // Two-token names on purpose: a one-token seed is now refused for lack of
      // identity (see « bulkInsert — identity dedup and merge »), which would
      // mask what this test is actually about — the source coercion.
      await service.bulkInsert('acc-1', 'user-1', [
        { fullName: 'Xavier Blanc', title: '', linkedinUrl: '', city: '', country: '', source: 'mystery_source' },
        { fullName: 'Yann Leroy', title: '', linkedinUrl: '', city: '', country: '', source: '' },
      ])

      const created = repo.create.mock.calls.map(c => (c[0] as { source: string }).source)
      expect(created).toEqual(['ai_generated', 'ai_generated'])
    })

    // #3989 (Louis 11/10/2026, c94) — une fiche recopiée depuis la base commune
    // garde sa provenance (« base commune ») et l'identifiant de sa ligne
    // commune, par lequel l'effacement RGPD retrouve ses copies.
    it('#3989 — une copie de la base commune garde sa source et son sharedFactId', async () => {
      repo.create.mockImplementation(input => input as ContactEntity)
      repo.save.mockImplementation(async rows => rows as ContactEntity[])
      await service.bulkInsert('acc-1', 'user-1', [
        {
          fullName: 'Claire Perrin',
          title: 'DSI',
          linkedinUrl: '',
          city: '',
          country: '',
          source: 'shared_base',
          sharedFactId: 'f-1',
        },
      ])
      const [created] = repo.create.mock.calls.map(c => c[0] as { source: string; raw_data: Record<string, unknown> })
      expect(created?.source).toBe('shared_base')
      expect(created?.raw_data).toEqual({ sharedFactId: 'f-1' })
    })

    // #3989.7 (Louis 15/10/2026) — la coordonnée pro trouvée dans un autre espace est réutilisée,
    // la donnée seule : elle s'écrit sur la fiche, rien d'autre ne voyage (ni espace, ni coût).
    it('#3989.7 — une copie de la base commune porte l’e-mail et le téléphone trouvés ailleurs', async () => {
      repo.create.mockImplementation(input => input as ContactEntity)
      repo.save.mockImplementation(async rows => rows as ContactEntity[])
      await service.bulkInsert('acc-1', 'user-1', [
        {
          fullName: 'Claire Perrin',
          title: 'DSI',
          linkedinUrl: '',
          city: '',
          country: '',
          source: 'shared_base',
          sharedFactId: 'f-1',
          sharedCoordinates: { email: 'claire.perrin@airbus.com', phone: '+33 6 12 34 56 78' },
        },
      ])
      const [created] = repo.create.mock.calls.map(c => c[0] as Record<string, unknown>)
      expect(created?.email).toBe('claire.perrin@airbus.com')
      expect(created?.phone).toBe('+33 6 12 34 56 78')
      expect(created?.raw_data).toEqual({ sharedFactId: 'f-1' })
    })

    it('#3989.7 — sait dire NON : une fiche de l’espace qui a déjà son e-mail le garde', async () => {
      const existing = {
        id: 'c-1',
        account_id: 'acc-1',
        full_name: 'Claire Perrin',
        email: 'c.perrin@airbus.fr',
        phone: null,
        title: 'DSI',
        linkedin_url: null,
        raw_data: {},
      } as unknown as ContactEntity
      repo.find.mockResolvedValue([existing])
      repo.save.mockImplementation(async rows => rows as ContactEntity[])
      await service.bulkInsert('acc-1', 'user-1', [
        {
          fullName: 'Claire Perrin',
          title: 'DSI',
          linkedinUrl: '',
          city: '',
          country: '',
          source: 'shared_base',
          sharedFactId: 'f-1',
          sharedCoordinates: { email: 'claire.perrin@airbus.com', phone: '0612345678' },
        },
      ])
      expect(existing.email).toBe('c.perrin@airbus.fr')
      expect(existing.phone).toBe('0612345678')
    })

    it('#4268.d — sait dire NON : un e-mail retiré À LA MAIN dans l’espace ne revient pas par la recopie du commun', async () => {
      const existing = {
        id: 'c-1',
        account_id: 'acc-1',
        full_name: 'Claire Perrin',
        email: null,
        phone: null,
        title: 'DSI',
        linkedin_url: null,
        raw_data: {},
      } as unknown as ContactEntity
      repo.find.mockResolvedValue([existing])
      repo.save.mockImplementation(async rows => rows as ContactEntity[])
      provenance.currentSources.mockResolvedValue({ email: 'human' })
      await service.bulkInsert('acc-1', 'user-1', [
        {
          fullName: 'Claire Perrin',
          title: 'DSI',
          linkedinUrl: '',
          city: '',
          country: '',
          source: 'shared_base',
          sharedFactId: 'f-1',
          sharedCoordinates: { email: 'claire.perrin@airbus.com', phone: '0612345678' },
        },
      ])
      expect(existing.email ?? null).toBeNull()
      expect(existing.phone).toBe('0612345678')
    })

    it('#4800.3 — sait dire NON : un poste corrigé À LA MAIN ne cède pas devant un fait commun plus long et plus récent', async () => {
      const existing = {
        id: 'c-1',
        account_id: 'acc-1',
        full_name: 'Claire Perrin',
        email: null,
        phone: null,
        title: 'DSI',
        linkedin_url: null,
        raw_data: {},
      } as unknown as ContactEntity
      repo.find.mockResolvedValue([existing])
      repo.save.mockImplementation(async rows => rows as ContactEntity[])
      provenance.currentSources.mockResolvedValue({ title: 'human' })
      await service.bulkInsert('acc-1', 'user-1', [
        {
          fullName: 'Claire Perrin',
          title: 'Directrice des systèmes d’information groupe',
          linkedinUrl: '',
          city: '',
          country: '',
          source: 'shared_base',
          sharedFactId: 'f-1',
        },
      ])
      expect(existing.title).toBe('DSI')
    })

    it('#4800.3 — la même recopie, sans correction humaine, enrichit le poste (le test ci-dessus lit bien quelque chose)', async () => {
      const existing = {
        id: 'c-1',
        account_id: 'acc-1',
        full_name: 'Claire Perrin',
        email: null,
        phone: null,
        title: 'DSI',
        linkedin_url: null,
        raw_data: {},
      } as unknown as ContactEntity
      repo.find.mockResolvedValue([existing])
      repo.save.mockImplementation(async rows => rows as ContactEntity[])
      provenance.currentSources.mockResolvedValue({})
      await service.bulkInsert('acc-1', 'user-1', [
        {
          fullName: 'Claire Perrin',
          title: 'Directrice des systèmes d’information groupe',
          linkedinUrl: '',
          city: '',
          country: '',
          source: 'shared_base',
          sharedFactId: 'f-1',
        },
      ])
      expect(existing.title).toBe('Directrice des systèmes d’information groupe')
    })
  })

  describe('SIG-B — un recruteur nommé par une offre publiée passe par la même porte', () => {
    const proof = { title: 'Ingénieur DevOps', url: 'https://careers.example/1', postedAt: '2026-10-08' }

    beforeEach(() => {
      repo.create.mockImplementation(input => input as ContactEntity)
      repo.save.mockImplementation(async rows => rows as ContactEntity[])
    })

    it('garde la source « job_posting » et la PREUVE dans raw_data', async () => {
      repo.find.mockResolvedValueOnce([])
      await service.bulkInsert('acc-1', 'user-1', [
        {
          fullName: 'Claire Martin',
          title: 'Talent Acquisition Partner',
          linkedinUrl: 'https://www.linkedin.com/in/claire-martin',
          city: '',
          country: '',
          source: 'job_posting',
          jobPosting: proof,
        },
      ])
      const created = repo.create.mock.calls[0]![0] as { source: string; raw_data: Record<string, unknown> }
      expect(created.source).toBe('job_posting')
      expect(created.raw_data).toEqual({ jobPosting: proof })
    })

    it('déjà au dossier (même profil) : aucune ligne neuve, la preuve s’ajoute, la source ne change pas', async () => {
      const existing = {
        id: 'c1',
        full_name: 'Claire Martin',
        title: 'Responsable recrutement',
        linkedin_url: 'https://www.linkedin.com/in/claire-martin/',
        source: 'apollo',
        raw_data: { apolloId: 'ap-1' },
      } as unknown as ContactEntity
      repo.find.mockResolvedValueOnce([existing])
      await service.bulkInsert('acc-1', 'user-1', [
        {
          fullName: 'C. Martin',
          title: '',
          linkedinUrl: 'https://linkedin.com/in/claire-martin',
          city: '',
          country: '',
          source: 'job_posting',
          jobPosting: proof,
        },
      ])
      expect(repo.create).not.toHaveBeenCalled()
      expect(existing.source).toBe('apollo')
      expect(existing.raw_data).toEqual({ apolloId: 'ap-1', jobPosting: proof })
    })
  })

  describe('#2297 — une personne effacée ne revient ni par la collecte, ni par l’enrichissement', () => {
    // #2297.51 — une clé FIXE de test ; les empreintes sont des HMAC, elles ne
    // se calculent qu'une fois la clé posée.
    const TEST_KEY = 'test-only-person-erasure-key-0123456789abcdef'
    const savedKey = process.env[PERSON_ERASURE_HMAC_KEY_ENV]
    let erasures: MockRepository<PersonErasureEntity>
    let guarded: ContactsService
    const createdNames = (): string[] => repo.create.mock.calls.map(c => (c[0] as { full_name: string }).full_name)

    afterAll(() => {
      if (savedKey === undefined) delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
      else process.env[PERSON_ERASURE_HMAC_KEY_ENV] = savedKey
    })

    beforeEach(() => {
      process.env[PERSON_ERASURE_HMAC_KEY_ENV] = TEST_KEY
      const erasedClaire = personErasureFingerprints('ws-1', {
        fullName: 'Claire Perrin',
        email: 'claire.perrin@acme.fr',
        linkedinUrl: 'https://www.linkedin.com/in/claire-perrin',
        apolloId: 'AP-42',
        accountId: 'acc-1',
      })
      erasures = createMockRepository<PersonErasureEntity>()
      erasures.find.mockResolvedValue([{ fingerprints: erasedClaire } as PersonErasureEntity])
      guarded = new ContactsService(
        repo as never,
        userActions as never,
        ia as unknown as IaClient,
        credits as unknown as CreditsService,
        workspace as unknown as WorkspaceContextService,
        mailer as never,
        suppression as never,
        config as never,
        cadence as never,
        accounts as never,
        transitions as never,
        dropcontact as never,
        { isEnabled: () => false } as never,
        merges as never,
        brandsStub as never,
        undefined,
        undefined,
        provenance as never,
        sprintBus as never,
        undefined,
        undefined,
        erasures as never,
      )
      repo.create.mockImplementation(input => input as ContactEntity)
      repo.save.mockImplementation(async rows => rows as ContactEntity[])
    })

    it('la collecte d’une analyse ne la recrée pas — ni par son nom au registre, ni par son identifiant fournisseur', async () => {
      repo.find.mockResolvedValueOnce([])
      await guarded.bulkInsert('acc-1', 'user-1', [
        { fullName: 'PERRIN Claire', title: 'DAF', linkedinUrl: '', city: '', country: '', source: 'pappers' },
        { fullName: 'Claire', apolloId: 'AP-42', title: '', linkedinUrl: '', city: '', country: '', source: 'apollo' },
        { fullName: 'Marc Dubois', title: 'DSI', linkedinUrl: '', city: '', country: '', source: 'apollo' },
      ])

      expect(createdNames()).toEqual(['Marc Dubois'])
      expect(erasures.find).toHaveBeenCalledWith(expect.objectContaining({ where: { workspace_id: 'ws-1' } }))
    })

    // #2297.51 — la clé retirée après un effacement : la collecte ne peut plus
    // reconnaître la personne. Elle s'ARRÊTE (503) plutôt que de la laisser
    // revenir faute de pouvoir vérifier.
    it('#2297.51 — sans clé, alors que l’espace a des effacements : la collecte refuse (503), rien n’est créé', async () => {
      delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
      repo.find.mockResolvedValueOnce([])
      await expect(
        guarded.bulkInsert('acc-1', 'user-1', [
          { fullName: 'Claire Perrin', title: 'DAF', linkedinUrl: '', city: '', country: '', source: 'pappers' },
        ]),
      ).rejects.toBeInstanceOf(ServiceUnavailableException)
      expect(repo.create).not.toHaveBeenCalled()
    })

    it('#2297.51 — sans clé, l’enrichissement d’un espace qui a des effacements refuse aussi (503), avant tout appel', async () => {
      delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
      repo.findOne.mockResolvedValueOnce({
        id: 'c-9',
        user_id: 'user-1',
        workspace_id: 'ws-1',
        account_id: 'acc-1',
        full_name: 'Claire Perrin',
        email: null,
        linkedin_url: null,
        raw_data: null,
      } as ContactEntity)
      await expect(
        guarded.enrichContact('c-9', 'user-1', { first_name: 'Claire', organization_name: 'Acme' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException)
      expect(ia.enrichContact).not.toHaveBeenCalled()
    })

    it('sait dire NON : une homonyme chez une AUTRE société est collectée', async () => {
      repo.find.mockResolvedValueOnce([])
      await guarded.bulkInsert('acc-2', 'user-1', [
        { fullName: 'Claire Perrin', title: 'DAF', linkedinUrl: '', city: '', country: '', source: 'pappers' },
      ])
      expect(createdNames()).toEqual(['Claire Perrin'])
    })

    it('l’enrichissement refuse une fiche qui EST la personne effacée — avant tout appel fournisseur, rien débité', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 'c-9',
        user_id: 'user-1',
        workspace_id: 'ws-1',
        account_id: 'acc-1',
        full_name: 'Claire Perrin',
        email: null,
        linkedin_url: null,
        raw_data: null,
      } as ContactEntity)

      const result = await guarded.enrichContact('c-9', 'user-1', {
        first_name: 'Claire',
        last_name: 'Perrin',
        organization_name: 'Acme',
      })

      expect(isFailure(result) && result.problem.code).toBe('suppressed')
      expect(ia.enrichContact).not.toHaveBeenCalled()
      expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
    })

    it('l’enrichissement ne plie pas dans une fiche l’identité d’une personne effacée que le fournisseur rendrait', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 'c-7',
        user_id: 'user-1',
        workspace_id: 'ws-1',
        account_id: 'acc-1',
        full_name: 'Séverine M.',
        email: null,
        linkedin_url: null,
        raw_data: null,
      } as ContactEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: { email: 'claire.perrin@acme.fr', email_status: 'verified', phone: null, linkedin_url: null },
      })

      const result = await guarded.enrichContact('c-7', 'user-1', { first_name: 'Séverine', organization_name: 'Acme' })

      expect(isFailure(result) && result.problem.code).toBe('suppressed')
      expect(repo._qb.execute).not.toHaveBeenCalled()
      expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
    })
  })

  // #2297.41/.42/.49/.50 — la conformité se vérifie AVANT l'appel fournisseur
  // payant, pas seulement à l'affichage. Deux gates dans `preflightEnrichment`,
  // même vocabulaire que `contact-eligibility.ts:66` (`permission_denied`,
  // contact écarté/masqué) et la table `contact_stops` (`opt_out`, la personne
  // a demandé qu'on cesse) — réutilisés, jamais réinventés (GA-26).
  describe('#2297.41/.42/.49/.50 — permission et opt-out avant l’appel payant', () => {
    const withStop = (stopRow: { reason: string } | null) => {
      const contactStops = createMockRepository<ContactStopEntity>()
      contactStops.findOne.mockResolvedValue(stopRow)
      const gated = new ContactsService(
        repo as never,
        userActions as never,
        ia as unknown as IaClient,
        credits as unknown as CreditsService,
        workspace as unknown as WorkspaceContextService,
        mailer as never,
        suppression as never,
        config as never,
        cadence as never,
        accounts as never,
        transitions as never,
        dropcontact as never,
        { isEnabled: () => false } as never,
        merges as never,
        brandsStub as never,
        undefined,
        undefined,
        provenance as never,
        sprintBus as never,
        undefined,
        undefined,
        undefined,
        contactStops as never,
      )
      return { gated, contactStops }
    }

    it('#2297.50/.42 — refuse un contact qui a demandé qu’on cesse, avant tout appel fournisseur', async () => {
      const { gated, contactStops } = withStop({ reason: 'do_not_call' })
      repo.findOne.mockResolvedValueOnce({ id: 'c1', user_id: 'user-1', workspace_id: 'ws-1' } as ContactEntity)

      const result = await gated.enrichContact('c1', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

      expect(isFailure(result) && result.problem.code).toBe('opt_out')
      expect(contactStops.findOne).toHaveBeenCalledWith({ where: { workspace_id: 'ws-1', contact_id: 'c1' } })
      expect(ia.enrichContact).not.toHaveBeenCalled()
      expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
    })

    it('#2297.41/.49 — refuse un contact MASQUÉ à la main, avant tout appel fournisseur', async () => {
      const { gated } = withStop(null)
      repo.findOne.mockResolvedValueOnce({
        id: 'c2',
        user_id: 'user-1',
        workspace_id: 'ws-1',
        hidden: true,
      } as ContactEntity)

      const result = await gated.enrichContact('c2', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

      expect(isFailure(result) && result.problem.code).toBe('permission_denied')
      expect(ia.enrichContact).not.toHaveBeenCalled()
      expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
    })

    it('#2297.41/.49 — refuse un contact ÉCARTÉ (excluded_at), avant tout appel fournisseur', async () => {
      const { gated } = withStop(null)
      repo.findOne.mockResolvedValueOnce({
        id: 'c3',
        user_id: 'user-1',
        workspace_id: 'ws-1',
        excluded_at: new Date('2026-09-01'),
      } as ContactEntity)

      const result = await gated.enrichContact('c3', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

      expect(isFailure(result) && result.problem.code).toBe('permission_denied')
      expect(ia.enrichContact).not.toHaveBeenCalled()
    })

    it('laisse passer un contact sans arrêt et sans exclusion', async () => {
      const { gated } = withStop(null)
      repo.findOne.mockResolvedValueOnce({ id: 'c4', user_id: 'user-1', workspace_id: 'ws-1' } as ContactEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: { email: 'a@b.com', email_status: 'verified', phone: null, linkedin_url: null },
      })

      const result = await gated.enrichContact('c4', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

      expect(isSuccess(result)).toBe(true)
    })

    it('sans ContactStopService injecté (@Optional, comme les autres add-ons), le comportement ne casse pas', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'c5', user_id: 'user-1', workspace_id: 'ws-1' } as ContactEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: { email: 'a@b.com', email_status: 'verified', phone: null, linkedin_url: null },
      })

      const result = await service.enrichContact('c5', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

      expect(isSuccess(result)).toBe(true)
    })
  })

  // #2297.15 — vérifier l'entité utile avant l'appel payant. Le web désactive
  // déjà le bouton quand `!contact.entity && !accountId` (`ContactEnrichButton.tsx`),
  // mais c'est une COURTOISIE côté client : rien ne l'imposait côté serveur. Un
  // compte posé (`account_id`) sans `company_name` (import partiel, compte pas
  // encore enrichi) passait le bouton (accountId est vrai) puis atterrissait ici
  // avec un nom d'organisation VIDE — Apollo payé pour chercher sur rien. Le
  // même filet existait déjà, en double, dans `mcp-api.controller.ts` (« Impossible
  // de déterminer l'organisation ») : posé ici UNE fois (GA-26), tous les
  // appelants (worker, action-router, mcp-api) en profitent.
  describe('#2297.15 — vérifier l’entité avant l’appel payant', () => {
    it('refuse un enrichissement sans aucune entité connue (pas de compte, repli vide)', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'c10', user_id: 'user-1' } as ContactEntity)

      const result = await service.enrichContact('c10', 'user-1', {
        first_name: 'Jean',
        organization_name: '',
      })

      expect(isFailure(result) && result.problem.code).toBe('invalid')
      expect(ia.enrichContact).not.toHaveBeenCalled()
      expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
    })

    it('refuse un enrichissement quand le compte posé n’a pas de nom et que le repli est vide', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'c11', user_id: 'user-1', account_id: 'acc-1' } as ContactEntity)
      accounts.findOne.mockResolvedValueOnce({ id: 'acc-1', company_name: null } as unknown as AccountEntity)

      const result = await service.enrichContact('c11', 'user-1', {
        first_name: 'Jean',
        organization_name: '',
      })

      expect(isFailure(result) && result.problem.code).toBe('invalid')
      expect(ia.enrichContact).not.toHaveBeenCalled()
    })

    it('laisse passer un repli fourni par le client quand le compte n’a pas de nom', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'c12', user_id: 'user-1', account_id: 'acc-1' } as ContactEntity)
      accounts.findOne.mockResolvedValueOnce({ id: 'acc-1', company_name: null } as unknown as AccountEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: { email: 'a@b.com', email_status: 'verified', phone: null, linkedin_url: null },
      })

      const result = await service.enrichContact('c12', 'user-1', {
        first_name: 'Jean',
        organization_name: 'Acme (repli du client)',
      })

      expect(isSuccess(result)).toBe(true)
      expect(ia.enrichContact).toHaveBeenCalled()
    })
  })

  // #2297.16 — jamais d'appel fournisseur payant pour un pays non vérifié ou
  // non couvert. `ENRICHMENT_ALLOWED_COUNTRIES` absente (le cas par défaut de
  // `config.get` dans ces tests) = garde OUVERTE, no-op strict — c'est ce que
  // TOUS les autres tests de ce fichier vérifient déjà en creux en ne réglant
  // jamais cette clé.
  describe('#2297.16 — vérifier le pays avant l’appel payant', () => {
    it('sans ENRICHMENT_ALLOWED_COUNTRIES (no-op strict), un compte sans pays connu passe quand même', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'c20', user_id: 'user-1', account_id: 'acc-20' } as ContactEntity)
      accounts.findOne.mockResolvedValueOnce({
        id: 'acc-20',
        company_name: 'Acme',
        registry_country: null,
      } as unknown as AccountEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: { email: 'a@b.com', email_status: 'verified', phone: null, linkedin_url: null },
      })

      const result = await service.enrichContact('c20', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

      expect(isSuccess(result)).toBe(true)
    })

    it('ENRICHMENT_ALLOWED_COUNTRIES posée : refuse un compte au pays non vérifié, avant tout appel fournisseur', async () => {
      config.get.mockImplementation((key: string) => (key === 'ENRICHMENT_ALLOWED_COUNTRIES' ? 'FR,BE' : undefined))
      repo.findOne.mockResolvedValueOnce({ id: 'c21', user_id: 'user-1', account_id: 'acc-21' } as ContactEntity)
      accounts.findOne.mockResolvedValueOnce({
        id: 'acc-21',
        company_name: 'Acme',
        registry_country: null,
      } as unknown as AccountEntity)

      const result = await service.enrichContact('c21', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

      expect(isFailure(result) && result.problem.code).toBe('country_not_supported')
      expect(ia.enrichContact).not.toHaveBeenCalled()
      expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
    })

    it('ENRICHMENT_ALLOWED_COUNTRIES posée : refuse un compte au pays non couvert', async () => {
      config.get.mockImplementation((key: string) => (key === 'ENRICHMENT_ALLOWED_COUNTRIES' ? 'FR,BE' : undefined))
      repo.findOne.mockResolvedValueOnce({ id: 'c22', user_id: 'user-1', account_id: 'acc-22' } as ContactEntity)
      accounts.findOne.mockResolvedValueOnce({
        id: 'acc-22',
        company_name: 'Acme',
        registry_country: 'DE',
      } as unknown as AccountEntity)

      const result = await service.enrichContact('c22', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

      expect(isFailure(result) && result.problem.code).toBe('country_not_supported')
      expect(ia.enrichContact).not.toHaveBeenCalled()
    })

    it('ENRICHMENT_ALLOWED_COUNTRIES posée : laisse passer un pays couvert', async () => {
      config.get.mockImplementation((key: string) => (key === 'ENRICHMENT_ALLOWED_COUNTRIES' ? 'FR,BE' : undefined))
      repo.findOne.mockResolvedValueOnce({ id: 'c23', user_id: 'user-1', account_id: 'acc-23' } as ContactEntity)
      accounts.findOne.mockResolvedValueOnce({
        id: 'acc-23',
        company_name: 'Acme',
        registry_country: 'fr',
      } as unknown as AccountEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: { email: 'a@b.com', email_status: 'verified', phone: null, linkedin_url: null },
      })

      const result = await service.enrichContact('c23', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

      expect(isSuccess(result)).toBe(true)
    })

    it('ENRICHMENT_ALLOWED_COUNTRIES posée : une démonstration reste exemptée, comme les crédits', async () => {
      config.get.mockImplementation((key: string) => (key === 'ENRICHMENT_ALLOWED_COUNTRIES' ? 'FR' : undefined))
      workspace.isDemoWorkspace.mockResolvedValue(true)
      repo.findOne.mockResolvedValueOnce({ id: 'c24', user_id: 'user-1', account_id: 'acc-24' } as ContactEntity)

      const result = await service.enrichContact('c24', 'user-1', { first_name: 'Jean', organization_name: 'Acme' })

      expect(isSuccess(result)).toBe(true)
      expect(ia.enrichContact).not.toHaveBeenCalled()
    })
  })

  describe('#2297 — la collecte d’une analyse passe par le catalogue des champs interdits', () => {
    beforeEach(() => {
      repo.create.mockImplementation(input => input as ContactEntity)
      repo.save.mockImplementation(async rows => rows as ContactEntity[])
    })

    it('aucun champ du catalogue envoyé par la collecte n’arrive en base — à aucune profondeur', async () => {
      repo.find.mockResolvedValueOnce([])
      const seed = {
        fullName: 'Marc Dubois',
        title: 'DSI',
        linkedinUrl: '',
        city: 'Lyon',
        country: 'France',
        source: 'apollo',
        // Ce qu'un fournisseur ou un modèle peut glisser dans une graine.
        gender: 'male',
        apolloDetails: {
          seniority: 'director',
          birthDate: '1970-01-01',
          employmentHistory: [{ organization_name: 'Acme', nationality: 'FR', home_address: '1 rue X' }],
        },
      } as unknown as AnalysisContactSeed

      await service.bulkInsert('acc-1', 'user-1', [seed])

      const created = repo.create.mock.calls[0]?.[0] as Record<string, unknown>
      const stored = JSON.stringify(created)
      for (const key of ['gender', 'birthDate', 'nationality', 'home_address']) {
        expect(isEnrichmentForbiddenField(key)).toBe(true)
        expect(stored).not.toContain(`"${key}"`)
      }
      // Témoin : ce qui est PERMIS passe — la ville, le pays, le parcours.
      expect(created.raw_data).toEqual({
        city: 'Lyon',
        country: 'France',
        apolloDetails: { seniority: 'director', employmentHistory: [{ organization_name: 'Acme' }] },
      })
    })
  })

  describe('bulkInsert — identity dedup and merge', () => {
    const seed = (over: Partial<AnalysisContactSeed> & { fullName: string }): AnalysisContactSeed => ({
      title: '',
      linkedinUrl: '',
      city: '',
      country: '',
      source: 'apollo',
      ...over,
    })

    const createdNames = (): string[] => repo.create.mock.calls.map(c => (c[0] as { full_name: string }).full_name)

    beforeEach(() => {
      repo.create.mockImplementation(input => input as ContactEntity)
      repo.save.mockImplementation(async rows => rows as ContactEntity[])
    })

    it('does not re-insert an existing contact whose name differs only by an accent', async () => {
      // The live bug: "Sébastien Chauffray" (web search) and "Sebastien Chauffray"
      // (Apollo) sat side by side on the PAYFIT account.
      repo.find.mockResolvedValueOnce([
        { id: 'c1', full_name: 'Sébastien Chauffray', title: 'Directeur Technique (CTO)' } as ContactEntity,
      ])

      await service.bulkInsert('acc-1', 'user-1', [seed({ fullName: 'Sebastien Chauffray' })])

      expect(createdNames()).toEqual([])
    })

    it('collapses accent variants arriving within the same batch', async () => {
      repo.find.mockResolvedValueOnce([])

      await service.bulkInsert('acc-1', 'user-1', [
        seed({ fullName: 'Sébastien Chauffray' }),
        seed({ fullName: 'Sebastien Chauffray' }),
      ])

      expect(createdNames()).toEqual(['Sébastien Chauffray'])
    })

    it('treats a hyphenated compound first name as the same person', async () => {
      repo.find.mockResolvedValueOnce([{ id: 'c1', full_name: 'Jean-Pierre Dupont' } as ContactEntity])
      await service.bulkInsert('acc-1', 'user-1', [seed({ fullName: 'Jean Pierre Dupont' })])
      expect(createdNames()).toEqual([])
    })

    it('matches on LinkedIn URL even when the names are spelled differently', async () => {
      repo.find.mockResolvedValueOnce([
        { id: 'c1', full_name: 'P. Onnen', linkedin_url: 'https://www.linkedin.com/in/paulonnen/' } as ContactEntity,
      ])

      await service.bulkInsert('acc-1', 'user-1', [
        seed({ fullName: 'Paul Onnen', linkedinUrl: 'https://linkedin.com/in/paulonnen' }),
      ])

      expect(createdNames()).toEqual([])
    })

    it('still inserts genuinely different people', async () => {
      repo.find.mockResolvedValueOnce([{ id: 'c1', full_name: 'Jean Dupont' } as ContactEntity])
      await service.bulkInsert('acc-1', 'user-1', [seed({ fullName: 'Marie Martin' })])
      expect(createdNames()).toEqual(['Marie Martin'])
    })

    // #4479 — 284 violations de `idx_contacts_account_normalized_name` en 1 h 30. Le prénom seul d'Apollo
    // ne publie pas de clé de nom (on ne fusionne pas deux Séverine) : la ligne partait en INSERT et la
    // base la refusait. Elle se RATTACHE à la fiche qui porte le nom — sans exception, sans seconde ligne,
    // sans écraser une seule valeur — et la source du second apport est gardée.
    describe('#4479 — un nom déjà porté par le compte : on se rattache, on ne crée pas, on n’écrase pas', () => {
      const lone = (apolloId: string, over: Partial<AnalysisContactSeed> = {}): AnalysisContactSeed =>
        seed({ fullName: 'Willy', apolloId, source: 'apollo', ...over })

      it('écrit deux fois le même nom : ni exception, ni seconde ligne', async () => {
        const holder = { id: 'c1', full_name: 'Willy', title: 'DSI', raw_data: null } as ContactEntity
        repo.find.mockResolvedValueOnce([holder])

        const created = await service.bulkInsert('acc-1', 'user-1', [lone('AP-9')])

        expect(created).toEqual([])
        expect(createdNames()).toEqual([])
        expect(repo.save).not.toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: undefined })]))
      })

      it('garde la source du second apport sur la fiche rattachée', async () => {
        const holder = {
          id: 'c1',
          full_name: 'Willy',
          title: 'DSI',
          raw_data: { city: 'Lyon' },
        } as unknown as ContactEntity
        repo.find.mockResolvedValueOnce([holder])

        await service.bulkInsert('acc-1', 'user-1', [lone('AP-9')])

        expect(holder.raw_data).toMatchObject({ city: 'Lyon', alsoSeenFrom: ['apollo'] })
        expect(repo.save).toHaveBeenCalledWith([holder])
      })

      it('n’écrase aucune valeur déjà renseignée', async () => {
        const holder = {
          id: 'c1',
          full_name: 'Willy',
          title: 'DSI',
          linkedin_url: 'https://linkedin.com/in/willy-d',
          email: 'willy@acme.fr',
        } as ContactEntity
        repo.find.mockResolvedValueOnce([holder])

        await service.bulkInsert('acc-1', 'user-1', [
          lone('AP-9', {
            title: 'Directeur des Systèmes d’Information Groupe',
            linkedinUrl: 'https://linkedin.com/in/autre',
          }),
        ])

        expect(holder.title).toBe('DSI')
        expect(holder.linkedin_url).toBe('https://linkedin.com/in/willy-d')
        expect(holder.email).toBe('willy@acme.fr')
      })
    })

    it('enriches the stored row instead of dropping the incoming one', async () => {
      // Pappers seeds first with the legal role and no LinkedIn; Apollo arrives
      // later with the operational title + profile URL. That used to be discarded.
      const existing = {
        id: 'c1',
        full_name: 'Sébastien Chauffray',
        title: 'CTO',
        linkedin_url: null,
        raw_data: null,
      } as ContactEntity
      repo.find.mockResolvedValueOnce([existing])

      await service.bulkInsert('acc-1', 'user-1', [
        seed({
          fullName: 'Sebastien Chauffray',
          title: 'Chief Technology Officer',
          linkedinUrl: 'https://linkedin.com/in/schauffray',
          photoUrl: 'https://cdn/photo.jpg',
        }),
      ])

      expect(existing.title).toBe('Chief Technology Officer')
      expect(existing.linkedin_url).toBe('https://linkedin.com/in/schauffray')
      expect(existing.raw_data).toMatchObject({ photoUrl: 'https://cdn/photo.jpg' })
      expect(repo.save).toHaveBeenCalledWith([existing])
    })

    it('never overwrites a richer stored value with a poorer incoming one', async () => {
      const existing = {
        id: 'c1',
        full_name: 'Jean Dupont',
        title: 'Directeur des Systèmes d\u2019Information',
        linkedin_url: 'https://linkedin.com/in/jdupont',
      } as ContactEntity
      repo.find.mockResolvedValueOnce([existing])

      await service.bulkInsert('acc-1', 'user-1', [seed({ fullName: 'Jean Dupont', title: '-', linkedinUrl: '' })])

      expect(existing.title).toBe('Directeur des Systèmes d\u2019Information')
      expect(existing.linkedin_url).toBe('https://linkedin.com/in/jdupont')
    })

    it('does not issue an update when the incoming row adds nothing', async () => {
      const existing = { id: 'c1', full_name: 'Jean Dupont', title: 'DSI' } as ContactEntity
      repo.find.mockResolvedValueOnce([existing])

      await service.bulkInsert('acc-1', 'user-1', [seed({ fullName: 'Jean Dupont', title: 'DSI' })])

      expect(repo.save).not.toHaveBeenCalled()
    })

    /**
     * « Une correction humaine gagne toujours, quelle que soit sa date. »
     *
     * La phase 3 arbitrait déjà. La phase 2, elle, écrivait
     * `row[champ] = pickRicher(…)` puis sauvait la ligne — sans jamais lire la
     * provenance. Or `pickRicher` préfère la valeur la plus LONGUE : un poste
     * corrigé à la main en « DSI » perdait contre n'importe quel intitulé
     * fournisseur plus bavard, à chaque run, sans un mot.
     */
    describe('la correction humaine tient aussi en phase 2', () => {
      const withProvenance = (sources: Record<string, string>) => {
        const provenance = { currentSources: jest.fn().mockResolvedValue(sources) }
        const svc = new ContactsService(
          repo as never,
          userActions as never,
          ia as unknown as IaClient,
          credits as unknown as CreditsService,
          workspace as unknown as WorkspaceContextService,
          mailer as never,
          suppression as never,
          config as never,
          cadence as never,
          accounts as never,
          transitions as never,
          dropcontact as never,
          { isEnabled: () => false } as never,
          merges as never,
          brandsStub as never,
          undefined,
          undefined,
          provenance as never,
        )
        return { svc, provenance }
      }

      it('ne remplace pas un poste corrigé à la main par un intitulé fournisseur plus long', async () => {
        const existing = { id: 'c1', full_name: 'Jean Dupont', title: 'DSI' } as ContactEntity
        repo.find.mockResolvedValueOnce([existing])
        const { svc } = withProvenance({ title: 'human' })

        await svc.bulkInsert('acc-1', 'user-1', [
          seed({ fullName: 'Jean Dupont', title: 'Directeur des Systèmes d’Information Groupe' }),
        ])

        expect(existing.title).toBe('DSI')
        expect(repo.save).not.toHaveBeenCalled()
      })

      it('ne renomme pas un contact dont le nom a été saisi à la main', async () => {
        const existing = { id: 'c1', full_name: 'Sebastien Chauffray' } as ContactEntity
        repo.find.mockResolvedValueOnce([existing])
        const { svc } = withProvenance({ fullName: 'human' })

        await svc.bulkInsert('acc-1', 'user-1', [seed({ fullName: 'Sébastien Chauffray' })])

        expect(existing.full_name).toBe('Sebastien Chauffray')
      })

      it('enrichit quand même les champs que personne n’a corrigés', async () => {
        // La protection est CHAMP par champ : un poste corrigé ne gèle pas la
        // fiche entière.
        const existing = {
          id: 'c1',
          full_name: 'Jean Dupont',
          title: 'DSI',
          linkedin_url: null,
        } as unknown as ContactEntity
        repo.find.mockResolvedValueOnce([existing])
        const { svc } = withProvenance({ title: 'human' })

        await svc.bulkInsert('acc-1', 'user-1', [
          seed({
            fullName: 'Jean Dupont',
            title: 'Directeur des Systèmes d’Information Groupe',
            linkedinUrl: 'https://linkedin.com/in/jdupont',
          }),
        ])

        expect(existing.title).toBe('DSI')
        expect(existing.linkedin_url).toBe('https://linkedin.com/in/jdupont')
        expect(repo.save).toHaveBeenCalledWith([existing])
      })

      it('ne lit la provenance que quand une valeur bougerait vraiment', async () => {
        // Le coût de l'arbitrage est nul sur le cas courant : un lot qui
        // n'apporte rien ne déclenche aucune lecture.
        const existing = { id: 'c1', full_name: 'Jean Dupont', title: 'DSI' } as ContactEntity
        repo.find.mockResolvedValueOnce([existing])
        const { svc, provenance } = withProvenance({})

        await svc.bulkInsert('acc-1', 'user-1', [seed({ fullName: 'Jean Dupont', title: 'DSI' })])

        expect(provenance.currentSources).not.toHaveBeenCalled()
      })

      it('enrichit comme avant quand aucune correction humaine n’est enregistrée', async () => {
        const existing = { id: 'c1', full_name: 'Jean Dupont', title: 'DSI' } as ContactEntity
        repo.find.mockResolvedValueOnce([existing])
        const { svc, provenance } = withProvenance({ title: 'pipeline' })

        await svc.bulkInsert('acc-1', 'user-1', [
          seed({ fullName: 'Jean Dupont', title: 'Directeur des Systèmes d’Information' }),
        ])

        // #4616 — 3ᵉ argument : la transaction de l'appelant (ici aucune, appel hors transaction).
        expect(provenance.currentSources).toHaveBeenCalledWith('contact', 'c1', undefined)
        expect(existing.title).toBe('Directeur des Systèmes d’Information')
      })
    })

    it('skips rows with no usable identity', async () => {
      repo.find.mockResolvedValueOnce([])
      await service.bulkInsert('acc-1', 'user-1', [seed({ fullName: '   ' })])
      expect(createdNames()).toEqual([])
    })

    /**
     * #AF (LOT rattrapage ciblé par segment, 18/09/2026) — LE TEST QUI SAIT
     * DIRE NON, exigence n°1 : « un test qui rougit si un rattrapage écrasait
     * une correction humaine ».
     *
     * `SegmentCatchupService.runCatchup` (segment-catchup.service.ts) rejoue
     * la collecte de contacts d'un compte dont la dernière collecte est
     * antérieure au correctif #2543, EN APPELANT `bulkInsert` — exactement
     * comme ici. Le risque n°1 du lot, dans les mots du brief : « un rejeu
     * qui écrase le travail d'un commercial est pire que le défaut qu'il
     * corrige ». Ce test le ferme au niveau où la protection vit réellement
     * (`mergeSeedInto` → `applyFieldUpdates`) — la même que
     * `SegmentCatchupService` traverse sans rien réécrire.
     *
     * Cassé volontairement pendant l'écriture (commenté : `incomingSource:
     * 'human'` au lieu de `'pipeline'` dans `mergeSeedInto`) pour confirmer
     * qu'il rougit pour la bonne raison, puis restauré — voir le commit.
     */
    it("un rattrapage (rejeu de la collecte contacts d'un compte périmé) n'écrase JAMAIS un poste corrigé à la main", async () => {
      const existing = { id: 'c1', full_name: 'Marie Dubois', title: 'RSSI' } as ContactEntity
      repo.find.mockResolvedValueOnce([existing])
      provenance.currentSources.mockResolvedValueOnce({ title: 'human' })

      // Ce que le rattrapage recolle — un intitulé fournisseur plus riche,
      // exactement le genre de valeur qui gagnait avant `applyFieldUpdates`
      // (pickRicher préfère le plus long).
      await service.bulkInsert('acc-1', 'user-1', [
        seed({ fullName: 'Marie Dubois', title: 'Responsable de la Sécurité des Systèmes d’Information Groupe' }),
      ])

      expect(existing.title).toBe('RSSI')
    })

    // ── Accents ──────────────────────────────────────────────────────────────
    // The merge kept whichever spelling had landed FIRST, so a de-accented
    // Apollo seed arriving before the accented one froze the stripped spelling
    // in place forever.
    it('adopts the accented spelling when a later source carries it', async () => {
      const existing = { id: 'c1', full_name: 'Sebastien Chauffray' } as ContactEntity
      repo.find.mockResolvedValueOnce([existing])

      await service.bulkInsert('acc-1', 'user-1', [seed({ fullName: 'Sébastien Chauffray' })])

      expect(existing.full_name).toBe('Sébastien Chauffray')
      expect(repo.save).toHaveBeenCalledWith([existing])
    })

    it('does not downgrade an accented stored name to a stripped incoming one', async () => {
      const existing = { id: 'c1', full_name: 'Sébastien Chauffray' } as ContactEntity
      repo.find.mockResolvedValueOnce([existing])

      await service.bulkInsert('acc-1', 'user-1', [seed({ fullName: 'Sebastien Chauffray' })])

      expect(existing.full_name).toBe('Sébastien Chauffray')
    })

    it('never rewrites a name into a different person, however matched', async () => {
      // Matched on LinkedIn URL, not on the name. Adopting the seed's name here
      // would silently relabel the contact — refuse and keep the stored one.
      const existing = {
        id: 'c1',
        full_name: 'P. Onnen',
        linkedin_url: 'https://www.linkedin.com/in/paulonnen/',
      } as ContactEntity
      repo.find.mockResolvedValueOnce([existing])

      await service.bulkInsert('acc-1', 'user-1', [
        seed({ fullName: 'Paul Onnen', linkedinUrl: 'https://linkedin.com/in/paulonnen' }),
      ])

      expect(existing.full_name).toBe('P. Onnen')
    })

    // ── Lone first names ─────────────────────────────────────────────────────
    // Production carries rows called just "Frederic", "Gerard", "Gaelle". They
    // identify nobody and cannot be repaired afterwards without guessing.
    it('refuses to create a contact whose whole name is one token', async () => {
      repo.find.mockResolvedValueOnce([])
      await service.bulkInsert('acc-1', 'user-1', [seed({ fullName: 'Frederic' })])
      expect(createdNames()).toEqual([])
    })

    it('creates a one-token contact when an email or LinkedIn backs it', async () => {
      repo.find.mockResolvedValueOnce([])
      await service.bulkInsert('acc-1', 'user-1', [
        seed({ fullName: 'Frederic', linkedinUrl: 'https://linkedin.com/in/fredericmazzella' }),
      ])
      expect(createdNames()).toEqual(['Frederic'])
    })

    it('does NOT fold a lone first name into a matching full name', async () => {
      // "Frederic" + "Frederic Mazzella" on one account could be two people.
      // A wrong merge destroys data, so the lone token is dropped, never merged.
      const existing = { id: 'c1', full_name: 'Frederic Mazzella' } as ContactEntity
      repo.find.mockResolvedValueOnce([existing])

      await service.bulkInsert('acc-1', 'user-1', [seed({ fullName: 'Frederic' })])

      expect(existing.full_name).toBe('Frederic Mazzella')
      expect(createdNames()).toEqual([])
    })

    // ── Apollo search-tier hits ──────────────────────────────────────────────
    // Apollo's People-Search returns `first_name` + an obfuscated last name, so
    // every hit is a lone first name. The guard above rejected all of them, which
    // is why a 1379-people account (Dassault Aviation) shipped 9 contacts: only
    // the registry mandataires got through. The Apollo person id is what makes
    // such a row resolvable — and what keeps two namesakes apart.
    it('creates a one-token contact when an Apollo person id backs it', async () => {
      repo.find.mockResolvedValueOnce([])
      await service.bulkInsert('acc-1', 'user-1', [
        seed({ fullName: 'Severine', apolloId: '54a2617474686933187f271e' }),
      ])
      expect(createdNames()).toEqual(['Severine'])
    })

    it('keeps two obfuscated namesakes as two contacts', async () => {
      repo.find.mockResolvedValueOnce([])
      await service.bulkInsert('acc-1', 'user-1', [
        seed({ fullName: 'Severine', apolloId: '54a2617474686933187f271e', title: 'Responsable Communication' }),
        seed({ fullName: 'Severine', apolloId: '61c0f8a9d3b24e0001a7c512', title: 'Directrice Achats' }),
      ])
      expect(createdNames()).toEqual(['Severine', 'Severine'])
    })

    it('recognises a stored Apollo contact by its id, not by its thin name', async () => {
      // Re-run of the same analysis: the row already exists with a lone first
      // name. Matching on the id prevents a duplicate AND prevents a wrong merge.
      const existing = {
        id: 'c1',
        full_name: 'Severine',
        raw_data: { apolloId: '54a2617474686933187f271e' },
      } as unknown as ContactEntity
      repo.find.mockResolvedValueOnce([existing])

      await service.bulkInsert('acc-1', 'user-1', [
        seed({ fullName: 'Severine', apolloId: '54a2617474686933187f271e', title: 'Responsable Communication' }),
      ])

      expect(createdNames()).toEqual([])
      expect(existing.title).toBe('Responsable Communication')
    })

    it('persists the obfuscated last name so the UI can show "Severine M."', async () => {
      repo.find.mockResolvedValueOnce([])
      await service.bulkInsert('acc-1', 'user-1', [
        seed({ fullName: 'Severine', apolloId: '54a2617474686933187f271e', lastNameObfuscated: 'Mo***y' }),
      ])
      const created = repo.create.mock.calls[0][0] as { raw_data: Record<string, unknown> }
      expect(created.raw_data).toMatchObject({
        apolloId: '54a2617474686933187f271e',
        lastNameObfuscated: 'Mo***y',
      })
    })

    it('does not merge a lone first name into an Apollo row that has a different id', async () => {
      // A Brave-scraped "Severine" with no id must not steal the Apollo row's
      // identity — and, having no identifier of its own, is refused at the door.
      const existing = {
        id: 'c1',
        full_name: 'Severine',
        raw_data: { apolloId: '54a2617474686933187f271e' },
      } as unknown as ContactEntity
      repo.find.mockResolvedValueOnce([existing])

      await service.bulkInsert('acc-1', 'user-1', [seed({ fullName: 'Severine', source: 'brave' })])

      expect(createdNames()).toEqual([])
      expect(existing.full_name).toBe('Severine')
    })

    it('survives a unique-violation race by inserting row by row', async () => {
      // Two analyses on the same account both read an empty table, then both
      // insert. The DB index (migration 1786623491782) rejects the second — that
      // must not fail the analysis.
      repo.find.mockResolvedValueOnce([])
      const conflict = Object.assign(new Error('duplicate key'), { code: '23505' })
      repo.save
        .mockRejectedValueOnce(conflict) // batch insert
        .mockRejectedValueOnce(conflict) // Jean loses the race
        .mockImplementationOnce(async row => row as ContactEntity) // Marie wins

      const result = await service.bulkInsert('acc-1', 'user-1', [
        seed({ fullName: 'Jean Dupont' }),
        seed({ fullName: 'Marie Martin' }),
      ])

      expect(result.map(r => r.full_name)).toEqual(['Marie Martin'])
    })

    it('isole chaque tentative sous point de reprise quand un manager est fourni', async () => {
      // LE bug du 10/08/2026, trouvé sur un run réel (RATP, 1 079 contacts) :
      // Postgres avorte la transaction ENTIÈRE au premier ordre en échec. Le
      // repli ligne par ligne existait déjà, mais tournait dans la transaction
      // empoisonnée — chaque tentative répondait « current transaction is
      // aborted » et le dossier complet était perdu à l'enregistrement.
      //
      // Ce qui se teste ici : chaque tentative passe par `manager.transaction`,
      // c'est-à-dire un SAVEPOINT, donc le retour arrière ne défait que la ligne
      // fautive.
      repo.find.mockResolvedValueOnce([])
      const conflict = Object.assign(new Error('duplicate key'), { code: '23505' })
      const innerRepo = { save: jest.fn() }
      innerRepo.save
        .mockRejectedValueOnce(conflict) // le lot entier
        .mockRejectedValueOnce(conflict) // Jean perd
        .mockImplementationOnce(async (row: unknown) => row as ContactEntity) // Marie passe
      const inner = { getRepository: jest.fn(() => innerRepo) }
      const manager = {
        getRepository: jest.fn(() => repo),
        transaction: jest.fn(async (run: (m: unknown) => Promise<unknown>) => run(inner)),
      } as unknown as EntityManager

      const result = await service.bulkInsert(
        'acc-1',
        'user-1',
        [seed({ fullName: 'Jean Dupont' }), seed({ fullName: 'Marie Martin' })],
        manager,
      )

      expect(result.map(r => r.full_name)).toEqual(['Marie Martin'])
      // Une tentative pour le lot, puis une par ligne — chacune sous son point
      // de reprise. Sans elles, la deuxième et la troisième n'auraient jamais pu
      // aboutir.
      expect((manager.transaction as jest.Mock).mock.calls.length).toBe(3)
    })

    it('rethrows a non-unique DB error instead of swallowing it', async () => {
      repo.find.mockResolvedValueOnce([])
      repo.save.mockRejectedValueOnce(Object.assign(new Error('connection lost'), { code: '08006' }))

      await expect(service.bulkInsert('acc-1', 'user-1', [seed({ fullName: 'Jean Dupont' })])).rejects.toThrow(
        'connection lost',
      )
    })
  })

  describe('bulkInsert — photo Apollo', () => {
    it('persists photoUrl on the photo_url column (and keeps it in raw_data)', async () => {
      repo.create.mockImplementation(input => input as ContactEntity)
      repo.save.mockImplementation(async rows => rows as ContactEntity[])

      await service.bulkInsert('acc-1', 'user-1', [
        {
          fullName: 'Jean Dupont',
          title: 'DSI',
          linkedinUrl: '',
          photoUrl: 'https://cdn.apollo.io/p/jean.jpg',
          city: '',
          country: '',
          source: 'apollo',
        },
        // Pas de photo → colonne NULL, jamais de placeholder inventé.
        { fullName: 'Anne Martin', title: '', linkedinUrl: '', city: '', country: '', source: 'apollo' },
      ])

      const created = repo.create.mock.calls.map(c => c[0] as Partial<ContactEntity>)
      expect(created[0]?.photo_url).toBe('https://cdn.apollo.io/p/jean.jpg')
      expect((created[0]?.raw_data as Record<string, unknown>)?.photoUrl).toBe('https://cdn.apollo.io/p/jean.jpg')
      expect(created[1]?.photo_url).toBeNull()
    })

    it('persists the Apollo person id in raw_data.apolloId so the enrich button can People-Match BY ID', async () => {
      repo.create.mockImplementation(input => input as ContactEntity)
      repo.save.mockImplementation(async rows => rows as ContactEntity[])

      await service.bulkInsert('acc-1', 'user-1', [
        {
          fullName: 'Julien Da***r',
          title: 'CTO',
          linkedinUrl: '',
          city: '',
          country: '',
          source: 'apollo',
          apolloId: 'apollo-person-9',
        },
        // Non-Apollo seed (Pappers) → no apolloId key in raw_data.
        { fullName: 'Anne Martin', title: 'DG', linkedinUrl: '', city: '', country: '', source: 'pappers' },
      ])

      const created = repo.create.mock.calls.map(c => c[0] as Partial<ContactEntity>)
      expect((created[0]?.raw_data as Record<string, unknown>)?.apolloId).toBe('apollo-person-9')
      // No apolloId → raw_data is null (nothing else carried), never a fake id.
      expect((created[1]?.raw_data as Record<string, unknown> | null)?.apolloId).toBeUndefined()
    })
  })

  describe('bulkImportManual — CSV import', () => {
    it('inserts rows tagged source="manual", scoped to the account/user, blanks → null', async () => {
      repo.find.mockResolvedValueOnce([])
      repo.create.mockImplementation(input => input as ContactEntity)
      repo.save.mockImplementation(async rows => rows as ContactEntity[])

      const result = await service.bulkImportManual('acc-1', 'user-1', [
        {
          full_name: 'Jean Dupont',
          title: 'DSI',
          email: 'jean@acme.fr',
          phone: '0102030405',
          linkedin_url: 'https://linkedin.com/in/jd',
        },
        { full_name: 'Anne Martin', title: '  ', email: null, phone: null, linkedin_url: null },
      ])

      expect(result).toEqual({ created: 2, skipped: 0, skipped_details: [] })
      const created = repo.create.mock.calls.map(c => c[0] as Partial<ContactEntity>)
      expect(created.every(c => c.source === 'manual')).toBe(true)
      expect(created.every(c => c.account_id === 'acc-1' && c.user_id === 'user-1')).toBe(true)
      // Phase 2: every new row carries the caller's active workspace so it stays
      // visible to the workspace-scoped reads (user_id kept as created-by).
      expect(created.every(c => c.workspace_id === 'ws-1')).toBe(true)
      // Whitespace-only cell collapses to NULL rather than an empty string.
      expect(created[1]?.title).toBeNull()
    })

    // #3850.1 — mesuré en prod le 08/10 : un code postal brésilien
    // « 90480-000 » a été ENREGISTRÉ comme téléphone sur une fiche réelle
    // (Romali Mondal). La ligne reste importée, seule la cellule devient
    // `null` — jamais une donnée fictive à sa place.
    it("#3850.1 — un « téléphone » qui est en réalité un code postal n'est jamais écrit", async () => {
      repo.find.mockResolvedValueOnce([])
      repo.create.mockImplementation(input => input as ContactEntity)
      repo.save.mockImplementation(async rows => rows as ContactEntity[])

      const result = await service.bulkImportManual('acc-1', 'user-1', [
        { full_name: 'Romali Mondal', phone: '90480-000' },
      ])

      expect(result).toEqual({ created: 1, skipped: 0, skipped_details: [] })
      const created = repo.create.mock.calls.map(c => c[0] as Partial<ContactEntity>)
      expect(created[0]?.phone).toBeNull()
    })

    it('persists a reviewed classification (family / priority / entity) when present', async () => {
      repo.find.mockResolvedValueOnce([])
      repo.create.mockImplementation(input => input as ContactEntity)
      repo.save.mockImplementation(async rows => rows as ContactEntity[])

      await service.bulkImportManual('acc-1', 'user-1', [
        { full_name: 'Jean Dupont', title: 'DSI', family: 'IT', priority: 5, entity: 'Filiale Cloud' },
        // Un-classified legacy import: no family/priority → columns stay NULL.
        { full_name: 'Anne Martin', title: 'Développeuse' },
      ])

      const created = repo.create.mock.calls.map(c => c[0] as Partial<ContactEntity>)
      expect(created[0]).toMatchObject({ family: 'IT', priority: 5, entity: 'Filiale Cloud' })
      expect(created[1]?.family ?? null).toBeNull()
      expect(created[1]?.priority ?? null).toBeNull()
    })

    // #2309.19 — chaque doublon écarté À L'IMPORT ne deviendra JAMAIS une
    // fiche : le funnel de couverture doit pouvoir le compter, même si aucun
    // `contact_id` n'existe pour lui.
    it('journalise un candidat par doublon écarté à l’import, pour le funnel de couverture', async () => {
      const { withIntakeExclusions, intakeExclusions } = serviceWithIntakeExclusions()
      repo.find.mockResolvedValueOnce([{ full_name: 'Jean Dupont' }] as ContactEntity[])
      repo.create.mockImplementation(input => input as ContactEntity)
      repo.save.mockImplementation(async rows => rows as ContactEntity[])

      await withIntakeExclusions.bulkImportManual('acc-1', 'user-1', [
        { full_name: 'JEAN DUPONT' },
        { full_name: 'Marie Curie' },
        { full_name: 'marie curie' },
      ])

      expect(intakeExclusions.insert).toHaveBeenCalledWith([
        { workspace_id: 'ws-1', account_id: 'acc-1', reason: 'duplicate_identity' },
        { workspace_id: 'ws-1', account_id: 'acc-1', reason: 'duplicate_identity' },
      ])
    })

    it('skips duplicates against existing contacts and within the batch (case-insensitive)', async () => {
      repo.find.mockResolvedValueOnce([{ full_name: 'Jean Dupont' }] as ContactEntity[])
      repo.create.mockImplementation(input => input as ContactEntity)
      repo.save.mockImplementation(async rows => rows as ContactEntity[])

      const result = await service.bulkImportManual('acc-1', 'user-1', [
        { full_name: 'JEAN DUPONT' },
        { full_name: 'Marie Curie' },
        { full_name: 'marie curie' },
      ])

      expect(result).toEqual({
        created: 1,
        skipped: 2,
        skipped_details: [
          { full_name: 'JEAN DUPONT', reason: 'duplicate' },
          { full_name: 'marie curie', reason: 'duplicate' },
        ],
      })
      const names = repo.create.mock.calls.map(c => (c[0] as { full_name: string }).full_name)
      expect(names).toEqual(['Marie Curie'])
    })

    it('returns created:0 without touching the DB when every name is blank', async () => {
      const result = await service.bulkImportManual('acc-1', 'user-1', [{ full_name: '   ' }])
      expect(result).toEqual({ created: 0, skipped: 1, skipped_details: [{ full_name: '', reason: 'blank_name' }] })
      expect(repo.find).not.toHaveBeenCalled()
      expect(repo.save).not.toHaveBeenCalled()
    })

    // #2380.44 → .47 — le même moteur d'identité que `bulkInsert`
    // (`contactIdentityKeys`) : avant ce lot, cette porte ne dédoublonnait QUE
    // sur le nom en minuscules — un import CSV pouvait donc dupliquer un
    // contact déjà là sous un nom légèrement différent, tant que l'e-mail, le
    // téléphone ou le LinkedIn coïncidaient déjà.
    it('skips a row matching an existing contact by email, even under a different spelling of the name', async () => {
      repo.find.mockResolvedValueOnce([
        { full_name: 'Sebastien Chauffray', email: 's.chauffray@payfit.com', phone: null, linkedin_url: null },
      ] as ContactEntity[])
      repo.create.mockImplementation(input => input as ContactEntity)
      repo.save.mockImplementation(async rows => rows as ContactEntity[])

      const result = await service.bulkImportManual('acc-1', 'user-1', [
        { full_name: 'Sébastien Chauffray', email: 'S.Chauffray@payfit.com' },
      ])

      expect(result).toEqual({
        created: 0,
        skipped: 1,
        skipped_details: [{ full_name: 'Sébastien Chauffray', reason: 'duplicate' }],
      })
    })

    it('skips a row matching an existing contact by phone (#2380.45), across national/international formats', async () => {
      repo.find.mockResolvedValueOnce([
        { full_name: 'Jean Dupont', email: null, phone: '01 02 03 04 05', linkedin_url: null },
      ] as ContactEntity[])
      repo.create.mockImplementation(input => input as ContactEntity)
      repo.save.mockImplementation(async rows => rows as ContactEntity[])

      const result = await service.bulkImportManual('acc-1', 'user-1', [
        { full_name: 'J. Dupont', phone: '+33102030405' },
      ])

      expect(result).toEqual({
        created: 0,
        skipped: 1,
        skipped_details: [{ full_name: 'J. Dupont', reason: 'duplicate' }],
      })
    })

    it('skips two rows of the same batch that share only a phone number', async () => {
      repo.find.mockResolvedValueOnce([])
      repo.create.mockImplementation(input => input as ContactEntity)
      repo.save.mockImplementation(async rows => rows as ContactEntity[])

      const result = await service.bulkImportManual('acc-1', 'user-1', [
        { full_name: 'Marie Martin', phone: '0612345678' },
        { full_name: 'M. Martin', phone: '06 12 34 56 78' },
      ])

      expect(result).toEqual({
        created: 1,
        skipped: 1,
        skipped_details: [{ full_name: 'M. Martin', reason: 'duplicate' }],
      })
    })

    // #2159.63 — l'écran a besoin de la raison RÉELLE, jamais d'un mélange
    // des deux : une ligne au nom vide et une ligne dupliquée ne portent pas
    // la même cause, et les mettre dans le même sac referait une donnée
    // devinée à l'affichage.
    it('names blank-name and duplicate skips with their distinct reasons in the same batch', async () => {
      repo.find.mockResolvedValueOnce([{ full_name: 'Jean Dupont' }] as ContactEntity[])
      repo.create.mockImplementation(input => input as ContactEntity)
      repo.save.mockImplementation(async rows => rows as ContactEntity[])

      const result = await service.bulkImportManual('acc-1', 'user-1', [
        { full_name: '  ' },
        { full_name: 'Jean Dupont' },
        { full_name: 'Nouvelle Personne' },
      ])

      expect(result).toEqual({
        created: 1,
        skipped: 2,
        skipped_details: [
          { full_name: '', reason: 'blank_name' },
          { full_name: 'Jean Dupont', reason: 'duplicate' },
        ],
      })
    })
  })

  // "Ingestion liste perso" (Drive backlog #10) — the classifier itself is
  // exhaustively covered in contact-classifier.spec.ts; here we only assert the
  // service delegates and never touches the DB (pure, free).
  describe('classifyImportedContacts', () => {
    it('classifies rows into the taxonomy and tallies kept vs flagged, without a DB call', () => {
      const res = service.classifyImportedContacts([
        { full_name: 'Jean Dupont', title: 'DSI' }, // kept, family IT
        { full_name: 'S T', title: 'Jardinier' }, // flagged, unknown family
      ])
      expect(res.contacts).toHaveLength(2)
      expect(res.contacts[0]).toMatchObject({ family: 'IT', exclusion_reason: null })
      expect(res.contacts[1]?.family).toBeNull()
      expect(res.contacts[1]?.exclusion_reason).not.toBeNull()
      expect(res.kept).toBe(1)
      expect(res.flagged).toBe(1)
      expect(repo.save).not.toHaveBeenCalled()
      expect(repo.find).not.toHaveBeenCalled()
    })
  })

  // Multi-user Phase 2: contact-table reads move from `where user_id` to
  // `where workspace_id`, and new rows are stamped with the caller's workspace.
  // Behaviour is identical TODAY (1 user = 1 workspace, workspace_id backfilled
  // 1:1 from each row's owner). See agent_docs/multi-user-workspaces.md.
  describe('Phase 2 — workspace scoping (behaviour-preserving today)', () => {
    type Row = Partial<ContactEntity> & Record<string, unknown>

    /** Vrai pour le `IsNull()` de TypeORM, reconnu par sa forme. */
    function isIsNullOperator(value: unknown): boolean {
      return typeof value === 'object' && value !== null && (value as { _type?: string })._type === 'isNull'
    }

    /** A repo whose `find` honours the object `where` like Postgres would, so a
     *  workspace-scoped read can be proven to return exactly what the former
     *  user-scoped read did — and to exclude other tenants. */
    function scopedRepo(store: Row[]) {
      return {
        find: jest.fn(async (opts: { where: Record<string, unknown> }) =>
          store.filter(row =>
            Object.entries(opts.where).every(([col, val]) => {
              // `IsNull()` est un opérateur TypeORM, pas une valeur : le
              // comparer par identité rendrait la fausse base vide dès qu'un
              // filtre `IS NULL` entre en jeu (la suppression réversible).
              if (isIsNullOperator(val)) return row[col] === null || row[col] === undefined
              return row[col] === val
            }),
          ),
        ),
        create: jest.fn((input: Row) => input),
        save: jest.fn(async (created: Row[]) => {
          store.push(...created)
          return created
        }),
        // #1800 — `findByAccount` ne fait plus aucun `.query()` (le favori de
        // contact a été retiré) ; ce mock reste pour les futurs appelants raw
        // SQL de ce faux repo, inerte pour l'instant.
        query: jest.fn().mockResolvedValue([]),
      }
    }

    function buildService(repoLike: ReturnType<typeof scopedRepo>, workspaceId = 'w1') {
      const ws = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId, role: 'owner' }) }
      const mailerMock = { sendOutreachEmail: jest.fn().mockResolvedValue(undefined) }
      const suppressionMock = { isSuppressed: jest.fn().mockResolvedValue(false), suppress: jest.fn() }
      const configMock = { get: jest.fn().mockReturnValue(undefined) }
      const cadenceMock = {
        scheduleForContact: jest.fn().mockResolvedValue(undefined),
        buildCadence: jest.fn(),
        completeOpenItemsByProof: jest.fn().mockResolvedValue(undefined),
      }
      // No cartography in these scope tests → degraded-but-numeric score; they
      // assert row identity/scope, not the score value.
      const accountsMock = createMockRepository<AccountEntity>()
      const transitionsMock = createMockRepository<ContactLifecycleTransitionEntity>()
      const dropcontactMock = { isEnabled: jest.fn().mockReturnValue(false), enrich: jest.fn() }
      const mergesMock = createMockRepository<ContactMergeEntity>()
      mergesMock.findOne.mockResolvedValue(null)
      return new ContactsService(
        repoLike as never,
        userActions as never,
        ia as unknown as IaClient,
        credits as unknown as CreditsService,
        ws as unknown as WorkspaceContextService,
        mailerMock as never,
        suppressionMock as never,
        configMock as never,
        cadenceMock as never,
        accountsMock as never,
        transitionsMock as never,
        dropcontactMock as never,
        { isEnabled: () => false } as never,
        mergesMock as never,
        brandsStub as never,
      )
    }

    it('findByAccount: workspace scope returns the former user-scope rows and excludes other tenants', async () => {
      const store: Row[] = [
        { id: 'a', account_id: 'acc-1', user_id: 'u1', workspace_id: 'w1' },
        { id: 'b', account_id: 'acc-1', user_id: 'u1', workspace_id: 'w1' },
        { id: 'c', account_id: 'acc-1', user_id: 'u2', workspace_id: 'w2' }, // other tenant
      ]
      const repoLike = scopedRepo(store)
      const svc = buildService(repoLike, 'w1')

      const result = await svc.findByAccount('acc-1', 'u1')

      // Identical to what `where user_id = u1` returned (u1 is w1's sole member today)…
      expect(result.map(r => r.id)).toEqual(['a', 'b'])
      // …and the other tenant's row is excluded by the workspace scope.
      expect(result.some(r => r.id === 'c')).toBe(false)
      expect(repoLike.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspace_id: 'w1' }) }),
      )
    })

    it('write-then-read: a bulk-imported contact is stamped with the workspace and returned by the scoped read', async () => {
      const store: Row[] = []
      const repoLike = scopedRepo(store)
      const svc = buildService(repoLike, 'w1')

      const imported = await svc.bulkImportManual('acc-1', 'u1', [{ full_name: 'Jean Dupont' }])
      expect(imported).toEqual({ created: 1, skipped: 0, skipped_details: [] })
      expect(store[0]?.workspace_id).toBe('w1') // stamped on write…
      expect(store[0]?.user_id).toBe('u1') // …created-by preserved

      // …so the workspace-scoped read sees it (no NULL-workspace vanish for solo users).
      const readBack = await svc.findByAccount('acc-1', 'u1')
      expect(readBack.map(r => r.full_name)).toEqual(['Jean Dupont'])
    })

    it('bulkInsert (pipeline seed) stamps the run-owner workspace so seeds survive the scoped read', async () => {
      repo.find.mockResolvedValueOnce([]) // no existing contacts on the account
      repo.create.mockImplementation(input => input as ContactEntity)
      repo.save.mockImplementation(async created => created as ContactEntity[])

      await service.bulkInsert('acc-1', 'user-1', [
        { fullName: 'Jean Dupont', title: '', linkedinUrl: '', city: '', country: '', source: 'apollo' },
      ])

      expect(workspace.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
      const created = repo.create.mock.calls.map(c => c[0] as Partial<ContactEntity>)
      expect(created.every(c => c.workspace_id === 'ws-1')).toBe(true)
    })
  })

  // P0 « Contact states + providers » — the lifecycle is now PERSISTED and each
  // passage is journaled (source + real date). The state machine itself
  // (computeContactLifecycleState) is proven in packages/contracts; here we prove
  // the service persists its result and appends the right transition rows.
  describe('lifecycle persistence + transition journal', () => {
    it('bulkInsert: persists the initial state inline and journals a detection transition (from null)', async () => {
      repo.find.mockResolvedValueOnce([]) // no existing contacts
      repo.create.mockImplementation(input => input as ContactEntity)
      // Attach ids on save so the journal references real contact ids.
      repo.save.mockImplementationOnce(async (rows: ContactEntity[]) =>
        rows.map((row, i) => ({ ...row, id: `c-${i}` })),
      )

      const saved = await service.bulkInsert('acc-1', 'u-1', [
        { fullName: 'Jean Dupont', title: 'DSI', linkedinUrl: '', city: '', country: '', source: 'pappers' },
      ])

      // Canonical state computed + set inline on the row (full name + title anchor
      // but no role/coordinates → "identité vérifiée").
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ full_name: 'Jean Dupont', source: 'pappers', lifecycle_state: 'identite_verifiee' }),
      )
      expect(saved).toHaveLength(1)

      // One journal row: null → identite_verifiee, provider = pappers, actor = run owner.
      expect(transitions.insert).toHaveBeenCalledTimes(1)
      const rows = transitions.insert.mock.calls[0][0] as Array<Record<string, unknown>>
      expect(rows).toEqual([
        expect.objectContaining({
          contact_id: 'c-0',
          from_state: null,
          to_state: 'identite_verifiee',
          source: 'pappers',
          actor: 'u-1',
        }),
      ])
      // Never a fabricated date — occurred_at is left to the DB default now().
      expect(rows[0]).not.toHaveProperty('occurred_at')
    })

    it('enrichContact: advances the state and journals a second transition with source apollo', async () => {
      const contact = {
        id: 'c1',
        user_id: 'u-1',
        account_id: 'acc-1',
        full_name: 'Jean Dupont',
        title: 'DSI',
        entity: null,
        decision_role: null,
        email: null,
        email_verified: false,
        phone: null,
        linkedin_url: null,
        source: 'pappers',
        lifecycle_state: 'identite_verifiee', // where detection left it
      } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      ia.enrichContact.mockResolvedValueOnce({
        data: { email: 'jean.dupont@sg.com', email_status: 'verified', phone: null, linkedin_url: null },
      })

      const result = await service.enrichContact('c1', 'u-1', {
        first_name: 'Jean',
        last_name: 'Dupont',
        organization_name: 'SG',
      })
      expect(isSuccess(result)).toBe(true)

      // Adding an email moves identite_verifiee → enrichi; the state UPDATE is reliable.
      expect(repo.update).toHaveBeenCalledWith('c1', { lifecycle_state: 'enrichi' })
      // Second journal row: identite_verifiee → enrichi, provider = apollo, actor = the rep.
      expect(transitions.insert).toHaveBeenCalledTimes(1)
      expect(transitions.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          contact_id: 'c1',
          from_state: 'identite_verifiee',
          to_state: 'enrichi',
          source: 'apollo',
          actor: 'u-1',
        }),
      )
    })

    it('#2296.5 à .11, .29, .31 — un employeur détecté qui ne correspond plus au compte bascule « historique » et arrête les séquences outreach actives (cause company_changed)', async () => {
      const contact = {
        id: 'c1',
        user_id: 'u-1',
        account_id: 'acc-1',
        full_name: 'Jean Dupont',
        title: 'DSI',
        entity: null,
        decision_role: null,
        email: null,
        email_verified: false,
        phone: null,
        linkedin_url: null,
        source: 'apollo',
        lifecycle_state: 'identite_verifiee', // where detection left it
        // #2296.29 à .31 — l'employeur ACTUEL selon Apollo (« Autre Entreprise
        // SAS ») ne correspond plus au compte (« SG ») : c'est exactement le
        // signal `employerMismatch` que le badge RISQUE calcule déjà à la
        // lecture (contact-score.ts) — désormais aussi PERSISTÉ.
        raw_data: { apolloDetails: { organization: 'Autre Entreprise SAS' } },
      } as unknown as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      accounts.findOne.mockResolvedValueOnce({ id: 'acc-1', company_name: 'SG' } as AccountEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: { email: 'jean.dupont@sg.com', email_status: 'verified', phone: null, linkedin_url: null },
      })
      repo.query.mockImplementation(async (sql: string) =>
        typeof sql === 'string' && sql.includes('FROM previous')
          ? [{ id: 'seq-1', workspace_id: 'ws-1', previous_status: 'active' }]
          : [],
      )

      const result = await service.enrichContact('c1', 'u-1', {
        first_name: 'Jean',
        last_name: 'Dupont',
        organization_name: 'SG',
      })
      expect(isSuccess(result)).toBe(true)

      // L'état TERMINAL gagne : même avec un email tout neuf (qui aurait sinon
      // fait avancer l'échelle vers « enrichi »), l'employeur obsolète l'emporte.
      expect(repo.update).toHaveBeenCalledWith('c1', { lifecycle_state: 'historique' })
      // #2296.31 — la séquence active de ce contact est ARRÊTÉE (jamais une
      // simple pause, même logique que `autoStopOutreachSequences` sur
      // réponse/rebond), cause `company_changed`.
      expect(repo.query).toHaveBeenCalledWith(expect.stringContaining("SET status = 'cancelled'"), ['c1', 'u-1'])
      expect(repo.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO outreach_transitions'), [
        'ws-1',
        'u-1',
        'seq-1',
        'active',
        'company_changed',
      ])
    })

    it('#2296.10/.36/.37 — une ligne humaine (manual/crm) ne bascule JAMAIS « historique » sur un désaccord fournisseur : la correction humaine gagne', async () => {
      const contact = {
        id: 'c1',
        user_id: 'u-1',
        account_id: 'acc-1',
        full_name: 'Jean Dupont',
        title: 'DSI',
        entity: null,
        decision_role: null,
        email: null,
        email_verified: false,
        phone: null,
        linkedin_url: null,
        // La ligne vient d'un HUMAIN (import CRM) — le fait « travaille chez SG »
        // a été saisi à la main, pas inféré par un fournisseur.
        source: 'crm',
        lifecycle_state: 'identite_verifiee',
        // Un fournisseur rapporte un employeur DIFFÉRENT — un désaccord à NOMMER,
        // jamais un fait humain à écraser silencieusement (#2296.10/.36/.37).
        raw_data: { apolloDetails: { organization: 'Autre Entreprise SAS' } },
      } as unknown as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      accounts.findOne.mockResolvedValueOnce({ id: 'acc-1', company_name: 'SG' } as AccountEntity)
      ia.enrichContact.mockResolvedValueOnce({
        data: { email: 'jean.dupont@sg.com', email_status: 'verified', phone: null, linkedin_url: null },
      })

      const result = await service.enrichContact('c1', 'u-1', {
        first_name: 'Jean',
        last_name: 'Dupont',
        organization_name: 'SG',
      })
      expect(isSuccess(result)).toBe(true)

      // La ladder ORDINAIRE s'applique : l'email neuf fait avancer
      // identite_verifiee → enrichi, jamais un « historique » deviné sur un
      // désaccord fournisseur contre un fait humain.
      expect(repo.update).toHaveBeenCalledWith('c1', { lifecycle_state: 'enrichi' })
      // Aucune séquence active n'est arrêtée : rien ne justifie « company_changed »
      // ici, la fiche humaine tient.
      expect(repo.query).not.toHaveBeenCalledWith(expect.stringContaining("SET status = 'cancelled'"), ['c1', 'u-1'])
    })

    it('sans compte connu (companyName absent), un employeur Apollo différent ne bascule PAS « historique » — rien à comparer, rien à inventer', async () => {
      const contact = {
        id: 'c9',
        user_id: 'u-1',
        account_id: null,
        full_name: 'Jean Dupont',
        title: 'DSI',
        entity: null,
        decision_role: null,
        email: null,
        email_verified: false,
        phone: null,
        linkedin_url: null,
        source: 'apollo',
        lifecycle_state: 'identite_verifiee',
        raw_data: { apolloDetails: { organization: 'Autre Entreprise SAS' } },
      } as unknown as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      ia.enrichContact.mockResolvedValueOnce({
        data: { email: 'jean.dupont@sg.com', email_status: 'verified', phone: null, linkedin_url: null },
      })

      const result = await service.enrichContact('c9', 'u-1', {
        first_name: 'Jean',
        last_name: 'Dupont',
        organization_name: 'SG',
      })
      expect(isSuccess(result)).toBe(true)
      // Sans compte, la ladder ordinaire s'applique : l'email neuf fait avancer
      // identite_verifiee → enrichi, jamais un « historique » deviné.
      expect(repo.update).toHaveBeenCalledWith('c9', { lifecycle_state: 'enrichi' })
    })

    it('does NOT re-journal when Apollo changes nothing (state unchanged)', async () => {
      const contact = {
        id: 'c2',
        user_id: 'u-1',
        full_name: 'Jean Dupont',
        title: 'DSI',
        email: null,
        email_verified: false,
        phone: null,
        linkedin_url: null,
        source: 'pappers',
        lifecycle_state: 'identite_verifiee',
      } as ContactEntity
      repo.findOne.mockResolvedValueOnce(contact)
      ia.enrichContact.mockResolvedValueOnce({ data: { email: null, phone: null, linkedin_url: null } })

      await service.enrichContact('c2', 'u-1', { first_name: 'Jean', organization_name: 'SG' })

      expect(repo.update).not.toHaveBeenCalled()
      expect(transitions.insert).not.toHaveBeenCalled()
    })

    it('applyEnrichment: reloads the merged row and journals the qualification passage', async () => {
      repo._qb.execute.mockResolvedValue({ affected: 1 })
      // 1re lecture : la ligne AVANT écriture, que l'arbitre de provenance
      // compare à ce que la phase 3 propose (ni rôle, ni adresse à ce stade).
      repo._qb.getOne.mockResolvedValueOnce({
        id: 'c3',
        full_name: 'Jean Dupont',
        title: 'DSI',
        source: 'apollo',
        lifecycle_state: 'identite_verifiee',
      } as ContactEntity)
      // 2e lecture : la ligne fusionnée — un décideur avec une adresse vérifiée
      // passe « actionnable », et c'est ce passage qui doit être journalisé.
      repo._qb.getOne.mockResolvedValueOnce({
        id: 'c3',
        full_name: 'Jean Dupont',
        title: 'DSI',
        decision_role: 'technical',
        email: 'jean@sg.com',
        email_verified: true,
        phone: null,
        linkedin_url: null,
        source: 'apollo',
        lifecycle_state: 'identite_verifiee',
      } as ContactEntity)

      const matched = await service.applyEnrichment('acc-1', [
        {
          fullName: 'Jean Dupont',
          entity: 'SG',
          role: 'technical',
          priority: 1,
          summary: 's',
          whyContact: 'w',
          email: 'jean@sg.com',
          phone: '',
          emailVerified: true,
        },
      ])

      expect(matched).toBe(1)
      expect(transitions.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          contact_id: 'c3',
          from_state: 'identite_verifiee',
          to_state: 'actionnable',
          source: 'apollo',
        }),
      )
    })

    it('getLifecycleHistory: returns the persisted state + chronological transitions (ISO dates)', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 'c1',
        lifecycle_state: 'enrichi',
        full_name: 'Jean Dupont',
      } as ContactEntity)
      transitions.find.mockResolvedValueOnce([
        {
          id: 't-1',
          contact_id: 'c1',
          from_state: null,
          to_state: 'identite_verifiee',
          source: 'pappers',
          occurred_at: new Date('2026-07-16T10:00:00.000Z'),
          actor: 'u-1',
        },
        {
          id: 't-2',
          contact_id: 'c1',
          from_state: 'identite_verifiee',
          to_state: 'enrichi',
          source: 'apollo',
          occurred_at: new Date('2026-07-16T10:05:00.000Z'),
          actor: null,
        },
      ] as ContactLifecycleTransitionEntity[])

      const result = await service.getLifecycleHistory('c1', 'u-1')
      expect(isSuccess(result)).toBe(true)
      if (!isSuccess(result)) return
      expect(transitions.find).toHaveBeenCalledWith({ where: { contact_id: 'c1' }, order: { occurred_at: 'ASC' } })
      expect(result.output.state).toBe('enrichi')
      expect(result.output.transitions).toHaveLength(2)
      expect(result.output.transitions[0]).toMatchObject({
        from_state: null,
        to_state: 'identite_verifiee',
        source: 'pappers',
        occurred_at: '2026-07-16T10:00:00.000Z',
      })
      expect(result.output.transitions[1]).toMatchObject({ to_state: 'enrichi', source: 'apollo', actor: null })
    })

    it('getLifecycleHistory: fails not_found for a contact outside the workspace', async () => {
      repo.findOne.mockResolvedValueOnce(null)
      const result = await service.getLifecycleHistory('missing', 'u-1')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('not_found')
    })
  })

  /**
   * Les deux compteurs que le tableau de bord affiche CÔTE À CÔTE.
   *
   * Ils comptaient deux populations différentes : `countToEnrichByUser`
   * n'excluait pas les fiches supprimées, `countByUserSince` si. À l'écran,
   * « 254 détectés » et « +255 cette semaine » — deux chiffres qui ne pouvaient
   * pas être vrais ensemble. Un compteur affiché près d'un autre compte la même
   * population, ou l'un des deux ment.
   */
  describe('compteurs du tableau de bord — une seule population', () => {
    it('countToEnrichByUser exclut les fiches supprimées, comme countByUserSince', async () => {
      await service.countToEnrichByUser('u-1')

      expect(repo._qb.andWhere).toHaveBeenCalledWith('contact.deleted_at IS NULL')
    })

    it('countToEnrichByUser réutilise LE prédicat de complétude, jamais une copie', async () => {
      await service.countToEnrichByUser('u-1')

      // `missingContactDetailsSql('contact')` — la définition vit à un seul
      // endroit (contact-completeness.ts), la liste et le compteur la lisent.
      expect(repo._qb.andWhere).toHaveBeenCalledWith(missingContactDetailsSql('contact'))
    })

    it('les deux compteurs posent le MÊME filtre de suppression', async () => {
      await service.countToEnrichByUser('u-1')
      const enrichPredicates = repo._qb.andWhere.mock.calls.map(call => call[0])
      repo._qb.andWhere.mockClear()

      await service.countByUserSince('u-1', new Date('2026-08-01T00:00:00.000Z'))
      const sincePredicates = repo._qb.andWhere.mock.calls.map(call => call[0])

      expect(enrichPredicates).toContain('contact.deleted_at IS NULL')
      expect(sincePredicates).toContain('contact.deleted_at IS NULL')
    })
  })

  /**
   * #2155.24/.25 — le badge de navigation « Contacts ». La définition vient du
   * QCM tranché par Louis le 15/09/2026 : coordonnée vérifiée + compte du
   * portefeuille + aucune action ouverte.
   */
  describe('countReadyToProcess — le badge de navigation « Contacts »', () => {
    it('pose les trois prédicats de la définition, chacun LU et non recopié', async () => {
      await service.countReadyToProcess('u-1')

      const predicates = repo._qb.andWhere.mock.calls.map(call => call[0])
      expect(predicates).toContain('contact.deleted_at IS NULL')
      expect(predicates).toContain('contact.email_verified = true')
      // GA-53 : le portefeuille est LU depuis `ACCOUNT_HYGIENE_PREDICATES`,
      // jamais réécrit — une copie divergerait au premier changement de règle.
      expect(predicates.some(p => p.includes(ACCOUNT_HYGIENE_PREDICATES.followedAccounts))).toBe(true)
      // « Action ouverte » est `tasks` (la table canonique de la prochaine
      // action), pas `action_plan_items` — même définition que `noUpcomingTask`.
      expect(predicates.some(p => p.includes(taskStillOpenSql('t')))).toBe(true)
    })

    it('rend undefined — jamais 0 — quand la mesure échoue', async () => {
      // Sait dire NON : une régression qui ferait retomber sur 0 rendrait un
      // badge de nav qui MENT (« aucun » au lieu de « je n'ai pas pu compter »).
      repo._qb.getCount.mockRejectedValueOnce(new Error('boom'))

      const result = await service.countReadyToProcess('u-1')

      expect(result).toBeUndefined()
    })
  })

  // #2727 — « je tape un nom, je vois les homonymes, je choisis ».
  // #4386 — Découvrir passe par la CASCADE multi-sources (base, registre, web).
  describe('searchPeopleByName', () => {
    it('délègue à la cascade IA sans écriture ni débit de crédit', async () => {
      const result = { hits: [{ id: 'apollo-1' }], status: 'ok', sourcesQueried: [] }
      ia.searchPersonByNameCascade.mockResolvedValue(result)

      const out = await service.searchPeopleByName('user-1', 'Marion Sagnard', 'Bedrock')

      expect(ia.searchPersonByNameCascade).toHaveBeenCalledWith({
        fullName: 'Marion Sagnard',
        organizationName: 'Bedrock',
      })
      // Le chemin historique (base seule) reste celui de la fiche talent et des routines.
      expect(ia.searchPeopleByName).not.toHaveBeenCalled()
      expect(out).toBe(result)
      expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
      expect(repo.save).not.toHaveBeenCalled()
    })

    it('organizationName absent — aucune contrainte de plus envoyée à l’IA', async () => {
      ia.searchPersonByNameCascade.mockResolvedValue({ hits: [], status: 'empty', sourcesQueried: [] })

      await service.searchPeopleByName('user-1', 'Personne Inconnue')

      expect(ia.searchPersonByNameCascade).toHaveBeenCalledWith({
        fullName: 'Personne Inconnue',
        organizationName: undefined,
      })
    })

    it('espace de démonstration : cherche les personnes DU JEU DÉMO de l’espace, jamais un appel réel', async () => {
      workspace.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-demo', role: 'owner' })
      workspace.isDemoWorkspace.mockResolvedValue(true)
      repo.find.mockResolvedValue([
        {
          id: 'c-1',
          full_name: 'Marion Sagnard',
          title: 'DRH',
          linkedin_url: null,
          location: 'Paris',
          account_id: 'acc-1',
        },
      ])
      accounts.find.mockResolvedValue([{ id: 'acc-1', company_name: 'Bedrock SAS' }])

      const out = await service.searchPeopleByName('user-1', 'marion SAGNARD', 'Bedrock')

      expect(ia.searchPersonByNameCascade).not.toHaveBeenCalled()
      expect(ia.searchPeopleByName).not.toHaveBeenCalled()
      expect(out.status).toBe('ok')
      expect(out.hits).toHaveLength(1)
      expect(out.hits[0]).toMatchObject({
        firstName: 'Marion',
        lastName: 'Sagnard',
        organizationName: 'Bedrock SAS',
        match: 'name_and_company',
      })
      // Lecture SCOPÉE à l'espace de démonstration.
      expect(JSON.stringify(repo.find.mock.calls[0]?.[0])).toContain('ws-demo')
    })

    it('espace de démonstration, nom hors jeu démo : vide honnête — jamais un homonyme inventé', async () => {
      workspace.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-demo', role: 'owner' })
      workspace.isDemoWorkspace.mockResolvedValue(true)
      repo.find.mockResolvedValue([])

      const out = await service.searchPeopleByName('user-1', 'Theo Haddad', 'Bellum')

      expect(out).toEqual({
        hits: [],
        status: 'empty',
        sourcesQueried: [{ family: 'contact_base', outcome: 'empty', count: 0 }],
      })
    })

    it('espace de démonstration, nom vide : aucune lecture, aucun homonyme', async () => {
      workspace.isDemoWorkspace.mockResolvedValue(true)

      const out = await service.searchPeopleByName('user-1', '   ')

      expect(out).toEqual({ hits: [], status: 'empty', sourcesQueried: [] })
      expect(repo.find).not.toHaveBeenCalled()
    })
  })
})

// Drift guards for the OTHER LLM-derived columns the analysis persistence writes
// under a DB CHECK. `contacts.source` (IA seed source) and `contacts.decision_role`
// (Phase-3 classify role) are already coerced in the service (`normaliseSource` /
// `normaliseDecisionRole`); these tests keep those whitelists ⊆ what the DB accepts,
// so the same class of "LLM value violates a CHECK and errors the whole run" can't
// re-open on these columns either. The DB set is parsed from the migrations, so a
// widening in code without a matching migration fails the build.
describe('contacts — LLM→DB constraint drift guards', () => {
  /** Union of every literal `<column> IN (...)` / `<column> = ANY (ARRAY[...])`
   *  list across all migrations. Additive migrations only widen, so the union is
   *  the effective set the DB CHECK accepts. Template-literal lists (`${list}`)
   *  carry no quoted literals and are simply skipped. */
  function dbAcceptedValues(column: string): Set<string> {
    const dir = join(__dirname, '../../migrations')
    const values = new Set<string>()
    const re = new RegExp(`${column}\\b[^)\\]]*?(?:IN\\s*\\(|ANY\\s*\\(\\s*ARRAY\\s*\\[)([^)\\]]*)`, 'gis')
    for (const file of readdirSync(dir).filter(f => f.endsWith('.ts'))) {
      const text = readFileSync(join(dir, file), 'utf8')
      for (const match of text.matchAll(re)) {
        for (const q of match[1].matchAll(/'([^']+)'/g)) values.add(q[1])
      }
    }
    return values
  }

  it('every coerced contacts.source is accepted by the DB source CHECK', () => {
    const dbSources = dbAcceptedValues('source')
    // Sanity: the extractor actually found the constraint (not an empty parse).
    expect(dbSources.has('apollo')).toBe(true)
    for (const source of ALLOWED_SOURCES) expect(dbSources.has(source)).toBe(true)
    // The unknown-source fallback must itself be DB-valid.
    expect(dbSources.has('ai_generated')).toBe(true)
  })

  it('every coerced contacts.decision_role (and alias target) is accepted by the DB role CHECK', () => {
    const dbRoles = dbAcceptedValues('decision_role')
    expect(dbRoles.has('sponsor')).toBe(true) // extractor sanity
    for (const role of ALLOWED_DECISION_ROLES) expect(dbRoles.has(role)).toBe(true)
    // normaliseDecisionRole maps these aliases; the targets must be DB-valid too.
    expect(dbRoles.has('blocker')).toBe(true) // gatekeeper → blocker
    expect(dbRoles.has('procurement')).toBe(true) // purchasing → procurement
  })
})
