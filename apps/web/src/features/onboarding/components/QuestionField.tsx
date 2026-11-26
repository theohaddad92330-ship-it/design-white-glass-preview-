import { useMemo, useState, type KeyboardEvent } from 'react'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { normalizeExpertiseFreeText } from '@bellum/contracts'
import { Input, Text } from '@bellum/ui'
import { AnswerReformulation } from '@/features/onboarding/components/AnswerReformulation'
import { ChoiceList } from '@/features/onboarding/components/ChoiceList'
import { ChoiceRow } from '@/features/onboarding/components/ChoiceRow'
import { CrmVocabularyHint } from '@/features/onboarding/components/CrmVocabularyHint'
import { TagsField } from '@/features/onboarding/components/TagsField'
import { recommendationFor } from '@/features/onboarding/lib/question-recommendations'
import type { Choice, Question } from '@/features/onboarding/lib/questions'
import { countedAgainstMax } from '@/features/onboarding/lib/validation'

type Props = {
  question: Question
  value: string | string[]
  onChange: (next: string | string[]) => void
  /**
   * #2024.3 — les réponses DÉJÀ DONNÉES, dont une recommandation peut se
   * fonder (`recommendationFor`). Optionnel : sans elles, aucune
   * recommandation ne s'affiche — jamais une option mise en tête sans source.
   */
  answers?: Readonly<Record<string, unknown>>
  /**
   * Le parcours question par question donne le focus au champ texte ; une page
   * qui en pose dix (le cadrage V23) ne le fait pas — sinon la page saute au dernier.
   */
  autoFocus?: boolean
}

/**
 * Beyond this many options we surface a search input above the list — for the
 * `multi`/`multi-grouped` kinds ALREADY, and (#2088.2/.3) for `single` too: a
 * SHORT single choice reads as a grid of cards, a LONG one as a searchable
 * list. One threshold, one place (GA-26) — not a second magic number invented
 * for `single`.
 */
// #2087.9 / #2088.3 — réparation 18/09 : exportée pour que la garde de
// couverture du catalogue réel (`lib/questions/card-icons-and-long-
// descriptions-coverage.test.ts`) classe CARTE/LONG comme ce composant le
// fait vraiment, jamais un second seuil deviné à côté (GA-26).
export const SEARCH_THRESHOLD = 8

export function QuestionField({ question, value, onChange, answers, autoFocus = true }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <QuestionControl question={question} value={value} onChange={onChange} answers={answers} autoFocus={autoFocus} />
      {/* #2088.28 — bouton discret « Pourquoi cette question ? » : absent tant
          que la question ne porte pas de `rationaleKey` (jamais un texte
          inventé pour combler le bouton). */}
      {question.rationaleKey && <RationaleDisclosure rationaleKey={question.rationaleKey} />}
    </div>
  )
}

