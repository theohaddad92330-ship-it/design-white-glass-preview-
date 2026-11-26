import { Box, Button, Input, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * L'INVITE DE RÈGLEMENT — #2419.4, et le montant y est FACULTATIF.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE INVITE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le geste « Marquer réglée » écrivait `paid_at` d'un seul clic et laissait
 * `paid_amount_cents` à `null`. Les DEUX écrans qui savent enregistrer un
 * règlement — `/missions/encaissements` et `/missions/facturation` — le
 * faisaient de la même façon : aucun règlement enregistré depuis le produit ne
 * portait son montant, et aucun paiement PARTIEL n'était donc détectable.
 *
 * Réparer le statut sans ouvrir cette porte aurait laissé le correctif sans
 * effet sur les données réelles : `isSettled` traite « payé d'un montant non
 * mesuré » comme soldé, et c'est ce qu'aurait produit chaque clic.
 *
 * ⚠️ Elle vit dans SON fichier et les deux écrans l'importent : deux invites
 * recopiées divergeraient, et l'une des deux finirait par réécrire un montant
 * que l'autre venait de saisir (GA-26 — un réglage vit à un seul endroit).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE MONTANT RESTE FACULTATIF
 * ─────────────────────────────────────────────────────────────────────────────
 * Un champ vide consigne « payé, montant non mesuré » — jamais un montant
 * déduit du facturé. C'est la règle de toujours ici : on ne devine pas, et un
 * chiffre inventé serait pire qu'une absence nommée. Un montant inférieur au
 * facturé, lui, laisse la facture dans sa file de relance avec son reste dû.
 *
 * ⚠️ Rien ne part vers l'extérieur : cette invite enregistre un CONSTAT.
 */
export function PaymentDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: boolean
  onCancel: () => void
  /** `null` = aucun montant saisi. La propriété n'est alors PAS envoyée — elle
   *  n'est surtout pas envoyée à zéro. */
  onConfirm: (amountCents: number | null) => void
}) {
  const { t } = useTranslation('missions')
  const [amount, setAmount] = useState('')
  return (
    <Box className="rounded-md border border-border p-3">
      <Text size="sm" weight="medium" className="block">
        {t('collections.paymentTitle')}
      </Text>
      {/* ⚠️ Aucune borne de largeur ici : `Text` porte déjà les 70 caractères
          par ligne de D81, et la recopier serait une seconde définition de la
          même règle (GA-34). */}
      <Text element="p" size="xs" color="text-muted-foreground" className="mt-0.5">
        {t('collections.paymentHint')}
      </Text>
      <Input
        className="mt-2"
        inputMode="decimal"
        value={amount}
        onChange={event => setAmount(event.target.value)}
        placeholder={t('collections.paymentPlaceholder')}
        aria-label={t('collections.paymentAmount')}
      />
      <Box display="flex" className="mt-2 gap-2">
        <Button size="sm" disabled={pending} onClick={() => onConfirm(parseEuros(amount))}>
          {t('collections.paymentConfirm')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('collections.paymentAbort')}
        </Button>
      </Box>
    </Box>
  )
}

/**
 * Des euros saisis à la main vers des centimes — ou `null`.
 *
 * `null` n'est pas un échec silencieux : c'est le refus d'inventer. Une saisie
 * vide, illisible ou négative n'envoie AUCUN montant, et le serveur enregistre
 * alors un règlement dont le montant n'est pas mesuré. La virgule décimale
 * française est acceptée — la refuser ferait saisir « 5 » pour « 5,50 ».
 */
function parseEuros(input: string): number | null {
  const cleaned = input.replace(/\s/g, '').replace(',', '.')
  if (cleaned.length === 0) return null
  const euros = Number(cleaned)
  if (!Number.isFinite(euros) || euros < 0) return null
  return Math.round(euros * 100)
}
