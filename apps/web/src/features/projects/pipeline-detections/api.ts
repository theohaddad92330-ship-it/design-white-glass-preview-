import type { PipelineDetection, PipelineDetectionList } from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { projectQueryKeys } from '../api'

/** #4016 L6 — le pipe « détecté, à revoir ». */
const pipelineDetectionKeys = {
  list: () => ['pipeline-detections'] as const,
}

const pipelineDetectionsApi = {
  list(): Promise<PipelineDetectionList> {
    return apiFetch<PipelineDetectionList>({ path: '/pipeline-detections' })
  },
  confirm(id: string): Promise<PipelineDetection> {
    return apiFetch<PipelineDetection>({ path: `/pipeline-detections/${id}/confirm`, method: 'POST' })
  },
  dismiss(id: string): Promise<PipelineDetection> {
    return apiFetch<PipelineDetection>({ path: `/pipeline-detections/${id}/dismiss`, method: 'POST' })
  },
}

export function usePipelineDetections() {
  return useQuery({ queryKey: pipelineDetectionKeys.list(), queryFn: pipelineDetectionsApi.list })
}

/** Confirmer peut OUVRIR une affaire ou POSITIONNER un profil : le pipe et les positionnements se relisent. */
export function useConfirmPipelineDetection() {
  const qc = useQueryClient()
  return useMutation<PipelineDetection, Error, string>({
    mutationFn: id => pipelineDetectionsApi.confirm(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pipelineDetectionKeys.list() })
      qc.invalidateQueries({ queryKey: projectQueryKeys.all })
      qc.invalidateQueries({ queryKey: ['opportunities'] })
      qc.invalidateQueries({ queryKey: ['submissions'] })
      toast.success(i18n.t('projects:detections.confirmed'))
    },
    onError: () => toast.error(i18n.t('projects:detections.error')),
  })
}

export function useDismissPipelineDetection() {
  const qc = useQueryClient()
  return useMutation<PipelineDetection, Error, string>({
    mutationFn: id => pipelineDetectionsApi.dismiss(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pipelineDetectionKeys.list() })
      toast.success(i18n.t('projects:detections.dismissed'))
    },
    onError: () => toast.error(i18n.t('projects:detections.error')),
  })
}
