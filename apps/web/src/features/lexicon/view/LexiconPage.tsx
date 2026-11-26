import {
  EMPTY_STRUCTURED_LEXICON,
  hasPermission,
  LEXICON_CONCEPTS,
  LEXICON_DEFAULTS,
  LEXICON_OUT_OF_SCOPE,
  lexiconViolations,
  type LexiconConcept,
  type LexiconLocale,
  type LexiconOverride,
  type StructuredLexicon,
} from '@bellum/contracts'
import { Box, Button, Card, CardContent, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useOfferPortfolio, useUpdateOfferPortfolio } from '@/features/profile/hooks/useOfferPortfolio'
import { useTeam } from '@/features/team/hooks/useTeam'
import { isSupportedLanguage } from '@/i18n/config'
import { TermList } from './TermList'
import { SettingsViewHeader } from '@/features/settings/components/SettingsViewHeader'

/**
 * Réglages › Lexique (D17, 28/08/2026) — les mots de l'ESN.
 *
 * Cet écran porte les DEUX moitiés du lexique, et c'est délibéré : les mots
 * interdits vivaient dans Réglages › Profil › portefeuille d'offre, où ils ne
 * teintaient que les textes générés. Les laisser là-bas ET les remontrer ici
 * ferait apparaître le même réglage deux fois sous la même forme (loi 4 du
 * tome 7) ; ils ont donc DÉMÉNAGÉ, ils ne se sont pas dupliqués.
 *
 * Trois choses que l'écran doit dire, et qu'il dit :
 *  1. le mot PAR DÉFAUT de chaque objet, pour que « surcharger » se voie ;
 *  2. qu'un terme se pose PAR LANGUE — deviner la traduction en écrirait une
 *     fausse ;
 *  3. ce que le lexique NE FAIT PAS. Un lexique partiel qui l'annonce vaut
 *     mieux qu'un lexique total qui ment sur la moitié.
 */
