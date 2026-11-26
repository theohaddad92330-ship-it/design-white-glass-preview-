'use client'

import { openGuidedTour } from '@/app/_components/guided-tour'

/**
 * #1678.3 — le bouton « Lancer la visite guidée » du runbook. La visite elle-
 * même est montée UNE FOIS dans `layout.tsx` (`GuidedTour`) ; ce bouton ne fait
 * que dispatcher le même événement DOM que celui du rail (`openGuidedTour`),
 * pour rouvrir la visite sans dupliquer son état.
 */
export function TourTrigger({ label }: { label: string }) {
  return (
    <button type="button" className="btn" onClick={openGuidedTour}>
      {label}
    </button>
  )
}
