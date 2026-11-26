import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Copy, Info } from 'lucide-react'
import { toast } from 'sonner'
import { Text, cn, useCopiedFlash } from '@bellum/ui'
import { TOAST_PROBLEM_MS, TOAST_SUCCESS_MS } from '@/lib/toast-duration'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { ContextDisclosure, type ChatResponseContext } from './ContextDisclosure'
import { ReplyMemoryUses } from './ReplyMemoryUses'
import { ReplyFeedback } from './ReplyFeedback'
import { SaveReply } from './SaveReply'
import { ReplyBadges } from './ReplyBadges'
import { replyBadgesFor } from './reply-badges'
import { replySourceBasis } from './reply-source-basis'
import { formatAsOf, replyProvenance } from './reply-provenance'
import { ReplyRetryMenu } from './ReplyRetryMenu'
import { ReplyBasis, ReplyMailboxRead } from './reply-kit'
import { renderMarkdown } from './markdown'
import type { ReplyAside } from './reply-aside'
import { ReplyTransformMenu } from './ReplyTransformMenu'
import { useReplyTransform } from './reply-transform-context'
import { hasReplyBlocks } from './ReplyExportMenu'
import { DeepenActions, deepenAccountIds } from './DeepenActions'
import { deepenActionsFor } from '@bellum/contracts'
import type { BranchOf, DataOrigin } from './reply-branch'

/**
 * Le pied d'une réponse de Laura — UNE rangée, invisible au repos (#5032, V8).
 *
 * ⚠️ #5032 REVIENT SUR le pied « toujours lisible » décrit plus bas (heure · fraîcheur · nombre de
 * sources · badges · voir la source · épingler · commentaires · écouter…) : deux ou trois lignes de
 * contrôles noyaient la réponse. Désormais, au repos, RIEN ; au survol ou au focus de la réponse
 * (`group-hover` / `focus-within`), une rangée : Sources (ou Contexte sans source) · Copier ·
 * Enregistrer · Ajuster · ⋯. Sur mobile (≤ 768 px, GA-28), la rangée est visible sous la DERNIÈRE
 * réponse seulement ; toucher une réponse plus ancienne affiche la sienne.
 *
 * Ce qui a passé dans le panneau Sources (revient sur #3765, #3764, #3896/#3897 en le gardant) :
 * la fraîcheur, le nombre de sources, les badges de statut, « Laura a lu ce fil ». Il garde TOUT son
 * contenu (ReplyBasis, ContextDisclosure, mémoire consultée). Supprimés : l'heure, les commentaires
 * (#1940.6), « Écouter » (#1939.12). Le texte historique ci-dessous décrit l'ancienne ligne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL REMPLACE, ET CE QU'IL NE REMPLACE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Sous chaque réponse s'empilaient trois blocs : le panneau de transparence
 * (replié), le bouton « Sauvegarder cette réponse », et l'heure. Trois lignes,
 * trois alignements, et la seule information qui devrait sauter aux yeux — la
 * FRAÎCHEUR de ce que Laura a lu — cachée dans le panneau replié.
 *
 * La ligne les rassemble : heure · date de la source la plus ancienne · voir la
 * source · épingler.
 *
 * ⚠️ Le panneau de transparence n'est PAS supprimé : il s'ouvre sous la ligne.
 * Il porte le détail que la ligne résume (quelles sources, quelle nature,
 * qu'est-ce qui n'a pas été consulté et pourquoi), et le retirer serait une
 * régression de transparence — celle-là même que l'AI Act nous impose de tenir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI NE S'AFFICHE PLUS ICI (tranché sans Louis, #3356.1 / LAU-UI-308)
 * ─────────────────────────────────────────────────────────────────────────────
 * Un badge « N données manquantes » vivait sur cette ligne. Retiré : il ne
 * disait ni quelles données, ni l'impact, ni l'action — un compteur nu, sans
 * les axes qu'un score doit nommer. Le détail NOMMÉ (`not_consulted`) reste
 * entier, à un clic, dans `ContextDisclosure` derrière « Voir la source » —
 * rien n'est perdu, seule la ligne compacte perd un chiffre qu'elle ne pouvait
 * pas expliquer. Option 1 de l'issue plutôt que l'option 2 (rendre le badge
 * actionnable) : le nommé qu'elle réclamerait est déjà servi par le panneau,
 * à la même hauteur de ligne.
 */
