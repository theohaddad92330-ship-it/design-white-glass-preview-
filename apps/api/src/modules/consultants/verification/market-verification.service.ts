import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'
import {
  type MarketVerificationPlan,
  type MarketVerificationReceipt,
  type MarketVerificationStateRow,
  creditCostOf,
  marketVerificationKey,
  planMarketVerification,
  readMarketVerificationStates,
} from '@bellum/contracts'
import { MarketVerificationReceiptEntity } from '../../../database/entities/market-verification-receipt.entity'
import { AccountEntity } from '../../../database/entities/account.entity'

/**
 * #2288.2 / #2288.4 — LA VÉRIFICATION À LA DEMANDE : LE PLAN AVANT, LE REÇU
 * APRÈS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE SERVICE NE FAIT PAS, ET C'EST STRUCTUREL
 * ─────────────────────────────────────────────────────────────────────────────
 * **Il ne débite rien.** Vérifier aujourd'hui, c'est relancer une analyse
 * complète — le geste payant EXISTE déjà, avec son débit, son remboursement en
 * cas d'échec et son écran de confirmation. En ajouter un second ici ferait
 * payer deux fois le même travail, et ferait vivre le prix à deux endroits
 * (GA-26). Ce service tient les deux choses qui manquaient autour du geste : le
 * PLAN annoncé avant, et le REÇU gardé après.
 *
 * **Il n'appelle personne.** Aucun réseau, aucun modèle, aucun fournisseur :
 * `plan` est une lecture de nos propres reçus plus une dérivation de la grille.
 * Elle ne coûte donc rien, et c'est la même frontière que le reste de la
 * mémoire marché (`MARKET_MEMORY_FREE_READS`).
 *
 * **Le REÇU ne joint aucun compte.** Le rapprochement du reçu se fait sur le
 * LIBELLÉ que la mémoire marché a rendu et que l'écran a renvoyé — la même
 * chaîne des deux côtés ; un reçu dit ce que NOUS avons demandé, pas ce qu'une
 * entreprise EST. `resolveKnownSirens` (#2288.4, 18/09 suite) fait une chose
 * différente et bornée : lire, sur nos PROPRES comptes déjà `completed` de cet
 * espace, un SIREN déjà enregistré au nom exact — jamais un rapprochement
 * inventé sur un corpus externe, et jamais une écriture.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-43 — LE COÛT D'ACCÈS NE S'AGRÈGE JAMAIS ENTRE ESPACES
 * ─────────────────────────────────────────────────────────────────────────────
 * Toute lecture porte `workspace_id`. Il n'existe aucun chemin, dans ce
 * fichier, qui lise un reçu sans l'espace : les espaces sont des ESN, donc des
 * concurrents.
 */
@Injectable()
export class MarketVerificationService {
  private readonly logger = new Logger(MarketVerificationService.name)

