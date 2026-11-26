import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Link2, Snowflake } from 'lucide-react'
import { Button, Popover, PopoverContent, PopoverTrigger, Text, useCopiedFlash } from '@bellum/ui'
import { toast } from 'sonner'
import { snapshotChatConversation } from '@/features/chat/api/agentChatApi'
import { chatShareUrl } from './chat-share-url'

/**
 * « Partager » — un lien vers CE fil, pour les gens de l'espace.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL N'Y A AUCUNE API DERRIÈRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le fil du copilote est **team-scopé côté serveur** depuis la phase 2
 * multi-utilisateur : `GET /chat/messages` résout l'espace de l'appelant et rend
 * le fil de cet espace, sans regarder qui l'a écrit. Un collègue qui ouvre le
 * lien lit donc ce que l'API lui servait déjà — le bouton ne crée aucun droit,
 * il rend ATTEIGNABLE une conversation qu'on ne pouvait désigner qu'oralement.
 *
 * Écrire une table de partage, un jeton et une route aurait donc ajouté un
 * second chemin de lecture pour la même donnée, avec ses propres gardes à tenir
 * — exactement le genre de doublon qui finit par diverger de l'original.
 *
 * ⚠️ Ce n'est PAS un lien public. Il exige une session, et une session d'un
 * membre du même espace : ouvert ailleurs, il mène à l'écran de connexion puis
 * à un fil vide.
 *
 * ⚠️ Ce n'est pas non plus une entorse à D65. Celle-ci ferme la lecture croisée
 * du CORPS des messages de messagerie dans la timeline — un contenu que
 * personne n'a choisi de partager, exposé par défaut. Ici l'auteur clique.
 * L'asymétrie est la même que pour les connexions personnelles : on LIT ce qui
 * est partagé, on n'expose pas ce qui ne l'est pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1955.13 — DIRE QUI POURRA LIRE, AVANT DE COPIER
 * ─────────────────────────────────────────────────────────────────────────────
 * Le bouton copiait le lien SANS RIEN DIRE : un seul clic, et rien à l'écran ne
 * distinguait ce lien d'un lien privé. Puisque le fil est team-scopé (voir plus
 * haut), le geste mérite la phrase qui le rend vrai — un popover s'ouvre au
 * premier clic et NE COPIE RIEN ; la copie elle-même est un second geste,
 * explicite, dans le menu. Pas de `window.confirm`/`alert` : ce sont des
 * boîtes systèmes qui interrompent la page entière pour une phrase qui tient
 * en une ligne — un `Popover` de `@bellum/ui` suffit et reste dans le thème.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2430.4 — DEUX MODES : VIVANT et FIGÉ (décision de Louis, 22/09 soir, §10)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le lien VIVANT reste ce qu'il était : le fil, tel qu'il continuera. Le lien
 * FIGÉ montre la conversation telle qu'elle est au moment du partage, rien
 * d'écrit après. ⚠️ Il ne contredit PAS le raisonnement ci-dessus : ce n'est
 * pas une copie. `POST chat/conversations/snapshot` pose une BORNE numérotée
 * (`chat_conversation_versions` : le dernier message montré), et le lien lit le
 * MÊME fil par la MÊME route (`GET chat/messages?version=`), bornée côté
 * serveur. Aucun second chemin de lecture, aucun texte dupliqué qui divergerait.
 */
export function ShareConversation({
  accountId,
  conversationId,
  hasRestrictedSource,
}: {
  accountId: string | null
  conversationId: string | null
  /**
   * #3775.2b — au moins une réponse de ce fil cite une source d'une connexion
   * PERSONNELLE de l'auteur (marquée côté serveur, `ia-proxy.controller.ts`
   * `createChatMessage`, jamais recalculée ici). Absent/`false` = cas normal,
   * aucune ligne de plus (une absence ne fait aucune ligne).
   */
  hasRestrictedSource?: boolean
}) {
  const { t } = useTranslation('chat')
  const [open, setOpen] = useState(false)
  // #1152 : minuteur annulé au démontage — voir `useCopiedFlash`.
  const [copied, flashCopied, resetCopied] = useCopiedFlash(2000)

  const [freezing, setFreezing] = useState(false)

  async function copy(version: number | null = null) {
    // La PORTÉE voyage avec le fil : sans le compte, le destinataire ouvrirait
    // la bonne conversation dans le mauvais périmètre, et la suite de l'échange
    // porterait sur autre chose que ce qu'il vient de lire. `chatShareUrl` est
    // le seul endroit qui compose cette URL (GA-26) — `ReplyRetryMenu` la
    // réutilise telle quelle pour le partage d'UNE réponse (#1953.9).
    const url = chatShareUrl(window.location.origin, { accountId, conversationId, messageId: null, version })

    try {
      await navigator.clipboard.writeText(url)
      flashCopied()
      toast.success(version ? t('share.snapshotCopied', { version }) : t('share.copied'))
    } catch {
      // Presse-papier refusé (contexte non sécurisé, permission bloquée) : on ne
      // fait pas semblant d'avoir copié. Le lien est MONTRÉ, à sélectionner à la
      // main — un « copié ! » sans copie fait coller autre chose.
      toast.error(t('share.failed', { url }))
    }
  }

  // #2430.4 — le mode SNAPSHOT : figer la version (une BORNE côté serveur,
  // jamais une copie), puis copier son lien. Échec → erreur dite, aucun lien.
  async function copySnapshot() {
    if (!conversationId) return
    setFreezing(true)
    try {
      const snapshot = await snapshotChatConversation(conversationId)
      await copy(snapshot.version)
    } catch {
      toast.error(t('share.snapshotFailed'))
    } finally {
      setFreezing(false)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={next => {
        setOpen(next)
        // Rouvrir doit repartir de « pas encore copié » : sans ce reset, un
        // accusé « copié » resterait affiché d'une ouverture à l'autre.
        if (!next) resetCopied()
      }}
    >
      <PopoverTrigger asChild>
        {/* #5047 — LIGNE du menu ⋯ de l'en-tête : libellé toujours visible. Revient sur #4876 (icône seule sous
            768 px, pour ne pas recouvrir « Laura ») : le bouton n'est plus dans la rangée d'actions. */}
        <Button variant="ghost" size="sm" icon={Link2} fullWidth className="justify-start pointer-coarse:min-h-11">
          {t('share.action')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="space-y-3">
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('share.notice')}
        </Text>
        {/* #3775.2b — partager le lien ne partage pas les identifiants d'un
            connecteur, mais un extrait déjà écrit à partir d'une connexion
            personnelle (ex. une messagerie, BEL-INT-604) reste lisible par
            quiconque ouvre ce lien. Dit AVANT la copie, comme `share.notice`
            juste au-dessus. */}
        {hasRestrictedSource ? (
          <Text element="p" size="xs" className="text-[var(--warning-soft-text)]">
            {t('share.restrictedSourceNotice')}
          </Text>
        ) : null}
        {/* #2430.4 — deux modes, nommés : le fil VIVANT (il suit la suite de
            l'échange) et une version FIGÉE (ce que tu vois maintenant, rien après). */}
        <Button variant="secondary" size="sm" icon={copied ? Check : Link2} onClick={() => void copy()} fullWidth>
          {copied ? t('share.done') : t('share.copyAction')}
        </Button>
        {conversationId ? (
          <>
            <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('share.snapshotNotice')}
            </Text>
            <Button
              variant="ghost"
              size="sm"
              icon={Snowflake}
              onClick={() => void copySnapshot()}
              disabled={freezing}
              fullWidth
            >
              {t('share.snapshotAction')}
            </Button>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
