import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect } from 'vitest'
import userEvent from '@testing-library/user-event'

/**
 * Le pilote de souris des menus, avec la vérification `pointer-events`
 * DÉSACTIVÉE.
 *
 * ⚠️ Ce n'est pas une facilité. Quand un menu vit dans un tiroir ou une
 * fenêtre (Radix Dialog / Sheet), Radix pose `pointer-events: none` sur le
 * `<body>` pour verrouiller l'arrière-plan, et rend SA propre liste dans un
 * portail à la racine — donc sur ce body verrouillé. `userEvent` applique
 * alors sa règle « on ne clique pas ce qui n'accepte pas le pointeur » et
 * refuse le clic ; le menu ne s'ouvre jamais et le test dit « aucune option
 * trouvée », ce qui ressemble à une liste vide.
 *
 * Dans un vrai navigateur, le portail de Radix rétablit `pointer-events:
 * auto` sur son contenu et le clic passe. La vérification protège donc ici
 * d'un défaut qui n'existe pas, au prix de rendre intestable la moitié des
 * menus du produit — ceux des tiroirs de filtres, précisément.
 */
function pointerFor(): ReturnType<typeof userEvent.setup> {
  // ⚠️ Une instance PAR APPEL, jamais une instance de module : `setup()`
  // s'accroche au document courant, et `cleanup()` entre deux tests le
  // remplace. Une instance partagée vise alors un document détaché, clique
  // dans le vide, et le test conclut « aucune option » sur un menu qui n'a
  // simplement jamais reçu le clic.
  return userEvent.setup({ pointerEventsCheck: 0 })
}

/**
 * Choisir une valeur dans un menu déroulant du produit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE HELPER EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Les menus du produit étaient des `<select>` natifs, et les tests les
 * pilotaient avec `userEvent.selectOptions(element, value)` — l'API dédiée au
 * natif. Le 01/09/2026, les 47 menus sont passés à `SelectField` (Radix), qui
 * n'est pas un `<select>` : c'est un `combobox` ARIA qu'on OUVRE, puis dans
 * lequel on CLIQUE une option. `selectOptions` y échoue avec « impossible de
 * trouver l'option », ce qui ressemble à une donnée manquante alors que c'est
 * juste le mauvais geste.
 *
 * Ce helper dit le geste une fois pour toutes. Il fait aussi une chose que
 * `selectOptions` ne faisait pas : il désigne l'option par son LIBELLÉ, celui
 * que l'utilisateur lit, plutôt que par la valeur technique qu'il ne voit
 * jamais. Un test qui casse parce que le libellé a changé dit quelque chose ;
 * un test qui passe alors que le libellé est faux ne dit rien.
 *
 * ⚠️ La liste s'ouvre dans un PORTAIL, donc à la racine du document et non
 * sous le déclencheur : on cherche l'option dans `document.body`, jamais
 * dans le conteneur rendu.
 *
 * ⚠️⚠️ `hidden: true` sur toutes les requêtes d'option. Quand le menu vit
 * dans un tiroir ou une fenêtre, Radix marque `aria-hidden` sur tous les
 * frères du dialogue pour l'isoler — et le portail du menu, inséré ensuite à
 * la racine, se fait marquer avec eux. Dans un navigateur, Radix le rétablit ;
 * dans jsdom, la marque reste et `getByRole` ignore le sous-arbre. Sans ce
 * drapeau, tous les menus DE TIROIR sont introuvables, avec un message —
 * « aucune option » — qui accuse la donnée.
 */
export async function chooseOption(trigger: HTMLElement, option: string | RegExp): Promise<void> {
  const options = await openList(trigger)

  // On accepte la VALEUR autant que le LIBELLÉ. Les vingt-cinq tests qui
  // pilotaient les anciens `<select>` désignaient une valeur (`selectOptions`
  // ne sait faire que ça) : leur imposer le libellé traduit aurait transformé
  // une migration mécanique en réécriture, avec le risque d'y perdre ce que
  // chacun vérifiait.
  const cible =
    typeof option === 'string'
      ? (options.find(o => o.getAttribute('data-value') === option) ??
        options.find(o => (o.textContent ?? '').trim() === option))
      : options.find(o => option.test((o.textContent ?? '').trim()))

  if (!cible) {
    const dispo = options.map(o => `${o.getAttribute('data-value')} (${(o.textContent ?? '').trim()})`).join(', ')
    throw new Error(`Option introuvable : ${String(option)}. Proposées : ${dispo || '(aucune)'}`)
  }
  await pointerFor().click(cible)
}

