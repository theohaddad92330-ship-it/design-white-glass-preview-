import { creditCostOf } from '@bellum/contracts'
/**
 * mcp-api.controller.spec.ts — the ACTION tools (Drive #7) + MCP v2 guardrails:
 *  - `prepare_email` (ex-`send_email`, #2375.10) → delegates to
 *    ContactsService.prepareEmail : resolves the SAME draft `deliverDraft`
 *    would send, but never dispatches it and never stamps `email_sent_at`.
 *    DÉCISION LOUIS 21/09/2026 (doctrine c82) : MCP prépare, il n'envoie pas.
 *    The old route name (`POST contacts/:id/send-email`) is kept for
 *    compatibility and now behaves IDENTICALLY.
 *  - `log_to_crm`  → resolves the OWNED contact, maps it, upserts to the CRM.
 *  - `start_analysis` / `enrich_contact` → CREDIT HANDSHAKE : sans confirm =
 *    devis (rien de lancé), solde 0 = 402, confirm: true = exécution réelle.
 *  - `ask_bellum` → Q&A sourcée dossier via le contexte Copilote + IA chat.
 *  - `create_action` → item manuel du plan, compte + contact vérifiés d'abord.
 * Plus the scope-wiring invariant: action routes require `mcp:act`, paying
 * routes require `mcp:analysis`, reads stay unscoped — so a lesser token can
 * never reach them (the guard enforces it).
 */
import { BadGatewayException, BadRequestException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common'
import { failure, success } from '@bellum/utils'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { AccountsService } from '../accounts/accounts.service'
import type { ActionPlanItemsService } from '../actions/action-plan-items.service'
import type { AnalysisService } from '../analysis/analysis.service'
import type { ContactsService } from '../contacts/contacts.service'
import type { CreditsService } from '../credits/credits.service'
import type { CrmService } from '../crm/crm.service'
import type { ReplyFeedbackService } from '../account-feedback/reply-feedback.service'
import type { ChatContextService } from '../ia-proxy/chat-context.service'
import type { IaClient } from '../ia/ia.client'
import type { WorkspaceBrandService } from '../workspace/workspace-brand.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { McpApiController } from './mcp-api.controller'
import type { McpStartAnalysisDto } from './dto/mcp-tools.dto'
import { MCP_SCOPE_KEY } from './mcp-scope.guard'

const user = { userId: 'user-1', email: 'rep@esn.fr' } as CurrentUserPayload

/** A healthy paid balance — the default the quote tests start from. */
const CREDITS_OK = {
  plan: 'team',
  accounts_limit: 20,
  accounts_used: 5,
  enrichment_credits: 40,
  trial_expired: false,
}

function build(opts: { replyFeedback?: { memoryFor: jest.Mock } } = {}) {
  const accounts = {
    findOne: jest.fn(),
    findOneForWorkspace: jest.fn(),
  }
  const contacts = {
    prepareEmail: jest.fn(),
    findOwnedForAction: jest.fn(),
    enrichContact: jest.fn(),
  }
  const analysis = {
    start: jest.fn(),
  }
  const credits = {
    getCredits: jest.fn().mockResolvedValue(CREDITS_OK),
  }
  const planItems = {
    createManual: jest.fn(),
  }
  const crm = {
    exportContact: jest.fn(),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }),
  }
  const chatContext = {
    build: jest.fn().mockResolvedValue({
      accountData: { company_name: 'Acme' },
      contactsSummary: 'contacts',
      planSummary: 'plan',
      accountsSummary: null,
      profileData: { esn_name: 'MonESN' },
      pinnedFacts: [],
      userPreferences: {},
      conversationSummary: null,
      crmConnected: false,
      crmProvider: null,
      crmPresence: null,
      accountFeedback: null,
    }),
  }
  const ia = {
    chat: jest.fn().mockResolvedValue({ success: true, data: { reply: 'Voici l’angle.' } }),
  }
  const controller = new McpApiController(
    accounts as unknown as AccountsService,
    contacts as unknown as ContactsService,
    analysis as unknown as AnalysisService,
    credits as unknown as CreditsService,
    planItems as unknown as ActionPlanItemsService,
    crm as unknown as CrmService,
    workspaceContext as unknown as WorkspaceContextService,
    chatContext as unknown as ChatContextService,
    ia as unknown as IaClient,
    // #1960.20 — `brands`, optionnel : absent = marque du produit.
    undefined,
    // #1916.24 — `replyMemoryUses`, intercalé ici par la fusion du 13/09 :
    // absent, `ask_bellum` répond sans trace de mémoire.
    undefined,
    // #1919.15 — optionnel et EN DERNIER : absent, `ask_bellum` part sans ce bloc.
    opts.replyFeedback as unknown as ReplyFeedbackService | undefined,
    // Le cloisonnement de périmètre (revue sécurité 15/09/2026) : MCP est une
    // surface PAR PERSONNE, donc elle porte le même périmètre que l'écran.
    // `null` = tout l'espace, le niveau d'accès historique.
    { scopeFor: jest.fn().mockResolvedValue(null) } as never,
  )
  return { controller, accounts, contacts, analysis, credits, planItems, crm, workspaceContext, chatContext, ia }
}

