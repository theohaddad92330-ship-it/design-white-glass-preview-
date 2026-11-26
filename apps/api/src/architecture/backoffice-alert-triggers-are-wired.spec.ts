import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-274 — #1676.1 : le registre `AlertKind` nomme HUIT déclencheurs d'alerte
 * back-office ; cette garde COMPTE combien ont un appelant réel, plutôt que
 * de recopier un chiffre dans une phrase (« un total est un argument »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ÉTAT MESURÉ LE 09/09/2026, ET LA CONTRADICTION QU'IL TRANCHE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un brief affirmait « api_indisponible / job_bloque = câblage manquant ».
 * La mesure contre `origin/main` (f9fe1cc05) montre le contraire : le commit
 * 90897cd95 (« alertes 6/8 », le matin même) a déjà ajouté LES DEUX — pure
 * (`operational-alerts.ts`) ET appelant (`backoffice-alerts.service.ts`,
 * `checkApiUnavailable`/`checkJobBloque`, câblés dans `checkOperationalAlerts`,
 * lui-même sous le `@Cron` de `run()` — passage toutes les 5 minutes. Six des
 * huit noms ont donc un appelant : cette garde le PROUVE en lisant le code,
 * pas en refaisant confiance à un message de commit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS SEAUX, ET POURQUOI ILS S'ADDITIONNENT JUSQU'AU REGISTRE
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. CÂBLÉS ICI : un appel `dispatch.dispatch({ kind: '...', ... })` dans le
 *     passage périodique de `backoffice-alerts.service.ts` — scanné, jamais
 *     recopié.
 *  2. CÂBLÉ AILLEURS : `rapport_hebdomadaire` ne passe PAS par ce dispatcheur
 *     (#1648 a son propre cron, son propre mailer — voir le docblock de
 *     `ops-weekly-report.service.ts`). Compté « couvert » seulement si CE
 *     fichier a un vrai `@Cron` ET un vrai envoi — pas parce qu'on le sait.
 *  3. EN ATTENTE DE DÉCISION PRODUIT : `nouveau_client` et `churn_client`.
 *     Nommés, jamais comptés comme des trous — mais vérifiés SANS appelant
 *     nulle part dans le code de production, pour qu'un câblage silencieux ne
 *     se glisse pas sans mettre à jour cette garde.
 *
 * Les trois seaux doivent COUVRIR EXACTEMENT le registre — ni reste, ni
 * doublon : c'est le test qui rougit le jour où quelqu'un ajoute un neuvième
 * nom sans dire, dans l'un des trois seaux, ce qu'il en est.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS PREUVES EXIGÉES PAR CLAUDE.md
 * ─────────────────────────────────────────────────────────────────────────────
 *  - SAIT DIRE NON : `extractDispatchedKinds` est testé sur un FIXTURE
 *    synthétique dépourvu de l'appel — il ne le trouve pas. Et un appel
 *    planqué dans un COMMENTAIRE ne compte pas (la leçon de GA-16 : un
 *    docblock qui CITE un nom n'est pas un appel).
 *  - LIT quelque chose : les deux fichiers réels sont ouverts, et on vérifie
 *    qu'ils ne sont pas vides et que le motif y est bien trouvé au moins une
 *    fois chacun.
 *  - N'ATTRAPE PAS ce qu'elle ne vise pas : la couverture exacte
 *    (`accounted.size === registered.length`) est reproduite sur un FIXTURE
 *    synthétique portant un NEUVIÈME nom volontairement non câblé, plus bas
 *    (« sait dire NON sur un neuvième nom ») — la preuve que la garde
 *    rougirait si quelqu'un nommait une alerte de plus sans la câbler.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MISE À JOUR DU 10/09/2026 — LA DÉCISION QUI MANQUAIT EST PRISE
 * ─────────────────────────────────────────────────────────────────────────────
 * Louis a tranché le fait CONTRACTUEL (voir `client-lifecycle-alerts.ts`) :
 * `nouveau_client` = premier paiement encaissé ; `churn_client` = annulation
 * d'un abonnement Stripe OU engagement échu non renouvelé. Les deux ont
 * maintenant un appelant réel dans `backoffice-alerts.service.ts`
 * (`checkNouveauClient` / `checkStripeChurn` / `checkManualEngagementChurn`,
 * sous `checkClientLifecycle`) : le TROISIÈME seau (« en attente de décision
 * produit ») est donc VIDE — voir `EN_ATTENTE_DE_DECISION_PRODUIT` plus bas,
 * conservé comme STRUCTURE (une décision future pourrait de nouveau y ranger
 * un nom) mais sans plus aucun membre. Cette garde N'A PAS été affaiblie en
 * silence : elle continue de dire NON à un neuvième nom non câblé (test dédié
 * plus bas), et les deux `it()` qui vérifiaient l'ABSENCE d'appelant ont été
 * remplacés par leur exact inverse — la preuve que le câblage est RÉEL,
 * lue dans le même fichier, avec le même extracteur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MISE À JOUR DU 13/09/2026 — UN NEUVIÈME NOM, CÂBLÉ DANS LE MÊME LOT
 * ─────────────────────────────────────────────────────────────────────────────
 * #1946.22 — décision Louis 13/09 batch 12 : `espace_a_risque`, l'alerte
 * opérateur d'un espace dont le score de santé MESURÉ passe sous le seuil. Il
 * entre au registre ET dans `backoffice-alerts.service.ts`
 * (`checkWorkspacesAtRisk`) dans la même PR — le premier seau le compte, la
 * couverture exacte reste exacte. Le témoin « sait dire NON » garde son
 * `alerte_fictive_non_cablee`, désormais un DIXIÈME nom.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const ALERT_REGISTRY_FILE = join(
  REPO_ROOT,
  'apps',
  'api',
  'src',
  'modules',
  'backoffice-alerts',
  'backoffice-alert-dispatch.ts',
)
const CRON_FILE = join(REPO_ROOT, 'apps', 'api', 'src', 'modules', 'backoffice-alerts', 'backoffice-alerts.service.ts')
/** #2707.1 — `nouveau_prospect_demo` est dispatché par le contrôleur du
 *  formulaire de démo (`POST /demo/lead`), pas par le cron : son appelant réel
 *  se LIT dans ce fichier-là (fusion de la vague 15, 22/09/2026). */
const DEMO_CONTROLLER_FILE = join(REPO_ROOT, 'apps', 'api', 'src', 'modules', 'demo', 'demo.controller.ts')
/** #3698.6 — `enrichissement_indisponible` est dispatché par la composition de
 *  `ContactsModule` (le jeton `ENRICHMENT_OUTAGE_ALERT`), appelé par
 *  `ContactsService` à chaque panne côté service. */
/** 11/10/2026 (W13) — `salle_demo_indisponible` est dispatché par `DemoPoolService` (re-semis en échec,
 *  pool épuisé), après la panne démo de 8 h 30 : son appelant réel se LIT dans ce fichier-là. */
const DEMO_POOL_FILE = join(REPO_ROOT, 'apps', 'api', 'src', 'modules', 'demo', 'demo-pool.service.ts')
/** #4694 — `ip_sortante_changee` est dispatché par la sonde d'IP sortante, hébergée par le balayeur de routines. */
const EGRESS_IP_PROBE_FILE = join(REPO_ROOT, 'apps', 'api', 'src', 'modules', 'routines', 'egress-ip-probe.ts')
const CONTACTS_MODULE_FILE = join(REPO_ROOT, 'apps', 'api', 'src', 'modules', 'contacts', 'contacts.module.ts')
const WEEKLY_REPORT_FILE = join(
  REPO_ROOT,
  'apps',
  'api',
  'src',
  'modules',
  'notifications',
  'ops-weekly-report.service.ts',
)

/** Retire les commentaires — sinon un docblock qui CITE un kind se lit comme
 *  un appel (la leçon de GA-16 : la moitié qu'un extracteur peut rater). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ')
}

/** Les kinds NOMMÉS par le type `AlertKind` — LU dans le fichier, jamais
 *  recopiés : une liste recopiée ici serait une seconde vérité (GA-26). */
function registeredKinds(source: string): string[] {
  const stripped = stripComments(source)
  const block = stripped.match(/export type AlertKind =([\s\S]*?)\n\n/)
  if (!block?.[1]) return []
  return [...block[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1] as string)
}

/** Les kinds qui ont un VRAI appel `dispatch.dispatch({ kind: 'x', ... })`
 *  dans le code (jamais dans un commentaire). Pure : testable sur un
 *  fixture, sans toucher au disque — c'est ce qui permet de prouver que
 *  cette fonction SAIT DIRE NON. */
function extractDispatchedKinds(source: string): Set<string> {
  const stripped = stripComments(source)
  const found = new Set<string>()
  for (const m of stripped.matchAll(/dispatch\.dispatch\(\{\s*kind:\s*'([a-z_]+)'/g)) {
    if (m[1]) found.add(m[1])
  }
  return found
}

/** Même lecture que `extractDispatchedKinds`, pour un contrôleur qui injecte
 *  le dispatcheur sous le nom `alerts` (`this.alerts.dispatch({ kind: 'x' })`). */
function extractAlertsDispatchedKinds(source: string): Set<string> {
  const stripped = stripComments(source)
  const found = new Set<string>()
  for (const m of stripped.matchAll(/alerts\.dispatch\(\{\s*kind:\s*'([a-z_]+)'/g)) {
    if (m[1]) found.add(m[1])
  }
  return found
}

/** `rapport_hebdomadaire` : câblé par #1648, un cron et un mailer qui lui
 *  sont propres — pas par ce dispatcheur. Vérifié en LISANT son appelant
 *  réel plutôt qu'en le tenant pour acquis. */
function weeklyReportHasRealCaller(source: string): boolean {
  const stripped = stripComments(source)
  return /@Cron\(/.test(stripped) && /\.send\(/.test(stripped)
}

/**
 * #1676.1 — VIDE depuis le 10/09/2026 : `nouveau_client` et `churn_client`
 * avaient leur décision produit non tranchée (« à partir de quand un client
 * est-il nouveau ? qu'est-ce qui fait un churn ? ») ; Louis a tranché le fait
 * CONTRACTUEL, les deux sont câblés dans `backoffice-alerts.service.ts` et
 * comptés dans `wiredHere` comme les six autres. La STRUCTURE à trois seaux
 * reste : un futur nom d'alerte pourrait à nouveau attendre une décision.
 */
const EN_ATTENTE_DE_DECISION_PRODUIT: readonly string[] = []

describe('GA-274 — #1676.1 / #1946.22 : le registre des déclencheurs, chacun compté (pas recopié)', () => {
  const registrySource = readFileSync(ALERT_REGISTRY_FILE, 'utf8')
  const cronSource = readFileSync(CRON_FILE, 'utf8')
  const weeklyReportSource = readFileSync(WEEKLY_REPORT_FILE, 'utf8')
  const demoControllerSource = readFileSync(DEMO_CONTROLLER_FILE, 'utf8')
  const wiredInDemo = extractAlertsDispatchedKinds(demoControllerSource)
  const wiredInDemoPool = extractAlertsDispatchedKinds(readFileSync(DEMO_POOL_FILE, 'utf8'))
  const wiredInContacts = extractDispatchedKinds(readFileSync(CONTACTS_MODULE_FILE, 'utf8'))
  const wiredInEgressProbe = extractAlertsDispatchedKinds(readFileSync(EGRESS_IP_PROBE_FILE, 'utf8'))

  const registered = registeredKinds(registrySource)
  const wiredHere = extractDispatchedKinds(cronSource)

  it('lit un corpus réel — les trois fichiers ne sont pas vides et le motif y est bien trouvé', () => {
    expect(registrySource.length).toBeGreaterThan(500)
    expect(cronSource.length).toBeGreaterThan(500)
    expect(weeklyReportSource.length).toBeGreaterThan(500)
    expect(registered.length).toBeGreaterThan(0)
    expect(wiredHere.size).toBeGreaterThan(0)
  })

  it('le registre `AlertKind` nomme exactement les huit déclencheurs de #1676, plus `espace_a_risque` (#1946.22), `provider_credits_exhausted` (#2528.3), `nouveau_prospect_demo` (#2707.1) , `enrichissement_indisponible` (#3698.6) et `salle_demo_indisponible` (W13)', () => {
    expect([...registered].sort()).toEqual(
      [
        'api_indisponible',
        'taux_echec_analyse',
        'job_bloque',
        'cout_quotidien',
        'connexion_anormale',
        'nouveau_client',
        'churn_client',
        'rapport_hebdomadaire',
        'espace_a_risque',
        'provider_credits_exhausted',
        'nouveau_prospect_demo',
        'enrichissement_indisponible',
        'salle_demo_indisponible',
        'source_muette',
        'ip_sortante_changee',
      ].sort(),
    )
  })

  it('#1946.22 — 13/09/2026 : `espace_a_risque` a un appelant réel dans le passage (décision de Louis, batch 12)', () => {
    expect(wiredHere.has('espace_a_risque')).toBe(true)
  })

  it('#2528.3 — 17/09/2026 : `provider_credits_exhausted` a un appelant réel (décision de Louis, sur le lot #2528)', () => {
    expect(wiredHere.has('provider_credits_exhausted')).toBe(true)
  })

  it('SIG-C (11/10) — `source_muette` a un appelant réel : `reportProviderSilent`, appelé par le moteur IA', () => {
    expect(wiredHere.has('source_muette')).toBe(true)
  })

  it('#1676.1 — `api_indisponible` ET `job_bloque` ont désormais un appelant réel', () => {
    expect(wiredHere.has('api_indisponible')).toBe(true)
    expect(wiredHere.has('job_bloque')).toBe(true)
  })

  it('les quatre déclencheurs préexistants restent câblés (non-régression)', () => {
    expect(wiredHere.has('connexion_anormale')).toBe(true)
    expect(wiredHere.has('cout_quotidien')).toBe(true)
    expect(wiredHere.has('taux_echec_analyse')).toBe(true)
  })

  it('#2707.1 — `nouveau_prospect_demo` a un appelant réel : le formulaire de démo, pas le cron', () => {
    expect(wiredHere.has('nouveau_prospect_demo')).toBe(false)
    expect(wiredInDemo.has('nouveau_prospect_demo')).toBe(true)
  })

  it('#3698.6 — `enrichissement_indisponible` a un appelant réel : la composition de ContactsModule', () => {
    expect(wiredHere.has('enrichissement_indisponible')).toBe(false)
    expect(wiredInContacts.has('enrichissement_indisponible')).toBe(true)
  })

  it('W13 — `salle_demo_indisponible` a un appelant réel : DemoPoolService', () => {
    expect(wiredHere.has('salle_demo_indisponible')).toBe(false)
    expect(wiredInDemoPool.has('salle_demo_indisponible')).toBe(true)
  })

  it('#4694 — `ip_sortante_changee` a un appelant réel : la sonde d’IP sortante', () => {
    expect(wiredHere.has('ip_sortante_changee')).toBe(false)
    expect(wiredInEgressProbe.has('ip_sortante_changee')).toBe(true)
  })

  it('`rapport_hebdomadaire` n’est PAS câblé par CE dispatcheur, mais a un appelant réel ailleurs (#1648)', () => {
    expect(wiredHere.has('rapport_hebdomadaire')).toBe(false)
    expect(weeklyReportHasRealCaller(weeklyReportSource)).toBe(true)
  })

  it('#1676.1 — 10/09/2026 : `nouveau_client` ET `churn_client` ont désormais un appelant réel (décision de Louis)', () => {
    expect(wiredHere.has('nouveau_client')).toBe(true)
    expect(wiredHere.has('churn_client')).toBe(true)
  })

  it('couvre EXACTEMENT le registre — câblés ici + câblé ailleurs + en attente = les huit, sans reste ni doublon', () => {
    const wiredElsewhere = weeklyReportHasRealCaller(weeklyReportSource) ? ['rapport_hebdomadaire'] : []
    const accounted = new Set<string>([
      ...wiredHere,
      ...wiredElsewhere,
      ...wiredInDemo,
      ...wiredInDemoPool,
      ...wiredInContacts,
      ...wiredInEgressProbe,
      ...EN_ATTENTE_DE_DECISION_PRODUIT,
    ])
    expect(accounted.size).toBe(registered.length)
    expect([...accounted].sort()).toEqual([...registered].sort())
  })

  describe('extractDispatchedKinds — sait dire NON (fixtures synthétiques, sans toucher au disque)', () => {
    it('trouve un appel réel dans un fixture qui en contient un', () => {
      const fixture = `await this.dispatch.dispatch({ kind: 'api_indisponible', subject: 'database', resolved })`
      expect(extractDispatchedKinds(fixture)).toEqual(new Set(['api_indisponible']))
    })

    it('⚠️ NE trouve RIEN si l’appel a été retiré — la preuve que la garde peut rougir', () => {
      const fixtureSansAppel = `// this.dispatch.dispatch({ kind: 'api_indisponible', subject: 'database', resolved }) — retiré`
      expect(extractDispatchedKinds(fixtureSansAppel).has('api_indisponible')).toBe(false)
    })

    it('un nom cité dans un docblock (jamais un appel) ne compte pas — la leçon de GA-16', () => {
      const fixtureDocblockSeulement = `
        /**
         * Restent réellement absents : nouveau_client, churn_client.
         * Voir aussi job_bloque, cité ici sans être appelé.
         */
        export class X {}
      `
      const found = extractDispatchedKinds(fixtureDocblockSeulement)
      expect(found.has('nouveau_client')).toBe(false)
      expect(found.has('job_bloque')).toBe(false)
    })

    it('deux appels distincts dans le même fichier sont tous les deux vus', () => {
      const fixture = `
        await this.dispatch.dispatch({ kind: 'api_indisponible', subject: 'database', resolved })
        await this.dispatch.dispatch({ kind: 'job_bloque', subject: 'analysis_worker', resolved })
      `
      expect(extractDispatchedKinds(fixture)).toEqual(new Set(['api_indisponible', 'job_bloque']))
    })
  })

  /**
   * #1676.1 — 10/09/2026 : LA PREUVE QUE LA GARDE SAIT ENCORE DIRE NON, sur le
   * cas qui compte vraiment : une NEUVIÈME alerte nommée dans le registre sans
   * être câblée nulle part. `nouveau_client`/`churn_client` ne peuvent plus
   * servir de témoin (ils ONT un appelant, désormais) — ce bloc rejoue la même
   * logique de couverture EXACTE (`registeredKinds` / `extractDispatchedKinds`
   * / `weeklyReportHasRealCaller`) sur un FIXTURE synthétique portant un
   * neuvième nom, `alerte_fictive_non_cablee`, absent des trois seaux. Si ce
   * `describe` passait, GA-274 ne protégerait plus rien : c'est le test qui
   * doit rester rouge tant que le calcul de couverture n'est pas exact.
   */
  describe('#1676.1 — sait dire NON sur un neuvième nom non câblé (fixture synthétique, sans toucher au disque)', () => {
    const registryFixtureAvecNeuvieme = `
      export type AlertKind =
        | 'api_indisponible'
        | 'taux_echec_analyse'
        | 'job_bloque'
        | 'cout_quotidien'
        | 'connexion_anormale'
        | 'nouveau_client'
        | 'churn_client'
        | 'rapport_hebdomadaire'
        | 'alerte_fictive_non_cablee'

    `
    const cronFixtureSansLeNeuvieme = `
      await this.dispatch.dispatch({ kind: 'api_indisponible', subject: 'database', resolved })
      await this.dispatch.dispatch({ kind: 'taux_echec_analyse', subject: 'global', resolved })
      await this.dispatch.dispatch({ kind: 'job_bloque', subject: 'analysis_worker', resolved })
      await this.dispatch.dispatch({ kind: 'cout_quotidien', subject: 'global', resolved })
      await this.dispatch.dispatch({ kind: 'connexion_anormale', subject: 'x', resolved })
      await this.dispatch.dispatch({ kind: 'nouveau_client', subject: 'x', resolved })
      await this.dispatch.dispatch({ kind: 'churn_client', subject: 'x', resolved })
    `
    const weeklyReportFixtureCablee = `@Cron('0 8 * * 1') async run() { await this.mailer.send(report) }`

    it('le fixture contient bien un neuvième nom, absent de l’appelant — sinon le test ne prouverait rien', () => {
      const registered = registeredKinds(registryFixtureAvecNeuvieme)
      expect(registered).toContain('alerte_fictive_non_cablee')
      expect(extractDispatchedKinds(cronFixtureSansLeNeuvieme).has('alerte_fictive_non_cablee')).toBe(false)
    })

    it('⚠️ la couverture exacte ÉCHOUE quand un neuvième nom n’est câblé NULLE PART — la preuve que la garde rougirait', () => {
      const registered = registeredKinds(registryFixtureAvecNeuvieme)
      const wired = extractDispatchedKinds(cronFixtureSansLeNeuvieme)
      const wiredElsewhere = weeklyReportHasRealCaller(weeklyReportFixtureCablee) ? ['rapport_hebdomadaire'] : []
      // Même calcul que le test de production ci-dessus, sur ce fixture :
      // aucun troisième seau ici (la décision produit est prise pour les deux
      // seuls noms qui pouvaient encore y être rangés).
      const accounted = new Set<string>([...wired, ...wiredElsewhere])

      expect(accounted.size).not.toBe(registered.length)
      expect([...accounted].sort()).not.toEqual([...registered].sort())
      expect(accounted.has('alerte_fictive_non_cablee')).toBe(false)
    })

    it('le même calcul est EXACT dès que le neuvième nom obtient, lui aussi, un appelant réel', () => {
      const cronFixtureAvecLeNeuvieme = `${cronFixtureSansLeNeuvieme}
        await this.dispatch.dispatch({ kind: 'alerte_fictive_non_cablee', subject: 'x', resolved })
      `
      const registered = registeredKinds(registryFixtureAvecNeuvieme)
      const wired = extractDispatchedKinds(cronFixtureAvecLeNeuvieme)
      const wiredElsewhere = weeklyReportHasRealCaller(weeklyReportFixtureCablee) ? ['rapport_hebdomadaire'] : []
      const accounted = new Set<string>([...wired, ...wiredElsewhere])

      expect(accounted.size).toBe(registered.length)
      expect([...accounted].sort()).toEqual([...registered].sort())
    })
  })
})
