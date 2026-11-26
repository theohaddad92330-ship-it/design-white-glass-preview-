import type { Repository } from 'typeorm'
import type { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import type { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import type { WorkspaceActiveSelectionEntity } from '../../database/entities/workspace-active-selection.entity'
import { mapRowToAnswers } from './esn-answers.mapper'
import { runWithRequestMemo } from '../../common/request-memo'
import { EsnProfileWorkspaceResolver } from './esn-profile-workspace.resolver'

/** Minimal esn_profiles rows — only the fields resolution reads. */
function profileRow(overrides: Partial<EsnProfileEntity>): EsnProfileEntity {
  return {
    id: `row-${overrides.user_id ?? 'x'}`,
    version: 1,
    is_current: true,
    workspace_id: null,
    is_workspace_canonical: false,
    esn_name: null,
    consultant_size: null,
    sales_team_size: null,
    expertise_areas: [],
    positioning: null,
    target_sectors: [],
    target_company_types: [],
    staffing_model: null,
    geo_zones: [],
    main_sales_pain: null,
    ...overrides,
  } as EsnProfileEntity
}

function findOneBy<T extends object>(rows: T[]) {
  return jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
    return rows.find(r => Object.entries(where).every(([k, v]) => (r as Record<string, unknown>)[k] === v)) ?? null
  })
}

function makeResolver(opts: {
  profiles?: EsnProfileEntity[]
  workspaces?: Array<Partial<WorkspaceEntity>>
  members?: Array<Partial<WorkspaceMemberEntity>>
  workspacesThrow?: boolean
  /** L'espace CHOISI par l'utilisateur (`workspace_active_selections`). */
  selections?: { user_id: string; workspace_id: string }[]
  /**
   * D9 — la ligne `profiles` (PAS `esn_profiles`) que `resolveProfileData`
   * interroge en brut pour `profile_context_validated_at`, même motif que
   * `resolveProfileVersions` (raw query, `.manager.query`, fail-soft).
   */
  profilesTableManagerQuery?: jest.Mock
}) {
  const profilesRepo = {
    findOne: findOneBy(opts.profiles ?? []),
    manager: { query: opts.profilesTableManagerQuery ?? jest.fn(async () => []) },
  } as unknown as Repository<EsnProfileEntity>
  const workspacesRepo = {
    findOne: opts.workspacesThrow
      ? jest.fn(async () => {
          throw new Error('db down')
        })
      : findOneBy((opts.workspaces ?? []) as WorkspaceEntity[]),
  } as unknown as Repository<WorkspaceEntity>
  const membersRepo = {
    findOne: findOneBy((opts.members ?? []) as WorkspaceMemberEntity[]),
  } as unknown as Repository<WorkspaceMemberEntity>
  const selectionsRepo = {
    findOne: findOneBy((opts.selections ?? []) as never[]),
  } as unknown as Repository<WorkspaceActiveSelectionEntity>
  return new EsnProfileWorkspaceResolver(profilesRepo, workspacesRepo, membersRepo, selectionsRepo)
}

const OWNER = 'owner-1'
const MEMBER = 'member-1'
const WS = 'ws-1'

const canonicalRow = profileRow({
  user_id: OWNER,
  workspace_id: WS,
  is_workspace_canonical: true,
  esn_name: 'Acme ESN',
  consultant_size: '30-80',
  expertise_areas: ['Data & Intelligence Artificielle'],
  target_sectors: ['Banque de détail & Banque privée'],
  geo_zones: ['Paris & Île-de-France'],
  main_sales_pain: 'Trouver les bons comptes à cibler',
})

