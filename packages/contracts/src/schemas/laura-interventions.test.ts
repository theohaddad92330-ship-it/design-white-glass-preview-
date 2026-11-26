import { describe, expect, it } from 'vitest'
import {
  computeSurfaceAcceptance,
  findIntervention,
  INTERVENTION_FAMILIES,
  INTERVENTION_FORMATS,
  interventionDefinitionSchema,
  interventionsOfFamily,
  isHygieneReminder,
  LAURA_INTERVENTIONS,
  SUGGESTED_SURFACE_ACCEPTANCE_FLOOR_PERCENT,
  surfaceAcceptanceOutcome,
} from './laura-interventions.js'
import { messagePriority } from './proactivity.js'

describe('le catalogue des interventions', () => {
  it('porte les trente du §5.4, plus celles du back-office (§5.2 du PDF 2), le dossier de compte, l’incohérence et le démarrage (#2409.8/.9)', () => {
    expect(LAURA_INTERVENTIONS).toHaveLength(51) // +1 (lot B3 15/10) : forecast fondateur (un COUNT), +1 (11/10) : métiers placés inconnus — Laura pose la question, +1 (#3939.3, 13/10) : douleur sourcée et datée du dossier ouvert
  })

  it('respecte la répartition annoncée : 8 · 7 · 8 · 18', () => {
    // Les trois premières familles sont celles du §5.4 et n'ont pas bougé. Ce
    // que le back-office ajoute est de la VALEUR MÉTIER, sans exception : un
    // besoin qui traîne, un relevé qui manque, une facture impayée. Aucune n'est
    // une invitation à découvrir le produit — c'est ce qui les distingue des
    // interventions d'adoption, que le budget de santé écarte sur un espace sain.
    //
    // La treizième de la famille est celle du DOSSIER de compte ouvert
    // (`account_hiring_with_available_bench`, maquette SOL6 n°6) : elle croise
    // un signal du dossier et une ressource du vivier, ce qui est bien de la
    // valeur métier et non une invitation à explorer.
    expect(interventionsOfFamily('onboarding')).toHaveLength(9) // +1 (11/10) : placed_roles_unknown
    expect(interventionsOfFamily('adoption')).toHaveLength(7)
    expect(interventionsOfFamily('churn_risk')).toHaveLength(8)
    // La quatorzième est l'INCOHÉRENCE (#1937.4) : une mission déclarée en
    // cours dont la date de fin saisie est passée. Elle est de valeur métier et
    // non d'adoption, et pour une raison qui se relit — la contradiction porte
    // sur une mission RÉELLE, facturée ou non ; un espace sain la voit aussi, et
    // le budget de santé ne doit surtout pas l'écarter comme une invitation.
    // #2409.8 / #2409.9 — le DÉMARRAGE d'une mission : ce qui manque avant
    // (`mission_start_not_ready`) et l'arrivée du jour 1 non confirmée
    // (`mission_day_one_unconfirmed`). Valeur métier : une mission réelle.
    expect(interventionsOfFamily('business_value')).toHaveLength(27) // +1 (lot B3 15/10) : forecast fondateur, +1 (#3939.3) : douleur sourcée du dossier, +1 : #3398.1 (dépendance à un client), +4 : #3398 (sans responsable, collisions, portefeuille trop large, fiches à qualifier), +1 (lot R12 07/10) : information terrain non enregistrée (appels sans débrief), +1 (lot T06 08/10) : entretien à préparer (brief non consulté)
  })

  it('filtre le catalogue qu’on lui DONNE, pas la copie du navigateur', () => {
    // Le panneau affiche ce que la route `/laura/catalogue` a SERVI — pas la
    // constante empaquetée dans son bundle. `useLaura.ts` l'écrit noir sur
    // blanc : « s'appuyer sur la copie du navigateur ferait deux vérités le
    // jour où le serveur filtrera (par offre, par espace, par droit) ». C'est
    // pour cela que la dérivation prend son catalogue en argument — sinon
    // l'appeler serait une RÉGRESSION de cette décision, pas un correctif.
    // Le défaut par défaut sert les appelants qui n'ont PAS de payload : les
    // gardes, le serveur lui-même.
    const served = [
      LAURA_INTERVENTIONS.find(intervention => intervention.family === 'onboarding')!,
      LAURA_INTERVENTIONS.find(intervention => intervention.family === 'churn_risk')!,
    ]
    expect(interventionsOfFamily('onboarding', served)).toHaveLength(1)
    expect(interventionsOfFamily('churn_risk', served)).toHaveLength(1)
    expect(interventionsOfFamily('adoption', served)).toHaveLength(0)
    expect(interventionsOfFamily('business_value', served)).toHaveLength(0)
  })

  it('n’a aucune clé en double', () => {
    const keys = LAURA_INTERVENTIONS.map(intervention => intervention.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('valide chaque entrée contre son schéma', () => {
    for (const intervention of LAURA_INTERVENTIONS) {
      expect(() => interventionDefinitionSchema.parse(intervention), intervention.key).not.toThrow()
    }
  })

  it('couvre les quatre familles', () => {
    for (const family of INTERVENTION_FAMILIES) expect(interventionsOfFamily(family).length).toBeGreaterThan(0)
  })

  it('n’annonce AUCUN format que rien ne porte — une forme sans entrée promet un levier qui n’existe pas', () => {
    // Le défaut qu'elle attrape, mesuré le 29/08 : `launcher_dot` et `none`
    // étaient au contrat, à la contrainte SQL et traduits dans deux langues, et
    // AUCUNE des 35 interventions ne les portait. L'écran de réglages annonce
    // une forme par format ; annoncer « une pastille sur le lanceur » quand
    // aucune intervention ne la demande — et qu'aucune barre de commande
    // n'existe pour la porter — décrit un produit qui n'est pas là.
    //
    // ⚠️ La garde LIT quelque chose : sans ces deux bornes, un catalogue vide
    // ou une énumération vide la rendrait verte pour toujours.
    expect(LAURA_INTERVENTIONS.length).toBeGreaterThan(30)
    expect(INTERVENTION_FORMATS.length).toBeGreaterThanOrEqual(3)

    const orphans = INTERVENTION_FORMATS.filter(
      format => !LAURA_INTERVENTIONS.some(intervention => intervention.format === format),
    )
    expect(orphans).toEqual([])
  })
})

describe('ce que le catalogue s’interdit', () => {
  it('ne porte AUCUN verbe d’écriture — Laura Produit guide, elle n’agit pas (D48)', () => {
    // L'exécution passe par l'Action OS, qui porte les approbations et les
    // réservations de crédits. Une intervention qui « envoie » court-circuiterait
    // les deux.
    const forbidden = /\b(envoie|envoyer|supprime|supprimer|valide d'office|exécute|exécuter|débite|débiter)\b/i
    for (const intervention of LAURA_INTERVENTIONS) {
      expect(intervention.action, `${intervention.key} : ${intervention.action}`).not.toMatch(forbidden)
    }
  })

  it('n’a aucune priorité nulle — une intervention sur laquelle on ne peut rien n’a pas sa place', () => {
    for (const intervention of LAURA_INTERVENTIONS) {
      const priority = messagePriority({
        businessImpact: intervention.impact,
        urgency: intervention.urgency,
        actionability: intervention.actionability,
      })
      expect(priority, intervention.key).toBeGreaterThan(0)
    }
  })

  it('classe l’urgence là où elle est — l’essai qui se termine passe devant le récapitulatif', () => {
    const priorityOf = (key: string) => {
      const intervention = findIntervention(key)!
      return messagePriority({
        businessImpact: intervention.impact,
        urgency: intervention.urgency,
        actionability: intervention.actionability,
      })
    }
    expect(priorityOf('trial_ending')).toBeGreaterThan(priorityOf('week_one_recap'))
    expect(priorityOf('connector_error_48h')).toBeGreaterThan(priorityOf('copilot_never_used'))
  })

  it('écrit une CONDITION lisible, pas une clé — un catalogue qui ne se relit pas ne se conteste pas', () => {
    for (const intervention of LAURA_INTERVENTIONS) {
      expect(intervention.condition.trim().length, intervention.key).toBeGreaterThan(20)
      expect(intervention.condition, intervention.key).toMatch(/\s/)
    }
  })

  it('ne réécrit pas un seuil qui vit déjà ailleurs', () => {
    // L'entrée annonçait « moins de 45 jours » là où le balayeur d'interventions
    // applique `INTERVENTION_THRESHOLDS.renewalHorizonDays`, soit 30. Deux
    // horizons pour le même fait, c'est deux vérités sur le même écran (GA-26) —
    // et c'est le second qui décide, puisque c'est lui qui pose l'alerte.
    expect(findIntervention('mission_ending_no_plan')?.condition).not.toMatch(/\d/)
  })

  it('décrit une condition que son GESTE peut suivre', () => {
    // « Aucune connexion depuis sept jours » décrivait un balayage qui n'existe
    // pas : Laura ne parle que sur un écran ouvert, donc à quelqu'un qui vient
    // de revenir. Le geste — ouvrir le brief de reprise — le disait déjà ;
    // la condition, non.
    const returning = findIntervention('no_connection_7_days')
    expect(returning?.condition).toMatch(/Retour/)
    expect(returning?.route).toBe('/briefing')
  })

  it('ne promet pas une correspondance qu’il faudrait calculer pour le dire', () => {
    // « Des besoins COMPATIBLES existent » supposait un tour de matching par
    // écran ouvert — et surtout laissait la porte à un clic qui ne mène à rien
    // quand rien ne correspond. Le catalogue promet ce que la détection sait
    // affirmer : il se libère, et il reste des besoins à confronter.
    expect(findIntervention('consultant_free_soon')?.condition).not.toMatch(/compatible/i)
  })

  it('rend `null` sur une clé inconnue plutôt que de lever', () => {
    // Une clé inconnue vient d'une trace ancienne, pas d'un bug à faire
    // remonter : lever ferait tomber l'écran qui relit un historique.
    expect(findIntervention('inexistante')).toBeNull()
    expect(findIntervention('trial_ending')?.family).toBe('churn_risk')
  })
})

describe('chaque intervention sait où elle se pose', () => {
  it('nomme un écran — c’est ce que compare la règle « une par écran » du §5.3', () => {
    for (const intervention of LAURA_INTERVENTIONS) {
      expect(intervention.screen, intervention.key).toMatch(/^\//)
    }
  })

  it('ne mène qu’à des chemins d’application, jamais ailleurs', () => {
    for (const intervention of LAURA_INTERVENTIONS) {
      if (intervention.route === null) continue
      expect(intervention.route, intervention.key).toMatch(/^\/[a-z0-9/-]*$/)
      expect(intervention.route, intervention.key).not.toContain('http')
    }
  })

  it('laisse `route` à null quand elle informe sans mener nulle part', () => {
    // Un bouton qui ne fait rien est pire que pas de bouton : `null` est la
    // façon de le dire, et l'écran n'en rend aucun.
    expect(findIntervention('first_action_validated')?.route).toBeNull()
    expect(findIntervention('high_correction_rate')?.route).toBeNull()
  })

  it('#2409.8 / #2409.9 — le démarrage d’une mission RÉUTILISE ce catalogue, sur le tableau des missions', () => {
    // Tranché sans Louis (décision §12) : pas de second mécanisme d'annonce —
    // les deux annonces du démarrage sont des lignes de CE catalogue (GA-26).
    const notReady = findIntervention('mission_start_not_ready')
    const dayOne = findIntervention('mission_day_one_unconfirmed')
    expect(notReady?.screen).toBe('/missions')
    expect(dayOne?.screen).toBe('/missions')
    // Laura PRÉPARE, elle n'envoie jamais : aucune relance automatique du consultant.
    for (const intervention of [notReady, dayOne]) {
      expect(intervention?.action ?? '').not.toMatch(/envoy|relanc|notifi/i)
    }
    // L'arrivée du jour 1 est plus urgente que la préparation : elle passe devant.
    expect(dayOne?.urgency ?? 0).toBeGreaterThan(notReady?.urgency ?? 10)
  })
})

describe('le compteur d’acceptation par surface (D643-D648)', () => {
  it('une acceptation et un rejet — les deux gestes explicites, mappés sur l’issue binaire', () => {
    // `acted` est le SEUL geste qui vaut acceptation — c'est déjà le cas dans
    // `LauraService.yesterdayFrom`, qui ne compte que les gestes `acted` comme
    // « acceptés ». `refused` (« pas maintenant ») et `closed_unread` (fermé
    // sans lire) sont deux gestes RÉELS, mais tous deux disent « pas ça » du
    // point de vue de ce compteur.
    expect(surfaceAcceptanceOutcome('acted')).toBe('accepted')
    expect(surfaceAcceptanceOutcome('refused')).toBe('dismissed')
    expect(surfaceAcceptanceOutcome('closed_unread')).toBe('dismissed')
    // #2403.33 — `refused_stale_data` dit « pas ça » comme `refused` ordinaire :
    // le taux ne doit pas l'oublier au dénominateur.
    expect(surfaceAcceptanceOutcome('refused_stale_data')).toBe('dismissed')
  })

  it('n’enregistre AUCUNE issue tant qu’aucun geste n’a eu lieu (D644)', () => {
    // `null` — la personne n'a encore rien fait, l'intervention peut dater de
    // ce matin. `ignored` n'est écrit NULLE PART en base (voir
    // `LauraService.streak`, qui l'INFÈRE à la lecture après 24h) : si la
    // colonne le portait un jour quand même, elle ne doit pas se lire comme un
    // rejet — ce n'est pas un geste, c'est une absence de geste. Compter un
    // silence comme un rejet ferait retirer une surface que personne n'a
    // encore eu le temps de refuser.
    expect(surfaceAcceptanceOutcome(null)).toBeNull()
    expect(surfaceAcceptanceOutcome('ignored')).toBeNull()
  })

  it('calcule un taux sur une surface qui a assez d’échantillon', () => {
    const outcomes = [...Array(3).fill('accepted' as const), ...Array(17).fill('dismissed' as const)]
    const measure = computeSurfaceAcceptance(outcomes, 20)
    expect(measure).toEqual({ state: 'measured', acceptedPercent: 15, sample: 20 })
  })

  it('« non mesuré » — une surface qui n’a jamais proposé n’a pas un taux de 0 %', () => {
    const measure = computeSurfaceAcceptance([], 20)
    expect(measure).toEqual({ state: 'unmeasured', reason: 'no_observation', sample: 0 })
    // Et surtout : PAS de valeur numérique portée nulle part sur ce cas — le
    // type lui-même l'interdit (`unmeasured` ne porte pas `acceptedPercent`).
    expect('acceptedPercent' in measure).toBe(false)
  })

  it('« échantillon insuffisant » nommé comme tel, distinct de « non mesuré »', () => {
    // Le dépôt a déjà un motif d'échantillon minimum — `OBSERVABILITY_ALERT_MIN_SAMPLE`
    // (`observability-alerts.ts`, défaut 20) — réutilisé ici plutôt que réinventé.
    const measure = computeSurfaceAcceptance(['accepted', 'dismissed'], 20)
    expect(measure).toEqual({ state: 'unmeasured', reason: 'sample_too_small', sample: 2 })
  })

  it('le seuil de 15 % est ÉCRIT, jamais LU pour filtrer quoi que ce soit ici (D648)', () => {
    // Ce lot MESURE, il ne DÉCIDE pas : retirer une surface du catalogue est
    // une décision produit que seul Louis peut prendre, et seulement une fois
    // le chiffre visible. La constante existe pour que la décision future ait
    // un nombre à comparer — rien dans ce fichier ne s'en sert pour masquer,
    // filtrer ou désactiver une intervention.
    expect(SUGGESTED_SURFACE_ACCEPTANCE_FLOOR_PERCENT).toBe(15)
  })
})

describe('#2875 — les rappels d’hygiène, hors budget d’interruption', () => {
  it('sont NOMMÉS au catalogue, et seulement eux : débrief d’appel et retour d’expérience manquants', () => {
    const hygiene = LAURA_INTERVENTIONS.filter(intervention => intervention.hygiene).map(
      intervention => intervention.key,
    )
    expect(hygiene.sort()).toEqual(['calls_without_debrief', 'mission_ended_without_feedback'])
  })

  it('isHygieneReminder lit le catalogue — sait dire NON sur une clé ordinaire ou inconnue', () => {
    expect(isHygieneReminder('calls_without_debrief')).toBe(true)
    expect(isHygieneReminder('accounts_without_next_action')).toBe(false)
    expect(isHygieneReminder('inexistante')).toBe(false)
    expect(isHygieneReminder(null)).toBe(false)
  })
})
