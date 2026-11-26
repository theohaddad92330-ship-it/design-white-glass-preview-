import { saveAnswersSchema } from '@bellum/contracts'
import type { Repository } from 'typeorm'
import type { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import type { UserActionEntity } from '../../database/entities/user-action.entity'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import type { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import type { ProfileContextService } from '../profile-context/profile-context.service'
import { EsnProfileWorkspaceResolver } from './esn-profile-workspace.resolver'
import { EsnProfileService } from './esn-profile.service'

const noopProfileContext = {
  triggerGeneration: jest.fn(),
  regenerateSection: jest.fn(),
} as unknown as ProfileContextService

function makeRepo(rows: EsnProfileEntity[]) {
  const get = (r: EsnProfileEntity, k: string): unknown => (r as unknown as Record<string, unknown>)[k]
  return {
    findOne: jest.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        rows.find(r => Object.entries(where).every(([k, v]) => get(r, k) === v)) ?? null,
    ),
    create: jest.fn((data: Partial<EsnProfileEntity>) => ({ ...data })),
    merge: jest.fn((target: EsnProfileEntity, ...sources: Partial<EsnProfileEntity>[]) =>
      Object.assign(target, ...sources),
    ),
    save: jest.fn(async (entity: EsnProfileEntity) => {
      const idx = rows.findIndex(r => r.user_id === entity.user_id)
      if (idx >= 0) rows[idx] = entity
      else rows.push(entity)
      return entity
    }),
  } as unknown as Repository<EsnProfileEntity> & { findOne: jest.Mock; save: jest.Mock }
}

function findOneBy<T extends object>(rows: T[]) {
  return jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
    return rows.find(r => Object.entries(where).every(([k, v]) => (r as Record<string, unknown>)[k] === v)) ?? null
  })
}

/** Service + resolver over the SAME profile repo, with an optional workspace. */
function makeService(opts: {
  rows?: EsnProfileEntity[]
  workspaces?: Array<Partial<WorkspaceEntity>>
  members?: Array<Partial<WorkspaceMemberEntity>>
}) {
  const rows = opts.rows ?? []
  const repo = makeRepo(rows)
  const resolver = new EsnProfileWorkspaceResolver(
    repo,
    { findOne: findOneBy((opts.workspaces ?? []) as WorkspaceEntity[]) } as unknown as Repository<WorkspaceEntity>,
    {
      findOne: findOneBy((opts.members ?? []) as WorkspaceMemberEntity[]),
    } as unknown as Repository<WorkspaceMemberEntity>,
    // Le dépôt de l'espace CHOISI (#onboarding partagé) : vide ici, ce qui
    // ramène exactement le comportement d'avant pour ces cas.
    { findOne: async () => null } as never,
  )
  // §8 « Historique » : le repo `user_actions` est optionnel (dernier arg). On
  // le mocke pour observer l'émission de `profile_updated`.
  const userActions = { insert: jest.fn().mockResolvedValue(undefined) } as unknown as Repository<UserActionEntity> & {
    insert: jest.Mock
  }
  return {
    service: new EsnProfileService(repo, noopProfileContext, resolver, userActions),
    repo,
    rows,
    userActions,
  }
}

const WS = 'ws-1'
const OWNER = 'owner-1'
const MEMBER = 'member-1'
const ADMIN = 'admin-1'

function canonicalRow(): EsnProfileEntity {
  return {
    id: 'row-owner',
    user_id: OWNER,
    version: 1,
    is_current: true,
    workspace_id: WS,
    is_workspace_canonical: true,
    esn_name: 'Acme ESN',
    consultant_size: '30-80',
    expertise_areas: ['Data & Intelligence Artificielle'],
    target_sectors: [],
    target_company_types: [],
    geo_zones: [],
    main_sales_pain: 'Trouver les bons comptes à cibler',
  } as unknown as EsnProfileEntity
}

