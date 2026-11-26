import type { LemlistContactLead } from '@bellum/contracts'
import { Badge, Box, Button, SelectField, Text } from '@bellum/ui'
import { Send } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useLemlistCampaigns, useLemlistContactLeads, useLemlistStatus, usePushToLemlist } from '../api'

/**
 * #4427.2 / #4427.3 — Lemlist sur la fiche contact.
 *
 * - Sans Lemlist branché : AUCUNE ligne (on n'affiche pas ce qu'on n'a pas).
 * - Laura PRÉPARE, la personne CHOISIT : les campagnes ne se lisent qu'à
 *   l'ouverture du choix, et l'ajout ne part qu'au clic sur « Ajouter » — un
 *   geste qui passe côté serveur par la porte d'écriture.
 * - Les statuts sont ceux que l'API expose ; une relecture en échec est NOMMÉE,
 *   jamais confondue avec « aucune activité ».
 */
export function ContactLemlist({ contactId }: { contactId: string }) {
  const { t, i18n } = useTranslation('contacts', { keyPrefix: 'lemlist' })
  const { data: status } = useLemlistStatus()
  const connected = status?.connected === true
  const [choosing, setChoosing] = useState(false)
  const [campaignId, setCampaignId] = useState<string | undefined>(undefined)
  const campaigns = useLemlistCampaigns(connected && choosing)
  const leads = useLemlistContactLeads(contactId, connected)
  const push = usePushToLemlist(contactId)

  if (!connected) return null

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString(i18n.language)

  const submit = async () => {
    if (!campaignId) return
    try {
      const result = await push.mutateAsync(campaignId)
      if (result.outcome === 'already_in_campaign') toast.info(t('alreadyIn'))
      else toast.success(t('pushed', { campaign: result.campaignName ?? campaignId }))
      setChoosing(false)
      setCampaignId(undefined)
    } catch (error) {
      toast.error(t('pushFailed', { reason: error instanceof Error ? error.message : '' }))
    }
  }

  const options = (campaigns.data ?? []).map(campaign => ({ value: campaign.id, label: campaign.name }))

  return (
    <Box className="space-y-2" aria-label={t('title')}>
      <Text weight="medium" size="sm">
        {t('title')}
      </Text>

      {(leads.data ?? []).map((lead: LemlistContactLead) => (
        <Box key={lead.campaignId} className="space-y-1">
          <Box className="flex flex-wrap items-center gap-2">
            <Text size="sm">{lead.campaignName ?? lead.campaignId}</Text>
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {t('pushedAt', { date: formatDate(lead.pushedAt) })}
            </Text>
          </Box>
          {lead.statuses === null ? (
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {t('unreadable')}
            </Text>
          ) : (
            <Box className="flex flex-wrap gap-1.5">
              {/* #4427.3 — relecture en échec : le DERNIER statut gardé, daté, dit tel (jamais présenté comme frais). */}
              {lead.statusesStale && lead.statusesReadAt ? (
                <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid="lemlist-statuses-stale">
                  {t('statusesStale', { date: formatDate(lead.statusesReadAt) })}
                </Text>
              ) : null}
              {lead.statuses.map(entry => (
                <Badge key={entry.status} variant="outline" className="text-xs">
                  {t(`status.${entry.status}`)}
                  {entry.at ? ` · ${formatDate(entry.at)}` : ''}
                </Badge>
              ))}
            </Box>
          )}
        </Box>
      ))}

      {choosing ? (
        <Box className="space-y-2">
          {campaigns.isLoading ? (
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {t('loading')}
            </Text>
          ) : options.length === 0 ? (
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {t('noCampaign')}
            </Text>
          ) : (
            <SelectField
              size="sm"
              ariaLabel={t('campaignLabel')}
              placeholder={t('campaignPlaceholder')}
              value={campaignId}
              onChange={setCampaignId}
              options={options}
            />
          )}
          <Box className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={submit} disabled={!campaignId || push.isPending}>
              {t('add')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setChoosing(false)}>
              {t('cancel')}
            </Button>
          </Box>
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('notice')}
          </Text>
        </Box>
      ) : (
        // Recette 22/10 — 311 px dans un parent de 280 : le libellé passe à la ligne, jamais hors du cadre.
        <Button
          size="sm"
          variant="outline"
          className="h-auto min-h-11 max-w-full gap-1.5 whitespace-normal text-left"
          onClick={() => setChoosing(true)}
        >
          <Send className="size-4" aria-hidden />
          {t('addButton')}
        </Button>
      )}
    </Box>
  )
}
