import { Body, Controller, Optional, Post, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'
import { ContactsService } from '../contacts/contacts.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { parseContactSearchIntent, trailingCompanySplits } from './contact-search-intent'
import { CopilotContactsSearchDto } from './dto/copilot-contacts-search.dto'

/**
 * #2294 — LAURA RETROUVE UN CONTACT DANS TOUT L'ESPACE, pas seulement sur le
 * compte ouvert (« qui connaît-on chez X », « quel DSI a déjà échangé avec nous »).
 *
 * Mesuré le 23/09/2026 : `get_account_contacts` exige UN compte, et
 * `search_dormant_network` ne rend que les silencieux — aucun outil de Laura ne
 * cherchait une personne à travers le portefeuille. Le calcul, lui, existait :
 * c'est la liste de l'écran Contacts (`ContactsService.findAllForUser`, recherche
 * `q` sur nom/fonction/e-mail/entreprise). Ce pont la RÉUTILISE — aucune seconde
 * requête, aucun second filtre (GA-26).
 *
 * Contrôleur à part (et pas une méthode de plus sur `CopilotBridgeController`)
 * pour une seule raison : le PÉRIMÈTRE. La liste de l'écran est bornée à la
 * business unit de l'appelant (revue sécurité 15/09/2026) ; ce pont l'est aussi,
 * par la MÊME fonction fail-closed (`resolveBusinessUnitScope`). Laura ne doit
 * jamais nommer une personne d'un compte que l'écran refuserait d'ouvrir.
 * L'espace est résolu par `findAllForUser` lui-même — jamais cross-espace.
 *
 * Ce qui remonte : de quoi NOMMER la personne et SON COMPTE, et enchaîner sur
 * `prepare_message_for_contact`. Depuis le 07/10 (#2533, décision Louis 04/10),
 * l'e-mail et le téléphone voyagent EN CLAIR — les clés restent des capacités,
 * jamais un nom d'éditeur (GA-69 : une clé est du texte affiché).
 */
@Controller('internal/copilot')
@UseGuards(InternalSecretGuard)
export class CopilotContactsSearchController {
  constructor(
    private readonly contacts: ContactsService,
    private readonly workspaceContext: WorkspaceContextService,
    /** Optionnel pour le CONSTRUCTEUR, jamais pour la RÈGLE : absent, on LÈVE. */
    @Optional() private readonly businessUnits?: BusinessUnitService,
  ) {}

  @Post('contacts/search')
  async search(@Body() dto: CopilotContactsSearchDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const scope = await resolveBusinessUnitScope(this.businessUnits, workspaceId, dto.userId)
    const limit = dto.limit ?? 10
    if (dto.byZone) {
      // #4982.3 — la répartition par zone : agrégation SQL sur TOUT le portefeuille, mêmes filtres/mêmes bornes
      // (espace + BU) que la recherche ; lieu inconnu compté à part. Aucun corps de message, aucun critère protégé.
      return this.contacts.zoneBreakdown(
        dto.userId,
        {
          ...(dto.query ? { q: dto.query } : {}),
          ...(dto.company ? { company: dto.company } : {}),
          ...(dto.role ? { role: dto.role } : {}),
          ...(dto.sector ? { sector: dto.sector } : {}),
          ...(dto.groupRole ? { groupRole: dto.groupRole } : {}),
          ...(dto.contactsFreshWithinMonths ? { contactsFreshWithinMonths: dto.contactsFreshWithinMonths } : {}),
          ...(dto.location ? { location: dto.location } : {}),
        },
        scope,
      )
    }
    if (dto.recentFirst) {
      // #4287.11 — « relance les 2 derniers contacts » : tri par dernière interaction DATÉE. Un contact sans
      // aucune interaction tracée n'apparaît pas : il ne passe jamais pour « récent ».
      const recent = await this.contacts.recentlyActedContacts(dto.userId, limit, scope)
      return {
        total: recent.length,
        truncated: false,
        contacts: recent.map(contact => ({
          contact_id: contact.id,
          account_id: contact.account_id,
          company_name: contact.company_name,
          full_name: contact.full_name,
          title: contact.title,
          decision_role: contact.decision_role,
          relationship_status: contact.user_status,
          location: contact.location,
          has_email: contact.email !== null,
          has_network_profile: contact.linkedin_url !== null,
          email: contact.email,
          phone: contact.phone,
          last_action_at: contact.last_action_at,
        })),
      }
    }
    // #4386.1 — « Théo Haddad chez Bellum » : nom et société se séparent, la société perd « SAS »/« Group ».
    const intent = parseContactSearchIntent({ query: dto.query, company: dto.company })
    const run = (criteria: { query?: string; company?: string }) =>
      this.contacts.findAllForUser(
        dto.userId,
        {
          ...(criteria.query ? { q: criteria.query } : {}),
          ...(criteria.company ? { company: criteria.company } : {}),
          ...(dto.role ? { role: dto.role } : {}),
          // #2294.2 — le secteur/groupe-filiale/fraîcheur du COMPTE, relayés tel
          // quel : aucun second filtre (GA-26), `findAllForUser` les applique déjà.
          ...(dto.sector ? { sector: dto.sector } : {}),
          ...(dto.groupRole ? { groupRole: dto.groupRole } : {}),
          ...(dto.contactsFreshWithinMonths ? { contactsFreshWithinMonths: dto.contactsFreshWithinMonths } : {}),
          // #2367 (territoire) — même relais tel quel, `findAllForUser` applique
          // déjà l'ILIKE ville/pays (`contactListQuerySchema.location`).
          ...(dto.location ? { location: dto.location } : {}),
          // #4982.3 — le tri « zone » de l'écran Contacts, relayé tel quel (GA-26).
          ...(dto.sort ? { sort: dto.sort } : {}),
          limit,
          // #4065 — la page suivante d'un listing complet ; une recherche reste en tête de liste.
          offset: dto.offset ?? 0,
        },
        scope,
      )
    let result = await run(intent)
    if (result.data.length === 0 && intent.query && !intent.company) {
      // #4386.1 — « haddad theo BELLUM SAS » : société en queue de phrase, tentée en repli (2 essais au plus).
      for (const split of trailingCompanySplits(intent.query)) {
        const retry = await run(split)
        if (retry.data.length > 0) {
          result = retry
          break
        }
      }
    }
    const total = result.pagination.totalItems
    return {
      total,
      truncated: total > result.data.length,
      contacts: result.data.map(contact => ({
        contact_id: contact.id,
        account_id: contact.account_id,
        // `null` = contact sans compte (rencontré en salon) — jamais un nom deviné.
        company_name: contact.company_name,
        full_name: contact.full_name,
        title: contact.title,
        decision_role: contact.decision_role,
        // #219.8 (#3231) — relation personne↔entreprise DÉCLARÉE ; aucune clé si non déclarée.
        ...(contact.declared_person_company_relation
          ? { declared_person_company_relation: contact.declared_person_company_relation }
          : {}),
        // L'état de la relation tel que l'équipe l'a posé (contacté, a répondu,
        // rendez-vous…) — ce qui répond à « a-t-il déjà échangé avec nous ».
        relationship_status: contact.user_status,
        // #2294.6 — champ DÉJÀ collecté par la liste Contacts (#2165.38),
        // simplement pas encore projeté ici. `null` = inconnu, jamais une
        // chaîne vide qui se lirait comme un lieu.
        location: contact.location,
        // #4982.3 — la zone lue par le tri « zone » (ville, département) ; `null` = lieu inconnu, jamais deviné.
        ...(dto.sort ? { city: contact.zone_city ?? null, department: contact.zone_department ?? null } : {}),
        has_email: contact.email !== null,
        has_network_profile: contact.linkedin_url !== null,
        // #2533 — décision Louis 04/10 : la coordonnée EN CLAIR (recette prod
        // 07/10, UNEO : « pas de fiche vérifiée » devant un e-mail affiché).
        email: contact.email,
        phone: contact.phone,
      })),
    }
  }
}
