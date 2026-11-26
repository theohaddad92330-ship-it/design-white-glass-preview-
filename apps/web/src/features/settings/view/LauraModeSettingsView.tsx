import type { LauraContextMode, UpdateWorkspaceDefaultContextMode } from '@bellum/contracts'
import { LAURA_CONTEXT_MODES } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ScreenState } from '@/components/primitives/ScreenState'
import { LAURA_DEFAULT_DEPTHS, useLauraDefaultDepthStore } from '@/features/chat/laura-default-depth-store'
import { LAURA_MODE_SETTINGS_KEY, lauraModeSettingsApi } from '@/features/work-contexts/lib/laura-mode-settings-api'
import { SettingsViewHeader } from '@/features/settings/components/SettingsViewHeader'

/**
 * #2451.9 — RÉGLAGES › LAURA — MODE PAR DÉFAUT.
 *
 * ⚠️ Ce n'est PAS Réglages › Règles d'espace (#2081.14) : ce fichier-là plafonne
 * son socle à deux règles qui RESTREIGNENT un droit. Celui-ci pose une valeur
 * de REPLI pour un fil neuf — `contextModeFor` (`work-contexts/contextModeStore.ts`)
 * la lit quand aucun choix explicite n'a encore été fait pour ce fil. Un mode
 * déjà choisi pour un fil garde toujours la priorité (#2451.6).
 *
 * Tout membre LIT ce réglage (savoir dans quel mode part une conversation
 * neuve n'est pas un fait privilégié) ; seul le propriétaire ou un
 * administrateur le change, et l'API le re-vérifie (403 sinon) — même porte
 * que le marché et le fuseau de l'espace.
 */