describe('EsnProfileService — legacy per-user path (no workspace)', () => {
  it('returns empty answers when the user has no row', async () => {
    const { service } = makeService({})
    const answers = await service.getAnswers('u1')

    expect(answers.esn_name).toBeNull()
    expect(answers.expertise_areas).toEqual([])
    expect(answers.target_company_types).toEqual([])
  })

  it('creates a current row on first upsert and reads it back', async () => {
    const { service, repo } = makeService({})

    const saved = await service.upsertAnswers('u1', { esn_name: 'Acme', target_sectors: ['Banque'] })
    expect(saved.esn_name).toBe('Acme')
    expect(saved.target_sectors).toEqual(['Banque'])
    expect(repo.save).toHaveBeenCalled()

    const reread = await service.getAnswers('u1')
    expect(reread.esn_name).toBe('Acme')
  })

  // #2022.7 — un upsert est une SOUS-ÉTAPE, pas une complétion : il n'appelle
  // plus `triggerGeneration`. Ce que D9 (Louis 14/09/2026) demande — une
  // réédition, et elle seule, remplace un contexte VALIDÉ et retire sa
  // validation — est déplacé au moment où c'est vrai : `completeReedition`.
  // Ce test sait dire NON : remettre l'appel dans `upsertAnswers` le fait
  // rougir sur le `toHaveBeenCalledTimes(0)`.
  it('#2022.7 — un upsert de sous-étape ne déclenche AUCUNE génération', async () => {
    const { service } = makeService({})
    ;(noopProfileContext.triggerGeneration as jest.Mock).mockClear()

    const saved = await service.upsertAnswers('u1', { esn_name: 'Acme' })

    // Le corpus n'est pas vide : l'écriture a bien eu lieu.
    expect(saved.esn_name).toBe('Acme')
    expect(noopProfileContext.triggerGeneration).toHaveBeenCalledTimes(0)
  })

  // #2022.7 / D9 — le TÉMOIN : la complétion, elle, génère, et porte `reedited`.
  it('#2022.7 — la complétion de la réédition signale `reedited` à triggerGeneration', async () => {
    const { service } = makeService({})
    await service.upsertAnswers('u1', { esn_name: 'Acme' })
    ;(noopProfileContext.triggerGeneration as jest.Mock).mockClear()

    await service.completeReedition('u1')

    expect(noopProfileContext.triggerGeneration).toHaveBeenCalledTimes(1)
    expect(noopProfileContext.triggerGeneration).toHaveBeenLastCalledWith(
      'u1',
      expect.objectContaining({ esn_name: 'Acme' }),
      { reedited: true },
    )
  })

  // #2908 (#2010.16 / #2011.10) — « Régénérer cette section » relit les
  // réponses courantes (même lecture que `regenerateProfileContext`) et
  // délègue à `ProfileContextService.regenerateSection`, bornée à la section
  // demandée.
  it('#2908 — regenerateProfileContextSection relit les réponses et délègue, bornée à la section', async () => {
    const { service } = makeService({})
    await service.upsertAnswers('u1', { esn_name: 'Acme' })
    ;(noopProfileContext.regenerateSection as jest.Mock).mockClear()
    ;(noopProfileContext.regenerateSection as jest.Mock).mockResolvedValue({
      profile_context: null,
      status: 'succeeded',
      corrections: {},
    })

    await service.regenerateProfileContextSection('u1', 'coachingInsights')

    expect(noopProfileContext.regenerateSection).toHaveBeenCalledTimes(1)
    expect(noopProfileContext.regenerateSection).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ esn_name: 'Acme' }),
      'coachingInsights',
    )
  })

  // #2306.24 — la version avance quand secteurs/offres changent, pas autrement.
  it('#2306.24 — changer les secteurs incrémente la version ; changer le nom ou renvoyer l’identique, non', async () => {
    const { service, rows } = makeService({})
    await service.upsertAnswers('u1', { esn_name: 'Acme', target_sectors: ['Banque'] })
    expect(rows[0]?.version).toBe(1)
    await service.upsertAnswers('u1', { esn_name: 'Acme 2' })
    expect(rows[0]?.version).toBe(1)
    await service.upsertAnswers('u1', { target_sectors: ['Banque'] })
    expect(rows[0]?.version).toBe(1)
    await service.upsertAnswers('u1', { target_sectors: ['Banque', 'Assurance'] })
    expect(rows[0]?.version).toBe(2)
    await service.upsertAnswers('u1', { offer_domains: ['cloud'] } as never)
    expect(rows[0]?.version).toBe(3)
  })

  it('merges partial upserts into the existing row', async () => {
    const { service } = makeService({})

    await service.upsertAnswers('u1', { esn_name: 'Acme' })
    await service.upsertAnswers('u1', { consultant_size: '30-80' })
    const answers = await service.getAnswers('u1')

    expect(answers.esn_name).toBe('Acme')
    expect(answers.consultant_size).toBe('30-80')
  })

  it('defaults offer_domain to null (= domaine esn_it) when never set — PDF6 §1', async () => {
    const { service } = makeService({})
    const answers = await service.getAnswers('u1')

    expect(answers.offer_domain).toBeNull()
  })

  it('persists and reads back an explicit offer_domain', async () => {
    const { service } = makeService({})

    const saved = await service.upsertAnswers('u1', { offer_domain: 'finance' })
    expect(saved.offer_domain).toBe('finance')

    const reread = await service.getAnswers('u1')
    expect(reread.offer_domain).toBe('finance')
  })

  it('degrades an unknown stored offer_domain to null instead of throwing (row = free TEXT)', async () => {
    const { service } = makeService({
      rows: [{ user_id: 'u1', is_current: true, offer_domain: 'legacy_value' } as unknown as EsnProfileEntity],
    })
    const answers = await service.getAnswers('u1')

    expect(answers.offer_domain).toBeNull()
  })

  it('a legacy row never gets stamped canonical without a workspace', async () => {
    const { service, rows } = makeService({})
    await service.upsertAnswers('u1', { esn_name: 'Acme' })

    expect(rows[0]?.is_workspace_canonical ?? false).toBe(false)
    expect(rows[0]?.workspace_id ?? null).toBeNull()
  })
})

