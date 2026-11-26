import { cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { keyLabel, useKeyRenderer } from './shortcut-format'
import type { Shortcut } from './shortcuts'

/**
 * Les touches d'un raccourci, en capuchons — LE seul rendu de `<kbd>` du dépôt.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN COMPOSANT, ET PAS UNE CHAÎNE DANS CHAQUE BOUTON
 * ─────────────────────────────────────────────────────────────────────────
 * Une chaîne `'⌘K'` écrite dans un bouton est un DOUBLON du registre : elle ne
 * bouge pas quand la touche change, et elle affiche `⌘` à quelqu'un sous
 * Windows, dont le clavier n'a pas cette touche. Les deux défauts sont
 * silencieux — personne ne dépose un ticket pour un raccourci mal orthographié,
 * il cesse simplement d'être essayé.
 *
 * La garde `shortcuts-are-shown.test.ts` tient la règle : `<kbd` n'apparaît que
 * dans CE fichier.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI EST LU À VOIX HAUTE, ET POURQUOI PAS PAR LE NOM DU BOUTON
 * ─────────────────────────────────────────────────────────────────────────
 * `⌘` s'annonce « signe du lieu d'intérêt » chez la plupart des lecteurs
 * d'écran — c'est-à-dire rien. Les capuchons sont donc `aria-hidden`.
 *
 * ⚠️ La première version ajoutait à la place un `sr-only` « raccourci : G puis
 * C ». Il ENTRAIT dans le nom accessible du bouton : l'entrée de navigation
 * s'appelait « Comptes raccourci : G puis C », et neuf tests qui cherchaient le
 * lien « Comptes » ne le trouvaient plus. Une aide qui renomme ce qu'elle
 * décrit n'est pas une aide — un utilisateur qui cherche « Comptes » à la voix
 * ne l'aurait pas trouvé non plus.
 *
 * Deux chemins la remplacent, chacun là où il est juste :
 *  - `shortcutAriaKeys` → l'attribut ARIA prévu pour ça (`aria-keyshortcuts`),
 *    qui s'annonce SANS toucher au nom. Il n'existe que pour les COMBINAISONS :
 *    ARIA n'a pas de syntaxe pour une séquence, et y écrire « G C » se lirait
 *    « G, ou C », ce qui est faux.
 *  - la liste `⌘/`, atteignable au clavier ET par le menu du compte, où les
 *    touches sont du texte annoncé (`announce`). C'est là que les séquences
 *    s'apprennent.
 *
 * ⚠️ Sur un BOUTON de l'application, l'appelant passe `HIDE_ON_TOUCH` : un
 * raccourci clavier n'a aucun sens en pointeur grossier, et l'afficher sur un
 * téléphone occuperait la seule chose dont la coque mobile manque — de la
 * largeur. La liste `⌘/` ne le fait PAS : elle ne s'ouvre que par le clavier ou
 * par une entrée de menu elle-même réservée au pointeur fin, et une liste de
 * raccourcis sans les touches serait un écran vide.
 */
export function ShortcutKeys({
  shortcut,
  className,
  announce = false,
}: {
  shortcut: Shortcut
  className?: string
  /**
   * Énoncer le raccourci à voix haute. Réservé à la liste `⌘/`, dont c'est le
   * SUJET — ailleurs, la forme lisible entrerait dans le nom du bouton.
   */
  announce?: boolean
}) {
  const { t } = useTranslation('shortcuts')
  const render = useKeyRenderer()
  // Forme PARLÉE : jamais `⌘`, qui ne s'annonce pas. `keyLabel(…, false, …)`
  // force le libellé textuel du modificateur, quelle que soit la plateforme.
  const spoken = shortcut.keys.map(segment =>
    keyLabel(segment, false, t('keys.mod'), t('keys.escape'), t('keys.shift')),
  )

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {announce && (
        <span className="sr-only">
          {t(shortcut.scope === 'goto' ? 'spoken.sequence' : 'spoken.chord', {
            first: spoken[0] ?? '',
            rest: spoken.slice(1).join(' + '),
            keys: spoken.join(' + '),
          })}
        </span>
      )}
      {shortcut.keys.map(segment => (
        <kbd
          key={segment}
          aria-hidden="true"
          className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-xs leading-none text-[var(--bellum-text-muted)]"
        >
          {render(segment)}
        </kbd>
      ))}
    </span>
  )
}