describe('EsnProfileWorkspaceResolver', () => {
  it('legacy fallback — no workspace at all: byte-identical to the per-user read', async () => {
    const own = profileRow({ user_id: MEMBER, esn_name: 'Solo ESN', main_sales_pain: 'Cycles longs' })
    const resolver = makeResolver({ profiles: [own] })

    const answers = await resolver.resolveMergedAnswers(MEMBER)
    expect(answers).toEqual(mapRowToAnswers(own))
  })

  it('legacy fallback — workspace but no canonical profile: byte-identical to the per-user read', async () => {
    const own = profileRow({ user_id: MEMBER, esn_name: 'Solo ESN' })
    const resolver = makeResolver({
      profiles: [own],
      members: [{ workspace_id: WS, user_id: MEMBER, role: 'member' }],
    })

    const answers = await resolver.resolveMergedAnswers(MEMBER)
    expect(answers).toEqual(mapRowToAnswers(own))
  })

  it('legacy fallback — workspace lookup failure degrades to the per-user read (never throws)', async () => {
    const own = profileRow({ user_id: MEMBER, esn_name: 'Solo ESN' })
    const resolver = makeResolver({ profiles: [own], workspacesThrow: true })

    const answers = await resolver.resolveMergedAnswers(MEMBER)
    expect(answers).toEqual(mapRowToAnswers(own))
  })

  it('owner (mono-user post-backfill): the canonical row IS theirs — the per-user read, unchanged', async () => {
    const resolver = makeResolver({
      profiles: [canonicalRow],
      workspaces: [{ id: WS, owner_user_id: OWNER }],
    })

    const answers = await resolver.resolveMergedAnswers(OWNER)
    expect(answers).toEqual(mapRowToAnswers(canonicalRow))
  })

  it('member: company fields come from the canonical, personal overlay from their own row', async () => {
    const memberRow = profileRow({
      user_id: MEMBER,
      esn_name: 'Should be ignored',
      main_sales_pain: 'Convertir mes RDV en signatures',
    })
    const resolver = makeResolver({
      profiles: [canonicalRow, memberRow],
      members: [{ workspace_id: WS, user_id: MEMBER, role: 'member' }],
    })

    const answers = await resolver.resolveMergedAnswers(MEMBER)
    expect(answers.esn_name).toBe('Acme ESN')
    expect(answers.expertise_areas).toEqual(['Data & Intelligence Artificielle'])
    expect(answers.geo_zones).toEqual(['Paris & Île-de-France'])
    expect(answers.main_sales_pain).toBe('Convertir mes RDV en signatures')
  })

  it("member without their own row: the canonical profile as-is (owner's pain as fallback)", async () => {
    const resolver = makeResolver({
      profiles: [canonicalRow],
      members: [{ workspace_id: WS, user_id: MEMBER, role: 'member' }],
    })

    const answers = await resolver.resolveMergedAnswers(MEMBER)
    expect(answers.esn_name).toBe('Acme ESN')
    expect(answers.main_sales_pain).toBe('Trouver les bons comptes à cibler')
  })

  it('resolveContext exposes RBAC: owner/admin can manage the company profile, member/viewer cannot', async () => {
    const base = {
      profiles: [canonicalRow],
    }
    const asOwner = makeResolver({ ...base, workspaces: [{ id: WS, owner_user_id: OWNER }] })
    expect((await asOwner.resolveContext(OWNER)).canManageCompany).toBe(true)

    const asAdmin = makeResolver({ ...base, members: [{ workspace_id: WS, user_id: MEMBER, role: 'admin' }] })
    expect((await asAdmin.resolveContext(MEMBER)).canManageCompany).toBe(true)

    const asMember = makeResolver({ ...base, members: [{ workspace_id: WS, user_id: MEMBER, role: 'member' }] })
    expect((await asMember.resolveContext(MEMBER)).canManageCompany).toBe(false)

    const asViewer = makeResolver({ ...base, members: [{ workspace_id: WS, user_id: MEMBER, role: 'viewer' }] })
    expect((await asViewer.resolveContext(MEMBER)).canManageCompany).toBe(false)
  })

  it('resolveContext finds the canonical row of the ACTIVE workspace only', async () => {
    const otherCanonical = profileRow({
      user_id: 'other-owner',
      workspace_id: 'ws-2',
      is_workspace_canonical: true,
      esn_name: 'Other ESN',
    })
    const resolver = makeResolver({
      profiles: [otherCanonical],
      members: [{ workspace_id: WS, user_id: MEMBER, role: 'member' }],
    })

    const context = await resolver.resolveContext(MEMBER)
    expect(context.workspaceId).toBe(WS)
    expect(context.canonicalRow).toBeNull()
  })

  /**
   * ⚠️ LA POPULATION RÉELLE — celle que les cas ci-dessus ne pouvaient pas produire.
   *
   * Tous les fixtures « membre » plus haut donnent au membre AUCUN espace
   * possédé. C'est impossible en production : le déclencheur de création de
   * compte (`handle_new_user_workspace`) donne à CHAQUE inscrit son propre
   * espace en `owner`. Un associé qui rejoint l'ESN d'un collègue en possède
   * donc toujours un, vide.
   *
   * C'est exactement ce trou de population qui a laissé passer le défaut : le
   * résolveur retombait sur cet espace personnel vide, `canonicalRow` valait
   * `null`, la fusion court-circuitait, et le second associé se voyait reposer
   * les onze questions sur l'ESN. Remonté par un client le 07/09/2026.
   */
  describe('l’associé qui rejoint une ESN — la population que la production produit', () => {
    const PERSO = 'ws-perso-du-membre'

    /** Ce que la production fabrique : un espace personnel vide EN PLUS de l'adhésion. */
    const commeEnProduction = {
      profiles: [canonicalRow],
      workspaces: [{ id: PERSO, owner_user_id: MEMBER }],
      members: [{ workspace_id: WS, user_id: MEMBER, role: 'member' as const }],
    }

    it('SANS espace choisi, il retombe sur son espace personnel — le comportement historique', async () => {
      const resolver = makeResolver(commeEnProduction)
      const context = await resolver.resolveContext(MEMBER)

      // Ce n'est pas le défaut : sans choix explicite, l'ordre historique
      // s'applique, et il est inchangé. C'est le contrôle négatif.
      expect(context.workspaceId).toBe(PERSO)
      expect(context.canonicalRow).toBeNull()
    })

    it('AVEC l’espace choisi, il lit la fiche de l’ESN — le défaut corrigé', async () => {
      const resolver = makeResolver({
        ...commeEnProduction,
        selections: [{ user_id: MEMBER, workspace_id: WS }],
      })

      const context = await resolver.resolveContext(MEMBER)
      expect(context.workspaceId).toBe(WS)
      expect(context.canonicalRow).not.toBeNull()

      // Et la conséquence qui compte pour le client : les onze réponses sur
      // l'ESN sont déjà là, il n'a plus à les retaper.
      const answers = await resolver.resolveMergedAnswers(MEMBER)
      expect(answers.esn_name).toBe('Acme ESN')
      expect(answers.expertise_areas).toEqual(['Data & Intelligence Artificielle'])
      expect(answers.geo_zones).toEqual(['Paris & Île-de-France'])
    })

    it('SAIT DIRE NON — un choix dont le siège a été retiré n’ouvre plus rien', async () => {
      const resolver = makeResolver({
        ...commeEnProduction,
        members: [], // le siège a été révoqué depuis
        selections: [{ user_id: MEMBER, workspace_id: WS }],
      })

      // Le choix survit en base, l'adhésion non : on ne l'honore pas.
      const context = await resolver.resolveContext(MEMBER)
      expect(context.workspaceId).toBe(PERSO)
    })

    it('n’attrape pas ce qu’il ne vise pas — le choix d’un AUTRE utilisateur est ignoré', async () => {
      const resolver = makeResolver({
        ...commeEnProduction,
        selections: [{ user_id: 'quelquun-dautre', workspace_id: WS }],
      })

      const context = await resolver.resolveContext(MEMBER)
      expect(context.workspaceId).toBe(PERSO)
    })
  })
})