describe('McpApiController — action tools (mcp:act)', () => {
  // #2375.10 — MCP prépare, l'envoi reste un geste humain.
  describe('prepare_email → prepareContactEmail (does NOT send)', () => {
    it('delegates to ContactsService.prepareEmail(id, userId) — never sendEmail — and returns only the identifier', async () => {
      const { controller, contacts } = build()
      const prepared = { contact_id: 'c1' }
      contacts.prepareEmail.mockResolvedValueOnce(success(prepared))

      const result = await controller.prepareContactEmail('c1', user)

      expect(contacts.prepareEmail).toHaveBeenCalledWith('c1', 'user-1')
      expect(result).toEqual(prepared)
      // La réponse ne porte NI destinataire NI corps — un identifiant, rien de plus.
      expect(Object.keys(result)).toEqual(['contact_id'])
    })

    it('maps a contact failure to the matching HTTP status (already_sent → 409)', async () => {
      const { controller, contacts } = build()
      contacts.prepareEmail.mockResolvedValueOnce(failure({ code: 'already_sent', message: 'déjà envoyé' }))
      const error = await controller.prepareContactEmail('c1', user).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(HttpException)
      expect((error as HttpException).getStatus()).toBe(HttpStatus.CONFLICT)
    })
  })

  // #2375.10 — compatibilité : l'ancien nom répond désormais EXACTEMENT comme
  // `prepare-email` (même méthode de service, même absence d'envoi).
  describe('send_email → sendContactEmail (COMPAT — prepares, does not send)', () => {
    it('delegates to ContactsService.prepareEmail(id, userId), NOT sendEmail', async () => {
      const { controller, contacts } = build()
      const prepared = { contact_id: 'c1' }
      contacts.prepareEmail.mockResolvedValueOnce(success(prepared))

      const result = await controller.sendContactEmail('c1', user)

      expect(contacts.prepareEmail).toHaveBeenCalledWith('c1', 'user-1')
      expect(result).toEqual(prepared)
    })
  })

  describe('log_to_crm → logContactToCrm', () => {
    const contact = {
      id: 'c1',
      user_id: 'user-1',
      full_name: 'Jean Dupont',
      title: 'DSI',
      entity: 'Acme Group',
      email: 'jean@corp.fr',
      phone: '0102030405',
      linkedin_url: 'https://linkedin.com/in/jd',
    } as ContactEntity

    it('resolves the OWNED contact then upserts the mapped input to the CRM', async () => {
      const { controller, contacts, crm } = build()
      contacts.findOwnedForAction.mockResolvedValueOnce(success(contact))
      crm.exportContact.mockResolvedValueOnce({ id: 'hs-42' })

      const result = await controller.logContactToCrm('c1', user)

      expect(contacts.findOwnedForAction).toHaveBeenCalledWith('c1', 'user-1')
      expect(crm.exportContact).toHaveBeenCalledWith(
        'user-1',
        {
          email: 'jean@corp.fr',
          firstName: 'Jean',
          lastName: 'Dupont',
          company: 'Acme Group',
          jobTitle: 'DSI',
          phone: '0102030405',
          linkedinUrl: 'https://linkedin.com/in/jd',
        },
        // #2855 — un client MCP externe compose la demande, jamais un clic
        // direct dans l'app : la provenance le nomme.
        { origin: 'user', source: { kind: 'mcp' } },
      )
      expect(result).toEqual({ id: 'hs-42' })
    })

    it('refuses (404) and never touches the CRM when the contact is not owned', async () => {
      const { controller, contacts, crm } = build()
      contacts.findOwnedForAction.mockResolvedValueOnce(failure({ code: 'not_found', message: 'introuvable' }))

      await expect(controller.logContactToCrm('c1', user)).rejects.toBeInstanceOf(NotFoundException)
      expect(crm.exportContact).not.toHaveBeenCalled()
    })
  })

  describe('start_analysis — credit handshake (Q9)', () => {
    const dto = { company_name: 'Acme' } as McpStartAnalysisDto

    it('SANS confirm → returns the quote (cost, balance, duration) and launches NOTHING', async () => {
      const { controller, analysis } = build()
      const result = await controller.startAnalysis(dto, user)
      expect(analysis.start).not.toHaveBeenCalled()
      expect(result).toMatchObject({
        requires_confirmation: true,
        action: 'start_analysis',
        company_name: 'Acme',
        // ⚠️ Le prix vient du CONTRAT. Ce test figeait « 1 » pendant qu'une
        // analyse en débite huit : il gardait le mensonge au lieu de la règle.
        cost: { credits: creditCostOf('account_analysis'), kind: 'analysis' },
        balance: { analyses_remaining: 15, analyses_used: 5, analyses_limit: 20 },
      })
      // Et il ne vaut PAS 1 — sans cette ligne, le test resterait vert si le
      // contrat retombait par accident sur l'ancienne valeur.
      expect(creditCostOf('account_analysis')).toBeGreaterThan(1)
      expect((result as { estimated_duration: string }).estimated_duration).toContain('3-6')
    })

    it('confirm: false is a quote too (only an explicit true launches)', async () => {
      const { controller, analysis } = build()
      const result = await controller.startAnalysis({ ...dto, confirm: false } as McpStartAnalysisDto, user)
      expect(analysis.start).not.toHaveBeenCalled()
      expect(result).toMatchObject({ requires_confirmation: true })
    })

    it('AVEC confirm: true → delegates to AnalysisService.start and returns its output', async () => {
      const { controller, analysis } = build()
      analysis.start.mockResolvedValueOnce(success({ jobId: 'j1', accountId: 'a1' }))
      const confirmed = { ...dto, confirm: true } as McpStartAnalysisDto
      const result = await controller.startAnalysis(confirmed, user)
      expect(analysis.start).toHaveBeenCalledWith(confirmed, 'user-1')
      expect(result).toEqual({ jobId: 'j1', accountId: 'a1' })
    })

    it('solde 0 → 402 PAYMENT_REQUIRED on the quote, nothing launched', async () => {
      const { controller, analysis, credits } = build()
      credits.getCredits.mockResolvedValueOnce({ ...CREDITS_OK, accounts_used: 20 })
      const error = await controller.startAnalysis(dto, user).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(HttpException)
      expect((error as HttpException).getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED)
      expect(analysis.start).not.toHaveBeenCalled()
    })

    it('essai expiré → 402 même avec du quota restant', async () => {
      const { controller, credits } = build()
      credits.getCredits.mockResolvedValueOnce({ ...CREDITS_OK, trial_expired: true })
      const error = await controller.startAnalysis(dto, user).catch((e: unknown) => e)
      expect((error as HttpException).getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED)
    })
  })

  describe('enrich_contact — same credit handshake, paying (mcp:analysis)', () => {
    const owned = {
      id: 'c1',
      user_id: 'user-1',
      account_id: 'acc-1',
      full_name: 'Jean Dupont',
      entity: 'Acme Group',
      linkedin_url: null,
    } as unknown as ContactEntity

    it('SANS confirm → quote (cost + enrichment balance), no provider call', async () => {
      const { controller, contacts } = build()
      contacts.findOwnedForAction.mockResolvedValueOnce(success(owned))
      const result = await controller.enrichContact('c1', {}, user)
      expect(contacts.enrichContact).not.toHaveBeenCalled()
      expect(result).toMatchObject({
        requires_confirmation: true,
        action: 'enrich_contact',
        contact: { id: 'c1', full_name: 'Jean Dupont' },
        cost: { credits: 1, kind: 'enrichment' },
        balance: { enrichment_credits_remaining: 40 },
      })
    })

    it('solde d’enrichissement 0 → 402 on the quote, no provider call', async () => {
      const { controller, contacts, credits } = build()
      contacts.findOwnedForAction.mockResolvedValueOnce(success(owned))
      credits.getCredits.mockResolvedValueOnce({ ...CREDITS_OK, enrichment_credits: 0 })
      const error = await controller.enrichContact('c1', {}, user).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(HttpException)
      expect((error as HttpException).getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED)
      expect(contacts.enrichContact).not.toHaveBeenCalled()
    })

    it('AVEC confirm → enriches with the SERVER-derived identity (split name + entity)', async () => {
      const { controller, contacts } = build()
      contacts.findOwnedForAction.mockResolvedValueOnce(success(owned))
      const enriched = { ...owned, email: 'jean@corp.fr', enrichment: {}, credits_remaining: 39 }
      contacts.enrichContact.mockResolvedValueOnce(success(enriched))
      const result = await controller.enrichContact('c1', { confirm: true }, user)
      expect(contacts.enrichContact).toHaveBeenCalledWith('c1', 'user-1', {
        first_name: 'Jean',
        last_name: 'Dupont',
        organization_name: 'Acme Group',
      })
      expect(result).toEqual(enriched)
    })

    it('falls back to the account company name when the contact has no entity', async () => {
      const { controller, contacts, accounts } = build()
      contacts.findOwnedForAction.mockResolvedValueOnce(success({ ...owned, entity: null } as ContactEntity))
      accounts.findOne.mockResolvedValueOnce(success({ company_name: 'Acme SA' }))
      contacts.enrichContact.mockResolvedValueOnce(success({}))
      await controller.enrichContact('c1', { confirm: true }, user)
      expect(accounts.findOne).toHaveBeenCalledWith('acc-1', 'user-1')
      expect(contacts.enrichContact).toHaveBeenCalledWith(
        'c1',
        'user-1',
        expect.objectContaining({ organization_name: 'Acme SA' }),
      )
    })

    it('maps insufficient_credits from the confirmed run to 402', async () => {
      const { controller, contacts } = build()
      contacts.findOwnedForAction.mockResolvedValueOnce(success(owned))
      contacts.enrichContact.mockResolvedValueOnce(failure({ code: 'insufficient_credits', message: 'épuisés' }))
      const error = await controller.enrichContact('c1', { confirm: true }, user).catch((e: unknown) => e)
      expect((error as HttpException).getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED)
    })

    it('refuses (404) an un-owned contact BEFORE quoting or enriching', async () => {
      const { controller, contacts, credits } = build()
      contacts.findOwnedForAction.mockResolvedValueOnce(failure({ code: 'not_found', message: 'introuvable' }))
      await expect(controller.enrichContact('c1', {}, user)).rejects.toBeInstanceOf(NotFoundException)
      expect(credits.getCredits).not.toHaveBeenCalled()
      expect(contacts.enrichContact).not.toHaveBeenCalled()
    })
  })

  describe('ask_bellum — Q&A over one dossier (read, free)', () => {
    it('resolves the workspace account, builds the Copilote context and returns the IA reply', async () => {
      const { controller, accounts, chatContext, ia } = build()
      accounts.findOneForWorkspace.mockResolvedValueOnce(success({ id: 'acc-1' }))
      const result = await controller.askAccount('acc-1', { question: 'Quel angle ?' }, user)
      // ⚠️ Le TROISIÈME argument est le PÉRIMÈTRE (BU) : `null` = tout l'espace.
      // L'assertion le nomme, sinon un correctif qui cesserait de le passer
      // resterait vert (revue sécurité 15/09/2026).
      expect(accounts.findOneForWorkspace).toHaveBeenCalledWith('acc-1', 'ws-1', null)
      expect(chatContext.build).toHaveBeenCalledWith({ userId: 'user-1', workspaceId: 'ws-1', accountId: 'acc-1' })
      expect(ia.chat).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', message: 'Quel angle ?', accountId: 'acc-1' }),
      )
      expect(result).toEqual({ account_id: 'acc-1', question: 'Quel angle ?', reply: 'Voici l’angle.' })
    })

    // #1960.20 — même pipeline que le copilote : en marque blanche, la réponse
    // ne doit porter aucune adresse Bellum. La marque se lit côté serveur.
    it('#1960.20 — forwards the white-label flag read server-side', async () => {
      const deps = build()
      const brands = { getForWorkspace: jest.fn().mockResolvedValue({ isCustom: true }) }
      const controller = new McpApiController(
        deps.accounts as unknown as AccountsService,
        deps.contacts as unknown as ContactsService,
        deps.analysis as unknown as AnalysisService,
        deps.credits as unknown as CreditsService,
        deps.planItems as unknown as ActionPlanItemsService,
        deps.crm as unknown as CrmService,
        deps.workspaceContext as unknown as WorkspaceContextService,
        deps.chatContext as unknown as ChatContextService,
        deps.ia as unknown as IaClient,
        brands as unknown as WorkspaceBrandService,
        undefined, // replyMemoryUses
        undefined, // replyFeedback
        // Le cloisonnement de périmètre : `null` = tout l'espace.
        { scopeFor: jest.fn().mockResolvedValue(null) } as never,
      )
      deps.accounts.findOneForWorkspace.mockResolvedValueOnce(success({ id: 'acc-1' }))

      await controller.askAccount('acc-1', { question: 'Qui contacter chez vous ?' }, user)

      expect(brands.getForWorkspace).toHaveBeenCalledWith('ws-1')
      expect(deps.ia.chat).toHaveBeenCalledWith(expect.objectContaining({ whiteLabel: true }))
    })

    it('#1960.20 — témoin : sans service de marque, pas de marque blanche', async () => {
      const { controller, accounts, ia } = build()
      accounts.findOneForWorkspace.mockResolvedValueOnce(success({ id: 'acc-1' }))
      await controller.askAccount('acc-1', { question: 'Q' }, user)
      expect(ia.chat).toHaveBeenCalledWith(expect.objectContaining({ whiteLabel: false }))
    })

    it('404 when the account is not in the caller workspace — the IA is never called', async () => {
      const { controller, accounts, ia } = build()
      accounts.findOneForWorkspace.mockResolvedValueOnce(failure({ code: 'not_found', message: 'introuvable' }))
      await expect(controller.askAccount('acc-x', { question: 'Q' }, user)).rejects.toBeInstanceOf(NotFoundException)
      expect(ia.chat).not.toHaveBeenCalled()
    })

    it('#1919.15 — carries THIS person’s reply-feedback memory, exactly like the chat route', async () => {
      const replyFeedback = {
        memoryFor: jest.fn().mockResolvedValue('- (2026-09-12) Ta réponse … jugée PAS PERTINENTE'),
      }
      const { controller, accounts, ia } = build({ replyFeedback })
      accounts.findOneForWorkspace.mockResolvedValueOnce(success({ id: 'acc-1' }))
      await controller.askAccount('acc-1', { question: 'Quel angle ?' }, user)
      expect(replyFeedback.memoryFor).toHaveBeenCalledWith({ workspaceId: 'ws-1', userId: 'user-1' })
      expect(ia.chat).toHaveBeenCalledWith(
        expect.objectContaining({ replyFeedback: expect.stringContaining('PAS PERTINENTE') }),
      )
    })

    it('#1919.15 — no feedback (or no module) → nothing is forwarded, so the IA key is omitted', async () => {
      const empty = { memoryFor: jest.fn().mockResolvedValue('') }
      for (const scenario of [build({ replyFeedback: empty }), build()]) {
        scenario.accounts.findOneForWorkspace.mockResolvedValueOnce(success({ id: 'acc-1' }))
        await scenario.controller.askAccount('acc-1', { question: 'Q' }, user)
        const input = scenario.ia.chat.mock.calls[0]?.[0] as { replyFeedback?: string | null }
        expect(input.replyFeedback ?? null).toBeNull()
      }
    })

    it('502 when the IA fails or replies empty (never an invented answer)', async () => {
      const { controller, accounts, ia } = build()
      accounts.findOneForWorkspace.mockResolvedValue(success({ id: 'acc-1' }))
      ia.chat.mockResolvedValueOnce({ success: false, data: {} })
      await expect(controller.askAccount('acc-1', { question: 'Q' }, user)).rejects.toBeInstanceOf(BadGatewayException)
    })

    it('#1914 — une réponse à cartes part en TEXTE : le client MCP est un modèle, pas un écran', async () => {
      const { controller, accounts, ia } = build()
      accounts.findOneForWorkspace.mockResolvedValueOnce(success({ id: 'acc-1' }))
      const fenced =
        'Voici.\n\n```bellum-block\n{"type":"verdict","conclusion":"Commence par Acme.","reasons":["Appel d’offres ouvert."]}\n```'
      ia.chat.mockResolvedValueOnce({ success: true, data: { reply: fenced } })
      const result = await controller.askAccount('acc-1', { question: 'Par où ?' }, user)
      expect(result.reply).toContain('Commence par Acme.')
      expect(result.reply).toContain('- Appel d’offres ouvert.')
      expect(result.reply).not.toContain('```')
      expect(result.reply).not.toContain('"type"')
    })
  })

  describe('create_action — manual plan item (mcp:act)', () => {
    it('checks the account in the workspace then delegates to createManual', async () => {
      const { controller, accounts, planItems } = build()
      accounts.findOneForWorkspace.mockResolvedValueOnce(success({ id: 'acc-1' }))
      const created = { id: 'i1', label: 'Rappeler le DSI' }
      planItems.createManual.mockResolvedValueOnce(created)
      const result = await controller.createAction('acc-1', { title: 'Rappeler le DSI', due_date: '2026-08-01' }, user)
      expect(planItems.createManual).toHaveBeenCalledWith('user-1', 'acc-1', {
        label: 'Rappeler le DSI',
        dueDate: '2026-08-01',
        contactId: null,
      })
      expect(result).toEqual(created)
    })

    it('links an OWNED contact of THAT account; a foreign contact is a 400', async () => {
      const { controller, accounts, contacts, planItems } = build()
      accounts.findOneForWorkspace.mockResolvedValue(success({ id: 'acc-1' }))
      contacts.findOwnedForAction.mockResolvedValueOnce(
        success({ id: 'c9', account_id: 'OTHER-account' } as ContactEntity),
      )
      await expect(controller.createAction('acc-1', { title: 'X', contact_id: 'c9' }, user)).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(planItems.createManual).not.toHaveBeenCalled()
    })

    it('404 when the account is not in the caller workspace — nothing created', async () => {
      const { controller, accounts, planItems } = build()
      accounts.findOneForWorkspace.mockResolvedValueOnce(failure({ code: 'not_found', message: 'introuvable' }))
      await expect(controller.createAction('acc-x', { title: 'X' }, user)).rejects.toBeInstanceOf(NotFoundException)
      expect(planItems.createManual).not.toHaveBeenCalled()
    })
  })

  describe('scope wiring — a lesser token can never reach the writes / spends', () => {
    const scopeOf = (handler: (...args: never[]) => unknown): string | undefined =>
      Reflect.getMetadata(MCP_SCOPE_KEY, handler)

    it('action routes require mcp:act', () => {
      expect(scopeOf(McpApiController.prototype.prepareContactEmail)).toBe('mcp:act')
      expect(scopeOf(McpApiController.prototype.sendContactEmail)).toBe('mcp:act')
      expect(scopeOf(McpApiController.prototype.logContactToCrm)).toBe('mcp:act')
      expect(scopeOf(McpApiController.prototype.createAction)).toBe('mcp:act')
    })

    it('paying routes require mcp:analysis; read routes stay unscoped', () => {
      expect(scopeOf(McpApiController.prototype.startAnalysis)).toBe('mcp:analysis')
      expect(scopeOf(McpApiController.prototype.enrichContact)).toBe('mcp:analysis')
      expect(scopeOf(McpApiController.prototype.getCredits)).toBeUndefined()
      expect(scopeOf(McpApiController.prototype.askAccount)).toBeUndefined()
    })
  })
})
