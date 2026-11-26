import { GUIDE_TARGET_TIMEOUT_MS, type GuideTargetResolution } from '@bellum/contracts'
import { findGuideAnchorElement, isDeclaredGuideAnchor } from './guide-anchors'

/**
 * #2212.24/.31/.36/.37/.41 — TROUVER LA CIBLE, OU DIRE POURQUOI ON NE L'A PAS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE FONCTION GARANTIT, ET QUI EST LA MOITIÉ DU LOT
 * ─────────────────────────────────────────────────────────────────────────────
 *  · elle SE RÈGLE TOUJOURS — jamais de promesse en suspens. Un appelant qui
 *    attend une promesse qui ne se règle jamais, c'est la définition de
 *    « l'application bloquée » (#2212.38) ;
 *  · elle ne REJETTE jamais — un `throw` ici remonterait dans un effet React et
 *    ferait tomber l'écran (#2212.39). Un guide ne fait pas planter la page ;
 *  · elle n'attend JAMAIS au-delà du délai (#2212.41), et le test le mesure au
 *    chronomètre plutôt que de le croire ;
 *  · elle NOMME l'absence (#2212.37). Jamais « pas trouvé » tout court : une
 *    cible absente est un fait, et un fait sans raison n'est pas exploitable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI PAS DE REACT ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * « Attend une cible en retard mais renonce au bout de 1,2 s » se teste avec un
 * chronomètre et un `setTimeout`, pas avec un rendu. Mettre cette logique dans
 * un hook obligerait à monter un composant pour vérifier un délai, et le test
 * mesurerait React plutôt que la règle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI `MutationObserver` ET PAS UNE BOUCLE DE SONDAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une cible arrive quand un rendu l'ajoute au DOM (#2212.24 : un aller-retour
 * réseau, un tiroir qui s'ouvre — #2212.25). L'observateur réagit à CE moment,
 * alors qu'un sondage toutes les 50 ms ajouterait jusqu'à 50 ms de retard visible
 * et tournerait pour rien le reste du temps. Il est débranché dès que le verdict
 * est rendu — un observateur qui survit à sa réponse est une fuite, et une fuite
 * dans un guide finit par ralentir tout le produit.
 */
type ResolveGuideAnchorOptions = {
  anchor: string
  /** #2212.36 — la cible de secours, essayée quand la principale n'est jamais venue. */
  fallbackAnchor?: string
  /** Le délai. Par défaut celui du contrat — un seul endroit (GA-26). */
  timeoutMs?: number
  /** Permet à l'appelant de renoncer (démontage, changement de route — #2212.26). */
  signal?: AbortSignal
}

export function resolveGuideAnchor(options: ResolveGuideAnchorOptions): Promise<GuideTargetResolution> {
  const { anchor, fallbackAnchor, timeoutMs = GUIDE_TARGET_TIMEOUT_MS, signal } = options

  const candidates = fallbackAnchor ? [anchor, fallbackAnchor] : [anchor]

  /**
   * #2212.37 — un ancrage que personne n'a déclaré accuse le DÉPÔT, pas la
   * situation. Il ne sert à rien d'attendre 1,2 s pour l'apprendre, et attendre
   * donnerait `timeout` — une raison qui enverrait chercher le défaut au mauvais
   * endroit.
   */
  if (!candidates.some(isDeclaredGuideAnchor)) {
    return Promise.resolve({ state: 'absent', anchor, reason: 'anchor-undeclared' })
  }

  /** La cible principale d'abord : le secours ne vole jamais la place. */
  const look = (): GuideTargetResolution | null => {
    for (const candidate of candidates) {
      if (!isDeclaredGuideAnchor(candidate)) continue
      if (findGuideAnchorElement(candidate)) {
        return { state: 'resolved', anchor: candidate, viaFallback: candidate !== anchor }
      }
    }
    return null
  }

  const immediate = look()
  if (immediate) return Promise.resolve(immediate)

  return new Promise<GuideTargetResolution>(resolve => {
    let settled = false

    /**
     * Tout ce qu'il faut débrancher, collecté au fur et à mesure. Une liste
     * plutôt que des variables nommées : `settle` doit pouvoir tout débrancher
     * sans connaître d'avance ce qui aura été branché, et chaque chose est
     * enregistrée au moment MÊME où elle est créée — c'est ce qui rend
     * impossible d'en brancher une et d'oublier de la débrancher.
     */
    const unbind: Array<() => void> = []

    // Un seul point de sortie : c'est ce qui rend impossible « la promesse
    // s'est réglée deux fois » et « l'observateur tourne encore ».
    const settle = (resolution: GuideTargetResolution) => {
      if (settled) return
      settled = true
      for (const off of unbind) off()
      resolve(resolution)
    }

    // #2212.41 — l'abandon est un verdict, pas un rejet.
    const giveUp = () => settle({ state: 'absent', anchor, reason: 'timeout' })

    if (signal?.aborted) {
      giveUp()
      return
    }
    if (signal) {
      signal.addEventListener('abort', giveUp)
      unbind.push(() => signal.removeEventListener('abort', giveUp))
    }

    // #2212.24/.25 — la cible peut arriver plus tard, y compris dans un tiroir.
    const observer = new MutationObserver(() => {
      const found = look()
      if (found) settle(found)
    })
    observer.observe(document.body, { childList: true, subtree: true })
    unbind.push(() => observer.disconnect())

    const timer = setTimeout(giveUp, timeoutMs)
    unbind.push(() => clearTimeout(timer))

    // Entre le premier coup d'œil et le branchement de l'observateur, un rendu
    // a pu poser la cible. Sans ce second regard, elle n'arriverait qu'au
    // prochain changement du DOM — c'est-à-dire peut-être jamais.
    const late = look()
    if (late) settle(late)
  })
}
