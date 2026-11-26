import type { Contact, OutreachDisplayStatus, OutreachSequence, OutreachSequenceStep } from '@bellum/contracts'
import { deriveOutreachDisplayStatus } from '@bellum/contracts'
import { Badge, Box, Button, Text, cn } from '@bellum/ui'
import type { TFunction } from 'i18next'
import { ListChecks } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOutreachSequences } from '@/features/outreach/hooks/useOutreachSequences'
import { CreateSequenceDialog } from '@/features/outreach/view/CreateSequenceDialog'
import { i18n } from '@/i18n'
import { SectionCard } from './SectionCard'

function formatDate(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function stepLabel(t: TFunction<'outreach'>, step: OutreachSequenceStep): string {
  const label = step.payload['label']
  // i18n keys: stepKind.email | stepKind.reminder | stepKind.task
  return typeof label === 'string' && label.length > 0 ? label : t(`stepKind.${step.kind}`)
}

/**
 * Le badge porte le statut d'AFFICHAGE, pas celui de la base (addendum p56).
 *
 * « Active » s'affichait sur une séquence dont la prochaine étape était un e-mail
 * que personne ne pouvait envoyer : la base n'avait pas tort — la séquence court
 * bien — mais le mot laissait croire que quelque chose partait tout seul, alors
 * que le code d'outreach dit l'inverse. Les couleurs suivent : ce qui attend
 * l'utilisateur est ambre, ce qui court est vert.
 */
const STATUS_BADGE_CLASS: Record<OutreachDisplayStatus, string> = {
  prepared: 'bg-sky-500/15 text-[var(--info-soft-text)]',
  scheduled: 'bg-emerald-500/15 text-[var(--success-soft-text)]',
  awaiting_connection: 'bg-amber-500/15 text-[var(--warning-soft-text)]',
  // « Prête à copier » n'est PAS un blocage : rien ne manque, le travail est
  // faisable à la main. Elle est donc bleue comme « préparée », pas ambre comme
  // ce qui attend une action de l'utilisateur (recette finale §44).
  ready_to_copy: 'bg-sky-500/15 text-[var(--info-soft-text)]',
  awaiting_validation: 'bg-amber-500/15 text-[var(--warning-soft-text)]',
  // Une réponse est le meilleur résultat possible d'une séquence : elle se lit
  // au premier coup d'œil, en vert franc, et la séquence s'arrête là.
  responded: 'bg-emerald-500/25 text-[var(--success-soft-text)]',
  failed: 'bg-red-500/15 text-[var(--danger-soft-text)]',
  paused: 'bg-amber-500/15 text-[var(--warning-soft-text)]',
  completed: 'bg-violet-500/15 text-[var(--bellum-text-accent)]',
  cancelled: 'bg-muted text-muted-foreground',
  // #2202.48/#2202.51 — deux causes d'arrêt plus précises que « cancelled »,
  // même famille visuelle : ce sont toutes les deux des arrêts DÉFINITIFS, ce
  // qui change c'est le MOT lu par le commercial, pas la couleur.
  refused: 'bg-muted text-muted-foreground',
  bounced: 'bg-muted text-muted-foreground',
}

/** Au plus trois campagnes sur la fiche : le reste se lit dans Actions → Séquences. */
const MAX_ROWS = 3

/**
 * #3700 — la fiche contact RÉSUME, elle ne gère plus.
 *
 * Créer, lancer, mettre en pause, annuler et suivre une séquence se fait dans
 * Actions → Séquences, à UN seul endroit (GA-26) : l'ancienne carte portait un
 * second éditeur (« Programmer une séquence », pause/reprise/annulation, « Fait »
 * par étape) et un texte qui contredisait l'écran Séquences. Pour chaque
 * campagne : son nom, son état, la dernière étape jouée, la prochaine action
 * et le lien vers LA campagne exacte. Les messages envoyés et les réponses
 * restent dans l'historique du contact.
 *
 * #3700 (recette prod 09/10) — RENVERSEMENT ASSUMÉ sur l'état VIDE : le lot
 * I30 (05/10) avait tranché « rien tant que le contact ne participe à aucune
 * campagne » pour éviter une grande carte vide. Louis a demandé l'inverse en
 * recette : sans séquence, la carte reste visible et porte le GESTE pour en
 * créer une — sinon le geste n'existe QUE depuis la liste des contacts,
 * jamais depuis la fiche elle-même. Le geste ouvre le MÊME dialogue partagé
 * (`CreateSequenceDialog`, #1512) que la liste, sans inscription avant
 * validation — pas un second éditeur.
 */
export function ContactOutreachCard({ contact }: { contact: Contact }) {
  const { t } = useTranslation('outreach')
  const { data: sequences } = useOutreachSequences(contact.id)
  const rows = (sequences ?? []).slice(0, MAX_ROWS)
  const [creating, setCreating] = useState(false)

  // #3700 — tant que la lecture n'a pas répondu, on ne sait pas encore si le
  // contact participe à une séquence : ni la carte résumé, ni l'état VIDE
  // (qui dirait « aucune séquence » avant d'avoir vraiment regardé).
  if (sequences === undefined) return null

  if (rows.length === 0) {
    return (
      <SectionCard icon={ListChecks} iconClassName="text-[var(--bellum-text-accent)]" title={t('card.title')}>
        <Text element="p" size="sm" color="text-muted-foreground">
          {t('card.empty')}
        </Text>
        <Button type="button" variant="light" size="sm" className="mt-3" onClick={() => setCreating(true)}>
          {t('card.create')}
        </Button>
        {/* #3702.8 — la promesse, au même endroit que dans le dialogue partagé : une seule clé. */}
        <Text element="p" size="xs" color="text-muted-foreground" className="mt-2">
          {t('card.neverAutoSend')}
        </Text>
        {/* #1512 — la MÊME fenêtre que l'écran Séquences et que la liste des
            contacts, avec ce seul contact déjà dedans. */}
        <CreateSequenceDialog
          open={creating}
          onOpenChange={setCreating}
          initialContacts={[
            {
              id: contact.id,
              full_name: contact.full_name,
              title: contact.title ?? null,
              email: contact.email ?? null,
              excluded_at: contact.excluded_at ?? null,
              assigned_to: contact.assigned_to ?? null,
            },
          ]}
        />
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={ListChecks} iconClassName="text-[var(--bellum-text-accent)]" title={t('card.title')}>
      <Box className="space-y-3">
        {rows.map(sequence => (
          <SequenceSummary key={sequence.id} sequence={sequence} />
        ))}
      </Box>
      <Text element="p" size="xs" color="text-muted-foreground" className="mt-2">
        {t('card.neverAutoSend')}
      </Text>
    </SectionCard>
  )
}

function SequenceSummary({ sequence }: { sequence: OutreachSequence }) {
  const { t } = useTranslation('outreach')
  // ⚠️ `can_send` vient du SERVEUR : une seule lecture de la capacité d'envoi.
  const nextStep = sequence.next_step ?? sequence.steps.find(step => step.status === 'pending') ?? null
  const lastDone = [...sequence.steps].reverse().find(step => step.status === 'done') ?? null
  const displayStatus = deriveOutreachDisplayStatus({
    status: sequence.status,
    nextStep: nextStep ? { due_at: nextStep.due_at, kind: nextStep.kind } : null,
    canSend: sequence.can_send,
    hasProgress: sequence.steps.some(step => step.status !== 'pending'),
    cancelReason: sequence.cancel_reason,
  })
  const stopped = sequence.status === 'cancelled' || sequence.status === 'completed'
  const title = sequence.campaign_label?.trim() || sequence.name

  return (
    <Box className="rounded-xl border border-border/60 p-3">
      <Box display="flex" className="items-center gap-2">
        <Text element="p" size="sm" weight="semibold" className="min-w-0 flex-1 truncate">
          {title}
        </Text>
        <Badge className={cn('shrink-0 border-transparent', STATUS_BADGE_CLASS[displayStatus])}>
          {t(`status.${displayStatus}`)}
        </Badge>
      </Box>
      {lastDone ? (
        <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
          {t('card.lastStep', { step: stepLabel(t, lastDone), date: formatDate(lastDone.due_at) })}
        </Text>
      ) : null}
      {/* Une campagne arrêtée n'a plus de « prochaine action » : on ne l'invente pas. */}
      {!stopped && nextStep ? (
        <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
          {t('card.nextAction', { step: stepLabel(t, nextStep), date: formatDate(nextStep.due_at) })}
        </Text>
      ) : null}
      <Link
        to="/actions/sequences/$id"
        params={{ id: sequence.id }}
        className="mt-2 inline-flex min-h-11 items-center text-xs underline"
      >
        {t('card.open')}
      </Link>
    </Box>
  )
}
