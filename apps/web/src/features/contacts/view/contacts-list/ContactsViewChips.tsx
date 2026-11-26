import { cn, FilterChips } from '@bellum/ui'
import { CONTACT_VIEWS, type ContactView } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'

export type ContactViewFilterValue = ContactView | 'all'

type Props = {
  /**
   * Combien de contacts CHARGÉS tombent dans chaque vue. `undefined` ⇒ chips
   * sans chiffre : c'est le cas dès qu'il reste une page à charger, parce qu'un
   * compte partiel présenté comme un total est exactement le défaut que les
   * pastilles de cycle de vie ont déjà payé une fois (« Tous 25 » sous une carte
   * annonçant « 210 contacts sauvegardés »).
   */
  counts: Record<ContactView, number> | undefined
  value: ContactViewFilterValue
  onChange: (next: ContactViewFilterValue) => void
  /**
   * Nombre de contacts chargés, toutes vues confondues — le compteur de « Toutes ».
   * `undefined` suit exactement la même règle que `counts`.
   */
  loadedTotal: number | undefined
  className?: string
}

/**
 * Les cinq VUES de la liste de contacts (recette finale §37) : À contacter, À
 * enrichir, À vérifier, Déjà connus, Masqués.
 *
 * Ce ne sont pas cinq filtres de plus. Un filtre répond à « montre-moi X » ; une
 * vue répond à « qu'est-ce que je fais maintenant », et chacune a une action
 * évidente attachée. L'appartenance se DÉRIVE de l'état du contact
 * (`resolveContactView`, contrat partagé) et jamais d'une case à cocher : un
 * contact enrichi quitte « à enrichir » tout seul, sinon la liste devient un
 * inventaire tenu à la main — c'est-à-dire faux au bout d'une semaine.
 *
 * ⚠️ « Masqués » ne peut pas se remplir ici, et le chip le DIT au lieu
 * d'afficher « 0 ». `GET /contacts` filtre `contact.hidden = false` en SQL :
 * aucun contact masqué n'atteint jamais cette page. Un « 0 » se lirait « tu n'as
 * rien masqué », ce qui est une conclusion que la donnée n'autorise pas —
 * remplir cette vue demande d'ouvrir le filtre côté serveur.
 */
export function ContactsViewChips({ counts, value, onChange, loadedTotal, className }: Props) {
  const { t } = useTranslation('contacts')

  const chips: Array<{ key: ContactViewFilterValue; label: string; hint: string; count: number | undefined }> = [
    { key: 'all', label: t('views.all'), hint: t('views.allHint'), count: loadedTotal },
    ...CONTACT_VIEWS.map(view => ({
      key: view,
      label: t(`views.${view}`),
      hint: t(`views.${view}Hint`),
      // `hidden` n'a pas de compteur : la liste ne renvoie jamais ces lignes.
      count: view === 'hidden' ? undefined : counts?.[view],
    })),
  ]

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {/*
        La rangée passe par `FilterChips` — LE composant de filtres du produit
        (décision « F4 », 01/09/2026). Elle était l'une des trois familles
        concurrentes : `rounded-full` et un actif en `color-mix` à 16 %, là où
        le vivier faisait un bouton plein et Découvrir un carré à 6 px.

        L'`aria-label`, l'`aria-pressed`, le plancher tactile et la règle du
        compte non mesuré vivent désormais DANS le composant : ils ne peuvent
        plus être oubliés par le prochain écran.
      */}
      <FilterChips
        ariaLabel={t('views.filterAria')}
        // #1418 — le nom de la dimension, VISIBLE : deux rangées ouvraient sur
        // « Toutes » et « Tous » sans dire ce qu'elles filtraient.
        legend={t('views.legend')}
        options={chips.map(chip => ({
          value: chip.key,
          label: chip.label,
          hint: chip.hint,
          count: chip.count,
        }))}
        value={value}
        onChange={next => next && onChange(next)}
      />
      {/* #3483.2 — la raison de la vue « Masqués » n'est écrite qu'UNE fois, dans
          l'état vide de la liste (`ContactContent`) : la redire ici faisait
          précéder « Les contacts masqués… » d'un « non mesuré — » orphelin. */}
    </div>
  )
}
