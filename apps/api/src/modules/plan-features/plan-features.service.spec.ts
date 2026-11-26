import { ALL_PLAN_FEATURES } from '@bellum/contracts'
import { PLAN_CATALOG_DEFAULTS } from '../credits/plan-catalog.defaults'
import { PlanFeaturesService } from './plan-features.service'

type Repo<T> = { findOne: jest.Mock<Promise<T | null>, unknown[]> }

function build(options: {
  workspace?: { id: string; owner_user_id: string | null; is_demo?: boolean } | null
  subscription?: { plan: string; trial_end?: Date | null } | null
  planFeatures?: Record<string, string[]>
  resolveThrows?: boolean
}) {
  const workspaces: Repo<unknown> = { findOne: jest.fn().mockResolvedValue(options.workspace ?? null) }
  const subscriptions: Repo<unknown> = { findOne: jest.fn().mockResolvedValue(options.subscription ?? null) }
  const planCatalog = {
    getOrDefault: jest.fn(async (key: string) => ({
      key,
      features: options.planFeatures?.[key] ?? [...ALL_PLAN_FEATURES],
    })),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async () => {
      if (options.resolveThrows) throw new Error('no workspace')
      return { workspaceId: options.workspace?.id ?? 'ws-1' }
    }),
  }
  const service = new PlanFeaturesService(
    planCatalog as never,
    workspaceContext as never,
    workspaces as never,
    subscriptions as never,
  )
  return { service, planCatalog, subscriptions, workspaces }
}

// PLAN-GATE #4381 — ce que le back-office pose est ce que le verrou lit : le
// plan du PROPRIÉTAIRE de l'espace, avec la grille du catalogue. La grille par
// défaut ne donne le Vivier (`talent_pool`) qu'à Growth et Bêta — « Entreprise »
// (clé `team`) ne l'ouvre pas, et c'est écrit ici plutôt que découvert chez un client.
describe('PLAN-GATE #4381 — le Vivier suit le palier posé sur l’espace', () => {
  const grille = Object.fromEntries(Object.entries(PLAN_CATALOG_DEFAULTS).map(([key, def]) => [key, def.features]))

  it.each(['growth', 'beta'])('palier %s sur l’espace ⇒ talent_pool ouvert pour un MEMBRE', async plan => {
    const { service } = build({
      workspace: { id: 'ws-1', owner_user_id: 'owner-1' },
      subscription: { plan },
      planFeatures: grille,
    })

    await expect(service.featuresForUser('membre-2')).resolves.toContain('talent_pool')
  })

  it.each(
    ['team', 'starter', 'trial'].filter(p => !PLAN_CATALOG_DEFAULTS[p as 'team'].features.includes('talent_pool')),
  )('SAIT DIRE NON : palier %s ⇒ talent_pool fermé, la raison est la grille et non la personne', async plan => {
    const { service } = build({
      workspace: { id: 'ws-1', owner_user_id: 'owner-1' },
      subscription: { plan },
      planFeatures: grille,
    })

    await expect(service.featuresForUser('membre-2')).resolves.not.toContain('talent_pool')
  })
})

