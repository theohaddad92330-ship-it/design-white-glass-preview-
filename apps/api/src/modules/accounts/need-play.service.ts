import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { NeedPlayEntity } from '../../database/entities/need-play.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { ProviderCostService } from '../analytics/provider-cost.service'
import { CreditsService } from '../credits/credits.service'
import { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import { IA_COST_HEADER, IaClient } from '../ia/ia.client'
import { businessUnitScopeClause, type BusinessUnitScopeClause } from './business-unit-scope.clause'
import { buildSourceMaterial, needKey, sanitizeNeedPlay, type NeedPlay } from './need-play-guard'

/** Le besoin tel que l'écran l'envoie — dérivé de `raw_analysis`, pas une ligne. */
type NeedPlayInput = {
  accountId: string
  kind: string
  label: string
  detail?: string | null
  offer?: string | null
  urgency?: string | null
}

type NeedPlayResult =
  | { ok: true; play: NeedPlayEntity; charged: boolean }
  | { ok: false; code: 'not_found' | 'insufficient_credits' | 'ia_failed' }

/** Combien de contacts du dossier partent au modèle — assez pour viser juste,
 *  pas assez pour transformer un plan en export d'annuaire. */
const MAX_CONTACTS = 12

/**
 * Plan d'attaque d'un besoin (décision Louis 31/07, D9 option A).
 *
 * Le point de la décision : les besoins affichés viennent de `raw_analysis`,
 * donc d'une analyse DÉJÀ facturée. Refacturer leur lecture serait vendre deux
 * fois la même chose. Le crédit paie donc une génération neuve — comment
 * attaquer ce besoin — et **une seule fois pour toute l'équipe**.
 *
 * Trois règles d'honnêteté, les mêmes que l'enrichissement et la réécriture de
 * CV : un plan déjà généré se relit **gratuitement**, un solde vide est refusé
 * **avant** l'appel modèle, un échec IA ne débite **rien**.
 */
@Injectable()
export class NeedPlayService {
  private readonly logger = new Logger(NeedPlayService.name)

  constructor(
    @InjectRepository(NeedPlayEntity)
    private readonly plays: Repository<NeedPlayEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    private readonly ia: IaClient,
    private readonly credits: CreditsService,
    private readonly esnProfile: EsnProfileReader,
    @InjectRepository(UserActionEntity)
    private readonly userActions: Repository<UserActionEntity>,
    // Coûts fournisseurs (D19) — best-effort et optionnel : sans le module
    // analytics, la génération marche exactement pareil, elle n'est pas mesurée.
    @Optional() private readonly providerCosts?: ProviderCostService,
  ) {}

  /**
   * Les plans déjà payés par l'équipe — l'écran s'en sert pour savoir quel
   * bouton afficher (« Préparer » à 1 crédit, ou « Voir le plan », gratuit).
   *
   * #2084.24 — LE CLOISONNEMENT D'UNE TABLE QUI NE PORTE PAS LA COLONNE.
   *
   * `need_plays` n'a pas de `business_unit_id` : la borne se lit sur le COMPTE
   * que le plan attaque, par un `EXISTS` corrélé. Un plan NOMME son compte —
   * le laisser sortir révélerait quelles entreprises les autres unités
   * préparent, ce qui est exactement ce que le cloisonnement interdit.
   *
   * ⚠️ Écrite en QueryBuilder et non plus en `find({ where })`, et la FORME de
   * la clause reste celle des listes de comptes (`businessUnitScopeClause`,
   * GA-26) : la recopier ici serait la seconde écriture qui perd sa moitié
   * « OU rattaché à aucun périmètre ». Sans périmètre, aucune clause n'est
   * posée et la requête est celle d'avant.
   */
  async listForWorkspace(
    workspaceId: string,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<NeedPlayEntity[]> {
    const qb = this.plays.createQueryBuilder('play').where('play.workspace_id = :workspaceId', { workspaceId })
    const clause = businessUnitScopeClause(businessUnitScope, 'a.business_unit_id', ':...businessUnitIds')
    if (clause) {
      const ids = businessUnitScope?.businessUnitIds ?? []
      const exists = `EXISTS (SELECT 1 FROM accounts a WHERE a.id = play.account_id AND ${clause})`
      // ⚠️ `andWhere`, jamais `where` : la borne d'ESPACE posée juste au-dessus
      // doit survivre. C'est le risque grave (des espaces sont des concurrents).
      if (ids.length === 0) qb.andWhere(exists)
      else qb.andWhere(exists, { businessUnitIds: [...ids] })
    }
    return qb.orderBy('play.generated_at', 'DESC').getMany()
  }

  async generate(input: NeedPlayInput, workspaceId: string, userId: string): Promise<NeedPlayResult> {
    const account = await this.accounts.findOne({ where: { id: input.accountId, workspace_id: workspaceId } })
    if (!account) return { ok: false, code: 'not_found' }

    const key = needKey(input.accountId, input.kind, input.label)

    // 1. Déjà payé par l'équipe → relecture gratuite. C'est la promesse : le
    //    crédit paie la génération, une fois, pour tout le monde.
    const existing = await this.plays.findOne({ where: { workspace_id: workspaceId, need_key: key } })
    if (existing) return { ok: true, play: existing, charged: false }

    // 2. Solde vide → refus AVANT l'appel modèle : pas d'attente pour rien.
    if (!(await this.credits.hasEnrichmentCredit(userId))) {
      return { ok: false, code: 'insufficient_credits' }
    }

    const profile = await this.esnProfile.resolveProfileData(userId).catch(() => null)
    const knownContacts = await this.contacts.find({
      where: { account_id: input.accountId },
      take: MAX_CONTACTS,
    })

    const need = {
      label: input.label,
      kind: input.kind,
      detail: input.detail ?? '',
      offer: input.offer ?? '',
      urgency: input.urgency ?? '',
    }
    const accountPayload = {
      company_name: account.company_name,
      sector: account.sector,
      context: typeof account.raw_analysis === 'object' ? JSON.stringify(account.raw_analysis).slice(0, 6000) : '',
    }

    let costHeader: string | null = null
    let raw: unknown
    try {
      const envelope = await this.ia.needPlay(
        {
          need,
          account: accountPayload,
          profile,
          contacts: knownContacts.map(c => ({ full_name: c.full_name, role: c.title ?? c.decision_role ?? '' })),
        },
        // Ce que cette génération a coûté, fournisseur par fournisseur.
        { responseHeaderName: IA_COST_HEADER, onResponseHeader: (_name, value) => (costHeader = value) },
      )
      raw = (envelope as { data?: unknown }).data
    } catch (error) {
      // 3. Un échec IA ne persiste rien et ne débite rien.
      this.logger.warn('Need play failed — nothing persisted', {
        error: error instanceof Error ? error.message : String(error),
        accountId: input.accountId,
      })
      return { ok: false, code: 'ia_failed' }
    }

    // Le garde ne fait pas confiance au prompt : toute preuve non citable dans
    // la matière source est retirée, et DITE dans `missing`.
    const content: NeedPlay = sanitizeNeedPlay(
      raw,
      buildSourceMaterial({ profile, account: accountPayload, need }),
      knownContacts.map(c => ({ full_name: c.full_name })),
    )

    const play = await this.plays.save(
      this.plays.create({
        workspace_id: workspaceId,
        account_id: input.accountId,
        need_key: key,
        need_label: input.label,
        content,
        generated_by: userId,
      }),
    )

    // La mesure vient APRÈS le débit : une métrique n'a jamais le droit de
    // retarder ou d'empêcher le geste qu'elle observe.
    await this.credits.consumeEnrichmentCredit(userId, { reason: 'need_play', accountId: input.accountId })
    await this.recordJournalEntry(input, workspaceId, userId)
    await this.providerCosts?.record(this.providerCosts.parseHeader(costHeader), {
      workspaceId,
      userId,
      accountId: input.accountId,
      feature: 'need_play',
    })
    return { ok: true, play, charged: true }
  }

  /**
   * La trace au journal d'activité. Un geste qui DÉBITE doit être retrouvable :
   * c'est là qu'un commercial vérifie ce qu'il a consommé, et un manager ce que
   * son équipe a fait. Le plan d'attaque n'en écrivait aucune — vu en production
   * le 04/08, un plan préparé restait invisible pendant que l'enrichissement du
   * même après-midi y figurait.
   *
   * Best-effort et APRÈS le débit, comme partout ailleurs : une écriture de
   * journal n'a jamais le droit de faire échouer le geste qu'elle observe, ni
   * de rendre au client une erreur pour un plan qu'il a bel et bien reçu.
   */
  private async recordJournalEntry(input: NeedPlayInput, workspaceId: string, userId: string): Promise<void> {
    try {
      await this.userActions.save(
        this.userActions.create({
          user_id: userId,
          workspace_id: workspaceId,
          account_id: input.accountId,
          action_type: 'need_play_generated',
          // `detail` est ce que la ligne affiche sous le libellé : le besoin
          // travaillé, pas un gabarit. Sans lui, le journal dirait « Plan
          // d'attaque » sur toutes les lignes d'un même compte.
          metadata: { detail: input.label },
        }),
      )
    } catch (cause) {
      this.logger.error('need play journal entry failed', {
        error: cause,
        tags: { accountId: input.accountId },
      })
    }
  }
}
