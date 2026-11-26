import { Badge, Button, Card, Checkbox, Input, Text, Textarea } from '@bellum/ui'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  buildExternalSourcingPartnerBriefMessage,
  EXTERNAL_SOURCING_MAX_VOLUME_PER_SOURCE,
  EXTERNAL_SOURCING_MIN_VOLUME_PER_SOURCE,
  EXTERNAL_SOURCING_TIERS,
  EXTERNAL_SOURCING_SOURCE_LIMIT,
  type ExternalSourcingCandidate,
  type ExternalSourcingPartnerBrief,
} from '@bellum/contracts'
import {
  useExternalSourcingPartnerBriefs,
  useExternalSourcingPreparePartnerBrief,
  useExternalSourcingRecordPartnerBriefFeedback,
  useExternalSourcingSearch,
  useImportExternalSourcingCandidate,
} from '../hooks/useExternalSourcing'

/**
 * #2818 — « CHERCHER HORS VIVIER », depuis un besoin.
 *
 * Voir le docblock de `external-sourcing.ts` (`@bellum/contracts`) pour la
 * décision produit complète : trois sources déjà branchées de l'espace
 * (banc partenaire, candidature entrante, import CSV/ATS non relu), jamais un
 * scraping. `data.notConnected` nomme les catégories dont le contrat n'est pas
 * vérifiable — l'écran le DIT (« Branchez une source »), jamais un silence.
 *
 * ⚠️ Un CLIC déclenche la recherche (`triggered`), contrairement à
 * {@link NeedReverseProspects} qui se charge seule : « chercher » est un geste,
 * pas une lecture passive de l'onglet.
 *
 * ⚠️ L'IMPORT n'est jamais automatique (doctrine : « un profil externe …
 * n'entre jamais automatiquement dans le Vivier ») : chaque ligne exige la
 * case de consentement cochée AVANT le bouton de confirmation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LOT T4 (#2818) — CE QUE CE FICHIER AJOUTE AU SOCLE DU LOT n3
 * ─────────────────────────────────────────────────────────────────────────────
 *  - AVANT LANCEMENT (besoin/critères/sources/coût/volume/délai/consentement/
 *    dédup) — affiché AVANT le clic, jamais deviné après coup.
 *  - CONNECTEURS ABSENTS : jamais « Rechercher sur LinkedIn ». Trois voies
 *    réelles à la place — « préparer une requête Sales Navigator » (texte
 *    composé et copié, AUCUN appel serveur), « importer les résultats »
 *    (réutilise la TROISIÈME PORTE déjà réelle — {@link NeedConsultantDoor} —
 *    via `onImportResult`, jamais une seconde porte), « partager le brief à un
 *    partenaire » (le brief se PRÉPARE, il ne s'envoie jamais — doctrine).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SUITE DU LOT T4 (28/09, #2190.12) — LE VOLUME DEVIENT RÉGLABLE
 * ─────────────────────────────────────────────────────────────────────────────
 * AVANT LANCEMENT affichait déjà le volume maximal, mais c'était un plafond
 * FIXE (`EXTERNAL_SOURCING_SOURCE_LIMIT`) — pas encore un formulaire éditable.
 * `délai`, lui, RESTE non réglable (tranché sans Louis au lot T4) : c'est le
 * temps de réponse d'une lecture interne synchrone, pas un SLA fournisseur —
 * il n'existe rien qu'un réglage utilisateur changerait.
 */