/**
 * Ouvre la liste et rend ses options.
 *
 * ⚠️ L'ouverture se fait au CLAVIER et non à la souris. Quand le menu vit dans
 * un tiroir ou une fenêtre, Radix pose `pointer-events: none` sur le `<body>`
 * et marque `aria-hidden` sur tout ce qui n'est pas le dialogue — y compris
 * le portail du menu, inséré ensuite. Le clic ne passe pas, la requête ne
 * trouve rien, et le test conclut « aucune option » sur une liste qui n'a
 * jamais été ouverte. Le clavier traverse tout ça, et c'est de toute façon le
 * geste qu'un test d'accessibilité devrait privilégier.
 */
async function openList(trigger: HTMLElement): Promise<HTMLElement[]> {
  const lues = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')]
  if (lues().length > 0) return lues()

  const pointer = pointerFor()
  // Trois gestes, dans cet ordre. Aucun ne marche partout : le clavier
  // traverse le verrou de pointeur d'un tiroir mais suppose le déclencheur
  // focalisable ; le clic marche hors tiroir. Essayer les trois plutôt que de
  // parier sur un seul évite d'écrire un helper qui marche sur douze écrans
  // et échoue sur les six autres pour une raison qu'on met une heure à voir.
  trigger.focus()
  await pointer.keyboard('{Enter}')
  if (lues().length === 0) await pointer.keyboard('{ArrowDown}')
  if (lues().length === 0) await pointer.click(trigger)
  // Le dernier recours : l'événement que Radix écoute VRAIMENT. Dans un
  // tiroir, le piège à focus avale la touche et le verrou de pointeur avale
  // le clic ; `pointerDown` posé à la main passe les deux.
  if (lues().length === 0) fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })

  await waitFor(() => expect(lues().length).toBeGreaterThan(0))
  return lues()
}

/**
 * La valeur CHOISIE dans un menu — l'équivalent de `toHaveValue()` d'avant.
 *
 * ⚠️ Radix marque l'option courante par `data-state="checked"`, pas seulement
 * par `aria-selected` : c'est le premier attribut qu'on lit. Et il faut
 * REFERMER la liste après coup, sinon les requêtes suivantes du test tombent
 * sur un écran que Radix a masqué aux lecteurs.
 */
export async function selectedValue(trigger: HTMLElement): Promise<string> {
  const options = await openList(trigger)
  const chosen =
    options.find(o => o.getAttribute('data-state') === 'checked') ??
    options.find(o => o.getAttribute('aria-selected') === 'true')
  await pointerFor().keyboard('{Escape}')
  return chosen?.getAttribute('data-value') ?? ''
}

/** Les valeurs PROPOSÉES — l'équivalent de `[...select.options]` d'avant. */
export async function optionValues(trigger: HTMLElement): Promise<string[]> {
  const options = await openList(trigger)
  const values = options.map(o => o.getAttribute('data-value') ?? '')
  await pointerFor().keyboard('{Escape}')
  return values
}

/** Les LIBELLÉS proposés — ce que l'utilisateur lit dans la liste ouverte. */
export async function optionLabels(trigger: HTMLElement): Promise<string[]> {
  const options = await openList(trigger)
  const labels = options.map(o => (o.textContent ?? '').trim())
  await pointerFor().keyboard('{Escape}')
  return labels
}

/** Le menu portant ce nom accessible — l'équivalent de `getByLabelText` d'avant. */
export function getSelect(name: string | RegExp): HTMLElement {
  return screen.getByRole('combobox', { name })
}

/** Ce que le menu AFFICHE actuellement, en toutes lettres. */
export function selectedLabel(trigger: HTMLElement): string {
  return within(trigger).getByText(/.+/).textContent ?? ''
}
