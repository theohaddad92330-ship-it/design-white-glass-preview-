/**
 * Variants framer-motion partagés par les widgets du dashboard. Ils sont
 * sortis du composant principal pour rester comparables visuellement
 * entre cartes (même easing, même durée). Modifier ici se propage à
 * toutes les cartes — ne pas surcharger localement sauf raison forte.
 */

export const pageVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
}

export const kpiStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}

export const kpiItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
}

export const contentStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.28 } },
}

export const contentItem = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
}
