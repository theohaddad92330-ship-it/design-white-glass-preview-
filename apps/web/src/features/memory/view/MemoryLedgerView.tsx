import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { BookOpen, PencilLine, ShieldAlert, X } from 'lucide-react'
import {
  MEMORY_LAYERS,
  MEMORY_LEDGER_SECTIONS,
  MEMORY_NEVER_STORED,
  isDeclaredMemoryLayer,
  memoryDeclaredCorrectionOf,
  memoryLedgerSectionOf,
  isReplyPreferenceKey,
  type MemoryItemReassignableScope,
  type MemoryLayer,
  type MemoryLedger,
  type MemoryLedgerEntry,
  type MemoryLedgerSection,
} from '@bellum/contracts'
import { Badge, Box, Button, MOTION, Text } from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { ModalPortal } from '@/components/overlay/ModalPortal'
import {
  useForgetAllMemory,
  useForgetMemoryEntry,
  useMemoryLedger,
  useSetFactScope,
} from '@/features/memory/hooks/useMemoryLedger'
import { formatMemoryDate } from '@/features/memory/lib/memory-dates'
import { MemoryFactRow } from '@/features/memory/view/MemoryFactRow'
import { useMemoryScopeOptions } from '@/features/memory/hooks/useMemoryScopeOptions'
import { MemoryAddDialog } from './MemoryAddDialog'
import { ProfileQuestionnaireDialog } from '@/features/onboarding/components/ProfileQuestionnaireDialog'
import { stageQuestions, TEMPS1_STAGES } from '@/features/onboarding/lib/questions'
import { ReplyPreferencesSettings } from '@/features/memory/view/ReplyPreferencesSettings'
import { MessageApproachSettings } from '@/features/memory/view/MessageApproachSettings'
import { ProtectedTimeSettings } from '@/features/memory/view/ProtectedTimeSettings'
import { AgendaPreferencesSettings } from '@/features/memory/view/AgendaPreferencesSettings'
import { SettingsScreenHeader } from '@/features/settings/components/SettingsScreenHeader'

/**
 * Où se CORRIGE une couche déclarée. Elle ne s'oublie pas depuis cet écran :
 * l'effacer ici détruirait une configuration saisie exprès — et une suppression
 * ne remplace pas une correction. Un réglage vit à un seul endroit (GA-26) ;
 * celui-ci renvoie chez lui plutôt que d'en ouvrir un second.
 */
const DECLARED_SETTINGS: Record<string, string> = {
  identity: '/settings/profile/identity',
  workspace: '/settings/profile',
}

/**
 * #1916 — les COUCHES dont chaque section tire ses lignes. Une section dont une
 * couche n'a pas pu être lue ne dit pas « rien ici » : elle dit qu'elle n'a pas
 * pu lire. « Documents de référence » ne lit aucune couche — c'est un renvoi.
 * « Objectifs personnels » lit aussi l'identité déclarée (Q2, 13/09).
 */
const SECTION_LAYERS: Readonly<Record<MemoryLedgerSection, readonly MemoryLayer[]>> = {
  personalPreferences: ['facts', 'preferences'],
  personalObjectives: ['facts', 'identity'],
  esnRules: ['facts'],
  accountContext: ['facts'],
  corrections: ['facts'],
  referenceDocuments: [],
  temporary: ['facts'],
  teamContext: ['facts'],
}

/**
 * Les couches rendues ENTIÈREMENT par les sections. Les autres gardent leur
 * groupe, moins les lignes qu'une section a prises (l'objectif et la cible
 * déclarés quittent « Ce que Laura sait de toi ») : une ligne ne s'affiche
 * jamais deux fois.
 */
const SECTIONED_LAYERS = new Set<MemoryLayer>(['facts', 'preferences'])

/** #1916.10 — où vivent les documents que Laura consulte (un réglage vit à un seul endroit, GA-26). */
const REFERENCE_DOCUMENTS_PATH = '/settings/knowledge'

