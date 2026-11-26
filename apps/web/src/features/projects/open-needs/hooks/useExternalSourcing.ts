import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ExternalSourcingImportInput,
  ExternalSourcingPartnerBriefFeedbackInput,
  ExternalSourcingPartnerBriefPrepareInput,
  ExternalSourcingSourceKind,
} from '@bellum/contracts'
import { externalSourcingApi } from '../api'

/**
 * #2818 — « Chercher hors vivier ». `enabled` porte le CLIC : contrairement à
 * `useReverseProspects` (auto-chargée), cette recherche part d'un geste
 * explicite — voir `NeedExternalSourcing.tsx`.
 *
 * `maxPerSource` — le volume choisi AVANT LANCEMENT (#2190.12) : dans la clé
 * de requête, un changement de volume après un premier lancement redéclenche
 * une recherche plutôt que de rendre un résultat mis en cache pour un autre
 * volume.
 */
export function useExternalSourcingSearch(needId: string, enabled: boolean, maxPerSource?: number) {
  return useQuery({
    queryKey: ['open-needs', 'external-sourcing', needId, maxPerSource],
    queryFn: () => externalSourcingApi.search(needId, maxPerSource),
    enabled: enabled && needId.length > 0,
  })
}

/** Le geste d'import : une fiche déjà dans l'espace, OU un profil de l'annuaire
 *  externe (la fiche se crée à ce geste). `consent` est posé ici, jamais par
 *  l'appelant — voir la case à cocher de `NeedExternalSourcing.tsx`. */
type ExternalSourcingImportGesture =
  | { consultantId: string; sourceKind: ExternalSourcingSourceKind }
  | { sourceKind: 'external_directory'; externalProfile: ExternalDirectoryProfile }

type ExternalDirectoryProfile = Extract<ExternalSourcingImportInput, { externalProfile: unknown }>['externalProfile']

/**
 * L'import d'un profil externe vers le vivier — jamais sans le consentement
 * explicite du geste (voir `NeedExternalSourcing.tsx`, la case à cocher avant
 * le bouton). Invalide la recherche : une fiche importée sort de la liste des
 * pistes, elle est désormais du vivier.
 */
export function useImportExternalSourcingCandidate(needId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ExternalSourcingImportGesture) =>
      externalSourcingApi.import(needId, { ...input, consent: true }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['open-needs', 'external-sourcing', needId] })
    },
  })
}

const partnerBriefsKey = (needId: string) => ['open-needs', 'external-sourcing', needId, 'partner-briefs'] as const

/** Les briefs déjà préparés pour ce besoin — jamais chargés seuls, montés dans
 *  le panneau « Partager le brief à un partenaire » (voir `NeedExternalSourcing.tsx`). */
export function useExternalSourcingPartnerBriefs(needId: string) {
  return useQuery({
    queryKey: partnerBriefsKey(needId),
    queryFn: () => externalSourcingApi.listPartnerBriefs(needId),
    enabled: needId.length > 0,
  })
}

/**
 * Le brief se PRÉPARE — il ne s'envoie jamais (doctrine, voir le docblock de
 * `external-sourcing.ts`, `@bellum/contracts`). Le commercial partage le texte
 * lui-même, hors produit.
 */
export function useExternalSourcingPreparePartnerBrief(needId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ExternalSourcingPartnerBriefPrepareInput) =>
      externalSourcingApi.preparePartnerBrief(needId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: partnerBriefsKey(needId) })
    },
  })
}

/** Le retour du partenaire — saisi par un humain, jamais déduit. */
export function useExternalSourcingRecordPartnerBriefFeedback(needId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ briefId, ...input }: ExternalSourcingPartnerBriefFeedbackInput & { briefId: string }) =>
      externalSourcingApi.recordPartnerBriefFeedback(needId, briefId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: partnerBriefsKey(needId) })
    },
  })
}
