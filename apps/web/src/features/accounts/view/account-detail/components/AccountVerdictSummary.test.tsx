import type { Account } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useHasOfferObjective } from '@/features/profile/hooks/useEsnProfile'
import { AccountVerdictSummary } from './AccountVerdictSummary'

// #3818 — `AccountVerdictSummary` appelle maintenant `useHasOfferObjective`
// (hors de tout `SessionProvider`/`QueryClientProvider` dans ce fichier, qui
// n'en avait jamais eu besoin avant) : le réel lèverait sur chaque test.
// Défaut `true` = comportement d'avant l'octet près pour tous les tests qui
// ne le surchargent pas.
vi.mock('@/features/profile/hooks/useEsnProfile', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/profile/hooks/useEsnProfile')>()
  return { ...actual, useHasOfferObjective: vi.fn(() => true) }
})

/**
 * #2937 (#2164.20) — LE LIBELLÉ HERO EXACT DU VERDICT.
 *
 * `AccountVerdictSummary` (#2118.48) porte déjà le verdict SANS DÉFILER —
 * score, badge, phrase — mais aucune phrase n'ouvrait ce bloc au sens du
 * HERO demandé par #2164 (« Voici ce que BellumAI recommande pour BPCE »,
 * `git grep` vide sur ce gabarit). `{{brand}}` reprend le nom PRODUIT déjà
 * utilisé dans les autres « eyebrow » de `analysis.json` (marque blanche),
 * jamais un « BellumAI » écrit en dur.
 *
 * Analyser sauvegarde son résultat dans le dossier Compte canonique (#2164,
 * section SAUVEGARDE) — ce même bandeau EST donc le HERO du résultat
 * d'analyse, pas un second écran à construire.
 */
const compte = (over: Partial<Account> = {}): Account =>
  ({
    id: '00000000-0000-0000-0000-000000000001',
    user_id: '00000000-0000-0000-0000-000000000002',
    company_name: 'ATOS FRANCE',
    siren: null,
    sector: null,
    employees: null,
    revenue: null,
    headquarters: null,
    website: null,
    subsidiaries: [],
    it_challenges: [],
    recent_signals: [],
    priority_score: 7,
    priority_justification: 'Compte prioritaire : signal fort et accord-cadre à renouveler.',
    raw_analysis: null,
    status: 'completed',
    error_message: null,
    user_context: null,
    api_cost_euros: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }) as Account

