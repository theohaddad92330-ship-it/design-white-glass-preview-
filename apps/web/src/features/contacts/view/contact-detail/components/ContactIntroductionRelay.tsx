import type { IntroductionAuthorizationChannel, LinkKind, RelationalWarmth } from '@bellum/contracts'
import { INTRODUCTION_AUTHORIZATION_CHANNELS, LINK_KINDS, RELATIONAL_WARMTHS } from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Checkbox,
  FilterChips,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from '@bellum/ui'
import { UserCheck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useIntroductionAuthorizations,
  useRecordIntroductionAuthorization,
} from '@/features/contacts/hooks/useIntroductionAuthorizations'
import { SectionCard } from './SectionCard'
import { canCiteReferrer, describeIntroPath, needsRequalification } from './warmIntroGovernance'

/**
 * GA-249 — ce badge affiche un ÉTAT déjà tranché (accord obtenu ou refus) :
 * rien ne s'y clique, ce n'est pas une rangée de choix. Une table plutôt qu'un
 * ternaire en ligne — un badge qui LIT un état garde son composant local.
 */
const GRANTED_BADGE_VARIANT: Record<'granted' | 'refused', 'default' | 'outline'> = {
  granted: 'default',
  refused: 'outline',
}

/**
 * #3690 (remplace `ContactWarmIntroCard`, #2373) — le RELAIS, sans le parcours.
 *
 * Le module autonome « Introduction chaude » et ses huit étapes ont quitté la
 * fiche. Ce qu'il PORTAIT reste : les preuves d'autorisation d'introduction
 * déjà consignées (le serveur n'a pas bougé) se relisent ici — qui, quel lien,
 * ce qu'il reste à vérifier — et une nouvelle se consigne. Rien de tout cela ne
 * sollicite personne : consigner ≠ demander. La demande d'introduction reste un
 * OBJECTIF du composeur commun (`message-parameters.ts`), pas un module.
 *
 * Une absence ne fait aucun bloc : sans preuve, seul le geste « Consigner un
 * relais » est proposé. Le texte dit ce qu'un relais n'est PAS (identité,
 * sollicitation, opposition) — trois choses qu'il ne vaut jamais.
 */
export function ContactIntroductionRelay({ contactId, contactName }: { contactId: string; contactName: string }) {
  const { t } = useTranslation('contacts')
  const { data } = useIntroductionAuthorizations(contactId)
  const [formOpen, setFormOpen] = useState(false)
  const items = data ?? []
  const latest = items[0] ?? null

  if (!latest) {
    return (
      <Box>
        {formOpen ? (
          <SectionCard icon={UserCheck} title={t('introRelay.title')}>
            <RelayForm contactId={contactId} onDone={() => setFormOpen(false)} />
          </SectionCard>
        ) : (
          <Button size="sm" variant="outline" icon={UserCheck} onClick={() => setFormOpen(true)}>
            {t('introRelay.record')}
          </Button>
        )}
      </Box>
    )
  }

  const stale = needsRequalification({
    lastAuthorizedAt: latest.authorizedAt,
    today: new Date().toISOString().slice(0, 10),
  })
  const citable =
    !stale &&
    canCiteReferrer({
      linkKind: latest.linkKind ?? 'proposed_introduction',
      verified: latest.verified,
      referrerConfirmed: latest.granted,
    })
  const citationMessage = citable
    ? t('warmIntro.citationAllowed', { referrer: latest.referrerLabel ?? contactName })
    : stale
      ? t('warmIntro.citationBlockedStale')
      : !latest.granted
        ? t('warmIntro.citationBlockedNotConfirmed')
        : t('warmIntro.citationBlockedNotVerified')

  return (
    <SectionCard icon={UserCheck} title={t('introRelay.title')}>
      <Box className="space-y-2">
        {items.map(item => (
          <Box
            key={item.id}
            display="flex"
            className="flex-wrap items-center gap-2 rounded-md border border-border/60 p-2"
          >
            <Badge variant={GRANTED_BADGE_VARIANT[item.granted ? 'granted' : 'refused']}>
              {item.granted
                ? t(`warmIntro.path.${describeIntroPath({ referrerConfirmed: true })}`)
                : t('warmIntro.history.refused')}
            </Badge>
            {item.referrerLabel ? (
              <Text element="span" size="sm" weight="medium" className="min-w-0 truncate">
                {item.referrerLabel}
              </Text>
            ) : null}
            {item.linkKind ? (
              <Text element="span" size="sm" color="text-muted-foreground" className="min-w-0 flex-1 truncate">
                {t(`warmIntro.linkKind.${item.linkKind}`)}
              </Text>
            ) : null}
          </Box>
        ))}
      </Box>
      <Box display="flex" className="mt-3 flex-wrap items-center gap-2">
        {stale ? <Badge variant="warning">{t('warmIntro.requalify')}</Badge> : null}
        <Text
          element="p"
          size="sm"
          color={citable ? 'text-[var(--success-soft-text)]' : 'text-[var(--warning-soft-text)]'}
        >
          {citationMessage}
        </Text>
      </Box>
      <Text element="p" size="xs" color="text-muted-foreground" className="mt-3">
        {t('introRelay.notice')}
      </Text>
      <Box className="mt-3">
        {formOpen ? (
          <RelayForm contactId={contactId} onDone={() => setFormOpen(false)} />
        ) : (
          <Button size="sm" variant="outline" onClick={() => setFormOpen(true)}>
            {t('introRelay.record')}
          </Button>
        )}
      </Box>
    </SectionCard>
  )
}

