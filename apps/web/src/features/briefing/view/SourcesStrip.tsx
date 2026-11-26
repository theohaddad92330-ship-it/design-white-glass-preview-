import type { BriefingBlockState } from '@bellum/contracts'
import { Box, Button, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { briefingAccessIsSwitchedOff } from '../block-state'

/**
 * CE QUE LE BRIEF A RÉELLEMENT PU LIRE, EN UNE LIGNE (#1390).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI EN HAUT, ET POURQUOI UNE SEULE FOIS
 * ─────────────────────────────────────────────────────────────────────────────
 * L'information existait, éparpillée : chaque bloc portait son propre
 * `BlockSourceNote` (« Lu dans ton agenda connecté. » + « Gérer »), soit la même
 * phrase répétée sous deux titres et deux liens vers le même écran. C'est le
 * quatrième invariant du tome 7 — rien n'apparaît deux fois sous la même forme
 * avec le même contenu — et surtout ça ne répondait pas à la question posée :
 * « qu'est-ce que Bellum a pu lire pour produire CE brief ? ». Cette question se
 * lit en haut, d'un coup d'œil, ou elle ne se lit pas.
 *
 * `BlockStateNotice` reste, lui, DANS chaque bloc : il ne dit pas la même chose.
 * Le bandeau annonce l'état ; la notice porte la réparation, à l'endroit précis
 * où l'absence se voit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ON N'AFFICHE PAS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ **Le nom de l'éditeur, jamais** — pas « Google Calendar · connecté », mais
 * « ton agenda · connecté ». Le retour le demandait explicitement ; c'est un
 * arbitrage du dépôt, tenu par `tool-capability-digest.spec.ts` et par le prompt
 * du copilote, dont la seule exception est Réglages › Intégrations, où
 * l'utilisateur autorise lui-même l'accès et où un bouton « Connecter » doit
 * dire ce qu'il connecte. Le lien de ce bandeau y mène.
 *
 * ⚠️ **L'heure de synchro PAR SOURCE, désormais réelle** (#2098.9) — le retour
 * la demandait (« synchro 13:12 · 13:11 ») et `dailyBriefingSchema` ne portait
 * qu'un `generatedAt` pour tout le brief : l'inventer par source aurait été la
 * donnée fictive que la doctrine interdit. Chaque bloc porte maintenant son
 * `readAt` PROPRE (`agenda.readAt`, `mail.readAt`, `tasks.readAt`), posé par le
 * service qui lit CETTE source — `null`, jamais une heure devinée, quand la
 * source n'a pas été lue avec succès (`not_connected` / `missing_scope` /
 * `unavailable`). Elle ne s'affiche donc QUE dans le tiroir de détail, jamais
 * sur la pastille : une ligne qui listerait « — » pour chaque source non lue
 * répéterait ce que la pastille dit déjà, dans une forme qui ressemble à un
 * chiffre. L'entête de l'écran garde « Actualisé à HH:MM », l'heure de CE
 * brief dans son ensemble — les deux coexistent, l'un global, l'autre par
 * source.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES QUATRE ÉTATS
 * ─────────────────────────────────────────────────────────────────────────────
 * Ceux du contrat, pas d'autres : servi, servi à moitié, portée manquante, en
 * panne, non connecté. La pastille suit les tonalités sémantiques du dépôt et
 * elle ne porte AUCUN texte — une couleur fixe ne passe pas AA des deux côtés,
 * le texte reste donc sur les tokens de thème.
 */

/** Les capacités que le brief lit et dont il connaît l'état. */
type SourceCapability = 'agenda' | 'mailbox' | 'tasks'

/** L'état du contrat → la tonalité de la pastille et le mot affiché. */
const TONE: Record<BriefingBlockState, { dot: string; key: string }> = {
  ready: { dot: 'bg-[var(--success-soft-text)]', key: 'sources.connected' },
  partial: { dot: 'bg-[var(--warning-soft-text)]', key: 'sources.partial' },
  missing_scope: { dot: 'bg-[var(--warning-soft-text)]', key: 'sources.missingScope' },
  unavailable: { dot: 'bg-[var(--danger-soft-text)]', key: 'sources.unavailable' },
  not_connected: { dot: 'bg-[var(--bellum-text-muted)]', key: 'sources.notConnected' },
}

/**
 * LA CLÉ D'EXPLICATION RÉELLE — même texte que `BlockStateNotice`, jamais
 * réécrit ici (GA-26 : un réglage vit à un seul endroit). `tasks` n'est pas
 * une capacité branchée : seul `unavailable` peut lui arriver.
 */
function explanationKey(capability: SourceCapability, state: BriefingBlockState): string | null {
  if (capability === 'tasks') return state === 'unavailable' ? 'state.tasksUnavailable' : null
  switch (state) {
    case 'not_connected':
      return `state.${capability}NotConnected`
    case 'missing_scope':
      return `state.${capability}MissingScope`
    case 'partial':
      return `state.${capability}Partial`
    default:
      return null
  }
}

/**
 * LE GESTE DE RÉPARATION — même arbitrage que `BlockStateNotice` : un accès
 * éteint côté fournisseur se répare dans les réglages de l'outil, pas en
 * réessayant ; une panne transitoire (`unavailable` sans accès éteint) ne
 * propose rien, parce que réessayer c'est déjà ce que fait le bouton
 * « Actualiser » de l'en-tête.
 */
function repairKey(capability: SourceCapability, state: BriefingBlockState, providerDisabled: boolean): string | null {
  if (capability === 'tasks') return null
  if (state === 'not_connected') return capability === 'mailbox' ? 'state.connectMailbox' : 'state.connectAgenda'
  if (state === 'missing_scope') return 'state.reconnect'
  if (state === 'unavailable' && providerDisabled) return 'state.check'
  return null
}

/**
 * #2098.13 — LE TIROIR DE DÉTAIL, AVEC SEULEMENT CE QUI EST RÉEL.
 *
 * Le retour d'origine liste sept champs : source, état, dernière
 * synchronisation, permission, ce que ça débloque, erreur, réparation. Le
 * tiroir en rend cinq : la source, son état, son explication (permission + ce
 * que ça débloque, déjà rédigées ENSEMBLE côté serveur sous `state.*` — les
 * séparer inventerait une frontière qui n'existe pas dans le texte source),
 * l'erreur technique quand le serveur en rend une (`reason`, jamais un texte
 * composé ici), et — depuis #2098.9 — la dernière lecture RÉUSSIE de cette
 * source (`readAt`). Les deux qui manquent encore (permission détaillée,
 * réparation) sont couverts autrement : `repairKey` juste en dessous porte le
 * geste, la permission vit dans l'explication.
 */
function SourceDrawer({
  capability,
  state,
  reason,
  readAt,
  timeZone,
  onOpenChange,
}: {
  capability: SourceCapability | null
  state: BriefingBlockState | null
  reason: string | null
  /** #2098.9 — ISO 8601 ou `null` : jamais affiché si la source n'a pas été lue. */
  readAt: string | null
  /** Fuseau du brief — la MÊME heure que celle de l'entête (#2098.9). Sans
   *  lui, le fuseau du navigateur, comme n'importe quel `Intl` sans réglage. */
  timeZone?: string
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation('briefing')
  const open = capability !== null && state !== null
  const providerDisabled = briefingAccessIsSwitchedOff(reason)
  const explanation = open ? explanationKey(capability, state) : null
  const repair = open ? repairKey(capability, state, providerDisabled) : null
  // #2098.9 — jamais une heure devinée : `readAt` absent → rien à formater, et
  // la ligne ne s'affiche pas (« on n'affiche pas ce qu'on n'a pas »).
  const freshness = readAt
    ? new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(readAt))
    : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent closeLabel={t('common:actions.close')}>
        <SheetHeader className="border-b border-[var(--bellum-border)] px-5 py-4">
          <SheetTitle className="text-base capitalize">{open ? t(`source.capability.${capability}`) : ''}</SheetTitle>
          <SheetDescription>{open ? t(TONE[state].key) : ''}</SheetDescription>
        </SheetHeader>
        <Box className="flex flex-col gap-3 px-5 py-4">
          {explanation ? (
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t(explanation)}
            </Text>
          ) : null}
          {freshness ? (
            <Box className="flex flex-col gap-1">
              <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
                {t('sources.drawer.freshnessLabel')}
              </Text>
              <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                {freshness}
              </Text>
            </Box>
          ) : null}
          {reason ? (
            <Box className="flex flex-col gap-1">
              <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
                {t('sources.drawer.errorLabel')}
              </Text>
              <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                {reason}
              </Text>
            </Box>
          ) : null}
          {repair ? (
            <Button asChild size="sm" variant="outline" className="w-fit">
              <Link to="/integrations">{t(repair)}</Link>
            </Button>
          ) : null}
        </Box>
      </SheetContent>
    </Sheet>
  )
}

