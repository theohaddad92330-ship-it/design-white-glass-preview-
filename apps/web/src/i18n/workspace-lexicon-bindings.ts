import {
  resolveLexicon,
  type LexiconConcept,
  type LexiconForm,
  type LexiconLocale,
  type StructuredLexicon,
} from '@bellum/contracts'

/**
 * LA SURFACE du lexique par espace (D17) — les libellés qu'un terme préféré
 * remplace, énumérés un par un.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE LISTE, ET PAS UNE SUBSTITUTION GÉNÉRALE
 * ─────────────────────────────────────────────────────────────────────────────
 * La règle du lot est : **on remplace un libellé dont la valeur ENTIÈRE est le
 * nom de l'objet ; on ne réécrit JAMAIS une phrase.** Une substitution générale
 * sur les 9 430 libellés français écrirait « Aucun Affaire ne correspond » dès
 * la première ESN qui renomme « Projet » — le déterminant, le nombre et le
 * participe ne suivent pas.
 *
 * Cette liste est donc l'application LITTÉRALE de la règle : elle a été obtenue
 * en cherchant les clés dont la valeur FR **et** la valeur EN sont exactement le
 * nom d'un des huit concepts, puis en gardant les trois surfaces où une ESN lit
 * son propre vocabulaire — la navigation, les titres d'écran, et les sélecteurs
 * de type d'objet.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `fallback` EST LA PREUVE DE NON-RÉGRESSION
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque entrée porte la chaîne LIVRÉE, recopiée du JSON. Sans surcharge, c'est
 * elle qu'on réécrit — donc un espace sans lexique lit exactement les libellés
 * d'aujourd'hui, clé par clé, et `apps/web/src/i18n/workspace-lexicon.test.ts` le compare
 * au rendu réel de `t()`. Si quelqu'un change un libellé sans toucher ici, le
 * test échoue : c'est le seul moyen d'éviter le défaut « renommage i18n sur la
 * mauvaise clé », où l'on renomme une clé morte et l'écran ne bouge pas.
 *
 * ⚠️ `fallback` n'est pas toujours le défaut du CONCEPT, et c'est voulu :
 * `nav:items.missions` dit « Missions » en anglais là où le concept dit
 * « Assignments ». Restaurer le défaut du concept CHANGERAIT cet écran alors que
 * l'espace n'a rien demandé. On restaure la chaîne de la CLÉ.
 */
type LexiconBinding = {
  ns: string
  key: string
  concept: LexiconConcept
  form: LexiconForm
  /** La chaîne livrée, langue par langue — recopiée du JSON, jamais devinée. */
  fallback: Record<LexiconLocale, string>
}

