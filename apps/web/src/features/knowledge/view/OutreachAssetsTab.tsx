import { useCallback, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { Loader2, Paperclip, Pencil, Plus, Trash2, X } from 'lucide-react'
import { MOTION, SelectField } from '@bellum/ui'
import {
  EMAIL_ATTACHMENT_ACCEPT,
  EMAIL_ATTACHMENT_MAX_TOTAL_BYTES,
  OUTREACH_ASSET_CATEGORIES,
  OUTREACH_ASSET_USAGE_RIGHTS,
  type OutreachAsset,
  type OutreachAssetCategory,
  type OutreachAssetUsageRights,
} from '@bellum/contracts'
import {
  useAttachOutreachAssetFile,
  useCreateOutreachAsset,
  useDeleteOutreachAsset,
  useDetachOutreachAssetFile,
  useOutreachAssets,
  useUpdateOutreachAsset,
} from '@/features/outreach-assets/hooks/useOutreachAssets'
import { fileToBase64 } from '@/features/consultants/lib/fileToBase64'
import { formatBytes } from '@/features/expenses/presentation'

/**
 * #2838 — le catalogue d'assets outreach : lecture, création, édition et
 * suppression. #3699.6 — chaque asset peut porter son fichier RÉEL : c'est la
 * bibliothèque de documents que le commercial choisit de joindre à un e-mail.
 */
export function OutreachAssetsTab() {
  const { t } = useTranslation('knowledge')
  const { data, isLoading, isError } = useOutreachAssets()
  const createAsset = useCreateOutreachAsset()
  const updateAsset = useUpdateOutreachAsset()
  const deleteAsset = useDeleteOutreachAsset()
  const rows = data ?? []

  const [editor, setEditor] = useState<{ item: OutreachAsset | null } | null>(null)

  const handleSave = useCallback(
    async (input: {
      id: string | null
      title: string
      description: string
      category: OutreachAssetCategory
      usageRights: OutreachAssetUsageRights
    }) => {
      const title = input.title.trim()
      const description = input.description.trim() || null
      try {
        if (input.id) {
          await updateAsset.mutateAsync({
            id: input.id,
            patch: { title, description, category: input.category, usageRights: input.usageRights },
          })
          toast.success(t('assets.toast.updated'))
        } else {
          await createAsset.mutateAsync({
            title,
            description,
            category: input.category,
            usageRights: input.usageRights,
          })
          toast.success(t('assets.toast.created'))
        }
        setEditor(null)
      } catch (err) {
        console.error('[OutreachAssetsTab]', err)
        toast.error(t('assets.toast.saveFailed'))
      }
    },
    [createAsset, updateAsset, t],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteAsset.mutateAsync(id)
        toast.success(t('assets.toast.deleted'))
      } catch (err) {
        console.error('[OutreachAssetsTab]', err)
        toast.error(t('assets.toast.deleteFailed'))
      }
    },
    [deleteAsset, t],
  )

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={() => setEditor({ item: null })}
          className="flex items-center gap-2 h-9 px-4 rounded-md text-sm font-medium text-white transition-opacity"
          style={{ background: 'var(--violet-gradient)' }}
        >
          <Plus className="h-4 w-4" />
          {t('assets.newButton')}
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--text-ghost)' }} />
        </div>
      ) : isError ? (
        <p className="py-16 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          {t('assets.errorState')}
        </p>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          {t('assets.empty')}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map(asset => (
            <div
              key={asset.id}
              className="rounded-xl p-4 flex flex-col gap-2"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
            >
              <div className="flex items-start justify-between">
                <Paperclip className="h-[18px] w-[18px]" style={{ color: 'var(--text-muted)' }} />
                <div className="flex items-center gap-1 -mr-1 -mt-1">
                  <button
                    type="button"
                    onClick={() => setEditor({ item: asset })}
                    aria-label={t('assets.editAria', { title: asset.title })}
                    className="flex h-11 w-11 items-center justify-center rounded-sm transition-colors"
                    style={{ color: 'var(--text-ghost)' }}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(asset.id)}
                    aria-label={t('assets.deleteAria', { title: asset.title })}
                    className="flex h-11 w-11 items-center justify-center rounded-sm transition-colors"
                    style={{ color: 'var(--text-ghost)' }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="text-sm font-medium text-[color:var(--text-primary)]">{asset.title}</p>
              {asset.description && (
                <p className="text-xs" style={{ color: 'var(--text-ghost)' }}>
                  {asset.description}
                </p>
              )}
              <OutreachAssetFileLine asset={asset} />
              <div className="flex items-center gap-2 mt-auto pt-2">
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {t(`assets.category.${asset.category}`)}
                </span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {t(`assets.usageRights.${asset.usageRights}`)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {editor && (
        <OutreachAssetEditorModal
          item={editor.item}
          saving={createAsset.isPending || updateAsset.isPending}
          onCancel={() => setEditor(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

const EDITOR_INPUT_STYLE = {
  background: 'var(--bg-glass)',
  border: '1px solid var(--bg-glass-border)',
  color: 'var(--text-primary)',
} as const

type OutreachAssetEditorModalProps = {
  item: OutreachAsset | null
  saving: boolean
  onCancel: () => void
  onSave: (input: {
    id: string | null
    title: string
    description: string
    category: OutreachAssetCategory
    usageRights: OutreachAssetUsageRights
  }) => void
}

function OutreachAssetEditorModal({ item, saving, onCancel, onSave }: OutreachAssetEditorModalProps) {
  const { t } = useTranslation('knowledge')
  const titleId = useId()
  const descriptionId = useId()
  const [title, setTitle] = useState(item?.title ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [category, setCategory] = useState<OutreachAssetCategory>(item?.category ?? OUTREACH_ASSET_CATEGORIES[0])
  const [usageRights, setUsageRights] = useState<OutreachAssetUsageRights>(
    item?.usageRights ?? OUTREACH_ASSET_USAGE_RIGHTS[0],
  )

  const canSave = title.trim().length > 0 && !saving

  return (
    <motion.div
      key="outreach-asset-editor-overlay"
      initial={MOTION.reveal.initial}
      animate={MOTION.reveal.animate}
      exit={MOTION.reveal.exit}
      transition={MOTION.reveal.transition}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={MOTION.enterFromBelow.initial}
        animate={MOTION.enterFromBelow.animate}
        exit={MOTION.enterFromBelow.exit}
        transition={MOTION.enterFromBelow.transition}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-2xl p-6"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label={t('close')}
          className="absolute right-4 top-4 rounded-sm p-1 transition-colors"
          style={{ color: 'var(--text-ghost)' }}
        >
          <X className="h-4 w-4" />
        </button>
        <h3 className="text-base font-semibold text-[color:var(--text-primary)] mb-4 pr-8">
          {item ? t('assets.editor.editTitle') : t('assets.editor.newTitle')}
        </h3>

        <div className="space-y-3">
          <div>
            <label htmlFor={titleId} className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {t('assets.editor.titleLabel')}
            </label>
            <input
              id={titleId}
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t('assets.editor.titlePlaceholder')}
              className="mt-1 w-full h-9 rounded-sm px-3 text-sm focus:outline-none"
              style={EDITOR_INPUT_STYLE}
            />
          </div>

          <div>
            <label htmlFor={descriptionId} className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {t('assets.editor.descriptionLabel')}
            </label>
            <input
              id={descriptionId}
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('assets.editor.descriptionPlaceholder')}
              className="mt-1 w-full h-9 rounded-sm px-3 text-sm focus:outline-none"
              style={EDITOR_INPUT_STYLE}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                {t('assets.editor.categoryLabel')}
              </label>
              <SelectField
                value={category}
                onChange={next => setCategory(next as OutreachAssetCategory)}
                options={OUTREACH_ASSET_CATEGORIES.map(value => ({ value, label: t(`assets.category.${value}`) }))}
                ariaLabel={t('assets.editor.categoryLabel')}
                className="mt-1 w-full"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                {t('assets.editor.usageRightsLabel')}
              </label>
              <SelectField
                value={usageRights}
                onChange={next => setUsageRights(next as OutreachAssetUsageRights)}
                options={OUTREACH_ASSET_USAGE_RIGHTS.map(value => ({
                  value,
                  label: t(`assets.usageRights.${value}`),
                }))}
                ariaLabel={t('assets.editor.usageRightsLabel')}
                className="mt-1 w-full"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="h-9 px-4 rounded-md text-sm font-medium transition-colors"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            {t('common:actions.cancel')}
          </button>
          <button
            onClick={() => onSave({ id: item?.id ?? null, title, description, category, usageRights })}
            disabled={!canSave}
            className="flex items-center gap-2 h-9 px-4 rounded-md text-sm font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: 'var(--violet-gradient)' }}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {item ? t('common:actions.save') : t('common:actions.create')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/**
 * #3699.6 — le fichier réel d'un asset : déposé, nommé (nom · taille), retiré.
 * Le type et la taille se contrôlent ICI d'abord (le réglage unique des
 * contrats), puis le serveur re-vérifie extension, signature et quota.
 */
function OutreachAssetFileLine({ asset }: { asset: OutreachAsset }) {
  const { t } = useTranslation('knowledge')
  const inputId = useId()
  const attach = useAttachOutreachAssetFile()
  const detach = useDetachOutreachAssetFile()
  const busy = attach.isPending || detach.isPending

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > EMAIL_ATTACHMENT_MAX_TOTAL_BYTES) {
      toast.error(t('assets.file.tooLarge', { max: formatBytes(EMAIL_ATTACHMENT_MAX_TOTAL_BYTES) }))
      return
    }
    try {
      const fileB64 = await fileToBase64(file)
      await attach.mutateAsync({ id: asset.id, upload: { fileName: file.name, contentType: file.type, fileB64 } })
      toast.success(t('assets.file.attached'))
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t('assets.file.attachFailed'))
    }
  }

  const onRemove = async () => {
    try {
      await detach.mutateAsync(asset.id)
      toast.success(t('assets.file.removed'))
    } catch {
      toast.error(t('assets.file.removeFailed'))
    }
  }

  if (asset.file) {
    return (
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span className="min-w-0 flex-1 truncate">
          {asset.file.fileName} · {formatBytes(asset.file.byteSize)}
        </span>
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          aria-label={t('assets.file.removeAria', { title: asset.title })}
          className="flex h-11 w-11 items-center justify-center rounded-sm"
          style={{ color: 'var(--text-ghost)' }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="text-xs">
      <label
        htmlFor={inputId}
        className="inline-flex min-h-11 cursor-pointer items-center gap-1 underline"
        style={{ color: 'var(--text-muted)' }}
      >
        {busy ? t('assets.file.uploading') : t('assets.file.attach')}
      </label>
      <input
        id={inputId}
        type="file"
        accept={EMAIL_ATTACHMENT_ACCEPT}
        className="sr-only"
        disabled={busy}
        onChange={event => {
          void onFile(event.target.files?.[0])
          event.target.value = ''
        }}
      />
    </div>
  )
}
