import type { PropagatedSource } from '@bellum/contracts'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@bellum/ui'

/**
 * §4.4 — UN BLOC PROPAGÉ EST UN LIEN VERS SA SOURCE, ET N'EST JAMAIS UN CHAMP.
 *
 *     « Le CA cumulé d'un compte se lit sur la fiche compte. Il se calcule dans
 *      les missions. On ne le corrige pas depuis le compte. »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE COMPOSANT EMPÊCHE
 * ─────────────────────────────────────────────────────────────────────────────
 * La propagation du contexte fabrique MÉCANIQUEMENT la seconde vérité : elle
 * multiplie les endroits où le même chiffre s'affiche. Le jour où l'un d'eux
 * devient corrigible, deux valeurs divergent et plus personne ne sait laquelle
 * est la bonne.
 *
 * Côté serveur, la règle est tenue par l'ABSENCE de code : `propagation.service.ts`
 * n'a aucun chemin d'écriture, `editable` est un `z.literal(false)` et
 * `propagation-source-link.spec.ts` relit le texte pour s'en assurer.
 *
 * Cette moitié-ci tient l'autre : à l'écran, tout bloc propagé passe par ce
 * composant, qui rend un LIEN et rien d'autre. Il n'accepte ni `onChange`, ni
 * `value`, ni enfant éditable — la seule façon de rendre un agrégat modifiable
 * serait de ne pas l'utiliser, ce que `propagated-blocks-are-links.test.ts`
 * refuse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ LE LIEN VIENT DU CONTRAT, IL NE SE RECOMPOSE PAS ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * `source.href` est produit par `missionsOfAccount` / `missionsOfConsultant`
 * (`packages/contracts`), et c'est le SEUL endroit où il s'écrit. Le recopier à
 * la main ici en ferait une seconde définition qui dériverait à la première
 * évolution — le défaut « clé de cache recopiée à la main », déjà payé.
 * On le DÉCOMPOSE donc, on ne le refabrique pas : chemin d'un côté, paramètres
 * de l'autre, tels qu'ils arrivent.
 *
 * ⚠️ Le chemin est `/missions` en littéral parce que le routeur exige une route
 * connue à la compilation. Il n'est pas deviné : `propagatedSearch` vérifie que
 * le chemin du contrat est bien celui-là, et rend `null` sinon — un lien qui ne
 * mène pas à sa source ment sur sa source, ce qui est pire que pas de lien.
 * `PropagatedBlock.test.tsx` échoue le jour où le contrat pointe ailleurs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ SON NOM EST DANS LA LANGUE DE L'UTILISATEUR, PAS DANS CELLE DU SERVEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * `source.label` vaut « Les missions de ce compte » — écrit en français dans le
 * contrat, parce que c'est là que la règle se documente. L'afficher tel quel
 * mettrait du français dans une interface anglaise. Le libellé visible est donc
 * traduit ici, et il se DÉDUIT du paramètre porté par le lien : rien à retenir
 * pour l'appelant, donc rien à oublier.
 */

/** Le chemin que les deux constructeurs du contrat visent, et le seul. */
const MISSIONS_PATH = '/missions'

/**
 * Les paramètres du lien de source, ou `null` si le contrat a changé de cible.
 *
 * Exporté pour le test : c'est ce qui rend la vérification du chemin lisible
 * plutôt que cachée dans un rendu.
 */
export function propagatedSearch(href: string): Record<string, string> | null {
  const [path, query] = href.split('?')
  if (path !== MISSIONS_PATH) return null
  return Object.fromEntries(new URLSearchParams(query ?? ''))
}

export function PropagatedBlock({
  source,
  children,
  className,
}: {
  source: PropagatedSource
  /** La VALEUR propagée. C'est elle qui se clique — le chiffre EST le lien. */
  children: ReactNode
  className?: string
}) {
  const { t } = useTranslation('common')
  const search = propagatedSearch(source.href)

  // Un lien qui ne mène pas à sa source n'est pas rendu comme un lien : il
  // vaut mieux un chiffre nu qu'un chiffre qui promet une preuve et ouvre
  // autre chose.
  if (!search) return <>{children}</>

  const label = search.consultantId
    ? t('propagation.sourceConsultant')
    : search.accountId
      ? t('propagation.sourceAccount')
      : t('propagation.source')

  return (
    <Link
      to={MISSIONS_PATH}
      search={search}
      title={label}
      aria-label={label}
      // ⚠️ Les blocs propagés vivent SUR des lignes cliquables — une ligne du
      // portefeuille ouvre le compte, une ligne de contact ouvre la fiche. Sans
      // cet arrêt, cliquer le CA déclencherait les deux navigations, et celle de
      // la ligne gagnerait : le lien de source serait présent, tabulable, et
      // n'irait jamais à sa source. Une garde de SOURCE ne voit pas ça — il a
      // fallu un `disabled` rendu inerte pour l'apprendre.
      onClick={event => event.stopPropagation()}
      className={cn(
        // Souligné au survol et au clavier : ce qui se clique doit se VOIR se
        // cliquer, et le focus doit se voir aussi — un lien qui ne se distingue
        // qu'au survol n'existe pas pour qui navigue au clavier.
        'rounded-sm underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none',
        'focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
    >
      {children}
    </Link>
  )
}
