import { computeHierarchyLevel, type Contact } from '@bellum/contracts'
import { Button, Text, TooltipButton, useCopiedFlash } from '@bellum/ui'
import { Check, CheckCheck, Copy, ExternalLink, Pencil, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { contactsApi } from '@/features/contacts/api'
import { useDeclareSent } from '@/features/contacts/hooks/useDeclareSent'
import { MessageInsightPanel } from '@/components/message-insight/MessageInsightPanel'
import type { MessageInsight, MessageToneOption } from '@/lib/message-insight'
import { channelHasSubject, channelIcon, composerLabel, isPreparedOnlyChannel } from './channel'
import { EngagementCreateTaskAction } from './EngagementCreateTask'
import { EngagementCreateCallTaskAction } from './EngagementCreateCallTask'
import { EngagementSendEmailAction } from './EngagementSendEmail'
import { LinkedinDelegationCard } from './LinkedinDelegationCard'
import { PreSendChecklist } from './PreSendChecklist'
import { VersionTrace, type VersionTraceInfo } from './VersionTrace'
import { SendReceipt } from './SendReceipt'
import type { EngagementChannel } from './types'

/** Durée de l'accusé « Copié » sur cet écran. Elle était écrite dans un helper
 *  libre dont le minuteur ne s'annulait jamais (#1152). */
const COPIED_FLASH_MS = 1800

const DAY_MS = 24 * 60 * 60 * 1000

/** #3695 — les deux objectifs que la recette attend d'un clic sur la carte e-mail (codes de `message-parameters`). */
const QUICK_OBJECTIVES = ['relance', 'positionnement_expertise'] as const

/**
 * Ce que Bellum sait du message PRÉCÉDENT envoyé à ce contact, pour le contrôle
 * avant envoi.
 *
 * La seule trace DATÉE est `email_sent_at` : l'envoi d'un brouillon e-mail
 * depuis le produit. Elle vaut pour tous les canaux — relancer sur un autre
 * canal le lendemain reste une relance du lendemain.
 *
 * ⚠️ Angle mort assumé et NON comblé par une supposition : une déclaration
 * « j'ai envoyé ce message » sur LinkedIn est tracée comme action, pas datée sur
 * le contact. Un contact touché seulement par ce chemin se lit donc encore comme
 * un premier message. Inventer une date pour couvrir ce cas ferait afficher un
 * délai faux, ce qui est pire que le trou.
 */
export function previousMessage(contact: Contact): { step: number; daysSincePrevious: number | null } {
  const sentAt = contact.email_sent_at ?? null
  // Aucun envoi connu ⇒ premier message. Pas de date, et surtout pas « 0 jour » :
  // « aucun message précédent » n'est pas « zéro jour depuis le précédent ».
  if (!sentAt) return { step: 1, daysSincePrevious: null }

  const sent = Date.parse(sentAt)
  // Un horodatage illisible dit qu'un envoi a EU LIEU sans dire quand : l'étape
  // avance, le délai reste inconnu, et le contrôle l'annonce lui-même.
  if (Number.isNaN(sent)) return { step: 2, daysSincePrevious: null }

  // Borné à 0 : une horloge en avance ne doit pas produire un délai négatif.
  // Ici « 0 jour » est une MESURE — parti aujourd'hui — pas une absence.
  return { step: 2, daysSincePrevious: Math.max(0, Math.floor((Date.now() - sent) / DAY_MS)) }
}

type EngagementMessageProps = {
  channel: EngagementChannel
  contact: Contact
  /**
   * `true` seulement pour le DERNIER brouillon du canal courant. Les versions
   * précédentes du fil restent lisibles et copiables mais ne portent ni édition
   * ni envoi — voir `MessageActions`.
   */
  isCurrentDraft: boolean
  subject: string
  text: string
  /**
   * #1926.28-.31, #1925 — « pourquoi ce message », pour un brouillon issu de
   * `/message/generate`. Facultatif et par défaut vide : les entrées
   * pré-écrites de `buildInitialEntries` (jamais passées par cet appel) n'en
   * portent aucun, et le panneau doit rester silencieux dans ce cas.
   */
  insight?: MessageInsight
  /** #1926.28 — présent SEULEMENT quand une régénération avec angle existe
   *  (le composer). Absent ⇒ l'angle alternatif reste du texte seul. */
  onUseAlternativeAngle?: (angle: string) => void
  /** #1926.31 — idem pour le changement de ton. */
  onChangeTone?: (tone: MessageToneOption) => void
  /** #3695 — présent seulement quand le composer sait régénérer sur un objectif (jamais un bouton mort). */
  onChooseObjective?: (objective: (typeof QUICK_OBJECTIVES)[number]) => void
  onLinkedinDeclaredSent: () => void
  onLinkedinOpen: () => void
  onMessageCopy: () => void
  /** #2396.12 — écarter ce brouillon : ni envoyé, ni déclaré envoyé. */
  onDismiss: () => void
  /** #3696.3 — la correction manuelle déjà faite sur ce brouillon (le fil la porte). */
  edited?: { subject: string; body: string }
  /** #3696.3 — chaque frappe remonte au fil : une variante ou une fermeture ne la perdent pas. */
  onDraftChange?: (draft: { subject: string; body: string }) => void
  /** #3695.4-.5 — ce qui a produit cette version (style vérifié, modèle approuvé, texte inchangé). */
  trace?: VersionTraceInfo
}

export function EngagementMessage({
  channel,
  contact,
  isCurrentDraft,
  subject,
  text,
  insight = {},
  onUseAlternativeAngle,
  onChangeTone,
  onChooseObjective,
  onLinkedinDeclaredSent,
  onLinkedinOpen,
  onMessageCopy,
  onDismiss,
  edited,
  onDraftChange,
  trace = {},
}: EngagementMessageProps) {
  const { t } = useTranslation('engagement')
  const Icon = channelIcon(channel)
  // Le brouillon édité par le commercial. Seeded once — chaque entrée du fil est
  // montée avec sa propre `key`, donc une nouvelle génération repart à zéro.
  const [edit, setDraftState] = useState(edited ?? { subject, body: text })
  // #3695.6 — « revenir à la version générée » ne détruit pas la correction : on bascule la vue.
  const [showGenerated, setShowGenerated] = useState(false)
  const draft = showGenerated ? { subject, body: text } : edit
  const hasEdits = edit.subject !== subject || edit.body !== text
  const startEditing = () => {
    setShowGenerated(false)
    setEditing(true)
  }
  const setDraft = (next: { subject: string; body: string }) => {
    setDraftState(next)
    onDraftChange?.(next)
  }
  const [editing, setEditing] = useState(false)
  const previous = previousMessage(contact)

  return (
    <section aria-label={composerLabel(channel)} className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Text size="sm" weight="medium">
          {t('message.suggested')}
        </Text>
        <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--bellum-text-muted)]">
          {isCurrentDraft ? null : <SupersededBadge label={t('message.supersededBadge')} />}
          <Icon className="size-3.5" />
          <span>{composerLabel(channel)}</span>
        </div>
      </div>

      {editing ? (
        <DraftEditor channel={channel} draft={draft} onChange={setDraft} onDone={() => setEditing(false)} />
      ) : (
        <DraftPreview channel={channel} subject={draft.subject} body={draft.body} />
      )}

      {/* #1926.28-.31, #1925 — pourquoi CE message. Les gestes de régénération
          (angle alternatif, changement de ton) ne sont offerts que sur le
          brouillon COURANT — un email irréversible ne doit pas rester
          régénérable depuis une version déjà remplacée du fil, même symbole
          que l'édition et l'envoi juste en dessous. */}
      <VersionTrace
        objective={insight.brief?.objective}
        trace={trace}
        hasEdits={hasEdits}
        showingGenerated={showGenerated}
        onToggleGenerated={() => setShowGenerated(value => !value)}
      />
      <MessageInsightPanel
        channel={channel}
        // #4980.2 — un message relu depuis le dossier n'a pas d'analyse de génération : le pourquoi connu du contact
        // (jamais inventé) tient lieu de justification, repliée derrière le même bouton.
        insight={
          channel === 'email' && !insight.rationale?.trim() && contact.why_contact?.trim()
            ? { ...insight, rationale: contact.why_contact }
            : insight
        }
        onUseAlternativeAngle={isCurrentDraft ? onUseAlternativeAngle : undefined}
        onChangeTone={isCurrentDraft ? onChangeTone : undefined}
      />

      {/* #3695 (recette 10/10) — « Relancer » et « Faire connaître une expertise » sur la carte elle-même,
          et non seulement dans « Paramètres du message » (replié) : même geste, même régénération. */}
      {isCurrentDraft && channel === 'email' && onChooseObjective ? (
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_OBJECTIVES.map(code => (
            <Button key={code} type="button" variant="outline" size="sm" onClick={() => onChooseObjective(code)}>
              {t(`composer.parameters.objectives.${code}`)}
            </Button>
          ))}
        </div>
      ) : null}

      {/* Le contrôle avant envoi, sur le brouillon RÉELLEMENT à l'écran — donc
          celui qu'on vient d'éditer, pas celui qui a été généré. Il ne s'affiche
          que pour le dernier brouillon : relire un message déjà remplacé
          n'apprend rien. Le canal `phone` n'a pas de texte à envoyer.

          Les trois entrées qui le sortaient de l'aveugle viennent du contact que
          ce composant tient déjà : le palier hiérarchique (d'où le persona se
          dérive), le rang du message et le délai depuis le précédent. Chacune
          peut manquer, et le contrôle DIT ce qu'il ignore plutôt que de le
          combler. */}
      {/* #2123.72 — une tâche ne s'ENVOIE pas : pas de contrôle avant envoi (ni message vocal, ni recommandation, #2204.40/.41). */}
      {isCurrentDraft && channel !== 'phone' && !isPreparedOnlyChannel(channel) ? (
        <PreSendChecklist
          body={draft.body}
          subject={draft.subject}
          hierarchyLevel={computeHierarchyLevel(contact.title)}
          step={previous.step}
          daysSincePrevious={previous.daysSincePrevious}
          // #2123.74 — les éléments réels que le moteur a relevés dans CE
          // brouillon ; absents (brouillon pré-écrit, API plus ancienne) ⇒ le
          // contrôle dit qu'il ne sait pas.
          realContext={insight.specificity?.elements?.map(element => element.value) ?? null}
        />
      ) : null}

      {/* #2123.72 — la tâche se CRÉE dans les actions (ligne `action_plan_items`),
          sur le seul brouillon courant ; les versions remplacées restent lisibles. */}
      {channel === 'task' ? (
        isCurrentDraft ? (
          <div className="flex flex-wrap items-center gap-1 pt-1">
            <EngagementCreateTaskAction contact={contact} subject={draft.subject} body={draft.body} />
            {!editing ? <EditDraftAction onEdit={startEditing} /> : null}
          </div>
        ) : null
      ) : channel === 'phone' ? (
        // #2366.5 — le script d'appel COURANT devient une tâche d'appel suivie
        // par sa propre machine d'états ; une version remplacée ne crée rien.
        isCurrentDraft ? (
          <div className="flex flex-wrap items-center gap-1 pt-1">
            <EngagementCreateCallTaskAction contact={contact} script={draft.body} rationale={insight.rationale} />
          </div>
        ) : null
      ) : (
        <MessageActions
          channel={channel}
          contact={contact}
          editing={editing}
          isCurrentDraft={isCurrentDraft}
          subject={draft.subject}
          text={draft.body}
          onEdit={startEditing}
          onLinkedinDeclaredSent={onLinkedinDeclaredSent}
          onLinkedinOpen={onLinkedinOpen}
          onMessageCopy={onMessageCopy}
          onDismiss={onDismiss}
        />
      )}
    </section>
  )
}

