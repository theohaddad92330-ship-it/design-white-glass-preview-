import type { DiscoverResponse, RegistryAnnouncement } from '@bellum/contracts'
import { withRegistrySignals } from './discover-registry-signals'

const NOW = new Date('2026-10-09T08:00:00Z')

function announcement(over: Partial<RegistryAnnouncement> = {}): RegistryAnnouncement {
  return {
    source: 'bodacc',
    kind: 'sale',
    type: 'Ventes et cessions',
    date: '2026-09-20',
    url: 'https://www.bodacc.fr/pages/annonce-visualisation/?q.id=id:A2',
    tribunal: null,
    ...over,
  }
}

function response(signals: DiscoverResponse['candidates'][number]['signals'] = []): DiscoverResponse {
  return { candidates: [{ siren: '403355726', signals }] } as unknown as DiscoverResponse
}

describe('#3916.b — Découvrir « pourquoi maintenant » lit les annonces de registre', () => {
  it('ajoute chaque annonce récente comme signal `legal` daté, avec son lien', () => {
    const out = withRegistrySignals(response(), new Map([['403355726', [announcement()]]]), NOW)
    expect(out.candidates[0]?.signals).toEqual([
      {
        type: 'legal',
        label: 'Ventes et cessions',
        date: '2026-09-20',
        url: 'https://www.bodacc.fr/pages/annonce-visualisation/?q.id=id:A2',
        detail: 'BODACC',
      },
    ])
  })

  it('#3921.11 — un événement du registre national se dit par sa nature, jamais par le nom d’un fournisseur', () => {
    const out = withRegistrySignals(
      response(),
      new Map([
        ['403355726', [announcement({ source: 'rne', kind: 'executive_change', type: 'Changement de dirigeant' })]],
      ]),
      NOW,
    )
    expect(out.candidates[0]?.signals[0]).toMatchObject({
      label: 'Changement de dirigeant',
      detail: 'Registre national des entreprises',
    })
  })

  it('une procédure collective sort comme RISQUE, jamais comme une opportunité', () => {
    const out = withRegistrySignals(
      response(),
      new Map([['403355726', [announcement({ kind: 'collective_proceeding', type: 'Procédures collectives' })]]]),
      NOW,
    )
    expect(out.candidates[0]?.signals[0]?.label).toBe('Procédures collectives — risque, pas une opportunité')
  })

  it('une annonce périmée (plus de 24 mois) ne justifie pas d’appeler aujourd’hui', () => {
    const out = withRegistrySignals(response(), new Map([['403355726', [announcement({ date: '2023-01-01' })]]]), NOW)
    expect(out.candidates[0]?.signals).toEqual([])
  })

  it('une annonce déjà portée par le moteur (même lien) n’est pas doublée', () => {
    const existing = {
      type: 'legal' as const,
      label: 'Vente',
      date: '2026-09-20',
      url: announcement().url ?? undefined,
    }
    const out = withRegistrySignals(response([existing]), new Map([['403355726', [announcement()]]]), NOW)
    expect(out.candidates[0]?.signals).toHaveLength(1)
  })

  it('sans annonce connue, la réponse est rendue à l’identique', () => {
    const original = response()
    expect(withRegistrySignals(original, new Map(), NOW)).toBe(original)
  })
})

// #3915.decp — un marché attribué lu en continu nourrit « pourquoi maintenant » comme les autres signaux.
describe('#3915.decp — Découvrir lit les marchés publics attribués du SIREN', () => {
  it('le compte ACHETEUR : signal `award` daté, titulaire nommé, source publique nommée par sa nature', () => {
    const out = withRegistrySignals(
      response(),
      new Map([
        [
          '403355726',
          [
            announcement({
              source: 'decp',
              kind: 'award',
              type: 'TMA du SI achats',
              date: '2026-09-02',
              url: null,
              counterpart: 'Acme SA',
            }),
          ],
        ],
      ]),
      NOW,
    )
    expect(out.candidates[0]?.signals).toEqual([
      {
        type: 'award',
        label: 'TMA du SI achats',
        date: '2026-09-02',
        detail: 'Marchés publics attribués · Titulaire : Acme SA',
      },
    ])
  })

  it('le compte TITULAIRE : l’acheteur est nommé, jamais un titulaire inventé', () => {
    const out = withRegistrySignals(
      response(),
      new Map([
        [
          '403355726',
          [
            announcement({
              source: 'decp',
              kind: 'award_won',
              type: 'Expertise DATA-IA',
              url: null,
              counterpart: null,
            }),
          ],
        ],
      ]),
      NOW,
    )
    expect(out.candidates[0]?.signals[0]).toEqual({
      type: 'award',
      label: 'Expertise DATA-IA',
      date: '2026-09-20',
      detail: 'Marchés publics attribués · Marché remporté',
    })
  })
})
