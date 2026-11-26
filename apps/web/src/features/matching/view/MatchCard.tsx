import type { MatchResult, MatchVerdict } from '@bellum/contracts'
import { matchCriteriaCounts } from './matchCriteriaCounts'
import { deriveMatchVerdict, matchNextAction, MATCH_FLAG_TONES } from '@bellum/contracts'
import { Badge, Box, Button, Card, Checkbox, Text } from '@bellum/ui'
import { AlertTriangle, Check, CircleDashed, X } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import { AskLaura } from '@/components/primitives/AskLaura'
import { OriginalCvButton } from './OriginalCvButton'

/**
 * La carte de résultat d'un profil (PDF 4 §4.2).
 *
 * #2330.1/.5 — LE VERDICT NOMMÉ ouvre la carte, jamais un pourcentage seul
 * (recette ÉCRAN 23/09 : le tiroir montrait « Correspondance 59 / Poussable
 * 70 » sans verdict). `deriveMatchVerdict` (contrats) le dérive du `bucket` et
 * des `exclusions` déjà produits par `engine.ts` — SANS toucher `classify()`
 * ni les quatre blocs (§4). Les DEUX scores restent affichés, côte à côte et
 * jamais fondus : « 84 / 71 » dit ce qu'un 77 unique tairait, mais ils
 * passent APRÈS le verdict, qui dit d'emblée ce qu'il faut en faire.
 *
 * Chaque compétence porte son symbole — trouvée, approchée, absente — et sa
 * preuve, parce que c'est la preuve qui décide de ce qu'on osera écrire au
 * client.
 *
 * Les questions à valider ne sont pas décoratives : elles constituent la trame
 * de l'appel de qualification, et elles naissent des écarts réels. Une fiche
 * sans écart n'en produit aucune.
 *
 * #2330.6 — la PROCHAINE ÉTAPE, déduite du verdict et du premier écart réel
 * (`matchNextAction`), ferme la carte : jamais un classement qui s'arrête à
 * un jugement sans dire quoi en faire.
 */
