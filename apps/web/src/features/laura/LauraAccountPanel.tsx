import { useCallback, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import {
  ACCOUNT_PAIN_INTERVENTION_KEY,
  signalAge,
  type AccountResourceMeasure,
  type AccountSuggestion,
  type AccountSuggestionFact,
  type AccountVerdict,
  type LauraContextFacet,
  type LauraPageContext,
} from '@bellum/contracts'
import { Button, MOTION, Text } from '@bellum/ui'
import { useLaura } from './useLaura'

/**
 * LAURA SUR UN DOSSIER DE COMPTE — la surface contextuelle (maquette SOL6 n°6).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE N'EST PAS UN SECOND CHAT, ET CE N'EST PAS UNE SECONDE LAURA
 * ─────────────────────────────────────────────────────────────────────────────
 * Le tome 7 §48 appelle « risque technique n°1 du programme » le cas où chaque
 * écran implémente sa propre logique d'interruption. Ce panneau est donc une
 * SURFACE du même moteur :
 *
 *  · il passe par `useLaura` — la porte unique, gardée par GA-39 ;
 *  · il ne décide RIEN. Le budget d'interruption, le retrait, les vingt
 *    minutes, le plafond du jour, le refus à trente jours : tout vit côté
 *    serveur, et onze tests le rejouent avec la clé de ce dossier
 *    (`laura.service.spec.ts`) ;
 *  · sa zone de saisie n'ouvre AUCUNE conversation. Elle passe la question au
 *    copilote, avec le compte déjà en portée et le texte PRÉ-REMPLI. Un second
 *    fil de messages ici serait deux moteurs de conversation dans le même
 *    produit — « deux fois la dette et deux vérités possibles » (D44).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL NE LIT PAS `presentationFor`
 * ─────────────────────────────────────────────────────────────────────────────
 * La table des formes (`presentation.ts`) décrit des conteneurs FLOTTANTS —
 * `fixed`, en bas à droite ou en tiroir. Ce panneau est une COLONNE de l'écran :
 * lire son `container` le décrocherait de la page pour le coller au coin. Ce
 * qu'il partage avec elle, c'est le budget de texte du format `panel`, qui est
 * LIBRE — et c'est le bon état ici, parce que la phrase affichée n'est pas celle
 * du catalogue mais une phrase COMPOSÉE à partir des faits que le serveur
 * rapporte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE VISAGE DE LAURA
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ Ce composant NE DESSINE AUCUN AVATAR. Louis a tranché le 01/09 que Laura en
 * a un, et il est livré ailleurs. La place lui est laissée par la prop
 * {@link LauraAccountPanelProps.avatar} : tant qu'elle n'est pas passée, l'en-
 * tête se lit très bien sans — un cercle vide serait pire qu'un cercle absent.
 */

type LauraAccountPanelProps = {
  /** Le dossier ouvert. C'est lui qui distingue cette surface de la carte de
   *  coin, et qui empêche les deux de se voler l'intervention. */
  accountId: string
  /** Le nom de l'entreprise, pour la phrase composée. */
  companyName: string
  /**
   * Ce que « Préparer » ouvre. Passé par l'écran plutôt que décidé ici : ce
   * panneau n'a pas à connaître les onglets d'un dossier de compte, et un jour
   * où « préparer » mènera ailleurs, c'est l'écran qui le dira.
   */
  onPrepare: () => void
  /**
   * Le visage de Laura, quand il est livré. Rien n'est dessiné en son absence.
   * Voir le §« LE VISAGE DE LAURA » ci-dessus.
   */
  avatar?: ReactNode
  /** #2123.56 — la section du dossier d'où Laura est ouverte, dans la langue
   *  active. Absente : le contexte ne la nomme pas. */
  originSection?: string
  /** #2123.56 — le périmètre visé que lit le dossier (`recommended_scope`).
   *  `null` = non lu : il ne part pas, ni vide ni deviné. */
  perimeter?: string | null
  /** #2123.56 — le nombre de sources tracées du dossier. `null` = non mesuré :
   *  il ne part pas — « 0 source » serait un zéro qui ment. Les NOMS des sources
   *  ne partent jamais : certains sont nos fournisseurs, qu'aucun prompt ne nomme. */
  sourceCount?: number | null
  /** #2123.51 — le verdict du dossier tel que l'écran l'affiche. `null` = non
   *  lu : la suggestion « prudent » ne se propose pas. */
  verdict?: AccountVerdict | null
}

/**
 * #2123.50-.55 — les suggestions FIGÉES du module. Chacune pré-remplit une
 * question que le commercial relit avant d'envoyer.
 *
 * #2123.51 — « Explique pourquoi ce compte est prudent » n'est PAS dans cette
 * liste : elle AFFIRME un verdict. Elle ne se propose que sur un dossier dont le
 * verdict est PRUDENT (`verdict`), jamais sur un GO, un NO-GO ou un verdict non
 * lu — la question serait fausse.
 */
const ACCOUNT_SUGGESTION_KEYS = [
  'summarizeStrategy',
  'findAnotherDoor',
  'prepareFirstMessage',
  'compareToReference',
  'turnIntoPlan',
] as const

type AccountSuggestionKey = (typeof ACCOUNT_SUGGESTION_KEYS)[number] | 'explainCautious'

/** #2123.51 — la suggestion « prudent » prend sa place du registre (après la stratégie). */
function suggestionKeysFor(verdict: AccountVerdict | null): readonly AccountSuggestionKey[] {
  if (verdict !== 'PRUDENT') return ACCOUNT_SUGGESTION_KEYS
  const [first, ...rest] = ACCOUNT_SUGGESTION_KEYS
  return [first, 'explainCautious', ...rest]
}

/** Bornes du contrat `lauraPageContextSchema` (libellé 160, valeur 160). */
const CONTEXT_TEXT_MAX = 160

export function LauraAccountPanel({
  accountId,
  companyName,
  onPrepare,
  avatar,
  originSection,
  perimeter = null,
  sourceCount = null,
  verdict = null,
}: LauraAccountPanelProps) {
  const { t } = useTranslation('laura')
  const navigate = useNavigate()
  const { intervention, accountSuggestion, act, refuse } = useLaura('block', accountId)
  const [explained, setExplained] = useState(false)
  const [question, setQuestion] = useState('')
  const explanationId = useId()

  const context = useMemo(
    () => accountEntryContext({ t, accountId, companyName, originSection, perimeter, sourceCount }),
    [t, accountId, companyName, originSection, perimeter, sourceCount],
  )

  // #2123.56 — une seule porte vers Laura : le compte en portée, la question
  // PRÉ-REMPLIE (jamais envoyée) et le contexte du dossier.
  const openLaura = useCallback(
    (prompt: string) => navigate({ to: '/chat', search: { accountId, prompt, context } }),
    [accountId, context, navigate],
  )

  const prepare = useCallback(() => {
    // L'ORDRE compte : on enregistre la réaction AVANT d'ouvrir le plan. Le
    // geste a déjà eu lieu à l'écran ; ne pas avoir pu l'enregistrer retarde un
    // retrait, alors que ne pas ouvrir le plan casse le geste.
    act()
    onPrepare()
  }, [act, onPrepare])

  const ask = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const asked = question.trim()
      // Une question vide ne va nulle part : ouvrir le copilote sur rien ferait
      // perdre l'écran sans rien avoir demandé.
      if (!asked) return
      // `prompt` PRÉ-REMPLIT et n'envoie pas — le commercial relit avant
      // d'envoyer. `ask` enverrait, et il est réservé à la bibliothèque de
      // commandes, où la phrase exacte est affichée sous le libellé.
      openLaura(asked)
    },
    [openLaura, question],
  )

  return (
    <section
      aria-label={t('accountPanel.label')}
      /* Largeur laissée au CONTENEUR : ce panneau vit dans la colonne de droite
         du dossier, qui décide déjà de sa largeur. La lui imposer ici ferait
         deux réglages pour la même chose, et l'un des deux gagnerait au hasard
         du point de rupture. `min-w-0` reste indispensable — `min-width: auto`
         sur un enfant de flex est le premier responsable des débordements
         horizontaux. */
      className="flex w-full min-w-0 flex-col gap-4 rounded-2xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-5"
    >
      <header className="flex min-w-0 items-center gap-3">
        {avatar}
        <div className="min-w-0">
          {/* #2123.49 — le module dit ce qu'on y fait, pas seulement qui parle. */}
          <Text element="h2" size="lg" weight="semibold">
            {t('accountPanel.title')}
          </Text>
          {/* ⚠️ « copilote », jamais « directeur commercial » : le dépôt gagne
              contre la maquette sur les contradictions (D82). « Laura » est un
              NOM, « copilote » est le nom commun de la CATÉGORIE. */}
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('accountPanel.role')}
          </Text>
        </div>
      </header>

      {/* Le silence est un format à part entière : quand le serveur n'a rien à
          dire, il n'y a NI bulle, NI espace réservé, NI « tout va bien ». */}
      {intervention ? (
        <motion.div
          {...MOTION.reveal}
          data-testid="laura-account-suggestion"
          /* ⚠️ `--accent-soft-*` et pas `--bellum-primary-*` : la gamme primaire
             n'a AUCUNE nuance fixe qui passe AA des deux côtés (500 → 5,78:1 en
             clair, 2,68:1 en sombre). Le fond ici est à faible opacité, donc il
             se compose sur le fond du THÈME, et son texte doit suivre — d'où
             `--accent-soft-text`, qui est défini pour les deux thèmes. */
          className="rounded-xl border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] p-4"
        >
          <Text
            element="p"
            size="xs"
            weight="semibold"
            className="mb-2 uppercase tracking-wide text-[var(--accent-soft-text)]"
          >
            {t('accountPanel.suggestedBy')}
          </Text>
          <Text element="p" size="sm" weight="medium" className="text-[var(--accent-soft-text)]">
            {intervention.key === ACCOUNT_PAIN_INTERVENTION_KEY
              ? painSentence({ companyName, suggestion: accountSuggestion, t })
              : suggestionSentence({ companyName, suggestion: accountSuggestion, t })}
          </Text>
          <Text element="p" size="sm" className="mt-2 text-[var(--bellum-text-accent)]">
            {/* #3939.3 — la douleur est une hypothèse : l'offre dit « à tester ». */}
            {t(intervention.key === ACCOUNT_PAIN_INTERVENTION_KEY ? 'accountPanel.painOffer' : 'accountPanel.offer')}
          </Text>
        </motion.div>
      ) : null}

      {intervention ? (
        <div className="flex flex-col gap-2">
          <Button variant="violet" onClick={prepare}>
            {t('accountPanel.prepare')}
          </Button>
          <Button
            variant="light"
            onClick={() => setExplained(open => !open)}
            aria-expanded={explained}
            aria-controls={explanationId}
          >
            {t('accountPanel.why')}
          </Button>
          {/* « Pas maintenant » refuse la PROPOSITION — pas Laura. Le §5.3
              distingue les deux, et sans ce bouton la seule façon de faire
              taire une suggestion serait de couper l'assistante entière. */}
          <Button variant="ghost" size="sm" onClick={refuse}>
            {t('notNow')}
          </Button>
        </div>
      ) : null}

      {explained && intervention ? (
        <motion.div {...MOTION.reveal} id={explanationId}>
          <SuggestionEvidence suggestion={accountSuggestion} />
        </motion.div>
      ) : null}

      {/* #2123.50-.55 — les suggestions figées. Comme la question libre, elles
          restent là quand Laura se tait : ce sont des gestes de l'utilisateur,
          pas des interruptions. */}
      <div role="group" aria-label={t('accountPanel.suggestions.label')} className="flex min-w-0 flex-wrap gap-2">
        {suggestionKeysFor(verdict).map(key => {
          const label = t(`accountPanel.suggestions.${key}`)
          return (
            <Button
              key={key}
              type="button"
              variant="light"
              size="sm"
              // #2583 — le titre du panneau tient dans 280 px, ce n'était pas
              // la cause : `buttonVariants` pose `shrink-0` SANS CONDITION, et
              // `min-w-0` ne l'annule pas (ce sont deux propriétés CSS
              // différentes). Un item qui ne peut jamais rétrécir garde sa
              // largeur max-content — `whitespace-normal` n'a alors jamais
              // l'occasion de faire wrap le texte, et le bouton déborde du
              // panneau. `shrink` (flex-shrink: 1) gagne sur `shrink-0` via
              // tailwind-merge (dernier arrivé sur la même propriété) : c'est
              // lui qui rend `whitespace-normal` effectif.
              className="h-auto min-w-0 shrink whitespace-normal text-left"
              onClick={() => openLaura(t('accountPanel.suggestionPrompt', { suggestion: label, company: companyName }))}
            >
              {label}
            </Button>
          )
        })}
      </div>

      {/* La porte vers le copilote. Elle reste ouverte même quand Laura se tait :
          poser une question n'est pas une interruption, c'est un geste. */}
      <form onSubmit={ask} className="mt-auto flex items-center gap-2">
        <label className="sr-only" htmlFor={`${explanationId}-ask`}>
          {t('accountPanel.askLabel')}
        </label>
        <input
          id={`${explanationId}-ask`}
          type="text"
          value={question}
          onChange={event => setQuestion(event.target.value)}
          placeholder={t('accountPanel.askPlaceholder')}
          className="min-w-0 flex-1 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-2 text-sm text-[var(--bellum-text-primary)] placeholder:text-[var(--bellum-text-secondary)]"
        />
        <Button type="submit" size="icon" variant="violet" aria-label={t('accountPanel.askSubmit')}>
          <ArrowRight className="size-4" />
        </Button>
      </form>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  CE QUI A PRODUIT LA SUGGESTION                                     */