export function NeedExternalSourcing({
  needId,
  needTitle,
  skillTerms,
  headcount,
  onImportResult,
}: {
  needId: string
  needTitle: string
  skillTerms: readonly string[]
  headcount: number
  /** Ouvre la TROISIÈME PORTE déjà réelle du besoin (`NeedConsultantDoor`) —
   *  « importer les résultats » n'est pas une seconde porte, c'est la même. */
  onImportResult: () => void
}) {
  const { t } = useTranslation('projects')
  const [triggered, setTriggered] = useState(false)
  const [volume, setVolume] = useState(EXTERNAL_SOURCING_SOURCE_LIMIT)
  const { data, isPending, isError } = useExternalSourcingSearch(needId, triggered, volume)

  return (
    <Card className="p-4" data-testid="need-external-sourcing">
      <Header />

      {!triggered ? (
        <>
          <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('needExternalSourcing.subtitle')}
          </Text>
          <PreLaunchPanel needTitle={needTitle} skillTerms={skillTerms} volume={volume} onVolumeChange={setVolume} />
          <Button size="sm" className="mt-2 pointer-coarse:min-h-11" onClick={() => setTriggered(true)}>
            {t('needExternalSourcing.launch')}
          </Button>
        </>
      ) : isPending ? (
        <Text size="sm" className="mt-1 text-[var(--bellum-text-muted)]">
          {t('needExternalSourcing.loading')}
        </Text>
      ) : isError || !data ? null : data.unavailableReason ? (
        <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
          {t(`needExternalSourcing.unavailable.${data.unavailableReason}`)}
        </Text>
      ) : (
        <>
          {data.notConnected.length > 0 ? (
            <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
              {t('needExternalSourcing.notConnected')}
            </Text>
          ) : null}
          {data.unanswered.length > 0 ? (
            <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
              {t('needExternalSourcing.unanswered')}
            </Text>
          ) : null}
          {data.candidates.length === 0 ? (
            <Text size="sm" className="mt-2 text-[var(--bellum-text-secondary)]">
              {t('needExternalSourcing.empty')}
            </Text>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--bellum-border)]">
              {data.candidates.map(candidate => (
                <CandidateRow key={candidate.id} needId={needId} candidate={candidate} />
              ))}
            </ul>
          )}
        </>
      )}

      <OtherPaths skillTerms={skillTerms} onImportResult={onImportResult} />
      <PartnerBriefPanel needId={needId} needTitle={needTitle} skillTerms={skillTerms} headcount={headcount} />
    </Card>
  )
}

function Header() {
  const { t } = useTranslation('projects')
  return (
    <div className="flex items-center gap-2">
      <Search className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
      <Text element="h3" size="sm" weight="semibold">
        {t('needExternalSourcing.title')}
      </Text>
    </div>
  )
}

/**
 * AVANT LANCEMENT (#2818) — chaque ligne existe déjà (le besoin, ses
 * compétences, les trois sources branchées, le réglage partagé
 * `EXTERNAL_SOURCING_SOURCE_LIMIT`) : rien n'est deviné pour remplir ce
 * panneau.
 *
 * #2190.12 (28/09) — le volume n'est plus qu'AFFICHÉ, il est RÉGLABLE : un
 * champ numérique borné aux limites publiées (`EXTERNAL_SOURCING_MIN/MAX
 * _VOLUME_PER_SOURCE`), jamais un plafond deviné côté écran — le service
 * borne à nouveau côté serveur (défense en profondeur).
 */
