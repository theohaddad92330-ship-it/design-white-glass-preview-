import { describe, expect, it } from 'vitest'
import { TEMPS1_REQUIRED_KEYS, type EsnAnswers } from '@bellum/contracts'
import type { UserCredits } from '@/features/credits/api'
import { TEMPS1_QUESTION_KEYS, TEMPS1_SUBSTEPS } from './questions'
import {
  canOfferResume,
  needsOnboarding,
  ONBOARDING_ESTIMATED_MINUTES,
  reconfigurationPlan,
  resolveOnboardingEntry,
  resolveOnboardingOrigin,
  resolvePlanScreen,
  shouldShowOnboardingRefreshBanner,
} from './onboarding-gate'

/**
 * #2626.1 revient sur R15N-9 et sur l'incident du 16/09/2026, délibérément.
 *
 * `TEMPS1_QUESTION_KEYS` et `TEMPS1_SUBSTEPS` (`./questions`) ne contiennent
 * plus, depuis l'arbitrage Temps 2 du 20/09/2026, que ce que le Temps 1 pose
 * ENCORE — les 125 questions reportées (dont `esn_maturity_situation` et
 * `company_growth_goal`, le cas mesuré par R15N-9) en sont sorties pour
 * `TEMPS1_DEFERRED_QUESTIONS`, reposées par le complément de profil, pas par
 * une reconfiguration Temps 1. Ce que ça change ici :
 *   - `reconfigurationPlan` : les DIX clés requises remplies SUFFISENT
 *     maintenant à vider le plan (elles ÉTAIENT `TEMPS1_QUESTION_KEYS` avant
 *     le report ; elles en sont désormais la quasi-totalité).
 *   - `canOfferResume` : « terminé avec seulement les dix requises » n'est
 *     plus distinguable de « a vraiment tout parcouru » — les deux valent
 *     `TEMPS1_QUESTION_KEYS` au complet. Ce qui TIENT ENCORE : une clé
 *     requise ajoutée APRÈS qu'un compte a terminé (le vrai mécanisme de
 *     l'incident, GA-26 — « ajouter une question au Temps 1 ne se fait que
 *     d'un geste : l'inscrire dans `TEMPS1_REQUIRED_KEYS` ») reste détectée :
 *     le témoin ci-dessous simule ce cas précis plutôt que « récap seul ».
 */

function credits(over: Partial<UserCredits> = {}): UserCredits {
  return {
    user_id: 'u-1',
    plan: 'decouverte',
    accounts_limit: 1,
    accounts_used: 0,
    enrichment_credits: 5,
    ...over,
  } as UserCredits
}