export function SourcesStrip({
  states,
  reasons,
  readAt,
  timeZone,
}: {
  states: Readonly<Record<SourceCapability, BriefingBlockState>>
  /** Message serveur par capacité — jamais inventé, `null`/absent si aucun. */
  reasons?: Readonly<Partial<Record<SourceCapability, string | null>>>
  /** #2098.9 — dernière lecture RÉUSSIE par capacité, ISO 8601 ou `null`. */
  readAt?: Readonly<Partial<Record<SourceCapability, string | null>>>
  timeZone?: string
}) {
  const { t } = useTranslation('briefing')
  const [openCapability, setOpenCapability] = useState<SourceCapability | null>(null)
  const entries = (Object.keys(states) as SourceCapability[]).map(capability => ({
    capability,
    state: states[capability],
  }))
  // #2111.31 — « Gérer » suppose une connexion déjà là. Le premier jour, il n'y
  // a rien à gérer : seulement à connecter. Le lien reste le même
  // (`/integrations`), seul le mot change avec le fait qu'il décrit.
  const nothingConnected = entries.every(({ state }) => state === 'not_connected')
  // #2098.23 — le verdict global : complet seulement si LES TROIS répondent
  // pleinement. `partial` compte comme incomplet — c'est tout son sens.
  const allReady = entries.every(({ state }) => state === 'ready')

  return (
    <Box className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[var(--bellum-border)] px-4 py-2.5">
      <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
        {t('sources.title')}
      </Text>
      {/* #2098.23 — le verdict global, à côté du titre, pas à sa place : la
          liste par source juste après reste la preuve du verdict. */}
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t(allReady ? 'sources.complete' : 'sources.incomplete')}
      </Text>
      {entries.map(({ capability, state }) => (
        <button
          key={capability}
          type="button"
          onClick={() => setOpenCapability(capability)}
          className="flex items-center gap-1.5 rounded pointer-coarse:min-h-11"
        >
          {/* La pastille est décorative : l'état est ÉCRIT à côté. Une couleur
              seule ne se lit pas sans distinguer les couleurs, et c'est le seul
              cas où une couleur sémantique porterait une information. */}
          <Box className={`size-2 shrink-0 rounded-full ${TONE[state].dot}`} aria-hidden="true" />
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t(`source.capability.${capability}`)} · {t(TONE[state].key)}
          </Text>
        </button>
      ))}
      <Link
        to="/integrations"
        className="ml-auto text-xs text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11 pointer-coarse:inline-flex pointer-coarse:items-center"
      >
        {t(nothingConnected ? 'sources.manageNone' : 'sources.manage')}
      </Link>
      <SourceDrawer
        capability={openCapability}
        state={openCapability ? states[openCapability] : null}
        reason={openCapability ? (reasons?.[openCapability] ?? null) : null}
        readAt={openCapability ? (readAt?.[openCapability] ?? null) : null}
        timeZone={timeZone}
        onOpenChange={open => setOpenCapability(open ? openCapability : null)}
      />
    </Box>
  )
}
