import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { PriorityGate } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { accountKeys } from '@/features/accounts/api'
import { i18n } from '@/i18n'
import { formatDate } from '@/lib/locale'

type GateResult = {
  id: string
  priority_gate: PriorityGate
  gate_reason: string | null
  gate_decided_at: string | null
  /**
   * Renseigné UNIQUEMENT quand cette transition rouvre un compte écarté — le
   * seul moment où le motif du refus qu'on referme est encore lisible, juste
   * avant que le serveur ne l'efface (`AccountGateService.decide`). Absent sur
   * toute autre transition. `previousReason` vaut `null` quand le compte avait
   * été écarté SANS motif enregistré (le champ est facultatif côté serveur) —
   * jamais une raison inventée pour combler le vide.
   */
  reopening?: { previousReason: string | null; previousDecidedAt: string | null }
}

/**
 * Le rappel du motif qu'on referme, formulé comme un FAIT DATÉ — jamais comme
 * un état courant du compte. Le serveur efface `gate_reason`/`gate_decided_at`
 * au moment même de la réouverture (par design : les traîner afficherait
 * « hors cible » à côté d'un compte redevenu à qualifier), donc ce texte n'a
 * qu'une occasion d'exister — ce toast, une fois, au moment du geste.
 *
 * Sans date lisible, on ne peut pas honnêtement écrire « écarté le » : le
 * rappel se tait plutôt que d'inventer un « quand ». En pratique le serveur
 * horodate toute décision (`gate_decided_at = new Date()`), donc ce cas ne
 * survient pas sur le chemin réel — il reste géré pour ne jamais risquer une
 * date fausse.
 */
function reopeningFact(reopening: GateResult['reopening']): string | undefined {
  if (!reopening) return undefined
  const date = formatDate(reopening.previousDecidedAt)
  if (!date) return undefined
  return reopening.previousReason
    ? i18n.t('accounts:gate.reopening.withReason', { date, reason: reopening.previousReason })
    : i18n.t('accounts:gate.reopening.withoutReason', { date })
}

/** Les motifs d'écartement de l'espace : les siens d'abord, les propositions
 *  ensuite. PROPOSÉS, jamais imposés — une liste fermée pousse à cocher
 *  « Autre », qui n'apprend rien. */
export function useParkReasons() {
  return useQuery({
    queryKey: ['accounts', 'park-reasons', i18n.language],
    queryFn: () =>
      apiFetch<{ items: { label: string; used: boolean }[] }>({
        path: `/accounts/gate/park-reasons?lang=${i18n.language.startsWith('en') ? 'en' : 'fr'}`,
      }),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * La porte G1 : ce compte entre au portefeuille, ou il en sort.
 *
 * #2116.40 — le message de succès NOMME le compte. « Écarté. Il ne reviendra
 * plus dans Découvrir. » ne disait pas QUI venait d'être écarté : sur une
 * liste de comptes, c'est précisément ce qu'on voulait relire. Le nom arrive
 * donc par l'appelant (`AccountGateControl`), qui l'a ; le déduire d'une
 * requête ici ferait un appel réseau pour un toast.
 */
export function useDecideAccountGate(accountId: string, companyName?: string | null) {
  const qc = useQueryClient()
  return useMutation<GateResult, Error, { gate: PriorityGate; reason?: string | null }>({
    mutationFn: body =>
      apiFetch<GateResult, { gate: PriorityGate; reason: string | null }>({
        path: `/accounts/${accountId}/gate`,
        method: 'PATCH',
        body: { gate: body.gate, reason: body.reason ?? null },
      }),
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
      qc.invalidateQueries({ queryKey: accountKeys.all })
      qc.invalidateQueries({ queryKey: ['accounts', 'park-reasons'] })
      // Registre « succès » : rouvrir un compte est un geste réussi, pas un
      // avertissement — le rappel du motif est un fait à connaître, pas une
      // erreur. Il voyage dans la DESCRIPTION du même toast plutôt que dans un
      // second message, pour rester secondaire au titre qui dit ce qui vient
      // de se passer.
      const description = reopeningFact(result.reopening)
      // #2116.40 — sans nom lisible, le repli est le MÊME libellé générique que
      // l'export PDF, et volontairement la même clé : deux façons d'écrire
      // « le compte » divergeraient à la première relecture.
      const company = companyName?.trim() || i18n.t('accounts:pdf.fallbackAccountName')
      toast.success(
        i18n.t(`accounts:gate.done.${result.priority_gate}`, { company }),
        description ? { description } : undefined,
      )
    },
    onError: error => {
      toast.error(i18n.t('accounts:gate.failed'), { description: error.message })
    },
  })
}
