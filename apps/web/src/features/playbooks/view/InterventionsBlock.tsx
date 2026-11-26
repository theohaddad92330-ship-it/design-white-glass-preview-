import type { Intervention } from '@bellum/contracts'
import { hasPermission, INTERVENTION_VISIBLE_COUNT, isInterventionStale } from '@bellum/contracts'
import { Badge, Box, Button, Card, Input, SelectField, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { interventionHref } from '@/features/briefing/cockpit'
import { useWorkspaceMembers, type WorkspaceMember } from '@/features/chat/hooks/useWorkspaceMembers'
import { formatTimeAgo } from '@/lib/relative-time'
import { useAssignIntervention, useDecideIntervention, useInterventions } from '../api'

/**
 * « À TRAITER » — la file d'arbitrage du responsable (§7.4, #1439).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE RETOUR REPROCHAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * *« Le bloc À traiter doit devenir une vraie file manager, et remonter très
 * haut dans la page. »* Il était en bas de `/pilotage`, sous le dictionnaire des
 * soixante-deux indicateurs — c'est-à-dire après tout ce qui ne demande aucune
 * décision. Et chaque ligne DEMANDAIT un arbitrage sans offrir le moindre chemin
 * vers l'objet à arbitrer : « une réponse juste sans chemin », le motif dominant
 * de ce dépôt.
 *
 * Trois choses changent, et une quatrième a été écartée :
 *
 *  1. **La porte.** Chaque ligne mène à son objet — via `interventionHref`, qui
 *     existait déjà et ne servait que sur le brief. Deux tables de destinations
 *     auraient divergé au premier écran déplacé.
 *  2. **La conséquence.** Ce qui arrive si personne ne tranche, par nature de
 *     situation. C'est une RÈGLE, pas une donnée : elle vit en traduction, elle
 *     ne se lit dans aucune ligne de base.
 *  3. **L'âge.** `openedAt` était dans la charge utile et n'apparaissait nulle
 *     part, alors qu'il pèse déjà dans le classement (gravité × âge plafonné) :
 *     l'écran cachait la moitié de son propre tri.
 *  4. ⚠️ **Le sujet n'est PAS re-nommé.** Le contrat porte un `subjectLabel`,
 *     mais le serveur l'écrit `null` en dur — et surtout les neuf règles qui
 *     ouvrent une intervention nomment DÉJÀ leur sujet dans le détail
 *     (« Société Générale : aucune prochaine action prévue… »). L'ajouter aurait
 *     affiché la même chose deux fois, ou rien.
 *
 * ⚠️ **Vide, la file ne prend pas une carte.** Le retour demande la phrase
 * (« Rien ne nécessite ton arbitrage actuellement ») ET « ne pas afficher une
 * grande carte vide » : les deux ne tiennent ensemble qu'en sortant la phrase de
 * la carte. Une file vide est une bonne nouvelle, pas un bloc.
 */
export function InterventionsBlock() {
  const { t } = useTranslation('playbooks')
  const { data: items, isError, isLoading } = useInterventions()
  const decide = useDecideIntervention()
  const assign = useAssignIntervention()
  const [expanded, setExpanded] = useState(false)
  // #2206.53 — « le manager peut attribuer une action » (critère de recette).
  // La même liste sert la SÉLECTION et le contrôle d'accès : `isSelf` porte
  // le rôle du membre courant, sans requête séparée.
  const members = useWorkspaceMembers().data ?? []
  const canAssign = hasPermission(members.find(member => member.isSelf)?.role ?? 'member', 'team:manage')

  /**
   * Cinq cartes, pas plus — et le reste est ANNONCÉ.
   *
   * Une file qui déroule vingt lignes n'est plus une file : c'est une seconde
   * boîte de réception, et une seconde boîte de réception ne se lit pas. Le
   * serveur les rend toutes, déjà CLASSÉES (gravité × âge plafonné) ; l'écran
   * décide de ce qu'il montre, et il dit toujours combien il replie. Couper en
   * silence ferait croire qu'il n'y a que ça à faire.
   */
  const all = items ?? []
  const shown = expanded ? all : all.slice(0, INTERVENTION_VISIBLE_COUNT)
  const hidden = all.length - shown.length

  // Le chargement ne dit rien : une file vide affichée pendant deux secondes se
  // lit « rien à faire », et le responsable est déjà passé à autre chose.
  if (isLoading) return null

  // Une erreur de lecture n'est PAS « rien à traiter » : afficher une file vide
  // sur un serveur en panne ferait rentrer chez soi un responsable qui avait
  // quelque chose à faire. Une ligne, parce qu'il n'y a rien à mettre en carte.
  if (isError) {
    return (
      <Text element="p" size="xs" className="mt-4 text-[var(--bellum-text-muted)]">
        {t('interventions.loadError')}
      </Text>
    )
  }

  if (all.length === 0) {
    return (
      <Text element="p" size="xs" className="mt-4 text-[var(--bellum-text-muted)]">
        {t('interventions.empty')}
      </Text>
    )
  }

  return (
    <Card className="mt-4 p-4">
      <Text element="p" size="sm" weight="semibold">
        {t('interventions.title')}
      </Text>
      <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
        {t('interventions.intro')}
      </Text>

      <Box className="mt-3 space-y-2">
        {shown.map(item => (
          <InterventionRow
            key={item.id}
            item={item}
            pending={decide.isPending}
            onDecide={(state, reason) =>
              // Une ligne regroupée par client décide pour TOUTES ses factures.
              (item.group?.ids ?? [item.id]).forEach(id => decide.mutate({ id, state, reason }))
            }
            canAssign={canAssign}
            members={members}
            assignPending={assign.isPending}
            onAssign={ownerId => assign.mutate({ id: item.id, ownerId })}
          />
        ))}
        {hidden > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => setExpanded(true)}>
            {t('interventions.showAll', { count: hidden })}
          </Button>
        ) : null}
      </Box>
    </Card>
  )
}

