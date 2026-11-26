import { describe, expect, it } from 'vitest'
import {
  PILOTAGE_LEVELS,
  evaluatePilotageChain,
  pilotageCoverage,
  type PilotageInputs,
  PILOTAGE_METRIC_SOURCES,
  type PilotageReport,
} from './pilotage.js'

/**
 * KPI de chaîne p24 — « mesurer la chaîne, pas seulement le volume ». Chaque
 * maillon a un seuil d'alerte ; un maillon qui décroche se voit AVANT le résultat.
 * Un indicateur non capté est `non_mesure`, jamais un zéro trompeur.
 */
const HEALTHY: PilotageInputs = {
  contactsTargeted: 40,
  signals: 12,
  profilesPushed: 3,
  emailsSent: 20,
  replied: 6,
  meetings: 3,
  needsQualified: 4,
  needsTriaged: 10,
  needsDecided: 3,
  benchAvailable: 8,
  conversions: 2,
  marginBand: null,
  activeClients: 5,
  rejectedItems: 1,
  totalContacts: 120,
}

/** Un espace neuf : tout a été LU, et tout vaut zéro. Ce n'est pas la même chose
 *  qu'un espace dont on n'a rien pu lire — voir `UNREAD` juste dessous. */
const EMPTY: PilotageInputs = {
  contactsTargeted: 0,
  signals: 0,
  profilesPushed: null,
  emailsSent: 0,
  replied: 0,
  meetings: 0,
  needsQualified: 0,
  needsTriaged: 0,
  needsDecided: 0,
  benchAvailable: 0,
  conversions: 0,
  marginBand: null,
  activeClients: 0,
  rejectedItems: 0,
  totalContacts: 0,
}

/** Aucune source n'a répondu. Rien n'est connu — et surtout pas « zéro ». */
const UNREAD: PilotageInputs = {
  contactsTargeted: null,
  signals: null,
  profilesPushed: null,
  emailsSent: null,
  replied: null,
  meetings: null,
  needsQualified: null,
  needsTriaged: null,
  needsDecided: null,
  benchAvailable: null,
  conversions: null,
  marginBand: null,
  activeClients: null,
  rejectedItems: null,
  totalContacts: null,
}

/** Retrouve un indicateur par sa clé, quel que soit son maillon. */
function metric(report: ReturnType<typeof evaluatePilotageChain>, key: string) {
  return report.levels.flatMap(l => l.metrics).find(m => m.key === key)
}