/**
 * RÉGLAGES › MÉMOIRE DE LAURA — l'écran dédié qu'exige le tome 6 §12.1.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, CITÉE À LA SOURCE
 * ─────────────────────────────────────────────────────────────────────────────
 * « L'utilisateur voit cette mémoire, en clair, dans un écran dédié, et peut en
 * supprimer n'importe quelle ligne. **Une mémoire invisible est une mémoire
 * dangereuse.** »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1916 — QUATRE QUESTIONS : QUOI, POURQUOI, POUR QUI, COMMENT LE CHANGER
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce qui est épinglé se lit par SECTIONS (préférences, objectifs, règles de
 * l'ESN, compte, corrections, documents, temporaires), dérivées de la ligne par
 * le contrat (`memoryLedgerSectionOf`) — pas d'une seconde classification. Chaque
 * élément dit d'où il vient, qui l'a posé, pourquoi il pèse et où Laura s'en sert
 * (`MemoryFactRow`). Les autres couches (le fil, les refus, les deux profils
 * déclarés) gardent leur groupe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI L'ÉCRAN NE COMPTE RIEN
 * ─────────────────────────────────────────────────────────────────────────────
 * Pas de « 3 lignes retenues » en entête. Une couche dont la lecture a échoué
 * ferait baisser ce total sans que rien ne le dise : le chiffre le plus visible
 * de l'écran serait le seul faux. Chaque groupe répond pour lui-même — des
 * lignes, « rien », ou « je n'ai pas pu lire », qui ne sont PAS la même phrase.
 */
export function MemoryLedgerView() {
  const { t } = useTranslation('knowledge')
  const { data: ledger, isLoading, isError } = useMemoryLedger()
  const forgetAll = useForgetAllMemory()
  const [confirming, setConfirming] = useState(false)
  const [adding, setAdding] = useState(false)

  return (
    <Box className="flex flex-col gap-1">
      {/* Théo D settings-laura (Mémoire) — l'en-tête commun : eyebrow « Personnel » (la mémoire est la tienne), titre, phrase, et « Ajouter un
          élément » à droite (N3 / R2 / A3 — une mémoire CHOISIE : rien n'y entre à son insu). */}
      <Box className="mb-6">
        <SettingsScreenHeader
          scope="personal"
          title={t('memoryLedger.title')}
          description={t('memoryLedger.subtitle')}
          actions={
            <Button variant="violet" size="sm" className="pointer-coarse:min-h-11" onClick={() => setAdding(true)}>
              {t('memoryLedger.add.action')}
            </Button>
          }
        />
      </Box>
      {adding ? <MemoryAddDialog open onOpenChange={setAdding} /> : null}

      {isLoading ? (
        <Text element="p" size="sm" color="text-[var(--bellum-text-muted)]">
          {t('memoryLedger.loading')}
        </Text>
      ) : isError || !ledger ? (
        /* Une mémoire illisible se DIT. Des sections « rien à afficher » se
           liraient « Laura ne retient rien » — une phrase fausse et rassurante,
           exactement le « zéro qui ment » que ce dépôt traque partout. */
        <Text element="p" size="sm" color="text-[var(--bellum-text-muted)]">
          {t('memoryLedger.unavailable')}
        </Text>
      ) : (
        <LedgerGroups ledger={ledger} />
      )}

      {confirming && (
        <ForgetAllDialog
          pending={forgetAll.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            forgetAll.mutate()
          }}
        />
      )}

      {/* Ce que Laura ne mémorise JAMAIS (§12.2). Il tient sa place ICI, sous ce
          qu'elle retient : c'est la moitié de la réponse à « qu'est-ce qu'elle
          sait de moi ? », et la seule qui ne peut pas se lire dans une liste. */}
      <SettingsBlock label={t('memoryLedger.never.title')}>
        <Box className="flex flex-col gap-2 p-4">
          {MEMORY_NEVER_STORED.map(rule => (
            <Box key={rule} className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
              <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
                {t(`memoryLedger.never.${rule}`)}
              </Text>
            </Box>
          ))}
        </Box>
        {/* TOUT OUBLIER — Théo : la dernière ligne du bloc, après ce qui ne part jamais. Il vit SOUS les couches,
            jamais au-dessus : on le rencontre après avoir lu ce qui part. Il ne s'active jamais d'un seul clic. */}
        <Box className="flex flex-wrap items-start justify-between gap-3 border-t border-[var(--bellum-border)] p-4">
          <Box className="min-w-0 max-w-xl space-y-1">
            <Text element="h3" size="sm" weight="medium">
              {t('memoryLedger.forgetAll.action')}
            </Text>
            <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
              {t('memoryLedger.forgetAll.goes')}
            </Text>
            <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
              {t('memoryLedger.forgetAll.stays')}
            </Text>
          </Box>
          <Button variant="destructive" size="sm" onClick={() => setConfirming(true)} disabled={forgetAll.isPending}>
            {forgetAll.isPending ? t('memoryLedger.forgetAll.pending') : t('memoryLedger.forgetAll.action')}
          </Button>
        </Box>
      </SettingsBlock>
    </Box>
  )
}

