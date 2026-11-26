import { buildMeetingBrief, deriveR1Recap, type MeetingType } from '@bellum/contracts'
import { Box, Card, FilterChips, SelectField, Text } from '@bellum/ui'
import { motion } from 'framer-motion'
import { Presentation } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccountFactsBrief } from '@/features/account-facts/useAccountFactsBrief'
import { buildR1R2BriefBlocks } from '@/features/agenda/meeting-r1-r2-blocks'
import { readAccountStakes, suggestR1R2Type, useMeetingR1R2 } from '@/features/agenda/useMeetingR1R2'
import { MeetingBriefBlockCard } from '@/features/agenda/view/MeetingBriefBlocks'
import { MeetingFlowCard } from '@/features/agenda/view/MeetingFlowCard'
import { useAccount } from '@/features/accounts/hooks/useAccount'
import { cardFade } from '../../motion'

type R1R2Type = Extract<MeetingType, 'r1_discovery' | 'r2_workshop'>
const R1R2_TYPES: readonly R1R2Type[] = ['r1_discovery', 'r2_workshop']

/**
 * #4424.1-.3 — « Préparer un R1 / un R2 » depuis la FICHE COMPTE.
 *
 * Le code R1/R2 (déroulé, REX, atelier, reprise du R1, pitch) n'avait que deux
 * appelants, tous deux depuis un événement d'AGENDA synchronisé : un client sans
 * agenda ne pouvait jamais préparer un R1. Ce panneau lit le MÊME calcul
 * (`useMeetingR1R2`, `buildR1R2BriefBlocks`) — aucun second chemin (GA-26) —
 * alimenté par les données du compte, sans appel modèle.
 *
 * Il se lit : rien n'est écrit, aucun e-mail n'est envoyé.
 */
export function MeetingR1R2Panel({
  accountId,
  companyName,
  stakesRaw,
}: {
  accountId: string
  companyName: string | null
  /** `accounts.it_challenges`, tel que chargé. */
  stakesRaw: unknown
}) {
  const { t } = useTranslation('accountDetail')
  const { t: tBrief } = useTranslation('briefing')
  const { contacts } = useAccount(accountId)
  const factsBrief = useAccountFactsBrief(accountId)
  const stakes = useMemo(() => readAccountStakes(stakesRaw), [stakesRaw])

  // R2 si un compte rendu de R1 existe déjà sur ce compte (même dérivation que le brief d'agenda).
  const suggested = suggestR1R2Type(
    deriveR1Recap({ meetingStart: null, recaps: factsBrief?.meetings ?? null, needs: factsBrief?.needs ?? null }),
  )
  const [chosen, setChosen] = useState<R1R2Type | null>(null)
  const [contactId, setContactId] = useState('')
  const meetingType = chosen ?? suggested
  const contact = (contacts ?? []).find(candidate => candidate.id === contactId) ?? null

  const { rex, r1, pitch, flow } = useMeetingR1R2({
    meetingType,
    meetingStart: null,
    accountName: companyName,
    stakes,
    factsBrief,
  })
  const blocks = buildMeetingBrief(buildR1R2BriefBlocks({ meetingType, rex, r1, pitch, t: tBrief }))

  return (
    <motion.div variants={cardFade} className="p-1 mt-4">
      <Card className="overflow-hidden p-0 [--card-spacing:0px]">
        <div className="border-b border-[var(--bellum-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Presentation className="size-4 text-[var(--bellum-text-accent)]" aria-hidden />
            <Text element="h3" size="base" weight="semibold">
              {t('meetingPrep.r1r2.title')}
            </Text>
          </div>
          <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('meetingPrep.r1r2.subtitle')}
          </Text>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <FilterChips
            ariaLabel={t('meetingPrep.r1r2.typeLabel')}
            options={R1R2_TYPES.map(type => ({ value: type, label: t(`meetingPrep.r1r2.type.${type}`) }))}
            value={meetingType}
            onChange={next => next && setChosen(next)}
          />
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t(suggested === 'r2_workshop' ? 'meetingPrep.r1r2.suggestedR2' : 'meetingPrep.r1r2.suggestedR1')}
          </Text>

          {(contacts ?? []).length > 0 ? (
            <Box className="flex max-w-sm flex-col gap-1">
              <Text element="span" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
                {t('meetingPrep.r1r2.contactLabel')}
              </Text>
              <SelectField
                value={contactId}
                onChange={setContactId}
                emptyOption={{ label: t('meetingPrep.r1r2.contactNone') }}
                ariaLabel={t('meetingPrep.r1r2.contactLabel')}
                options={(contacts ?? []).map(candidate => ({
                  value: candidate.id,
                  label: candidate.title ? `${candidate.full_name} — ${candidate.title}` : candidate.full_name,
                }))}
              />
            </Box>
          ) : null}
          {contact ? (
            <Text size="sm" weight="medium">
              {t('meetingPrep.r1r2.withContact', { name: contact.full_name })}
            </Text>
          ) : null}

          <MeetingFlowCard flow={flow} />
          {blocks.map(block => (
            <MeetingBriefBlockCard key={block.key} block={block} />
          ))}

          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('meetingPrep.r1r2.readOnly')}
          </Text>
        </div>
      </Card>
    </motion.div>
  )
}
