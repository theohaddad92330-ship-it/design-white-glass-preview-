/**
 * #3465 — LA PLACE D'UNE BANDE QUI ARRIVE.
 *
 * Les bandes de la ligne de contexte du dossier (rattachement de groupe,
 * parcours, collaboration) lisent chacune leur donnée APRÈS le premier rendu.
 * Muettes pendant la lecture, elles apparaissaient ensuite et faisaient
 * retomber la rangée d'une ligne : la barre d'onglets sautait (~59 px) sous le
 * clic. Pendant la lecture on réserve donc leur place — même gabarit
 * approximatif d'une bande, invisible (`visibility: hidden` : ni focus ni clic), jamais annoncée.
 */
export function PendingBandSlot({ testId }: { testId: string }) {
  return (
    <div
      aria-hidden
      data-testid={testId}
      className="invisible min-h-11 min-w-0 rounded-xl border border-[var(--bellum-border)] px-4 py-3 lg:min-w-64"
    />
  )
}
