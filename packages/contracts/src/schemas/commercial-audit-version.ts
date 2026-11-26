import { canonicalJson } from './layered-profile.js'
import { importContentFingerprint } from './import-resume.js'
import type { ProfileContext } from './profile-context.js'

/**
 * #2908 (#2011.4) — LA VERSION du dossier d'audit commercial, en EMPREINTE DE
 * CONTENU, pas un compteur.
 *
 * `profiles.profile_context_version` existe déjà, mais c'est un COMPTEUR
 * incrémenté à chaque génération réussie (`ProfileContextRevisionService.
 * recordNewVersion`) — il bouge même quand deux générations produisent un
 * contenu identique. La régénération CIBLÉE par section (#2010.16, #2011.10)
 * a besoin de la question inverse : « ce que je viens de recevoir pour CETTE
 * section a-t-il changé au fond ? ». Une empreinte de contenu y répond ; un
 * compteur ne le peut pas.
 *
 * Même primitive que `layerVersionsOf` (JSON à clés triées +
 * `importContentFingerprint`, deux accumulateurs FNV-1a) : une dérivation vit
 * à UN seul endroit (GA-26), recopier l'idée ici aurait divergé au premier
 * écart d'implémentation.
 *
 * `null` pour `null` — jamais une empreinte inventée pour un dossier qui
 * n'existe pas encore.
 */
export function commercialAuditVersionOf(profileContext: ProfileContext | null): string | null {
  if (profileContext === null) return null
  return importContentFingerprint(canonicalJson(profileContext))
}
