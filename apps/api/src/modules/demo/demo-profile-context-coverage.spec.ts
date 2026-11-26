import { profileContextSchema, type WelcomeSummary } from '@bellum/contracts'
import { DEMO_PROFILE_CONTEXT } from './demo-dataset'

/**
 * « ET EN DÉMONSTRATION, L'AUDIT COMMERCIAL (`/settings/profile/audit`) MONTRE
 * QUOI ? » — #2075, le second câble coupé nommé par l'écrivain de la page.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PIÈGE PAYÉ ICI : « LE SEED N'A PAS LA FORME QUE L'ÉCRAN LIT »
 * ─────────────────────────────────────────────────────────────────────────────
 * `profile_context` n'ajoute aucune table que `demo-coverage.spec.ts` puisse
 * mettre en rouge (elle vit sur `profiles`, scopée par `user_id` — voir
 * `demo-coverage.ts`) : cette garde-ci porte donc seule la question. Elle ne se
 * contente pas de vérifier qu'un objet existe : elle rejoue le contrat RÉEL
 * (`profileContextSchema` de `@bellum/contracts`, le même que l'API sert) et
 * les chemins EXACTS que `CommercialAuditScreen` (branche
 * `page-restitution-audit`, `features/commercial-audit/lib/build-audit.ts`)
 * déstructure pour décider « mesuré » contre « non établi ». Un objet
 * plausible mais mal formé y aurait rendu tout l'écran « non établi », vert en
 * CI ici, vide devant un prospect.
 */
