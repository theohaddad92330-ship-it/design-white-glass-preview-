import { describe, expect, it } from 'vitest'

import {
  acceptWorkspaceInvitationResultSchema,
  assignableWorkspaceRoles,
  createWorkspaceInvitationSchema,
  hasPermission,
  MARKET_CATALOG,
  MARKET_COUNTRY_NAMES,
  normalizeMarket,
  resolveMarket,
  updateWorkspaceMarketSchema,
  updateWorkspaceHiddenSectionsSchema,
  updateWorkspaceMemberRoleSchema,
  updateWorkspaceSchema,
  updateWorkspaceTimezoneSchema,
  workspaceHiddenSectionsResolutionSchema,
  workspaceInvitationSchema,
  workspaceMarketSchema,
  workspaceMarketValues,
  workspaceMemberSchema,
  workspacePermissionValues,
  workspaceRoleLabels,
  workspaceRoleSchema,
  workspaceRoleValues,
  workspaceSchema,
  workspaceSeatsSchema,
  workspaceTeamMemberSchema,
  workspaceTeamSchema,
  workspaceTimezoneResolutionSchema,
  workspaceTimezoneSchema,
} from './workspace.js'
import type { WorkspacePermission, WorkspaceRole } from './workspace.js'

const ISO = '2026-07-13T10:00:00.000Z'
const UUID = '11111111-1111-1111-1111-111111111111'

describe('workspace schemas', () => {
  it('accepts a valid workspace', () => {
    const parsed = workspaceSchema.parse({
      id: UUID,
      name: 'ESN Acme',
      ownerUserId: UUID,
      role: 'owner',
      memberCount: 3,
      createdAt: ISO,
    })
    expect(parsed.role).toBe('owner')
    expect(parsed.memberCount).toBe(3)
  })

  it('rejects an unknown role', () => {
    expect(workspaceRoleSchema.safeParse('superadmin').success).toBe(false)
  })

  it('accepts every RBAC role (legacy + new)', () => {
    for (const role of ['owner', 'admin', 'sales_ops', 'sales', 'tech_admin', 'member', 'viewer'] as const) {
      expect(workspaceRoleSchema.safeParse(role).success).toBe(true)
    }
    // The three legacy roles are still valid — no reclassification.
    expect(workspaceRoleValues).toEqual(
      expect.arrayContaining(['owner', 'admin', 'member', 'sales', 'sales_ops', 'viewer', 'tech_admin']),
    )
  })

  it('has an FR label for every role', () => {
    for (const role of workspaceRoleValues) {
      expect(workspaceRoleLabels[role]).toBeTruthy()
    }
  })

  it('offers every non-owner role as assignable (owner excluded)', () => {
    expect(assignableWorkspaceRoles).not.toContain('owner')
    expect(assignableWorkspaceRoles).toEqual(
      expect.arrayContaining(['admin', 'sales_ops', 'sales', 'tech_admin', 'member', 'viewer']),
    )
  })

  it('rejects a negative member count', () => {
    const res = workspaceSchema.safeParse({
      id: UUID,
      name: 'ESN Acme',
      ownerUserId: UUID,
      role: 'member',
      memberCount: -1,
      createdAt: ISO,
    })
    expect(res.success).toBe(false)
  })

  it('validates a member row', () => {
    const parsed = workspaceMemberSchema.parse({
      id: UUID,
      userId: UUID,
      email: 'jean@acme.fr',
      fullName: null,
      role: 'member',
      joinedAt: ISO,
    })
    expect(parsed.fullName).toBeNull()
  })

  it('validates an invitation row', () => {
    const parsed = workspaceInvitationSchema.parse({
      id: UUID,
      email: 'new@acme.fr',
      role: 'member',
      status: 'pending',
      invitedByUserId: UUID,
      expiresAt: ISO,
      createdAt: ISO,
    })
    expect(parsed.status).toBe('pending')
  })

  it('defaults invite role to member and forbids inviting an owner', () => {
    const parsed = createWorkspaceInvitationSchema.parse({ email: 'x@acme.fr' })
    expect(parsed.role).toBe('member')
    expect(createWorkspaceInvitationSchema.safeParse({ email: 'x@acme.fr', role: 'owner' }).success).toBe(false)
  })

  it('caps a workspace rename length', () => {
    expect(updateWorkspaceSchema.safeParse({ name: '' }).success).toBe(false)
    expect(updateWorkspaceSchema.safeParse({ name: 'x'.repeat(200) }).success).toBe(false)
    expect(updateWorkspaceSchema.parse({ name: 'Nouvelle ESN' }).name).toBe('Nouvelle ESN')
  })

  it('allows a team member with a null email (no profile email on file)', () => {
    const parsed = workspaceTeamMemberSchema.parse({
      userId: UUID,
      email: null,
      fullName: 'Jean Martin',
      role: 'admin',
      joinedAt: ISO,
    })
    expect(parsed.email).toBeNull()
    expect(parsed.role).toBe('admin')
  })

  it('validates the /workspaces/me team payload', () => {
    const parsed = workspaceTeamSchema.parse({
      workspace: { id: UUID, name: 'ESN Acme', role: 'owner', memberCount: 2 },
      members: [
        { userId: UUID, email: 'owner@acme.fr', fullName: 'Owner', role: 'owner', joinedAt: ISO },
        { userId: UUID, email: null, fullName: null, role: 'member', joinedAt: ISO },
      ],
      invitations: [
        { id: UUID, email: 'new@acme.fr', role: 'member', status: 'pending', expiresAt: ISO, createdAt: ISO },
      ],
      seats: { used: 3, total: 5 },
    })
    expect(parsed.members).toHaveLength(2)
    expect(parsed.seats.total).toBe(5)
  })

  it('requires a positive seat total', () => {
    expect(workspaceSeatsSchema.safeParse({ used: 0, total: 0 }).success).toBe(false)
    expect(workspaceSeatsSchema.parse({ used: 1, total: 1 }).total).toBe(1)
  })

  it('forbids promoting a member to owner via the role-change body', () => {
    expect(updateWorkspaceMemberRoleSchema.safeParse({ role: 'owner' }).success).toBe(false)
    expect(updateWorkspaceMemberRoleSchema.parse({ role: 'admin' }).role).toBe('admin')
  })

  it('validates the accept-invitation result', () => {
    const parsed = acceptWorkspaceInvitationResultSchema.parse({
      workspaceId: UUID,
      workspaceName: 'ESN Acme',
      role: 'member',
    })
    expect(parsed.role).toBe('member')
  })
})

