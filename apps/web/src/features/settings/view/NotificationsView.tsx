import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Badge, Button, cn, SettingsRow, Switch, Text } from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { SettingsScreenHeader } from '@/features/settings/components/SettingsScreenHeader'
import { defaultNotificationPreferences } from '@bellum/contracts'
import type { NotificationPreferences, NotificationPresetId, UpdateNotificationPreferences } from '@bellum/contracts'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/lib/hooks/use-session'
import { useNotificationPreferences } from '@/features/notifications/hooks/useNotificationPreferences'
import { SmsChannelSection } from '@/features/settings/components/notifications/SmsChannelSection'
import { BrowserChannelSection } from '@/features/settings/components/notifications/BrowserChannelSection'

/** Only the boolean preferences are switches — `email_language` is carried on
 *  the same payload but reported by the app, not toggled by the user. */
type PrefKey = {
  [K in keyof NotificationPreferences]: NotificationPreferences[K] extends boolean ? K : never
}[keyof NotificationPreferences]

type ToggleItem = {
  key: PrefKey
  titleKey: string
  descriptionKey: string
  /** Optionnel — libellé i18n d'un badge affiché à côté du titre (ex. « Bientôt »
   *  quand la préférence est câblée mais l'envoi pas encore branché). */
  badgeKey?: string
}

type NotificationSection = {
  labelKey: string
  items: ToggleItem[]
}

const SECTIONS: NotificationSection[] = [
  {
    labelKey: 'sectionActivity',
    items: [
      {
        key: 'buy_signals',
        titleKey: 'buySignalsTitle',
        descriptionKey: 'buySignalsDescription',
      },
      {
        key: 'relance_reminders',
        titleKey: 'relanceRemindersTitle',
        descriptionKey: 'relanceRemindersDescription',
      },
      {
        key: 'weekly_summary',
        titleKey: 'weeklySummaryTitle',
        descriptionKey: 'weeklySummaryDescription',
      },
      {
        key: 'weekly_digest',
        titleKey: 'weeklyDigestTitle',
        descriptionKey: 'weeklyDigestDescription',
      },
      // #4463 — l'alerte « solde bas » n'est plus proposée : aucun crédit visible côté client.
      {
        key: 'action_overdue',
        titleKey: 'actionOverdueTitle',
        descriptionKey: 'actionOverdueDescription',
      },
      // Cadence de veille (§11) : e-mail digest QUOTIDIEN, envoi RÉEL depuis le
      // cron `daily-veille-digest` (06:30 Europe/Paris). Opt-in strict (défaut
      // OFF) et filtré par vos règles de veille — plus de badge « Bientôt ».
      {
        key: 'watchlist_daily_digest',
        titleKey: 'watchlistDailyDigestTitle',
        descriptionKey: 'watchlistDailyDigestDescription',
      },
      // #2082.4/.5/.6 — les trois annonces d'ENGAGEMENT, arrivées le 16/09/2026
      // AVEC leur émetteur (`engagement-alerts.service.ts`, cron
      // `engagement-alerts`). Aucun badge « Bientôt » : la décision était
      // l'émetteur d'abord, la préférence ensuite — un interrupteur qui ne
      // commande rien promet un envoi qui n'arrivera jamais.
      {
        key: 'meeting_prep',
        titleKey: 'meetingPrepTitle',
        descriptionKey: 'meetingPrepDescription',
      },
      {
        key: 'mission_end',
        titleKey: 'missionEndTitle',
        descriptionKey: 'missionEndDescription',
      },
      {
        key: 'client_reply',
        titleKey: 'clientReplyTitle',
        descriptionKey: 'clientReplyDescription',
      },
    ],
  },
  {
    // Laura Produit (PDF 10, décision D49). Elle vit avec les notifications et
    // non sur un écran à elle : c'est la même question — « qu'est-ce qui a le
    // droit de m'interrompre ? » — et un second endroit pour y répondre
    // produirait deux réglages qui se contredisent.
    labelKey: 'sectionAssistant',
    items: [
      {
        key: 'laura_enabled',
        titleKey: 'lauraEnabledTitle',
        descriptionKey: 'lauraEnabledDescription',
      },
    ],
  },
  // #4158.19 — l'e-mail INTERNE entre collègues : quatre interrupteurs, tous
  // désactivés par défaut. Le quatrième (digest du manager, #4158.28) a son
  // émetteur depuis l'intégration (`ManagerDigestService` → `TeamNotificationsService`).
  {
    labelKey: 'sectionTeamEmail',
    items: [
      {
        key: 'email_on_assignment',
        titleKey: 'emailOnAssignmentTitle',
        descriptionKey: 'emailOnAssignmentDescription',
      },
      {
        key: 'email_on_delegation',
        titleKey: 'emailOnDelegationTitle',
        descriptionKey: 'emailOnDelegationDescription',
      },
      { key: 'email_on_mention', titleKey: 'emailOnMentionTitle', descriptionKey: 'emailOnMentionDescription' },
      {
        key: 'email_on_manager_digest',
        titleKey: 'emailOnManagerDigestTitle',
        descriptionKey: 'emailOnManagerDigestDescription',
      },
    ],
  },
  {
    labelKey: 'sectionChangelog',
    items: [
      {
        key: 'sidebar_changelog',
        titleKey: 'sidebarChangelogTitle',
        descriptionKey: 'sidebarChangelogDescription',
      },
      // Newsletter Changelog : envoi réel depuis le cron `changelog-newsletter`
      // (1er et 15 du mois). Le toggle pilote vraiment l'envoi — plus de badge
      // « Bientôt disponible ».
      {
        key: 'newsletter_changelog',
        titleKey: 'newsletterChangelogTitle',
        descriptionKey: 'newsletterChangelogDescription',
      },
    ],
  },
]