/* ------------------------------------------------------------------ */

/**
 * « Pourquoi cette suggestion ? » — les faits, leurs sources, leurs dates.
 *
 * ⚠️ Ce n'est PAS décoratif. Une suggestion qu'on ne peut pas décomposer est une
 * boîte noire, et le dépôt en refuse (`ScoreWithAxes`, `Provenance`). Une source
 * ABSENTE se dit ; elle ne s'invente pas, parce qu'une source inventée se cite.
 */
function SuggestionEvidence({ suggestion }: { suggestion: AccountSuggestion | null }) {
  const { t } = useTranslation('laura')
  if (!suggestion) {
    // Le serveur n'a rapporté aucun fait : on le DIT, plutôt que de rendre une
    // explication vide qui ressemblerait à « il n'y a rien à expliquer ».
    return (
      <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('accountPanel.evidence.none')}
      </Text>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <Text element="h3" size="sm" weight="semibold">
        {t('accountPanel.evidence.title')}
      </Text>
      <ul className="flex flex-col gap-3">
        {suggestion.facts.map((fact, index) => (
          <li key={`${fact.kind}-${index}`} className="border-l-2 border-[var(--bellum-border)] pl-3">
            {fact.kind === 'pain_hypothesis' ? (
              <Text element="p" size="xs" weight="semibold" className="mb-1 text-[var(--bellum-text-secondary)]">
                {t('accountPanel.evidence.painHypothesis')}
              </Text>
            ) : null}
            <Text element="p" size="sm">
              {fact.statement ?? t('accountPanel.evidence.noStatement')}
            </Text>
            {/* #3939.3 — l'hypothèse n'a pas de provenance propre : ses signaux la portent. */}
            {fact.kind === 'pain_hypothesis' ? null : (
              <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
                {provenanceLine(fact, t)}
              </Text>
            )}
          </li>
        ))}
      </ul>
      {/* #3939.3 — `null` : la suggestion ne croise pas le vivier, rien à dire de lui. */}
      {suggestion.resource ? <ResourceLine resource={suggestion.resource} /> : null}
    </div>
  )
}