/** Les sections de #1916, un groupe « épinglé » pour une API plus ancienne, puis les autres couches. */
function LedgerGroups({ ledger }: { ledger: MemoryLedger }) {
  const { t } = useTranslation('knowledge')
  const forget = useForgetMemoryEntry()
  const setScope = useSetFactScope()
  // #1918.2 — les périmètres que la personne PORTE, pour NOMMER celui d'une
  // ligne d'équipe. Un identifiant affiché tel quel ne dirait rien ; un « mon
  // équipe » générique serait le libellé déclaratif qu'on refuse. Lu ICI, une
  // fois : `MemoryFactRow` se monte par dizaines et dans des suites sans
  // fournisseur react-query.
  const businessUnitNames = Object.fromEntries(
    useMemoryScopeOptions()
      .filter(offer => offer.businessUnitId)
      .map(offer => [offer.businessUnitId as string, offer.businessUnitName ?? '']),
  )
  const rowProps = {
    onForget: (entry: MemoryLedgerEntry) => forget.mutate({ layer: entry.layer, id: entry.id }),
    forgetting: forget.isPending,
    onSetScope: (id: string, scope: MemoryItemReassignableScope) => setScope.mutate({ id, scope }),
    settingScope: setScope.isPending,
    businessUnitNames,
  }
  // Un fait servi sans nature ni portée (API antérieure) n'est rangé dans aucune
  // section : il reste visible dans le groupe historique plutôt que deviné.
  const unsectionedFacts = ledger.entries.filter(
    entry => entry.layer === 'facts' && memoryLedgerSectionOf(entry) === null,
  )
  return (
    <>
      {MEMORY_LEDGER_SECTIONS.map(section => (
        <SectionGroup
          key={section}
          section={section}
          // #1928.9 / #2101.13 — les réglages de réponse ET le temps protégé
          // vivent dans le MÊME sac que les préférences libres : ils se
          // règlent en tête de leur section, et ne se répètent pas plus bas
          // en ligne brute (« short »).
          lead={
            section === 'personalPreferences' ? (
              <Box className="flex flex-col gap-3">
                <ReplyPreferencesSettings />
                {/* #4060 — l'approche directe des messages écrits à un tiers (distincte du ton de Laura). */}
                <MessageApproachSettings />
                <ProtectedTimeSettings />
                <AgendaPreferencesSettings />
              </Box>
            ) : null
          }
          entries={ledger.entries.filter(
            entry =>
              memoryLedgerSectionOf(entry) === section &&
              !(
                section === 'personalPreferences' &&
                (isReplyPreferenceKey(entry.id) || entry.id === 'protectedTime' || entry.id === 'agendaPreferences')
              ),
          )}
          unreadable={SECTION_LAYERS[section].some(layer => ledger.unreadableLayers.includes(layer))}
          {...rowProps}
        />
      ))}
      {unsectionedFacts.length > 0 && (
        <SettingsBlock label={t('memoryLedger.layer.facts.title')}>
          <Box className="flex flex-col gap-2 p-4">
            {unsectionedFacts.map(entry => (
              <MemoryFactRow
                key={`${entry.layer}:${entry.id}`}
                entry={entry}
                onForget={() => rowProps.onForget(entry)}
                forgetting={rowProps.forgetting}
                onSetScope={rowProps.onSetScope}
                settingScope={rowProps.settingScope}
                businessUnitNames={rowProps.businessUnitNames}
              />
            ))}
          </Box>
        </SettingsBlock>
      )}
      {MEMORY_LAYERS.filter(layer => !SECTIONED_LAYERS.has(layer)).map(layer => (
        <LayerSection
          key={layer}
          layer={layer}
          // Une ligne qu'une section a prise n'est pas répétée dans son groupe.
          entries={ledger.entries.filter(entry => entry.layer === layer && memoryLedgerSectionOf(entry) === null)}
          unreadable={ledger.unreadableLayers.includes(layer)}
          onForget={entry => rowProps.onForget(entry)}
          forgetting={rowProps.forgetting}
        />
      ))}
    </>
  )
}

