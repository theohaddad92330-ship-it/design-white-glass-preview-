import { briefingRankingAxesVerdict } from '@bellum/contracts'
import type { BriefingAction, BriefingDominationReason, BriefingFactCapability } from '@bellum/contracts'
import { Box, Button, LAYOUT_TRANSITION, MOTION, Text, reduced, staggerDelay } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { motion, useReducedMotion, type TargetAndTransition, type Transition } from 'framer-motion'
import { ArrowRight, ChevronDown, ChevronRight, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AskLaura } from '@/components/primitives/AskLaura'
import { ObjectMention } from '@/components/primitives/ObjectMention'
import { Provenance } from '@/components/primitives/Provenance'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { useNow } from '@/lib/hooks/use-now'
import { trackPriorityViewed } from '@/lib/product-tracker'
import { useSetRoleFit } from '../api'
import { BRIEFING_ACTION_CTA } from '../action-cta'
import { briefingActionHeadline } from '../lib/action-task-transform'
import { AccountLastOutcomeLine } from './AccountLastOutcomeLine'
import { briefingActionUrgencyTier, type BriefingUrgencyTier } from '../lib/urgency-tier'
import { CardDispositionControls } from './CardDispositionControls'

/**
 * LA CARTE D'UNE PRIORITÉ DU JOUR (#2099).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE S'APPELLE COMME ÇA, ET POURQUOI IL N'Y EN A QU'UNE
 * ─────────────────────────────────────────────────────────────────────────────
 * #2099 décrit une carte à quatorze facettes. `ActionsBlock` en rendait déjà
 * une, sous le nom d'`ActionCard`, avec cinq d'entre elles. En écrire une
 * SECONDE à côté aurait donné deux formes pour le même objet sur le même écran
 * — la loi 4 du tome 7, et le défaut que ce dépôt paie le plus souvent. La
 * carte existante a donc déménagé ici et gagné ce qui lui manquait : c'est la
 * même carte, au même endroit de l'écran, qui sait dire plus de choses.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUI TRAVERSE TOUTE LA CARTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque facette DISPARAÎT quand la donnée manque. Pas de « source inconnue »
 * en gris, pas de « aucune préparation », pas de « 0 min », pas de date du jour
 * posée par défaut : dans une LISTE, une absence ne fait AUCUNE ligne.
 *
 * ⚠️ UNE SEULE EXCEPTION, et elle est l'autre moitié de la même doctrine : les
 * AXES du classement. Sous un score, un axe non évaluable reste NOMMÉ — il sort
 * du dénominateur, il ne disparaît pas. « Trois axes sur trois » et « trois axes
 * sur sept » ne racontent pas la même histoire, et taire les quatre qui manquent
 * fait passer la seconde pour la première.
 *
 * ⚠️ AUCUNE PROBABILITÉ, aucun poids, aucune note. La carte dit QUELS axes ont
 * pesé, jamais combien : un chiffre de confiance se lit comme une chance de
 * réussite, et c'est refusé depuis six fois.
 */

/** Les genres de carte qui ont un geste NOMMÉ — un seul endroit (GA-26). */
const CTA_BY_KIND = BRIEFING_ACTION_CTA

/** #2108.49 — même convention que `MeetingPrepDialog` (`MEETING_PREP_SCREEN`) :
 *  le chemin de la route, pas un nom d'écran inventé. */
const BRIEFING_SCREEN = '/briefing/'

/**
 * #2389.6 — le TON de chaque étiquette. Urgent reprend le ton d'alerte déjà
 * posé par `StatusBadge` (Centre d'actions, #2401.8) : un même mot doit
 * peindre pareil partout dans le produit. Administratif reste neutre — la
 * doctrine de la carte est justement qu'il ne doit PAS attirer l'œil plus
 * qu'un commercial.
 */
const URGENCY_TIER_TONE: Record<BriefingUrgencyTier, string> = {
  urgent: 'bg-[var(--danger-soft-bg)] text-[var(--danger-soft-text)]',
  important: 'bg-[var(--warning-soft-bg)] text-[var(--warning-soft-text)]',
  opportunity: 'bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]',
  administrative: 'border border-[var(--bellum-border)] text-[var(--bellum-text-secondary)]',
}

