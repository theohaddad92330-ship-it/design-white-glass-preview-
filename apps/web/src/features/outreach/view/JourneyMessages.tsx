import { OUTREACH_SEQUENCE_MAX_STEPS, outreachStepKindSchema, type OutreachStepKind } from '@bellum/contracts'
import { Box, Button, Input, SelectField, Text, Textarea } from '@bellum/ui'
import { ArrowDown, ArrowUp, Plus, RefreshCw, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { draftKey, type JourneyDraft } from '../hooks/useJourneyDrafts'
import type { JourneyContact, JourneyEvent } from '../sequence-journey'

/**
 * Théo C sequences-assistant, étape 3 « Messages » — le premier message ET les relances, chacun avec son canal,
 * son jour et son texte. Les touches e-mail s'ouvrent DÉJÀ rédigées par Laura pour la personne d'aperçu (un
 * sélecteur change de personne), éditables, avec « Régénérer » : jamais un champ vide. Les autres canaux disent ce
 * que Laura prépare. Chaque étape arrive ensuite dans À traiter à sa date : la personne la valide et l'envoie.
 */

type Cadence = readonly { kind: OutreachStepKind; offsetDays: number }[]

/** Ce que l'étape lit et pilote : porté par l'assistant, pour que revenir sur l'étape ne perde ni texte ni retouche. */
export type JourneyMessagesStore = {
  previewable: readonly JourneyContact[]
  preview: JourneyContact | null
  choosePreview: (id: string) => void
  drafts: Record<string, JourneyDraft>
  edit: (id: string, index: number, patch: Partial<{ subject: string; body: string }>) => void
  regenerate: (id: string, index: number, context: string) => void
  contextOf: (index: number) => string
}

export function JourneyMessages({
  cadence,
  store,
  dispatch,
}: {
  cadence: Cadence
  store: JourneyMessagesStore
  dispatch: (event: JourneyEvent) => void
}) {
  const { t } = useTranslation('outreach')
  const { previewable, preview, choosePreview, drafts, edit, regenerate, contextOf } = store

  return (
    <Box className="flex flex-col gap-4" data-testid="journey-messages">
      {previewable.length > 1 ? (
        <Box className="flex flex-col gap-1">
          <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('journey.messages.previewFor')}
          </Text>
          <SelectField
            ariaLabel={t('journey.messages.previewFor')}
            value={preview?.id ?? ''}
            onChange={choosePreview}
            options={previewable.map(contact => ({ value: contact.id, label: contact.full_name }))}
          />
        </Box>
      ) : null}

      {/* `.sequence-step` — le jour en carré relié par un filet ; le bloc : titre + [Monter] [Descendre] [Retirer],
          le canal, le délai (relances), l'objet et le message déjà rédigés par Laura. */}
      <ol className="flex list-none flex-col p-0">
        {cadence.map((step, index) => {
          const draft = preview ? drafts[draftKey(preview.id, index)] : undefined
          const unresolved = draft?.state === 'ready' ? unresolvedVariables(`${draft.subject} ${draft.body}`) : []
          const last = index === cadence.length - 1
          return (
            <li key={index} data-testid={`journey-touch-${index}`} className="relative flex gap-4 pb-6 last:pb-0">
              {last ? null : (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-[1.1875rem] top-10 border-l border-[var(--bellum-border)]"
                />
              )}
              <span className="z-10 grid size-10 shrink-0 place-items-center rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-xs font-semibold">
                {t('journey.messages.dayBadge', { day: step.offsetDays })}
              </span>
              <Box className="flex min-w-0 flex-1 flex-col gap-3 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
                <Box className="flex flex-wrap items-center justify-between gap-2">
                  <Text element="h3" size="sm" weight="semibold">
                    {t(`journey.messages.title.${index === 0 ? 'first' : last ? 'last' : 'followUp'}`)}
                  </Text>
                  <Box className="flex items-center gap-1">
                    <IconAction
                      label={`${t('journey.messages.up')} ${index + 1}`}
                      disabled={index === 0}
                      onClick={() => dispatch({ type: 'moveStep', index, direction: 'up' })}
                    >
                      <ArrowUp className="size-4" />
                    </IconAction>
                    <IconAction
                      label={`${t('journey.messages.down')} ${index + 1}`}
                      disabled={last}
                      onClick={() => dispatch({ type: 'moveStep', index, direction: 'down' })}
                    >
                      <ArrowDown className="size-4" />
                    </IconAction>
                    {cadence.length > 1 ? (
                      <IconAction
                        label={`${t('journey.messages.remove')} ${index + 1}`}
                        onClick={() => dispatch({ type: 'removeStep', index })}
                      >
                        <X className="size-4" />
                      </IconAction>
                    ) : null}
                  </Box>
                </Box>

                <Box className="grid gap-3 sm:grid-cols-2">
                  {/* Théo C sequences-assistant.A3 — le canal de chaque touche : e-mail, rappel, tâche,
                      invitation / message du réseau professionnel, appel. Aucun SMS ni vocal (22/10). */}
                  <Box className="flex flex-col gap-1">
                    <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                      {t('journey.messages.channel')}
                    </Text>
                    <SelectField
                      ariaLabel={`${t('journey.messages.channel')} ${index + 1}`}
                      value={step.kind}
                      onChange={next =>
                        dispatch({ type: 'setStepKind', index, kind: outreachStepKindSchema.parse(next) })
                      }
                      options={outreachStepKindSchema.options.map(kind => ({ value: kind, label: t(`kind.${kind}`) }))}
                    />
                  </Box>
                  <label className="flex flex-col gap-1">
                    <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                      {index === 0 ? t('journey.messages.day') : t('journey.messages.delay')}
                    </Text>
                    <Input
                      type="number"
                      min={0}
                      max={365}
                      className="w-28 pointer-coarse:min-h-11"
                      aria-label={`${t('journey.messages.day')} ${index + 1}`}
                      value={step.offsetDays}
                      onChange={event => {
                        // Un champ vidé n'est pas « jour 0 » : il est « en cours de saisie ».
                        const parsed = Number.parseInt(event.target.value, 10)
                        if (!Number.isNaN(parsed)) dispatch({ type: 'setStepDay', index, offsetDays: parsed })
                      }}
                    />
                  </label>
                </Box>

                {step.kind === 'email' ? (
                  !preview ? (
                    <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                      {t('journey.messages.noPreview')}
                    </Text>
                  ) : draft === undefined || draft.state === 'loading' ? (
                    <Text size="sm" className="text-[var(--bellum-text-secondary)]" role="status">
                      {t('journey.messages.writing')}
                    </Text>
                  ) : draft.state === 'error' ? (
                    <Box className="flex flex-wrap items-center gap-3">
                      <Text size="sm" className="text-[var(--warning-soft-text)]" role="status">
                        {t('journey.messages.writeFailed')}
                      </Text>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="pointer-coarse:min-h-11"
                        onClick={() => regenerate(preview.id, index, contextOf(index))}
                      >
                        {t('journey.messages.retry')}
                      </Button>
                    </Box>
                  ) : (
                    <Box className="flex flex-col gap-3">
                      <label className="flex flex-col gap-1">
                        <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                          {t('journey.messages.subject')}
                        </Text>
                        <Input
                          className="pointer-coarse:min-h-11"
                          value={draft.subject}
                          onChange={event => edit(preview.id, index, { subject: event.target.value })}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                          {t('journey.messages.body', { name: preview.full_name })}
                        </Text>
                        <Textarea
                          rows={7}
                          value={draft.body}
                          onChange={event => edit(preview.id, index, { body: event.target.value })}
                        />
                      </label>
                      {unresolved.length > 0 ? (
                        // `.notice.amber` — une variable restée entre accolades bloquerait l'étape de cette personne.
                        <Box
                          role="status"
                          className="rounded-card border border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] px-3.5 py-3"
                        >
                          <Text size="sm" className="text-[var(--warning-soft-text)]">
                            {t('journey.messages.unresolved', { variables: unresolved.join(' · ') })}
                          </Text>
                        </Box>
                      ) : null}
                      <Box>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="pointer-coarse:min-h-11"
                          onClick={() => regenerate(preview.id, index, contextOf(index))}
                        >
                          <RefreshCw className="size-4" aria-hidden="true" />
                          {t('journey.messages.regenerate')}
                        </Button>
                      </Box>
                    </Box>
                  )
                ) : (
                  <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                    {t(`campaign.purpose.${step.kind}`)}
                  </Text>
                )}
              </Box>
            </li>
          )
        })}
      </ol>

      {cadence.length < OUTREACH_SEQUENCE_MAX_STEPS ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="self-start pointer-coarse:min-h-11"
          onClick={() => dispatch({ type: 'addStep' })}
        >
          <Plus className="size-4" aria-hidden="true" />
          {t('journey.messages.add')}
        </Button>
      ) : (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('journey.messages.max', { count: OUTREACH_SEQUENCE_MAX_STEPS })}
        </Text>
      )}
    </Box>
  )
}

/** Les variables restées entre doubles accolades (« {{prenom}} ») : elles bloqueraient l'étape de la personne. */
function unresolvedVariables(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map(match => `{{${match[1]}}}`))]
}

/** `.icon-btn` — une icône NOMMÉE (GA-32), cible ≥ 44 px au doigt. */
function IconAction({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="size-9 p-0 pointer-coarse:size-11"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <span aria-hidden="true">{children}</span>
    </Button>
  )
}
