import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { DataSource } from 'typeorm'
import {
  contactSourceSchema,
  sharedCompanyKey,
  sharedEmploymentOfLifecycle,
  sharedFactOriginOfSource,
} from '@bellum/contracts'
import { Correlated } from '../../correlation-id/background-correlation'
import { ContactEntity } from '../../database/entities/contact.entity'
import {
  sharedErasedFingerprints,
  upsertSharedCompanyPeople,
  type SharedSourceContact,
} from './shared-company-facts-writes'

/**
 * #3989 (suite de #3971 d, Louis 11/10/2026 — `c94_base_commune_capitalise_tout`)
 * — LE SEUL ÉCRIVAIN RÉEL DES FAITS SOCIÉTÉ PARTAGÉS.
 *
 * Chaque nuit, il relit les fiches de tous les espaces RÉELS (`is_demo =
 * false`) dont la source a une réponse écrite (`sharedFactOriginOfSource` :
 * Bellum ou utilisateur), les regroupe par société commune (SIREN, sinon
 * domaine — jamais une raison sociale) et les verse par
 * `upsertSharedCompanyPeople` : Bellum tel quel, utilisateur anonymisé. Aucun
 * identifiant d'espace n'est lu au-delà du filtre de démonstration, aucun
 * n'est écrit.
 *
 * Rien n'est supprimé de la base commune par ce passage (« on archive, on ne
 * supprime pas ») : seule la demande d'effacement d'une personne en retire une
 * ligne (`purgeErasedPersonFromSharedBase`), et son empreinte l'empêche de
 * revenir ici.
 */

type SourceRow = {
  siren: string | null
  website: string | null
  source: string | null
  full_name: string | null
  title: string | null
  linkedin_url: string | null
  apollo_id: string | null
  human_corrected: boolean | null
  email: string | null
  phone: string | null
  human_coordinates: boolean | null
  /** #4286.15.b — `historique` = la personne a quitté la société. */
  lifecycle_state?: string | null
  /** #4286.15.b — quand la fiche est passée à l'historique (journal des transitions), si on le sait. */
  left_at?: string | Date | null
}

type SharedCompanyFactsReport = { companies: number; facts: number; mode: 'incremental' | 'full' }

/** #3989.c — une fiche non touchée depuis cette fenêtre a déjà été versée par un passage précédent. */
const INCREMENTAL_WINDOW_MS = 48 * 3_600_000

/** Dimanche à Paris : le jour du passage COMPLET, qui rattrape ce que l'incrément aurait pu manquer. */
function isFullPassDay(now: Date): boolean {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Europe/Paris' }).format(now) === 'Sun'
}

/** Les sources qui ont une réponse écrite — dérivées de la règle et de l'énumération, jamais recopiées (GA-26). */
const SHAREABLE_SOURCES = contactSourceSchema.options.filter(source => sharedFactOriginOfSource(source) !== null)

@Injectable()
export class SharedCompanyFactsService {
  private readonly logger = new Logger(SharedCompanyFactsService.name)

  constructor(private readonly dataSource: DataSource) {}

  /**
   * 02:53 Europe/Paris — après le recalcul des agrégats (02:41), à l'écart des
   * balayages de 03:13 et 04:17.
   *
   * SANS VERROU : chaque écriture est un `INSERT … ON CONFLICT DO UPDATE` sur
   * la clé unique `(scope, company_key, fact_key)` qui ne fait que COMPLÉTER une
   * ligne (poste ou profil manquant, union d'empreintes) — deux réplicas au
   * même tick écrivent les mêmes lignes, sans doublon ni perte ; le pire cas
   * est un passage fait deux fois, et le module reste autonome (règle 7).
   */
  @Cron('53 2 * * *', { name: 'shared-company-facts', timeZone: 'Europe/Paris' })
  @Correlated('cron:shared_base.company_facts')
  async runNightly(): Promise<void> {
    try {
      const report = await this.harvest()
      this.logger.log(
        `Base commune — ${report.facts} fait(s) société versé(s) pour ${report.companies} société(s) (${report.mode})`,
        {
          tags: { 'shared_base.op': 'company_facts' },
        },
      )
    } catch (error) {
      this.logger.error('Base commune — versement des faits société en échec, base de la veille conservée', {
        error,
        tags: { 'shared_base.op': 'company_facts' },
      })
    }
  }

