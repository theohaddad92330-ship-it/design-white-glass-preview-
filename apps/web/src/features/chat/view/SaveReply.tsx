import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bookmark, Check } from 'lucide-react'
import { defaultMemoryScope, type MemoryItemKind } from '@bellum/contracts'
import { Box, Button, Text } from '@bellum/ui'
import { trackMemoryAdded } from '@/lib/product-tracker'
import { MEMORY_GESTURE_SCREEN } from '@/features/memory/memory-gesture-screen'
import { usePinFact } from '@/features/memory/hooks/usePinFact'
import { parseStructuredReply } from './StructuredReply'

/**
 * « Sauvegarder cette réponse » (restitution V2 §13).
 *
 * Une conclusion utile du copilote se perdait avec le fil : la seule façon de la
 * garder était de la recopier à la main dans la carte Mémoire. Ce bouton épingle
 * la conclusion dans la MÊME mémoire (`memory_pinned_facts`) via l'endpoint
 * d'épinglage EXISTANT (`POST /memory/facts`, hook `usePinFact`) — aucun second
 * chemin d'écriture n'est créé, et la carte Mémoire du rail droit se rafraîchit
 * toute seule (le hook invalide `memoryKeys.all`).
 *
 * Ce qui est épinglé est un EXTRAIT VERBATIM de la réponse, jamais un résumé
 * fabriqué côté client : réécrire la conclusion pour la raccourcir serait
 * inventer une phrase que le copilote n'a pas écrite.
 */

/** Plafond serveur d'un fait épinglé (`pinFactSchema`, max 2000). */
const PINNED_FACT_MAX = 2000

/**
 * La conclusion à retenir d'une réponse : la section qui la PORTE quand la
 * réponse est structurée, sinon le texte tel quel. Toujours bornée à ce que le
 * serveur accepte, coupée sur un mot.
 *
 * #1924.1 — DEUX STRUCTURES, DEUX SECTIONS DE CONCLUSION. Un plan conclut par
 * son « Objectif » ; un conseil, depuis la décision du 16/09/2026, conclut par
 * son « Verdict » et n'a aucune section « Objectif ». La recherche suit donc cet
 * ORDRE de préférence, elle ne remplace rien : une réponse qui porterait les
 * deux (le prompt l'interdit — « UN SEUL FORMAT PAR RÉPONSE ») garderait son
 * verdict, qui est la décision, plutôt que l'objectif, qui est l'intention.
 *
 * Sans cette lecture, un conseil n'aurait retourné AUCUNE section connue et le
 * bouton aurait épinglé les quatre sections entières — le défaut est silencieux,
 * c'est pourquoi il a son test.
 */
const CONCLUSION_KEYS = ['verdict', 'objective'] as const

