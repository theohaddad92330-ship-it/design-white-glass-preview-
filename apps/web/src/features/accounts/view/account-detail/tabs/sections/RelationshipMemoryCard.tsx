import { Button, Card, Input, SelectField, Text, Textarea } from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { relationshipStateSchema, type RelationshipMemory } from '@bellum/contracts'
import { NotebookPen } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { accountsApi } from '@/features/accounts/api'
import { contactKeys, contactsApi } from '@/features/contacts/api'
import { Provenance } from '@/components/primitives/Provenance'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { formatDate } from '@/lib/locale'
import { summarizeKnownContacts, type KnownContactPresence } from './knownRelationshipFacts'

/**
 * Mémoire de relation — bloc « Mémoire » de la couche zéro (annexe méthodo p8).
 *
 * La couche zéro lisait le CRM connecté et les ex-collaborateurs, mais rien ne
 * PERSISTAIT ce que le commercial apprend. Cette carte capture les six champs de
 * la page (relation, dernier contact, owner, prochaine revue, issue, source) ;
 * ils sont relus au run suivant pour enrichir la couche zéro. Un champ vide reste
 * vide — jamais deviné.
 */
export function RelationshipMemoryCard({
  accountId,
  memory,
}: {
  accountId: string
  memory: RelationshipMemory | null
}) {
  const { t } = useTranslation('accountDetail')
  const qc = useQueryClient()
  const [draft, setDraft] = useState<RelationshipMemory>(() => ({ ...(memory ?? {}) }))

  // #1607.5 — « CE QUE BELLUM SAIT DÉJÀ », lu depuis les contacts déjà
  // rattachés à ce compte. MÊME clé de cache que `useAccount` (`contactKeys.
  // byAccount`), IMPORTÉE — jamais recopiée : la page a déjà cette liste en
  // cache la plupart du temps, cette carte ne la re-demande pas sous un autre
  // nom. Une correction humaine dans le formulaire ci-dessous ne dépend en
  // RIEN de cette requête : les deux sont des états React SÉPARÉS.
  const contactsQuery = useQuery({
    queryKey: contactKeys.byAccount(accountId),
    queryFn: () => contactsApi.listByAccount(accountId),
    enabled: accountId.length > 0,
  })
  // ⚠️ « zéro de chargement » : tant que la requête n'a pas répondu, on ne
  // sait RIEN — surtout pas « aucun contact ». `summarizeKnownContacts([])`
  // rendrait exactement le même texte qu'un compte réellement vide, ce qui
  // afficherait un FAUX négatif pendant le chargement. `knownSummary` reste
  // `null` tant que `contactsQuery.data` n'est pas arrivé.
  const knownSummary = contactsQuery.data ? summarizeKnownContacts(contactsQuery.data) : null

  const save = useMutation({
    mutationFn: (patch: RelationshipMemory) => accountsApi.setRelationshipMemory(accountId, patch),
    onSuccess: () => {
      toast.success(t('relationshipMemory.saved'))
      void qc.invalidateQueries({ queryKey: ['account', accountId] })
    },
    onError: () => toast.error(t('relationshipMemory.error')),
  })

  const set = (key: keyof RelationshipMemory) => (value: string) => setDraft(prev => ({ ...prev, [key]: value }))

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <NotebookPen className="size-4 text-[var(--bellum-text-accent)]" />
        <Text element="h3" size="sm" weight="semibold">
          {t('relationshipMemory.title')}
        </Text>
      </div>
      <Text size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
        {t('relationshipMemory.subtitle')}
      </Text>

      {/* #1607.5 — « CE QUE BELLUM SAIT DÉJÀ », EN LECTURE SEULE, AU-DESSUS
          DU FORMULAIRE.

          ⚠️ Ce bloc ne lit ET n'écrit JAMAIS dans `draft` : c'est un état
          React séparé (`contactsQuery`), et c'est ce qui garantit qu'une
          correction humaine dans le formulaire ci-dessous ne peut PAS être
          écrasée par ce que ce bloc affiche, quelle que soit sa date — la
          doctrine du dépôt, tenue ici par construction plutôt que par une
          règle qu'il faudrait se souvenir d'appliquer. */}
      {knownSummary ? <KnownAlreadyBlock summary={knownSummary} /> : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label={t('relationshipMemory.relation')}>
          <Input value={draft.relation ?? ''} onChange={e => set('relation')(e.target.value)} />
        </Field>
        {/* #3246.relation (décision Louis 16/10/2026) — le STADE, choisi dans la
            liste fermée des 10 stades, à côté du texte libre qui reste. Le texte
            n'est JAMAIS lu pour pré-remplir ce choix ; vide = non renseigné, et la
            relation n'entre alors pas dans la comparaison des cas (jamais 0). */}
        <Field label={t('relationshipMemory.relationStage')}>
          <SelectField
            ariaLabel={t('relationshipMemory.relationStage')}
            value={draft.relationStage ?? ''}
            onChange={next =>
              setDraft(prev => ({
                ...prev,
                relationStage: relationshipStateSchema.options.find(stage => stage === next) ?? null,
              }))
            }
            placeholder={t('relationshipMemory.relationStage')}
            emptyOption={{ label: t('relationshipMemory.relationStageNone') }}
            options={relationshipStateSchema.options.map(stage => ({
              value: stage,
              label: t(`salesContext.states.${stage}`),
            }))}
          />
        </Field>
        <Field label={t('relationshipMemory.owner')}>
          <Input value={draft.owner ?? ''} onChange={e => set('owner')(e.target.value)} />
        </Field>
        <Field label={t('relationshipMemory.lastContact')}>
          <Input type="date" value={draft.lastContactAt ?? ''} onChange={e => set('lastContactAt')(e.target.value)} />
        </Field>
        <Field label={t('relationshipMemory.nextReview')}>
          <Input type="date" value={draft.nextReviewAt ?? ''} onChange={e => set('nextReviewAt')(e.target.value)} />
        </Field>
        <Field label={t('relationshipMemory.source')}>
          <Input value={draft.source ?? ''} onChange={e => set('source')(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 grid gap-1.5">
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('relationshipMemory.issue')}
        </Text>
        <Textarea value={draft.issue ?? ''} onChange={e => set('issue')(e.target.value)} rows={2} />
      </div>

      {/* #1085 — « je connais mon avantage concurrentiel […] je pourrais aider
          Bellum à me construire une stratégie entre mes infos, les siennes et sa
          démarche ». Un champ NOMMÉ se remplit ; une note libre suppose de
          penser à l'écrire.

          Il est SÉPARÉ des champs de relation ci-dessus, et le serveur le range
          dans son propre bloc : un avantage se connaît sans avoir jamais parlé
          au compte, donc il ne doit jamais faire conclure que la relation
          existe. */}
      <div className="mt-3 grid gap-1.5">
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('relationshipMemory.competitiveEdge')}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('relationshipMemory.competitiveEdgeHint')}
        </Text>
        <Textarea
          value={draft.competitiveEdge ?? ''}
          onChange={e => set('competitiveEdge')(e.target.value)}
          rows={3}
          placeholder={t('relationshipMemory.competitiveEdgePlaceholder')}
        />
      </div>

      <Button size="sm" className="mt-3" onClick={() => save.mutate(draft)} disabled={save.isPending}>
        {save.isPending ? t('relationshipMemory.saving') : t('relationshipMemory.save')}
      </Button>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {label}
      </Text>
      {children}
    </div>
  )
}

