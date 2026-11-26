/**
 * LA DÉRIVATION QUE L'AXE CHEMIN VA CHERCHER HORS DE SON MODULE (lot 14, GA-07).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN PORT, ET PAS UN IMPORT DE `MarketMemoryService`
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré à l'intégration du 10/09/2026 (`feat/lot-vague2-2026-09-10`) : GA-07
 * (le cliquet des imports service → service) montait de 254 à 256 — les deux
 * imports en cause étaient `analysis.service.ts` et
 * `analysis-ondemand.service.ts` qui allaient chercher `MarketMemoryService`
 * directement dans `../market-memory/market-memory.service`.
 *
 * La sortie est celle que le message de la garde nomme lui-même — « passe par
 * un contrat partagé, un événement, ou fais l'orchestration dans le
 * contrôleur » — appliquée à un service, qui n'a pas de contrôleur où
 * orchestrer : **le service dépend d'une interface qu'il POSSÈDE, et c'est le
 * module qui branche l'implémentation.** Même idiome déjà en place dans
 * `pilotage/stock-sources.ts` (les quatre ports de la photo mensuelle).
 *
 * Ce n'est pas un contournement de la garde, c'est ce qu'elle demande : après
 * ce lot, ni `analysis.service.ts` ni `analysis-ondemand.service.ts` ne
 * connaissent le nom de `MarketMemoryService`. Le couplage qui reste est un
 * couplage de MODULE (déclaré dans `analysis.module.ts`, visible et vérifié au
 * démarrage), pas un couplage de code. `MarketMemoryService` reste la SEULE
 * porte vers les tables partagées de la mémoire marché (GA-258) — seul le
 * CHEMIN D'IMPORT change, le comportement ne bouge pas d'une ligne.
 *
 * ⚠️ Le port est aussi ÉTROIT que possible : une seule méthode, celle que
 * `resolveMarketPathAxis` appelle réellement dans les deux services. Un port
 * qui recopierait la signature entière de `MarketMemoryService` ferait
 * revenir le couplage par la fenêtre.
 *
 * ⚠️ La preuve que `MarketMemoryService` SATISFAIT ce port est faite à la
 * COMPILATION, dans `analysis.module.ts` : le fournisseur est déclaré par
 * `useFactory` avec le port en type de retour — jamais `useExisting`, qui
 * n'aurait rien vérifié du tout (le jeton est un symbole, et TypeScript ne le
 * relie à aucune forme).
 */

/** Le jeton d'injection de l'axe CHEMIN. */
export const MARKET_PATH_AXIS_SOURCE = Symbol('MARKET_PATH_AXIS_SOURCE')

/**
 * Ce qu'un appelant sait du compte avant d'interroger la mémoire marché — la
 * MÊME forme que `MarketCompanyLookup` (`market-memory/market-memory.service.ts`),
 * recopiée ici à dessein : le port ne doit importer AUCUN type du module
 * `market-memory`, sous peine de recréer par les types le couplage que
 * l'import de valeur vient d'éliminer.
 */
interface MarketPathAxisLookup {
  readonly ref: string
  readonly name: string
  readonly website?: string | null
  readonly country?: string | null
}

/**
 * Ce que `resolveMarketPathAxis` lit de la mémoire marché — l'axe CHEMIN de
 * l'adressabilité (#1631.3/.4, #1606.2), et rien d'autre.
 */
export interface MarketPathAxisSource {
  pathAxisFor(lookup: MarketPathAxisLookup): Promise<{ readonly paths: number; readonly topEsn: string | null } | null>
}