describe('PlanFeaturesService', () => {
  it("lit le palier de l'OWNER du workspace, pas celui de l'appelant", async () => {
    const { service, subscriptions } = build({
      workspace: { id: 'ws-1', owner_user_id: 'owner-1' },
      subscription: { plan: 'team' },
      planFeatures: { team: ['chat_ai'] },
    })

    await expect(service.featuresForUser('membre-2')).resolves.toEqual(['chat_ai'])
    // Un invité n'a pas d'abonnement à lui : c'est l'owner qui est interrogé.
    expect(subscriptions.findOne).toHaveBeenCalledWith({ where: { user_id: 'owner-1' } })
  })

  // ENTREPRISE-TOUT #4381 — « Entreprise (sur devis) » (`team`) ouvre TOUT, `talent_pool` compris.
  it('un espace `team` sur la grille embarquée a toutes les clés ouvertes', async () => {
    const { service } = build({
      workspace: { id: 'ws-1', owner_user_id: 'owner-1' },
      subscription: { plan: 'team' },
      planFeatures: { team: [...PLAN_CATALOG_DEFAULTS.team.features] },
    })

    const open = await service.featuresForUser('owner-1')
    expect(open).toContain('talent_pool')
    expect([...open].sort()).toEqual([...ALL_PLAN_FEATURES].sort())
  })

  it('ouvre tout sur un espace de démo, quel que soit le palier posé dessus', async () => {
    const { service, subscriptions } = build({
      workspace: { id: 'ws-demo', owner_user_id: 'owner-1', is_demo: true },
      subscription: { plan: 'starter' },
      planFeatures: { starter: [] },
    })

    await expect(service.featuresForUser('visiteur')).resolves.toEqual([...ALL_PLAN_FEATURES])
    // On ne va même pas chercher l'abonnement : la démo montre le produit.
    expect(subscriptions.findOne).not.toHaveBeenCalled()
  })

  it("retombe sur l'abonnement de l'appelant quand aucun workspace ne se résout", async () => {
    const { service, subscriptions } = build({
      resolveThrows: true,
      subscription: { plan: 'growth' },
      planFeatures: { growth: ['crm_sync'] },
    })

    await expect(service.featuresForUser('solo-1')).resolves.toEqual(['crm_sync'])
    expect(subscriptions.findOne).toHaveBeenCalledWith({ where: { user_id: 'solo-1' } })
  })

  it("lit 'trial' quand le compte n'a aucune ligne d'abonnement", async () => {
    const { service, planCatalog } = build({
      workspace: { id: 'ws-1', owner_user_id: 'owner-1' },
      subscription: null,
    })

    await service.featuresForUser('u-1')
    expect(planCatalog.getOrDefault).toHaveBeenCalledWith('trial')
  })

  it('normalise un plan legacy avant de lire le catalogue', async () => {
    const { service, planCatalog } = build({
      workspace: { id: 'ws-1', owner_user_id: 'owner-1' },
      subscription: { plan: 'pro' },
    })

    await service.featuresForUser('u-1')
    // `pro` a été renommé `team` : sans normalisation il tomberait sur `trial`.
    expect(planCatalog.getOrDefault).toHaveBeenCalledWith('team')
  })

  it('résout par workspace pour une clé d’API (aucun utilisateur)', async () => {
    const { service } = build({
      workspace: { id: 'ws-9', owner_user_id: 'owner-9' },
      subscription: { plan: 'starter' },
      planFeatures: { starter: ['public_api'] },
    })

    await expect(service.workspaceHas('ws-9', 'public_api')).resolves.toBe(true)
    await expect(service.workspaceHas('ws-9', 'chat_ai')).resolves.toBe(false)
  })

  it("ne donne rien quand le workspace d'une clé n'a pas d'owner résoluble", async () => {
    const { service } = build({ workspace: { id: 'ws-orphan', owner_user_id: null } })
    // Pas d'abonnement attribuable ⇒ aucune feature. Fermer plutôt qu'accorder
    // par défaut : une clé orpheline ne doit pas hériter d'un palier.
    await expect(service.featuresForWorkspace('ws-orphan')).resolves.toEqual([])
  })

  // décision Louis 13/09 batch 13 — plafond selon le plan
  describe('planForUser — le palier qui s’applique, résolu comme les features', () => {
    it("rend le palier de l'OWNER du workspace, pas celui de l'appelant", async () => {
      const { service, subscriptions } = build({
        workspace: { id: 'ws-1', owner_user_id: 'owner-1' },
        subscription: { plan: 'growth' },
      })

      await expect(service.planForUser('membre-2')).resolves.toBe('growth')
      expect(subscriptions.findOne).toHaveBeenCalledWith({ where: { user_id: 'owner-1' } })
    })

    it('normalise un plan legacy', async () => {
      const { service } = build({ workspace: { id: 'ws-1', owner_user_id: 'owner-1' }, subscription: { plan: 'pro' } })

      await expect(service.planForUser('u-1')).resolves.toBe('team')
    })

    it("retombe sur l'abonnement de l'appelant quand aucun workspace ne se résout", async () => {
      const { service, subscriptions } = build({ resolveThrows: true, subscription: { plan: 'starter' } })

      await expect(service.planForUser('solo-1')).resolves.toBe('starter')
      expect(subscriptions.findOne).toHaveBeenCalledWith({ where: { user_id: 'solo-1' } })
    })

    it('plan inconnu : null — jamais un palier deviné', async () => {
      const { service } = build({
        workspace: { id: 'ws-1', owner_user_id: 'owner-1' },
        subscription: { plan: 'platinum' },
      })

      await expect(service.planForUser('u-1')).resolves.toBeNull()
    })

    it("aucune ligne d'abonnement : null (les features, elles, gardent leur repli « trial »)", async () => {
      const { service, planCatalog } = build({
        workspace: { id: 'ws-1', owner_user_id: 'owner-1' },
        subscription: null,
      })

      await expect(service.planForUser('u-1')).resolves.toBeNull()
      expect(planCatalog.getOrDefault).not.toHaveBeenCalled()
    })
  })

  // #4016 L7 — le plafond opérateur PAR PLAN de la veille lit le palier d'un
  // espace sans utilisateur connecté (cron) : même règle, l'owner de l'espace.
  describe('planForWorkspace — le palier d’un espace, sans session', () => {
    it("rend le palier de l'OWNER de l'espace", async () => {
      const { service, subscriptions } = build({
        workspace: { id: 'ws-1', owner_user_id: 'owner-1' },
        subscription: { plan: 'growth' },
      })

      await expect(service.planForWorkspace('ws-1', 'membre-2')).resolves.toBe('growth')
      expect(subscriptions.findOne).toHaveBeenCalledWith({ where: { user_id: 'owner-1' } })
    })

    it("espace introuvable : l'abonnement du propriétaire du compte, en repli", async () => {
      const { service, subscriptions } = build({ workspace: null, subscription: { plan: 'starter' } })

      await expect(service.planForWorkspace('ws-x', 'solo-1')).resolves.toBe('starter')
      expect(subscriptions.findOne).toHaveBeenCalledWith({ where: { user_id: 'solo-1' } })
    })

    it('plan inconnu : null — jamais un palier deviné', async () => {
      const { service } = build({ workspace: { id: 'ws-1', owner_user_id: 'o' }, subscription: { plan: 'platinum' } })

      await expect(service.planForWorkspace('ws-1')).resolves.toBeNull()
    })
  })

  it('userHas répond sur la liste résolue', async () => {
    const { service } = build({
      workspace: { id: 'ws-1', owner_user_id: 'owner-1' },
      subscription: { plan: 'starter' },
      planFeatures: { starter: ['exports'] },
    })

    await expect(service.userHas('u-1', 'exports')).resolves.toBe(true)
    await expect(service.userHas('u-1', 'mcp_assistant')).resolves.toBe(false)
  })
})

