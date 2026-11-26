import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatCents } from '@/lib/money'
import { PropagatedBlock } from '@/features/propagation/PropagatedBlock'
import type { AccountRevenueColumn } from '@/features/propagation/hooks'

/**
 * LE MONTANT FACTURÉ D'UN COMPTE, DANS LA LISTE DU PORTEFEUILLE (§4.2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ QUATRE ABSENCES, ET AUCUNE NE S'ÉCRIT « 0 € »
 * ─────────────────────────────────────────────────────────────────────────────
 * La question à se poser sur chaque valeur manquante est écrite dans le CLAUDE.md
 * du dépôt : *si cette valeur est absente, « 0 » est-il VRAI ?* Ici il ne l'est
 * jamais, et pour quatre raisons DIFFÉRENTES, qui envoient chercher la panne à
 * quatre endroits opposés :
 *
 *  1. **La lecture a échoué** — on ne sait rien. « 0 € » dirait « ce client n'a
 *     jamais rien payé », ce qui est une information fausse énoncée avec aplomb.
 *  2. **Aucune ligne pour ce compte** — aucun mois n'a été facturé. C'est vrai,
 *     et ce n'est pas un montant : c'est l'absence de facture.
 *  3. **Aucune ligne, et l'appelant n'a que `finance:read:own`** — l'absence
 *     devient AMBIGUË : soit rien n'est facturé, soit le compte est hors de son
 *     portefeuille. L'écran ne tranche pas à sa place, il le dit.
 *  4. **Une ligne, mais `invoicedCents: null`** — des mois sont facturés et
 *     aucun ne porte de montant. Le serveur rend `null` exprès (`SUM` sans
 *     `COALESCE`) ; l'écrire « 0 € » annulerait ce soin d'un seul `?? 0`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ LE TIRET PARLE AUSSI AUX LECTEURS D'ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────────
 * Un « – » muet dit « pas de montant » à l'œil et RIEN à qui n'a pas l'œil
 * dessus. Il porte donc le nom accessible complet, exactement comme le tiret de
 * la colonne Score juste à côté, qui a déjà réglé cette question ici.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ §4.4 — LE CHIFFRE EST UN LIEN, IL N'EST PAS UN CHAMP
 * ─────────────────────────────────────────────────────────────────────────────
 * Il se lit ici et se CALCULE dans les missions. `PropagatedBlock` porte le lien
 * du contrat et n'offre aucun chemin d'écriture — la seconde vérité qu'un CA
 * corrigible depuis deux écrans fabriquerait n'a pas d'endroit où naître.
 */
export function AccountRevenueCell({ accountId, column }: { accountId: string; column: AccountRevenueColumn }) {
  const { t } = useTranslation('accounts')
  const revenue = column.byAccount.get(accountId)

  if (column.failed) return <UnknownCell reason={t('propagation.cellFailed')} />
  if (!revenue) {
    // ⚠️ `canReadFinance: false` ne veut pas dire « pas de droit » : il veut dire
    // « portée restreinte ». L'absence n'a donc pas la même cause, et pas la
    // même phrase.
    return (
      <UnknownCell
        reason={column.canReadFinance ? t('propagation.cellNoInvoice') : t('propagation.cellNoInvoiceOwnScope')}
      />
    )
  }
  if (revenue.invoicedCents === null) return <UnknownCell reason={t('propagation.cellAmountUnknown')} />

  return (
    <PropagatedBlock source={revenue.source} className="inline-block">
      <Text element="span" size="sm" className="tabular-nums text-[var(--bellum-text-primary)]">
        {formatCents(revenue.invoicedCents)}
      </Text>
    </PropagatedBlock>
  )
}

/** Le tiret qui DIT pourquoi il est un tiret. */
function UnknownCell({ reason }: { reason: string }) {
  return (
    <Text element="span" size="sm" className="text-[var(--bellum-text-muted)]" title={reason} aria-label={reason}>
      –
    </Text>
  )
}