export const LEXICON_BINDINGS: readonly LexiconBinding[] = [
  /* ── Navigation — la barre latérale, les onglets, la coque mobile ───────── */
  { ns: 'nav', key: 'items.accounts', concept: 'account', form: 'other', fallback: { fr: 'Comptes', en: 'Accounts' } },
  { ns: 'nav', key: 'items.contacts', concept: 'contact', form: 'other', fallback: { fr: 'Contacts', en: 'Contacts' } },
  {
    ns: 'nav',
    key: 'items.projects',
    concept: 'project',
    form: 'other',
    fallback: { fr: 'Opportunités', en: 'Opportunities' },
  },
  {
    ns: 'nav',
    key: 'items.consultants',
    concept: 'talent_pool',
    form: 'one',
    fallback: { fr: 'Vivier', en: 'Talent pool' },
  },
  { ns: 'nav', key: 'items.missions', concept: 'mission', form: 'other', fallback: { fr: 'Missions', en: 'Missions' } },
  { ns: 'nav', key: 'tabs.accounts', concept: 'account', form: 'other', fallback: { fr: 'Comptes', en: 'Accounts' } },
  { ns: 'nav', key: 'tabs.contacts', concept: 'contact', form: 'other', fallback: { fr: 'Contacts', en: 'Contacts' } },
  {
    ns: 'nav',
    key: 'tabs.projects',
    concept: 'project',
    form: 'other',
    fallback: { fr: 'Opportunités', en: 'Opportunities' },
  },
  { ns: 'nav', key: 'tabs.needs', concept: 'need', form: 'other', fallback: { fr: 'Besoins', en: 'Needs' } },
  {
    ns: 'nav',
    key: 'tabs.submissions',
    concept: 'submission',
    form: 'other',
    fallback: { fr: 'Positionnements', en: 'Submissions' },
  },
  {
    ns: 'nav',
    key: 'tabs.missionsList',
    concept: 'mission',
    form: 'other',
    fallback: { fr: 'Missions', en: 'Assignments' },
  },
  { ns: 'nav', key: 'pageTitles.contact', concept: 'contact', form: 'one', fallback: { fr: 'Contact', en: 'Contact' } },
  {
    ns: 'mobile',
    key: 'tabs.accounts',
    concept: 'account',
    form: 'other',
    fallback: { fr: 'Comptes', en: 'Accounts' },
  },
  {
    ns: 'shortcuts',
    key: 'goto.accounts',
    concept: 'account',
    form: 'other',
    fallback: { fr: 'Comptes', en: 'Accounts' },
  },
  {
    ns: 'shortcuts',
    key: 'goto.missions',
    concept: 'mission',
    form: 'other',
    fallback: { fr: 'Missions', en: 'Assignments' },
  },

  /* ── Titres d'écran ─────────────────────────────────────────────────────── */
  {
    ns: 'projects',
    key: 'page.title',
    concept: 'project',
    form: 'other',
    fallback: { fr: 'Affaires', en: 'Deals' },
  },
  {
    ns: 'consultants',
    key: 'page.title',
    concept: 'talent_pool',
    form: 'one',
    fallback: { fr: 'Vivier', en: 'Talent pool' },
  },
  {
    ns: 'missions',
    key: 'page.title',
    concept: 'mission',
    form: 'other',
    fallback: { fr: 'Missions', en: 'Missions' },
  },
  {
    ns: 'submissions',
    key: 'page.title',
    concept: 'submission',
    form: 'other',
    fallback: { fr: 'Positionnements', en: 'Submissions' },
  },
  {
    ns: 'contacts',
    key: 'page.title',
    concept: 'contact',
    form: 'other',
    fallback: { fr: 'Contacts', en: 'Contacts' },
  },
  {
    ns: 'routes',
    key: 'projects.title',
    concept: 'project',
    form: 'other',
    fallback: { fr: 'Opportunités', en: 'Opportunities' },
  },
  {
    ns: 'routes',
    key: 'missions.title',
    concept: 'mission',
    form: 'other',
    fallback: { fr: 'Missions', en: 'Missions' },
  },
  {
    ns: 'routes',
    key: 'consultants.submissions',
    concept: 'submission',
    form: 'other',
    fallback: { fr: 'Positionnements', en: 'Submissions' },
  },

  /* ── Onglets d'une fiche, et colonnes qui NOMMENT l'objet ───────────────── */
  {
    ns: 'accounts',
    key: 'tabs.projects',
    concept: 'project',
    form: 'other',
    fallback: { fr: 'Opportunités', en: 'Opportunities' },
  },
  {
    ns: 'accounts',
    key: 'tabs.contacts',
    concept: 'contact',
    form: 'other',
    fallback: { fr: 'Contacts', en: 'Contacts' },
  },
  {
    ns: 'consultants',
    key: 'detail.tabs.missions',
    concept: 'mission',
    form: 'other',
    fallback: { fr: 'Missions', en: 'Missions' },
  },
  {
    ns: 'consultants',
    key: 'detail.tabs.submissions',
    concept: 'submission',
    form: 'other',
    fallback: { fr: 'Positionnements', en: 'Submissions' },
  },

  /* ── Sélecteurs de TYPE d'objet — « de quoi parle-t-on ? » ────────────────
     ⚠️ Le lanceur du copilote n'en fait plus partie depuis le 29/08/2026, et
     c'est une conséquence directe de la règle du lot, pas un oubli. Ses cinq
     entrées se nommaient par le TYPE — « Compte », « Contact », « Besoin » —
     dans une rangée « ⚡ Lancer : » ; elles se nomment maintenant par le
     TRAVAIL, dans la rangée d'exemples : « Analyser une entreprise »,
     « Enrichir un contact », « Matcher le vivier ». Ce sont des PHRASES, et la
     règle est nette : on remplace un libellé dont la valeur ENTIÈRE est le nom
     de l'objet, on ne réécrit jamais une phrase. Les trois clés `launcher:type.*`
     ont donc été retirées du JSON avec leur lecteur — les garder liées ici
     serait exactement le défaut que cet en-tête décrit, « renommage i18n sur la
     mauvaise clé » : on renomme, et l'écran ne bouge pas. */
  {
    ns: 'chains',
    key: 'panel.subjects.need',
    concept: 'need',
    form: 'one',
    fallback: { fr: 'Besoin', en: 'Need' },
  },
  {
    ns: 'chains',
    key: 'panel.subjects.project',
    concept: 'project',
    form: 'one',
    fallback: { fr: 'Opportunité', en: 'Opportunity' },
  },
  {
    ns: 'chains',
    key: 'panel.subjects.account',
    concept: 'account',
    form: 'one',
    fallback: { fr: 'Compte', en: 'Account' },
  },
  {
    ns: 'chains',
    key: 'panel.subjects.consultant',
    concept: 'consultant',
    form: 'one',
    fallback: { fr: 'Consultant', en: 'Consultant' },
  },
  {
    ns: 'chains',
    key: 'panel.subjects.mission',
    concept: 'mission',
    form: 'one',
    fallback: { fr: 'Mission', en: 'Assignment' },
  },
  {
    ns: 'watchlist',
    key: 'rules.kindLabels.need',
    concept: 'need',
    form: 'one',
    fallback: { fr: 'Besoin', en: 'Need' },
  },
  {
    ns: 'watchlist',
    key: 'rules.kindLabels.account',
    concept: 'account',
    form: 'one',
    fallback: { fr: 'Compte', en: 'Account' },
  },
] as const