describe('EsnProfileService — workspace canonical profile', () => {
  it("owner's first write claims their row as the workspace canonical", async () => {
    const { service, rows } = makeService({ workspaces: [{ id: WS, owner_user_id: OWNER }] })

    await service.upsertAnswers(OWNER, { esn_name: 'Acme ESN' })

    const row = rows.find(r => r.user_id === OWNER)
    expect(row?.workspace_id).toBe(WS)
    expect(row?.is_workspace_canonical).toBe(true)
    expect(row?.esn_name).toBe('Acme ESN')
  })

  it('owner keeps writing THE canonical row once it exists (company + personal together)', async () => {
    const { service, rows } = makeService({
      rows: [canonicalRow()],
      workspaces: [{ id: WS, owner_user_id: OWNER }],
    })

    const answers = await service.upsertAnswers(OWNER, {
      esn_name: 'Acme Renamed',
      main_sales_pain: 'Convertir mes RDV en signatures',
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.esn_name).toBe('Acme Renamed')
    expect(rows[0]?.main_sales_pain).toBe('Convertir mes RDV en signatures')
    expect(answers.esn_name).toBe('Acme Renamed')
  })

  it('a MEMBER never overwrites the canonical: company fields are ignored, personal lands on their row', async () => {
    const { service, rows } = makeService({
      rows: [canonicalRow()],
      members: [{ workspace_id: WS, user_id: MEMBER, role: 'member' }],
    })

    const answers = await service.upsertAnswers(MEMBER, {
      esn_name: 'Hijacked ESN',
      main_sales_pain: 'Fidéliser mes comptes existants',
    })

    // Canonical untouched.
    const canonical = rows.find(r => r.user_id === OWNER)
    expect(canonical?.esn_name).toBe('Acme ESN')

    // Personal overlay persisted on the member's own row, never canonical.
    const own = rows.find(r => r.user_id === MEMBER)
    expect(own?.main_sales_pain).toBe('Fidéliser mes comptes existants')
    expect(own?.is_workspace_canonical ?? false).toBe(false)
    expect(own?.esn_name ?? null).toBeNull()

    // The returned answers reflect the truth: canonical company + member pain.
    expect(answers.esn_name).toBe('Acme ESN')
    expect(answers.main_sales_pain).toBe('Fidéliser mes comptes existants')
  })

  // #4158.12 — remplace « a member with no canonical yet keeps the full legacy
  // write » : un membre arrivé AVANT que l'administrateur décrive l'ESN ne crée
  // plus de fiche entreprise orpheline (deux fiches divergentes, analyses
  // divergentes). Il n'écrit que ses réponses PERSONNELLES.
  it('#4158.12 — a member with no canonical yet writes ONLY personal answers, never an orphan company profile', async () => {
    const { service, rows } = makeService({
      members: [{ workspace_id: WS, user_id: MEMBER, role: 'member' }],
    })

    await service.upsertAnswers(MEMBER, { esn_name: 'Team ESN', main_sales_pain: 'Fidéliser mes comptes existants' })

    const own = rows.find(r => r.user_id === MEMBER)
    expect(own?.main_sales_pain).toBe('Fidéliser mes comptes existants')
    expect(own?.esn_name ?? null).toBeNull()
    expect(own?.is_workspace_canonical ?? false).toBe(false)
  })

  it('#4158.12 — a member sending ONLY company answers before any canonical writes no row at all', async () => {
    const { service, rows } = makeService({
      members: [{ workspace_id: WS, user_id: MEMBER, role: 'member' }],
    })

    await service.upsertAnswers(MEMBER, { esn_name: 'Team ESN', target_sectors: ['Banque'] })

    expect(rows.find(r => r.user_id === MEMBER)).toBeUndefined()
  })

  it('#4158.12 — once the admin creates the canonical, the member INHERITS it (and keeps their personal answers)', async () => {
    const { service, rows } = makeService({
      members: [{ workspace_id: WS, user_id: MEMBER, role: 'member' }],
      workspaces: [{ id: WS, owner_user_id: OWNER }],
    })
    await service.upsertAnswers(MEMBER, { esn_name: 'Team ESN', main_sales_pain: 'Fidéliser mes comptes existants' })

    // L'administrateur décrit enfin l'ESN : sa ligne devient la canonique.
    rows.push(canonicalRow())

    const answers = await service.getAnswers(MEMBER)
    expect(answers.esn_name).toBe('Acme ESN')
    expect(answers.main_sales_pain).toBe('Fidéliser mes comptes existants')
    const origin = await service.getAnswersWithOrigin(MEMBER)
    expect(origin.inherited).toContain('esn_name')
  })

  it('an ADMIN (not the canonical author) edits company fields ON the canonical, personal on their own row', async () => {
    const { service, rows } = makeService({
      rows: [canonicalRow()],
      members: [{ workspace_id: WS, user_id: ADMIN, role: 'admin' }],
    })

    const answers = await service.upsertAnswers(ADMIN, {
      esn_name: 'Acme Rebranded',
      main_sales_pain: 'Cycles longs',
    })

    const canonical = rows.find(r => r.user_id === OWNER)
    expect(canonical?.esn_name).toBe('Acme Rebranded')
    // The admin's personal pain must NOT clobber the owner's on the canonical.
    expect(canonical?.main_sales_pain).toBe('Trouver les bons comptes à cibler')

    const own = rows.find(r => r.user_id === ADMIN)
    expect(own?.main_sales_pain).toBe('Cycles longs')

    expect(answers.esn_name).toBe('Acme Rebranded')
    expect(answers.main_sales_pain).toBe('Cycles longs')
  })

  it('getWorkspaceMeta: shared+locked for a member, editable for owner, legacy=editable', async () => {
    const shared = makeService({
      rows: [canonicalRow()],
      members: [{ workspace_id: WS, user_id: MEMBER, role: 'member' }],
    })
    expect(await shared.service.getWorkspaceMeta(MEMBER)).toEqual({
      shared: true,
      canEditCompany: false,
      role: 'member',
    })

    const owner = makeService({ rows: [canonicalRow()], workspaces: [{ id: WS, owner_user_id: OWNER }] })
    expect(await owner.service.getWorkspaceMeta(OWNER)).toEqual({
      shared: true,
      canEditCompany: true,
      role: 'owner',
    })

    // #4158.12 — membre sans canonique : l'entreprise n'est pas à lui.
    const waiting = makeService({ members: [{ workspace_id: WS, user_id: MEMBER, role: 'member' }] })
    expect(await waiting.service.getWorkspaceMeta(MEMBER)).toEqual({
      shared: false,
      canEditCompany: false,
      role: 'member',
    })

    const legacy = makeService({})
    expect(await legacy.service.getWorkspaceMeta('u1')).toEqual({
      shared: false,
      canEditCompany: true,
      role: null,
    })
  })
})

// §8 « Historique » : le profil ESN n'était jamais tracé. Un changement RÉEL
// écrit désormais un `profile_updated` scopé au workspace — jamais un no-op.
describe('EsnProfileService — traçage §8 profile_updated', () => {
  it('un changement réel écrit un profile_updated scopé au workspace, avec les champs touchés', async () => {
    const { service, userActions } = makeService({ workspaces: [{ id: WS, owner_user_id: OWNER }] })

    await service.upsertAnswers(OWNER, { esn_name: 'Acme ESN', target_sectors: ['Banque'] })

    expect(userActions.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: OWNER,
        workspace_id: WS,
        account_id: null,
        contact_id: null,
        action_type: 'profile_updated',
        metadata: expect.objectContaining({ fields: expect.arrayContaining(['esn_name', 'target_sectors']) }),
      }),
    )
  })

  it('un enregistrement SANS changement (mêmes valeurs) n’écrit rien', async () => {
    const { service, userActions } = makeService({
      rows: [canonicalRow()],
      workspaces: [{ id: WS, owner_user_id: OWNER }],
    })

    // canonicalRow() porte déjà esn_name 'Acme ESN' — ré-écrire la même valeur
    // n'est pas un changement.
    await service.upsertAnswers(OWNER, { esn_name: 'Acme ESN' })

    expect(userActions.insert).not.toHaveBeenCalled()
  })

  it('un membre dont l’édition company est ignorée n’écrit aucun profile_updated', async () => {
    const { service, userActions } = makeService({
      rows: [canonicalRow()],
      members: [{ workspace_id: WS, user_id: MEMBER, role: 'member' }],
    })

    // Le champ company est ignoré (canonical read-only) → `next` inchangé → pas
    // de changement réel → pas de trace.
    await service.upsertAnswers(MEMBER, { esn_name: 'Hijacked ESN' })

    expect(userActions.insert).not.toHaveBeenCalled()
  })
})

