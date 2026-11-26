import { ConsultantMatchPanel } from './ConsultantMatchPanel'
import { NeedsMatchRail } from './NeedsMatchRail'

/**
 * #4433.8 (recette 23/10) — UN SEUL panneau de matching à la fois. Le rail « Matching suggéré » (plusieurs besoins,
 * deux profils chacun) et le panneau d'un besoin choisi s'empilaient, chacun avec son bandeau de transparence : deux
 * panneaux pour une même question. Sans besoin choisi, le rail propose ; dès qu'un besoin est choisi (par le rail ou
 * le sélecteur), le panneau du besoin reste SEUL — le sélecteur du panneau permet d'en changer ou de revenir au rail.
 */
export function ConsultantMatchSection({
  selectedId,
  onSelect,
}: {
  selectedId: string | null
  onSelect: (projectId: string | null) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {selectedId ? null : <NeedsMatchRail onOpenInPanel={onSelect} />}
      <ConsultantMatchPanel selectedId={selectedId} onSelect={onSelect} />
    </div>
  )
}
