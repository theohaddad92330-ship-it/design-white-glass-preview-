import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  SHARE_REDACTED_FIELDS,
  SHARE_SECTION_EXTRA_REDACTED_FIELDS,
  type AccountShareSection,
  type AccountSharePayload,
} from '@bellum/contracts'
import { failure, success, type Result } from '@bellum/utils'
import { AccountEntity } from '../../database/entities/account.entity'
import { WorkspaceBrandService } from '../workspace/workspace-brand.service'
import { AccountShareService } from './account-share.service'

export type SharePublicFailure = { code: 'not_found' | 'expired'; message: string }

/**
 * Resolves a public share slug to its dossier payload. The query selects
 * only the columns the public viewer needs — no `user_id`, no internal IDs,
 * no generated messages, no raw analysis data — to keep the wire small and
 * avoid leaking internal context.
 *
 * #2125.23/.26 — Décision de Louis, 14/09/2026 20:35 : le lien reste public
 * (pas de jeton, pas de rôle), mais ce chemin ne rend JAMAIS le chiffre
 * d'affaires ni les contacts nominatifs — voir `SHARE_REDACTED_FIELDS`
 * (@bellum/contracts). C'est pourquoi cette classe ne dépend plus de
 * `ContactEntity` : la table n'est même pas interrogée pour ce chemin.
 */
@Injectable()
export class SharePublicService {
  constructor(
    private readonly shareService: AccountShareService,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly brands: WorkspaceBrandService,
  ) {}

  async resolveBySlug(slug: string): Promise<Result<AccountSharePayload, SharePublicFailure>> {
    const share = await this.shareService.findActiveBySlug(slug)
    if (!share) {
      return failure({ code: 'not_found', message: 'Lien de partage invalide ou expiré' })
    }

    // #2125.23 — `revenue` n'est même pas sélectionné : une donnée qui ne
    // quitte jamais Postgres pour ce chemin ne peut pas fuiter par un futur
    // oubli de mapping en aval.
    const account = await this.accounts.findOne({
      where: { id: share.account_id },
      select: [
        'id',
        'company_name',
        'sector',
        'employees',
        'headquarters',
        'website',
        'priority_score',
        'priority_justification',
      ],
    })
    if (!account) {
      return failure({ code: 'not_found', message: 'Compte introuvable' })
    }

    // #2914 (#2128.11) — un lien émis avant cette colonne (migration
    // additive, défaut 'full') porte `section: undefined` en mémoire tant
    // que la valeur SQL par défaut n'a pas été relue ; traité comme 'full',
    // son comportement historique.
    const section: AccountShareSection = (share.section as AccountShareSection | undefined) ?? 'full'
    const sectionRedacted = SHARE_SECTION_EXTRA_REDACTED_FIELDS[section]
    const isRedacted = (field: string) => sectionRedacted.some(f => f.field === field)

    return success({
      account: {
        company_name: account.company_name,
        sector: isRedacted('account.sector') ? null : account.sector,
        employees: isRedacted('account.employees') ? null : account.employees,
        // #2125.23 — le chiffre d'affaires ne voyage jamais sur un lien
        // partagé public. `null` ici est un MASQUAGE délibéré, pas une
        // absence de mesure : voir SHARE_REDACTED_FIELDS et `redactedFields`
        // ci-dessous, que lit l'écran public pour ne jamais confondre les
        // deux (doctrine « non mesuré n'est jamais 0 »).
        revenue: null,
        headquarters: isRedacted('account.headquarters') ? null : account.headquarters,
        website: isRedacted('account.website') ? null : account.website,
        priority_score: account.priority_score,
        priority_justification: account.priority_justification,
      },
      // #2125.26 — les contacts sont nominatifs (nom, e-mail, téléphone,
      // poste) : ils n'apparaissent jamais sur le rendu public, donc la
      // table `contacts` n'est même pas interrogée pour ce chemin.
      contacts: [],
      expiresAt: share.expires_at.toISOString(),
      /*
       * ⚠️ La marque vient de l'espace du PARTAGE, pas de l'hôte : ce lien
       * s'ouvre sur notre domaine dans l'immense majorité des cas, et c'est
       * précisément le document qu'un client envoie à SON client.
       */
      brand: await this.brands.getForWorkspace(share.workspace_id),
      // #2125.23/.26 — dérivé de SHARE_REDACTED_FIELDS, pas recopié : un
      // champ ajouté à la liste apparaît ici sans second endroit à tenir à
      // jour (GA-26). #2914 (#2128.11) — complété par les champs que CETTE
      // section retire en plus, si elle en retire.
      redactedFields: [...SHARE_REDACTED_FIELDS, ...sectionRedacted].map(f => f.field),
      section,
    })
  }
}