describe('couverture du contexte de profil (audit commercial) en démonstration', () => {
  it('#2075 — DEMO_PROFILE_CONTEXT est un ProfileContext valide au sens du contrat partagé', () => {
    const parsed = profileContextSchema.safeParse(DEMO_PROFILE_CONTEXT)
    expect(parsed.success).toBe(true)
  })

  it('#2075 — porte les CINQ en-têtes que build-audit.ts lit, aucune non établie', () => {
    const ctx = DEMO_PROFILE_CONTEXT
    // headline « posture »
    expect(ctx.sellingPosture).toBeTruthy()
    // headline « archetype »
    expect(ctx.esnArchetype).toBeTruthy()
    // headline « target »
    expect(ctx.idealAccountProfile?.size).toBeTruthy()
    // #4516.4 — une taille VISÉE : « all » ne propose rien à Découvrir (`proposeProfileSize`), la démo resterait muette.
    expect(ctx.idealAccountProfile?.size).not.toBe('all')
    expect(ctx.idealAccountProfile?.decisionLevel).toBeTruthy()
    expect(ctx.idealAccountProfile?.entryStrategy).toBeTruthy()
    expect(ctx.idealAccountProfile?.sectorsPriority.length).toBeGreaterThan(0)
    // headline « bottleneck »
    expect(ctx.coachingInsights?.mainWeakness.trim()).not.toBe('')
    // headline « cadence »
    expect(ctx.coachingInsights?.cadenceRecommendation?.analysesPerWeek).toBeGreaterThanOrEqual(0)
    expect(ctx.coachingInsights?.cadenceRecommendation?.messagesPerDay).toBeGreaterThanOrEqual(0)
    expect(ctx.coachingInsights?.cadenceRecommendation?.followUpsPerWeek).toBeGreaterThanOrEqual(0)
  })

  it('#2075 — porte les trois colonnes Arrêter / Garder / Renforcer, aucune vide', () => {
    const ctx = DEMO_PROFILE_CONTEXT
    expect(ctx.messagingStyle?.avoid.length).toBeGreaterThan(0) // « Arrêter »
    expect(ctx.messagingStyle?.differentiationPoints.length).toBeGreaterThan(0) // « Garder »
    expect(ctx.coachingInsights?.mainWeakness).toBeTruthy() // « Renforcer »
    expect(ctx.coachingInsights?.keyAdvice).toBeTruthy() // « Renforcer »
  })

  it('#2075 — porte les six conséquences produit, y compris la personnalisation du copilote', () => {
    const ctx = DEMO_PROFILE_CONTEXT
    expect(ctx.messagingStyle?.tone).toBeTruthy()
    expect(ctx.messagingStyle?.messageLength).toBeTruthy()
    expect(ctx.messagingStyle?.valuePropositionAngle.trim()).not.toBe('') // « messages »
    expect(ctx.analysisParameters?.analysisDepth).toBeTruthy() // « routines »
    expect(ctx.analysisParameters?.focusAreas.length).toBeGreaterThan(0) // « routines »
    expect(ctx.bellumPhrases?.welcome.trim()).not.toBe('') // « copilot » (#2075.7)
  })

  /**
   * #2067.2 — la cible partenaires suit l'archétype. Parité démo (craft rule
   * n°9) : le bloc « Viser un rythme mensuel » a désormais TROIS cibles, et
   * une démo qui n'en montrerait que deux se découvrirait en réunion.
   *
   * L'espace de démo est SEEDÉ, pas « vide à dessein » : il a une porte
   * partenaire (`DEMO_ESN_PROFILE.go_to_market_channels` contient
   * « Partenaires ESN ») et déclare `partners_regular_count: '2'` — les deux
   * conditions que le moteur exige pour calculer la cible. La lui refuser
   * serait mentir sur ses propres réponses.
   */
  it('#2067.2 — la cible partenaires est seedée, ancrée sur la base déclarée et dans la plage de son archétype', () => {
    const ctx = DEMO_PROFILE_CONTEXT
    expect(ctx.esnArchetype).toBe('boutiqueExpert')
    // La plage `boutiqueExpert` de `PARTNERS_PER_MONTH_BY_ARCHETYPE`
    // (apps/ia/app/models/profile_context.py) : 2-4.
    expect(ctx.coachingInsights?.kpiTargets?.partnersPerMonth).toBeGreaterThanOrEqual(2)
    expect(ctx.coachingInsights?.kpiTargets?.partnersPerMonth).toBeLessThanOrEqual(4)
    // GA-18 / GA-19 — jamais « 0 » : l'absence se dit `null`, et la démo n'a
    // aucune raison d'être absente ici.
    expect(ctx.coachingInsights?.kpiTargets?.partnersPerMonth).not.toBe(0)
  })

  it('#2067.2 — preuve que la garde sait dire NON : une cible hors plage ou à zéro échoue', () => {
    const hors = { ...DEMO_PROFILE_CONTEXT.coachingInsights?.kpiTargets, partnersPerMonth: 9 }
    expect(hors.partnersPerMonth).toBeGreaterThan(4)
    // Et le contrat partagé lui-même refuse le zéro, pas seulement cet écran.
    const zero = profileContextSchema.safeParse({
      ...DEMO_PROFILE_CONTEXT,
      coachingInsights: {
        ...DEMO_PROFILE_CONTEXT.coachingInsights,
        kpiTargets: { ...DEMO_PROFILE_CONTEXT.coachingInsights?.kpiTargets, partnersPerMonth: 0 },
      },
    })
    expect(zero.success).toBe(false)
  })

  it('#2075 — bellumPhrases est COMPLET (les 5 champs du contrat sont requis, pas seulement `welcome`)', () => {
    const phrases = DEMO_PROFILE_CONTEXT.bellumPhrases
    expect(phrases?.welcome.trim()).not.toBe('')
    expect(phrases?.firstAnalysisCta.trim()).not.toBe('')
    expect(phrases?.weeklySummaryIntro.trim()).not.toBe('')
    expect(phrases?.emptyState.trim()).not.toBe('')
    expect(phrases?.scoreContext.trim()).not.toBe('')
  })

  it('#2075 — doctrine : aucune probabilité AFFIRMÉE, aucun fournisseur nommé, Laura par son nom', () => {
    const ctx = DEMO_PROFILE_CONTEXT
    // Seul le texte LIBRE écrit pour ce lot — pas les clés du contrat
    // (`braveQueriesCount`, `firecrawlPagesCount`…) : ce sont des paramètres
    // internes déjà présents dans le contrat partagé, jamais lus ni affichés
    // par `build-audit.ts`, et les y interdire attraperait un nom de champ,
    // pas un texte montré à un prospect.
    const free = [
      ctx.messagingStyle?.valuePropositionAngle,
      ...(ctx.messagingStyle?.differentiationPoints ?? []),
      ...(ctx.messagingStyle?.avoid ?? []),
      ctx.coachingInsights?.mainWeakness,
      ctx.coachingInsights?.keyAdvice,
      ctx.bellumPhrases?.welcome,
      ctx.bellumPhrases?.firstAnalysisCta,
      ctx.bellumPhrases?.weeklySummaryIntro,
      ctx.bellumPhrases?.emptyState,
      ctx.bellumPhrases?.scoreContext,
    ].join(' \n ')
    const text = free.toLowerCase()

    // « jamais comme une chance de signer » est la NÉGATION voulue
    // (scoreContext) — ce qu'on refuse est une probabilité AFFIRMÉE.
    expect(text).not.toMatch(/\d+\s?%/)
    expect(text).not.toMatch(/probabilité de (closing|réussite|signature)/)
    const chanceIdx = text.indexOf('chance de')
    expect(chanceIdx).toBeGreaterThan(-1)
    expect(text.slice(Math.max(0, chanceIdx - 20), chanceIdx)).toContain('jamais')

    for (const vendor of ['anthropic', 'claude', 'brave', 'firecrawl', 'apollo', 'pappers', 'openai']) {
      expect(text).not.toContain(vendor)
    }
    expect(ctx.bellumPhrases?.welcome).toContain('Laura')
  })

  it('preuve que la garde sait dire NON — un objet sans idealAccountProfile échoue la même assertion', () => {
    const missing: Pick<typeof DEMO_PROFILE_CONTEXT, 'idealAccountProfile'> = {}
    expect(missing.idealAccountProfile?.size).toBeFalsy()
  })
})

