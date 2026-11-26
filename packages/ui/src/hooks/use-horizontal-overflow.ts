import * as React from 'react'

/**
 * Ce qu'un conteneur défilant CACHE encore, à gauche et à droite.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE MESURE EXISTE (30/08/2026, GA-119)
 * ─────────────────────────────────────────────────────────────────────────
 * Un `<div>` en `overflow-x: auto` défile — à la souris et au doigt. Au
 * clavier, il n'est atteignable par AUCUNE touche tant qu'il ne porte pas de
 * `tabIndex`. La dernière colonne d'un tableau large était donc à l'écran,
 * hors du cadre, et hors de portée.
 *
 * La réponse n'est pas « poser `tabIndex={0}` partout » : un arrêt clavier sur
 * chaque tableau du produit, y compris ceux où il n'y a rien à atteindre, est
 * un défaut d'accessibilité à son tour. D'où une MESURE — l'affordance
 * apparaît exactement quand il y a quelque chose à trouver.
 *
 * ⚠️ jsdom ne calcule aucune géométrie : `scrollWidth` et `clientWidth` y
 * valent 0, donc `overflowing` reste faux en test tant qu'on ne les
 * instrumente pas. C'est voulu — GA-119 les force explicitement plutôt que de
 * deviner, et une garde qui n'aurait lu que la source aurait été verte pendant
 * tout le temps où la colonne était inatteignable.
 */
export function useHorizontalOverflow<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null)
  const [edges, setEdges] = React.useState({ overflowing: false, start: false, end: false })

  React.useEffect(() => {
    const element = ref.current
    if (!element) return

    const measure = () => {
      const overflowing = element.scrollWidth - element.clientWidth > 1
      const start = overflowing && element.scrollLeft > 1
      const end = overflowing && element.scrollLeft + element.clientWidth < element.scrollWidth - 1
      // Le même objet quand rien n'a bougé : un `setState` par événement de
      // défilement re-rendrait tout le tableau à chaque pixel parcouru.
      setEdges(previous =>
        previous.overflowing === overflowing && previous.start === start && previous.end === end
          ? previous
          : { overflowing, start, end },
      )
    }

    measure()
    // Deux observations, et il en faut deux : la fenêtre qui rétrécit change la
    // taille du CONTENEUR, une page de résultats qui arrive change celle du
    // CONTENU sans toucher au conteneur. N'observer que le premier laissait un
    // tableau devenir débordant sans que rien ne le remarque.
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    if (element.firstElementChild) observer.observe(element.firstElementChild)
    element.addEventListener('scroll', measure, { passive: true })
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', measure)
    }
  }, [])

  return { ref, ...edges }
}

/**
 * Les attributs à poser sur le conteneur défilant, dérivés UNE fois.
 *
 * Deux tableaux partagés existent (`Table` de `@bellum/ui`, `ResponsiveTable`
 * de l'app web) et ils ne partagent pas de balisage. Sans cette dérivation
 * commune, ils porteraient deux versions de la même règle — et la garde qui
 * n'en verrait qu'une serait borgne sur l'autre.
 *
 * Le nom est OPTIONNEL, et son absence ne retire pas le focus : une région
 * SANS nom est ignorée des technologies d'assistance, la déclarer serait se
 * donner raison à vide. Le focus, lui, vaut pour tout le monde.
 */
export function scrollRegionProps(overflowing: boolean, label: string | undefined) {
  if (!overflowing) return {}
  return label ? { tabIndex: 0, role: 'region' as const, 'aria-label': label } : { tabIndex: 0 }
}

/**
 * L'ombre intérieure du bord qui cache encore quelque chose.
 *
 * Une ombre INTÉRIEURE est peinte sur la boîte visible du conteneur, pas sur
 * son contenu : elle reste au bord quelle que soit la position de défilement,
 * et à n'importe quelle hauteur de tableau. La barre de défilement, elle, est
 * rendue tout en bas — sur vingt-cinq lignes, il faut descendre jusqu'à la
 * dernière pour découvrir qu'on pouvait aller à droite.
 *
 * ⚠️ Les trois classes sont écrites EN TOUTES LETTRES et non composées d'un
 * fragment commun : le compilateur Tailwind lit le TEXTE des fichiers, il
 * n'exécute rien. Une classe assemblée dans un gabarit de chaîne n'existe pour
 * lui nulle part — elle serait purgée du CSS de production, et l'ombre
 * disparaîtrait sans qu'aucun test ne s'en aperçoive.
 */
const EDGE = {
  start: 'shadow-[inset_0.75rem_0_0.5rem_-0.5rem_var(--bellum-border-strong)]',
  end: 'shadow-[inset_-0.75rem_0_0.5rem_-0.5rem_var(--bellum-border-strong)]',
  both: 'shadow-[inset_0.75rem_0_0.5rem_-0.5rem_var(--bellum-border-strong),inset_-0.75rem_0_0.5rem_-0.5rem_var(--bellum-border-strong)]',
} as const

export function scrollEdgeClass(start: boolean, end: boolean): string | null {
  if (start && end) return EDGE.both
  if (start) return EDGE.start
  if (end) return EDGE.end
  return null
}

/**
 * La classe qui empêche un débordement horizontal RÉEL de chaîner vers le
 * geste de retour arrière natif du navigateur (#2588).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE CLASSE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * `overscroll-behavior-x` vaut `auto` par défaut sur `html`/`body` : quand un
 * conteneur `overflow-x-auto` atteint son bord, l'excédent du geste chaîne
 * vers son parent, puis vers la page, puis vers l'historique. Un tableau
 * large ou une arborescence à plancher de largeur (`min-w-[…]`) suffit donc à
 * renvoyer l'utilisateur en arrière — sans qu'il ait cliqué nulle part.
 *
 * `overscroll-x-contain`, pas `overscroll-x-none` : elle arrête la
 * PROPAGATION au-delà de CE conteneur sans désactiver l'élastique LOCAL —
 * `ContactEngagementLauncher.tsx` le posait déjà ainsi avant #2588, ce n'est
 * donc pas un choix nouveau, c'est le généraliser à tout conteneur qui
 * déborde RÉELLEMENT. La poser sur `html`/`body` réparerait le symptôme en
 * cassant le retour arrière PARTOUT, y compris là où rien ne déborde — d'où
 * une classe posée sur le conteneur qui défile, jamais sur la page.
 *
 * ⚠️ Écrite EN TOUTES LETTRES, comme `EDGE` ci-dessus : Tailwind lit le TEXTE
 * des fichiers, une classe assemblée à l'exécution (gabarit de chaîne,
 * concaténation) n'existe pour lui nulle part et serait purgée du CSS de
 * production.
 */
export const HORIZONTAL_OVERSCROLL_CLASS = 'overscroll-x-contain'