describe('needsOnboarding — la porte d’entrée et la porte de sortie disent la même chose', () => {
  it('un vrai nouveau venu passe par le questionnaire', () => {
    expect(needsOnboarding({ status: 'in_progress', credits: credits() })).toBe(true)
  })

  it('un questionnaire terminé n’y retourne jamais', () => {
    expect(needsOnboarding({ status: 'completed', credits: credits() })).toBe(false)
  })

  it('LE CAS QUI BOUCLAIT ne boucle plus — mais il repasse bien par le questionnaire', () => {
    // Avant : `/dashboard` renvoyait vers `/onboarding` (status ≠ completed) et
    // `/onboarding` renvoyait vers `/dashboard` (offre déjà servie).
    //
    // La boucle est désormais impossible pour une autre raison, et c'est la
    // bonne : `resolvePlanScreen` ne renvoie plus JAMAIS vers `/dashboard` pour
    // cause d'offre servie — il renvoie vers l'étape suivante du questionnaire.
    // Le compte avance donc au lieu de rebondir, et il n'échappe plus au
    // questionnaire sous prétexte qu'il a consommé une analyse.
    const state = { status: 'in_progress', credits: credits({ accounts_used: 1 }) }

    expect(needsOnboarding(state)).toBe(true)
    expect(resolvePlanScreen({ ...state, creditsUnknown: false })).toBe('/onboarding/company')
  })

  it('un palier déjà servi ne DISPENSE pas du questionnaire (§13 — le bug des comptes bêta)', () => {
    // C'est le cœur du reproche : un compte bêta est provisionné avec un palier
    // AVANT d'avoir répondu à quoi que ce soit. Traiter le palier comme une
    // preuve de complétion faisait sauter l'onboarding à tous ces comptes, qui
    // lançaient ensuite des analyses génériques en se disant personnalisées.
    expect(needsOnboarding({ status: 'in_progress', credits: credits({ plan: 'growth' }) })).toBe(true)
    expect(needsOnboarding({ status: 'not_started', credits: credits({ plan: 'beta' }) })).toBe(true)
  })

  it('un report EXPLICITE est la seule sortie, et il ne se confond pas avec une complétion', () => {
    // Il faut bien une sortie : sans elle, quelqu'un qui refuse le questionnaire
    // y est renvoyé à chaque navigation. Mais elle est volontaire et tracée —
    // et les analyses lancées ensuite sont marquées génériques.
    expect(needsOnboarding({ status: 'in_progress', credits: credits(), skippedAt: '2026-08-02T10:00:00Z' })).toBe(
      false,
    )
    expect(needsOnboarding({ status: 'in_progress', credits: credits(), skippedAt: null })).toBe(true)
  })

  it('une lecture en échec ne bloque pas : le compte reste traité comme neuf', () => {
    expect(needsOnboarding({ status: null, credits: null })).toBe(true)
  })

  /**
   * #2572 — RENVERSÉ le 08/10/2026 pour le cas d'un utilisateur DÉJÀ
   * onboardé (DÉCISION LOUIS, #2021, QCM) : voir le test juste en dessous.
   * Ce que #2572 protégeait RÉELLEMENT, et qui reste vrai ici — un
   * utilisateur qui n'a JAMAIS terminé le questionnaire (`firstCompletedAt`
   * absent) et qui se retrouve malgré tout à `refresh_required` (l'arête
   * `in_progress → refresh_required` existe côté API, `ONBOARDING_
   * TRANSITIONS`) continue d'être redirigé — mesuré en production sur le
   * compte de Louis (`11372508b`) à l'origine de #2572, AVANT que
   * `requestRefresh` n'existe pour un compte déjà onboardé.
   */
  it('#2572 (reste vrai) — une reconfiguration demandée par un utilisateur JAMAIS onboardé rouvre le questionnaire', () => {
    expect(
      needsOnboarding({ status: 'refresh_required', credits: credits(), skippedAt: null, firstCompletedAt: null }),
    ).toBe(true)
  })

  /**
   * #2021 — DÉCISION LOUIS 08/10/2026 (QCM), RENVERSE #2572 pour CE SEUL cas.
   * Recette écran du 07-08/10 (lots U01/W02/Y02 sur #2021) : depuis
   * Réglages › Profil, « Revoir ce questionnaire en mode guidé » →
   * « Compléter mon profil » → `/accounts`/`/search` redirigeaient de force
   * vers `/onboarding` tant qu'aucun « Plus tard » n'était cliqué — un
   * utilisateur déjà onboardé qui voulait juste consulter son dossier se
   * retrouvait enfermé. Un utilisateur DÉJÀ onboardé (`firstCompletedAt`
   * posé) qui redemande une reconfiguration n'est PLUS redirigé : le bandeau
   * de reprise (`shouldShowOnboardingRefreshBanner`, plus bas) prend le
   * relais. `c91_reconfiguration_deja_onboarde_bandeau_pas_redirection`.
   */
  it('#2021 — une reconfiguration demandée par un utilisateur DÉJÀ onboardé ne redirige plus', () => {
    expect(
      needsOnboarding({
        status: 'refresh_required',
        credits: credits(),
        skippedAt: null,
        firstCompletedAt: '2026-08-01T00:00:00Z',
      }),
    ).toBe(false)
  })

  /**
   * #2579 — LE DÉFAUT : un « Plus tard » posé APRÈS une demande de
   * reconfiguration ne rendait jamais la main. `requestRefresh` garantit que
   * `skipped_at` est `null` au moment où `refresh_required` est posé (ligne
   * ci-dessus) — donc un `skippedAt` non nul, à CE statut, ne peut décrire
   * qu'un report plus RÉCENT que la demande. C'est le geste explicite le plus
   * récent : il doit gagner, comme n'importe quel autre report. Le compte
   * reste réellement coincé : « Reprendre plus tard » et « Quitter »
   * ramenaient dans l'app, qui redirigeait aussitôt vers `/onboarding`.
   *
   * Non-régression (#2579.3) : la reconfiguration reste reprenable depuis
   * Réglages › Profil — `resolveOnboardingEntry` (plus bas) lit le même
   * `status === 'refresh_required'` INDÉPENDAMMENT de `skippedAt`, donc ce
   * changement ne l'affecte pas.
   *
   * #2021 (08/10/2026) — INCHANGÉE par le renversement ci-dessus : le report
   * explicite rend toujours la main EN PREMIER, qu'il ait ou non déjà été
   * onboardé — `firstCompletedAt` est posé ici pour le prouver sur le cas le
   * plus exposé (un utilisateur déjà onboardé, pile celui que #2021 renverse
   * par ailleurs).
   */
  it('#2579 — un « Plus tard » posé APRÈS une demande de reconfiguration rend la main, déjà onboardé ou non', () => {
    expect(needsOnboarding({ status: 'refresh_required', credits: credits(), skippedAt: '2026-09-18T10:00:00Z' })).toBe(
      false,
    )
    expect(
      needsOnboarding({
        status: 'refresh_required',
        credits: credits(),
        skippedAt: '2026-09-18T10:00:00Z',
        firstCompletedAt: '2026-08-01T00:00:00Z',
      }),
    ).toBe(false)
  })

  it('un espace de démonstration atterrit dans l’app, jamais dans le questionnaire', () => {
    // Le visiteur arrive par un lien ouvert pour VOIR le produit. Le compte démo
    // partagé n'a pas d'onboarding complété — sans ce court-circuit il tombait
    // sur « Choisissez votre offre ».
    expect(needsOnboarding({ status: 'in_progress', credits: credits({ is_demo: true }) })).toBe(false)
    expect(needsOnboarding({ status: null, credits: credits({ is_demo: true }) })).toBe(false)
  })
})