/**
 * #1916.5 → #1916.11 — une section. Ses lignes, ou « rien ici » en toutes
 * lettres, ou « je n'ai pas pu lire » quand une couche qui la nourrit a échoué —
 * trois phrases distinctes, jamais un zéro. « Documents de référence » est un
 * renvoi vers la base de connaissance.
 */
function SectionGroup({
  section,
  lead,
  entries,
  unreadable,
  onForget,
  forgetting,
  onSetScope,
  businessUnitNames,
  settingScope,
}: {
  section: MemoryLedgerSection
  /** Ce qui se RÈGLE dans cette section, rendu AVANT ses lignes (#1928.9). */
  lead?: ReactNode
  entries: MemoryLedgerEntry[]
  unreadable: boolean
  onForget: (entry: MemoryLedgerEntry) => void
  forgetting: boolean
  onSetScope: (id: string, scope: MemoryItemReassignableScope) => void
  /** #1918.2 — identifiant de périmètre → son nom, pour la ligne d'équipe. */
  businessUnitNames: Record<string, string>
  settingScope: boolean
}) {
  const { t } = useTranslation('knowledge')
  const hasDeclaredObjectives =
    section === 'personalObjectives' && entries.some(entry => isDeclaredMemoryLayer(entry.layer))
  return (
    <SettingsBlock
      label={t(`memoryLedger.section.${section}.title`)}
      description={t(`memoryLedger.section.${section}.description`)}
    >
      <Box className="flex flex-col gap-2 p-4">
        {section === 'referenceDocuments' ? (
          <Box>
            <Link
              to={REFERENCE_DOCUMENTS_PATH}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-[var(--bellum-text-accent)] underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
            >
              <BookOpen className="size-3.5" aria-hidden />
              {t('memoryLedger.section.referenceDocuments.link')}
            </Link>
          </Box>
        ) : (
          <>
            {lead}
            {entries.map(entry =>
              entry.layer === 'facts' ? (
                <MemoryFactRow
                  key={`${entry.layer}:${entry.id}`}
                  entry={entry}
                  onForget={() => onForget(entry)}
                  forgetting={forgetting}
                  onSetScope={onSetScope}
                  businessUnitNames={businessUnitNames}
                  settingScope={settingScope}
                />
              ) : (
                <LedgerRow
                  key={`${entry.layer}:${entry.id}`}
                  entry={entry}
                  // Une ligne DÉCLARÉE se corrige là où elle se saisit : pas de croix.
                  onForget={isDeclaredMemoryLayer(entry.layer) ? null : () => onForget(entry)}
                  forgetting={forgetting}
                />
              ),
            )}
            {hasDeclaredObjectives && <DeclaredObjectivesCorrection />}
            {/* « Je n'ai pas pu lire » n'est pas « il n'y a rien ». */}
            {unreadable ? (
              <Text element="p" size="sm" color="text-[var(--bellum-text-muted)]">
                {t('memoryLedger.unreadable')}
              </Text>
            ) : (
              entries.length === 0 && (
                /* Sous des réglages posés juste au-dessus, « rien ici » serait
                   faux : ce qui manque, ce sont les AUTRES lignes (#1928.9). */
                <Text element="p" size="sm" color="text-[var(--bellum-text-muted)]">
                  {lead ? t('memoryLedger.layer.preferences.emptyOther') : t(`memoryLedger.section.${section}.empty`)}
                </Text>
              )
            )}
          </>
        )}
      </Box>
    </SettingsBlock>
  )
}