// #4629.2 — la porte du chat et de Découvrir lit le MÊME verrou que le bandeau (`trial_expired`) : le palier fenêtré
// de l'OWNER dont la fenêtre est close. Une salle de démonstration n'est jamais verrouillée ; un payant non plus.
describe('#4629.2 — trialLockedForUser', () => {
  const past = new Date(Date.now() - 86_400_000)
  const future = new Date(Date.now() + 86_400_000)

  it('verrouille un essai terminé — propriétaire compris', async () => {
    const { service } = build({
      workspace: { id: 'ws-1', owner_user_id: 'owner-1' },
      subscription: { plan: 'trial', trial_end: past },
    })
    await expect(service.trialLockedForUser('owner-1')).resolves.toBe(true)
    await expect(service.trialLockedForUser('member-1')).resolves.toBe(true)
  })

  it('dit NON : fenêtre encore ouverte, palier payant, démo', async () => {
    await expect(
      build({
        workspace: { id: 'ws-1', owner_user_id: 'o' },
        subscription: { plan: 'trial', trial_end: future },
      }).service.trialLockedForUser('o'),
    ).resolves.toBe(false)
    await expect(
      build({
        workspace: { id: 'ws-1', owner_user_id: 'o' },
        subscription: { plan: 'growth', trial_end: past },
      }).service.trialLockedForUser('o'),
    ).resolves.toBe(false)
    await expect(
      build({
        workspace: { id: 'ws-1', owner_user_id: 'o', is_demo: true },
        subscription: { plan: 'trial', trial_end: past },
      }).service.trialLockedForUser('o'),
    ).resolves.toBe(false)
  })

  it('sans ligne d’abonnement lisible : ne ferme pas (jamais un verrou deviné)', async () => {
    const { service } = build({ workspace: { id: 'ws-1', owner_user_id: 'o' }, subscription: null })
    await expect(service.trialLockedForUser('o')).resolves.toBe(false)
  })
})
