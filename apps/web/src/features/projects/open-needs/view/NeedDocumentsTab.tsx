import { NEED_DOCUMENT_STATUSES, type NeedDocumentStatus, type OpenNeedRow } from '@bellum/contracts'
import { Box, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useNeedDocuments } from '../hooks/useNeedDocuments'
import {
  NeedDocumentDeposit,
  useNeedDocumentFiles,
  useOpenNeedDocument,
  useUpdateNeedDocumentStatus,
} from './NeedDocumentsUpload'

/**
 * L'onglet DOCUMENTS d'une fiche besoin — devis, NDA, contrat cadre, et leur
 * statut (dossier du 26/08, image 02).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IL N'EST PLUS EN LECTURE SEULE (31/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Il l'était pour une bonne raison — « un bouton qui n'écrirait rien serait une
 * case décorative » — et c'était vrai tant que rien ne pouvait porter le
 * FICHIER. Le stockage existe : les deux gestes existent, déposer une pièce et
 * dire où elle en est. Le second sans le premier aurait été le défaut inverse :
 * un statut qu'on fait avancer sur un document que personne ne peut ouvrir.
 *
 * ⚠️ **La condition du bouton d'ouverture est la DÉTENTION des octets**, jamais
 * l'existence de la ligne : un document suivi sans fichier — une NDA qu'on
 * attend — n'offre rien à ouvrir, et le DIT. Un bouton qui n'ouvre rien est une
 * donnée fictive sous forme d'affordance.
 */
export function NeedDocumentsTab({ need }: { need: OpenNeedRow }) {
  const { t } = useTranslation('projects')
  const { items, isLoading, isError } = useNeedDocuments(need.id)
  const files = useNeedDocumentFiles(need.id)
  const open = useOpenNeedDocument()
  const changeStatus = useUpdateNeedDocumentStatus(need.id)

  if (isLoading) {
    return (
      <Text size="sm" className="text-[var(--bellum-text-muted)]">
        {t('needSheet.documents.loading')}
      </Text>
    )
  }

  if (isError) {
    return (
      <Box className="rounded-md border border-dashed border-destructive/40 p-4">
        <Text size="sm" className="text-[var(--bellum-text-muted)]">
          {t('needSheet.documents.readError')}
        </Text>
      </Box>
    )
  }

  return (
    <Box className="space-y-2">
      {items.length === 0 ? (
        <Box className="rounded-md border border-dashed border-border p-4">
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('needSheet.documents.empty')}
          </Text>
        </Box>
      ) : (
        items.map(document => {
          const file = files.byDocument.get(document.id)
          return (
            <Box
              key={document.id}
              display="flex"
              className="flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card p-3"
            >
              <div className="min-w-0">
                <Text element="span" size="sm" weight="medium">
                  {t(`needSheet.documents.kind.${document.kind}`)}
                </Text>
                <Text element="span" size="xs" className="mt-0.5 block truncate text-[var(--bellum-text-muted)]">
                  {document.name}
                </Text>
                {file ? (
                  <Text element="span" size="xs" className="mt-0.5 block text-[var(--bellum-text-muted)]">
                    {t('needSheet.documents.fileMeta', {
                      size: formatBytes(file.byteSize),
                      date: file.retentionUntil,
                    })}
                  </Text>
                ) : (
                  // ⚠️ Aucun bouton quand rien n'est stocké — et on le DIT.
                  // Le silence laisserait croire à un bouton qui n'a pas chargé.
                  <Text element="span" size="xs" className="mt-0.5 block text-[var(--bellum-text-muted)]">
                    {files.isError
                      ? // Un échec de LECTURE n'est pas une absence : dire
                        // « aucun fichier » ferait redéposer une pièce déjà là.
                        t('needSheet.documents.filesUnreadable')
                      : t('needSheet.documents.noFile')}
                  </Text>
                )}
              </div>
              <Box display="flex" className="items-center gap-2">
                {file ? (
                  <button
                    type="button"
                    className="min-h-11 text-left text-xs text-[var(--bellum-text-accent)] underline"
                    disabled={open.isPending}
                    onClick={() => open.mutate(file.downloadPath)}
                  >
                    {t('needSheet.documents.open', { name: document.name })}
                  </button>
                ) : null}
                {/* Le statut se CHANGE ici. Aucune transition n'est interdite :
                    un devis peut repartir en brouillon, une NDA « signée »
                    redevenir « en attente » parce que le client a renvoyé une
                    page — un automate aurait bloqué des corrections légitimes. */}
                <Select
                  value={document.status}
                  onValueChange={value =>
                    changeStatus.mutate({ documentId: document.id, status: value as NeedDocumentStatus })
                  }
                >
                  <SelectTrigger
                    aria-label={t('needSheet.documents.statusLabel', { name: document.name })}
                    className="h-11 w-36"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NEED_DOCUMENT_STATUSES.map(status => (
                      <SelectItem key={status} value={status}>
                        {t(`needSheet.documents.status.${status}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Box>
            </Box>
          )
        })
      )}

      <NeedDocumentDeposit needId={need.id} usedBytes={files.usedBytes} quotaBytes={files.quotaBytes} />
    </Box>
  )
}

/** Le poids d'un fichier, en unités lisibles. N'est appelé que sur un poids
 *  MESURÉ : un objet rangé a toujours été compté en s'écrivant. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
