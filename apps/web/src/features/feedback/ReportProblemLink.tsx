import type { ReactNode } from 'react'
import { requestReport, type ReportRequest } from './reportLink'

/**
 * #1960.4 — le lien « Signaler ce problème » qu'écrit Laura, rendu en BOUTON.
 *
 * Un bouton et pas une ancre : il n'emmène nulle part, il ouvre le widget de
 * signalement pré-rempli (GA-35 — ce qui se clique se tabule). Il a l'allure
 * d'un lien parce qu'il vit au milieu d'une phrase de Laura.
 *
 * Il n'envoie RIEN : la personne relit la description, voit tout ce qui sera
 * joint, et c'est son propre clic d'envoi qui transmet.
 */
export function ReportProblemLink({ request, label }: { request: ReportRequest; label: ReactNode }) {
  return (
    <button
      type="button"
      className="text-[var(--bellum-text-accent)] underline underline-offset-2"
      onClick={() => requestReport(request)}
    >
      {label}
    </button>
  )
}