describe('AccountVerdictSummary — « Ce qu’il faut retenir » (#3499, ex-libellé HERO #2937)', () => {
  it('dit ce qu’il faut retenir en langage commercial, sans score en haut de page', () => {
    const { container } = render(<AccountVerdictSummary account={compte()} />)
    expect(screen.getByText("Ce qu'il faut retenir")).toBeInTheDocument()
    expect(container.textContent).toMatch(/Compte à (travailler|ne pas|explorer)/)
  })

  // D10 (Louis 05/10) — un palier posé sans arbitrage de l'équipe se dit.
  it('D10 — un score non arbitré l’écrit à côté du score, un score arbitré non', () => {
    const { unmount } = render(
      <AccountVerdictSummary account={compte({ priority_score: 5, raw_analysis: { score_unarbitrated: true } })} />,
    )
    expect(screen.getByTestId('verdict-score')).toHaveTextContent('non arbitré')
    unmount()
    render(<AccountVerdictSummary account={compte({ priority_score: 5 })} />)
    expect(screen.queryByTestId('verdict-score')).not.toBeInTheDocument()
  })

  // #3524 (Louis 01/10) — « affiche aussi le score et pourquoi faut y aller,
  // catchy, sur des faits, pas du blabla d'IA » : revient sur #3499 (score
  // retiré du haut). Doctrine tenue : le score n'est jamais nu — les axes non
  // évalués sont NOMMÉS juste dessous.
  // Refonte Théo — Louis 23/10 : « aucun score en points ». Revient sur #3524 : le verdict s'écrit en mots, la
  // lecture du dossier en GRAND ; le chiffre vit dans la fenêtre du score, avec ses axes.
  it('Louis 23/10 — aucun score en points à côté du verdict (ni /10, ni /25)', () => {
    const { container } = render(<AccountVerdictSummary account={compte()} />)
    expect(container.textContent).not.toMatch(/\d+\s*\/\s*(10|25|100)/)
    expect(screen.queryByTestId('verdict-score')).not.toBeInTheDocument()
  })

  it('Refonte Théo — « Le regard de Laura » : son nom, puis la lecture du dossier en grand titre', () => {
    render(<AccountVerdictSummary account={compte()} />)
    expect(screen.getByText('Le regard de Laura')).toBeInTheDocument()
    expect(screen.getByTestId('verdict-headline').className).toMatch(/text-2xl/)
  })

  it('#3524 — « Pourquoi y aller » liste les faits du dossier (3 max, ceux du dossier)', () => {
    render(
      <AccountVerdictSummary
        account={compte({
          raw_analysis: {
            evaluation: {
              bellum_read: {
                verdict_line: 'Accord-cadre à renouveler en 2027.',
                why: ['Accord-cadre cloud échu en 2027', 'DSI recrutée en mars', 'Budget IT +12 %'],
              },
            },
          },
        })}
      />,
    )
    const list = screen.getByTestId('verdict-why')
    expect(list).toHaveTextContent('Accord-cadre cloud échu en 2027')
    expect(list).toHaveTextContent('Budget IT +12 %')
    expect(list.querySelectorAll('li')).toHaveLength(3)
  })

  it('#3524 ⚠️ SAIT DIRE NON — sans fait, aucune liste « pourquoi » inventée', () => {
    render(<AccountVerdictSummary account={compte()} />)
    expect(screen.queryByTestId('verdict-why')).not.toBeInTheDocument()
  })

  // #3524.1 (recette prod 02/10) — « ligne des axes non mesurés absente » :
  // un score sans décomposition le DIT, jamais nu.
  it('#3524 — score sans lecture en sept axes : la ligne sous la pastille dit pourquoi', () => {
    render(<AccountVerdictSummary account={compte()} />)
    expect(screen.getByTestId('verdict-axes-line')).toHaveTextContent(/antérieure à la lecture en sept axes/)
  })

  // #3524.1 (recette prod Y8 02/10) — prod : lecture en sept axes PRÉSENTE et
  // aucun axe inconnu → ni la liste des non mesurés, ni la phrase « antérieure »
  // : le score restait nu. Il dit maintenant sur combien d'axes il repose.
  it('#3524 — lecture en sept axes, tous mesurés : la ligne dit « noté sur 7 axes »', () => {
    const axes = [
      'adequation_offre',
      'potentiel_commercial',
      'fraicheur',
      'accessibilite',
      'capacite_achat_externe',
      'concurrence',
      'qualite_preuves',
    ].map(key => ({ key, state: 'measured', value: 3 }))
    render(<AccountVerdictSummary account={compte({ raw_analysis: { evaluation: { dossier_read: { axes } } } })} />)
    const line = screen.getByTestId('verdict-axes-line')
    expect(line).toHaveTextContent(/7 axes/)
    expect(line).not.toHaveTextContent(/antérieure|non mesuré/)
  })

  it('#3524 ⚠️ SAIT DIRE NON — sans score, aucune ligne d’axes', () => {
    render(<AccountVerdictSummary account={compte({ priority_score: null })} />)
    expect(screen.queryByTestId('verdict-axes-line')).not.toBeInTheDocument()
  })

  it('#3524 — un score sans note (null) ne s’affiche jamais « 0/10 »', () => {
    render(<AccountVerdictSummary account={compte({ priority_score: null })} />)
    expect(screen.queryByTestId('verdict-score')).not.toBeInTheDocument()
  })

  it('#3499 — aucune marge négative (le panneau « Le regard de Laura » porte son propre espacement)', () => {
    render(<AccountVerdictSummary account={compte()} />)
    const classes = screen.getByTestId('account-verdict-summary').className.split(/\s+/)
    expect(classes.some(name => name.startsWith('-mt-'))).toBe(false)
  })

  it('⚠️ SAIT DIRE NON — sans verdict, aucune phrase inventée', () => {
    render(<AccountVerdictSummary account={compte({ priority_score: null, priority_justification: null })} />)
    expect(screen.queryByText("Ce qu'il faut retenir")).not.toBeInTheDocument()
  })

  // #2932 — recette écran 27/09/2026 (Capital Recrutement) : une analyse
  // FRAÎCHE dont l'IA a émis STOP affichait encore l'ancien libellé legacy
  // « NO-GO » sur ce badge, alors que l'épopée #2932 a livré les cinq
  // catégories métier nommées côté IA (`named_verdict()`,
  // `apps/ia/app/services/account_score.py`). Cause : ce badge lisait
  // `accountDisplayVerdict` seul, qui replie STOP sur l'ancien 4-valeurs.
  it('#2932 — un STOP frais avec déclencheur identifié affiche METTRE EN VEILLE, jamais NO-GO', () => {
    render(
      <AccountVerdictSummary
        account={compte({
          priority_score: 3,
          raw_analysis: {
            evaluation: {
              verdict: 'STOP',
              dossier_read: {
                no_go: { temporary: true, context: null, trigger: 'Renouvellement de l’accord-cadre en 2027' },
              },
            },
          },
        })}
      />,
    )
    expect(screen.getByText('METTRE EN VEILLE')).toBeInTheDocument()
    expect(screen.queryByText('NO-GO')).not.toBeInTheDocument()
  })

  // LUDB.7 — verdict ↔ titre ↔ arguments cohérents : en veille, la section dit
  // pourquoi ATTENDRE et ce qui ferait changer d'avis, jamais « Pourquoi y aller ».
  it('LUDB.7 — METTRE EN VEILLE : « Pourquoi attendre » + ce qui ferait changer d’avis', () => {
    render(
      <AccountVerdictSummary
        account={compte({
          priority_score: 3,
          raw_analysis: {
            evaluation: {
              verdict: 'STOP',
              bellum_read: { verdict_line: 'Pas de besoin avant 2027.', why: ['Accord-cadre en cours jusqu’en 2027'] },
              dossier_read: { no_go: { temporary: true, context: null, trigger: 'Renouvellement de l’accord-cadre' } },
            },
          },
        })}
      />,
    )
    expect(screen.getByText('METTRE EN VEILLE')).toBeInTheDocument()
    expect(screen.getByText('Pourquoi attendre')).toBeInTheDocument()
    expect(screen.queryByText('Pourquoi y aller')).not.toBeInTheDocument()
    expect(screen.getByTestId('verdict-reopen')).toHaveTextContent('Renouvellement de l’accord-cadre')
  })

  // LUDOVIC-C LC.8 — STILL en prod (19/10) : liste = « recrutements techniciens après-vente 14/10 »,
  // fiche = « METTRE EN VEILLE » motivé par Hambourg / 50 M€ sans citer ce signal.
  it('LC.8 — le motif du verdict cite le signal DOMINANT de la liste (même source)', () => {
    render(
      <AccountVerdictSummary
        account={compte({
          priority_score: 3,
          signal_preview: { label: 'Recrutements techniciens après-vente', date: '2026-10-14', type: 'hiring' },
          raw_analysis: {
            evaluation: {
              verdict: 'STOP',
              bellum_read: { verdict_line: 'Décision à Hambourg.', why: ['Siège à Hambourg', 'CA France 50 M€'] },
            },
          },
        })}
      />,
    )
    expect(screen.getByTestId('verdict-dominant-signal')).toHaveTextContent('Recrutements techniciens après-vente')
    expect(screen.getByTestId('verdict-dominant-signal')).toHaveTextContent('14/10/2026')
  })

  it('LC.8 — dit NON à une ligne vide : sans signal dominant, aucune ligne', () => {
    render(
      <AccountVerdictSummary
        account={compte({
          priority_score: 3,
          raw_analysis: { evaluation: { verdict: 'STOP', bellum_read: { verdict_line: 'Décision à Hambourg.' } } },
        })}
      />,
    )
    expect(screen.queryByTestId('verdict-dominant-signal')).not.toBeInTheDocument()
  })

  // #3914 (retour bêta 08/10) — « ce que tu me remontes et l'analyse pure et
  // dure, ça peut différer » : un compte venu de Découvrir dont l'analyse
  // conclut « mettre en veille » cite sur quoi Découvrir l'avait fait remonter.
  it('#3914 — METTRE EN VEILLE sur un compte venu de Découvrir cite la raison de Découvrir', () => {
    render(
      <AccountVerdictSummary
        account={compte({
          priority_score: 3,
          origin: 'discover',
          discover_origin_reason: '5 postes data ouverts',
          raw_analysis: {
            evaluation: {
              verdict: 'STOP',
              dossier_read: { no_go: { temporary: true, context: null, trigger: 'Budget gelé au T4' } },
            },
          },
        })}
      />,
    )
    expect(screen.getByTestId('discover-bridge-note')).toHaveTextContent('5 postes data ouverts')
  })

  it('#3914 ⚠️ SAIT DIRE NON — muet hors METTRE EN VEILLE, même venu de Découvrir', () => {
    render(
      <AccountVerdictSummary
        account={compte({
          priority_score: 8,
          origin: 'discover',
          discover_origin_reason: '5 postes data ouverts',
          raw_analysis: { evaluation: { verdict: 'GO' } },
        })}
      />,
    )
    expect(screen.queryByTestId('discover-bridge-note')).not.toBeInTheDocument()
  })

  it('#3914 ⚠️ SAIT DIRE NON — muet sans raison persistée, même en METTRE EN VEILLE', () => {
    render(
      <AccountVerdictSummary
        account={compte({
          priority_score: 3,
          origin: 'discover',
          raw_analysis: {
            evaluation: {
              verdict: 'STOP',
              dossier_read: { no_go: { temporary: true, context: null, trigger: 'Budget gelé au T4' } },
            },
          },
        })}
      />,
    )
    expect(screen.queryByTestId('discover-bridge-note')).not.toBeInTheDocument()
  })

  it('#3914 ⚠️ SAIT DIRE NON — muet hors origine Découvrir, même en METTRE EN VEILLE', () => {
    render(
      <AccountVerdictSummary
        account={compte({
          priority_score: 3,
          origin: 'search',
          discover_origin_reason: '5 postes data ouverts',
          raw_analysis: {
            evaluation: {
              verdict: 'STOP',
              dossier_read: { no_go: { temporary: true, context: null, trigger: 'Budget gelé au T4' } },
            },
          },
        })}
      />,
    )
    expect(screen.queryByTestId('discover-bridge-note')).not.toBeInTheDocument()
  })

  // #3819 (lot RBB, décision Louis 11/10) — un compte ajouté depuis Découvrir
  // garde sa raison de sélection ET ses critères, affichés sur le dossier quel
  // que soit le verdict.
  it('#3819 — un compte venu de Découvrir dit « Sélectionné sur … » ses critères et sa raison', () => {
    render(
      <AccountVerdictSummary
        account={compte({
          priority_score: 8,
          origin: 'discover',
          discover_origin_reason: '5 postes data ouverts',
          discover_origin_criteria: {
            sectors: ['insurance'],
            zone: 'Lille',
            headcount: ['1000+'],
            signals: ['hiring'],
          },
          raw_analysis: { evaluation: { verdict: 'GO' } },
        })}
      />,
    )
    const line = screen.getByTestId('discover-origin-line')
    expect(line).toHaveTextContent('Assurance & mutuelles')
    expect(line).toHaveTextContent('Lille')
    expect(line).toHaveTextContent('1000+')
    expect(line).toHaveTextContent(/recrutement/i)
    expect(line).toHaveTextContent('5 postes data ouverts')
  })

  // #3819 (lot W-C 13/10) — la compétence cherchée est relue par la fiche.
  it('#3819 — la compétence cherchée dans Découvrir est redite sur la fiche', () => {
    render(
      <AccountVerdictSummary
        account={compte({ origin: 'discover', discover_origin_criteria: { skills: ['java', 'sap'] } })}
      />,
    )
    expect(screen.getByTestId('discover-origin-line')).toHaveTextContent('compétence java, sap')
  })

  // #4646.9 — le rattrapage ne part pas seul : tant qu'un compte n'est pas rejoué, son écran DIT que sa collecte est
  // antérieure à la reprise des offres de Découvrir.
  it('#4646.9 — un dossier Découvrir analysé AVANT la reprise des offres le dit', () => {
    render(
      <AccountVerdictSummary
        account={compte({
          origin: 'discover',
          last_analyzed_at: '2026-10-27T10:05:00Z',
          discover_origin_criteria: { skills: ['java', 'vue'] },
        })}
      />,
    )
    expect(screen.getByTestId('discover-origin-prior')).toBeInTheDocument()
  })

  it('#4646.9 — dit NON : analysé après la reprise, ou avec ses offres, ou hors Découvrir, rien', () => {
    const { rerender } = render(
      <AccountVerdictSummary
        account={compte({
          origin: 'discover',
          last_analyzed_at: '2026-10-29T10:05:00Z',
          discover_origin_criteria: { skills: ['java'] },
        })}
      />,
    )
    expect(screen.queryByTestId('discover-origin-prior')).toBeNull()
    rerender(
      <AccountVerdictSummary
        account={compte({
          origin: 'discover',
          last_analyzed_at: '2026-10-27T10:05:00Z',
          discover_origin_criteria: { skills: ['java'], offers: [{ title: 'Dev Java' }] },
        })}
      />,
    )
    expect(screen.queryByTestId('discover-origin-prior')).toBeNull()
    rerender(
      <AccountVerdictSummary
        account={compte({
          origin: 'search',
          last_analyzed_at: '2026-10-27T10:05:00Z',
          discover_origin_criteria: { skills: ['java'] },
        })}
      />,
    )
    expect(screen.queryByTestId('discover-origin-prior')).toBeNull()
  })

  it('#3819 — en METTRE EN VEILLE, la raison n’est pas répétée (déjà citée par le pont #3914)', () => {
    render(
      <AccountVerdictSummary
        account={compte({
          priority_score: 3,
          origin: 'discover',
          discover_origin_reason: '5 postes data ouverts',
          discover_origin_criteria: { zone: 'Lille' },
          raw_analysis: {
            evaluation: {
              verdict: 'STOP',
              dossier_read: { no_go: { temporary: true, context: null, trigger: 'Budget gelé au T4' } },
            },
          },
        })}
      />,
    )
    expect(screen.getByTestId('discover-origin-line')).toHaveTextContent('Lille')
    expect(screen.getByTestId('discover-origin-line')).not.toHaveTextContent('5 postes data ouverts')
    expect(screen.getByTestId('discover-bridge-note')).toHaveTextContent('5 postes data ouverts')
  })

  it('#3819 ⚠️ SAIT DIRE NON — rien hors origine Découvrir, ni sans critère ni raison', () => {
    const { rerender } = render(
      <AccountVerdictSummary account={compte({ origin: 'search', discover_origin_criteria: { zone: 'Lille' } })} />,
    )
    expect(screen.queryByTestId('discover-origin-line')).not.toBeInTheDocument()
    rerender(<AccountVerdictSummary account={compte({ origin: 'discover', discover_origin_criteria: {} })} />)
    expect(screen.queryByTestId('discover-origin-line')).not.toBeInTheDocument()
  })

  // #4642 — un dossier lancé depuis « Comptes où placer X » dit sur quoi il a été cadré.
  it('#4642 — « Cadré sur ta demande à Laura » nomme les compétences et les offres, mêmes intitulés et dates', () => {
    render(
      <AccountVerdictSummary
        account={compte({
          origin: 'search',
          discover_origin_criteria: {
            framed_by: 'laura',
            skills: ['Java', 'Kafka'],
            offers: [{ title: 'Dev Java Kafka', date: '2026-10-20' }, { title: 'Architecte SI' }],
          },
        })}
      />,
    )
    const line = screen.getByTestId('discover-origin-line')
    expect(line).toHaveTextContent('Cadré sur ta demande à Laura')
    expect(line).toHaveTextContent('compétence Java, Kafka')
    expect(line).toHaveTextContent('offres relevées : Dev Java Kafka (2026-10-20) ; Architecte SI')
    expect(line).not.toHaveTextContent('Sélectionné dans Découvrir')
  })

  it('#4642 — le dossier NOMME le consultant du cadrage (prod 27/10 : « Camille Fournier » absent, 0 occurrence)', () => {
    render(
      <AccountVerdictSummary
        account={compte({
          origin: 'search',
          discover_origin_criteria: { framed_by: 'laura', talent_name: 'Camille Fournier', skills: ['Java'] },
        })}
      />,
    )
    expect(screen.getByTestId('discover-origin-line')).toHaveTextContent(
      'consultant Camille Fournier · compétence Java',
    )
  })

  it('#4642 ⚠️ SAIT DIRE NON — pas de cadrage Laura, pas de ligne ; un compte Découvrir garde sa ligne d’avant', () => {
    const { rerender } = render(
      <AccountVerdictSummary account={compte({ origin: 'search', discover_origin_criteria: { skills: ['Java'] } })} />,
    )
    expect(screen.queryByTestId('discover-origin-line')).not.toBeInTheDocument()
    rerender(
      <AccountVerdictSummary
        account={compte({ origin: 'search', discover_origin_criteria: { framed_by: 'laura' } })}
      />,
    )
    expect(screen.queryByTestId('discover-origin-line')).not.toBeInTheDocument()
    rerender(
      <AccountVerdictSummary
        account={compte({ origin: 'discover', discover_origin_criteria: { skills: ['Java'] } })}
      />,
    )
    expect(screen.getByTestId('discover-origin-line')).toHaveTextContent(
      'Sélectionné dans Découvrir sur : compétence Java',
    )
  })

  it('#2932 — un STOP frais sans déclencheur affiche ÉCARTER POUR CET OBJECTIF, jamais NO-GO', () => {
    render(
      <AccountVerdictSummary
        account={compte({
          priority_score: 3,
          raw_analysis: { evaluation: { verdict: 'STOP' } },
        })}
      />,
    )
    expect(screen.getByText('ÉCARTER POUR CET OBJECTIF')).toBeInTheDocument()
    expect(screen.queryByText('NO-GO')).not.toBeInTheDocument()
  })
})

