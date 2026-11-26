import type {
  AdminDocsCredentials,
  AdminDocsProvider,
  AdminDocsStatus,
  PendingSignature,
  ProposalSignatureStatus,
  UnpaidInvoice,
} from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

/**
 * Signature électronique et facturation.
 *
 * Le module existait côté serveur depuis le 03/08 sans aucun écran : ses
 * identifiants ne pouvaient être posés par personne, donc la capacité était
 * livrée et morte. Lecture + envoi à signature d'une demande DÉJÀ préparée chez
 * le fournisseur — Bellum ne signe rien et ne paie rien.
 *
 * ⚠️ Le deuxième temps du même défaut, corrigé le 29/08 : l'écran de connexion
 * a été livré, mais les deux routes de LECTURE — `/admin-docs/signatures` et
 * `/admin-docs/invoices`, servies depuis le premier jour — n'ont jamais eu
 * d'appelant. On déposait donc ses clés, la carte disait « connecté », et rien
 * n'apparaissait jamais : « connecté d'un côté, pas de donnée de l'autre ».
 */

/** Ce que rend une route de lecture : ce qu'on a vu, ET qui n'a pas répondu. */
type AdminDocsReading<T> = { items: T[]; unavailable: AdminDocsProvider[] }

export const adminDocsApi = {
  status(): Promise<AdminDocsStatus> {
    return apiFetch<AdminDocsStatus>({ path: '/admin-docs/status' })
  },
  connect(body: AdminDocsCredentials): Promise<AdminDocsStatus> {
    return apiFetch<AdminDocsStatus>({ path: '/admin-docs/connect', method: 'POST', body })
  },
  disconnect(provider: AdminDocsProvider): Promise<void> {
    return apiFetch<void>({ path: `/admin-docs/${provider}`, method: 'DELETE' })
  },
  signatures(): Promise<AdminDocsReading<PendingSignature>> {
    return apiFetch<AdminDocsReading<PendingSignature>>({ path: '/admin-docs/signatures' })
  },
  proposalSignature(projectId: string): Promise<ProposalSignatureStatus> {
    return apiFetch<ProposalSignatureStatus>({ path: `/admin-docs/signatures/proposal/${projectId}` })
  },
  invoices(): Promise<AdminDocsReading<UnpaidInvoice>> {
    return apiFetch<AdminDocsReading<UnpaidInvoice>>({ path: '/admin-docs/invoices' })
  },
}

export const ADMIN_DOCS_STATUS_KEY = ['admin-docs', 'status'] as const

export function useAdminDocsStatus() {
  return useQuery({ queryKey: ADMIN_DOCS_STATUS_KEY, queryFn: adminDocsApi.status, staleTime: 60_000 })
}

/**
 * Les deux lectures, ARMÉES par la présence d'au moins un outil branché.
 *
 * `enabled` n'est pas une optimisation : sans outil connecté le serveur rendrait
 * une liste vide, et l'écran écrirait « rien n'attend de signature » alors que
 * la vérité est « tu n'as branché aucun outil de signature ». Ce sont deux
 * phrases différentes, et c'est tout l'objet de ce chantier. Zéro appel réseau
 * tant que rien n'est branché — même règle que « sans clé = no-op strict ».
 */
export function useAdminDocsSignatures(enabled: boolean) {
  return useQuery({
    queryKey: ['admin-docs', 'signatures'],
    queryFn: adminDocsApi.signatures,
    enabled,
    // Une lecture chez quatre fournisseurs coûte jusqu'à 8 s de budget : on ne la
    // rejoue pas à chaque montage de l'écran Intégrations.
    staleTime: 120_000,
  })
}

/**
 * #4295.27 — le statut de LA demande de signature d'une proposition (celle retenue à l'envoi), armé à la main :
 * rien n'est lu chez l'outil avant le clic. Jamais la liste de tout le compte outil.
 */
export function useProposalSignatureStatus(projectId: string | undefined) {
  return useQuery({
    queryKey: ['admin-docs', 'proposal-signature', projectId],
    queryFn: () => adminDocsApi.proposalSignature(projectId as string),
    enabled: false,
    staleTime: 0,
  })
}

export function useAdminDocsInvoices(enabled: boolean) {
  return useQuery({
    queryKey: ['admin-docs', 'invoices'],
    queryFn: adminDocsApi.invoices,
    enabled,
    staleTime: 120_000,
  })
}

export function useConnectAdminDocs() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: adminDocsApi.connect,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_DOCS_STATUS_KEY })
      // Les deux lectures suivent le branchement : sans ces lignes, la carte
      // resterait vide juste après une connexion réussie — l'écran exact que ce
      // chantier corrige.
      void queryClient.invalidateQueries({ queryKey: ['admin-docs', 'signatures'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-docs', 'invoices'] })
      // Le registre décide de l'état affiché sur la carte : sans cette
      // invalidation elle resterait « à brancher » jusqu'au prochain chargement.
      void queryClient.invalidateQueries({ queryKey: ['tool-registry'] })
      // Deux routines dépendent de ces outils (relances de signature, factures
      // en retard) : leur écran doit cesser d'annoncer une capacité manquante.
      void queryClient.invalidateQueries({ queryKey: ['routines'] })
    },
  })
}

export function useDisconnectAdminDocs() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: adminDocsApi.disconnect,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_DOCS_STATUS_KEY })
      // Les deux lectures suivent le branchement : sans ces lignes, la carte
      // resterait vide juste après une connexion réussie — l'écran exact que ce
      // chantier corrige.
      void queryClient.invalidateQueries({ queryKey: ['admin-docs', 'signatures'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-docs', 'invoices'] })
      void queryClient.invalidateQueries({ queryKey: ['tool-registry'] })
      void queryClient.invalidateQueries({ queryKey: ['routines'] })
    },
  })
}