/** Le brouillon tel qu'il est lu — c'est exactement ce que copie/envoie la barre
 *  d'actions (mêmes valeurs `draft.*`, aucune source parallèle). */
function DraftPreview({ channel, subject, body }: { channel: EngagementChannel; subject: string; body: string }) {
  return (
    <>
      {/* #2123.72 — l'intitulé d'une tâche se lit comme l'objet d'un e-mail. */}
      {channelHasSubject(channel) && subject ? (
        <p className="truncate text-sm font-medium text-[var(--bellum-text-secondary)]">{subject}</p>
      ) : null}
      {/* La largeur de lecture (70 ch) vient de `Text`, la borne partagée (D81) : elle ne se redéclare pas ici. */}
      <Text size="sm" leading="relaxed" className="whitespace-pre-line break-words text-[var(--bellum-text-primary)]">
        {body}
      </Text>
    </>
  )
}

/**
 * Édition du brouillon avant envoi. L'état édité est la SEULE source de vérité
 * pour l'aperçu, la copie et l'envoi : ce qui part est ce qui est affiché,
 * retouches comprises.
 */
function DraftEditor({
  channel,
  draft,
  onChange,
  onDone,
}: {
  channel: EngagementChannel
  draft: { subject: string; body: string }
  onChange: (draft: { subject: string; body: string }) => void
  onDone: () => void
}) {
  const { t } = useTranslation('engagement')

  return (
    <div className="space-y-2">
      {channelHasSubject(channel) ? (
        <input
          aria-label={t('message.edit.subjectLabel')}
          className="w-full rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-2.5 py-1.5 text-sm font-medium text-[var(--bellum-text-primary)]"
          placeholder={t('message.edit.subjectPlaceholder')}
          value={draft.subject}
          onChange={event => onChange({ ...draft, subject: event.target.value })}
        />
      ) : null}
      <textarea
        aria-label={t('message.edit.bodyLabel')}
        className="min-h-40 w-full resize-y rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-2.5 py-1.5 text-sm leading-6 text-[var(--bellum-text-primary)]"
        value={draft.body}
        onChange={event => onChange({ ...draft, body: event.target.value })}
      />
      <div className="flex justify-end">
        <TooltipButton
          tooltip={t('message.edit.done')}
          variant="ghost"
          size="xs"
          icon={Check}
          iconClassName="size-3.5"
          aria-label={t('message.edit.done')}
          className="text-[var(--bellum-text-muted)] text-xs rounded-full"
          onClick={onDone}
        >
          {t('message.edit.done')}
        </TooltipButton>
      </div>
    </div>
  )
}

function SupersededBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-[var(--bellum-bg-lighter)] px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-[var(--bellum-text-muted)]">
      {label}
    </span>
  )
}

/**
 * Un seul point d'envoi dans le fil : seul le brouillon COURANT porte
 * « Envoyer » (et « Éditer »). Un email est irréversible — avertir que la
 * version visée est périmée laisserait quand même partir l'erreur, alors que
 * retirer le contrôle la rend impossible. Le badge « version antérieure »
 * explique l'absence du bouton plutôt que de la laisser mystérieuse.
 */
function MessageActions({
  channel,
  contact,
  editing,
  isCurrentDraft,
  subject,
  text,
  onEdit,
  onLinkedinDeclaredSent,
  onLinkedinOpen,
  onMessageCopy,
  onDismiss,
}: {
  channel: EngagementChannel
  contact: Contact
  editing: boolean
  isCurrentDraft: boolean
  subject: string
  text: string
  onEdit: () => void
  onLinkedinDeclaredSent: () => void
  onLinkedinOpen: () => void
  onMessageCopy: () => void
  onDismiss: () => void
}) {
  const linkedinUrl = contact.linkedin_url
  // « A ouvert LinkedIn » n'est PAS « a envoyé » — cet état ne fait qu'afficher
  // l'option de déclarer. Rien n'est jamais tracé comme envoi sans clic explicite.
  const [openedLinkedin, setOpenedLinkedin] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-1 pt-1">
      {channel === 'linkedin' && linkedinUrl ? (
        <CopyAndOpenLinkedinAction
          linkedinUrl={linkedinUrl}
          text={text}
          onLinkedinOpen={() => {
            onLinkedinOpen()
            setOpenedLinkedin(true)
          }}
          onMessageCopy={onMessageCopy}
        />
      ) : (
        <CopyMessageAction text={text} onMessageCopy={onMessageCopy} />
      )}
      {isCurrentDraft && !editing ? <EditDraftAction onEdit={onEdit} /> : null}
      {isCurrentDraft && channel === 'email' ? (
        <EngagementSendEmailAction contact={contact} subject={subject} text={text} />
      ) : null}
      {isCurrentDraft && channel === 'email' && !contact.email_sent_at ? (
        <EmailSentDeclaration contact={contact} />
      ) : null}
      {channel === 'linkedin' && openedLinkedin ? (
        <LinkedinSentDeclaration contact={contact} onDeclare={onLinkedinDeclaredSent} />
      ) : null}
      {/* #2396.12 — préparer/envoyer/marquer manuel sont les boutons ci-dessus ;
          « écarter » est le quatrième choix, toujours disponible sur le brouillon
          courant : décider de ne PAS utiliser ce brouillon est un geste distinct
          d'un envoi, il n'efface rien, il ne fait que le sortir du travail en cours. */}
      {isCurrentDraft ? <DismissDraftAction onDismiss={onDismiss} /> : null}
      {/* #4737 K2 — le mandat d'envoi LinkedIn : dit « voie d'envoi non ouverte » tant que la voie ne l'est pas. */}
      {isCurrentDraft && channel === 'linkedin' && linkedinUrl ? (
        <LinkedinDelegationCard contact={contact} text={text} />
      ) : null}
    </div>
  )
}

