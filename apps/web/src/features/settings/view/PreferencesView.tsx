import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from '@tanstack/react-router'
import {
  Button,
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsRow,
  Switch,
  Text,
} from '@bellum/ui'
import { ArrowRight, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher'
import { useTheme } from '@/features/theme/theme-provider'
import {
  DEFAULT_VIEW_VALUES,
  DENSITY_VALUES,
  NAME_DISPLAY_VALUES,
  SEND_COMMENT_VALUES,
  usePreferences,
  type Density,
  type FontSize,
} from '@/features/preferences/preferences-provider'
import { SidebarCustomizeDialog } from '@/features/settings/components/SidebarCustomizeDialog'
import { useProfile } from '@/features/profiles/hooks/useProfile'
import { useSaveProfile } from '@/features/profiles/hooks/useSaveProfile'
import { TimezoneField, detectedTimeZone } from '@/features/profile/components/TimezoneField'
import { ProfileIdentityPage } from '@/features/profile/view/ProfileIdentityPage'
import { ShortcutsTab } from '@/features/settings/view/ShortcutsTab'
import { BuildInfoAccordion } from '@/features/settings/view/HelpAndAboutGroups'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { SettingsScreenHeader, type SettingsGuide } from '@/features/settings/components/SettingsScreenHeader'
import { SettingsTabs } from '@/features/settings/components/SettingsTabs'

type ThemeOption = 'system' | 'light' | 'dark'
type PreferencesTab = 'display' | 'identity' | 'shortcuts'

const FONT_SIZE_KEYS: { value: FontSize; labelKey: string }[] = [
  { value: 'small', labelKey: 'fontSizeSmall' },
  { value: 'default', labelKey: 'fontSizeDefault' },
  { value: 'large', labelKey: 'fontSizeLarge' },
]

// Théo D settings-prefs.R1 — Clair · Sombre · Système, dans cet ordre.
const THEME_OPTIONS: { value: ThemeOption; icon: LucideIcon; labelKey: string }[] = [
  { value: 'light', icon: Sun, labelKey: 'themeLight' },
  { value: 'dark', icon: Moon, labelKey: 'themeDark' },
  { value: 'system', icon: Monitor, labelKey: 'themeSystem' },
]

/**
 * Ce qui attend le bouton « Enregistrer les modifications » (Théo D
 * settings-prefs.N5). Le thème et la densité n'y sont PAS : ils agissent tout
 * de suite, pour qu'on voie l'effet avant d'enregistrer. Le fuseau y est : il
 * s'écrit sur le profil, jamais en silence.
 */
type DisplayDraft = {
  defaultView: (typeof DEFAULT_VIEW_VALUES)[number]
  nameDisplay: (typeof NAME_DISPLAY_VALUES)[number]
  sendCommentOn: (typeof SEND_COMMENT_VALUES)[number]
  fontSize: FontSize
  pointerCursors: boolean
}

export function PreferencesView({ initialTab = 'display' }: { initialTab?: PreferencesTab }) {
  const { t } = useTranslation('settings', { keyPrefix: 'preferences' })
  const [tab, setTab] = useState<PreferencesTab>(initialTab)
  const guide: SettingsGuide = {
    title: t('guide.title'),
    heading: t('guide.heading'),
    intro: t('guide.intro'),
    stepsTitle: t('guide.stepsTitle'),
    steps: [t('guide.step1'), t('guide.step2'), t('guide.step3')],
    keepTitle: t('guide.keepTitle'),
    keep: t('guide.keep'),
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' as const }}
      className="w-full space-y-6"
    >
      {/* #2456 — Réglages ne monte aucun `PageHeader` : l'en-tête commun porte le seul h1. */}
      <SettingsScreenHeader
        scope="personal"
        title={t('headerTitle')}
        description={t('headerDescription')}
        guide={guide}
      />

      {/* Théo D settings-prefs (Louis 22/10, « barre de matching GARDÉE ») : le
          matching garde son unique écran dans Talents, la barre y renvoie. */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] px-3 py-2">
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('matchingBarText')}
        </Text>
        <Link
          to="/consultants"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
        >
          {t('matchingBarLink')}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      <SettingsTabs
        label={t('headerTitle')}
        value={tab}
        onValueChange={setTab}
        tabs={[
          { key: 'display', label: t('tabDisplay'), content: <DisplayTab /> },
          { key: 'identity', label: t('tabIdentity'), content: <ProfileIdentityPage embedded /> },
          { key: 'shortcuts', label: t('tabShortcuts'), content: <ShortcutsTab /> },
        ]}
      />
    </motion.div>
  )
}