/**
 * #2006.22 — `mapRowToAnswerMeta` (`answer-meta.mapper.ts`) existait déjà mais
 * n'avait AUCUN appelant : `GET /esn-profile` ne rendait jamais de statut, et
 * Réglages › Profil affichait chaque réponse avec la même coche. Même union
 * que `resolveEffectifObservedAt` juste au-dessus : une clé COMPANY ne
 * s'écrit jamais que sur la ligne canonique, une clé PERSONNELLE jamais que
 * sur la ligne propre.
 */
function answerMeta(status: 'confirmed' | 'proposed'): EsnProfileEntity['answer_meta'] {
  return {
    question: { key: 'x', label: 'questions.x.label', version: 1 },
    questionnaireVersion: 1,
    provenance: { source: 'user', confidence: 'high', observedAt: '2026-09-20T00:00:00.000Z', actorId: null },
    status,
    branchReason: 'always_asked',
    consumerAreas: [],
  }
}

describe('EsnProfileWorkspaceResolver.resolveAnswerMeta', () => {
  it('fusionne le statut ENTREPRISE (ligne canonique) et le statut PERSONNEL (ligne propre)', async () => {
    const canonicalWithMeta = profileRow({
      ...canonicalRow,
      answer_meta: { esn_name: answerMeta('confirmed') },
    })
    const memberRow = profileRow({
      user_id: MEMBER,
      answer_meta: { main_sales_pain: answerMeta('proposed') },
    })
    const resolver = makeResolver({
      profiles: [canonicalWithMeta, memberRow],
      members: [{ workspace_id: WS, user_id: MEMBER, role: 'member' }],
    })

    const meta = await resolver.resolveAnswerMeta(MEMBER)
    expect(meta.esn_name?.status).toBe('confirmed')
    expect(meta.main_sales_pain?.status).toBe('proposed')
  })

  it("rend {} quand aucune des deux lignes n'a jamais écrit answer_meta — une clé absente reste `proposed` via resolveAnswerStatus, jamais `confirmed`", async () => {
    const own = profileRow({ user_id: MEMBER })
    const resolver = makeResolver({ profiles: [own] })

    const meta = await resolver.resolveAnswerMeta(MEMBER)
    expect(meta).toEqual({})
  })
})

