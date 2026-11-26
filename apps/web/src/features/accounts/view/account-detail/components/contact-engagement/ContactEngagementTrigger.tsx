import { type Contact, enrichmentCooldown } from '@bellum/contracts'
import { Box, Button, Text, TooltipButton } from '@bellum/ui'
import { Phone, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { channelFallback } from './channel'
import { ContactChannelMenu } from './ContactChannelMenu'
import type { EngagementChannel } from './types'

type ContactEngagementTriggerProps = {
  contact: Contact
  /** #2091 — `undefined` tant que `useCredits()` n'a pas résolu (jamais `0`). */
  enrichmentCredits: number | undefined
  isLoading: boolean
  onChannelSelect: (channel: EngagementChannel) => void
  onEnrich: (options: { force: boolean }) => void
}

export function ContactEngagementTrigger({
  contact,
  enrichmentCredits,
  isLoading,
  onChannelSelect,
  onEnrich,
}: ContactEngagementTriggerProps) {
  // Aucun canal connu → il n'y a rien à « contacter » : le seul geste utile est
  // d'enrichir, donc pas de menu déroulant.
  // #2123.72 — « joignable » se lit sur les canaux d'ENVOI : la tâche de prise
  // de contact ne rend pas joignable un contact sans coordonnée.
  // #2629.2 — le repli se NOMME, pas juste se déduit d'un bouton silencieux.
  const fallback = channelFallback(contact)
  if (fallback === 'none') {
    // …mais un enrichissement COMPLET a déjà tourné et n'a ramené aucune fiche
    // (aucun canal + `no_new_data` récent, gaps inchangés → `enrichmentCooldown`
    // non nul). Le fournisseur n'a tout simplement pas cette personne (typique
    // des administrateurs issus du RCS, absents d'Apollo). Proposer « Enrichir »
    // ne ferait que reproposer un clic qui échoue : on retire le bouton et on dit
    // pourquoi. La porte se rouvre seule après le cooldown, et la fiche garde le
    // « réessayer quand même » pour le commercial qui sait quelque chose.
    if (enrichmentCooldown(contact)) return <NoContactDataHint />
    // #3064 (retour bêta, 26/09/2026) — Louis : « supprime » sur « Aucun canal
    // connu pour ce contact ». Le bouton « Enrichir » dit déjà le seul geste
    // possible ; cette mention ne faisait que répéter ce que l'absence de menu
    // montre déjà. `ChannelFallbackHint` reste utilisé par le cas LinkedIn seul
    // (#2629.2, ci-dessous), inchangé.
    // LUDOVIC-C LC.5 — l'appel se PRÉPARE sans numéro (LUDB.8, même règle que le menu) : la
    // liste des contacts du compte l'offre donc aussi, à côté d'« Enrichir ».
    return (
      <Box display="flex" className="flex-wrap items-start gap-2">
        <PrepareCallButton onSelect={() => onChannelSelect('phone')} />
        <EnrichOnlyButton enrichmentCredits={enrichmentCredits} isLoading={isLoading} onEnrich={onEnrich} />
      </Box>
    )
  }

  return (
    <Box display="flex" className="flex-col items-start gap-1">
      {fallback === 'linkedin-only' ? <ChannelFallbackHint messageKey="trigger.linkedinOnly" /> : null}
      <ContactChannelMenu
        contact={contact}
        enrichmentCredits={enrichmentCredits}
        isLoading={isLoading}
        onChannelSelect={onChannelSelect}
        onEnrich={onEnrich}
      />
    </Box>
  )
}

/** LUDOVIC-C LC.5 — « Préparer mon appel » quand aucun canal n'est connu : le script se prépare sans numéro. */
function PrepareCallButton({ onSelect }: { onSelect: () => void }) {
  const { t } = useTranslation('engagement')
  return (
    <Button type="button" variant="outline" size="sm" icon={Phone} onClick={onSelect} className="min-h-11">
      {t('channel.action.phone')}
    </Button>
  )
}

/** #2629.2 — le texte du repli, partagé par le cas « LinkedIn seul » et le cas
 *  « aucun canal » : même style discret que `NoContactDataHint`. */
function ChannelFallbackHint({ messageKey }: { messageKey: string }) {
  const { t } = useTranslation('engagement')
  return (
    <Text size="xs" className="text-[var(--bellum-text-muted)]">
      {t(messageKey)}
    </Text>
  )
}

/** Remplace le bouton « Enrichir » quand le fournisseur n'a pas la personne :
 *  un état muet, honnête, non cliquable — plutôt qu'une action qui échoue. */
function NoContactDataHint() {
  const { t } = useTranslation('engagement')
  return (
    <Text size="xs" className="text-[var(--bellum-text-muted)]">
      {t('trigger.noData')}
    </Text>
  )
}

function EnrichOnlyButton({
  enrichmentCredits,
  isLoading,
  onEnrich,
}: {
  enrichmentCredits: number | undefined
  isLoading: boolean
  onEnrich: (options: { force: boolean }) => void
}) {
  const { t } = useTranslation('engagement')
  // #2091 — solde pas encore mesuré ≠ solde à zéro : la première dit qu'on
  // vérifie, la seconde dit qu'il n'y a plus rien — deux gestes différents.
  const creditsUnknown = enrichmentCredits === undefined
  const noCredits = !creditsUnknown && enrichmentCredits <= 0

  return (
    <TooltipButton
      tooltip={
        creditsUnknown ? t('trigger.creditsLoading') : noCredits ? t('trigger.noCredits') : t('trigger.enrichTooltip')
      }
      onClick={event => {
        event.stopPropagation()
        if (noCredits || creditsUnknown || isLoading) return
        onEnrich({ force: false })
      }}
      size="sm"
      isLoading={isLoading}
      icon={Zap}
      disabled={isLoading}
      variant="black"
    >
      {t('trigger.enrich')}
    </TooltipButton>
  )
}