describe('resolvePlanScreen — qui a le droit de voir « Choisis ton offre »', () => {
  it('un vrai compte neuf voit l’écran', () => {
    expect(resolvePlanScreen({ status: 'in_progress', credits: credits(), creditsUnknown: false })).toBe('show')
  })

  it('un palier déjà servi ne se fait PAS demander de choisir une offre', () => {
    expect(
      resolvePlanScreen({ status: 'in_progress', credits: credits({ plan: 'growth' }), creditsUnknown: false }),
    ).toBe('/onboarding/company')
  })

  it('LE BUG : une lecture de crédits en échec n’est pas un compte neuf', () => {
    // Avant, `getMine()` en échec valait `credits: null`, donc « aucune offre »,
    // donc les tarifs — à un abonné qui paie déjà. On continue de ne PAS lui
    // demander de choisir une offre ; on l'envoie simplement à l'étape suivante
    // du questionnaire plutôt qu'au tableau de bord, qui le renverrait ici.
    const out = resolvePlanScreen({ status: 'in_progress', credits: null, creditsUnknown: true })
    expect(out).not.toBe('show')
    expect(out).toBe('/onboarding/company')
  })

  it('un questionnaire terminé rentre chez lui', () => {
    expect(resolvePlanScreen({ status: 'completed', credits: credits(), creditsUnknown: false })).toBe('/briefing')
  })

  it('un espace de démonstration ne voit jamais de grille tarifaire', () => {
    expect(
      resolvePlanScreen({ status: 'in_progress', credits: credits({ is_demo: true }), creditsUnknown: false }),
    ).toBe('/onboarding/company')
  })
})

