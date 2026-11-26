import { FilterChips } from '@bellum/ui'
import {
  CONTACT_LIFECYCLE_STATES,
  contactLifecycleLabel,
  type ContactLifecycleState,
  type ContactLifecycleTally,
} from '@bellum/contracts'
import { useTranslation } from 'react-i18next'

export type LifecycleFilterValue = ContactLifecycleState | 'all'

type Props = {
  /** Compteurs sur TOUT le jeu filtré (agrégat serveur). `undefined` ⇒ on rend
   *  les pastilles SANS compteur. */
  tally: ContactLifecycleTally | undefined
  /** Total workspace filtré (`pagination.totalItems`), pas la page chargée. */
  total: number | undefined
  value: LifecycleFilterValue
  onChange: (next: LifecycleFilterValue) => void
  className?: string
}

/**
 * Chips de filtre par état du cycle de vie contact (Théo restitution p.16).
 *
 * Les compteurs viennent de l'agrégat SERVEUR (`GET /contacts` →
 * `lifecycleTally`), pas d'un tally sur les contacts chargés : une page de 25
 * affichait "Tous 25" à 3 cm d'une carte annonçant "210 contacts sauvegardés".
 * Le filtrage est lui aussi server-side (param `state`), pour que le clic sur
 * une pastille pagine sur le total qu'elle annonce.
 *
 * Tally absent (agrégat en échec, ou snapshot IndexedDB d'avant ce déploiement)
 * ⇒ pastilles sans chiffre. Mieux vaut ne rien afficher qu'un chiffre faux.
 */
export function ContactsLifecycleFilter({ tally, total, value, onChange, className }: Props) {
  const { t } = useTranslation('contacts')
  const chips: Array<{ key: LifecycleFilterValue; label: string; count: number | undefined }> = [
    { key: 'all', label: t('lifecycle.all'), count: total },
    // Sans tally on ne peut plus savoir quels états sont peuplés : on les montre
    // tous (le filtre reste utilisable) plutôt que d'en masquer arbitrairement.
    ...CONTACT_LIFECYCLE_STATES.filter(state => !tally || tally[state] > 0 || state === value).map(state => ({
      key: state,
      // ⚠️ Le libellé vient du CATALOGUE, plus du contrat : `contactLifecycleLabel`
      // rend une chaîne écrite en français une fois pour toutes, et toute la
      // rangée s'affichait donc en français en anglais. Le défaut de forme est
      // le même que celui des gabarits de séquence, corrigé le 05/09.
      label: t(`lifecycle.state.${state}`, { defaultValue: contactLifecycleLabel(state) }),
      count: tally?.[state],
    })),
  ]

  return (
    // Même composant que les VUES juste au-dessus (`ContactsViewChips`) : les
    // deux rangées se superposaient sur le même écran en se ressemblant
    // presque, ce qui est pire que de ne pas se ressembler du tout.
    <FilterChips
      className={className}
      ariaLabel={t('lifecycle.filterAria')}
      // #1418 — voir `ContactsViewChips` : sans ce nom, « Tous » et « Toutes »
      // se suivaient à 48 px sans qu'on sache lequel filtrait quoi.
      legend={t('lifecycle.legend')}
      options={chips.map(chip => ({ value: chip.key, label: chip.label, count: chip.count }))}
      value={value}
      onChange={next => next && onChange(next)}
    />
  )
}