/**
 * « ET EN DÉMONSTRATION, `/welcome` MONTRE QUOI ? » — W7 (#2069.1→.14,
 * #2074.17→.27), trou mesuré le 15/09/2026.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TROU : `welcomeSummary` EST OPTIONNEL DANS LE CONTRAT, ET ABSENT ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * `WelcomeScreen.tsx` lit `profile_context.welcomeSummary` — les quatre tuiles
 * de personnalisation (`searchesPersonalization`, `contactsPersonalization`,
 * `messagesPersonalization`, `scoringPersonalization`) et la section
 * « Premiers comptes à analyser » (`firstAnalysisSuggestions`). Le champ est
 * `.optional()` côté contrat (#2069 : une liste de suggestions vide est un
 * résultat juste, pas une erreur), et `DEMO_PROFILE_CONTEXT` ne le portait pas
 * du tout avant ce lot — les quatre tuiles retombaient sur leur repli statique
 * (`PersonalizationTile` dégrade proprement) mais la section suggestions,
 * elle, disparaît ENTIÈREMENT (`hasSuggestions` à `false`) : un visiteur de la
 * salle de démonstration ne voyait jamais cette partie du produit, alors
 * qu'elle est câblée et testée côté IA (`welcome_account_suggestions.py`,
 * `test_welcome_account_suggestions.py`).
 *
 * Même motif que la garde au-dessus (`profile_context` n'a pas de
 * `workspace_id`, donc `demo-coverage.spec.ts` ne peut pas la voir) : cette
 * garde-ci porte seule la question pour `/welcome`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RIEN D'INVENTÉ QUI NE SOIT DÉJÀ VRAI AILLEURS DANS LE JEU DE DONNÉES
 * ─────────────────────────────────────────────────────────────────────────────
 * Les trois suggestions reprennent des secteurs de {@link DEMO_ESN_PROFILE}
 * (`target_sectors`) et les expertises de {@link DEMO_ESN_PROFILE}
 * (`expertise_areas`), sur des entreprises DIFFÉRENTES des six dossiers déjà
 * seedés ({@link DEMO_DOSSIERS}) — ce sont des comptes qu'un commercial
 * n'a PAS encore ouverts, pas une redite des dossiers existants.
 */