function DisplayTab() {
  const { t } = useTranslation('settings', { keyPrefix: 'preferences' })
  const { theme, setTheme } = useTheme()
  const { preferences, setPreference } = usePreferences()
  const { data: profile } = useProfile()
  const saveProfile = useSaveProfile()

  const [draft, setDraft] = useState<DisplayDraft>({
    defaultView: preferences.defaultView,
    nameDisplay: preferences.nameDisplay,
    sendCommentOn: preferences.sendCommentOn,
    fontSize: preferences.fontSize,
    pointerCursors: preferences.pointerCursors,
  })
  // Le fuseau ENREGISTRÉ gagne sur la détection ; `null` en base ⇒ on PROPOSE ce
  // que ce navigateur annonce, sans rien écrire avant le clic.
  const savedZone = profile?.timezone ?? null
  const [zoneDraft, setZoneDraft] = useState<string | null>(null)
  const zone = zoneDraft ?? savedZone ?? detectedTimeZone()

  const prefsDirty =
    draft.defaultView !== preferences.defaultView ||
    draft.nameDisplay !== preferences.nameDisplay ||
    draft.sendCommentOn !== preferences.sendCommentOn ||
    draft.fontSize !== preferences.fontSize ||
    draft.pointerCursors !== preferences.pointerCursors
  const zoneDirty = !!profile && zone !== '' && zone !== (savedZone ?? '')
  const dirty = prefsDirty || zoneDirty

  const patch = <K extends keyof DisplayDraft>(key: K, value: DisplayDraft[K]) =>
    setDraft(prev => ({ ...prev, [key]: value }))

  const onSave = async (): Promise<void> => {
    if (draft.defaultView !== preferences.defaultView) setPreference('defaultView', draft.defaultView)
    if (draft.nameDisplay !== preferences.nameDisplay) setPreference('nameDisplay', draft.nameDisplay)
    if (draft.sendCommentOn !== preferences.sendCommentOn) setPreference('sendCommentOn', draft.sendCommentOn)
    if (draft.fontSize !== preferences.fontSize) setPreference('fontSize', draft.fontSize)
    if (draft.pointerCursors !== preferences.pointerCursors) setPreference('pointerCursors', draft.pointerCursors)
    if (zoneDirty) {
      try {
        await saveProfile.mutateAsync({ timezone: zone })
        setZoneDraft(null)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('saveFailed'))
        return
      }
    }
    toast.success(t('saved'))
  }

  return (
    <div className="space-y-6">
      {/* Apparence — thème et densité immédiats (N1, R1). Trois vignettes, puis une grille de réglages étiquetés. */}
      <SettingsBlock label={t('sectionAppearance')} description={t('sectionAppearanceHint')}>
        <div className="space-y-5 p-5 sm:p-6">
          <div role="radiogroup" aria-label={t('sectionAppearance')} className="grid gap-3 sm:grid-cols-3">
            {THEME_OPTIONS.map(option => (
              <ThemeCard
                key={option.value}
                option={option}
                label={t(option.labelKey)}
                checked={theme === option.value}
                onSelect={() => setTheme(option.value)}
              />
            ))}
          </div>
          <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
            <LabeledField label={t('densityTitle')} hint={t('densityHint')}>
              <BasicSelect
                ariaLabel={t('densityTitle')}
                value={preferences.density}
                onChange={next => setPreference('density', next as Density)}
                options={DENSITY_VALUES.map(v => ({ value: v, label: t(`density.${v}`) }))}
              />
            </LabeledField>
            <LabeledField label={t('defaultViewTitle')}>
              <BasicSelect
                ariaLabel={t('defaultViewTitle')}
                value={draft.defaultView}
                onChange={v => patch('defaultView', v as DisplayDraft['defaultView'])}
                options={DEFAULT_VIEW_VALUES.map(v => ({ value: v, label: t(`defaultViewOption.${v}`) }))}
              />
            </LabeledField>
            <LabeledField label={t('fontSizeTitle')} hint={t('fontSizeFloorHint')}>
              <BasicSelect
                ariaLabel={t('fontSizeTitle')}
                value={draft.fontSize}
                onChange={v => patch('fontSize', v as FontSize)}
                options={FONT_SIZE_KEYS.map(o => ({ value: o.value, label: t(o.labelKey) }))}
              />
            </LabeledField>
            <div className="flex min-h-11 items-start gap-3 self-end">
              <Switch
                aria-label={t('pointerTitle')}
                checked={draft.pointerCursors}
                onCheckedChange={checked => patch('pointerCursors', checked)}
                className="mt-0.5"
              />
              <div>
                <Text size="sm" weight="medium">
                  {t('pointerTitle')}
                </Text>
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {t('pointerDescription')}
                </Text>
              </div>
            </div>
          </div>
        </div>
      </SettingsBlock>

      {/* Théo D settings-prefs.A1 / A3 / A5 — les trois réglages orphelins, rangés
          dans un seul bloc plutôt qu'empilés sous Apparence. */}
      <SettingsBlock label={t('sectionReading')} description={t('sectionReadingHint')}>
        <SettingsRow
          title={t('nameDisplayTitle')}
          description={t('nameDisplayDescription')}
          trailing={
            // Théo D settings-prefs : une liste déroulante (Nom complet · Prénom · Initiales).
            <div className="w-full sm:w-48">
              <BasicSelect
                ariaLabel={t('nameDisplayTitle')}
                value={draft.nameDisplay}
                onChange={v => patch('nameDisplay', v as DisplayDraft['nameDisplay'])}
                options={NAME_DISPLAY_VALUES.map(v => ({ value: v, label: t(`nameDisplayOption.${v}`) }))}
              />
            </div>
          }
        />
        <SettingsRow
          title={t('sendCommentTitle')}
          description={t('sendCommentDescription')}
          trailing={
            <ChoiceCards
              ariaLabel={t('sendCommentTitle')}
              value={draft.sendCommentOn}
              onChange={v => patch('sendCommentOn', v as DisplayDraft['sendCommentOn'])}
              options={SEND_COMMENT_VALUES.map(v => ({ value: v, label: t(`sendCommentOption.${v}`) }))}
            />
          }
        />
        <SettingsRow
          title={t('sidebarTitle')}
          description={t('sidebarDescription')}
          trailing={<SidebarCustomizeDialog />}
        />
      </SettingsBlock>

      {/* Théo D settings-prefs.R3 — langue ET fuseau, un seul bloc : deux champs étiquetés côte à côte, puis la
          portée du fuseau (les veilles existantes ne bougent pas). */}
      <SettingsBlock label={t('sectionLanguage')} description={t('sectionLanguageHint')}>
        <div className="space-y-4 p-5 sm:p-6">
          <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
            <LabeledField label={t('languageTitle')} hint={t('languageDescription')}>
              <LanguageSwitcher variant="inline" />
            </LabeledField>
            <LabeledField label={t('timezoneTitle')}>
              {profile ? (
                <TimezoneField value={zone} savedTimezone={savedZone} onChange={setZoneDraft} />
              ) : (
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('timezoneLoading')}
                </Text>
              )}
            </LabeledField>
          </div>
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('timezoneHint')}
          </Text>
        </div>
      </SettingsBlock>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text size="sm" className="text-[var(--bellum-text-secondary)]" role="status">
          {dirty ? t('pendingChanges') : t('noPendingChanges')}
        </Text>
        <Button
          type="button"
          variant="violet"
          isLoading={saveProfile.isPending}
          loadingText={t('saving')}
          disabled={!dirty || saveProfile.isPending}
          onClick={() => void onSave()}
        >
          {t('save')}
        </Button>
      </div>

      {/* Théo D settings-prefs.A6 — version et parité de release, utiles au support : un repli, fermé. */}
      <BuildInfoAccordion />
    </div>
  )
}