/**
 * #1671-ter — d'où vient chaque réponse.
 *
 * Retour de Louis le 07/09/2026 : « bedros est bien dans la team abricotlabs
 * mais l'onboarding est encore lancé quand il se connecte ». #1671-bis avait
 * réparé la RÉSOLUTION d'espace ; il restait que le flux repose les questions
 * qu'il vient pourtant de pré-remplir, faute de savoir lesquelles sont déjà
 * répondues PAR L'ENTREPRISE.
 *
 * C'est ici, et nulle part ailleurs, que le cas mono-utilisateur se tranche :
 * `inheritedAnswerKeys` ne voit que des valeurs, jamais une identité.
 */
describe('EsnProfileWorkspaceResolver.resolveAnswersWithOrigin', () => {
  const PERSO = 'ws-perso-du-membre'

  /** Ce que la production fabrique : un espace personnel vide EN PLUS de
   *  l'adhésion, et le choix posé par l'acceptation de l'invitation. */
  const associeChezSonEsn = {
    profiles: [canonicalRow],
    workspaces: [{ id: PERSO, owner_user_id: MEMBER }],
    members: [{ workspace_id: WS, user_id: MEMBER, role: 'member' as const }],
    selections: [{ user_id: MEMBER, workspace_id: WS }],
  }

  it("nomme les faits sur l'ESN comme hérités, et laisse au membre sa question", async () => {
    const { answers, inherited } = await makeResolver(associeChezSonEsn).resolveAnswersWithOrigin(MEMBER)

    expect(answers.esn_name).toBe('Acme ESN')
    expect(inherited).toContain('esn_name')
    expect(inherited).toContain('expertise_areas')
    // Le frein commercial est PERSONNEL : hérité tant qu'il n'a pas répondu,
    // donc encore à lui poser.
    expect(inherited).toContain('main_sales_pain')
  })

  it("cesse de nommer sa question dès qu'il y a répondu", async () => {
    const own = profileRow({ user_id: MEMBER, main_sales_pain: 'Convertir mes RDV en signatures' })
    const { inherited } = await makeResolver({
      ...associeChezSonEsn,
      profiles: [canonicalRow, own],
    }).resolveAnswersWithOrigin(MEMBER)

    expect(inherited).not.toContain('main_sales_pain')
    expect(inherited).toContain('esn_name')
  })

  it("LE CAS MONO-UTILISATEUR — la ligne canonique EST la sienne, il n'hérite de personne", async () => {
    // Le propriétaire post-bascule : ses propres réponses portent le drapeau
    // canonique. Sans ce court-circuit, il se verrait « hériter » de lui-même
    // et on lui reposerait sa propre question à chaque passage.
    const { inherited } = await makeResolver({
      profiles: [canonicalRow],
      workspaces: [{ id: WS, owner_user_id: OWNER }],
      members: [{ workspace_id: WS, user_id: OWNER, role: 'owner' as const }],
    }).resolveAnswersWithOrigin(OWNER)

    expect(inherited).toEqual([])
  })

  it("LE CONTRÔLE NÉGATIF — sans fiche d'entreprise, rien n'est hérité", async () => {
    const own = profileRow({ user_id: MEMBER, esn_name: 'Solo ESN' })
    const { answers, inherited } = await makeResolver({
      profiles: [own],
      workspaces: [{ id: PERSO, owner_user_id: MEMBER }],
    }).resolveAnswersWithOrigin(MEMBER)

    expect(answers.esn_name).toBe('Solo ESN')
    expect(inherited).toEqual([])
  })
})

/**
 * D9 — décision Louis 14/09/2026 : valider le contexte commercial. Laura cite
 * le contexte comme validé (`bellum_advisor.py::seller_block`) : la seule
 * façon de le lui dire est d'ajouter le fait à `AnalysisProfileData`, le seul
 * objet que TOUS les prompts (Analysis, Discover, Chat, Score, Messages)
 * lisent (`EsnProfileReader.resolveProfileData` — même docblock).
 */
