import { EMPTY_STRUCTURED_LEXICON, isEmptyStructuredLexicon, type StructuredLexicon } from '@bellum/contracts'
import { i18n } from './index'
import { isSupportedLanguage } from './config'
import { buildLexiconResources } from './workspace-lexicon-bindings'

/**
 * Applique le lexique de l'espace aux libellés d'objet (D17).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI `addResourceBundle` ET PAS UNE INTERPOLATION
 * ─────────────────────────────────────────────────────────────────────────────
 * L'autre chemin possible était de réécrire les 37 libellés en `{{account}}` et
 * de nourrir `interpolation.defaultVariables`. Il a été écarté pour une raison
 * mesurable : il touche 37 clés × 2 langues dans 9 fichiers JSON, et le dépôt a
 * déjà payé « renommage i18n sur la mauvaise clé » — une clé morte, un écran
 * inchangé, et la garde au vert. Ici, AUCUN fichier de traduction n'est modifié :
 * les chaînes livrées restent la vérité, et la surcharge se pose par-dessus.
 *
 * Conséquence directe : **un espace sans lexique ne déclenche aucun appel**
 * ({@link applyWorkspaceLexicon} sort immédiatement), donc le magasin i18next
 * n'est pas touché et les libellés sont ceux d'aujourd'hui à l'octet près. C'est
 * le no-op STRICT du dépôt, obtenu par l'absence de code plutôt que par une
 * convention.
 */

/** Le dernier lexique appliqué — relu quand la langue change. */
let current: StructuredLexicon = EMPTY_STRUCTURED_LEXICON

/**
 * Pose (ou retire) la surcharge pour la langue courante.
 *
 * Idempotent et réversible : sans surcharge on réécrit la chaîne d'origine, donc
 * retirer un terme préféré remet le mot du produit sans rechargement.
 *
 * `emit('languageChanged')` est le signal auquel react-i18next abonne déjà
 * chaque `useTranslation()` — c'est ce qui fait que la barre latérale change
 * sous les yeux de l'utilisateur au lieu d'attendre un F5. Il n'est PAS émis
 * quand rien n'a été posé : un rendu de plus sur toute l'application pour un
 * changement nul est un coût sans contrepartie.
 */
export function applyWorkspaceLexicon(lexicon: StructuredLexicon | null | undefined): void {
  const next = lexicon ?? EMPTY_STRUCTURED_LEXICON
  const wasEmpty = isEmptyStructuredLexicon(current)
  current = next
  // Rien avant, rien maintenant ⇒ ne toucher à rien. C'est le cas de l'immense
  // majorité des espaces, et c'est celui qui doit être byte-identique.
  if (wasEmpty && isEmptyStructuredLexicon(next)) return
  writeBundles()
  i18n.emit('languageChanged', i18n.language)
}

/** Réapplique après un changement de langue — les termes sont par langue. */
function writeBundles(): void {
  const locale = isSupportedLanguage(i18n.language) ? i18n.language : 'fr'
  const bundles = buildLexiconResources(current, locale)
  for (const [namespace, resources] of Object.entries(bundles)) {
    // `deep` + `overwrite` : on remplace la feuille sans effacer ses frères.
    i18n.addResourceBundle(locale, namespace, resources, true, true)
  }
}

/**
 * Branche la réapplication sur le changement de langue.
 *
 * Sans elle, passer en anglais rendrait les libellés du produit alors que
 * l'espace a posé des termes anglais — le réglage aurait l'air de s'être perdu.
 * Le garde-fou anti-boucle est l'absence de `emit` ici : on écrit le magasin,
 * react-i18next re-rend déjà pour le changement de langue lui-même.
 */
let watching = false

export function watchLanguageForLexicon(): void {
  // Idempotent : React remonte les effets (StrictMode, navigation), et un
  // abonnement de plus à chaque montage réécrirait le magasin autant de fois.
  if (watching) return
  watching = true
  i18n.on('languageChanged', () => {
    if (isEmptyStructuredLexicon(current)) return
    writeBundles()
  })
}

/** Le lexique appliqué — pour les tests, et pour l'aperçu de l'écran de réglage. */
export function currentWorkspaceLexicon(): StructuredLexicon {
  return current
}