describe('aucun état ne peut faire boucler les deux gardes', () => {
  // Le produit cartésien de tout ce qui distingue les deux prédicats.
  const STATUSES = ['not_started', 'in_progress', 'completed', null, undefined]
  const CREDITS = [
    null,
    credits(),
    credits({ accounts_used: 1 }),
    credits({ plan: 'growth' }),
    credits({ plan: 'trial', accounts_used: 3 }),
    credits({ is_demo: true }),
  ]
  const SKIPS = [null, '2026-08-02T10:00:00Z']
  const UNKNOWN = [false, true]

  // L'invariant n'est plus « les deux prédicats sont contraires » — ils ne
  // répondent plus à la même question depuis §13, l'un parle du questionnaire et
  // l'autre du palier. L'invariant qui compte est celui qui protège vraiment la
  // production : AUCUN état ne doit produire un aller-retour infini.
  //
  // Le seul cycle possible est : le tableau de bord expédie vers l'onboarding
  // (needsOnboarding) et l'onboarding renvoie au tableau de bord
  // (resolvePlanScreen === '/briefing'). On l'énonce tel quel plutôt que de
  // recopier la règle de sortie — un test qui recopie l'implémentation ne
  // détecte rien.
  it.each(
    STATUSES.flatMap(status =>
      CREDITS.flatMap(c =>
        SKIPS.flatMap(skippedAt =>
          UNKNOWN.map(creditsUnknown => [String(status), c, skippedAt, creditsUnknown] as const),
        ),
      ),
    ),
  )('status=%s : aucun aller-retour possible', (_label, c, skippedAt, creditsUnknown) => {
    const status = _label === 'null' ? null : _label === 'undefined' ? undefined : _label
    const versLOnboarding = needsOnboarding({ status, credits: c, skippedAt })
    const versLeDashboard = resolvePlanScreen({ status, credits: c, skippedAt, creditsUnknown }) === '/briefing'

    expect(versLOnboarding && versLeDashboard).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/*  Page 0 (#2013) et reconfiguration guidée (#2022)                           */
/* -------------------------------------------------------------------------- */

/** Les clés du Temps 1 qui portent une LISTE — les autres portent une chaîne. */
const LIST_KEYS: readonly string[] = ['expertise_areas', 'target_sectors', 'target_company_types', 'geo_zones']

/** Les 10 clés du Temps 1, vides — la forme exacte d'un questionnaire vierge. */
function answers(over: Partial<EsnAnswers> = {}): EsnAnswers {
  const blank = Object.fromEntries(TEMPS1_REQUIRED_KEYS.map(key => [key, LIST_KEYS.includes(key) ? [] : null]))
  return { ...blank, ...over } as EsnAnswers
}

describe('resolveOnboardingEntry — qui voit la page 0, et laquelle (#2013.1 / #2022.1)', () => {
  it('un questionnaire vierge voit la page de bienvenue', () => {
    expect(resolveOnboardingEntry({ status: 'in_progress', answers: answers() })).toBe('welcome')
  })

  it('UNE seule réponse suffit à sortir de la page 0 — elle ne se remontre pas en boucle', () => {
    // C'est le point qui compte : `/onboarding` est traversé à chaque navigation
    // depuis le tableau de bord. Une page d'accueil qui revient à chaque passage
    // est un péage, pas un accueil.
    expect(resolveOnboardingEntry({ status: 'in_progress', answers: answers({ esn_name: 'Abricot' }) })).toBe(
      'continue',
    )
  })

  it('un espace à reconfigurer voit la page 0 « on a repensé la personnalisation »', () => {
    expect(resolveOnboardingEntry({ status: 'refresh_required', answers: answers({ esn_name: 'Abricot' }) })).toBe(
      'reconfiguration',
    )
  })

  it('un état illisible (pas de réponses du tout) ne conclut PAS « nouveau venu »', () => {
    // `undefined` = on ne sait pas. Envoyer quelqu'un sur la page de bienvenue
    // sur une absence de donnée, ce serait accueillir un abonné de six mois.
    expect(resolveOnboardingEntry({ status: 'in_progress', answers: undefined })).toBe('continue')
  })
})

describe('reconfigurationPlan — ce qu’on redemande, et ce qu’on ne sait pas mesurer (#2022.4/.5)', () => {
  it('ne redemande QUE les réponses absentes', () => {
    const plan = reconfigurationPlan(answers({ esn_name: 'Abricot', positioning: 'nearshore' }))
    expect(plan.keys).not.toContain('esn_name')
    expect(plan.keys).not.toContain('positioning')
    expect(plan.keys).toContain('main_sales_pain')
  })

  it('le temps estimé est DÉRIVÉ de la durée du questionnaire, jamais ressaisi', () => {
    const plan = reconfigurationPlan(answers())
    // Tout est vide ⇒ le questionnaire entier ⇒ la fourchette entière.
    expect(plan.estimatedMinutes).toEqual(ONBOARDING_ESTIMATED_MINUTES)
  })

  /**
   * #2626.1 revient sur R15N-9, délibérément (voir la note en tête de
   * fichier) — `esn_maturity_situation` et `company_growth_goal` ont rejoint
   * les questions reportées au Temps 2 : elles ne sont plus dans
   * `TEMPS1_QUESTION_KEYS`, donc plus dans ce que `reconfigurationPlan`
   * redemande.
   */
  it('les DIX clés requises remplies suffisent désormais : le reste est reporté au Temps 2, pas redemandé ici', () => {
    const requiredOnly = Object.fromEntries(TEMPS1_REQUIRED_KEYS.map(key => [key, 'rempli'])) as Partial<EsnAnswers>
    const plan = reconfigurationPlan(answers(requiredOnly))
    expect(plan.keys).not.toContain('esn_maturity_situation')
    expect(plan.keys).not.toContain('company_growth_goal')
    expect(plan.keys).toEqual([])
    expect(plan.estimatedMinutes).toBeNull()
  })

  it('rien à redemander ⇒ AUCUNE durée — « 0 minute » serait faux', () => {
    const complet = Object.fromEntries(TEMPS1_QUESTION_KEYS.map(key => [key, 'rempli'])) as Partial<EsnAnswers>
    const plan = reconfigurationPlan(answers(complet))
    expect(plan.keys).toEqual([])
    expect(plan.estimatedMinutes).toBeNull()
  })

  it('une fourchette annoncée n’est jamais inférieure à la minute', () => {
    const presqueComplet = Object.fromEntries(
      TEMPS1_QUESTION_KEYS.filter(key => key !== 'main_sales_pain').map(key => [key, 'rempli']),
    ) as Partial<EsnAnswers>
    const plan = reconfigurationPlan(answers(presqueComplet))
    expect(plan.keys).toEqual(['main_sales_pain'])
    expect(plan.estimatedMinutes?.min).toBeGreaterThanOrEqual(1)
    expect(plan.estimatedMinutes?.max).toBeGreaterThanOrEqual(plan.estimatedMinutes?.min ?? 0)
  })
})

/* -------------------------------------------------------------------------- */
/*  Reprise d'un parcours marqué terminé avant d'avoir tout posé (16/09/2026)  */
/* -------------------------------------------------------------------------- */

/**
 * Mesuré en PRODUCTION le 16/09/2026 sur l'espace de Louis :
 * `status: completed` avec `current_stage_code: transition_summary`, et plus de
 * soixante réponses à `null` — des sous-étapes du questionnaire AJOUTÉES après
 * qu'il l'a terminé (client idéal, interlocuteurs, chemins d'accès, outillage,
 * temps de charge, freins). La porte ne lisait que le STATUT : `/onboarding`
 * renvoyait vers `/chat`, et le parcours ne se reprenait plus jamais.
 *
 * Le témoin qui compte est le PREMIER test : un espace qui a réellement tout
 * parcouru reste FERMÉ. Rouvrir le questionnaire à tout le monde renverrait un
 * utilisateur satisfait dans un questionnaire de 72 questions.
 */
describe('canOfferResume — terminé ET des sous-étapes jamais posées (16/09/2026)', () => {
  const filled = (keys: readonly string[]): EsnAnswers =>
    answers(Object.fromEntries(keys.map(key => [key, 'rempli'])) as Partial<EsnAnswers>)

  /** Tout ce que le parcours pose réellement — un espace qui a vraiment fini. */
  const toutParcouru = (): EsnAnswers => filled(TEMPS1_QUESTION_KEYS)
  /** Les 10 clés de la porte de complétion serveur, et rien d'autre : la forme
   *  de l'espace mesuré — marqué terminé au récapitulatif, étape 5 sur 8. */
  const arreteAuRecap = (): EsnAnswers => filled(TEMPS1_REQUIRED_KEYS)

  it('LE TÉMOIN — un espace qui a parcouru toutes les sous-étapes reste FERMÉ', () => {
    expect(canOfferResume({ status: 'completed', answers: toutParcouru(), credits: credits() })).toBe(false)
    expect(resolveOnboardingEntry({ status: 'completed', answers: toutParcouru() })).toBe('continue')
  })

  it('#2626.1 — terminé au récapitulatif (les dix requises, rien de plus) ne se distingue plus de « a tout parcouru » : FERMÉ', () => {
    // Avant #2626.1, `arreteAuRecap` (10 requises) était un sous-ensemble
    // STRICT de `TEMPS1_QUESTION_KEYS` (le parcours en posait 72) : la
    // reprise se justifiait. Depuis l'arbitrage Temps 2, `TEMPS1_QUESTION_KEYS`
    // s'est réduit aux clés requises elles-mêmes — les deux ensembles sont
    // désormais égaux, et ce cas précis n'existe plus.
    expect(canOfferResume({ status: 'completed', answers: arreteAuRecap(), credits: credits() })).toBe(false)
    expect(resolveOnboardingEntry({ status: 'completed', answers: arreteAuRecap() })).toBe('continue')
  })

  it('une clé requise ajoutée APRÈS qu’un compte a terminé reste détectée : reprise proposée', () => {
    // Le vrai mécanisme de l'incident du 16/09, sous sa forme qui survit à
    // #2626.1 (GA-26) : une clé requise absente d'un compte `completed`
    // déclenche toujours la reprise, quelle que soit la raison de son
    // absence.
    const uneRequiseManquante = filled(TEMPS1_REQUIRED_KEYS.slice(0, -1))
    expect(canOfferResume({ status: 'completed', answers: uneRequiseManquante, credits: credits() })).toBe(true)
    expect(resolveOnboardingEntry({ status: 'completed', answers: uneRequiseManquante })).toBe('resume')
  })

  // #4158.12 — un membre qui attend l'administrateur ne répond qu'à ses questions
  // perso : lui proposer la « reprise » des questions entreprise serait lui
  // demander ce que l'API ignorera.
  it('#4158.12 — un membre qui attend l’administrateur ne se voit JAMAIS proposer la reprise', () => {
    const uneRequiseManquante = filled(TEMPS1_REQUIRED_KEYS.slice(0, -1))
    expect(
      canOfferResume({ status: 'completed', answers: uneRequiseManquante, credits: credits(), awaitingAdmin: true }),
    ).toBe(false)
    expect(resolveOnboardingEntry({ status: 'completed', answers: uneRequiseManquante, awaitingAdmin: true })).toBe(
      'continue',
    )
    // Le témoin : sans l'attente, la même situation propose bien la reprise.
    expect(canOfferResume({ status: 'completed', answers: uneRequiseManquante, credits: credits() })).toBe(true)
  })

  it('une sous-étape qui porte NE SERAIT-CE QU’UNE réponse a été atteinte : on ne la rouvre pas', () => {
    // La mesure porte sur la SOUS-ÉTAPE, pas sur la question. Une réponse laissée
    // vide sur un écran qu'on a vu n'est pas une étape jamais posée — et c'est
    // ce qui sépare cette porte de `reconfigurationPlan`, qui compte les clés.
    const uneParEtape = filled(TEMPS1_SUBSTEPS.map(step => step.questions[0].key))
    expect(canOfferResume({ status: 'completed', answers: uneParEtape, credits: credits() })).toBe(false)
  })

  it('un questionnaire ENCORE EN COURS n’est pas une reprise — il se continue', () => {
    expect(canOfferResume({ status: 'in_progress', answers: arreteAuRecap(), credits: credits() })).toBe(false)
  })

  it('l’espace de DÉMONSTRATION est PARTAGÉ : aucune reprise ne lui est proposée', () => {
    const demo = credits({ is_demo: true } as Partial<UserCredits>)
    expect(canOfferResume({ status: 'completed', answers: arreteAuRecap(), credits: demo })).toBe(false)
  })

  it('un état illisible ne conclut PAS « il manque des étapes » — non mesuré n’est pas zéro', () => {
    expect(canOfferResume({ status: 'completed', answers: undefined, credits: credits() })).toBe(false)
  })
})

/**
 * #2014.2/.5/.8 — ONBOARDING SELON L'ORIGINE DU COMPTE.
 *
 * Dérivation UNIQUE, ici et nulle part ailleurs. Sur les sept origines de
 * l'issue, seules deux ont un signal FIABLE dans le produit aujourd'hui :
 * `credits.plan === 'beta'` (provisionné par le back-office, jamais
 * self-service) et un palier PAYANT déjà servi avant la première question
 * (`starter`/`team`/`growth`). Les quatre autres (invitation, démo, transfert
 * d'espace) n'ont aucune colonne ni paramètre qui les distingue — mesuré, pas
 * supposé — donc elles retombent sur `self_service`, qui reste VRAI, plutôt
 * qu'une devinette. Voir le rapport de lot pour le détail par origine.
 */
describe("#2014.2/.5/.8 — resolveOnboardingOrigin : dérivation UNIQUE de l'origine", () => {
  it('un compte bêta provisionné se reconnaît à son palier', () => {
    expect(resolveOnboardingOrigin(credits({ plan: 'beta' }))).toBe('beta_provisioned')
  })

  it('un palier payant déjà servi avant toute réponse est un retour après paiement', () => {
    expect(resolveOnboardingOrigin(credits({ plan: 'starter' }))).toBe('paid_return')
    expect(resolveOnboardingOrigin(credits({ plan: 'team' }))).toBe('paid_return')
    expect(resolveOnboardingOrigin(credits({ plan: 'growth' }))).toBe('paid_return')
  })

  it('le palier de signup self-service ne porte aucune origine particulière', () => {
    expect(resolveOnboardingOrigin(credits({ plan: 'decouverte' }))).toBe('self_service')
  })

  it('une lecture de crédits absente (échec réseau) répond self_service — jamais une origine devinée', () => {
    expect(resolveOnboardingOrigin(null)).toBe('self_service')
    expect(resolveOnboardingOrigin(undefined)).toBe('self_service')
  })
})

/**
 * #2014.3 / #2014.7 — l'invité d'un collègue et le transféré vers un autre
 * espace sont le MÊME événement (décision Louis 17/09) : les deux se
 * reconnaissent au même signal, `OnboardingService.getState` ayant appris à
 * lire la dernière invitation ACCEPTÉE pour cette adresse
 * (`onboarding.service.ts:findJoinedWorkspace`). `resolveOnboardingOrigin`
 * reste l'UNIQUE endroit qui décide de l'origine (#2014.8) : la présence
 * d'un espace rejoint l'emporte sur le palier, parce que c'est le signal le
 * plus direct — une invitation réellement acceptée, jamais une inférence.
 */
describe("#2014.3/.7 — resolveOnboardingOrigin : l'espace REJOINT l'emporte sur le palier", () => {
  it('un espace rejoint (invitation acceptée) est reconnu, même sur un compte self-service', () => {
    expect(
      resolveOnboardingOrigin(credits({ plan: 'decouverte' }), {
        workspace_name: 'Acme Consulting',
        invited_by_name: 'Léa Dupont',
      }),
    ).toBe('invited')
  })

  it("l'espace rejoint l'emporte même sur un palier bêta ou payant — le signal le plus direct gagne", () => {
    expect(resolveOnboardingOrigin(credits({ plan: 'beta' }), { workspace_name: 'Acme', invited_by_name: null })).toBe(
      'invited',
    )
    expect(
      resolveOnboardingOrigin(credits({ plan: 'growth' }), { workspace_name: 'Acme', invited_by_name: null }),
    ).toBe('invited')
  })

  it('`joined_workspace` absent ou `null` ne change rien aux trois origines déjà connues', () => {
    expect(resolveOnboardingOrigin(credits({ plan: 'decouverte' }), null)).toBe('self_service')
    expect(resolveOnboardingOrigin(credits({ plan: 'decouverte' }))).toBe('self_service')
  })
})

/**
 * #2021 — DÉCISION LOUIS 08/10/2026 : `shouldShowOnboardingRefreshBanner` est
 * l'image en miroir de `needsOnboarding` sur ce même cas — exactement là où
 * `needsOnboarding` cesse de rediriger, ce bandeau doit apparaître, et
 * nulle part ailleurs.
 */
describe('shouldShowOnboardingRefreshBanner — le bandeau de reprise, miroir de needsOnboarding (#2021)', () => {
  it('visible pour un utilisateur déjà onboardé qui a redemandé une reconfiguration, sans report', () => {
    expect(
      shouldShowOnboardingRefreshBanner({
        status: 'refresh_required',
        credits: credits(),
        skippedAt: null,
        firstCompletedAt: '2026-08-01T00:00:00Z',
      }),
    ).toBe(true)
  })

  it('invisible pour un utilisateur JAMAIS onboardé — needsOnboarding le redirige déjà, le bandeau ne double pas la porte', () => {
    expect(
      shouldShowOnboardingRefreshBanner({
        status: 'refresh_required',
        credits: credits(),
        skippedAt: null,
        firstCompletedAt: null,
      }),
    ).toBe(false)
  })

  it('invisible dès qu’un « Plus tard » a été posé — même garde que needsOnboarding', () => {
    expect(
      shouldShowOnboardingRefreshBanner({
        status: 'refresh_required',
        credits: credits(),
        skippedAt: '2026-09-18T10:00:00Z',
        firstCompletedAt: '2026-08-01T00:00:00Z',
      }),
    ).toBe(false)
  })

  it('invisible hors `refresh_required` (en cours, terminé…)', () => {
    expect(
      shouldShowOnboardingRefreshBanner({
        status: 'completed',
        credits: credits(),
        skippedAt: null,
        firstCompletedAt: '2026-08-01T00:00:00Z',
      }),
    ).toBe(false)
    expect(
      shouldShowOnboardingRefreshBanner({
        status: 'in_progress',
        credits: credits(),
        skippedAt: null,
        firstCompletedAt: null,
      }),
    ).toBe(false)
  })

  it('invisible en démo, quel que soit l’état lu — une reconfiguration n’y a jamais de sens', () => {
    expect(
      shouldShowOnboardingRefreshBanner({
        status: 'refresh_required',
        credits: credits({ is_demo: true }),
        skippedAt: null,
        firstCompletedAt: '2026-08-01T00:00:00Z',
      }),
    ).toBe(false)
  })
})
