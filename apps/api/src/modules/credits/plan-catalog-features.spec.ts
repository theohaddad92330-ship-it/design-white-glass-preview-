import type { QueryRunner } from 'typeorm'
import { ALL_PLAN_FEATURES } from '@bellum/contracts'
import { PlanFeatures1788251437886 } from '../../migrations/1788251437886-PlanFeatures'
import { PLAN_CATALOG_DEFAULTS, PLAN_KEYS } from './plan-catalog.defaults'
import { PlanCatalogService } from './plan-catalog.service'

type Row = Record<string, unknown>

function service(rows: Row[]) {
  const repo = { find: jest.fn().mockResolvedValue(rows), upsert: jest.fn() }
  return { svc: new PlanCatalogService(repo as never), repo }
}

const BASE_ROW = {
  key: 'starter',
  label: 'Starter-Solo',
  price_cents: 11900,
  accounts_limit: 35,
  enrichment_credits: 0,
  seats: 1,
  extra_seat_price_cents: 2900,
  self_serve: true,
  sort_order: 1,
}

describe('catalogue de plans — features par palier', () => {
  it('applique la grille commerciale, cumulative de palier en palier', () => {
    // Louis 26/07. Cumulative : un palier porte tout ce que porte le précédent —
    // sinon un client devrait DESCENDRE d'offre pour garder une fonction.
    // Le CRM et l'ATS natifs sont OUVERTS dès le palier d'entrée (Louis 16/08) :
    // ce sont les objets de base du travail — un compte, un projet, une fiche —
    // et un palier payant qui n'y donnerait pas accès ne vaudrait rien. La clé
    // existe pour que la grille puisse se resserrer depuis le backoffice sans
    // redéploiement, pas pour fermer la porte au lancement.
    expect(PLAN_CATALOG_DEFAULTS.starter.features).toEqual(['exports', 'crm_native', 'ats_native', 'rfp'])
    // ENTREPRISE-TOUT #4381 — « Entreprise (sur devis) » = `team` ouvre TOUTES les
    // fonctions : Louis y a passé tous les utilisateurs pour tout leur ouvrir.
    expect(PLAN_CATALOG_DEFAULTS.team.features).toEqual([...ALL_PLAN_FEATURES])
    expect(PLAN_CATALOG_DEFAULTS.team.features).toContain('talent_pool')
    // Growth = tout : c'est le haut de la grille, il n'y a rien au-dessus à vendre.
    expect(PLAN_CATALOG_DEFAULTS.growth.features).toEqual([...ALL_PLAN_FEATURES])
    for (const [lower, upper] of [['starter', 'team'] as const, ['team', 'growth'] as const]) {
      for (const feature of PLAN_CATALOG_DEFAULTS[lower].features) {
        expect(PLAN_CATALOG_DEFAULTS[upper].features).toContain(feature)
      }
    }
  })

  it('ouvre TOUT sur les paliers qui ne se vendent pas (ils montrent le produit)', () => {
    // Un essai qui cache le copilote ne convertit personne : ces paliers sont
    // bornés par leur quota et leur fenêtre, pas par leurs fonctions.
    for (const key of ['trial', 'beta', 'decouverte'] as const) {
      expect(PLAN_CATALOG_DEFAULTS[key].features).toEqual([...ALL_PLAN_FEATURES])
      expect(PLAN_CATALOG_DEFAULTS[key].self_serve).toBe(false)
    }
  })

  it('ne laisse aucun palier sans grille explicite', () => {
    for (const key of PLAN_KEYS) {
      expect(PLAN_CATALOG_DEFAULTS[key].features.length).toBeGreaterThan(0)
    }
  })

  it('une ligne écrite avant la colonne retombe sur le défaut du palier, pas sur le vide', async () => {
    // Base non encore migrée : on lit la grille du code, pas une grille vide qui
    // fermerait tout à un abonné payant.
    const { svc } = service([{ ...BASE_ROW }])
    await svc.refresh()
    expect((await svc.getOrDefault('starter')).features).toEqual([...PLAN_CATALOG_DEFAULTS.starter.features])
  })

  it('respecte une liste VIDE posée par un opérateur (c’est une décision)', async () => {
    const { svc } = service([{ ...BASE_ROW, features: [] }])
    await svc.refresh()
    expect((await svc.getOrDefault('starter')).features).toEqual([])
  })

  it('jette les clés inconnues au lieu de créer une feature fantôme', async () => {
    const { svc } = service([{ ...BASE_ROW, features: ['chat_ai', 'teleportation'] }])
    await svc.refresh()
    expect((await svc.getOrDefault('starter')).features).toEqual(['chat_ai'])
  })

  it('survit à une valeur illisible en base', async () => {
    const { svc } = service([{ ...BASE_ROW, features: 'chat_ai' }])
    await svc.refresh()
    // Ni exception ni feature accordée à partir d'une chaîne : on retombe sur le
    // défaut du palier, comme pour une colonne absente.
    expect((await svc.getOrDefault('starter')).features).toEqual([...PLAN_CATALOG_DEFAULTS.starter.features])
  })

  it('un plan modifié ne contamine pas les défauts figés', async () => {
    const { svc } = service([{ ...BASE_ROW, features: ['chat_ai'] }])
    await svc.refresh()
    expect((await svc.getOrDefault('starter')).features).toEqual(['chat_ai'])
    expect(PLAN_CATALOG_DEFAULTS.starter.features).toEqual(['exports', 'crm_native', 'ats_native', 'rfp'])
  })

  describe("l'édition opérateur", () => {
    it('normalise la liste reçue et la persiste', async () => {
      const { svc, repo } = service([{ ...BASE_ROW, features: [...ALL_PLAN_FEATURES] }])
      await svc.refresh()
      await svc.update('starter', { features: ['exports', 'inconnue'] as never })
      expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({ features: ['exports'] }), ['key'])
    })

    it('laisse les features intactes quand le patch ne les mentionne pas', async () => {
      const { svc, repo } = service([{ ...BASE_ROW, features: ['chat_ai'] }])
      await svc.refresh()
      await svc.update('starter', { price: 12900 })
      expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({ features: ['chat_ai'] }), ['key'])
    })
  })

  describe('migration', () => {
    async function run(virgin: boolean): Promise<{ sql: string; params?: unknown[] }[]> {
      const calls: { sql: string; params?: unknown[] }[] = []
      const queryRunner = {
        query: jest.fn(async (sql: string, params?: unknown[]) => {
          calls.push({ sql, params })
          return sql.includes('AS virgin') ? [{ virgin }] : []
        }),
      } as unknown as QueryRunner
      await new PlanFeatures1788251437886().up(queryRunner)
      return calls
    }

    it('ajoute la colonne puis seede la grille de CHAQUE palier', async () => {
      const calls = await run(true)
      expect(calls[0]!.sql).toContain('ADD COLUMN IF NOT EXISTS features')
      // Le seed vient des défauts du code : la base et le code ne peuvent pas
      // porter deux grilles différentes.
      const seeded = Object.fromEntries(
        calls
          .filter(call => call.sql.includes('UPDATE plan_definitions'))
          .map(call => [call.params![1], call.params![0]]),
      )
      expect(seeded).toEqual(
        Object.fromEntries(PLAN_KEYS.map(key => [key, JSON.stringify(PLAN_CATALOG_DEFAULTS[key].features)])),
      )
    })

    it('ne ré-ouvre pas une grille déjà posée par un opérateur', async () => {
      const calls = await run(false)
      // Une seule lecture, aucune écriture : la grille du backoffice est plus
      // récente que celle du code, elle gagne.
      expect(calls.filter(call => call.sql.includes('UPDATE plan_definitions'))).toEqual([])
    })
  })
})
