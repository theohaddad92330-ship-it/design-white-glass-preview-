/**
 * Les trois classes du mode replié, écrites UNE fois.
 *
 * Les deux barres latérales (application et Réglages) posent exactement les
 * mêmes questions au rail : que devient une entrée, que devient une gouttière,
 * qu'est-ce qui disparaît. Les recopier des deux côtés garantit qu'elles
 * divergeront — et le symptôme serait deux barres qui ne se replient pas
 * pareil, ce qui ne désigne aucun fichier.
 *
 * ⚠️ Ces classes ne s'appliquent QUE sous `collapsible="icon"` : elles
 * dépendent du `data-collapsible="icon"` posé par le composant `Sidebar`. Sous
 * 768 px, où la barre reste en `collapsible="none"`, il n'y a même pas de
 * `.group` porteur — elles sont inertes par construction, et c'est ce qui rend
 * « rien ne change sur mobile » vrai sans une seule branche de rendu.
 */

/**
 * Ce qu'une entrée de nav devient une fois la barre repliée : l'icône au
 * CENTRE, et le libellé rogné — toujours DANS le DOM, donc toujours lu par un
 * lecteur d'écran, doublé d'une infobulle pour qui lit à l'œil. Une colonne
 * d'icônes muettes serait pire que pas de repli du tout.
 *
 * La TAILLE du carré (44 px, le plancher tactile de GA-30) n'est pas ici : elle
 * appartient à `SidebarMenuButton`, qui la porte pour tous ses appelants. L'y
 * recopier ferait vivre le même nombre à deux endroits.
 */
export const COLLAPSED_ENTRY = 'group-data-[collapsible=icon]:justify-center'

/** Ce qui n'a plus de place dans un rail de 56 px, et disparaît proprement. */
export const HIDDEN_WHEN_COLLAPSED = 'group-data-[collapsible=icon]:hidden'

/** Les gouttières de 16 px deviennent 6 px : 56 − 12 = 44 px utiles. */
export const COLLAPSED_GUTTER = 'group-data-[collapsible=icon]:px-1.5'
