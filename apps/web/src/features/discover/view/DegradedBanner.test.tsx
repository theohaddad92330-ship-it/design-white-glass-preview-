import { fireEvent, render as rtlRender, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { DegradedBanner } from './DegradedBanner'
import { CapabilityNotice } from './CapabilityNotice'
import { splitDegraded } from '@/features/discover/lib/discover-coverage'
import { unnamedCapabilities } from '@/features/discover/lib/discover-capability'
import type { DiscoverDegradedSource } from '@/features/discover/lib/discover-types'

/**
 * LE test du lot : une limite de capacité et une panne ne doivent PAS se rendre
 * pareil.
 *
 * Vécu : 24 entreprises à l'écran, et au-dessus un bandeau ambre « ⚠ Résultats
 * partiels — Une ou plusieurs sources n'ont pas répondu … la liste est
 * incomplète », suivi de la source et de `unsupported_filters`. La source avait
 * répondu ; elle n'avait juste pas su exprimer la section NAF, donc elle avait
 * rendu PLUS que demandé. Un avertissement qui crie au loup finit par ne plus
 * être lu — et c'est le bandeau qui doit porter les vraies pannes.
 *
 * L'autre moitié du test : ne pas supprimer le bandeau. Une source hors quota
 * ou injoignable doit rester bruyante, sinon on recrée le bug #631 (un fait
 * d'infra rendu comme un fait de marché).
 *
 * #1912 — la source est nommée par sa CAPACITÉ, jamais par l'identifiant de
 * NOTRE fournisseur (`pappers`, `claude`…) : `dataSourceLabel`.
 */

/** #4279 — le détail est replié par défaut (absent du DOM) : les tests de LIBELLÉS le déplient. */
const render = (ui: ReactElement) => {
  const result = rtlRender(ui)
  const toggle = screen.queryByRole('button', { name: 'Détail' })
  if (toggle) fireEvent.click(toggle)
  return result
}

const render_ = (degraded: DiscoverDegradedSource[]) => {
  const { faults, capabilities } = splitDegraded(degraded)
  return render(
    <>
      <DegradedBanner degraded={faults} />
      <CapabilityNotice capabilities={unnamedCapabilities(capabilities)} shown={1} />
    </>,
  )
}

describe('DegradedBanner — panne vs limite de capacité', () => {
  it('une panne réelle reste un avertissement, nommé et visible — par sa capacité', () => {
    render_([{ source: 'pappers', reason: 'quota_exceeded' }])

    expect(screen.getByText(/résultats partiels/i)).toBeInTheDocument()
    expect(screen.getAllByText(/la source de données d’entreprises/i)[0]).toBeInTheDocument()
    expect(screen.queryByText(/pappers/i)).not.toBeInTheDocument()
  })

  it('une limite de capacité ne déclenche AUCUN avertissement', () => {
    render_([{ source: 'pappers', reason: 'unsupported_filters', kind: 'capability', fields: ['sector'] }])

    // La régression exacte de la capture d'écran.
    expect(screen.queryByText(/résultats partiels/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/n’ont pas pu répondre|n'ont pas pu répondre/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/incomplète/i)).not.toBeInTheDocument()
  })

  it('mélange les deux sans contaminer l’une par l’autre', () => {
    render_([
      { source: 'pappers', reason: 'unsupported_filters', kind: 'capability', fields: ['sector'] },
      { source: 'recherche-entreprises', reason: 'network_error' },
    ])

    // La panne est dite…
    expect(screen.getByText(/résultats partiels/i)).toBeInTheDocument()
    expect(screen.getAllByText(/le registre public des entreprises/i)[0]).toBeInTheDocument()
    // …et le bandeau ne cite pas la source qui, elle, a répondu.
    expect(screen.queryByText(/source de données d’entreprises/i)).not.toBeInTheDocument()
  })

  it('un `no_match` — une source qui a répondu « rien ne correspond » — n’alerte pas', () => {
    render_([{ source: 'pappers', reason: 'no_match', kind: 'no-match' }])

    expect(screen.queryByText(/résultats partiels/i)).not.toBeInTheDocument()
  })

  it('une raison inconnue alerte quand même — sous-alerter coûte plus cher', () => {
    render_([{ source: 'brave', reason: 'quelque chose d’inédit' }])

    expect(screen.getByText(/résultats partiels/i)).toBeInTheDocument()
    expect(screen.getAllByText(/la recherche web/i)[0]).toBeInTheDocument()
  })

  it('le modèle qui rédige les angles ne se nomme pas — `claude` devient « le modèle d’analyse »', () => {
    // #2496 — `splitDegraded` ne range plus le modèle dans les pannes (il ne
    // produit jamais la liste : `SearchReadingNotice` le dit en clair). Les
    // lignes, elles, gardent la promesse de ne jamais nommer le fournisseur.
    render(<DegradedBanner degraded={[{ source: 'claude', reason: 'overloaded' }]} />)

    expect(screen.getAllByText(/le modèle d’analyse/i)[0]).toBeInTheDocument()
    expect(screen.queryByText(/claude/i)).not.toBeInTheDocument()
  })

  it('une source inconnue rend un libellé générique, jamais son identifiant', () => {
    render_([{ source: 'une-source-de-demain', reason: 'quota_exceeded' }])

    expect(screen.getAllByText(/une source de données/i)[0]).toBeInTheDocument()
    expect(screen.queryByText(/une-source-de-demain/i)).not.toBeInTheDocument()
  })
})

describe('CapabilityNotice — la source qui a répondu plus large se nomme par sa capacité', () => {
  it('une limite sans champ d’écran nomme la capacité, pas le fournisseur', () => {
    render_([{ source: 'pappers', reason: 'unsupported_filters', kind: 'capability', fields: ['revenue_min'] }])

    expect(screen.getByText(/plus larges que demandé/i)).toBeInTheDocument()
    expect(screen.getByText(/la source de données d’entreprises ne sait pas exprimer/i)).toBeInTheDocument()
    expect(screen.queryByText(/pappers/i)).not.toBeInTheDocument()
  })

  it('deux sources distinctes s’accordent au pluriel', () => {
    render_([
      { source: 'pappers', reason: 'unsupported_filters', kind: 'capability' },
      { source: 'recherche-entreprises', reason: 'unsupported_filters', kind: 'capability' },
    ])

    expect(
      screen.getByText(
        /la source de données d’entreprises et le registre public des entreprises ne savent pas exprimer/i,
      ),
    ).toBeInTheDocument()
  })
})

/**
 * « Une ou plusieurs sources n'ont pas répondu » était écrit pour UNE cause. Un
 * quota épuisé, une clé absente ou un 500 atterrissaient sur la même phrase et
 * étaient tout aussi mal décrits. Chaque raison porte désormais la sienne.
 */
describe('DegradedBanner — chaque raison dit ce qui s’est réellement passé', () => {
  const sentences = new Map<string, RegExp>([
    ['missing_api_key', /clé d’accès|clé d'accès/i],
    ['unauthorized', /refusé/i],
    ['quota_exceeded', /quota/i],
    ['rate_limited', /trop de requêtes/i],
    ['upstream_error', /erreur/i],
    ['network_error', /injoignable/i],
    ['invalid_response', /illisible/i],
    ['empty_query', /aucun critère/i],
    // #2521 — on a cessé d'attendre : ni « injoignable », ni une panne affirmée.
    ['time_budget', /trop de temps.*classée par le score/i],
  ])

  it.each([...sentences.entries()])('%s a sa propre phrase', (reason, sentence) => {
    render_([{ source: 'pappers', reason }])
    expect(screen.getByText(sentence)).toBeInTheDocument()
  })

  // DISCOVER-PARTIEL-2 — l'écran ne relance rien tout seul sur ces pannes : la promesse
  // « relance dans quelques secondes » est retirée, la raison dit seulement ce qui s'est passé.
  it.each(['rate_limited', 'network_error', 'time_budget'])('%s dit ce qui s’est passé, sans promesse', reason => {
    render_([{ source: 'recherche-entreprises', reason }])
    expect(screen.queryByText(/quelques secondes/i)).not.toBeInTheDocument()
    expect(screen.getByText(/le registre public des entreprises — \S+/i)).toBeInTheDocument()
  })

  it('le délai dépassé ne se dit plus « injoignable »', () => {
    render_([{ source: 'claude', reason: 'time_budget' }])
    expect(screen.queryByText(/injoignable/i)).not.toBeInTheDocument()
  })

  it('deux raisons différentes ne rendent pas la même phrase', () => {
    const { container } = render_([
      { source: 'a', reason: 'quota_exceeded' },
      { source: 'b', reason: 'network_error' },
    ])
    const lines = [...container.querySelectorAll('li')].map(li => li.textContent)

    expect(new Set(lines).size).toBe(2)
  })

  it('une raison hors vocabulaire est rendue TELLE QUELLE, jamais réécrite', () => {
    // Le chemin `except` du routeur renvoie le message d'exception brut. Le
    // traduire en une cause plus jolie serait affirmer ce qu'on ignore.
    render_([{ source: 'pappers', reason: 'connection reset by peer' }])

    expect(screen.getByText(/connection reset by peer/i)).toBeInTheDocument()
  })

  // #2521 (suite) — `reason` accepte toute raison FUTURE sans casser l'écran.
  // Une clé machine (forme `snake_case`, comme toutes celles du catalogue)
  // qu'on n'a pas encore cataloguée n'est PAS une phrase d'exception : elle ne
  // doit jamais fuiter telle quelle — contrairement au cas ci-dessus, qui reste
  // du texte libre écrit par le chemin `except`.
  it('une raison nouvelle EN FORME DE CLÉ MACHINE affiche un libellé générique, jamais la clé brute', () => {
    render_([{ source: 'pappers', reason: 'some_future_reason_key' }])

    expect(screen.queryByText(/some_future_reason_key/)).not.toBeInTheDocument()
    expect(screen.getByText(/résultats partiels/i)).toBeInTheDocument()
  })
})

/**
 * #2469 — LE RETOUR BÊTA : « URGENT à corriger ».
 *
 * Ce qu'un client a lu sous le bandeau, mot pour mot :
 *
 *     « l'identification des entreprises — 1 entreprise(s) non vérifiée(s) : le
 *       registre n'a pas répondu (indisponible ou quota atteint) — écartée(s),
 *       aucun SIREN inventé. »
 *
 * Trois défauts, une seule cause : la phrase était écrite en dur, EN FRANÇAIS,
 * dans le service IA (`discover_signals.py`), et le web la recopiait telle
 * quelle. Donc intraduisible, et accordée à coups de « (s) » — un catalogue i18n
 * est justement ce qui sait faire l'accord, participe compris.
 *
 * Le sens, lui, n'a pas bougé d'un iota : chaque phrase porte ce pour quoi elle
 * avait été écrite (« aucun SIREN inventé » = la doctrine « jamais de donnée
 * fictive » ; « panne de source, pas un problème de données » = la leçon de
 * #631 ; « NON EXAMINÉE » = ni « écartée » ni « homonymie », parce qu'aucun
 * verdict n'a été rendu, #649).
 */
describe('DegradedBanner — #2469 : la raison arrive en clé, la phrase vient du catalogue', () => {
  it('une seule entreprise non vérifiée s’accorde au SINGULIER, participe compris', () => {
    render_([{ source: 'siren-resolution', reason: 'siren_unreachable', count: 1, kind: 'unreachable' }])

    expect(screen.getByText(/1 entreprise n’a pas pu être vérifiée/)).toBeInTheDocument()
    expect(screen.getByText(/elle n’est pas dans la liste/)).toBeInTheDocument()
    // La régression exacte de la capture d'écran.
    expect(screen.queryByText(/\(s\)/)).not.toBeInTheDocument()
  })

  it('plusieurs entreprises non vérifiées s’accordent au PLURIEL', () => {
    render_([{ source: 'siren-resolution', reason: 'siren_unreachable', count: 4, kind: 'unreachable' }])

    expect(screen.getByText(/4 entreprises n’ont pas pu être vérifiées/)).toBeInTheDocument()
    expect(screen.getByText(/elles ne sont pas dans la liste/)).toBeInTheDocument()
  })

  it('la panne de source reste distinguée du problème de données', () => {
    render_([{ source: 'siren-resolution', reason: 'siren_unreachable', count: 2, kind: 'unreachable' }])

    // G-FIX #4319 — la cause ET l'action, sans « SIREN » ni « registre ».
    expect(
      screen.getByText(/la source officielle n’a pas répondu.*Relance la recherche dans quelques minutes/),
    ).toBeInTheDocument()
  })

  it('l’identifiant machine n’apparaît JAMAIS à l’écran', () => {
    render_([{ source: 'siren-resolution', reason: 'siren_unreachable', count: 2, kind: 'unreachable' }])

    expect(screen.queryByText(/siren_unreachable/)).not.toBeInTheDocument()
  })

  it('un secteur non reconnu nomme le libellé refusé, et s’accorde', () => {
    render_([{ source: 'discover', reason: 'unknown_sector', count: 1, fields: ['licorne'] }])
    expect(screen.getByText(/Secteur non reconnu, donc NON appliqué : licorne/)).toBeInTheDocument()
  })

  it('deux secteurs non reconnus s’accordent au pluriel, et sont tous deux nommés', () => {
    render_([{ source: 'discover', reason: 'unknown_sector', count: 2, fields: ['licorne', 'poney'] }])
    expect(screen.getByText(/Secteurs non reconnus, donc NON appliqués : licorne, poney/)).toBeInTheDocument()
  })

  it('une raison SANS pluriel ne casse pas quand un compte l’accompagne', () => {
    // Filet : `count` part vers i18next pour toute raison connue qui en porte un.
    // Une clé sans `_one` / `_other` doit continuer à rendre sa phrase unique.
    render_([{ source: 'pappers', reason: 'quota_exceeded', count: 3 }])

    expect(screen.getByText(/quota/i)).toBeInTheDocument()
  })
})

describe("DegradedBanner — offres d'emploi (#3901)", () => {
  const renderJobs = (degraded: DiscoverDegradedSource[], jobsSearching = false) => {
    const { faults, jobsFaults } = splitDegraded(degraded)
    return render(<DegradedBanner degraded={faults} jobsSearching={jobsSearching} jobsFaults={jobsFaults} />)
  }

  it('une source d’offres DIFFÉRÉE par notre limiteur ne déclenche jamais « Résultats partiels »', () => {
    renderJobs([{ source: 'france_travail', reason: 'time_budget' }])

    expect(screen.queryByText(/résultats partiels/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/liste est incomplète/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/offres d’emploi/i)).not.toBeInTheDocument()
  })

  it('le différé n’alimente que la ligne « offres en cours », tant qu’il reste des cartes', () => {
    renderJobs([{ source: 'france_travail', reason: 'time_budget' }], true)

    expect(screen.queryByText(/résultats partiels/i)).not.toBeInTheDocument()
    expect(screen.getByText(/recherche des offres d’emploi en cours/i)).toBeInTheDocument()
  })

  it('une source d’offres en vraie panne ne dit pas « d’autres candidats existent »', () => {
    renderJobs([{ source: 'france_travail', reason: 'upstream_error', count: 3 }])

    expect(screen.queryByText(/résultats partiels/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/d’autres candidats/i)).not.toBeInTheDocument()
    expect(screen.getByText(/offres d’emploi de 3 cartes n’ont pas pu être lues/i)).toBeInTheDocument()
    expect(screen.queryByText(/france travail/i)).not.toBeInTheDocument()
  })

  it('sans compte donné, la phrase reste honnête et dit que la liste est complète', () => {
    renderJobs([{ source: 'apec', reason: 'network_error' }])

    expect(screen.getByText(/pour certaines cartes/i)).toBeInTheDocument()
    expect(screen.getByText(/liste d’entreprises, elle, est complète/i)).toBeInTheDocument()
  })

  it('une source qui PRODUIT des candidats reste, elle, « liste incomplète »', () => {
    renderJobs([
      { source: 'france_travail', reason: 'time_budget' },
      { source: 'pappers', reason: 'quota_exceeded' },
    ])

    expect(screen.getByText(/résultats partiels/i)).toBeInTheDocument()
    expect(screen.queryByText(/offres d’emploi/i)).not.toBeInTheDocument()
  })
})

describe('DegradedBanner — une phrase courte, sans promesse de relance (DISCOVER-PARTIEL-2)', () => {
  it('dit ce qui manque en une phrase courte, sans promettre une relance', () => {
    render_([{ source: 'recherche-entreprises', reason: 'rate_limited' }])

    const description = screen.getByText(/la liste peut être incomplète/i)
    expect(description.textContent?.length ?? 0).toBeLessThanOrEqual(70)
    expect(screen.queryByText(/relance dans quelques secondes/i)).not.toBeInTheDocument()
    expect(screen.getByText(/le registre public des entreprises — trop de requêtes/i)).toBeInTheDocument()
  })

  it('les sources de cartes tombées tiennent en UNE ligne neutre, hors de l’ambre', () => {
    const { cardFaults } = splitDegraded([{ source: 'eu_tenders', reason: 'rate_limited' }])
    render(<DegradedBanner degraded={[]} cardFaults={cardFaults} />)

    expect(screen.queryByText(/résultats partiels/i)).not.toBeInTheDocument()
    expect(screen.getByText(/n’ont pas pu être lues pour certaines cartes/i)).toBeInTheDocument()
  })

  it('aucune raison ne promet une relance (FR et EN)', async () => {
    const fr = (await import('@/i18n/locales/fr/discover.json')).default
    const en = (await import('@/i18n/locales/en/discover.json')).default
    for (const bundle of [fr, en]) {
      for (const text of Object.values(bundle.degraded.reason)) {
        expect(String(text)).not.toMatch(/quelques secondes|few seconds/i)
      }
    }
  })
})

// DISCOVER-PARTIEL-2 — UN seul bandeau : la panne nommée par sa famille, les homonymes repliés derrière « Détail ».
describe('DegradedBanner — un seul bandeau (DISCOVER-PARTIEL-2)', () => {
  const ambiguities: DiscoverDegradedSource[] = [{ source: 'registre', reason: 'siren_ambiguous', count: 2 }]

  it('panne + homonymes : un seul titre, pas de second bloc « n’ont pas pu être identifiées »', () => {
    render(<DegradedBanner degraded={[{ source: 'pappers', reason: 'quota_exceeded' }]} ambiguities={ambiguities} />)

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.queryByText(/n’ont pas pu être identifiées/i)).not.toBeInTheDocument()
    expect(screen.getByText(/2 entreprises non identifiées/i)).toBeInTheDocument()
    expect(screen.getByText('Détail')).toBeInTheDocument()
  })

  it('nomme la famille en panne, jamais le fournisseur', () => {
    render(<DegradedBanner degraded={[{ source: 'pappers', reason: 'quota_exceeded' }]} />)

    expect(
      screen.getByText(/^Une partie de la recherche n’a pas abouti \(la source de données d’entreprises\)\./i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/pappers/i)).not.toBeInTheDocument()
  })
})

// #4279 — « Résultats partiels » illisible : le détail natif sortait du flux et se superposait à la carte voisine.
describe('DegradedBanner — détail sans chevauchement (#4279)', () => {
  const degraded: DiscoverDegradedSource[] = [
    { source: 'pappers', reason: 'siren_unreachable', count: 5 },
    { source: 'pappers', reason: 'siren_unreachable', count: 5 },
  ]
  const ambiguities: DiscoverDegradedSource[] = [{ source: 'registre', reason: 'siren_ambiguous', count: 6 }]

  it('replié : aucun texte de détail dans le DOM, aucun <details> natif', () => {
    const { container } = rtlRender(<DegradedBanner degraded={degraded} ambiguities={ambiguities} />)

    expect(container.querySelector('details')).toBeNull()
    expect(screen.queryByText(/Une source n’a pas répondu/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Détail' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('déplié : chaque message UNE fois, en liste', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    rtlRender(
      <DegradedBanner degraded={degraded} ambiguities={ambiguities} jobsFaults={[{ source: 'x', reason: 'e' }]} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Détail' }))

    expect(screen.getAllByText(/Une source n’a pas répondu/)).toHaveLength(1)
    expect(screen.getAllByText(/Plusieurs entreprises portent le même nom et aucune ne s’impose/)).toHaveLength(1)
    expect(screen.getAllByText(/5 entreprises n’ont pas pu être vérifiées/)).toHaveLength(1)
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByRole('status')).toHaveLength(2)
  })
})

// SIMON-FIX (vu en passant b) — recette Simon 20/10 : « En panne : le registre public des entreprises ».
// Cause : l'IA émet `recherche-entreprises` + `time_budget` quand NOTRE budget de temps coupe les sous-requêtes
// du registre qui n'ont pas répondu (`discover.py`, ~l.1057) — rien n'est tombé chez la source. Une panne ne
// se dit que pour une panne (clé absente, quota, accès refusé, erreur, injoignable) ; un délai se dit « délai ».
describe('DegradedBanner — un dépassement de temps n’est pas une panne (SIMON-FIX)', () => {
  it('time_budget : « n’a pas répondu à temps », jamais « En panne »', () => {
    render_([{ source: 'recherche-entreprises', reason: 'time_budget' }])
    expect(screen.queryByText(/En panne/)).not.toBeInTheDocument()
    expect(screen.getByText(/Pas de réponse à temps/i)).toBeInTheDocument()
  })

  it('une vraie panne garde sa phrase de panne (« n’a pas abouti »), même à côté d’un délai', () => {
    render_([
      { source: 'recherche-entreprises', reason: 'time_budget' },
      { source: 'pappers', reason: 'quota_exceeded' },
    ])
    expect(
      screen.getByText(/Une partie de la recherche n’a pas abouti \(la source de données d’entreprises\)/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Pas de réponse à temps/i)).toBeInTheDocument()
  })
})
