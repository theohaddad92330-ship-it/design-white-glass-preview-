import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { MoreHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { assigneesOf, type MissionView } from '../api'

/**
 * LES GESTES DE LA LIGNE — #2194.33, #2194.34, #2194.35.
 *
 * ⚠️ DÉCISION LOUIS 21/09/2026 : la ligne du Gantt reste UN `<button>` (GA-35
 * interdit le bouton dans un bouton) ; ce menu est un SIBLING, jamais un
 * enfant du bouton principal — voir `TimelineRow` pour la restructuration qui
 * le permet. Même schéma que `RowMenu` (`CollectionsPage.tsx:604-651`) : un
 * bouton icône SEUL porte un nom (GA-32), un menu nommé.
 *
 * Trois gestes, et pas plus :
 *  - « Préparer le renouvellement » — lien vers le DOSSIER de la mission
 *    (`/missions/$id`), où `RenewalDecisionPanel` porte le geste. L'écran de
 *    décision pleine page `/missions/renouvellements` est supprimé (#3656).
 *  - « Lancer Reverse Market » — lien vers `/consultants/$id/reverse-market`,
 *    déjà posé ailleurs (`RenewalDecisionPanel.tsx:484`). N'apparaît QUE pour
 *    une personne IDENTIFIÉE (`id !== null`) : une affectation sans identité
 *    ne pointe vers personne, envoyer vers le premier homonyme serait pire
 *    que ne pas l'offrir (#1371).
 *  - « Créer un besoin interne » — lien vers `/projects/needs`, où le geste
 *    de création existe déjà (`OpenNeedsPage.tsx`, bouton « Nouveau besoin »).
 *    Aucun préremplissage compte/mission : la route ne le supporte pas
 *    (`needs.tsx`, `validateSearch` ne porte que `match`/`q`/`fromRfp`).
 */
export function RowMissionMenu({ mission }: { mission: MissionView }) {
  const { t } = useTranslation('missions')
  const identified = assigneesOf(mission).filter(
    (person): person is typeof person & { id: string } => person.id !== null,
  )
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={t('planning.rowMenu.label', { label: mission.label || t('planning.unnamedMission') })}
          className="pointer-coarse:min-h-11 pointer-coarse:min-w-11 shrink-0 self-center"
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('planning.rowMenu.title')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/missions/$id" params={{ id: mission.id }}>
            {t('planning.rowMenu.prepareRenewal')}
          </Link>
        </DropdownMenuItem>
        {identified.map(person => (
          <DropdownMenuItem key={person.id} asChild>
            <Link to="/consultants/$id/reverse-market" params={{ id: person.id }}>
              {t('planning.rowMenu.reverseMarket', { name: person.fullName })}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem asChild>
          <Link to="/projects/needs">{t('planning.rowMenu.createInternalNeed')}</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