describe('evaluatePilotageChain', () => {
  it('rend les huit niveaux, dans l’ordre de la page', () => {
    const report = evaluatePilotageChain(HEALTHY)
    expect(report.levels.map(l => l.level)).toEqual([...PILOTAGE_LEVELS])
  })

  it('signale un maillon qui décroche (taux de réponse sous le seuil)', () => {
    const report = evaluatePilotageChain({ ...HEALTHY, emailsSent: 40, replied: 1 })
    const conversation = report.levels.find(l => l.level === 'conversation')
    expect(conversation?.status).toBe('alerte')
  })

  it('un maillon vaut son maillon le plus faible', () => {
    // Des contacts ciblés, et pas un message parti : l'amont coule, l'aval non.
    // C'est un décrochage, et c'est exactement ce que la chaîne doit montrer.
    const report = evaluatePilotageChain({ ...HEALTHY, emailsSent: 0, replied: 0 })
    expect(report.levels.find(l => l.level === 'conversation')?.status).toBe('alerte')
  })

  /* ------------------------------------------------------------------ */
  /*  Le défaut du 22/08 : un espace neuf s'ouvrait EN ROUGE             */
  /* ------------------------------------------------------------------ */

  it('un espace neuf n’alerte sur RIEN — huit maillons non mesurés', () => {
    // Le premier écran qu'un client voit. Tout vaut zéro par construction ; s'il
    // s'ouvre en rouge, il apprend le premier jour que le rouge ne veut rien
    // dire — et le jour où un maillon décroche vraiment, personne ne regarde.
    const report = evaluatePilotageChain(EMPTY)
    expect(report.levels.filter(l => l.status === 'alerte')).toEqual([])
    expect(report.levels.every(l => l.status === 'non_mesure')).toBe(true)
  })

  it('un zéro n’alerte que si l’amont a du flux', () => {
    // Zéro message sur zéro contact ciblé : rien n'est passé par là.
    const nothing = evaluatePilotageChain({ ...EMPTY, contactsTargeted: 0, emailsSent: 0 })
    expect(nothing.levels.find(l => l.level === 'conversation')?.status).toBe('non_mesure')
    // Zéro message sur 2 000 contacts ciblés : là, ça décroche.
    const stuck = evaluatePilotageChain({ ...EMPTY, contactsTargeted: 2000, emailsSent: 0 })
    expect(stuck.levels.find(l => l.level === 'conversation')?.status).toBe('alerte')
  })

  it('un vivier vide n’est ni en panne, ni en bonne santé', () => {
    // Un STOCK à zéro n'est pas un décrochage : une ESN qui n'a pas encore saisi
    // ses consultants n'a rien de cassé. Mais il ne se déclare pas vert pour
    // autant — un faux vert est pire qu'un gris, personne ne va vérifier un
    // indicateur qui se dit sain.
    const report = evaluatePilotageChain({ ...HEALTHY, benchAvailable: 0 })
    expect(report.levels.find(l => l.level === 'sourcing')?.status).toBe('non_mesure')
    const bench = report.levels.find(l => l.level === 'sourcing')?.metrics.find(m => m.key === 'benchAvailable')
    // La VALEUR reste affichée : c'est la couleur qui est neutre, pas le chiffre.
    expect(bench?.value).toBe(0)
  })

  it('zéro correction est le MEILLEUR résultat, jamais une alerte', () => {
    const report = evaluatePilotageChain({ ...HEALTHY, rejectedItems: 0 })
    expect(report.levels.find(l => l.level === 'qualite')?.status).toBe('ok')
  })

  it('un taux sans dénominateur vaut null, et pas 0 %', () => {
    // La valeur et le statut se contredisaient : `value: 0` (ce que l'écran
    // affiche) à côté de `status: 'non_mesure'` (ce que l'écran ignorait).
    const report = evaluatePilotageChain({ ...HEALTHY, emailsSent: 0, replied: 0 })
    const replyRate = report.levels.find(l => l.level === 'conversation')?.metrics.find(m => m.key === 'replyRate')
    expect(replyRate?.value).toBeNull()
    expect(replyRate?.status).toBe('non_mesure')
  })

  it('la couverture se compte, pour que l’écran écrive une phrase', () => {
    expect(pilotageCoverage(evaluatePilotageChain(EMPTY))).toEqual({ measured: 0, total: 8 })
    const healthy = pilotageCoverage(evaluatePilotageChain(HEALTHY))
    expect(healthy.total).toBe(8)
    expect(healthy.measured).toBeGreaterThan(0)
  })

  it('l’économie non captée est non_mesure, jamais zéro', () => {
    const report = evaluatePilotageChain(HEALTHY)
    const eco = report.levels.find(l => l.level === 'economie')
    expect(eco?.status).toBe('non_mesure')
    expect(eco?.metrics.every(m => m.value === null && m.status === 'non_mesure')).toBe(true)
  })

  it('un taux sans dénominateur est non_mesure, pas une fausse alerte', () => {
    // Aucun email envoyé ⇒ le taux de réponse n'existe pas encore : non mesuré,
    // pas « 0 % donc alerte » (on ne peut pas décrocher d'un flux jamais lancé).
    const report = evaluatePilotageChain({ ...HEALTHY, emailsSent: 0, replied: 0 })
    const replyRate = report.levels.find(l => l.level === 'conversation')?.metrics.find(m => m.key === 'replyRate')
    expect(replyRate?.status).toBe('non_mesure')
  })

  it('est déterministe : mêmes entrées → même rapport', () => {
    expect(evaluatePilotageChain(HEALTHY)).toEqual(evaluatePilotageChain(HEALTHY))
  })

  it('un signal non capté est non_mesure, jamais un zéro qui se lit « aucun signal »', () => {
    // Le défaut vécu : `signals` était écrit 0 en dur avec le statut « ok ».
    // À l'écran, « Signaux 0 » s'affichait sous « 2044 contacts ciblés » —
    // pendant que la Veille en dénombrait 116 sur les mêmes comptes.
    const report = evaluatePilotageChain({ ...HEALTHY, signals: null, profilesPushed: null })
    const acquisition = report.levels.find(l => l.level === 'acquisition')
    const signals = acquisition?.metrics.find(m => m.key === 'signals')
    const pushed = acquisition?.metrics.find(m => m.key === 'profilesPushed')
    expect(signals?.value).toBeNull()
    expect(signals?.status).toBe('non_mesure')
    expect(pushed?.value).toBeNull()
    expect(pushed?.status).toBe('non_mesure')
  })

  it('un signal capté est rendu tel quel', () => {
    const report = evaluatePilotageChain({ ...HEALTHY, signals: 116 })
    const signals = report.levels.find(l => l.level === 'acquisition')?.metrics.find(m => m.key === 'signals')
    expect(signals?.value).toBe(116)
    expect(signals?.status).toBe('ok')
  })

  /* ------------------------------------------------------------------ */
  /*  Le défaut du 27/08 : « lu, et ça fait zéro » et « pas lu du tout » */
  /*  rendaient exactement le même objet.                               */
  /* ------------------------------------------------------------------ */

  it('une source NON LUE rend null — jamais un zéro qui se lit « aucun »', () => {
    const report = evaluatePilotageChain({ ...HEALTHY, meetings: null, benchAvailable: null, activeClients: null })
    for (const key of ['meetings', 'benchAvailable', 'activeClients']) {
      expect(metric(report, key)?.value, key).toBeNull()
      expect(metric(report, key)?.status, key).toBe('non_mesure')
    }
  })

  it('un zéro MESURÉ reste un zéro — « aucun client actif » est un fait', () => {
    // Le défaut symétrique, et il est déjà arrivé : tout rendre `null` « par
    // prudence » efface une information que l'espace connaît parfaitement.
    const report = evaluatePilotageChain({ ...HEALTHY, meetings: 0, benchAvailable: 0, activeClients: 0 })
    for (const key of ['meetings', 'benchAvailable', 'activeClients']) {
      expect(metric(report, key)?.value, key).toBe(0)
    }
  })

  it('aucun indicateur ne JUGE une valeur qu’il n’a pas', () => {
    // L'invariant qui rendait le rapport contradictoire : `value: 0` avec
    // `status: 'non_mesure'` était acceptable (un zéro sans amont ne se juge
    // pas), mais `value: null` avec un statut qui juge ne l'est jamais.
    for (const inputs of [HEALTHY, EMPTY, UNREAD]) {
      for (const m of evaluatePilotageChain(inputs).levels.flatMap(l => l.metrics)) {
        if (m.value === null) expect(m.status, m.key).toBe('non_mesure')
      }
    }
  })

  it('rien n’est lu ⇒ les huit maillons sont non mesurés, et pas un seul chiffre', () => {
    // C'est ce que promettait le repli du service en cas d'échec de lecture.
    // Il le tenait par accident : ses zéros passaient en `non_mesure` parce
    // qu'un stock à zéro est neutre — et sortaient quand même « 0 » à l'écran.
    const report = evaluatePilotageChain(UNREAD)
    expect(report.levels.every(l => l.status === 'non_mesure')).toBe(true)
    expect(report.levels.flatMap(l => l.metrics).every(m => m.value === null)).toBe(true)
  })

  /* ------------------------------------------------------------------ */
  /*  Un taux sans dénominateur vaut null, jamais 0 %                   */
  /* ------------------------------------------------------------------ */

  it('un dénominateur NUL rend le taux null, pas « 0 % » en alerte', () => {
    const report = evaluatePilotageChain({
      ...HEALTHY,
      needsTriaged: 0,
      needsQualified: 0,
      needsDecided: 0,
      conversions: 0,
    })
    for (const key of ['qualificationRate', 'conversionRate']) {
      expect(metric(report, key)?.value, key).toBeNull()
      expect(metric(report, key)?.status, key).toBe('non_mesure')
    }
  })

  it('un dénominateur NON LU rend le taux null', () => {
    const report = evaluatePilotageChain({ ...HEALTHY, needsTriaged: null, needsDecided: null })
    expect(metric(report, 'qualificationRate')?.value).toBeNull()
    expect(metric(report, 'conversionRate')?.value).toBeNull()
  })

  it('mais un numérateur nul sur un dénominateur RÉEL vaut bien 0 %', () => {
    // L'autre moitié de la règle. « 0 sur 12 besoins pris en charge » est une
    // mesure, et c'est même exactement le décrochage que la chaîne doit crier.
    const report = evaluatePilotageChain({
      ...HEALTHY,
      needsTriaged: 12,
      needsQualified: 0,
      needsDecided: 4,
      conversions: 0,
    })
    expect(metric(report, 'qualificationRate')?.value).toBe(0)
    expect(metric(report, 'qualificationRate')?.status).toBe('alerte')
    expect(metric(report, 'conversionRate')?.value).toBe(0)
    expect(metric(report, 'conversionRate')?.status).toBe('alerte')
  })

  /* ------------------------------------------------------------------ */
  /*  Le défaut du 30/08 : l'ARRONDI fabriquait un zéro que personne     */
  /*  n'avait mesuré. « Taux de correction 0 % » à deux centimètres de   */
  /*  « Éléments corrigés 12 », sur la MÊME carte.                       */
  /* ------------------------------------------------------------------ */

  it('douze corrections ne peuvent pas produire un taux NUL', () => {
    // La dérivation arrondissait au centième (`Math.round(x * 100) / 100`),
    // c'est-à-dire au POINT de pourcentage. Tout taux réel sous 0,5 % en
    // ressortait à `0` — indiscernable d'un zéro mesuré, et affiché « 0 % ».
    const report = evaluatePilotageChain({ ...HEALTHY, rejectedItems: 12, totalContacts: 2500 })
    expect(metric(report, 'rejectedItems')?.value).toBe(12)
    expect(metric(report, 'correctionRate')?.value).toBeGreaterThan(0)
  })

  it('aucun dénominateur ne fait tomber un numérateur positif à zéro', () => {
    for (const totalContacts of [2401, 2500, 10_000, 500_000]) {
      const report = evaluatePilotageChain({ ...HEALTHY, rejectedItems: 12, totalContacts })
      expect(metric(report, 'correctionRate')?.value, `sur ${totalContacts}`).toBeGreaterThan(0)
    }
  })

  it('le seuil d’alerte se juge sur la MESURE, pas sur son arrondi', () => {
    // 96 réponses sur 1 000 = 9,6 %, donc SOUS le seuil de 10 %. L'arrondi au
    // centième le remontait à 0,10 exactement — et le maillon se disait sain.
    const report = evaluatePilotageChain({ ...HEALTHY, emailsSent: 1000, replied: 96 })
    expect(metric(report, 'replyRate')?.status).toBe('alerte')
  })

  /* ------------------------------------------------------------------ */
  /*  « Un score n'est jamais nu » — appliqué au QUOTIENT                */
  /* ------------------------------------------------------------------ */

  it('un taux MESURÉ dit sur combien il est calculé', () => {
    // « Taux de qualification 0 % » à côté de « Besoins qualifiés 0 » ne se
    // distingue d'un 0/0 que si le dénominateur est là. C'est exactement le
    // traitement que le pipeline du CRM applique déjà deux blocs plus bas
    // (« sur 12 affaires tranchées »).
    const report = evaluatePilotageChain({ ...HEALTHY, needsTriaged: 12, needsQualified: 0 })
    const qualification = metric(report, 'qualificationRate')
    expect(qualification?.value).toBe(0)
    expect(qualification?.denominator).toBe(12)
  })

  it('chaque taux mesuré de la chaîne porte son dénominateur, sans exception', () => {
    const report = evaluatePilotageChain(HEALTHY)
    const rates = report.levels.flatMap(l => l.metrics).filter(m => m.unit === 'rate' && m.value !== null)
    expect(rates.length).toBeGreaterThan(0)
    for (const rate of rates) {
      expect(rate.denominator, rate.key).toBeGreaterThan(0)
    }
  })

  it('un taux NON MESURÉ ne porte aucun dénominateur — il n’y en a pas', () => {
    const report = evaluatePilotageChain(UNREAD)
    const rates = report.levels.flatMap(l => l.metrics).filter(m => m.unit === 'rate')
    expect(rates.length).toBeGreaterThan(0)
    for (const rate of rates) {
      expect(rate.value, rate.key).toBeNull()
      expect(rate.denominator, rate.key).toBeUndefined()
    }
  })

  it('le dénominateur est celui du CALCUL, pas celui qui se trouve sur la carte', () => {
    // `conversionRate` se divise par les besoins DÉCIDÉS ; la carte, elle,
    // affiche `conversions`. Recopier le chiffre visible aurait produit un
    // dénominateur faux, et personne ne l'aurait vu.
    const report = evaluatePilotageChain({ ...HEALTHY, needsDecided: 4, conversions: 3, totalContacts: 120 })
    expect(metric(report, 'conversionRate')?.denominator).toBe(4)
    expect(metric(report, 'correctionRate')?.denominator).toBe(120)
  })

  it('le taux de conversion se calcule sur les besoins DÉCIDÉS, jamais sur les ouverts', () => {
    // Le dénominateur historique (`besoins ouverts`) EXCLUAIT le numérateur
    // (`gagnés`) : le taux ne pouvait mathématiquement jamais atteindre 100 %,
    // et une analyse qui détecte quarante projets le faisait chuter toute seule.
    const report = evaluatePilotageChain({ ...HEALTHY, needsDecided: 4, conversions: 3 })
    expect(metric(report, 'conversionRate')?.value).toBe(0.75)
  })
})

