import { type OrgHierarchyRelation } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { Loader2, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useVerifyOrgRelation } from '@/features/accounts/hooks/useEnrichAccount'

/**
 * « Vérifier une relation » (annexe p22) — la preuve d'UN lien, à la demande.
 * Le serveur cherche ; s'il ne trouve pas, il le dit et le lien reste inféré.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE BOUTON A SON PROPRE FICHIER DEPUIS LE 29/08
 * ─────────────────────────────────────────────────────────────────────────
 * Il vivait à l'intérieur des « 4 vues », c'est-à-dire dans une section
 * SECONDAIRE de l'onglet, et il ne s'affichait que sur une ligne de
 * `hierarchyEdges` inférée. Deux conséquences :
 *
 *   1. le geste était à deux écrans du seul endroit où on regarde vraiment un
 *      rattachement — la carte d'une personne ;
 *   2. il DISPARAÎT là où le correctif P0 s'applique. Quand un `reportsTo` sans
 *      preuve relationnelle cesse de produire une `hierarchyEdge`, la ligne
 *      inférée n'existe plus, et avec elle le bouton qui aurait justement
 *      permis de promouvoir la supposition en lien prouvé.
 *
 * Le sortir ici le rend disponible partout où un lien PROBABLE est affiché,
 * sans dupliquer l'annonce de coût — qui doit rester écrite à un seul endroit.
 *
 * ⚠️ **Le prix est ÉCRIT, pas survolé.** Jusqu'au 28/08 il vivait dans un
 * `title=` — une infobulle native, qui n'apparaît jamais au doigt et demande un
 * survol à la souris. Et il annonçait « Aucun crédit » pendant que le serveur
 * en débitait un à deux. Le coût s'annonce AVANT le clic, et se LIT.
 *
 * La fourchette vient de `creditCostRange` — le contrat, jamais un nombre
 * recopié : le jour où le poids bouge, cette phrase bouge avec lui.
 */
export function OrgVerifyRelation({
  accountId,
  fromId,
  toId,
  type = 'reports_to',
}: {
  accountId: string
  fromId: string
  toId: string
  type?: OrgHierarchyRelation
}) {
  const { t } = useTranslation('accountOrg')
  const verify = useVerifyOrgRelation(accountId)
  return (
    <div className="mt-2">
      <Button
        size="xs"
        variant="outline"
        className="gap-1.5"
        disabled={verify.isPending}
        title={t('orgGraph.verifyRelationHint')}
        onClick={() => verify.mutate({ fromId, toId, type })}
      >
        {verify.isPending ? <Loader2 className="size-3 animate-spin" /> : <ShieldCheck className="size-3" />}
        {verify.isPending ? t('orgGraph.verifyRelationPending') : t('orgGraph.verifyRelation')}
      </Button>
    </div>
  )
}