/**
 * #1607.5 — le bloc « Ce que Bellum sait déjà », dans ses QUATRE états.
 *
 * Chaque branche dit ce qu'on SAIT, puis NOMME ce qu'on ne sait pas — jamais
 * un chiffre qui se tairait sur sa propre incertitude. `no_contacts` et
 * `enriched_no_presence` portent chacun un compte RÉEL (une vraie mesure : on
 * a regardé), donc `{{count}}` s'y écrit directement — ce n'est que la valeur
 * ABSENTE qui ne s'écrit jamais « 0 » (voir `UnknownValue` plus bas, pour le
 * rôle et la date d'une présence trouvée).
 */
function KnownAlreadyBlock({ summary }: { summary: ReturnType<typeof summarizeKnownContacts> }) {
  const { t } = useTranslation('accountDetail')

  return (
    <div className="mt-3 rounded-lg border border-[var(--bellum-border)] p-3">
      <Text size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
        {t('relationshipMemory.known.title')}
      </Text>
      <Text size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
        {t('relationshipMemory.known.subtitle')}
      </Text>

      <div className="mt-2">
        {summary.status === 'no_contacts' ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('relationshipMemory.known.noContacts')}
          </Text>
        ) : summary.status === 'not_enriched' ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('relationshipMemory.known.notEnriched', { count: summary.contactCount })}
          </Text>
        ) : summary.status === 'enriched_no_presence' ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('relationshipMemory.known.enrichedNoPresence', { count: summary.enrichedCount })}
          </Text>
        ) : (
          <>
            <ul className="grid gap-2">
              {summary.presences.map(presence => (
                <KnownContactRow key={presence.contactId} presence={presence} />
              ))}
            </ul>
            <div className="mt-2">
              <Provenance source="pipeline" observedAt={summary.mostRecentUpdateAt} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function KnownContactRow({ presence }: { presence: KnownContactPresence }) {
  const { t } = useTranslation('accountDetail')
  const formattedSince = presence.since ? formatDate(presence.since) : null

  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <Text size="sm" weight="medium">
        {presence.name}
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {presence.role ?? t('relationshipMemory.known.roleUnknown')}
      </Text>
      {formattedSince ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('relationshipMemory.known.since', { date: formattedSince })}
        </Text>
      ) : (
        <UnknownValue reason={t('relationshipMemory.known.sinceUnknown')} />
      )}
    </li>
  )
}