// #3420.2 (recette démo 06/10) — « BPCE non arbitré à 5 » : la porte « À trancher » se LIT sur la Synthèse
// (le bouton du hero est une icône, il ne dit pas l'état). Un compte priorisé ou écarté n'en porte pas, et
// une porte inconnue ne se devine pas.
describe('AccountVerdictSummary — la porte « À trancher » se lit (#3420.2)', () => {
  it('un compte dont la porte est « à trancher » le dit, à côté du score non arbitré', () => {
    render(
      <AccountVerdictSummary
        account={compte({
          priority_score: 5,
          priority_gate: 'pending',
          raw_analysis: { score_unarbitrated: true },
        })}
      />,
    )
    expect(screen.getByTestId('verdict-gate')).toHaveTextContent('À trancher')
    expect(screen.getByTestId('verdict-score')).toHaveTextContent('non arbitré')
  })

  it('NON — priorisé, écarté ou porte inconnue : aucune pastille « À trancher »', () => {
    const { unmount } = render(<AccountVerdictSummary account={compte({ priority_gate: 'prioritised' })} />)
    expect(screen.queryByTestId('verdict-gate')).not.toBeInTheDocument()
    unmount()
    const second = render(<AccountVerdictSummary account={compte({ priority_gate: 'parked' })} />)
    expect(screen.queryByTestId('verdict-gate')).not.toBeInTheDocument()
    second.unmount()
    render(<AccountVerdictSummary account={compte()} />)
    expect(screen.queryByTestId('verdict-gate')).not.toBeInTheDocument()
  })
})

