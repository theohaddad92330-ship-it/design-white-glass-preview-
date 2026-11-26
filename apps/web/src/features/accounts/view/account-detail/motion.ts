const easeOut = [0.23, 1, 0.32, 1] as const

/**
 * Les déplacements s'expriment en valeurs NUMÉRIQUES (`x` / `y`), jamais en
 * `transform: 'translate3d(...)'`. Une chaîne reste écrite dans le DOM même au
 * repos : l'élément devient un bloc conteneur et tout `position: fixed` descendant
 * (modal, panneau flottant) se cale sur lui au lieu de la fenêtre — c'est ainsi
 * que la fiche de positionnement s'ouvrait hors écran, ne laissant voir que son
 * fond flou. Avec des nombres, framer remet `transform: none` au repos.
 */
export const stagger = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.05, ease: easeOut },
  },
}

export const cardFade = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.24, ease: easeOut },
  },
}

/** Transition d'un onglet à l'autre du détail de compte. */
export const tabSlide = (shouldReduceMotion: boolean) =>
  shouldReduceMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        hidden: { opacity: 0, x: 8 },
        visible: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -8 },
      }
