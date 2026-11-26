import { Button } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AskLaura } from '@/components/primitives/AskLaura'
import { LauraIntroScope } from '@/features/laura/bubble/laura-intro-scope'

/**
 * #2183.52/.53/.54/.55 — les quatre CTA après un import de CV/CSV terminé.
 *
 * Aucune destination inventée : les quatre pointent vers un écran qui existe
 * déjà —
 *  - « Traiter les N exceptions » (#2326.25, épopée #2794) filtre le Vivier
 *    sur `needs_review` (`talentSearchQuerySchema.reviewStatus`, #2183.52) —
 *    le LIBELLÉ nomme le compte réel plutôt qu'un « voir » générique : c'est
 *    le nombre déjà affiché dans le récapitulatif juste au-dessus qui donne
 *    le geste à faire, pas seulement l'écran où le faire ;
 *  - « Voir le Vivier » est la page qui contient ce dialogue ;
 *  - (#3962, décision Louis 10/10) « Lancer une analyse de disponibilité » est retiré :
 *    la vue « À réveiller » qu'il ouvrait n'existe plus ;
 *  - `onNavigate` (golden journey 3, #2208.34) : ces liens vivent DANS un dialogue posé
 *    par la page qu'ils ciblent — sans lui, le recruteur clique « Traiter les
 *    exceptions » et reste sous le dialogue ouvert, devant une liste qu'il ne voit pas.
 *  - « Demander à Laura » réutilise `AskLaura` (D44 : « deux moteurs de
 *    conversation dans le même produit, c'est deux fois la dette ») — jamais
 *    un second lien fabriqué à la main vers `/chat`.
 */
export function CvImportNextSteps({ reviewCount, onNavigate }: { reviewCount: number; onNavigate?: () => void }) {
  const { t } = useTranslation('consultants')

  // GA-283 — ces CTA sont rendus DANS les dialogues d'import (`CvCsvImportDialog`,
  // `CvZipImportDialog`) : le repère de portée est posé ici, là où `<AskLaura>` vit.
  return (
    <LauraIntroScope>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {/* Une absence ne fait aucune ligne (GA-18/19, #2613) : à zéro, ce CTA
         *  n'existe pas, il ne se contente pas de dire « rien à traiter ». */}
        {reviewCount > 0 ? (
          <Link to="/consultants" search={{ reviewStatus: 'needs_review' }} onClick={onNavigate}>
            <Button variant="outline" size="xs">
              {t('batchImport.next.processExceptions', { count: reviewCount })}
            </Button>
          </Link>
        ) : null}
        <Link to="/consultants" onClick={onNavigate}>
          <Button variant="outline" size="xs">
            {t('batchImport.next.seeVivier')}
          </Button>
        </Link>
        <AskLaura question={t('batchImport.next.askLauraPrompt')} label={t('batchImport.next.askLaura')} />
      </div>
    </LauraIntroScope>
  )
}