// #2035.8 — l'effectif porte sa date, et redevient inconnu en vieillissant.
describe('EsnProfileService — #2035.8 effectif_observed_at', () => {
  const NOW = new Date('2026-09-18T10:00:00.000Z')

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('horodate une bande d’effectif au moment du save', async () => {
    const { service, rows } = makeService({})

    await service.upsertAnswers('u1', { consultant_size: '10-30' })

    expect(rows[0].effectif_observed_at).toEqual({ consultant_size: NOW.toISOString() })
  })

  it('dit NON à un champ qui n’est PAS une bande d’effectif : ne s’attrape pas sur `sales_team_size`', async () => {
    const { service, rows } = makeService({})

    await service.upsertAnswers('u1', { sales_team_size: '2-3 personnes' })

    // Jamais touché : reste tel que le mock `create` l'a posé (`undefined`,
    // le défaut SQL `'{}'::jsonb` s'applique en base réelle, pas ici).
    expect(rows[0].effectif_observed_at).toBeUndefined()
  })

  it('un save qui ne touche pas l’effectif laisse la date déjà posée intacte', async () => {
    const { service, rows } = makeService({})

    await service.upsertAnswers('u1', { consultant_size: '10-30' })
    jest.setSystemTime(new Date('2026-12-01T00:00:00.000Z'))
    await service.upsertAnswers('u1', { esn_name: 'Acme' })

    expect(rows[0].effectif_observed_at).toEqual({ consultant_size: NOW.toISOString() })
  })

  it('un second save qui RETOUCHE la même bande avance sa date', async () => {
    const { service, rows } = makeService({})

    await service.upsertAnswers('u1', { consultant_size: '10-30' })
    const later = new Date('2026-12-01T00:00:00.000Z')
    jest.setSystemTime(later)
    await service.upsertAnswers('u1', { consultant_size: '30-80' })

    expect(rows[0].effectif_observed_at).toEqual({ consultant_size: later.toISOString() })
  })

  it('deux bandes d’effectif dans le MÊME save s’horodatent toutes les deux', async () => {
    const { service, rows } = makeService({})

    await service.upsertAnswers('u1', {
      consultant_size: '10-30',
      consultant_size_group_band: '200-500',
    })

    expect(rows[0].effectif_observed_at).toEqual({
      consultant_size: NOW.toISOString(),
      consultant_size_group_band: NOW.toISOString(),
    })
  })
})