/**
 * La provenance d'un fait — la source ET la date, ou l'aveu qu'elles manquent.
 *
 * Composée ICI et non côté serveur : une phrase écrite en base est
 * nécessairement dans UNE langue, et c'est le défaut déjà corrigé sur le coût de
 * l'intercontrat. L'écran connaît la langue ; le serveur ne rend que les faits.
 */
function provenanceLine(fact: AccountSuggestionFact, t: TFunction<'laura'>): string {
  if (fact.kind === 'pain_signal') return observedLine(fact.observedOn, t)
  const source = fact.source ?? t('accountPanel.evidence.sourceUnknown')
  if (!fact.observedOn) return source
  return t('accountPanel.evidence.provenance', { source, date: fact.observedOn })
}

/**
 * #3939.3 — l'ÂGE d'un signal de douleur, à la précision que sa date porte
 * (`signalAge`, contrat — la même lecture que le détecteur). Aucune source
 * nommée : le fait et sa date suffisent. Un signal non daté n'arrive jamais ici
 * (le détecteur ne l'a pas retenu) ; s'il arrivait, la date brute seule se dit.
 */
function observedLine(observedOn: string | null, t: TFunction<'laura'>): string {
  const date = observedOn ?? ''
  const age = signalAge(observedOn, new Date())
  if (!age) return date
  if (age.unit === 'days') {
    return age.value === 0
      ? t('accountPanel.evidence.observed.today', { date })
      : t('accountPanel.evidence.observed.days', { count: age.value, date })
  }
  return age.value === 0
    ? t('accountPanel.evidence.observed.thisMonth', { date })
    : t('accountPanel.evidence.observed.months', { count: age.value, date })
}

