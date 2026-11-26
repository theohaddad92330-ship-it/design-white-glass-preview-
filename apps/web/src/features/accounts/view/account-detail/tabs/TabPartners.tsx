import { groupRecommendations } from './partners-recommendation-groups'
import { DetailedReading } from '../components/DetailedReading'
import { EcosystemGrid } from './ecosystem/EcosystemGrid'
import {
  observedCertainty,
  parseAccountAnalysis,
  DEFAULT_ENTITY_NAME,
  PARTNER_RANKS,
  PARTNER_RELATIONSHIPS,
  RANK2_QUALIFICATION_CRITERIA,
  type Account,
  type AccountPartner,
  type EsnPresenceCertainty,
  type PartnerRank,
  type PartnerRelationship,
  type QualifyAccountPartner,
  type Rank1Incumbent,
  type Rank2QualificationCriterion,
  esnObservedPathsRange,
} from '@bellum/contracts'
import { Badge, Box, Button, Card, CardContent, EmptyState, SelectField, Text, Textarea } from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Globe2, Handshake } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { EstimatedBadge } from '@/components/primitives/EstimatedBadge'
import { BrowsableDialog } from '@/components/overlay/BrowsableDialog'
import { KeyNotesCard } from './sections/KeyNotesCard'
import { EsnNameField } from './partners/EsnNameField'
import { PartnerKnownContacts } from './partners/PartnerKnownContacts'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { apiFetch } from '@/lib/api'
import { DecisionMakerBadge } from '@/components/contacts/DecisionMakerBadge'
import { decisionRoleByName } from '@/lib/contactRoles'
import { useContactsByAccount } from '@/features/contacts/hooks/useContactsByAccount'
import { formatDate } from '@/lib/locale'
import { trackActionAbandoned, trackActionCompleted, trackActionStarted } from '@/lib/product-tracker'
import {
  fetchPartnerRelations,
  PARTNER_PIPELINE_KEY,
  type PartnerRelationView,
} from '@/features/partner-pipeline/api/partner-pipeline-api'
import { PartnerReadinessPanel } from '@/features/partner-pipeline/view/PartnerPipeline'

/**
 * #1624.10 — LA TÉLÉMÉTRIE DES DEUX APPELS À L'ACTION.
 *
 * Le MOTIF d'écran, jamais un chemin réel : cette chaîne est le `route` du
 * dossier de compte tel que `PRODUCT_SCREENS` / `resolveProductScreen` le
 * résout (`packages/contracts/src/schemas/product-screens-catalog.ts`), donc
 * la MÊME valeur que `router.tsx` envoie déjà pour `screen_viewed` sur cette
 * page. ⚠️ GA-276 : `router.tsx` a appris cette leçon à ses dépens en passant
 * un `pathname` BRUT (`/accounts/<uuid>`) — cette constante ne dérive JAMAIS
 * de `account.id`, elle est écrite en dur.
 *
 * `trackActionStarted`/`trackActionCompleted`/`trackActionAbandoned` sont
 * déjà NO-OP STRICT sans `VITE_PRODUCT_TRACKER_ENABLED` (voir
 * `product-tracker.ts`) : cet écran n'a donc rien de plus à faire pour rester
 * inerte au repos, il lui suffit d'appeler ces fonctions telles quelles.
 */
const PARTNERS_SCREEN = '/accounts/$id'
const QUALIFY_ACTION = 'partners_qualify'
const VERIFY_TODAY_ACTION = 'partners_verify_today'
// #1624.10 — le TROISIÈME geste de l'onglet, le seul négatif : mesurer le taux
// de correction demande le même traçage que les deux CTA positifs ci-dessus.
const DISMISS_ACTION = 'partners_dismiss'

type Recommendation = {
  entity_id: string | null
  entity_name: string
  rank1_incumbent: Rank1Incumbent
  /** #3205.6 (épopée #3239) — deux issues de plus : `target_other_subsidiary`
   *  (une AUTRE entité du même compte, déjà connue ouverte) et
   *  `differentiate` (positionnement niche/expertise face à un rang 1
   *  verrouillé), ajoutées seulement quand une donnée réelle les justifie. */
  play: 'direct' | 'through_partner' | 'displace' | 'find_out' | 'target_other_subsidiary' | 'differentiate'
  partner: string | null
  reason: string
}

/**
 * Une société de services OBSERVÉE autour du compte (#1579).
 *
 * ⚠️ `?` et pas seulement `[]` : une API plus ancienne que le web ne renvoie
 * pas ce champ du tout, et le lire sans garde casserait l'onglet pendant toute
 * la durée d'un déploiement — et durablement les onglets déjà ouverts.
 */
// #1818.2 — `logo_url` / `website` sont OPTIONNELS : une réponse d'API plus
// ancienne ne les porte pas, et un onglet resté ouvert pendant un déploiement
// ne doit pas tomber pour un champ neuf.
type ObservedEsn = {
  esnName: string
  persons: number
  certainty: 'forte' | 'moyenne' | 'faible'
  alsoKnown: boolean
  logo_url?: string | null
  website?: string | null
}
type Landscape = {
  partners: (AccountPartner & { score: number })[]
  recommendations: Recommendation[]
  observed?: ObservedEsn[]
}

/**
 * #1605 — LES ORIGINES DE PREUVE D'UNE LIGNE, DANS L'ORDRE DE LEUR FORCE.
 *
 * « Une ligne peut donc être : ALTEN / Déclarée par ton équipe / Observation
 * Bellum / Source actuelle — simultanément. » C'est l'information la plus forte
 * de l'écran : trois chemins indépendants qui pointent au même endroit.
 *
 * L'ordre vient du serveur (`mergePartnerEvidence`), pas d'ici : deux tris qui
 * ordonnent la même liste divergent au premier changement de règle.
 *
 * ⚠️ Muette sur une réponse d'API antérieure au champ — la ligne se rend alors
 * exactement comme avant, avec sa seule pastille « détectée ».
 */
function EvidenceOrigins({ origins, observations }: { origins?: string[]; observations?: number | null }) {
  const { t } = useTranslation('partners')
  if (!origins || origins.length === 0) return null

  return (
    <>
      {origins.map(origin => (
        // i18n keys: evidence.workspace_declared | evidence.market_observation |
        // evidence.current_inference | evidence.declared_subcontracting (#1624.7 —
        // le rang DÉCLARÉ du référentiel ESN, une preuve DISTINCTE de l'observation
        // du corpus : ajoutée dans CETTE structure, pas dans une seconde)
        <Badge key={origin} variant="outline" className="px-1 py-0 text-xs">
          {t(`evidence.${origin}`)}
        </Badge>
      ))}
      {/* Le compte de parcours accompagne l'observation, jamais seul : « 9 »
          sans son unité ne dit rien, et « 0 » ne s'affiche pas — le serveur rend
          `null` quand le corpus n'observe pas cette société. */}
      {typeof observations === 'number' ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('observed.persons', { count: observations })}
        </Text>
      ) : null}
    </>
  )
}

/**
 * #1624.6 — UNE LIGNE QUE PERSONNE DANS L'ESPACE N'A CONFIRMÉE.
 *
 * C'est le prédicat qui décide si un libellé peut affirmer un état. Une
 * relation que quelqu'un de l'espace a déclarée — ou qu'il a qualifiée — peut
 * dire « Rang 2 » ; une relation que seul le corpus de parcours porte ne le
 * peut pas : elle ouvre une route, elle ne constate pas une place.
 *
 * ⚠️ Le repli quand `evidence_origins` est absent (API antérieure) est
 * `false` : on ne REQUALIFIE pas une ligne dont on ne connaît pas les preuves.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1624 — DÉCISION DE LOUIS DU 16/09/2026 : UNE INFÉRENCE DU PRODUIT N'EST PAS
 * UNE DÉCLARATION DE L'ÉQUIPE
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré le 16/09/2026 (#2122.46) : la version d'avant exigeait
 * `origins.length === 1 && origins[0] === 'market_observation'`, et elle ne
 * pouvait JAMAIS être vraie sur une ligne de `landscape.partners`.
 * `mergePartnerEvidence` (API, `observed-esn.ts`) pousse TOUJOURS
 * `workspace_declared` (source `declared`) ou `current_inference` (source
 * `analysis`) à côté de `market_observation` : une ligne canonique porte donc
 * au moins DEUX origines. Les deux CTA de `PartnerDetailModal` et le libellé
 * « Route partenaire potentielle » n'étaient jamais rendus — du code juste que
 * personne n'atteint, le motif n°1 de ce dépôt. C'est un PRÉDICAT comparé à des
 * valeurs que le produit ne produit pas, pas un défaut d'affichage.
 *
 * Ce que « seulement observée » veut dire depuis cette décision : **aucune
 * preuve DÉCLARÉE par l'espace**, personne chez le client ne l'a confirmée.
 * `current_inference` est une inférence du PRODUIT, pas la confirmation de
 * quelqu'un : elle ne disqualifie donc plus. Comptent comme déclaration, et
 * elles seules :
 *
 *  · `workspace_declared` — quelqu'un a SAISI cette ESN (`source = 'declared'`) ;
 *  · une QUALIFICATION humaine — un rang ou une relation autre qu'« inconnu ».
 *    Le pipeline écrit TOUJOURS `rank: 'unknown'` et `relationship: 'unknown'`
 *    (`seedDetectedPartners`, `accounts.service.ts`, INSERT littéral) ; une
 *    autre valeur sur une ligne non déclarée ne peut venir que de
 *    `PATCH /accounts/partners/:id` (#2122.46), c'est-à-dire d'une personne —
 *    et `qualify` ne bascule délibérément PAS `source` en `declared`. Sans
 *    cette seconde clause, l'écran écrirait « Route partenaire potentielle »
 *    par-dessus le « Rang 2 » qu'un commercial vient de choisir : « une
 *    correction humaine gagne toujours » est une doctrine de ce dépôt.
 *
 * ⚠️ `declared_subcontracting` (#1624.7) ne compte PAS : c'est l'ESN ELLE-MÊME
 * qui s'est déclarée ouverte à la sous-traitance ailleurs dans le produit —
 * personne dans l'espace du client ne l'a confirmée. Deux preuves différentes,
 * l'issue le dit mot pour mot.
 */