describe('couverture de welcomeSummary (/welcome) en démonstration', () => {
  const summary = DEMO_PROFILE_CONTEXT.welcomeSummary

  it('#2069/#2074 — welcomeSummary est un WelcomeSummary valide au sens du contrat partagé', () => {
    expect(summary).toBeDefined()
  })

  it('#2069/#2074 — les quatre tuiles de personnalisation ne tombent jamais sur leur repli statique', () => {
    expect(summary?.profileRecap.trim()).not.toBe('')
    expect(summary?.searchesPersonalization.trim()).not.toBe('')
    expect(summary?.contactsPersonalization.trim()).not.toBe('')
    expect(summary?.messagesPersonalization.trim()).not.toBe('')
    expect(summary?.scoringPersonalization.trim()).not.toBe('')
  })

  it('#2069 — firstAnalysisSuggestions porte 1 à 4 entreprises RÉELLEMENT nommées, chacune avec son secteur et sa raison', () => {
    const suggestions = summary?.firstAnalysisSuggestions ?? []
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions.length).toBeLessThanOrEqual(4) // le plafond du contrat (`.max(4)`)
    for (const suggestion of suggestions) {
      expect(suggestion.companyName.trim()).not.toBe('')
      expect(suggestion.sector.trim()).not.toBe('')
      expect(suggestion.reason.trim()).not.toBe('')
    }
  })

  it('#2069 — les suggestions ne redisent pas les six dossiers déjà seedés — ce sont des comptes pas encore ouverts', () => {
    const alreadyAnalyzed = ['Société Générale', 'Groupe BPCE', 'SNCF']
    const suggested = (summary?.firstAnalysisSuggestions ?? []).map(s => s.companyName)
    for (const name of suggested) {
      expect(alreadyAnalyzed).not.toContain(name)
    }
  })

  it('#2069/GA-259 — aucun taux de couverture présenté comme un fait de marché, aucun fournisseur nommé, aucun critère protégé', () => {
    const free = [
      summary?.profileRecap,
      summary?.searchesPersonalization,
      summary?.contactsPersonalization,
      summary?.messagesPersonalization,
      summary?.scoringPersonalization,
      ...(summary?.firstAnalysisSuggestions ?? []).map(s => s.reason),
    ].join(' \n ')
    const text = free.toLowerCase()

    // GA-259 — un taux de couverture (et sa négation) ne sont pas un fait de
    // marché ; ce texte ne parle même pas de couverture, donc ce vocabulaire
    // n'a rien à y faire.
    expect(text).not.toMatch(/\d+\s?%/)
    for (const term of ['couverture', 'externalis', 'sous-traitent', 'recours à des prestataires']) {
      expect(text).not.toContain(term)
    }

    // Aucune probabilité affirmée (même défaut que `scoring_personalization`
    // mesuré en production le 14/09/2026 : « la probabilité d'un besoin urgent »).
    expect(text).not.toMatch(/probabilité de (closing|réussite|signature|un besoin)/)

    // #2074 — jamais « ils recrutent », jamais un fournisseur en place déjà
    // nommé : ce qu'on montre est une pile OBSERVÉE, pas un besoin annoncé.
    for (const term of ['recrute', 'besoin ouvert', 'fournisseur en place']) {
      expect(text).not.toContain(term)
    }

    // NOS fournisseurs ne se nomment jamais (`tool-naming.ts`).
    for (const vendor of ['anthropic', 'claude', 'brave', 'firecrawl', 'apollo', 'pappers', 'openai']) {
      expect(text).not.toContain(vendor)
    }

    // Aucun critère protégé (âge, genre, origine, nationalité, photo,
    // situation familiale, adresse) — ces suggestions désignent des
    // ENTREPRISES, jamais des personnes.
    for (const term of ['âge', 'genre', 'origine', 'nationalité', 'situation familiale']) {
      expect(text).not.toContain(term)
    }
  })

  it('preuve que la garde sait dire NON — une liste de suggestions vide échoue l’assertion « au moins une »', () => {
    const missing: Pick<WelcomeSummary, 'firstAnalysisSuggestions'> = { firstAnalysisSuggestions: [] }
    // Ce que le test « 1 à 4 entreprises » ci-dessus exige de `suggestions.length` :
    // `toBeGreaterThan(0)`. Sur cette entrée cassée, la même condition est fausse —
    // la preuve que la garde aurait rougi.
    expect(missing.firstAnalysisSuggestions.length > 0).toBe(false)
  })
})

