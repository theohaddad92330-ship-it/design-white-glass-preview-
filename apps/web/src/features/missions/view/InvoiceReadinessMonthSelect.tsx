import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatMonth } from '@/lib/locale'

/**
 * Les douze derniers mois (le courant compris), en `YYYY-MM`, PLUS RÉCENT
 * D'ABORD — l'ordre dans lequel on les choisit dans un menu déroulant.
 *
 * Fonction PURE, testée seule : c'est elle qui porte tout le risque de ce
 * petit composant (un décalage de fuseau ou un `getMonth()` mal borné donnerait
 * un mois qui n'existe pas dans la liste).
 */
export function lastTwelveMonths(from: Date = new Date()): string[] {
  const months: string[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - i, 1))
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

/**
 * LE SÉLECTEUR DE MOIS — un cas d'école du défaut n°1 de ce dépôt.
 *
 * `useInvoiceReadiness(month?)` acceptait déjà un mois, et `InvoiceReadinessPanel`
 * l'appelait SANS argument : le paramètre était déclaré, jamais passé. Ce
 * composant ne fait qu'une chose — rendre le mois VISIBLE et CHOISISSABLE —
 * et c'est le PANNEAU qui, en recevant `onChange`, se charge de le transmettre
 * au hook. Un test dédié (`InvoiceReadinessPanel.test.tsx`) vérifie que ce fil
 * va jusqu'au bout : sans lui, le défaut reviendrait sous une autre forme.
 *
 * `value: undefined` — pas de sélection encore faite — garde le défaut SERVEUR
 * (le mois précédent, D781) : l'écran ne force JAMAIS un mois au premier
 * rendu, il ne fait que permettre d'en choisir un autre ensuite.
 */
export function InvoiceReadinessMonthSelect({
  value,
  onChange,
}: {
  value: string | undefined
  onChange: (month: string) => void
}) {
  const { t } = useTranslation('missions')
  const options = lastTwelveMonths()
  // Le mois par défaut du serveur peut ne pas figurer dans les douze derniers
  // mois calculés ICI (fuseau, horloge de test…) : on l'ajoute alors en tête
  // plutôt que de rendre un `<Select>` sans valeur affichable.
  const allOptions = value && !options.includes(value) ? [value, ...options] : options

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={t('readiness.month.label')} className="h-10 w-40">
        <SelectValue placeholder={t('readiness.month.label')} />
      </SelectTrigger>
      <SelectContent>
        {allOptions.map(month => (
          <SelectItem key={month} value={month}>
            {formatMonth(month) ?? month}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