describe('EsnProfileWorkspaceResolver.resolveProfileData — profileContextValidatedAt (D9)', () => {
  const own = profileRow({ user_id: OWNER, esn_name: 'Solo ESN' })

  it('porte profileContextValidatedAt en ISO quand `profiles.profile_context_status` vaut validated', async () => {
    const query = jest.fn(async () => [
      { profile_context_status: 'validated', profile_context_validated_at: new Date('2026-09-10T08:00:00.000Z') },
    ])
    const resolver = makeResolver({ profiles: [own], profilesTableManagerQuery: query })

    const data = await resolver.resolveProfileData(OWNER)

    expect(data.profileContextValidatedAt).toBe('2026-09-10T08:00:00.000Z')
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM profiles'), [OWNER])
  })

  it('SAIT DIRE NON — absent quand le statut n’est plus validated, même si la colonne porte encore une ancienne date', async () => {
    const query = jest.fn(async () => [
      { profile_context_status: 'succeeded', profile_context_validated_at: new Date('2026-09-01T00:00:00.000Z') },
    ])
    const resolver = makeResolver({ profiles: [own], profilesTableManagerQuery: query })

    const data = await resolver.resolveProfileData(OWNER)

    expect(data.profileContextValidatedAt).toBeUndefined()
  })

  it('absent quand aucune ligne `profiles` n’existe, ou que la lecture échoue — fail-soft comme le reste du résolveur', async () => {
    const query = jest.fn(async () => {
      throw new Error('db down')
    })
    const resolver = makeResolver({ profiles: [own], profilesTableManagerQuery: query })

    const data = await resolver.resolveProfileData(OWNER)

    expect(data.profileContextValidatedAt).toBeUndefined()
    expect(data.companyName).toBe('Solo ESN') // le reste du profil n'est pas affecté
  })
})

/**
 * #2118.10 / #2118.15 — le rôle et la capacité saisis au questionnaire
 * progressif sont ÉCRITS dans `esn_profiles` (`esnProfiles.merge(base, answers)`)
 * mais `mapRowToAnswers` ne les relisait pas : `esnAnswersToProfileData` savait
 * les traduire, personne ne les lui donnait, et la lecture du compte ne les
 * recevait jamais.
 */
describe('EsnProfileWorkspaceResolver.resolveProfileData — le profil progressif atteint le moteur (#2118)', () => {
  it('le rôle, la capacité de démarrage et les consultants disponibles partent au moteur', async () => {
    const row = profileRow({
      user_id: MEMBER,
      esn_name: 'Solo ESN',
      user_role: 'Directeur commercial',
      ramp_up_capacity: '1-2 mois',
      consultants_on_mission: '31-80',
      consultants_in_pipe: '6-15',
    })
    const data = await makeResolver({ profiles: [row] }).resolveProfileData(MEMBER)
    expect(data).toMatchObject({
      sellerRole: 'Directeur commercial',
      rampUpCapacity: '1-2 mois',
      consultantsOnMission: '31-80',
      consultantsInPipe: '6-15',
    })
  })

  it('une question passée ne produit aucune clé — jamais une valeur de remplissage', async () => {
    const row = profileRow({ user_id: MEMBER, esn_name: 'Solo ESN' })
    const data = await makeResolver({ profiles: [row] }).resolveProfileData(MEMBER)
    expect(Object.keys(data)).toEqual(['companyName'])
  })
})

/**
 * #2118.16 / #2118.9 — décisions Louis 15/09 : la stratégie validée à l'audit et
 * la BU du commercial PARTENT au moteur, et le verdict de la Synthèse les cite.
 * Ce résolveur est le seul objet que tous les prompts lisent : c'est ici que les
 * deux faits entrent dans `AnalysisProfileData`, ou nulle part.
 */
