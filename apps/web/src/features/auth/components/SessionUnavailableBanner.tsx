import { AlertTriangle } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Banner } from '@/components/layout/Banner'
import { isTabDemo } from '../demo-tab'
import { sessionManager } from '../session-manager'

function subscribe(listener: () => void): () => void {
  return sessionManager.subscribe(listener)
}

function isUnavailable(): boolean {
  return sessionManager.getState().sessionUnavailable
}

/**
 * #2435.6 — une panne serveur n'est pas une déconnexion.
 *
 * `sessionUnavailable` (`session-manager.ts:17`) existe depuis le 15/09
 * (`d03454161`) et est posé pour de vrai par `markUnavailable()` (429, 5xx,
 * réseau coupé) — mais `SessionProvider` construisait son `SessionContextValue`
 * avec `{ user, loading }` SEULEMENT : le champ mourait avant d'atteindre React.
 * Zéro lecteur dans tout `apps/web`.
 *
 * FORME RETENUE (et pourquoi, GA-26 — un réglage vit à un seul endroit) : ce
 * composant lit `sessionManager` DIRECTEMENT via `useSyncExternalStore`, exactement
 * comme le fait déjà `SessionRevokedNotice` pour `sessionRevoked` — sa sœur dans
 * le même `SessionState`. Élargir `SessionContextValue` aurait dupliqué la même
 * information à DEUX endroits (le store ET le contexte) pour ~30 appelants de
 * `useSession()` qui n'en ont pas besoin. La grammaire existe déjà : ce fichier
 * la complète, il ne l'invente pas.
 *
 * CE QUE CE BANDEAU DIT, ET RIEN DE PLUS : `markUnavailable()` ne connaît que
 * « le serveur n'a pas répondu ». Il ne sait ni depuis combien de temps, ni
 * quand une nouvelle tentative aura lieu (`loadSession` rouvre au prochain
 * appel, pas sur un minuteur visible) — donc pas de « réessai dans N secondes »
 * inventé. Il ne se prononce pas non plus entre hors-ligne / réseau lent /
 * 5xx : `isServerUnavailable()` les traite délibérément comme UNE seule cause
 * (son propre commentaire : « quota (429), panne (5xx), réseau coupé ») parce
 * que `navigator.onLine` est un signal connu pour mentir — les distinguer à
 * l'écran serait une précision que la mesure ne tient pas.
 *
 * NE REDIRIGE NULLE PART : contrairement à `SessionRevokedNotice` (avis
 * bloquant avec CTA « Me reconnecter »), ce bandeau n'a ni bouton ni lien —
 * précisément pour NE PAS pousser vers `/login` un commercial dont le crédit
 * est peut-être déjà débité (raison d'être de `sessionUnavailable`, voir son
 * docblock). Il reste posé tant que le serveur ne répond pas, et disparaît de
 * lui-même dès qu'une session s'applique ou se vide pour de bon
 * (`applySession`/`clear`/`revoke` mettent tous `sessionUnavailable: false`).
 *
 * PARITÉ DÉMO : ni ce champ ni son déclencheur ne touchent une table
 * `workspace_id` — c'est un état de transport côté client (statut HTTP /
 * échec réseau), jamais une ligne purgée par `demo-reset.service.ts`. Même
 * construction que sa sœur `sessionRevoked`, qui n'a elle non plus aucune
 * entrée dans `demo-coverage.ts` : hors du périmètre que ce fichier garde
 * (les tables), pas un oubli.
 */
export function SessionUnavailableBanner() {
  const unavailable = useSyncExternalStore(subscribe, isUnavailable, isUnavailable)
  const { t } = useTranslation('auth', { keyPrefix: 'sessionUnavailable' })

  if (!unavailable) return null

  // R35 — en démonstration, une salle qui se remet en état (purge + re-semis, quelques dizaines de secondes) ne
  // doit JAMAIS se lire « le serveur ne répond pas » : c'est l'état « préparation », dit comme tel, et il reprend
  // seul (même mécanique de reprise que la panne — `loadSession` rejoue). `status`, pas `alert` : ce n'est pas une panne.
  const preparing = isTabDemo()

  return (
    <Banner
      layout="app"
      tone="warning"
      icon={AlertTriangle}
      role={preparing ? 'status' : 'alert'}
      title={preparing ? t('demoPreparing.title') : t('title')}
    >
      {preparing ? t('demoPreparing.body') : t('body')}
    </Banner>
  )
}
