import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateOutreachAsset, OutreachAsset, StorageUploadInput, UpdateOutreachAsset } from '@bellum/contracts'
import { outreachAssetsApi } from '@/features/outreach-assets/api'
import { useSession } from '@/lib/hooks/use-session'

const outreachAssetsKey = (userId?: string) => ['outreach-assets', userId] as const

/** Le catalogue d'assets outreach de l'espace (#2838). Seedé côté serveur au premier appel. */
export function useOutreachAssets() {
  const { user } = useSession()
  return useQuery<OutreachAsset[]>({
    queryKey: outreachAssetsKey(user?.id),
    queryFn: () => outreachAssetsApi.list(),
    enabled: !!user,
    staleTime: 30_000,
  })
}

export function useCreateOutreachAsset() {
  const { user } = useSession()
  const qc = useQueryClient()
  return useMutation<OutreachAsset, Error, CreateOutreachAsset>({
    mutationFn: input => outreachAssetsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: outreachAssetsKey(user?.id) }),
  })
}

export function useUpdateOutreachAsset() {
  const { user } = useSession()
  const qc = useQueryClient()
  return useMutation<OutreachAsset, Error, { id: string; patch: UpdateOutreachAsset }>({
    mutationFn: ({ id, patch }) => outreachAssetsApi.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: outreachAssetsKey(user?.id) }),
  })
}

export function useDeleteOutreachAsset() {
  const { user } = useSession()
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: id => outreachAssetsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: outreachAssetsKey(user?.id) }),
  })
}

/** #3699.6 — dépose le fichier réel d'un asset (la bibliothèque de documents attachables). */
export function useAttachOutreachAssetFile() {
  const { user } = useSession()
  const qc = useQueryClient()
  return useMutation<OutreachAsset, Error, { id: string; upload: StorageUploadInput }>({
    mutationFn: ({ id, upload }) => outreachAssetsApi.attachFile(id, upload),
    onSuccess: () => qc.invalidateQueries({ queryKey: outreachAssetsKey(user?.id) }),
  })
}

/** #3699.6 — retire le fichier d'un asset. */
export function useDetachOutreachAssetFile() {
  const { user } = useSession()
  const qc = useQueryClient()
  return useMutation<OutreachAsset, Error, string>({
    mutationFn: id => outreachAssetsApi.detachFile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: outreachAssetsKey(user?.id) }),
  })
}
