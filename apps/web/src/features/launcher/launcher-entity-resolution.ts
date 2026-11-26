import type { LauncherRun } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'

/**
 * #2810 — l'extraction d'entité pour le lanceur « Analyser une entreprise ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER, ET PAS UN APPEL DANS `Composer.submit()`
 * ─────────────────────────────────────────────────────────────────────────
 * `launcher-intent.ts` préremplissait `/search?company=` avec le texte TAPÉ,
 * verbatim — juste tant que personne ne tapait une PHRASE (« analyse-moi
 * BPCE ») plutôt qu'un nom seul. `IaClient.extractSearchEntity` isole ce nom
 * côté serveur, ancré : il ne rend jamais un nom qui ne soit pas recopié mot
 * pour mot de la phrase tapée (`accept_entity`, `apps/ia`). Ce fichier
 * DÉCIDE si l'appel vaut la peine, gratuitement, avant tout réseau — la
 * décision inverse (« est-ce un nom déjà propre ? ») vivrait aussi bien côté
 * serveur, mais y couterait un appel Claude à chaque nom déjà propre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE REPLI EST TOUJOURS LE TEXTE TAPÉ
 * ─────────────────────────────────────────────────────────────────────────
 * Pas de clé de modèle côté IA, panne réseau, ou nom REFUSÉ par l'ancrage
 * serveur (jamais deviné) : `resolveEntity` rend alors le texte tapé,
 * inchangé — zéro régression sur le chemin d'avant ce chantier. En démo,
 * zéro appel réseau du tout (`#1942.4`) : la salle de démonstration ne parle
 * jamais au modèle.
 */

/**
 * Un nom d'entreprise tient dans UN mot ; une PHRASE en a au moins deux.
 *
 * Un mot seul est déjà ce que `/search?company=` attend — l'appeler quand
 * même dépenserait un aller-retour pour rien. Ce n'est vrai QUE pour le run
 * qui lit `company` (`account.analysis`) : les autres runs armés ne
 * préremplissent jamais `/search`, et n'ont donc rien à extraire.
 */
export function needsEntityExtraction(run: LauncherRun | null, text: string): boolean {
  if (!run || run.queryParam !== 'company') return false
  return text.trim().split(/\s+/).filter(Boolean).length > 1
}

/**
 * Résout ce qui part dans `company=` : le nom isolé par le serveur quand
 * l'appel a apporté quelque chose, sinon le texte tapé — jamais un nom
 * inventé ici (doctrine « jamais de donnée fictive »).
 */
export async function resolveEntity(input: {
  run: LauncherRun | null
  text: string
  isDemo: boolean
}): Promise<string> {
  const { run, text, isDemo } = input
  if (isDemo || !needsEntityExtraction(run, text)) return text
  try {
    const { company } = await apiFetch<{ company: string | null }, { text: string; locale: 'fr' | 'en' }>({
      path: '/ia/search/extract-entity',
      method: 'POST',
      body: { text: text.trim(), locale: i18n.language === 'en' ? 'en' : 'fr' },
    })
    return company ?? text
  } catch {
    return text
  }
}
