import { Controller, Get, HttpCode, Optional, Param, Post, UseGuards } from '@nestjs/common'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { capabilityKeyValues, connectorErrorAction, missingScopesFor, type CapabilityKey } from '@bellum/contracts'
import { classifyProviderError } from '../../common/connector-error'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { AgendaService } from '../agenda/agenda.service'
import { JwtGuard } from '../auth/jwt.guard'
import { CrmService } from '../crm/crm.service'
import { GoogleService } from '../google/google.service'
import { MicrosoftService } from '../microsoft/microsoft.service'
import { NotionService } from '../notion/notion.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ROUTINE_CATALOG } from '../routines/routine-catalog'
import { ConnectorProbeService } from './connector-probe.service'
import { capabilitiesOf, probeCapabilityName, TOOL_NEVER } from './tool-capabilities'
import { ConnectorScopeGapsService } from '../connector-scope-gaps/connector-scope-gaps.service'
import { ToolRegistryService } from './tool-registry.service'

/**
 * « Tester » et « Réparer » — les deux boutons que le PDF 7 appelle les plus
 * importants de l'écran (§6.2 et §6.3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI L'ORCHESTRATION VIT DANS UN CONTRÔLEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * Vérifier une capacité traverse cinq modules. Le faire dans un service coûterait
 * cinq imports service → service, et GA-07 est au plafond. La garde nomme
 * elle-même la sortie : « fais l'orchestration dans le contrôleur — c'est là que
 * vit un geste utilisateur ». C'en est un : quelqu'un a cliqué.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'UN TEST NE FAIT JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il n'écrit rien, il n'envoie rien, il ne supprime rien. Le bouton « Tester »
 * du dépôt faisait exactement l'inverse : il POSTAIT un vrai message dans le
 * canal Slack de l'utilisateur (« BellumAI est bien connecté 🎯 »). C'est le
 * « test destructif » que le ticket interdit nommément. Il existe toujours, il
 * s'appelle désormais « Envoyer un message de test », et il dit qu'il envoie.
 *
 * Et il ne montre JAMAIS de contenu : une preuve est un NOM d'objet — « Perso,
 * Équipe, Client EDF » — jamais le corps d'un message ni d'un fichier.
 */

/** Le résultat d'une capacité vérifiée, tel que l'écran l'affiche. */
type CapabilityProbeResult = {
  key: CapabilityKey
  label: string
  ok: boolean
  /** Le NOM des objets lus, jamais leur contenu. `null` quand rien n'a été vérifié. */
  sample: string | null
  /** Le code d'échec, vocabulaire fermé de `connector-error.ts`. */
  errorCode: string | null
  /** Les portées qui manquent, NOMMÉES. Vide quand ce n'est pas le problème. */
  missingScopes: string[]
  /** `false` quand aucune opération non destructive ne peut la prouver. */
  probeable: boolean
}

/** Ce qu'une sonde rend : le nom d'un ou plusieurs objets réels. */
type Probe = (userId: string) => Promise<string>

const MAX_SAMPLE = 3

/**
 * Ce qu'un connecteur fournit, dans le vocabulaire GROSSIER des routines.
 *
 * Le registre parle de quarante-cinq fournisseurs, les routines de cinq besoins.
 * Les deux vocabulaires ne se rejoignaient nulle part — c'est pour ça que la
 * carte ne savait pas dire « 6 automatisations en dépendent ». Cette table est
 * le seul pont, et elle est volontairement courte : un connecteur qui n'y figure
 * pas ne bloque aucune routine, ce qui est vrai.
 */
const PROVIDES: Readonly<Record<string, string>> = {
  gmail: 'mailbox_read',
  microsoft: 'mailbox_read',
  'google-calendar': 'agenda_read',
  hubspot: 'crm',
  salesforce: 'crm',
  pipedrive: 'crm',
  attio: 'crm',
  boondmanager: 'ats',
}