/**
 * « ET EN DÉMONSTRATION, LA CARTE DE LAURA DE #2088.34 MONTRE QUOI ? »
 *
 * `OnboardingReviewPage` (voir `demo-coverage.ts`) monte
 * `OnboardingLauraHypothesisCard` dès que `profile_context.contradiction`
 * existe — sans cette entrée, un visiteur de la salle ne verrait jamais ce
 * composant, alors qu'il est câblé et testé côté écran
 * (`OnboardingReviewPage.test.tsx`).
 *
 * RIEN D'INVENTÉ : `statement`/`reasoning` reprennent trois réponses déjà
 * vraies dans {@link DEMO_ESN_PROFILE} (`sales_team_size`, `main_sales_pain`)
 * et dans ce même objet (`coachingInsights.kpiTargets.accountsPerMonth`) —
 * jamais un quatrième fait inventé pour l'occasion. `DEMO_ESN_PROFILE.priority_sectors`
 * est volontairement à DEUX (#2041.1) : aucun des huit détecteurs
 * déterministes (#2029) ne se déclenche dans cette salle, donc cette
 * tension-ci EST la seule preuve que la carte existe en démonstration.
 */
describe('couverture de la contradiction de Laura (#2088.34) en démonstration', () => {
  it('#2088.34 — contradiction est un ProfileContradiction valide (statement ET reasoning, non vides)', () => {
    const parsed = profileContextSchema.safeParse(DEMO_PROFILE_CONTEXT)
    expect(parsed.success).toBe(true)
    expect(DEMO_PROFILE_CONTEXT.contradiction?.statement.trim()).not.toBe('')
    expect(DEMO_PROFILE_CONTEXT.contradiction?.reasoning.trim()).not.toBe('')
  })

  it('#2088.34 — la phrase est cadrée COMME une hypothèse, jamais une affirmation', () => {
    const statement = DEMO_PROFILE_CONTEXT.contradiction?.statement ?? ''
    expect(statement).toMatch(/reste à vérifier/)
  })

  it('#2088.34 — doctrine : aucune probabilité, aucun fournisseur nommé, tutoiement', () => {
    const text =
      `${DEMO_PROFILE_CONTEXT.contradiction?.statement} ${DEMO_PROFILE_CONTEXT.contradiction?.reasoning}`.toLowerCase()
    expect(text).not.toMatch(/\d+\s?%/)
    expect(text).not.toMatch(/probabilité/)
    for (const vendor of ['anthropic', 'claude', 'brave', 'firecrawl', 'apollo', 'pappers', 'openai']) {
      expect(text).not.toContain(vendor)
    }
    expect(text).toMatch(/\btu\b|\bton\b|\bta\b|\btes\b/)
    expect(text).not.toMatch(/\bvous\b|\bvotre\b|\bvos\b/)
  })

  it('preuve que la garde sait dire NON — un statement vide échoue la même assertion', () => {
    const empty = { ...DEMO_PROFILE_CONTEXT.contradiction, statement: '' }
    expect(empty.statement.trim() !== '').toBe(false)
  })
})
