import { describe, expect, it } from 'vitest'
import { detectDivergences, isKnownToTeam, resolveDivergence, shouldOfferExport } from './crm-inbound.js'

const SNAPSHOT = {
  recordId: '123',
  provider: 'hubspot',
  email: 'ludovic@sg.fr',
  phone: null,
  ownerName: 'Marie',
  lastActivityAt: '2026-07-30',
}

describe('la lecture entrante du CRM (§58, P1-07)', () => {
  it('un contact ajouté à la main par un collègue est « déjà connu »', () => {
    // Le vrai trou : « déjà connu » ne connaissait que les contacts que NOUS
    // avions poussés. Bellum proposait donc d'aller contacter quelqu'un que
    // l'équipe travaille déjà — la faute qui coûte le plus cher, parce que le
    // client, lui, la voit.
    expect(isKnownToTeam({ crmSnapshot: SNAPSHOT })).toBe(true)
    expect(isKnownToTeam({ exportedAt: null, emailSentAt: null })).toBe(false)
  })

  it('notre propre trace reste valable pour un CRM qu’on ne sait pas lire', () => {
    expect(isKnownToTeam({ exportedAt: '2026-07-01' })).toBe(true)
    expect(isKnownToTeam({ emailSentAt: '2026-07-01' })).toBe(true)
  })

  it('on ne repropose pas d’exporter une fiche qui existe', () => {
    // Reproposer l'export d'une fiche existante est exactement ce qui crée les
    // doublons. Le geste devient « mettre à jour », et c'est un autre choix.
    expect(shouldOfferExport(SNAPSHOT)).toBe(false)
    expect(shouldOfferExport(null)).toBe(true)
  })
})

describe('les écarts se SIGNALENT, ils ne se réconcilient pas', () => {
  it('deux valeurs différentes sur le même champ font une divergence', () => {
    const out = detectDivergences({ email: 'l.vandevoorde@sg.fr' }, SNAPSHOT)
    expect(out).toEqual([{ field: 'email', bellum: 'l.vandevoorde@sg.fr', crm: 'ludovic@sg.fr' }])
  })

  it('une valeur ABSENTE d’un côté n’est pas un écart', () => {
    // C'est un complément. La traiter comme une divergence noierait les vrais
    // désaccords sous des dizaines de « le CRM n'a pas le téléphone », et
    // personne ne lirait plus la liste.
    expect(detectDivergences({ phone: '0600000000' }, SNAPSHOT)).toEqual([])
    expect(detectDivergences({}, SNAPSHOT)).toEqual([])
  })

  it('la casse et les espaces ne créent pas de faux écarts', () => {
    expect(detectDivergences({ email: '  Ludovic@SG.fr ' }, SNAPSHOT)).toEqual([])
  })

  it('sans fiche CRM, il n’y a rien à comparer', () => {
    expect(detectDivergences({ email: 'x@y.fr' }, null)).toEqual([])
  })

  it('rien n’est écrasé — la fonction ne rend que des CONSTATS', () => {
    // Décider qui a raison demande de savoir si l'écart est une correction du
    // CRM ou une information périmée. Personne ne peut le décider à la place de
    // l'utilisateur, et une réconciliation automatique fabrique des doublons ou
    // efface une donnée juste.
    const bellum = { email: 'a@x.fr' }
    detectDivergences(bellum, SNAPSHOT)
    expect(bellum.email).toBe('a@x.fr')
  })
})

describe('la règle de résolution : Bellum fait foi, on peut adopter le CRM (arbitrage 03/08)', () => {
  const ECART = { field: 'email' as const, bellum: 'l.vandevoorde@sg.fr', crm: 'ludovic@sg.fr' }

  it('par défaut, la valeur Bellum gagne', () => {
    // Le défaut n'est pas arbitraire : la valeur Bellum vient d'un
    // enrichissement daté, là où une fiche CRM peut dormir depuis deux ans sans
    // que rien ne le dise. L'inverse remplacerait du frais par du périmé, en
    // silence.
    expect(resolveDivergence(ECART)).toEqual({
      value: 'l.vandevoorde@sg.fr',
      source: 'bellum',
      overridden: false,
    })
    expect(resolveDivergence(ECART, null).source).toBe('bellum')
  })

  it('un choix explicite adopte la valeur du CRM', () => {
    expect(resolveDivergence(ECART, 'crm')).toEqual({
      value: 'ludovic@sg.fr',
      source: 'crm',
      overridden: true,
    })
  })

  it('choisir « bellum » explicitement n’est pas un remplacement', () => {
    // `overridden` sert à afficher « vous avez tranché » : le dire d'un choix
    // qui coïncide avec le défaut brouillerait la lecture.
    expect(resolveDivergence(ECART, 'bellum').overridden).toBe(false)
  })
})
