import { Badge } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { PropagatedBlock } from '@/features/propagation/PropagatedBlock'
import { useContactSignedMissionsIndex } from '@/features/propagation/hooks'

/**
 * « CE CONTACT A SIGNÉ 2 MISSIONS » (§4.2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE BADGE SERT À DIRE, ET RIEN D'AUTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * **Un contact qui a ACHETÉ n'est pas un prospect.** C'est toute la phrase. On
 * n'écrit pas à quelqu'un qui a déjà signé deux missions comme on écrit à
 * quelqu'un qu'on n'a jamais vu, et la liste des contacts ne le disait nulle
 * part — l'information vivait sur les missions, à trois écrans de là.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ AUCUN BADGE À ZÉRO. JAMAIS.
 * ─────────────────────────────────────────────────────────────────────────────
 * Le serveur ne rend AUCUNE ligne pour un contact qui n'a rien signé, et
 * `signedMissions` est un `positive()` au contrat : la valeur zéro n'existe pas
 * sur le fil. `undefined` veut donc dire « n'a rien signé », et le composant
 * rend `null`.
 *
 * « A signé 0 mission » ferait deux dégâts d'un coup : ce serait une MESURE là
 * où il n'y a que l'absence de mesure, et ça collerait une étiquette d'échec sur
 * un prospect parfaitement normal — quelqu'un à qui on n'a simplement encore
 * rien vendu.
 *
 * ⚠️ Les rôles `prescripteur`, `utilisateur` et `bloqueur` sont exclus côté
 * serveur : ils n'ont rien signé. Les compter ferait d'un prospect un client,
 * exactement l'erreur que ce badge existe pour empêcher.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ §4.4 — LE BADGE EST UN LIEN, IL N'EST PAS UN CHAMP
 * ─────────────────────────────────────────────────────────────────────────────
 * Il mène aux missions du compte qui portent ces signatures. Le compte se
 * CALCULE là-bas et s'y corrige — pas ici.
 *
 * ⚠️ L'index est lu par LIGNE et non passé en `prop` : la clé de cache est celle
 * de l'espace, donc vingt-cinq lignes font UNE requête. Un `prop` obligerait la
 * liste des contacts à connaître un agrégat de missions pour le redistribuer.
 */
export function ContactSignedMissionsBadge({ contactId }: { contactId: string }) {
  const { t } = useTranslation('contacts')
  const signed = useContactSignedMissionsIndex().get(contactId)

  // Rien de signé : pas de badge. Pas un badge à zéro, pas un badge grisé —
  // rien. L'absence de badge EST l'information « c'est encore un prospect ».
  if (!signed) return null

  return (
    <PropagatedBlock source={signed.source} className="shrink-0">
      <Badge
        variant="outline"
        title={t('propagation.signedMissionsTitle')}
        className="shrink-0 gap-1 px-1 py-0 text-xs text-[var(--bellum-text-accent)]"
      >
        {t('propagation.signedMissions', { count: signed.signedMissions })}
      </Badge>
    </PropagatedBlock>
  )
}
