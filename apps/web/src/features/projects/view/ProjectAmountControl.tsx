import { Button, Text } from '@bellum/ui'
import type { ProjectRow } from '@bellum/contracts'
import { Coins } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUpdateProjectAmount } from '../hooks/useUpdateProjectAmount'

/** Montant EUR formaté sans décimales, dans la locale de l'interface. */
function formatEur(amount: number, language: string): string {
  return new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Saisie du montant d'affaire estimé d'un besoin MATÉRIALISÉ (cockpit manager §10).
 * Un montant optionnel, en euros, qui alimente le pipeline valorisé partagé. Rien
 * n'est prérempli : un besoin sans montant affiche « — » et propose de le saisir,
 * jamais un 0 par défaut. Vide → efface le montant (retour à « non renseigné »).
 *
 * #2171.40 — ⚠️ CE MONTANT N'EST DÉLIBÉRÉMENT PAS DERRIÈRE `useFinanceAccess` /
 * `canReadFinance`, et ce n'est pas un oubli : `estimated_amount` est le MONTANT
 * DU PIPE DES PROJETS (`c53_montant_du_pipe`, `packages/contracts/src/schemas/
 * doctrine-registry.ts`), INCHANGÉ par le revirement du 31/08/2026 qui n'a mis
 * sous droit financier que le PIPE DES BESOINS (`OpenNeedsPage`/`NeedsKanban`).
 * `finance:read` garde la MARGE et le coût CHARGÉ, jamais le montant VENDU —
 * côté serveur, `ProjectsController.list()`/`pipelineSummary()` ne portent
 * aucune permission financière, pour la même raison : `sales` ne porte que
 * `finance:read:own`, et gater ce montant fermerait `/projects` au commercial
 * dont c'est le pipe. Voir `apps/web/src/architecture/
 * project-amount-stays-public.test.ts` (GA-390), qui sait dire NON si ce gate
 * est ajouté sans relire cette doctrine.
 */
export function ProjectAmountControl({ opportunity }: { opportunity: ProjectRow }) {
  const { t, i18n } = useTranslation('projects')
  const update = useUpdateProjectAmount()
  // #4191 R22 — UNE source avec la liste (qui affiche `amount_cents`) : le montant estimé saisi, à défaut le
  // montant en centimes de l'affaire. Absent des deux = « Ajouter un montant », jamais 0.
  const current =
    typeof opportunity.estimated_amount === 'number'
      ? opportunity.estimated_amount
      : typeof opportunity.amount_cents === 'number'
        ? opportunity.amount_cents / 100
        : null

  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(current !== null ? String(current) : '')

  const open = () => {
    setValue(current !== null ? String(current) : '')
    setEditing(true)
  }

  const submit = () => {
    const trimmed = value.trim().replace(/\s/g, '').replace(',', '.')
    const parsed = trimmed === '' ? null : Number(trimmed)
    // Saisie invalide (non numérique ou négative) : on ne persiste rien, jamais un
    // montant fabriqué. Le champ reste ouvert pour correction.
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return
    update.mutate({ id: opportunity.id, amount: parsed }, { onSuccess: () => setEditing(false) })
  }

  if (!editing) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-5">
        <Coins className="size-3.5 text-[var(--bellum-text-muted)]" />
        {current !== null ? (
          <button
            type="button"
            onClick={open}
            className="inline-flex items-center gap-1 rounded-md px-1 text-sm font-medium text-[var(--bellum-text-primary)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
            aria-label={t('amount.edit')}
          >
            {formatEur(current, i18n.language)}
          </button>
        ) : (
          <button
            type="button"
            onClick={open}
            className="rounded-md px-1 text-sm text-[var(--bellum-text-muted)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
          >
            {t('amount.add')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 pl-5">
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('amount.label')}
      </Text>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        autoFocus
        disabled={update.isPending}
        aria-label={t('amount.inputLabel')}
        placeholder={t('amount.placeholder')}
        onChange={event => setValue(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') submit()
          if (event.key === 'Escape') setEditing(false)
        }}
        className="w-28 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 py-1 text-sm text-[var(--bellum-text-primary)] disabled:opacity-60"
      />
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        €
      </Text>
      <Button type="button" size="sm" onClick={submit} disabled={update.isPending}>
        {t('amount.save')}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={update.isPending}>
        {t('amount.cancel')}
      </Button>
    </div>
  )
}