function isObservedOnly(partner: {
  evidence_origins?: string[] | null
  rank?: PartnerRank
  relationship?: PartnerRelationship
}): boolean {
  const origins = partner.evidence_origins
  if (!origins || origins.length === 0) return false
  // #1624 — une inférence n'est pas une déclaration : seule une preuve que
  // l'espace a POSÉE lui-même retire la ligne de « seulement observée ».
  if (!origins.includes('market_observation')) return false
  if (origins.includes('workspace_declared')) return false
  return (partner.rank ?? 'unknown') === 'unknown' && (partner.relationship ?? 'unknown') === 'unknown'
}

/**
 * #4295.21 — UNE RELATION DÉDUITE SE DIT « ESTIMÉ ». Déduite = le produit l'a inférée ou le corpus l'a observée, mais
 * personne dans l'espace ne l'a confirmée : aucune preuve DÉCLARÉE et aucune qualification humaine (rang et relation
 * encore « inconnu »). Confirmée (déclarée ou qualifiée) = pas de badge. Sans origines (API antérieure), on ne
 * requalifie pas : pas de badge.
 */
function isDeducedPartner(partner: {
  evidence_origins?: string[] | null
  rank?: PartnerRank
  relationship?: PartnerRelationship
}): boolean {
  const origins = partner.evidence_origins
  if (!origins || origins.length === 0) return false
  if (origins.includes('workspace_declared')) return false
  return (partner.rank ?? 'unknown') === 'unknown' && (partner.relationship ?? 'unknown') === 'unknown'
}

/**
 * recette 10/09 — « le score des ESN vaut 10/100 pour TOUTES », mesuré sur
 * BNP Paribas (4 ESN) comme sur ROCHE (6 ESN). `partnerScore`
 * (packages/contracts) EST calculé, correctement : rang inconnu (5) +
 * relation inconnue (5) + 0 placement (0) = 10, LE PLANCHER exact et le
 * SEUL moyen d'atteindre cette valeur (tout autre rang/relation/placement
 * réel vaut STRICTEMENT plus). `seedDetectedPartners` (accounts.service.ts)
 * écrit CHAQUE ESN détectée par l'analyse avec ces trois valeurs plancher —
 * décision documentée et volontaire, « ni le rang ni la relation ne sont
 * devinés » — donc toute ESN jamais qualifiée par l'utilisateur calcule
 * TOUJOURS exactement 10/100. Un score qui ne varie sur AUCUN des trois
 * facteurs ne mesure rien : il ne doit pas se lire comme un chiffre
 * comparatif entre partenaires.
 */
function hasPartnerScoreSignal(partner: {
  rank: PartnerRank
  relationship: PartnerRelationship
  placements: number
}): boolean {
  return partner.rank !== 'unknown' || partner.relationship !== 'unknown' || partner.placements > 0
}

/**
 * #1624.4 — LA CONVERGENCE SE DIT EN UNE PHRASE ; LA DIVERGENCE, EN DEUX VALEURS.
 *
 * Trois chemins indépendants qui pointent au même endroit sont l'information la
 * plus forte de l'écran. Elle s'affichait sous forme de trois badges alignés :
 * un lecteur y voit trois étiquettes, pas un faisceau.
 *
 * ⚠️ Et surtout : l'issue interdit de CHOISIR. Quand une source actuelle vient
 * en plus de l'observation, on dit qu'elle va dans le même sens ; on ne fusionne
 * pas, on ne fait pas primer l'une sur l'autre, et si elles divergeaient c'est
 * l'utilisateur qui tranche. Le texte de divergence existait sans jamais être
 * appelé (clé `evidence.diverging`, i18n seul) — ce composant est ce jour-là.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE « LES DEUX SOURCES » VEUT DIRE ICI, ET CE QUI SE COMPARE
 * ─────────────────────────────────────────────────────────────────────────────
 * `evidence_origins` est une liste ADDITIVE de confirmations (déclarée / observée
 * / détectée) : aucune des trois ne porte de valeur qui pourrait CONTREDIRE une
 * autre — la mémoire marché ne dit jamais « partenaire » ou « concurrent »
 * (`MarketEsnObserved` n'a que `esnName`/`persons`/`certainty`, jamais de rang
 * ni de relation). La seule paire qui porte chacune une VALEUR mesurée
 * indépendamment est donc : la certitude de la DÉTECTION récente
 * (`partner.certainty`, posée par l'analyse quand `current_inference` est
 * présente) contre la certitude que le corpus tire LUI-MÊME du nombre de
 * parcours (`observedCertainty(market_observation_count)`, quand
 * `market_observation` est présente). C'est exactement la paire que documente
 * `MarketEsnClientEntity` : « quand l'inférence existante et l'observation
 * concordent, la certitude monte ; quand elles divergent, LES DEUX sont
 * conservées et rendues, aucune ne l'emporte. »
 *
 * ⚠️ Sans les DEUX valeurs mesurées, un désaccord ne se CONSTATE pas — une
 * ligne déclarée (`certainty: null`, personne n'a évalué de détection) qui
 * croise une observation garde donc le comportement d'avant #1624.4 : la
 * phrase de convergence, jamais un désaccord inventé faute de mesure.
 */
function EvidenceAgreement({
  origins,
  certainty,
  marketObservationCount,
}: {
  origins?: string[]
  certainty: EsnPresenceCertainty | null
  marketObservationCount?: number | null
}) {
  const { t } = useTranslation('partners')
  if (!origins) return null
  const observed = origins.includes('market_observation')
  const current = origins.includes('current_inference')
  if (!observed || !current) return null

  const marketCertainty = typeof marketObservationCount === 'number' ? observedCertainty(marketObservationCount) : null

  if (!certainty || !marketCertainty || certainty === marketCertainty) {
    return (
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('evidence.converging')}
      </Text>
    )
  }

  // #1624.4 — DÉSACCORD : LES DEUX VALEURS, CÔTE À CÔTE, AUCUNE CHOISIE.
  return (
    <Box className="space-y-0.5">
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('evidence.diverging')}
      </Text>
      <Box display="flex" className="flex-wrap items-center gap-2">
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('evidence.currentAssessment', { value: t(`certainty.${certainty}`) })}
        </Text>
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('evidence.marketAssessment', { value: t(`certainty.${marketCertainty}`) })}
        </Text>
      </Box>
    </Box>
  )
}

/**
 * L'onglet Partenaires d'un dossier de compte (PDF 2 §4.1, décision D11).
 *
 * Il répond à la question la plus structurante d'une vente ESN : est-ce qu'on
 * attaque en direct, ou est-ce qu'on passe par quelqu'un ?
 *
 * La recommandation est donnée PAR ENTITÉ et non pour le compte : le §2 place
 * le rang 1 sur l'entité, et une réponse unique pour « EDF » mélangerait une
 * DSI verrouillée et une filiale ouverte.
 */
