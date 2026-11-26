import { useState } from 'react'
import { Badge, Box, Button, Card, Text } from '@bellum/ui'
import { hasPermission, nextRitualDate, type DataHygiene, type Ritual, type RitualKey } from '@bellum/contracts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { useCreateTask } from '@/features/tasks/hooks/useTasks'
import { TaskComposer } from '@/features/tasks/view/TaskComposer'
import { formatDate, formatMonth } from '@/lib/locale'
import { pilotageApi } from '../api'

/**
 * Les rituels d'équipe (§7).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN APPORTE, ET CE QU'IL N'APPORTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * « Ce qui distingue un rituel d'une routine : une durée, un ordre du jour, des
 * participants, et des décisions tracées. » Le produit avait les routines — qui
 * notifient — et rien de l'ordre du jour.
 *
 * Ce qui est livré est la moitié qui rend le système TRANSMISSIBLE : un nouveau
 * manager reprend la réunion telle quelle, avec ses points, leur durée, et les
 * chiffres à ouvrir sur chacun — tirés de la vue Qualité, donc réels.
 *
 * Ni chronomètre, ni compte rendu : une décision prise en réunion a déjà sa
 * place (la porte qu'elle franchit, ou la tâche qu'elle crée), et un troisième
 * journal ferait un troisième endroit où chercher.
 */