  /**
   * #3989.c — INCRÉMENTAL en semaine (fiches modifiées depuis 48 h : l'écriture
   * ne fait que compléter, une fiche inchangée a déjà été versée), COMPLET le
   * dimanche ou sur demande (`full`) : une panne de plus de deux jours ou une
   * fiche créée sans bump de `updated_at` est rattrapée dans la semaine.
   */
  async harvest(now: Date = new Date(), options: { full?: boolean } = {}): Promise<SharedCompanyFactsReport> {
    const mode = options.full || isFullPassDay(now) ? 'full' : 'incremental'
    // Par l'entité (GA-405 : aucune lecture brute de plus sur la table des fiches).
    const query = this.dataSource
      .getRepository(ContactEntity)
      .createQueryBuilder('c')
      .innerJoin('accounts', 'a', 'a.id = c.account_id AND a.workspace_id = c.workspace_id')
      .innerJoin('workspaces', 'w', 'w.id = c.workspace_id')
      .select([
        'a.siren AS siren',
        'a.website AS website',
        'c.source AS source',
        'c.full_name AS full_name',
        'c.title AS title',
        'c.linkedin_url AS linkedin_url',
        "c.raw_data->>'apolloId' AS apollo_id",
        // #3989.b — le nom ou le poste a été corrigé à la main (provenance `human`).
        `EXISTS (SELECT 1 FROM field_provenance fp
           WHERE fp.entity_type = 'contact' AND fp.entity_id = c.id
             AND fp.field IN ('fullName', 'title') AND fp.source = 'human') AS human_corrected`,
        // #3989.7 — les coordonnées, et si l'une a été saisie à la main (elle reste alors dans l'espace).
        'c.email AS email',
        'c.phone AS phone',
        `EXISTS (SELECT 1 FROM field_provenance fp
           WHERE fp.entity_type = 'contact' AND fp.entity_id = c.id
             AND fp.field IN ('email', 'phone') AND fp.source = 'human') AS human_coordinates`,
        // #4286.15.b — l'état employeur : une fiche passée à l'historique est un ANCIEN, daté par le journal.
        'c.lifecycle_state AS lifecycle_state',
        `(SELECT max(t.occurred_at) FROM contact_lifecycle_transitions t
           WHERE t.contact_id = c.id AND t.to_state = 'historique') AS left_at`,
      ])
      .where('w.is_demo = false')
      .andWhere('c.deleted_at IS NULL')
      .andWhere('c.source IN (:...sources)', { sources: SHAREABLE_SOURCES })
    if (mode === 'incremental') {
      // #3989.c — voir la docstring : seules les fiches touchées depuis l'avant-veille.
      query.andWhere('c.updated_at >= :since', { since: new Date(now.getTime() - INCREMENTAL_WINDOW_MS) })
    }
    const rows = await query.getRawMany<SourceRow>()
    const byCompany = new Map<string, SharedSourceContact[]>()
    for (const row of rows) {
      const companyKey = sharedCompanyKey({ siren: row.siren, website: row.website })
      if (!companyKey) continue
      const list = byCompany.get(companyKey) ?? []
      list.push({
        // #3989.b — une fiche corrigée à la main est un fait apporté par l'UTILISATEUR,
        // quelle que soit sa source d'origine : le rôle part anonymisé, la personne
        // et sa saisie ne repartent jamais comme un fait nommé de Bellum. La base
        // commune ne réécrit pas non plus la fiche (lecture seule ici ; à la
        // recopie, `applyFieldUpdates` garde la correction — « l'humain gagne »).
        source: row.human_corrected ? 'manual' : row.source,
        fullName: row.full_name,
        title: row.title,
        linkedinUrl: row.linkedin_url,
        apolloId: row.apollo_id,
        email: row.email,
        phone: row.phone,
        humanCoordinates: row.human_coordinates,
        employmentState: sharedEmploymentOfLifecycle(row.lifecycle_state),
        leftAt: row.left_at ? new Date(row.left_at).toISOString().slice(0, 10) : null,
      })
      byCompany.set(companyKey, list)
    }
    const erased = await sharedErasedFingerprints(this.dataSource)
    let facts = 0
    for (const [companyKey, contacts] of byCompany) {
      facts += await upsertSharedCompanyPeople(this.dataSource, 'live', companyKey, contacts, erased)
    }
    return { companies: byCompany.size, facts, mode }
  }
}