// Théo D settings-laura.R1 — « Laura — mode par défaut » → deux blocs « Contexte et profondeur » et « Actions et
// autorisations » ; N1 : la profondeur par défaut (Auto / Rapide / Approfondi) ; N2 : la matrice en lecture.
export function LauraModeSettingsView() {
  const { t } = useTranslation('workspaceRules')
  const { t: th } = useTranslation('settingsHub')
  const queryClient = useQueryClient()
  const depth = useLauraDefaultDepthStore(state => state.depth)
  const setDepth = useLauraDefaultDepthStore(state => state.setDepth)
  const depthName = useId()

  const query = useQuery({
    queryKey: LAURA_MODE_SETTINGS_KEY,
    queryFn: () => lauraModeSettingsApi.get(),
    retry: false,
    staleTime: 0,
  })

  const update = useMutation({
    mutationFn: (patch: UpdateWorkspaceDefaultContextMode) => lauraModeSettingsApi.update(patch),
    onSuccess: settings => {
      queryClient.setQueryData(LAURA_MODE_SETTINGS_KEY, settings)
      toast.success(t('lauraDefaultMode.saved'))
    },
    onError: () => toast.error(t('lauraDefaultMode.saveFailed')),
  })

  const settings = query.data ?? null
  const name = useId()

  return (
    <Box className="w-full">
      <SettingsViewHeader scope="laura" title={th('behavior.title')} subtitle={th('behavior.subtitle')} />

      {query.isLoading ? (
        <ScreenState state="loading" message={t('lauraDefaultMode.loadingMessage')} />
      ) : query.isError || !settings ? (
        <ScreenState state="error" message={t('lauraDefaultMode.errorMessage')} />
      ) : (
        <Box display="flex" className="flex-col gap-4">
          {settings.canEdit ? null : (
            <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
              {t('lauraDefaultMode.readOnlyNote')}
            </Text>
          )}
          <SettingsBlock label={th('behavior.context.label')} description={th('behavior.context.description')}>
            {/* Théo D settings-laura — les deux réglages CÔTE À CÔTE (deux champs étiquetés), puis la note. */}
            <Box className="grid gap-x-5 sm:grid-cols-2">
              <Box>
                <Text
                  element="p"
                  size="sm"
                  weight="medium"
                  color="text-[var(--bellum-text-primary)]"
                  className="px-4 pt-3"
                >
                  {t('lauraDefaultMode.label')}
                </Text>
                <Box
                  role="radiogroup"
                  aria-label={t('lauraDefaultMode.label')}
                  className="flex flex-col gap-1 px-4 py-3"
                >
                  {LAURA_CONTEXT_MODES.map(mode => (
                    <label
                      key={mode}
                      className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md py-2 has-[:disabled]:cursor-default"
                    >
                      <input
                        type="radio"
                        name={name}
                        value={mode}
                        checked={settings.defaultContextMode === mode}
                        disabled={!settings.canEdit || update.isPending}
                        onChange={() => update.mutate({ defaultContextMode: mode as LauraContextMode })}
                        className="mt-1"
                      />
                      <span className="min-w-0">
                        <Text element="span" size="sm" weight="medium" color="text-[var(--bellum-text-primary)]">
                          {t(`lauraDefaultMode.${mode}`)}
                        </Text>
                        <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]" className="block">
                          {t(`lauraDefaultMode.${mode}Hint`)}
                        </Text>
                      </span>
                    </label>
                  ))}
                </Box>
              </Box>

              <Box>
                {/* N1 — la profondeur par défaut : Auto laisse l'heuristique décider, Rapide et Approfondi forcent le palier
                d'un fil NEUF. Personnelle, gardée sur cet appareil ; jamais éditable par l'administrateur à ta place. */}
                <Text
                  element="p"
                  size="sm"
                  weight="medium"
                  color="text-[var(--bellum-text-primary)]"
                  className="px-4 pt-3"
                >
                  {th('behavior.depth.label')}
                </Text>
                <Box
                  role="radiogroup"
                  aria-label={th('behavior.depth.label')}
                  className="flex flex-col gap-1 px-4 py-3"
                >
                  {LAURA_DEFAULT_DEPTHS.map(option => (
                    <label key={option} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md py-2">
                      <input
                        type="radio"
                        name={depthName}
                        value={option}
                        checked={depth === option}
                        onChange={() => setDepth(option)}
                        className="mt-1"
                      />
                      <span className="min-w-0">
                        <Text element="span" size="sm" weight="medium" color="text-[var(--bellum-text-primary)]">
                          {th(`behavior.depth.${option}`)}
                        </Text>
                        <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]" className="block">
                          {th(`behavior.depth.${option}Hint`)}
                        </Text>
                      </span>
                    </label>
                  ))}
                </Box>
              </Box>
            </Box>
            <Text
              element="p"
              size="xs"
              color="text-[var(--bellum-text-secondary)]"
              className="mx-4 mb-4 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] px-3 py-2"
            >
              {th('behavior.neutralNote')}
            </Text>
          </SettingsBlock>
          {/* N2 — la matrice « Recherche et préparation » / « Envois et écritures externes », EN LECTURE : le principe
              « le copilote n'envoie jamais » rendu visible. Le comportement est déjà garanti ailleurs ; cet écran ne
              propose pas de le régler (le niveau d'action personnel est juste en dessous). */}
          <SettingsBlock label={th('behavior.actions.label')} description={th('behavior.actions.description')}>
            {/* Théo D settings-laura — trois lignes : deux états TEINTÉS (la couleur dit un état), puis « Sources et
                mémoire » qui mène à la mémoire. */}
            <ul className="divide-y divide-[var(--bellum-border)]">
              {(['research', 'sending'] as const).map(row => (
                <li key={row} className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span className="min-w-0 max-w-xl">
                    <Text element="span" size="sm" weight="medium" color="text-[var(--bellum-text-primary)]">
                      {th(`behavior.actions.${row}.title`)}
                    </Text>
                    <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]" className="block">
                      {th(`behavior.actions.${row}.description`)}
                    </Text>
                  </span>
                  <span
                    className={
                      row === 'research'
                        ? 'rounded-badge border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] px-2 py-0.5 text-xs font-medium text-[var(--accent-soft-text)]'
                        : 'rounded-badge border border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] px-2 py-0.5 text-xs font-medium text-[var(--warning-soft-text)]'
                    }
                  >
                    {th(`behavior.actions.${row}.value`)}
                  </span>
                </li>
              ))}
              <li className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="min-w-0 max-w-xl">
                  <Text element="span" size="sm" weight="medium" color="text-[var(--bellum-text-primary)]">
                    {th('behavior.sources.label')}
                  </Text>
                  <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]" className="block">
                    {th('behavior.sources.description')}
                  </Text>
                </span>
                <Link
                  to="/settings/memory"
                  className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
                >
                  {th('behavior.sources.link')}
                </Link>
              </li>
            </ul>
          </SettingsBlock>
        </Box>
      )}
    </Box>
  )
}
