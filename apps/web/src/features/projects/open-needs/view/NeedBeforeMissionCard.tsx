import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Badge, Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { needReadinessApi, needReadinessKeys } from '../api'

/**
 * Refonte Théo — fiche besoin, onglet Avancement. Nos maquettes validées (`affaires/besoin.html`,
 * AFFAIRES-B5 / B4) y placent deux lectures que la maquette de Théo ne dessine pas — elles s'ajoutent
 * dans sa grammaire (panneau, liste dense, pastilles) :
 *
 *  - **Avant la mission** : ce qui MANQUERA au passage en mission, relu sur le même contrôle que Laura
 *    (`missionHandoffCheck`). Rien ne manque → on le dit ; une mission déjà ouverte mène à elle.
 *  - **Doublons** : les besoins du même compte au même intitulé ou à une compétence commune. On NOMME,
 *    on ne fusionne jamais ; aucun candidat est une vraie réponse, dite en mots.
 *
 * ⚠️ Une lecture qui échoue ne se lit jamais « rien ne manque » ni « aucun doublon ».
 */
export function NeedBeforeMissionCard({ needId }: { needId: string }) {
  const { t } = useTranslation('projects')
  const handoff = useQuery({
    queryKey: needReadinessKeys.handoff(needId),
    queryFn: () => needReadinessApi.handoff(needId),
    enabled: needId.length > 0,
  })
  const duplicates = useQuery({
    queryKey: needReadinessKeys.duplicates(needId),
    queryFn: () => needReadinessApi.duplicates(needId),
    enabled: needId.length > 0,
  })

  return (
    <Card data-theo-block="before-mission" className="grid gap-5 rounded-card p-4 md:grid-cols-2 md:p-5">
      <section>
        <Text element="h2" size="base" weight="semibold">
          {t('needSheet.beforeMission.title')}
        </Text>
        <div className="mt-2">
          {handoff.isError ? (
            <UnknownValue reason={t('needSheet.beforeMission.readError')} />
          ) : handoff.isPending ? (
            <Text size="sm" className="text-[var(--bellum-text-muted)]">
              {t('needSheet.beforeMission.loading')}
            </Text>
          ) : handoff.data.missing.length === 0 ? (
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('needSheet.beforeMission.nothingMissing')}
            </Text>
          ) : (
            <ul className="flex flex-col">
              {handoff.data.missing.map(item => (
                <li
                  key={item}
                  className="flex min-h-11 items-center justify-between gap-2 border-b border-[var(--bellum-border)] py-2 last:border-b-0"
                >
                  <Text element="span" size="sm">
                    {t(`needSheet.beforeMission.missing.${item}`, { defaultValue: item })}
                  </Text>
                  {item === 'mission_already_exists' && handoff.data.existingMissionId ? (
                    <Link
                      to="/missions/$id"
                      params={{ id: handoff.data.existingMissionId }}
                      className="inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] hover:underline"
                    >
                      {t('needSheet.beforeMission.openMission')}
                    </Link>
                  ) : (
                    <Badge variant="warning">{t('needSheet.beforeMission.toObtain')}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <Text size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
          {t('needSheet.beforeMission.hint')}
        </Text>
      </section>

      <section>
        <Text element="h2" size="base" weight="semibold">
          {t('needSheet.duplicates.title')}
        </Text>
        <div className="mt-2">
          {duplicates.isError ? (
            <UnknownValue reason={t('needSheet.duplicates.readError')} />
          ) : duplicates.isPending ? (
            <Text size="sm" className="text-[var(--bellum-text-muted)]">
              {t('needSheet.duplicates.loading')}
            </Text>
          ) : duplicates.data.candidates.length === 0 ? (
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('needSheet.duplicates.none')}
            </Text>
          ) : (
            <ul className="flex flex-col">
              {duplicates.data.candidates.map(candidate => (
                <li
                  key={candidate.needId}
                  className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-[var(--bellum-border)] py-2 last:border-b-0"
                >
                  <Link
                    to="/projects/needs/$needId"
                    params={{ needId: candidate.needId }}
                    className="text-sm font-medium hover:underline"
                  >
                    {candidate.title}
                  </Link>
                  <Badge variant="default">{t(`needSheet.duplicates.reason.${candidate.reason}`)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </Card>
  )
}