function PreLaunchPanel({
  needTitle,
  skillTerms,
  volume,
  onVolumeChange,
}: {
  needTitle: string
  skillTerms: readonly string[]
  volume: number
  onVolumeChange: (value: number) => void
}) {
  const { t } = useTranslation('projects')

  // Pendant la frappe, la valeur voyage TELLE QUELLE (« 1 » puis « 10 » doit
  // pouvoir s'écrire sans être ramenée à 5 après le premier chiffre) — seul
  // `handleVolumeBlur` borne, une fois la saisie terminée.
  function handleVolumeChange(raw: string) {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    onVolumeChange(parsed)
  }

  function handleVolumeBlur() {
    onVolumeChange(
      Math.min(
        EXTERNAL_SOURCING_MAX_VOLUME_PER_SOURCE,
        Math.max(EXTERNAL_SOURCING_MIN_VOLUME_PER_SOURCE, Math.trunc(volume)),
      ),
    )
  }

  return (
    <dl
      className="mt-3 space-y-1 rounded-md border border-[var(--bellum-border)] p-3"
      data-testid="external-sourcing-pre-launch"
    >
      <Text size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
        {t('needExternalSourcing.preLaunch.title')}
      </Text>
      <Row>{t('needExternalSourcing.preLaunch.need', { title: needTitle })}</Row>
      <Row>
        {skillTerms.length > 0
          ? t('needExternalSourcing.preLaunch.criteria', { skills: skillTerms.join(' · ') })
          : t('needExternalSourcing.preLaunch.criteriaEmpty')}
      </Row>
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('needExternalSourcing.preLaunch.tiersTitle')}
      </Text>
      <ol className="list-decimal space-y-0.5 pl-5">
        {EXTERNAL_SOURCING_TIERS.map(tier => (
          <li
            key={tier.key}
            data-testid={`external-sourcing-tier-${tier.key}`}
            className="text-xs text-[var(--bellum-text-muted)]"
          >
            {t(`needExternalSourcing.tier.${tier.key}`)}
          </li>
        ))}
      </ol>
      <Row>{t('needExternalSourcing.preLaunch.cost')}</Row>
      <Row>{t('needExternalSourcing.preLaunch.volume', { limit: volume })}</Row>
      <label className="flex items-center gap-1.5 text-xs text-[var(--bellum-text-muted)]">
        {t('needExternalSourcing.preLaunch.volumeInputLabel', {
          min: EXTERNAL_SOURCING_MIN_VOLUME_PER_SOURCE,
          max: EXTERNAL_SOURCING_MAX_VOLUME_PER_SOURCE,
        })}
        <Input
          type="number"
          inputMode="numeric"
          min={EXTERNAL_SOURCING_MIN_VOLUME_PER_SOURCE}
          max={EXTERNAL_SOURCING_MAX_VOLUME_PER_SOURCE}
          value={volume}
          onChange={event => handleVolumeChange(event.target.value)}
          onBlur={handleVolumeBlur}
          className="h-7 w-20 pointer-coarse:min-h-11"
        />
      </label>
      <Row>{t('needExternalSourcing.preLaunch.delay')}</Row>
      <Row>{t('needExternalSourcing.preLaunch.consent')}</Row>
      <Row>{t('needExternalSourcing.preLaunch.dedup')}</Row>
    </dl>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <Text size="xs" className="text-[var(--bellum-text-muted)]">
      {children}
    </Text>
  )
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * CONNECTEURS ABSENTS (#2818) — jamais « Rechercher sur LinkedIn ». Les trois
 * voies proposées à la place, aucune n'appelle une plateforme non branchée.
 */
function OtherPaths({ skillTerms, onImportResult }: { skillTerms: readonly string[]; onImportResult: () => void }) {
  const { t } = useTranslation('projects')
  const [preparingQuery, setPreparingQuery] = useState(false)
  const query = skillTerms.length > 0 ? skillTerms.join(' AND ') : t('needExternalSourcing.preLaunch.criteriaEmpty')

  return (
    <div className="mt-3 border-t border-[var(--bellum-border)] pt-3">
      <Text size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
        {t('needExternalSourcing.actions.title')}
      </Text>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="pointer-coarse:min-h-11"
          onClick={() => setPreparingQuery(value => !value)}
        >
          {t('needExternalSourcing.actions.prepareSalesNavigator')}
        </Button>
        <Button size="sm" variant="outline" className="pointer-coarse:min-h-11" onClick={onImportResult}>
          {t('needExternalSourcing.actions.importResults')}
        </Button>
      </div>
      {preparingQuery ? (
        <div className="mt-2 rounded-md border border-[var(--bellum-border)] p-2" data-testid="sales-navigator-query">
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('needExternalSourcing.actions.salesNavigatorHint')}
          </Text>
          <Text size="xs" className="mt-1 font-mono text-[var(--bellum-text-primary)]">
            {query}
          </Text>
          <Button
            size="sm"
            variant="ghost"
            className="mt-1 pointer-coarse:min-h-11"
            onClick={() =>
              copyToClipboard(query).then(copied => {
                if (copied) toast.success(t('needExternalSourcing.actions.queryCopied'))
              })
            }
          >
            {t('needExternalSourcing.actions.copyQuery')}
          </Button>
        </div>
      ) : null}
      <Text size="xs" className="mt-1.5 text-[var(--bellum-text-muted)]">
        {t('needExternalSourcing.actions.importResultsHint')}
      </Text>
    </div>
  )
}

