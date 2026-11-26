import type { CrmActivityPage, CrmDealPage, CrmOwnerPage, CrmReadOptions } from '../crm/adapter/crm-read-types'
import type { CrmCompanyPage, CrmContactPage } from '../crm/hubspot.client'
import { assertSafeOutboundUrl } from '../integrations/ssrf-guard'

/**
 * Client Odoo — JSON-RPC 2.0 sur `/jsonrpc`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI JSON-RPC ET PAS XML-RPC
 * ─────────────────────────────────────────────────────────────────────────
 * Odoo expose les DEUX sur la même sémantique (`common.login`,
 * `object.execute_kw`). XML-RPC est le chemin historique et celui de la
 * documentation, mais il demanderait un encodeur/décodeur XML — donc une
 * dépendance de plus, pour parler le même protocole. JSON-RPC répond au même
 * endroit, dans un format que `fetch` sait déjà lire.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ CE CONTRAT N'A PAS ÉTÉ VÉRIFIÉ SUR UNE INSTANCE RÉELLE
 * ─────────────────────────────────────────────────────────────────────────
 * La doctrine du dépôt est explicite : *un contrat d'API non vérifiable ne se
 * devine pas — un client écrit sur un contrat deviné débiterait un crédit pour
 * une réponse mal lue.* Le protocole ci-dessous est stable et public depuis
 * Odoo 8, mais **personne ici n'a encore branché une instance Odoo**. Le
 * connecteur est donc écrit, testé contre des réponses simulées, et **inerte
 * tant qu'un opérateur n'a pas fourni ses identifiants** : sans eux, aucun
 * appel réseau ne part. La première connexion réelle est la recette de ce
 * fichier, et il faudra la faire avant d'annoncer la capacité.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SÉCURITÉ : L'URL VIENT DE L'UTILISATEUR
 * ─────────────────────────────────────────────────────────────────────────
 * Contrairement à HubSpot (hôte fixe) et à Pipedrive (`api_domain` rendu par
 * le fournisseur), l'adresse d'une instance Odoo est SAISIE — une entreprise
 * peut s'héberger elle-même. C'est une porte SSRF ouverte : sans garde, un
 * utilisateur ferait émettre à l'API des requêtes vers `169.254.169.254` ou
 * vers un hôte interne. Chaque appel passe donc par `assertSafeOutboundUrl`,
 * la garde déjà écrite pour les webhooks — https obligatoire, et refus si UNE
 * des adresses résolues est privée, loopback, lien-local ou CGNAT.
 */

/**
 * #2565.10 — une erreur QUI DIT D'OÙ ELLE VIENT. Le message reste celui
 * d'avant (les appelants existants le lisent tel quel) ; `kind` permet à un
 * appelant qui ÉCRIT de distinguer « Odoo a refusé » (`rpc` : l'appel a
 * échoué côté serveur, rien n'a été enregistré) de « on ne sait pas » (`http`
 * 5xx d'une passerelle, `empty` : une réponse sans résultat).
 */
export class OdooCallError extends Error {
  constructor(
    message: string,
    readonly kind: 'http' | 'rpc' | 'empty',
    readonly status: number | null = null,
  ) {
    super(message)
    this.name = 'OdooCallError'
  }
}

/** Ce qu'Odoo rend quand l'appel a échoué côté serveur. */
type OdooRpcError = {
  message?: string
  data?: { message?: string; name?: string }
}

type OdooRpcResponse<T> = {
  result?: T
  error?: OdooRpcError
}

export type OdooCredentials = {
  /** L'adresse de l'instance, sans chemin : `https://acme.odoo.com`. */
  baseUrl: string
  /** Le nom de la base — une instance Odoo en héberge plusieurs. */
  db: string
  /** L'identifiant, presque toujours une adresse e-mail. */
  login: string
  /**
   * Une CLÉ D'API, pas un mot de passe.
   *
   * Odoo accepte les deux au même endroit, ce qui est précisément le piège :
   * une clé se révoque depuis le profil sans changer le mot de passe du
   * compte, et elle ne donne pas accès à l'interface. L'écran demande donc une
   * clé, et ce champ porte son nom pour qu'aucun appelant ne se persuade
   * qu'un mot de passe convient aussi bien.
   */
  apiKey: string
}