  constructor(
    @InjectRepository(MarketVerificationReceiptEntity)
    private readonly receipts: Repository<MarketVerificationReceiptEntity>,
    // #2288.4 (18/09, suite) — LECTURE SEULE : le SIREN déjà enregistré d'un
    // compte `completed` au nom exact, pour que le lancement et le devis
    // résolvent la même entité. Jamais une écriture ici (règle #7 : ce module
    // reste retirable sans casser les comptes).
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {}

  /**
   * #2288.4 — LE PLAN, AVANT LE GESTE. Zéro crédit, zéro appel, zéro écriture.
   *
   * Une présélection vide ne lit rien : interroger la base pour rendre un plan
   * à zéro candidat serait une requête pour rien, et `IN ()` est une expression
   * que tout le monde écrit une fois.
   */
  async plan(input: {
    workspaceId: string
    companies: readonly string[]
    now?: Date
  }): Promise<MarketVerificationPlan> {
    const now = input.now ?? new Date()
    const companies = input.companies.map(name => name.trim()).filter(name => name.length > 0)
    const receipts = companies.length === 0 ? [] : await this.liveReceipts(input.workspaceId, companies)
    const knownSirens = await this.resolveKnownSirens(input.workspaceId, companies)
    return planMarketVerification({
      companies,
      receipts,
      now,
      // Le prix vient de la grille partagée, jamais d'un nombre écrit ici.
      fullAnalysisCredits: creditCostOf('account_analysis'),
      knownSirens,
    })
  }

  /**
   * #2288.2 (décision Louis, 18/09/2026) — LES ÉTATS, LISIBLES PAR TOUT MEMBRE.
   *
   * La même lecture de reçus que le plan, décidée par la même fonction
   * (`readMarketVerificationStates`), mais SANS aucun montant : c'est ce qui
   * permet à un `viewer` de voir la colonne « Vérification » sans jamais voir
   * un coût. Zéro crédit, zéro appel réseau, zéro écriture.
   */
  async states(input: {
    workspaceId: string
    companies: readonly string[]
    now?: Date
  }): Promise<MarketVerificationStateRow[]> {
    const companies = input.companies.map(name => name.trim()).filter(name => name.length > 0)
    if (companies.length === 0) return []
    const receipts = await this.liveReceipts(input.workspaceId, companies)
    const knownSirens = await this.resolveKnownSirens(input.workspaceId, companies)
    return readMarketVerificationStates({ companies, receipts, now: input.now ?? new Date(), knownSirens })
  }

  /**
   * #2288.2 — LE REÇU : la CONSERVATION de ce qui a été vérifié.
   *
   * Trois règles, dans cet ordre :
   *  1. **une correction humaine gagne toujours** — un reçu corrigé à la main
   *     n'est ni archivé ni remplacé, quelle que soit sa date. La réponse le
   *     DIT (`keptHumanCorrection`) plutôt que de faire semblant d'avoir écrit ;
   *  2. **on archive, on ne supprime pas** — le reçu vivant précédent prend sa
   *     date d'archivage, il reste lisible ;
   *  3. **le coût inscrit vient de la GRILLE**, jamais du corps de la requête :
   *     un client ne décide pas ce qu'il a payé. Un résultat non mesuré
   *     (`unknown`) n'inscrit AUCUN coût — `null`, jamais `0` (GA-66).
   */
  async record(input: {
    workspaceId: string
    userId: string
    consultantId: string | null
    companyName: string
    outcome: 'verified' | 'unknown'
    now?: Date
  }): Promise<{ keptHumanCorrection: boolean }> {
    const now = input.now ?? new Date()
    const companyName = input.companyName.trim()
    const key = marketVerificationKey(companyName)
    const [live] = await this.liveRows(input.workspaceId, [companyName])

    if (live && live.corrected_by_user_id !== null) {
      // #2288.2 — une correction humaine gagne toujours, quelle que soit sa date.
      return { keptHumanCorrection: true }
    }

    if (live) {
      live.archived_at = now
      await this.receipts.save(live)
    }

    const created = this.receipts.create({
      workspace_id: input.workspaceId,
      user_id: input.userId,
      consultant_id: input.consultantId,
      company_name: companyName,
      company_key: key,
      verified_at: now,
      outcome: input.outcome,
      credits_announced: input.outcome === 'verified' ? creditCostOf('account_analysis') : null,
      corrected_by_user_id: null,
      corrected_at: null,
      archived_at: null,
    })
    await this.receipts.save(created)
    return { keptHumanCorrection: false }
  }

  /** Les reçus VIVANTS de cet espace pour ces libellés — jamais d'un autre espace (GA-43). */
  private async liveRows(
    workspaceId: string,
    companies: readonly string[],
  ): Promise<MarketVerificationReceiptEntity[]> {
    const keys = [...new Set(companies.map(marketVerificationKey))]
    return this.receipts.find({
      where: { workspace_id: workspaceId, company_key: In(keys), archived_at: IsNull() },
    })
  }

  private async liveReceipts(
    workspaceId: string,
    companies: readonly string[],
  ): Promise<readonly MarketVerificationReceipt[]> {
    const rows = await this.liveRows(workspaceId, companies)
    return rows.map(row => ({
      companyName: row.company_name,
      verifiedAt: row.verified_at instanceof Date ? row.verified_at.toISOString() : String(row.verified_at),
      outcome: row.outcome === 'unknown' ? ('unknown' as const) : ('verified' as const),
      correctedByHuman: row.corrected_by_user_id !== null,
      archivedAt: row.archived_at instanceof Date ? row.archived_at.toISOString() : null,
      creditsAnnounced: typeof row.credits_announced === 'number' ? row.credits_announced : null,
    }))
  }

  /**
   * #2288.4 (18/09, suite) — LE SIREN DÉJÀ CONNU, jamais deviné depuis le nom.
   *
   * Un compte `completed` de CET espace (GA-43) dont le nom, normalisé
   * (`marketVerificationKey` — casse et espaces de bord ignorés), correspond à
   * l'un des candidats : c'est un compte que NOUS avons déjà analysé et
   * enregistré, pas un rapprochement inventé sur un corpus externe. Une
   * entreprise sans compte correspondant, ou dont le compte n'a pas de SIREN,
   * n'apparaît simplement pas dans la map — `null` côté appelant, comportement
   * inchangé.
   *
   * Échoue OUVERT (map vide) sur un incident DB : un SIREN qu'on ne sait pas
   * lire ne doit jamais bloquer le plan ou la lecture des états.
   */
  private async resolveKnownSirens(workspaceId: string, companies: readonly string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    if (companies.length === 0) return map
    const wanted = new Set(companies.map(marketVerificationKey))
    let rows: Array<{ company_name: string; siren: string | null }>
    try {
      rows = await this.accounts.find({
        where: { workspace_id: workspaceId, status: 'completed' },
        select: ['company_name', 'siren'],
      })
    } catch (err) {
      this.logger.error('resolveKnownSirens error — un SIREN non lu n’arrête rien', { error: err })
      return map
    }
    for (const row of rows) {
      if (!row.siren) continue
      const key = marketVerificationKey(row.company_name)
      if (wanted.has(key)) map.set(key, row.siren)
    }
    return map
  }
}