function RelayForm({ contactId, onDone }: { contactId: string; onDone: () => void }) {
  const { t } = useTranslation('contacts')
  const record = useRecordIntroductionAuthorization(contactId)
  const [linkKind, setLinkKind] = useState<LinkKind>('proposed_introduction')
  const [verified, setVerified] = useState(false)
  const [warmth, setWarmth] = useState<RelationalWarmth | null>(null)
  const [referrerLabel, setReferrerLabel] = useState('')
  const [channel, setChannel] = useState<IntroductionAuthorizationChannel>('email')
  const [granted, setGranted] = useState<boolean | null>(null)
  const canSubmit = referrerLabel.trim().length > 0 && granted !== null && !record.isPending

  return (
    <Box className="space-y-2">
      <Label htmlFor="intro-relay-referrer">{t('warmIntro.form.referrerLabel')}</Label>
      <Input
        id="intro-relay-referrer"
        value={referrerLabel}
        onChange={e => setReferrerLabel(e.target.value)}
        placeholder={t('warmIntro.form.referrerPlaceholder')}
      />
      <Label htmlFor="intro-relay-link-kind">{t('warmIntro.linkKindLabel')}</Label>
      <Select value={linkKind} onValueChange={value => setLinkKind(value as LinkKind)}>
        <SelectTrigger id="intro-relay-link-kind" aria-label={t('warmIntro.linkKindLabel')} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LINK_KINDS.map(kind => (
            <SelectItem key={kind} value={kind}>
              {t(`warmIntro.linkKind.${kind}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Box display="flex" className="items-center gap-2">
        <Checkbox checked={verified} onCheckedChange={value => setVerified(value === true)} id="intro-relay-verified" />
        <Label htmlFor="intro-relay-verified" className="text-xs text-muted-foreground">
          {t('warmIntro.verifiedLabel')}
        </Label>
      </Box>
      <Text element="p" size="xs" color="text-muted-foreground">
        {t('warmIntro.warmthLabel')}
      </Text>
      <FilterChips
        ariaLabel={t('warmIntro.warmthLabel')}
        size="sm"
        options={RELATIONAL_WARMTHS.map(value => ({ value, label: t(`warmIntro.warmth.${value}`) }))}
        value={warmth}
        onChange={next => setWarmth(next as RelationalWarmth | null)}
      />
      <Label htmlFor="intro-relay-channel">{t('warmIntro.form.channelLabel')}</Label>
      <Select value={channel} onValueChange={value => setChannel(value as IntroductionAuthorizationChannel)}>
        <SelectTrigger id="intro-relay-channel" aria-label={t('warmIntro.form.channelLabel')} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {INTRODUCTION_AUTHORIZATION_CHANNELS.map(value => (
            <SelectItem key={value} value={value}>
              {t(`warmIntro.form.channel.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Text element="p" size="xs" color="text-muted-foreground">
        {t('warmIntro.form.grantedLabel')}
      </Text>
      {/* GA-249 — une rangée de choix exclusifs passe par le composant partagé. */}
      <FilterChips
        ariaLabel={t('warmIntro.form.grantedLabel')}
        size="sm"
        options={[
          { value: 'yes', label: t('warmIntro.form.grantedYes') },
          { value: 'no', label: t('warmIntro.form.grantedNo') },
        ]}
        value={granted === true ? 'yes' : granted === false ? 'no' : null}
        onChange={next => setGranted(next === null ? null : next === 'yes')}
      />
      <Button
        size="sm"
        disabled={!canSubmit}
        onClick={() => {
          if (granted === null) return
          record.mutate({
            // Redondant avec l'URL `/contacts/:id/...`, mais le schéma partagé (#2373.9) l'exige.
            targetContactId: contactId,
            referrerLabel: referrerLabel.trim(),
            granted,
            channel,
            authorizedAt: new Date().toISOString(),
            linkKind,
            verified,
            warmth: warmth ?? undefined,
          })
          onDone()
        }}
      >
        {t('warmIntro.form.submit')}
      </Button>
    </Box>
  )
}
