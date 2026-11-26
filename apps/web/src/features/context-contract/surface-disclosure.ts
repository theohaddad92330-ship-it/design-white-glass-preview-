import type { TFunction } from 'i18next'
import type { ContextSurface, SurfaceContextContract } from '@bellum/contracts'
import type { ChatResponseContext } from '@/features/chat/view/ContextDisclosure'
import { getAccountSizeLabels } from '@/features/profile-context/lib/labels'

/**
 * #2454.6 — les phrases qui changent d'une surface à l'autre. Le panneau de
 * Laura dit « cette réponse » et « sources citées » : faux sous une recherche
 * Découvrir. Le reste du panneau (sections, non consulté, lien confidentialité)
 * est le MÊME composant, pas une copie (GA-26).
 */
export type SurfaceDisclosureCopy = {
  summaryParts: string[]
  summary: string
  activeTitle: string
  sourcesTitle: string
  noDocument: string
}

/** Une surface hors conversation n'a ni compte résolu, ni contacts, ni plan, ni mémoire : jamais « 0 » affiché. */
const EMPTY_ACTIVE: Omit<ChatResponseContext['active'], 'profile'> = {
  account: { present: false, name: null },
  contacts_count: 0,
  plan: { present: false },
  portfolio: { present: false, count: 0 },
  memory: { pinned_facts: 0, has_summary: false },
}

/**
 * Traduit le contrat de contexte SERVEUR (`GET /context-contract`) en l'objet
 * que `ContextDisclosure` sait rendre. Pure : rien n'est lu, rien n'est deviné
 * — une couche absente du contrat n'apparaît pas.
 */
export function surfaceDisclosure(
  contract: SurfaceContextContract,
  t: TFunction<'chat'>,
): { context: ChatResponseContext; copy: SurfaceDisclosureCopy } {
  const profile = contract.layers.find(layer => layer.id === 'esn_profile')
  const profileUsed = profile?.state === 'used'
  const profileName = profile?.name
    ? profile.version
      ? t('contextContract.profileVersioned', { name: profile.name, version: profile.version })
      : profile.name
    : null
  // #2889 — le PÉRIMÈTRE (`idealAccountProfile`, la même source que
  // `perimeterLine` côté /search) : une puce séparée du nom, jamais devinée
  // depuis un champ voisin. `size` est toujours présent quand le profileur a
  // tourné ; `sectorsPriority` peut être vide (aucun secteur déclaré).
  const profilePerimeter =
    profileUsed && profile?.size
      ? profile.sectorsPriority && profile.sectorsPriority.length > 0
        ? t('contextContract.profilePerimeterWithSectors', {
            size: getAccountSizeLabels()[profile.size],
            sectors: profile.sectorsPriority.join(', '),
          })
        : t('contextContract.profilePerimeterSizeOnly', { size: getAccountSizeLabels()[profile.size] })
      : null

  const modeLabel = t(`contextContract.modes.${contract.mode}`)
  const sources: ChatResponseContext['sources'] = []
  const notConsulted: string[] = []
  const actions: NonNullable<ChatResponseContext['not_consulted_actions']> = []
  const usedParts: string[] = []

  for (const layer of contract.layers) {
    if (layer.id === 'esn_profile') {
      // #2454.10 — ignoré par le mode : NOMMÉ comme tel, jamais retiré en silence.
      // #2451.1 — l'absence nomme le mode qui l'a décidée (jamais « Neutre » par défaut).
      if (layer.state === 'ignored_by_mode') notConsulted.push(t('contextContract.profileIgnored', { mode: modeLabel }))
    } else if (layer.id === 'portfolio') {
      if (layer.state === 'used') {
        sources.push({ kind: 'portfolio', label: t('contextContract.portfolio') })
        usedParts.push(t('contextContract.summaryPortfolio'))
      }
    } else if (layer.id === 'crm') {
      if (layer.state === 'used') {
        sources.push({ kind: 'crm', label: t('contextContract.crmUsed') })
        usedParts.push(t('contextContract.summaryCrm'))
      } else if (layer.state === 'ignored_by_mode')
        notConsulted.push(t('contextContract.crmIgnored', { mode: modeLabel }))
      else if (layer.state === 'not_read_here') notConsulted.push(t('contextContract.crmNotReadHere'))
      else if (layer.state === 'not_connected') {
        const label = t('contextContract.crmNotConnected')
        notConsulted.push(label)
        // #2454.8 — la couche absente est PROPOSÉE, jamais activée seule.
        if (layer.action) actions.push({ label, action: layer.action })
      }
    }
  }

  const summaryParts: string[] = []
  if (profileUsed) summaryParts.push(t('disclosure.summaryProfile'))
  summaryParts.push(...usedParts)

  const surface: ContextSurface = contract.surface
  return {
    context: {
      active: {
        profile: {
          present: profileUsed,
          name: profileUsed ? profileName : null,
          ...(profilePerimeter ? { perimeter: profilePerimeter } : {}),
        },
        ...EMPTY_ACTIVE,
      },
      sources,
      not_consulted: notConsulted,
      not_consulted_actions: actions,
    },
    copy: {
      summaryParts,
      summary: t(`disclosure.surfaces.${surface}.summary`, { parts: summaryParts.join(', ') }),
      activeTitle: t(`disclosure.surfaces.${surface}.activeTitle`),
      sourcesTitle: t(`disclosure.surfaces.${surface}.sourcesTitle`),
      noDocument: t(`disclosure.surfaces.${surface}.noDocument`),
    },
  }
}
