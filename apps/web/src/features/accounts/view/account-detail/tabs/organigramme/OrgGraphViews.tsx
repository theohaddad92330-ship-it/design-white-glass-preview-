import type {
  OrgHierarchyEdge,
  OrgInfluenceEdge,
  OrgInfluenceStance,
  OrgPerson,
  OrgRelationalEdge,
} from '@bellum/contracts'
import { RoleHint } from '@/components/contacts/RoleHint'
import { Badge, Button, Card, TabNav, Text, type TabNavItem } from '@bellum/ui'
import {
  ArrowRight,
  Ban,
  GitBranch,
  Link2,
  Loader2,
  Network,
  RefreshCw,
  ShieldCheck,
  Target,
  Users,
  UsersRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecomputeOrgPath } from '@/features/accounts/hooks/useEnrichAccount'
import { formatDate } from '@/lib/locale'
import { OrgContactDismiss } from './OrgContactDismiss'
import { OrgSourceChips } from './OrgSourceChips'
import { OrgVerifyRelation } from './OrgVerifyRelation'
import { confidenceTier, type OrgGraphViewData } from './orgGraphData'

type ViewKey = 'verified' | 'influence' | 'committee' | 'path' | 'teams' | 'workspaceRelations'

/**
 * The Org Graph « 4 views » (Annexe Organigramme p5). Additive section on the
 * Organigramme tab: a view switcher over the validated `orgGraph` the IA now
 * emits — organigramme vérifié / carte d'influence / buying committee / chemin
 * recommandé. Rendered only when {@link buildOrgGraphViewData} returns data, so
 * the legacy tab content is untouched when there's no graph.
 *
 * Structured lists (not a canvas) — a reporting line reads as « A → B, vérifié,
 * 95 » so the seller sees the SOURCE + CONFIDENCE of every link, which is the
 * whole point of the refonte (« la hiérarchie ne peut pas être plus certaine que
 * la donnée qui l'alimente »).
 */
export function OrgGraphViews({ data, accountId }: { data: OrgGraphViewData; accountId: string }) {
  const { t } = useTranslation('accountOrg')
  const [view, setView] = useState<ViewKey>('verified')

  const tabs = useMemo<TabNavItem[]>(
    () => [
      { key: 'verified', label: t('orgGraph.views.verified') },
      { key: 'influence', label: t('orgGraph.views.influence') },
      { key: 'committee', label: t('orgGraph.views.committee') },
      { key: 'path', label: t('orgGraph.views.path') },
      // #2919/#2310.37/.40 — deux vues neuves, MÊME graphe (aucune donnée
      // reconstruite) : « Équipes » (nœuds `equipe`) et « Relations workspace »
      // (les cinq natures d'`orgRelationalEdgeSchema`).
      { key: 'teams', label: t('orgGraph.views.teams') },
      { key: 'workspaceRelations', label: t('orgGraph.views.workspaceRelations') },
    ],
    [t],
  )

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-[var(--bellum-border)] px-5 py-4">
        <div className="flex items-center gap-2">
          <Network className="size-4 text-[var(--bellum-text-accent)]" />
          <Text element="h3" size="base" weight="semibold">
            {t('orgGraph.title')}
          </Text>
        </div>
        <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
          {t('orgGraph.subtitle')}
        </Text>
        <GraphMeta data={data} />
      </div>

      <div className="px-5 pt-3">
        <TabNav tabs={tabs} activeTab={view} onTabChange={key => setView(key as ViewKey)} size="sm" variant="pill" />
      </div>

      <div className="p-5">
        {view === 'verified' ? <VerifiedView data={data} accountId={accountId} /> : null}
        {view === 'influence' ? <InfluenceView data={data} /> : null}
        {view === 'committee' ? <CommitteeView data={data} accountId={accountId} /> : null}
        {view === 'path' ? <PathView data={data} accountId={accountId} /> : null}
        {view === 'teams' ? <TeamsView data={data} /> : null}
        {view === 'workspaceRelations' ? <WorkspaceRelationsView data={data} /> : null}
      </div>
    </Card>
  )
}

