import { Box } from '@bellum/ui'
import { PAGE_GUTTER_MX } from '@/components/page/page-gutter'
import { useAccountRevenueColumn } from '@/features/propagation/hooks'
import { AccountBillingCard } from './AccountBillingCard'
import type { AccountRow } from './types'
import { useAccountBillingLens } from './useAccountBillingLens'
import { useAccountExpansion } from './useAccountExpansion'
import { useAccountInvoiceReadiness } from './useAccountInvoiceReadiness'

/**
 * LA LISTE DE CARTES DE L'ANGLE FACTURATION (maquette 11, 31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX FORMES, UN SEUL MODÈLE DE DONNÉES
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce sont les MÊMES `AccountRow` que le tableau commercial, la même pagination,
 * les mêmes filtres et la même lentille : seule la mise en page change. Un
 * second écran aurait dupliqué la recherche et les filtres, et les deux
 * auraient divergé au premier ajout — c'est ce que la lentille existe pour
 * éviter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX LECTURES SONT FAITES ICI, PAS DANS CHAQUE CARTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `useAccountBillingLens` et `useAccountExpansion` rendent l'espace entier en
 * une requête chacun. Les appeler dans la carte marcherait — le cache de
 * requête les partagerait — mais ferait vingt-cinq abonnements pour deux
 * objets, et surtout mettrait la décision « que faire d'un échec » dans
 * vingt-cinq endroits. Elles descendent donc en `prop`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ UN SEUL DÉFILEMENT VERTICAL — LE MÊME DÉFAUT QUE LE TABLEAU, PAYÉ DEUX FOIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Cette enveloppe portait `max-h-[calc(100dvh-8rem)] overflow-y-auto`, « exactement
 * comme l'enveloppe du tableau » — et c'était vrai : c'est exactement ce que
 * #1316.1 a mesuré et RETIRÉ du tableau le 02/09 (339 px visibles pour 2 156 de
 * contenu, parce qu'un conteneur défilant vit dans un parent qui défile déjà, et
 * que le plus petit gagne toujours). La correction n'a suivi que le tableau ;
 * cette liste-ci, rendue par l'AUTRE angle du MÊME écran, a gardé le défaut —
 * et la garde `one-vertical-scroller-per-screen` ne lisait qu'`AccountsTable.tsx`.
 * Elle lit maintenant tout le dossier.
 *
 * Le débordement remonte donc à la page, comme pour le tableau.
 */
export function AccountsBillingCardList({ rows }: { rows: AccountRow[] }) {
  const billing = useAccountBillingLens()
  const expansion = useAccountExpansion()
  // #1413.2 — les deux lectures d'argent DESCENDENT du tableau commercial vers
  // cette liste. Montées ici et non dans la carte, pour la raison écrite plus
  // haut : une requête par source, et la décision « que faire d'un échec » à un
  // seul endroit.
  const readiness = useAccountInvoiceReadiness()
  const revenue = useAccountRevenueColumn()
  return (
    <Box className={`flex flex-col gap-2 ${PAGE_GUTTER_MX}`}>
      {rows.map(row => (
        <AccountBillingCard
          key={row.id}
          row={row}
          billing={billing}
          expansion={expansion}
          readiness={readiness}
          revenue={revenue}
        />
      ))}
    </Box>
  )
}