function CandidateRow({ needId, candidate }: { needId: string; candidate: ExternalSourcingCandidate }) {
  const { t } = useTranslation('projects')
  const [consent, setConsent] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const importCandidate = useImportExternalSourcingCandidate(needId)
  // Une fiche de l'annuaire est CRÉÉE à ce geste : son identifiant de retour
  // n'est pas celui du candidat — le succès de CE geste suffit.
  const imported = importCandidate.isSuccess

  return (
    <li className="py-2 first:pt-0 last:pb-0" data-testid={`external-sourcing-candidate-${candidate.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text size="sm" weight="medium">
          {candidate.fullName ?? t('needExternalSourcing.unnamed')}
        </Text>
        <Badge variant="outline">{t(`needExternalSourcing.source.${candidate.sourceKind}`)}</Badge>
      </div>
      {candidate.title ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {candidate.title}
        </Text>
      ) : null}
      {/* Doctrine : JAMAIS un score — les compétences PARTAGÉES, nommées. */}
      <Text size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
        {t('needExternalSourcing.sharedSkill', {
          count: candidate.sharedSkills.length,
          skills: candidate.sharedSkills.join(' · '),
        })}
      </Text>
      {candidate.limits.map(limit => (
        <Text key={limit} size="xs" className="text-[var(--bellum-text-muted)]">
          {t(`needExternalSourcing.limit.${limit}`)}
        </Text>
      ))}
      {/* RÉSULTATS (#2818) — chaque profil externe porte son statut de
          consentement et son coût, jamais seulement une action. */}
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('needExternalSourcing.consentStatus.notCollected')}
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('needExternalSourcing.cost')}
      </Text>

      {imported ? (
        <Text size="xs" className="mt-1.5 text-[var(--bellum-text-accent)]">
          {t('needExternalSourcing.imported')}
        </Text>
      ) : confirming ? (
        <div className="mt-2 flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-xs text-[var(--bellum-text-secondary)]">
            <Checkbox checked={consent} onCheckedChange={value => setConsent(value === true)} />
            {t('needExternalSourcing.consent')}
          </label>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="pointer-coarse:min-h-11"
              disabled={!consent || importCandidate.isPending}
              onClick={() =>
                importCandidate
                  .mutateAsync(
                    candidate.sourceKind === 'external_directory'
                      ? {
                          sourceKind: 'external_directory',
                          externalProfile: {
                            ref: candidate.id,
                            fullName: candidate.fullName ?? t('needExternalSourcing.unnamed'),
                            title: candidate.title,
                            skills: candidate.sharedSkills,
                          },
                        }
                      : { consultantId: candidate.id, sourceKind: candidate.sourceKind },
                  )
                  .then(() => toast.success(t('needExternalSourcing.importSuccess')))
                  .catch((error: Error) => toast.error(error.message || t('needExternalSourcing.importFailed')))
              }
            >
              {t('needExternalSourcing.confirmImport')}
            </Button>
            <Button size="sm" variant="ghost" className="pointer-coarse:min-h-11" onClick={() => setConfirming(false)}>
              {t('needExternalSourcing.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="mt-2 pointer-coarse:min-h-11"
          onClick={() => setConfirming(true)}
        >
          {t('needExternalSourcing.import')}
        </Button>
      )}
    </li>
  )
}

/**
 * PARTENAIRES (#2818) — le brief se PRÉPARE, il ne s'envoie jamais. Un texte
 * composé depuis le besoin réel, `partnerName` un texte libre (comme
 * `consultants.source` : aucun répertoire de partenaires n'existe dans le
 * produit — voir le docblock de `external-sourcing.ts`).
 */
function PartnerBriefPanel({
  needId,
  needTitle,
  skillTerms,
  headcount,
}: {
  needId: string
  needTitle: string
  skillTerms: readonly string[]
  headcount: number
}) {
  const { t } = useTranslation('projects')
  const [open, setOpen] = useState(false)
  const [partnerName, setPartnerName] = useState('')
  const [conditions, setConditions] = useState('')
  const [delay, setDelay] = useState('')
  const briefs = useExternalSourcingPartnerBriefs(needId)
  const prepare = useExternalSourcingPreparePartnerBrief(needId)

  return (
    <div className="mt-3 border-t border-[var(--bellum-border)] pt-3" data-testid="external-sourcing-partner-brief">
      {!open ? (
        <Button size="sm" variant="outline" className="pointer-coarse:min-h-11" onClick={() => setOpen(true)}>
          {t('needExternalSourcing.actions.shareBrief')}
        </Button>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Text size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
            {t('needExternalSourcing.partnerBrief.title')}
          </Text>
          <label className="flex flex-col gap-0.5 text-xs text-[var(--bellum-text-secondary)]">
            {t('needExternalSourcing.partnerBrief.partnerNameLabel')}
            <Input value={partnerName} onChange={event => setPartnerName(event.target.value)} />
          </label>
          <label className="flex flex-col gap-0.5 text-xs text-[var(--bellum-text-secondary)]">
            {t('needExternalSourcing.partnerBrief.conditionsLabel')}
            <Textarea value={conditions} onChange={event => setConditions(event.target.value)} />
          </label>
          <label className="flex flex-col gap-0.5 text-xs text-[var(--bellum-text-secondary)]">
            {t('needExternalSourcing.partnerBrief.delayLabel')}
            <Input value={delay} onChange={event => setDelay(event.target.value)} />
          </label>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="pointer-coarse:min-h-11"
              disabled={partnerName.trim().length === 0 || prepare.isPending}
              onClick={() =>
                prepare
                  .mutateAsync({
                    partnerName: partnerName.trim(),
                    conditions: conditions.trim().length > 0 ? conditions.trim() : undefined,
                    delay: delay.trim().length > 0 ? delay.trim() : undefined,
                  })
                  .then(() => {
                    setPartnerName('')
                    setConditions('')
                    setDelay('')
                    setOpen(false)
                  })
                  .catch((error: Error) =>
                    toast.error(error.message || t('needExternalSourcing.partnerBrief.prepareFailed')),
                  )
              }
            >
              {t('needExternalSourcing.partnerBrief.prepare')}
            </Button>
            <Button size="sm" variant="ghost" className="pointer-coarse:min-h-11" onClick={() => setOpen(false)}>
              {t('needExternalSourcing.partnerBrief.cancel')}
            </Button>
          </div>
        </div>
      )}

      {(briefs.data ?? []).map(brief => (
        <PreparedBrief key={brief.id} needId={needId} brief={brief} />
      ))}

      {/* Aperçu du texte tel qu'il serait composé — avant même de préparer un
          premier brief, le commercial sait ce qui partirait. */}
      {!open && (briefs.data ?? []).length === 0 ? (
        <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
          {buildExternalSourcingPartnerBriefMessage({ needTitle, skillTerms: [...skillTerms], headcount }).split(
            '\n',
          )[0] ?? ''}
        </Text>
      ) : null}
    </div>
  )
}

function PreparedBrief({ needId, brief }: { needId: string; brief: ExternalSourcingPartnerBrief }) {
  const { t } = useTranslation('projects')
  const [feedback, setFeedback] = useState('')
  const recordFeedback = useExternalSourcingRecordPartnerBriefFeedback(needId)

  return (
    <div className="mt-2 rounded-md border border-[var(--bellum-border)] p-2" data-testid={`partner-brief-${brief.id}`}>
      <Text size="xs" weight="medium">
        {brief.partnerName}
      </Text>
      <Text size="xs" className="mt-1 whitespace-pre-line text-[var(--bellum-text-secondary)]">
        {brief.message}
      </Text>
      <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
        {t('needExternalSourcing.partnerBrief.nonSolicitation')}
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('needExternalSourcing.partnerBrief.preparedHint')}
      </Text>
      <Button
        size="sm"
        variant="ghost"
        className="mt-1 pointer-coarse:min-h-11"
        onClick={() =>
          copyToClipboard(brief.message).then(copied => {
            if (copied) toast.success(t('needExternalSourcing.partnerBrief.briefCopied'))
          })
        }
      >
        {t('needExternalSourcing.partnerBrief.copyBrief')}
      </Button>

      {brief.feedback ? (
        <Text size="xs" className="mt-1.5 text-[var(--bellum-text-accent)]">
          {t('needExternalSourcing.partnerBrief.feedbackRecorded', {
            date: brief.feedbackRecordedAt ?? brief.preparedAt,
          })}
        </Text>
      ) : (
        <div className="mt-1.5 flex flex-col gap-1">
          <label className="flex flex-col gap-0.5 text-xs text-[var(--bellum-text-secondary)]">
            {t('needExternalSourcing.partnerBrief.feedbackLabel')}
            <Textarea value={feedback} onChange={event => setFeedback(event.target.value)} />
          </label>
          <Button
            size="sm"
            variant="outline"
            className="w-fit pointer-coarse:min-h-11"
            disabled={feedback.trim().length === 0 || recordFeedback.isPending}
            onClick={() =>
              recordFeedback
                .mutateAsync({ briefId: brief.id, feedback: feedback.trim() })
                .then(() => setFeedback(''))
                .catch((error: Error) =>
                  toast.error(error.message || t('needExternalSourcing.partnerBrief.feedbackFailed')),
                )
            }
          >
            {t('needExternalSourcing.partnerBrief.recordFeedback')}
          </Button>
        </div>
      )}
    </div>
  )
}
