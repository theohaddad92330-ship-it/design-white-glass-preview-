import { TOOLING_PRESENCE_ABSENT, type ToolingMapKey } from '@bellum/contracts'
import type { Choice, QuestionContext } from './types'

/**
 * #2054.19 — retire « Nous n'avons pas cet outil » d'UN maillon quand une
 * connexion RÉELLE de l'espace le confirme branché, et jamais des dix autres.
 *
 * `toolingMapKeysForConnectedTools` (`@bellum/contracts`) dit déjà QUELS
 * maillons une connexion peut parler — ce module se contente de LIRE son
 * résultat pour un maillon donné, jamais une famille écrite en dur ici. C'est
 * le même principe que `resolveChoices` du profil progressif (#2031.10) :
 * un choix se retire pour LUI-MÊME, la question ne disparaît jamais.
 *
 * ⚠️ On ne devine PAS qui utilise l'outil (`TOOLING_PRESENCE_SCALE` porte
 * « Moi seul » / « Toute l'ESN » / etc.) : une connexion prouve seulement que
 * l'outil EXISTE, jamais qui s'en sert. Retirer « pas cet outil » est donc la
 * SEULE inférence honnête — inventer une des cinq autres valeurs serait une
 * donnée fictive.
 */
export function resolveToolingChoices(
  mapKey: ToolingMapKey,
  choices: readonly Choice[],
): (context: QuestionContext) => Choice[] {
  return (context: QuestionContext): Choice[] =>
    context.connectedToolingMapKeys.includes(mapKey)
      ? choices.filter(c => c.value !== TOOLING_PRESENCE_ABSENT)
      : [...choices]
}