/**
 * L'état du graphe lui-même : sa version, ce qu'il contient, et ce qui en a été
 * ÉCARTÉ.
 *
 * La version bouge à chaque correction (p30 : « chaque correction user produit
 * une nouvelle graph_version ») — sans elle, le commercial qui vient d'écarter
 * quelqu'un ne sait pas si l'écran qu'il regarde l'a pris en compte. Et les
 * items rejetés, invisibles par construction dans les vues, sont listés ici avec
 * leur raison : c'est la seule preuve que la correction a tenu.
 */
/**
 * Le nom d'un écarté. Il n'est plus DANS le graphe — c'est tout le principe du
 * rejet — donc aucun nœud ne peut le résoudre. Son id est le slug construit à
 * partir de son nom (`p-marc-oliveira`, miroir de l'assembleur IA) : on le relit
 * donc en sens inverse plutôt que d'afficher un identifiant technique. Aucune
 * donnée n'est inventée ici, seule la casse d'origine est perdue.
 */
function rejectedLabel(sourceId: string): string {
  const words = sourceId.replace(/^p-/, '').split('-').filter(Boolean)
  if (words.length === 0) return sourceId
  return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

function GraphMeta({ data }: { data: OrgGraphViewData }) {
  const { t } = useTranslation('accountOrg')
  const [showRejected, setShowRejected] = useState(false)
  const rejected = data.graph.rejectedItems

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('orgGraph.meta.version', { value: data.graph.graphVersion })}
      </Text>
      {/* Le score de confiance du graphe (p19/p30) : dérivé des nœuds, recalculé
          à chaque rendu — une correction qui vient d'élaguer un contact le met à
          jour ici sans full rerun. */}
      {data.graphConfidence !== null ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('orgGraph.meta.confidence', { value: data.graphConfidence })}
        </Text>
      ) : null}
      {/* La carte se DÉCLARE quand elle est majoritairement devinée (§21/08,
          garde-fou d'honnêteté). Un « Confiance 65/100 » sur un graphe fait à
          100 % d'hypothèses est un chiffre exact et une lecture fausse : il se
          lit « plutôt fiable » là où il faut lire « je devine presque tout ».
          Et c'est sur cette carte qu'on décide qui appeler en premier. */}
      {/* Zéro lien : la carte le DIT, au lieu de laisser ses paliers passer pour
          une hiérarchie. `mostlyInferred` ne pouvait pas l'attraper — elle rend
          `null` sans arête. Vu sur le run KNDS : 293 personnes, aucun lien. */}
      {data.noProvenHierarchy ? (
        <Text size="xs" className="text-[var(--bellum-warning-text)]">
          {t('orgGraph.meta.noProvenHierarchy')}
        </Text>
      ) : null}
      {data.mostlyInferred === true ? (
        <Text size="xs" className="text-[var(--bellum-warning-text)]">
          {t('orgGraph.meta.mostlyInferred', {
            percent: Math.round((data.counts.inferred / (data.counts.verified + data.counts.inferred)) * 100),
          })}
        </Text>
      ) : null}
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {/* #1 (recette 13/10) — zéro vérifié se dit, il ne se chiffre pas. */}
        {t(data.counts.verified === 0 ? 'orgGraph.meta.countsNoneVerified' : 'orgGraph.meta.counts', {
          entities: data.counts.entities,
          people: data.counts.people,
          verified: data.counts.verified,
          inferred: data.counts.inferred,
        })}
      </Text>
      {rejected.length > 0 ? (
        <Button
          size="xs"
          variant="link"
          className="h-auto p-0 text-[var(--bellum-text-secondary)]"
          onClick={() => setShowRejected(open => !open)}
        >
          {t('orgGraph.meta.rejected', { count: rejected.length })}
        </Button>
      ) : null}
      {showRejected ? (
        <ul className="w-full space-y-0.5 pt-1">
          {rejected.map((item, i) => (
            <li key={`${item.sourceId}-${i}`} className="flex items-baseline gap-1.5">
              <Ban className="size-3 shrink-0 translate-y-0.5 text-[var(--bellum-text-muted)]" aria-hidden />
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {/* #2284.14 — un écarté qualifié se dit par son kind (dans la langue
                    de l'écran) ; sinon sa raison. Une seule information. */}
                {rejectedLabel(item.sourceId)} —{' '}
                {item.entityKind
                  ? t(`overview.entityResolution.kind.${item.entityKind}`, { ns: 'accountDetail' })
                  : item.reason}
              </Text>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function EmptyView({ label }: { label: string }) {
  return (
    <Text size="sm" className="text-[var(--bellum-text-muted)]">
      {label}
    </Text>
  )
}

/** Badge de confiance aux TROIS paliers p14 (vérifié / probable / hypothèse), et
 *  non plus au binaire vérifié/inféré. Le MOT distingue « probable » (78) de
 *  « hypothèse » (55), qui portaient le même texte : l'information ne dépendait
 *  que de la teinte du badge — invisible en N&B, illisible pour un daltonien. */
function ConfidenceBadge({ confidence, verified }: { confidence: number; verified?: boolean }) {
  const { t } = useTranslation('accountOrg')
  const tier = confidenceTier(confidence, Boolean(verified))
  const variant = tier === 'verified' ? 'success' : tier === 'probable' ? 'info' : 'warning'
  return (
    <Badge variant={variant}>
      {t(`orgGraph.tiers.${tier}`)} · {confidence}
    </Badge>
  )
}

/** L'identité d'une personne telle que le graphe la porte : niveau structurel,
 *  métier, rôles d'achat, statut. Ces quatre axes existaient dans la donnée mais
 *  ne sortaient nulle part dans les vues en liste — le commercial lisait un nom
 *  et un titre, sans savoir s'il regardait un DSI contactable ou un ex-employé. */
function PersonAxes({ person }: { person: OrgPerson | undefined }) {
  const { t } = useTranslation('accountOrg')
  if (!person) return null
  const roles = person.decisionRoles.filter(role => role !== 'unknown')
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {person.hierarchyLevel ? (
        <Badge variant="outline">{t(`orgMap.levels.${person.hierarchyLevel}`, person.hierarchyLevel)}</Badge>
      ) : null}
      {person.family ? <Badge variant="outline">{person.family}</Badge> : null}
      {roles.map(role => (
        <RoleHint key={role} role={role}>
          <Badge variant="primary">{t(`orgGraph.roles.${role}`, role)}</Badge>
        </RoleHint>
      ))}
      <Badge
        variant={
          person.identityStatus === 'actionable'
            ? 'success'
            : person.identityStatus === 'historical'
              ? 'warning'
              : 'outline'
        }
      >
        {t(`orgMap.identityStatus.${person.identityStatus}`, person.identityStatus)}
      </Badge>
    </div>
  )
}

/** Ordre de lecture des relations typées (annexe p9) : le rattachement d'abord,
 *  puis ce qui décide — sponsoring, budget, achats. Trier ainsi rend contiguës
 *  les relations non hiérarchiques, au lieu de les noyer entre deux « rattaché
 *  à ». Aucune n'est masquée : le tri ne filtre rien. */
const RELATION_ORDER: Record<string, number> = {
  reports_to: 0,
  member_of: 1,
  sponsors: 2,
  owns_budget: 3,
  procures_for: 4,
}

function byRelationThenConfidence(a: { type: string; confidence: number }, b: { type: string; confidence: number }) {
  const rank = (RELATION_ORDER[a.type] ?? 99) - (RELATION_ORDER[b.type] ?? 99)
  return rank !== 0 ? rank : b.confidence - a.confidence
}

/** View 1 — organigramme vérifié : verified reporting lines first, then inferred. */
function VerifiedView({ data, accountId }: { data: OrgGraphViewData; accountId: string }) {
  const { t } = useTranslation('accountOrg')
  const verified = useMemo(() => [...data.verifiedEdges].sort(byRelationThenConfidence), [data.verifiedEdges])
  const inferred = useMemo(() => [...data.inferredEdges].sort(byRelationThenConfidence), [data.inferredEdges])
  if (verified.length === 0 && inferred.length === 0) {
    return <EmptyView label={t('orgGraph.emptyVerified')} />
  }
  return (
    <div className="space-y-5">
      {verified.length > 0 ? (
        <section className="space-y-2">
          <SectionLabel icon={<ShieldCheck className="size-3.5" />} label={t('orgGraph.verifiedLines')} />
          <ul className="space-y-2">
            {verified.map((e, i) => (
              <li key={`v-${i}`}>
                <EdgeRow data={data} edge={e} solid />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {inferred.length > 0 ? (
        <section className="space-y-2">
          <SectionLabel icon={<GitBranch className="size-3.5" />} label={t('orgGraph.inferredLines')} />
          <ul className="space-y-2">
            {inferred.map((e, i) => (
              <li key={`i-${i}`}>
                <EdgeRow data={data} edge={e} accountId={accountId} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

/** Posture d'une influence. `unknown` n'est PAS « neutre » : le graphe dit qu'il
 *  ne sait pas, on l'affiche comme tel (badge sourd) au lieu d'inventer un camp. */
function StanceBadge({ stance }: { stance: OrgInfluenceStance }) {
  const { t } = useTranslation('accountOrg')
  const variant =
    stance === 'detractor'
      ? 'danger'
      : stance === 'supporter'
        ? 'success'
        : stance === 'neutral'
          ? 'default'
          : 'outline'
  return <Badge variant={variant}>{t(`orgGraph.stances.${stance}`, stance)}</Badge>
}

/**
 * View 2 — carte d'influence. Le prompt refondu (annexe p13/p27) nomme le SUJET
 * sur lequel une personne pèse, la posture qu'elle y tient et le raisonnement
 * qui la porte. La vue est donc groupée PAR SUJET : la question du commercial
 * n'est pas « qui connaît qui » mais « sur ce sujet-là, qui pèse et dans quel
 * sens ». Groupes ordonnés par la meilleure confiance du sujet.
 */
function InfluenceView({ data }: { data: OrgGraphViewData }) {
  const { t } = useTranslation('accountOrg')
  const groups = useMemo(() => groupInfluenceByTopic(data.influenceEdges), [data.influenceEdges])
  if (groups.length === 0) return <EmptyView label={t('orgGraph.emptyInfluence')} />
  return (
    <div className="space-y-5">
      {groups.map(group => (
        <section key={group.topic} className="space-y-2">
          <SectionLabel icon={<Target className="size-3.5" />} label={group.topic} />
          <ul className="space-y-2">
            {group.edges.map((e, i) => (
              <li key={`inf-${group.topic}-${i}`} className="rounded-lg border border-[var(--bellum-border)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <PersonRef data={data} id={e.fromId} />
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {t('orgGraph.weighsOn')}
                  </Text>
                  <ArrowRight className="size-3.5 text-[var(--bellum-text-muted)]" />
                  <PersonRef data={data} id={e.toId} />
                  <span className="ml-auto flex items-center gap-2">
                    <StanceBadge stance={e.stance} />
                    <ConfidenceBadge confidence={e.confidence} />
                  </span>
                </div>
                {e.reasoning ? (
                  <Text size="xs" className="mt-1.5 text-[var(--bellum-text-secondary)]">
                    <span className="text-[var(--bellum-text-muted)]">{t('orgGraph.because')} </span>
                    {e.reasoning}
                  </Text>
                ) : null}
                <InfluenceProvenance data={data} edge={e} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/**
 * La provenance d'une influence (D405). Même mécanisme que {@link EdgeRow} pour
 * une arête hiérarchique — `data.sourcesOf(edge.sourceIds)` — mais une influence
 * n'a longtemps eu QUE sa prose (`reasoning`) : la plupart n'ont aucun
 * `sourceIds` résolvable (une inférence LLM fabrique un id qu'aucun nœud ne
 * porte). Elle le DIT (« source inconnue ») plutôt que de se taire, ce qui se
 * lirait comme une preuve simplement omise. Quand on connaît au moins la date
 * du RUN qui l'a dérivée (`derivedAt`), elle l'affiche aussi — la seule
 * fraîcheur qu'on puisse alors juger, faute d'une source datée.
 */
function InfluenceProvenance({ data, edge }: { data: OrgGraphViewData; edge: OrgInfluenceEdge }) {
  const { t } = useTranslation('accountOrg')
  const sources = data.sourcesOf(edge.sourceIds)
  if (sources.length > 0) return <OrgSourceChips sources={sources} />
  const derivedOn = formatDate(edge.derivedAt, { dateStyle: 'medium' })
  return (
    <Text size="xs" className="mt-1.5 flex items-center gap-1 text-[var(--bellum-text-muted)]">
      <Ban className="size-3 shrink-0" aria-hidden />
      {t('orgGraph.sourceUnknown')}
      {derivedOn ? ` · ${t('orgGraph.derivedOn', { date: derivedOn })}` : ''}
    </Text>
  )
}

/** Regroupe les influences par sujet nommé, sujets les plus étayés en tête. */
function groupInfluenceByTopic(edges: OrgInfluenceEdge[]): Array<{ topic: string; edges: OrgInfluenceEdge[] }> {
  const byTopic = new Map<string, OrgInfluenceEdge[]>()
  for (const edge of edges) {
    const topic = edge.topic.trim()
    if (!topic) continue
    const bucket = byTopic.get(topic)
    if (bucket) bucket.push(edge)
    else byTopic.set(topic, [edge])
  }
  return [...byTopic.entries()]
    .map(([topic, group]) => ({
      topic,
      edges: [...group].sort((a, b) => b.confidence - a.confidence),
    }))
    .sort((a, b) => (b.edges[0]?.confidence ?? 0) - (a.edges[0]?.confidence ?? 0))
}

/** Nom + fonction quand le graphe la porte — sans fonction, le seul nom. */
function PersonRef({ data, id }: { data: OrgGraphViewData; id: string }) {
  const title = data.personOf(id)?.title
  return (
    <span className="inline-flex flex-wrap items-baseline gap-1.5">
      <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {data.nameOf(id)}
      </Text>
      {title ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {title}
        </Text>
      ) : null}
    </span>
  )
}

/** View 3 — buying committee. Chaque siège porte le geste de correction : c'est
 *  ici que le commercial reconnaît (ou non) les gens qu'on lui propose. */
function CommitteeView({ data, accountId }: { data: OrgGraphViewData; accountId: string }) {
  const { t } = useTranslation('accountOrg')
  if (data.committee.length === 0) return <EmptyView label={t('orgGraph.emptyCommittee')} />
  return (
    <ul className="space-y-2">
      {data.committee.map((m: OrgGraphViewData['committee'][number], i) => (
        <li key={`c-${i}`} className="flex items-start gap-3 rounded-lg border border-[var(--bellum-border)] p-3">
          <Users className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-secondary)]" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
                {data.nameOf(m.personId)}
              </Text>
              {data.personOf(m.personId)?.title ? (
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {data.personOf(m.personId)?.title}
                </Text>
              ) : null}
              <RoleHint role={m.role}>
                <Badge variant="primary">{t(`orgGraph.roles.${m.role}`, m.role)}</Badge>
              </RoleHint>
              {data.entityNameOf(m.entityId) ? <Badge variant="outline">{data.entityNameOf(m.entityId)}</Badge> : null}
              {/* Accessibilité du siège (contrat `accessScore`) : deux décideurs
                  budget ne s'attaquent pas dans le même ordre si l'un est
                  joignable et l'autre non. Le champ existait, il ne sortait pas. */}
              {typeof m.accessScore === 'number' ? (
                <span className="ml-auto">
                  <Badge variant={m.accessScore >= 70 ? 'success' : m.accessScore >= 40 ? 'info' : 'outline'}>
                    {t('orgGraph.access', { value: m.accessScore })}
                  </Badge>
                </span>
              ) : null}
            </div>
            <PersonAxes person={data.personOf(m.personId)} />
            {m.reason ? (
              <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
                {m.reason}
              </Text>
            ) : null}
            <OrgSourceChips sources={data.personOf(m.personId)?.sources ?? []} max={2} />
          </div>
          <DismissPerson data={data} accountId={accountId} personId={m.personId} />
        </li>
      ))}
    </ul>
  )
}

/** Le geste « ce contact n'est plus là » — proposé UNIQUEMENT quand le graphe
 *  connaît vraiment la personne. Sans nom résolu, écarter enverrait un id
 *  technique en guise de référence : aucun rejet ne retomberait sur personne. */
function DismissPerson({ data, accountId, personId }: { data: OrgGraphViewData; accountId: string; personId: string }) {
  const fullName = data.personOf(personId)?.fullName
  if (!fullName) return null
  return <OrgContactDismiss accountId={accountId} fullName={fullName} />
}

/** View 4 — chemin recommandé (only actionable, non-rejected people, ordered).
 *  « Recalculer le chemin » réordonne la séquence depuis le graphe déjà stocké :
 *  aucune recherche relancée, donc aucun crédit et une réponse immédiate — ce
 *  qu'il faut après avoir écarté un contact ou comblé une zone blanche. */
function PathView({ data, accountId }: { data: OrgGraphViewData; accountId: string }) {
  const { t } = useTranslation('accountOrg')
  const recompute = useRecomputeOrgPath(accountId)

  const recomputeButton = (
    <Button
      size="sm"
      variant="outline"
      className="gap-2"
      disabled={recompute.isPending}
      onClick={() => recompute.mutate()}
      title={t('orgGraph.recomputePathHint')}
    >
      {recompute.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      {recompute.isPending ? t('orgGraph.recomputePathPending') : t('orgGraph.recomputePath')}
    </Button>
  )

  if (data.path.length === 0) {
    return (
      <div className="space-y-3">
        <EmptyView label={t('orgGraph.emptyPath')} />
        {recomputeButton}
      </div>
    )
  }
  return (
    <>
      <div className="mb-3 flex justify-end">{recomputeButton}</div>
      <ol className="space-y-3">
        {data.path.map(step => (
          <li key={step.step} className="flex gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--bellum-surface-2)] text-xs font-semibold text-[var(--bellum-text-secondary)]">
              {step.step}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
                  {data.nameOf(step.personId)}
                </Text>
                {/* Canal d'approche (p26) — absent du dossier, absent de l'écran. */}
                {step.channel ? <Badge variant="outline">{step.channel}</Badge> : null}
              </div>
              <Text size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
                {step.objective}
              </Text>
              {step.unlocks ? (
                <Text size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
                  {t('orgGraph.unlocks')} {step.unlocks}
                </Text>
              ) : null}
              {/* Repli (p26) — ce qu'on fait quand l'étape ne répond pas. */}
              {step.fallback ? (
                <Text size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
                  {t('orgGraph.fallback')} {step.fallback}
                </Text>
              ) : null}
            </div>
            <DismissPerson data={data} accountId={accountId} personId={step.personId} />
          </li>
        ))}
      </ol>
    </>
  )
}

/**
 * View 5 — « Équipes » (#2919/#2310.2/.37). Les nœuds `equipe` du graphe (déjà
 * filtrés dans `data.teams`, `orgGraphData.ts`), chacun avec les personnes qui
 * s'y rattachent (`person.entityId === team.id`) — la même lecture par
 * `entityId` que le reste du graphe, jamais un second regroupement.
 */
function TeamsView({ data }: { data: OrgGraphViewData }) {
  const { t } = useTranslation('accountOrg')
  if (data.teams.length === 0) return <EmptyView label={t('orgGraph.emptyTeams')} />
  return (
    <ul className="space-y-3">
      {data.teams.map(team => {
        const members = data.graph.people.filter(person => person.entityId === team.id)
        return (
          <li key={team.id} className="rounded-lg border border-[var(--bellum-border)] p-3">
            <div className="flex items-center gap-2">
              <UsersRound className="size-4 text-[var(--bellum-text-secondary)]" aria-hidden />
              <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
                {team.name}
              </Text>
            </div>
            {members.length > 0 ? (
              <ul className="mt-2 space-y-1 pl-6">
                {members.map(member => (
                  <li key={member.id}>
                    <PersonRef data={data} id={member.id} />
                  </li>
                ))}
              </ul>
            ) : (
              <Text size="xs" className="mt-1 pl-6 text-[var(--bellum-text-muted)]">
                {t('orgGraph.teamNoMembers')}
              </Text>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Le libellé d'une nature d'edge relationnel — jamais deux formes du même mot. */
function RelationalEdgeTypeBadge({ type }: { type: OrgRelationalEdge['type'] }) {
  const { t } = useTranslation('accountOrg')
  return <Badge variant="outline">{t(`orgGraph.relationalTypes.${type}`, type)}</Badge>
}

/**
 * View 6 — « Relations workspace » (#2919/#2310.13-.21/.27/.28/.40). Les cinq
 * natures d'`orgRelationalEdgeSchema`, TELLES QUELLES — la vue ne recalcule
 * rien, elle affiche le MÊME graphe que les autres (annexe p5 : « chaque vue
 * utilise le même graphe, elle ne reconstruit pas les données »). Chaque ligne
 * porte son scope (#2310.27) et son auteur (#2310.28), jamais l'un sans
 * l'autre — une relation sans auteur n'entre même pas dans le contrat.
 */
function WorkspaceRelationsView({ data }: { data: OrgGraphViewData }) {
  const { t } = useTranslation('accountOrg')
  if (data.relationalEdges.length === 0) return <EmptyView label={t('orgGraph.emptyWorkspaceRelations')} />
  return (
    <ul className="space-y-2">
      {data.relationalEdges.map((edge, i) => (
        <li key={`rel-${i}`} className="rounded-lg border border-[var(--bellum-border)] px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <PersonRef data={data} id={edge.fromId} />
            <Link2 className="size-3.5 text-[var(--bellum-text-muted)]" aria-hidden />
            <PersonRef data={data} id={edge.toId} />
            <span className="ml-auto flex items-center gap-2">
              <RelationalEdgeTypeBadge type={edge.type} />
              <ConfidenceBadge confidence={edge.confidence} />
            </span>
          </div>
          <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
            {t(`orgGraph.relationalScope.${edge.scope}`)} · {t('orgGraph.relationalAuthor', { author: edge.author })}
          </Text>
          <OrgSourceChips sources={data.sourcesOf(edge.sourceIds)} />
        </li>
      ))}
    </ul>
  )
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[var(--bellum-text-secondary)]">
      {icon}
      <Text size="xs" weight="medium" className="uppercase tracking-wide">
        {label}
      </Text>
    </div>
  )
}

/** Une ligne de relation hiérarchique : les deux extrémités, la nature du lien,
 *  son palier de confiance — ET, dessous, la source qui l'établit. */
function EdgeRow({
  data,
  edge,
  solid,
  accountId,
}: {
  data: OrgGraphViewData
  edge: OrgHierarchyEdge
  solid?: boolean
  /** Fourni uniquement pour un lien INFÉRÉ : c'est ce qui autorise « vérifier ».
   *  Un lien déjà vérifié est sourcé — il n'y a rien à revérifier. */
  accountId?: string
}) {
  const { t } = useTranslation('accountOrg')
  const sources = data.sourcesOf(edge.sourceIds)
  // Deux PERSONNES du graphe, ou rien à vérifier — voir le commentaire du bouton.
  const verifiable = Boolean(data.personOf(edge.fromId) && data.personOf(edge.toId))
  return (
    <div className="rounded-lg border border-[var(--bellum-border)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <PersonRef data={data} id={edge.fromId} />
        <span
          className={`inline-block h-0 w-6 border-t ${solid ? 'border-solid border-[var(--bellum-text-secondary)]' : 'border-dashed border-[var(--bellum-text-muted)]'}`}
          aria-hidden
        />
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t(`orgGraph.relations.${edge.type}`, edge.type)}
        </Text>
        <ArrowRight className="size-3.5 text-[var(--bellum-text-muted)]" />
        <PersonRef data={data} id={edge.toId} />
        <span className="ml-auto">
          <ConfidenceBadge confidence={edge.confidence} verified={edge.verified} />
        </span>
      </div>
      <OrgSourceChips sources={sources} />
      {/* Le geste de vérification vit dans {@link OrgVerifyRelation}, à UN seul
          endroit : la vue focale l'affiche aussi, sur la carte de la personne,
          et deux annonces de coût qui divergeraient seraient pires que pas
          d'annonce du tout.

          ⚠️ D362 — IL NE SE REND PLUS SUR UN LIEN DONT UNE EXTRÉMITÉ EST UNE
          ENTITÉ. Mesuré le 30/08 sur la sortie de l'assembleur : les liens
          hiérarchiques réellement produits sont TOUS des `member_of`, et
          4 sur 4 pointent vers une entité. Or le vérificateur cherche DEUX NOMS
          DE PERSONNES sur une même page (`build_verification_queries` rend une
          liste vide si l'un des deux manque) et `relationToVerify` répond `null`
          dès qu'une extrémité n'est pas une personne nommée — donc 412, à chaque
          clic, sans exception. Un bouton qui ne peut que échouer coûte plus cher
          qu'un bouton absent : il fait croire qu'une preuve est atteignable. */}
      {accountId && !edge.verified && verifiable ? (
        <OrgVerifyRelation accountId={accountId} fromId={edge.fromId} toId={edge.toId} type={edge.type} />
      ) : null}
    </div>
  )
}
