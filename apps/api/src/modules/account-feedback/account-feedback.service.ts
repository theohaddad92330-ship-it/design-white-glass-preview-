import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type {
  AccountFeedbackItem,
  AccountFeedbackTarget,
  AccountFeedbackVerdict,
  AnalysisResearchData,
} from '@bellum/contracts'
import {
  DEFAULT_FEEDBACK_REUSE_SCOPE,
  applyFeedbackCorrections,
  correctionsChangeAnalysis,
  parseStoredPortfolio,
  type FeedbackReuseScope,
} from '@bellum/contracts'
import { IaClient } from '../ia/ia.client'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountFeedbackEntity } from '../../database/entities/account-feedback.entity'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'

/**
 * Bornes de l'assembleur de directives. Le bloc est CITÉ dans les prompts
 * Claude (plan / classification / chat) — un cap dur garde le budget tokens
 * borné quel que soit le volume de feedback accumulé (même esprit que
 * SUMMARY_MAX_CHARS de la mémoire conversationnelle).
 */
const DIRECTIVE_MAX_ITEMS = 20
export const DIRECTIVE_MAX_CHARS = 2400
const NOTE_SNIPPET_MAX = 200
const DIRECTIVES_FETCH_LIMIT = 100

/** Libellé de la surface visée, tel qu'il apparaît dans la directive. */
const TARGET_LABELS: Record<AccountFeedbackTarget, string> = {
  play: 'play',
  contact: 'contact',
  signal: 'signal',
  section: 'section',
  global: 'dossier',
}

/**
 * Directive déterministe par verdict. Le retour est CITÉ, jamais réinterprété :
 * la phrase dit ce que l'utilisateur a signalé et la consigne corrective qui en
 * découle mécaniquement — aucun LLM dans la condensation.
 */
const VERDICT_DIRECTIVES: Record<AccountFeedbackVerdict, string> = {
  utile: "jugé UTILE par l'utilisateur — à conserver / renforcer dans le prochain dossier",
  inutile: "jugé INUTILE / hors sujet par l'utilisateur — ne pas le re-proposer tel quel",
  faux: "signalé FAUX par l'utilisateur — ne pas répéter cette information sans nouvelle source",
  obsolete: "signalé OBSOLÈTE par l'utilisateur — ne pas le réutiliser tel quel",
  // #2076.9-.12 — « Première preuve sur une situation connue » : un axe de
  // JUSTESSE, sur un compte que l'utilisateur connaît déjà, distinct de
  // l'axe d'utilité ci-dessus.
  juste: "jugée JUSTE par l'utilisateur — un compte qu'il connaît déjà confirme cette première analyse",
  partiel: "jugée PARTIELLE par l'utilisateur — une partie seulement de la première analyse est confirmée",
  manquant: "signalée INCOMPLÈTE par l'utilisateur — la première analyse manque une information qu'il connaît",
}

type DirectiveRow = Pick<AccountFeedbackEntity, 'target' | 'target_ref' | 'verdict' | 'note' | 'created_at'>

function snippet(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, NOTE_SNIPPET_MAX)
}

function directiveLine(rowItem: DirectiveRow): string {
  const label = TARGET_LABELS[rowItem.target as AccountFeedbackTarget] ?? rowItem.target
  const directive = VERDICT_DIRECTIVES[rowItem.verdict as AccountFeedbackVerdict] ?? rowItem.verdict
  const ref = (rowItem.target_ref ?? '').trim()
  const refPart = ref ? `« ${ref} » ` : ''
  const note = (rowItem.note ?? '').trim()
  const notePart = note ? ` — retour cité : « ${snippet(note)} »` : ''
  const date = rowItem.created_at.toISOString().slice(0, 10)
  return `- [${label}] ${refPart}${directive}${notePart} (${date})`
}

/**
 * Condense les retours utilisateur d'un compte en « directives de correction »
 * factuelles — DÉTERMINISTE (concat structurée + caps), PAS de LLM :
 *
 * - tri du plus récent au plus ancien (la correction la plus fraîche prime) ;
 * - dédoublonnage par (target, targetRef, verdict) en gardant le plus récent —
 *   trois pouces bas sur le même play = une seule directive ;
 * - caps : {@link DIRECTIVE_MAX_ITEMS} lignes, {@link DIRECTIVE_MAX_CHARS}
 *   caractères, notes citées tronquées à {@link NOTE_SNIPPET_MAX}.
 *
 * Vide (`''`) quand il n'y a aucun retour — les prompts IA restent alors
 * byte-identiques (le bloc n'est pas injecté).
 */