/**
 * Les 4 présélections proposées à l'écran (#1938.6-9). L'ordre suit le
 * texte de la demande : du plus rare (urgent) au plus large (hebdo), puis
 * l'état détecté. `custom` n'a pas de description « à cocher » — la sienne
 * EXPLIQUE qu'elle se coche toute seule, jamais à la main.
 */
const PRESET_ORDER: NotificationPresetId[] = ['urgent_only', 'daily_brief', 'weekly_recap', 'custom']

const PRESET_COPY: Record<NotificationPresetId, { titleKey: string; descriptionKey: string }> = {
  urgent_only: { titleKey: 'presetUrgentOnlyTitle', descriptionKey: 'presetUrgentOnlyDescription' },
  daily_brief: { titleKey: 'presetDailyBriefTitle', descriptionKey: 'presetDailyBriefDescription' },
  weekly_recap: { titleKey: 'presetWeeklyRecapTitle', descriptionKey: 'presetWeeklyRecapDescription' },
  custom: { titleKey: 'presetCustomTitle', descriptionKey: 'presetCustomDescription' },
}

/**
 * Théo D settings-compte.R1 / N2 — les CINQ familles de Théo. Chacune est un
 * raccourci d'ÉCRITURE vers les alertes précises du « Réglage fin » (GA-26 :
 * jamais un second stockage). État dérivé : la famille est allumée si UNE de
 * ses alertes l'est. Couper une famille coupe toutes ses alertes ; la rallumer
 * ne rallume que celles qui sont par défaut DANS Bellum — un envoi par e-mail
 * ne s'allume jamais sans son propre interrupteur (#2082.16).
 */
const FAMILIES: { id: string; titleKey: string; descriptionKey: string; keys: PrefKey[] }[] = [
  {
    id: 'deadlines',
    titleKey: 'familyDeadlinesTitle',
    descriptionKey: 'familyDeadlinesDescription',
    keys: ['relance_reminders', 'meeting_prep', 'action_overdue', 'email_on_assignment', 'email_on_delegation'],
  },
  {
    id: 'replies',
    titleKey: 'familyRepliesTitle',
    descriptionKey: 'familyRepliesDescription',
    keys: ['client_reply', 'email_on_mention'],
  },
  {
    id: 'signals',
    titleKey: 'familySignalsTitle',
    descriptionKey: 'familySignalsDescription',
    keys: ['buy_signals', 'watchlist_daily_digest', 'weekly_digest', 'laura_enabled'],
  },
  {
    id: 'missions',
    titleKey: 'familyMissionsTitle',
    descriptionKey: 'familyMissionsDescription',
    keys: ['mission_end'],
  },
  {
    id: 'product',
    titleKey: 'familyProductTitle',
    descriptionKey: 'familyProductDescription',
    keys: ['sidebar_changelog', 'newsletter_changelog'],
  },
]

/** Les préférences qui partent par e-mail : le canal « Par e-mail » est actif si l'une est allumée. */
const EMAIL_KEYS: PrefKey[] = [
  'weekly_summary',
  'weekly_digest',
  'watchlist_daily_digest',
  'newsletter_changelog',
  'email_on_assignment',
  'email_on_delegation',
  'email_on_mention',
  'email_on_manager_digest',
]

