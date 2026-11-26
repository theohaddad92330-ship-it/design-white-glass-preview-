import { DropdownMenuItem } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useOpenLauraInPlace } from '@/features/laura/bubble/use-open-laura-in-place'
import { useAskLauraChatSearch } from './AskLaura'

/**
 * #2408.81 — « Demander à Laura » comme ITEM de menu de ligne : le même geste que `AskLaura` (#4345 — la bulle
 * s'ouvre SUR PLACE, question pré-remplie et jamais envoyée ; mobile et surcouche gardent le lien vers `/chat`),
 * rendu comme un item de menu. Il ne DÉPOSE aucune amorce dans la bulle (`useAskLauraIntro`) : le menu n'est monté
 * qu'ouvert, et une question de ligne ne doit pas devenir la suggestion de l'écran entier.
 */
export function AskLauraMenuItem({ question, label }: { question: string; label: string }) {
  const openInPlace = useOpenLauraInPlace()
  const search = useAskLauraChatSearch({ question })
  if (openInPlace) {
    return <DropdownMenuItem onSelect={() => openInPlace(question)}>{label}</DropdownMenuItem>
  }
  return (
    <DropdownMenuItem asChild>
      <Link to="/chat" search={search}>
        {label}
      </Link>
    </DropdownMenuItem>
  )
}
