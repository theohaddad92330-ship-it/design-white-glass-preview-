import { useState } from 'react'
import { Button, Text } from '@bellum/ui'
import { isEditableArtifactType, type ReplyBlock } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { chatArtifactApi } from '../api/chatArtifactApi'

type PlanBlock = Extract<ReplyBlock, { type: 'action_plan' }>

/** Les étapes d'un plan → un texte, une étape par ligne. */
function stepsToText(block: PlanBlock): string {
  return block.steps.map(step => step.label).join('\n')
}

/**
 * Les lignes → des étapes. Une étape dont le libellé existe déjà GARDE son
 * détail, son échéance, son responsable et son lien (jamais perdus en silence) ;
 * une étape neuve ne porte que son libellé. Une ligne vide disparaît.
 */
function textToBlock(text: string, previous: PlanBlock): PlanBlock {
  const known = new Map(previous.steps.map(step => [step.label, step]))
  const steps = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(label => known.get(label) ?? { label })
  return { ...previous, steps }
}

/**
 * #2429.9 (épopée #2852, lot P07 30/09) — LA VERSION D'UN ARTEFACT, ET LE GESTE
 * POUR LA MODIFIER. Sous un bloc : « Version N » quand il a été modifié (jamais
 * rien sur la version d'origine), et « Modifier » pour un plan. Enregistrer
 * écrit une NOUVELLE version ; l'originale reste le texte du message.
 *
 * Référence visuelle : `ConversationSummaryPanel.tsx` (édition en place d'un
 * texte, même `textarea`, mêmes boutons Enregistrer / Annuler).
 */
export function ArtifactVersionBar({
  artifactId,
  block,
  version,
  onSaved,
}: {
  artifactId: string
  block: ReplyBlock
  version: number
  onSaved: (next: { version: number; block: ReplyBlock }) => void
}) {
  const { t } = useTranslation('chat')
  const editable = block.type === 'action_plan' && isEditableArtifactType(block.type)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  if (!editable && version <= 1) return null
  const plan = editable ? (block as PlanBlock) : null

  async function save() {
    if (!plan) return
    setSaving(true)
    try {
      const saved = await chatArtifactApi.edit(artifactId, textToBlock(draft, plan))
      onSaved({ version: saved.version, block: saved.block })
      setEditing(false)
    } catch {
      toast.error(t('blocks.editFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (editing && plan) {
    const fieldId = `artifact-edit-${artifactId}`
    return (
      <div className="mt-2 flex flex-col gap-2">
        <label htmlFor={fieldId} className="text-xs font-medium text-[var(--bellum-text-secondary)]">
          {t('blocks.editStepsLabel')}
        </label>
        <textarea
          id={fieldId}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          rows={Math.min(10, Math.max(3, draft.split('\n').length))}
          className="min-h-11 w-full rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-2.5 py-2 text-sm text-[var(--bellum-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]"
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={saving || draft.trim().length === 0} onClick={() => void save()}>
            {t('blocks.editSave')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
            {t('blocks.editCancel')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      {version > 1 ? (
        <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('blocks.versionLabel', { version })}
        </Text>
      ) : null}
      {plan ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setDraft(stepsToText(plan))
            setEditing(true)
          }}
        >
          {t('blocks.edit')}
        </Button>
      ) : null}
    </div>
  )
}
