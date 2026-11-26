import { EventEmitter } from 'node:events'
import { HttpException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { SHIPPED_PLAN_GRID } from '@bellum/contracts'
import type { Response } from 'express'
import type { PlanFeaturesService } from '../plan-features/plan-features.service'
import { IaProxyController } from './ia-proxy.controller'
import type { ChatContextService } from './chat-context.service'
import type { ChatMessagesService } from './chat-messages.service'
import type { ChatThreadDocumentsService } from './chat-thread-documents.service'
import type { DiscoverPortfolioService } from './discover-portfolio.service'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { ChatStreamEvent, IaClient } from '../ia/ia.client'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ToolRegistryService } from '../tool-registry/tool-registry.service'

/**
 * Plafond quotidien du copilote (décision Louis 31/07 — « gratuit mais borné »).
 *
 * Le copilote ne débite aucun crédit alors que chaque message est un appel
 * Claude : sans borne, un seul siège très actif suffit à manger la marge d'un
 * abonnement. On borne l'usage plutôt que de rendre payante la fonction qu'on
 * veut justement voir utilisée.
 *
 * `/ia/chat` diffuse en SSE (LOT STREAM, 12/09/2026) : `controller.chat`
 * prend un `@Res()` et ne rend plus l'enveloppe — `fakeRes()` en tient lieu,
 * et `ia.chatStream` remplace `ia.chat`, un flux à un seul événement `done`
 * reproduisant l'ancienne enveloppe bufferisée.
 */
function fakeRes(): Response {
  return { setHeader: jest.fn(), flushHeaders: jest.fn(), write: jest.fn(), end: jest.fn() } as unknown as Response
}

/**
 * #1953.19 — une réponse que le NAVIGATEUR coupe : il émet `close`, le
 * contrôleur avorte son `AbortController`. C'est un geste de la personne, pas
 * une panne technique — la distinction que ce faux `Response` permet de tester.
 */
function fakeResStoppedByBrowser(): Response {
  const emitter = new EventEmitter()
  let first = true
  return Object.assign(emitter, {
    writableEnded: false,
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    // La personne coupe PENDANT le flux : le `close` arrive après que le
    // contrôleur a posé son écouteur, comme dans un vrai navigateur.
    write: jest.fn(() => {
      if (first) {
        first = false
        emitter.emit('close')
      }
      return true
    }),
    end: jest.fn(),
  }) as unknown as Response
}

function chatStreamOf(envelope: { success?: boolean; data: Record<string, unknown> }) {
  return jest.fn().mockImplementation(async function* (): AsyncGenerator<ChatStreamEvent> {
    yield { type: 'done', success: envelope.success ?? false, data: envelope.data }
  })
}

