import type { PlanRisk } from '@bellum/contracts'
import { Card, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, Ban, Compass, DoorOpen, Gauge, Milestone } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  DOSSIER_AXIS_MAX,
  DOSSIER_SCORE_MIN_MEASURED_AXES,
  DOSSIER_SCORE_AXES,
  DOSSIER_SCORE_CAP_AXES,
} from '@bellum/contracts'
import { ScoreWithAxes } from '@/components/primitives/ScoreWithAxes'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { stripRegistryJargon } from '@/lib/strip-registry-jargon'
import type {
  DossierAxisView,
  DossierReadView,
  DossierReliabilityDimensionView,
} from '../evaluation/dossierReadViewData'

/**
 * #2118 — LES BLOCS DE LA LECTURE DU DOSSIER.
 *
 * Quatre composants, et non un seul, parce que la Synthèse répond DANS UN ORDRE
 * (#2115.7-13) : « mérite-t-il mon temps ? » puis « pourquoi maintenant ? »,
 * « quel périmètre ? », « avec qui ? », « par où ? », « quelle action ? », « que
 * sait l'équipe ? ». Les empiler dans une seule carte sous le résumé aurait
 * rendu la lecture juste et la SÉQUENCE fausse — le périmètre et la porte
 * d'entrée se seraient lus avant le signal et avant le contact.
 *
 * Ce que ces blocs ne font JAMAIS :
 *  - afficher un chiffre nu (le score passe par `ScoreWithAxes`, les axes sont
 *    nommés à côté) ;
 *  - afficher « 0 » pour un axe non mesuré (il est NOMMÉ « inconnu » et sort du
 *    dénominateur — le calcul vit dans `@bellum/contracts`) ;
 *  - reformuler le texte du modèle (#2118.19 : deux ESN au même score doivent
 *    lire deux raisons différentes ; les réécrire côté web les rendrait
 *    interchangeables) ;
 *  - envoyer quoi que ce soit — « Action suivante » NAVIGUE, elle n'écrit rien.
 */

/** Les sept clés d'axe, en libellés traduits — l'ordre vient du contrat. */
function useAxisLabel() {
  const { t } = useTranslation('accountDetail')
  return (key: DossierAxisView['key']) => t(`dossierRead.axis.${key}`)
}

/**
 * #2115.7 + #2118.6 / .30-.40 / .44-.47 / .4 / .20-.28 —
 * POSITION 1 : « ce compte mérite-t-il mon temps ? »
 */
