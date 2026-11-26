import { hasPermission, type QualificationCriterion, type QualificationCriterionKind } from '@bellum/contracts'
import { Box, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Text } from '@bellum/ui'
import { Plus, Trash2, Upload } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { SettingsBlock } from '@/features/settings/components/SettingsBlocks'
import { useTranslation } from 'react-i18next'
import { ImportedFromFileNote } from '@/features/universal-import/view/ImportedFromFileNote'
import { ScreenState } from '@/components/primitives/ScreenState'
import { useTeam } from '@/features/team/hooks/useTeam'
import { useQualificationGrid } from '../hooks/useQualificationGrid'
import { readFileAsBase64 } from '../lib/qualification-grid-api'
import { emptyCriterion, gridTotalState } from '../lib/qualificationViewData'

/**
 * #3755 — Réglages › Règles d'espace › GRILLE DE QUALIFICATION.
 *
 * La grille propre à l'espace : filtres éliminatoires (PASS/FAIL) et critères
 * pondérés dont les poids font 100. Import du classeur (xlsx/csv) ou édition ici ;
 * chaque enregistrement crée une NOUVELLE version (l'ancienne reste, inactive).
 * Elle vit sur l'écran des règles d'espace, pas sur un écran neuf (GA-26) :
 * c'est une règle que l'administrateur pose pour tous. Lecture ouverte à tout
 * membre ; écriture réservée à `team:manage`, que l'API re-vérifie.
 */
export function QualificationGridSection() {
  const { t } = useTranslation('qualificationGrid')
  const { team } = useTeam()
  const role = team?.workspace.role
  const canEdit = role ? hasPermission(role, 'team:manage') : false
  const state = useQualificationGrid()
  const fileRef = useRef<HTMLInputElement>(null)
  const fileId = useId()
  const [draft, setDraft] = useState<QualificationCriterion[] | null>(null)

  useEffect(() => {
    setDraft(state.grid ? state.grid.criteria : null)
  }, [state.grid])

  const onFile = async (file: File | undefined) => {
    if (!file) return
    const isCsv = /\.csv$/i.test(file.name)
    const content = isCsv ? await file.text() : await readFileAsBase64(file)
    state.importFile({ format: isCsv ? 'csv' : 'xlsx', content })
    if (fileRef.current) fileRef.current.value = ''
  }

  const update = (index: number, patch: Partial<QualificationCriterion>) =>
    setDraft(rows => (rows ?? []).map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const total = draft ? gridTotalState(draft) : null

  return (
    <SettingsBlock title={t('settings.title')} description={t('settings.subtitle')} testId="qualification-grid-block">
      {/* #4426.2 — d'où vient la grille, quand l'assistant « Dépose tes documents » l'a posée. */}
      <ImportedFromFileNote destination="qualification_grid" />
      {state.isLoading ? (
        <ScreenState state="loading" message={t('settings.loading')} />
      ) : state.isError ? (
        <ScreenState state="error" message={t('settings.error')} />
      ) : (
        <Box>
          <Box className="flex flex-col gap-3 px-4 py-3">
            {state.grid ? (
              <Box>
                <Text element="p" size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
                  {t('settings.version', { version: state.grid.version })}
                </Text>
                <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
                  {t('settings.versionHint')}
                </Text>
              </Box>
            ) : (
              <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
                {t('settings.empty')}
              </Text>
            )}

            {canEdit ? (
              <Box className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  id={fileId}
                  type="file"
                  accept=".xlsx,.csv"
                  className="sr-only"
                  onChange={event => void onFile(event.target.files?.[0])}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={state.saving}
                  className="min-h-11"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="size-4" aria-hidden />
                  {t('settings.import')}
                </Button>
                {!draft ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="min-h-11"
                    onClick={() => setDraft([emptyCriterion(0)])}
                  >
                    {t('settings.create')}
                  </Button>
                ) : null}
              </Box>
            ) : (
              <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
                {t('settings.readOnly')}
              </Text>
            )}
            {canEdit ? (
              <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
                {t('settings.importHint')}
              </Text>
            ) : null}
          </Box>

          {draft ? (
            <Box className="mt-4">
              {/* `.v12-table-wrap` : le tableau encadré, son en-tête sur le creux. */}
              <Box className="overflow-x-auto overscroll-x-contain rounded-overlay border border-[var(--bellum-border)] [&_td]:px-3 [&_th]:px-3">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead className="bg-[var(--bellum-surface-2)]">
                    <tr className="text-xs text-[var(--bellum-text-muted)]">
                      <th className="py-2 pr-2 font-medium">{t('settings.code')}</th>
                      <th className="py-2 pr-2 font-medium">{t('settings.label')}</th>
                      <th className="py-2 pr-2 font-medium">{t('settings.kind')}</th>
                      <th className="py-2 pr-2 font-medium">{t('settings.weight')}</th>
                      {canEdit ? <th className="py-2" aria-hidden /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {draft.map((row, index) => (
                      <tr key={index} className="border-t border-[var(--bellum-border)] align-middle">
                        <td className="py-2 pr-2">
                          <Input
                            aria-label={t('settings.code')}
                            value={row.code}
                            disabled={!canEdit}
                            className="w-20 min-h-11"
                            onChange={event => update(index, { code: event.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            aria-label={t('settings.label')}
                            value={row.label}
                            disabled={!canEdit}
                            className="min-h-11"
                            onChange={event => update(index, { label: event.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Select
                            value={row.kind}
                            disabled={!canEdit}
                            onValueChange={next => {
                              const kind = next as QualificationCriterionKind
                              update(index, { kind, weight: kind === 'eliminatory' ? null : row.weight })
                            }}
                          >
                            <SelectTrigger aria-label={t('settings.kind')} className="w-36 min-h-11">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="eliminatory">{t('settings.eliminatory')}</SelectItem>
                              <SelectItem value="weighted">{t('settings.weighted')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 pr-2">
                          {row.kind === 'weighted' ? (
                            <Input
                              aria-label={t('settings.weight')}
                              type="number"
                              min={0}
                              max={100}
                              value={row.weight ?? ''}
                              disabled={!canEdit}
                              className="w-20 min-h-11"
                              onChange={event => {
                                const value = event.target.value === '' ? null : Number(event.target.value)
                                update(index, { weight: value !== null && Number.isFinite(value) ? value : null })
                              }}
                            />
                          ) : (
                            <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]">
                              PASS / FAIL
                            </Text>
                          )}
                        </td>
                        {canEdit ? (
                          <td className="py-2">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-11"
                              aria-label={t('settings.removeCriterion', { code: row.code || index + 1 })}
                              onClick={() => setDraft(rows => (rows ?? []).filter((_, i) => i !== index))}
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>

              {total ? (
                <Text
                  element="p"
                  size="sm"
                  className="mt-3"
                  color={total.ok ? 'text-[var(--bellum-text-secondary)]' : 'text-[var(--danger-soft-text)]'}
                >
                  {total.ok
                    ? t('settings.total', { total: total.total })
                    : t('settings.totalInvalid', { message: total.message })}
                </Text>
              ) : null}

              {canEdit ? (
                <Box className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => setDraft(rows => [...(rows ?? []), emptyCriterion((rows ?? []).length)])}
                  >
                    <Plus className="size-4" aria-hidden />
                    {t('settings.addCriterion')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11"
                    disabled={!total?.ok || state.saving}
                    onClick={() => state.save(draft.map((row, position) => ({ ...row, position })))}
                  >
                    {t('settings.save')}
                  </Button>
                </Box>
              ) : null}
            </Box>
          ) : null}
        </Box>
      )}
    </SettingsBlock>
  )
}