describe('RBAC permission matrix', () => {
  const ALL: readonly WorkspacePermission[] = workspacePermissionValues
  // `records:write` fait partie de l'usage commercial courant : corriger une
  // fiche, écrire une note, créer un contact. Elle est DISTINCTE de
  // `data:export` parce que sortir la donnée et la MODIFIER ne se délèguent pas
  // au même siège — un stagiaire qui exporte une liste ne devrait pas pouvoir
  // renommer un compte.
  //
  // `finance:read:own` y entre le 26/08/2026 (D1) : un commercial voit le
  // chiffre d'affaires de SON périmètre. Pas `finance:read`, qui ouvrirait la
  // marge de ses collègues et le coût chargé des consultants.
  const COMMERCIAL: readonly WorkspacePermission[] = [
    'analysis:run',
    'contacts:enrich',
    'data:export',
    'messages:send',
    'records:write',
    'finance:read:own',
    // #1792 — lire le CRM branché suit `data:export` : qui peut SORTIR la donnée
    // peut la lire là où elle est déjà. `tech_admin` et `viewer` en sont exclus.
    'crm:read',
    // #2018.7 — signaler une information d'entreprise fausse, sans droit de
    // l'écraser. `tech_admin` et `viewer` en sont exclus.
    'profile:report',
  ]

  const expectExactly = (role: WorkspaceRole, granted: readonly WorkspacePermission[]) => {
    for (const perm of ALL) {
      expect(hasPermission(role, perm)).toBe(granted.includes(perm))
    }
  }

  it('viewer is strictly read-only — refused on every permission', () => {
    for (const perm of ALL) expect(hasPermission('viewer', perm)).toBe(false)
  })

  it('owner and admin keep every permission (legacy reach preserved)', () => {
    for (const perm of ALL) {
      expect(hasPermission('owner', perm)).toBe(true)
      expect(hasPermission('admin', perm)).toBe(true)
    }
  })

  it('sales = commercial usage only (no team, no billing, no integrations)', () => {
    expectExactly('sales', COMMERCIAL)
    expect(hasPermission('sales', 'team:manage')).toBe(false)
    expect(hasPermission('sales', 'billing:manage')).toBe(false)
    expect(hasPermission('sales', 'integrations:manage')).toBe(false)
  })

  it('un commercial voit SON chiffre, jamais celui de l’espace (D1 · 26/08)', () => {
    // La nuance porte tout le lot : `finance:read` donne la marge des collègues
    // et le coût chargé des consultants, qui relève de la paie.
    for (const role of ['sales', 'sales_ops'] as const) {
      expect(hasPermission(role, 'finance:read:own')).toBe(true)
      expect(hasPermission(role, 'finance:read')).toBe(false)
      expect(hasPermission(role, 'finance:write')).toBe(false)
    }
  })

  it('un `viewer` et un `recruiter` n’y ont toujours pas droit', () => {
    for (const role of ['viewer', 'recruiter'] as const) {
      expect(hasPermission(role, 'finance:read:own')).toBe(false)
    }
  })

  it('les sièges historiques ne gagnent RIEN au passage', () => {
    // Accorder rétroactivement à `member` ouvrirait le chiffre d'affaires à
    // tous les sièges d'un coup, sans que personne ne l'ait décidé — le même
    // refus que le backfill `member → sales`.
    expect(hasPermission('member', 'finance:read:own')).toBe(false)
  })

  it('sales_ops = commercial usage + team management (still no billing/integrations)', () => {
    expectExactly('sales_ops', [...COMMERCIAL, 'team:manage'])
    expect(hasPermission('sales_ops', 'team:manage')).toBe(true)
    expect(hasPermission('sales_ops', 'billing:manage')).toBe(false)
    expect(hasPermission('sales_ops', 'integrations:manage')).toBe(false)
  })

  it('tech_admin = integrations only (transversal seat)', () => {
    expectExactly('tech_admin', ['integrations:manage'])
  })

  it('member (legacy) keeps everything except team management', () => {
    expectExactly('member', [
      'analysis:run',
      'contacts:enrich',
      'data:export',
      'messages:send',
      'records:write',
      'integrations:manage',
      'billing:manage',
      // #1792 — `member` portait déjà `data:export`, il porte donc `crm:read`.
      'crm:read',
      // #2018.7 — signale, sans droit d'écraser le profil canonique.
      'profile:report',
    ])
    expect(hasPermission('member', 'team:manage')).toBe(false)
  })

  it('team management is granted to owner, admin and sales_ops only', () => {
    const canManageTeam = workspaceRoleValues.filter(role => hasPermission(role, 'team:manage'))
    expect([...canManageTeam].sort()).toEqual(['admin', 'owner', 'sales_ops'])
  })

  it('#2018.7 — profile:report va aux sièges commerciaux, jamais à viewer/tech_admin/recruiter/finance', () => {
    const canReport = workspaceRoleValues.filter(role => hasPermission(role, 'profile:report'))
    expect([...canReport].sort()).toEqual(['admin', 'member', 'owner', 'sales', 'sales_ops'])
    for (const role of ['viewer', 'tech_admin', 'recruiter', 'finance'] as const) {
      expect(hasPermission(role, 'profile:report')).toBe(false)
    }
  })

  /**
   * #3015 — recette du 25/09/2026 : `⌘⇧K` (recherche globale) plantait
   * l'app au premier chargement, redirection vers l'écran d'erreur générique,
   * et « ça marche » après un rechargement forcé. Cause racine, reproduite
   * ici : `GlobalSearchDialog` appelle `hasPermission(team?.workspace.role ??
   * 'member', 'team:manage')` avec le rôle RENVOYÉ PAR LE SERVEUR — jamais
   * garanti d'appartenir à `WorkspaceRole` à l'exécution (cache
   * `PersistQueryClientProvider` persisté depuis AVANT un renommage de rôle,
   * skew web/API pendant la fenêtre de déploiement Vercel/Railway). Un
   * rechargement force un `buster` neuf, qui purge le cache périmé — d'où
   * « ça marche après reload » : la donnée redevient un rôle connu, jamais
   * le code qui change.
   *
   * `ROLE_PERMISSIONS[role]` était lu SANS repli : un rôle inconnu levait
   * `Cannot read properties of undefined (reading 'includes')`, jusqu'à la
   * frontière d'erreur racine — l'app ENTIÈRE, pas seulement la modale,
   * puisque `ShortcutsProvider` (et donc `GlobalSearchDialog`) vit au même
   * niveau que le contenu de la route. Le repli est ici, dans la SEULE
   * fonction que chaque appelant (web ET API, une dizaine de guards) utilise
   * pour cette question — jamais rajouté à chaque site d'appel un par un.
   */
  it("#3015 — un rôle que ce code ne connaît pas n'ouvre AUCUN droit, il ne fait jamais planter", () => {
    const unknownRole = 'legacy_role_removed_since' as WorkspaceRole
    expect(() => hasPermission(unknownRole, 'team:manage')).not.toThrow()
    for (const perm of ALL) expect(hasPermission(unknownRole, perm)).toBe(false)
  })
})