const CARD_CLASS_BASE = 'relative flex flex-col gap-2 overflow-hidden rounded-lg border py-3 pl-5 pr-3'

/**
 * #3749.2 — même jeton que la colonne « Grille de qualification » de la liste
 * des comptes (`AccountTableRow.tsx`) : le verdict se lit VERBATIM, jamais
 * retraduit, et sa couleur reprend les mêmes jetons sémantiques AA (D79).
 */
const QUALIFICATION_VERDICT_TEXT: Record<'GO' | 'PRUDENT' | 'NO-GO', string> = {
  GO: 'text-[var(--success-soft-text)]',
  PRUDENT: 'text-[var(--warning-soft-text)]',
  'NO-GO': 'text-[var(--danger-soft-text)]',
}

/**
 * #2097.23 — LA BORDURE PORTE LA MÊME TONALITÉ QUE LA PASTILLE.
 *
 * Recette écran du 25/09 (R6) : « Urgent » (fond `--danger-soft-bg`) et
 * « Important » (fond `--warning-soft-bg`) rendaient la MÊME bordure neutre —
 * seule la pastille interne changeait, le conteneur ne portait par nature
 * aucune couleur sémantique. Les jetons `*-soft-border` existent déjà
 * (`tokens.css`, posés pour ce genre d'usage) dans les DEUX thèmes ; il ne
 * manquait que le branchement. Administratif reste neutre par doctrine
 * (#2389.6 : il ne doit pas attirer l'œil plus qu'un commercial).
 */
const URGENCY_TIER_BORDER: Record<BriefingUrgencyTier, string> = {
  urgent: 'border-[var(--danger-soft-border)]',
  important: 'border-[var(--warning-soft-border)]',
  opportunity: 'border-[var(--accent-soft-border)]',
  administrative: 'border-[var(--bellum-border)]',
}