/** Un geste de correction d'une ligne déclarée : 44 px, tabulable, texte accent (GA-30 / GA-35 / GA-33). */
const CORRECTION_GESTURE_CLASS =
  'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-[var(--bellum-text-accent)] outline-none transition-colors hover:bg-[var(--bellum-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]'

/**
 * Q2 (13/09) — l'objectif et la cible DÉCLARÉS se corrigent là où ils se
 * saisissent : le questionnaire de profil.
 */
function DeclaredObjectivesCorrection() {
  const { t } = useTranslation('knowledge')
  return (
    <Box className="flex flex-wrap items-center gap-2">
      <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
        {t('memoryLedger.section.personalObjectives.declared')}
      </Text>
      <QuestionnaireCorrection />
    </Box>
  )
}

/**
 * Le geste « Corriger dans ton questionnaire de profil ». Aucune page de réglages
 * n'édite ces réponses ; le questionnaire vivait derrière la carte du tableau de
 * bord, qui disparaît une fois remplie ou écartée. On ouvre donc LE MÊME dialogue
 * — un seul composant, une seule valeur stockée (GA-26) —, et seulement quand on
 * le demande : monté fermé, il lirait l'état d'onboarding et le CRM pour rien.
 */
function QuestionnaireCorrection() {
  const { t } = useTranslation('knowledge')
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={CORRECTION_GESTURE_CLASS}>
        <PencilLine className="size-3.5" aria-hidden />
        {t('memoryLedger.correction.questionnaire')}
      </button>
      {open && <ProfileQuestionnaireDialog open={open} onOpenChange={setOpen} />}
    </>
  )
}

/** L'étape du profil (Temps 1) qui POSE une question — trouvée dans le parcours réel, jamais recopiée. */
function stageAsking(answerKey: string) {
  return TEMPS1_STAGES.find(stage => stageQuestions(stage).some(question => question.key === answerKey)) ?? null
}

/**
 * Défaut trouvé le 13/09 — le groupe identité renvoyait TOUT vers « Mon compte »,
 * qui n'édite que prénom, nom et e-mail. Chaque ligne dit désormais où elle se
 * corrige (`memoryDeclaredCorrectionOf`, écrit une fois au contrat), et un geste
 * n'apparaît que si une ligne qu'il corrige est à l'écran.
 */
function IdentityCorrections({ entries }: { entries: MemoryLedgerEntry[] }) {
  const { t } = useTranslation(['knowledge', 'onboarding'])
  const corrections = entries.flatMap(entry => {
    const correction = memoryDeclaredCorrectionOf(entry)
    return correction ? [correction] : []
  })
  const toAccount = corrections.some(correction => correction.editedIn === 'account')
  const toQuestionnaire = corrections.some(correction => correction.editedIn === 'profileQuestionnaire')
  const stages = [
    ...new Map(
      corrections.flatMap(correction => {
        const stage = correction.editedIn === 'onboardingStage' ? stageAsking(correction.answerKey) : null
        return stage ? [[stage.code, stage] as const] : []
      }),
    ).values(),
  ]
  return (
    <>
      {toAccount && (
        <Link to={DECLARED_SETTINGS.identity} className={CORRECTION_GESTURE_CLASS}>
          <PencilLine className="size-3.5" aria-hidden />
          {t('memoryLedger.layer.identity.declaredLink')}
        </Link>
      )}
      {toQuestionnaire && <QuestionnaireCorrection />}
      {stages.map(stage => (
        <Link
          key={stage.code}
          to="/settings/profile/$stage"
          params={{ stage: stage.code }}
          className={CORRECTION_GESTURE_CLASS}
        >
          <PencilLine className="size-3.5" aria-hidden />
          {t('memoryLedger.correction.stage', { stage: t(`onboarding:${stage.title}`) })}
        </Link>
      ))}
    </>
  )
}

