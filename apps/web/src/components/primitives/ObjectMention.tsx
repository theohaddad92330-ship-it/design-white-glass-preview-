import { Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from './UnknownValue'

/**
 * F1 · Mention — la plus petite forme d'un objet métier.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE PRIMITIVE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * `T7.md:508-566` décrit sept formes sous lesquelles un objet métier se rend,
 * et une matrice de 119 cellules qui dit, objet par objet, lesquelles existent.
 * F1 y est la plus répandue : `●` pour seize objets sur dix-sept.
 *
 * Sa définition tient en une ligne — « nom + 1 attribut », action « ouvrir ».
 * C'est justement parce qu'elle est minuscule que personne n'a jamais écrit le
 * composant : chaque écran refait les trois lignes de JSX à la main. Mesuré le
 * 29/08/2026 : **quinze mentions de compte dans quatorze fichiers**, chacune
 * avec son balisage, sa taille de texte et sa couleur — et pas une ne porte
 * l'attribut que `T7.md:558` assigne à la mention d'un compte. Le contact, le
 * talent, la mission et le projet sont dans le même état, quand ils ne sont pas
 * de simples `<Text>` non cliquables.
 *
 * Quinze formes pour une seule forme, c'est la loi 4 du tome 7 exactement à
 * l'envers : elle interdit qu'un même contenu apparaisse deux fois sous la même
 * forme ; ici c'est la même forme qui apparaît quinze fois différemment.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE REFUSE DE FAIRE
 * ─────────────────────────────────────────────────────────────────────────
 * · **Deux attributs.** `attribute` est au singulier, et ce n'est pas un
 *   raccourci d'écriture : au-delà d'un attribut, la forme juste est F2 (une
 *   ligne de liste) ou F5 (un panneau), qui portent d'autres actions.
 * · **Un attribut inventé.** Sans `attribute`, elle rend le nom seul. Elle
 *   n'écrit pas « — », qui se lit « mesuré, et vide ».
 * · **Un nom deviné.** Un objet peut arriver sans nom (import partiel, source
 *   muette) : elle rend alors `UnknownValue`, garde le lien, et son nom
 *   accessible le dit. Un lien au libellé vide est incliquable au clavier et
 *   muet au lecteur d'écran.
 *
 * ⚠️ Elle ne remplace PAS les liens qui enveloppent une carte entière (le
 * suivi de tâche du panneau latéral, une ligne de briefing cliquable de bout
 * en bout). Ceux-là ne sont pas des mentions : leur contenu est une carte, et
 * leur action n'est pas « ouvrir cet objet » mais « reprendre ce travail ».
 */

/**
 * Les objets dont la mention sait ouvrir le dossier — et la route de chacun.
 *
 * Un seul endroit, par principe (loi 1) : une deuxième table de correspondance
 * ailleurs divergerait au premier renommage de route. La liste s'allonge à
 * mesure que les objets gagnent un F6 — c'est mesuré, écrit au registre
 * `object-forms.ts`, et ce n'est pas à cette primitive de l'inventer.
 *
 * ⚠️ **30/08/2026 — la MISSION rejoint la table (D200).** Elle a désormais son
 * dossier, `/missions/$id` : la dépendance F1←F6 que la mesure avait trouvée
 * est levée, et le registre a bougé en même temps que cette ligne.
 *
 * ⚠️ **31/08/2026 — le TALENT rejoint la table** (écran Vivier, PDF-22 §01,
 * défaut trouvé sur `/favorites` : `favorites.service.ts` hydrate déjà
 * `'talent'`, mais rien côté écran ne savait le mentionner — un chemin
 * d'écriture branché dont la LECTURE manquait). Sa fiche existe depuis le
 * socle, `/consultants/$id`.
 *
 * ⚠️ **#2801 — le PROJET rejoint la table.** Jusqu'ici « n'a AUCUNE route de
 * dossier, donc aucune mention ne peut l'ouvrir » : sa fiche existe désormais,
 * `/projects/$id` (fondation de l'épopée #2801). L'ajouter avant aurait
 * fabriqué le lien mort que ce commentaire refusait ; l'épopée l'a levé.
 *
 * ⚠️ Le paramètre s'appelle `id` pour TOUS : c'est ce qui permet à cette table
 * d'être une table de CHEMINS et pas une table de chemins ET de noms de
 * paramètres. Un dossier neuf nomme donc son paramètre `id`.
 */
const MENTION_TARGETS = {
  account: '/accounts/$id',
  contact: '/contacts/$id',
  mission: '/missions/$id',
  talent: '/consultants/$id',
  project: '/projects/$id',
} as const

/** Non exporté : rien hors de ce fichier ne le consomme, et `knip` le voit. */
type ObjectMentionKind = keyof typeof MENTION_TARGETS

export function ObjectMention({
  kind,
  id,
  name,
  attribute,
  className,
  onClick,
  lines,
}: {
  kind: ObjectMentionKind
  id: string
  /** Le nom de l'objet. Vide, blanc ou `null` → « non mesuré », jamais rien. */
  name: string | null | undefined
  /** L'UNIQUE attribut de la forme. Au-delà d'un, ce n'est plus une mention. */
  attribute?: ReactNode
  className?: string
  /** Pour les mentions posées dans une ligne déjà cliquable, qui doivent
   *  arrêter la propagation. Rien d'autre — une mention n'a qu'une action. */
  onClick?: (event: React.MouseEvent) => void
  /**
   * vu en recette 09/10 (/missions/facturation) — `truncate` pose `white-space: nowrap` : dans
   * une cellule de tableau à colonnes fixes, le titre débordait sur la colonne voisine (391→688 px
   * contre 656). `lines={2}` : le nom passe à la ligne (2 max), borné à sa colonne, et le texte
   * complet reste lisible au survol (`title`). Absent = une ligne tronquée, comme avant.
   */
  lines?: 2
}) {
  const { t } = useTranslation('common')
  const trimmed = typeof name === 'string' ? name.trim() : ''
  const named = trimmed.length > 0

  return (
    <Link
      to={MENTION_TARGETS[kind]}
      params={{ id }}
      onClick={onClick}
      // Le nom accessible dit l'ACTION, pas seulement l'objet. Sur un écran qui
      // porte huit mentions, « Damaris Industries » huit fois n'apprend pas ce
      // qui se passe au clic ; « Ouvrir Damaris Industries » le dit.
      aria-label={named ? t('objectMention.open', { name: trimmed }) : t('objectMention.openUnnamed')}
      title={lines && named ? trimmed : undefined}
      className={`inline-flex min-w-0 items-baseline gap-1.5 hover:text-[var(--bellum-text-accent)] ${lines ? 'max-w-full ' : ''}${className ?? ''}`.trim()}
    >
      {/* ⚠️ `element="span"` n'est pas cosmétique. `Text` rend un `<p>` par
          défaut, et une mention se pose SOUVENT dans une phrase déjà rendue par
          un `<Text>` : un `<p>` dans un `<p>` est du HTML invalide, que le
          navigateur répare en coupant le paragraphe — la mention saute à la
          ligne. Un `<p>` hériterait par ailleurs de la borne de lecture à 70
          caractères (D81), qui n'a aucun sens sur un nom propre. */}
      {named ? (
        <Text
          element="span"
          size="sm"
          weight="medium"
          className={lines ? 'line-clamp-2 min-w-0 break-words' : 'truncate'}
        >
          {trimmed}
        </Text>
      ) : (
        <UnknownValue />
      )}
      {attribute !== undefined && attribute !== null ? (
        <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]" className="shrink-0">
          {attribute}
        </Text>
      ) : null}
    </Link>
  )
}