/**
 * #2396.12 — « Écarter » : le commercial décide de ne pas utiliser ce
 * brouillon (ni envoi, ni déclaration). Réutilise `plan_action_skipped`
 * (`packages/contracts/src/schemas/actions.ts`) — déjà dans le contrat et déjà
 * doté d'un libellé (`contacts.service.ts:565,589`), jamais écrit avant ce lot.
 */
function DismissDraftAction({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation('engagement')
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  return (
    <TooltipButton
      tooltip={t('message.dismiss.tooltip')}
      variant="ghost"
      size="xs"
      icon={X}
      iconClassName="size-3.5"
      aria-label={t('message.dismiss.action')}
      className="text-[var(--bellum-text-muted)] text-xs rounded-full"
      onClick={() => {
        onDismiss()
        setDismissed(true)
      }}
    >
      {t('message.dismiss.action')}
    </TooltipButton>
  )
}

/**
 * « J'ai envoyé ce message » — déclaration manuelle, jamais une déduction.
 *
 * Bellum n'a aucun moyen de savoir si le message est parti sur LinkedIn : pas
 * d'API de messagerie, et lire le retour de focus ou la fermeture d'onglet
 * fabriquerait une donnée d'activité. Le seul signal légitime est le commercial
 * lui-même. Le libellé dit explicitement que Bellum n'a rien envoyé.
 *
 * Idempotent côté UX : une fois déclaré, le bouton cède la place au compte
 * rendu (#2714, `SendReceipt` nature="declared" — jamais confondu avec un
 * envoi VÉRIFIÉ, `c73_fait_ne_porte_pas_preuve_denvoi`).
 */
function LinkedinSentDeclaration({ contact, onDeclare }: { contact: Contact; onDeclare: () => void }) {
  const { t } = useTranslation('engagement')
  const [declaredAt, setDeclaredAt] = useState<string | null>(null)

  if (declaredAt) {
    return <SendReceipt contact={contact} channel="linkedin" sentAt={declaredAt} nature="declared" />
  }

  return (
    <TooltipButton
      tooltip={t('message.declareSent.tooltip')}
      variant="ghost"
      size="xs"
      icon={CheckCheck}
      iconClassName="size-3.5"
      aria-label={t('message.declareSent.action')}
      className="text-[var(--bellum-text-muted)] text-xs rounded-full"
      onClick={() => {
        onDeclare()
        // #4418.1 — même geste déclaratif, mêmes relances : best-effort, le « fait » est déjà consigné.
        void contactsApi.declareTouch(contact.id).catch(() => undefined)
        setDeclaredAt(new Date().toISOString())
      }}
    >
      {t('message.declareSent.action')}
    </TooltipButton>
  )
}

/**
 * #4418.1 — « Marquer envoyé » sur un brouillon email : le commercial l'a envoyé LUI-MÊME (depuis sa
 * messagerie). Déclaratif — le compte rendu dit « Déclaré par toi, non vérifié », jamais « expédié »
 * (c73). Le serveur planifie les relances J+3/J+6/J+9 visibles dans Actions › Aujourd'hui.
 */
function EmailSentDeclaration({ contact }: { contact: Contact }) {
  const { t } = useTranslation('engagement')
  const declare = useDeclareSent(contact.id)
  const [declaredAt, setDeclaredAt] = useState<string | null>(null)

  if (declaredAt) {
    return <SendReceipt contact={contact} channel="email" sentAt={declaredAt} nature="declared" />
  }

  return (
    <TooltipButton
      tooltip={t('message.markSent.tooltip')}
      variant="ghost"
      size="xs"
      icon={CheckCheck}
      iconClassName="size-3.5"
      aria-label={t('message.markSent.action')}
      disabled={declare.isPending}
      className="text-[var(--bellum-text-muted)] text-xs rounded-full"
      onClick={() => declare.mutate({ channel: 'email' }, { onSuccess: () => setDeclaredAt(new Date().toISOString()) })}
    >
      {t('message.markSent.action')}
    </TooltipButton>
  )
}

function EditDraftAction({ onEdit }: { onEdit: () => void }) {
  const { t } = useTranslation('engagement')

  return (
    <TooltipButton
      tooltip={t('message.edit.tooltip')}
      variant="ghost"
      size="xs"
      icon={Pencil}
      iconClassName="size-3.5"
      aria-label={t('message.edit.action')}
      className="text-[var(--bellum-text-muted)] text-xs rounded-full"
      onClick={onEdit}
    >
      {t('message.edit.action')}
    </TooltipButton>
  )
}

function CopyMessageAction({ text, onMessageCopy }: { text: string; onMessageCopy: () => void }) {
  const { t } = useTranslation('engagement')
  // #1152 : minuteur annulé au démontage — voir `useCopiedFlash`.
  const [copied, flashCopied] = useCopiedFlash(COPIED_FLASH_MS)

  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      onMessageCopy()
      flashCopied()
    })
  }

  return (
    <TooltipButton
      tooltip={copied ? t('common:actions.copied') : t('message.copy')}
      variant="ghost"
      size="xs"
      icon={copied ? Check : Copy}
      iconClassName="size-3.5"
      aria-label={t('message.copy')}
      className="text-[var(--bellum-text-muted)] text-xs rounded-full"
      onClick={copy}
    >
      {t('common:actions.copy')}
    </TooltipButton>
  )
}

