/**
 * #5045 — l'étape du tour en cours (libellé serveur `pendingStep`), V8 : la
 * même forme compacte que le statut du travail. Le libellé vient du flux
 * (`step`), jamais d'une minuterie ; l'arrêt reste le bouton du composeur (GA-26).
 */
export function TurnStepIndicator({ label }: { label: string }) {
  return (
    <span role="status" className="italic text-[var(--bellum-text-muted)]">
      {label}
    </span>
  )
}
