import { BadRequestException, ForbiddenException, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  type OfferPortfolio,
  type OfferPortfolioPatch,
  type ResolvedPortfolio,
  EMPTY_STRUCTURED_LEXICON,
  lexiconOverridesFingerprint,
  lexiconViolations,
  offerPortfolioSchema,
  resolvedPortfolio,
} from '@bellum/contracts'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { EsnProfileWorkspaceResolver } from './esn-profile-workspace.resolver'

/**
 * Le portefeuille d'offre d'un ESPACE (addendum Stelya §5).
 *
 * C'est la configuration de la SOCIÉTÉ, pas une préférence de membre : ce que
 * l'entreprise vend, à quels secteurs, sur quels sites, avec quel vocabulaire.
 * Il vit donc sur la ligne CANONIQUE de l'espace et s'édite avec
 * `team:manage`, comme le reste du profil d'entreprise — un commercial ne
 * redéfinit pas seul le marché de sa boîte.
 *
 * Deux propriétés portent l'honnêteté de la lecture :
 *
 * 1. **Aucun portefeuille enregistré ≠ portefeuille vide.** `read()` le DIT
 *    (`source: 'legacy'`) au lieu de rendre des défauts qu'un écran
 *    présenterait comme une configuration choisie.
 * 2. **Une forme illisible ne lève jamais.** Un objet écrit par un build plus
 *    récent, ou abîmé, dégrade vers les défauts du contrat : un profil
 *    illisible ferait tomber toutes les analyses de l'espace, ce qu'aucun
 *    réglage ne mérite.
 */
@Injectable()
export class OfferPortfolioService {
  private readonly logger = new Logger(OfferPortfolioService.name)

  constructor(
    @InjectRepository(EsnProfileEntity)
    private readonly profiles: Repository<EsnProfileEntity>,
    private readonly resolver: EsnProfileWorkspaceResolver,
    @Optional()
    @InjectRepository(UserActionEntity)
    private readonly userActions?: Repository<UserActionEntity>,
  ) {}

  async read(userId: string): Promise<ResolvedPortfolio> {
    const context = await this.resolver.resolveContext(userId)
    const row = context.canonicalRow ?? context.ownRow
    return resolvedPortfolio({
      portfolio: this.parseStored(row?.offer_portfolio ?? null),
      offer_domain: (row?.offer_domain ?? null) as ResolvedPortfolio['company_type'],
      offer_domains: row?.offer_domains ?? [],
    })
  }

  /**
   * Écriture PARTIELLE : le patch se pose sur ce qui est déjà enregistré.
   *
   * Un remplacement complet obligerait chaque écran à renvoyer l'objet entier,
   * et le premier qui l'oublierait remettrait en silence le lexique ou la
   * politique de site aux défauts — la panne la plus difficile à relier à son
   * geste, parce qu'elle se voit des semaines plus tard dans un message généré.
   */
  async write(userId: string, patch: OfferPortfolioPatch): Promise<ResolvedPortfolio> {
    const context = await this.resolver.resolveContext(userId)
    // Chemin historique (aucun espace résolu) : la personne édite sa propre
    // ligne, comme le reste du profil.
    const target = context.workspaceId ? context.canonicalRow : context.ownRow
    if (context.workspaceId && !context.canManageCompany) {
      throw new ForbiddenException(
        "Le portefeuille d'offre est celui de la société : il demande le droit de gérer l'équipe.",
      )
    }
    const row = target ?? context.ownRow
    if (!row) {
      throw new ForbiddenException("Aucun profil à mettre à jour : complète d'abord ton profil d'entreprise.")
    }

    const stored = this.parseStored(row.offer_portfolio)
    const merged = offerPortfolioSchema.parse({ ...(stored ?? {}), ...patch })
    merged.lexicon = this.nextLexiconVersion(stored?.lexicon ?? EMPTY_STRUCTURED_LEXICON, merged.lexicon, userId)
    this.assertLexiconHolds(merged)
    await this.profiles.update({ id: row.id }, { offer_portfolio: merged })
    void this.recordPortfolioUpdated(userId, context.workspaceId, Object.keys(patch))
    return this.read(userId)
  }

