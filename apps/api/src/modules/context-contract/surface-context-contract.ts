import {
  contextModeExcludes,
  LAURA_CONTEXT_MODES,
  type AccountSize,
  type ContextLayer,
  type ContextMode,
  type ContextSurface,
  type SurfaceContextContract,
} from '@bellum/contracts'

/**
 * #2454.9 — LE constructeur du contrat de contexte des surfaces hors
 * conversation. Pur : il ne lit rien, il reçoit l'état réel résolu par le
 * contrôleur et le traduit en couches. Une seule fonction pour toutes les
 * surfaces : Découvrir et Analyser rendent donc le MÊME contrat pour le même
 * état — seules changent les couches que chacune lit réellement (écrit ici,
 * pas deviné à l'écran).
 */
type SurfaceContextInput = {
  surface: ContextSurface
  mode: ContextMode
  /** Faux quand l'espace n'a aucun profil vendeur : la couche n'est alors pas rendue. */
  profilePresent?: boolean
  profileName: string | null
  profileVersion: number | null
  /**
   * #2889 — le PÉRIMÈTRE du profil ESN (`idealAccountProfile`), la même
   * source que `ComposerPersonalizationBar`/`perimeterLine` côté web —
   * jamais un champ voisin (`consultant_size`, `target_sectors` bruts) qui
   * porterait un fait différent sous le même nom.
   */
  profilePerimeter?: { size: AccountSize; sectorsPriority: string[] } | null
  crmConnected: boolean
}

/**
 * Ce que chaque surface sait RÉELLEMENT faire, lu dans son code :
 * - Découvrir (`ia-proxy.controller.ts` `discoverRegistry`/`discoverSignals`) :
 *   personnalise sur le profil vendeur, marque les candidats déjà suivis
 *   (`withPortfolioState`), ne lit jamais le CRM ; sait tourner SANS profil
 *   (modes « Mission ponctuelle » et « Neutre », #2454.10, #2451.1).
 * - Analyser (`analysis.service.ts` `resolveCrmPresence`) : personnalise sur le
 *   profil et croise le CRM branché en couche zéro. #2451.1 — le lancement lit
 *   le mode : le profil n'est pas LU quand le mode l'exclut, le CRM non plus en
 *   « Neutre » (`AnalysisService.start`, `contextModeExcludes`).
 * - Le lot multi-comptes (`analysis_batch`, #2922, `analysis-batches.service.ts`
 *   `launch()`) : CHAQUE sous-job part par `AnalysisService.start`, le MÊME
 *   appel qu'Analyser — même capacité, à l'identique, jamais une copie qui
 *   dériverait au premier ajustement de l'un des deux.
 * Le portefeuille de Découvrir n'est qu'un marqueur anti-doublon (« déjà
 * suivi »), pas une personnalisation : aucun mode ne le retire.
 */
const SURFACE_CAPABILITIES: Record<
  ContextSurface,
  { modes: ContextMode[]; readsCrm: boolean; readsPortfolio: boolean }
> = {
  // #2451.1 — les deux surfaces lisent le mode côté serveur : Découvrir
  // (`IaProxyController.discoverProfileData`) et Analyser
  // (`AnalysisService.start`). Même liste que Laura, jamais une copie.
  discover: { modes: [...LAURA_CONTEXT_MODES], readsCrm: false, readsPortfolio: true },
  analyze: { modes: [...LAURA_CONTEXT_MODES], readsCrm: true, readsPortfolio: false },
  // #2922 — même pipeline qu'Analyser (`AnalysisService.start`) : même capacité.
  analysis_batch: { modes: [...LAURA_CONTEXT_MODES], readsCrm: true, readsPortfolio: false },
}

export function buildSurfaceContextContract(input: SurfaceContextInput): SurfaceContextContract {
  const capabilities = SURFACE_CAPABILITIES[input.surface]
  // Un mode que la surface ne tient pas retombe sur celui qu'elle tient — et le
  // contrat rendu DIT le mode réellement appliqué, jamais celui demandé.
  const mode: ContextMode = capabilities.modes.includes(input.mode) ? input.mode : 'my_activity'
  const layers: ContextLayer[] = []

  if (input.profilePresent !== false) {
    const profile: ContextLayer = {
      id: 'esn_profile',
      state: contextModeExcludes(mode, 'profile') ? 'ignored_by_mode' : 'used',
    }
    const name = input.profileName?.trim()
    if (name) profile.name = name
    // Une version inconnue ou nulle ne s'affiche pas — « v0 » serait un « 0 » affiché.
    if (typeof input.profileVersion === 'number' && input.profileVersion > 0) profile.version = input.profileVersion
    // #2889 — le périmètre s'ajoute à la couche, jamais à sa place : la recette
    // écran du 26/09 a montré un « Contexte » qui nommait le profil sans jamais
    // dire ses secteurs prioritaires ni sa taille cible, alors qu'ils étaient
    // renseignés (`idealAccountProfile`, déjà lu ailleurs par `perimeterLine`).
    if (input.profilePerimeter) {
      profile.size = input.profilePerimeter.size
      if (input.profilePerimeter.sectorsPriority.length > 0) {
        profile.sectorsPriority = [...input.profilePerimeter.sectorsPriority]
      }
    }
    layers.push(profile)
  }

  if (capabilities.readsPortfolio) layers.push({ id: 'portfolio', state: 'used' })

  if (!capabilities.readsCrm) layers.push({ id: 'crm', state: 'not_read_here' })
  // #2453 — « Neutre » écarte le CRM branché : Analyser ne l'envoie pas au run.
  else if (input.crmConnected)
    layers.push({ id: 'crm', state: contextModeExcludes(mode, 'crm') ? 'ignored_by_mode' : 'used' })
  else layers.push({ id: 'crm', state: 'not_connected', action: 'connect_crm' })

  return { surface: input.surface, mode, modes_available: [...capabilities.modes], layers }
}