// #2045.15 — un contact ancien n'est pas un accès actif : même colonne, même
// mécanique que l'effectif ci-dessus, appliquée au réseau personnel déclaré.
describe('EsnProfileService — #2045.15 effectif_observed_at (réseau)', () => {
  const NOW = new Date('2026-09-18T10:00:00.000Z')

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('horodate une bande de réseau au moment du save, dans la MÊME colonne que l’effectif', async () => {
    const { service, rows } = makeService({})

    await service.upsertAnswers('u1', { former_clients_count_band: '6-15' })

    expect(rows[0].effectif_observed_at).toEqual({ former_clients_count_band: NOW.toISOString() })
  })

  it('un save qui touche effectif ET réseau horodate les deux clés dans la même map', async () => {
    const { service, rows } = makeService({})

    await service.upsertAnswers('u1', { consultant_size: '10-30', partners_count_band: '1-5' })

    expect(rows[0].effectif_observed_at).toEqual({
      consultant_size: NOW.toISOString(),
      partners_count_band: NOW.toISOString(),
    })
  })

  it('dit NON à `warm_relations_count_band` : hors couverture (#2045.6, sans colonne persistée à ce jour)', async () => {
    const { service, rows } = makeService({})

    await service.upsertAnswers('u1', { warm_relations_count_band: '1-5' })

    expect(rows[0].effectif_observed_at).toBeUndefined()
  })
})

