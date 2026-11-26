import type { Account, Contact } from '@bellum/contracts'
import { outreachDuplicateGroups } from '@bellum/contracts'
import { Button, Card, Text } from '@bellum/ui'
import { AlertTriangle } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { channelIcon, channelLabel, channelReviewLabel } from '../components/contact-engagement/channel'
import { useContactEngagement } from '../components/contact-engagement/ContactEngagementContext'
import { buildContactMessage } from '../components/contact-engagement/message'
import type { ContactMessage, EngagementChannel } from '../components/contact-engagement/types'
import type { TabId } from '../components/AccountDetailTabsBar'

const SENDABLE_CHANNELS = ['email', 'linkedin', 'phone'] as const satisfies readonly EngagementChannel[]

function channelBody(message: ContactMessage, channel: (typeof SENDABLE_CHANNELS)[number]): string {
  if (channel === 'phone') return message.phoneScript
  if (channel === 'linkedin') return message.linkedinMessage
  return message.emailBody
}

/**
 * #2115.26 — LA PRÉPARATION DES MESSAGES, DANS LE PLAN D'ACTION.
 *
 * « Plan d'action : le plan · les prochaines actions · LA PRÉPARATION DES
 * MESSAGES » — et « messages » n'était un onglet de rien du tout : la clé
 * d'URL `messages` existait en ALIAS (elle retombait sur le plan), héritée d'un
 * onglet retiré le 22/07/2026 (commit b6e5279c7).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ON NE REFAIT PAS, ET POURQUOI C'EST LE CŒUR DU SUJET
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ancien `TabMessages` a été supprimé pour une raison écrite noir sur blanc :
 * il était mort ET faux (il lisait `raw_analysis.contact_messages` en
 * snake_case, quand le pipeline émet `plan.contactMessages`), et le produit
 * avait DÉJÀ la surface vivante — le panneau d'engagement contact
 * (`buildContactMessage` + `EngagementPanel`), qui lit les messages là où ils
 * sont réellement persistés. « Deux surfaces concurrentes pour la même donnée,
 * c'est précisément le motif qu'on corrige. »
 *
 * Cette sous-section n'est donc PAS une seconde surface : elle ne rend aucun
 * message, elle n'en édite aucun, elle n'en envoie aucun. C'est une PORTE — la
 * liste des personnes pour qui un message est déjà prêt, et un geste qui ouvre
 * le panneau existant sur le bon contact et le bon canal. La lecture et
 * l'écriture restent à un seul endroit.
 *
 * ⚠️ Le copilote n'envoie jamais d'e-mail : on prépare, le commercial envoie.
 * Rien ici n'a de chemin d'écriture.
 */
