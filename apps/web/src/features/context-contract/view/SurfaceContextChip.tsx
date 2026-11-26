import { useTranslation } from 'react-i18next'
import type { ContextMode, ContextSurface } from '@bellum/contracts'
import { Text, Tooltip, TooltipContent, TooltipTrigger } from '@bellum/ui'
import { ContextDisclosure } from '@/features/chat/view/ContextDisclosure'
import { ContextModePicker } from '@/features/work-contexts/view/ContextModePicker'
import { useSurfaceContextContract } from '../api'
import { surfaceDisclosure } from '../surface-disclosure'

/**
 * #2454 (LAU-FINAL-167) — la chip « Contexte » d'une surface hors conversation.
 *
 * - #2454.1 / .6 : la ligne « Contexte utilisé » sous Découvrir et Analyser,
 *   construite CÔTÉ SERVEUR (`GET /context-contract`), rendue par LE panneau de
 *   Laura (`ContextDisclosure`) — un seul composant (GA-26).
 * - #2454.7 : au premier niveau, un PRESET (les modes de Laura), jamais neuf
 *   bascules ; le détail des couches reste derrière le clic. #2451.1 — ce preset
 *   EST le composant de mode de Laura (`ContextModePicker`), pas une copie.
 * - #2454.8 : une couche absente est PROPOSÉE (« Connecter »), jamais activée.
 * - #2454.3 : cette chip ne se pose QUE sur une surface dont le résultat dépend
 *   du profil — la garde `surface-context-chip-placement.test.ts` en tient la liste.
 *
 * #3163 (retour bêta, 28/09/2026) — Louis, sur `/discover` : « mets tout ça
 * sur une ligne, plus simple, net, synthétique ». Le libellé, le mode et la
 * phrase de résumé (`ContextDisclosure`) vivaient chacun sur sa PROPRE ligne
 * (jusqu'à quatre, avec la note de mode et le bouton « En savoir plus ») — ils
 * partagent désormais UNE seule ligne (`flex-nowrap`). Ce qui est COURT (le
 * libellé, le mode) reste toujours entier (`shrink-0`) ; ce qui est LONG (la
 * note de mode, le résumé porté par `ContextDisclosure compact`) tronque et
 * porte son texte complet dans une infobulle — jamais un `title=` brut,
 * invisible au clavier et au tactile. `min-w-0` sur la section et sur chaque
 * segment tronquable : sans lui, un enfant flex ne peut pas rétrécir sous sa
 * largeur de contenu (même cause que #2351, documentée dans `index.css`), et
 * la ligne déborderait au lieu de tronquer — y compris sur mobile.
 */
export function SurfaceContextChip({
  surface,
  mode,
  onModeChange,
}: {
  surface: ContextSurface
  /**
   * #2451.1 — absent : aucun choix fait sur CET écran, le serveur applique le
   * défaut de l'espace (`workspaces.default_context_mode`) et la chip montre le
   * mode qu'il rend — jamais « Mon activité » supposé.
   */
  mode?: ContextMode
  /** Absent : le mode s'affiche sans se choisir. */
  onModeChange?: (mode: ContextMode) => void
}) {
  const { t } = useTranslation('chat')
  const { data } = useSurfaceContextContract(surface, mode)
  if (!data) return null

  const { context, copy } = surfaceDisclosure(data, t)
  const canChoose = onModeChange !== undefined && data.modes_available.length > 1
  const note =
    data.mode === 'neutral'
      ? t('contextContract.neutralNote')
      : data.mode === 'one_off_mission'
        ? t('contextContract.oneOffNote')
        : null

  return (
    <section
      data-surface-context={surface}
      aria-label={t('contextContract.modeGroup')}
      // #3378 — retour bêta 30/09 : « centrer le bouton "mon activité" en
      // hauteur […] c'est bizarre qu'il soit justifié sur la ligne du haut ».
      // `items-start` alignait chaque segment sur le HAUT de la rangée —
      // inoffensif tant que tout est du texte de même taille, mais le
      // sélecteur de mode (`ContextModePicker`, un bouton de 32 px) dépasse
      // la hauteur d'une ligne de texte : son haut touchait celui du
      // libellé « Contexte », son bas retombait sous la phrase. `items-center`
      // aligne les MILIEUX — texte et bouton partagent un axe, comme une
      // vraie phrase.
      className="flex min-w-0 flex-nowrap items-center gap-2"
    >
      <Text size="xs" weight="medium" className="shrink-0 text-[var(--bellum-text-muted)]">
        {t('contextContract.label')}
      </Text>
      <span className="shrink-0">
        {canChoose ? (
          // #2451.1 — LE composant de mode de Laura, pas une seconde rangée de
          // pastilles : même liste (celle que la surface tient), même habillage.
          <ContextModePicker value={data.mode} modes={data.modes_available} onChange={onModeChange} />
        ) : (
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
            {t(`contextContract.modes.${data.mode}`)}
          </Text>
        )}
      </span>
      {note && (
        <>
          {/* Séparateur décoratif : hors du nœud de texte pour que le nom
              accessible — et l'infobulle — restent exactement la phrase,
              jamais « · Phrase ». */}
          <span aria-hidden="true" className="shrink-0 text-[var(--bellum-text-secondary)]">
            ·
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Text
                element="span"
                size="xs"
                tabIndex={0}
                className="min-w-0 shrink cursor-help truncate text-[var(--bellum-text-secondary)] outline-none"
              >
                {note}
              </Text>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              {note}
            </TooltipContent>
          </Tooltip>
        </>
      )}
      <ContextDisclosure compact context={context} surfaceCopy={copy} />
    </section>
  )
}