/** Une vignette de thème : un aperçu miniature (barre latérale + carte), le nom, un rond de choix. */
function ThemeCard({
  option,
  label,
  checked,
  onSelect,
}: {
  option: { value: ThemeOption; icon: LucideIcon }
  label: string
  checked: boolean
  onSelect: () => void
}) {
  const Icon = option.icon
  // L'aperçu montre le thème qu'il représente, pas celui de l'app : `data-theme` borne les jetons à la vignette.
  const preview =
    option.value === 'light'
      ? 'bg-neutral-50 [&>span:first-child]:bg-neutral-200 [&>span:last-child]:bg-white [&>span:last-child]:border-neutral-200'
      : option.value === 'dark'
        ? 'bg-neutral-900 [&>span:first-child]:bg-neutral-800 [&>span:last-child]:bg-neutral-700 [&>span:last-child]:border-neutral-700'
        : 'bg-gradient-to-r from-neutral-50 to-neutral-900 [&>span:first-child]:bg-neutral-400/40 [&>span:last-child]:bg-neutral-500/40 [&>span:last-child]:border-neutral-500/40'
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        'relative flex min-h-11 flex-col gap-3 rounded-xl border p-4 text-left transition-colors',
        checked
          ? 'border-[var(--bellum-text-accent)] bg-[var(--bellum-bg-lighter)]'
          : 'border-[var(--bellum-border)] hover:bg-[var(--bellum-bg-lighter)]',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute right-4 top-4 size-4 rounded-full border-2',
          checked
            ? 'border-[var(--bellum-text-accent)] bg-[var(--bellum-text-accent)] shadow-[inset_0_0_0_3px_var(--bellum-bg-lighter)]'
            : 'border-[var(--bellum-border)]',
        )}
      />
      <span
        aria-hidden
        className={cn(
          'flex h-16 w-24 items-center gap-1.5 rounded-lg border border-[var(--bellum-border)] p-2',
          preview,
        )}
      >
        <span className="h-full w-3 rounded-sm" />
        <span className="h-8 flex-1 rounded-sm border" />
      </span>
      <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--bellum-text-primary)]">
        <Icon className="size-4 text-[var(--bellum-text-muted)]" aria-hidden />
        {label}
      </span>
    </button>
  )
}