function QuestionControl({ question, value, onChange, answers, autoFocus }: Props) {
  const { t } = useTranslation('onboarding')

  if (question.kind === 'text') {
    const current = typeof value === 'string' ? value : ''
    return (
      <div className="flex flex-col gap-2">
        <Input
          value={current}
          onChange={e => onChange(e.target.value)}
          placeholder={question.placeholder ? t(question.placeholder) : undefined}
          maxLength={120}
          autoFocus={autoFocus}
        />
        {/* #2088.20 — zone non intimidante : des suggestions cliquables plutôt
            qu'une page blanche. Cliquer EN FAIT la réponse réelle (même
            convention que `Choice.value`) ; ignorée, elle ne laisse aucune
            trace. Optionnel : absent tant qu'aucune question réelle n'en
            porte (cf. Question.suggestions, kind 'text'). */}
        {question.suggestions && question.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {question.suggestions.map(suggestion => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onChange(suggestion)}
                aria-pressed={current === suggestion}
                className="rounded-full border border-[var(--bellum-border)] bg-transparent px-3 py-1.5 text-xs text-[var(--bellum-text-secondary)] transition-colors hover:bg-[var(--bellum-bg-lighter)] pointer-coarse:min-h-11"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        {/* #2060.9 — « Reformuler avec Laura » : geste explicite, jamais un
            appel à la frappe. `t(question.label)` est le SEUL contexte envoyé
            au-delà de la réponse elle-même. */}
        <AnswerReformulation questionLabel={t(question.label)} value={current} onApply={onChange} />
      </div>
    )
  }

  if (question.kind === 'single') {
    return <SingleChoiceField question={question} value={value} onChange={onChange} />
  }

  if (question.kind === 'number') {
    const current = typeof value === 'string' ? value : ''
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={question.min ?? 0}
          value={current}
          onChange={e => onChange(e.target.value)}
          placeholder={question.placeholder ? t(question.placeholder) : undefined}
          className="max-w-40"
        />
        {/* #2088.12 — L'UNITÉ VISIBLE, jamais implicite : un nombre nu ne dit
            pas ce qu'il compte. */}
        <Text element="span" size="sm" className="text-[var(--bellum-text-secondary)]">
          {t(question.unitKey)}
        </Text>
      </div>
    )
  }

  if (question.kind === 'tags') {
    return (
      <TagsField
        values={Array.isArray(value) ? value : []}
        onChange={onChange}
        placeholder={question.placeholder ? t(question.placeholder) : undefined}
        max={question.max}
        // #2088.19 — optionnel, absent tant qu'aucune question réelle ne
        // porte `exampleKey` (cf. Question.exampleKey, kind 'tags').
        example={question.exampleKey ? t(question.exampleKey) : undefined}
        // #2540 — répercute `question.optional` : la réassurance « tu peux
        // laisser ce champ vide » n'a de sens QUE si la question ne bloque
        // vraiment pas « Continuer » (#2059.7, `isSatisfied`).
        optional={question.optional}
      />
    )
  }

  return <MultiChoiceField question={question} value={value} onChange={onChange} answers={answers} />
}

/** #2088.28 — révèle `rationaleKey` au clic ; pas d'animation (aucune n'est due). */
function RationaleDisclosure({ rationaleKey }: { rationaleKey: string }) {
  const { t } = useTranslation('onboarding')
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="text-xs font-medium text-[var(--bellum-text-accent)] hover:underline"
      >
        {t('questionField.whyThisQuestion')}
      </button>
      {open && (
        <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
          {t(rationaleKey)}
        </Text>
      )}
    </div>
  )
}

type SingleQuestion = Extract<Question, { kind: 'single' }>

/**
 * #2088.1/.2/.3 — un choix unique COURT (≤ `SEARCH_THRESHOLD`) se lit d'un
 * coup d'œil : une grille de cartes plutôt qu'une liste verticale identique à
 * celle des autres kinds. Un choix LONG (`main_sales_pain`, 9 options) garde
 * la liste, mais gagne une recherche — comme `multi` la gagne déjà au même
 * seuil.
 */
function SingleChoiceField({ question, value, onChange }: { question: SingleQuestion } & Omit<Props, 'question'>) {
  const { t } = useTranslation('onboarding')
  const selected = typeof value === 'string' ? value : ''
  const labelOf = (choice: Choice): string => (choice.labelKey ? t(choice.labelKey) : choice.value)

  if (question.choices.length <= SEARCH_THRESHOLD) {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {question.choices.map(choice => (
          <ChoiceRow
            key={choice.value}
            layout="card"
            label={labelOf(choice)}
            selected={selected === choice.value}
            onClick={() => onChange(choice.value)}
            // #2087.9 — icône + exemple : optionnels, absents tant qu'aucun
            // choix réel ne les porte (cf. Choice.iconKey/exampleKey).
            iconKey={choice.iconKey}
            description={choice.descriptionKey ? t(choice.descriptionKey) : undefined}
            example={choice.exampleKey ? t(choice.exampleKey) : undefined}
          />
        ))}
      </div>
    )
  }

  return <SearchableSingleChoiceField question={question} selected={selected} onChange={onChange} labelOf={labelOf} />
}