export function DossierWorthCard({ read }: { read: DossierReadView }) {
  const { t } = useTranslation('accountDetail')
  const axisLabel = useAxisLabel()
  const { score } = read

  const unknownLabels = score.unknownAxes.map(key => axisLabel(key))

  return (
    <Card className="gap-0 overflow-hidden p-0 [--card-spacing:0px]">
      <div className="flex items-center gap-3 border-b border-[var(--bellum-border)] px-4 py-3">
        <Gauge className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
        <Text element="h3" size="sm" weight="semibold">
          {t('dossierRead.worthTitle')}
        </Text>
      </div>

      <div className="space-y-4 px-4 py-4">
        {read.noGo ? <NoGoNotice noGo={read.noGo} /> : null}
        {read.profileIncomplete ? <ProfileIncompleteNotice fields={read.profileIncompleteFields} /> : null}

        {/* La NOTE. `ScoreWithAxes` en mode compact ne rend QUE la note et sa
            mention « n axe(s) non évaluable(s) » : les axes eux-mêmes sont
            détaillés juste en dessous, avec leur état, leur impact et leur
            levier — les faire rendre deux fois serait la loi 4 violée. */}
        <div className="space-y-1">
          {/* Échelle du score (R12, Thales 15/10) — « 22/30 » ici, « 15/25 » dans l'onglet Score : deux
              scores DIFFÉRENTS (7 axes vs grille à 5 critères). Celui-ci se nomme, l'autre aussi. */}
          <Text data-testid="dossier-score-name" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('dossierRead.scoreName')}
          </Text>
          <ScoreWithAxes
            compact
            score={score.kind === 'score' ? (score.value ?? null) : null}
            max={score.outOf ?? DOSSIER_AXIS_MAX * DOSSIER_SCORE_AXES.length}
            axes={read.axes.map(axis => ({ label: axisLabel(axis.key), score: axis.value }))}
            reason={t('dossierRead.insufficient', {
              scored: score.scoredAxes,
              total: DOSSIER_SCORE_AXES.length,
              min: DOSSIER_SCORE_MIN_MEASURED_AXES,
            })}
          />
          {/* #4016.L9.a — un score de compte dit TOUJOURS sur combien d'axes il
              repose (Louis 13/10/2026 : « 2 axes sur N évalués »). Sous le
              plancher (`DOSSIER_SCORE_MIN_MEASURED_AXES`, 2), pas de score, donc
              pas de compte : la raison ci-dessus le dit déjà. */}
          {score.kind === 'score' ? (
            <Text data-testid="dossier-score-axes-count" size="xs" className="text-[var(--bellum-text-muted)]">
              {t('dossierRead.axesEvaluated', { count: score.scoredAxes, total: DOSSIER_SCORE_AXES.length })}
            </Text>
          ) : null}
          {/* #2118.52 — le dénominateur est DIT : « 15/25 » sur cinq axes notés,
              jamais « 15/35 ». Sans cette phrase, un lecteur suppose /35 et
              conclut que deux axes valent zéro. */}
          {unknownLabels.length > 0 ? (
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {/* #2592 — la phrase reçoit ce qu'elle demande : le gabarit
                  attend `{{axesCount}}` (voir accountDetail.json fr/en), pas
                  `count`. `count` reste posé : i18next le lit pour choisir
                  entre un singulier/pluriel `_one`/`_other`, mais cette clé
                  n'en déclare aucun — « axe(s) » est écrit en dur dans la
                  chaîne — donc il ne pilote rien ici ; le retirer n'aurait
                  rien cassé, mais ne rien retirer qui marche encore. */}
              {t('dossierRead.unknownOutOfScore', {
                count: unknownLabels.length,
                axesCount: unknownLabels.length,
                axes: unknownLabels.join(', '),
              })}
            </Text>
          ) : null}
        </div>

        <ul className="divide-y divide-[var(--bellum-border)] border-y border-[var(--bellum-border)]">
          {read.axes.map(axis => (
            <AxisRow key={axis.key} axis={axis} label={axisLabel(axis.key)} />
          ))}
        </ul>

        {/* #2306.12/.13/.30 — doctrine NO-GO : un score élevé ne pousse jamais
            vers un accès ou un achat externe qu'on n'a pas mesuré. */}
        {score.cappedBy.length > 0 ? <CapNotice cappedBy={score.cappedBy} /> : null}

        {/* #2118.22 — pourquoi CE compte pour CETTE ESN. Le texte est celui du
            modèle, mot pour mot. */}
        <TextBlock title={t('dossierRead.whyForYourEsn')} body={read.whyForYourEsn} />

        {read.obstacles.length > 0 ? <LabelledList title={t('dossierRead.obstacles')} items={read.obstacles} /> : null}

        {/* #2118.26 / .28 — l'anti-conseil NOMME l'approche déconseillée ET sa
            raison. Sans la raison, c'est un ordre ; un commercial ne suit pas un
            ordre qu'il ne peut pas expliquer en réunion. */}
        {read.antiAdvice ? (
          <div className="space-y-1 rounded-lg border border-[var(--danger-soft-border)] bg-[var(--danger-soft-bg)] p-3">
            <div className="flex items-center gap-2">
              <Ban className="size-3.5 shrink-0 text-[var(--danger-soft-text)]" aria-hidden />
              <Text size="xs" weight="semibold" className="text-[var(--danger-soft-text)]">
                {t('dossierRead.antiAdvice')}
              </Text>
            </div>
            {read.antiAdvice.what ? (
              <Text element="p" size="sm" className="text-[var(--danger-soft-text)]">
                {read.antiAdvice.what}
              </Text>
            ) : null}
            {read.antiAdvice.why ? (
              <Text element="p" size="xs" className="text-[var(--danger-soft-text)]">
                {read.antiAdvice.why}
              </Text>
            ) : null}
          </div>
        ) : null}

        {/* #2118.4 — ce qui n'a pas pu être évalué, un par un et avec sa raison.
            La version d'avant en faisait un paragraphe libre : on savait qu'il
            manquait quelque chose, jamais QUOI aller chercher. */}
        {read.missing.length > 0 ? <LabelledList title={t('dossierRead.missing')} items={read.missing} /> : null}

        {read.reliability ? <ReliabilityBlock reliability={read.reliability} /> : null}
      </div>
    </Card>
  )
}

