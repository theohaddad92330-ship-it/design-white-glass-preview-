import { issueAnalysisPlanToken, verifyAnalysisPlanToken } from './analysis-plan-token'

/**
 * #1489 — LE JETON QUI REND « ON A DEMANDÉ D'ABORD » STRUCTUREL.
 *
 * Le copilote doit poser ses questions avant de lancer une analyse, parce que
 * lancer débite un crédit. On pourrait l'écrire dans le prompt et espérer ; ce
 * dépôt a déjà payé la différence entre une permission retirée et un MOYEN
 * retiré. Le lancement n'accepte donc qu'un jeton que seule l'étape de
 * préparation sait produire.
 */
const SECRET = 'un-secret-de-test-suffisamment-long'
const NOW = Date.UTC(2026, 8, 5, 12, 0, 0)

describe('le jeton de préparation d’analyse', () => {
  let previous: string | undefined

  beforeEach(() => {
    previous = process.env.INTERNAL_API_SECRET
    process.env.INTERNAL_API_SECRET = SECRET
  })

  afterEach(() => {
    if (previous === undefined) delete process.env.INTERNAL_API_SECRET
    else process.env.INTERNAL_API_SECRET = previous
  })

  it('accepte le jeton qu’il vient d’émettre', () => {
    const token = issueAnalysisPlanToken('u-1', 'OGF', NOW)
    expect(verifyAnalysisPlanToken(token, 'u-1', 'OGF', NOW)).toBe(true)
  })

  /**
   * ⚠️ Le nom est normalisé : sans ça, « OGF » et « ogf  » produiraient deux
   * jetons différents et le lancement échouerait sur une casse que personne ne
   * verrait.
   */
  it('ignore la casse et les espaces du nom d’entreprise', () => {
    const token = issueAnalysisPlanToken('u-1', 'OGF', NOW)
    expect(verifyAnalysisPlanToken(token, 'u-1', '  ogf  ', NOW)).toBe(true)
  })

  it('refuse le jeton d’un AUTRE utilisateur', () => {
    const token = issueAnalysisPlanToken('u-1', 'OGF', NOW)
    expect(verifyAnalysisPlanToken(token, 'u-2', 'OGF', NOW)).toBe(false)
  })

  /**
   * La garantie qui compte : un jeton obtenu en préparant l'analyse d'un compte
   * ne lance pas celle d'un autre. Sans ça, « prépare l'analyse d'Acme » puis
   * « lance celle de Total » débiterait un crédit sans qu'aucune question n'ait
   * été posée sur Total.
   */
  it('refuse le jeton d’une AUTRE entreprise', () => {
    const token = issueAnalysisPlanToken('u-1', 'OGF', NOW)
    expect(verifyAnalysisPlanToken(token, 'u-1', 'Total', NOW)).toBe(false)
  })

  it('expire après trente minutes', () => {
    const token = issueAnalysisPlanToken('u-1', 'OGF', NOW)
    expect(verifyAnalysisPlanToken(token, 'u-1', 'OGF', NOW + 29 * 60 * 1000)).toBe(true)
    expect(verifyAnalysisPlanToken(token, 'u-1', 'OGF', NOW + 31 * 60 * 1000)).toBe(false)
  })

  /** Un jeton daté du futur est un jeton fabriqué. */
  it('refuse un jeton daté du futur', () => {
    const token = issueAnalysisPlanToken('u-1', 'OGF', NOW + 60_000)
    expect(verifyAnalysisPlanToken(token, 'u-1', 'OGF', NOW)).toBe(false)
  })

  it('refuse ce qui n’est pas un jeton', () => {
    for (const junk of ['', 'go', '.', `${NOW}.`, `.${NOW}`, 'abc.def']) {
      // jest n'accepte pas de message sur `expect` (contrairement à vitest) :
      // le cas fautif se lit dans la valeur comparée, pas dans un second argument.
      expect({ junk, ok: verifyAnalysisPlanToken(junk, 'u-1', 'OGF', NOW) }).toEqual({ junk, ok: false })
    }
  })

  /**
   * ⚠️ Sans secret, on ne peut RIEN vérifier — donc on refuse tout. Accepter
   * ouvrirait le lancement à n'importe quelle chaîne le jour où la variable
   * manque, ce qui est exactement le contraire de ce que ce jeton protège.
   */
  it('refuse tout quand le secret interne n’est pas configuré', () => {
    const token = issueAnalysisPlanToken('u-1', 'OGF', NOW)
    delete process.env.INTERNAL_API_SECRET
    expect(verifyAnalysisPlanToken(token, 'u-1', 'OGF', NOW)).toBe(false)
  })

  it('refuse une signature d’une autre longueur sans jeter', () => {
    const token = issueAnalysisPlanToken('u-1', 'OGF', NOW)
    const [issued] = token.split('.')
    expect(verifyAnalysisPlanToken(`${issued}.court`, 'u-1', 'OGF', NOW)).toBe(false)
  })
})