function SearchableSingleChoiceField({
  question,
  selected,
  onChange,
  labelOf,
}: {
  question: SingleQuestion
  selected: string
  onChange: (next: string) => void
  labelOf: (choice: Choice) => string
}) {
  const { t } = useTranslation('onboarding')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const filtered = q === '' ? question.choices : question.choices.filter(c => labelOf(c).toLowerCase().includes(q))

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--bellum-text-muted)]" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('multiChoice.searchPlaceholder')}
          className="pl-9"
          maxLength={60}
        />
      </div>
      {filtered.length === 0 ? (
        <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
          {t('multiChoice.noResults', { query })}
        </Text>
      ) : (
        <ChoiceList>
          {filtered.map(choice => (
            <ChoiceRow
              key={choice.value}
              label={labelOf(choice)}
              selected={selected === choice.value}
              onClick={() => onChange(choice.value)}
              // #2088.3 — choix unique LONG : une description sous le
              // libellé, optionnelle (cf. Choice.descriptionKey).
              description={choice.descriptionKey ? t(choice.descriptionKey) : undefined}
            />
          ))}
        </ChoiceList>
      )}
    </div>
  )
}

type MultiQuestion = Extract<Question, { kind: 'multi' | 'multi-grouped' }>

function MultiChoiceField({
  question,
  value,
  onChange,
  answers,
}: {
  question: MultiQuestion
  value: string | string[]
  onChange: (next: string | string[]) => void
  answers?: Readonly<Record<string, unknown>>
}) {
  const { t } = useTranslation('onboarding')
  const [query, setQuery] = useState('')
  // #2538 — brouillon de la saisie « Autre » EN COURS, distinct de `selected` :
  // le champ doit se vider après chaque ajout tout en gardant les entrées
  // libres déjà validées.
  const [otherDraft, setOtherDraft] = useState('')
  const selected = Array.isArray(value) ? value : []
  const max = question.max
  // #3709 — les domaines libres (« Autre ») ne comptent pas dans le plafond.
  const counted = countedAgainstMax(question, selected)
  const atMax = max != null && counted >= max

  // Même règle que le kind `single` : un choix codé (labelKey) affiche son
  // libellé traduit — et la RECHERCHE porte sur ce libellé, pas sur le code
  // machine (chercher « conformité » doit trouver RISK_COMPLIANCE_AML).
  const labelOf = (choice: Choice): string => (choice.labelKey ? t(choice.labelKey) : choice.value)

  const toggle = (val: string): void => {
    if (selected.includes(val)) {
      onChange(selected.filter(v => v !== val))
    } else if (!atMax) {
      onChange([...selected, val])
    }
  }

  const groups = useMemo<{ group?: string; items: Choice[] }[]>(
    () =>
      question.kind === 'multi-grouped'
        ? question.groups.map(g => ({ group: g.label, items: g.choices }))
        : [{ items: question.choices }],
    [question],
  )

  // "Autre" = any selected value not present in the predefined choices.
  const known = useMemo(() => new Set(groups.flatMap(g => g.items.map(i => i.value))), [groups])
  // #2538 — Ludovic (ESN d'ingénierie, call bêta 17/09) : « création d'un
  // seul domaine d'expertise quand on met des customs, pas possible d'en
  // créer plusieurs ». `otherValue` (singulier) ne gardait QU'UNE entrée
  // libre — `setOther` effaçait les précédentes avant de poser la nouvelle,
  // donc mécanique/automatisme/qualité/méthodes/génie civil perdait quatre
  // domaines sur cinq. Toutes les valeurs hors catalogue cohabitent
  // maintenant dans `selected`, chacune ajoutée/retirée individuellement —
  // même mécanisme Entrée/virgule qu'un champ `TagsField` (#2088.19).
  const otherValues = selected.filter(v => !known.has(v))
  // #2549.2 — retour Ludovic Marx (call bêta 17/09) : « cybersécu » /
  // « cyber-sécurité » / « Cybersécurité » saisis en « Autre » restaient trois
  // valeurs distinctes dans `expertise_areas`, invisibles l'une à l'autre.
  // `normalizeExpertiseFreeText` (#2549.3) est LE seul appelant réel de ce
  // repli — restreint à `expertise_areas` : les autres champs `allowOther`
  // (secteurs, freins, canaux) portent un axe différent (cf. le commentaire
  // dans `expertise-free-text-normalization.ts` — « génie civil » y est un
  // MÉTIER, pas un SECTEUR) et ne doivent jamais passer par cette liste
  // d'alias. Une entrée déjà ENREGISTRÉE (dans `value`, donc dans `selected`
  // avant cet ajout) n'est JAMAIS retouchée ici — une correction humaine déjà
  // confirmée gagne toujours, on ne réécrit rien dans son dos.
  const [normalizedNotice, setNormalizedNotice] = useState<{ input: string; canonical: string } | null>(null)
  const addOtherValue = (raw: string): void => {
    const trimmed = raw.trim()
    if (trimmed.length === 0) return
    const canonical = question.key === 'expertise_areas' ? normalizeExpertiseFreeText(trimmed) : trimmed
    if (selected.includes(canonical)) return
    onChange([...selected, canonical])
    // La normalisation qui change ce que quelqu'un a tapé SE VOIT : un
    // message nommé, pas un remplacement silencieux du texte saisi.
    setNormalizedNotice(canonical !== trimmed ? { input: trimmed, canonical } : null)
  }
  const removeOtherValue = (val: string): void => {
    onChange(selected.filter(v => v !== val))
  }
  const handleOtherKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      addOtherValue(otherDraft)
      setOtherDraft('')
      return
    }
    if (event.key === 'Backspace' && otherDraft === '' && otherValues.length > 0) {
      removeOtherValue(otherValues[otherValues.length - 1] as string)
    }
  }

  // #2088.26 — « Autre » propose le CATALOGUE avant de créer une valeur
  // libre : même idée que `SearchAutocomplete` (chercher, catégoriser,
  // choisir plutôt que retaper), sur le catalogue DÉJÀ chargé (`groups`) —
  // aucun second catalogue, aucun appel réseau (GA-26). Trois correspondances
  // au plus, jamais un choix déjà coché (il est déjà dans « Ta sélection »).
  const otherSuggestions = useMemo<Choice[]>(() => {
    const q = otherDraft.trim().toLowerCase()
    if (q.length < 2) return []
    const seen = new Set<string>()
    const matches: Choice[] = []
    for (const group of groups) {
      for (const item of group.items) {
        if (selected.includes(item.value) || seen.has(item.value)) continue
        if (!labelOf(item).toLowerCase().includes(q)) continue
        seen.add(item.value)
        matches.push(item)
        if (matches.length >= 3) return matches
      }
    }
    return matches
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `labelOf` se redéfinit à chaque rendu, `groups`/`selected` suffisent à invalider le memo.
  }, [otherDraft, groups, selected])

  const addOtherSuggestion = (value: string): void => {
    toggle(value)
    setOtherDraft('')
  }

  const totalOptions = groups.reduce((n, g) => n + g.items.length, 0)
  const showSearch = totalOptions > SEARCH_THRESHOLD

  /**
   * #2024.4 — les choix déjà cochés restent ÉPINGLÉS en tête d'une longue liste.
   *
   * Le geste qui révélait le manque : on coche cinq expertises sur vingt-une,
   * puis on tape « cloud » dans la recherche — et les cinq cases cochées
   * disparaissent de l'écran, parce que le filtre les exclut. Il n'existait
   * alors aucun moyen de relire sa réponse sans effacer sa recherche et
   * redescendre la liste.
   *
   * ⚠️ L'ordre de la liste, lui, ne bouge PAS : remonter la ligne qu'on vient
   * de cliquer déplacerait la cible sous le doigt au clic suivant.
   *
   * Seules les valeurs du CATALOGUE sont épinglées : une valeur libre (« Autre »)
   * est déjà lisible et modifiable dans son propre champ, l'épingler la
   * montrerait deux fois.
   */
  // #2024.5 — une question PRIORISÉE montre toujours sa sélection ordonnée,
  // même courte : c'est là que le rang se lit, et un rang qu'on n'affiche pas
  // ne trie rien. Pour toutes les autres, la règle d'avant ne bouge pas (la
  // liste épinglée n'a de sens qu'au-dessus du seuil de recherche).
  const pinned = showSearch || question.priority ? selected.filter(value => known.has(value)) : []
  const labelForValue = (value: string): string => {
    for (const group of groups) {
      for (const item of group.items) if (item.value === value) return labelOf(item)
    }
    return value
  }

  /**
   * #2088.9 — « Multi : ordre de priorité ». L'ordre d'insertion épingle déjà
   * une priorité implicite (premier coché = premier affiché), mais la
   * corriger sans décocher-recocher n'existait pas. On ne permute QUE la
   * sous-séquence des valeurs DU CATALOGUE (celles épinglées) — une valeur
   * "Autre" libre garde sa place absolue dans `selected`, elle n'est pas
   * épinglée (cf. commentaire au-dessus) donc pas réordonnable ici.
   */
  const reorderPinned = (index: number, direction: -1 | 1): void => {
    const target = index + direction
    if (target < 0 || target >= pinned.length) return
    const nextPinned = [...pinned]
    ;[nextPinned[index], nextPinned[target]] = [nextPinned[target], nextPinned[index]]
    let cursor = 0
    onChange(selected.map(v => (known.has(v) ? (nextPinned[cursor++] as string) : v)))
  }

  /**
   * #2024.3 — CE QU'ON MET EN TÊTE, ET D'OÙ ÇA VIENT.
   *
   * Les valeurs recommandées sortent d'une réponse ANTÉRIEURE de la personne
   * (`recommendationFor`, qui porte la décision et ce qui a été refusé). Deux
   * choses que ce bloc ne fait pas, et chacune est une décision :
   *  - il ne COCHE rien. On ordonne, la personne choisit ;
   *  - il ne s'affiche jamais sans nommer sa source — le libellé et la liste
   *    sortent du même `recommendation`, donc ils ne peuvent pas se séparer.
   * Ce qui est déjà coché n'est plus recommandé : « Ta sélection » le porte
   * déjà, et le remontrer ici le montrerait deux fois (loi 4).
   */
  const recommendation = useMemo(() => (answers ? recommendationFor(question, answers) : null), [question, answers])
  const recommended = recommendation?.values.filter(value => !selected.includes(value)) ?? []

  const q = query.trim().toLowerCase()
  const filteredGroups =
    q === ''
      ? groups
      : groups
          .map(g => ({ group: g.group, items: g.items.filter(i => labelOf(i).toLowerCase().includes(q)) }))
          .filter(g => g.items.length > 0)

  return (
    <div className="flex flex-col gap-5">
      {/* #2031.5 / #2045.5 — PROPOSE sans remplir : purement informatif, ce
          composant ne reçoit pas `onChange` et ne peut donc pas cocher une
          réponse à la place de la personne. Absent quand `question` ne porte
          pas `crmVocabularyField`, ou quand le CRM n'a rien à montrer. */}
      {question.crmVocabularyField && <CrmVocabularyHint field={question.crmVocabularyField} />}
      {/* R15N-10 — le texte libre « Autre » compte dans `selected` (donc dans le
          plafond) mais n'était pas épinglé ici : un dépassement causé par le
          champ libre montrait un compteur en 6/5 sans que « Ta sélection »
          montre le sixième élément. Il rejoint la liste, retirable comme les
          autres — SANS bouton de réordonnancement : sa place dans `selected`
          reste absolue (cf. `reorderPinned` ci-dessus), et il reste aussi
          modifiable dans son propre champ juste plus bas. */}
      {(pinned.length > 0 || otherValues.length > 0) && (
        <div className="flex flex-col gap-2">
          <Text element="p" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
            {t('multiChoice.yourSelection')}
          </Text>
          <ul aria-label={t('multiChoice.yourSelection')} className="flex flex-wrap gap-2">
            {pinned.map((value, index) => (
              <li key={value} className="flex items-center gap-1">
                {pinned.length > 1 && (
                  <span className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => reorderPinned(index, -1)}
                      disabled={index === 0}
                      aria-label={t('multiChoice.moveUp', { label: labelForValue(value) })}
                      className="flex items-center justify-center text-[var(--bellum-text-muted)] transition-colors hover:text-[var(--bellum-text-primary)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-[var(--bellum-text-muted)] pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                    >
                      <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => reorderPinned(index, 1)}
                      disabled={index === pinned.length - 1}
                      aria-label={t('multiChoice.moveDown', { label: labelForValue(value) })}
                      className="flex items-center justify-center text-[var(--bellum-text-muted)] transition-colors hover:text-[var(--bellum-text-primary)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-[var(--bellum-text-muted)] pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                    >
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => toggle(value)}
                  aria-label={t('multiChoice.removeSelection', { label: labelForValue(value) })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-1.5 text-sm text-[var(--bellum-text-primary)] transition-colors hover:bg-[var(--bellum-bg-lighter)] pointer-coarse:min-h-11"
                >
                  {/* #2024.5 — le RANG est dit, pas seulement impliqué par la
                      position : « Priorité 1 » se lit, une place dans une file
                      ne se lit pas. Le nom accessible du bouton reste celui du
                      geste (retirer), porté par `aria-label` juste au-dessus. */}
                  {question.priority && (
                    <span className="text-[var(--bellum-text-muted)]">
                      {t('multiChoice.priorityRank', { rank: index + 1 })}
                    </span>
                  )}
                  {labelForValue(value)}
                  <X className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />
                </button>
              </li>
            ))}
            {otherValues.map(value => (
              <li key={value} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => removeOtherValue(value)}
                  aria-label={t('multiChoice.removeSelection', { label: value })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-1.5 text-sm text-[var(--bellum-text-primary)] transition-colors hover:bg-[var(--bellum-bg-lighter)] pointer-coarse:min-h-11"
                >
                  {value}
                  <X className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* #2024.5 — LA RELANCE. Elle ne bloque rien, ne retire rien et ne
          propose aucun tri : le produit ne sait pas lequel des vingt choix
          compte vraiment, seule la personne le sait. Elle dit la seule chose
          qui soit vraie — au-delà du seuil, « prioritaire » ne trie plus — et
          rappelle que les flèches au-dessus servent à remonter les vrais. */}
      {question.priority && pinned.length > question.priority.nudgeAbove && (
        <Text element="p" size="xs" role="status" className="text-[var(--bellum-text-muted)]">
          {t('multiChoice.priorityNudge', { count: question.priority.nudgeAbove })}
        </Text>
      )}

      {/* #2024.3 — la SOURCE est nommée juste au-dessus des options qu'elle
          fonde : lue seule, « Recommandé » ne dit pas par qui ni d'après quoi,
          et c'est exactement ce qui rend une suggestion indistinguable d'une
          invention. Rien ici n'est coché — ce sont des boutons à cliquer. */}
      {recommendation && recommended.length > 0 && (
        <div className="flex flex-col gap-2">
          <Text element="p" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
            {t(recommendation.sourceLabelKey)}
          </Text>
          <ul aria-label={t(recommendation.sourceLabelKey)} className="flex flex-wrap gap-2">
            {recommended.map(value => (
              <li key={value}>
                <button
                  type="button"
                  onClick={() => toggle(value)}
                  disabled={atMax}
                  aria-label={t('recommendation.add', { label: labelForValue(value) })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--bellum-border)] bg-transparent px-3 py-1.5 text-sm text-[var(--bellum-text-secondary)] transition-colors hover:bg-[var(--bellum-bg-lighter)] disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:min-h-11"
                >
                  {labelForValue(value)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showSearch && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--bellum-text-muted)]" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('multiChoice.searchPlaceholder')}
            className="pl-9"
            maxLength={60}
          />
        </div>
      )}

      {filteredGroups.length === 0 ? (
        <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
          {t('multiChoice.noResults', { query })}
        </Text>
      ) : (
        filteredGroups.map(({ group, items }) => (
          <div key={group ?? 'flat'} className="flex flex-col gap-2">
            {group && (
              <Text element="p" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
                {t(group)}
              </Text>
            )}
            <ChoiceList>
              {items.map(choice => {
                const isSelected = selected.includes(choice.value)
                return (
                  <ChoiceRow
                    key={choice.value}
                    label={labelOf(choice)}
                    selected={isSelected}
                    disabled={!isSelected && atMax}
                    onClick={() => toggle(choice.value)}
                    // #2539 — même mécanisme que le `single` LONG (#2088.3) :
                    // une sélection MULTI a aussi besoin d'expliquer un choix
                    // dont le libellé seul ne suffit pas (Ludovic a hésité
                    // entre « assistance technique » et « régie »).
                    description={choice.descriptionKey ? t(choice.descriptionKey) : undefined}
                  />
                )
              })}
            </ChoiceList>
          </div>
        ))
      )}

      {question.allowOther && (
        <div className="flex flex-col gap-1.5">
          <Input
            value={otherDraft}
            onChange={e => {
              setOtherDraft(e.target.value)
              setNormalizedNotice(null)
            }}
            onKeyDown={handleOtherKeyDown}
            // #2538 — quitter le champ valide aussi le brouillon (même règle
            // que `TagsField`) : un utilisateur qui enchaîne Tab plutôt
            // qu'Entrée ne doit pas perdre la dernière valeur tapée.
            onBlur={() => {
              addOtherValue(otherDraft)
              setOtherDraft('')
            }}
            placeholder={t('multiChoice.otherPlaceholder')}
            maxLength={80}
          />
          {/* #2549.2 — la normalisation SE VOIT : on nomme ce qui a été tapé
              ET la valeur du catalogue qu'il a rejointe, jamais un
              remplacement muet. */}
          {normalizedNotice && (
            <Text element="p" size="xs" role="status" className="text-[var(--bellum-text-secondary)]">
              {t('multiChoice.otherNormalized', {
                input: normalizedNotice.input,
                canonical: normalizedNotice.canonical,
              })}
            </Text>
          )}
          {/* #2088.26 — suggestions du catalogue, avant de créer une valeur
              libre. `onMouseDown` empêche le `blur` du champ (qui commettrait
              le texte tapé comme entrée libre) de se déclencher avant le clic
              sur la suggestion — même geste qu'un combobox natif. */}
          {otherSuggestions.length > 0 && (
            <ul aria-label={t('multiChoice.otherSuggestionsLabel')} className="flex flex-wrap gap-1.5">
              {otherSuggestions.map(suggestion => (
                <li key={suggestion.value}>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => addOtherSuggestion(suggestion.value)}
                    className="min-h-11 rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-3 py-1.5 text-xs text-[var(--bellum-text-secondary)] hover:border-[var(--bellum-text-accent)] hover:text-[var(--bellum-text-accent)]"
                  >
                    {t('multiChoice.otherSuggestionAdd', { label: labelOf(suggestion) })}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {max != null && (
        <Text
          element="p"
          size="xs"
          id={`${question.key}-selected-count`}
          role={counted > max ? 'alert' : undefined}
          className={counted > max ? 'text-[var(--danger-soft-text)]' : 'text-[var(--bellum-text-muted)]'}
        >
          {t('multiChoice.selectedCount', { count: counted, max })}
          {/* R15N-10 — un compteur en dépassement ÉNONÇAIT la règle (« jusqu'à 5 »)
              sans jamais dire le remède : ce qu'il fallait retirer n'était nommé
              nulle part. */}
          {counted > max && ` — ${t('multiChoice.overLimitHint', { count: counted - max })}`}
        </Text>
      )}
    </div>
  )
}
