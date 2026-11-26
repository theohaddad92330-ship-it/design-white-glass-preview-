import type {
  Account,
  Proof,
  ProofEvidenceField,
  ProofFieldsProposal,
  TechnoPrevalenceTier,
  Testimonial,
} from '@bellum/contracts'
import { TECHNO_PREVALENCE_TIERS, technicalCompatibilityObserved } from '@bellum/contracts'
import { Badge, Box, Button, Card, CardContent, EmptyState, Input, Text, Textarea } from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Award } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAccountMarketContext } from '@/features/accounts/hooks/useAccountMarketContext'
import { apiFetch } from '@/lib/api'
import { queryKeys } from '@/lib/api/query-keys'
import { formatDate } from '@/lib/locale'

type PendingRex = { mission_id: string; label: string; ended_on: string | null }
/**
 * #2124.34 — un retour de mission DÉJÀ recueilli.
 *
 * `mission_label` vaut `null` quand la mission citée n'est pas dans ce compte :
 * une donnée manquante, jamais un libellé de remplissage.
 */
type CollectedRex = {
  id: string
  mission_id: string
  mission_label: string | null
  summary: string
  what_worked: string | null
  what_failed: string | null
  collected_at: string
}
type Capitalisation = {
  delivered: { mission_id: string; label: string; status: string; started_on: string | null; ended_on: string | null }[]
  proofs: Proof[]
  pendingRex: PendingRex[]
  /**
   * #2124.34 — les retours déjà recueillis. `undefined` sur une API antérieure
   * au champ, jamais un tableau vide confondu avec « rien n'a été recueilli » :
   * un champ AJOUTÉ, jamais un champ dont la forme change pendant un
   * déploiement (le web se déploie dix minutes avant l'API).
   */
  collectedRex?: CollectedRex[]
  testimonials: Testimonial[]
  /**
   * #1638.2 — le palier de prévalence des technologies des preuves, calculé
   * PAR LE SERVEUR sur les quantiles du corpus. Cet écran ne connaît ni
   * fréquence ni seuil : il ne peut donc pas en inventer un.
   *
   * `undefined` sur une API antérieure au champ, ou quand la question n'a pas
   * pu être posée — un champ AJOUTÉ, jamais un champ dont la forme change.
   */
  techno_prevalence?: { techno: string; tier: TechnoPrevalenceTier }[]
}

/**
 * #1638.2 — les technologies d'UNE preuve, groupées par palier, dans l'ordre
 * des paliers (`TECHNO_PREVALENCE_TIERS` : du plus rare au plus répandu).
 *
 * ⚠️ Cet ordre est celui des LIGNES d'une preuve, jamais celui des PREUVES :
 * le retour interdit nommément un classement automatique, un savoir-faire rare
 * pouvant être plus pertinent qu'un savoir-faire ubiquitaire.
 *
 * Une technologie absente de `prevalence` n'apparaît nulle part : « inconnu »
 * n'est pas « courante ».
 */
function technologiesByTier(
  technologies: readonly string[] | undefined,
  prevalence: Capitalisation['techno_prevalence'],
): { tier: TechnoPrevalenceTier; technologies: string[] }[] {
  if (!technologies?.length || !prevalence?.length) return []
  const tierByTechno = new Map(prevalence.map(entry => [entry.techno, entry.tier]))
  return TECHNO_PREVALENCE_TIERS.map(tier => ({
    tier,
    technologies: technologies.filter(techno => tierByTechno.get(techno) === tier),
  })).filter(group => group.technologies.length > 0)
}

/**
 * L'onglet Preuves & REX d'un dossier de compte (PDF 2 §12).
 *
 * Quatre blocs, et les tenir séparés est le sujet : ce qu'on a LIVRÉ ici (des
 * faits), ce qu'on peut MONTRER (des preuves relues), ce qui ATTEND d'être
 * recueilli (des missions finies sans retour), et ce qu'un client a ACCEPTÉ de
 * dire.
 *
 * Chaque preuve porte visiblement sa PORTÉE. Une preuve interne se voit
 * d'emblée comme telle : c'est ce qui empêche quelqu'un de la recopier dans un
 * message sans y penser.
 */