describe('#1440 — chaque indicateur sait dire d’où il vient', () => {
  /**
   * LA GARDE : toute clé PRODUITE déclare sa provenance.
   *
   * Un indicateur sans source est un chiffre qu'on ne saura pas défendre — et
   * c'est exactement ce que le retour reproche : « chaque KPI doit ouvrir
   * source, période, dénominateur, dernière mise à jour ». Elle lit les clés
   * réellement rendues, pas une liste recopiée : ajouter une métrique sans sa
   * source fait tomber ce test, et c'est le but.
   */
  const inputs = (over: Partial<PilotageInputs> = {}): PilotageInputs => ({
    contactsTargeted: 10,
    signals: 4,
    profilesPushed: null,
    emailsSent: 8,
    replied: 2,
    meetings: 1,
    needsQualified: 3,
    needsTriaged: 6,
    needsDecided: 4,
    benchAvailable: 5,
    conversions: 2,
    marginBand: 7,
    activeClients: 3,
    rejectedItems: 1,
    totalContacts: 10,
    ...over,
  })

  const keysOf = (report: PilotageReport) => report.levels.flatMap(level => level.metrics.map(m => m.key))

  it('toute clé rendue figure au registre des sources — mesurée comme non mesurée', () => {
    // Les deux formes du rapport : tout lu, et rien lu. La seconde produit les
    // clés `tjm` / `margin` / `dso`, que la première ne fabrique jamais.
    const produced = new Set([
      ...keysOf(evaluatePilotageChain(inputs())),
      ...keysOf(evaluatePilotageChain(inputs({ marginBand: null }))),
    ])
    expect(produced.size).toBeGreaterThan(12)
    const orphelines = [...produced].filter(key => PILOTAGE_METRIC_SOURCES[key] === undefined)
    expect(orphelines).toEqual([])
  })

  it('un indicateur MESURÉ nomme ses tables, un NON MESURÉ n’en nomme aucune', () => {
    const report = evaluatePilotageChain(inputs())
    const metrics = report.levels.flatMap(level => level.metrics)
    const mesure = metrics.find(m => m.key === 'contactsTargeted')
    expect(mesure?.source).toEqual(['contacts'])

    // Dire d'où viendrait un chiffre qu'on n'a pas lu laisserait croire qu'on
    // l'a lu. C'est la même règle que « non mesuré n'est pas zéro ».
    const absent = metrics.find(m => m.key === 'profilesPushed')
    expect(absent?.status).toBe('non_mesure')
    expect(absent?.source).toEqual([])
  })

  it('la fenêtre est l’ÉTAT COURANT, et le contrat le dit', () => {
    // Aucune requête de la chaîne ne porte de fenêtre temporelle. L'écran
    // écrivait pourtant « aucun ce mois-ci » à côté de ces chiffres.
    const metrics = evaluatePilotageChain(inputs()).levels.flatMap(level => level.metrics)
    expect(metrics.length).toBeGreaterThan(8)
    expect([...new Set(metrics.map(m => m.window))]).toEqual(['current_state'])
  })
  // Recette 14/10 : la chaîne écrivait « non mesuré » pour la marge et le DSO que Finance mesure.
  it('lit la marge et le DSO de Finance ; le TJM, que personne ne mesure, reste non mesuré', () => {
    const metrics = evaluatePilotageChain(inputs({ marginPercent: 12.4, dsoDays: 41 })).levels.flatMap(
      level => level.metrics,
    )
    const byKey = (key: string) => metrics.find(m => m.key === key)
    expect(byKey('margin')).toMatchObject({ value: 0.124, unit: 'rate', status: 'ok' })
    expect(byKey('dso')).toMatchObject({ value: 41, status: 'ok' })
    expect(byKey('tjm')).toMatchObject({ value: null, status: 'non_mesure' })
  })

  it('sait dire NON : sans mesure Finance, marge et DSO restent non mesurés — et un DSO de 0 reste 0', () => {
    const none = evaluatePilotageChain(inputs()).levels.flatMap(level => level.metrics)
    expect(none.find(m => m.key === 'margin')).toMatchObject({ value: null, status: 'non_mesure' })
    expect(none.find(m => m.key === 'dso')).toMatchObject({ value: null, status: 'non_mesure' })
    const zero = evaluatePilotageChain(inputs({ dsoDays: 0 })).levels.flatMap(level => level.metrics)
    expect(zero.find(m => m.key === 'dso')).toMatchObject({ value: 0, status: 'ok' })
  })
})
