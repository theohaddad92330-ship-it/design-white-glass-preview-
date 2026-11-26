import { Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { MarketCompanyAliasEntity } from '../database/entities/market-company-alias.entity'
import { MarketCompanyResolutionOverrideEntity } from '../database/entities/market-company-resolution-override.entity'
import { MarketCompanySignalEntity } from '../database/entities/market-company-signal.entity'
import { MarketCompanyStackEntity } from '../database/entities/market-company-stack.entity'
import { MarketEsnClientEntity } from '../database/entities/market-esn-client.entity'
import { MarketExEsnAtClientEntity } from '../database/entities/market-ex-esn-at-client.entity'
import { marketMatchKey } from '../modules/market-memory/market-company-key'
import { MarketMemoryService } from '../modules/market-memory/market-memory.service'

/**
 * GA-273 — #1756 — LA JOINTURE QUI NE RÉSOUT PAS **DIT** QU'ELLE N'A PAS RÉSOLU.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE, ET CE QUE ÇA A COÛTÉ DE NE PAS L'AVOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Le corpus de la mémoire marché est indexé sur SON libellé, le registre INSEE
 * sur la raison sociale, et aucun identifiant stable n'existe des deux côtés.
 * Mesuré en production le 08/09/2026 : « SG SOCIETE GENERALE » ne rencontre
 * jamais « SOCIETE GENERALE » et ses 267 parcours observés. La jointure rend
 * zéro **sans qu'aucune requête n'échoue** — et zéro se lit, à l'écran,
 * « Bellum n'a pas d'observations sur ce compte ».
 *
 * Ce sont DEUX phrases, et une seule est vraie à la fois :
 *   · « je n'ai pas résolu cette entité »  → un défaut de NOTRE rapprochement ;
 *   · « ce compte n'a pas de parcours »    → un fait sur le marché.
 *
 * C'est la règle « non mesuré n'est jamais 0 » appliquée à une jointure. Des
 * trois issues du rapprochement, `unresolved` était la seule à ne laisser
 * AUCUNE trace : `reportAmbiguity` ne journalisait que `ambiguous` et
 * `dropped`. « Combien de comptes ne se résolvent pas, et lesquels ? » n'avait
 * donc pas de réponse — y compris pour qui a écrit le diagnostic.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE GARDE DE COMPORTEMENT, ET PAS UNE LECTURE DE SOURCE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une garde qui grep `market_memory_unresolved` dans un fichier reste verte le
 * jour où la chaîne existe mais n'est plus APPELÉE — « du code juste que
 * personne n'appelle » est le défaut n°1 de ce dépôt, et il a déjà mordu sur ce
 * module même. Celle-ci construit donc le VRAI service, le met devant le cas
 * réel de #1756, et lit ce qui sort.
 */

/** Une ligne de journal capturée : son message, et ce qui l'accompagne. */
type LogCall = { readonly message: unknown; readonly meta: unknown }

/**
 * LE DÉTECTEUR — « ce jeu de lignes AVOUE-t-il une entité non résolue ? »
 *
 * Isolé dans une fonction pure pour une raison précise : c'est LUI qu'on doit
 * pouvoir mettre en défaut. Une garde qui n'a pas montré son rouge n'a rien
 * prouvé, et rejouer le rouge en cassant le vrai service ferait courir le
 * risque qu'on oublie de le remettre.
 *
 * ⚠️ Il s'ancre sur la clé MACHINE (`event`), jamais sur la phrase française :
 * un libellé se reformule sans prévenir, une clé d'événement se cherche dans
 * un journal.
 */
function avoueUneEntiteNonResolue(calls: readonly LogCall[]): boolean {
  return calls.some(call => {
    const meta = call.meta as { event?: unknown; unresolved?: unknown } | undefined
    return meta?.event === 'market_memory_unresolved' && typeof meta.unresolved === 'number' && meta.unresolved > 0
  })
}

/** Les comptes NOMMÉS par une ligne d'aveu — la réponse à « lesquels ? ». */
function comptesNonResolus(calls: readonly LogCall[]): string[] {
  const ligne = calls.find(call => (call.meta as { event?: unknown } | undefined)?.event === 'market_memory_unresolved')
  const companies = (ligne?.meta as { companies?: { ref?: unknown }[] } | undefined)?.companies ?? []
  return companies.map(entry => String(entry.ref))
}

function signalRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    companyKey: 'thales',
    companyName: 'Thales',
    matchKey: 'thales',
    websiteDomain: 'thalesgroup.com',
    pathsTotal: 41,
    roleFamilies: [],
    ...overrides,
  }
}

