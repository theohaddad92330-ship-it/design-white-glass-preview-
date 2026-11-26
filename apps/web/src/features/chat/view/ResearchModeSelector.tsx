import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { CHAT_MODE_POLICY_FACTS, CHAT_RESEARCH_MODES, type ChatResearchMode } from '@bellum/contracts'
import { SelectField } from '@bellum/ui'
import { researchModeFor, useResearchModeStore } from '../researchModeStore'
import { useChatModeEstimate } from '../hooks/useChatModeEstimate'
import { chatModeEstimateAnnouncement } from './chat-mode-estimate-text'

/**
 * #2450.4 / #2448.5 (épopée #2882) — les modes dont la POLITIQUE force le
 * palier fort (`deep`) : les seuls dont le coût/la durée valent la peine d'être
 * annoncés avant le run. Lu sur `CHAT_MODE_POLICY_FACTS` (miroir du service IA,
 * parité testée) — plus une liste écrite à la main ici (GA-26).
 */
const DEEP_TIER_MODES: readonly ChatResearchMode[] = CHAT_RESEARCH_MODES.filter(
  mode => CHAT_MODE_POLICY_FACTS[mode].tier === 'deep',
)

/**
 * #3774.2.2 — ce qu'un mode fait, en une ligne, lue sur `CHAT_MODE_POLICY_FACTS` : la profondeur,
 * puis la recherche publique quand elle n'est pas laissée à Laura. Pour Auto, c'est la phrase
 * « Laura choisit la profondeur » — qui ne vit plus en permanence dans la barre de saisie.
 */
function modePolicyDescription(mode: ChatResearchMode, t: TFunction<'chat'>): string {
  const policy = CHAT_MODE_POLICY_FACTS[mode]
  return [
    t(`composer.researchMode.policy.tier.${policy.tier}`),
    policy.publicSearch === 'auto' ? null : t(`composer.researchMode.policy.search.${policy.publicSearch}`),
  ]
    .filter((part): part is string => part !== null)
    .join(' · ')
}

/**
 * #2450.1 / #2448.1 (reste, épopée #2882) — LE SÉLECTEUR « MODE DE RECHERCHE »,
 * sous le composeur de l'écran `/chat` plein écran.
 *
 * Deuxième des six surfaces produit nommées par #2448.1 (après la bulle,
 * `LauraBubblePanel`, câblée lot r7 du 26/09) : même mécanisme, un magasin
 * PAR FIL distinct (`researchModeStore`, voir son docblock). Le mode part avec
 * CHAQUE tour (`askLauraStreaming`, `laura-turn.ts`) ; c'est le service IA qui
 * en tire le palier de modèle et la consigne de comportement
 * (`chat_model_routing.py`, `research_mode.py`) — ce composant n'écrit rien
 * d'autre que le choix.
 */
export function ResearchModeSelector({
  conversationId,
  disabled,
}: {
  conversationId: string | null
  disabled?: boolean
}) {
  const { t } = useTranslation('chat')
  const modes = useResearchModeStore(s => s.modes)
  const setMode = useResearchModeStore(s => s.setMode)
  const current = researchModeFor(modes, conversationId)
  const forcesDeepTier = DEEP_TIER_MODES.includes(current)
  // #2448.8 / #2882.11 — n'interroge le serveur QUE pour un mode qui force le
  // palier fort : Rapide et Auto n'ont rien à estimer (voir docblock ci-dessus).
  const { data } = useChatModeEstimate('deep', forcesDeepTier)
  const announcement = forcesDeepTier ? chatModeEstimateAnnouncement(data?.estimate ?? null) : null
  const policyHint = CHAT_MODE_POLICY_FACTS[current].proposesUpgrade ? t('composer.researchMode.policy.upgrade') : null
  const announcementText = announcement
    ? t(announcement.key, 'params' in announcement ? announcement.params : undefined)
    : null

  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5"
      // Le mode ACTIF reste annoncé par le déclencheur ; sa conséquence au survol et au focus.
      title={[modePolicyDescription(current, t), policyHint].filter(Boolean).join(' · ')}
    >
      <SelectField
        id="chat-research-mode"
        size="sm"
        value={current}
        onChange={next => conversationId && setMode(conversationId, next as ChatResearchMode)}
        ariaLabel={t('composer.researchMode.label')}
        options={CHAT_RESEARCH_MODES.map(mode => ({
          value: mode,
          label: t(`composer.researchMode.options.${mode}`),
          // #3774.2.2 — ce que chaque mode FAIT s'explique ICI, dans le menu ouvert, une seule
          // fois (GA-26) : la barre n'affiche plus de phrase permanente. Lu sur la politique du mode.
          description: modePolicyDescription(mode, t),
        }))}
        disabled={disabled || !conversationId}
        // #3320 / #3321 — PETIT, à gauche de « Que puis-je demander » : `w-auto`
        // défait le `w-full` du déclencheur, qui prenait une ligne entière.
        // #3709 — `min-w-fit shrink-0` : le déclencheur gardait `min-w-0` et se laissait écraser
        // (44 px pour 60 px de contenu, « Approfondi » coupé).
        className="min-h-11 w-auto min-w-fit shrink-0 gap-1.5 text-xs"
      />
      {/* #3709 — LA RANGÉE NE CHANGE JAMAIS DE HAUTEUR : l'estimation, quand il y en a
          une, tient dans un emplacement tronqué (texte entier au survol via `title`).
          #3774.2 — plus de phrase permanente sur la politique : elle s'explique dans
          le menu ouvert et au survol du sélecteur. */}
      {announcementText && (
        <span
          className="max-w-40 shrink truncate text-[var(--bellum-text-muted)] text-xs"
          data-testid="chat-research-mode-estimate"
          title={announcementText}
        >
          {announcementText}
        </span>
      )}
    </span>
  )
}