function InterventionRow({
  item,
  onDecide,
  pending,
  canAssign,
  members,
  assignPending,
  onAssign,
}: {
  item: Intervention
  onDecide: (state: 'acknowledged' | 'resolved', reason?: string) => void
  pending: boolean
  canAssign: boolean
  members: WorkspaceMember[]
  assignPending: boolean
  onAssign: (ownerId: string | null) => void
}) {
  const { t } = useTranslation('playbooks')
  // Clore demande de DIRE ce qui a été fait. Le champ n'apparaît qu'au moment du
  // geste : le poser d'avance sous chaque carte transformerait une file en
  // formulaire.
  const [closing, setClosing] = useState(false)
  const [reason, setReason] = useState('')
  const href = interventionHref(item)
  // #2402.13 — un signal OUVERT trop vieux arrête de crier « urgent » ; il
  // reste dans la file (on archive, on ne supprime pas), badge neutre.
  const stale = isInterventionStale(item, new Date())

  return (
    <Box className="rounded-md border border-border p-3">
      <Box display="flex" className="flex-wrap items-center justify-between gap-2">
        <Text element="span" size="sm" weight="medium">
          {t(`interventions.kinds.${item.kind}`)}
        </Text>
        <Badge variant={item.state === 'acknowledged' ? 'secondary' : stale ? 'outline' : 'warning'}>
          {stale ? t('interventions.states.stale') : t(`interventions.states.${item.state}`)}
        </Badge>
      </Box>
      {/* #2206.15 — LA CAUSE : pourquoi ce GENRE de situation existe, une
          règle par nature — jamais une valeur lue. Séparée de `detail`
          (le FAIT chiffré de CETTE ligne) comme la conséquence l'est déjà. */}
      <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
        {t(`interventions.causes.${item.kind}`)}
      </Text>
      {/* Le détail, tel quel, avec ses chiffres : « mission à risque » sans le
          nombre de jours n'aide personne à décider quoi faire aujourd'hui. Il
          NOMME déjà son sujet — c'est la raison pour laquelle `subjectLabel`
          n'est pas rendu à côté. */}
      <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
        {item.detail}
      </Text>
      {/* #1439 — LA CONSÉQUENCE : ce qui se passe si personne ne tranche.
          C'est ce qui distingue une file d'arbitrage d'une liste de rappels, et
          c'est une règle par nature de situation — jamais une valeur lue. */}
      <Text element="p" size="xs" className="mt-1 text-[var(--warning-soft-text)]">
        {t(`interventions.consequences.${item.kind}`)}
      </Text>
      <Box display="flex" className="mt-0.5 flex-wrap items-center gap-1">
        {/* « Personne » est une information, pas un trou d'affichage : un sujet
            sans propriétaire n'est suivi par personne. #2206.53 — le manager
            peut désormais CHANGER cette valeur, pas seulement la lire. */}
        {canAssign ? (
          <SelectField
            value={item.ownerId ?? ''}
            onChange={next => onAssign(next === '' ? null : next)}
            disabled={assignPending}
            size="sm"
            className="h-7 min-w-40 text-xs"
            ariaLabel={t('interventions.assignAria', { label: t(`interventions.kinds.${item.kind}`) })}
            emptyOption={{ label: t('interventions.noOwner') }}
            options={members.map(member => ({
              value: member.userId,
              label: member.fullName ?? member.email ?? member.userId,
            }))}
          />
        ) : (
          <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
            {item.ownerName ?? t('interventions.noOwner')}
          </Text>
        )}
        <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
          · {t('interventions.openedFor', { age: formatTimeAgo(item.openedAt) })}
        </Text>
      </Box>
      <Box display="flex" className="mt-2 flex-wrap items-center gap-1">
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => onDecide('acknowledged')}>
          {t('interventions.acknowledge')}
        </Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => setClosing(true)}>
          {t('interventions.resolve')}
        </Button>
        {/* ⚠️ `null` quand l'objet n'a pas d'écran (`user`, `workspace`) : un
            lien qui ne mène nulle part est pire qu'une ligne qui ne se clique
            pas. La règle vient de `interventionHref`, pas d'ici. */}
        {item.group && item.kind === 'payment_overdue' ? (
          <Link
            to="/missions/encaissements"
            search={item.group.clientLabel ? { client: item.group.clientLabel } : {}}
            aria-label={t('interventions.openAria', { label: t(`interventions.kinds.${item.kind}`) })}
            className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-xs font-medium text-[var(--bellum-text-accent)] hover:underline"
          >
            {t('interventions.open')}
            <ArrowRight className="size-3.5 shrink-0" aria-hidden />
          </Link>
        ) : href ? (
          <Link
            to={href}
            // Cinq lignes qui se suivent porteraient cinq fois « Ouvrir ». La
            // nature de la situation entre dans le nom annoncé (WCAG 2.5.3).
            aria-label={t('interventions.openAria', { label: t(`interventions.kinds.${item.kind}`) })}
            className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-xs font-medium text-[var(--bellum-text-accent)] hover:underline"
          >
            {t('interventions.open')}
            <ArrowRight className="size-3.5 shrink-0" aria-hidden />
          </Link>
        ) : null}
      </Box>

      {closing ? (
        <Box className="mt-2 space-y-2 rounded-md border border-border p-2">
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('interventions.reasonPrompt')}
          </Text>
          <Input
            value={reason}
            autoFocus
            maxLength={300}
            placeholder={t('interventions.reasonPlaceholder')}
            onChange={event => setReason(event.target.value)}
          />
          <Box display="flex" className="flex-wrap gap-1">
            <Button
              variant="secondary"
              size="sm"
              // Le bouton est INERTE tant que rien n'est écrit, et le champ
              // au-dessus dit pourquoi. Laisser cliquer pour se faire refuser
              // par le serveur ferait passer une règle produit pour une panne.
              disabled={pending || reason.trim().length === 0}
              onClick={() => onDecide('resolved', reason.trim())}
            >
              {t('interventions.confirmResolve')}
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => setClosing(false)}>
              {t('common.cancel')}
            </Button>
          </Box>
        </Box>
      ) : null}
    </Box>
  )
}
