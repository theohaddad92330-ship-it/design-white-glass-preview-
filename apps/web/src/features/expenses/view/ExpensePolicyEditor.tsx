import type { ExpenseCategory, ExpensePolicyView, ExpenseReimbursementBasis } from '@bellum/contracts'
import { EXPENSE_CATEGORIES, localDayKey } from '@bellum/contracts'
import { Box, Button, HORIZONTAL_OVERSCROLL_CLASS, Input, SearchEmptyState, SelectField, Text, cn } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatCents } from '@/lib/money'
import { appLocale } from '@/lib/locale'
import { useExpensePolicies, useSaveExpensePolicy } from '../api'
// ⚠️ Import à EFFET — voir `../i18n.ts`.
import '../i18n'

/**
 * LE BARÈME DE FRAIS — le réglage (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CET ÉCRAN EXISTE, ET POURQUOI IL EST ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * La politique de frais était livrée — plafonds, droit à déduction, base de
 * remboursement — et n'existait QUE par le semis de démonstration. Un client
 * réel n'avait donc aucun barème, ce qui rendait toutes ses notes « non
 * vérifiées » : un verdict juste, et parfaitement inutile, puisque rien ne
 * permettait d'y répondre.
 *
 * ⚠️ **Un réglage vit à un seul endroit** (loi 1 du tome 7, garde GA-26). Le
 * barème par DÉFAUT de l'espace et les barèmes NÉGOCIÉS par client vivent tous
 * les deux ici, derrière `expensesApi.savePolicy`, et nulle part ailleurs. La
 * tentation était de poser le barème d'un client sur sa fiche : deux écrans
 * pour un réglage, donc deux vérités, et le premier symptôme est « j'ai changé
 * le plafond et ça n'a rien fait » parce qu'on l'avait changé de l'autre côté.
 * Il vit sous `/expenses` plutôt que dans les Réglages généraux parce que c'est
 * là qu'on se pose la question — en lisant « non vérifiée » sur une note.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE RÉVISION EST DATÉE, ET L'HISTOIRE RESTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Enregistrer n'écrase que les entrées portant la MÊME date d'effet. Les
 * révisions antérieures restent visibles, en lecture, sous le formulaire : une
 * note de mars continue d'être jugée sous le barème de mars. Sans cela, relever
 * un plafond en septembre rendrait rétroactivement conformes des notes déjà
 * décidées — et « conforme » est précisément ce qu'un valideur lit pour NE PAS
 * ouvrir les justificatifs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE BARÈME KILOMÉTRIQUE EST SAISI, JAMAIS FOURNI
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun tarif par puissance fiscale n'est pré-rempli. Un barème recopié de
 * mémoire, non daté et jamais revérifié serait une donnée fictive présentée
 * comme une règle officielle, et l'ESN rembourserait dessus en croyant
 * appliquer le texte. Tant que rien n'est saisi, une ligne kilométrique reste
 * « non vérifiée » — et l'écran le DIT plutôt que de laisser croire au contraire.
 */

/** Un plafond en cours de saisie : une CHAÎNE, parce que vide n'est pas zéro. */
type CapDraft = { cap: string; vatRecoverable: boolean }
type RateDraft = { key: string; horsepower: string; centsPerKm: string }

/**
 * Le barème de frais : monté par Réglages › Mon espace › Règles métier › Frais (HT-5, décision Louis
 * 22/10/2026). Le réglage vit à un seul endroit (GA-26) — ce composant — que la coque soit la page des notes
 * de frais ou celle des réglages.
 */
