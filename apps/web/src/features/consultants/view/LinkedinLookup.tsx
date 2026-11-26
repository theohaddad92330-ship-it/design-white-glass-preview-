import { Button, Input, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseLinkedInProfileUrl, type LinkedinDraft } from '@bellum/contracts'
import { ApiError } from '@/lib/api-error'
import { useLinkedinLookup } from '../hooks'

/**
 * H-DECISIONS #4348 — « ajouter un consultant depuis l'URL de son profil
 * LinkedIn » (décision Louis 20/10, doctrine `c95_linkedin_fournisseur_sous_contrat`).
 *
 * Coller `linkedin.com/in/<slug>` pré-remplit la fiche ; elle reste éditable,
 * rien n'est enregistré ici. Le prix est dit AVANT le clic (1 crédit si trouvé,
 * 0 sinon). L'écran ne nomme jamais le fournisseur qui répond, et un profil
 * introuvable renvoie vers le texte collé — jamais vers une donnée inventée.
 */
export function LinkedinLookup({ onDraft }: { onDraft: (draft: LinkedinDraft) => void }) {
  const { t } = useTranslation('consultants')
  const lookup = useLinkedinLookup()
  const [url, setUrl] = useState('')
  const [outcome, setOutcome] = useState<'idle' | 'invalid' | 'done' | 'notFound'>('idle')
  // #4348.4 — ce que le profil n'a pas rendu : dit, jamais deviné.
  const [missing, setMissing] = useState<LinkedinDraft['missing']>([])

  const submit = () => {
    if (!parseLinkedInProfileUrl(url)) {
      setOutcome('invalid')
      return
    }
    setOutcome('idle')
    lookup.mutate(url.trim(), {
      onSuccess: result => {
        if (result.found) {
          onDraft(result.draft)
          setMissing(result.draft.missing)
          setOutcome('done')
        } else {
          setOutcome('notFound')
        }
      },
    })
  }

  const noCredit = lookup.isError && lookup.error instanceof ApiError && lookup.error.status === 402
  const alert = noCredit
    ? t('form.linkedinLookup.noCredit')
    : lookup.isError
      ? t('form.linkedinLookup.error')
      : outcome === 'invalid'
        ? t('form.linkedinLookup.invalid')
        : outcome === 'notFound'
          ? t('form.linkedinLookup.notFound')
          : null

  return (
    <div className="flex flex-col gap-2 rounded-md border border-[var(--bellum-border)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="min-w-0 flex-1"
          aria-label={t('form.linkedinLookup.label')}
          placeholder={t('form.linkedinLookup.placeholder')}
          value={url}
          onChange={event => {
            setUrl(event.target.value)
            setOutcome('idle')
          }}
        />
        <Button variant="outline" size="sm" disabled={lookup.isPending || url.trim() === ''} onClick={submit}>
          {lookup.isPending ? t('form.linkedinLookup.working') : t('form.linkedinLookup.submit')}
        </Button>
      </div>
      {alert ? (
        <Text size="sm" role="alert">
          {alert}
        </Text>
      ) : null}
      {outcome === 'done' && !lookup.isError ? (
        <Text size="sm" role="status">
          {t('form.linkedinLookup.done')}
          {missing.length > 0
            ? ` ${t('form.linkedinLookup.missing', { fields: missing.map(field => t(`form.linkedinLookup.field.${field}`)).join(', ') })}`
            : ''}
        </Text>
      ) : null}
    </div>
  )
}
