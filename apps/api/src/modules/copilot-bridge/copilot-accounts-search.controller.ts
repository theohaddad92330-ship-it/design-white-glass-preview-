import { Body, Controller, Optional, Post, UseGuards } from '@nestjs/common'
import { portfolioScopeFor } from '@bellum/contracts'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AccountsService } from '../accounts/accounts.service'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CopilotAccountsByOwnerDto } from './dto/copilot-accounts-by-owner.dto'
import { isInactiveAccount, resolveAccountsByName } from './account-name-resolution'
import { CopilotAccountsSearchDto } from './dto/copilot-accounts-search.dto'
import { matchWorkspaceMemberByName } from './workspace-member-name-match'

/**
 * #2148.4 (#2848) — « réutiliser avant de rechercher » (#2148, étape 3 :
 * « analyses précédemment réalisées dans le même workspace »).
 *
 * Mesuré le 25/09/2026 : aucun outil de Laura ne cherchait un compte à travers
 * le portefeuille — seuls `find_accounts` (prépare une recherche NEUVE sur
 * Découvrir, zéro crédit consommé, mais zéro compte déjà connu) et les outils
 * à UN compte déjà résolu (`get_account_brief`, etc.) existaient. Le calcul,
 * lui, existait déjà : c'est la liste de l'écran Comptes
 * (`AccountsService.findAccountsByWorkspace`, filtres `q`/`sector`). Ce pont
 * la RÉUTILISE — aucun second filtre (GA-26) — même construction que
 * `CopilotContactsSearchController` (#2294).
 *
 * Bornée aux comptes déjà EXPLOITABLES (`reusableOnly: true` — `completed` OU
 * au moins un contact déjà enregistré, #3184.1) : proposer un compte encore
 * `prospect`/`analyzing` SANS rien dedans répondrait par un dossier qui
 * n'existe pas encore, l'inverse de « BellumAI connaît déjà… ». Un compte dont
 * l'analyse s'est interrompue EN COURS DE ROUTE, contacts déjà enregistrés,
 * reste lui légitimement trouvable — recette prod 30/09 (#3184) : un fil disait
 * « aucun compte ni contact exploitable » pour un compte qu'un fil voisin,
 * scopé par `account_id`, lisait avec missions et contacts.
 *
 * Contrôleur à part, même raison que `CopilotContactsSearchController` : le
 * PÉRIMÈTRE. La liste de l'écran est bornée par le cloisonnement de
 * portefeuille (D5, `portfolioScopeFor`) ET par la business unit de
 * l'appelant (revue sécurité 15/09/2026, `resolveBusinessUnitScope`) ; ce pont
 * applique les deux, jamais servis en silence à tout l'espace.
 */
/**
 * #3670.10 — « Altran Technologies SA » → « Altran Technologies », « Altran » : le début de la saisie,
 * mots retirés par la fin, au moins 5 caractères, trois au plus. Jamais la saisie entière (déjà lue).
 */
function leadingQueryPrefixes(query: string): string[] {
  const words = query.trim().split(/\s+/).filter(Boolean)
  const prefixes: string[] = []
  // #3670 (RAN, recette ND 10/10 en prod) — « compte Altran Technologies » : un mot d'introduction en
  // TÊTE empêchait de retomber sur « Altran » en retirant les mots par la fin. On essaie donc TOUTES les
  // fenêtres de mots contiguës, les plus longues d'abord (à longueur égale, de gauche à droite),
  // jamais la saisie entière (déjà lue), 12 lectures au plus. `resolveAccountsByName` filtre ensuite :
  // le nom de la fiche doit figurer en mots entiers dans la saisie.
  for (let size = words.length - 1; size >= 1 && prefixes.length < 12; size -= 1) {
    for (let start = 0; start + size <= words.length && prefixes.length < 12; start += 1) {
      const window = words.slice(start, start + size).join(' ')
      if (window.length >= 5 && !prefixes.includes(window)) prefixes.push(window)
    }
  }
  return prefixes
}

