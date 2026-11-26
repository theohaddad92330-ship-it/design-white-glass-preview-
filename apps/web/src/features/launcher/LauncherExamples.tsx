import { useTranslation } from 'react-i18next'
import { Zap } from 'lucide-react'
import { runsOfType } from '@bellum/contracts'
import { cn } from '@bellum/ui'
import { useLauncherArm } from './LauncherProvider'

/**
 * Les quatre travaux gouvernés, RANGÉS AVEC LES AUTRES EXEMPLES.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE COMPOSANT CORRIGE (Louis, 29/08/2026)
 * ─────────────────────────────────────────────────────────────────────────
 * « Faudrait enlever les "Lancer : Compte, .., .." mais juste mettre ça en
 * exemple comme d'autres trucs. »
 *
 * Les mêmes cinq entrées vivaient dans une rangée à part SOUS la saisie, sous
 * une étiquette « ⚡ Lancer : », et se nommaient par le TYPE D'OBJET —
 * « Compte », « Contact », « Besoin », « Talent », « Territoire ». Deux
 * défauts, et le second est le vrai :
 *
 *  1. **une seconde mécanique.** L'écran portait une rangée d'exemples au-
 *     dessus du champ et une rangée d'actions en dessous. Deux barres de
 *     pastilles pour un même geste — « dis à Laura ce que tu veux » — dont
 *     l'une seulement se lisait comme une invitation.
 *  2. **un nom d'objet n'est pas un exemple.** « Compte » ne dit pas ce que le
 *     clic va faire ; « Analyser une entreprise » le dit. C'est la même
 *     différence qu'entre un onglet et une amorce de conversation, et c'est
 *     exactement ce que les huit autres pastilles font déjà.
 *
 * D'où ce composant : les quatre rejoignent la rangée d'exemples, sous le
 * libellé du travail DOMINANT de leur type — le premier run du catalogue, qui
 * est aussi celui que le clic arme (`armedRunOf`). Un seul endroit qui nomme
 * ce travail, donc aucune divergence possible entre l'exemple et ce qui part.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI N'A PAS BOUGÉ, ET POURQUOI IL NE FALLAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ Une pastille d'exemple ordinaire REMPLIT le champ. Celles-ci ARMENT un
 * run : le marque-place change, le prix s'affiche à côté du bouton, et Entrée
 * ouvre l'écran de l'objet au lieu d'envoyer un message. C'est une capacité,
 * pas une décoration — la fondre dans un simple pré-remplissage aurait perdu
 * le seul chemin gouverné du produit (coût annoncé avant le clic, confirmation
 * sur l'écran de destination, aucun second chemin d'écriture).
 *
 * Ce qui a disparu est donc la RANGÉE, pas le geste. Ce qui apparaît une fois
 * armé — la liste des runs, leur prix, la portée, « Annuler » — vit toujours
 * sous la saisie ({@link ComposerLauncher}), mais seulement APRÈS un clic :
 * une rangée permanente d'actions redeviendrait la seconde mécanique qu'on
 * vient de retirer.
 */