/** Les routines qui s'arrêtent si cet outil tombe. */
function dependentRoutines(provider: string): string[] {
  const requirement = PROVIDES[provider]
  if (!requirement) return []
  return ROUTINE_CATALOG.filter(routine => routine.requires.some(need => need === requirement)).map(
    routine => routine.key,
  )
}

/** « 10 agendas, dont Perso, Équipe, Client EDF » — la phrase exacte du PDF. */
function sampleOf(kind: string, names: string[]): string {
  const shown = names.filter(Boolean).slice(0, MAX_SAMPLE)
  if (names.length === 0) return `aucun ${kind}`
  const suffix = shown.length > 0 ? `, dont ${shown.join(', ')}` : ''
  return `${names.length} ${kind}${names.length > 1 ? 's' : ''}${suffix}`
}

@Controller('tools')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
// La même permission que l'écran où vivent ces boutons. Un siège qui ne peut
// pas connecter un outil n'a rien à y tester : il n'en a aucun.
@RequirePermission('integrations:manage')
export class ConnectorTestController {
  constructor(
    private readonly registry: ToolRegistryService,
    private readonly probeStore: ConnectorProbeService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly google: GoogleService,
    private readonly microsoft: MicrosoftService,
    private readonly notion: NotionService,
    private readonly crm: CrmService,
    private readonly agenda: AgendaService,
    // SCOPES-I.2 — dire à la carte si l'écart de portées est celui de l'app ou celui d'un accord ancien.
    @Optional() private readonly scopeGaps?: ConnectorScopeGapsService,
  ) {}

  /**
   * Les sondes, par `provider:capacité`.
   *
   * Chacune est une LECTURE réelle. Le PDF insiste sur ce point et il a raison :
   * dériver « sain » des seules portées, c'est ce que faisait le registre le
   * 16/08 pendant que l'API Agenda était éteinte depuis des semaines. Une portée
   * accordée dit qu'on a le DROIT ; seule une lecture dit que ça MARCHE.
   */
  private probes(): Record<string, Probe> {
    return {
      // L'ADRESSE de la boîte, pas son contenu : `getProfile` échoue exactement
      // quand le jeton ou la portée sont en cause, et ne rend aucun message.
      'gmail:read': userId => this.google.probeMailbox(userId).then(address => `boîte ${address}`),
      'gmail:search': userId => this.google.probeMailbox(userId).then(address => `boîte ${address}` + ' — lisible'),
      'google-calendar:read': async userId => {
        const listing = await this.agenda.listCalendars(userId)
        return sampleOf(
          'agenda',
          listing.calendars.map(calendar => calendar.name),
        )
      },
      'google-drive:read': async userId => {
        const page = await this.google.listDriveFiles(userId, { pageSize: 5 })
        return sampleOf(
          'document',
          page.files.map(file => file.name ?? ''),
        )
      },
      'google-drive:search': async userId => {
        const page = await this.google.searchDriveContent(userId, { query: 'a', pageSize: 5 })
        return `recherche par contenu exécutée — ${page.files.length} résultat${page.files.length > 1 ? 's' : ''}`
      },
      'microsoft:read': async userId => {
        const messages = await this.microsoft.searchMailbox(userId, { term: 'a', maxResults: 3 })
        // Le NOMBRE, jamais les objets : l'objet d'un message est du contenu.
        return `${messages.length} message${messages.length > 1 ? 's' : ''} accessible${messages.length > 1 ? 's' : ''}`
      },
      'microsoft:search': async userId => {
        const files = await this.microsoft.searchFiles(userId, { query: 'a', maxResults: 5 })
        return sampleOf(
          'document',
          files.map(file => file.name),
        )
      },
      'notion:read': async userId => {
        const pages = await this.notion.listPages(userId)
        return sampleOf(
          'page',
          pages.map(page => page.title),
        )
      },
      'notion:search': async userId => {
        const pages = await this.notion.listPages(userId, 'a')
        return `recherche exécutée — ${pages.length} résultat${pages.length > 1 ? 's' : ''}`
      },
      // J.3 — la 2e capacité `read` de HubSpot lit les AFFAIRES : sa sonde lit des affaires, pas des contacts.
      'hubspot:read:crm.objects.deals.read': async userId => {
        const page = await this.crm.listDeals(userId, { limit: 3 })
        return sampleOf(
          'affaire',
          page.deals.map(deal => deal.title ?? ''),
        )
      },
      'hubspot:read': async userId => {
        const page = await this.crm.listContacts(userId, { limit: 3 })
        return sampleOf(
          'contact',
          page.contacts.map(
            contact => [contact.firstName, contact.lastName].filter(Boolean).join(' ') || (contact.email ?? ''),
          ),
        )
      },
    }
  }