/**
 * #2304.8 (épopée #2932, LAU-FINAL-045) — Q7 : « quel est le principal
 * risque du compte ? »
 *
 * ⚠️ Alimentée par `mainRisk` (`@bellum/contracts`), DÉRIVÉ des risques déjà
 * écrits (`evaluation.risks`, rendus en LISTE COMPLÈTE sur l'onglet
 * Évaluation) — jamais un second appel modèle. Le classement retient le plus
 * grave (impact d'abord, probabilité ensuite), pas le premier de la liste.
 */
export function MainRiskCard({ risk }: { risk: PlanRisk | null }) {
  const { t } = useTranslation('accountDetail')
  if (!risk?.risk) return null
  return (
    <SimpleCard icon={<AlertTriangle className="size-4 shrink-0 text-[var(--warning-soft-text)]" aria-hidden />}>
      <Text element="h3" size="sm" weight="semibold">
        {t('dossierRead.mainRiskTitle')}
      </Text>
      <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
        {risk.risk}
      </Text>
      {risk.mitigation ? (
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {risk.mitigation}
        </Text>
      ) : null}
    </SimpleCard>
  )
}

/**
 * Une ligne d'axe : son nom, son ÉTAT (#2118.37), sa note quand elle existe,
 * son impact (#2118.39) et son levier (#2118.40).
 *
 * Le levier est attaché à SA ligne, pas agrégé en bas de carte : un levier
 * détaché de son axe ne se rattache à rien, et c'est ce que faisait la note
 * provisoire qui listait « les axes sous la moitié de leur max ».
 */
function AxisRow({ axis, label }: { axis: DossierAxisView; label: string }) {
  const { t } = useTranslation('accountDetail')
  const unknown = axis.state === 'unknown'

  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-2">
          <Text size="sm" weight="medium">
            {label}
          </Text>
          <AxisStateBadge state={axis.state} />
        </div>
        {/* Un axe inconnu ne porte PAS de note — ni « 0/5 », ni « — » muet :
            `UnknownValue` dit « non mesuré » et sa raison au survol. */}
        {unknown || axis.value === null ? (
          <UnknownValue reason={axis.impact ?? t('dossierRead.axisUnknownReason')} />
        ) : (
          <Text size="sm" weight="medium">
            {t('dossierRead.axisValue', { value: axis.value, max: DOSSIER_AXIS_MAX })}
          </Text>
        )}
      </div>
      {axis.impact ? (
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('dossierRead.axisImpact', { value: axis.impact })}
        </Text>
      ) : null}
      {axis.lever ? (
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('dossierRead.axisLever', { value: axis.lever })}
        </Text>
      ) : null}
    </li>
  )
}

