import type {
  AccountEntity,
  AdvDossier,
  AdvDossiersPage,
  AdvDossiersQuery,
  UpdateAdvDossierInput,
} from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

/**
 * Les clés de cache de l'ADV.
 *
 * ⚠️ Les filtres entrent dans la CLÉ, tous. Sans eux, la file filtrée par
 * « bon de commande manquant » et la file entière partageraient une entrée : le
 * premier écran ouvert déciderait de ce que le second affiche — un tableau
 * filtré qui montre tout, ou l'inverse. C'est le même défaut que `missionKeys`
 * a déjà payé.
 *
 * Elles s'IMPORTENT, elles ne se recopient pas : une clé réécrite à la main
 * dérive au premier filtre ajouté, et l'invalidation cesse silencieusement de
 * mordre.
 */
export const advKeys = {
  all: ['adv'] as const,
  /** Les entités d'UN compte — la liste dans laquelle on désigne celle qui
   *  facture. L'identifiant entre dans la clé : sans lui, le compte A et le
   *  compte B se partageraient une entrée de cache. */
  entities: (accountId: string) => ['adv', 'entities', accountId] as const,
  dossiers: (query: AdvDossiersQuery = {}) =>
    ['adv', 'dossiers', query.month ?? 'current', query.tile ?? 'all', query.blocker ?? 'any', query.q ?? ''] as const,
}

function toSearch(query: AdvDossiersQuery): string {
  const params = new URLSearchParams()
  if (query.month) params.set('month', query.month)
  if (query.tile) params.set('tile', query.tile)
  if (query.blocker) params.set('blocker', query.blocker)
  if (query.q) params.set('q', query.q)
  const search = params.toString()
  return search ? `?${search}` : ''
}

export const advApi = {
  dossiers(query: AdvDossiersQuery = {}): Promise<AdvDossiersPage> {
    return apiFetch<AdvDossiersPage>({ path: `/adv/dossiers${toSearch(query)}` })
  },
  update(missionId: string, input: UpdateAdvDossierInput): Promise<AdvDossier> {
    return apiFetch<AdvDossier, UpdateAdvDossierInput>({
      path: `/adv/dossiers/${missionId}`,
      method: 'PATCH',
      body: input,
    })
  },
  /**
   * L'export, récupéré par le client authentifié.
   *
   * Une balise `<a href>` nue partirait SANS cookie de session et rendrait un
   * 401 que l'utilisateur ouvrirait comme un fichier vide.
   */
  exportCsv(query: AdvDossiersQuery = {}): Promise<string> {
    return apiFetch<string>({ path: `/adv/dossiers/export.csv${toSearch(query)}`, responseType: 'text' })
  },
  /**
   * Les entités de facturation d'un compte — LUES sur l'endpoint qui existe
   * déjà (`GET /accounts/:id/entities`). L'ADV désigne, elle ne crée pas :
   * une entité se crée sur la fiche du compte, là où elle vit.
   */
  entities(accountId: string): Promise<{ items: AccountEntity[] }> {
    return apiFetch<{ items: AccountEntity[] }>({ path: `/accounts/${accountId}/entities` })
  },
}

export function useAccountEntities(accountId: string | null) {
  return useQuery({
    queryKey: advKeys.entities(accountId ?? 'none'),
    queryFn: () => advApi.entities(accountId as string),
    enabled: Boolean(accountId),
  })
}

export function useAdvDossiers(query: AdvDossiersQuery = {}) {
  return useQuery({
    queryKey: advKeys.dossiers(query),
    queryFn: () => advApi.dossiers(query),
  })
}

/**
 * La correction d'un dossier.
 *
 * Invalide TOUTE la famille `adv` et pas la seule clé courante : une référence
 * saisie change le résumé, les pastilles et la file — y compris celles des
 * filtres qu'on n'a pas sous les yeux. N'invalider que la vue courante
 * laisserait des compteurs périmés derrière le prochain clic.
 */
export function useUpdateAdvDossier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ missionId, input }: { missionId: string; input: UpdateAdvDossierInput }) =>
      advApi.update(missionId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: advKeys.all })
    },
  })
}