describe('workspace market', () => {
  it('accepts the supported markets and rejects anything else', () => {
    for (const market of workspaceMarketValues) {
      expect(workspaceMarketSchema.parse(market)).toBe(market)
    }
    expect(workspaceMarketSchema.safeParse('DE').success).toBe(false)
    expect(workspaceMarketSchema.safeParse('fr').success).toBe(false)
  })

  it('defaults to FR for unknown / empty / malformed values, and is case-insensitive', () => {
    expect(normalizeMarket(undefined)).toBe('FR')
    expect(normalizeMarket(null)).toBe('FR')
    expect(normalizeMarket('')).toBe('FR')
    expect(normalizeMarket('   ')).toBe('FR')
    expect(normalizeMarket('DE')).toBe('FR')
    expect(normalizeMarket('ch')).toBe('CH')
    expect(normalizeMarket(' Be ')).toBe('BE')
    expect(normalizeMarket('us')).toBe('US')
    expect(normalizeMarket(' ca ')).toBe('CA')
  })

  it('resolves FR to the strictly-unchanged native path (no country pack)', () => {
    const fr = resolveMarket('FR')
    expect(fr).toEqual({
      market: 'FR',
      countryCode: 'FR',
      defaultLocale: 'fr',
      legalBasis: 'RGPD',
      activeCountryPack: false,
    })
  })

  it('maps each non-FR market to its locale, legal basis and a backing country pack', () => {
    expect(resolveMarket('CH')).toEqual({
      market: 'CH',
      countryCode: 'CH',
      defaultLocale: 'de',
      legalBasis: 'adéquation',
      activeCountryPack: true,
    })
    expect(resolveMarket('BE').legalBasis).toBe('RGPD')
    expect(resolveMarket('BE').activeCountryPack).toBe(true)
    expect(resolveMarket('LU').defaultLocale).toBe('fr')
    expect(resolveMarket('LU').activeCountryPack).toBe(true)
  })

  it('maps the US market to English + state privacy laws (no GDPR)', () => {
    expect(resolveMarket('US')).toEqual({
      market: 'US',
      countryCode: 'US',
      defaultLocale: 'en',
      legalBasis: 'CCPA',
      activeCountryPack: true,
    })
  })

  it('maps the CA market to English default + PIPEDA (FR-CA nuance lives in the pack)', () => {
    expect(resolveMarket('CA')).toEqual({
      market: 'CA',
      countryCode: 'CA',
      defaultLocale: 'en',
      legalBasis: 'PIPEDA',
      activeCountryPack: true,
    })
  })

  it('keeps the catalog and the market enum in lock-step', () => {
    expect(Object.keys(MARKET_CATALOG).sort()).toEqual([...workspaceMarketValues].sort())
    // FR is the ONLY market without a country pack.
    const withoutPack = workspaceMarketValues.filter(m => !MARKET_CATALOG[m].activeCountryPack)
    expect(withoutPack).toEqual(['FR'])
  })

  it('validates the PATCH /workspaces/market body', () => {
    expect(updateWorkspaceMarketSchema.parse({ market: 'CH' }).market).toBe('CH')
    expect(updateWorkspaceMarketSchema.parse({ market: 'US' }).market).toBe('US')
    expect(updateWorkspaceMarketSchema.parse({ market: 'CA' }).market).toBe('CA')
    expect(updateWorkspaceMarketSchema.safeParse({ market: 'DE' }).success).toBe(false)
    expect(updateWorkspaceMarketSchema.safeParse({}).success).toBe(false)
  })

  /**
   * #2621.1 — le RAPPROCHEMENT entre le marché de l'espace et le pays BRUT
   * qu'une source externe (Apollo) écrit dans `location` (« Paris, France »).
   * Une seule table : Découvrir (contacts) la consomme pour ne garder que le
   * pays du workspace tant que la bascule « monde » n'est pas posée. Le nom
   * est celui qu'Apollo écrit RÉELLEMENT (anglais), jamais un libellé traduit
   * pour l'affichage — les deux catalogues divergeraient sinon (GA-26).
   */
  it('names the RAW country Apollo writes for every market — one catalog, no silent drift', () => {
    expect(MARKET_COUNTRY_NAMES).toEqual({
      FR: 'France',
      CH: 'Switzerland',
      BE: 'Belgium',
      LU: 'Luxembourg',
      US: 'United States',
      CA: 'Canada',
    })
    expect(Object.keys(MARKET_COUNTRY_NAMES).sort()).toEqual([...workspaceMarketValues].sort())
  })
})