export function TabMessages({
  account,
  contacts,
  onTabChange,
}: {
  account: Account
  contacts: Contact[]
  onTabChange: (tab: TabId) => void
}) {
  const { t } = useTranslation('accountDetail')
  const { openEngagement } = useContactEngagement()
  const rawAnalysis = useMemo(
    () => ((account.raw_analysis as Record<string, unknown> | null) ?? {}) as Record<string, unknown>,
    [account.raw_analysis],
  )

  // #O8 — recette Loïc 21/10 : l'API pose `plan.messagesStatus = 'missing'` quand l'étape
  // « messages » n'a rien rendu. L'écran le dit en clair — jamais « 0 message », jamais « Terminé ».
  const messagesStepMissing =
    (rawAnalysis['plan'] as { messagesStatus?: unknown } | null | undefined)?.messagesStatus === 'missing'

  /** Les personnes pour qui un message EXISTE, avec les canaux réellement
   *  prêts. Un canal sans texte n'est pas proposé : un bouton qui ouvre un
   *  brouillon vide promet un travail déjà fait qui ne l'est pas. */
  const prepared = useMemo(
    () =>
      contacts
        .map(contact => {
          const message = buildContactMessage(contact, rawAnalysis)
          const channels: EngagementChannel[] = []
          if (message.emailBody.trim()) channels.push('email')
          if (message.linkedinMessage.trim()) channels.push('linkedin')
          if (message.phoneScript.trim()) channels.push('phone')
          return { contact, channels, message }
        })
        .filter(entry => entry.channels.length > 0),
    [contacts, rawAnalysis],
  )

  /**
   * #2947/#2204.73 — LE MÊME TEXTE, PARTI À PLUSIEURS PERSONNES.
   *
   * `outreachDuplicateGroups` (`packages/contracts/outreach-batch-check.ts`)
   * existait déjà, calculée et testée, sans AUCUN appelant — la lacune que
   * nomme l'épopée #2947 (« rien n'appelle encore ce contrôle après une
   * génération batch »). Cette liste EST le lot où les messages d'un compte
   * sortent en nombre (jusqu'à un contact par personne du compte) : c'est ici
   * que la question a une réponse observable, jamais dans le générateur
   * lui-même. Comme `outreachDuplicateGroups`, jamais un score ni un
   * pourcentage — seulement qui partage le même texte, nommé.
   */
  const duplicateWarnings = useMemo(
    () =>
      SENDABLE_CHANNELS.flatMap(channel => {
        const messages = prepared
          .filter(entry => entry.channels.includes(channel))
          .map(entry => ({ contactId: entry.contact.id, body: channelBody(entry.message, channel) }))
        return outreachDuplicateGroups(messages).map(group => ({
          channel,
          names: group.contactIds
            .map(id => prepared.find(entry => entry.contact.id === id)?.contact.full_name)
            .filter((name): name is string => Boolean(name)),
        }))
      }),
    [prepared],
  )

  // #3711.8 (épopée de recette) — « grandes cartes de messages vides » : sans
  // message préparé, UNE ligne utile (le constat et le geste qui y mène), jamais
  // l'état vide centré à grande icône qu'elle remplace — critère transverse
  // « section secondaire vide = disparaît ou une ligne utile ».
  if (prepared.length === 0) {
    return (
      <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('preparedMessages.empty.title')}{' '}
        {/* LOIC-FIX O.1 — des personnes existent mais aucun message n'a été rédigé :
            l'étape « messages » n'a pas eu lieu (analyse interrompue), ce n'est pas
            « rien à dire ». On le NOMME et on offre le geste existant (la préparation
            d'un contact, `/message/generate`) — sans relancer l'analyse. Sans personne,
            la ligne reste neutre. */}
        {contacts.length > 0 ? (
          <>
            {messagesStepMissing ? t('preparedMessages.missing.rerun') : t('preparedMessages.missing.reason')}{' '}
            <button
              type="button"
              onClick={() => {
                const first = contacts[0]
                if (first) openEngagement([first], 'email', { rawAnalysis })
              }}
              className="font-medium text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11"
            >
              {t('preparedMessages.missing.action')}
            </button>{' '}
          </>
        ) : null}
        <button
          type="button"
          onClick={() => onTabChange('contacts')}
          className="font-medium text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11"
        >
          {t('preparedMessages.empty.action')}
        </button>
      </Text>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <Text element="h3" size="sm" weight="semibold">
          {t('preparedMessages.title')}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('preparedMessages.subtitle')}
        </Text>
      </div>
      {duplicateWarnings.length > 0 ? (
        // ⚠️ `--warning-soft-*`, jamais `--bellum-warning` nu — voir
        // `ContactsStaleCollectionNotice.tsx` (AA en clair, GA-33).
        <div className="flex items-start gap-2 rounded-xl border border-[var(--bellum-border)] bg-[var(--warning-soft-bg)] px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning-soft-text)]" aria-hidden />
          <div className="min-w-0 space-y-1">
            <Text size="sm" weight="medium" className="text-[var(--warning-soft-text)]">
              {t('preparedMessages.duplicateWarning.title')}
            </Text>
            <ul className="space-y-0.5">
              {duplicateWarnings.map((warning, index) => (
                <li key={`${warning.channel}-${index}`}>
                  <Text size="xs" className="text-[var(--warning-soft-text)]">
                    {t('preparedMessages.duplicateWarning.line', {
                      channel: channelLabel(warning.channel),
                      names: warning.names.join(', '),
                    })}
                  </Text>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      <ul className="space-y-2">
        {prepared.map(({ contact, channels }) => (
          <li key={contact.id}>
            <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <Text size="sm" weight="medium">
                  {contact.full_name}
                </Text>
                {contact.title ? (
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {contact.title}
                  </Text>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {channels.map(channel => (
                  <Button
                    key={channel}
                    variant="secondary"
                    size="xs"
                    icon={channelIcon(channel)}
                    iconPosition="left"
                    // Le panneau d'engagement EXISTANT, ouvert sur ce contact et
                    // ce canal — avec le dossier, qui sert de repêchage quand la
                    // ligne contact ne porte pas encore son message.
                    onClick={() => openEngagement([contact], channel, { rawAnalysis })}
                  >
                    {/* #2617.2 — le verbe dit l'ÉTAT. Ici le texte est déjà
                        écrit (c'est la condition d'entrée de cette liste), donc
                        on RELIT ; « Préparer… » promettait un travail à faire
                        et contredisait le titre de la carte. Le libellé vit à
                        UN endroit (`channel.ts`, `engagement:channel.review.*`)
                        — une seconde formulation ici dériverait au premier
                        renommage. */}
                    {channelReviewLabel(channel)}
                  </Button>
                ))}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