  /**
   * Ce qu'un terme INTERDIT empêche, côté serveur (D17).
   *
   * L'écran prévient avant le clic, mais un client ne se croit pas sur parole :
   * la règle est REFUSÉE ici, sur le lexique FUSIONNÉ — sinon un patch qui
   * n'envoie que `forbidden_terms` passerait sans jamais rencontrer les termes
   * préférés déjà enregistrés, et l'interdit ne mordrait que le jour où
   * quelqu'un rouvre l'écran.
   *
   * La formulation dit ce qu'il faut faire, pas seulement ce qui est refusé :
   * une garde qui refuse sans proposer se contourne.
   */
  private assertLexiconHolds(portfolio: OfferPortfolio): void {
    const violations = lexiconViolations(portfolio.lexicon, portfolio.forbidden_terms)
    if (violations.length === 0) return
    const messages = violations.map(violation =>
      violation.code === 'preferred_is_forbidden'
        ? `« ${violation.term} » est à la fois le mot que tu préfères et un mot que tu t'interdis.`
        : `Tu interdis « ${violation.term} », qui est le mot du produit : donne le terme à employer à la place, sinon il reste à l'écran.`,
    )
    throw new BadRequestException(messages.join(' '))
  }

  /**
   * #2862 (#2437.8) — `version`/`updatedAt`/`updatedBy` du lexique, calculés
   * ici, jamais fournis par l'écran (un client ne se croit pas sur parole pour
   * son propre historique, ni pour signer la modification d'un autre).
   *
   * Incrémente UNIQUEMENT quand `overrides` change RÉELLEMENT
   * (`lexiconOverridesFingerprint`, indépendante de l'ordre) : le lexique n'est
   * qu'UN champ du portefeuille d'offre, et une écriture qui ne touche que le
   * type de société ou les géographies ciblées ne doit pas faire croire à une
   * modification du vocabulaire qui n'a pas eu lieu.
   */
  private nextLexiconVersion(
    previous: OfferPortfolio['lexicon'],
    next: OfferPortfolio['lexicon'],
    userId: string,
  ): OfferPortfolio['lexicon'] {
    const unchanged = lexiconOverridesFingerprint(previous.overrides) === lexiconOverridesFingerprint(next.overrides)
    if (unchanged) {
      return {
        overrides: next.overrides,
        version: previous.version,
        updatedAt: previous.updatedAt,
        updatedBy: previous.updatedBy,
      }
    }
    return {
      overrides: next.overrides,
      version: (previous.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
    }
  }

  /**
   * Trace au journal partagé de l'espace — best-effort.
   *
   * Le portefeuille est la configuration de la SOCIÉTÉ : il s'applique à tous
   * les membres, et le journal existe précisément pour qu'une modification
   * partagée soit rattachable à quelqu'un. Trouvé en recette live : l'écran
   * enregistrait sans laisser aucune trace, là où la moindre réponse
   * d'onboarding en laisse une.
   *
   * Ne bloque JAMAIS l'écriture : une trace manquante est un regret, un réglage
   * perdu est une panne.
   */
  private async recordPortfolioUpdated(userId: string, workspaceId: string | null, fields: string[]): Promise<void> {
    if (!this.userActions || !workspaceId || fields.length === 0) return
    try {
      await this.userActions.insert({
        user_id: userId,
        workspace_id: workspaceId,
        account_id: null,
        contact_id: null,
        action_type: 'profile_updated',
        // Les CLÉS touchées, jamais leurs valeurs : le lexique d'un espace est
        // sa donnée, le journal n'a pas à le recopier.
        metadata: { detail: "Portefeuille d'offre", fields },
      })
    } catch (error) {
      this.logger.warn("Trace du portefeuille non écrite — l'enregistrement, lui, est passé", { error })
    }
  }

  /** Une valeur stockée illisible vaut « aucun portefeuille », jamais une
   *  exception — et c'est journalisé pour que le trou se voie. */
  private parseStored(stored: unknown): OfferPortfolio | null {
    if (!stored || typeof stored !== 'object') return null
    const parsed = offerPortfolioSchema.safeParse(stored)
    if (parsed.success) return parsed.data
    this.logger.error("Portefeuille d'offre illisible en base — lecture dégradée vers les défauts", {
      tags: { 'profile.op': 'offer_portfolio_parse' },
    })
    return null
  }
}
