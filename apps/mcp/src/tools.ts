import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { apiRequest, describeApiError, type ApiResult } from './api-client.js'
import type { McpEnv } from './config/env.js'

type ToolExtra = { authInfo?: { token?: string } }
type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean }

function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}
function fail(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

function tokenOf(extra: ToolExtra): string | null {
  return extra.authInfo?.token ?? null
}

/** Present an API result as a tool result, mapping failures to clean messages. */
function present(result: ApiResult, shape?: (data: unknown) => unknown): ToolResult {
  if (!result.ok) return fail(describeApiError(result))
  return ok(shape ? shape(result.data) : result.data)
}

/** Drop the known-huge `raw_analysis.branches` list (can be 1000+ rows) from an
 *  account dossier so the assistant isn't flooded — replace it with a count. */
function trimAccount(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data
  const account = data as Record<string, unknown>
  const raw = account['raw_analysis']
  if (raw && typeof raw === 'object') {
    const rawObj = raw as Record<string, unknown>
    if (Array.isArray(rawObj['branches'])) {
      return { ...account, raw_analysis: { ...rawObj, branches: { count: rawObj['branches'].length } } }
    }
  }
  return account
}

/** Une opportunité tient en peu de lignes : au plus 5 signaux par entreprise, le reste n'aide pas à décider. */
const MAX_SIGNALS_PER_ITEM = 5

function compactOpportunities(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data
  const body = data as Record<string, unknown>
  if (!Array.isArray(body['items'])) return body
  return {
    ...body,
    items: body['items'].map(item => {
      if (!item || typeof item !== 'object') return item
      const row = item as Record<string, unknown>
      return Array.isArray(row['signals']) ? { ...row, signals: row['signals'].slice(0, MAX_SIGNALS_PER_ITEM) } : row
    }),
  }
}

/**
 * Registers the Bellum MCP tools on a server. Each tool forwards the caller's
 * MCP access token (from the validated request) to the API's `/mcp/*` surface.
 */
export function registerTools(server: McpServer, env: McpEnv): void {
  const call = async (
    extra: ToolExtra,
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    shape?: (d: unknown) => unknown,
  ): Promise<ToolResult> => {
    const token = tokenOf(extra)
    if (!token) return fail('Requête non authentifiée.')
    return present(await apiRequest(env, token, method, path, body), shape)
  }

  server.registerTool(
    'search_accounts',
    {
      description:
        'Liste ou recherche les comptes (entreprises) du workspace Bellum. Sans `query`, retourne tous les comptes (paginé) ; avec `query`, filtre par nom. Chaque item porte score de priorité et signal principal.',
      inputSchema: {
        query: z.string().optional().describe('Nom ou fragment de nom d’entreprise (omis = tous les comptes)'),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (args, extra) => {
      const params = new URLSearchParams()
      const q = args.query?.trim()
      if (q) params.set('q', q)
      if (args.limit) params.set('limit', String(args.limit))
      const qs = params.toString()
      return call(extra as ToolExtra, 'GET', `/mcp/accounts${qs ? `?${qs}` : ''}`)
    },
  )

  server.registerTool(
    'get_account',
    {
      description: 'Dossier de conquête complet d’un compte : identité, angles d’attaque, organigramme, plan.',
      inputSchema: { account_id: z.string().describe('Identifiant du compte') },
    },
    async (args, extra) =>
      call(extra as ToolExtra, 'GET', `/mcp/accounts/${encodeURIComponent(args.account_id)}`, undefined, trimAccount),
  )

  server.registerTool(
    'get_account_contacts',
    {
      description:
        'Contacts réels d’un compte avec leurs rôles de décision et les messages prêts à envoyer (email, LinkedIn, script téléphone).',
      inputSchema: { account_id: z.string() },
    },
    async (args, extra) =>
      call(extra as ToolExtra, 'GET', `/mcp/accounts/${encodeURIComponent(args.account_id)}/contacts`),
  )

  server.registerTool(
    'get_plan_items',
    {
      description: 'Checklist du plan d’action d’un compte (étapes, statut fait/à faire, échéances).',
      inputSchema: { account_id: z.string() },
    },
    async (args, extra) =>
      call(extra as ToolExtra, 'GET', `/mcp/accounts/${encodeURIComponent(args.account_id)}/plan-items`),
  )

  server.registerTool(
    'get_credits',
    { description: 'Quota d’analyses restant du compte Bellum (plan, utilisées/limite).', inputSchema: {} },
    async (_args, extra) => call(extra as ToolExtra, 'GET', '/mcp/credits'),
  )

  server.registerTool(
    'start_analysis',
    {
      description:
        'ACTION PAYANTE (1 crédit d’analyse, ~3–6 min) — lance une nouvelle analyse de compte. HANDSHAKE en 2 temps : ' +
        'appelée SANS confirm, elle ne lance RIEN et retourne un devis (coût, solde restant, durée estimée, requires_confirmation) ; ' +
        'présentez-le au commercial et, après son accord explicite, rappelez-la avec confirm: true pour lancer (retourne { jobId, accountId } ; ' +
        'suivez ensuite avec get_analysis_status). Ne mettez JAMAIS confirm: true sans accord explicite de l’utilisateur.',
      inputSchema: {
        company_name: z.string().describe('Nom de l’entreprise à analyser'),
        user_context: z.string().optional().describe('Contexte commercial optionnel'),
        confirm: z
          .boolean()
          .optional()
          .describe('true = le commercial a explicitement confirmé la dépense d’un crédit ; absent = simple devis'),
      },
    },
    async (args, extra) =>
      call(extra as ToolExtra, 'POST', '/mcp/analysis', {
        company_name: args.company_name,
        user_context: args.user_context,
        ...(args.confirm !== undefined ? { confirm: args.confirm } : {}),
      }),
  )

  server.registerTool(
    'get_analysis_status',
    {
      description:
        'État d’une analyse en cours ou terminée : state (active/completed/failed/…), pourcentage, phase. Quand completed, relire get_account.',
      inputSchema: { account_id: z.string() },
    },
    async (args, extra) =>
      call(extra as ToolExtra, 'GET', `/mcp/analysis/${encodeURIComponent(args.account_id)}/status`),
  )

  server.registerTool(
    'ask_bellum',
    {
      description:
        'Pose une question en langage naturel sur UN dossier de compte Bellum (gratuit, aucune donnée modifiée). ' +
        'La réponse est sourcée du dossier réel (analyse, contacts, plan, profil ESN) — idéal pour « quel angle d’attaque ? », ' +
        '« qui contacter en premier ? », « résume les signaux d’achat ». Nécessite un account_id (voir search_accounts).',
      inputSchema: {
        account_id: z.string().describe('Identifiant du compte à interroger'),
        question: z.string().describe('La question du commercial sur ce dossier'),
      },
    },
    async (args, extra) =>
      call(extra as ToolExtra, 'POST', `/mcp/accounts/${encodeURIComponent(args.account_id)}/ask`, {
        question: args.question,
      }),
  )

  server.registerTool(
    'create_action',
    {
      description:
        'ACTION — ajoute une action de suivi au plan d’action d’un compte (gratuit, non destructif ; visible dans get_plan_items ' +
        'et, si datée, dans les rappels de relance du commercial). Optionnel : la lier à un contact du compte et/ou lui donner une échéance. ' +
        'Nécessite le scope mcp:act.',
      inputSchema: {
        account_id: z.string().describe('Identifiant du compte'),
        title: z.string().describe('Libellé de l’action (ex. « Rappeler le DSI après le salon »)'),
        contact_id: z.string().optional().describe('Contact du compte auquel lier l’action (optionnel)'),
        due_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('Échéance au format YYYY-MM-DD (optionnel)'),
      },
    },
    async (args, extra) =>
      call(extra as ToolExtra, 'POST', `/mcp/accounts/${encodeURIComponent(args.account_id)}/actions`, {
        title: args.title,
        ...(args.contact_id ? { contact_id: args.contact_id } : {}),
        ...(args.due_date ? { due_date: args.due_date } : {}),
      }),
  )

  server.registerTool(
    'enrich_contact',
    {
      description:
        'ACTION PAYANTE (1 crédit d’enrichissement, débité uniquement si des données réelles sont trouvées) — résout l’email pro, ' +
        'le téléphone et le LinkedIn d’un contact via les fournisseurs d’enrichissement. MÊME HANDSHAKE que start_analysis : ' +
        'appelée SANS confirm, elle ne lance RIEN et retourne un devis (coût, solde, requires_confirmation) ; après accord explicite ' +
        'du commercial, rappelez-la avec confirm: true. Ne mettez JAMAIS confirm: true sans accord explicite de l’utilisateur.',
      inputSchema: {
        contact_id: z.string().describe('Identifiant du contact à enrichir'),
        confirm: z
          .boolean()
          .optional()
          .describe('true = le commercial a explicitement confirmé la dépense d’un crédit ; absent = simple devis'),
      },
    },
    async (args, extra) =>
      call(extra as ToolExtra, 'POST', `/mcp/contacts/${encodeURIComponent(args.contact_id)}/enrich`, {
        ...(args.confirm !== undefined ? { confirm: args.confirm } : {}),
      }),
  )

  server.registerTool(
    'send_email',
    {
      description:
        'ACTION — envoie RÉELLEMENT l’email déjà rédigé (le message préparé `email_message`, qui vit dans Bellum et non dans la messagerie) d’un contact à son adresse, avec le commercial en Reply-To. Idempotent : un contact déjà contacté ne peut pas être ré-envoyé. Nécessite le scope mcp:act.',
      inputSchema: { contact_id: z.string().describe('Identifiant du contact dont envoyer l’email préparé') },
    },
    async (args, extra) =>
      call(extra as ToolExtra, 'POST', `/mcp/contacts/${encodeURIComponent(args.contact_id)}/send-email`),
  )

  server.registerTool(
    'log_to_crm',
    {
      description:
        // La CAPACITÉ, jamais l'éditeur : la règle du 02/08 vaut aussi sur cette
        // surface, qui est lue par l'assistant IA d'un commercial — et l'espace
        // peut avoir branché n'importe lequel des quatre CRM.
        'ACTION — exporte / met à jour un contact dans le CRM connecté de l’espace. Retourne l’identifiant du contact créé dans le CRM. Nécessite le scope mcp:act et une connexion CRM active.',
      inputSchema: { contact_id: z.string().describe('Identifiant du contact à exporter vers le CRM') },
    },
    async (args, extra) =>
      call(extra as ToolExtra, 'POST', `/mcp/contacts/${encodeURIComponent(args.contact_id)}/log-crm`),
  )

  server.registerTool(
    'find_opportunities',
    {
      description:
        'Trouve les entreprises qui montrent des signaux d’achat MAINTENANT, classées par score (0-100) : ' +
        'comptes du portefeuille de l’espace (signal de l’analyse, étape du plan) ET entreprises de la mémoire marché ' +
        'hors portefeuille. Chaque item : company_name, account_id (null = hors portefeuille → proposer une analyse), ' +
        'score, signals[] {type, libelle, force}, why (1 phrase), next_step. Gratuit, lecture seule. ' +
        '`skills` = compétences en texte libre (« data, Python, Azure ») : ne remontent alors que les entreprises ' +
        'dont la pile observée les recoupe. Un score est toujours lu avec ses signaux ; `market_memory: indisponible` ' +
        'veut dire que la lecture marché a échoué (≠ aucune entreprise).',
      inputSchema: {
        query: z.string().optional().describe('Fragment de nom d’entreprise'),
        skills: z.string().optional().describe('Compétences / stack en texte libre, ex. « data, Python, Azure »'),
        in_portfolio: z
          .boolean()
          .optional()
          .describe('true = seulement mon portefeuille ; false = seulement hors portefeuille ; absent = les deux'),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async (args, extra) => {
      const params = new URLSearchParams()
      const q = args.query?.trim()
      if (q) params.set('q', q)
      const skills = args.skills?.trim()
      if (skills) params.set('skills', skills)
      if (args.in_portfolio !== undefined) params.set('in_portfolio', String(args.in_portfolio))
      if (args.limit) params.set('limit', String(args.limit))
      const qs = params.toString()
      return call(extra as ToolExtra, 'GET', `/mcp/signals${qs ? `?${qs}` : ''}`, undefined, compactOpportunities)
    },
  )

  server.registerTool(
    'get_market_signals',
    {
      description:
        'Signaux marché d’UNE entreprise, même hors portefeuille : recours à des sociétés de services observé, pile technique ' +
        'observée, familles de rôles, et account_id si elle est déjà dans l’espace. Sert à décider de lancer ou non une analyse ' +
        '(start_analysis). Gratuit, lecture seule. `covered: false` = la mémoire marché ne la connaît pas ; ' +
        '`status: indisponible` = lecture en panne (≠ inconnue).',
      inputSchema: { company: z.string().describe('Nom (ou clé) de l’entreprise') },
    },
    async (args, extra) => call(extra as ToolExtra, 'GET', `/mcp/market/${encodeURIComponent(args.company.trim())}`),
  )

  server.registerTool(
    'list_due_actions',
    {
      description:
        'Mes actions du plan dues aujourd’hui ou en retard, tous comptes de l’espace confondus (id, compte, libellé, échéance, ' +
        'overdue). Idéal pour les relances du jour. Gratuit, lecture seule ; traiter ensuite avec update_plan_item.',
      inputSchema: { limit: z.number().int().min(1).max(100).optional() },
    },
    async (args, extra) =>
      call(extra as ToolExtra, 'GET', `/mcp/actions/due${args.limit ? `?limit=${args.limit}` : ''}`),
  )

  server.registerTool(
    'update_plan_item',
    {
      description:
        'ACTION — passe une étape du plan à fait / à faire et/ou change son échéance (gratuit, aucun envoi). Marquer « fait » ' +
        'est un geste DÉCLARATIF (jamais une preuve d’envoi) et exige l’issue (`outcome`, ex. positive, declined, deferred, ' +
        'qualified, no_response) : demandez-la au commercial. Nécessite le scope mcp:act.',
      inputSchema: {
        plan_item_id: z.string().describe('Identifiant de l’étape (voir list_due_actions / get_plan_items)'),
        done: z.boolean().optional().describe('true = fait (exige outcome) ; false = à faire'),
        outcome: z.string().optional().describe('Issue choisie par le commercial, obligatoire quand done = true'),
        due_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional()
          .describe('Nouvelle échéance YYYY-MM-DD ; null efface l’échéance'),
      },
    },
    async (args, extra) =>
      call(extra as ToolExtra, 'POST', `/mcp/plan-items/${encodeURIComponent(args.plan_item_id)}`, {
        ...(args.done !== undefined ? { done: args.done } : {}),
        ...(args.outcome ? { outcome: args.outcome } : {}),
        ...(args.due_date !== undefined ? { due_date: args.due_date } : {}),
      }),
  )
}
