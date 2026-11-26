import { Badge, Button, Card, Input, Text } from '@bellum/ui'
import { Check, Pencil, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CV_LOW_CONFIDENCE, type CvDetection, type CvFieldDecision, type ParsedField } from '@bellum/contracts'
import { useCommitCvParse, useParseCv } from '../../hooks'
import { cvMentionsSkills } from './cv-skills-partial'

type Decision = { decision: CvFieldDecision; value: string }

/**
 * L'écran de revue d'un CV parsé (PDF 3 §4.2, ticket BEL-ATS-201).
 *
 * Deux colonnes : le CV à gauche, les champs lus à droite. Survoler un champ
 * SURLIGNE le passage qui le porte — c'est ce qui rend la revue rapide, et
 * c'est aussi ce qui la rend auditable : « d'où vient cette compétence ? » a
 * une réponse visible.
 *
 * Trois règles d'affichage, chacune contre une lecture fausse :
 *
 *  - un champ NON TROUVÉ dit « non trouvé dans le CV », il n'apparaît pas comme
 *    une case vide qu'on prendrait pour un oubli ;
 *  - un champ décisif incertain reste SIGNALÉ (texte, sous le titre), jamais
 *    silencieux — le calcul vient du contrat partagé, pas d'une règle réécrite
 *    ici ;
 *  - rien n'est écrit tant qu'on n'a pas validé. Le bouton le dit.
 *
 * #1789 — UN SEUL bouton, « Valider et qualifier la fiche » : il accepte tout
 * champ qui n'a pas été touché, garde tel quel tout champ CORRIGÉ ou REJETÉ à
 * la main, et qualifie la fiche, en un clic. Il y avait un second bouton,
 * « Tout accepter » : il n'ajoutait rien à ce que « Valider » fait déjà tout
 * seul (`decisionFor` retombe sur `accept` par défaut), et il EFFAÇAIT en plus
 * toute correction déjà saisie (`setDecisions({})` remettait tout à zéro) —
 * exactement l'inverse de « une correction humaine gagne toujours ». Le
 * chemin précis (accepter / corriger / rejeter CHAQUE champ) reste sous
 * chaque ligne : ce bouton unique évite d'en faire un PRÉALABLE pour le cas
 * simple, il ne le remplace pas.
 */