describe('EsnProfileWorkspaceResolver.resolveProfileData — stratégie validée et BU (#2118.16, #2118.9)', () => {
  const own = profileRow({ user_id: MEMBER, esn_name: 'Solo ESN' })
  const inWorkspace = { members: [{ workspace_id: WS, user_id: MEMBER, role: 'member' as const }] }

  function queryAnswering(rows: { strategy?: object[]; units?: object[] }) {
    return jest.fn(async (sql: string) => {
      if (sql.includes('chosen_entry_strategy')) return rows.strategy ?? []
      if (sql.includes('business_unit_members')) return rows.units ?? []
      return []
    })
  }

  it('#2118.16 — la stratégie CHOISIE part au moteur, et gagne sur la calculée', async () => {
    const query = queryAnswering({ strategy: [{ chosen: 'referral', computed: 'topDown' }] })
    const data = await makeResolver({ profiles: [own], profilesTableManagerQuery: query }).resolveProfileData(MEMBER)
    expect(data.entryStrategy).toBe('referral')
    expect(query).toHaveBeenCalledWith(expect.stringContaining('chosen_entry_strategy'), [MEMBER])
  })

  it('#2118.16 — sans choix, la stratégie CALCULÉE par le profileur part', async () => {
    const query = queryAnswering({ strategy: [{ chosen: null, computed: 'bottomUp' }] })
    const data = await makeResolver({ profiles: [own], profilesTableManagerQuery: query }).resolveProfileData(MEMBER)
    expect(data.entryStrategy).toBe('bottomUp')
  })

  it('#2118.9 — les BU portées dans l’espace ACTIF partent, bornées par l’espace', async () => {
    const query = queryAnswering({
      units: [
        { name: 'Agence Lyon', kind: 'agency', territory: 'Auvergne-Rhône-Alpes', specialties: ['Data', ' '] },
        { name: 'BU Cloud', kind: 'business_unit', territory: null, specialties: [] },
      ],
    })
    const data = await makeResolver({
      profiles: [own],
      profilesTableManagerQuery: query,
      ...inWorkspace,
    }).resolveProfileData(MEMBER)
    expect(data.businessUnits).toEqual([
      { name: 'Agence Lyon', kind: 'agency', territory: 'Auvergne-Rhône-Alpes', specialties: ['Data'] },
      { name: 'BU Cloud', kind: 'business_unit' },
    ])
    // Les DEUX colonnes : `user_id` seul ferait entrer les BU d'un autre espace.
    expect(query).toHaveBeenCalledWith(expect.stringContaining('business_unit_members'), [WS, MEMBER])
  })

  it('SAIT DIRE NON — aucune clé sans stratégie connue, sans BU portée, ou hors de tout espace', async () => {
    const query = queryAnswering({
      strategy: [{ chosen: 'sideways', computed: null }],
      units: [{ name: 'Agence fantôme', kind: 'agency' }],
    })
    // Hors espace : la requête des BU n'est même pas posée.
    const data = await makeResolver({ profiles: [own], profilesTableManagerQuery: query }).resolveProfileData(MEMBER)
    expect(data.entryStrategy).toBeUndefined()
    expect(data.businessUnits).toBeUndefined()
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining('business_unit_members'), expect.anything())
  })

  it('fail-soft — une lecture qui échoue ne casse pas le profil', async () => {
    const query = jest.fn(async () => {
      throw new Error('db down')
    })
    const data = await makeResolver({
      profiles: [own],
      profilesTableManagerQuery: query,
      ...inWorkspace,
    }).resolveProfileData(MEMBER)
    expect(data.entryStrategy).toBeUndefined()
    expect(data.businessUnits).toBeUndefined()
    expect(data.companyName).toBe('Solo ESN')
  })
})

/**
 * #2007.3 / #2009.8 — le périmètre porté, lu pour le PROFILEUR : la MÊME
 * requête bornée que #2118.9 (espace actif + utilisateur), exposée par le port
 * `BUSINESS_UNITS_READER` de `profile-context`.
 */
describe('EsnProfileWorkspaceResolver.resolveCarriedBusinessUnits (#2007.3)', () => {
  const own = profileRow({ user_id: MEMBER, esn_name: 'Solo ESN' })

  it('rend les BU portées dans l’espace ACTIF, bornées par l’espace ET l’utilisateur', async () => {
    const query = jest.fn(async (sql: string) =>
      sql.includes('business_unit_members')
        ? [{ name: 'Agence Lyon', kind: 'agency', territory: null, specialties: [] }]
        : [],
    )
    const units = await makeResolver({
      profiles: [own],
      profilesTableManagerQuery: query,
      members: [{ workspace_id: WS, user_id: MEMBER, role: 'member' as const }],
    }).resolveCarriedBusinessUnits(MEMBER)
    expect(units).toEqual([{ name: 'Agence Lyon', kind: 'agency' }])
    expect(query).toHaveBeenCalledWith(expect.stringContaining('business_unit_members'), [WS, MEMBER])
  })

  it('SAIT DIRE NON — hors de tout espace, aucune requête, aucun périmètre', async () => {
    const query = jest.fn(async () => [{ name: 'Agence fantôme', kind: 'agency' }])
    const units = await makeResolver({ profiles: [own], profilesTableManagerQuery: query }).resolveCarriedBusinessUnits(
      MEMBER,
    )
    expect(units).toEqual([])
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining('business_unit_members'), expect.anything())
  })
})

