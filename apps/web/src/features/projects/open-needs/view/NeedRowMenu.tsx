import { Box, Button } from '@bellum/ui'
import { MoreHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ActionableNeed } from '../model/need-actions'
import { NeedActionsMenu } from './NeedActionsMenu'

/**
 * Le kebab d'une ligne : les MÊMES gestes que la barre de sélection, sur un
 * seul besoin.
 *
 * Le geste à l'unité n'est pas un raccourci de confort — c'est le cas
 * MAJORITAIRE. Cocher une case pour changer l'urgence d'un besoin serait deux
 * gestes là où un suffit, et la barre finirait par ne servir qu'à ça.
 *
 * ⚠️ C'est la LIGNE qui est passée, pas seulement son identifiant : sans son
 * état ni ses compétences, le menu ne saurait pas qu'un besoin déjà perdu ne se
 * perd pas deux fois, ni qu'un besoin sans compétence typée ferait chercher le
 * moteur à vide. Il proposerait alors des gestes que le serveur refuse — et la
 * colonne « Matching », à trente pixels de là, dirait le contraire du menu.
 *
 * ⚠️ Le clic est arrêté ici : la ligne du tableau navigue au clic, et sans
 * `stopPropagation` ouvrir le menu quitterait l'écran.
 */
export function NeedRowMenu({ need, title }: { need: ActionableNeed; title: string }) {
  const { t } = useTranslation('projects')
  return (
    <Box onClick={event => event.stopPropagation()}>
      <NeedActionsMenu
        needs={[need]}
        trigger={
          <Button
            size="icon"
            variant="ghost"
            // Le doigt, pas la largeur de fenêtre : 32 px se rate une fois sur
            // trois au pouce (GA-30).
            className="h-8 w-8 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            aria-label={t('openNeeds.actions.rowMenu', { role: title })}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        }
      />
    </Box>
  )
}
