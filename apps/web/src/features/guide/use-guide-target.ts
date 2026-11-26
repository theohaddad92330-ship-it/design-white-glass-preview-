import { useEffect, useRef, useState } from 'react'
import type { GuideAbsenceReason } from '@bellum/contracts'
import { findGuideAnchorElement } from './guide-anchors'
import { closedGuideGate, type GuideStepContext } from './guide-step-gate'
import { resolveGuideAnchor } from './guide-target-resolver'
import { needsScrollIntoView, type GuideRect, type GuideViewport } from './guide-spotlight-geometry'
import type { GuideStep } from './guide-store'

/**
 * #2212.17/.22/.23/.26 — LA CIBLE, ET LE FAIT QU'ELLE BOUGE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI FAIT BOUGER UN SPOTLIGHT, ET POURQUOI IL FAUT LES QUATRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un halo posé une fois est un halo faux dès le premier geste :
 *
 *  · la page DÉFILE (#2212.17) — le halo doit suivre, sinon il désigne le vide ;
 *  · la fenêtre est REDIMENSIONNÉE (#2212.22) — une mise en page qui se
 *    réorganise déplace la cible sans qu'elle change ;
 *  · le CONTENU change (#2212.23) — une ligne insérée au-dessus pousse tout ce
 *    qui suit, y compris la cible ;
 *  · la ROUTE change (#2212.26) — et là ce n'est plus une position à recalculer :
 *    c'est une étape qui n'a peut-être plus de sens du tout, donc la porte à
 *    repasser.
 *
 * Les trois premiers se règlent en REMESURANT. Le quatrième se règle en
 * REJUGEANT — c'est la différence importante, et c'est pour ça que la route est
 * dans les dépendances de l'effet de résolution et pas seulement de la mesure.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ÉTATS, ET « EN RECHERCHE » N'AFFICHE RIEN
 * ─────────────────────────────────────────────────────────────────────────────
 * Tant que la cible n'est pas trouvée, l'appelant ne rend RIEN. Pas de bulle
 * « chargement », pas de halo au centre de l'écran : un halo sur du vide est
 * pire qu'un guide muet, parce qu'il se voit.
 */
type GuideTargetState =
  | { status: 'searching' }
  | { status: 'resolved'; anchor: string; rect: GuideRect; keepClear: GuideRect | null; viaFallback: boolean }
  | { status: 'absent'; reason: GuideAbsenceReason }

/**
 * Les `inset` collants du produit, à UN endroit (GA-26).
 *
 * En bas, sous la borne mobile : la barre d'onglets (`features/mobile/MobileTabBar.tsx`,
 * `min-h-14` = 56 px). En haut, rien de systématique — les en-têtes collants du
 * produit sont internes à leur écran, et une cible cachée derrière l'un d'eux est
 * rattrapée par `needsScrollIntoView`, qui amène la cible avant de mesurer.
 */
const MOBILE_TAB_BAR_HEIGHT = 56
const MOBILE_BREAKPOINT = 768

/** La fenêtre telle que le spotlight la voit. Un seul endroit qui lit `window`. */
export function guideViewportFromWindow(): GuideViewport {
  const width = window.innerWidth
  return {
    width,
    height: window.innerHeight,
    stickyTopInset: 0,
    stickyBottomInset: width < MOBILE_BREAKPOINT ? MOBILE_TAB_BAR_HEIGHT : 0,
  }
}

function measure(element: Element): GuideRect {
  const box = element.getBoundingClientRect()
  return { top: box.top, left: box.left, width: box.width, height: box.height }
}

/**
 * R33b — la zone que la bulle ne doit pas recouvrir : l'union des éléments `data-guide-keep-clear` (les amorces de
 * Laura sur /chat). `null` quand l'écran n'en porte aucun ou qu'ils sont masqués.
 */
function measureKeepClear(): GuideRect | null {
  if (typeof document === 'undefined') return null
  const rects = Array.from(document.querySelectorAll('[data-guide-keep-clear]'))
    .map(measure)
    .filter(rect => rect.width > 0 && rect.height > 0)
  if (rects.length === 0) return null
  const top = Math.min(...rects.map(rect => rect.top))
  const left = Math.min(...rects.map(rect => rect.left))
  return {
    top,
    left,
    width: Math.max(...rects.map(rect => rect.left + rect.width)) - left,
    height: Math.max(...rects.map(rect => rect.top + rect.height)) - top,
  }
}

function sameRect(a: GuideRect | null, b: GuideRect | null): boolean {
  if (a === null || b === null) return a === b
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
}