export function PriorityCard({
  action,
  rank,
  onOpenMeetingPrep,
  onOpenConflict,
  onTransformToTask,
  transformedToTask,
  dominates,
  qualificationVerdict,
}: {
  action: BriefingAction
  rank: number
  // #2106.35 — la porte vers `MeetingPrepDialog`, LEVÉE jusqu'à `BriefingPage`
  // (qui seul connaît le dialogue et l'`AgendaEvent` complet). Optionnelle :
  // un test de cette carte seule ne promet alors aucun clic.
  onOpenMeetingPrep?: (actionId: string) => void
  /**
   * #2102.1 — le SEUL genre qui ouvre un geste sans `href` : un conflit
   * n'a pas de route, il ouvre `ConflictDialog` (appelant : `ActionsBlock`).
   * Absent (appelant qui ne le passe pas), la carte redevient un simple
   * constat — jamais un bouton qui ne ferait rien au clic.
   */
  onOpenConflict?: (action: BriefingAction) => void
  /**
   * #2105.24 — LE CTA « Transformer ce sujet en prochaine action ». Absent
   * (appelant qui ne le passe pas, ex. un test de cette carte seule), la
   * carte ne propose rien — même doctrine que `onOpenConflict` : un geste
   * n'existe que si quelqu'un peut vraiment le porter.
   */
  onTransformToTask?: (action: BriefingAction, headline: string) => void
  /** #2105.53 — déjà transformée : le geste ne se repropose pas (dédup). */
  transformedToTask?: boolean
  /**
   * #2095.81 / #2993 — POURQUOI cette carte passe devant la SUIVANTE dans le
   * classement (`explainBriefingDomination`, `@bellum/contracts`) — jamais
   * les axes de cette carte seule, qui ne disaient rien de la comparaison
   * (jugé insuffisant, lot du 24/09).
   *
   * `undefined` (appelant qui ne le passe pas, ex. un test de cette carte
   * seule) : repli sur les axes ÉVALUÉS de la carte, le comportement d'avant
   * ce lot — byte-identique. `null` (appelant qui SAIT qu'il n'y a rien à
   * comparer : dernière carte, ou égalité réelle) : la ligne ne s'affiche
   * pas — une absence de raison ne s'invente pas.
   */
  dominates?: BriefingDominationReason
  /**
   * #3749.2 — le verdict de la grille de qualification de l'espace, pour le
   * compte de CETTE carte (lu depuis `useQualificationSummary`, GA-26 : la
   * liste des comptes lit la même donnée, jamais recalculée). `undefined`
   * (appelant qui ne le passe pas, ex. un test de cette carte seule) ou
   * `null` (pas de grille active, ou ce compte jamais évalué) : la ligne ne
   * s'affiche pas — même doctrine que le reste de la carte, « chaque facette
   * disparaît quand la donnée manque ». Contrairement à la LISTE (une colonne
   * dense qui doit nommer pourquoi), cette carte n'écrit jamais « Grille non
   * remplie » : l'absence d'une facette ici ne fait aucune ligne.
   */
  qualificationVerdict?: 'GO' | 'PRUDENT' | 'NO-GO' | null
}) {
  const { t, i18n } = useTranslation('briefing')
  // #2389.6 — le tick d'horloge qui fait basculer une échéance dans l'heure
  // en URGENT ; même hook que `NowStrip` sur cette page (`use-now.ts`).
  const now = useNow()
  const urgencyTier = briefingActionUrgencyTier(action, now)
  // #2097.34 — « ça vient d'arriver » : le mouvement d'entrée de la grammaire
  // du dépôt (`MOTION.enterFromBelow`), en cascade sur le rang de la carte
  // (`staggerDelay`, plafonnée à huit éléments). `reduced()` retire le
  // déplacement pour qui a demandé moins de mouvement, sans supprimer la
  // transition (GA-25).
  const prefersReducedMotion = useReducedMotion()
  const enterMotion = prefersReducedMotion ? reduced(MOTION.enterFromBelow, 'enterFromBelow') : MOTION.enterFromBelow
  // #2097.35 — « c'est fait » : le SEUL geste que cette carte valide SANS
  // quitter la page (marquer/retirer « prioritaire pour moi », #2397.7).
  // `MOTION.confirm` (M9) rejoue à chaque bascule de `roleFitEngaged` — la clé
  // du `motion.span` change avec lui, ce qui démonte/remonte l'élément et
  // rejoue `initial` → `animate`. Le clic lui-même n'anime rien : c'est
  // `roleFitEngaged`, dérivé du VERDICT SERVEUR (`rankingAxes`, jamais un état
  // optimiste), qui fait foi — la même règle que #2397.2.
  const confirmMotion = prefersReducedMotion ? reduced(MOTION.confirm, 'confirm') : MOTION.confirm

  // Le FAIT. Le libellé de la carte le porte cinq fois sur six ; la sixième —
  // « Prépare la soutenance », qui est un ordre — porte le sien à part.
  // #2105.24/.53 — calculé UNE fois (`briefingActionHeadline`, GA-26) : la
  // transformation en tâche et la garde de dédup en ont besoin de la MÊME
  // valeur que celle affichée ici.
  const headline = briefingActionHeadline(action, t)

  // #2102.1 — le conflit garde `href: null` (aucune route n'existe), mais
  // gagne sa propre clé de CTA : elle ouvre `ConflictDialog`, pas un `<Link>`.
  const canOpenConflict = action.kind === 'conflict' && Boolean(onOpenConflict)
  const ctaKey = action.href ? CTA_BY_KIND[action.kind] : canOpenConflict ? CTA_BY_KIND.conflict : undefined
  const expires = formatDate(action.expiresAt, i18n.language)

  // #2095.61-67 — les axes qui ont pesé, et ceux qu'on n'a pas su peser.
  // Le verdict vient du contrat : le recalculer ici finirait par contredire
  // celui qui décide ailleurs (GA-26).
  const axes = briefingRankingAxesVerdict(action.rankingAxes ?? [])

  // #2095.81 / #2993 — « passe devant sur » compare CETTE carte à la
  // SUIVANTE dans le classement (`dominates`, posé par `ActionsBlock`), pas
  // ses propres axes évalués : c'était la lacune mesurée le 24/09 (une carte
  // seule ne « passe devant » personne). `undefined` (appelant qui ne le
  // sait pas, ex. un test de cette carte isolée) retombe sur l'ancien
  // comportement — ses propres axes — pour rester byte-identique.
  const domination: BriefingDominationReason =
    dominates !== undefined ? dominates : axes.evaluated.length > 0 ? { kind: 'axes', axes: axes.evaluated } : null

  // #2397.7 — LE RETOUR UTILISATEUR, LU DANS LE MÊME CONTRAT QUE LE RANG.
  //
  // Aucun champ neuf : `roleFit` est un axe comme les autres (#2397.2), donc
  // son état COURANT pour ce genre de carte est déjà dans `rankingAxes` — le
  // relire ailleurs en ferait une seconde vérité (GA-26). `evaluated: true`
  // veut dire « la personne a marqué ce genre comme prioritaire pour elle » ;
  // la bascule pose ou retire ce SEUL geste, jamais une pénalité inventée.
  const roleFitEngaged = action.rankingAxes.find(reading => reading.axis === 'roleFit')?.evaluated ?? false
  const setRoleFit = useSetRoleFit()

  /**
   * #2095.57 — LA MOITIÉ CONVERSATIONNELLE DE « POURQUOI CE RANG ».
   *
   * La moitié STRUCTURELLE (quels axes ont pesé, lesquels sont non évaluables)
   * est déjà rendue juste au-dessus (#2099.43-47). Ce qui manquait : poser la
   * question à Laura SUR CETTE carte précisément, plutôt que d'ouvrir `/chat`
   * les mains vides. `AskLaura` est le seul point d'entrée du copilote (D44) —
   * on ne fabrique pas un second moteur de conversation ici, on lui passe le
   * contexte de la carte : la question porte le FAIT affiché (`headline`), et
   * le compte en portée quand la carte en mentionne un (`useCurrentLauraContext`
   * embarque alors le contexte déjà publié par la fiche compte, s'il y en a
   * un — jamais un contexte inventé pour un autre compte).
   */
  const accountId = action.businessObject?.kind === 'account' ? action.businessObject.id : undefined

  // #2108.49 — une vue, une fois par carte : `action.id` change à chaque
  // carte réellement neuve (une carte qui change de rang garde le même id,
  // voir #2097.36 plus haut), jamais un compteur qui grossirait à chaque
  // re-rendu de la liste.
  useEffect(() => {
    trackPriorityViewed(BRIEFING_SCREEN, action.kind)
  }, [action.id, action.kind])

  return (
    <motion.div
      // #2097.36 — « ça a changé de place » (M6 `settle`) : quand le
      // classement serveur bouge (un geste « prioritaire pour moi », une
      // carte qui expire, une nouvelle qui double une carte existante), la
      // clé React reste `action.id` (voir `ActionsBlock.tsx`) — la carte ne
      // remonte pas, `layout` anime son déplacement plutôt qu'un saut sec.
      // Même patron que la liste de comptes (`AccountContent.tsx`, GA-26) :
      // `LAYOUT_TRANSITION`, jamais un ressort réinventé ici.
      layout
      initial={enterMotion.initial as TargetAndTransition}
      animate={enterMotion.animate as TargetAndTransition}
      transition={{ ...enterMotion.transition, delay: staggerDelay(rank - 1), layout: LAYOUT_TRANSITION } as Transition}
      // #2097.52 — 0 `role`/0 `aria-label` sur le conteneur carte, mesuré en
      // recette : un lecteur d'écran n'avait aucun repère de structure malgré
      // des libellés corrects sur les éléments interactifs internes. Le nom
      // porte la tonalité ET le fait — les deux informations qu'un survol
      // visuel donne d'un coup d'œil.
      role="article"
      aria-label={t('card.aria', { tier: t(`actions.urgencyTier.${urgencyTier}`), headline })}
      className={`${CARD_CLASS_BASE} ${URGENCY_TIER_BORDER[urgencyTier]}`}
    >
      {/* La barre de rang, le long du bord gauche. Décorative : le rang est
          déjà lisible dans la pastille, et l'annoncer deux fois à un lecteur
          d'écran ne dirait rien de plus. */}
      <Box aria-hidden className="absolute inset-y-0 left-0 w-1 bg-[var(--bellum-primary-400)]" />

      <Box className="flex items-start justify-between gap-3">
        <Box className="flex min-w-0 items-start gap-2.5">
          <Text
            size="xs"
            weight="medium"
            aria-hidden
            className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]"
          >
            {rank}
          </Text>
          <Box className="flex min-w-0 flex-col gap-1">
            <Box className="flex flex-wrap items-center gap-1.5">
              {/* #2389.6 — URGENT / IMPORTANT / OPPORTUNITÉ / ADMINISTRATIF :
                  une des quatre, toujours — `briefingActionUrgencyTier` couvre
                  les huit genres de carte, il n'y a pas de cinquième cas. */}
              <Text
                size="xs"
                weight="medium"
                className={`shrink-0 rounded-full px-2 py-0.5 ${URGENCY_TIER_TONE[urgencyTier]}`}
              >
                {t(`actions.urgencyTier.${urgencyTier}`)}
              </Text>
              <Text size="sm" weight="medium">
                {headline}
              </Text>
            </Box>
            {action.context ? (
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t(strip(action.context.labelKey), action.context.labelVars)}
              </Text>
            ) : null}
          </Box>
        </Box>
        <Text
          size="xs"
          className="shrink-0 rounded-full border border-[var(--bellum-border)] px-2 py-0.5 text-[var(--bellum-text-secondary)]"
        >
          {t('actions.suggested')}
        </Text>
      </Box>

      {/* #2099.4 — L'OBJET MÉTIER, quand la carte en a un qui s'ouvre. La
          mention partagée porte déjà le nom, l'action « ouvrir » et le cas du
          nom manquant : la recopier ici en ferait une quinzième copie.
          #2097.21 — LE LOGO DU COMPTE OU L'AVATAR DE LA PERSONNE, à côté du
          nom. La maquette demande un « logo compte ou avatar personne » sur
          CHAQUE carte ; recette écran du 25/09 (`r6-verdicts.md`) : seul le
          compte en portait un, contact et talent restaient en texte seul.
          `CompanyAvatar` et `ContactAvatar` retombent déjà sur le monogramme
          / les initiales sans photo résolue — jamais une photo inventée pour
          l'occasion (même repli en démo, `logoUrl: null` à dessein). Une
          mission n'a ni logo ni personne : elle garde son icône actuelle,
          c'est-à-dire aucune ici — `ObjectMention` seule. */}
      {action.businessObject ? (
        <Box className="flex items-center gap-1.5 pl-8">
          {action.businessObject.kind === 'account' ? (
            <CompanyAvatar
              name={action.businessObject.name ?? ''}
              logoUrl={action.businessObject.logoUrl}
              website={action.businessObject.website}
            />
          ) : action.businessObject.kind === 'contact' || action.businessObject.kind === 'talent' ? (
            <ContactAvatar name={action.businessObject.name} size="xs" />
          ) : null}
          <ObjectMention
            kind={action.businessObject.kind}
            id={action.businessObject.id}
            name={action.businessObject.name}
          />
        </Box>
      ) : null}

      {/* #3749.2 — le verdict de la grille de qualification de l'espace,
          quand il existe pour le compte de cette carte. Disparaît sans
          grille active ou sans compte évalué (jamais un tiret ni un
          libellé nommant l'absence — cette carte est une LISTE, voir la
          doctrine en tête de fichier). */}
      {qualificationVerdict ? (
        <Box className="pl-8">
          <Text
            size="xs"
            weight="semibold"
            className={`tracking-wide ${QUALIFICATION_VERDICT_TEXT[qualificationVerdict]}`}
          >
            {t('card.qualification.verdict', { verdict: qualificationVerdict })}
          </Text>
        </Box>
      ) : null}

      {/* #2099.6 / #2099.7 — LE VERDICT, puis la CONSÉQUENCE MÉTIER. Le verdict
          est ce qu'il faut retenir ; la conséquence est ce qui arrive si on ne
          fait rien. Ni l'un ni l'autre ne s'invente : servis nuls, ils ne font
          aucune ligne. */}
      {action.verdict ? (
        <Box className="pl-8">
          <Text size="sm" weight="semibold">
            {t(strip(action.verdict.labelKey), action.verdict.labelVars)}
          </Text>
        </Box>
      ) : null}
      {action.consequence ? (
        <Box className="pl-8">
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t(strip(action.consequence.labelKey), action.consequence.labelVars)}
          </Text>
        </Box>
      ) : null}

      {/* LA PROVENANCE. Absente quand la carte ne sait pas dire d'où vient son
          fait : elle n'écrit alors rien, plutôt que « détecté par Bellum ». */}
      {action.fact ? (
        <Box className="pl-8">
          <Provenance
            source={action.fact.provenance.source}
            observedAt={action.fact.provenance.observedAt}
            detail={provenanceDetail(action.fact.provenance.capability, action.fact.provenance.observedAt, t)}
          />
        </Box>
      ) : null}

      {/* #3265.13 (épopée #3287) — LE DERNIER RÉSULTAT DÉCLARÉ, sur le compte
          que cette carte mentionne. Absent sans compte, et absent sans action
          faite qui porte une issue — aucune ligne « aucun résultat ». */}
      <AccountLastOutcomeLine accountId={accountId} />

      {/* #2099.43 à #2099.47 / #2095.81 — POURQUOI CE RANG. `domination` dit
          pourquoi cette carte passe devant la SUIVANTE dans le classement
          (une comparaison, pas un inventaire de ses propres axes — lacune
          mesurée le 24/09) ; les axes qu'on n'a PAS pu peser restent nommés,
          derrière un dépli qui les NOMME (#2097, correctif du 26/09 — un
          score n'est jamais nu, mais les nommer tous en dur allongeait la
          carte d'une ligne à chaque axe manquant, mesuré comme la ligne la
          plus large de la carte sur 375px), quelle que soit la raison du
          rang. */}
      {domination || axes.unevaluable.length ? (
        <Box className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-8">
          {domination?.kind === 'axes' ? (
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('card.axes.weighed', { list: domination.axes.map(axis => t(`card.axes.name.${axis}`)).join(', ') })}
            </Text>
          ) : domination?.kind === 'priority' ? (
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('card.axes.dominatesPriority')}
            </Text>
          ) : domination?.kind === 'confidence' ? (
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('card.axes.dominatesConfidence')}
            </Text>
          ) : null}
          {axes.unevaluable.length ? <UnevaluableAxesDisclosure axes={axes.unevaluable} /> : null}
        </Box>
      ) : null}

      {/* #2097 (correctif du 26/09) — TOUS LES GESTES DE LA CARTE SUR UNE
          SEULE RANGÉE QUI PASSE À LA LIGNE. Mesuré sur iPhone en prod le
          26/09 : « Pourquoi ? » vivait dans sa PROPRE ligne (`AskLaura`,
          séparée par `justify-between` de tout le reste), et la rangée
          suivante — CTA à gauche, badges/boutons à droite via
          `justify-between` — étirait chaque groupe à un bout de l'écran
          plutôt que de les laisser s'empiler compactement : chaque geste
          secondaire finissait seul sur sa ligne, entouré de vide. Un seul
          conteneur `flex-wrap gap-2` (8px) réunit désormais « Pourquoi ? »,
          le CTA principal, « Transformer en tâche », « Prioritaire pour
          moi » et les constats (confiance, temps estimé, préparation,
          échéance) : ils se replient ensemble, dans l'ordre où ils comptent.
          Chaque élément cliquable garde son plancher tactile de 44px
          (`pointer-coarse:min-h-11`, GA-30), déjà porté par `Button` et
          `AskLaura`, ajouté à la main sur le `<Link>`/`<button>` nus. */}
      <Box className="flex flex-wrap items-center gap-2 pl-8">
        {/* #2095.57 — la question part de CETTE carte, jamais de `/chat` vide. */}
        <AskLaura
          question={t('card.explain.question', { headline })}
          label={t('card.explain.label')}
          accountId={accountId}
        />
        {/* #2097.46 — CARTES UTILISABLES À UNE MAIN : le CTA principal est le
            geste le plus probable au pouce sur cette carte. */}
        {ctaKey && action.href ? (
          <Link
            to={action.href}
            className="flex items-center gap-1.5 pointer-coarse:min-h-11 text-[var(--bellum-text-accent)]"
          >
            <ArrowRight className="size-3.5" />
            <Text size="sm" weight="medium" color="text-[var(--bellum-text-accent)]">
              {t(ctaKey)}
            </Text>
          </Link>
        ) : ctaKey && canOpenConflict ? (
          <button
            type="button"
            onClick={() => onOpenConflict?.(action)}
            className="flex items-center gap-1.5 pointer-coarse:min-h-11 text-[var(--bellum-text-accent)]"
          >
            <ArrowRight className="size-3.5" />
            <Text size="sm" weight="medium" color="text-[var(--bellum-text-accent)]">
              {t(ctaKey)}
            </Text>
          </button>
        ) : null}
        {/* #2105.24 — « Transformer ce sujet en prochaine action ». N'existe
            que si l'appelant peut vraiment le porter (`ActionsBlock` seul
            le passe) — même doctrine que `onOpenConflict`. #2105.53 : déjà
            transformée, elle redevient un simple constat, pas un second
            bouton qui créerait un doublon. */}
        {onTransformToTask ? (
          transformedToTask ? (
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('card.transform.done')}
            </Text>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => onTransformToTask(action, headline)}>
              {t('card.transform.cta')}
            </Button>
          )
        ) : null}
        {/* #2397.7 — LE RETOUR UTILISATEUR. Un seul geste, jamais une
            pénalité : marquer engage l'axe `roleFit` pour CE genre de
            carte, le retirer l'efface — l'absence reste le défaut neutre.
            #2097.35 — la clé rejoue MOTION.confirm à chaque bascule. */}
        <motion.span
          key={String(roleFitEngaged)}
          initial={confirmMotion.initial as TargetAndTransition}
          animate={confirmMotion.animate as TargetAndTransition}
          transition={confirmMotion.transition as Transition}
        >
          <Button
            type="button"
            variant={roleFitEngaged ? 'secondary' : 'ghost'}
            size="sm"
            icon={Star}
            iconClassName={roleFitEngaged ? 'fill-current' : undefined}
            aria-pressed={roleFitEngaged}
            aria-label={t(roleFitEngaged ? 'card.roleFit.markedAria' : 'card.roleFit.markAria')}
            disabled={setRoleFit.isPending}
            onClick={() => setRoleFit.mutate({ kind: action.kind, engaged: !roleFitEngaged })}
          >
            {t(roleFitEngaged ? 'card.roleFit.marked' : 'card.roleFit.mark')}
          </Button>
        </motion.span>
        {/* #2099.11 — LA CONFIANCE, en niveau nommé. Jamais un pourcentage :
            « 82 % » se lit comme une chance de réussite. */}
        {action.confidence ? (
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t(`card.confidence.${action.confidence}`)}
          </Text>
        ) : null}
        {/* #2099.12 — LE TEMPS ESTIMÉ. Le contrat refuse `0` : « 0 min » est
            « non mesuré » écrit comme un chiffre. Absent, aucune ligne. */}
        {action.estimatedMinutes ? (
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('card.estimatedTime', { count: action.estimatedMinutes })}
          </Text>
        ) : null}
        {/* « Préparation disponible » n'apparaît QUE s'il y a quelque chose
            de prêt. Une carte sans artefact ne montre pas le bloc — écrire
            « rien de préparé » sur cinq cartes ajouterait cinq lignes de
            bruit à un écran qui se lit debout. */}
        {action.preparedArtifacts.length ? (
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('actions.prepared')}
          </Text>
        ) : null}
        {/* CE QUI est prêt, et non seulement QU'IL Y A quelque chose de prêt.
            Le serveur compose déjà l'étiquette de chaque artefact et son
            compte (`labelKey` + `labelVars`) ; sans cette ligne, l'écran
            jetait les deux et le producteur d'artefacts ne servait à rien. */}
        {action.preparedArtifacts.map(artifact => {
          const label = t(strip(artifact.labelKey), artifact.labelVars)
          // #2106.35 — SEULE la famille `meeting_prep` a un écran RÉEL où
          // atterrir (le brief de rendez-vous, `MeetingPrepDialog`) : son
          // artefact garde `href: null` côté contrat (l'objet n'est pas une
          // URL), donc la porte passe par ce callback plutôt que par `Link`.
          // Les autres genres restent un CONSTAT — même doctrine que
          // `href: null` ailleurs sur cette carte.
          // #2095.12 (épopée #2993) — `meeting_no_followup` ouvre le MÊME
          // dialogue, même raison : un rendez-vous déjà TERMINÉ n'a pas plus
          // d'écran dédié qu'un rendez-vous à venir.
          if ((action.kind === 'meeting_prep' || action.kind === 'meeting_no_followup') && onOpenMeetingPrep) {
            return (
              <button
                key={artifact.id}
                type="button"
                onClick={() => onOpenMeetingPrep(action.id)}
                className="w-fit text-left text-xs text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11"
              >
                {label}
              </button>
            )
          }
          return (
            <Text key={artifact.id} size="xs" className="text-[var(--bellum-text-secondary)]">
              {label}
            </Text>
          )
        })}
        {expires ? (
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('actions.expires', { date: expires })}
          </Text>
        ) : null}
      </Box>

      {/* #2099.17-.32 — Reporter / Pas pertinent / Déjà traité : personnels,
          jamais une écriture sur l'objet source. */}
      <Box className="pl-8">
        <CardDispositionControls action={action} />
      </Box>
    </motion.div>
  )
}