export function replyConclusion(text: string): string {
  const parsed = parseStructuredReply(text)
  const conclusion = CONCLUSION_KEYS.map(key => parsed?.sections.find(section => section.key === key)).find(section =>
    section?.body?.trim(),
  )
  // L'intitulé peut déjà porter ses deux points (« **Objectif :** ») — on les
  // retire pour ne pas les doubler.
  const label = (conclusion?.title ?? '').replace(/[\s:\uff1a.-]+$/, '')
  const source = conclusion ? `${label} : ${conclusion.body}` : text
  return truncate(source.trim().replace(/\n{3,}/g, '\n\n'), PINNED_FACT_MAX)
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  const cut = value.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/**
 * #1962.11 à .16 — LES NATURES OFFERTES SOUS UNE RÉPONSE, DANS L'ORDRE DU CHOIX.
 *
 * Cinq, pas sept : `sourced_observation` et `temporary_context` ne se décident
 * pas en lisant une réponse (l'une suppose de citer une source, l'autre une
 * échéance) — elles restent offertes là où on rédige l'élément, dans la carte
 * Mémoire et dans Réglages › Mémoire, qui parcourent `memoryItemKinds` entier.
 *
 * `correction` n'apparaît que sur un fil de COMPTE (#1962.14) : « la correction
 * du compte » sans compte ne corrige rien, et l'offrir promettrait un geste qui
 * n'aboutirait pas.
 *
 * ⚠️ La liste ne porte AUCUNE portée : elle se dérive de la nature et du compte
 * par `defaultMemoryScope`, la même dérivation que la carte Mémoire et que la
 * carte de confirmation de Laura (GA-26). Deux tables de portées divergeraient.
 */
const SAVE_AS_KINDS = ['fact', 'preference', 'workspace_rule', 'hypothesis', 'correction'] as const

export function SaveReply({ text, accountId }: { text: string; accountId: string | null }) {
  const { t } = useTranslation(['chat', 'knowledge'])
  const pin = usePinFact()
  const [savedKind, setSavedKind] = useState<MemoryItemKind | null>(null)
  // #1962.11 — le bouton OUVRE le choix ; il n'écrit plus rien à lui seul.
  const [choosing, setChoosing] = useState(false)

  const fact = replyConclusion(text)
  if (!fact) return null

  const offered = SAVE_AS_KINDS.filter(kind => kind !== 'correction' || accountId)

  // `origin: 'copilot'` (restitution V2 §20) : cet élément de mémoire vient
  // d'une réponse du copilote, pas d'une saisie à la main. C'est un FAIT sur sa
  // provenance, pas une supposition — la carte Mémoire l'affiche tel quel.
  //
  // #1918.6 / #1962.12 — la portée n'est pas choisie ici : elle se DÉRIVE de la
  // nature et du compte (`defaultMemoryScope`, décision du 12/09 — « toi
  // uniquement », sauf ce dont le nom dit qu'il est partagé). Sans elle, le
  // serveur retomberait sur la portée d'avant ce lot — partagée — et une
  // conclusion personnelle deviendrait une règle de toute l'ESN.
  const save = (kind: MemoryItemKind) =>
    pin.mutate(
      { fact, accountId, kind, origin: 'copilot' as const, scope: defaultMemoryScope({ kind, accountId }) },
      {
        onSuccess: () => {
          // #1946.11 — au SUCCÈS, et l'écran seul : ce qui est épinglé est un
          // extrait verbatim d'une réponse, donc du contenu — il ne sort jamais.
          trackMemoryAdded(MEMORY_GESTURE_SCREEN)
          setSavedKind(kind)
          setChoosing(false)
        },
      },
    )

  // #5032.10 — une icône de signet NOMMÉE (GA-32) au lieu d'un bouton à libellé : la rangée du pied tient sur
  // une ligne. Le choix de la nature (fait, préférence, règle…) s'ouvre dessous, sur sa propre ligne
  // (`order-last basis-full`, comme le panneau de `ReplyFeedback`). Revient sur le libellé « Sauvegarder cette réponse ».
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-[var(--bellum-text-muted)]"
        disabled={savedKind !== null || pin.isPending}
        isLoading={pin.isPending}
        aria-label={
          savedKind ? t('chat:save.savedAs', { kind: t(`knowledge:memory.kind.${savedKind}`) }) : t('chat:save.aria')
        }
        aria-expanded={choosing}
        onClick={() => setChoosing(open => !open)}
      >
        {savedKind ? <Check className="size-3.5" aria-hidden /> : <Bookmark className="size-3.5" aria-hidden />}
      </Button>

      {choosing && savedKind === null ? (
        <Box className="order-last w-full max-w-sm basis-full rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-2">
          <Text size="xs" weight="semibold" className="px-1 pb-1 text-[var(--bellum-text-muted)]">
            {t('chat:save.as')}
          </Text>
          {offered.map(kind => (
            <button
              key={kind}
              type="button"
              disabled={pin.isPending}
              // GA-35 / GA-30 — ce qui se clique se tabule, et se touche à 44 px.
              className="flex min-h-11 w-full flex-col items-start rounded-md px-2 py-1.5 text-left outline-none transition-colors hover:bg-[var(--bellum-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)] disabled:cursor-not-allowed"
              onClick={() => save(kind)}
            >
              <Text size="sm" className="text-[var(--bellum-text-primary)]">
                {t(`knowledge:memory.kind.${kind}`)}
              </Text>
              {/* #1917.4 / #1918.9 — QUI le verra, AVANT le clic : aucune
                  mémorisation dont la visibilité se découvre après. */}
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {t(`knowledge:memory.scope.${defaultMemoryScope({ kind, accountId })}`)}
                {' — '}
                {t(`knowledge:memory.kindHint.${kind}`)}
              </Text>
            </button>
          ))}
        </Box>
      ) : null}
    </>
  )
}