/**
 * #2006.22 (décision Louis 20/09/2026, QCM) — LE TEST QUI COMPTE : pas une
 * fonction qui rend le bon objet, le TRAJET complet — une réponse sauvegardée
 * par l'utilisateur (`upsertAnswers`, le seul chemin d'écriture réel du
 * profil), relue (`getAnswerMeta`, ce que `GET /esn-profile/answer-status`
 * sert), et elle ressort `confirmed`.
 */
describe('EsnProfileService — #2006.22 le trajet complet : sauvegardé par l’utilisateur, relu confirmé', () => {
  const NOW = new Date('2026-09-20T10:00:00.000Z')
  // `provenance.actorId` est un UUID (`answerProvenanceSchema`, @bellum/contracts) :
  // un `userId` non-UUID (comme le `'u1'` des autres describe de ce fichier,
  // jamais relu à travers `answerMetaSchema`) ferait échouer le `safeParse` de
  // `mapRowToAnswerMeta` en SILENCE — l'entrée disparaîtrait à la lecture sans
  // erreur, exactement le genre de faux-négatif que ce lot ne veut pas rater.
  const USER = '11111111-1111-1111-1111-111111111111'

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('une réponse sauvegardée par l’utilisateur ressort `confirmed`, avec sa provenance humaine', async () => {
    const { service } = makeService({})

    await service.upsertAnswers(USER, { esn_name: 'Acme' })
    const meta = await service.getAnswerMeta(USER)

    expect(meta.esn_name).toEqual({
      question: { key: 'esn_name', label: 'esn_name', version: 1 },
      questionnaireVersion: 1,
      provenance: { source: 'user', confidence: 'high', observedAt: NOW.toISOString(), actorId: USER },
      status: 'confirmed',
      branchReason: 'company_profile',
      consumerAreas: expect.arrayContaining(['audit']),
    })
  })

  /**
   * Le test qui DOIT dire NON — l'état que Louis veut éviter : si rien n'a
   * jamais été confirmé (aucun `upsertAnswers` appelé, exactement un compte
   * migré avant ce lot), `getAnswerMeta` ne doit faire ressortir AUCUNE clé
   * confirmée — sinon le badge de `ProfileStagePage` (`hasAnyConfirmedAnswer`)
   * s'allumerait pour rien.
   */
  it('refuse l’état réfuté en production : rien de sauvegardé ⇒ aucune clé confirmée', async () => {
    const { service } = makeService({})

    const meta = await service.getAnswerMeta(USER)

    expect(Object.values(meta).some(m => m.status === 'confirmed' || m.status === 'corrected')).toBe(false)
  })

  /**
   * Casse-le : si `stampAnswerMeta` stampait toute clé PRÉSENTE dans
   * `answers` (au lieu de celles qui ont RÉELLEMENT changé), ce test rougirait
   * — `esn_name` migré `proposed`, réenvoyé inchangé par un save qui ne
   * modifie réellement QUE `consultant_size` (le comportement RÉEL de
   * `ProfileStagePage`/`useProfileAnswers`, qui réenvoie l'objet complet des
   * réponses déjà chargées à chaque sauvegarde automatique).
   */
  it('un réenvoi complet ne confirme QUE le champ réellement modifié — jamais tout le profil au passage', async () => {
    const migratedRow = {
      id: 'row-u1',
      user_id: USER,
      version: 1,
      is_current: true,
      esn_name: 'Acme',
      consultant_size: '1-10',
      answer_meta: {
        esn_name: {
          question: { key: 'esn_name', label: 'esn_name', version: 1 },
          questionnaireVersion: 1,
          provenance: { source: 'inference', confidence: 'low', observedAt: null, actorId: null },
          status: 'proposed',
          branchReason: 'company_profile',
          consumerAreas: ['audit'],
        },
      },
    } as unknown as EsnProfileEntity
    const { service } = makeService({ rows: [migratedRow] })

    // Réenvoi complet : `esn_name` byte-identique (pas un geste de correction),
    // `consultant_size` réellement modifié.
    await service.upsertAnswers(USER, { esn_name: 'Acme', consultant_size: '10-30' })
    const meta = await service.getAnswerMeta(USER)

    expect(meta.esn_name?.status).toBe('proposed')
    expect(meta.consultant_size?.status).toBe('confirmed')
    expect(meta.consultant_size?.provenance.actorId).toBe(USER)
  })
})

