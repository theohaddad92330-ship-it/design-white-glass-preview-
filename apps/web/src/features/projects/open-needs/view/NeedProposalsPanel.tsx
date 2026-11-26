import { Badge, Box, Button, SelectField, Text } from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { needProposalsApi, openNeedsKeys, type NeedProposal } from '../api'
import { formatDate } from '@/lib/locale'
import { useProjects } from '@/features/projects/hooks/useProjects'

/**
 * CE QUE L'ANALYSE A VU, ET QUI N'EST PAS ENCORE UN BESOIN (PDF 4, PE5).
 *
 * Le panneau existe pour tenir une distinction, pas pour gagner un clic : une
 * offre d'emploi détectée chez un client est un INDICE, pas une demande. Le
 * chantier du PDF 4 avait refusé ce point d'entrée parce que le pipe se serait
 * rempli tout seul de besoins que personne n'a validés — au bout d'une semaine,
 * plus personne ne fait confiance à la liste.
 *
 * D'où deux choses : le panneau est SÉPARÉ du tableau des besoins ouverts, et
 * accepter demande de choisir le projet. Rattacher au hasard produirait un
 * besoin sur la mauvaise affaire, et personne ne le verrait avant de l'envoyer
 * à un client.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ POURQUOI IL EST REPLIÉ PAR DÉFAUT (recette en PRODUCTION, 27/08/2026)
 * ─────────────────────────────────────────────────────────────────────────
 * Mesuré sur `/projects/needs` : le tableau des besoins commençait à 2 866 px
 * dans un conteneur défilant de 3 058 px — **à 94 % de la page**. Seize
 * propositions, chacune dépliée avec sa liste de projets pleine largeur, son
 * bouton et un champ « Pourquoi l'écarter ? » permanent, occupaient tout le
 * reste. Le bloc dit lui-même « Ce ne sont pas encore des besoins » : le sujet
 * PROPRE de l'écran était donc enterré sous ce qui n'est pas encore son sujet.
 *
 * Deux directions étaient possibles. Le DESCENDRE sous le tableau déplacerait
 * le défaut sans le fermer : le tableau pagine à cinquante lignes, et un bloc
 * de triage placé après cinquante lignes n'est plus jamais vu — un travail
 * qu'on ne voit plus ne se fait plus, et les propositions s'empileraient.
 *
 * Il reste donc EN TÊTE, où il alerte, mais REPLIÉ : une ligne qui dit combien
 * il y a à trier, et le tableau juste dessous. Aucune capacité ne disparaît —
 * les seize propositions sont à un clic, toutes, avec les mêmes gestes.
 *
 * Même raison pour le motif d'écartement, qui n'apparaît qu'au GESTE d'écarter :
 * un champ de saisie permanent par proposition double la hauteur de chacune
 * pour un geste qu'on ne fait pas la plupart du temps. Il reste OBLIGATOIRE
 * quand on le fait.
 */
type NeedProposalsPanelProps = {
  /**
   * #2647.1 — CLOISONNE la lecture à un seul compte : la section « Besoins »
   * en tête du dossier compte. Absent, le panneau garde son comportement
   * d'origine — la vue transverse de l'espace (BEL-CRM-101, `/projects/needs`).
   * Deux comptes du même espace ne doivent jamais partager la même liste.
   */
  accountId?: string
}

