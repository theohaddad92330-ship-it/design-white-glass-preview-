import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, MoreThan, Raw, Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { looksLikeEmailAddress, repairedContactName, writableContactName } from './contact-display-name'
import { isContactNameCollision } from './contact-name-collision'

export type ContactEmailNameBackfillOutcome = {
  dryRun: boolean
  workspaceId: string
  /** Fiches de l'espace dont le NOM est une adresse, hors saisies à la main. */
  candidates: number
  /** Ce qui deviendrait la partie locale lisible (marquée dérivée) — simulation. */
  wouldDerive: number
  /** Ce qui deviendrait « Contact à compléter » (rien d'honnête à dériver) — simulation. */
  wouldComplete: number
  /** Ce qui a été écrit — 0 en simulation. */
  updated: number
  /** Nom dérivé déjà porté par une autre fiche du compte : laissé tel quel, compté. */
  collisions: number
  /** Saisies à la main laissées intactes (« une correction humaine gagne toujours »). */
  skippedManual: number
  /** #4586 — noms mal formés (société collée, prénoms répétés) : réparés (réel) ou qui le seraient (simulation). */
  namesRepaired: number
}

const PAGE = 500
const MAX_PAGES = 40

/**
 * #4586 — « un correctif de collecte RATTRAPE l'existant » (décision Louis 18/09/2026) : les fiches DÉJÀ créées avec
 * leur adresse pour nom. Ciblé : UN espace, le seul champ `full_name` (+ le marqueur de dérivation). Idempotent : une
 * fiche réécrite sort du filtre. Simule d'abord (défaut) et compte. Une fiche saisie à la main (`source = 'manual'`)
 * n'est jamais touchée, une collision de nom (clé du compte) est comptée sans arrêter la passe. Sans geste humain il
 * ne part jamais : seul `ContactEmailNameBackfillController` l'appelle.
 */
@Injectable()
export class ContactEmailNameBackfillService {
  private readonly logger = new Logger(ContactEmailNameBackfillService.name)

  constructor(
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(AccountEntity) private readonly accounts?: Repository<AccountEntity>,
  ) {}

  async run(workspaceId: string, options: { dryRun: boolean }): Promise<ContactEmailNameBackfillOutcome> {
    const out: ContactEmailNameBackfillOutcome = {
      dryRun: options.dryRun,
      workspaceId,
      candidates: 0,
      wouldDerive: 0,
      wouldComplete: 0,
      updated: 0,
      collisions: 0,
      skippedManual: 0,
      namesRepaired: 0,
    }
    let cursor: string | null = null
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const rows: ContactEntity[] = await this.contacts.find({
        where: {
          workspace_id: workspaceId,
          full_name: Raw(alias => `${alias} ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$'`),
          ...(cursor ? { id: MoreThan(cursor) } : {}),
        },
        order: { id: 'ASC' },
        take: PAGE,
      })
      for (const contact of rows) {
        if (!looksLikeEmailAddress(contact.full_name)) continue
        if (contact.source === 'manual') {
          out.skippedManual += 1
          continue
        }
        out.candidates += 1
        const { name, derived } = writableContactName(contact.full_name, contact.email)
        if (derived) out.wouldDerive += 1
        else out.wouldComplete += 1
        if (options.dryRun) continue
        const patch = derived
          ? {
              full_name: name,
              raw_data: { ...((contact.raw_data as Record<string, unknown> | null) ?? {}), nameDerivedFromEmail: true },
            }
          : { full_name: name }
        try {
          await this.contacts.update({ id: contact.id, workspace_id: workspaceId }, patch)
          out.updated += 1
        } catch (cause) {
          if (!isContactNameCollision(cause)) throw cause
          out.collisions += 1
        }
      }
      if (rows.length < PAGE) break
      cursor = rows[rows.length - 1]?.id ?? null
    }
    await this.repairMalformedNames(workspaceId, options.dryRun, out)
    this.logger.log(`#4586 rattrapage ${JSON.stringify({ ...out, workspaceId: undefined })}`)
    return out
  }

  /**
   * #4586 — « Prénom Nom <Société> » et « Prénom, Prénom, Prénom NOM » : la société n'est retirée que si elle égale le
   * nom du compte de la fiche. L'ancien nom est gardé (`raw_data.nameBeforeRepair`), une saisie à la main n'est jamais
   * touchée, la fiche réparée sort du filtre (idempotent).
   */
  private async repairMalformedNames(
    workspaceId: string,
    dryRun: boolean,
    out: ContactEmailNameBackfillOutcome,
  ): Promise<void> {
    let cursor: string | null = null
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const rows: ContactEntity[] = await this.contacts.find({
        where: {
          workspace_id: workspaceId,
          // Pré-filtre SQL LARGE (virgule, ou trois mots et plus) : la décision revient à `repairedContactName`,
          // qui compare au nom du compte. Pas de sous-requête corrélée ici : l'alias que TypeORM passe à `Raw`
          // n'est pas quoté (`ContactEntity.full_name`) et Postgres le replie en minuscules — « missing
          // FROM-clause entry for table "contactentity" » en prod le 01/11/2026.
          full_name: Raw(
            alias =>
              `(${alias} LIKE '%,%' OR ${alias} ~ '[^[:space:]]+[[:space:]]+[^[:space:]]+[[:space:]]+[^[:space:]]+')`,
          ),
          ...(cursor ? { id: MoreThan(cursor) } : {}),
        },
        order: { id: 'ASC' },
        take: PAGE,
      })
      const accountIds = [...new Set(rows.map(r => r.account_id).filter((id): id is string => !!id))]
      const companies = new Map<string, string>()
      if (this.accounts && accountIds.length > 0) {
        for (const a of await this.accounts.find({ where: { id: In(accountIds) }, select: ['id', 'company_name'] }))
          companies.set(a.id, a.company_name)
      }
      for (const contact of rows) {
        if (contact.source === 'manual') continue
        const repaired = repairedContactName(contact.full_name, companies.get(contact.account_id ?? ''))
        if (!repaired || repaired === contact.full_name) continue
        out.namesRepaired += 1
        if (dryRun) continue
        const raw = (contact.raw_data as Record<string, unknown> | null) ?? {}
        try {
          await this.contacts.update(
            { id: contact.id, workspace_id: workspaceId, full_name: contact.full_name },
            { full_name: repaired, raw_data: { ...raw, nameBeforeRepair: contact.full_name } },
          )
        } catch (cause) {
          if (!isContactNameCollision(cause)) throw cause
          out.collisions += 1
          out.namesRepaired -= 1
        }
      }
      if (rows.length < PAGE) break
      cursor = rows[rows.length - 1]?.id ?? null
    }
  }
}
