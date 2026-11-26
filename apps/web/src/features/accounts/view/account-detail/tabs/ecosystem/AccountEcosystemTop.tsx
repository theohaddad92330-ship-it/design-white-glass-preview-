import {
  // ⚠️ `ECOSYSTEM_RELATION_ACTIONS` n'est PAS importé ici : ce composant rend
  // des boutons, il ne parcourt pas la liste. C'est `AccountEcosystemTop.test.tsx`
  // qui la lit, et c'est le bon endroit — la garde vérifie que les six actions
  // du contrat sont rendues, sans que le JSX ait à s'en déduire.
  type Account,
  type AccountPartner,
  type EcosystemRelation,
} from '@bellum/contracts'
import { Badge, Box, Button, Card, CardContent, Text } from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { formatDate } from '@/lib/locale'
import { useCurrentUserStore } from '@/stores/currentUserStore'
import type { TabId } from '../../components/AccountDetailTabsBar'
import { FieldNoteDialog } from './FieldNoteDialog'
import { readEcosystem, type EcosystemCorrectionInput } from './ecosystemRelations'

/**
 * #2122.12-.19 — LA TÊTE DE LA SECTION « ÉCOSYSTÈME & ACCÈS ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS QUESTIONS, ET LES SIX BLOCS QUI Y RÉPONDENT
 * ─────────────────────────────────────────────────────────────────────────────
 * « Qui gravite autour de ce compte · qu'est-ce que ça change · par où j'entre ».
 * Six blocs nommés y répondent, et deux d'entre eux EXISTAIENT déjà comme
 * sous-sections : « Sociétés de services reliées » (l'ancien onglet Partenaires)
 * et « Voies d'accès du workspace » (l'ancien onglet Accès). Ils ne sont pas
 * réécrits ici — les relister serait le doublon que la loi 4 du tome 7 refuse.
 *
 * Ce composant porte les QUATRE autres : « Lecture rapide », « Concurrents ou
 * partenaires possibles », « Informations à qualifier », « Actions ». Il est
 * monté au-dessus des sous-sections, comme `AccountOpportunitiesTop` pour la
 * section Opportunités : il parle de la section ENTIÈRE, et le poser dans l'une
 * des deux sous-sections en ferait la propriété de l'une d'elles.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ IL NE DEMANDE RIEN DE NEUF AU SERVEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * Même route et MÊME CLÉ DE CACHE que la sous-section Partenaires
 * (`['partners', account.id]`) : les deux lisent la même réponse, donc jamais
 * deux vérités sur le même écran. C'est la même discipline que la densité
 * d'écosystème de l'onglet Accès, qui partage la clé de `useAccountMarketContext`.
 */

type Landscape = { partners: AccountPartner[] }

/** Les quatre types qui SUPPOSENT. Ils sont le contenu du bloc « Concurrents ou
 *  partenaires possibles » — ce qui est prouvé vit dans « Sociétés de services
 *  reliées », et n'est pas répété ici. `rank2_potential` (#2316.10) y entre
 *  pour la même raison que les trois autres : un rang 2 sans preuve reste une
 *  hypothèse, jamais un constat. */
const HYPOTHESIS_TYPES = [
  'competitor_potential',
  'partner_potential',
  'intermediation_platform',
  'rank2_potential',
] as const

/** Ce qui se montre ICI : les hypothèses, plus toute relation qu'un humain a
 *  corrigée — une correction qui ferait disparaître sa carte cacherait
 *  justement ce qu'elle vient de changer. */
function belongsHere(relation: EcosystemRelation): boolean {
  return (HYPOTHESIS_TYPES as readonly string[]).includes(relation.type) || relation.correction !== null
}

