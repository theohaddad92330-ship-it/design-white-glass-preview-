import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Textarea } from '@bellum/ui'
import { Pencil } from 'lucide-react'
import { useCorrectProfileContextField } from '@/features/profile-context/hooks/useCorrectProfileContextField'

/**
 * #2908 (#2010.4) — « état corrigé éditable, champ par champ ». Un SEUL
 * composant générique pour le champ corrigible affiché ici
 * (`welcomeSummary.profileRecap`, `PROFILE_CONTEXT_CORRECTABLE_FIELDS`,
 * packages/contracts) : un pictogramme + une zone de texte + enregistrer,
 * jamais un formulaire dédié par champ (doctrine c75, même esprit appliqué
 * ici à un autre chantier).
 */
export function CorrectRecapButton({ value, corrected }: { value: string; corrected: boolean }) {
  const { t } = useTranslation('profile')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const correctField = useCorrectProfileContextField()

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={Pencil}
          iconPosition="left"
          onClick={() => {
            setDraft(value)
            setEditing(true)
          }}
          className="text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)]"
        >
          {t('context.recap.correct')}
        </Button>
        {corrected && <Badge variant="outline">{t('context.recap.corrected')}</Badge>}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        rows={4}
        className="w-full"
        disabled={correctField.isPending}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="violet"
          size="sm"
          isLoading={correctField.isPending}
          disabled={!draft.trim()}
          onClick={() => {
            correctField.mutate(
              { field: 'welcomeSummary.profileRecap', value: draft.trim() },
              { onSuccess: () => setEditing(false) },
            )
          }}
        >
          {t('context.recap.correctionSave')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
          {t('context.recap.correctionCancel')}
        </Button>
      </div>
    </div>
  )
}