export function TabProofs({ account }: { account: Account }) {
  const { t } = useTranslation('capitalisation')
  const qc = useQueryClient()
  const [claim, setClaim] = useState('')
  // #1612.1 / #1638.1 — saisie libre, virgule-séparée : la technologie d'une
  // preuve est déclarée par qui la capitalise, personne d'autre dans le
  // pipeline ne peut la deviner.
  const [technologiesInput, setTechnologiesInput] = useState('')
  // #2124.49 à .55 — la mission dont on regarde la proposition. `null` = aucune
  // proposition ouverte, et donc aucun appel : Laura ne travaille pas dans le
  // dos de l'utilisateur.
  const [proposingFor, setProposingFor] = useState<string | null>(null)

  // #1612.1 / #1638.1 — l'environnement technique OBSERVÉ du compte, pour le
  // rapprochement. Passe par la FAÇADE (GA-258) : cet onglet ne lit aucune
  // table de la mémoire marché lui-même.
  const observedStack = useAccountMarketContext(account.id, Boolean(account.id)).data?.observed_stack

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.accounts.capitalisation(account.id),
    queryFn: () => apiFetch<Capitalisation>({ path: `/capitalisation/accounts/${account.id}` }),
  })

  const addProof = useMutation<Proof, Error, { claim: string; technologies: string[] }>({
    mutationFn: body =>
      apiFetch<Proof, { claim: string; account_id: string; technologies?: string[] }>({
        path: '/capitalisation/proofs',
        method: 'POST',
        body: {
          claim: body.claim,
          account_id: account.id,
          // Un tableau vide n'est pas une déclaration : on n'envoie le champ
          // que si quelque chose a réellement été saisi.
          ...(body.technologies.length > 0 ? { technologies: body.technologies } : {}),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.accounts.capitalisation(account.id) })
      // Le message DIT que la preuve est interne : sans ça, quelqu'un la
      // chercherait dans un message et croirait à un bug.
      toast.success(t('proofs.added'))
    },
    onError: error => toast.error(t('proofs.addFailed'), { description: error.message }),
  })

  if (isLoading) {
    return (
      <Text size="sm" color="text-[var(--bellum-text-muted)]">
        {t('loading')}
      </Text>
    )
  }

  const capitalisation = data ?? { delivered: [], proofs: [], pendingRex: [], testimonials: [] }
  const collectedRex = capitalisation.collectedRex ?? []
  // #2124.48 — le libellé d'une mission, résolu UNE fois pour toutes les preuves.
  const missionLabels = new Map(
    capitalisation.delivered.filter(mission => mission.label).map(mission => [mission.mission_id, mission.label]),
  )
  const empty =
    capitalisation.delivered.length === 0 &&
    capitalisation.proofs.length === 0 &&
    capitalisation.testimonials.length === 0 &&
    collectedRex.length === 0

  if (empty) {
    return (
      <EmptyState
        size="md"
        align="center"
        icon={<Award className="h-10 w-10" />}
        // #2124.57 — le texte PRESCRIT, et il se lit en deux temps : le CONSTAT
        // (« je n'ai trouvé aucune mission ou preuve »), puis la CONSÉQUENCE
        // (« mes messages utiliseront uniquement les preuves générales de ton
        // ESN »). « Rien n'a été délivré ici. » disait le constat et laissait le
        // lecteur deviner ce que ça coûte — c'est la conséquence qui décide
        // s'il faut agir maintenant.
        title={t('empty.title')}
        description={t('empty.description')}
        action={<EmptyDoors />}
      />
    )
  }

  return (
    <Box className="space-y-4">
      <Block title={t('delivered.title')} hint={t('delivered.hint')}>
        {capitalisation.delivered.length === 0 ? (
          <Muted>{t('delivered.empty')}</Muted>
        ) : (
          capitalisation.delivered.map(mission => (
            <Box key={mission.mission_id} className="space-y-1">
              <Box display="flex" className="flex-wrap items-center gap-2">
                <Text size="sm">{mission.label || t('delivered.untitled')}</Text>
                <Badge variant="outline" className="px-1 py-0 text-xs">
                  {t(`missionStatus.${mission.status}`, { defaultValue: mission.status })}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setProposingFor(current => (current === mission.mission_id ? null : mission.mission_id))
                  }
                >
                  {t('evidence.propose')}
                </Button>
              </Box>
              {proposingFor === mission.mission_id && (
                <EvidenceProposal
                  accountId={account.id}
                  missionId={mission.mission_id}
                  onClose={() => setProposingFor(null)}
                />
              )}
            </Box>
          ))
        )}
      </Block>

      <Block title={t('proofs.title')} hint={t('proofs.hint')}>
        {capitalisation.proofs.length === 0 ? (
          <Muted>{t('proofs.empty')}</Muted>
        ) : (
          capitalisation.proofs.map(proof => {
            /**
             * #2124.48 — LA MISSION DERRIÈRE L'IDENTIFIANT.
             *
             * `mission_id` était persisté depuis le premier jour et n'était lu
             * par personne. Le libellé se résout dans la charge utile DÉJÀ
             * reçue (`delivered`) : aucune requête de plus, et un identifiant
             * ne s'affiche jamais — il n'apprend rien à personne.
             */
            const missionLabel = proof.mission_id ? missionLabels.get(proof.mission_id) : undefined
            // #1612.1 / #1638.1 — le rapprochement, PAS un score : un compte de
            // technologies communes, nommées. `unknown` (environnement non
            // connu) et `not_enough` (sous le seuil) ne s'affichent JAMAIS —
            // silence, jamais « incompatible ».
            const compatibility = technicalCompatibilityObserved(proof.technologies, observedStack)
            return (
              <Box key={proof.id} className="space-y-1">
                <Box display="flex" className="flex-wrap items-center gap-2">
                  <Text size="sm">{proof.claim}</Text>
                  <Badge variant="outline" className="px-1 py-0 text-xs">
                    {t(`strength.${proof.strength}`)}
                  </Badge>
                  {/* #2124.52 — L'AUTORISATION DE CITATION, NOMMÉE.
                      La portée est TOUJOURS affichée — une preuve interne qui ne
                      le dit pas finit recopiée dans un message. Elle le disait
                      sous un mot qui ne disait pas de quoi il s'agissait :
                      « Interne » se lit comme un rangement, « Citation non
                      validée » se lit comme un interdit à lever. Et JAMAIS
                      « citation interdite » : personne n'a refusé — personne
                      n'a vérifié, ce qui n'est pas la même chose. */}
                  <Badge variant="outline" className="px-1 py-0 text-xs">
                    {t(`scope.${proof.scope}`)}
                  </Badge>
                  {proof.technologies?.map(techno => (
                    <Badge key={techno} variant="outline" className="px-1 py-0 text-xs">
                      {techno}
                    </Badge>
                  ))}
                </Box>
                {/* #2124.48 / #2124.54 — D'OÙ ELLE VIENT, ET DE QUAND.
                    Une preuve sans date se lit comme intemporelle, et c'est la
                    faute la plus coûteuse chez un prospect : citer un résultat
                    de 2019 comme s'il datait d'hier. L'absence de rattachement
                    est NOMMÉE — un blanc se lirait comme un défaut d'affichage. */}
                <Text size="xs" color="text-[var(--bellum-text-muted)]" className="pl-1">
                  {missionLabel
                    ? t('proofs.mission', { label: missionLabel })
                    : (proof.detail ?? t('proofs.noContext'))}
                  {' · '}
                  {formatDate(new Date(proof.created_at), { dateStyle: 'medium' })}
                </Text>
                {/* #2124.49 à .55 — les champs de preuve. Une valeur absente
                    dit « non mesuré » : ni « 0 » (qui serait une mesure), ni un
                    tiret (qui se lit « rien à dire »). */}
                <EvidenceFields proof={proof} />
                {compatibility.kind === 'observed' && (
                  <Box display="flex" className="flex-wrap items-center gap-2 pl-1">
                    <Badge variant="outline" className="px-2 py-0.5 text-xs">
                      {t('proofs.technicalCompatibility.badge')}
                    </Badge>
                    <Text size="xs" color="text-[var(--bellum-text-muted)]">
                      {t('proofs.technicalCompatibility.detail', {
                        count: compatibility.shared.length,
                        technologies: compatibility.shared.join(', '),
                      })}
                    </Text>
                  </Box>
                )}
                {/* #1638.2 — le CONTEXTE de marché, APRÈS le rapprochement
                    ci-dessus, et l'ordre est le propos : celui-là parle de CE
                    compte (actionnable), celui-ci du RÉFÉRENTIEL. Un constat,
                    jamais un jugement de pertinence — et jamais un classement
                    des preuves, que le retour interdit nommément. */}
                {technologiesByTier(proof.technologies, capitalisation.techno_prevalence).map(group => (
                  <Text key={group.tier} size="xs" color="text-[var(--bellum-text-muted)]" className="pl-1">
                    {t(`proofs.prevalence.${group.tier}`, { technologies: group.technologies.join(', ') })}
                  </Text>
                ))}
              </Box>
            )
          })
        )}
        <Box display="flex" className="items-center gap-2 pt-1">
          <Input
            value={claim}
            maxLength={300}
            placeholder={t('proofs.placeholder')}
            onChange={event => setClaim(event.target.value)}
            className="max-w-md"
          />
          <Input
            value={technologiesInput}
            maxLength={200}
            placeholder={t('proofs.technologiesPlaceholder')}
            aria-label={t('proofs.technologiesInputLabel')}
            onChange={event => setTechnologiesInput(event.target.value)}
            className="max-w-xs"
          />
          <Button
            size="sm"
            disabled={claim.trim().length === 0 || addProof.isPending}
            onClick={() => {
              addProof.mutate({ claim: claim.trim(), technologies: parseTechnologies(technologiesInput) })
              setClaim('')
              setTechnologiesInput('')
            }}
          >
            {t('proofs.add')}
          </Button>
        </Box>
      </Block>

      <Block title={t('testimonials.title')} hint={t('testimonials.hint')}>
        {capitalisation.testimonials.length === 0 ? (
          <Muted>{t('testimonials.empty')}</Muted>
        ) : (
          capitalisation.testimonials.map(testimonial => (
            <Box key={testimonial.id} className="space-y-0.5">
              <Text size="sm">« {testimonial.quote} »</Text>
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {testimonial.author_name ?? t('testimonials.anonymous')}
                {testimonial.publishable ? ` — ${t('testimonials.publishable')}` : ` — ${t('testimonials.internal')}`}
              </Text>
            </Box>
          ))
        )}
      </Block>

      {/* #2124.47 / #2124.34 — INFORMATIONS TERRAIN.
          Ce que les consultants ont rapporté. Le bloc absorbe l'ancien « REX en
          attente » : deux blocs séparés faisaient deux listes du même objet, et
          une file d'attente SEULE se lit comme une liste de reproches.
          ⚠️ Le CONTENU du retour (`summary` / `what_worked` / `what_failed`)
          était lu en base à chaque ouverture du dossier et ne sortait d'aucune
          réponse — écrit, stocké, jamais montré. */}
      <Block title={t('fieldNotes.title')} hint={t('fieldNotes.hint')}>
        {collectedRex.length === 0 ? (
          <Muted>{t('fieldNotes.empty')}</Muted>
        ) : (
          collectedRex.map(entry => (
            <Box key={entry.id} className="space-y-0.5">
              <Box display="flex" className="flex-wrap items-baseline gap-2">
                <Text size="sm" weight="medium">
                  {entry.mission_label ?? t('fieldNotes.missionUnknown')}
                </Text>
                <Text size="xs" color="text-[var(--bellum-text-muted)]">
                  {t('fieldNotes.collectedOn', {
                    date: formatDate(new Date(entry.collected_at), { dateStyle: 'medium' }),
                  })}
                </Text>
              </Box>
              <Text size="sm">{entry.summary}</Text>
              {/* Ce qui n'a pas été écrit ne s'affiche pas. Une ligne « Ce qui a
                  marché : — » se lirait comme « rien n'a marché », ce qui est
                  une affirmation que personne n'a faite. */}
              {entry.what_worked ? (
                <Text size="xs" color="text-[var(--bellum-text-muted)]">
                  {t('fieldNotes.worked', { value: entry.what_worked })}
                </Text>
              ) : null}
              {entry.what_failed ? (
                <Text size="xs" color="text-[var(--bellum-text-muted)]">
                  {t('fieldNotes.failed', { value: entry.what_failed })}
                </Text>
              ) : null}
            </Box>
          ))
        )}

        {capitalisation.pendingRex.length > 0 ? (
          <Box className="space-y-0.5 pt-1">
            <Text size="xs" weight="medium" color="text-[var(--bellum-text-muted)]">
              {t('fieldNotes.pendingTitle')}
            </Text>
            {capitalisation.pendingRex.map(mission => (
              <Text key={mission.mission_id} size="sm">
                {mission.label || t('delivered.untitled')}
                {mission.ended_on ? ` — ${formatDate(new Date(mission.ended_on))}` : ''}
              </Text>
            ))}
          </Box>
        ) : null}
      </Block>
    </Box>
  )
}

