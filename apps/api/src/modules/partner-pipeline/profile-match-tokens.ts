import type { EsnDirectoryEntity } from '../../database/entities/esn-directory.entity'
import type { EsnAnswers } from '@bellum/contracts'
import type { AccountObservationStatus } from './esn-on-accounts-merge'

/**
 * #1798 / GA-07 — ce que `PartnerPipelineService` reçoit du référentiel ESN et
 * du profil de l'espace, sous forme de JETON.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI PAS DEUX IMPORTS DE SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * **GA-07 (`module-boundaries.spec.ts`) est un cliquet AU PLAFOND** — 254
 * imports sur 124 fichiers au 10/09/2026, marge NULLE. Le listing des ESN qui
 * collent au profil a besoin de deux lectures cross-module :
 * `EsnDirectoryService.byDepartment` et `EsnProfileReader.getAnswers`. Les
 * importer directement dans le service ferait passer le compteur à 256 sans
 * découpler quoi que ce soit.
 *
 * Le fichier de composition (`partner-pipeline.module.ts`) connecte les deux
 * classes à ces jetons ; un `*.module.ts` est HORS du périmètre de la garde
 * par construction (§3.2 : « les `*.module.ts` sont la composition »). Ce
 * fichier-ci ne connaît que la FORME de ce qu'il reçoit, jamais les classes
 * qui la produisent — c'est ce qui rend le module retirable d'un bloc.
 *
 * ⚠️ Ce n'est PAS un contournement de la garde : la règle qu'elle protège est
 * « aucun SERVICE ne va chercher le service d'un voisin », et après ce
 * changement aucun ne le fait plus. Contourner aurait été de déplacer l'appel
 * dans un contrôleur pour ne pas être compté, en gardant le même couplage.
 */

/** Les ESN dont le siège est dans ce département, au plus `limit`. */
export type EsnDirectoryByDepartment = (department: string, limit?: number) => Promise<EsnDirectoryEntity[]>

/** Les réponses de profil de l'espace — la SOURCE unique, jamais recalculée. */
export type EsnProfileAnswersReader = (userId: string) => Promise<EsnAnswers>

/**
 * #2151.32 — ce que la mémoire marché sait d'UN compte, pour `onMyAccounts`.
 * MÊME raison de jeton que les deux au-dessus (GA-07 au plafond, marge
 * NULLE) : importer `MarketMemoryService` ici ferait passer le compteur de
 * 254 à 256 sans rien découpler. `partner-pipeline.module.ts` connecte la
 * classe à ce jeton ; ce fichier ne connaît que la FORME de ce qu'il reçoit.
 */
export type MarketEsnObservationReader = (lookup: {
  ref: string
  name: string
  website: string | null
  country: string | null
}) => Promise<AccountObservationStatus>

export const ESN_DIRECTORY_BY_DEPARTMENT = Symbol('ESN_DIRECTORY_BY_DEPARTMENT')
export const ESN_PROFILE_ANSWERS_READER = Symbol('ESN_PROFILE_ANSWERS_READER')
export const MARKET_ESN_OBSERVATION_READER = Symbol('MARKET_ESN_OBSERVATION_READER')