function LayerSection({
  layer,
  lead,
  entries,
  unreadable,
  onForget,
  forgetting,
}: {
  layer: MemoryLayer
  /** Ce qui se RÈGLE dans cette couche, rendu avant ses lignes (#1928.9). */
  lead?: ReactNode
  entries: MemoryLedgerEntry[]
  unreadable: boolean
  onForget: (entry: MemoryLedgerEntry) => void
  forgetting: boolean
}) {
  const { t } = useTranslation('knowledge')
  // Une couche DÉCLARÉE se corrige là où elle se saisit. On ne montre donc pas
  // une croix qui ne peut rien faire : un bouton désactivé sans explication est
  // pire qu'un bouton absent — il laisse croire à un droit qu'on n'a pas.
  const declared = isDeclaredMemoryLayer(layer)
  const settingsPath = DECLARED_SETTINGS[layer]
  return (
    <SettingsBlock
      label={t(`memoryLedger.layer.${layer}.title`)}
      description={t(`memoryLedger.layer.${layer}.description`)}
    >
      <Box className="flex flex-col gap-2 p-4">
        {declared && (
          <Box className="flex flex-wrap items-center gap-2">
            <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
              {t(`memoryLedger.layer.${layer}.declared`)}
            </Text>
            {/* Défaut du 13/09 — l'identité ne renvoie plus tout vers Mon compte :
                chaque ligne vers ce qui l'édite vraiment. */}
            {layer === 'identity' ? (
              <IdentityCorrections entries={entries} />
            ) : (
              settingsPath && (
                <Link
                  to={settingsPath}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-[var(--bellum-text-accent)] underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
                >
                  <PencilLine className="size-3.5" aria-hidden />
                  {t(`memoryLedger.layer.${layer}.declaredLink`)}
                </Link>
              )
            )}
          </Box>
        )}
        {lead}
        {unreadable ? (
          /* « Je n'ai pas pu lire » n'est pas « il n'y a rien ». La distinction
             est la règle du dépôt appliquée à une mémoire : si la valeur est
             absente, « 0 » est-il VRAI ? Ici, non. */
          <Text element="p" size="sm" color="text-[var(--bellum-text-muted)]">
            {t('memoryLedger.unreadable')}
          </Text>
        ) : entries.length === 0 ? (
          /* Sous des réglages posés juste au-dessus, « Aucune préférence
             retenue » serait faux : ce qui manque, ce sont les AUTRES. */
          <Text element="p" size="sm" color="text-[var(--bellum-text-muted)]">
            {lead ? t('memoryLedger.layer.preferences.emptyOther') : t(`memoryLedger.layer.${layer}.empty`)}
          </Text>
        ) : (
          entries.map(entry => (
            <LedgerRow
              key={`${entry.layer}:${entry.id}`}
              entry={entry}
              onForget={declared ? null : () => onForget(entry)}
              forgetting={forgetting}
            />
          ))
        )}
      </Box>
    </SettingsBlock>
  )
}