export function LexiconView() {
  const { t, i18n } = useTranslation('lexicon')
  const { team, isLoading: teamLoading } = useTeam()
  const canManage = team ? hasPermission(team.workspace.role, 'team:manage') : false
  const { data, isLoading } = useOfferPortfolio()
  const save = useUpdateOfferPortfolio()

  /** La langue ÉDITÉE : celle de l'interface, parce qu'un terme se pose par
   *  langue et que celle qu'on lit est celle qu'on veut changer. */
  const locale: LexiconLocale = isSupportedLanguage(i18n.language) ? i18n.language : 'fr'

  const [draft, setDraft] = useState<Pick<StructuredLexicon, 'overrides'> | null>(null)
  const [forbiddenDraft, setForbiddenDraft] = useState<string[] | null>(null)

  const lexicon: Pick<StructuredLexicon, 'overrides'> = draft ?? data?.lexicon ?? EMPTY_STRUCTURED_LEXICON
  const forbidden: string[] = forbiddenDraft ?? data?.forbidden_terms ?? []
  // #2862 (#2437.8) — la version et la date SERVEUR, jamais celles d'un
  // brouillon local : elles ne changent qu'à l'enregistrement RÉUSSI, jamais
  // pendant la frappe.
  const savedVersion = data?.lexicon.version ?? null
  const savedUpdatedAt = data?.lexicon.updatedAt ?? null
  // #2862 — le « qui » de la version : l'id se pose serveur, le nom se résout
  // ICI depuis l'équipe déjà chargée (même source que Réglages › Équipe) —
  // jamais une seconde requête pour un libellé.
  const savedUpdatedBy = data?.lexicon.updatedBy ?? null
  const updatedByMember = savedUpdatedBy
    ? (team?.members.find(member => member.userId === savedUpdatedBy) ?? null)
    : null
  const updatedByLabel = savedUpdatedBy
    ? updatedByMember?.fullName || updatedByMember?.email || t('version.unknownMember')
    : null

  // La MÊME dérivation que le serveur : l'écran prévient avant le clic, l'API
  // refuse quand même — mais les deux disent la même chose. Pas de `useMemo` :
  // la fonction est pure et parcourt huit concepts, la mémoïser coûterait plus
  // cher que le calcul.
  const violations = lexiconViolations(lexicon, forbidden)

  function setTerm(concept: LexiconConcept, form: 'one' | 'other', value: string): void {
    const others = lexicon.overrides.filter(entry => !(entry.concept === concept && entry.locale === locale))
    const existing = lexicon.overrides.find(entry => entry.concept === concept && entry.locale === locale)
    const base: LexiconOverride = existing ?? {
      concept,
      locale,
      one: LEXICON_DEFAULTS[concept][locale].one,
      other: LEXICON_DEFAULTS[concept][locale].other,
    }
    const next = { ...base, [form]: value }
    // Deux cases vidées = plus de surcharge du tout. Enregistrer une surcharge
    // égale au défaut la ferait ressembler à un choix que personne n'a fait.
    const cleared = next.one.trim().length === 0 && next.other.trim().length === 0
    setDraft({ overrides: cleared ? others : [...others, next] })
  }

  function clearConcept(concept: LexiconConcept): void {
    setDraft({
      overrides: lexicon.overrides.filter(entry => !(entry.concept === concept && entry.locale === locale)),
    })
  }

  function submit(): void {
    // Les surcharges à moitié remplies ne partent pas : un pluriel vide
    // afficherait une chaîne vide dans la navigation.
    const complete = lexicon.overrides.filter(entry => entry.one.trim().length > 0 && entry.other.trim().length > 0)
    save.mutate(
      { lexicon: { overrides: complete }, forbidden_terms: forbidden },
      {
        onSuccess: () => {
          setDraft(null)
          setForbiddenDraft(null)
          toast.success(t('saved'))
        },
        onError: error => toast.error(t('saveFailed'), { description: error.message }),
      },
    )
  }

  if (teamLoading && !team) {
    return (
      <Text size="sm" color="text-[var(--bellum-text-muted)]">
        {t('page.loading')}
      </Text>
    )
  }

  // Un refus LISIBLE, jamais un 403 nu : quelqu'un qui n'a pas le droit doit
  // comprendre pourquoi, sinon il reclique.
  if (team && !canManage) {
    return (
      <Card>
        <CardContent className="space-y-1 p-4">
          <Text size="sm" weight="semibold">
            {t('accessDenied.title')}
          </Text>
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('accessDenied.description')}
          </Text>
        </CardContent>
      </Card>
    )
  }

  return (
    <Box className="space-y-4">
      <SettingsViewHeader scope="space" title={t('page.title')} subtitle={t('page.description')} />

      {isLoading ? (
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {t('page.loading')}
        </Text>
      ) : (
        <>
          <Card>
            <CardContent className="space-y-4 p-4">
              <Box className="space-y-1">
                <Text size="sm" weight="semibold">
                  {t('terms.title')}
                </Text>
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {t('language.hint')}
                </Text>
                {/* #2862 (#2437.8) — la ligne de version est TOUJOURS rendue :
                    un lexique jamais modifié dit « non mesurée » plutôt que de
                    ne rien afficher, qu'un test ou une recette pourrait
                    confondre avec l'écran qui n'a jamais porté cette capacité. */}
                <Text size="xs" color="text-[var(--bellum-text-muted)]">
                  {savedVersion !== null
                    ? t('version.label', {
                        version: savedVersion,
                        date: savedUpdatedAt ? new Date(savedUpdatedAt).toLocaleDateString(i18n.language) : '',
                        who: updatedByLabel,
                      })
                    : t('version.unset')}
                </Text>
              </Box>

              {LEXICON_CONCEPTS.map(concept => {
                const fallback = LEXICON_DEFAULTS[concept][locale]
                const override = lexicon.overrides.find(entry => entry.concept === concept && entry.locale === locale)
                return (
                  <Box key={concept} className="space-y-2 border-t border-[var(--bellum-border)] pt-3 first:border-0">
                    <Box className="space-y-0.5">
                      <Text size="sm">{t(`concepts.${concept}`)}</Text>
                      <Text size="xs" color="text-[var(--bellum-text-muted)]">
                        {t('terms.default', { term: `${fallback.one} / ${fallback.other}` })}
                      </Text>
                    </Box>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <label className="flex-1">
                        <span className="sr-only">{t('terms.singular')}</span>
                        <input
                          value={override?.one ?? ''}
                          maxLength={40}
                          placeholder={fallback.one}
                          onChange={event => setTerm(concept, 'one', event.target.value)}
                          className="min-h-11 w-full rounded-md border border-[var(--bellum-border)] bg-transparent px-3 text-sm text-[var(--bellum-text-primary)] placeholder:text-[var(--bellum-text-muted)]"
                        />
                      </label>
                      <label className="flex-1">
                        <span className="sr-only">{t('terms.plural')}</span>
                        <input
                          value={override?.other ?? ''}
                          maxLength={40}
                          placeholder={fallback.other}
                          onChange={event => setTerm(concept, 'other', event.target.value)}
                          className="min-h-11 w-full rounded-md border border-[var(--bellum-border)] bg-transparent px-3 text-sm text-[var(--bellum-text-primary)] placeholder:text-[var(--bellum-text-muted)]"
                        />
                      </label>
                      {override && (
                        <button
                          type="button"
                          onClick={() => clearConcept(concept)}
                          aria-label={t('terms.clear', { concept: fallback.one })}
                          className="min-h-11 rounded-md border border-[var(--bellum-border)] px-3 text-xs text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)]"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </Box>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-4">
              <Text size="sm" weight="semibold">
                {t('forbidden.title')}
              </Text>
              <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                {t('forbidden.hint')}
              </Text>
              <TermList
                terms={forbidden}
                disabled={save.isPending}
                placeholder={t('forbidden.placeholder')}
                addLabel={t('forbidden.add')}
                removeLabel={term => t('forbidden.remove', { term })}
                onChange={setForbiddenDraft}
              />
            </CardContent>
          </Card>

          {violations.length > 0 && (
            <Card>
              <CardContent className="space-y-1 p-4">
                {violations.map(violation => (
                  <Text
                    key={`${violation.code}-${violation.concept}-${violation.locale}-${violation.term}`}
                    size="sm"
                    color="text-[var(--danger-soft-text)]"
                  >
                    {t(`violations.${violation.code}`, { term: violation.term })}
                  </Text>
                ))}
              </CardContent>
            </Card>
          )}

          <Button size="sm" disabled={save.isPending || violations.length > 0} onClick={submit}>
            {save.isPending ? t('saving') : t('save')}
          </Button>

          {/* Ce que le lexique NE FAIT PAS — affiché, pas caché dans un
              commentaire : c'est la question que se pose quelqu'un qui vient de
              renommer un objet et cherche pourquoi une phrase n'a pas bougé. */}
          <Card>
            <CardContent className="space-y-2 p-4">
              <Text size="sm" weight="semibold">
                {t('outOfScope.title')}
              </Text>
              <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                {t('outOfScope.hint')}
              </Text>
              <ul className="space-y-1">
                {LEXICON_OUT_OF_SCOPE.map(item => (
                  <li key={item}>
                    <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                      {t(`outOfScope.items.${item}`)}
                    </Text>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  )
}
