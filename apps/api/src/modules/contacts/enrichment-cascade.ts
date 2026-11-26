/**
 * #4106 — la mécanique de la cascade d'enrichissement d'un contact :
 *  - un PLAFOND de coût par contact (un seul réglage, `ENRICHMENT_COST_CEILING_CENTS`, GA-26) ;
 *  - un JOURNAL INTERNE `tried` / `served_by` (stocké dans `contacts.enrichment_trace`,
 *    colonne `select: false` — jamais affiché, nos fournisseurs ne se nomment jamais à l'écran) ;
 *  - une étape GRATUITE en tête : des patterns d'e-mail générés comme CANDIDATS.
 *
 * Doctrine : jamais de donnée inventée. Un candidat n'est un e-mail qu'une fois VÉRIFIÉ
 * (vérification SMTP = #4107, `smtp-email-verifier.ts` ; sans configuration c'est
 * `NOOP_EMAIL_VERIFIER`, qui ne vérifie rien : aucun candidat n'est alors servi).
 */

type TriedOutcome = 'hit' | 'miss' | 'error' | 'skipped_budget'

type TriedEntry = {
  provider: string
  outcome: TriedOutcome
  /** Coût imputé au plafond, en centimes d'euro (tarif public par champ, cf. PROVIDER_UNIT_COST). */
  cost: number
  /** Statut HTTP de l'échec, quand il y en a un. */
  status?: number
  /** L'adresse rendue correspondait à un candidat du pattern (indice, jamais servi seul). */
  pattern_confirmed?: true
}

type CascadeStop = 'budget' | 'client_error'

type CascadeTrace = {
  served_by: string | null
  tried: TriedEntry[]
  ceiling: number | null
  spent: number
  stopped: CascadeStop | null
}

export type CascadeField = 'email' | 'phone'

const ALL_FIELDS: readonly CascadeField[] = ['email', 'phone']

/**
 * Coût unitaire d'un appel, en centimes d'euro, SÉPARÉ par champ (un fournisseur absent d'un
 * champ ne le facture pas : Dropcontact et Hunter ne rendent pas de téléphone). Tarifs PUBLICS
 * relevés le 13/10/2026, plus petit palier mensuel — sources : dropcontact.com/pricing,
 * hunter.io/pricing, lusha.com/pricing, kaspr.io/pricing, fullenrich.com/pricing, consultées le
 * 13/10/2026, À VALIDER PAR DEVIS (décision Louis 13/10, #4106). Ce n'est pas une facture : le coût
 * réel reste journalisé en D19. Apollo / SalesQL : inchangés (coût imputé par le service IA).
 * Un fournisseur absent de la table est gratuit (étapes internes).
 */
export const PROVIDER_UNIT_COST: Readonly<Record<string, Readonly<Partial<Record<CascadeField, number>>>>> = {
  apollo: {},
  email_pattern: {},
  smtp_check: {},
  dropcontact: { email: 5.8 },
  hunter: { email: 2.5 },
  lusha: { email: 11, phone: 54 },
  kaspr: { email: 0, phone: 59 },
  fullenrich: { email: 5.5, phone: 55 },
}

/** Coût d'un appel pour les champs RÉELLEMENT demandés (somme des champs que le fournisseur facture). */
export function providerCost(provider: string, fields: readonly CascadeField[] = ALL_FIELDS): number {
  const table = PROVIDER_UNIT_COST[provider]
  if (!table) return 0
  return fields.reduce((sum, field) => sum + (table[field] ?? 0), 0)
}

/**
 * LE point de lecture du plafond (GA-26). Décision Louis 13/10/2026 : PAS DE PLAFOND pour l'instant
 * (les téléphones à 54-59 c étaient bloqués par l'ancien défaut de 20 c). Variable absente,
 * illisible ou négative ⇒ `null` = aucun plafond ; le plafond ne s'applique que s'il est posé.
 * 0 est permis : aucun appel payant.
 */