@Controller('internal/copilot')
@UseGuards(InternalSecretGuard)
export class CopilotAccountsSearchController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly workspaceContext: WorkspaceContextService,
    /** Optionnel pour le CONSTRUCTEUR, jamais pour la RÈGLE : absent, on LÈVE. */
    @Optional() private readonly businessUnits?: BusinessUnitService,
  ) {}

  @Post('accounts/search')
  async search(@Body() dto: CopilotAccountsSearchDto) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const visibility = await this.workspaceContext.portfolioVisibilityOf(workspaceId)
    const scope = portfolioScopeFor(role, visibility, dto.userId)
    const businessUnitScope = await resolveBusinessUnitScope(this.businessUnits, workspaceId, dto.userId)
    const limit = dto.limit ?? 10
    // Filtres construits À PART : le call-site qui suit reste court, avec le
    // cloisonnement (`scope`, `businessUnitScope`) visible d'un coup d'œil —
    // c'est aussi ce que lit `business-unit-scope.spec.ts` (GA-333).
    const filters = {
      reusableOnly: true as const,
      ...(dto.query ? { q: dto.query } : {}),
      ...(dto.sector ? { sector: dto.sector } : {}),
      limit,
      // #4065 — la page suivante d'un listing complet (`listAll`) ; les replis par NOM plus bas
      // ne jouent que sur `query`, donc jamais sur un listing.
      offset: dto.offset ?? 0,
    }

    const direct = await this.accounts.findAccountsByWorkspace(
      workspaceId,
      filters,
      scope,
      undefined,
      businessUnitScope,
    )
    const hasActive = (rows: typeof direct.data) => rows.some(account => !isInactiveAccount(account))
    let rows = direct.data
    let total = direct.pagination.totalItems
    // #3670 (lot RAT, recette NF 10/10 : « aucune fiche Altran Technologies », 47 requêtes) — une fiche
    // NON ACTIVE (archivée) trouvée PAR SON NOM était jetée par chaque repli (`hasActive` faux), et seuls
    // les portefeuilles bornés à 100 lignes pouvaient encore la rendre. On la garde ici : sans fiche
    // active, elle est rendue, marquée `inactive` — on archive, on ne supprime pas (doctrine).
    let inactiveByName: typeof direct.data = []
    // #3215 — le filtre de l'écran (`ILIKE %q%`) ne connaît ni le SIGLE (« SG » pour « Société
    // Générale »), ni les accents d'un autre nom : sans fiche ACTIVE trouvée, on rapproche le nom
    // tapé sur le portefeuille BORNÉ du même périmètre (jamais l'espace entier), et la fiche
    // active passe devant l'archivée. Rien ne correspond ⇒ la liste reste vide.
    if (dto.query && !hasActive(rows)) {
      // #3670.9 (recette prod 09/10) — « Altran Technologies » (registre, en
      // capitales) tapé « Altran Technologies » par le commercial : une SIMPLE
      // différence de casse, que l'ILIKE de la base résout déjà elle-même
      // (insensible à la casse) — mais la fiche échoue `reusableOnly` (analyse
      // non terminée, aucun contact), donc le filtre direct ci-dessus ne la
      // trouve pas. Les deux lectures juste en dessous (#3670.5) FETCHENT un
      // portefeuille borné à 100 lignes, trié par date de dernière activité :
      // une fiche à peine repérée, jamais retouchée depuis, peut rester hors de
      // ces 100 lignes dans un grand portefeuille, quelle que soit la qualité
      // du rapprochement fait EN MÉMOIRE sur ce qui a été ramené. On retente
      // donc le MÊME `q`, SANS `reusableOnly` : l'ILIKE reste insensible à la
      // casse et n'est borné par AUCUN tri de récence — un sigle ou un accent
      // sans correspondance LITTÉRALE (#3215) ne matche toujours rien ici, et
      // continue de retomber sur le portefeuille borné juste après.
      const byNameOnly = await this.accounts.findAccountsByWorkspace(
        workspaceId,
        { q: dto.query, ...(dto.sector ? { sector: dto.sector } : {}), limit, offset: 0 },
        scope,
        undefined,
        businessUnitScope,
      )
      if (byNameOnly.data.length > 0 && hasActive(byNameOnly.data)) {
        rows = [...byNameOnly.data].sort((a, b) => Number(isInactiveAccount(a)) - Number(isInactiveAccount(b)))
        total = byNameOnly.pagination.totalItems
      } else if (byNameOnly.data.length > 0) {
        inactiveByName = byNameOnly.data
      }
    }
    // #3670.10 (recette MZ 10/10) — la saisie est PLUS LONGUE que la fiche (« Altran Technologies » pour
    // « ALTRAN ») : l'ILIKE ci-dessus ne la voit pas, et le rapprochement `embedded` plus bas ne lit que
    // 100 lignes. On retente l'ILIKE sur le DÉBUT de la saisie (mots retirés par la fin, ≥ 5 caractères,
    // 3 lectures au plus), puis on ne garde que ce que `resolveAccountsByName` accepte — le nom de la
    // fiche doit figurer EN MOTS ENTIERS dans la saisie, jamais une simple ressemblance.
    if (dto.query && !hasActive(rows)) {
      for (const prefix of leadingQueryPrefixes(dto.query)) {
        const byPrefix = await this.accounts.findAccountsByWorkspace(
          workspaceId,
          { q: prefix, ...(dto.sector ? { sector: dto.sector } : {}), limit: 20, offset: 0 },
          scope,
          undefined,
          businessUnitScope,
        )
        const matched = resolveAccountsByName(dto.query, byPrefix.data)
        if (matched.length > 0 && hasActive(matched)) {
          rows = matched.slice(0, limit)
          total = matched.length
          break
        }
        if (matched.length > 0 && inactiveByName.length === 0) inactiveByName = matched
      }
    }
    if (dto.query && !hasActive(rows)) {
      const pool = await this.accounts.findAccountsByWorkspace(
        workspaceId,
        { reusableOnly: true as const, ...(dto.sector ? { sector: dto.sector } : {}), limit: 100, offset: 0 },
        scope,
        undefined,
        businessUnitScope,
      )
      const resolved = resolveAccountsByName(dto.query, pool.data)
      if (resolved.length > 0) {
        rows = resolved.slice(0, limit)
        total = resolved.length
      } else {
        // #3670.5 (recette prod 08/10) — « Laura ne connaît pas Altran alors que
        // le briefing le cite » : `accountsToWatch` (signal frais) ne pose AUCUN
        // filtre `reusableOnly` — un compte à peine repéré (sans contact, analyse
        // non terminée) existe dans l'espace même s'il n'a rien d'« exploitable »
        // à proposer. Même source que le briefing : un dernier rapprochement,
        // sur le MÊME portefeuille borné, sans `reusableOnly`.
        const widerPool = await this.accounts.findAccountsByWorkspace(
          workspaceId,
          { ...(dto.sector ? { sector: dto.sector } : {}), limit: 100, offset: 0 },
          scope,
          undefined,
          businessUnitScope,
        )
        const widerResolved = resolveAccountsByName(dto.query, widerPool.data)
        if (widerResolved.length > 0) {
          rows = widerResolved.slice(0, limit)
          total = widerResolved.length
        }
      }
    }
    if (dto.query && rows.length === 0 && inactiveByName.length > 0) {
      rows = inactiveByName.slice(0, limit)
      total = inactiveByName.length
    }
    // #3670 (RAW2, décision Louis 11/10) — une fiche SUPPRIMÉE ne ressort JAMAIS (ni lignes, ni id, ni
    // contenu). Dernier recours, seulement si rien d'autre n'est rendu : simple constat d'existence d'une
    // fiche supprimée du même nom (même normalisation, mêmes espace/droits) → `deleted_match`, que Laura NOMME.
    let deletedMatch = false
    if (dto.query && rows.length === 0 && inactiveByName.length === 0) {
      for (const q of [dto.query, ...leadingQueryPrefixes(dto.query)]) {
        const deleted = await this.accounts.findAccountsByWorkspace(
          workspaceId,
          { q, status: 'deleted', limit: 20, offset: 0 },
          scope,
          undefined,
          businessUnitScope,
        )
        if (resolveAccountsByName(dto.query, deleted.data).length > 0) {
          deletedMatch = true
          break
        }
      }
    }
    return {
      total,
      truncated: total > rows.length,
      ...(deletedMatch ? { deleted_match: true as const } : {}),
      accounts: rows.map(account => ({
        account_id: account.id,
        // #3670 (RAT) — posée SEULEMENT sur une fiche archivée : Laura dit « fiche archivée », jamais « aucune ».
        ...(isInactiveAccount(account) ? { inactive: true as const } : {}),
        company_name: account.company_name,
        sector: account.sector,
        // `null` = jamais analysé avec succès à ce jour — gardé `null`-safe
        // pour ne jamais deviner une date sur un champ qui peut manquer.
        last_analyzed_at: account.last_analyzed_at ?? null,
        // #3682.6 — Laura lit la MÊME fraîcheur que la liste et le dossier : vérification ≠ événement.
        signal_freshness: account.signal_freshness ?? null,
        // #3094 — DÉJÀ calculé par `findAccountsByWorkspace` (même colonne que
        // l'écran Comptes, GA-26) : `null` = personne ne porte ce compte,
        // jamais un nom deviné.
        owner: account.owner ?? null,
      })),
    }
  }

  /**
   * #3094 — « quels sont les comptes de <membre> ? ». `ownerName` est le nom
   * TAPÉ dans le chat, jamais un identifiant : résolu vers un membre RÉEL de
   * l'espace avant toute lecture de compte — un mauvais choix silencieux
   * attribuerait le portefeuille d'un collègue à un autre. Personne ne
   * correspond, ou plusieurs collègues partagent le même prénom : le dit,
   * n'invente jamais un compte ni ne choisit au hasard.
   */
  @Post('accounts/by-owner')
  async byOwner(@Body() dto: CopilotAccountsByOwnerDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const members = await this.workspaceContext.listMembers(dto.userId)
    const named = members.filter((member): member is typeof member & { fullName: string } => Boolean(member.fullName))
    const match = matchWorkspaceMemberByName(named, dto.ownerName)
    if (match.kind === 'not_found') return { memberFound: false as const, accounts: [] }
    if (match.kind === 'ambiguous') {
      return { memberFound: false as const, accounts: [], ambiguousCandidates: match.candidates }
    }
    const limit = dto.limit ?? 10
    const accounts = await this.accounts.accountsAssignedTo(match.member.userId, workspaceId, limit)
    return {
      memberFound: true as const,
      ownerName: match.member.fullName,
      accounts: accounts.map(account => ({
        account_id: account.id,
        company_name: account.company_name,
        sector: account.sector,
      })),
    }
  }
}
