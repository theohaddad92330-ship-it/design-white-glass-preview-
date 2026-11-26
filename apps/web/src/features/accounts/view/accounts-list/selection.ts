/**
 * La case de sélection du portefeuille — sa taille de cible vit ICI, et nulle
 * part ailleurs.
 *
 * L'entête et la ligne sont dans deux fichiers ; recopier la classe dans les
 * deux garantit qu'elles divergeront (loi 1 du tome 7, garde GA-26). Or c'est
 * précisément la cible tactile qui ne doit pas diverger : une case de 44 px
 * dans l'entête au-dessus d'une case de 20 px dans les lignes se rate au doigt
 * une fois sur deux, et personne ne saurait dire pourquoi.
 *
 * `pointer-coarse:min-h-11` / `min-w-11` = 44 px AU DOIGT seulement (GA-30) :
 * la question qui compte est « avec quoi cette personne pointe-t-elle ? », pas
 * « quelle est la largeur de la fenêtre ». À la souris la densité de la liste
 * reste celle qu'elle était.
 */
export const SELECT_CELL =
  'flex w-5 shrink-0 items-center justify-center pointer-coarse:min-h-11 pointer-coarse:min-w-11'

/** Le crochet que les tests interrogent pour prouver que la cible est là. */
export const SELECT_SLOT = 'account-select'