describe('EsnProfileService — #2007.11 questions volontairement passées', () => {
  const USER = 'u1'

  it('note une clé passée pour la première fois', async () => {
    const { service } = makeService({})

    const keys = await service.skipQuestion(USER, 'esn_name')

    expect(keys).toEqual(['esn_name'])
    expect(await service.getSkippedQuestionKeys(USER)).toEqual(['esn_name'])
  })

  it('ne duplique pas une clé déjà passée', async () => {
    const { service } = makeService({})

    await service.skipQuestion(USER, 'esn_name')
    const keys = await service.skipQuestion(USER, 'esn_name')

    expect(keys).toEqual(['esn_name'])
  })

  it('répondre à une clé passée RETIRE son statut passé — une correction humaine gagne toujours', async () => {
    const { service } = makeService({})

    await service.skipQuestion(USER, 'esn_name')
    await service.upsertAnswers(USER, { esn_name: 'Acme' })

    expect(await service.getSkippedQuestionKeys(USER)).toEqual([])
  })

  it('un réenvoi qui ne touche pas la clé passée la laisse intacte', async () => {
    const { service } = makeService({})

    await service.skipQuestion(USER, 'esn_name')
    await service.upsertAnswers(USER, { consultant_size: '1-10' })

    expect(await service.getSkippedQuestionKeys(USER)).toEqual(['esn_name'])
  })
})