export function AccountEcosystemTop({
  account,
  activeTab,
  onTabChange,
}: {
  account: Account
  /** Le sous-onglet rendu au-dessus : « Accès » n'a pas à se proposer à lui-même. */
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}) {
  const { t } = useTranslation('accounts')
  const qc = useQueryClient()
  const currentUser = useCurrentUserStore(state => state.currentUser)

  /**
   * #2122.53 — LA CORRECTION DOMINE **IMMÉDIATEMENT**.
   *
   * Tenue ici d'abord, puis envoyée : attendre l'aller-retour ferait clignoter
   * le type corrigé le temps d'un rafraîchissement, et « immédiatement » est le
   * mot du retour. La persistance passe par la déclaration d'équipe (la route
   * qui existe déjà), dont l'origine `workspace_declared` prime côté serveur
   * sans retirer l'observation.
   */
  const [fieldNoteFor, setFieldNoteFor] = useState<string | null>(null)
  const [corrections, setCorrections] = useState<ReadonlyMap<string, EcosystemCorrectionInput>>(new Map())

  const { data } = useQuery({
    queryKey: ['partners', account.id],
    queryFn: () => apiFetch<Landscape>({ path: `/accounts/${account.id}/partners` }),
  })

  const declare = useMutation<AccountPartner, Error, { name: string; relationship: 'partner' | 'competitor' }>({
    mutationFn: body =>
      apiFetch<AccountPartner, typeof body>({
        path: `/accounts/${account.id}/partners`,
        method: 'POST',
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partners', account.id] }),
    onError: error => toast.error(error.message),
  })

  const dismiss = useMutation<AccountPartner, Error, { id: string; reason: string }>({
    mutationFn: ({ id, reason }) =>
      apiFetch<AccountPartner, { reason: string }>({
        path: `/accounts/partners/${id}/dismiss`,
        method: 'POST',
        body: { reason },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partners', account.id] }),
    onError: error => toast.error(error.message),
  })

  const reading = readEcosystem({ partners: data?.partners ?? [], corrections })

  // La section se tait quand elle n'a rien à dire : un bloc vide dirait « on a
  // regardé et il n'y a rien », ce qui est faux tant qu'aucune ligne n'existe.
  if (reading.relations.length === 0) return null

  const hypotheses = reading.relations.filter(belongsHere)

  function correct(relation: EcosystemRelation, type: 'competitor_potential' | 'partner_potential'): void {
    setCorrections(previous => {
      const next = new Map(previous)
      next.set(relation.id, {
        type,
        corrected_at: new Date().toISOString(),
        // #2122.54 — QUI. L'adresse de la personne connectée, jamais un nom
        // deviné : l'attribution se relit six mois plus tard, et un nom inventé
        // y serait pire qu'une attribution à l'équipe.
        corrected_by: currentUser?.email ?? null,
      })
      return next
    })
    declare.mutate({ name: relation.name, relationship: type === 'competitor_potential' ? 'competitor' : 'partner' })
  }

  const proofLine = (relation: EcosystemRelation): string => {
    if (!relation.proof) return t('ecosystemTop.noProof')
    const source = t(`ecosystemTop.source.${relation.proof.source}`, { defaultValue: relation.proof.source })
    if (!relation.proof.observed_at) return t('ecosystemTop.proofUndated', { source })
    return t('ecosystemTop.proofOn', { source, date: formatDate(new Date(relation.proof.observed_at)) })
  }

  return (
    <Box display="flex" className="flex-col gap-4">
      {/* ── LECTURE RAPIDE — les trois questions, dans l'ordre où elles se posent ── */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <Text element="h3" size="sm" weight="semibold">
            {t('ecosystemTop.reading')}
          </Text>
          <Box display="flex" className="flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Box className="min-w-0 flex-1 space-y-1">
              <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
                {t('ecosystemTop.whoOrbits')}
              </Text>
              {/* #2122.62 — LES DEUX PHRASES LISENT LA MÊME DÉRIVATION.
                  `presence.none` est le prédicat, `presence.observed` le nombre :
                  ils sortent du même appel, donc « 3 relations avérées » ne peut
                  pas cohabiter avec « aucune relation avérée ». Et l'absence
                  n'écrit jamais « 0 » — elle écrit ce qu'elle veut dire. */}
              <Text size="sm">
                {reading.presence.observed === null
                  ? t('ecosystemTop.noneObserved')
                  : t('ecosystemTop.observed', { count: reading.presence.observed })}
              </Text>
              {/* #2316.15 — LA RÉCONCILIATION, PAS LA CONTRADICTION. « N relations
                  avérées » ET « aucune actuelle » disent deux choses VRAIES en
                  même temps quand tout est historique ; sans cette phrase,
                  l'écran laisse deviner le lien entre les deux. `historicOnly`
                  sort de la MÊME lecture que la ligne ci-dessus (.62). */}
              {reading.presence.historicOnly && (
                <Text size="xs" color="text-[var(--bellum-text-muted)]">
                  {t('ecosystemTop.historicOnly')}
                </Text>
              )}
            </Box>
            <Box className="min-w-0 flex-1 space-y-1">
              <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
                {t('ecosystemTop.whatItChanges')}
              </Text>
              <Text size="sm">
                {reading.presence.none ? t('ecosystemTop.changesWithout') : t('ecosystemTop.changesWithRelations')}
              </Text>
            </Box>
            {/* #3473 (Y18 puis Y20) — LE RENVOI SE LIT DES DEUX CÔTÉS. Y18 l'avait retiré
                de l'Accès (« voies d'accès, sous-onglet Accès » y renvoyait à l'endroit où
                l'on est) ; la recette Y20 a lu ce retrait comme « renvoi absent ». Cause :
                la condition de rendu `activeTab !== 'access'`. Il reste donc visible
                partout, et dit toujours l'AUTRE sous-onglet : sur Partenaires, il ouvre
                l'Accès ; sur Accès, il ouvre Partenaires — jamais un renvoi à soi-même. */}
            <Box className="min-w-0 flex-1 space-y-1">
              <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
                {t('ecosystemTop.whereToEnter')}
              </Text>
              {/* #3473 — une promesse « plus bas » sans ancre est un lien mort : l'autre
                  sous-section n'est pas dans le DOM tant qu'elle n'est pas active, donc
                  la phrase se tient d'un geste, pas d'un adverbe. */}
              {activeTab === 'access' ? (
                <>
                  <Text size="sm">{t('ecosystemTop.whereToEnterHelpFromAccess')}</Text>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="ecosystem-open-partners"
                    onClick={() => onTabChange('partners')}
                  >
                    {t('ecosystemTop.whereToEnterCtaFromAccess')}
                  </Button>
                </>
              ) : (
                <>
                  <Text size="sm">{t('ecosystemTop.whereToEnterHelp')}</Text>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="ecosystem-open-access"
                    onClick={() => onTabChange('access')}
                  >
                    {t('ecosystemTop.whereToEnterCta')}
                  </Button>
                </>
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* ── CONCURRENTS OU PARTENAIRES POSSIBLES — les hypothèses, jamais les faits ── */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <Text element="h3" size="sm" weight="semibold">
            {t('ecosystemTop.possible')}
          </Text>
          {hypotheses.length === 0 ? (
            <Text size="sm" color="text-[var(--bellum-text-muted)]">
              {t('ecosystemTop.possibleEmpty')}
            </Text>
          ) : (
            hypotheses.map(relation => (
              <Box
                key={relation.id}
                className={
                  // #2122.33 — LA SÉPARATION VISUELLE. Une déduction se borde en
                  // POINTILLÉS, un fait sourcé en trait plein : la différence se
                  // voit avant d'être lue, ce qui est le point du retour.
                  relation.deduced
                    ? 'rounded-md border border-dashed border-[var(--bellum-border)] p-3 space-y-2'
                    : 'rounded-md border border-[var(--bellum-border)] p-3 space-y-2'
                }
              >
                <Box display="flex" className="flex-wrap items-center gap-2">
                  <Text element="span" size="sm" weight="medium">
                    {relation.name}
                  </Text>
                  <Badge variant="secondary">{t(`ecosystemTop.types.${relation.type}`)}</Badge>
                  {/* #2122.33 — l'étiquette n'existe QUE sur une déduction. Écrire
                      « fait sourcé » sur une ligne sans preuve serait exactement
                      l'affirmation que .37 refuse ; ce bloc ne porte que des
                      hypothèses, les faits prouvés vivent dans la sous-section
                      « Sociétés de services reliées », plus bas. */}
                  {relation.deduced ? <Badge variant="outline">{t('ecosystemTop.deduced')}</Badge> : null}
                </Box>
                <Box display="flex" className="flex-wrap items-center gap-2">
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {proofLine(relation)}
                  </Text>
                  {/* Une confiance absente se NOMME — « 0 » ne serait pas vrai. */}
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {t(`ecosystemTop.confidence.${relation.confidence ?? 'unknown'}`)}
                  </Text>
                </Box>
                {relation.correction ? (
                  <Box className="space-y-0.5">
                    <Text size="xs" color="text-[var(--bellum-text-muted)]">
                      {t('ecosystemTop.corrected', {
                        date: formatDate(new Date(relation.correction.corrected_at)),
                        who: relation.correction.corrected_by ?? t('ecosystemTop.correctedByTeam'),
                      })}
                    </Text>
                    {/* #2122.55 — L'OBSERVATION NE DISPARAÎT PAS. Elle est nommée
                        par ce qu'elle était, à côté de la correction qui la
                        remplace : « on archive, on ne supprime pas ». */}
                    <Text size="xs" color="text-[var(--bellum-text-muted)]">
                      {t('ecosystemTop.previouslyObserved', {
                        type: t(`ecosystemTop.types.${relation.correction.previous_type}`),
                      })}
                    </Text>
                  </Box>
                ) : null}
                {/* #2122.48 / #2122.52 / #2122.63 — LES SIX ACTIONS, SUR LA
                    RELATION. Quatre y étaient déjà ; « Trouver les commerciaux
                    concernés » et « Ajouter une information terrain » vivaient
                    dans un bloc « Actions » qui parlait de la SECTION. Sur deux
                    relations, le commercial lisait un seul bouton sans savoir
                    duquel des deux il parlait — le retour demande l'action POSÉE
                    SUR la relation. Le bloc de section a donc disparu : la même
                    action sous deux portées est le doublon de la loi 4. */}
                <Box display="flex" className="flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    onClick={() => onTabChange('partners')}
                  >
                    {t('ecosystemTop.action.qualify')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    aria-label={t('ecosystemTop.action.find_sales_repsAria', { name: relation.name })}
                    onClick={() => onTabChange('contacts')}
                  >
                    {t('ecosystemTop.action.find_sales_reps')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    aria-label={t('ecosystemTop.action.add_field_noteAria', { name: relation.name })}
                    onClick={() => setFieldNoteFor(relation.id)}
                  >
                    {t('ecosystemTop.action.add_field_note')}
                  </Button>
                  <FieldNoteDialog
                    accountId={account.id}
                    relationName={relation.name}
                    open={fieldNoteFor === relation.id}
                    onOpenChange={next => setFieldNoteFor(next ? relation.id : null)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    onClick={() => correct(relation, 'competitor_potential')}
                  >
                    {t('ecosystemTop.action.mark_competitor')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    onClick={() => correct(relation, 'partner_potential')}
                  >
                    {t('ecosystemTop.action.prepare_partner_approach')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-11"
                    onClick={() =>
                      dismiss.mutate({ id: relation.id, reason: t('ecosystemTop.action.mark_irrelevant') })
                    }
                  >
                    {t('ecosystemTop.action.mark_irrelevant')}
                  </Button>
                </Box>
              </Box>
            ))
          )}
        </CardContent>
      </Card>

      {/* ── INFORMATIONS À QUALIFIER — ce qu'on ne tranche PAS à la place du commercial ── */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <Text element="h3" size="sm" weight="semibold">
            {t('ecosystemTop.toQualify')}
          </Text>
          {reading.toQualify.length === 0 ? (
            <Text size="sm" color="text-[var(--bellum-text-muted)]">
              {t('ecosystemTop.toQualifyEmpty')}
            </Text>
          ) : (
            reading.toQualify.map(item => {
              const relation = reading.relations.find(candidate => candidate.id === item.id)
              return (
                <Box key={item.id} className="rounded-md border border-[var(--bellum-border)] p-3 space-y-2">
                  <Text element="span" size="sm" weight="medium">
                    {item.name}
                  </Text>
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {t(`ecosystemTop.reason.${item.reason}`)}
                  </Text>
                  {/* #2122.35 — LES DEUX SOURCES, CÔTE À CÔTE, AUCUNE CHOISIE. */}
                  {relation?.divergences.map(divergence => (
                    <Text key={divergence.source} size="xs" color="text-[var(--bellum-text-muted)]">
                      {divergence.source === 'market_observation'
                        ? t('ecosystemTop.marketAssessment', { value: divergence.statement })
                        : t('ecosystemTop.currentAssessment', { value: divergence.statement })}
                    </Text>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    onClick={() => onTabChange('partners')}
                  >
                    {t('ecosystemTop.action.qualify')}
                  </Button>
                </Box>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* #2122.48 / #2122.52 — LE BLOC « ACTIONS » DE SECTION A DISPARU.
          Ses deux boutons sont remontés SUR chaque relation (voir le bloc
          « Concurrents ou partenaires possibles »), parce que c'est ce que le
          retour demande : « chaque relation affichée peut porter… ». Les garder
          ici EN PLUS aurait écrit la même action sous deux portées — le doublon
          que la loi 4 du tome 7 refuse, et celui qui fait cliquer au mauvais
          endroit quand deux relations sont à l'écran. */}
    </Box>
  )
}