export function ReplyFooter({
  context,
  text,
  source,
  accountId,
  conversationId = null,
  timestamp,
  messageId = null,
  memoryUses = null,
  branchOf = null,
  dataOrigin = null,
  onRetry,
  onEditLastMessage,
  onAlternativeAngle,
  retryDisabled = false,
  ownTurn = false,
  revealed = true,
  deepenRequest = 0,
  aside = null,
}: {
  context: ChatResponseContext | undefined
  text: string
  /**
   * #3768 — la réponse en Markdown, telle que rendue : le texte brut ci-dessus a perdu
   * ses liens de fiche et ses puces, dont le geste « ajuster » lit la forme et
   * les comptes cités. Absent = on retombe sur `text`. #3770 — le même contenu
   * BRUT (avec ses cartes) sert la copie structurée et le fichier (intégration
   * 06/10 : un seul champ, ex-`rawContent`).
   */
  source?: string
  accountId: string | null
  /** #1953.9 — le fil que le lien de partage d'UNE réponse doit désigner. */
  conversationId?: string | null
  /** Quand la réponse a été rendue — l'étape d'approfondissement se lit sur ce qui a été rejoué APRÈS. L'heure ne s'affiche plus (#5032.3). */
  timestamp: Date | null
  /** #1916.24 — l'identifiant de la réponse ENREGISTRÉE, ou `null` tant qu'elle ne l'est pas. */
  messageId?: string | null
  /**
   * #1916.24 — combien d'éléments de mémoire étaient dans le contexte envoyé à
   * Laura pour cette réponse, servi par l'API. `null` = non mesuré.
   */
  memoryUses?: number | null
  /** #1953.12 / #1953.22 — d'où repart cette réponse, si elle est une branche. */
  branchOf?: BranchOf | null
  /** #1953.21 — mêmes données réutilisées, ou recherche relancée. */
  dataOrigin?: DataOrigin | null
  /**
   * #1953.5 / #1953.6 / #1953.7 / #1953.11 — `undefined` quand cette réponse
   * ne peut pas être reprise (aucune question ne la précède, par exemple une
   * ouverture de Laura sur un fil vierge) : les entrées Réessayer / Modifier /
   * Autre angle du menu ⋯ ne s'affichent alors pas.
   */
  onRetry?: () => void
  onEditLastMessage?: () => void
  onAlternativeAngle?: () => void
  retryDisabled?: boolean
  /** #4016.L3.a — ce tour est celui du lecteur : seul lui voit « Laura a lu ce fil ». */
  ownTurn?: boolean
  /**
   * #5032.2 — mobile seulement : la rangée n'est montrée que sous la dernière réponse, ou sous
   * celle qu'on vient de toucher. Sur grand écran, c'est le survol / le focus qui la montre.
   */
  revealed?: boolean
  /**
   * #5032.13 — « Lancer une qualification complémentaire » (`ReplyActions`) : chaque incrément ouvre
   * le MÊME flux d'approfondissement que Ajuster › « Approfondir (avec devis) » (GA-26).
   */
  deepenRequest?: number
  /**
   * #5044 — ce que le corps ne montre plus (Sources, Limites, Méthode… et la preuve d'un « Pourquoi », la note de
   * substance des cartes) : lu par `extractReplyAside` sur le texte du message. Absent = rien à porter (la bulle
   * Laura rend son texte à plat : rien n'y est replié).
   */
  aside?: ReplyAside | null
}) {
  const { t, i18n } = useTranslation('chat')
  const transformGate = useReplyTransform()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [deepenOpen, setDeepenOpen] = useState(false)
  useEffect(() => {
    if (deepenRequest > 0) setDeepenOpen(true)
  }, [deepenRequest])
  const { asOf: latestAsOf, sourceCount } = replyProvenance(context)
  const asOf = formatAsOf(latestAsOf, i18n.language)
  // #3764 — les badges de statut, un vocabulaire fermé. Pas de « complétude » (Louis, 11/10) : le fait des
  // sources non consultées se dit par le badge nommé. #5032.8 — ils vivent dans le panneau Sources.
  const replyBadges = replyBadgesFor(context, new Date())
  // #1916.24 — la section n'est qu'un ÉLÉMENT React : rien n'est lu tant que le
  // panneau n'est pas ouvert, parce que rien ne le monte avant.
  const memorySection =
    messageId && typeof memoryUses === 'number' && memoryUses > 0 ? <ReplyMemoryUses messageId={messageId} /> : null
  // #5044 — un texte sorti du corps (ou une note de substance) ouvre le panneau, même sans `context`.
  const asideSections = aside?.sections ?? []
  const asideSubstance = aside?.substance ?? []
  const asideNotes = aside?.notes ?? []
  const hasAside = asideSections.length > 0 || asideSubstance.length > 0 || asideNotes.length > 0
  const hasSourcesPanel = Boolean(context || memorySection || hasAside)
  // #5044 — une note de substance est une ALERTE : le bouton Sources la porte et reste visible au repos.
  const alert = asideSubstance.length > 0
  const replyText = source ?? text
  // #5032.12 — « Approfondir (avec devis) » n'existe que si la réponse vise au moins un compte.
  const canDeepen = deepenActionsFor(deepenAccountIds(replyText, accountId).length).length > 0
  const hasRow = hasSourcesPanel || Boolean(text.trim())
  // #5032.1 — invisible au repos ; le survol de la réponse, le focus clavier ou un menu ouvert la montrent.
  // #5032.2 — mobile : visible sous la dernière réponse (ou la touchée) seulement.
  const restClass = isMobile
    ? revealed
      ? ''
      : 'hidden'
    : feedbackOpen
      ? 'opacity-100'
      : 'opacity-0 focus-within:opacity-100 group-hover/reply:opacity-100 has-[[aria-expanded=true]]:opacity-100'

  // #5044 — les contrôles autres que Sources : cachés au repos même quand l'alerte garde la rangée visible.
  const controls = (
    <>
      {/* #1953.4 — « Copier » : seulement s'il y a un texte à copier. */}
      {text.trim() ? <CopyReply text={text} /> : null}
      {/* #5032.10 — « Enregistrer » : une icône de signet, le même choix de nature qu'avant. */}
      {text.trim() ? <SaveReply text={text} accountId={accountId} /> : null}
      {/* #5032.11 / .12 — « Ajuster » (ex-« Retravailler », #3768) : mêmes transformations + « Approfondir (avec devis) ». */}
      {replyText.trim() ? (
        <ReplyTransformMenu
          text={replyText}
          onTransform={transformGate?.onTransform}
          disabled={transformGate?.disabled ?? false}
          onDeepen={canDeepen ? () => setDeepenOpen(true) : undefined}
        />
      ) : null}
      {/* #5032.15 — ⋯ : Exporter (réponse à cartes), Signaler un problème, Réessayer / Modifier / Autre angle. */}
      {text.trim() ? (
        <ReplyRetryMenu
          exportContent={source && hasReplyBlocks(source) ? source : null}
          accountId={accountId}
          conversationId={conversationId}
          messageId={messageId}
          branchOf={branchOf}
          dataOrigin={dataOrigin}
          onRetry={onRetry}
          onEditLastMessage={onEditLastMessage}
          onAlternativeAngle={onAlternativeAngle}
          onReport={() => setFeedbackOpen(true)}
          retryDisabled={retryDisabled}
        />
      ) : null}
    </>
  )

  return (
    <div className="group/reply space-y-1">
      {hasRow ? (
        <div
          data-testid="reply-footer-row"
          role="group"
          aria-label={t('footer.rowLabel')}
          className={cn(
            'flex flex-wrap items-center gap-1 px-1 transition-opacity motion-reduce:transition-none',
            // #5044 — avec une alerte, la rangée ne se cache pas : seuls les autres contrôles se cachent (plus bas).
            alert ? '' : restClass,
          )}
        >
          {/* #5032.6 — « Voir la source » devient « Sources » (« Contexte » quand aucune source n'est citée). */}
          {hasSourcesPanel ? (
            <button
              type="button"
              onClick={() => setOpen(previous => !previous)}
              aria-expanded={open}
              aria-label={alert ? t('footer.sourcesAlert') : undefined}
              className="flex items-center gap-1 rounded px-1 text-[var(--bellum-text-accent)] outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)] pointer-coarse:min-h-11"
            >
              <Text size="xs" color="text-[var(--bellum-text-accent)]">
                {(sourceCount !== null && sourceCount >= 1) || asideSections.length > 0 || asideNotes.length > 0
                  ? t('footer.sources')
                  : t('footer.context')}
              </Text>
              {/* #5044 — la pastille d'alerte (D79 : un jeton, aucun hexadécimal) ; le nom accessible du bouton la dit. */}
              {alert ? (
                <span
                  data-testid="sources-alert-dot"
                  className="size-2 shrink-0 rounded-full bg-[var(--bellum-warning)]"
                  aria-hidden
                />
              ) : null}
              <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} aria-hidden />
            </button>
          ) : null}
          {alert ? <div className={cn('flex items-center gap-1', restClass)}>{controls}</div> : controls}
          {/* #1919 — le retour : ses six choix s'ouvrent sous la rangée (`order-last basis-full`) quand
              « Signaler un problème » est choisi dans ⋯. Le panneau seul : l'icône est retirée (#5032.15). */}
          {text.trim() ? (
            <ReplyFeedback
              text={text}
              accountId={accountId}
              context={context}
              open={feedbackOpen}
              showTrigger={false}
              // #2444.6 — même geste que « Réessayer », proposé juste après une correction « Donnée fausse ».
              onRetryWithCorrection={onRetry}
              retryDisabled={retryDisabled}
            />
          ) : null}
        </div>
      ) : null}

      {/* #5032.12 / .13 — le flux d'approfondissement (devis avant lancement, puis delta rejoué, #2452). */}
      {canDeepen ? (
        <DeepenActions
          content={replyText}
          fallbackAccountId={accountId}
          since={timestamp ?? undefined}
          open={deepenOpen}
        />
      ) : null}

      {/* #5044 — ce que le corps ne montre plus, EN TÊTE du panneau : la note de substance, puis chaque section sortie. */}
      {open && hasAside ? (
        <div
          data-testid="reply-aside"
          className="space-y-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3"
        >
          {asideSubstance.length > 0 ? (
            <aside data-reply-substance aria-label={t('blocks.substance.title')} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Info className="size-3.5 shrink-0 text-[var(--bellum-warning-text)]" aria-hidden />
                <Text size="xs" weight="semibold" color="text-[var(--bellum-text-muted)]">
                  {t('blocks.substance.title')}
                </Text>
              </div>
              <ul className="space-y-0.5">
                {asideSubstance.map(finding => (
                  <li key={`${finding.block}-${finding.reason}`}>
                    <Text size="xs" color="text-[var(--bellum-text-muted)]">
                      {t(`blocks.substance.${finding.reason}`, {
                        kind: t(`blocks.kind.${finding.type}`),
                        found: finding.found,
                        total: finding.total,
                      })}
                    </Text>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}
          {/* #5086 — « Contrainte retenue » et « Précision » : le texte de l'IA, sorti du corps, lu tel quel. */}
          {asideNotes.length > 0 ? (
            <ul data-testid="reply-notes" aria-label={t('footer.aside.notes')} className="space-y-1">
              {asideNotes.map(note => (
                <li key={note}>
                  <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                    {note}
                  </Text>
                </li>
              ))}
            </ul>
          ) : null}
          {asideSections.map((section, index) => (
            <section key={`${section.kind}-${index}`} className="space-y-1">
              <Text size="xs" weight="semibold" color="text-[var(--bellum-text-primary)]">
                {t(`footer.aside.${section.kind}`)}
              </Text>
              <div className="text-sm text-[var(--bellum-text-secondary)]">{renderMarkdown(section.body)}</div>
            </section>
          ))}
        </div>
      ) : null}
      {/* #2840 (#2441.13) — le mode dégradé (`context.partial`) s'annonce EN TÊTE de la réponse (`ReplyHeader`). */}
      {open && context ? (
        <div className="space-y-1.5">
          {/* #5032.7 / .8 — fraîcheur, nombre de sources et badges de statut : DANS le panneau, plus dans la ligne. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
            {asOf ? (
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {t('provenance.asOf', { date: asOf })}
              </Text>
            ) : null}
            {/* #1915.2 — LE VRAI COMPTE, JAMAIS « 0 » : `sourceCount` est `null` tant qu'on ne sait pas, et sous 1 rien ne s'affiche. */}
            {sourceCount !== null && sourceCount >= 1 ? (
              <>
                {asOf ? <Separator /> : null}
                <Text size="xs" color="text-[var(--bellum-text-muted)]">
                  {t('provenance.sources', { count: sourceCount })}
                </Text>
              </>
            ) : null}
            <ReplyBadges
              labels={replyBadges}
              sourceNames={Array.isArray(context.not_consulted) ? context.not_consulted : []}
            />
          </div>
          <ReplyBasis basis={replySourceBasis(context)} />
          {/* #4016.3c / #5032.9 — « Laura a lu ce fil » : ICI seulement (auteur du tour), plus dans la ligne. */}
          <ReplyMailboxRead toolsCalled={context.reasoning_trace?.tools_called} ownTurn={ownTurn} placement="source" />
          {/* #1933.2 — le compte SCOPÉ voyage jusqu'au lien « Lancer une analyse ». */}
          <ContextDisclosure context={context} alwaysOpen memorySlot={memorySection} accountId={accountId} />
        </div>
      ) : null}
      {/* #1916.24 — une réponse RELUE n'a pas conservé son contexte : seule la
          mémoire consultée l'est. Le panneau le dit, pour ne pas laisser croire
          que la mémoire était sa seule source. */}
      {open && !context && memorySection ? (
        <div className="mt-1.5 space-y-2.5 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3">
          {memorySection}
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('disclosure.memoryUses.earlierAnswer')}
          </Text>
        </div>
      ) : null}
    </div>
  )
}

function Separator() {
  return (
    <span className="text-[var(--bellum-text-muted)]" aria-hidden>
      ·
    </span>
  )
}

/**
 * #1953.4 — « Copier » sous chaque réponse de Laura.
 *
 * Copie le texte BRUT de la réponse — pas la conclusion tronquée que
 * `SaveReply` épingle en mémoire : deux gestes voisins, deux usages (relire
 * plus tard vs. recoller ailleurs), et le second veut tout, verbatim.
 *
 * Icône seule (GA-32 : nom accessible via `aria-label`) plutôt qu'un bouton à
 * texte : la ligne est déjà dense, et « Sauvegarder cette réponse » juste à
 * côté porte déjà un libellé — en ajouter un second alourdirait la ligne sans
 * rien apprendre de plus qu'une icône bien nommée.
 *
 * Un presse-papier refusé (contexte non sécurisé, permission bloquée) DIT non
 * plutôt que de prétendre avoir copié — le même refus que tient déjà
 * `ShareConversation` pour le lien de conversation.
 */
function CopyReply({ text }: { text: string }) {
  const { t } = useTranslation('chat')
  // #1152 : minuteur annulé au démontage — voir `useCopiedFlash`.
  const [copied, flashCopied] = useCopiedFlash(2000)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      flashCopied()
      toast.success(t('provenance.copied'), { duration: TOAST_SUCCESS_MS })
    } catch {
      toast.error(t('provenance.copyFailed'), { duration: TOAST_PROBLEM_MS })
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={t('provenance.copy')}
      className="flex items-center justify-center rounded p-1 text-[var(--bellum-text-muted)] transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11 hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]"
    >
      {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
    </button>
  )
}