function AxisStateBadge({ state }: { state: DossierAxisView['state'] }) {
  const { t } = useTranslation('accountDetail')
  const tone =
    state === 'measured'
      ? 'border-[var(--success-soft-border)] bg-[var(--success-soft-bg)] text-[var(--success-soft-text)]'
      : state === 'partial'
        ? 'border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] text-[var(--warning-soft-text)]'
        : 'border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-[var(--bellum-text-muted)]'
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>
      {t(`dossierRead.axisState.${state}`)}
    </span>
  )
}

/**
 * #2118.44 — la fiabilité en TROIS dimensions nommées. L'info-bulle le DIT :
 * le libellé d'avant parlait de « qualité de la collecte et des sources », ce
 * qui laissait croire que la couverture et la fraîcheur étaient dedans.
 */
function ReliabilityBlock({ reliability }: { reliability: NonNullable<DossierReadView['reliability']> }) {
  const { t } = useTranslation('accountDetail')
  const rows: [string, DossierReliabilityDimensionView | null][] = [
    [t('dossierRead.reliabilityQuality'), reliability.quality],
    [t('dossierRead.reliabilityCoverage'), reliability.coverage],
    [t('dossierRead.reliabilityFreshness'), reliability.freshness],
  ]
  return (
    <div className="space-y-2 rounded-lg bg-[var(--bellum-bg-lighter)] p-3">
      <Text element="p" size="xs" weight="semibold" title={t('dossierRead.reliabilityHint')}>
        {t('dossierRead.reliabilityTitle')}
      </Text>
      <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
        {t('dossierRead.reliabilityHint')}
      </Text>
      <dl className="space-y-1">
        {rows.map(([label, dimension]) => (
          <div key={label} className="flex flex-wrap items-baseline justify-between gap-2">
            <dt>
              <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                {label}
              </Text>
            </dt>
            <dd className="min-w-0">
              {dimension && dimension.value !== null ? (
                <Text element="span" size="xs">
                  {t('dossierRead.reliabilityValue', { value: dimension.value })}
                  {dimension.note ? ` — ${dimension.note}` : ''}
                </Text>
              ) : (
                <UnknownValue reason={dimension?.note ?? t('dossierRead.reliabilityUnknownReason')} />
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/**
 * #2118.45 / .46 / .47 — un no-go est TEMPORAIRE, il dit ce qui bloque
 * aujourd'hui et ce qui le ferait changer. Le contrat n'admet pas d'autre forme
 * (`temporary: literal(true)`), l'écran le dit en toutes lettres.
 */
function NoGoNotice({ noGo }: { noGo: NonNullable<DossierReadView['noGo']> }) {
  const { t } = useTranslation('accountDetail')
  return (
    <div className="space-y-2 rounded-lg border border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] p-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-3.5 shrink-0 text-[var(--warning-soft-text)]" aria-hidden />
        <Text size="xs" weight="semibold" className="text-[var(--warning-soft-text)]">
          {t('dossierRead.noGoTitle')}
        </Text>
      </div>
      <Text element="p" size="xs" className="text-[var(--warning-soft-text)]">
        {t('dossierRead.noGoTemporary')}
      </Text>
      {noGo.context ? (
        <Text element="p" size="sm" className="text-[var(--warning-soft-text)]">
          {t('dossierRead.noGoContext', { value: noGo.context })}
        </Text>
      ) : null}
      {noGo.trigger ? (
        <Text element="p" size="sm" className="text-[var(--warning-soft-text)]">
          {t('dossierRead.noGoTrigger', { value: noGo.trigger })}
        </Text>
      ) : null}
    </div>
  )
}

/**
 * #2306.12/.13/.30 — doctrine NO-GO (CLAUDE.md, LAU-FINAL-047) : « score élevé
 * ne pousse pas vers accès/achat inconnu ». Quand `accessibilite` et/ou
 * `capacite_achat_externe` sont INCONNUS, la note calculée sur les autres axes
 * ne dit rien de ces deux-là — cette notice le dit explicitement (dégrade la
 * confiance, #2306.12) et nomme la vérification à faire pour chacun
 * (#2306.13), jamais une donnée inventée sur CE compte.
 */
function CapNotice({ cappedBy }: { cappedBy: DossierAxisView['key'][] }) {
  const { t } = useTranslation('accountDetail')
  return (
    <div className="space-y-2 rounded-lg border border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] p-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-3.5 shrink-0 text-[var(--warning-soft-text)]" aria-hidden />
        <Text size="xs" weight="semibold" className="text-[var(--warning-soft-text)]">
          {t('dossierRead.capTitle')}
        </Text>
      </div>
      <Text element="p" size="xs" className="text-[var(--warning-soft-text)]">
        {t('dossierRead.capNotice')}
      </Text>
      <ul className="space-y-0.5">
        {DOSSIER_SCORE_CAP_AXES.filter(key => cappedBy.includes(key)).map(key => (
          <li key={key}>
            <Text element="p" size="sm" className="text-[var(--warning-soft-text)]">
              {t(`dossierRead.capVerification.${key}`)}
            </Text>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * #2592 — le moteur (`PROFILE_FIT_FIELDS` dans
 * `apps/ia/app/services/dossier_read.py`) rend des NOMS DE CHAMPS, jamais un
 * libellé : `profile_incompleteness()` retourne `["references"]`, pas
 * `["Références clients"]`. Le mappage champ → libellé vit ICI, un seul
 * endroit (GA-26), parce que c'est côté écran qu'on peut le rendre FR+EN — le
 * moteur ne le peut pas (une chaîne qu'il choisirait ne serait pas
 * traduisible). Un champ que le moteur ajouterait sans mise à jour ici tombe
 * sur `profileField.unknown`, jamais sur son identifiant brut.
 */
const PROFILE_FIELD_KEYS = ['offers', 'sectors', 'positioning', 'references'] as const

function profileFieldLabel(t: (key: string) => string, field: string): string {
  if ((PROFILE_FIELD_KEYS as readonly string[]).includes(field)) {
    return t(`dossierRead.profileField.${field}`)
  }
  return t('dossierRead.profileField.unknown')
}

/**
 * #2118.20 — le profil ESN est incomplet. Ce que ce message protège : que
 * personne ne lise un fit bas comme un jugement sur le COMPTE. L'analyse du
 * compte reste fiable ; c'est la mise en regard avec l'offre qui manque, et
 * elle se répare en deux minutes — d'où le lien.
 */
function ProfileIncompleteNotice({ fields }: { fields: string[] }) {
  const { t } = useTranslation('accountDetail')
  return (
    <div className="space-y-1 rounded-lg border border-[var(--info-soft-border)] bg-[var(--info-soft-bg)] p-3">
      <Text element="p" size="sm" className="text-[var(--info-soft-text)]">
        {fields.length > 0
          ? t('dossierRead.profileIncomplete', { fields: fields.map(field => profileFieldLabel(t, field)).join(', ') })
          : t('dossierRead.profileIncompleteNoFields')}
      </Text>
      <Link
        to="/settings/profile"
        className="w-fit text-xs font-medium text-[var(--bellum-text-accent)] underline underline-offset-2"
      >
        {t('dossierRead.profileIncompleteLink')}
      </Link>
    </div>
  )
}

/** #2115.9 + #2118.23 — POSITION 3 : « quel périmètre viser ? » */
export function DossierScopeCard({ scope }: { scope: string | null }) {
  const { t } = useTranslation('accountDetail')
  if (!scope) return null
  return (
    <SimpleCard icon={<Compass className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />}>
      <Text element="h3" size="sm" weight="semibold">
        {t('dossierRead.scopeTitle')}
      </Text>
      <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
        {scope}
      </Text>
    </SimpleCard>
  )
}

/**
 * #2115.11 + #2118.24 — POSITION 5 : « par quelle voie entrer ? »
 *
 * ⚠️ Distincte de `OpeningStrategyCard` (section « Le contexte du compte »),
 * qui rend les points d'entrée PROPOSÉS par le plan (`comment_ouvrir_compte`).
 * Celle-ci rend LA meilleure porte selon la lecture du dossier
 * (`dossier_read.best_entry_point`) — deux sources distinctes, deux contenus
 * distincts : on ne recopie pas l'une dans l'autre, et aucune ne s'affiche deux
 * fois.
 */
export function DossierEntryPointCard({ entryPoint }: { entryPoint: DossierReadView['bestEntryPoint'] }) {
  const { t } = useTranslation('accountDetail')
  if (!entryPoint) return null
  return (
    <SimpleCard icon={<DoorOpen className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />}>
      <Text element="h3" size="sm" weight="semibold">
        {t('dossierRead.entryTitle')}
      </Text>
      {entryPoint.label ? (
        <Text element="p" size="sm" className="text-[var(--bellum-text-primary)]">
          {entryPoint.label}
        </Text>
      ) : null}
      {entryPoint.targetProfile ? (
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('dossierRead.entryTargetProfile', { value: entryPoint.targetProfile })}
        </Text>
      ) : null}
      {entryPoint.why ? (
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {entryPoint.why}
        </Text>
      ) : null}
    </SimpleCard>
  )
}

/**
 * #2304.7 (épopée #2932, LAU-FINAL-045) — Q6 : « quelle voie d'achat ou
 * d'accès plausible sur ce compte ? »
 *
 * ⚠️ Distincte de `DossierEntryPointCard` (`dossier_read.best_entry_point`),
 * qui nomme QUI contacter. Celle-ci nomme PAR OÙ entrer commercialement — un
 * programme déjà lancé, un appel d'offres en cours, une porte partenaire, un
 * panel fournisseur ouvert.
 */
export function DossierAccessPathCard({ accessPath }: { accessPath: DossierReadView['accessPath'] }) {
  const { t } = useTranslation('accountDetail')
  if (!accessPath) return null
  return (
    <SimpleCard icon={<Milestone className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />}>
      <Text element="h3" size="sm" weight="semibold">
        {t('dossierRead.accessPathTitle')}
      </Text>
      <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
        {accessPath}
      </Text>
    </SimpleCard>
  )
}

function SimpleCard({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="gap-0 overflow-hidden p-0 [--card-spacing:0px]">
      <div className="flex items-start gap-3 px-4 py-3">
        {icon}
        <div className="min-w-0 flex-1 space-y-1">{children}</div>
      </div>
    </Card>
  )
}

function TextBlock({ title, body: rawBody }: { title: string; body: string | null }) {
  const body = stripRegistryJargon(rawBody ?? '')
  if (!body) return null
  return (
    <div className="space-y-1">
      <Text element="p" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
        {title}
      </Text>
      <Text element="p" size="sm" className="text-[var(--bellum-text-primary)]">
        {body}
      </Text>
    </div>
  )
}

function LabelledList({
  title,
  items: rawItems,
}: {
  title: string
  items: { label: string | null; why: string | null }[]
}) {
  const items = rawItems
    .map(item => ({
      label: stripRegistryJargon(item.label ?? '') || null,
      why: stripRegistryJargon(item.why ?? '') || null,
    }))
    .filter(item => item.label || item.why)
  if (items.length === 0) return null
  return (
    <div className="space-y-1">
      <Text element="p" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
        {title}
      </Text>
      <ul className="list-disc space-y-1 pl-5">
        {items.map((item, index) => (
          <li key={`${item.label ?? ''}-${index}`}>
            {item.label ? (
              <Text element="span" size="sm" className="text-[var(--bellum-text-primary)]">
                {item.label}
              </Text>
            ) : null}
            {item.why ? (
              <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                {item.why}
              </Text>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
