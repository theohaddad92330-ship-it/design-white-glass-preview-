import { clientToolName, toolFamiliesOf, type ConnectedTool, type ToolFamily } from '@bellum/contracts'

type RegistryToolLike = Pick<ConnectedTool, 'provider' | 'family' | 'additional_families'> & {
  capability_state: string
}

interface ToolExclusions {
  families: string[]
  providers: string[]
}

/**
 * #4289.10 (#3973.1) — les outils qu'on PEUT LIRE : un Outlook en lecture seule (`read_only`), à écritures
 * limitées ou « en retard » est branché et lisible, même s'il n'est pas `operational`. Compter seul
 * `operational` faisait de Gmail « le dernier outil de la famille » : décocher Gmail coupait toute la
 * messagerie, et Outlook n'était jamais lu. Une autorisation expirée ou un outil dégradé ne se lit pas.
 */
const READABLE_CAPABILITY_STATES: ReadonlySet<string> = new Set([
  'operational',
  'read_only',
  'limited_write',
  'sync_late',
])

/**
 * #3708.fournisseur — « Outils et sources » : ce que la personne a décoché pour
 * ce fil, résolu CÔTÉ SERVEUR contre le registre réel de ses outils.
 *
 * - un identifiant qui n'est pas un outil opérationnel de cette personne est
 *   écarté (jamais cru sur parole : le corps vient du navigateur) ;
 * - exclure le DERNIER outil opérationnel d'une famille exclut la famille ; un
 *   outil compte dans CHACUNE des familles qu'il sert (#3973 : Microsoft 365 =
 *   messagerie ET agenda, `toolFamiliesOf`) ;
 * - les familles déjà déclarées par le client restent (union, sans doublon) ;
 * - registre illisible (`undefined`) : on ne sait pas quels outils existent, donc
 *   aucun identifiant n'est retenu — on ne coupe pas plus que le client n'a dit.
 */
export function resolveToolExclusions(
  tools: readonly RegistryToolLike[] | undefined,
  excludedProviders: readonly string[] | null | undefined,
  excludedFamilies: readonly string[] | null | undefined,
): ToolExclusions {
  const families = new Set(excludedFamilies ?? [])
  const providers: string[] = []
  if (tools && excludedProviders?.length) {
    const operational = tools.filter(tool => READABLE_CAPABILITY_STATES.has(tool.capability_state))
    const requested = new Set(excludedProviders)
    const kept = new Set(operational.filter(tool => requested.has(tool.provider)).map(tool => tool.provider))
    providers.push(...kept)
    for (const family of new Set(operational.flatMap(toolFamiliesOf))) {
      if (operational.filter(tool => toolFamiliesOf(tool).includes(family)).every(tool => kept.has(tool.provider))) {
        families.add(family)
      }
    }
  }
  return { families: [...families].sort(), providers: providers.sort() }
}

/**
 * #2770 — l'accès du copilote (`copilot-bridge`) est de la PLOMBERIE de la plateforme : « opérationnel »
 * dès que la clé est posée, que la personne ait branché une messagerie ou non. Il ne compte donc dans
 * aucune famille — sinon « Outils branchés pris en compte : agenda, messagerie » contredit
 * « Aucune messagerie connectée » (`/mailbox/status`) pour le même compte (GA-26).
 *
 * V4-CORRECTIFS-B (a) — la règle est celle de « Outils et sources » (`connectedClientTools`) : seul un
 * outil du CLIENT (`clientToolName` non nul) compte. Tout autre fournisseur « opérationnel » — une clé
 * serveur de la plateforme — n'est pas un outil que l'espace a branché, et le plan ne le cite pas.
 */

/** Les familles d'outils opérationnelles ; `undefined` (registre illisible) = « on ne sait pas ». */
export function connectedFamiliesOf(tools: readonly RegistryToolLike[] | undefined): ToolFamily[] | undefined {
  return tools
    ? [
        ...new Set(
          tools
            .filter(tool => tool.capability_state === 'operational' && clientToolName(tool.provider) !== null)
            .flatMap(toolFamiliesOf),
        ),
      ]
    : undefined
}
