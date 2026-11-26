import { describe, expect, it } from 'vitest'
import { dossierHeroStateValues } from '@bellum/contracts'
import { HERO_PRIMARY_ACTIONS, heroPrimaryAction, type HeroPrimaryActionInput } from './heroPrimaryAction'

/**
 * #2117.6, .25-29 — LE GESTE PRINCIPAL DU DOSSIER, PAR ÉTAT.
 *
 * Un test par état, et chacun dit quel CHAMP décide : sans ça, « l'action
 * dépend de l'état » est une intention, pas un comportement. Les cinq entrées
 * sont mutuellement exclusives — c'est ce qui permet au registre de les
 * compter pour un seul geste principal (#2116.42).
 */
const base: HeroPrimaryActionInput = {
  status: 'completed',
  commercialStatus: 'opportunity',
  priorityGate: 'prioritised',
  nextActionLabel: null,
  meetingBooked: false,
}

describe('heroPrimaryAction — une action principale par état du dossier', () => {
  it('#2117.25 — analyse incomplète : « Terminer l’analyse ». Le champ qui décide est `status`', () => {
    for (const status of ['prospect', 'analyzing', 'error', 'canceled'] as const) {
      const action = heroPrimaryAction({ ...base, status })
      expect(action.state, status).toBe('analysis-incomplete')
      expect(action.cta).toBe('dossier.hero.finishAnalysis')
    }
  })

  it('#4459.1 — jamais analysé (versé depuis Découvrir ou par un import du CRM) : « Analyser le compte », jamais « Préparer le plan »', () => {
    for (const status of ['prospect', 'imported'] as const) {
      const action = heroPrimaryAction({ ...base, status })
      expect(action.state, status).toBe('analysis-incomplete')
      expect(action.neverAnalyzed, status).toBe(true)
    }
    for (const status of ['analyzing', 'error', 'canceled', 'completed'] as const) {
      expect(heroPrimaryAction({ ...base, status }).neverAnalyzed, status).toBe(false)
    }
  })

  it('#2117.26 — dossier complet sans prochaine action : « Préparer le plan ». Le champ qui décide est `nextActionLabel`', () => {
    const action = heroPrimaryAction({ ...base, nextActionLabel: null })
    expect(action.state).toBe('no-plan')
    expect(action.cta).toBe('dossier.hero.preparePlan')
    // Une chaîne VIDE n'est pas une action : elle ne se nomme pas, elle ne se
    // continue pas. L'appelant passe déjà `null` dans ce cas, mais la fonction
    // ne s'appuie pas dessus.
    expect(heroPrimaryAction({ ...base, nextActionLabel: '   ' }).state).toBe('no-plan')
  })

  it('#2117.27 — plan actif : « Continuer la prochaine action », et elle est NOMMÉE', () => {
    const action = heroPrimaryAction({ ...base, nextActionLabel: 'Appeler le DSI' })
    expect(action.state).toBe('plan-active')
    expect(action.cta).toBe('dossier.hero.continueNextAction')
    expect(action.nextActionLabel).toBe('Appeler le DSI')
  })

  it('#2117.28 — rendez-vous posé : « Préparer le rendez-vous ». Le champ qui décide est `meetingBooked`', () => {
    const action = heroPrimaryAction({ ...base, meetingBooked: true, nextActionLabel: 'Appeler le DSI' })
    expect(action.state).toBe('meeting-booked')
    expect(action.cta).toBe('dossier.hero.prepareMeeting')
  })

  it('#2117.29 — compte en veille : « Voir ce qui a changé ». Deux champs le disent, `commercial_status` et la porte', () => {
    expect(heroPrimaryAction({ ...base, commercialStatus: 'watching' }).state).toBe('watching')
    expect(heroPrimaryAction({ ...base, priorityGate: 'parked' }).state).toBe('watching')
    expect(heroPrimaryAction({ ...base, commercialStatus: 'watching' }).cta).toBe('dossier.hero.seeChanges')
  })

  it('#2117.29 — les DEUX veilles ne sont pas au même rang : la porte décide, l’étape de cycle non', () => {
    // `priority_gate: 'parked'` est une décision prise sur ce compte : elle
    // passe devant le plan.
    expect(heroPrimaryAction({ ...base, priorityGate: 'parked', nextActionLabel: 'Appeler le DSI' }).state).toBe(
      'watching',
    )
    // `commercial_status: 'watching'` (« En observation ») est une ÉTAPE du
    // cycle commercial, entre « À trier » et « À potentiel ». Elle ne
    // contredit aucune action en cours — les confondre ferait disparaître
    // « Continuer la prochaine action » de tout un pan du portefeuille (dans
    // le jeu de démonstration, les cinq comptes sont `watching`).
    expect(heroPrimaryAction({ ...base, commercialStatus: 'watching', nextActionLabel: 'Appeler le DSI' }).state).toBe(
      'plan-active',
    )
  })

  /* ------------------------------------------------------------------ */
  /*  Les priorités — ce que la fonction fait quand DEUX états sont vrais */
  /* ------------------------------------------------------------------ */

  it('un dossier dont l’analyse n’est pas finie ne se voit rien proposer d’autre', () => {
    // Le reste du dossier n'existe pas encore : proposer « Préparer le plan »
    // sur un dossier vide enverrait sur un onglet sans contenu.
    const action = heroPrimaryAction({
      ...base,
      status: 'analyzing',
      meetingBooked: true,
      nextActionLabel: 'Appeler le DSI',
      commercialStatus: 'watching',
    })
    expect(action.state).toBe('analysis-incomplete')
  })

  it('un rendez-vous posé passe devant la veille et devant le plan — c’est la seule échéance datée', () => {
    const action = heroPrimaryAction({
      ...base,
      meetingBooked: true,
      priorityGate: 'parked',
      nextActionLabel: 'Appeler le DSI',
    })
    expect(action.state).toBe('meeting-booked')
  })

  it('un compte MIS DE CÔTÉ ne se voit pas proposer de continuer un plan qu’on a décidé de ne pas travailler', () => {
    const action = heroPrimaryAction({ ...base, priorityGate: 'parked', nextActionLabel: 'Appeler le DSI' })
    expect(action.state).toBe('watching')
  })

  /* ------------------------------------------------------------------ */
  /*  Les preuves exigées d'une garde                                    */
  /* ------------------------------------------------------------------ */

  it('LIT quelque chose : les cinq états du contrat ont chacun leur entrée, et chaque entrée est atteignable', () => {
    expect(Object.keys(HERO_PRIMARY_ACTIONS).sort()).toEqual([...dossierHeroStateValues].sort())
    // Et chacun des cinq est réellement ATTEINT par une entrée plausible — une
    // branche que rien ne déclenche n'est pas une action livrée.
    const atteints = new Set(
      (
        [
          { ...base, status: 'prospect' as const },
          { ...base },
          { ...base, nextActionLabel: 'Appeler le DSI' },
          { ...base, meetingBooked: true },
          { ...base, priorityGate: 'parked' as const },
        ] satisfies HeroPrimaryActionInput[]
      ).map(input => heroPrimaryAction(input).state),
    )
    expect([...atteints].sort()).toEqual([...dossierHeroStateValues].sort())
  })

  /**
   * #2117.80 — recette 23/09, prod 7e7105fb7 : sur un compte pauvre en
   * veille, l'en-tête ne disait RIEN sur l'absence d'action — il fallait
   * scroller ~700px jusqu'à la carte « Prochaine action ». `watchingReason`
   * porte cette distinction : `'noAction'` seulement quand c'est VRAI qu'il
   * n'y a rien à suggérer, jamais sur un compte `parked` (une décision
   * humaine peut cacher une action existante, simplement ignorée par choix).
   */
  it('#2117.80 — `watchingReason` distingue « rien à suggérer » d’un compte mis de côté', () => {
    const enObservation = heroPrimaryAction({ ...base, commercialStatus: 'watching', nextActionLabel: null })
    expect(enObservation.state).toBe('watching')
    expect(enObservation.watchingReason).toBe('noAction')

    const misDeCote = heroPrimaryAction({ ...base, priorityGate: 'parked', nextActionLabel: 'Appeler le DSI' })
    expect(misDeCote.state).toBe('watching')
    expect(misDeCote.watchingReason).toBe('parked')

    // Hors de l'état `watching`, la raison est TOUJOURS `null` — elle ne
    // fuit pas vers un état qu'elle ne concerne pas.
    for (const other of [
      heroPrimaryAction({ ...base, status: 'prospect' }),
      heroPrimaryAction({ ...base, nextActionLabel: 'Appeler le DSI' }),
      heroPrimaryAction({ ...base, meetingBooked: true }),
      heroPrimaryAction({ ...base, nextActionLabel: null, commercialStatus: 'opportunity' }),
    ]) {
      expect(other.watchingReason, other.state).toBeNull()
    }
  })

  it('sait dire NON : un compte neuf ne rend jamais « Continuer la prochaine action »', () => {
    // Le défaut que ce test attrape : brancher le CTA sur l'existence du plan
    // plutôt que sur la prochaine action. Un dossier complet PORTE un onglet
    // Plan, il n'a pas pour autant une action à continuer.
    expect(heroPrimaryAction({ ...base, nextActionLabel: null }).cta).not.toBe('dossier.hero.continueNextAction')
    expect(heroPrimaryAction({ ...base, status: 'prospect' }).cta).not.toBe('dossier.hero.preparePlan')
  })
})
