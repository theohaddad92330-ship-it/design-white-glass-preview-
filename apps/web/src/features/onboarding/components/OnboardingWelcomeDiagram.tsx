const STEP_COUNT = 3

/**
 * #2086.17 — « Design : respiration, composition éditoriale, diagramme léger. »
 *
 * MESURE 17/09 (lot FIN2) : le CONTENU du hero (titre, sous-titre, les trois
 * étapes de `BENEFITS`, rassurances, CTA — #2086.5-.16) était déjà servi par
 * `OnboardingWelcomePage.tsx`. Ce qui manquait était la mise en PAGE — ce
 * composant en est la seule pièce qu'un jugement visuel ne peut pas remplacer
 * mécaniquement : un diagramme LÉGER, purement décoratif, qui relie les trois
 * cartes de `BENEFITS` par un trait, dans l'ordre où elles se lisent déjà.
 *
 * Aucune information neuve : `aria-hidden` — un lecteur d'écran qui vient de
 * lire les trois titres de `BENEFITS` n'a rien à regagner à une seconde
 * lecture du même ordre sous une autre forme.
 *
 * GA-33 : jamais un hex dans le JSX. Uniquement `currentColor`, hérité des
 * classes `text-[var(--bellum-…)]` posées par l'APPELANT — la parité
 * clair/sombre vient donc gratuitement des mêmes tokens déjà utilisés partout
 * ailleurs sur cet écran (`OnboardingWelcomePage.tsx`), jamais d'un second
 * vocabulaire de couleur inventé ici.
 *
 * Aucun mouvement : ni une arrivée ni un changement d'état au sens de la
 * grammaire de `packages/ui/src/motion.ts` — un diagramme qui rebondirait à
 * chaque montage répondrait à zéro question, donc n'existerait pas (règle 2).
 * `preserveAspectRatio="none"` + un `viewBox` large : le trait s'étire avec
 * son conteneur, jamais un pixel figé (mobile à 768 px, GA-28).
 */
export function OnboardingWelcomeDiagram() {
  const nodes = Array.from({ length: STEP_COUNT }, (_, index) => 50 + index * 100)

  return (
    <svg aria-hidden="true" viewBox="0 0 300 24" preserveAspectRatio="none" className="h-6 w-full">
      <line
        x1={nodes[0]}
        y1="12"
        x2={nodes[STEP_COUNT - 1]}
        y2="12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="2 6"
        strokeLinecap="round"
        className="text-[var(--bellum-border)]"
      />
      {nodes.map(cx => (
        <circle
          key={cx}
          cx={cx}
          cy="12"
          r="5"
          stroke="currentColor"
          strokeWidth="2"
          className="fill-[var(--bellum-surface-1)] text-[var(--bellum-text-accent)]"
        />
      ))}
    </svg>
  )
}