/**
 * #2124.58 — LES CINQ PORTES DE L'ÉTAT VIDE.
 *
 * Chacune ouvre un écran qui EXISTE — un état vide qui propose un geste
 * impossible est pire que l'état vide nu. Ce sont des LIENS et non des boutons :
 * une porte se copie, s'ouvre dans un onglet, et se tabule sans qu'on ait à le
 * demander.
 *
 * « Chercher dans mon CRM » ouvre Réglages › Intégrations plutôt qu'une
 * recherche : sur un compte sans historique, la question n'est pas « quelle
 * requête ? » mais « quel outil est branché ? ». Et « Utiliser une référence
 * comparable » ouvre Découvrir, qui porte les comptes comparables — le seul
 * endroit du produit où cette question a une réponse.
 */
function EmptyDoors() {
  const { t } = useTranslation('capitalisation')
  const doors = [
    { to: '/settings/mes-donnees', search: { tab: 'imports' }, label: t('empty.actions.importMissions') },
    { to: '/integrations', label: t('empty.actions.searchCrm') },
    { to: '/missions/nouvelle', label: t('empty.actions.addMission') },
    { to: '/pilotage/rex', label: t('empty.actions.addRex') },
    { to: '/discover', label: t('empty.actions.comparable') },
  ] as const
  return (
    <Box display="flex" className="flex-wrap items-center justify-center gap-2">
      {doors.map(door => (
        <Link
          key={door.to}
          to={door.to}
          search={'search' in door ? door.search : undefined}
          className="inline-flex min-h-11 items-center rounded-md border border-[var(--bellum-border)] px-3 text-sm text-[var(--bellum-text-accent)] hover:bg-[var(--bellum-surface-2)]"
        >
          {door.label}
        </Link>
      ))}
    </Box>
  )
}