/** Une ligne d'une couche SANS gestes de faits : une préférence, un résumé, une trace, un champ déclaré. */
function LedgerRow({
  entry,
  onForget,
  forgetting,
}: {
  entry: MemoryLedgerEntry
  /** `null` sur une couche DÉCLARÉE : il n'y a rien à oublier ici. */
  onForget: (() => void) | null
  forgetting: boolean
}) {
  const { t, i18n } = useTranslation('knowledge')
  const recorded = formatMemoryDate(entry.recordedAt, i18n.language)
  const until = formatMemoryDate(entry.expiresAt, i18n.language, { utc: true })
  return (
    <Box className="flex items-start gap-3 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-3 py-2">
      <Box className="min-w-0 flex-1">
        {/* `whitespace-pre-line` : un résumé de conversation est écrit sur
            plusieurs lignes, une par tour. L'aplatir rendrait illisible la
            chose même qu'on veut montrer en clair. */}
        <Text element="p" size="sm" className="whitespace-pre-line break-words">
          {entry.text}
        </Text>
        <Box className="mt-1 flex flex-wrap items-center gap-1.5">
          {entry.detail && (
            /* Un qualificatif connu se traduit ; un qualificatif venu d'une
               ligne plus ancienne que le catalogue s'affiche tel quel. Jamais
               une clé nue, jamais un libellé inventé. */
            <Badge variant="outline" className="text-xs">
              {t(`memoryLedger.detail.${entry.detail}`, { defaultValue: entry.detail })}
            </Badge>
          )}
          {until && (
            <Badge variant="outline" className="text-xs">
              {t('memoryLedger.until', { date: until })}
            </Badge>
          )}
          {recorded && (
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('memoryLedger.recordedAt', { date: recorded })}
            </Text>
          )}
        </Box>
      </Box>
      {/* Ce qui se clique se tabule (GA-35) et porte un nom (GA-32). La cible
          fait 44 px au doigt (GA-30). Absent — et non désactivé — sur une couche
          déclarée : le lien de correction est en tête de section. */}
      {onForget && (
        <button
          type="button"
          onClick={onForget}
          disabled={forgetting}
          aria-label={t('memoryLedger.forgetAria', { text: entry.text })}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-[var(--bellum-text-muted)] outline-none transition-colors hover:bg-[var(--bellum-surface-2)] hover:text-[var(--danger-soft-text)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] disabled:cursor-not-allowed"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </Box>
  )
}

/**
 * LA CONFIRMATION D'UN GESTE IRRÉVERSIBLE.
 *
 * Elle DIT ce qui part et ce qui reste, en toutes lettres, avant de demander.
 * Trois phrases, pas une : ce qui s'efface, ce qui survit (les faits d'un
 * collègue, ton profil et celui de l'ESN), et le fait que rien ne le rattrapera.
 * « Es-tu sûr ? » ne dit rien — personne ne peut consentir à effacer ce qu'il
 * n'a pas vu nommé.
 */
function ForgetAllDialog({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation('knowledge')
  return (
    <ModalPortal>
      <motion.div
        {...MOTION.reveal}
        className="fixed inset-0 z-overlay flex items-center justify-center bg-black/60 p-4"
        onClick={onCancel}
      >
        {/* Aucun rebond, aucune mise à l'échelle : `MOTION.reveal` est le
            mouvement « voici une information » (GA-25). Une boîte qui rebondit
            avant d'annoncer un effacement définitif dit le contraire de ce
            qu'elle annonce. */}
        <motion.div
          {...MOTION.reveal}
          role="dialog"
          aria-modal="true"
          aria-label={t('memoryLedger.forgetAll.title')}
          className="w-full max-w-md rounded-2xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-6"
          onClick={event => event.stopPropagation()}
        >
          <Text element="h2" size="base" weight="semibold" className="mb-3">
            {t('memoryLedger.forgetAll.title')}
          </Text>
          <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]" className="mb-2">
            {t('memoryLedger.forgetAll.goes')}
          </Text>
          <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]" className="mb-2">
            {t('memoryLedger.forgetAll.stays')}
          </Text>
          {/* #1918.8 — décision du 13/09 : ta confirmation sur la note d'un
              collègue et ton prénom dans l'historique d'un élément partagé sont
              des traces d'équipe. « Tout oublier » les garde ; seul l'effacement
              du compte les retire. */}
          <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]" className="mb-2">
            {t('memoryLedger.forgetAll.confirmationsStay')}
          </Text>
          <Text element="p" size="sm" weight="medium" color="text-[var(--danger-soft-text)]" className="mb-5">
            {t('memoryLedger.forgetAll.irreversible')}
          </Text>
          <Box className="flex flex-wrap gap-3">
            <Button variant="secondary" size="sm" onClick={onCancel}>
              {t('common:actions.cancel')}
            </Button>
            <Button variant="destructive" size="sm" disabled={pending} onClick={onConfirm}>
              {pending ? t('memoryLedger.forgetAll.pending') : t('memoryLedger.forgetAll.confirm')}
            </Button>
          </Box>
        </motion.div>
      </motion.div>
    </ModalPortal>
  )
}