async function buildService(signals: jest.Mock) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      MarketMemoryService,
      {
        provide: getRepositoryToken(MarketCompanySignalEntity),
        useValue: { find: signals, findOne: jest.fn().mockResolvedValue(null) },
      },
      { provide: getRepositoryToken(MarketEsnClientEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
      { provide: getRepositoryToken(MarketCompanyStackEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
      { provide: getRepositoryToken(MarketExEsnAtClientEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
      // La table d'alias VIDE — l'état de production aujourd'hui.
      { provide: getRepositoryToken(MarketCompanyAliasEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
      // #1617.4 — aucune correction humaine ici : vide, la table laisse le
      // classement byte-identique au chemin d'avant le lot.
      {
        provide: getRepositoryToken(MarketCompanyResolutionOverrideEntity),
        useValue: { find: jest.fn().mockResolvedValue([]) },
      },
    ],
  }).compile()
  return moduleRef.get(MarketMemoryService)
}

/** Capture TOUT ce que le service journalise pendant un geste. */
async function capture(geste: () => Promise<unknown>): Promise<LogCall[]> {
  const calls: LogCall[] = []
  const collect = (message: unknown, meta: unknown) => {
    calls.push({ message, meta })
    return undefined
  }
  const info = jest.spyOn(Logger.prototype, 'log').mockImplementation(collect)
  const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(collect)
  try {
    await geste()
  } finally {
    info.mockRestore()
    warn.mockRestore()
  }
  return calls
}

describe('GA-273 — une entité non résolue est DITE, jamais rendue en silence', () => {
  it('LIT quelque chose — le vrai service, et un rapprochement qui MARCHE', async () => {
    // Contrôle positif : sans lui, un montage cassé rendrait « rien ne se
    // résout jamais », et tous les tests ci-dessous passeraient sans rien lire.
    const service = await buildService(jest.fn().mockResolvedValue([signalRow()]))

    const resolution = await service.resolveDetailed({ ref: 'ok', name: 'Thales', website: 'https://thalesgroup.com' })

    expect(resolution).toMatchObject({ status: 'resolved', companyKey: 'thales' })
  })

  it('le cas de #1756 : zéro candidat des deux côtés, et le service l’AVOUE', async () => {
    const service = await buildService(jest.fn().mockResolvedValue([]))

    const calls = await capture(() =>
      service.resolveDetailed({ ref: 'compte-sg', name: 'SG SOCIETE GENERALE', website: null }),
    )

    expect(avoueUneEntiteNonResolue(calls)).toBe(true)
    // « LESQUELS » : l'aveu NOMME le compte, sinon il ne répond qu'à « combien ».
    expect(comptesNonResolus(calls)).toEqual(['compte-sg'])
  })

  it('la lecture GROUPÉE avoue aussi — un portefeuille entier ne se tait pas', async () => {
    // Le corpus ne connaît que Thales : les deux autres comptes sont muets.
    const service = await buildService(jest.fn().mockResolvedValue([signalRow({ websiteDomain: null })]))

    const calls = await capture(() =>
      service.pathsFor([
        { ref: 'a1', name: 'Thales', website: null },
        { ref: 'a2', name: 'SG SOCIETE GENERALE', website: null },
        { ref: 'a3', name: 'SOCIETE NATIONALE SNCF', website: null },
      ]),
    )

    expect(avoueUneEntiteNonResolue(calls)).toBe(true)
    expect(comptesNonResolus(calls)).toEqual(['a2', 'a3'])
  })

  /**
   * #2283.48 (LAU-FINAL-024, épopée #2983) — recette explicitement citée dans
   * l'épopée : « deux entreprises ambiguës sur vingt ». La garde GA-273
   * ci-dessus prouve déjà l'ambiguïté sur UN compte (Témoin 2 plus bas) ; ce
   * cas prouve le RATIO à l'échelle d'un portefeuille réaliste — dix-huit
   * comptes nets ne doivent produire AUCUNE ligne « à revoir », et les deux
   * ambigus doivent être NOMMÉS, ni plus ni moins.
   */
  it('deux entreprises ambiguës sur vingt — la lecture GROUPÉE ne nomme QUE les deux', async () => {
    const cleanNames = Array.from({ length: 18 }, (_, i) => `Entreprise Propre ${i + 1}`)
    const ambiguousNames = ['Orange', 'Total']

    const cleanRows = cleanNames.map(name =>
      signalRow({ companyKey: name.toLowerCase(), matchKey: marketMatchKey(name), websiteDomain: null }),
    )
    // Chaque nom ambigu a DEUX signaux qui partagent le même matchKey — le
    // même patron que le Témoin 2 plus bas (Orange Telecom / Orange Bank).
    const ambiguousRows = ambiguousNames.flatMap(name => [
      signalRow({ companyKey: `${name.toLowerCase()} telecom`, matchKey: marketMatchKey(name), websiteDomain: null }),
      signalRow({ companyKey: `${name.toLowerCase()} bank`, matchKey: marketMatchKey(name), websiteDomain: null }),
    ])

    const service = await buildService(jest.fn().mockResolvedValue([...cleanRows, ...ambiguousRows]))

    const lookups = [
      ...cleanNames.map((name, i) => ({ ref: `clean-${i + 1}`, name, website: null })),
      ...ambiguousNames.map((name, i) => ({ ref: `ambigu-${i + 1}`, name, website: null })),
    ]

    const calls = await capture(() => service.pathsFor(lookups))
    const avertissements = calls.filter(call => call.message === 'résolution de mémoire marché à revoir')

    expect(avertissements).toHaveLength(2)
    expect(avertissements.map(call => (call.meta as { company: unknown }).company).sort()).toEqual(['Orange', 'Total'])
    // Aucun des dix-huit comptes nets ne se retrouve dans l'aveu « non résolu »
    // NI dans les avertissements « à revoir » — l'ambiguïté ne doit jamais
    // déborder sur les comptes qui n'en ont pas.
    expect(avoueUneEntiteNonResolue(calls)).toBe(false)
  })

  /**
   * LE FOND DE LA RÈGLE : ne pas avoir résolu ne se rend pas « zéro ».
   *
   * Un `marketPaths: 0` dirait « on a mesuré, il n'y a rien », ce qui est faux
   * et ce qu'un commercial peut répéter en rendez-vous.
   */
  it('la couverture d’une entité non résolue est VIDE, jamais « 0 parcours »', async () => {
    const service = await buildService(jest.fn().mockResolvedValue([]))

    const read = await service.coverageFor({ ref: 'compte-sg', name: 'SG SOCIETE GENERALE', website: null })

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.coverage.marketPaths).toBeNull()
    expect(read.coverage.marketPaths).not.toBe(0)
    expect(read.coverage.covered).toBe(false)
  })

  it('SAIT DIRE NON — le journal d’AVANT ce lot est refusé', () => {
    // Rejoué sur des lignes fabriquées : casser le vrai service pour montrer le
    // rouge ferait courir le risque qu'on oublie de le réparer.
    //
    // Ce que `reportAmbiguity` produisait avant #1756 sur un compte non résolu :
    // RIEN. Et sur un compte ambigu : une ligne « à revoir » — qui ne parle pas
    // du silence, et ne doit surtout pas passer pour un aveu.
    const journalDAvant: LogCall[] = [
      { message: 'résolution de mémoire marché à revoir', meta: { outcome: 'ambiguous', on: 'name', candidates: 2 } },
    ]
    expect(avoueUneEntiteNonResolue(journalDAvant)).toBe(false)
    expect(avoueUneEntiteNonResolue([])).toBe(false)

    // Et un aveu à ZÉRO compte n'est pas un aveu : sans ce garde-fou, une
    // implémentation qui journaliserait la ligne à chaque appel, vide, rendrait
    // la garde verte pour toujours.
    expect(
      avoueUneEntiteNonResolue([{ message: 'x', meta: { event: 'market_memory_unresolved', unresolved: 0 } }]),
    ).toBe(false)

    // Le détecteur reconnaît bien la forme qu'il vise — sinon les deux `false`
    // ci-dessus seraient vrais pour la mauvaise raison (un détecteur qui ne
    // reconnaît rien refuse tout).
    expect(
      avoueUneEntiteNonResolue([
        { message: 'x', meta: { event: 'market_memory_unresolved', unresolved: 1, companies: [{ ref: 'a1' }] } },
      ]),
    ).toBe(true)
  })

  it('N’ATTRAPE PAS ce qu’elle ne vise pas — trois témoins de silence LÉGITIME', async () => {
    // Témoin 1 — un rapprochement NET ne produit aucun aveu : une garde qui
    // exigerait la ligne partout ferait crier le journal en permanence, et
    // « un journal qui parle toujours ne se lit plus ».
    const net = await buildService(jest.fn().mockResolvedValue([signalRow()]))
    const calmes = await capture(() => net.resolveDetailed({ ref: 'a1', name: 'Thales', website: 'thalesgroup.com' }))
    expect(avoueUneEntiteNonResolue(calmes)).toBe(false)

    // Témoin 2 — une AMBIGUÏTÉ n'est pas un silence. Elle a son propre lecteur
    // depuis #1617, et la confondre avec « non résolu » ferait compter deux fois
    // le même compte dans deux seaux qui doivent s'additionner (GA-259).
    const homonymes = await buildService(
      jest.fn(async (query: { where: Record<string, unknown> }) =>
        'websiteDomain' in query.where
          ? []
          : [
              signalRow({ companyKey: 'orange telecom', matchKey: 'orange', websiteDomain: null }),
              signalRow({ companyKey: 'orange bank', matchKey: 'orange', websiteDomain: null }),
            ],
      ),
    )
    const ambigus = await capture(() => homonymes.resolveDetailed({ ref: 'a1', name: 'Orange', website: null }))
    expect(avoueUneEntiteNonResolue(ambigus)).toBe(false)
    // …mais elle n'est pas muette pour autant : elle parle dans SA ligne à elle.
    expect(ambigus.some(call => call.message === 'résolution de mémoire marché à revoir')).toBe(true)

    // Témoin 3 — une PANNE de lecture n'est pas « non résolu » non plus : on
    // n'a rien lu, donc on n'affirme rien sur le marché.
    const erreur = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    const cassé = await buildService(jest.fn().mockRejectedValue(new Error('connexion perdue')))
    const panne = await capture(() => cassé.resolveDetailed({ ref: 'a1', name: 'Thales', website: null }))
    expect(avoueUneEntiteNonResolue(panne)).toBe(false)
    erreur.mockRestore()
  })
})