/** Ce qu'une authentification réussie apprend sur l'instance. */
type OdooIdentity = {
  /** L'identifiant interne de l'utilisateur — Odoo l'exige à chaque appel. */
  uid: number
  /** Le nom affiché du compte, pour l'écran des intégrations. */
  userName: string | null
  /** La version annoncée par le serveur, utile au diagnostic. */
  serverVersion: string | null
}

/** #2565.10 — une ligne de brouillon de facture, en UNITÉS de la devise
 *  (Odoo ne compte pas en centimes : `price_unit` est un `Float`). */
type OdooDraftInvoiceLine = {
  label: string
  quantity: number
  unitPrice: number
}

type OdooContactInput = {
  name: string
  email?: string | null
  phone?: string | null
  jobTitle?: string | null
  companyName?: string | null
}

/** Le résultat d'un export : ce qu'on a fait, et sur quelle fiche. */
export type OdooUpsertResult = {
  /** `created` quand la fiche est neuve, `updated` quand elle existait. */
  action: 'created' | 'updated'
  /** L'id Odoo de `res.partner`. */
  partnerId: number
}

/** 15 s : au-delà, une instance auto-hébergée lente bloquerait la requête web. */
const TIMEOUT_MS = 15_000

/**
 * Les champs qu'on lit sur un partenaire. Listés EXPLICITEMENT : `read` sans
 * `fields` rend toutes les colonnes du modèle, dont des champs personnalisés
 * qu'on n'a pas demandés et qu'on n'a pas le droit de stocker.
 */
const PARTNER_FIELDS = ['id', 'name', 'email', 'phone', 'function', 'parent_id'] as const

/** #2561/#2562 — les champs lus sur une vente, et SEULEMENT eux. */
const SALE_ORDER_FIELDS = [
  'id',
  'name',
  'partner_id',
  'client_order_ref',
  'date_order',
  'commitment_date',
  'state',
  'invoice_status',
  'amount_untaxed',
  'currency_id',
] as const
const SALE_ORDER_LINE_FIELDS = ['order_id', 'name', 'product_uom_qty', 'price_unit', 'price_subtotal'] as const

/** Une ligne de vente : une prestation (ex. 55 jours × 720 €). Montants en
 *  UNITÉS de la devise, comme Odoo les rend. */
export type OdooSaleOrderLine = {
  label: string
  quantity: number | null
  unitPrice: number | null
  subtotal: number | null
}

/** #2561/#2562 — une vente confirmée, normalisée. `null` = Odoo a rendu
 *  `false` (son « vide ») : une absence, jamais un zéro. */
export type OdooSaleOrder = {
  id: number
  /** La référence Odoo (`S00042`). */
  reference: string
  /** Le nom du client tel qu'Odoo l'affiche. */
  partnerName: string | null
  /** La référence côté client (bon de commande), si saisie. */
  clientRef: string | null
  /** `YYYY-MM-DD`. */
  orderDate: string | null
  commitmentDate: string | null
  state: string
  /** `upselling` · `invoiced` · `to invoice` · `no` — tel quel. */
  invoiceStatus: string | null
  amountUntaxed: number | null
  currency: string | null
  lines: OdooSaleOrderLine[]
}

/* Odoo rend `false` pour TOUT champ vide, quel que soit son type : chaque
   lecture le convertit en `null`, jamais en `''` ni en `0`. */
function odooText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}
function odooNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
function odooDate(value: unknown): string | null {
  const text = odooText(value)
  return text && /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null
}
/** Un Many2one arrive en `[id, "libellé"]`, ou `false`. */
function many2oneId(value: unknown): number | null {
  return Array.isArray(value) && typeof value[0] === 'number' ? value[0] : null
}
function many2oneLabel(value: unknown): string | null {
  return Array.isArray(value) ? odooText(value[1]) : null
}