/**
 * La ressource croisée — et la règle qui la porte : **« non mesuré » n'est
 * jamais « 0 »**.
 *
 *  · vivier ILLISIBLE ⇒ l'encadré se TAIT et dit pourquoi. Aucun chiffre.
 *  · vivier LISIBLE et vide ⇒ il dit zéro. C'est un fait, et un fait se dit.
 *  · et dans les deux cas mesurés, il dit combien de fiches n'ont RIEN déclaré :
 *    sans ce second nombre, « 0 disponible » sur douze fiches muettes se lirait
 *    « personne n'est libre » au lieu de « personne ne l'a dit ».
 */
function ResourceLine({ resource }: { resource: AccountResourceMeasure }) {
  const { t } = useTranslation('laura')
  if (resource.state === 'unmeasured') {
    return (
      <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('accountPanel.resource.unreadable')}
      </Text>
    )
  }
  return (
    <div data-testid="laura-account-resource">
      {/* Une couleur SÉMANTIQUE ne porte pas de texte : le vert passe par
          `--success-soft-text`, défini pour les deux thèmes. */}
      <Text element="p" size="sm" weight="medium" className="text-[var(--success-soft-text)]">
        {t('accountPanel.resource.available', { count: resource.availableNow })}
      </Text>
      {resource.undeclared > 0 ? (
        <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
          {t('accountPanel.resource.undeclared', { count: resource.undeclared })}
        </Text>
      ) : null}
    </div>
  )
}