export function LauncherExamples({
  disabled = false,
  /**
   * `arm` (défaut) — le clic ARME le run et le champ prend la suite.
   * `open` — le clic OUVRE directement l'écran de l'objet.
   *
   * Le second existe pour la salle de démonstration, dont la saisie est
   * délibérément désactivée : y armer un run n'a aucune sortie, puisque la
   * seule qui existe est le bouton du composer. Mesuré le 29/08/2026 — les
   * chips y étaient les seuls éléments cliquables de l'écran, et ils ne
   * menaient nulle part. Un prospect cliquait, rien ne se passait.
   */
  variant = 'arm',
}: {
  disabled?: boolean
  variant?: 'arm' | 'open'
}) {
  const { t } = useTranslation('launcher')
  const launcher = useLauncherArm()

  // Pas de fournisseur = pas de lanceur sur cette surface. La rangée
  // d'exemples se rend exactement comme avant plutôt que d'afficher des
  // pastilles qui ne feraient rien.
  if (!launcher) return null

  const { types, typeKey, pickType, openType } = launcher

  return (
    // #3354.reste (LAU-UI-306, recette prod 30/09) — « regroupement » : les
    // cinq pastilles gouvernées se lisaient comme des pastilles posées côte à
    // côte sans logique, mêlées visuellement aux amorces ordinaires qui les
    // suivent dans la même rangée qui DÉFILE. Un seul conteneur les CLUSTERISE
    // (fond + bord partagés, `shrink-0` sur le groupe entier) sans toucher la
    // largeur d'aucune pastille ni l'ordre de la rangée (#1600/#3321, défilement
    // déjà calibré, régression mesurée en prod — refusé par les lots
    // précédents, toujours refusé ici pour la TAILLE/POSITION individuelles).
    <div
      role="group"
      aria-label={t('examplesGroupAria')}
      // #4594 — `max-w-full overflow-x-auto` : dans la rangée d'amorces (étroite, `overflow-hidden`), le groupe
      // (~640 px, `shrink-0`) était rogné en plein mot et mangeait la place des amorces. Borné à la rangée, il défile.
      className="flex max-w-full shrink-0 items-center gap-1 overflow-x-auto rounded-full border border-[var(--accent-soft-border)] bg-[var(--bellum-surface-1)] p-0.5 [scrollbar-width:none]"
    >
      {types.map(candidate => {
        // Le libellé du travail dominant, pas le nom de l'objet. `runs[0]` est
        // aussi le run que `armedRunOf` arme par défaut : l'exemple annonce
        // donc exactement ce qui partira si on tape et qu'on valide.
        const dominant = runsOfType(candidate.key)[0]
        if (!dominant) return null
        return (
          <button
            key={candidate.key}
            type="button"
            disabled={disabled}
            onClick={() => (variant === 'open' ? openType(candidate.key) : pickType(candidate.key))}
            // `aria-pressed` seulement quand le clic BASCULE un état. En mode
            // `open` il n'y a rien à basculer : annoncer un bouton à bascule
            // qui ne bascule pas est pire que de ne rien annoncer.
            aria-pressed={variant === 'arm' ? typeKey === candidate.key : undefined}
            className={cn(
              // La MÊME pastille que les autres exemples (`PromptSuggestions`) :
              // c'est tout l'objet du chantier — ces quatre-là ne sont plus une
              // rangée à part.
              'min-h-11 rounded-full border px-3 py-1.5 text-xs outline-none transition-colors duration-immediate ease-bellum-out',
              'focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]',
              'disabled:cursor-not-allowed disabled:opacity-50',
              // À TOUTES les largeurs, et non plus au seul `max-md:`. Les
              // exemples vivent depuis le 02/09/2026 dans la ligne d'outils du
              // composer, qui DÉFILE : sans `shrink-0`, un enfant de flex se
              // comprime jusqu'à la largeur de son plus long mot, et sans
              // `whitespace-nowrap` il se casse en colonne. Mesuré en prod —
              // « Réécrire un CV pour une mission » s'affichait sur six lignes
              // d'un mot. Dans l'état vide, qui s'enroule, les deux classes
              // sont sans effet.
              'shrink-0 whitespace-nowrap',
              variant === 'arm' && typeKey === candidate.key
                ? 'border-transparent bg-[var(--bellum-primary)] text-[var(--bellum-on-primary)]'
                : // #3354.2 (LAU-UI-306, reste) — « hiérarchie plus claire entre
                  // actions principales et secondaires ». Reprendre la TAILLE
                  // ou l'ORDRE individuel de chaque pastille rouvrirait
                  // #1600/#3321 (défilement déjà calibré, régression mesurée
                  // en prod) — refusé par les lots précédents ; le
                  // REGROUPEMENT (conteneur partagé, ci-dessus) ne les touche
                  // pas et est donc livré. Une teinte primaire subtile (même
                  // jeton que `badge.tsx`, aucun hex, GA-33) distingue ces
                  // pastilles, qui ARMENT un run payant, du gris neutre des
                  // amorces ordinaires qui se contentent de remplir le champ.
                  // Théo : jetons doux de l'accent (`--accent-soft-*`, AA dans les deux thèmes), plus de `color-mix`.
                  'border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)] hover:border-[var(--bellum-text-accent)]',
            )}
          >
            {/* #3354 (LAU-UI-306) — même icône que `ListLauncher` (l'autre
                surface du même lanceur) : ARMER un run n'est pas remplir le
                champ, et le gabarit qu'elles partagent avec les amorces
                ordinaires (délibéré, #1600) ne le disait pas avant le clic. */}
            <Zap className="size-3 shrink-0" aria-hidden />
            {t(dominant.labelKey)}
          </button>
        )
      })}
    </div>
  )
}