describe('workspace timezone (#1958.2)', () => {
  it('accepts a real IANA timezone, and null (« cet espace n’a rien réglé »)', () => {
    expect(workspaceTimezoneSchema.parse('Europe/Paris')).toBe('Europe/Paris')
    expect(workspaceTimezoneSchema.parse('America/Montreal')).toBe('America/Montreal')
    expect(workspaceTimezoneSchema.parse(null)).toBeNull()
  })

  it('rejects an invented timezone — a bad row must never enter the base', () => {
    expect(workspaceTimezoneSchema.safeParse('Europe/Parisss').success).toBe(false)
    expect(workspaceTimezoneSchema.safeParse('').success).toBe(false)
  })

  it('validates the PATCH /workspaces/timezone body', () => {
    expect(updateWorkspaceTimezoneSchema.parse({ timezone: 'Asia/Singapore' }).timezone).toBe('Asia/Singapore')
    expect(updateWorkspaceTimezoneSchema.parse({ timezone: null }).timezone).toBeNull()
    expect(updateWorkspaceTimezoneSchema.safeParse({ timezone: 'not-a-zone' }).success).toBe(false)
    expect(updateWorkspaceTimezoneSchema.safeParse({}).success).toBe(false)
  })

  it('shapes the GET /workspaces/timezone response', () => {
    expect(workspaceTimezoneResolutionSchema.parse({ timezone: 'Europe/Paris' })).toEqual({
      timezone: 'Europe/Paris',
    })
    expect(workspaceTimezoneResolutionSchema.parse({ timezone: null })).toEqual({ timezone: null })
  })
})

// #2957 (#2179.2/.35) — les sections de navigation masquables par un admin d'espace.
describe('workspace hidden sections', () => {
  it('accepts the known maskable section and rejects an unknown one', () => {
    expect(updateWorkspaceHiddenSectionsSchema.parse({ hiddenSections: ['rfp'] }).hiddenSections).toEqual(['rfp'])
    expect(updateWorkspaceHiddenSectionsSchema.parse({ hiddenSections: [] }).hiddenSections).toEqual([])
    expect(updateWorkspaceHiddenSectionsSchema.safeParse({ hiddenSections: ['accounts'] }).success).toBe(false)
    expect(updateWorkspaceHiddenSectionsSchema.safeParse({}).success).toBe(false)
  })

  it('shapes the GET /workspaces/hidden-sections response', () => {
    expect(workspaceHiddenSectionsResolutionSchema.parse({ hiddenSections: ['rfp'] })).toEqual({
      hiddenSections: ['rfp'],
    })
    expect(workspaceHiddenSectionsResolutionSchema.parse({ hiddenSections: [] })).toEqual({ hiddenSections: [] })
  })
})