function familyPatch(keys: PrefKey[], on: boolean): UpdateNotificationPreferences {
  const patch: UpdateNotificationPreferences = {}
  for (const key of keys) {
    if (!on) patch[key] = false
    else if (defaultNotificationPreferences[key] === true) patch[key] = true
  }
  return patch
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export function NotificationsView() {
  const { t } = useTranslation('settings', { keyPrefix: 'notifications' })
  const { preferences, setPreference, setPreferences, activePreset, applyPreset } = useNotificationPreferences()
  const { user } = useSession()
  const fineCount = SECTIONS.reduce((total, section) => total + section.items.length, 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' as const }}
      className="w-full space-y-6"
    >
      <SettingsScreenHeader scope="personal" title={t('headerTitle')} description={t('headerDescription')} />

      {/* Théo D settings-compte.R1 — les cinq familles. */}
      <SettingsBlock label={t('familiesTitle')} description={t('familiesDescription')}>
        {FAMILIES.map(family => (
          <SettingsRow
            key={family.id}
            title={t(family.titleKey)}
            description={t(family.descriptionKey)}
            trailing={
              <Switch
                aria-label={t(family.titleKey)}
                checked={family.keys.some(key => preferences[key])}
                onCheckedChange={checked => setPreferences(familyPatch(family.keys, checked))}
              />
            }
          />
        ))}

        {/* Théo D settings-compte.R1 / A3 — le réglage fin : TOUTES les alertes
          précises d'avant, rangées sous un repli DANS le bloc (rien ne se perd). */}
        <details className="border-t border-[var(--bellum-border)] px-5 py-2 sm:px-6">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">
            <span role="button">{t('fineTuningSummary', { count: fineCount })}</span>
          </summary>
          <div className="space-y-6 pt-3">
            {SECTIONS.map(section => (
              <SettingsBlock key={section.labelKey} label={t(section.labelKey)}>
                {section.items.map(item => (
                  <SettingsRow
                    key={item.key}
                    title={t(item.titleKey)}
                    description={t(item.descriptionKey)}
                    badge={
                      item.badgeKey ? (
                        <Badge variant="outline" className="text-xs">
                          {t(item.badgeKey)}
                        </Badge>
                      ) : undefined
                    }
                    trailing={
                      /* #1849 — le titre de la ligne nomme l'interrupteur, déjà traduit. */
                      <Switch
                        aria-label={t(item.titleKey)}
                        checked={preferences[item.key]}
                        onCheckedChange={checked => setPreference(item.key, checked)}
                      />
                    }
                  />
                ))}
              </SettingsBlock>
            ))}
          </div>
        </details>
      </SettingsBlock>

      {/* Théo D settings-compte — UN bloc « Rythme et canaux » : le récapitulatif, la plage de tranquillité, puis les
          canaux, en lignes. Choisir un canal ne connecte ni messagerie ni téléphone à ta place. */}
      <SettingsBlock label={t('rhythmTitle')} description={t('rhythmDescription')}>
        <div className="border-b border-[var(--bellum-border)] px-5 py-4 sm:px-6">
          <Text element="h2" size="sm" weight="medium">
            {t('presetsTitle')}
          </Text>
          <Text size="xs" className="text-[var(--bellum-text-secondary)] mt-0.5">
            {t('presetsDescription')}
          </Text>
          {/*
          Un GROUPE de 4 boutons, pas 4 SettingsRow : ce n'est pas un réglage
          de plus, c'est un raccourci d'ÉCRITURE vers les 7 réglages
          d'Activité ci-dessous — GA-26, une dérivation vit à un seul endroit,
          jamais un second stockage de « quelle présélection est active ».
          `custom` reste un `<button>` (ce qui se clique se tabule, GA-35)
          mais DÉSACTIVÉ : rien à écrire pour « personnalisé », c'est un état
          qu'on détecte, jamais qu'on choisit.
        */}
          <div
            role="radiogroup"
            aria-label={t('presetsTitle')}
            className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
          >
            {PRESET_ORDER.map(id => {
              const isCustom = id === 'custom'
              const checked = activePreset === id
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={isCustom}
                  onClick={() => {
                    if (!isCustom) applyPreset(id)
                  }}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors pointer-coarse:min-h-11',
                    checked
                      ? 'border-[var(--bellum-primary-500)] bg-[var(--bellum-surface-2)]'
                      : 'border-[var(--bellum-border)]',
                    isCustom ? 'cursor-default opacity-70' : 'cursor-pointer hover:bg-[var(--bellum-surface-2)]',
                  )}
                >
                  {/* `element="span"` — un `<button>` n'accepte que du contenu de
                    flux en ligne ; `Text` rend un `<p>` par défaut, invalide ici
                    (même convention que `GroupedTabNav`). */}
                  <Text element="span" size="sm" weight="medium" className="block text-[var(--bellum-text-primary)]">
                    {t(PRESET_COPY[id].titleKey)}
                  </Text>
                  <Text element="span" size="xs" className="block text-[var(--bellum-text-secondary)]">
                    {t(PRESET_COPY[id].descriptionKey)}
                  </Text>
                </button>
              )
            })}
          </div>
        </div>

        <QuietHoursRow preferences={preferences} onChange={setPreferences} />

        <SettingsRow
          title={t('channelInAppTitle')}
          description={t('channelInAppDescription')}
          trailing={<Badge variant="success">{t('channelActive')}</Badge>}
        />
        <SettingsRow
          title={t('channelEmailTitle')}
          description={
            user?.email ? t('channelEmailDescription', { email: user.email }) : t('channelEmailDescriptionNoAddress')
          }
          trailing={
            EMAIL_KEYS.some(key => preferences[key]) ? (
              <Badge variant="success">{t('channelActive')}</Badge>
            ) : (
              <Badge variant="outline">{t('channelEmailOff')}</Badge>
            )
          }
        />
        {/* #1938.4 — le canal SMS des alertes urgentes, juste après les réglages qu'il relaie. Visible, et inactif
            tant qu'aucun fournisseur n'est branché — c'est le serveur qui le dit. */}
        <SmsChannelSection bare />
        {/* #1938.3 — le canal notification navigateur : relaie le flux in-app déjà réglé ci-dessus. Aucun type à
            cocher ici — GA-26, un réglage vit à un seul endroit. */}
        <BrowserChannelSection bare />
      </SettingsBlock>

      {/* Règles PERSONNELLES de veille (§11) — secteurs, technos, comptes,
          besoins, personnes à surveiller. Co-localisées avec le choix de cadence
          ci-dessus : « quoi » suivre + « quand » être notifié. */}
      <WatchRulesPointer />
    </motion.div>
  )
}