/**
 * #2005.4 / #2005.5 / #2005.6 / #2005.11 — le profil à trois couches, composé
 * ICI (le seul endroit qui a déjà le contexte d'espace), versionné par le
 * contrat (`composeLayeredProfile`). Aucune table dupliquée : chaque fait est
 * lu là où il vit.
 */
describe('EsnProfileWorkspaceResolver.resolveLayeredProfile — trois couches, UN objet (#2005)', () => {
  const NOW = new Date('2026-09-17T08:00:00Z')
  const member = profileRow({
    user_id: MEMBER,
    workspace_id: WS,
    user_role: 'Business Manager',
    role_tenure: 'Moins d’1 an',
  } as Partial<EsnProfileEntity>)
  const inWorkspace = { members: [{ workspace_id: WS, user_id: MEMBER, role: 'sales' as const }] }

  const UNIT_ROW = {
    id: 'bu-1',
    name: 'Agence Toulouse',
    kind: 'agency',
    membership: 'member',
    territory: 'Occitanie',
    specialties: ['Cloud'],
    consultant_count: 12,
    team_size: null,
    lead_user_id: null,
    portfolio_note: null,
    member_count: 1,
    attached_account_count: 0,
  }
  const PERSON_ROW = {
    business_unit_access: 'business_unit',
    portfolio_visibility: 'restricted',
    timezone: 'Europe/Paris',
    preferences: { ton: 'tutoiement' },
    target_meetings: 8,
    target_accounts: null,
    target_revenue: '15000',
  }

  function queryAnswering(rows: { units?: object[]; person?: object[] }) {
    return jest.fn(async (sql: string) => {
      if (sql.includes('attached_account_count')) return rows.units ?? []
      if (sql.includes('user_preferences')) return rows.person ?? []
      return []
    })
  }

  it('compose les trois couches depuis là où chaque fait VIT, bornées par l’espace actif', async () => {
    const query = queryAnswering({ units: [UNIT_ROW], person: [PERSON_ROW] })
    const profile = await makeResolver({
      profiles: [canonicalRow, member],
      profilesTableManagerQuery: query,
      ...inWorkspace,
    }).resolveLayeredProfile(MEMBER, NOW)

    // Couche entreprise : la fiche CANONIQUE de l'espace.
    expect(profile.company?.identity?.name).toBe('Acme ESN')
    // Couche BU : les périmètres portés, avec leurs comptes et leur équipe.
    expect(profile.businessUnit?.units).toEqual([
      expect.objectContaining({ id: 'bu-1', name: 'Agence Toulouse', consultants: 12, capacity: null }),
    ])
    // Couche personne : la surcouche du membre, son rôle, ses droits, son mois.
    expect(profile.person?.role?.declared).toBe('Business Manager')
    expect(profile.person?.permissions).toEqual({
      workspaceRole: 'sales',
      businessUnitAccess: 'business_unit',
      portfolioVisibility: 'restricted',
    })
    expect(profile.person?.preferences?.copilot).toEqual({ ton: 'tutoiement' })
    expect(profile.person?.objectives?.currentMonth).toEqual({
      periodMonth: '2026-09-01',
      meetings: 8,
      accounts: null,
      revenue: 15000,
    })
    expect(profile.unknown).toEqual([])

    // Les DEUX colonnes de portée, et le mois courant en UTC.
    expect(query).toHaveBeenCalledWith(expect.stringContaining('attached_account_count'), [WS, MEMBER])
    expect(query).toHaveBeenCalledWith(expect.stringContaining('user_preferences'), [WS, MEMBER, '2026-09-01'])
  })

  it('SAIT DIRE NON — hors de tout espace, aucune BU n’est lue et la couche vaut `null`, nommée', async () => {
    const query = queryAnswering({ units: [UNIT_ROW] })
    const profile = await makeResolver({
      profiles: [profileRow({ user_id: MEMBER, esn_name: 'Solo ESN' })],
      profilesTableManagerQuery: query,
    }).resolveLayeredProfile(MEMBER, NOW)
    expect(profile.company?.identity?.name).toBe('Solo ESN')
    expect(profile.businessUnit).toBeNull()
    expect(profile.unknown).toContain('businessUnit')
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining('attached_account_count'), expect.anything())
  })

  it('une ligne de BU illisible est écartée, jamais complétée', async () => {
    const query = queryAnswering({
      units: [
        { ...UNIT_ROW, kind: 'inventé' },
        { ...UNIT_ROW, id: 'bu-2', name: ' ' },
      ],
    })
    const profile = await makeResolver({
      profiles: [member],
      profilesTableManagerQuery: query,
      ...inWorkspace,
    }).resolveLayeredProfile(MEMBER, NOW)
    expect(profile.businessUnit).toBeNull()
  })

  it('fail-soft — une lecture qui échoue rend des couches `null`, jamais une exception', async () => {
    const query = jest.fn(async () => {
      throw new Error('db down')
    })
    const profile = await makeResolver({
      profiles: [member],
      profilesTableManagerQuery: query,
      ...inWorkspace,
    }).resolveLayeredProfile(MEMBER, NOW)
    expect(profile.businessUnit).toBeNull()
    expect(profile.person?.permissions).toEqual({
      workspaceRole: 'sales',
      businessUnitAccess: null,
      portfolioVisibility: null,
    })
  })

  it('#2005.11 — la version de la personne bouge avec SA préférence, celle de l’entreprise non', async () => {
    const before = await makeResolver({
      profiles: [canonicalRow, member],
      profilesTableManagerQuery: queryAnswering({ person: [PERSON_ROW] }),
      ...inWorkspace,
    }).resolveLayerVersions(MEMBER, NOW)
    const after = await makeResolver({
      profiles: [canonicalRow, member],
      profilesTableManagerQuery: queryAnswering({ person: [{ ...PERSON_ROW, preferences: { ton: 'vouvoiement' } }] }),
      ...inWorkspace,
    }).resolveLayerVersions(MEMBER, NOW)
    expect(before.company).toEqual(expect.any(String))
    expect(after.company).toBe(before.company)
    expect(after.person).not.toBe(before.person)
    expect(after.businessUnit).toBeNull()
  })
})

