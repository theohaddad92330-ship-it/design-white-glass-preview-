import { variablesManquantes } from '@/lib/backoffice-auth'
import { etatDeLaConnexion } from '@/lib/roles'
import { enrolementOuvert, listeDacces } from '@/lib/roles-env'
import { LoginForm } from './_components/login-form'
import { suiteInterne } from './suite'

/**
 * L'écran de connexion du back-office (#1668).
 *
 * Composant SERVEUR : il lit l'environnement (interrupteur, fenêtre
 * d'enrôlement, variables manquantes) et ne passe au navigateur que des booléens
 * et des noms de variables — jamais une valeur.
 *
 * ⚠️ TROUVÉ EN RECETTE LIVE le 07/09/2026 : sur un environnement où la couche
 * est éteinte, cet écran montrait son formulaire ET une alerte rouge
 * « SUPABASE_URL manque côté serveur ». Il annonçait une panne là où il n'y
 * avait qu'un interrupteur au repos. Les trois états se disent maintenant, et
 * c'est `etatDeLaConnexion` qui les distingue.
 */
export const dynamic = 'force-dynamic'

/**
 * ⚠️ On ne redirige QUE vers un chemin interne : une `suite` absolue
 * (`https://…`) ferait de l'écran de connexion un tremplin vers l'extérieur.
 *
 * Le filtre d'origine (« commence par `/`, pas par `//` ») laissait passer
 * `/\evil.com` : il commence bien par `/`, pas par `//` — mais plusieurs
 * navigateurs lisent un `\` en tête de chemin comme un `/`, ce qui en fait une
 * URL PROTOCOLE-RELATIVE une fois assignée à `window.location.assign(suite)`
 * dans `login-form.tsx`. Même défense que `appRouteTarget` dans
 * `apps/web/src/components/navigation/known-routes.ts` : « `//ailleurs.example`
 * et `/\ailleurs.example` commencent par `/` et quittent le domaine dans
 * plusieurs navigateurs. »
 *
 * On refuse d'abord tout ce qui ne commence pas par un `/` littéral — ce qui
 * écarte au passage `\evil.com` et toute URL absolue (`http:`/`https:` ne
 * commencent jamais par `/`). On normalise ensuite les `\` en `/` avant de
 * juger un éventuel DOUBLON en tête : un navigateur lit indifféremment `/` et
 * `\` comme séparateur pour les schémas spéciaux (http, https…), donc `/\`,
 * `\/`, `\\` et `//` sont tous équivalents à une URL protocole-relative une
 * fois assignés à `window.location` — ce qu'un simple `startsWith('/\\')`
 * raterait sur les combinaisons mélangées (`/\/\evil.com`).
 */

export default async function LoginPage(props: { searchParams?: Promise<{ suite?: string }> }) {
  const searchParams = await props.searchParams
  const manquantes = variablesManquantes()
  const etat = etatDeLaConnexion(listeDacces().etat, manquantes)

  const suite = suiteInterne(searchParams?.suite ?? '/')

  if (etat === 'eteinte') {
    return (
      <main className="wrap wrap--etroit">
        <h1>Connexion</h1>
        <p className="subtitle">
          La connexion par identité n’est pas activée sur cet environnement : l’accès passe par le mot de passe partagé
          de la console. Il n’y a rien de cassé ici, et rien à faire.
        </p>
        <p className="muted">
          Pour l’activer, un propriétaire pose <code className="mono">DM_ALLOWED_EMAILS</code> — puis{' '}
          <code className="mono">SUPABASE_URL</code>, <code className="mono">SUPABASE_ANON_KEY</code> et la fenêtre
          d’enrôlement <code className="mono">DM_ENROLLMENT_OPEN</code>.
        </p>
        <p>
          <a className="btn" href="/monitoring?view=cockpit">
            Retour au cockpit
          </a>
        </p>
      </main>
    )
  }

  return (
    <main className="wrap wrap--etroit">
      <h1>Connexion</h1>
      <p className="subtitle">
        La console du back-office demande ton adresse, ton mot de passe et le code à six chiffres de ton application
        d’authentification. Seules les adresses autorisées entrent.
      </p>
      {etat === 'mal_configuree' ? (
        <p className="error">
          Connexion impossible : {manquantes.join(', ')} {manquantes.length > 1 ? 'manquent' : 'manque'} côté serveur.
          Préviens un propriétaire.
        </p>
      ) : null}
      <LoginForm suite={suite} enrolementOuvert={enrolementOuvert()} />
    </main>
  )
}