export function readCostCeiling(): number | null {
  const raw = (process.env['ENRICHMENT_COST_CEILING_CENTS'] ?? '').trim()
  if (raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Un 4xx est « de notre fait » (clé refusée, requête mal formée, quota payé épuisé) : insister
 * auprès des suivants ne règle rien, on s'arrête et on le logue. 429, 408 et 404 (« pas de
 * résultat » chez certains fournisseurs) ne sont pas de notre fait ; les 5xx non plus.
 */
export function isClientFault(status: number | undefined): boolean {
  return status !== undefined && status >= 400 && status < 500 && ![404, 408, 429].includes(status)
}

export class CascadeLedger {
  readonly tried: TriedEntry[] = []
  spent = 0
  stopped: CascadeStop | null = null
  private pendingStatus: number | undefined

  constructor(readonly ceiling: number | null) {}

  /**
   * Avant CHAQUE fournisseur : peut-on l'appeler ? Une étape gratuite passe toujours. Un
   * payant est refusé si la cascade est arrêtée, ou si cumul + coût unitaire > plafond — le
   * refus est journalisé et arrête tous les payants suivants.
   */
  gate(provider: string, fields: readonly CascadeField[] = ALL_FIELDS): boolean {
    const cost = providerCost(provider, fields)
    if (cost === 0) return true
    if (this.stopped) return false
    // Pas de plafond posé ⇒ la cascade ne s'arrête jamais pour budget (Louis 13/10).
    if (this.ceiling !== null && this.spent + cost > this.ceiling) {
      this.stopped = 'budget'
      this.tried.push({ provider, outcome: 'skipped_budget', cost: 0 })
      return false
    }
    return true
  }

  /** Mémorise le statut HTTP d'un échec que l'appelant ne peut pas passer à `record` directement. */
  noteStatus(status: number | undefined): void {
    this.pendingStatus = status
  }

  record(
    provider: string,
    outcome: Exclude<TriedOutcome, 'skipped_budget'>,
    extra: { status?: number; patternConfirmed?: boolean; fields?: readonly CascadeField[] } = {},
  ): void {
    const status = extra.status ?? this.pendingStatus
    this.pendingStatus = undefined
    // Un appel en erreur n'est pas facturé : seul un appel qui a répondu compte au plafond.
    const cost = outcome === 'error' ? 0 : providerCost(provider, extra.fields)
    this.spent += cost
    this.tried.push({
      provider,
      outcome,
      cost,
      ...(status !== undefined ? { status } : {}),
      ...(extra.patternConfirmed ? { pattern_confirmed: true as const } : {}),
    })
    if (outcome === 'error' && isClientFault(status)) this.stopped = 'client_error'
  }

  toTrace(servedBy: string | null): CascadeTrace {
    return {
      served_by: servedBy,
      tried: this.tried,
      ceiling: this.ceiling,
      spent: this.spent,
      stopped: this.stopped,
    }
  }
}

// ── Étape gratuite : patterns d'e-mail ────────────────────────────────────

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function cleanDomain(raw: string | undefined): string | null {
  const domain = (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0]
  return domain && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) ? domain : null
}

/** Les adresses PLAUSIBLES d'une personne sur le domaine de son entreprise. Des candidats, pas des faits. */
export function emailPatternCandidates(input: { firstName?: string; lastName?: string; domain?: string }): string[] {
  const first = slug(input.firstName ?? '')
  const last = slug(input.lastName ?? '')
  const domain = cleanDomain(input.domain)
  if (!first || !last || !domain) return []
  const locals = [`${first}.${last}`, `${first[0]}.${last}`, first, `${first}${last}`, `${first[0]}${last}`, last]
  return [...new Set(locals)].map(local => `${local}@${domain}`)
}

export type EmailVerdict = 'valid' | 'invalid' | 'unknown' | 'unverified'

/** Vérificateur d'e-mail deviné (#4107 : `SmtpEmailVerifier`, ou `NOOP_EMAIL_VERIFIER`). */
export interface EmailVerifier {
  verify(email: string): Promise<EmailVerdict>
}

/** Sans configuration SMTP : ne vérifie rien, donc ne prouve rien. */
export const NOOP_EMAIL_VERIFIER: EmailVerifier = { verify: async () => 'unverified' }

/**
 * Le premier candidat dont le vérificateur dit « valid ». Tout autre verdict — y compris une
 * panne du vérificateur — ne sert RIEN : jamais de donnée inventée.
 */
export async function servableFreeEmail(
  candidates: readonly string[],
  verifier: EmailVerifier,
  options: { limit?: number } = {},
): Promise<{ email: string | null; candidates: number }> {
  for (const candidate of candidates.slice(0, options.limit ?? candidates.length)) {
    try {
      if ((await verifier.verify(candidate)) === 'valid') return { email: candidate, candidates: candidates.length }
    } catch {
      // un vérificateur en panne ne prouve rien
    }
  }
  return { email: null, candidates: candidates.length }
}