export function assembleFeedbackDirectives(rows: DirectiveRow[]): string {
  const sorted = [...rows].sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
  const seen = new Set<string>()
  const lines: string[] = []
  let budget = 0
  for (const rowItem of sorted) {
    const key = `${rowItem.target}|${(rowItem.target_ref ?? '').trim().toLowerCase()}|${rowItem.verdict}`
    if (seen.has(key)) continue
    seen.add(key)
    const line = directiveLine(rowItem)
    if (lines.length >= DIRECTIVE_MAX_ITEMS) break
    if (budget + line.length + 1 > DIRECTIVE_MAX_CHARS) break
    lines.push(line)
    budget += line.length + 1
  }
  return lines.join('\n')
}

function toWireItem(rowItem: AccountFeedbackEntity): AccountFeedbackItem {
  return {
    id: rowItem.id,
    target: rowItem.target as AccountFeedbackTarget,
    targetRef: rowItem.target_ref,
    verdict: rowItem.verdict as AccountFeedbackVerdict,
    note: rowItem.note,
    createdAt: rowItem.created_at.toISOString(),
  }
}

/**
 * Mémoire de corrections par compte/workspace (feedback loop A2). Capture
 * append-only des retours utilisateur sur un dossier + assembleur déterministe
 * qui les condense en directives réinjectées aux runs suivants (plan /
 * classification / contexte chat). Toutes les écritures estampillent l'identité
 * depuis l'appelant résolu JWT+workspace — jamais une valeur du body.
 */
@Injectable()
export class AccountFeedbackService {
  private readonly logger = new Logger(AccountFeedbackService.name)

  constructor(
    @InjectRepository(AccountFeedbackEntity)
    private readonly feedback: Repository<AccountFeedbackEntity>,
    // Recalcul du score après correction (P1-10). `@Optional()` : absents (specs
    // à constructeur nu), le retour est simplement enregistré comme avant — la
    // correction ne peut jamais faire échouer l'enregistrement du retour.
    @Optional()
    @InjectRepository(AccountEntity)
    private readonly accounts?: Repository<AccountEntity>,
    @Optional() private readonly ia?: IaClient,
    // #2076.13 — la portée de réutilisation de l'ESPACE du retour, lue sur sa
    // ligne canonique (`offer_portfolio.privacy.feedback_reuse`) et RECOPIÉE
    // sur la ligne. `@Optional()` : absent, la ligne garde la portée fermée.
    @Optional()
    @InjectRepository(EsnProfileEntity)
    private readonly esnProfiles?: Repository<EsnProfileEntity>,
  ) {}

  /**
   * #2076.13 — la portée de l'espace AU MOMENT du retour (feedback-reuse.ts :
   * « la ligne porte la portée du moment »). Sans espace, sans portefeuille ou
   * sur une lecture en échec : la plus fermée — un retour se réutilise sur
   * décision, jamais par omission ni par panne.
   */
  private async reuseScopeOf(workspaceId: string | null): Promise<FeedbackReuseScope> {
    if (!workspaceId || !this.esnProfiles) return DEFAULT_FEEDBACK_REUSE_SCOPE
    try {
      const row = await this.esnProfiles.findOne({
        where: { workspace_id: workspaceId, is_workspace_canonical: true, is_current: true },
      })
      return parseStoredPortfolio(row?.offer_portfolio ?? null)?.privacy.feedback_reuse ?? DEFAULT_FEEDBACK_REUSE_SCOPE
    } catch {
      return DEFAULT_FEEDBACK_REUSE_SCOPE
    }
  }

  async create(args: {
    accountId: string
    workspaceId: string | null
    userId: string
    target: AccountFeedbackTarget
    targetRef: string
    verdict: AccountFeedbackVerdict
    note?: string
  }): Promise<AccountFeedbackItem> {
    const rowItem = this.feedback.create({
      account_id: args.accountId,
      workspace_id: args.workspaceId,
      user_id: args.userId,
      target: args.target,
      target_ref: args.targetRef.trim(),
      verdict: args.verdict,
      note: args.note?.trim() || null,
      // La portée de l'espace, recopiée (#2076.13) — la plus fermée par défaut :
      // un retour se réutilise sur décision, jamais par omission. Écrite ICI
      // plutôt que laissée au défaut SQL — le site d'écriture est le seul
      // endroit où quelqu'un se demandera un jour s'il peut l'ouvrir (addendum
      // Stelya §20.1, garde GA-47). Seul le MOTIF (cible + verdict) atteint la
      // recette produit ; la `note` ne sort jamais de l'espace.
      reuse_scope: await this.reuseScopeOf(args.workspaceId),
    })
    const saved = await this.feedback.save(rowItem)

    // Le score suit la correction, immédiatement (§58, P1-10).
    //
    // Le retour servait jusqu'ici à deux choses : mémoriser pour le prochain
    // run, et écarter un contact du graphe. Le reste ne bougeait pas — un
    // contact signalé faux continuait de compter dans l'accessibilité, et la
    // note gardait une justification que l'utilisateur venait de contredire.
    // Signaler une erreur et voir la note figée apprend une seule chose : que
    // le retour ne sert à rien.
    //
    // Déterministe et gratuit : aucun modèle n'est appelé, aucun crédit débité.
    // Corriger une erreur du produit ne doit rien coûter à celui qui la
    // signale. Best-effort : un recalcul raté ne perd pas le retour, qui est
    // déjà enregistré — l'ordre des deux opérations porte cette garantie.
    if (correctionsChangeAnalysis([{ target: args.target, targetRef: args.targetRef, verdict: args.verdict }])) {
      void this.recomputeScore(args.accountId).catch(() => undefined)
    }

    this.logger.log('Account feedback recorded', {
      accountId: args.accountId,
      workspaceId: args.workspaceId,
      target: args.target,
      verdict: args.verdict,
    })
    return toWireItem(saved)
  }

