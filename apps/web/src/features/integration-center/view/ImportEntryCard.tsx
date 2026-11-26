import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@bellum/ui'
import { guideAnchorProps } from '@/features/guide/guide-anchors'

/**
 * #2091.11 — LA CARTE « TU AS DÉJÀ DES FICHIERS OU UN CRM ? ».
 *
 * L'assistant de reprise de base existait déjà (`/settings/import`, PDF 7
 * §7), mais rangé dans les Réglages : quelqu'un qui vient de brancher ses
 * outils depuis `/integrations` ne pense pas à aller le chercher là-bas. Une
 * carte DISTINCTE, au moment où la question se pose vraiment — et un LIEN
 * vers l'assistant existant, jamais un second import réécrit ici (loi 4 du
 * tome 7 : rien n'apparaît deux fois sous la même forme).
 *
 * R30a — alignée à gauche, texte à la largeur de lecture (D81 : `Text` borne à 70 caractères) : le bouton suit le
 * texte au lieu de partir à l'autre bout de la ligne en laissant le milieu vide.
 */
// CRM-SYNC-D.3 — ce lien est l'import de FICHIERS (`/settings/import`) et le dit ; la reprise d'un CRM se lit sur SA carte.
export function ImportEntryAction() {
  const { t } = useTranslation('integrationCenter')

  // Refonte Théo (`.bo11-head-actions` : « Importer », bouton principal de l'en-tête).
  // La question et sa réponse (#2091.11, CRM-SYNC-D.3) voyagent avec le bouton : en
  // titre (survol) et en nom accessible, jamais perdues avec l'ancienne carte.
  return (
    <Button asChild size="sm" className="min-h-11">
      <Link
        {...guideAnchorProps('integrations.importer')}
        to="/settings/mes-donnees"
        search={{ tab: 'imports' }}
        title={`${t('importEntry.title')} ${t('importEntry.subtitle')}`}
      >
        {t('grid.importFile')}
      </Link>
    </Button>
  )
}
