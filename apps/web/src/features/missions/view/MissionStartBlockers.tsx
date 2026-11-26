import { ADV_BLOCKER_ACTIONS, type AdvBlocker, type AdvDossier } from '@bellum/contracts'
import { Box, Button, Card, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAdvDossiers } from '@/features/adv/api'
import { RepairPanel } from '@/features/adv/view/AdvPage'
import { isPreStartStatus, MissionStartReadinessPanel } from './MissionStartReadinessPanel'

/** Les motifs que le panneau de réparation sait lever sur place ; les autres mènent à leur écran. */
const REPAIRED_IN_PLACE: ReadonlySet<AdvBlocker> = new Set([
  'missing_client_reference',
  'missing_billing_entity',
  'unknown_payment_terms',
  'payment_details_not_transmitted',
])

/**
 * Théo C missions-dossier — « CE QUI BLOQUE LE DÉMARRAGE », en tête du dossier de mission.
 *
 * ADV FONDUE (décision Louis 22/10/2026) : l'écran `/missions/adv` n'existe plus, ses manques vivent ICI,
 * dans la MÊME liste que les prérequis de démarrage (accords, contrat, consultant, date, TJM, accès du
 * premier jour). Le motif se répare sur place (panneau de réparation de l'ADV) ou mène à son écran.
 *
 * Pour une mission déjà en cours, seul un dossier de reconduction incomplet s'affiche — sous son vrai
 * nom, jamais « démarrage ». Un dossier complet, ou non lu, ne rend rien : on n'invente pas un vert.
 */
export function MissionStartBlockers({
  missionId,
  status,
  label,
}: {
  missionId: string
  status: string
  label: string | null
}) {
  const { t } = useTranslation('missions')
  const { data } = useAdvDossiers(label ? { q: label } : {})
  const dossier = data?.items.find(item => item.missionId === missionId)
  const blockers = dossier && dossier.state === 'incomplete' ? dossier.blockers : []
  const adminList = dossier && blockers.length > 0 ? <AdminBlockers dossier={dossier} /> : null

  if (isPreStartStatus(status)) {
    return <MissionStartReadinessPanel missionId={missionId} status={status} adminSlot={adminList} />
  }
  if (!adminList || !dossier) return null
  return (
    <Card className="p-4" aria-label={t('startBlockers.renewalTitle')}>
      <Text element="h2" size="base" weight="semibold">
        {t('startBlockers.renewalTitle')}
      </Text>
      {adminList}
    </Card>
  )
}

function AdminBlockers({ dossier }: { dossier: AdvDossier }) {
  const { t } = useTranslation(['missions', 'adv'])
  const [repairing, setRepairing] = useState(false)

  return (
    <Box className="mt-3 flex flex-col gap-2" data-testid="start-admin-blockers">
      <ul className="flex flex-col gap-2">
        {dossier.blockers.map(blocker => {
          const name = t(`adv:blockers.${blocker}`)
          return (
            <li key={blocker} className="flex flex-wrap items-center gap-2">
              <Text size="sm" weight="medium">
                {name}
              </Text>
              {REPAIRED_IN_PLACE.has(blocker) ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="pointer-coarse:min-h-11"
                  aria-label={t('missions:startBlockers.repairLabel', { blocker: name })}
                  onClick={() => setRepairing(true)}
                >
                  {t('missions:startBlockers.repair')}
                </Button>
              ) : (
                <Button size="sm" variant="outline" asChild className="pointer-coarse:min-h-11">
                  <Link to={ADV_BLOCKER_ACTIONS[blocker].route}>{t('missions:startBlockers.repair')}</Link>
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      {repairing ? <RepairPanel dossier={dossier} onClose={() => setRepairing(false)} /> : null}
    </Box>
  )
}