  /**
   * Recalcule les cinq axes sur l'analyse CORRIGÉE et les repersiste.
   *
   * Ne touche pas à `raw_analysis` : la correction est une lecture différente
   * des mêmes faits, pas leur effacement. Un utilisateur qui se trompe en
   * corrigeant doit pouvoir revenir en arrière, et une analyse réécrite ne le
   * permettrait plus.
   */
  private async recomputeScore(accountId: string): Promise<void> {
    if (!this.ia || !this.accounts) return
    const account = await this.accounts.findOne({ where: { id: accountId } })
    const analysis = account?.raw_analysis
    if (!account || !analysis || typeof analysis !== 'object') return

    const corrections = (
      await this.feedback.find({ where: { account_id: accountId }, order: { created_at: 'DESC' }, take: 200 })
    ).map(row => ({
      target: row.target as AccountFeedbackTarget,
      targetRef: row.target_ref ?? '',
      verdict: row.verdict as AccountFeedbackVerdict,
    }))

    const corrected = applyFeedbackCorrections(analysis as Record<string, unknown>, corrections)
    const axes = await this.ia.scoreAxes({ analysis: corrected })

    // `raw_analysis` est typé `AnalysisResearchData | Record<string, never>` :
    // le second membre interdit toute clé, donc un objet enrichi ne s'y range
    // pas sans cast. On type l'ÉCRITURE plutôt que de l'écraser — un `as never`
    // masquerait aussi une erreur réelle si la colonne changeait de forme.
    const nextAnalysis: AnalysisResearchData = {
      ...(analysis as AnalysisResearchData),
      scoreAxes: axes,
    }
    await this.accounts.update({ id: accountId }, { raw_analysis: nextAnalysis })
    this.logger.log('Score recomputed after feedback', { accountId, total: axes.total })
  }

  /** Les retours de CE dossier, plus récents d'abord — scope workspace strict
   *  (jamais ceux d'une autre équipe). Alimente l'état de l'UI. */
  async listForAccount(accountId: string, workspaceId: string): Promise<AccountFeedbackItem[]> {
    const rows = await this.feedback.find({
      where: { account_id: accountId, workspace_id: workspaceId },
      order: { created_at: 'DESC' },
      take: 200,
    })
    return rows.map(toWireItem)
  }

  /**
   * Le bloc « directives de correction » pour un run sur ce compte. Rassemble
   * les feedbacks du WORKSPACE portant sur la même entreprise (un re-run crée
   * un nouveau row `accounts` — la mémoire suit l'entreprise, pas l'id), puis
   * les condense via {@link assembleFeedbackDirectives}.
   *
   * Best-effort : toute erreur de lecture dégrade en `''` (prompt inchangé) —
   * la mémoire ne bloque JAMAIS un lancement d'analyse ni une réponse chat.
   */
  async directivesFor(args: { accountId: string; workspaceId: string | null; companyName: string }): Promise<string> {
    try {
      const qb = this.feedback.createQueryBuilder('f').innerJoin(AccountEntity, 'a', 'a.id = f.account_id')
      if (args.workspaceId && args.companyName.trim()) {
        qb.where('f.workspace_id = :ws', { ws: args.workspaceId }).andWhere('LOWER(a.company_name) = LOWER(:name)', {
          name: args.companyName,
        })
      } else {
        // Compte legacy sans workspace (ou nom vide) : mémoire du compte seul.
        qb.where('f.account_id = :id', { id: args.accountId })
      }
      const rows = await qb.orderBy('f.created_at', 'DESC').limit(DIRECTIVES_FETCH_LIMIT).getMany()
      return assembleFeedbackDirectives(rows)
    } catch (err) {
      this.logger.warn('Account feedback directives lookup failed — running without memory', {
        accountId: args.accountId,
        error: err instanceof Error ? err.message : String(err),
      })
      return ''
    }
  }
}
