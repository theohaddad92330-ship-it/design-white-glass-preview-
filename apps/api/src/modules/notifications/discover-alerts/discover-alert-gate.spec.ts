import { createDiscoverAlertGate } from './discover-alert-gate'

const ON = { DISCOVER_ALERT_DISPATCH_ENABLED: 'true' }

describe('l’interrupteur d’opérateur — ÉTEINT tant que personne ne l’a posé', () => {
  it('absent = éteint', () => {
    expect(createDiscoverAlertGate({}).enabled).toBe(false)
  })

  it('« true » et « 1 » l’allument, et rien d’autre', () => {
    expect(createDiscoverAlertGate({ DISCOVER_ALERT_DISPATCH_ENABLED: 'true' }).enabled).toBe(true)
    expect(createDiscoverAlertGate({ DISCOVER_ALERT_DISPATCH_ENABLED: 'TRUE' }).enabled).toBe(true)
    expect(createDiscoverAlertGate({ DISCOVER_ALERT_DISPATCH_ENABLED: ' 1 ' }).enabled).toBe(true)
  })

  it('une valeur approximative n’allume RIEN — « yes », « on », « oui » sont éteints', () => {
    // Une variable qui s'allume sur « n'importe quoi de non vide » s'allume par
    // accident : un `DISCOVER_ALERT_DISPATCH_ENABLED=false` littéral suffirait.
    for (const value of ['false', 'no', 'yes', 'on', 'oui', '0', '', '   ', 'enabled']) {
      expect(createDiscoverAlertGate({ DISCOVER_ALERT_DISPATCH_ENABLED: value }).enabled).toBe(false)
    }
  })
})

describe('la liste bornée — un essai ne part jamais à tout le monde', () => {
  it('HORS production, sans liste, PERSONNE ne reçoit', () => {
    // Le refus par défaut : en recette, une liste absente n'est pas « pas de
    // restriction », c'est « on ne sait pas à qui on a le droit d'écrire ».
    const gate = createDiscoverAlertGate({ ...ON, SENTRY_ENVIRONMENT: 'preview' })
    expect(gate.allows('sarah@exemple.fr')).toBe(false)
    expect(gate.allows('+33612345678')).toBe(false)
  })

  it('HORS production, avec liste, SEULS les inscrits reçoivent', () => {
    const gate = createDiscoverAlertGate({
      ...ON,
      SENTRY_ENVIRONMENT: 'preview',
      DISCOVER_ALERT_RECIPIENT_ALLOWLIST: 'sarah@exemple.fr, +33 6 12 34 56 78',
    })
    expect(gate.allows('sarah@exemple.fr')).toBe(true)
    expect(gate.allows('quelquun.dautre@exemple.fr')).toBe(false)
  })

  it('la comparaison ignore la casse et l’espacement — un espace n’est pas une décision', () => {
    // Témoin du cas légitime voisin : la liste borne les DESTINATAIRES, elle ne
    // doit pas refuser quelqu'un qui y est à cause d'une mise en forme.
    const gate = createDiscoverAlertGate({
      ...ON,
      SENTRY_ENVIRONMENT: 'preview',
      DISCOVER_ALERT_RECIPIENT_ALLOWLIST: ' Sarah@Exemple.FR ,\n+33 6 12 34 56 78 ',
    })
    expect(gate.allows(' sarah@exemple.fr ')).toBe(true)
    expect(gate.allows('+33612345678')).toBe(true)
  })

  it('en PRODUCTION, sans liste, la restriction ne s’applique pas', () => {
    // La liste borne la RECETTE. En production, le seul verrou est
    // l'interrupteur — c'est la décision de l'opérateur, écrite une fois.
    const gate = createDiscoverAlertGate({ ...ON, SENTRY_ENVIRONMENT: 'production' })
    expect(gate.allows('sarah@exemple.fr')).toBe(true)
  })

  it('en PRODUCTION, une liste posée borne quand même', () => {
    const gate = createDiscoverAlertGate({
      ...ON,
      SENTRY_ENVIRONMENT: 'production',
      DISCOVER_ALERT_RECIPIENT_ALLOWLIST: 'sarah@exemple.fr',
    })
    expect(gate.allows('sarah@exemple.fr')).toBe(true)
    expect(gate.allows('tout.le.monde@exemple.fr')).toBe(false)
  })

  it('NODE_ENV sert de repli quand SENTRY_ENVIRONMENT est absente', () => {
    expect(createDiscoverAlertGate({ ...ON, NODE_ENV: 'production' }).allows('a@b.fr')).toBe(true)
    expect(createDiscoverAlertGate({ ...ON, NODE_ENV: 'test' }).allows('a@b.fr')).toBe(false)
  })

  it('un destinataire vide n’est jamais autorisé, liste ou pas', () => {
    const gate = createDiscoverAlertGate({ ...ON, SENTRY_ENVIRONMENT: 'production' })
    expect(gate.allows('')).toBe(false)
    expect(gate.allows('   ')).toBe(false)
  })

  it('une liste faite de virgules vides n’autorise pas tout le monde en recette', () => {
    // Le piège : `' , , '.split(',')` rend trois entrées. Une liste qui se vide
    // en silence redeviendrait « pas de restriction » — donc « tout le monde ».
    const gate = createDiscoverAlertGate({
      ...ON,
      SENTRY_ENVIRONMENT: 'preview',
      DISCOVER_ALERT_RECIPIENT_ALLOWLIST: ' , , ',
    })
    expect(gate.allows('sarah@exemple.fr')).toBe(false)
  })
})