  /**
   * Vérifie CHAQUE capacité d'un connecteur, et n'écrit rien nulle part.
   *
   * L'ordre du résultat suit celui du catalogue : lire d'abord, écrire ensuite.
   * C'est aussi l'ordre dans lequel une panne se diagnostique.
   */
  @Post(':provider/test')
  @HttpCode(200)
  async test(
    @CurrentUser() user: CurrentUserPayload,
    @Param('provider') provider: string,
  ): Promise<{ provider: string; results: CapabilityProbeResult[] }> {
    const tools = await this.registry.list(user.userId)
    const tool = tools.find(entry => entry.provider === provider)
    const declared = capabilitiesOf(provider)
    if (!tool || declared.length === 0) return { provider, results: [] }

    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const probes = this.probes()
    const results: CapabilityProbeResult[] = []

    for (const capability of declared) {
      const probeName = probeCapabilityName(provider, capability)
      const missing = missingScopesFor(tool.scopes, capability.scopes)
      const base = {
        key: capability.key,
        label: capability.label,
        probeable: capability.probeable,
        missingScopes: missing,
      }

      // Une portée absente se voit AVANT d'appeler quoi que ce soit : demander
      // au fournisseur une chose dont on sait déjà qu'on n'a pas le droit de la
      // demander produit un 403 qu'on devra traduire, et une seconde d'attente
      // pour rien.
      if (missing.length > 0) {
        results.push({ ...base, ok: false, sample: null, errorCode: 'scope_missing' })
        if (workspaceId) {
          await this.probeStore.record({
            workspaceId,
            userId: user.userId,
            provider,
            capability: probeName,
            ok: false,
            errorCode: 'scope_missing',
          })
        }
        continue
      }

      const probe = probes[`${provider}:${probeName}`]
      if (!probe) {
        // Rien à vérifier sans écrire. On le DIT plutôt que d'afficher un vert
        // qui ne repose sur rien.
        results.push({ ...base, ok: true, sample: null, errorCode: null })
        continue
      }

      try {
        const sample = await probe(user.userId)
        results.push({ ...base, ok: true, sample, errorCode: null })
        if (workspaceId) {
          await this.probeStore.record({
            workspaceId,
            userId: user.userId,
            provider,
            capability: probeName,
            ok: true,
            sample,
          })
        }
      } catch (error) {
        const errorCode = classifyProviderError(error)
        results.push({ ...base, ok: false, sample: null, errorCode })
        if (workspaceId) {
          await this.probeStore.record({
            workspaceId,
            userId: user.userId,
            provider,
            capability: probeName,
            ok: false,
            errorCode,
          })
        }
      }
    }

    return { provider, results }
  }

