import {
  API_KILL_SWITCHES,
  IA_KILL_SWITCH_IDS,
  killSwitchById,
  killSwitchReport,
  readKillSwitch,
} from './kill-switches'

/**
 * Le registre des interrupteurs d'arrêt — ce que le test verrouille.
 *
 * Trois propriétés, et une seule raison : un interrupteur qu'on oublie
 * d'éteindre est indistinguable d'un produit qui n'a jamais su faire.
 *
 *  1. Chaque entrée nomme une CAPACITÉ, jamais une variable. Le nom de la
 *     variable existe dans le registre (il faut bien lire quelque chose), mais
 *     il ne SORT jamais — c'est GA-85 qui le garde sur la charge utile.
 *  2. La lecture est EXACTE : trois façons de lire coexistent dans le dépôt
 *     (`=== 'true'`, `.trim().toLowerCase()`, `.toLowerCase()`), chacune
 *     délibérée à son site d'origine. Les recopier ici plutôt que les unifier
 *     est ce qui rend ce registre adoptable sans changer un seul comportement.
 *  3. Un état qu'on ne PEUT pas mesurer vaut `unknown`, jamais « actif ». Le
 *     moteur IA vit dans un autre process : quand il ne répond pas, on ne sait
 *     pas, et « on ne sait pas » n'est pas « tout va bien ».
 */
describe('Registre des interrupteurs d’arrêt', () => {
  const ORIGINAL = { ...process.env }

  afterEach(() => {
    process.env = { ...ORIGINAL }
  })

  it('déclare au moins les quinze interrupteurs de l’API et les huit du moteur IA', () => {
    // Non-vacuité : une garde qui lit un corpus vide est verte pour rien.
    expect(API_KILL_SWITCHES.length).toBeGreaterThanOrEqual(15)
    expect(IA_KILL_SWITCH_IDS.length).toBeGreaterThanOrEqual(8)
  })

  it('donne à chaque interrupteur un identifiant unique et deux libellés', () => {
    const ids = API_KILL_SWITCHES.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const sw of API_KILL_SWITCHES) {
      expect(sw.labelFr.trim()).not.toBe('')
      expect(sw.labelEn.trim()).not.toBe('')
      expect(sw.cutsFr.trim()).not.toBe('')
      expect(sw.cutsEn.trim()).not.toBe('')
    }
  })

  it('n’écrit jamais le nom de la variable dans un libellé', () => {
    for (const sw of API_KILL_SWITCHES) {
      for (const text of [sw.id, sw.labelFr, sw.labelEn, sw.cutsFr, sw.cutsEn]) {
        expect(text).not.toMatch(/_DISABLED/)
      }
    }
  })

  describe('readKillSwitch — la lecture recopie celle du site d’origine', () => {
    it('exact : seul `true` littéral coupe', () => {
      const sw = killSwitchById('observability.alerts')
      process.env[sw.envVar] = 'true'
      expect(readKillSwitch(sw)).toBe(true)
      // Le docblock d'origine le dit : « `yes` n'éteint rien, parce qu'un
      // garde-fou éteint par une faute de frappe ne se remarque pas ».
      process.env[sw.envVar] = 'yes'
      expect(readKillSwitch(sw)).toBe(false)
      process.env[sw.envVar] = 'TRUE'
      expect(readKillSwitch(sw)).toBe(false)
      process.env[sw.envVar] = ' true '
      expect(readKillSwitch(sw)).toBe(false)
      delete process.env[sw.envVar]
      expect(readKillSwitch(sw)).toBe(false)
    })

    it('trim-lower : les espaces et la casse sont tolérés', () => {
      const sw = killSwitchById('crm.sync')
      process.env[sw.envVar] = '  TRUE '
      expect(readKillSwitch(sw)).toBe(true)
      process.env[sw.envVar] = 'yes'
      expect(readKillSwitch(sw)).toBe(false)
    })

    it('lower : la casse est tolérée, pas les espaces', () => {
      const sw = killSwitchById('privacy.retention_sweep')
      process.env[sw.envVar] = 'TRUE'
      expect(readKillSwitch(sw)).toBe(true)
      process.env[sw.envVar] = ' true '
      expect(readKillSwitch(sw)).toBe(false)
    })
  })

  describe('killSwitchReport', () => {
    it('rend `active` par défaut et `cut` quand la variable est posée', () => {
      delete process.env['CRM_SYNC_DISABLED']
      const before = killSwitchReport({ ia: null }).switches.find(s => s.id === 'crm.sync')
      expect(before?.state).toBe('active')

      process.env['CRM_SYNC_DISABLED'] = 'true'
      const after = killSwitchReport({ ia: null }).switches.find(s => s.id === 'crm.sync')
      expect(after?.state).toBe('cut')
    })

    it('rend `unknown` — jamais `active` — pour le moteur IA injoignable', () => {
      const report = killSwitchReport({ ia: null })
      const iaRows = report.switches.filter(s => s.service === 'ia')
      expect(iaRows.length).toBeGreaterThanOrEqual(8)
      // « Non mesuré n'est jamais 0 » : un moteur muet ne prouve pas que ses
      // capacités tournent.
      expect(iaRows.every(s => s.state === 'unknown')).toBe(true)
      expect(report.iaReachable).toBe(false)
    })

    it('joint l’état rendu par le moteur IA sur l’identifiant de capacité', () => {
      const report = killSwitchReport({ ia: { 'analysis.grounding': true } })
      const grounding = report.switches.find(s => s.id === 'analysis.grounding')
      expect(grounding?.state).toBe('cut')
      expect(report.iaReachable).toBe(true)
      // Une capacité IA que le moteur n'a PAS rendue reste inconnue : un
      // moteur plus ancien qui ignore une clé ne la déclare pas saine.
      const judge = report.switches.find(s => s.id === 'analysis.judge')
      expect(judge?.state).toBe('unknown')
    })

    it('compte les capacités coupées, et ne compte pas les inconnues comme actives', () => {
      process.env['CRM_SYNC_DISABLED'] = 'true'
      const report = killSwitchReport({ ia: null })
      expect(report.summary.cut).toBe(1)
      expect(report.summary.unknown).toBe(IA_KILL_SWITCH_IDS.length)
      expect(report.summary.active + report.summary.cut + report.summary.unknown).toBe(report.switches.length)
    })
  })
})
