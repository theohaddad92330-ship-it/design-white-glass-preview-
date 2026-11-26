import { deriveR1Recap } from '@bellum/contracts'
import { Button, Card, Text } from '@bellum/ui'
import { Presentation } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MeetingR1R2Panel } from '@/features/accounts/view/account-detail/tabs/plan/MeetingR1R2Panel'
import { useAccount } from '@/features/accounts/hooks/useAccount'
import { useAccountFactsBrief } from '@/features/account-facts/useAccountFactsBrief'
import { suggestR1R2Type } from '@/features/agenda/useMeetingR1R2'

/**
 * #4424.3 (recette prod 23/10, FAIL) — la préparation du rendez-vous (pitch / R1) sur la FICHE MISSION.
 *
 * Le code existait (`MeetingR1R2Panel`, `MeetingFlowCard`, `useMeetingR1R2`) mais la création d'une mission ne
 * le montrait que dans l'action d'un toast, ~1 s. Cette carte est PERSISTANTE : elle reste sur le dossier de la
 * mission tant qu'aucun compte rendu de R1 n'existe sur le compte (même dérivation que le panneau : le R2 se
 * prépare depuis la fiche compte, la carte s'efface). Elle se lit — rien n'est écrit, aucun e-mail ne part.
 */
export function MissionMeetingPrepCard({ accountId, accountName }: { accountId: string; accountName: string | null }) {
  const { t } = useTranslation('missions')
  const { account } = useAccount(accountId)
  const factsBrief = useAccountFactsBrief(accountId)
  const [open, setOpen] = useState(false)
  const r1 = deriveR1Recap({
    meetingStart: null,
    recaps: factsBrief?.meetings ?? null,
    needs: factsBrief?.needs ?? null,
  })
  if (suggestR1R2Type(r1) === 'r2_workshop') return null

  return (
    <Card className="p-4" aria-label={t('meetingPrep.title')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Presentation className="size-4 text-[var(--bellum-text-accent)]" aria-hidden />
          <div>
            <Text element="h2" size="base" weight="semibold">
              {t('meetingPrep.title')}
            </Text>
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('meetingPrep.subtitle')}
            </Text>
          </div>
        </div>
        <Button variant={open ? 'outline' : 'default'} aria-expanded={open} onClick={() => setOpen(value => !value)}>
          {t(open ? 'meetingPrep.hide' : 'meetingPrep.open')}
        </Button>
      </div>
      {open ? (
        <MeetingR1R2Panel
          accountId={accountId}
          companyName={account?.company_name ?? accountName}
          stakesRaw={account?.it_challenges}
        />
      ) : null}
    </Card>
  )
}