export function TabPartners({
  account,
  firstName,
  detailedExtra,
}: {
  account: Account
  firstName?: string
  /** #5107.5 — les blocs de tête d'Écosystème (`AccountEcosystemTop`), rangés à la fin de la lecture détaillée. */
  detailedExtra?: ReactNode
}) {
  const { t } = useTranslation('partners')
  const { t: tAccountDetail } = useTranslation('accountDetail')
  const { t: tEcosystem } = useTranslation('accounts')
  // FINIR-V2-27-09 — bloc CSV 14_ECOSYSTEME : les acteurs tiers observés dans
  // l'environnement du compte, ni une entité du compte ni un concurrent ESN.
  const ecosystemThirdParties = useMemo(
    () => parseAccountAnalysis(account.raw_analysis).ecosystem_third_parties,
    [account.raw_analysis],
  )
  const qc = useQueryClient()
  const [name, setName] = useState('')
  /**
   * #1818.1 — LE RANG ouvert dans `landscape.partners`, pas un id.
   *
   * `BrowsableDialog` (#1797, réutilisé tel quel) parcourt une liste par RANG :
   * `null` = fermée. Un rang plutôt qu'un id, parce que c'est exactement le
   * contrat que `BrowsableDialog` demande à son appelant (« le rang est celui
   * de la liste COURANTE, c'est l'appelant qui le calcule »).
   */
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  /**
   * #2122.46 — la relation dont le formulaire de qualification est OUVERT.
   * Un id, pas un rang : la liste se réordonne après chaque écriture
   * (`partnerScore` lit le rang et la relation), et un rang mémorisé
   * désignerait alors une autre société.
   */
  const [qualifyingId, setQualifyingId] = useState<string | null>(null)
  /** #5107.5 — la lecture détaillée (fermée par défaut) s'ouvre quand un geste y range un formulaire. */
  const [detailedOpen, setDetailedOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['partners', account.id],
    queryFn: () => apiFetch<Landscape>({ path: `/accounts/${account.id}/partners` }),
  })

  /**
   * #3404.5 — LES RELATIONS GOUVERNÉES DE L'ESPACE, POUR RELIER UNE PRÉSENCE
   * RANG 2 AU CADRE DÉJÀ MODÉLISÉ (`partner_relations` — marge plancher,
   * partage, propriétaire du compte, propriétaire du consultant, clause de
   * non-sollicitation…). MÊME clé de cache que l'écran Partenaires
   * (`PartnerPipeline.tsx`) : visiter cet onglet après lui ne refait aucune
   * requête, et l'inverse non plus.
   */
  const { data: partnerRelations } = useQuery({ queryKey: PARTNER_PIPELINE_KEY, queryFn: fetchPartnerRelations })

  /** « Ce n'est pas exact » — l'utilisateur corrige une ESN que l'analyse a cru
   *  voir. On ne supprime pas : le run suivant la recréerait. */
  const dismiss = useMutation<AccountPartner, Error, { id: string; reason: string }>({
    mutationFn: ({ id, reason }) =>
      apiFetch<AccountPartner, { reason: string }>({
        path: `/accounts/partners/${id}/dismiss`,
        method: 'POST',
        body: { reason },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partners', account.id] })
      toast.success(t('dismiss.done'))
    },
    onError: error => toast.error(t('dismiss.failed'), { description: error.message }),
  })

  /**
   * #2122.46 — QUALIFIER une relation que l'espace connaît DÉJÀ.
   *
   * ⚠️ Ce n'est pas `add` sous un autre nom. `add` DÉCLARE une ESN absente, et
   * l'API refuse par un 400 un nom déjà présent : sur une ligne canonique —
   * celle que le pipeline a posée, rang `unknown` et relation `unknown` — il
   * n'y avait donc aucun geste positif. Les deux CTA de la modale étaient bien
   * écrits, mais rendus derrière `isObservedOnly`, que `mergePartnerEvidence`
   * ne peut pas rendre vrai ici (elle pousse toujours `workspace_declared` ou
   * `current_inference`). Livrés, testés, et hors de portée là où ils servent —
   * le même défaut que #1624 avait corrigé sur le bloc « observées ».
   */
  const qualify = useMutation<AccountPartner, Error, { id: string } & QualifyAccountPartner>({
    mutationFn: ({ id, ...body }) =>
      apiFetch<AccountPartner, QualifyAccountPartner>({
        path: `/accounts/partners/${id}`,
        method: 'PATCH',
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partners', account.id] })
      setQualifyingId(null)
      toast.success(t('qualifyForm.done'))
    },
    onError: error => toast.error(t('qualifyForm.failed'), { description: error.message }),
  })

  const add = useMutation<AccountPartner, Error, { name: string }>({
    mutationFn: body =>
      apiFetch<AccountPartner, { name: string }>({
        path: `/accounts/${account.id}/partners`,
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partners', account.id] })
      toast.success(t('added'))
    },
    onError: error => toast.error(t('addFailed'), { description: error.message }),
  })

  if (isLoading) {
    return (
      <Text size="sm" color="text-[var(--bellum-text-muted)]">
        {t('loading')}
      </Text>
    )
  }

  const landscape = data ?? { partners: [], recommendations: [] }
  const observed = landscape.observed ?? []

  return (
    <Box className="space-y-4">
      <EcosystemGrid partners={landscape.partners} firstName={firstName} onOpenDetail={setOpenIndex} />
      <DetailedReading
        testId="partners-detailed-reading"
        label={tEcosystem('ecosystemGrid.detailed')}
        open={detailedOpen}
        onOpenChange={setDetailedOpen}
      >
        {/* FINIR-V2-27-09 — un acteur tiers cité ne vaut ni accès à un panel ni
          preuve de sous-traitance : ce n'est jamais un partenaire ESN candidat,
          d'où sa place à part, avant les recommandations de la liste canonique. */}
        <KeyNotesCard
          title={tAccountDetail('ecosystemThirdParties.title')}
          icon={<Globe2 className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />}
          notes={ecosystemThirdParties}
        />
        {landscape.recommendations.length > 0 && (
          <Card>
            <CardContent className="space-y-2 p-4">
              <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
                {t('recommendations.title')}
              </Text>
              {/* recette 10/09 — la raison est une propriété du PLAY (le barème
                de `rank1Recommendation`), pas de tel ou tel périmètre : elle
                est donc IDENTIQUE pour tous les périmètres qui partagent le
                même play, et se dit ici une fois par groupe, jamais une fois
                par ligne (loi 4 du tome 7 — mesuré à 16 répétitions sur BNP
                Paribas). Voir `groupRecommendations` (#3464 : une issue par groupe, doublons fusionnés). */}
              {groupRecommendations(landscape.recommendations).map(group => (
                <Box key={`${group.play}-${group.reason}`} className="space-y-1">
                  <Box display="flex" className="flex-wrap items-center gap-2">
                    <Badge variant="outline" className="px-1 py-0 text-xs">
                      {t(`play.${group.play}`)}
                    </Badge>
                    <Text size="xs" color="text-[var(--bellum-text-muted)]">
                      {group.reason}
                    </Text>
                  </Box>
                  <Box display="flex" className="flex-wrap gap-x-3 gap-y-1">
                    {group.items.map(item => (
                      <Text key={item.entity_id ?? item.entity_name} size="sm">
                        {item.entity_name}
                        {item.partner && (
                          <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]">
                            {` — ${item.partner}`}
                          </Text>
                        )}
                      </Text>
                    ))}
                  </Box>
                </Box>
              ))}
            </CardContent>
          </Card>
        )}

        {/* #1579 → #1605 — ce bloc ne porte plus QUE ce que l'espace ne connaît pas
          encore. Une société déjà dans la liste canonique y porte ses origines de
          preuve et ne réapparaît plus ici : c'est le doublon que le retour vise.

          #1579 — une TROISIÈME nature de preuve, à côté du déclaré et du détecté.
          Le bloc n'apparaît QUE s'il y a quelque chose à montrer : pas de
          couverture, pas de corpus, mémoire en erreur — dans les trois cas
          l'onglet est exactement ce qu'il était. Un message technique
          (« mémoire indisponible ») ne serait adressé à personne. */}
        {observed.length > 0 && (
          <Card>
            <CardContent className="space-y-2 p-4">
              <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
                {/* #1624.2 — « Relation d'écosystème observée », et pas « ESN en
                  place » : la mémoire marché ne dit jamais une présence. Le
                  libellé porte donc la NATURE du lien, pas un état. */}
                {t('observed.relationTitle')}
              </Text>
              {/* ⚠️ La mise en garde n'est PAS décorative et ne se masque pas :
                sans elle, une observation se lit comme une présence actuelle,
                ce qui est faux et se retourne en rendez-vous. */}
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {t('observed.caveat')}
              </Text>
              {observed.map(entry => (
                <Box key={entry.esnName} display="flex" className="flex-wrap items-center gap-2">
                  {/* #1818.2 — la société observée porte son logo, comme la
                    société déclarée juste au-dessus. Les deux listes du même
                    écran affichaient deux identités différentes pour la même
                    nature d'objet. */}
                  <CompanyAvatar
                    name={entry.esnName}
                    size="sm"
                    logoUrl={entry.logo_url ?? null}
                    website={entry.website ?? null}
                  />
                  <Text size="sm">{entry.esnName}</Text>
                  <Badge
                    variant={entry.certainty === 'faible' ? 'outline' : 'secondary'}
                    className="px-1 py-0 text-xs"
                    style={entry.certainty === 'faible' ? { opacity: 0.65 } : undefined}
                  >
                    {t(`certainty.${entry.certainty}`)}
                  </Badge>
                  {/* #1624.3 — « 9 parcours observés relient ALTEN à cet
                    environnement. » Le compte s'affichait détaché du nom, et se
                    lisait comme un score. Une phrase complète dit ce qu'il
                    compte ET sur qui il porte. */}
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {/* #4016 L10 — sous le seuil transverse, la fourchette « 1-2 », jamais le compte exact. */}
                    {pathsSentence(t, entry.persons, entry.esnName)}
                  </Text>
                  {/* #1605 — `alsoKnown` ne peut plus être vrai ici : une société
                    déjà connue de l'espace a rejoint la liste canonique avec ses
                    origines de preuve. La branche est retirée plutôt que laissée
                    inatteignable — du code que rien n'atteint se relit comme une
                    règle en vigueur. Le champ reste au contrat pour les réponses
                    d'API antérieures. */}

                  {/* ⚠️ #1624 — LES DEUX SORTIES VIVENT ICI AUSSI, et c'est le
                    point : ce bloc porte les sociétés que l'espace ne connaît
                    PAS encore, donc exactement celles qu'il y a à qualifier.
                    Elles n'existaient que sur les lignes DÉJÀ déclarées —
                    livrées, testées, et hors de portée là où elles servent.
                    Mesuré en production le 11/09 : « 4 parcours observés
                    relient Devoteam à cet environnement », et aucun geste
                    possible, sur une ligne qui n'était même pas tabulable. */}
                  <Box display="flex" className="w-full flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={add.isPending}
                      aria-label={t('cta.qualifyAria', { name: entry.esnName })}
                      onClick={() => {
                        // Motif d'écran FIXE, jamais le nom de l'ESN ni l'id du
                        // compte — même règle que sur la fiche.
                        trackActionStarted(QUALIFY_ACTION, PARTNERS_SCREEN)
                        add.mutate(
                          { name: entry.esnName },
                          {
                            onSuccess: () => trackActionCompleted(QUALIFY_ACTION, PARTNERS_SCREEN),
                            onError: () => trackActionAbandoned(QUALIFY_ACTION, PARTNERS_SCREEN, 'error'),
                          },
                        )
                      }}
                    >
                      {t('cta.qualify')}
                    </Button>
                    <Link
                      to="/search"
                      search={{ company: entry.esnName }}
                      aria-label={t('cta.verifyTodayAria', { name: entry.esnName })}
                      className="inline-flex min-h-9 items-center rounded-full border border-[var(--bellum-border)] px-3 text-sm text-[var(--bellum-text-accent)] transition-colors hover:border-[var(--bellum-text-accent)] pointer-coarse:min-h-11"
                      onClick={() => trackActionStarted(VERIFY_TODAY_ACTION, PARTNERS_SCREEN)}
                    >
                      {t('cta.verifyToday')}
                    </Link>
                  </Box>
                </Box>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="space-y-2 p-4">
            <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
              {/* #3095 — « avec leur nombre » : jamais « (0) », une liste vide dit
                déjà son compte par son état vide juste en dessous. */}
              {landscape.partners.length > 0
                ? t('list.titleWithCount', { count: landscape.partners.length })
                : t('list.title')}
            </Text>
            {landscape.partners.length === 0 ? (
              <EmptyState
                size="sm"
                align="center"
                icon={<Handshake className="h-8 w-8" />}
                title={t('list.empty.title')}
                description={t('list.empty.description')}
              />
            ) : (
              // Refonte Théo (23/10) — `.a4-partner-grid` : une CARTE par société, en grille mesurée par le contenu.
              <div
                data-testid="partner-grid"
                className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-4 pt-2"
              >
                {landscape.partners.map((partner, index) => (
                  /* #1818.1 / #1818.2 / #1818.3 — LA CARTE, RÉDUITE AU NOM, AU LOGO ET
                   * À L'ÉTAT (mot de Louis, issue #1818) : le PÉRIMÈTRE/LA DATE, la
                   * note (l'angle rang-2 — la même phrase générique sur chaque carte
                   * sans battlecard, #1818.3) et la convergence des preuves descendent
                   * dans `PartnerDetailModal`, ouverte au clic.
                   *
                   * #2122.59 / #2122.63 — L'ACTION, ELLE, REMONTE. « Type, preuve,
                   * confiance et action visibles SANS clic supplémentaire » : les
                   * trois premiers étaient déjà là, la quatrième était descendue avec
                   * le reste, et derrière un prédicat que cette liste ne peut pas
                   * satisfaire (voir le docblock de `qualify`). Une carte de relation
                   * sans un seul geste possible, c'est ce que la recette a mesuré.
                   * Le geste est posé À CÔTÉ du bouton d'ouverture, jamais dedans :
                   * un `<button>` dans un `<button>` n'est pas tabulable (GA-35). */
                  <Box
                    key={partner.id}
                    data-testid={`partner-row-${partner.id}`}
                    className="flex min-w-0 flex-col gap-2 rounded-card border border-[var(--bellum-border)] bg-card p-4"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenIndex(index)}
                      aria-label={t('cta.openDetailAria', { name: partner.name })}
                      className="flex w-full flex-wrap items-center gap-2 rounded-md py-1 text-left pointer-coarse:min-h-11"
                    >
                      {/* #1818.2 — l'identité visuelle. `AccountPartner` lui-même ne
                    porte ni domaine ni site (`esn_directory.domain` est une
                    colonne documentée comme jamais écrite —
                    `unwritten-columns.ts`, 93 % des domaines dérivés du nom
                    étaient faux). `logo_url`/`website` ne viennent donc jamais
                    d'un domaine deviné : ils voyagent UNIQUEMENT quand
                    `PartnersService.attachLogos` a trouvé, côté serveur, un
                    unique compte déjà analysé de cet espace portant ce nom
                    normalisé (voir son docblock pour la règle d'ambiguïté).
                    `CompanyAvatar` est le MÊME composant que la fiche compte —
                    il retombe déjà sur l'initiale sans logo, ou si l'image ne
                    charge pas. */}
                      <div data-testid={`partner-avatar-${partner.id}`}>
                        <CompanyAvatar
                          name={partner.name}
                          size="sm"
                          logoUrl={partner.logo_url}
                          website={partner.website}
                        />
                      </div>
                      <Text size="sm">{partner.name}</Text>
                      {/* #1624.6 — « Rang 2 » sur une relation OBSERVÉE se lit
                    comme une place acquise, et l'issue interdit littéralement
                    « Rang 2 disponible ». Sur une ligne dont la seule preuve
                    est l'observation, le libellé devient donc « Route
                    partenaire potentielle » : la même donnée, sans la
                    promesse. Un rang DÉCLARÉ, lui, garde son nom — ce sont
                    deux preuves différentes, et les confondre était le défaut.
                    ⚠️ La valeur d'énumération `rank.rank2` n'est PAS écrasée :
                    elle est partagée et gardée par `enum-keys.test.ts`.
                    #1624 (16/09/2026) — la condition `&& partner.rank ===
                    'rank2'` est RETIRÉE, et ce n'est pas un élargissement : le
                    prédicat porte désormais la règle en entier. Une ligne
                    seulement observée a forcément `rank: 'unknown'` (sinon
                    quelqu'un l'a qualifiée, et le prédicat est faux), si bien
                    que l'ancienne condition rendait cette branche INATTEIGNABLE
                    une seconde fois. Le badge dit donc « Route partenaire
                    potentielle » là où il écrivait « Rang inconnu » — la même
                    donnée, nommée. */}
                      <Badge variant="outline" className="px-1 py-0 text-xs">
                        {isObservedOnly(partner)
                          ? t('relation.partnerRoute')
                          : t(`rank.${partner.rank as PartnerRank}`)}
                      </Badge>
                      <Badge variant="outline" className="px-1 py-0 text-xs">
                        {t(`relationship.${partner.relationship as PartnerRelationship}`)}
                      </Badge>
                      {/* La provenance se voit : un concurrent repéré par une analyse
                    et jamais confirmé n'a pas l'autorité d'un partenaire
                    déclaré par le commercial qui travaille avec lui.

                    #1605 — quand le serveur rend les origines de preuve, elles
                    REMPLACENT cette pastille : elle en est un cas particulier
                    (« source actuelle »), et afficher les deux écrirait le
                    même fait sous deux formes (loi 4 du tome 7). */}
                      {partner.evidence_origins && partner.evidence_origins.length > 0 ? (
                        <EvidenceOrigins
                          origins={partner.evidence_origins}
                          observations={partner.market_observation_count}
                        />
                      ) : (
                        partner.source === 'analysis' && (
                          <Badge variant="outline" className="px-1 py-0 text-xs">
                            {t('detected')}
                          </Badge>
                        )
                      )}
                      {isDeducedPartner(partner) ? <EstimatedBadge /> : null}
                      {/* La certitude est visuellement DISTINGUÉE (tome 1 §21.3) :
                    une ESN « faible » et une ESN « forte » sur la même liste
                    appellent deux gestes différents, et un badge identique
                    ferait envoyer le même message aux deux. */}
                      {partner.certainty && (
                        <Badge
                          variant={partner.certainty === 'faible' ? 'outline' : 'secondary'}
                          className="px-1 py-0 text-xs"
                          style={partner.certainty === 'faible' ? { opacity: 0.65 } : undefined}
                        >
                          {t(`certainty.${partner.certainty}`)}
                        </Badge>
                      )}
                      {/* #2151.42 / #2166.38 — LA RELATION WORKSPACE : cette ESN
                    correspond déjà, SANS AMBIGUÏTÉ, à un compte de l'espace
                    (`PartnersService.attachLogos`). Un badge SEUL ici — pas de
                    lien : la ligne entière est déjà un `<button>` (#1818.1),
                    et un `<a>` imbriqué y romprait l'accessibilité. Le lien
                    réel vit dans `PartnerDetailModal`, ouverte au clic. */}
                      {partner.workspace_account_id && (
                        <Badge variant="outline" className="px-1 py-0 text-xs">
                          {t('workspaceRelation.badge')}
                        </Badge>
                      )}
                      {hasPartnerScoreSignal(partner) ? (
                        <Text size="xs" color="text-[var(--bellum-text-muted)]">
                          {t('score', { score: partner.score })}
                        </Text>
                      ) : (
                        <Text size="xs" color="text-[var(--bellum-text-muted)]">
                          {t('scoreUnknown')}
                        </Text>
                      )}
                    </button>
                    {/* #2122.46 / #2122.63 — L'ACTION, sur la carte, pour TOUTE
                    relation affichée : aucune condition, parce que la seule
                    qu'il y avait rendait les CTA inatteignables. « Qualifier »
                    ne déclare pas (l'API refuse un nom déjà présent) — elle dit
                    ce que cette ESN est POUR NOUS, les deux champs que la carte
                    montre le plus souvent à « inconnu » et que `partnerScore`
                    lit. UNE action et une seule : « Vérifier aujourd'hui » vit
                    déjà dans le bloc « observées » et dans la modale, et
                    l'écrire une troisième fois serait le doublon que la loi 4
                    du tome 7 refuse. */}
                    <Box display="flex" className="flex-wrap items-center gap-2 pb-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        aria-label={t('qualifyForm.openAria', { name: partner.name })}
                        aria-expanded={qualifyingId === partner.id}
                        onClick={() => {
                          trackActionStarted(QUALIFY_ACTION, PARTNERS_SCREEN)
                          setQualifyingId(current => (current === partner.id ? null : partner.id))
                        }}
                      >
                        {t('qualifyForm.open')}
                      </Button>
                    </Box>
                    {qualifyingId === partner.id && (
                      <PartnerQualifyForm
                        partner={partner}
                        partnerRelations={partnerRelations ?? []}
                        pending={qualify.isPending}
                        onCancel={() => setQualifyingId(null)}
                        onSave={body => {
                          qualify.mutate(
                            { id: partner.id, ...body },
                            {
                              onSuccess: () => trackActionCompleted(QUALIFY_ACTION, PARTNERS_SCREEN),
                              onError: () => trackActionAbandoned(QUALIFY_ACTION, PARTNERS_SCREEN, 'error'),
                            },
                          )
                        }}
                      />
                    )}
                  </Box>
                ))}
              </div>
            )}

            {/* #1887 — le champ propose ce que NOTRE référentiel connaît. Il reste
              LIBRE : le référentiel a 477 noms, le marché en a plus, et refuser
              un nom absent ferait perdre la déclaration qui a le plus de valeur
              — celle d'une ESN que l'analyse n'a pas vue. */}
            <Box display="flex" className="items-center gap-2 pt-1">
              <EsnNameField
                value={name}
                onChange={setName}
                disabled={add.isPending}
                onSubmit={() => {
                  if (name.trim().length === 0 || add.isPending) return
                  add.mutate({ name: name.trim() })
                  setName('')
                }}
              />
              <Button
                size="sm"
                disabled={name.trim().length === 0 || add.isPending}
                onClick={() => {
                  add.mutate({ name: name.trim() })
                  setName('')
                }}
              >
                {t('list.add')}
              </Button>
            </Box>
          </CardContent>
        </Card>

        {detailedExtra}
      </DetailedReading>

      {/* #1818.1 — LA MODALE DE DÉTAIL, réutilisant `BrowsableDialog` (#1797) —
          « le premier qui en a besoin le pose là où le deuxième pourra le
          prendre » : aucune seconde modale à flèches n'est fabriquée ici. */}
      {openIndex !== null && landscape.partners[openIndex] && (
        <PartnerDetailModal
          partner={landscape.partners[openIndex]}
          partnerRelations={partnerRelations ?? []}
          index={openIndex}
          total={landscape.partners.length}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
          onQualify={() => {
            // #1624 — la modale se ferme AVANT que le formulaire s'ouvre : il
            // vit sur la carte, sous la couche de dialogue, et un formulaire
            // rendu derrière un overlay n'est ni cliquable ni tabulable.
            const id = landscape.partners[openIndex]?.id ?? null
            setOpenIndex(null)
            setQualifyingId(id)
            setDetailedOpen(true)
          }}
          dismiss={dismiss}
        />
      )}
    </Box>
  )
}

/**
 * #2122.46 — DIRE CE QUE CETTE ESN EST POUR NOUS, SUR LA CARTE.
 *
 * Deux `<select>` NATIFS : ils se tabulent, s'ouvrent au clavier et appellent
 * le sélecteur du système sur un téléphone (même mécanique que l'organigramme).
 * Les deux listes viennent des énumérations PARTAGÉES — les recopier ici ferait
 * diverger l'écran de la contrainte SQL au premier ajout.
 *
 * ⚠️ « Inconnu » reste une VALEUR choisissable, et ce n'est pas un oubli : un
 * commercial qui a mis « Rang 1 » par erreur doit pouvoir revenir à ce qu'on ne
 * sait pas. « Non mesuré » n'est pas « 0 », et ce n'est pas non plus une porte
 * à sens unique.
 */
/** `rank2_scope_accessible` … — le nom de colonne partagé par le contrat et
 *  la base, dérivé du critère plutôt que recopié (un seul endroit). */
function rank2FieldOf(criterion: Rank2QualificationCriterion): `rank2_${Rank2QualificationCriterion}` {
  return `rank2_${criterion}`
}

/** Le tri-état d'un critère, tel qu'un `<select>` natif le porte : « non
 *  mesuré » est une VALEUR choisissable, pas un défaut qu'on devine. */
type TriState = 'yes' | 'no' | 'unknown'
const TRI_STATE_OPTIONS: readonly TriState[] = ['yes', 'no', 'unknown']
function triStateOf(value: boolean | null | undefined): TriState {
  return value === true ? 'yes' : value === false ? 'no' : 'unknown'
}
function booleanOf(value: TriState): boolean | null {
  return value === 'yes' ? true : value === 'no' ? false : null
}

function PartnerQualifyForm({
  partner,
  partnerRelations,
  pending,
  onCancel,
  onSave,
}: {
  partner: {
    id: string
    name: string
    rank: string
    relationship: string
    note: string | null
    rank2_scope_accessible?: boolean | null
    rank2_brief_precise?: boolean | null
    rank2_contact_accountable?: boolean | null
    rank2_economics_clear?: boolean | null
    rank2_next_steps_ready?: boolean | null
    competitive_risk?: string | null
    complementarity?: string | null
    next_verification_at?: string | null
    partner_relation_id?: string | null
  }
  /** #3404.5 — les relations de l'espace, pour choisir laquelle cette
   *  présence rang 2 désigne. Vide tant que la requête n'a pas répondu :
   *  le sélecteur montre alors seulement « Aucune ». */
  partnerRelations: Pick<PartnerRelationView, 'id' | 'name'>[]
  pending: boolean
  onCancel: () => void
  onSave: (
    body: { rank: PartnerRank; relationship: PartnerRelationship; note?: string | null } & Partial<
      Record<`rank2_${Rank2QualificationCriterion}`, boolean | null>
    > & {
        competitive_risk?: string | null
        complementarity?: string | null
        next_verification_at?: string | null
        partner_relation_id?: string | null
      },
  ) => void
}) {
  const { t } = useTranslation('partners')
  const [rank, setRank] = useState<PartnerRank>(partner.rank as PartnerRank)
  const [relationship, setRelationship] = useState<PartnerRelationship>(partner.relationship as PartnerRelationship)
  // #3404.5 — MÊME geste que les autres champs de ce formulaire générique
  // (doctrine c75) : la chaîne vide native du `<select>` porte « Aucune ».
  const initialPartnerRelationId = partner.partner_relation_id ?? ''
  const [partnerRelationId, setPartnerRelationId] = useState(initialPartnerRelationId)
  // #2316.34 — LE FAIT TERRAIN, dans ce MÊME formulaire. `initialNote` sert de
  // repère : ne rien y toucher ne doit renvoyer AUCUNE note, sinon rouvrir le
  // formulaire sans y toucher effacerait un fait terrain saisi par un autre.
  const initialNote = partner.note ?? ''
  const [note, setNote] = useState(initialNote)
  // #3205.4 (épopée #3239) — MÊME geste que la note ci-dessus : un
  // formulaire générique, pas un treizième dédié (doctrine `c75`).
  const initialCompetitiveRisk = partner.competitive_risk ?? ''
  const [competitiveRisk, setCompetitiveRisk] = useState(initialCompetitiveRisk)
  const initialComplementarity = partner.complementarity ?? ''
  const [complementarity, setComplementarity] = useState(initialComplementarity)
  const initialNextVerification = partner.next_verification_at?.slice(0, 10) ?? ''
  const [nextVerification, setNextVerification] = useState(initialNextVerification)
  // #2316.22-.27 — LES CINQ CRITÈRES, dans ce MÊME formulaire générique (pas un
  // treizième dédié, doctrine `c75`) — seulement quand le rang choisi est rang2 :
  // qualifier un rang1 ou un concurrent sur ces critères ne veut rien dire.
  const [criteria, setCriteria] = useState<Record<Rank2QualificationCriterion, TriState>>(() => {
    const initial = {} as Record<Rank2QualificationCriterion, TriState>
    for (const criterion of RANK2_QUALIFICATION_CRITERIA) {
      initial[criterion] = triStateOf(partner[rank2FieldOf(criterion)])
    }
    return initial
  })

  return (
    <Box display="flex" className="flex-col gap-2 rounded-md border border-[var(--bellum-border)] p-3">
      <Box display="flex" className="flex-wrap items-end gap-2">
        <label className="min-w-0">
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('qualifyForm.rankLabel')}
          </Text>
          <SelectField
            ariaLabel={t('qualifyForm.rankAria', { name: partner.name })}
            value={rank}
            onChange={next => setRank(next as PartnerRank)}
            options={PARTNER_RANKS.map(value => ({ value, label: t(`rank.${value}`) }))}
            className="mt-1 w-full min-w-[10rem]"
          />
        </label>
        <label className="min-w-0">
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('qualifyForm.relationshipLabel')}
          </Text>
          <SelectField
            ariaLabel={t('qualifyForm.relationshipAria', { name: partner.name })}
            value={relationship}
            onChange={next => setRelationship(next as PartnerRelationship)}
            options={PARTNER_RELATIONSHIPS.map(value => ({ value, label: t(`relationship.${value}`) }))}
            className="mt-1 w-full min-w-[10rem]"
          />
        </label>
      </Box>
      <label className="min-w-0">
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('qualifyForm.noteLabel')}
        </Text>
        <Textarea
          aria-label={t('qualifyForm.noteAria', { name: partner.name })}
          value={note}
          onChange={event => setNote(event.target.value)}
          className="mt-1 min-h-[4rem] w-full"
        />
      </label>
      <label className="min-w-0">
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('qualifyForm.competitiveRiskLabel')}
        </Text>
        <Textarea
          aria-label={t('qualifyForm.competitiveRiskAria', { name: partner.name })}
          value={competitiveRisk}
          onChange={event => setCompetitiveRisk(event.target.value)}
          className="mt-1 min-h-[3rem] w-full"
        />
      </label>
      <label className="min-w-0">
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('qualifyForm.complementarityLabel')}
        </Text>
        <Textarea
          aria-label={t('qualifyForm.complementarityAria', { name: partner.name })}
          value={complementarity}
          onChange={event => setComplementarity(event.target.value)}
          className="mt-1 min-h-[3rem] w-full"
        />
      </label>
      <label className="min-w-0">
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('qualifyForm.nextVerificationLabel')}
        </Text>
        <input
          type="date"
          aria-label={t('qualifyForm.nextVerificationAria', { name: partner.name })}
          value={nextVerification}
          onChange={event => setNextVerification(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-md border border-[var(--bellum-border)] bg-transparent px-2 text-sm"
        />
      </label>
      {/* #2316.22-.27 — LES CINQ CRITÈRES DE QUALIFICATION RANG 2. Rendus
          seulement quand le rang CHOISI (pas seulement celui d'origine) est
          rang2 : passer de rang1 à rang2 dans ce même formulaire doit faire
          apparaître les critères sans devoir rouvrir le formulaire. */}
      {rank === 'rank2' && (
        <Box
          display="flex"
          className="flex-col gap-2 rounded-md border border-dashed border-[var(--bellum-border)] p-2"
        >
          {/* #3404.5 — LE LIEN VERS LA RELATION GOUVERNÉE. Fait de ce rang 2
              un objet métier structuré (marge, propriétaires, clause de
              non-sollicitation…) plutôt qu'un badge : le cadre lui-même vit
              déjà, en entier, sur `partner_relations` (écran Partenaires) —
              ce champ le DÉSIGNE, il ne le duplique pas. */}
          <label className="min-w-0">
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('qualifyForm.governanceLinkLabel')}
            </Text>
            <SelectField
              ariaLabel={t('qualifyForm.governanceLinkAria', { name: partner.name })}
              value={partnerRelationId}
              onChange={setPartnerRelationId}
              options={[
                { value: '', label: t('qualifyForm.governanceLinkNone') },
                ...partnerRelations.map(relation => ({ value: relation.id, label: relation.name })),
              ]}
              className="mt-1 w-full"
            />
          </label>
          <Text size="xs" weight="semibold">
            {t('qualifyForm.rank2Qualification.title')}
          </Text>
          {RANK2_QUALIFICATION_CRITERIA.map(criterion => (
            <label key={criterion} className="flex items-center justify-between gap-2">
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {t(`qualifyForm.rank2Qualification.criteria.${criterion}`)}
              </Text>
              <SelectField
                ariaLabel={t('qualifyForm.rank2Qualification.criterionAria', {
                  criterion: t(`qualifyForm.rank2Qualification.criteria.${criterion}`),
                  name: partner.name,
                })}
                value={criteria[criterion]}
                onChange={next => setCriteria(current => ({ ...current, [criterion]: next as TriState }))}
                options={TRI_STATE_OPTIONS.map(value => ({
                  value,
                  label: t(`qualifyForm.rank2Qualification.triState.${value}`),
                }))}
                size="sm"
                className="w-40"
              />
            </label>
          ))}
        </Box>
      )}
      <Box display="flex" className="flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="min-h-11"
          disabled={pending}
          aria-label={t('qualifyForm.saveAria', { name: partner.name })}
          onClick={() => {
            const trimmedNote = note.trim()
            const body: { rank: PartnerRank; relationship: PartnerRelationship; note?: string | null } & Partial<
              Record<`rank2_${Rank2QualificationCriterion}`, boolean | null>
            > & {
                competitive_risk?: string | null
                complementarity?: string | null
                next_verification_at?: string | null
                partner_relation_id?: string | null
              } = {
              rank,
              relationship,
            }
            // Untouched → AUCUNE clé `note` : la ligne garde ce qu'elle avait.
            if (trimmedNote !== initialNote.trim()) body.note = trimmedNote || null
            // #3205.4 — même geste : intact tant que non touché.
            const trimmedCompetitiveRisk = competitiveRisk.trim()
            if (trimmedCompetitiveRisk !== initialCompetitiveRisk.trim()) {
              body.competitive_risk = trimmedCompetitiveRisk || null
            }
            const trimmedComplementarity = complementarity.trim()
            if (trimmedComplementarity !== initialComplementarity.trim()) {
              body.complementarity = trimmedComplementarity || null
            }
            if (nextVerification !== initialNextVerification) {
              body.next_verification_at = nextVerification || null
            }
            // #3404.5 — même geste : intact tant que non touché.
            if (partnerRelationId !== initialPartnerRelationId) {
              body.partner_relation_id = partnerRelationId || null
            }
            if (rank === 'rank2') {
              for (const criterion of RANK2_QUALIFICATION_CRITERIA) {
                body[rank2FieldOf(criterion)] = booleanOf(criteria[criterion])
              }
            }
            onSave(body)
          }}
        >
          {t('qualifyForm.save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={onCancel}>
          {t('qualifyForm.cancel')}
        </Button>
      </Box>
    </Box>
  )
}

/**
 * #3404.5 — LE CADRE DE GOUVERNANCE D'UN RANG 2, TEL QUE `partner_relations`
 * LE PORTE DÉJÀ (module `partner-pipeline`, #3270).
 *
 * Ne recalcule rien : `governanceReadiness` (cadré/manquant/risque) et
 * `governance` (marge plancher, partage, propriétaires, délais, durée,
 * sortie, interlocuteur) arrivent déjà résolus par `fetchPartnerRelations`.
 * Ce composant les NOMME sur l'écran compte, où le retour #3404 les demande —
 * il ne les invente pas une seconde fois (GA-26 : un réglage vit à un seul
 * endroit).
 *
 * Doctrine : un score n'est jamais nu (les dimensions manquantes sont
 * NOMMÉES, jamais un total seul) ; une absence ne fait AUCUNE ligne
 * (GA-18/GA-19) — un champ non cadré n'apparaît simplement pas.
 */
function PartnerGovernanceSummary({
  relation,
  certainty,
  accountId,
}: {
  relation: PartnerRelationView
  /** #4292.2 — le compte, pour retrouver le rôle de décision du contact nommé. */
  accountId: string
  /** #3404.15 — la confiance de la présence sur CE compte (`account_partners`). */
  certainty: EsnPresenceCertainty | null
}) {
  const { t } = useTranslation('partners')
  const { governance, governanceReadiness } = relation
  const { data: accountContacts } = useContactsByAccount(accountId)

  return (
    <Box
      display="flex"
      className="flex-col gap-1.5 rounded-md border border-[var(--bellum-border)] p-2"
      data-testid="partner-governance-summary"
    >
      <Box display="flex" className="items-center justify-between gap-2">
        <Text size="xs" weight="semibold">
          {t('detail.governance.title')}
        </Text>
        <Badge
          variant={
            governanceReadiness.risk === 'blocking'
              ? 'destructive'
              : governanceReadiness.risk === 'attention'
                ? 'outline'
                : 'success'
          }
          className="px-1 py-0 text-xs"
        >
          {t(`detail.governance.risk.${governanceReadiness.risk}`)}
        </Badge>
      </Box>
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('detail.governance.framed', { count: governanceReadiness.framed.length })}
      </Text>
      {/* Un score n'est jamais nu : ce qui manque est NOMMÉ, jamais un total seul. */}
      {governanceReadiness.missing.length > 0 && (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('detail.governance.missingLabel')}{' '}
          {governanceReadiness.missing.map(dimension => t(`detail.governance.dimensions.${dimension}`)).join(', ')}
        </Text>
      )}
      {/* #3404.14 — « QUAND IL DÉTRUIT LA MARGE » : le partage convenu SOUS le
          plancher déclaré, nommé — jamais calculé en silence dans un score. */}
      {governance.marginFloorPercent !== null && governance.marginSharePercent !== null && (
        <Text
          size="xs"
          color={
            governance.marginSharePercent < governance.marginFloorPercent
              ? 'text-[var(--danger-soft-text)]'
              : 'text-[var(--bellum-text-secondary)]'
          }
        >
          {governance.marginSharePercent < governance.marginFloorPercent
            ? t('detail.governance.marginDestroyed', {
                share: governance.marginSharePercent,
                floor: governance.marginFloorPercent,
              })
            : t('detail.governance.marginShare', { percent: governance.marginSharePercent })}
        </Text>
      )}
      {governance.marginFloorPercent !== null && governance.marginSharePercent === null && (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('detail.governance.marginFloor', { percent: governance.marginFloorPercent })}
        </Text>
      )}
      {governance.accountOwnership && (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('detail.governance.accountOwnership.label')} :{' '}
          {t(`detail.governance.accountOwnership.${governance.accountOwnership}`)}
        </Text>
      )}
      {governance.actionOwnership && (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('detail.governance.actionOwnership.label')} :{' '}
          {t(`detail.governance.actionOwnership.${governance.actionOwnership}`)}
        </Text>
      )}
      {governance.paymentTerms && (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('detail.governance.paymentTerms', { terms: governance.paymentTerms })}
        </Text>
      )}
      {governance.durationTerms && (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('detail.governance.durationTerms', { terms: governance.durationTerms })}
        </Text>
      )}
      {governance.exitConditions && (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('detail.governance.exitConditions', { terms: governance.exitConditions })}
        </Text>
      )}
      {governance.ourContactName && (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('detail.governance.ourContact', { name: governance.ourContactName })}
        </Text>
      )}
      {relation.contactName && (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('detail.governance.partnerContact', { name: relation.contactName })}
          {/* #4292.2 — la même pastille que la liste Contacts, sur le contact nommé ici. */}{' '}
          <DecisionMakerBadge role={decisionRoleByName(accountContacts, relation.contactName)} />
        </Text>
      )}
      {/* #3404.14/.15 — la preuve et la confiance, nommées quand elles existent
          (recette 30/09 : les deux manquaient dans la modale). Une absence ne
          fait aucune ligne — jamais « preuve : aucune » ni une confiance à 0. */}
      {governance.referencingProof && (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('detail.governance.referencingProof', { proof: governance.referencingProof })}
        </Text>
      )}
      {certainty && (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('detail.governance.confidence', { value: t(`certainty.${certainty}`) })}
        </Text>
      )}
      {/* #3404.11 — « QUAND IL INTERDIT UNE APPROCHE DIRECTE » : la clause de
          non-sollicitation, nommée comme une garde, jamais une nuance. */}
      {relation.nonSolicitation === true && (
        <Text size="xs" color="text-[var(--danger-soft-text)]" weight="medium">
          {t('detail.governance.directApproachForbidden')}
        </Text>
      )}
      <Link
        to="/accounts/partners"
        className="inline-flex w-fit items-center text-xs text-[var(--bellum-text-accent)] hover:underline"
      >
        {t('detail.governance.editLink')}
      </Link>
    </Box>
  )
}