export function ExpensePolicyEditor() {
  const { t } = useTranslation('expenses')
  const { data, isLoading, isError } = useExpensePolicies()
  const savePolicy = useSaveExpensePolicy()

  /** `''` = la politique par DÉFAUT de l'espace ; sinon l'identifiant du client. */
  const [accountId, setAccountId] = useState('')
  // #2406.36 — la date locale de celui qui regarde, jamais `toISOString()` :
  // entre minuit et l'aube en heure d'été à Paris, l'UTC est encore la veille
  // (`local-day.ts`) — le champ proposait alors « hier » par défaut.
  const [effectiveFrom, setEffectiveFrom] = useState(() => localDayKey(new Date()))
  const [basis, setBasis] = useState<ExpenseReimbursementBasis>('actual')
  const [label, setLabel] = useState('')
  const [caps, setCaps] = useState<Record<string, CapDraft>>({})
  const [rates, setRates] = useState<RateDraft[]>([])
  const [loadedFor, setLoadedFor] = useState<string | null>(null)

  const selected = useMemo<ExpensePolicyView | null>(
    () => data?.policies.find(policy => (policy.accountId ?? '') === accountId) ?? null,
    [data, accountId],
  )

  // Le formulaire se remplit sur la révision la PLUS RÉCENTE de la politique
  // choisie — c'est celle qu'on corrige le plus souvent. Le rechargement est
  // gardé par `loadedFor` : sans lui, chaque frappe serait écrasée au rendu
  // suivant par la valeur venue du serveur.
  const key = `${accountId}|${data?.policies.length ?? -1}`
  if (data && loadedFor !== key) {
    setLoadedFor(key)
    setLabel(selected?.label ?? t('policyPage.defaultLabel'))
    setBasis(selected?.reimbursementBasis ?? 'actual')
    setCaps(latestCaps(selected))
    setRates(latestRates(selected))
  }

  const revisions = useMemo(() => revisionDates(selected), [selected])
  const nextYear = Number(effectiveFrom.slice(0, 4)) + 1
  const exampleCents = exampleAllowanceCents(rates)

  if (isLoading) {
    return (
      <Text size="sm" color="text-muted-foreground" className="py-4">
        {t('common:states.loading')}
      </Text>
    )
  }

  if (isError || !data) {
    // Un échec de lecture ne se rend JAMAIS comme « aucun barème » : on
    // écrirait un barème par-dessus un barème qu'on n'a pas lu.
    return <SearchEmptyState title={t('policyPage.errorTitle')} description={t('policyPage.errorDescription')} />
  }

  return (
    <>
      <Box className="space-y-6">
        <Box display="flex" className="flex-wrap items-center justify-between gap-2">
          <Text size="sm" color="text-muted-foreground" className="max-w-xl">
            {t('policyPage.subtitle')}
          </Text>
          <Link to="/expenses" className="text-sm text-[var(--bellum-text-accent)] underline">
            {t('policyPage.backToReports')}
          </Link>
        </Box>

        <Box className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Box>
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('policyPage.whichPolicy')}
            </Text>
            <SelectField
              ariaLabel={t('policyPage.whichPolicy')}
              value={accountId}
              onChange={next => setAccountId(next)}
              emptyOption={{ label: t('policyPage.defaultPolicy') }}
              options={data.accounts.map(account => ({ value: account.id, label: account.name }))}
              className="w-full"
            />
            {data.accountsTruncated ? (
              // Une liste coupée en silence fait conclure qu'un client n'existe
              // pas. On le DIT.
              <Text element="p" size="xs" color="text-muted-foreground" className="mt-0.5">
                {t('policyPage.accountsTruncated')}
              </Text>
            ) : null}
          </Box>

          <Box>
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('policyPage.label')}
            </Text>
            <Input
              value={label}
              maxLength={160}
              aria-label={t('policyPage.label')}
              onChange={event => setLabel(event.target.value)}
            />
          </Box>

          <Box>
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('policyPage.basis')}
            </Text>
            <SelectField
              ariaLabel={t('policyPage.basis')}
              value={basis}
              onChange={next => setBasis(next as ExpenseReimbursementBasis)}
              options={[
                { value: 'actual', label: t('policyPage.basisActual') },
                { value: 'scale', label: t('policyPage.basisScale') },
              ]}
              className="w-full"
            />
          </Box>

          <Box>
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('policyPage.effectiveFrom')}
            </Text>
            <Input
              type="date"
              value={effectiveFrom}
              aria-label={t('policyPage.effectiveFrom')}
              onChange={event => setEffectiveFrom(event.target.value)}
            />
            <Text element="p" size="xs" color="text-muted-foreground" className="mt-0.5">
              {t('policyPage.effectiveFromHint')}
            </Text>
          </Box>
        </Box>

        <Box>
          <Text element="h3" size="sm" weight="semibold">
            {t('policyPage.caps')}
          </Text>
          <Text element="p" size="xs" color="text-muted-foreground" className="mt-0.5 max-w-xl">
            {/* ⚠️ La phrase qui empêche le contresens : un plafond VIDE ne veut
                pas dire « gratuit », il veut dire « non vérifiée ». */}
            {t('policyPage.capsHint')}
          </Text>
          {/* Un tableau défile dans SON conteneur, jamais le corps de la page.
              #2588 — un tableau large ne renvoie pas le navigateur en arrière. */}
          <Box className={cn('mt-2 overflow-x-auto', HORIZONTAL_OVERSCROLL_CLASS)}>
            <Box className="min-w-[32rem] space-y-1">
              {EXPENSE_CATEGORIES.map(category => (
                <CapRow
                  key={category}
                  category={category}
                  draft={caps[category] ?? { cap: '', vatRecoverable: true }}
                  onChange={next => setCaps(current => ({ ...current, [category]: next }))}
                />
              ))}
            </Box>
          </Box>
        </Box>

        <Box>
          <Box display="flex" className="items-center justify-between gap-2">
            <Text element="h3" size="sm" weight="semibold">
              {t('policyPage.mileage')}
            </Text>
            <Box display="flex" className="flex-wrap items-center gap-2">
              {/* Théo D settings-espace.HT-5 — « Reporter sur <année suivante> » : la date d'effet passe au 1er janvier
                  de l'année suivante, les tarifs saisis restent dans le formulaire. Rien n'est enregistré avant
                  « Enregistrer », et la révision de l'année en cours reste lisible dans l'historique. */}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="pointer-coarse:min-h-11"
                disabled={rates.length === 0}
                onClick={() => setEffectiveFrom(`${nextYear}-01-01`)}
              >
                {t('policyPage.carryOver', { year: nextYear })}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setRates(current => [
                    ...current,
                    { key: `${Date.now()}-${current.length}`, horsepower: '', centsPerKm: '' },
                  ])
                }
              >
                {t('policyPage.addRate')}
              </Button>
            </Box>
          </Box>
          <Text element="p" size="xs" color="text-muted-foreground" className="mt-0.5 max-w-xl">
            {/* ⚠️ Le produit ne FOURNIT aucun barème kilométrique, et le dit. */}
            {t('policyPage.mileageHint')}
          </Text>
          {rates.length === 0 ? (
            <Text element="p" size="sm" color="text-muted-foreground" className="mt-2">
              {t('policyPage.mileageEmpty')}
            </Text>
          ) : (
            // Un exemple CALCULÉ sur le tarif saisi (jamais un tarif officiel) : il montre ce que le barème donne.
            exampleCents !== null && (
              <Text element="p" size="xs" color="text-muted-foreground" className="mt-2">
                {t('policyPage.mileageExample', {
                  km: EXAMPLE_KM,
                  horsepower: EXAMPLE_HORSEPOWER,
                  amount: formatCentsExact(exampleCents),
                })}
              </Text>
            )
          )}
          {rates.length === 0 ? null : (
            <Box className="mt-2 space-y-2">
              {rates.map((rate, index) => (
                <Box key={rate.key} display="flex" className="flex-wrap items-end gap-2">
                  <Box className="min-w-0">
                    <Text element="p" size="xs" color="text-muted-foreground">
                      {t('policyPage.horsepower')}
                    </Text>
                    <Input
                      inputMode="numeric"
                      value={rate.horsepower}
                      aria-label={t('policyPage.horsepowerAt', { number: index + 1 })}
                      className="w-28"
                      onChange={event =>
                        setRates(current =>
                          current.map(entry =>
                            entry.key === rate.key ? { ...entry, horsepower: event.target.value } : entry,
                          ),
                        )
                      }
                    />
                  </Box>
                  <Box className="min-w-0">
                    <Text element="p" size="xs" color="text-muted-foreground">
                      {t('policyPage.centsPerKm')}
                    </Text>
                    <Input
                      inputMode="decimal"
                      value={rate.centsPerKm}
                      aria-label={t('policyPage.centsPerKmAt', { number: index + 1 })}
                      className="w-32"
                      onChange={event =>
                        setRates(current =>
                          current.map(entry =>
                            entry.key === rate.key ? { ...entry, centsPerKm: event.target.value } : entry,
                          ),
                        )
                      }
                    />
                  </Box>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="min-h-11"
                    aria-label={t('policyPage.removeRate', { number: index + 1 })}
                    onClick={() => setRates(current => current.filter(entry => entry.key !== rate.key))}
                  >
                    {t('policyPage.remove')}
                  </Button>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {revisions.length > 0 ? (
          <Box className="rounded-md border border-border bg-card p-3">
            <Text element="h3" size="sm" weight="semibold">
              {t('policyPage.history')}
            </Text>
            <Text element="p" size="xs" color="text-muted-foreground" className="mt-0.5 max-w-xl">
              {t('policyPage.historyHint')}
            </Text>
            <Box className="mt-2 space-y-1">
              {revisions.map(revision => (
                <Text key={revision.date ?? 'always'} element="p" size="xs" color="text-muted-foreground">
                  {revision.date === null
                    ? t('policyPage.revisionAlways', { count: revision.count })
                    : t('policyPage.revisionOn', { date: revision.date, count: revision.count })}
                </Text>
              ))}
            </Box>
          </Box>
        ) : null}

        <Box display="flex" className="flex-wrap gap-2">
          <Button
            type="button"
            className="min-h-11"
            disabled={savePolicy.isPending || label.trim().length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)}
            onClick={() =>
              savePolicy.mutate({
                accountId: accountId === '' ? null : accountId,
                label: label.trim(),
                reimbursementBasis: basis,
                effectiveFrom,
                caps: EXPENSE_CATEGORIES.map(category => ({
                  category,
                  // ⚠️ Un champ VIDE part à `null` — « catégorie non plafonnée »,
                  // donc NON VÉRIFIÉE — et jamais à 0, qui l'interdirait.
                  capCents: toCents(caps[category]?.cap ?? ''),
                  vatRecoverable: caps[category]?.vatRecoverable ?? true,
                })),
                mileageRates: rates.flatMap(rate => {
                  const horsepower = Number(rate.horsepower.trim())
                  const centsPerKm = toCents(rate.centsPerKm)
                  if (!Number.isInteger(horsepower) || horsepower <= 0 || centsPerKm === null) return []
                  return [{ fiscalHorsepower: horsepower, centsPerKm }]
                }),
              })
            }
          >
            {t('policyPage.save')}
          </Button>
        </Box>
      </Box>
    </>
  )
}

function CapRow({
  category,
  draft,
  onChange,
}: {
  category: ExpenseCategory
  draft: CapDraft
  onChange: (next: CapDraft) => void
}) {
  const { t } = useTranslation('expenses')
  const cents = toCents(draft.cap)

  return (
    <Box display="flex" className="items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
      <Text element="span" size="sm" className="w-48 shrink-0 truncate">
        {t(`category.${category}`)}
      </Text>
      <Input
        inputMode="decimal"
        value={draft.cap}
        placeholder={t('policyPage.noCapPlaceholder')}
        aria-label={t('policyPage.capFor', { category: t(`category.${category}`) })}
        className="w-32"
        onChange={event => onChange({ ...draft, cap: event.target.value })}
      />
      {/* ⚠️ Jamais « 0,00 € » quand le champ est vide : l'écran écrit « non
          plafonnée », qui est ce que l'absence VEUT DIRE. */}
      <Text element="span" size="xs" color="text-muted-foreground" className="w-28 shrink-0">
        {cents === null ? t('policyPage.noCap') : formatCents(cents)}
      </Text>
      <label className="flex min-h-11 cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={draft.vatRecoverable}
          onChange={event => onChange({ ...draft, vatRecoverable: event.target.checked })}
        />
        <Text element="span" size="xs" color="text-muted-foreground">
          {t('policyPage.vatRecoverable')}
        </Text>
      </label>
    </Box>
  )
}

/** Un montant d'exemple AU CENTIME (`formatCents` arrondit à l'euro : 23,94 € deviendrait « 24 € », l'exemple mentirait). */
function formatCentsExact(cents: number): string {
  return new Intl.NumberFormat(appLocale(), { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

const EXAMPLE_KM = 38
const EXAMPLE_HORSEPOWER = 5

/** « 38 km en 5 CV » au tarif SAISI — `null` tant que le tarif de 5 CV n'est pas saisi (aucun tarif deviné). */
function exampleAllowanceCents(rates: readonly RateDraft[]): number | null {
  const rate = rates.find(entry => Number(entry.horsepower.trim()) === EXAMPLE_HORSEPOWER)
  const centsPerKm = rate ? toCents(rate.centsPerKm) : null
  return centsPerKm === null ? null : Math.round(centsPerKm * EXAMPLE_KM)
}

/** Les plafonds de la révision la PLUS RÉCENTE — ceux qu'on corrige. */
function latestCaps(policy: ExpensePolicyView | null): Record<string, CapDraft> {
  if (!policy) return {}
  const latest = mostRecentDate(policy.caps.map(cap => cap.effectiveFrom))
  const out: Record<string, CapDraft> = {}
  for (const cap of policy.caps) {
    if ((cap.effectiveFrom ?? null) !== latest) continue
    // `null` reste un champ VIDE : « non plafonnée » se réécrit à l'identique,
    // là où un « 0 » recopié interdirait la catégorie au premier enregistrement.
    out[cap.category] = {
      cap: cap.capCents === null ? '' : (cap.capCents / 100).toFixed(2),
      ...{ vatRecoverable: cap.vatRecoverable },
    }
  }
  return out
}

function latestRates(policy: ExpensePolicyView | null): RateDraft[] {
  if (!policy || policy.mileageRates.length === 0) return []
  const latest = mostRecentDate(policy.mileageRates.map(rate => rate.effectiveFrom))
  return policy.mileageRates
    .filter(rate => rate.effectiveFrom === latest)
    .map((rate, index) => ({
      key: `${rate.fiscalHorsepower}-${index}`,
      horsepower: String(rate.fiscalHorsepower),
      centsPerKm: (rate.centsPerKm / 100).toFixed(2),
    }))
}

function mostRecentDate(dates: readonly (string | null)[]): string | null {
  let best: string | null = null
  let seen = false
  for (const date of dates) {
    if (!seen) {
      best = date
      seen = true
      continue
    }
    if (date !== null && (best === null || date > best)) best = date
  }
  return best
}

/** Les révisions existantes, la plus récente d'abord — en LECTURE. */
function revisionDates(policy: ExpensePolicyView | null): { date: string | null; count: number }[] {
  if (!policy) return []
  const counts = new Map<string, number>()
  for (const cap of policy.caps) {
    const key = cap.effectiveFrom ?? ''
    // `seen === undefined ? 1 : seen + 1` plutôt qu'un repli sur zéro : ce
    // n'est pas « zéro plafond », c'est « pas encore rencontré ».
    const seen = counts.get(key)
    counts.set(key, seen === undefined ? 1 : seen + 1)
  }
  return [...counts.entries()]
    .map(([date, count]) => ({ date: date === '' ? null : date, count }))
    .sort((left, right) => (right.date ?? '').localeCompare(left.date ?? ''))
}

/** « 25 » ou « 25,50 » → centimes. `null` sur un champ vide ou illisible. */
function toCents(value: string): number | null {
  const normalised = value.trim().replace(',', '.')
  if (normalised.length === 0) return null
  const amount = Number(normalised)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return Math.round(amount * 100)
}