/**
 * LinkedIn en un geste : copie le message ET ouvre LinkedIn d'un seul clic.
 *
 * On ouvre le PROFIL, pas le fil de messagerie : les routes `/messaging/*` de
 * LinkedIn sont indexées sur des identifiants internes (thread / member id) que
 * l'on ne possède pas — on n'a que l'URL publique `/in/<slug>`. Fabriquer une
 * URL de messagerie à partir du slug enverrait le commercial sur une page
 * d'erreur ou une boîte vide. Depuis le profil, « Message » est à un clic.
 *
 * Aucun envoi programmatique : LinkedIn n'expose pas d'API de messagerie et les
 * contournements par cookie de session violent les CGU (bannissement du compte
 * du commercial). Le presse-papier + le profil, c'est la limite sûre.
 */
function CopyAndOpenLinkedinAction({
  linkedinUrl,
  text,
  onLinkedinOpen,
  onMessageCopy,
}: {
  linkedinUrl: string
  text: string
  onLinkedinOpen: () => void
  onMessageCopy: () => void
}) {
  const { t } = useTranslation('engagement')
  // #1152 : minuteur annulé au démontage — voir `useCopiedFlash`.
  const [copied, flashCopied] = useCopiedFlash(COPIED_FLASH_MS)

  const copyAndOpen = () => {
    // Les deux appels partent dans le même tick que le clic — sinon le
    // `window.open` sort du geste utilisateur et se fait bloquer par le
    // navigateur.
    const copying = navigator.clipboard.writeText(text)
    onLinkedinOpen()
    window.open(linkedinUrl, '_blank', 'noopener,noreferrer')
    void copying.then(() => {
      onMessageCopy()
      flashCopied()
    })
  }

  return (
    <TooltipButton
      tooltip={t('message.copyAndOpenLinkedinHint')}
      variant="ghost"
      size="xs"
      icon={copied ? Check : ExternalLink}
      iconClassName="size-3.5"
      aria-label={t('message.copyAndOpenLinkedin')}
      className="text-[var(--bellum-text-muted)] text-xs rounded-full"
      onClick={copyAndOpen}
    >
      {t('message.copyAndOpenLinkedin')}
    </TooltipButton>
  )
}