/**
 * #1818.1 — LE DÉTAIL D'UN PARTENAIRE, DANS LA MODALE.
 *
 * Tout ce que la carte ne porte plus : le périmètre et la date de détection,
 * la note (l'angle rang-2 — #1818.3, la phrase générique qui se répétait à
 * l'identique sur chaque carte), la convergence des preuves, et les TROIS
 * actions (« Qualifier », « Vérifier aujourd'hui », « Ce n'est pas exact »).
 *
 * La carte garde le nom, le logo et l'état (les badges) — mot de Louis dans
 * l'issue : « la carte garde le nom, le logo et l'état ».
 */
function PartnerDetailModal({
  partner,
  partnerRelations,
  index,
  total,
  onIndexChange,
  onClose,
  onQualify,
  dismiss,
}: {
  partner: Landscape['partners'][number]
  /** #3404.5 — pour retrouver, quand `partner.partner_relation_id` en désigne
   *  une, le cadre déjà modélisé sur `partner_relations`. */
  partnerRelations: PartnerRelationView[]
  index: number
  total: number
  onIndexChange: (index: number) => void
  onClose: () => void
  /**
   * #1624 (16/09/2026) — LE CHEMIN D'ÉCRITURE DE « QUALIFIER », ET POURQUOI CE
   * N'EST PLUS `add`.
   *
   * Tant que `isObservedOnly` était structurellement faux ici, ce bouton
   * n'était jamais rendu et personne n'a vu qu'il appelait le MAUVAIS
   * endpoint : `add` fait un `POST /accounts/:id/partners`, que l'API refuse
   * par un **400 « Cette ESN est déjà déclarée sur ce compte »**
   * (`PartnersService.create`, contrôle `clash`) sur une ligne canonique — qui
   * est, par définition, déjà dans la liste. Réparer le prédicat sans réparer
   * l'appelant aurait livré un bouton qui échoue à chaque clic.
   *
   * Le geste juste sur une ligne DÉJÀ connue est la qualification
   * (`PATCH /accounts/partners/:id`, #2122.46) : ce rappel ouvre le formulaire
   * de rang/relation, le seul de l'écran — deux formulaires diraient la même
   * chose sous deux formes (loi 4 du tome 7).
   */
  onQualify: () => void
  dismiss: ReturnType<typeof useMutation<AccountPartner, Error, { id: string; reason: string }>>
}) {
  const { t } = useTranslation('partners')

  /**
   * #3270.6 (SURFACES) — LA GOUVERNANCE RANG 2, SUR LA FICHE COMPTE.
   *
   * `account_partners` (cette ESN en place chez CE compte) et `partner_relations`
   * (MA relation avec cette ESN, où vit le cadre de gouvernance #3270) restent
   * deux objets canoniques distincts (règle 4 de #3249) — pas de jointure SQL
   * entre eux. Le rapprochement se fait ICI, en lecture seule, par nom
   * (normalisé), le seul identifiant que les deux objets partagent — même
   * geste que `workspace_account_id` juste en dessous, qui rapproche déjà une
   * ESN observée d'un compte connu sans fondre les deux tables.
   */
  const { data: governanceRelations } = useQuery({
    queryKey: PARTNER_PIPELINE_KEY,
    queryFn: fetchPartnerRelations,
  })
  const governanceMatch = useMemo(() => {
    // Lien explicite (#3404.5) : le résumé de gouvernance dédié s'affiche plus bas — jamais deux fois.
    if (partner.partner_relation_id) return null
    if (!Array.isArray(governanceRelations)) return null
    const target = partner.name.trim().toLowerCase()
    return governanceRelations.find(relation => relation.name.trim().toLowerCase() === target) ?? null
  }, [governanceRelations, partner.name, partner.partner_relation_id])

  return (
    <BrowsableDialog
      open
      onOpenChange={open => {
        if (!open) onClose()
      }}
      index={index}
      total={total}
      onIndexChange={onIndexChange}
      contentKey={partner.id}
      title={partner.name}
      description={t('detail.dialogDescription')}
      labels={{ previous: t('detail.previousPartner'), next: t('detail.nextPartner') }}
      leading={
        <div data-testid="partner-modal-avatar">
          <CompanyAvatar name={partner.name} size="md" logoUrl={partner.logo_url} website={partner.website} />
        </div>
      }
    >
      <Box className="space-y-3 p-4">
        {/* Une ESN détectée ne s'affiche JAMAIS sans sa date (§21.5) : sans
            elle, une inférence de six mois se lit comme un fait du jour. Le
            périmètre, quand on l'a, dit sur QUOI elle est en place — c'est ce
            qui rend l'information actionnable. */}
        {(partner.detected_at || partner.scope) && (
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {[
              partner.scope,
              partner.detected_at ? t('detectedOn', { date: formatDate(new Date(partner.detected_at)) }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        )}

        {/* #2298.7 — QUI a déclaré cette relation, et QUAND. `created_at`
            porte déjà QUAND ; seule une ligne DÉCLARÉE (`source: 'declared'`)
            a quelqu'un à nommer — une ligne du pipeline n'a personne à citer.
            `declared_by_name` est `null` sur une ligne déclarée AVANT cette
            migration (la colonne n'existait sous aucun nom) : l'écran le dit
            au lieu d'inventer un nom ou de masquer la ligne. */}
        {partner.source === 'declared' && (
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {partner.declared_by_name
              ? t('declaredBy', { name: partner.declared_by_name, date: formatDate(new Date(partner.created_at)) })
              : t('declaredByUnknown', { date: formatDate(new Date(partner.created_at)) })}
          </Text>
        )}

        {/* #2151.42 / #2166.38 — LA RELATION WORKSPACE, l'action. Le badge de
            la ligne annonce le fait ; ce lien, ICI dans la modale (les CTA y
            ont déménagé, #1818.1), l'exploite. */}
        {partner.workspace_account_id && (
          <Link
            to="/accounts/$id"
            params={{ id: partner.workspace_account_id }}
            aria-label={t('workspaceRelation.linkAria', { name: partner.name })}
            className="inline-flex w-fit items-center text-xs text-[var(--bellum-text-accent)] hover:underline"
          >
            {t('workspaceRelation.link')}
          </Link>
        )}

        {/* #4987 — les contacts DÉJÀ connus de cette ESN de rang 2 (rien d'inventé, aucune collecte). */}
        <PartnerKnownContacts
          rank={partner.rank}
          name={partner.name}
          workspaceAccountId={partner.workspace_account_id}
        />

        {/* #3270.6 — le cadre de gouvernance rang 2 (`partner_relations`),
            quand cette ESN en porte un : jamais une ligne « pas de cadre »
            quand aucun ne correspond (GA-18/GA-19, « on n'affiche pas ce
            qu'on n'a pas »). */}
        {governanceMatch && (
          <Box className="flex flex-col gap-1.5">
            <Text size="xs" weight="semibold" color="text-[var(--bellum-text-primary)]">
              {t('detail.governanceSectionTitle')}
            </Text>
            <PartnerReadinessPanel
              status={governanceMatch.governanceStatus}
              readiness={governanceMatch.governanceReadiness}
            />
            <Link
              to="/accounts/partners"
              aria-label={t('detail.governanceLinkAria', { name: partner.name })}
              className="inline-flex w-fit items-center text-xs text-[var(--bellum-text-accent)] hover:underline"
            >
              {t('detail.governanceLink')}
            </Link>
          </Box>
        )}

        {/* #1818.3 — la note (angle concurrence + angle rang-2). Une seule
            fois, ICI, au clic — plus jamais répétée à l'identique sur chaque
            carte de la liste. */}
        {partner.note && (
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {partner.note}
          </Text>
        )}

        {/* #3205.4 (épopée #3239) — risque concurrentiel, complémentarité et
            prochaine vérification. Chacun ne fait AUCUNE ligne quand il n'a
            pas été renseigné (GA-18/GA-19) — jamais « non renseigné » écrit
            trois fois de suite quand rien n'a été qualifié. */}
        {partner.competitive_risk && (
          <Box display="flex" className="flex-col gap-0.5">
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('detail.competitiveRiskLabel')}
            </Text>
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {partner.competitive_risk}
            </Text>
          </Box>
        )}
        {partner.complementarity && (
          <Box display="flex" className="flex-col gap-0.5">
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('detail.complementarityLabel')}
            </Text>
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {partner.complementarity}
            </Text>
          </Box>
        )}
        {partner.next_verification_at && (
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('detail.nextVerificationLabel', { date: partner.next_verification_at.slice(0, 10) })}
          </Text>
        )}

        {/* #3404.5 — LE CADRE DE GOUVERNANCE, quand cette présence en désigne
            une (`qualifyForm.governanceLinkLabel` ci-dessus). Fait du rang 2
            un objet métier structuré : marge plancher, partage, propriétaires,
            délais, durée, sortie, interlocuteurs des deux côtés — et la clause
            de non-sollicitation, qui interdit toute approche directe. */}
        {partner.partner_relation_id &&
          (() => {
            const relation = partnerRelations.find(candidate => candidate.id === partner.partner_relation_id)
            return relation ? (
              <PartnerGovernanceSummary
                relation={relation}
                certainty={partner.certainty}
                accountId={partner.account_id}
              />
            ) : null
          })()}

        {/* #1624.4 — la phrase de convergence OU les deux valeurs qui
            divergent. Ça ne CHOISIT jamais entre les deux origines. */}
        <EvidenceAgreement
          origins={partner.evidence_origins ?? undefined}
          certainty={partner.certainty}
          marketObservationCount={partner.market_observation_count}
        />

        {/* #1624.5 — DEUX SORTIES POSITIVES, et chacune mène quelque part.
            « Qualifier » DÉCLARE la relation dans l'espace (le chemin
            d'écriture existant, celui du champ « Ajouter »), et « Vérifier
            aujourd'hui » ouvre l'écran d'analyse — le même lien que #1429 a
            livré sur le pipeline partenaires, qui annonce le coût AVANT de
            débiter. */}
        {isObservedOnly(partner) && (
          <Box display="flex" className="flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={t('cta.qualifyKnownAria', { name: partner.name })}
              onClick={() => {
                // #1624.10 — motif d'écran FIXE, jamais le nom de l'ESN ni
                // l'id du compte : voir le docbloc de `PARTNERS_SCREEN`.
                // L'action se COMPLÈTE à l'enregistrement du formulaire, comme
                // le bouton de la carte : ouvrir n'est pas encore écrire.
                trackActionStarted(QUALIFY_ACTION, PARTNERS_SCREEN)
                onQualify()
              }}
            >
              {t('cta.qualify')}
            </Button>
            <Link
              to="/search"
              search={{ company: partner.name }}
              aria-label={t('cta.verifyTodayAria', { name: partner.name })}
              className="inline-flex min-h-9 items-center rounded-full border border-[var(--bellum-border)] px-3 text-sm text-[var(--bellum-text-accent)] transition-colors hover:border-[var(--bellum-text-accent)] pointer-coarse:min-h-11"
              onClick={() => trackActionStarted(VERIFY_TODAY_ACTION, PARTNERS_SCREEN)}
            >
              {t('cta.verifyToday')}
            </Link>
          </Box>
        )}

        {partner.source === 'analysis' && (
          <Box display="flex" className="items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={dismiss.isPending}
              onClick={() => {
                const reason = window.prompt(t('dismiss.ask'))
                if (!reason?.trim()) return
                // #1624.10 — même motif d'écran FIXE que les deux CTA
                // positifs, et jamais le MOTIF tapé par l'utilisateur : le
                // traceur mesure qu'une correction a eu lieu, jamais ce
                // qu'elle dit (aucun contenu, doctrine c64).
                trackActionStarted(DISMISS_ACTION, PARTNERS_SCREEN)
                dismiss.mutate(
                  { id: partner.id, reason: reason.trim() },
                  {
                    onSuccess: () => {
                      trackActionCompleted(DISMISS_ACTION, PARTNERS_SCREEN)
                      onClose()
                    },
                    onError: () => trackActionAbandoned(DISMISS_ACTION, PARTNERS_SCREEN, 'error'),
                  },
                )
              }}
            >
              {t('dismiss.action')}
            </Button>
          </Box>
        )}
      </Box>
    </BrowsableDialog>
  )
}

/** #4016 L10 — la phrase des parcours d'une société observée : fourchette sous le seuil, compte exact au-delà. */
function pathsSentence(t: (key: string, options: Record<string, unknown>) => string, persons: number, name: string) {
  const range = esnObservedPathsRange(persons)
  if (range === null) return null
  return range.kind === 'range'
    ? t('observed.pathsSentenceRange', { range: range.label, name })
    : t('observed.pathsSentence', { count: range.count, name })
}