export function RitualsPanel() {
  const { t, i18n } = useTranslation('pilotage')
  const queryClient = useQueryClient()
  const [open, setOpen] = useState<RitualKey | null>(null)
  // #3271.8 reste (épopée #3298) — le rituel pour lequel le composeur est ouvert.
  const [composerFor, setComposerFor] = useState<RitualKey | null>(null)
  const createTask = useCreateTask()
  const rituals = useQuery({
    queryKey: ['pilotage-rituals'],
    queryFn: pilotageApi.rituals,
    staleTime: 5 * 60_000,
    select: response => ({
      items: response.items ?? [],
      preferences: response.preferences ?? [],
      effectiveness: response.effectiveness ?? [],
      lastHeld: response.lastHeld ?? [],
      actionsCreated: response.actionsCreated ?? [],
    }),
  })
  // Les chiffres à ouvrir viennent de la MÊME lecture que la vue Qualité : deux
  // requêtes donneraient deux nombres pour la même question sur le même écran.
  const hygiene = useQuery({ queryKey: ['pilotage-hygiene'], queryFn: pilotageApi.hygiene, staleTime: 60_000 })
  // ⚠️ `?.lines?.` et non `?.lines.` : une charge utile PARTIELLE — un endpoint
  // servi par une version antérieure, une réponse tronquée — ferait exploser
  // l'écran ENTIER sur un `.map` d'`undefined`. Exactement le défaut corrigé le
  // 03/09 dans `DecisionStrip`, où 27 tests tombaient d'un coup sur cette seule
  // chaîne ; il a resurgi ici le 04/09 en déménageant ce panneau sur `/team`
  // (#1437), et c'est la deuxième occurrence de la MÊME faute.
  const counts = new Map((hygiene.data as DataHygiene | undefined)?.lines?.map(line => [line.key, line.count]) ?? [])

  const label = (value: { fr: string; en: string }) => (i18n.language.startsWith('en') ? value.en : value.fr)

  // #3271.10, .12 — « laisser le workspace personnaliser », en masquant un
  // rituel, jamais en supprimant sa définition. `team:manage` : même porte
  // que le sélecteur d'attribution d'`InterventionsBlock` — un réglage
  // d'ÉQUIPE, pas une préférence personnelle.
  const members = useWorkspaceMembers().data ?? []
  const canManage = hasPermission(members.find(member => member.isSelf)?.role ?? 'member', 'team:manage')
  const items = rituals.data?.items ?? []
  const hiddenKeys = new Set(rituals.data?.preferences.filter(pref => pref.disabled).map(pref => pref.ritualKey) ?? [])
  const activeRituals = items.filter(ritual => !hiddenKeys.has(ritual.key))
  const hiddenRituals = items.filter(ritual => hiddenKeys.has(ritual.key))
  // #3298 (suite #3271.11, .12, .8) — la détection et la marque, indexées une
  // fois pour ne pas les rechercher à chaque ligne.
  const effectivenessByKey = new Map((rituals.data?.effectiveness ?? []).map(report => [report.ritualKey, report]))
  const actionsByKey = new Map((rituals.data?.actionsCreated ?? []).map(row => [row.ritualKey, row.count]))
  const lastHeldByKey = new Map((rituals.data?.lastHeld ?? []).map(mark => [mark.ritualKey, mark]))

  const togglePreference = async (key: RitualKey, disabled: boolean) => {
    await pilotageApi.setRitualPreference(key, { disabled })
    rituals.refetch?.()
  }

  const markHeld = async (key: RitualKey) => {
    await pilotageApi.markRitualHeld(key)
    queryClient.invalidateQueries({ queryKey: ['pilotage-rituals'] })
  }

  return (
    <Card className="mt-6 p-4">
      <Text size="sm" weight="semibold">
        {t('rituals.title')}
      </Text>
      <Text size="xs" className="mt-0.5 block text-[var(--bellum-text-muted)]">
        {t('rituals.subtitle')}
      </Text>

      {rituals.isLoading ? (
        <Text size="xs" className="mt-3 block text-[var(--bellum-text-muted)]">
          {t('loading')}
        </Text>
      ) : rituals.isError ? (
        <Text size="xs" className="mt-3 block text-[var(--bellum-text-muted)]">
          {t('rituals.unavailable')}
        </Text>
      ) : (
        <Box className="mt-3 space-y-2">
          {activeRituals.map((ritual: Ritual) => (
            <Box key={ritual.key} className="rounded-md border border-border">
              <Box display="flex" className="items-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full min-w-0 flex-1 justify-between"
                  onClick={() => setOpen(current => (current === ritual.key ? null : ritual.key))}
                >
                  <span>{label(ritual.label)}</span>
                  <Box display="flex" className="items-center gap-1.5">
                    {/* #3271.11 (suite #3298) — un rituel monthly/quarterly
                        dont aucun indicateur observé n'a bougé récemment.
                        Jamais affiché sur daily/weekly/rank1 (hors périmètre,
                        `effectiveness` ne les nomme pas). */}
                    {effectivenessByKey.get(ritual.key)?.verdict === 'no_measurable_effect' ? (
                      <Badge variant="warning" className="text-xs">
                        {(() => {
                          // #3298 (suite #3271.11, historique d'occurrence) —
                          // `sinceMonth` DÉRIVE depuis quand, jamais un compte
                          // rendu : la même règle « on n'affiche pas ce qu'on
                          // n'a pas » s'applique si la fenêtre ne le porte pas.
                          const since = formatMonth(effectivenessByKey.get(ritual.key)?.sinceMonth ?? null)
                          return since ? t('rituals.noEffectSince', { month: since }) : t('rituals.noEffect')
                        })()}
                      </Badge>
                    ) : null}
                    {/* #3298 (reste, recette prod 30/09) — `not_evaluable` (pas
                        encore 3 photos mensuelles) restait un verdict SANS
                        écran : la quasi-totalité des espaces bêta n'ont pas
                        encore trois mois d'historique, donc ce badge était
                        LE SEUL signe visible que la détection existe — et il
                        ne s'affichait jamais pour eux. Doctrine « non mesuré
                        n'est jamais 0, un axe non évaluable est NOMMÉ » :
                        nommer la mesure en cours plutôt que de ne rien dire.
                        `monthsCovered` vient TOUJOURS du rapport lui-même une
                        fois son verdict vérifié — jamais un repli `?? 0`
                        (GA-19 : un compteur figé, jamais relevé). */}
                    {(() => {
                      const report = effectivenessByKey.get(ritual.key)
                      if (!report || report.verdict !== 'not_evaluable') return null
                      return (
                        <Badge variant="outline" className="text-xs">
                          {t('rituals.notEvaluable', { monthsCovered: report.monthsCovered })}
                        </Badge>
                      )
                    })()}
                    <Badge variant="outline" className="text-xs">
                      {t('rituals.minutes', { count: ritual.minutes })}
                    </Badge>
                  </Box>
                </Button>
                {/* #3271.10, .12 — masquer, jamais supprimer : le rituel
                    reste nommé, dans la section « masqués » ci-dessous. */}
                {canManage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => togglePreference(ritual.key, true)}
                  >
                    {t('rituals.hide')}
                  </Button>
                ) : null}
              </Box>
              {open === ritual.key ? (
                <Box className="space-y-2 border-t border-border p-3">
                  {/* #3271.8 — les deux attributs qui manquaient au
                      catalogue : QUI doit être dans la salle, et QUEL GENRE
                      de décision cette réunion doit produire. */}
                  <Box display="flex" className="items-baseline justify-between gap-2">
                    <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
                      {t('rituals.participants')}
                    </Text>
                    <Text size="xs" className="text-right text-[var(--bellum-text-secondary)]">
                      {ritual.participants.map(role => t(`rituals.roles.${role}`)).join(' · ')}
                    </Text>
                  </Box>
                  <Box display="flex" className="items-baseline justify-between gap-2">
                    <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
                      {t('rituals.expectedDecisions')}
                    </Text>
                    <Text size="xs" className="text-right text-[var(--bellum-text-secondary)]">
                      {label(ritual.expectedDecisions)}
                    </Text>
                  </Box>
                  {/* #3298.5 (#3271.12, partie proactive) — le verdict « aucun
                      effet mesurable » devient une PROPOSITION : le manager
                      lit pourquoi, et masque d'un geste. Jamais masqué tout
                      seul (« on propose, on n'écrit jamais ») ; sans
                      `team:manage`, un geste interdit n'est pas proposé. */}
                  {canManage && effectivenessByKey.get(ritual.key)?.verdict === 'no_measurable_effect' ? (
                    <Box display="flex" className="items-center justify-between gap-2">
                      <Text size="xs" className="min-w-0 text-[var(--bellum-text-secondary)]">
                        {(() => {
                          const since = formatMonth(effectivenessByKey.get(ritual.key)?.sinceMonth ?? null)
                          return since ? t('rituals.proposeHideSince', { month: since }) : t('rituals.proposeHide')
                        })()}
                      </Text>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => togglePreference(ritual.key, true)}
                      >
                        {t('rituals.proposeHideAction')}
                      </Button>
                    </Box>
                  ) : null}
                  {/* #3271.8 reste (suite #3298) — la marque légère de
                      dernière tenue, et la date suivante DÉRIVÉE de la
                      cadence (`nextRitualDate`) — jamais une note, jamais un
                      compte rendu. */}
                  <Box display="flex" className="items-center justify-between gap-2 border-t border-border pt-2">
                    <Box>
                      <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
                        {t('rituals.lastHeld')}
                      </Text>
                      {lastHeldByKey.get(ritual.key) ? (
                        <Text size="xs" className="block text-[var(--bellum-text-secondary)]">
                          {formatDate(lastHeldByKey.get(ritual.key)?.heldAt)}
                        </Text>
                      ) : (
                        <UnknownValue reason={t('rituals.neverHeld')} />
                      )}
                      {(() => {
                        const mark = lastHeldByKey.get(ritual.key)
                        if (!mark) return null
                        // `on_demand` (rank1) n'a pas de date suivante, par
                        // construction (`nextRitualDate`) — pas de ligne plutôt
                        // qu'une date vide.
                        const next = formatDate(nextRitualDate(ritual.cadence, mark.heldAt))
                        if (!next) return null
                        return (
                          <Text size="xs" className="block text-[var(--bellum-text-secondary)]">
                            {t('rituals.nextDate', { date: next })}
                          </Text>
                        )
                      })()}
                    </Box>
                    {canManage ? (
                      <Button variant="outline" size="sm" onClick={() => markHeld(ritual.key)}>
                        {t('rituals.markHeld')}
                      </Button>
                    ) : null}
                  </Box>
                  {/* #3271.8 reste (épopée #3298) — « actions créées » : le
                      geste tague la TÂCHE à sa création (le composeur des
                      comptes et du brief, pas un formulaire de plus), le
                      compte est une lecture. Aucune action taguée → aucune
                      ligne de compte, jamais « 0 action ». */}
                  <Box display="flex" className="items-center justify-between gap-2 border-t border-border pt-2">
                    {actionsByKey.get(ritual.key) ? (
                      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                        {t('rituals.actionsCreated', { count: actionsByKey.get(ritual.key) })}
                      </Text>
                    ) : (
                      <span />
                    )}
                    <Button variant="outline" size="sm" onClick={() => setComposerFor(ritual.key)}>
                      {t('rituals.createAction')}
                    </Button>
                  </Box>
                  {ritual.agenda.map(item => (
                    <Box key={item.position}>
                      <Box display="flex" className="items-baseline justify-between gap-2">
                        <Text size="xs" weight="medium">
                          {item.position} · {label(item.label)}
                        </Text>
                        <Text size="xs" className="shrink-0 text-[var(--bellum-text-muted)]">
                          {t('rituals.minutes', { count: item.minutes })}
                        </Text>
                      </Box>
                      {/* #2405.9 — qui porte le point : un RÔLE, jamais une
                          personne (doctrine : aucun classement nominatif). */}
                      <Badge variant="secondary" className="mt-1 text-xs">
                        {t(`rituals.owner.${item.owner}`)}
                      </Badge>
                      {/* Les chiffres à ouvrir sur ce point. Un compte non lu
                          s'affiche « non lu » : un zéro se lirait « rien à voir
                          ici », et le point serait sauté. */}
                      {item.watch.map(check => (
                        <Text key={check} size="xs" className="block text-[var(--bellum-text-secondary)]">
                          {counts.get(check) === null || counts.get(check) === undefined
                            ? `${t(`hygiene.checks.${check}`)} — ${t('hygiene.notRead')}`
                            : `${counts.get(check)} · ${t(`hygiene.checks.${check}`)}`}
                        </Text>
                      ))}
                      {item.link ? (
                        <Link to={item.link} className="text-xs underline">
                          {t('rituals.open')}
                        </Link>
                      ) : null}
                    </Box>
                  ))}
                </Box>
              ) : null}
            </Box>
          ))}
          {/* #3271.10, .12 — les rituels masqués restent NOMMÉS et
              réactivables, jamais effacés (« on archive, on ne supprime pas »). */}
          {hiddenRituals.length > 0 ? (
            <Box className="rounded-md border border-dashed border-border p-3">
              <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
                {t('rituals.hiddenTitle', { count: hiddenRituals.length })}
              </Text>
              <Box className="mt-2 space-y-1">
                {hiddenRituals.map(ritual => (
                  <Box key={ritual.key} display="flex" className="items-center justify-between gap-2">
                    <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                      {label(ritual.label)}
                    </Text>
                    {canManage ? (
                      <Button variant="ghost" size="sm" onClick={() => togglePreference(ritual.key, false)}>
                        {t('rituals.show')}
                      </Button>
                    ) : null}
                  </Box>
                ))}
              </Box>
            </Box>
          ) : null}
        </Box>
      )}
      {composerFor ? (
        <TaskComposer
          open
          onOpenChange={next => setComposerFor(next ? composerFor : null)}
          isPending={createTask.isPending}
          onSubmit={draft =>
            createTask.mutate(
              { ...draft, ritualKey: composerFor },
              {
                onSuccess: () => {
                  setComposerFor(null)
                  queryClient.invalidateQueries({ queryKey: ['pilotage-rituals'] })
                },
              },
            )
          }
        />
      ) : null}
    </Card>
  )
}