/** `YYYY-MM-DD HH:MM:SS` (UTC, sans fuseau) → ISO ; null si absent (Odoo rend `false`). */
function odooTimestamp(value: unknown): string | null {
  const text = odooText(value)
  if (!text || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(text)) return null
  const ms = Date.parse(`${text.slice(0, 19).replace(' ', 'T')}Z`)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

export class OdooClient {
  constructor(private readonly credentials: OdooCredentials) {}

  /**
   * Un appel JSON-RPC.
   *
   * ⚠️ Odoo répond **HTTP 200 même en erreur** : l'échec vit dans le corps,
   * sous `error`. Vérifier `res.ok` est donc nécessaire (une passerelle en
   * amont peut rendre un 502) mais très loin d'être suffisant — c'est le
   * piège classique de ce protocole, et un client qui ne teste que `res.ok`
   * lit `undefined` comme un succès.
   */
  private async rpc<T>(
    service: 'common' | 'object',
    method: string,
    args: unknown[],
    what: string | null = null,
  ): Promise<T> {
    const endpoint = `${this.credentials.baseUrl.replace(/\/+$/, '')}/jsonrpc`
    await assertSafeOutboundUrl(endpoint)

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: { service, method, args },
        id: Date.now(),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      // K.3 — « a répondu 404 » seul ne dit pas QUEL appel : la lecture passe, l'écriture non. On nomme
      // le modèle et la méthode (jamais la clé ni le corps) pour que le journal désigne l'appel refusé.
      const call = what ? ` à ${what}` : ''
      throw new OdooCallError(
        response.status === 404 && what
          ? `Le service a répondu 404${call} : l’instance n’expose pas cet appel à ce compte — vérifie l’adresse branchée et le droit d’écriture de la clé, ou rebranche l’instance.`
          : `Le service a répondu ${response.status}${call}.`,
        'http',
        response.status,
      )
    }

    // Une adresse d'instance erronée tombe sur une page HTML (connexion, 404
    // d'un hébergeur) : on le dit, au lieu de « Unexpected token '<' ».
    let payload: OdooRpcResponse<T>
    try {
      payload = (await response.json()) as OdooRpcResponse<T>
    } catch {
      throw new OdooCallError(
        'L’adresse de l’instance ne répond pas en JSON-RPC (page web reçue) — vérifie l’adresse branchée.',
        'http',
        response.status,
      )
    }
    if (payload.error) {
      // `data.message` porte le message métier ; `message` seul dit « Odoo
      // Server Error », qui n'aide personne.
      const detail = payload.error.data?.message || payload.error.message || 'Erreur inconnue.'
      throw new OdooCallError(detail, 'rpc')
    }
    if (payload.result === undefined) {
      throw new OdooCallError('Réponse vide du service.', 'empty')
    }
    return payload.result
  }

  /** `execute_kw` : le point d'entrée unique de tout ce qui touche aux modèles. */
  private async execute<T>(uid: number, model: string, method: string, args: unknown[], kwargs = {}): Promise<T> {
    const { db, apiKey } = this.credentials
    return this.rpc<T>('object', 'execute_kw', [db, uid, apiKey, model, method, args, kwargs], `${model}.${method}`)
  }

  /**
   * Authentifie et rend ce qu'on sait de l'instance.
   *
   * ⚠️ `common.login` rend `false` — et non une erreur — quand les
   * identifiants sont mauvais. Un client qui se contente de `!payload.error`
   * enregistrerait donc une connexion avec `uid = false`, et le premier export
   * échouerait des jours plus tard sur un « uid invalide » incompréhensible.
   */
  async authenticate(): Promise<OdooIdentity> {
    const { db, login, apiKey } = this.credentials
    const uid = await this.rpc<number | false>('common', 'login', [db, login, apiKey])
    if (typeof uid !== 'number' || uid <= 0) {
      throw new Error('Identifiants refusés par le service.')
    }

    // La version est du CONFORT de diagnostic : son échec ne doit pas faire
    // échouer une connexion par ailleurs valide.
    let serverVersion: string | null = null
    try {
      const info = await this.rpc<{ server_version?: string }>('common', 'version', [])
      serverVersion = info.server_version ?? null
    } catch {
      serverVersion = null
    }

    let userName: string | null = null
    try {
      const rows = await this.execute<{ name?: string }[]>(uid, 'res.users', 'read', [[uid], ['name']])
      userName = rows[0]?.name ?? null
    } catch {
      userName = null
    }

    return { uid, userName, serverVersion }
  }

  /**
   * Cherche un partenaire par e-mail EXACT.
   *
   * L'e-mail est la seule clé qui identifie une personne sans risque : un
   * rapprochement par nom confondrait deux homonymes, et le dépôt refuse de
   * fusionner deux personnes sur une ressemblance (« on PROPOSE une fusion, on
   * ne fusionne JAMAIS »). Sans e-mail, on crée — quitte à laisser un doublon
   * visible, qui se corrige, plutôt qu'à écraser la fiche de quelqu'un
   * d'autre, qui ne se corrige pas.
   */
  async findPartnerByEmail(uid: number, email: string): Promise<number | null> {
    const ids = await this.execute<number[]>(uid, 'res.partner', 'search', [[['email', '=', email]]], { limit: 1 })
    return ids[0] ?? null
  }

  /** Crée ou met à jour un contact, et DIT lequel des deux a eu lieu. */
  async upsertContact(uid: number, input: OdooContactInput): Promise<OdooUpsertResult> {
    const values: Record<string, unknown> = { name: input.name }
    // On n'envoie QUE ce qu'on sait : envoyer `false` sur un champ non
    // renseigné EFFACERAIT la valeur déjà présente dans le CRM du client. Une
    // correction humaine gagne toujours — y compris la sienne, faite chez lui.
    if (input.email) values['email'] = input.email
    if (input.phone) values['phone'] = input.phone
    if (input.jobTitle) values['function'] = input.jobTitle

    const existing = input.email ? await this.findPartnerByEmail(uid, input.email) : null
    if (existing) {
      await this.execute<boolean>(uid, 'res.partner', 'write', [[existing], values])
      return { action: 'updated', partnerId: existing }
    }

    const partnerId = await this.execute<number>(uid, 'res.partner', 'create', [values])
    return { action: 'created', partnerId }
  }

  /**
   * #2565.10 — les fiches SOCIÉTÉ dont le nom est EXACTEMENT celui-ci.
   *
   * SOURCE — doc publique « External API » d'Odoo 17
   * (odoo.com/documentation/17.0/developer/reference/external_api.html),
   * § « List records » : l'exemple même est
   * `execute_kw(db, uid, password, 'res.partner', 'search', [[['is_company', '=', True]]])` ;
   * `name` est le champ que § « Create records » écrit sur ce modèle ; `limit`
   * est documenté au § « Pagination ». L'opérateur `=` est l'égalité EXACTE des
   * domaines (référence ORM, « Search domains »).
   *
   * `limit: 2` : on ne veut pas la liste, on veut savoir s'il y en a AUCUNE,
   * UNE, ou PLUSIEURS — et dans ce dernier cas l'appelant refuse de choisir.
   * Le nom exact, pas une ressemblance : « on PROPOSE une fusion, on ne
   * fusionne JAMAIS » vaut aussi pour rattacher une facture à un client.
   *
   * NON VÉRIFIÉ sur une instance réelle : un client enregistré comme
   * PARTICULIER (`is_company` faux), ou d'une autre société de l'instance
   * multi-sociétés, n'est pas retrouvé — l'appelant le DIT, il ne le crée pas.
   */
  async findCompanyPartnerIdsByName(uid: number, name: string): Promise<number[]> {
    return this.execute<number[]>(
      uid,
      'res.partner',
      'search',
      [
        [
          ['name', '=', name],
          ['is_company', '=', true],
        ],
      ],
      { limit: 2 },
    )
  }

  /**
   * #4188 — retrouve la fiche SOCIÉTÉ (`res.partner`, `is_company`) par son nom
   * exact, ou crée-la. Plusieurs homonymes : on REFUSE de choisir (même règle
   * que le rattachement d'une facture) — une erreur nommée, jamais un choix au
   * hasard. Seuls les champs CONNUS partent (`website` absent = non envoyé).
   */
  async upsertCompanyPartner(uid: number, input: { name: string; website?: string | null }): Promise<OdooUpsertResult> {
    const ids = await this.findCompanyPartnerIdsByName(uid, input.name)
    if (ids.length > 1) {
      throw new Error(`Plusieurs sociétés « ${input.name} » existent dans l’instance : rien n’a été rattaché.`)
    }
    if (ids[0]) return { action: 'updated', partnerId: ids[0] }
    const values: Record<string, unknown> = { name: input.name, is_company: true }
    if (input.website) values['website'] = input.website
    const partnerId = await this.execute<number>(uid, 'res.partner', 'create', [values])
    return { action: 'created', partnerId }
  }

  /**
   * #2565.10 — dépose une facture CLIENT en BROUILLON, et RIEN d'autre.
   *
   * ─────────────────────────────────────────────────────────────────────
   * CE QUE CETTE MÉTHODE NE FAIT JAMAIS
   * ─────────────────────────────────────────────────────────────────────
   * Elle n'appelle ni `action_post` (le bouton « Confirmer » d'Odoo, qui
   * numérote et comptabilise), ni un envoi au client, ni `write` : UN `create`,
   * point. Bellum n'émet aucune facture — il PRÉPARE un brouillon que
   * l'utilisateur relit et valide lui-même dans Odoo
   * (`odoo-draft-invoice.port.spec.ts` le tient par une LISTE BLANCHE des
   * méthodes appelées).
   *
   * ─────────────────────────────────────────────────────────────────────
   * CHAQUE CHAMP ÉCRIT, ET SA SOURCE (D4 : la doc publique, rien de deviné)
   * ─────────────────────────────────────────────────────────────────────
   * Le modèle et ses champs : le code source publié d'Odoo 17,
   * `addons/account/models/account_move.py` et `account_move_line.py`
   * (github.com/odoo/odoo, branche 17.0). Le protocole : doc « External API »,
   * § « Create records » — « The method creates a single record and returns
   * its database identifier » ; « One2many and Many2many use a special
   * command protocol » (documenté par `odoo.fields.Command`, référence ORM :
   * CREATE = `(0, 0, values)`, triplet transmis en LISTE par RPC).
   *
   *  · `move_type: 'out_invoice'` — sélection `move_type`, valeur
   *    `('out_invoice', 'Customer Invoice')`. OBLIGATOIRE : son défaut est
   *    `"entry"` (une écriture de journal, pas une facture).
   *  · `state: 'draft'` — sélection `state`, `('draft', 'Draft')`, qui est
   *    déjà son défaut. Écrit EXPLICITEMENT : le brouillon est la promesse
   *    faite à l'écran, pas un effet de bord d'un défaut.
   *  · `partner_id` — `Many2one('res.partner')` : l'id RETROUVÉ par
   *    `findCompanyPartnerIdsByName`, jamais un partenaire créé ici.
   *  · `invoice_line_ids` — `One2many('account.move.line')`, en commandes
   *    `[0, 0, {…}]` ; chaque ligne porte `name` (« Label »), `quantity`
   *    (« Quantity ») et `price_unit` (« Unit Price »), trois champs
   *    `readonly=False` du modèle de ligne.
   *
   * CE QUI N'EST VOLONTAIREMENT PAS ÉCRIT : `invoice_date` (Odoo la pose à la
   * validation — la fixer ici déciderait à la place de l'utilisateur), `ref`
   * (« Reference » : imprimée sur la facture du client final, Bellum n'y a
   * rien à dire), les taxes, le journal, le compte de produit, la devise,
   * l'unité : on n'écrit pas ce qu'on ne sait pas, Odoo applique SES défauts.
   *
   * NON VÉRIFIÉ sur une instance réelle — à prouver par la recette (UN
   * brouillon sur l'instance de Louis, autorisé le 18/09) :
   *  · que `/jsonrpc` accepte `create` sur `account.move` avec ce compte
   *    (droits « Facturation » de l'utilisateur de la clé) ;
   *  · le journal de ventes, les taxes et le compte de produit qu'Odoo pose
   *    PAR DÉFAUT sur une ligne sans article ;
   *  · la devise : les montants sont écrits dans la devise de la société
   *    Odoo, que Bellum suppose être l'euro ;
   *  · la version : champs lus sur la branche 17.0 — l'instance peut en
   *    servir une autre, dont les champs ou le point d'entrée diffèrent.
   */
  async createDraftCustomerInvoice(
    uid: number,
    input: { partnerId: number; lines: readonly OdooDraftInvoiceLine[] },
  ): Promise<number> {
    const values = {
      move_type: 'out_invoice',
      state: 'draft',
      partner_id: input.partnerId,
      invoice_line_ids: input.lines.map(line => [
        0,
        0,
        { name: line.label, quantity: line.quantity, price_unit: line.unitPrice },
      ]),
    }
    const id = await this.execute<unknown>(uid, 'account.move', 'create', [values])
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      // Une réponse sans identifiant APRÈS un `create` : le brouillon existe
      // peut-être. `empty` — l'appelant le lit comme « on ne sait pas ».
      throw new OdooCallError('Le service n’a rendu aucun identifiant de brouillon.', 'empty')
    }
    return id
  }

  /**
   * #2561/#2562 — les VENTES CONFIRMÉES de l'instance, en LECTURE SEULE.
   *
   * Pour un client comme François (ESN, Odoo branché), une commande de vente
   * confirmée EST une mission ou un contrat : client, référence, dates, lignes
   * (jours × TJM), montant, état de facturation. Les abonnements d'Odoo
   * (Enterprise, v16+) SONT des `sale.order` : ils arrivent par la même
   * lecture, sans champ propre à l'édition — `is_subscription` n'existe pas
   * en Community, et le demander ferait échouer la lecture entière.
   *
   * DEUX appels `search_read`, rien d'autre — ni `write`, ni `create` : on ne
   * touche jamais l'outil du client ici. Champs listés EXPLICITEMENT (même
   * raison que `PARTNER_FIELDS`). SOURCE : modèles `sale.order` /
   * `sale.order.line` d'Odoo 17 (`addons/sale/models/sale_order.py`,
   * `sale_order_line.py`) ; `state` vaut `sale` une fois confirmée (`done` =
   * verrouillée sur les versions qui l'ont encore). Les lignes de SECTION ou
   * de NOTE (`display_type` posé) ne sont pas des prestations : écartées.
   *
   * NON VÉRIFIÉ sur une instance réelle (voir l'entête du fichier) : la
   * première lecture sur l'instance de François est la recette.
   */
  async listConfirmedSaleOrders(uid: number, limit: number): Promise<OdooSaleOrder[]> {
    const orders = await this.execute<Record<string, unknown>[]>(
      uid,
      'sale.order',
      'search_read',
      [[['state', 'in', ['sale', 'done']]]],
      { fields: [...SALE_ORDER_FIELDS], limit, order: 'date_order desc' },
    )
    if (orders.length === 0) return []

    const ids = orders.map(order => order['id']).filter((id): id is number => typeof id === 'number')
    const lines = await this.execute<Record<string, unknown>[]>(
      uid,
      'sale.order.line',
      'search_read',
      [
        [
          ['order_id', 'in', ids],
          ['display_type', '=', false],
        ],
      ],
      { fields: [...SALE_ORDER_LINE_FIELDS] },
    )

    const linesByOrder = new Map<number, OdooSaleOrderLine[]>()
    for (const line of lines) {
      const orderId = many2oneId(line['order_id'])
      if (orderId === null) continue
      const bucket = linesByOrder.get(orderId) ?? []
      bucket.push({
        label: odooText(line['name']) ?? '',
        quantity: odooNumber(line['product_uom_qty']),
        unitPrice: odooNumber(line['price_unit']),
        subtotal: odooNumber(line['price_subtotal']),
      })
      linesByOrder.set(orderId, bucket)
    }

    return orders.flatMap(order => {
      const id = order['id']
      const reference = odooText(order['name'])
      if (typeof id !== 'number' || !reference) return []
      return [
        {
          id,
          reference,
          partnerName: many2oneLabel(order['partner_id']),
          clientRef: odooText(order['client_order_ref']),
          orderDate: odooDate(order['date_order']),
          commitmentDate: odooDate(order['commitment_date']),
          state: odooText(order['state']) ?? 'sale',
          invoiceStatus: odooText(order['invoice_status']),
          amountUntaxed: odooNumber(order['amount_untaxed']),
          currency: many2oneLabel(order['currency_id']),
          lines: linesByOrder.get(id) ?? [],
        },
      ]
    })
  }

  /** Les partenaires de l'instance, pour une lecture de présence (page par page). */
  async listPartners(uid: number, limit: number, offset = 0): Promise<Record<string, unknown>[]> {
    return this.execute<Record<string, unknown>[]>(uid, 'res.partner', 'search_read', [[]], {
      fields: [...PARTNER_FIELDS],
      limit,
      offset,
      order: 'id asc',
    })
  }

  // ---- #4189 — lecture commune : `search_read`, jamais `write`/`create` -----------------
  // Champs listés EXPLICITEMENT, tri `write_date asc, id asc`, curseur `o:<décalage>`.
  // ⚠️ NON VÉRIFIÉ sur une instance réelle (voir l'entête) : les noms de champs sont ceux
  // des modèles standard d'Odoo 17 (`res.partner`, `crm.lead`, `mail.activity`). Le statut
  // gagné/perdu d'une affaire n'est pas lu (il dépend de la version) ; `done` d'une
  // activité n'est pas dit (une activité faite disparaît de `mail.activity`).

  private async readModel(
    uid: number,
    model: string,
    domain: unknown[][],
    fields: readonly string[],
    opts: CrmReadOptions,
  ): Promise<{ rows: Record<string, unknown>[]; nextAfter: string | null }> {
    const limit = Math.min(Math.max(Math.trunc(opts.limit), 1), 500)
    const offset = opts.after?.startsWith('o:') ? Math.max(Number(opts.after.slice(2)) || 0, 0) : 0
    const full = [...domain]
    if (opts.since) {
      const ms = Date.parse(opts.since)
      if (Number.isNaN(ms)) throw new Error('Odoo read: « depuis » n’est pas une date valide.')
      // Odoo stocke ses horodatages en UTC, sans fuseau : `YYYY-MM-DD HH:MM:SS`.
      full.push(['write_date', '>=', new Date(ms).toISOString().slice(0, 19).replace('T', ' ')])
    }
    const rows = await this.execute<Record<string, unknown>[]>(uid, model, 'search_read', [full], {
      fields: [...fields],
      limit,
      offset,
      order: 'write_date asc, id asc',
    })
    return { rows, nextAfter: rows.length >= limit ? `o:${offset + rows.length}` : null }
  }

  async listContacts(uid: number, opts: CrmReadOptions): Promise<CrmContactPage> {
    const { rows, nextAfter } = await this.readModel(
      uid,
      'res.partner',
      [['is_company', '=', false]],
      ['name', 'email', 'phone', 'function', 'parent_id', 'write_date'],
      opts,
    )
    return {
      contacts: rows.map(row => ({
        id: String(row['id'] ?? ''),
        email: odooText(row['email']),
        // Odoo porte UN nom : il n'est pas découpé en prénom/nom (jamais deviné).
        firstName: null,
        lastName: odooText(row['name']),
        company: many2oneLabel(row['parent_id']),
        jobTitle: odooText(row['function']),
        phone: odooText(row['phone']),
        modifiedAt: odooTimestamp(row['write_date']),
      })),
      nextAfter,
    }
  }

  async listCompanies(uid: number, opts: CrmReadOptions): Promise<CrmCompanyPage> {
    const { rows, nextAfter } = await this.readModel(
      uid,
      'res.partner',
      [['is_company', '=', true]],
      ['name', 'website', 'write_date'],
      opts,
    )
    return {
      companies: rows.map(row => ({
        id: String(row['id'] ?? ''),
        name: odooText(row['name']),
        domain: odooText(row['website']),
        modifiedAt: odooTimestamp(row['write_date']),
      })),
      nextAfter,
    }
  }

  async listDeals(uid: number, opts: CrmReadOptions): Promise<CrmDealPage> {
    const { rows, nextAfter } = await this.readModel(
      uid,
      'crm.lead',
      // SYNC-A — une piste (`type = lead`) n'est pas une affaire.
      [['type', '=', 'opportunity']],
      [
        'name',
        'expected_revenue',
        'stage_id',
        'partner_id',
        'date_deadline',
        'write_date',
        'probability',
        'date_closed',
        'create_date',
        'user_id',
        'lost_reason_id',
      ],
      opts,
    )
    return {
      deals: rows.map(row => {
        const partner = many2oneId(row['partner_id'])
        // #3918.8 — Odoo marque lui-même une affaire GAGNÉE (`action_set_won` pose `probability = 100`
        // et `date_closed`). Une affaire PERDUE est archivée : `search_read` ne la rend pas, aucun
        // signal « perdue » n'en sort (nommé, jamais deviné). ⚠️ Non vérifié sur une instance réelle.
        const won = odooNumber(row['probability']) === 100 && odooTimestamp(row['date_closed']) !== null
        return {
          id: String(row['id'] ?? ''),
          title: odooText(row['name']),
          amount: odooNumber(row['expected_revenue']),
          currency: null,
          stage: many2oneLabel(row['stage_id']),
          status: won ? 'won' : odooNumber(row['probability']) === null ? null : 'open',
          closeDate: odooDate(row['date_deadline']),
          closedAt: won ? odooTimestamp(row['date_closed']) : null,
          createdAt: odooTimestamp(row['create_date']),
          accountId: partner === null ? null : String(partner),
          accountName: many2oneLabel(row['partner_id']),
          modifiedAt: odooTimestamp(row['write_date']),
          // SYNC-A — le miroir.
          ownerId: idText(many2oneId(row['user_id'])),
          stageId: idText(many2oneId(row['stage_id'])),
          lostReason: many2oneLabel(row['lost_reason_id']),
          url: this.recordUrl('crm.lead', row['id']),
        }
      }),
      nextAfter,
    }
  }

  async listActivities(uid: number, opts: CrmReadOptions): Promise<CrmActivityPage> {
    const { rows, nextAfter } = await this.readModel(
      uid,
      'mail.activity',
      [],
      // Jamais `note` (le corps : doctrine c96).
      ['summary', 'activity_type_id', 'date_deadline', 'write_date', 'user_id', 'res_model', 'res_id'],
      opts,
    )
    return {
      activities: rows.map(row => {
        const target = typeof row['res_id'] === 'number' ? String(row['res_id']) : null
        // `res.partner` porte sociétés ET personnes sous une même série d'identifiants : l'id va aux deux
        // liens, et c'est le lien Bellum (`sync_links`, par type) qui tranche — jamais deviné ici.
        const partner = row['res_model'] === 'res.partner' ? target : null
        return {
          id: String(row['id'] ?? ''),
          subject: odooText(row['summary']),
          kind: many2oneLabel(row['activity_type_id']),
          dueAt: odooDate(row['date_deadline']),
          done: null,
          modifiedAt: odooTimestamp(row['write_date']),
          ownerId: idText(many2oneId(row['user_id'])),
          accountId: partner,
          contactId: partner,
          dealId: row['res_model'] === 'crm.lead' ? target : null,
          url: null,
        }
      }),
      nextAfter,
    }
  }

  /** SYNC-A — les propriétaires de fiches : les utilisateurs internes (`res.users`). */
  async listOwners(uid: number, opts: CrmReadOptions): Promise<CrmOwnerPage> {
    const { rows, nextAfter } = await this.readModel(uid, 'res.users', [], ['name', 'email', 'write_date'], opts)
    return {
      owners: rows.map(row => ({
        id: String(row['id'] ?? ''),
        name: odooText(row['name']),
        email: odooText(row['email']),
      })),
      nextAfter,
    }
  }

  private recordUrl(model: string, id: unknown): string | null {
    return typeof id === 'number'
      ? `${this.credentials.baseUrl.replace(/\/+$/, '')}/web#id=${id}&model=${model}&view_type=form`
      : null
  }
}

function idText(id: number | null): string | null {
  return id === null ? null : String(id)
}