  /**
   * SCOPES-I.2 — l'écart de portées de CET utilisateur pour CE connecteur, ou `null`.
   *
   * `freshConsent` répond à « de qui est le geste ? » : vrai ⇒ le fournisseur vient de ne pas accorder
   * ce que l'app demande, donc c'est l'app qui ne le propose pas ; faux ⇒ un accord ancien, la
   * reconnexion le répare.
   */
  @Get(':provider/scope-gap')
  async scopeGap(
    @CurrentUser() user: CurrentUserPayload,
    @Param('provider') provider: string,
  ): Promise<{ gap: { label: string; missingScopes: string[]; freshConsent: boolean } | null }> {
    const gap = await this.scopeGaps?.gapFor(user.userId, provider)
    return { gap: gap ? { label: gap.label, missingScopes: gap.missingScopes, freshConsent: gap.freshConsent } : null }
  }

  /**
   * Le diagnostic de « Réparer » (§6.3).
   *
   * Quatre choses, et le PDF les ordonne : ce qui MANQUE (la portée nommée
   * exactement), POURQUOI (« un jeton OAuth ne gagne jamais une portée après
   * coup »), le GESTE exact, et ce qui reste BLOQUÉ — la liste nommée des
   * automatisations en pause. C'est cette dernière qui donne sa valeur au reste :
   * « reconnecte » sans dire ce qu'on récupère ne motive personne.
   */
  @Get(':provider/repair')
  async repair(
    @CurrentUser() user: CurrentUserPayload,
    @Param('provider') provider: string,
  ): Promise<{
    provider: string
    missingScopes: string[]
    /** Vrai : l'app publiée ne propose pas la portée (consentement neuf) — reconnecter ne répare rien. */
    appSide: boolean
    reason: string
    exactAction: string
    blockedCapabilities: string[]
    neverDoes: string[]
    /** Les routines qui s'arrêtent si cet outil tombe — clés, traduites côté écran. */
    dependentRoutines: string[]
  }> {
    const tools = await this.registry.list(user.userId)
    const tool = tools.find(entry => entry.provider === provider)
    const declared = capabilitiesOf(provider)

    const missing = tool
      ? [...new Set(declared.flatMap(capability => missingScopesFor(tool.scopes, capability.scopes)))]
      : []
    const blocked = tool
      ? declared
          .filter(capability => missingScopesFor(tool.scopes, capability.scopes).length > 0)
          .map(capability => capability.label)
      : []

    // SCOPES-I.2 — un consentement NEUF qui n'accorde pas la portée : c'est l'app publiée qui ne la propose
    // pas. « Reconnecte » bouclerait (le 18/10, HubSpot) : on dit la vérité, et que l'équipe est prévenue.
    const gap = await this.scopeGaps?.gapFor(user.userId, provider)
    const appSide = gap?.freshConsent === true
    return {
      provider,
      missingScopes: missing,
      appSide,
      // Le POURQUOI, en une phrase. C'est ce que personne ne savait le 16/08, et
      // ce qui a fait chercher un bug pendant une demi-journée.
      reason: appSide
        ? `Cette fonction n’est pas encore ouverte par notre application ${gap.label} — ce n’est pas à toi de la réparer, l’équipe est prévenue.`
        : missing.length > 0
          ? 'Un accès déjà accordé ne s’élargit jamais après coup : il faut refaire la connexion pour l’étendre.'
          : 'Aucun accès ne manque. Si une lecture échoue encore, c’est côté fournisseur.',
      exactAction: appSide
        ? 'Rien à faire de ton côté : on te prévient dès que c’est ouvert.'
        : connectorErrorAction(missing.length > 0 ? 'scope_missing' : 'provider_unavailable', missing),
      blockedCapabilities: blocked,
      neverDoes: [...(TOOL_NEVER[provider] ?? [])],
      // « 6 automatisations en dépendent [voir] » — la ligne de la carte du §5.1.
      // C'est elle qui donne sa valeur à « Réparer » : « reconnecte » sans dire
      // ce qu'on récupère ne motive personne.
      dependentRoutines: dependentRoutines(provider),
    }
  }
}

/** Les dix verbes, exportés pour l'écran : il affiche aussi ce qu'on ne fait pas. */
export const CAPABILITY_VERBS: readonly CapabilityKey[] = capabilityKeyValues