export function MatchCard({
  result,
  name,
  title,
  selected,
  onToggle,
  onExplain,
  onPosition,
  onDismiss,
  onValidateAvailability,
  validatingAvailability,
  onPrepareCv,
  onRelaunch,
}: {
  result: MatchResult
  name: string
  title: string | null
  selected: boolean
  onToggle: () => void
  onExplain: () => void
  onPosition: () => void
  /** #2176.47 — geste EXPLICITE : jusqu'ici, seule l'absence de sélection en
   *  tenait lieu. Purement local à la session de rapprochement : le classement
   *  n'est jamais réécrit, on n'en fusionne ni n'en fait disparaître la trace
   *  côté serveur ; c'est le tri visuel de CET écran qui suit. */
  onDismiss: () => void
  /** #2936 (#2176.44) — revalide la disponibilité DÉCLARÉE, MÊME geste que la
   *  fiche talent (`useConfirmTalentAvailability`) : jamais un second chemin
   *  pour la même question (GA-26). */
  onValidateAvailability: () => void
  validatingAvailability: boolean
  /** #2936 (#2176.45, #2176.62) — ouvre le studio de dossier de compétences
   *  déjà écrit pour la fiche talent (`CvStudioPanel`), pour CE profil : la
   *  génération ET le téléchargement (docx/pdf) y vivent déjà, un second
   *  moteur ferait doublon. */
  onPrepareCv: () => void
  /** #2936 (#2176.49) — ouvre un brouillon vers ce consultant, jamais un envoi
   *  direct (doctrine : le copilote prépare). */
  onRelaunch: () => void
}) {
  const { t } = useTranslation('matching')
  const matched = result.skills.filter(skill => skill.status === 'matched')
  const adjacent = result.skills.filter(skill => skill.status === 'adjacent')
  const missing = result.skills.filter(skill => skill.status === 'missing')
  // #2328.24 (second volet) — le terme demandé est présent, mais seulement
  // extrait : jamais compté comme must-have, jamais confondu avec `matched`.
  const unverified = result.skills.filter(skill => skill.status === 'unverified')
  // #2330.1/.5 — dérivé du bucket ET des exclusions déjà là, jamais recalculé
  // à partir du score seul (NO-GO #2330.3/.9 : voir `deriveMatchVerdict`).
  const verdict = deriveMatchVerdict(result.bucket, result.exclusions)
  const nextAction = matchNextAction(verdict, result)
  // « Un score n'est jamais nu » vaut aussi QUAND il est mesuré : les axes qui
  // n'ont pas pu être notés restent nommés, pas seulement absorbés par le
  // dénominateur qui les exclut.
  const criteria = matchCriteriaCounts(result.axes)
  const unevaluatedAxes = result.axes.filter(axis => axis.score === null).map(axis => axis.axis)

  return (
    <Card className="rounded-card p-4 md:p-5">
      <Box display="flex" className="items-start justify-between gap-3">
        <Box display="flex" className="items-start gap-2">
          <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={t('compare.select', { name })} />
          <div>
            <Text weight="semibold" size="sm">
              {name}
            </Text>
            {title ? (
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {title}
              </Text>
            ) : null}
          </div>
        </Box>
      </Box>

      {/* Refonte Théo C (`projects-rapprochement`) et décision Louis : la correspondance s'écrit EN CLAIR,
          « Correspond : … · Manque : … », jamais en points. Ce qui n'a pas été lu n'est ni l'un ni l'autre :
          il reste dans « à confirmer » (le compte des critères juste en dessous). */}
      {matched.length + adjacent.length + missing.length > 0 ? (
        <Text size="sm" className="mt-2 block text-[var(--bellum-text-primary)]" data-testid="match-in-clear">
          {[
            matched.length + adjacent.length > 0
              ? t('card.corresponds', {
                  list: [...matched.map(skill => skill.label), ...adjacent.map(skill => skill.label)].join(', '),
                })
              : null,
            missing.length > 0 ? t('card.lacks', { list: missing.map(skill => skill.term).join(', ') }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}

      {/* #2330.1/.5 — LE VERDICT, avant tout le reste : c'est lui qui dit
          d'emblée ce qu'il faut faire du profil. */}
      <Box display="flex" className="mt-1.5 flex-wrap items-center gap-2">
        <Badge variant={verdictTone(verdict)}>{t(`verdict.${verdict}`)}</Badge>
        {/* Théo C projects-rapprochement.R1/N3 — les critères étayés et ceux à confirmer, dits côte à côte : un inconnu n'est jamais un non. */}
        {criteria ? (
          <Text size="xs" className="text-[var(--bellum-text-secondary)]" data-testid="match-criteria-counts">
            {t('criteriaCounts.backed', { count: criteria.backed })}
            {' · '}
            {criteria.toConfirm > 0
              ? t('criteriaCounts.toConfirm', { count: criteria.toConfirm })
              : t('criteriaCounts.noneToConfirm')}
          </Text>
        ) : null}
        {unevaluatedAxes.length > 0 ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('unevaluatedList', { list: unevaluatedAxes.map(axis => t(`axes.${axis}`)).join(', ') })}
          </Text>
        ) : null}
      </Box>

      <Box display="flex" className="mt-3 flex-col gap-1">
        {matched.map(skill => (
          <Line key={`m-${skill.term}`} icon={<Check className="size-3.5 text-[var(--success-soft-text)]" />}>
            {skill.label}
            {skill.level && skill.level !== 'inconnu'
              ? ` · ${t(`levels.${skill.level}`, { defaultValue: skill.level })}`
              : ''}
            {skill.proof ? ` · ${skill.proof}` : ''}
          </Line>
        ))}
        {adjacent.map(skill => (
          <Line key={`a-${skill.term}`} icon={<CircleDashed className="size-3.5 text-[var(--warning-soft-text)]" />}>
            {t('card.adjacent', { found: skill.label, wanted: skill.term })}
          </Line>
        ))}
        {missing.map(skill => (
          <Line key={`x-${skill.term}`} icon={<X className="size-3.5 text-[var(--bellum-text-muted)]" />}>
            {t(skill.required ? 'card.missingRequired' : 'card.missingNice', { skill: skill.term })}
          </Line>
        ))}
        {unverified.map(skill => (
          <Line key={`u-${skill.term}`} icon={<CircleDashed className="size-3.5 text-[var(--warning-soft-text)]" />}>
            {t('card.unverified', { skill: skill.label })}
          </Line>
        ))}
        {/* LES DRAPEAUX — et leur COULEUR, qui n'est pas leur sévérité.
            ⚠️ La sévérité reste `warning` sur « déjà refusé chez ce client », et
            c'est juste : un refus antérieur n'écarte personne, le recruteur
            tranche. Mais un refus client ne se LIT pas comme un consentement
            bientôt échu — repousser quelqu'un que le client a déjà refusé est la
            façon la plus rapide de perdre un compte. Le panneau du vivier le
            peignait déjà en rouge ; le tiroir du besoin, c'est-à-dire l'écran où
            l'on rapproche, le montrait en orange. Même fait, deux lectures.
            La table des tons vit dans le contrat (`MATCH_FLAG_TONES`), pas ici :
            deux écrans montrent ces drapeaux. */}
        {result.flags.map(flag => {
          const danger = MATCH_FLAG_TONES[flag.kind] === 'danger'
          const tone = danger ? 'text-[var(--danger-soft-text)]' : 'text-[var(--warning-soft-text)]'
          const on = formatFlagDate(flag.at)
          return (
            <Line
              key={flag.kind + flag.detail}
              icon={<AlertTriangle className={`size-3.5 ${tone}`} />}
              color={danger ? tone : undefined}
            >
              {/* LA DATE. Sans elle, « déjà refusé » se lit comme un refus
                  d'hier — et c'est cette lecture-là qui fait renoncer à
                  reproposer quelqu'un refusé il y a trois ans. On n'en invente
                  jamais une : absente, la phrase reste nue. */}
              {on === null ? flag.detail : t('card.flagOn', { detail: flag.detail, date: on })}
            </Line>
          )
        })}
        {/* #2176.3 — la SOURCE « versions ciblées » : un dossier de compétences
            déjà préparé pour CE besoin. On n'affiche rien quand elle est
            absente — ce n'est pas un axe, elle ne pèse dans aucun score. */}
        {result.targetedCvVersion && formatFlagDate(result.targetedCvVersion.generatedAt) ? (
          <Line icon={<Check className="size-3.5 text-[var(--success-soft-text)]" />}>
            {t('card.targetedCvVersion', { date: formatFlagDate(result.targetedCvVersion.generatedAt) })}
          </Line>
        ) : null}
      </Box>

      {result.questionsToValidate.length > 0 ? (
        <Box className="mt-3 rounded-md border border-border p-2">
          <Text size="xs" weight="medium">
            {t('card.toValidate')}
          </Text>
          <ul className="mt-1 list-disc pl-4">
            {result.questionsToValidate.map(question => (
              <li key={question}>
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {question}
                </Text>
              </li>
            ))}
          </ul>
        </Box>
      ) : null}

      {result.exclusions.length > 0 ? (
        <Box display="flex" className="mt-3 flex-wrap gap-1">
          {result.exclusions.map(exclusion => (
            <Badge key={exclusion.reason} variant={exclusion.severity === 'blocking' ? 'destructive' : 'default'}>
              {t(`reasons.${exclusion.reason}`)}
            </Badge>
          ))}
        </Box>
      ) : null}

      {/* #2330.6 — la prochaine étape, DÉDUITE du verdict et du premier écart
          réel : jamais une phrase générique déconnectée du profil, `null` sur
          `non_defendable` — il n'y a rien à FAIRE avec CE profil sur CE
          besoin. */}
      {nextAction ? (
        <Text size="xs" weight="medium" className="mt-3 text-[var(--bellum-text-secondary)]">
          {t('recommendedStep', { action: nextAction })}
        </Text>
      ) : null}

      <Box display="flex" className="mt-3 flex-wrap gap-2">
        {/* #2176.42 — Action : Ouvrir la fiche. Un vrai lien, pas un bouton qui
            navigue en JS : le clic milieu et « ouvrir dans un onglet » en
            dépendent (même règle que `MissionsTable.tsx`). */}
        <Button asChild variant="ghost" size="sm">
          <Link to="/consultants/$id" params={{ id: result.consultantId }}>
            {t('card.openProfile')}
          </Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={onExplain}>
          {t('card.explain')}
        </Button>
        <Button variant="secondary" size="sm" onClick={onPosition}>
          {t('card.position')}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          {t('card.dismiss')}
        </Button>
        {/* #2936 (#2176.44) — revalider la disponibilité déclarée, sans en
            changer la valeur : désactivé pendant la mutation pour éviter un
            double geste sur un clic répété. */}
        <Button variant="ghost" size="sm" onClick={onValidateAvailability} disabled={validatingAvailability}>
          {t('card.validateAvailability')}
        </Button>
        {/* #2936 (#2176.45, #2176.62) — ouvre le studio de dossier de
            compétences, où génération ET téléchargement vivent déjà. */}
        <Button variant="ghost" size="sm" onClick={onPrepareCv}>
          {t('card.prepareCv')}
        </Button>
        {/* #2176.62 — le CV ORIGINAL, téléchargé au clic (droit tranché par l'API). */}
        <OriginalCvButton consultantId={result.consultantId} />
        {/* #2936 (#2176.49) — un brouillon, jamais un envoi direct. */}
        <Button variant="ghost" size="sm" onClick={onRelaunch}>
          {t('card.relaunch')}
        </Button>
        {/* #2176.48 — DEMANDER À LAURA, PAR PROFIL. Même geste que la carte
            du pipe (#2170.29) : la question nomme le profil — `AskLaura` ne
            porte pas de scope par consultant (seul `accountId` existe), donc
            aucun scope forcé ici, jamais un second moteur (D44). */}
        <AskLaura label={t('card.askLaura')} question={t('card.askLauraQuestion', { name })} />
      </Box>
    </Card>
  )
}

/**
 * La couleur du verdict — jamais celle d'un score.
 *
 * Même table que `ConsultantMatchPanel.tsx` : `primary` sur le seul verdict
 * qui se propose sans condition, `destructive` sur celui qui n'a rien à
 * offrir sur CE besoin, `outline` sur les trois qui demandent encore un
 * geste (qualifier, négocier, compléter la fiche).
 */
function verdictTone(verdict: MatchVerdict): 'primary' | 'destructive' | 'outline' {
  if (verdict === 'fortement_defendable') return 'primary'
  if (verdict === 'non_defendable') return 'destructive'
  return 'outline'
}

function Line({ icon, children, color }: { icon: React.ReactNode; children: React.ReactNode; color?: string }) {
  return (
    <Box display="flex" className="items-start gap-2">
      <span className="mt-0.5 shrink-0">{icon}</span>
      {/* La couleur passe par un JETON de texte (`*-soft-text`) et jamais par la
          couleur sémantique brute : `--bellum-danger` ne tient pas le contraste
          AA en clair, et une ligne rouge illisible ne prévient personne. */}
      <Text size="xs" className={color ?? 'text-[var(--bellum-text-secondary)]'}>
        {children}
      </Text>
    </Box>
  )
}

/**
 * La date d'un drapeau, en jour local — ou `null` quand il n'y en a pas.
 *
 * Jamais une date INVENTÉE, et jamais « aujourd'hui » par défaut : un
 * positionnement encore ouvert n'a pas de date de clôture, et lui en donner une
 * ferait passer un dossier vivant pour une affaire classée.
 */
function formatFlagDate(value: string | null | undefined): string | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : formatDate(parsed)
}
