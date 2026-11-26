import { useTranslation } from 'react-i18next'
import { lastSupportReference } from '@/lib/support-reference'

/**
 * #2442.5 — LA RÉFÉRENCE SUPPORT SUR UN ÉCRAN D'ERREUR.
 *
 * Une panne qu'on ne peut pas RETROUVER coûte deux fois : une fois à la
 * personne, une fois à qui cherche ensuite dans les journaux sans savoir quelle
 * requête regarder. Cette note est le trait d'union : huit caractères, lisibles
 * au téléphone, qui désignent exactement la requête ayant échoué
 * (`correlation_id` dans les journaux de production).
 *
 * Elle ne montre RIEN d'autre. Pas de code interne, pas de chemin, pas de nom
 * de service : c'est un identifiant OPAQUE côté client, et la traduction
 * s'arrête à la première ligne de support.
 *
 * Sans référence, elle ne rend rien du tout — ni ligne, ni tiret, ni « — ».
 * Doctrine : « on n'affiche pas ce qu'on n'a pas » ; dans une liste, une
 * absence ne fait AUCUNE ligne.
 */
export function SupportReferenceNote() {
  const { t } = useTranslation('common')
  const reference = lastSupportReference()
  if (reference === null) return null
  return (
    <p className="mt-4 text-xs text-[var(--bellum-text-secondary)]">
      {t('errorScreens.supportReference.label')}{' '}
      {/* `select-all` : la référence se lit au téléphone, mais elle se COLLE
          aussi dans un ticket — un clic doit suffire à la prendre en entier. */}
      <span className="select-all font-mono text-[var(--bellum-text-primary)]">{reference}</span>
    </p>
  )
}
