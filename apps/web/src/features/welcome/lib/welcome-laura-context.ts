import type { TFunction } from 'i18next'
import type { LauraContextFacet, LauraPageContext, RecruitsForClients } from '@bellum/contracts'

/**
 * #2091.34 — CE QUE `/welcome` DÉCLARE À LAURA quand « Laisse Laura choisir »
 * ouvre la conversation.
 *
 * Réutilise le canal déjà branché pour les dossiers de compte (#2123.56,
 * `LauraPageContext` / `entryPageContext`) : `kind: 'screen'` est le genre
 * générique du contrat, pas une extension — GA-08 interdit d'insérer un genre
 * au milieu de `LAURA_CONTEXT_KINDS`, et aucun n'était nécessaire ici.
 *
 *  - « périmètre » et « stratégie » deviennent des facets, DÉCLARÉES
 *    seulement quand l'ESN a répondu — un signal absent (`null`) ne se
 *    devine jamais, il ne fait simplement aucune facette (doctrine : « on
 *    n'affiche pas ce qu'on n'a pas ») ;
 *  - « objet » reste `entityId: null` : ce welcome ne cadre encore aucun
 *    compte précis, contrairement à un panneau de compte ouvert ;
 *  - « audit actif » et « première question » ne sont PAS ici : le premier
 *    est déjà lu par Laura elle-même (`hasProfileContext`, côté écran) et la
 *    seconde reste l'amorce `justOnboarded` (#1921.10) — un texte que Laura
 *    prononce, jamais une question envoyée à sa place.
 */
export function welcomeLauraContext(
  t: TFunction<'welcome'>,
  input: {
    isLoading: boolean
    recruitsForClients: RecruitsForClients | null | undefined
    targetSectors: readonly string[]
    /** #2091.34 — un profil de contexte (l'audit) existe pour cet espace. */
    hasActiveAudit?: boolean
  },
): LauraPageContext {
  const facets: LauraContextFacet[] = []
  if (input.recruitsForClients) {
    facets.push({
      label: t('lauraContext.strategyLabel'),
      value: t(`lauraContext.strategy.${input.recruitsForClients}`),
    })
  }
  // #2091.34 — « audit actif » : déclaré seulement quand un audit existe, jamais un « inactif » inventé.
  if (input.hasActiveAudit) {
    facets.push({ label: t('lauraContext.auditLabel'), value: t('lauraContext.auditActive') })
  }
  if (input.targetSectors.length > 0) {
    // Borne du contrat (`lauraContextFacetSchema.value`, 160 caractères) :
    // on coupe plutôt que de laisser le contexte ENTIER tomber à `null`.
    const value = input.targetSectors.slice(0, 5).join(', ')
    facets.push({ label: t('lauraContext.scopeLabel'), value: value.length <= 160 ? value : `${value.slice(0, 159)}…` })
  }

  return {
    kind: 'screen',
    label: t('lauraContext.title'),
    entityId: null,
    facets,
    state: input.isLoading ? 'loading' : 'ready',
    purpose: t('lauraContext.purpose'),
  }
}