describe('copilote — plafond quotidien par utilisateur', () => {
  function setup(
    opts: {
      limit?: number
      used?: number
      exempt?: number
      demo?: boolean
      envelope?: { success?: boolean; data: Record<string, unknown> }
      stamps?: Array<{ at: Date; exempt: boolean }> | null
      /** Le palier résolu pour l'espace — `growth` par défaut ; une `Error` = résolution en échec. */
      plan?: string | null | Error
    } = {},
  ) {
    const plan = opts.plan === undefined ? 'growth' : opts.plan
    const planFeatures = {
      planForUser: plan instanceof Error ? jest.fn().mockRejectedValue(plan) : jest.fn().mockResolvedValue(plan),
    } as unknown as PlanFeaturesService
    const chatMessages = {
      measureUserMessagesSince: jest.fn().mockResolvedValue({ total: opts.used ?? 0, exempt: opts.exempt ?? 0 }),
      userMessageStampsSince: jest.fn().mockResolvedValue(opts.stamps === undefined ? [] : opts.stamps),
      markPrecisionRequest: jest.fn().mockResolvedValue(true),
      // #1953.19 — la régularisation d'un tour qui n'a RIEN RENDU.
      releaseQuotaForUnrenderedTurn: jest.fn().mockResolvedValue(true),
      create: jest.fn().mockResolvedValue({}),
      listThread: jest.fn().mockResolvedValue([]),
    } as unknown as ChatMessagesService
    const ia = {
      chatStream: chatStreamOf(opts.envelope ?? { data: { reply: 'ok' } }),
    } as unknown as IaClient
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      extraPermissionsOf: jest.fn().mockResolvedValue([]),
      isDemoWorkspace: jest.fn().mockResolvedValue(opts.demo ?? false),
    } as unknown as WorkspaceContextService
    const chatContext = {
      build: jest.fn().mockResolvedValue({}),
      recordConversationTurn: jest.fn().mockResolvedValue(undefined),
    } as unknown as ChatContextService
    // #4016 L7 — `limit: undefined` POSÉ explicitement = aucune variable sur
    // l'hébergeur (le plafond opérateur est devenu optionnel, sans défaut).
    const operatorLimit = 'limit' in opts ? opts.limit : 50
    const config = { get: jest.fn().mockReturnValue(operatorLimit) } as unknown as ConfigService

    const controller = new IaProxyController(
      ia,
      chatMessages,
      workspaceContext,
      {} as EsnProfileReader,
      chatContext,
      {} as DiscoverPortfolioService,
      config,
      { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
      // #1954 — obligatoire : cette suite mesure le plafond, pas les documents du fil.
      { readableThread: jest.fn().mockResolvedValue(undefined) } as unknown as ChatThreadDocumentsService,
      undefined,
      undefined,
      undefined,
      undefined,
      // `brands` (#1960.20), `cards` (#1943 L3), puis `consultants` et
      // `openNeeds` (#1951.2) : les quatre précèdent `planFeatures` dans le
      // constructeur fusionné. Sans eux, le palier atterrissait dans
      // l'emplacement de la marque.
      undefined,
      undefined,
      undefined,
      undefined,
      planFeatures,
    )
    return { controller, ia, chatMessages, workspaceContext, planFeatures }
  }

  const user = { userId: 'user-1' } as never
  const dto = { message: 'salut', accountId: null, conversationId: null, history: [] } as never

  it('laisse passer sous le plafond', async () => {
    const { controller, ia } = setup({ limit: 50, used: 49 })

    await controller.chat(user, dto, fakeRes())

    expect(ia.chatStream).toHaveBeenCalled()
  })

  it('refuse AU plafond, sans appeler le modèle', async () => {
    const { controller, ia } = setup({ limit: 50, used: 50 })

    await expect(controller.chat(user, dto, fakeRes())).rejects.toBeInstanceOf(HttpException)
    expect(ia.chatStream).not.toHaveBeenCalled()
  })

  it('renvoie 429 avec le plafond en clair — pas une erreur muette', async () => {
    const { controller } = setup({ limit: 50, used: 60 })

    await expect(controller.chat(user, dto, fakeRes())).rejects.toMatchObject({ status: 429 })
    await expect(controller.chat(user, dto, fakeRes())).rejects.toThrow(/50/)
  })

  it('compte sur une fenêtre glissante de 24 h, pas depuis minuit', async () => {
    // Un plafond qui se réarme à minuit s'épuise d'un coup en fin de journée.
    const { controller, chatMessages } = setup({ limit: 50, used: 1 })

    await controller.chat(user, dto, fakeRes())

    const since = jest.mocked(chatMessages.measureUserMessagesSince).mock.calls[0]![1] as Date
    const elapsed = Date.now() - since.getTime()
    expect(elapsed).toBeGreaterThan(23 * 3600_000)
    expect(elapsed).toBeLessThan(25 * 3600_000)
  })

  it('exempte l’espace de démonstration (fil scripté, aucun appel modèle)', async () => {
    const { controller, ia, chatMessages } = setup({ limit: 1, used: 999, demo: true })

    // #1942.2 / #1942.12 — ce test disait « aucun appel modèle » dans son titre
    // et vérifiait l'INVERSE : que le flux partait. L'exemption de plafond était
    // juste, sa conséquence ne l'était pas — la bulle flottante de Laura, montée
    // sur tous les écrans, faisait donc partir un tour facturé et SANS BORNE
    // depuis la salle publique. Le tour est désormais refusé : la réponse de la
    // démonstration est préparée côté navigateur (`demo-turn.ts`).
    await expect(controller.chat(user, dto, fakeRes())).rejects.toMatchObject({ status: 400 })

    expect(ia.chatStream).not.toHaveBeenCalled()
    expect(chatMessages.measureUserMessagesSince).not.toHaveBeenCalled()
  })

  it('un plafond à 0 désactive la borne', async () => {
    const { controller, ia, chatMessages } = setup({ limit: 0, used: 10_000 })

    await controller.chat(user, dto, fakeRes())

    expect(ia.chatStream).toHaveBeenCalled()
    expect(chatMessages.measureUserMessagesSince).not.toHaveBeenCalled()
  })

  /**
   * Décision Louis 30/08/2026 — le plafond borne les DEMANDES, pas les
   * allers-retours que Laura provoque elle-même.
   */
  describe('les réponses aux questions de Laura ne comptent pas', () => {
    it('UN MESSAGE ORDINAIRE COMPTE TOUJOURS : sans saut, le refus tombe AU plafond', async () => {
      // Le test qui compte : une exonération qui déborde est le seul vrai
      // risque de ce mécanisme.
      const { controller, ia } = setup({ limit: 50, used: 50, exempt: 0 })

      await expect(controller.chat(user, dto, fakeRes())).rejects.toMatchObject({ status: 429 })
      expect(ia.chatStream).not.toHaveBeenCalled()
    })

    it('trois réponses à Laura reculent le refus de trois messages', async () => {
      const { controller, ia } = setup({ limit: 50, used: 52, exempt: 3 })

      await controller.chat(user, dto, fakeRes())

      expect(ia.chatStream).toHaveBeenCalled()
    })

    it("l'exonération est PLAFONNÉE : au-delà d'un tiers du plafond, tout recompte", async () => {
      // 50 → 17 sauts au plus. 100 messages dont 100 « exonérés » n'ouvrent pas
      // le plafond en grand : il en reste 83 comptés.
      const { controller, ia } = setup({ limit: 50, used: 100, exempt: 100 })

      await expect(controller.chat(user, dto, fakeRes())).rejects.toMatchObject({ status: 429 })
      expect(ia.chatStream).not.toHaveBeenCalled()
    })

    it('marque le tour à la SOURCE quand Laura a posé une carte de clarification', async () => {
      const envelope = {
        success: true,
        data: { reply: 'Sur quel département ?', context: { clarification: { question: 'Sur quel département ?' } } },
      }
      const { controller, chatMessages } = setup({ limit: 50, used: 1, envelope })

      await controller.chat(user, dto, fakeRes())

      expect(chatMessages.markPrecisionRequest).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', workspaceId: 'ws-1' }),
      )
    })

    it('ne marque RIEN quand Laura finit simplement par une proposition', async () => {
      // « Tu veux que je prépare le message ? » est une question, pas une
      // question de précision. Le marquage lit la carte, jamais le texte.
      const envelope = { success: true, data: { reply: 'Tu veux que je prépare le message ?', context: {} } }
      const { controller, chatMessages } = setup({ limit: 50, used: 1, envelope })

      await controller.chat(user, dto, fakeRes())

      expect(chatMessages.markPrecisionRequest).not.toHaveBeenCalled()
    })

    it('un marquage impossible ne fait pas échouer le tour — il fait payer le message', async () => {
      const envelope = {
        success: true,
        data: { reply: 'Quel territoire ?', context: { clarification: { question: 'Quel territoire ?' } } },
      }
      const { controller, chatMessages, ia } = setup({ limit: 50, used: 1, envelope })
      jest.mocked(chatMessages.markPrecisionRequest).mockRejectedValueOnce(new Error('db down'))

      await expect(controller.chat(user, dto, fakeRes())).resolves.toBeUndefined()
      expect(ia.chatStream).toHaveBeenCalled()
    })

    it("un comptage ILLISIBLE n'est pas « zéro message consommé »", async () => {
      const { controller, ia, chatMessages } = setup({ limit: 50 })
      jest.mocked(chatMessages.measureUserMessagesSince).mockResolvedValueOnce({ total: Number.NaN, exempt: 0 })

      await expect(controller.chat(user, dto, fakeRes())).rejects.toThrow(/comptage impossible/i)
      expect(ia.chatStream).not.toHaveBeenCalled()
    })
  })

  /**
   * #1957.8 → .10 — le refus dit QUAND le plafond se rouvre, en DONNÉE (le
   * navigateur formate l'heure dans son fuseau), ce qui reste utilisable, et
   * d'où vient le plafond (le plan, ou le plafond de sécurité de l'opérateur).
   */
  describe('#1957.8 — le refus dit quand le plafond se rouvre', () => {
    const H = 3600_000
    // #décision Louis 15/09/2026 — Growth (100) > le défaut opérateur (50) : au-delà de
    // ce bloc, `limit: 50` reste le plafond OPÉRATEUR, pas la valeur du plan Growth.
    const GROWTH = SHIPPED_PLAN_GRID.growth.chatDailyMessageLimit

    async function refusalOf(controller: IaProxyController): Promise<HttpException> {
      const error = await controller.chat(user, dto, fakeRes()).then(
        () => null,
        (caught: unknown) => caught,
      )
      expect(error).toBeInstanceOf(HttpException)
      return error as HttpException
    }

    it('porte le code, le plafond et l’instant calculé sur la fenêtre glissante réelle', async () => {
      const now = Date.now()
      const oldest = new Date(now - 23 * H)
      const stamps = [oldest, ...Array.from({ length: 49 }, (_, i) => new Date(now - (22 - i * 0.1) * H))].map(at => ({
        at,
        exempt: false,
      }))
      const { controller } = setup({ limit: 50, used: 50, stamps })

      const refusal = await refusalOf(controller)

      expect(refusal.getStatus()).toBe(429)
      expect(refusal.getResponse()).toMatchObject({
        statusCode: 429,
        code: 'chat_quota_reached',
        limit: 50,
        reopensAt: new Date(oldest.getTime() + 24 * H).toISOString(),
      })
    })

    it('un instant incalculable vaut null — et le refus tombe quand même', async () => {
      const { controller, chatMessages } = setup({ limit: 50, used: 50 })
      jest.mocked(chatMessages.userMessageStampsSince).mockRejectedValueOnce(new Error('db down'))

      const refusal = await refusalOf(controller)

      expect(refusal.getResponse()).toMatchObject({ code: 'chat_quota_reached', limit: 50, reopensAt: null })
    })

    it('le texte nomme ce qui reste utilisable et dit que le plafond est celui du plan', async () => {
      // Opérateur large : c'est le plafond du plan (Growth) qui doit tomber ici.
      const { controller } = setup({ limit: 500, used: GROWTH })

      const refusal = await refusalOf(controller)

      expect(refusal.message).toMatch(/recherche/)
      expect(refusal.message).toMatch(/actions déjà préparées/)
      expect(refusal.message).toMatch(/plafond de ton plan/)
      expect(refusal.message).not.toMatch(/même sur tous les plans/)
    })
  })

  // décision Louis 13/09 batch 13 — plafond selon le plan
  describe('le plafond dépend du plan de l’espace', () => {
    const GROWTH = SHIPPED_PLAN_GRID.growth.chatDailyMessageLimit

    it('le plafond effectif est celui du plan, lu dans la grille des plans', async () => {
      const { controller, planFeatures } = setup({ limit: 10_000, used: 1, plan: 'growth' })

      await expect(controller.chatQuota(user)).resolves.toMatchObject({
        state: 'measured',
        limit: GROWTH,
        limitSource: 'plan',
      })
      expect(planFeatures.planForUser).toHaveBeenCalledWith('user-1')
    })

    it('le refus tombe AU plafond du plan, et le dit', async () => {
      const { controller, ia } = setup({ limit: 10_000, used: GROWTH, plan: 'growth' })

      await expect(controller.chat(user, dto, fakeRes())).rejects.toMatchObject({
        status: 429,
        response: expect.objectContaining({ limit: GROWTH, limitSource: 'plan' }),
      })
      expect(ia.chatStream).not.toHaveBeenCalled()
    })

    it('le plafond opérateur borne le plan : le minimum des deux', async () => {
      const operator = GROWTH - 20
      const { controller } = setup({ limit: operator, used: operator, plan: 'growth' })

      await expect(controller.chatQuota(user)).resolves.toMatchObject({
        limit: operator,
        remaining: 0,
        limitSource: 'operator',
      })
      const refusal = await controller.chat(user, dto, fakeRes()).then(
        () => null,
        (caught: unknown) => caught as HttpException,
      )
      expect(refusal?.getResponse()).toMatchObject({ limit: operator, limitSource: 'operator' })
      // Un plafond de sécurité n'est pas « celui de ton plan » : la phrase ne le prétend pas.
      expect(refusal?.message).not.toMatch(/plan/)
    })

    it.each([
      ['plan inconnu', 'platinum'],
      ['aucun abonnement', null],
      ['résolution en échec', new Error('db down')],
    ])('%s : le plafond opérateur — jamais 0, jamais l’illimité', async (_label, plan) => {
      const operator = 37
      const { controller, ia } = setup({ limit: operator, used: operator, plan })

      await expect(controller.chatQuota(user)).resolves.toMatchObject({
        state: 'measured',
        limit: operator,
        remaining: 0,
        limitSource: 'operator',
      })
      await expect(controller.chat(user, dto, fakeRes())).rejects.toMatchObject({ status: 429 })
      expect(ia.chatStream).not.toHaveBeenCalled()
    })

    // ⚠️ #4016 L7 — décision Louis 11/10/2026 : LE PLAN FAIT FOI. Sans
    // `CHAT_DAILY_MESSAGE_LIMIT` posé, plus aucun défaut 50 ne bride le plan.
    describe('#4016 L7 — sans plafond opérateur posé, le plan fait foi', () => {
      it('Growth obtient SA valeur (100), plus les 50 du défaut d’avant', async () => {
        const { controller } = setup({ limit: undefined, used: 60, plan: 'growth' })

        await expect(controller.chatQuota(user)).resolves.toMatchObject({
          state: 'measured',
          limit: GROWTH,
          remaining: GROWTH - 60,
          limitSource: 'plan',
        })
      })

      it('SAIT DIRE NON : le plan dépassé refuse, sans appeler le modèle, et dit que c’est le plan', async () => {
        const { controller, ia } = setup({ limit: undefined, used: GROWTH, plan: 'growth' })

        const refusal = await controller.chat(user, dto, fakeRes()).then(
          () => null,
          (caught: unknown) => caught as HttpException,
        )
        expect(refusal?.getStatus()).toBe(429)
        expect(refusal?.getResponse()).toMatchObject({ limit: GROWTH, limitSource: 'plan' })
        expect(refusal?.message).toMatch(/plafond de ton plan/)
        expect(ia.chatStream).not.toHaveBeenCalled()
      })

      it.each([
        ['plan inconnu', 'platinum'],
        ['aucun abonnement', null],
        ['résolution en échec', new Error('db down')],
      ])('%s ET aucun opérateur : le plus bas de la grille — jamais l’illimité', async (_label, plan) => {
        const lowest = Math.min(...Object.values(SHIPPED_PLAN_GRID).map(row => row.chatDailyMessageLimit))
        const { controller, ia } = setup({ limit: undefined, used: lowest, plan })

        await expect(controller.chatQuota(user)).resolves.toMatchObject({
          state: 'measured',
          limit: lowest,
          remaining: 0,
          limitSource: 'operator',
        })
        await expect(controller.chat(user, dto, fakeRes())).rejects.toMatchObject({ status: 429 })
        expect(ia.chatStream).not.toHaveBeenCalled()
      })
    })

    it('la salle de démonstration est inchangée : aucun plafond, aucun plan lu', async () => {
      const { controller, ia, chatMessages, planFeatures } = setup({ limit: 1, used: 999, demo: true, plan: 'growth' })

      await expect(controller.chatQuota(user)).resolves.toEqual({ state: 'unbounded' })
      // #1942.2 / #1942.12 — « aucun plafond » ne veut pas dire « le tour part » :
      // en démonstration il est refusé avant le plafond ET avant le plan.
      await expect(controller.chat(user, dto, fakeRes())).rejects.toMatchObject({ status: 400 })

      expect(ia.chatStream).not.toHaveBeenCalled()
      expect(chatMessages.measureUserMessagesSince).not.toHaveBeenCalled()
      expect(planFeatures.planForUser).not.toHaveBeenCalled()
    })
  })

  describe('#1957.5 — GET /ia/chat/quota', () => {
    const H = 3600_000

    it('mesuré : ce qui reste, et « peu » dès 80 % consommés', async () => {
      const { controller } = setup({ limit: 50, used: 40 })

      await expect(controller.chatQuota(user)).resolves.toEqual({
        state: 'measured',
        limit: 50,
        remaining: 10,
        low: true,
        reopensAt: null,
        // #décision Louis 15/09/2026 — Growth (100) dépasse l'opérateur (50) : c'est
        // l'opérateur qui borne ici, pas le plan.
        limitSource: 'operator',
      })
    })

    it('sous le seuil, pas « peu »', async () => {
      const { controller } = setup({ limit: 50, used: 39 })

      await expect(controller.chatQuota(user)).resolves.toMatchObject({ remaining: 11, low: false })
    })

    it('au plafond : zéro restant, et l’instant de réouverture', async () => {
      const oldest = new Date(Date.now() - 23 * H)
      const stamps = Array.from({ length: 50 }, (_, i) => ({
        at: new Date(oldest.getTime() + i * 1000),
        exempt: false,
      }))
      const { controller } = setup({ limit: 50, used: 50, stamps })

      await expect(controller.chatQuota(user)).resolves.toEqual({
        state: 'measured',
        limit: 50,
        remaining: 0,
        low: true,
        reopensAt: new Date(oldest.getTime() + 24 * H).toISOString(),
        // #décision Louis 15/09/2026 — Growth (100) dépasse l'opérateur (50) : c'est
        // l'opérateur qui borne ici, pas le plan.
        limitSource: 'operator',
      })
    })

    it('compte les réponses exonérées comme le refus les compte', async () => {
      const { controller } = setup({ limit: 50, used: 52, exempt: 3 })

      await expect(controller.chatQuota(user)).resolves.toMatchObject({ remaining: 1 })
    })

    it('lit le compteur de CET utilisateur, jamais celui de l’espace', async () => {
      const { controller, chatMessages } = setup({ limit: 50, used: 1 })

      await controller.chatQuota(user)

      expect(chatMessages.measureUserMessagesSince).toHaveBeenCalledWith('user-1', expect.any(Date))
    })

    it('plafond désactivé : aucun chiffre', async () => {
      const { controller, chatMessages } = setup({ limit: 0, used: 10_000 })

      await expect(controller.chatQuota(user)).resolves.toEqual({ state: 'unbounded' })
      expect(chatMessages.measureUserMessagesSince).not.toHaveBeenCalled()
    })

    it('espace de démonstration : aucun chiffre (aucun appel de modèle, aucun plafond)', async () => {
      const { controller, chatMessages } = setup({ limit: 1, used: 999, demo: true })

      await expect(controller.chatQuota(user)).resolves.toEqual({ state: 'unbounded' })
      expect(chatMessages.measureUserMessagesSince).not.toHaveBeenCalled()
    })

    it('un comptage illisible rend « non mesuré », jamais « 0 restant »', async () => {
      const { controller, chatMessages } = setup({ limit: 50 })
      jest.mocked(chatMessages.measureUserMessagesSince).mockResolvedValueOnce({ total: Number.NaN, exempt: 0 })

      await expect(controller.chatQuota(user)).resolves.toEqual({ state: 'unmeasured' })
    })
  })

  /**
   * #1953.19 — AUCUN DOUBLE DÉBIT SUR UN RETRY TECHNIQUE — tranché Louis
   * 16/09/2026 : « non facturé si le modèle n'a rien rendu ».
   *
   * ─────────────────────────────────────────────────────────────────────────────
   * CE QUI EST « FACTURÉ » DANS UN TOUR DE CHAT
   * ─────────────────────────────────────────────────────────────────────────────
   * Aucun crédit. Un tour de copilote ne débite RIEN au registre
   * (`credit_ledger`) et ne pose AUCUNE réservation (`credit_reservations`) —
   * `chat-stop.simulation.spec.ts` le mesure déjà (« 0 réservation »). Ce que le
   * tour consomme, c'est UNE DEMANDE du plafond quotidien : « le plafond borne les
   * DEMANDES » (décision Louis 30/08). C'est donc là, et nulle part ailleurs, que
   * « facturé deux fois » peut arriver — un flux qui casse, la personne relance,
   * et sa fenêtre de 24 h a payé deux fois pour une seule réponse reçue.
   *
   * ─────────────────────────────────────────────────────────────────────────────
   * LA FRONTIÈRE, QUI EST CELLE DÉJÀ TRANCHÉE POUR LES TIMEOUTS
   * ─────────────────────────────────────────────────────────────────────────────
   * La requête a-t-elle pu RENDRE quelque chose ? Rien rendu (coupure, 5xx, tour
   * avorté, connexion jamais établie, flux sans événement terminal) : rejouable
   * sans débit. Réponse rendue puis la personne relance : nouvelle demande,
   * comptée. Un ARRÊT demandé par la personne n'est pas une panne technique — il
   * reste compté, sinon le plafond s'évapore d'un clic.
   */
  describe('#1953.19 — un tour qui n’a rien rendu ne compte pas contre le plafond', () => {
    it('un flux qui casse sans réponse : la demande est régularisée', async () => {
      const { controller, chatMessages } = setup({
        limit: 50,
        used: 10,
        envelope: { success: false, data: { reply: '' } },
      })

      await controller.chat(user, dto, fakeRes())

      expect(chatMessages.releaseQuotaForUnrenderedTurn).toHaveBeenCalledTimes(1)
    })

    it('TÉMOIN — un tour qui a RENDU une réponse compte : rien n’est régularisé', async () => {
      const { controller, chatMessages } = setup({
        limit: 50,
        used: 10,
        envelope: { success: true, data: { reply: 'Voici les trois comptes.' } },
      })

      await controller.chat(user, dto, fakeRes())

      expect(chatMessages.releaseQuotaForUnrenderedTurn).not.toHaveBeenCalled()
    })

    it('TÉMOIN — un ARRÊT demandé par la personne n’est pas une panne : la demande reste comptée', async () => {
      // Sans cette garde, le bouton « stop » viderait le plafond de son sens :
      // couper chaque réponse rendrait toutes les demandes gratuites.
      const { controller, chatMessages } = setup({
        limit: 50,
        used: 10,
        envelope: { success: false, data: { reply: '' } },
      })
      await controller.chat(user, dto, fakeResStoppedByBrowser())

      expect(chatMessages.releaseQuotaForUnrenderedTurn).not.toHaveBeenCalled()
    })

    it('TÉMOIN — une enveloppe en succès mais SANS texte n’a rien rendu non plus', async () => {
      const { controller, chatMessages } = setup({
        limit: 50,
        used: 10,
        envelope: { success: true, data: { reply: '   ' } },
      })

      await controller.chat(user, dto, fakeRes())

      expect(chatMessages.releaseQuotaForUnrenderedTurn).toHaveBeenCalledTimes(1)
    })
  })
})