/**
 * #2097 (correctif du 26/09) — LES AXES NON ÉVALUABLES, DÉPLIÉS À LA DEMANDE.
 *
 * Même mécanique que `SourcesDisclosure` sur `BriefingPage.tsx` (GA-26 — un
 * seul patron de repli) : un `<button type="button">`, jamais un
 * `<div onClick>`, avec `aria-expanded` et le contenu monté seulement une
 * fois ouvert. Fermé par défaut : le COMPTE suffit à lire « ce rang n'a pas
 * pu peser sur tout » ; les NOMMER reste possible d'un tap, ce que la
 * doctrine exige (« un score n'est jamais nu »), sans allonger la carte par
 * défaut d'une ligne par axe manquant.
 */
function UnevaluableAxesDisclosure({ axes }: { axes: string[] }) {
  const { t } = useTranslation('briefing')
  const [open, setOpen] = useState(false)
  return (
    <Box className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="flex w-fit items-center gap-1 pointer-coarse:min-h-11 text-xs text-[var(--bellum-text-secondary)] underline underline-offset-2"
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
        )}
        {t('card.axes.notEvaluableCount', { count: axes.length })}
      </button>
      {open ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('card.axes.notEvaluable', { list: axes.map(axis => t(`card.axes.name.${axis}`)).join(', ') })}
        </Text>
      ) : null}
    </Box>
  )
}

/** Le web retire le préfixe de namespace avant de traduire. */
function strip(labelKey: string): string {
  return labelKey.replace(/^briefing\./, '')
}

/**
 * Une date ISO rendue dans la langue de l'utilisateur, ou `null`.
 *
 * `null` en entrée rend `null` en sortie — jamais la date du jour. C'est le
 * cœur de la règle : « non mesuré » n'est ni « 0 » ni « aujourd'hui ».
 */
function formatDate(iso: string | null, language: string): string | null {
  if (!iso) return null
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return null
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(parsed))
}

/**
 * Ce que la provenance ajoute à la source et à la date : la CAPACITÉ, et — si
 * la date manque — le fait qu'elle manque. Un blanc se lirait « on ne sait
 * pas si c'est récent » ; « date inconnue » se lit, se conteste, et surtout ne
 * se confond pas avec aujourd'hui.
 */
function provenanceDetail(
  capability: BriefingFactCapability,
  observedAt: string | null,
  t: (key: string) => string,
): string {
  const name = t(`source.capability.${capability}`)
  return observedAt ? name : `${name} · ${t('actions.dateUnknown')}`
}
