import { render } from '@testing-library/react'
import { Badge } from '@bellum/ui'

/**
 * Une pilule ne passe JAMAIS à la ligne.
 *
 * `Badge` est dessiné en `rounded-full` : son rayon vaut la moitié de sa
 * hauteur. Tant qu'il tient sur une ligne, ça donne une pilule ; dès que le
 * texte se répartit sur deux lignes, le même rayon produit un ovale bombé qui
 * déborde de son alignement — c'est le « la bulle se déforme » du rapport de
 * bêta, mesuré à 69×41 px pour un libellé de 13 caractères.
 *
 * Le retour à la ligne ne dépend pas du libellé mais de la LARGEUR DISPONIBLE :
 * dans une cellule de tableau, le badge partage sa ligne avec un intitulé de
 * poste qui, lui, est déjà protégé (`noWrap`). Le badge se faisait donc écraser
 * en dernier. Corriger le seul libellé fautif n'aurait rien réglé — la
 * prochaine colonne étroite aurait reproduit la forme.
 *
 * jsdom ne fait pas de mise en page : il ne peut pas mesurer une déformation.
 * Le test verrouille donc la propriété CSS qui l'empêche, au niveau du
 * composant partagé où elle vaut pour toutes les pilules du produit.
 */
describe('les pilules restent sur une ligne', () => {
  it('le badge de base interdit le retour à la ligne', () => {
    const { container } = render(<Badge>Nom à révéler</Badge>)
    expect(container.firstElementChild?.className).toContain('whitespace-nowrap')
  })

  it('la règle survit à une variante et à des classes ajoutées', () => {
    // Les appelants passent presque toujours du `className` : la garantie ne
    // doit pas dépendre de leur discipline.
    const { container } = render(
      <Badge variant="outline" className="px-1 py-0 text-xs">
        Rôle à identifier
      </Badge>,
    )
    expect(container.firstElementChild?.className).toContain('whitespace-nowrap')
  })
})

/**
 * Une pilule ne s'ÉTIRE jamais — #1608, #1631.7.
 *
 * `inline-flex` ne protège rien quand le parent est lui-même un conteneur
 * flex : la spécification BLOCKIFIE tout enfant de flex (`inline-flex`
 * devient `flex`), et l'étirement par défaut du deuxième axe
 * (`align-items: normal`) lui donne alors TOUTE la largeur du parent. Une
 * pilule `rounded-full` large de 1 174 px avec son texte collé à gauche ne se
 * lit plus comme une pilule : elle se lit comme un champ de saisie vide.
 *
 * Mesuré en production le 08/09/2026, sur les deux cartes livrées la veille —
 * « Écosystème de services dense » (onglet Accès, 1 174 px pour 194 px de
 * texte) et l'empreinte de zone observée (onglet Sites, 489 px). Les deux
 * étaient des enfants DIRECTS d'un `Card` en `flex flex-col`. Les deux suites
 * de composants passaient au vert : jsdom ne met rien en page, donc aucun test
 * ne pouvait voir la déformation — exactement la même raison que pour la règle
 * du retour à la ligne ci-dessus.
 *
 * `w-fit` (`width: fit-content`) est ce qui l'empêche à la racine :
 * l'étirement d'un enfant de flex ne s'applique que si la taille du deuxième
 * axe vaut `auto`. Posé sur le composant PARTAGÉ, pas sur les deux appelants —
 * la prochaine carte en colonne se serait reproduite à l'identique.
 */
describe('les pilules ne s’étirent pas', () => {
  it('le badge de base borne sa largeur à son contenu', () => {
    const { container } = render(<Badge>Écosystème de services dense</Badge>)
    expect(container.firstElementChild?.className).toContain('w-fit')
  })

  it('la règle survit à une variante et à des classes ajoutées', () => {
    const { container } = render(
      <Badge variant="outline" className="border-dashed text-xs font-normal">
        France
      </Badge>,
    )
    expect(container.firstElementChild?.className).toContain('w-fit')
  })

  /**
   * LE TÉMOIN — la garde ne doit pas attraper ce qu'elle ne vise pas.
   *
   * Quatre pilules du produit portent une largeur EXPLICITE (`size-7`, la
   * pastille d'avatar de la barre latérale) : `cn` passe par `tailwind-merge`,
   * qui sait que `size-*` est en conflit avec `w-*` et garde la classe de
   * l'APPELANT. Sans ce témoin, un futur `!w-fit` posé « pour être sûr »
   * écraserait ces quatre pastilles sans qu'aucun test ne tombe.
   */
  it('une largeur posée par l’appelant gagne toujours', () => {
    const { container } = render(<Badge className="size-7 shrink-0" />)
    const className = container.firstElementChild?.className ?? ''
    expect(className).toContain('size-7')
    expect(className).not.toContain('w-fit')
  })
})