export function CvReviewPanel({
  talentId,
  cvText,
  onDone,
  onPlace,
}: {
  talentId: string
  /**
   * #1780 — LE TEXTE DU CV, DÉJÀ CHARGÉ PAR LA FICHE.
   *
   * Il vient de `consultants.cv_text`, que l'écran a en main dès l'ouverture.
   * Le passer plutôt que le relire évite un second appel pour une donnée déjà
   * présente — et surtout, il rend le CV lisible AVANT que le modèle ait fini,
   * ce qui était le geste empêché : un client a importé un CV, ouvert la fiche,
   * et n'a trouvé que « Je lis le CV… ».
   *
   * `null` = aucun texte connu ; l'écran ne prétend alors rien montrer.
   */
  cvText: string | null
  onDone: () => void
  /** #2551 — ouvre « Où placer ce profil ? » (comptes + interlocuteurs) après validation. */
  onPlace?: () => void
}) {
  const { t, i18n } = useTranslation('consultants')
  const { data: proposal, isLoading, isError, error, refetch } = useParseCv(talentId)
  const commit = useCommitCvParse(talentId)
  const [decisions, setDecisions] = useState<Partial<Record<CvDetection, Decision>>>({})
  const [hovered, setHovered] = useState<CvDetection | null>(null)
  // #3811.4 — compétences saisies à la main quand la lecture n'en a reconnu aucune.
  const [manualSkills, setManualSkills] = useState('')

  const highlighted = useMemo(() => {
    if (!proposal) return null
    const field = proposal.fields.find(entry => entry.detection === hovered)
    if (!field || field.excerptOffset === null || !field.sourceExcerpt) return null
    return { start: field.excerptOffset, end: field.excerptOffset + field.sourceExcerpt.length }
  }, [proposal, hovered])

  // #1780 — LIRE LE CV NE DÉPEND PAS DE LA LECTURE AUTOMATIQUE.
  //
  // La lecture par le modèle propose des champs ; elle ne conditionne pas le
  // droit de regarder le document. Tant qu'elle tourne — et même quand elle
  // échoue — la source reste à l'écran : c'est ce que la personne était venue
  // voir, et c'est la seule partie qui ne peut pas manquer.
  if (isLoading || isError || !proposal) {
    return (
      <div className="flex flex-col gap-3 lg:flex-row">
        <CvSource text={cvText} />
        <Card className="min-w-0 flex-1 p-4">
          <Text
            size="sm"
            className={isLoading ? 'text-[var(--bellum-text-muted)]' : undefined}
            role={isError ? 'alert' : undefined}
          >
            {isLoading ? t('parse.loading') : (error as Error | undefined)?.message || t('parse.failed')}
          </Text>
          {/* #2542.2 — l'issue exige, sur un document jamais traité, « un
              moyen de réessayer » : un GESTE humain, jamais une reprise
              automatique (même doctrine que « un timeout n'est pas un échec :
              `unknown` arrête la reprise »).
              #2184.24 — DÉJÀ LÀ : c'est ce bouton qui relance le parsing. */}
          {isError ? (
            <Button size="xs" variant="outline" className="mt-2" onClick={() => refetch()}>
              {t('parse.retry')}
            </Button>
          ) : null}
        </Card>
      </div>
    )
  }

  const decisionFor = (field: ParsedField): Decision =>
    decisions[field.detection] ?? { decision: 'accept', value: renderValue(field.value) }

  const setDecision = (detection: CvDetection, next: Decision) =>
    setDecisions(previous => ({ ...previous, [detection]: next }))

  // #3811.4 — le texte cite des compétences, la lecture n'en a gardé AUCUNE.
  const skillsUnread =
    proposal.fields.some(field => field.detection === 'skills' && field.value === null) &&
    cvMentionsSkills(proposal.cvText ?? cvText)

  // #3811 — « 0 compétence extraite » se DIT : un bloc compétences vide sur un
  // CV lu n'est pas un défaut d'affichage, c'est souvent un export illisible.
  const skillsField = proposal.fields.find(entry => entry.detection === 'skills')
  const noSkills =
    !skillsField || skillsField.value === null || (Array.isArray(skillsField.value) && skillsField.value.length === 0)

  const submit = () => {
    const fields = proposal.fields
      .filter(field => field.value !== null)
      .map(field => {
        const chosen = decisionFor(field)
        return {
          detection: field.detection,
          decision: chosen.decision,
          value: chosen.decision === 'reject' ? null : parseValue(field, chosen.value),
        }
      })
    // #3811.4 — la correction manuelle part dans le MÊME commit, comme une
    // correction humaine (elle gagne toujours) : aucune réextraction.
    const typed = manualSkills
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
    if (skillsUnread && typed.length > 0) fields.push({ detection: 'skills', decision: 'correct', value: typed })
    commit
      .mutateAsync({ fields })
      .then(() => {
        // #2551 — « où le placer, qui appeler » : un geste, jamais une décision.
        toast.success(
          t('parse.committed'),
          onPlace ? { action: { label: t('parse.placeCta'), onClick: onPlace } } : undefined,
        )
        if (noSkills) toast.warning(t('parse.noSkills'))
        onDone()
      })
      .catch((mutationError: Error) => toast.error(mutationError.message || t('parse.failed')))
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <CvSource text={proposal.cvText} highlighted={highlighted} />

      <Card className="min-w-0 flex-1 p-4">
        {/* #2542.3 — la lecture SOURCE était partielle (#1954.16/.30, une page
            sans calque texte) : un champ « non trouvé » plus bas n'est pas
            confirmé absent du CV. « non mesuré n'est jamais 0 » (GA-18/GA-19).
            #2184.33 — DÉJÀ LÀ : c'est ce bandeau qui affiche un résultat OCR
            moins fiable. */}
        {proposal.partial ? (
          <Text size="xs" className="mb-2 text-[var(--warning-soft-text)]">
            {t('parse.partial')}
          </Text>
        ) : null}
        {noSkills && !skillsUnread ? (
          <Text size="xs" className="mb-2 text-[var(--warning-soft-text)]">
            {t('parse.noSkills')}
          </Text>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text size="sm" weight="semibold">
            {t('parse.fieldsTitle')}
          </Text>
          <div className="flex items-center gap-1.5">
            {/* #1789 — un seul bouton : accepte tout champ non touché, garde
                les corrections/rejets déjà saisis, et qualifie la fiche. */}
            <Button size="xs" disabled={commit.isPending} onClick={submit}>
              {commit.isPending ? t('parse.committing') : t('parse.commit')}
            </Button>
          </div>
        </div>
        {skillsUnread ? (
          <div role="status" className="mt-2 flex flex-col gap-1.5">
            <Text size="xs" className="text-[var(--warning-soft-text)]">
              {t('parse.skillsPartial')}
            </Text>
            <Input
              value={manualSkills}
              aria-label={t('parse.skillsManualLabel')}
              placeholder={t('parse.skillsManualPlaceholder')}
              onChange={event => setManualSkills(event.target.value)}
            />
          </div>
        ) : null}
        {!proposal.canAcceptAll ? (
          // Informatif, jamais bloquant : le bouton reste cliquable — c'est le
          // chemin champ par champ, sous la liste, qui reste le geste attendu
          // pour un champ décisif incertain.
          <Text size="xs" className="mt-1 text-[var(--warning-soft-text)]">
            {t('parse.acceptAllBlocked')}
          </Text>
        ) : null}

        <ul className="mt-3 flex flex-col gap-2">
          {proposal.fields.map(field => {
            const chosen = decisionFor(field)
            const uncertain = field.value !== null && field.confidence < CV_LOW_CONFIDENCE
            return (
              <li
                key={field.detection}
                className="rounded-md border border-[var(--bellum-border)] p-2"
                onMouseEnter={() => setHovered(field.detection)}
                onMouseLeave={() => setHovered(null)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Text size="xs" weight="medium">
                    {t(`parse.detections.${field.detection}`)}
                  </Text>
                  {field.value === null ? (
                    // « Non trouvé dans le CV » plutôt qu'une case vide : un
                    // blanc se lit comme un défaut d'affichage.
                    <Badge variant="outline">{t('parse.notFound')}</Badge>
                  ) : (
                    <Badge variant={uncertain ? 'warning' : 'success'}>
                      {t('parse.confidence', { percent: Math.round(field.confidence * 100) })}
                    </Badge>
                  )}
                </div>

                {field.value !== null ? (
                  <>
                    {chosen.decision === 'correct' ? (
                      <Input
                        value={chosen.value}
                        aria-label={t(`parse.detections.${field.detection}`)}
                        className="mt-1"
                        onChange={event =>
                          setDecision(field.detection, { decision: 'correct', value: event.target.value })
                        }
                      />
                    ) : (
                      // #2184.36 — DÉJÀ LÀ : c'est cette valeur, éditable, qui
                      // porte la traçabilité « valeur validée ».
                      <Text
                        size="sm"
                        className={chosen.decision === 'reject' ? 'mt-1 line-through opacity-60' : 'mt-1'}
                      >
                        {chosen.value}
                      </Text>
                    )}
                    {/* La preuve, sous la valeur. C'est elle qui distingue une
                        lecture d'une affirmation.
                        #2184.34 — DÉJÀ LÀ : c'est cet extrait qui porte la
                        traçabilité « valeur brute ». */}
                    <Text size="xs" className="mt-1 italic text-[var(--bellum-text-muted)]">
                      « {field.sourceExcerpt} »
                    </Text>
                    {/* #2184.37 / #2184.38 — traçabilité d'une revue PASSÉE :
                        qui, et quand. Un bloc jamais revu n'affiche RIEN — pas
                        un « auteur inconnu » qui laisserait croire à une revue
                        sans nom (GA-18/GA-19). */}
                    {proposal.fieldHistory?.[field.detection] ? (
                      <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
                        {t('parse.validatedBy', {
                          name: proposal.fieldHistory[field.detection]?.actorName ?? t('parse.validatedByUnknown'),
                          date: formatHistoryDate(
                            proposal.fieldHistory[field.detection]?.createdAt ?? '',
                            i18n.language,
                          ),
                        })}
                      </Text>
                    ) : null}
                    <div className="mt-1 flex items-center gap-1">
                      <Button
                        size="xs"
                        variant={chosen.decision === 'accept' ? 'default' : 'ghost'}
                        className="gap-1"
                        onClick={() =>
                          setDecision(field.detection, { decision: 'accept', value: renderValue(field.value) })
                        }
                      >
                        <Check className="size-3" />
                        {t('parse.accept')}
                      </Button>
                      <Button
                        size="xs"
                        variant={chosen.decision === 'correct' ? 'default' : 'ghost'}
                        className="gap-1"
                        onClick={() => setDecision(field.detection, { decision: 'correct', value: chosen.value })}
                      >
                        <Pencil className="size-3" />
                        {t('parse.correct')}
                      </Button>
                      <Button
                        size="xs"
                        variant={chosen.decision === 'reject' ? 'default' : 'ghost'}
                        className="gap-1"
                        onClick={() => setDecision(field.detection, { decision: 'reject', value: chosen.value })}
                      >
                        <X className="size-3" />
                        {t('parse.reject')}
                      </Button>
                    </div>
                  </>
                ) : null}
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}

/** La valeur lue → ce qu'on affiche et édite. Une liste se saisit séparée par
 *  des virgules, comme partout ailleurs dans le vivier. */
/**
 * LA SOURCE — le CV, tel qu'il a été lu, avec le passage surligné quand on
 * survole un champ.
 *
 * Extrait des deux branches de l'écran (#1780) : la colonne gauche s'affiche
 * dès que le texte est connu, que la lecture automatique ait rendu, qu'elle
 * tourne encore, ou qu'elle ait échoué. C'est aussi ce qui rend la revue
 * auditable — « d'où vient cette compétence ? » a une réponse visible.
 *
 * Aucun texte ⇒ aucune carte : une carte vide intitulée « Le CV lu (0
 * caractères) » annoncerait un document qui n'existe pas.
 */
function CvSource({ text, highlighted }: { text: string | null; highlighted?: { start: number; end: number } | null }) {
  const { t } = useTranslation('consultants')
  // Le compte se lit sur le texte QU'ON REND, jamais sur un `?? 0` : « 0
  // caractère » et « pas de CV » ne sont pas la même phrase, et c'est cette
  // carte qui disparaît quand il n'y a rien (GA-19).
  if (!text) return null
  const title = t('parse.sourceTitle', { count: text.length })
  return (
    <Card className="min-w-0 flex-1 p-4">
      <Text size="sm" weight="semibold">
        {title}
      </Text>
      <pre className="mt-2 max-h-[28rem] overflow-auto whitespace-pre-wrap break-words text-xs text-[var(--bellum-text-secondary)]">
        {highlighted ? (
          <>
            {text.slice(0, highlighted.start)}
            <mark className="bg-[var(--bellum-warning)] text-[var(--bellum-bg)]">
              {text.slice(highlighted.start, highlighted.end)}
            </mark>
            {text.slice(highlighted.end)}
          </>
        ) : (
          text
        )}
      </pre>
    </Card>
  )
}

/** #2184.38 — la date d'une revue passée, courte : jour, mois, heure. Même
 *  patron que `RecordHistory` (crm-core) pour ne pas inventer un second format
 *  de date à la même information (GA-26). */
function formatHistoryDate(iso: string, language: string | undefined): string {
  return new Date(iso).toLocaleString(language?.startsWith('en') ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function renderValue(value: ParsedField['value']): string {
  if (value === null) return ''
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

/** Le texte édité → la forme attendue par le contrat, en gardant le TYPE
 *  d'origine : une liste corrigée reste une liste. */
function parseValue(field: ParsedField, edited: string): string | string[] | number | null {
  if (Array.isArray(field.value)) {
    const items = edited
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
    return items.length > 0 ? items : null
  }
  if (typeof field.value === 'number') {
    const parsed = Number.parseInt(edited.trim(), 10)
    return Number.isFinite(parsed) ? parsed : null
  }
  return edited.trim() || null
}
