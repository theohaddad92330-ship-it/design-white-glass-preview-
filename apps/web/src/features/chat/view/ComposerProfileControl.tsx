import { useTranslation } from 'react-i18next'
import { useConversationContextMode } from '@/features/work-contexts/useConversationContextMode'

/**
 * #5048 — « MON PROFIL » : UN INTERRUPTEUR binaire Mon activité ↔ Neutre dans la barre du composeur.
 *
 * Revient sur #5048 (menu 3 choix) : arbitrage Louis 01/11/2026 (recette prod 935b310d : PARTIAL).
 * Garde #3772.1 / #5048 : même magasin par fil (`contextModeStore`), aucun quatrième mode. Allumé =
 * Mon activité ; éteint = Neutre. « Mission ponctuelle » (posée hors de ce contrôle) s'affiche
 * ÉTEINT et NOMMÉE — jamais un état mensonger ; basculer repasse à Mon activité.
 */
export function ComposerProfileControl({
  conversationId,
  disabled,
}: {
  conversationId: string | null
  disabled?: boolean
}) {
  const { t } = useTranslation('workContexts')
  const { current, choose } = useConversationContextMode(conversationId)
  const on = current === 'my_activity'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled || !conversationId}
      onClick={() => choose(on ? 'neutral' : 'my_activity')}
      title={t(`mode.profileSwitch.help.${current}`)}
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--bellum-border)] px-3 text-left text-sm text-[var(--bellum-text-secondary)] outline-none transition-colors hover:bg-[var(--bg-glass)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)] disabled:opacity-50"
    >
      <span
        aria-hidden="true"
        className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${
          on ? 'bg-[var(--bellum-primary-500)]' : 'bg-[var(--bellum-border)]'
        }`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-[var(--bellum-surface-1)] transition-[left] ${
            on ? 'left-[1.125rem]' : 'left-0.5'
          }`}
        />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-medium">
          {t('mode.profileSwitch.label')} : {t(`mode.profileSwitch.state.${current}`)}
        </span>
        <span className="text-xs">{t(`mode.profileSwitch.help.${current}`)}</span>
      </span>
    </button>
  )
}