export function NeedProposalsPanel({ accountId }: NeedProposalsPanelProps = {}) {
  const { t } = useTranslation('projects')
  const queryClient = useQueryClient()
  // REPLIÉ à l'ouverture. L'état est local et non persisté : le bloc doit
  // redevenir une alerte à chaque visite — une préférence « toujours déplié »
  // recréerait exactement l'écran qu'on vient de réparer.
  const [open, setOpen] = useState(false)
  const queryKey = ['need-proposals', accountId ?? null] as const
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => (accountId ? needProposalsApi.listForAccount(accountId) : needProposalsApi.list()),
    select: response => response.items,
  })

  const invalidate = () => {
    // Préfixe partagé : invalide la vue transverse ET toutes les vues par
    // compte d'un même geste (GA-26 — un seul mécanisme d'invalidation).
    void queryClient.invalidateQueries({ queryKey: ['need-proposals'] })
    void queryClient.invalidateQueries({ queryKey: openNeedsKeys.all })
  }

  const accept = useMutation({
    mutationFn: ({ id, projectId }: { id: string; projectId: string }) => needProposalsApi.accept(id, projectId),
    onSuccess: () => {
      invalidate()
      toast.success(t('proposals.accepted'))
    },
    onError: () => toast.error(t('proposals.failed')),
  })
  const dismiss = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => needProposalsApi.dismiss(id, reason),
    onSuccess: () => {
      invalidate()
      toast.success(t('proposals.dismissed'))
    },
    onError: () => toast.error(t('proposals.failed')),
  })

  // Rien à proposer = rien à afficher. Un bloc vide en permanence apprend à
  // ignorer la zone, et le jour où une proposition arrive, personne ne la voit.
  const items = data ?? []
  if (isLoading || items.length === 0) return null

  return (
    <Box className="rounded-md border border-border bg-card p-3">
      <Box display="flex" className="flex-wrap items-baseline justify-between gap-2">
        <Text element="h2" size="sm" weight="medium">
          {t('proposals.title')}
        </Text>
        {/* Le COMPTE, replié comme déplié : c'est lui qui dit qu'il reste du
            travail. Un bloc replié sans chiffre ne se rouvre jamais. */}
        <Badge variant="outline">{t('proposals.pending', { count: items.length })}</Badge>
      </Box>
      <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
        {t('proposals.subtitle')}
      </Text>

      {/* `<button>` et non un `<div onClick>` : ce qui se clique se tabule
          (GA-35). Le libellé change avec l'état — un bouton qui dit toujours la
          même chose ne dit pas ce qu'il va faire. */}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-2"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        {open ? t('proposals.toggleClose') : t('proposals.toggleOpen')}
      </Button>

      {open && (
        <Box className="mt-2 space-y-2">
          {items.map(proposal => (
            <ProposalRow
              key={proposal.id}
              proposal={proposal}
              pending={accept.isPending || dismiss.isPending}
              onAccept={projectId => accept.mutate({ id: proposal.id, projectId })}
              onDismiss={reason => dismiss.mutate({ id: proposal.id, reason })}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}

function ProposalRow({
  proposal,
  pending,
  onAccept,
  onDismiss,
}: {
  proposal: NeedProposal
  pending: boolean
  onAccept: (projectId: string) => void
  onDismiss: (reason: string) => void
}) {
  const { t } = useTranslation('projects')
  const [projectId, setProjectId] = useState('')
  const [reason, setReason] = useState('')
  // Le motif d'écartement n'existe qu'APRÈS le geste. Permanent, il doublait la
  // hauteur de chaque proposition pour un geste minoritaire — seize fois, c'est
  // la moitié de l'écran mesuré le 27/08.
  const [dismissing, setDismissing] = useState(false)
  const { data: projects } = useProjects()
  // Seuls les projets DU COMPTE concerné : proposer les autres inviterait à
  // rattacher un besoin à la mauvaise affaire, ce que rien ne rattraperait.
  const candidates = (projects ?? []).filter(project => project.account_id === proposal.account_id)

  return (
    <Box className="space-y-2 rounded border border-border p-2">
      <Box display="flex" className="flex-wrap items-baseline justify-between gap-2">
        <Text element="span" size="sm" weight="medium">
          {proposal.title}
        </Text>
        {proposal.location ? (
          <Text element="span" size="xs" color="text-muted-foreground">
            {proposal.location}
          </Text>
        ) : null}
      </Box>
      {proposal.skills.length > 0 ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          {proposal.skills.join(' · ')}
        </Text>
      ) : null}

      {/* #1333 (4/9) — LE STATUT, LA SOURCE, LA DATE.

          « Pour chaque proposition afficher : … source · date · statut :
          **Opportunité détectée, jamais Besoin confirmé**. »

          ⚠️ `source_url` et `detected_at` voyageaient déjà dans la charge
          (`NeedProposal`) et la ligne n'en rendait aucun : on demandait
          d'accepter ou d'écarter une proposition sans jamais montrer sur quoi
          elle repose. C'est le contraire de la promesse — détecter, EXPLIQUER,
          humain valide, agir.

          « Voir les preuves » est ce lien-là. Il s'ouvre dans un onglet
          (`rel="noreferrer"` : une page tierce n'a rien à savoir d'où on vient),
          et il ne s'affiche pas quand aucune source n'est stockée — jamais un
          lien mort.

          ⚠️ Le NIVEAU DE CONFIANCE n'est pas affiché, et ce n'est pas un oubli :
          la charge n'en porte pas. Inventer une échelle à l'écran donnerait un
          chiffre que rien ne calcule, sur la file dont tout le propos est de ne
          pas faire croire. */}
      <Box display="flex" className="flex-wrap items-center gap-x-3 gap-y-1">
        <Badge variant="outline">{t('proposals.statusDetected')}</Badge>
        {proposal.detected_at ? (
          <Text element="span" size="xs" color="text-muted-foreground">
            {t('proposals.detectedOn', { date: formatDate(proposal.detected_at, { dateStyle: 'medium' }) })}
          </Text>
        ) : null}
        {proposal.source_url ? (
          <a
            href={proposal.source_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm text-xs text-[var(--bellum-text-accent)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
          >
            {t('proposals.seeEvidence')}
          </a>
        ) : null}
      </Box>

      <Box display="flex" className="flex-wrap items-center gap-2">
        <SelectField
          ariaLabel={t('proposals.pickProject')}
          value={projectId}
          onChange={next => setProjectId(next)}
          emptyOption={{ label: t('proposals.pickProject') }}
          options={candidates.map(project => ({ value: project.id, label: project.label }))}
          className="min-w-0 max-w-full"
        />
        <Button size="sm" variant="outline" disabled={!projectId || pending} onClick={() => onAccept(projectId)}>
          {t('proposals.accept')}
        </Button>
      </Box>

      {dismissing ? (
        <Box display="flex" className="flex-wrap items-center gap-2">
          <input
            value={reason}
            onChange={event => setReason(event.target.value)}
            placeholder={t('proposals.dismissReason')}
            aria-label={t('proposals.dismissReason')}
            maxLength={500}
            className="min-w-[220px] flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
          />
          {/* Inerte tant que le motif est vide : sans lui on ne saura pas dans six
              mois si l'offre ne correspondait pas au métier de l'ESN ou si elle
              était simplement trop ancienne. Le champ apparaît au geste, le motif
              reste OBLIGATOIRE — on a retiré l'encombrement, pas la question. */}
          <Button size="sm" variant="ghost" disabled={!reason.trim() || pending} onClick={() => onDismiss(reason)}>
            {t('proposals.dismissConfirm')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDismissing(false)
              setReason('')
            }}
          >
            {t('proposals.dismissCancel')}
          </Button>
        </Box>
      ) : (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDismissing(true)}>
          {t('proposals.dismiss')}
        </Button>
      )}
    </Box>
  )
}