/** Un réglage étiqueté au-dessus de son contrôle, avec une phrase d'aide dessous. */
function LabeledField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Text element="p" size="sm" weight="medium">
        {label}
      </Text>
      {children}
      {hint ? (
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {hint}
        </Text>
      ) : null}
    </div>
  )
}

/**
 * Des cartes à choisir (vignettes) : un `radiogroup`, une carte par valeur.
 * Chaque carte fait ≥ 44 px (GA-35) — la densité « Compacte » ne les resserre
 * jamais.
 */
function ChoiceCards({
  ariaLabel,
  value,
  onChange,
  options,
}: {
  ariaLabel: string
  value: string
  onChange: (next: string) => void
  options: { value: string; label: string; icon?: LucideIcon }[]
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map(option => {
        const checked = option.value === value
        const Icon = option.icon
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.value)}
            className={`inline-flex min-h-11 min-w-24 items-center justify-center gap-2 rounded-lg border px-3 text-sm transition-colors ${
              checked
                ? 'border-[var(--bellum-text-accent)] bg-[var(--bellum-bg-lighter)] text-[var(--bellum-text-primary)]'
                : 'border-[var(--bellum-border)] text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-bg-lighter)]'
            }`}
          >
            {Icon ? <Icon className="size-4" aria-hidden /> : null}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function BasicSelect({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string
  onChange: (next: string) => void
  options: readonly { value: string; label: string }[]
  ariaLabel?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={ariaLabel}
        className="h-11 w-full border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] text-sm text-[var(--bellum-text-primary)] sm:w-full"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(o => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