/**
 * #1612.1 / #1638.1 — la saisie libre virgule-séparée devient un tableau
 * propre : espaces retirés, entrées vides et doublons (insensibles à la
 * casse) écartés avant l'envoi.
 */
function parseTechnologies(input: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input.split(',')) {
    const value = raw.trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

function Block({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <Box>
          <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
            {title}
          </Text>
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {hint}
          </Text>
        </Box>
        {children}
      </CardContent>
    </Card>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <Text size="sm" color="text-[var(--bellum-text-muted)]">
      {children}
    </Text>
  )
}

/**
 * #2124.49 à .55 — ce qu'une preuve AFFICHE.
 *
 * Sept points du registre demandaient sept choses ; elles se lisent ensemble ou
 * pas du tout. Une preuve qui montre son résultat sans sa date est invérifiable,
 * et une preuve qui montre sa source sans dire si on peut la citer est un piège.
 *
 * ⚠️ Une valeur absente écrit « non mesuré ». Pas « 0 » — qui serait une mesure
 * fausse — et pas un tiret, qui se lit « rien à dire » alors qu'il veut dire
 * « personne n'a encore répondu ».
 */
function EvidenceFields({ proof }: { proof: Proof }) {
  const { t } = useTranslation('capitalisation')
  const expertise = proof.expertise?.filter(entry => entry.trim().length > 0) ?? []

  const citation =
    proof.citation_allowed === true
      ? t('evidence.citationAllowed')
      : proof.citation_allowed === false
        ? t('evidence.citationRefused')
        : t('evidence.citationUndecided')

  return (
    <Box className="space-y-0.5 pl-1">
      <EvidenceLine
        label={t('evidence.problem')}
        value={proof.problem ?? null}
        provenance={proof.field_provenance?.problem}
      />
      <EvidenceLine
        label={t('evidence.result')}
        value={proof.result ?? null}
        provenance={proof.field_provenance?.result}
      />
      <EvidenceLine
        label={t('evidence.expertise')}
        value={expertise.length > 0 ? expertise.join(', ') : null}
        provenance={proof.field_provenance?.expertise}
      />
      <EvidenceLine
        label={t('evidence.citation')}
        value={citation}
        provenance={proof.field_provenance?.citation_allowed}
      />
      <EvidenceLine
        label={t('evidence.source')}
        value={proof.source ? t(`source.${proof.source}`) : null}
        provenance={proof.field_provenance?.source}
      />
      <EvidenceLine label={t('evidence.date')} value={formatDate(new Date(proof.created_at))} />
      <EvidenceLine label={t('evidence.version', { version: proof.version ?? 1 })} value={null} hideUnknown />
    </Box>
  )
}

/** Une ligne « intitulé : valeur », et sa provenance quand elle en a une. */
function EvidenceLine({
  label,
  value,
  provenance,
  hideUnknown,
}: {
  label: string
  value: string | null
  provenance?: { origin: 'proposed' | 'human'; at: string; from: string | null }
  hideUnknown?: boolean
}) {
  const { t } = useTranslation('capitalisation')
  return (
    <Text size="xs" color="text-[var(--bellum-text-muted)]">
      {label}
      {hideUnknown ? '' : ` : ${value ?? t('unknownValue')}`}
      {provenance
        ? ` (${t(`evidence.provenance.${provenance.origin}`, { date: formatDate(new Date(provenance.at)) })})`
        : ''}
    </Text>
  )
}

const EVIDENCE_TEXT_FIELDS = ['claim', 'problem', 'result'] as const

type EvidenceDraft = { claim: string; problem: string; result: string; expertise: string }

/**
 * #2124.49 à .55 — LA PROPOSITION, et la validation qui l'écrit.
 *
 * Décision de Louis du 14/09/2026 : « Laura les propose, l'humain valide ».
 *
 * ⚠️ Ce composant ne demande la proposition QU'À L'OUVERTURE, et la proposition
 * est une lecture : tant que personne n'a cliqué « Valider », rien n'existe —
 * pas même un brouillon. C'est la doctrine du copilote rendue visible à
 * l'écran, et c'est ce que garde `TabProofs.evidence.test.tsx`.
 *
 * Les champs que l'utilisateur n'a PAS touchés partent en `kept_from_proposal` :
 * leur provenance garde alors l'enregistrement d'origine, au lieu de prétendre
 * qu'ils ont été tapés. Un champ corrigé, lui, est à lui — et aucune
 * proposition ultérieure ne le recouvrira.
 */
function EvidenceProposal({
  accountId,
  missionId,
  onClose,
}: {
  accountId: string
  missionId: string
  onClose: () => void
}) {
  const { t } = useTranslation('capitalisation')
  const qc = useQueryClient()
  const [edits, setEdits] = useState<Partial<EvidenceDraft>>({})
  const [citation, setCitation] = useState<boolean | null | undefined>(undefined)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['proof-proposal', missionId],
    queryFn: () =>
      apiFetch<{ mission: { mission_id: string }; proof_id: string | null; proposal: ProofFieldsProposal }>({
        path: `/capitalisation/missions/${missionId}/proof-proposal`,
      }),
  })

  const proposal = data?.proposal
  const proposed: EvidenceDraft = {
    claim: proposal?.claim?.value ?? '',
    problem: proposal?.problem?.value ?? '',
    result: proposal?.result?.value ?? '',
    expertise: (proposal?.expertise?.value ?? []).join(', '),
  }
  const value: EvidenceDraft = { ...proposed, ...edits }

  const validate = useMutation<Proof, Error, void>({
    mutationFn: () => {
      // Ce que l'utilisateur n'a pas touché ET que la proposition portait.
      const kept: ProofEvidenceField[] = []
      for (const field of EVIDENCE_TEXT_FIELDS) {
        if (edits[field] === undefined && proposed[field].length > 0) kept.push(field)
      }
      if (edits.expertise === undefined && proposed.expertise.length > 0) kept.push('expertise')
      if (proposal?.source) kept.push('source')

      const body = {
        problem: value.problem.trim() || null,
        result: value.result.trim() || null,
        expertise: parseTechnologies(value.expertise),
        ...(proposal?.source ? { source: proposal.source } : {}),
        // Jamais proposée : tant que personne n'a tranché, le champ n'est pas
        // envoyé — `null` par défaut vaut « personne n'a tranché », pas « non ».
        ...(citation === undefined ? {} : { citation_allowed: citation }),
        kept_from_proposal: kept,
      }

      return data?.proof_id
        ? apiFetch<Proof, typeof body & { claim: string }>({
            path: `/capitalisation/proofs/${data.proof_id}`,
            method: 'PATCH',
            body: { ...body, claim: value.claim.trim() },
          })
        : apiFetch<Proof, typeof body & { claim: string; account_id: string; mission_id: string }>({
            path: '/capitalisation/proofs',
            method: 'POST',
            body: { ...body, claim: value.claim.trim(), account_id: accountId, mission_id: missionId },
          })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.accounts.capitalisation(accountId) })
      toast.success(t('evidence.validated'))
      onClose()
    },
    onError: error => toast.error(t('evidence.validateFailed'), { description: error.message }),
  })

  if (isLoading) return <Muted>{t('evidence.loading')}</Muted>
  if (isError || !proposal) return <Muted>{t('evidence.failed')}</Muted>

  const nothing =
    proposed.claim.length === 0 &&
    proposed.problem.length === 0 &&
    proposed.result.length === 0 &&
    proposed.expertise.length === 0

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <Box>
          <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
            {t('evidence.title')}
          </Text>
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('evidence.hint')}
          </Text>
        </Box>

        {nothing && <Muted>{t('evidence.nothingToPropose')}</Muted>}

        <EvidenceInput
          label={t('evidence.claim')}
          value={value.claim}
          from={proposal.claim?.from}
          onChange={next => setEdits(current => ({ ...current, claim: next }))}
        />
        <EvidenceInput
          label={t('evidence.problem')}
          value={value.problem}
          from={proposal.problem?.from}
          multiline
          onChange={next => setEdits(current => ({ ...current, problem: next }))}
        />
        <EvidenceInput
          label={t('evidence.result')}
          value={value.result}
          from={proposal.result?.from}
          multiline
          onChange={next => setEdits(current => ({ ...current, result: next }))}
        />
        <EvidenceInput
          label={t('evidence.expertise')}
          value={value.expertise}
          from={proposal.expertise?.from}
          hint={t('evidence.expertiseHint')}
          onChange={next => setEdits(current => ({ ...current, expertise: next }))}
        />

        <Box className="space-y-1">
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('evidence.citation')} — {t('evidence.citationHint')}
          </Text>
          <Box display="flex" className="flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={citation === true ? 'default' : 'outline'}
              aria-pressed={citation === true}
              onClick={() => setCitation(true)}
            >
              {t('evidence.citationAllowed')}
            </Button>
            <Button
              size="sm"
              variant={citation === false ? 'default' : 'outline'}
              aria-pressed={citation === false}
              onClick={() => setCitation(false)}
            >
              {t('evidence.citationRefused')}
            </Button>
            <Button
              size="sm"
              variant={citation === null ? 'default' : 'outline'}
              aria-pressed={citation === null}
              onClick={() => setCitation(null)}
            >
              {t('evidence.citationUndecided')}
            </Button>
          </Box>
        </Box>

        <Box display="flex" className="items-center gap-2 pt-1">
          <Button
            size="sm"
            disabled={value.claim.trim().length === 0 || validate.isPending}
            onClick={() => validate.mutate()}
          >
            {t('evidence.validate')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('evidence.close')}
          </Button>
        </Box>
      </CardContent>
    </Card>
  )
}

/** Un champ proposé : sa valeur, et D'OÙ elle vient quand elle est proposée. */
function EvidenceInput({
  label,
  value,
  from,
  hint,
  multiline,
  onChange,
}: {
  label: string
  value: string
  from?: string
  hint?: string
  multiline?: boolean
  onChange: (next: string) => void
}) {
  const { t } = useTranslation('capitalisation')
  return (
    <Box className="space-y-0.5">
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {label}
        {hint ? ` — ${hint}` : ''}
      </Text>
      {multiline ? (
        <Textarea
          value={value}
          maxLength={1000}
          rows={2}
          aria-label={label}
          onChange={event => onChange(event.target.value)}
        />
      ) : (
        <Input value={value} maxLength={300} aria-label={label} onChange={event => onChange(event.target.value)} />
      )}
      {from && (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t(`evidence.proposedFrom.${from}`)}
        </Text>
      )}
    </Box>
  )
}