export function useGuideTarget(step: GuideStep | undefined, context: GuideStepContext): GuideTargetState {
  const [state, setState] = useState<GuideTargetState>({ status: 'searching' })

  const anchor = step?.anchor
  const fallbackAnchor = step?.fallbackAnchor
  const requirements = step?.requirements

  /**
   * ⚠️ LE CONTEXTE NE PEUT PAS ÊTRE UNE DÉPENDANCE D'EFFET, ET C'EST UN PIÈGE
   * QUI COÛTE LA PAGE.
   *
   * `context` est un objet reconstruit à chaque rendu par l'appelant, et
   * `permissions` / `availableData` / `enabledFlags` sont des tableaux neufs à
   * chaque fois. Les mettre dans les dépendances relancerait l'effet à chaque
   * rendu ; l'effet appelle `setState`, qui provoque un rendu, qui relance
   * l'effet — une boucle infinie, c'est-à-dire exactement « le guide bloque
   * l'application » (#2212.38) et « le guide fait planter la page » (#2212.39).
   *
   * On dépend donc de la VALEUR des champs (aplatie en chaîne), et on lit
   * l'objet par une référence au moment où on en a besoin.
   */
  const contextRef = useRef(context)
  contextRef.current = context
  const permissionsKey = context.permissions.join('|')
  const availableDataKey = context.availableData.join('|')
  const enabledFlagsKey = context.enabledFlags.join('|')

  // ── 1. JUGER, puis CHERCHER. La route est ici : elle rejuge, elle ne remesure pas.
  useEffect(() => {
    if (!anchor) return
    setState({ status: 'searching' })

    // #2212.32-.35 — les portes d'abord : inutile de chercher dans le DOM une
    // cible qu'on n'aurait pas le droit de montrer.
    const closed = closedGuideGate(requirements ?? {}, contextRef.current)
    if (closed) {
      setState({ status: 'absent', reason: closed })
      return
    }

    const controller = new AbortController()
    let live = true

    void resolveGuideAnchor({ anchor, fallbackAnchor, signal: controller.signal }).then(resolution => {
      if (!live) return
      if (resolution.state === 'absent') {
        setState({ status: 'absent', reason: resolution.reason })
        return
      }
      const element = findGuideAnchorElement(resolution.anchor)
      if (!element) {
        // Trouvée puis disparue entre la résolution et la mesure. Ça arrive, et
        // ce n'est pas une panne : c'est une absence, nommée comme telle.
        setState({ status: 'absent', reason: 'timeout' })
        return
      }
      // #2212.18 — on AMÈNE la cible avant de la désigner. Le défilement
      // appartient au navigateur, qui respecte « moins de mouvement » tout seul.
      if (needsScrollIntoView(measure(element), guideViewportFromWindow())) {
        element.scrollIntoView({ block: 'center', inline: 'nearest' })
      }
      setState({
        status: 'resolved',
        anchor: resolution.anchor,
        rect: measure(element),
        keepClear: measureKeepClear(),
        viaFallback: resolution.viaFallback,
      })
    })

    return () => {
      live = false
      controller.abort()
    }
    // #2212.26 — la route est ici : un changement de route REJUGE l'étape.
  }, [
    anchor,
    fallbackAnchor,
    requirements,
    context.route,
    context.viewportWidth,
    permissionsKey,
    availableDataKey,
    enabledFlagsKey,
  ])

  // ── 2. REMESURER. Rien ne rejuge ici : on suit une cible déjà acceptée.
  const resolvedAnchor = state.status === 'resolved' ? state.anchor : null
  useEffect(() => {
    if (!resolvedAnchor) return
    const anchorId = resolvedAnchor

    const remeasure = () => {
      const element = findGuideAnchorElement(anchorId)
      if (!element) {
        // La cible s'en est allée en cours de route (tiroir refermé, ligne
        // retirée). On le DIT plutôt que de garder un halo sur du vide.
        setState({ status: 'absent', reason: 'timeout' })
        return
      }
      const rect = measure(element)
      const keepClear = measureKeepClear()
      setState(current =>
        current.status === 'resolved' &&
        current.rect.top === rect.top &&
        current.rect.left === rect.left &&
        current.rect.width === rect.width &&
        current.rect.height === rect.height &&
        sameRect(current.keepClear, keepClear)
          ? current
          : { ...current, status: 'resolved', anchor: anchorId, rect, keepClear, viaFallback: false },
      )
    }

    const unbind: Array<() => void> = []

    // #2212.17 — le défilement, en capture : la cible peut vivre dans un
    // conteneur défilant interne, pas seulement dans la fenêtre.
    window.addEventListener('scroll', remeasure, { capture: true, passive: true })
    unbind.push(() => window.removeEventListener('scroll', remeasure, { capture: true }))

    // #2212.22 — le redimensionnement de la fenêtre.
    window.addEventListener('resize', remeasure, { passive: true })
    unbind.push(() => window.removeEventListener('resize', remeasure))

    // #2212.22 — et celui de la cible elle-même.
    const element = findGuideAnchorElement(anchorId)
    if (element && typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(remeasure)
      observer.observe(element)
      unbind.push(() => observer.disconnect())
    }

    // #2212.23 — le contenu qui change autour de la cible et la pousse.
    if (typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(remeasure)
      observer.observe(document.body, { childList: true, subtree: true })
      unbind.push(() => observer.disconnect())
    }

    return () => {
      for (const off of unbind) off()
    }
  }, [resolvedAnchor])

  return state
}
