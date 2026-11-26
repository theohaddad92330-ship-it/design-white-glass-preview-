/**
 * #1640.6 — LE DRAPEAU QUI EMPÊCHE UN SCORE D'EXTERNALISATION DE S'AFFICHER
 * AVANT QU'IL SOIT NORMALISÉ PAR COHORTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EXISTE DÉJÀ, ET POURQUOI ÇA NE SUFFIT PAS À L'AFFICHER
 * ─────────────────────────────────────────────────────────────────────────────
 * `market_company_signal.externalization_score` (`MarketCompanySignalEntity.
 * externalizationScore`, `apps/api/src/database/entities/
 * market-company-signal.entity.ts:61-62`) est un `numeric` NULLABLE, rempli à
 * l'ingestion (`market-memory-import.ts:249`) sur une échelle 0-100. Il n'est
 * lu par AUCUN service applicatif — `MarketMemoryService` construit sa
 * `MarketMemoryCoverage` sans lui, délibérément.
 *
 * Le brancher tel quel casserait la doctrine deux fois :
 *
 *   1. **Un score n'est jamais nu.** (`c26_probabilite`, registre de doctrine.)
 *      Un nombre seul, sans ses axes nommés, se lit comme une probabilité —
 *      refusé six fois. `externalization_score` est un scalaire unique, sans
 *      décomposition : il ne PEUT pas s'afficher tel quel.
 *   2. **Il n'est pas normalisé par cohorte.** Le score brut mélange une PME de
 *      20 personnes et un groupe du CAC 40 sur la même échelle 0-100 : le
 *      second externalise mécaniquement plus de VOLUME sans externaliser plus
 *      en PROPORTION. Sans normalisation par taille/secteur, le nombre
 *      mesurerait la taille de l'entreprise, pas son comportement d'achat —
 *      exactement le défaut que la doctrine nomme pour le nombre brut de
 *      parcours (`MARKET_MEMORY_MIN_PATHS`, même fichier).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE DRAPEAU FAIT, ET CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne CALCULE rien — la normalisation par cohorte reste un chantier entier
 * (choisir la cohorte, la taille de l'échantillon minimale, la méthode). Il
 * pose seulement la question à l'endroit où un futur appelant la lira : « le
 * score est-il prêt à s'afficher ? » tant qu'il n'existe qu'une réponse
 * possible, câblée en dur.
 *
 * `false` EN DUR, sans variable d'environnement : ce n'est pas un
 * kill-switch opérationnel (la liste de `apps/api/src/common/kill-switches.ts`
 * — activable/désactivable en prod) mais une décision PRODUIT qui attend un
 * chantier de calibration, pas un incident à contourner. Le jour où la
 * normalisation existe, ce fichier change de valeur ET d'attestation — les
 * deux dans la même revue.
 *
 * `GA-257` (`apps/web/src/architecture/market-memory-score-single-reader.test.ts`)
 * tient l'autre moitié du refus : tant que ce drapeau est `false`, aucun écran
 * de `apps/web` ne lit `externalizationScore` ailleurs qu'à l'unique endroit
 * calibré qu'elle nomme. Numéro VÉRIFIÉ à l'intégration le 07/09/2026 — le plus
 * haut existant était GA-256 (`le-document-ne-defile-jamais.test.ts`).
 */
export const MARKET_MEMORY_SCORING_ENABLED = false as const
