/**
 * Le chemin entre un chiffre et ce qu'il compte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le défaut a un nom, donné par Louis à la deuxième occurrence : « une réponse
 * juste, calculée, sans chemin depuis l'endroit où la question se pose ». Un
 * compteur affiché en haut d'un écran est exact ; ce qu'il compte est plus bas ;
 * et rien ne relie les deux, si bien que la seule façon d'aller voir est de
 * chercher à l'œil ce que la machine savait déjà.
 *
 * Première occurrence : les tuiles du cockpit (#1095, #1096) — « quand ça met
 * retard en rouge et je ne peux pas cliquer dessus aie aie aie stress ».
 * Deuxième : la pastille « 3 alertes » de `/pilotage` (#1128) — « pareil que les
 * autres fois ».
 *
 * Le geste vivait à l'intérieur de la bande d'indicateurs du cockpit. Il en sort
 * pour une raison précise : deux mécanismes séparés auraient divergé à la
 * première correction — l'un aurait appris à respecter « moins de mouvement »,
 * l'autre non, et personne ne l'aurait vu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS DÉCISIONS QUE LE GESTE PORTE
 * ─────────────────────────────────────────────────────────────────────────────
 * • **Le focus, pas seulement le défilement.** Amener une carte à l'écran sans
 *   lui donner le focus laisse la tabulation au point de départ et ne dit RIEN à
 *   un lecteur d'écran : le chemin n'existerait qu'à la souris.
 * • **Une destination absente n'est pas une erreur.** Elle peut manquer pour de
 *   bonnes raisons (chargement, repli, section repliée). L'appelant l'apprend
 *   par le retour et décide — essayer la suivante, ou ne rien faire.
 * • **`tabIndex = -1`**, jamais `0` : la destination n'est pas un contrôle,
 *   c'est un endroit où l'on arrive. L'insérer dans l'ordre de tabulation
 *   ajouterait des arrêts qui ne font rien.
 */

/**
 * Les propriétés d'une DESTINATION, à poser sur le bloc où le chiffre mène.
 *
 * Les deux bouts du chemin passent par ce module : l'identifiant déclaré ici est
 * celui que `revealTarget` ira chercher. Une clé recopiée à la main d'un côté se
 * décalerait de l'autre sans que rien ne rougisse.
 */
export function revealTargetProps(targetId: string): { id: string; tabIndex: -1 } {
  return { id: targetId, tabIndex: -1 }
}

/**
 * Amène la destination à l'écran et lui donne le focus.
 *
 * Rend `false` — sans rien casser — quand elle n'est pas dans le document.
 *
 * ⚠️ La préférence « moins de mouvement » se lit AU CLIC et non au rendu : elle
 * peut changer entre les deux. `matchMedia` est par ailleurs absent de certains
 * environnements ; sans réponse on ne fait pas défiler en douceur, le geste
 * reste correct.
 */
export function revealTarget(targetId: string): boolean {
  const target = document.getElementById(targetId)
  if (!target) return false
  // Une destination dans un repli (<details>) est dans le document mais invisible : le geste l'ouvre,
  // sinon le défilement n'amène nulle part (Pilotage — « La chaîne », « Détail » sont repliés).
  for (let node: Element | null = target.parentElement; node; node = node.parentElement) {
    if (node instanceof HTMLDetailsElement && !node.open) node.open = true
  }
  const reduced =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  target.focus({ preventScroll: true })
  return true
}