describe('EsnProfileService — #4425.4 confirmer une réponse sans la réécrire', () => {
  const USER = '11111111-1111-4111-8111-111111111111'

  // Une réponse historique : une valeur, aucune enveloppe → « Origine non établie ».
  function legacyRow(extra: Record<string, unknown> = {}): EsnProfileEntity {
    return {
      id: 'r1',
      user_id: USER,
      version: 1,
      is_current: true,
      esn_name: 'Acme',
      ...extra,
    } as unknown as EsnProfileEntity
  }

  it('pose confirmed/user sur une réponse sans origine, sans toucher à sa valeur', async () => {
    const { service } = makeService({ rows: [legacyRow()] })

    await service.confirmAnswer(USER, 'esn_name')
    const meta = await service.getAnswerMeta(USER)

    expect(meta.esn_name?.status).toBe('confirmed')
    expect(meta.esn_name?.provenance).toMatchObject({ source: 'user', actorId: USER })
    expect((await service.getAnswers(USER)).esn_name).toBe('Acme')
  })

  it('garde l’ORIGINE déjà stockée (registre) : confirmer ne la remplace pas par « déclaré »', async () => {
    const row = legacyRow({
      answer_meta: {
        esn_name: {
          question: { key: 'esn_name', label: 'esn_name', version: 1 },
          questionnaireVersion: 1,
          provenance: { source: 'registry', confidence: 'high', observedAt: '2026-09-01T00:00:00.000Z', actorId: null },
          status: 'proposed',
          branchReason: 'company_profile',
          consumerAreas: ['audit'],
        },
      },
    })
    const { service } = makeService({ rows: [row] })

    await service.confirmAnswer(USER, 'esn_name')
    const meta = await service.getAnswerMeta(USER)

    expect(meta.esn_name?.status).toBe('confirmed')
    expect(meta.esn_name?.provenance.source).toBe('registry')
  })

  it('une réponse déjà confirmée ou corrigée n’est pas retouchée (une correction humaine gagne)', async () => {
    const { service } = makeService({ rows: [legacyRow()] })
    await service.confirmAnswer(USER, 'esn_name')
    const first = (await service.getAnswerMeta(USER)).esn_name

    await service.confirmAnswer(USER, 'esn_name')

    expect((await service.getAnswerMeta(USER)).esn_name).toEqual(first)
  })

  it('dit NON à une clé sans réponse : on ne confirme pas une absence', async () => {
    const { service, repo } = makeService({ rows: [legacyRow()] })

    await expect(service.confirmAnswer(USER, 'consultant_size')).rejects.toThrow(/answer_not_filled/)
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('dit NON à un membre sur un champ d’ENTREPRISE d’un espace partagé (signaler seulement)', async () => {
    const { service, repo } = makeService({
      rows: [canonicalRow()],
      members: [{ workspace_id: WS, user_id: MEMBER, role: 'member' }],
    })

    await expect(service.confirmAnswer(MEMBER, 'esn_name')).rejects.toThrow(/company_answer_locked/)
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('l’admin confirme un champ d’entreprise sur la fiche canonique', async () => {
    const { service, rows } = makeService({
      rows: [canonicalRow()],
      members: [{ workspace_id: WS, user_id: ADMIN, role: 'admin' }],
    })

    await service.confirmAnswer(ADMIN, 'esn_name')

    const canonical = rows.find(r => r.is_workspace_canonical)
    const stored = canonical?.answer_meta?.esn_name as { status: string; provenance: { actorId: string } } | undefined
    expect(stored?.status).toBe('confirmed')
    expect(stored?.provenance.actorId).toBe(ADMIN)
  })
})

/**
 * #4971 — les noms des outils MAISON s'écrivent comme toute réponse d'entreprise
 * de l'onboarding : sur la fiche de L'ESPACE de l'utilisateur, jamais ailleurs.
 */
describe('EsnProfileService — #4971 tooling_internal_names', () => {
  const OTHER_WS = 'ws-autre'
  const OTHER_OWNER = 'owner-autre'
  const otherCanonical = (): EsnProfileEntity =>
    ({
      ...canonicalRow(),
      id: 'row-autre',
      user_id: OTHER_OWNER,
      workspace_id: OTHER_WS,
      esn_name: 'Autre ESN',
      tooling_internal_names: ['Outil de l’autre espace'],
    }) as unknown as EsnProfileEntity

  it('écrit les noms sur la fiche canonique de SON espace et les relit', async () => {
    const { service, rows } = makeService({
      rows: [canonicalRow(), otherCanonical()],
      workspaces: [
        { id: WS, owner_user_id: OWNER },
        { id: OTHER_WS, owner_user_id: OTHER_OWNER },
      ],
    })

    const answers = await service.upsertAnswers(OWNER, { tooling_internal_names: ['GestMission'] })

    expect(answers.tooling_internal_names).toEqual(['GestMission'])
    expect(rows.find(r => r.user_id === OWNER)?.tooling_internal_names).toEqual(['GestMission'])
  })

  it('REFUS : n’écrit JAMAIS sur la fiche d’un autre espace, même si la charge utile le nomme', async () => {
    const { service, rows } = makeService({
      rows: [canonicalRow(), otherCanonical()],
      workspaces: [
        { id: WS, owner_user_id: OWNER },
        { id: OTHER_WS, owner_user_id: OTHER_OWNER },
      ],
    })
    // La route passe par `saveAnswersSchema` : une clé `workspace_id` glissée
    // dans le corps n'y survit pas — l'espace vient de la session, jamais du corps.
    const body = saveAnswersSchema.parse({ tooling_internal_names: ['Intrus'], workspace_id: OTHER_WS })
    expect(body).not.toHaveProperty('workspace_id')

    await service.upsertAnswers(OWNER, body)

    const other = rows.find(r => r.user_id === OTHER_OWNER)
    expect(other?.tooling_internal_names).toEqual(['Outil de l’autre espace'])
    expect(other?.workspace_id).toBe(OTHER_WS)
    expect(rows.find(r => r.user_id === OWNER)?.workspace_id).toBe(WS)
  })

  it('REFUS : un MEMBRE ne réécrit pas les outils de la fiche d’entreprise', async () => {
    const { service, rows } = makeService({
      rows: [{ ...canonicalRow(), tooling_internal_names: ['GestMission'] } as unknown as EsnProfileEntity],
      members: [{ workspace_id: WS, user_id: MEMBER, role: 'member' }],
    })

    const answers = await service.upsertAnswers(MEMBER, { tooling_internal_names: ['Remplacé'] })

    expect(rows.find(r => r.user_id === OWNER)?.tooling_internal_names).toEqual(['GestMission'])
    expect(answers.tooling_internal_names).toEqual(['GestMission'])
  })

  it('une question jamais répondue se relit INCONNUE (`null`), jamais « aucun outil »', async () => {
    const { service } = makeService({ rows: [canonicalRow()], workspaces: [{ id: WS, owner_user_id: OWNER }] })
    expect((await service.getAnswers(OWNER)).tooling_internal_names).toBeNull()
  })
})