/**
 * Théo D settings-compte.N1 — la plage de tranquillité : deux heures locales
 * (fuseau du profil) entre lesquelles ni SMS ni notification du navigateur ne
 * sonnent. La cloche garde tout. Écrite en UN PATCH quand les deux heures sont
 * valides, retirée en un geste.
 */
function QuietHoursRow({
  preferences,
  onChange,
}: {
  preferences: NotificationPreferences
  onChange: (patch: UpdateNotificationPreferences) => void
}) {
  const { t } = useTranslation('settings', { keyPrefix: 'notifications' })
  const [start, setStart] = useState(preferences.quiet_hours_start ?? '')
  const [end, setEnd] = useState(preferences.quiet_hours_end ?? '')
  // Relit le serveur quand il répond (le premier rendu part des défauts).
  useEffect(() => {
    setStart(preferences.quiet_hours_start ?? '')
    setEnd(preferences.quiet_hours_end ?? '')
  }, [preferences.quiet_hours_start, preferences.quiet_hours_end])

  const commit = (nextStart: string, nextEnd: string): void => {
    if (TIME.test(nextStart) && TIME.test(nextEnd)) {
      onChange({ quiet_hours_start: nextStart, quiet_hours_end: nextEnd })
    }
  }
  const hasRange = preferences.quiet_hours_start !== null && preferences.quiet_hours_end !== null

  return (
    <SettingsBlock label={t('quietTitle')} description={t('quietDescription')} bare>
      <SettingsRow
        title={t('quietRowTitle')}
        description={t('quietRowDescription')}
        trailing={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="time"
              aria-label={t('quietStartLabel')}
              value={start}
              onChange={e => {
                setStart(e.target.value)
                commit(e.target.value, end)
              }}
              className="h-11 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] px-2 text-sm"
            />
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('quietTo')}
            </Text>
            <input
              type="time"
              aria-label={t('quietEndLabel')}
              value={end}
              onChange={e => {
                setEnd(e.target.value)
                commit(start, e.target.value)
              }}
              className="h-11 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] px-2 text-sm"
            />
            {hasRange && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={() => {
                  setStart('')
                  setEnd('')
                  onChange({ quiet_hours_start: null, quiet_hours_end: null })
                }}
              >
                {t('quietClear')}
              </Button>
            )}
          </div>
        }
      />
    </SettingsBlock>
  )
}

/**
 * Les règles de veille (secteur, technologie, mot-clé…) n'ont qu'UN éditeur : Mes veilles (Théo signaux-veilles,
 * GA-26). Ici, seule la porte — « quand » être notifié reste réglé au-dessus.
 */
function WatchRulesPointer() {
  const { t } = useTranslation('watchlist', { keyPrefix: 'watches' })
  const { t: tSettings } = useTranslation('settings', { keyPrefix: 'notifications' })
  return (
    <p className="mt-6 text-sm text-[var(--bellum-text-secondary)]">
      {t('rulesMovedHere')}{' '}
      <Link to="/signals/watches" className="font-medium text-[var(--bellum-text-accent)] underline underline-offset-2">
        {tSettings('watchRules.link')}
      </Link>
    </p>
  )
}