/**
 * Les libellés à poser dans i18next pour une langue, groupés par namespace.
 *
 * Sans surcharge pour un concept, on réécrit le `fallback` — c'est-à-dire la
 * chaîne d'origine. L'application est donc IDEMPOTENTE et RÉVERSIBLE : retirer
 * un terme préféré remet le mot du produit, sans rechargement.
 *
 * Une seule dérivation en amont : {@link resolveLexicon}, dans les contrats.
 * L'écran de réglage et cet applicateur lisent la même, ce qui interdit qu'un
 * aperçu montre autre chose que ce que la navigation affichera.
 */
export function buildLexiconResources(
  lexicon: Pick<StructuredLexicon, 'overrides'>,
  locale: LexiconLocale,
): Record<string, Record<string, unknown>> {
  const resolved = resolveLexicon(lexicon, locale)
  const bundles: Record<string, Record<string, unknown>> = {}
  for (const binding of LEXICON_BINDINGS) {
    // Surchargé ou non : la question se pose au LEXIQUE, pas au résultat de la
    // dérivation. Comparer l'objet rendu au défaut marcherait par identité de
    // référence aujourd'hui et casserait le jour où la dérivation recopie.
    const overridden = lexicon.overrides.some(entry => entry.concept === binding.concept && entry.locale === locale)
    // Sans surcharge on réécrit la chaîne de la CLÉ, pas le défaut du concept :
    // `nav:items.missions` dit « Missions » en anglais là où le concept dit
    // « Assignments », et l'espace n'a rien demandé.
    const value = overridden ? resolved[binding.concept][binding.form] : binding.fallback[locale]
    // i18next découpe la clé sur `.` pour descendre dans l'arbre du namespace :
    // un `{ 'items.accounts': … }` PLAT ne serait jamais trouvé.
    bundles[binding.ns] = assignPath(bundles[binding.ns] ?? {}, binding.key.split('.'), value)
  }
  return bundles
}

/** Pose `value` au chemin `path` dans `target`, sans écraser les frères. */
function assignPath(target: Record<string, unknown>, path: string[], value: string): Record<string, unknown> {
  const [head, ...rest] = path
  if (head === undefined) return target
  if (rest.length === 0) return { ...target, [head]: value }
  const child = (target[head] ?? {}) as Record<string, unknown>
  return { ...target, [head]: assignPath(child, rest, value) }
}
