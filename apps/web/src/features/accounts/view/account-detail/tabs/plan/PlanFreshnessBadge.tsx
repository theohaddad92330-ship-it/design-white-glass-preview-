import { Badge, Box } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { PlanFreshness } from '@bellum/contracts'
import { ComputedAt } from '@/components/primitives/ComputedAt'

/**
 * L'âge du plan, dit en permanence (tome 5 §37).
 *
 * « Un document figé vaut au jour de sa production, il ment trois mois plus
 * tard » — c'est la première faiblesse relevée du document humain qui sert de
 * modèle au tome, et un badge est la réponse la moins coûteuse.
 *
 * Rien n'est masqué à cause de l'âge : un plan périmé s'affiche AVEC son badge
 * (D78). Le cacher ferait croire qu'il n'y a pas de plan.
 */
export function PlanFreshnessBadge({
  freshness,
  generatedAt,
}: {
  freshness: PlanFreshness
  generatedAt: string | null
}) {
  const { t } = useTranslation('accountDetail')
  // #3420.2 (recette démo 05/10) — un plan FRAIS n'a pas de badge d'alerte, mais son âge se DIT :
  // « seul le hero donnait un âge » sur BPCE. Sans date de génération, rien (jamais « aujourd'hui »).
  if (freshness === 'frais') {
    return generatedAt ? (
      <Box display="flex" className="items-center gap-2">
        <ComputedAt at={generatedAt} persisted />
      </Box>
    ) : null
  }
  return (
    <Box display="flex" className="items-center gap-2">
      <Badge variant={freshness === 'perime' ? 'destructive' : 'outline'}>{t(`planFreshness.${freshness}`)}</Badge>
      {/* L'horodatage de calcul passe par la primitive partagée (tome 7, loi 2,
          élément n°10). Ce badge écrivait sa propre phrase — l'une des trois
          formulations du produit pour la même idée, avec trois formateurs de
          date différents.

          ⚠️ Rien sous `inconnu` : `planFreshness` rend précisément cette
          étiquette quand la date de génération est absente ou illisible, et
          l'étiquette DIT déjà l'inconnu. Ajouter « date de calcul inconnue » à
          côté écrirait deux fois la même chose sous deux formes — la loi 4 du
          tome 7. */}
      {freshness !== 'inconnu' && <ComputedAt at={generatedAt} persisted />}
    </Box>
  )
}
