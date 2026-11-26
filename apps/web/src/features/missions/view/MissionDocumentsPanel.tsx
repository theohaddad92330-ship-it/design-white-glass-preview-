import { useState } from 'react'
import type { MissionDocumentKind, MissionDocumentStatus } from '@bellum/contracts'
import { MISSION_DOCUMENT_KINDS, MISSION_DOCUMENT_STATUSES } from '@bellum/contracts'
import { Box, Button, Input, SelectField, Text } from '@bellum/ui'
import { FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCreateMissionDocument, useMissionDocuments, useUpdateMissionDocumentStatus } from '../api'

/**
 * #2193.51 (épopée #2953) — Section « Documents » du dossier mission :
 * contrat signé, avenant, NDA — distinct de `ProjectDocumentsPanel`
 * (#2171.24, au niveau de l'AFFAIRE). Voir le docblock de
 * `MissionDocumentsService` (API) : AUCUN fichier joint dans cette tranche —
 * kind/name/status seulement, la plus petite tranche prouvable.
 */
export function MissionDocumentsPanel({ missionId }: { missionId: string }) {
  const { t } = useTranslation('missions')
  const { items, isLoading, isError } = useMissionDocuments(missionId)
  const createDocument = useCreateMissionDocument(missionId)
  const updateStatus = useUpdateMissionDocumentStatus(missionId)
  const [kind, setKind] = useState<MissionDocumentKind>(MISSION_DOCUMENT_KINDS[0])
  const [name, setName] = useState('')

  function addDocument() {
    const trimmed = name.trim()
    if (!trimmed) return
    createDocument.mutate({ kind, name: trimmed }, { onSuccess: () => setName('') })
  }

  return (
    <Box className="space-y-2" data-anchor="mission-documents">
      <Box display="flex" className="items-center gap-2">
        <FileText className="size-4 text-muted-foreground" aria-hidden />
        <Text element="h4" size="sm" weight="medium">
          {t('documents.title')}
        </Text>
      </Box>

      <Box className="flex flex-col gap-2">
        {isError ? (
          <Box className="rounded-md border border-dashed border-destructive/40 p-3">
            <Text size="sm" color="text-muted-foreground">
              {t('documents.readError')}
            </Text>
          </Box>
        ) : isLoading ? (
          <Text size="sm" color="text-muted-foreground">
            {t('common:states.loading')}
          </Text>
        ) : items.length === 0 ? (
          <Box className="rounded-md border border-dashed border-border p-3">
            <Text size="sm" color="text-muted-foreground">
              {t('documents.empty')}
            </Text>
          </Box>
        ) : (
          items.map(document => (
            <Box
              key={document.id}
              display="flex"
              data-testid="mission-document-row"
              className="flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card p-2.5 pointer-coarse:min-h-11"
            >
              <Box className="min-w-0">
                <Text element="span" size="sm" weight="medium">
                  {t(`documents.kind.${document.kind}`)}
                </Text>
                <Text element="span" size="xs" className="mt-0.5 block truncate text-muted-foreground">
                  {document.name}
                </Text>
              </Box>
              <SelectField
                ariaLabel={t('documents.statusAria', { name: document.name })}
                value={document.status}
                onChange={value =>
                  updateStatus.mutate({ documentId: document.id, status: value as MissionDocumentStatus })
                }
                options={MISSION_DOCUMENT_STATUSES.map(status => ({
                  value: status,
                  label: t(`documents.status.${status}`),
                }))}
                size="sm"
                className="w-36"
              />
            </Box>
          ))
        )}
      </Box>

      <Box display="flex" className="flex-wrap gap-2">
        <SelectField
          ariaLabel={t('documents.kindAria')}
          value={kind}
          onChange={value => setKind(value as MissionDocumentKind)}
          options={MISSION_DOCUMENT_KINDS.map(value => ({ value, label: t(`documents.kind.${value}`) }))}
          size="sm"
          className="w-36"
        />
        <Input
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder={t('documents.addPlaceholder')}
          aria-label={t('documents.addAria')}
          className="min-w-40 flex-1 pointer-coarse:min-h-11"
          onKeyDown={event => {
            if (event.key === 'Enter') addDocument()
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="pointer-coarse:min-h-11"
          disabled={name.trim().length === 0 || createDocument.isPending}
          onClick={addDocument}
        >
          {t('documents.add')}
        </Button>
      </Box>
    </Box>
  )
}