describe('AccountVerdictSummary — sans objectif renseigné (#3818)', () => {
  it('un STOP sans déclencheur, sans objectif renseigné, ne dit jamais ÉCARTER POUR CET OBJECTIF', () => {
    vi.mocked(useHasOfferObjective).mockReturnValueOnce(false)
    render(
      <AccountVerdictSummary
        account={compte({
          priority_score: 3,
          raw_analysis: { evaluation: { verdict: 'STOP' } },
        })}
      />,
    )
    expect(screen.getByText('ÉVALUATION PERSONNALISÉE INDISPONIBLE — ZÉRO MESURÉ')).toBeInTheDocument()
    expect(screen.queryByText('ÉCARTER POUR CET OBJECTIF')).not.toBeInTheDocument()
  })
})

// #4016 L9 — UNE seule échelle : la Vue d'ensemble lit la même valeur /25 que la fiche Score.
describe('AccountVerdictSummary — une seule échelle de score (#4016 L9)', () => {
  it('Louis 23/10 — même avec une note /25 en évaluation, le verdict ne l’affiche pas en points', () => {
    render(
      <AccountVerdictSummary
        account={compte({ priority_score: 7, raw_analysis: { plan: { evaluation: { score: 15 } } } })}
      />,
    )
    expect(screen.queryByText(/15\/25/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\/10/)).not.toBeInTheDocument()
  })
})