/**
 * #4450 — GET /onboarding/state résolvait le contexte de la fiche ESN TROIS fois
 * (réponses, fraîcheur d'effectif, administrateur attendu) : les mêmes lectures
 * `esn_profiles` / sélection / membre répétées, le N+1 que Sentry relève. Dans
 * une requête GET, le contexte se lit UNE fois.
 */
describe('resolveContext — une lecture par requête GET (#4450)', () => {
  const memberRow = profileRow({ user_id: MEMBER, workspace_id: WS })

  it('trois lecteurs dans la même requête ⇒ une seule résolution du contexte', async () => {
    const resolver = makeResolver({
      profiles: [canonicalRow, memberRow],
      members: [{ user_id: MEMBER, workspace_id: WS, role: 'member' }],
      selections: [{ user_id: MEMBER, workspace_id: WS }],
    })
    const esnFindOne = (resolver as unknown as { esnProfiles: { findOne: jest.Mock } }).esnProfiles.findOne
    await runWithRequestMemo(() =>
      Promise.all([
        resolver.resolveAnswersWithOrigin(MEMBER),
        resolver.resolveEffectifObservedAt(MEMBER),
        resolver.resolveAwaitingCompanyAdmin(MEMBER),
      ]),
    )
    // ligne propre + ligne canonique : deux lectures, pas six.
    expect(esnFindOne).toHaveBeenCalledTimes(2)
  })

  it('hors requête (job, écriture) : chaque appel relit, comme avant', async () => {
    const resolver = makeResolver({ profiles: [canonicalRow] })
    const esnFindOne = (resolver as unknown as { esnProfiles: { findOne: jest.Mock } }).esnProfiles.findOne
    await resolver.resolveEffectifObservedAt(OWNER)
    await resolver.resolveEffectifObservedAt(OWNER)
    // sans espace : une lecture de la ligne propre PAR appel.
    expect(esnFindOne).toHaveBeenCalledTimes(2)
  })

  it('deux utilisateurs dans la même requête ne partagent jamais leur contexte', async () => {
    const resolver = makeResolver({
      profiles: [canonicalRow, memberRow],
      workspaces: [{ id: WS, owner_user_id: OWNER, created_at: new Date() }],
      members: [{ user_id: MEMBER, workspace_id: WS, role: 'member' }],
    })
    const [owner, member] = await runWithRequestMemo(() =>
      Promise.all([resolver.resolveContext(OWNER), resolver.resolveContext(MEMBER)]),
    )
    expect(owner.ownRow?.user_id).toBe(OWNER)
    expect(member.ownRow?.user_id).toBe(MEMBER)
  })
})