/**
 * #2123.56 — le contexte du dossier, dans la forme du CONTRAT (`LauraPageContext`).
 *
 * Seul ce qui est LU part : une section absente, un périmètre non lu ou des
 * sources non mesurées ne deviennent ni une ligne vide ni un « 0 ».
 */
function accountEntryContext({
  t,
  accountId,
  companyName,
  originSection,
  perimeter,
  sourceCount,
}: {
  t: TFunction<'laura'>
  accountId: string
  companyName: string
  originSection: string | undefined
  perimeter: string | null
  sourceCount: number | null
}): LauraPageContext {
  const facets: LauraContextFacet[] = []
  const section = originSection?.trim()
  if (section) facets.push({ label: t('accountPanel.context.section'), value: bounded(section) })
  const scope = perimeter?.trim()
  if (scope) facets.push({ label: t('accountPanel.context.perimeter'), value: bounded(scope) })
  if (typeof sourceCount === 'number' && sourceCount > 0) {
    facets.push({
      label: t('accountPanel.context.sources'),
      value: t('accountPanel.context.sourcesValue', { count: sourceCount }),
    })
  }
  return {
    kind: 'account',
    label: bounded(companyName.trim() || accountId),
    entityId: accountId,
    facets,
    state: 'ready',
  }
}

function bounded(value: string): string {
  return value.length <= CONTEXT_TEXT_MAX ? value : `${value.slice(0, CONTEXT_TEXT_MAX - 1)}…`
}

/**
 * La phrase de la bulle — « avant ta question ».
 *
 * Elle se compose des FAITS et jamais d'un texte reçu du serveur. Sans fait
 * rapporté, on retombe sur la phrase du catalogue, qui reste vraie : le
 * croisement a bien eu lieu, on ne peut simplement pas le détailler.
 */
function suggestionSentence({
  companyName,
  suggestion,
  t,
}: {
  companyName: string
  suggestion: AccountSuggestion | null
  t: TFunction<'laura'>
}): string {
  const statement = suggestion?.facts.find(fact => fact.kind === 'hiring_signal')?.statement
  const resource = suggestion?.resource
  if (!statement) return t('interventions.account_hiring_with_available_bench')
  if (resource?.state === 'measured' && resource.availableNow > 0) {
    return t('accountPanel.headline.withResource', {
      company: companyName,
      signal: statement,
      count: resource.availableNow,
    })
  }
  return t('accountPanel.headline.signalOnly', { company: companyName, signal: statement })
}

/**
 * #3939.3 — la phrase de la douleur : l'HYPOTHÈSE, telle que l'analyse l'a
 * écrite. Sans elle, la phrase du catalogue (toujours vraie) — jamais une
 * phrase de recrutement ni un chiffre de vivier.
 */
function painSentence({
  companyName,
  suggestion,
  t,
}: {
  companyName: string
  suggestion: AccountSuggestion | null
  t: TFunction<'laura'>
}): string {
  const hypothesis = suggestion?.facts.find(fact => fact.kind === 'pain_hypothesis')?.statement
  if (!hypothesis) return t('interventions.account_pain_with_dated_signal')
  return t('accountPanel.headline.pain', { company: companyName, hypothesis })
}
