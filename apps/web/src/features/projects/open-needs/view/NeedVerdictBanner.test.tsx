import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildNeedVerdict, chooseCommercialMethod } from '@bellum/contracts'

/**
 * LE BANDEAU DU VERDICT — ce que l'ÉCRAN en fait.
 *
 * Le calcul est tenu ailleurs (`packages/contracts/src/schemas/need-verdict.ts`
 * et ses trente-six tests). Ce fichier tient les trois choses qu'un écran peut
 * défaire tout seul, et qui ont toutes déjà été défaites dans ce dépôt :
 *
 *  - afficher un axe non renseigné comme un ZÉRO ;
 *  - taire le dénominateur, donc laisser lire le verdict comme complet ;
 *  - remplacer la décomposition par une phrase.
 */

const verdictQuery = vi.fn()
vi.mock('../hooks/useNeedVerdict', () => ({ useNeedVerdict: () => verdictQuery() }))

const { NeedVerdictBanner } = await import('./NeedVerdictBanner')

function state(over: Partial<Parameters<typeof buildNeedVerdict>[0]> = {}) {
  const verdict = buildNeedVerdict({
    staffingCapacity: { aboveThreshold: 3, threshold: 60, evaluated: 12 },
    economics: { targetRateCents: 65_000, floorRateCents: 60_000 },
    relationship: { activeMissions: 2, accountKnown: true },
    competition: { competitorsOnAccount: 8, panelLooked: true },
    feasibility: { availabilityScore: 100, startOn: '2026-10-01' },
    access: { contactsKnown: 4, decisionMakerKnown: true },
    procurement: { procurementInvolvement: 'non_implique' },
    contractRisk: { riskText: null },
    ...over,
  })
  return {
    verdict,
    profiles: [{ consultantId: 'c-1' }],
    runAt: '2026-08-30T09:00:00.000Z',
    method: chooseCommercialMethod({
      verdict: {
        verdict: verdict.verdict,
        blockingAxes: verdict.blockingAxes,
        unmeasuredDecisiveAxes: verdict.unmeasuredDecisiveAxes,
      },
      relationshipState: 'positive',
      accessState: 'positive',
      staffingState: 'positive',
      stale: false,
    }),
    isLoading: false,
    isError: false,
  }
}

beforeEach(() => {
  verdictQuery.mockReset()
})

describe('NeedVerdictBanner', () => {
  it('rend le verdict ET son dénominateur — jamais le verdict seul', () => {
    verdictQuery.mockReturnValue(state())
    render(<NeedVerdictBanner needId="n-1" onSeeProfiles={() => {}} />)

    expect(screen.getByText('OUI, FAIS-LE')).toBeInTheDocument()
    // « 8 axes · 7 renseignés · 1 attention » — sans lui, le OUI se lit comme
    // une vérité complète.
    expect(screen.getByText(/8 axes.*7 renseignés.*1 attention/)).toBeInTheDocument()
  })

  it('#3486 — sans profil au-dessus du seuil, le bandeau n’écrit pas la phrase (la carte voisine la porte) ; avec profil, il garde « Voir le profil »', () => {
    verdictQuery.mockReturnValue({ ...state(), profiles: [] })
    const { unmount } = render(<NeedVerdictBanner needId="n-1" onSeeProfiles={() => {}} />)
    expect(screen.queryByText(/Aucun profil au-dessus du seuil/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /profil/i })).not.toBeInTheDocument()
    unmount()
    verdictQuery.mockReturnValue(state())
    render(<NeedVerdictBanner needId="n-1" onSeeProfiles={() => {}} />)
    expect(screen.getByRole('button', { name: 'Voir le profil' })).toBeEnabled()
  })

  it('⚠️ un axe non renseigné affiche SA RAISON, jamais « 0 »', () => {
    verdictQuery.mockReturnValue(state({ competition: { competitorsOnAccount: null, panelLooked: false } }))
    render(<NeedVerdictBanner needId="n-1" onSeeProfiles={() => {}} />)

    expect(screen.getByText(/panel fournisseurs de ce compte n’a jamais été renseigné/)).toBeInTheDocument()
    // Le dénominateur suit l'absence : 5 renseignés sur 6.
    expect(screen.getByText(/8 axes.*6 renseignés/)).toBeInTheDocument()
    // Et l'axe ne devient pas une attention : il n'est ni pour ni contre.
    expect(screen.getByText(/8 axes.*0 attention/)).toBeInTheDocument()
  })

  it('⚠️ un axe DÉCISIF non renseigné ne rend PAS « oui »', () => {
    verdictQuery.mockReturnValue(state({ staffingCapacity: { aboveThreshold: null, threshold: 60, evaluated: null } }))
    render(<NeedVerdictBanner needId="n-1" onSeeProfiles={() => {}} />)

    expect(screen.getByText('JE MANQUE DE DONNÉES')).toBeInTheDocument()
    expect(screen.queryByText('OUI, FAIS-LE')).not.toBeInTheDocument()
    expect(screen.getByText(/Aucun rapprochement n’a encore tourné/)).toBeInTheDocument()
  })

  it('« Pourquoi ce verdict ? » rend la RÈGLE et les axes avec leur poids', async () => {
    verdictQuery.mockReturnValue(state())
    render(<NeedVerdictBanner needId="n-1" onSeeProfiles={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: 'Pourquoi ce verdict ?' }))

    // La règle qui a tranché — pas une phrase de modèle.
    expect(screen.getByText(/Les deux axes décisifs sont renseignés/)).toBeInTheDocument()
    // Et le POIDS de chaque axe, qui dit ce que l'axe peut faire.
    expect(screen.getByText('Capacité à staffer (décisif)')).toBeInTheDocument()
    expect(screen.getByText('Concurrence (consultatif)')).toBeInTheDocument()
  })

  it('⚠️ AUCUN pourcentage ni chance de signer nulle part sur le bandeau', async () => {
    verdictQuery.mockReturnValue(state())
    const { container } = render(<NeedVerdictBanner needId="n-1" onSeeProfiles={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Pourquoi ce verdict ?' }))

    const text = container.textContent ?? ''
    // La garde LIT quelque chose : ce témoin prouve que le rendu n'est pas vide.
    expect(text).toContain('OUI, FAIS-LE')
    for (const forbidden of ['%', 'chance', 'probabilit', 'taux de réussite']) {
      expect(`${forbidden} → ${text.toLowerCase().includes(forbidden)}`).toBe(`${forbidden} → false`)
    }
  })

  it('#2323.33 — Laura demande d’abord ÉCONOMIE quand elle n’est pas renseignée, et dit pourquoi', () => {
    verdictQuery.mockReturnValue(
      state({
        economics: { targetRateCents: null, floorRateCents: 60_000 },
        access: { contactsKnown: null, decisionMakerKnown: false },
      }),
    )
    render(<NeedVerdictBanner needId="n-1" onSeeProfiles={() => {}} />)

    expect(screen.getByText('Laura demande d’abord : Économie')).toBeInTheDocument()
    expect(screen.getByText(/sans TJM cible ni plancher, aucun « oui » n’est possible/)).toBeInTheDocument()
    // La raison DÉTAILLÉE de l'axe reste dans sa case, jamais répétée ici
    // (« rien n'apparaît deux fois sous la même forme ») : une seule
    // occurrence du texte de `unmeasured.noTargetRate` sur l'écran.
    expect(screen.getAllByText(/Aucun TJM cible n’a été communiqué/)).toHaveLength(1)
  })

  it('#2323.33 — ne demande RIEN quand les huit axes sont renseignés', () => {
    verdictQuery.mockReturnValue(state({ contractRisk: { riskText: 'Pénalités de retard' } }))
    render(<NeedVerdictBanner needId="n-1" onSeeProfiles={() => {}} />)

    expect(screen.queryByText(/Laura demande d’abord/)).not.toBeInTheDocument()
  })

  it('#3390 — affiche la méthode choisie AVANT tout message : effort, action, personnes utiles', () => {
    verdictQuery.mockReturnValue(state())
    render(<NeedVerdictBanner needId="n-1" onSeeProfiles={() => {}} />)

    // #3852.4 — les trois libellés sont NOMMÉS, pas seulement leur valeur nue.
    expect(screen.getByText(/Niveau d’effort.*Sprint court/)).toBeInTheDocument()
    expect(screen.getByText('Constituer la shortlist')).toBeInTheDocument()
    expect(screen.getByText(/Route d’ouverture.*Réactivation chaude/)).toBeInTheDocument()
    expect(screen.getByText(/Trajectoire.*Par le haut/)).toBeInTheDocument()
    expect(screen.getByText(/Personnes utiles.*le décideur/)).toBeInTheDocument()
  })

  it('#3390 (recette 30/09) — condition de bascule ET condition d’arrêt, pas seulement les six premiers champs', () => {
    verdictQuery.mockReturnValue(state())
    render(<NeedVerdictBanner needId="n-1" onSeeProfiles={() => {}} />)

    expect(screen.getByText(/Condition de bascule.*Bascule quand la shortlist est prête/)).toBeInTheDocument()
    expect(screen.getByText(/Condition d’arrêt.*S’arrête si le client reste silencieux/)).toBeInTheDocument()
  })

  it('#3852.4 — NO-GO : route et trajectoire nommées « non évalué », jamais simplement absentes', () => {
    verdictQuery.mockReturnValue(state({ economics: { targetRateCents: 50_000, floorRateCents: 60_000 } }))
    render(<NeedVerdictBanner needId="n-1" onSeeProfiles={() => {}} />)

    expect(screen.getByText(/Niveau d’effort.*Pause ou sortie/)).toBeInTheDocument()
    expect(screen.getByText('Ne rien engager — dossier en pause')).toBeInTheDocument()
    expect(screen.getByText(/Route d’ouverture.*non évalué/)).toBeInTheDocument()
    expect(screen.getByText(/Trajectoire.*non évalué/)).toBeInTheDocument()
    expect(screen.queryByText('Réactivation chaude')).not.toBeInTheDocument()
  })

  it('#3390 — méthode absente (déploiement web-avant-API) : aucun bloc, aucun plantage', () => {
    verdictQuery.mockReturnValue({ ...state(), method: null })
    render(<NeedVerdictBanner needId="n-1" onSeeProfiles={() => {}} />)

    expect(screen.getByText('OUI, FAIS-LE')).toBeInTheDocument()
    expect(screen.queryByText('Méthode')).not.toBeInTheDocument()
  })

  it('#3390.9 — la capacité déclarée et les 5P du compte sont dits dans le bloc Méthode', () => {
    verdictQuery.mockReturnValue({
      ...state(),
      commercialContext: { weeklyAvailableHours: 12, fiveP: { readiness: 'READY_TO_VERIFY', nextDimension: 'people' } },
    })
    render(<NeedVerdictBanner needId="n-1" onSeeProfiles={() => {}} />)

    expect(screen.getByText('Ta capacité déclarée : 12 h par semaine')).toBeInTheDocument()
    expect(screen.getByText('5P du compte : Prêt, à vérifier · prochaine dimension : Personnes')).toBeInTheDocument()
  })

  it('#3390.9 — les actions en retard du commercial sont dites ; 0 ou non lu ne fait aucune ligne', () => {
    verdictQuery.mockReturnValue({
      ...state(),
      commercialContext: { weeklyAvailableHours: null, fiveP: null, overdueActions: 3 },
    })
    const { unmount } = render(<NeedVerdictBanner needId="n-1" onSeeProfiles={() => {}} />)
    expect(screen.getByText('Tes actions en retard : 3')).toBeInTheDocument()
    unmount()

    verdictQuery.mockReturnValue({
      ...state(),
      commercialContext: { weeklyAvailableHours: null, fiveP: null, overdueActions: 0 },
    })
    render(<NeedVerdictBanner needId="n-1" onSeeProfiles={() => {}} />)
    expect(screen.queryByText(/actions en retard/)).not.toBeInTheDocument()
  })

  it('#3390.9 — une absence ne fait AUCUNE ligne : ni « 0 h », ni 5P par défaut', () => {
    verdictQuery.mockReturnValue({ ...state(), commercialContext: { weeklyAvailableHours: null, fiveP: null } })
    render(<NeedVerdictBanner needId="n-1" onSeeProfiles={() => {}} />)

    expect(screen.queryByText(/capacité déclarée/)).not.toBeInTheDocument()
    expect(screen.queryByText(/5P du compte/)).not.toBeInTheDocument()
  })

  it('un verdict illisible ne se rend pas « non » — deux vides, deux phrases', () => {
    verdictQuery.mockReturnValue({ verdict: null, profiles: [], runAt: null, isLoading: false, isError: true })
    render(<NeedVerdictBanner needId="n-1" onSeeProfiles={() => {}} />)

    expect(screen.getByText(/n’a pas pu être lu/)).toBeInTheDocument()
    expect(screen.queryByText('NON, MAUVAIS FIT')).not.toBeInTheDocument()
  })

  it('#3390 — sans profil au-dessus du seuil : la phrase vit UNE fois (axe Capacité), aucun bouton grisé', () => {
    verdictQuery.mockReturnValue({
      ...state({ staffingCapacity: { aboveThreshold: 0, threshold: 60, evaluated: 12 } }),
      profiles: [],
    })
    render(<NeedVerdictBanner needId="n-1" onSeeProfiles={() => {}} />)
    expect(screen.queryByRole('button', { name: /profil/i })).not.toBeInTheDocument()
    // La ligne « Ce qui bloque — Capacité : … » cite l'axe ; hors elle, la phrase n'a qu'UNE place.
    const outsideBlockingLine = screen
      .getAllByText(/Aucun profil au-dessus du seuil/)
      .filter(node => !/^Ce qui bloque/.test(node.textContent ?? ''))
    expect(outsideBlockingLine).toHaveLength(1)
  })

  it('#3486 — aucun profil : pas de bouton désactivé qui répète « Aucun profil au-dessus du seuil » (la carte le dit une fois)', () => {
    verdictQuery.mockReturnValue({ ...state(), profiles: [] })
    render(<NeedVerdictBanner needId="n-1" onSeeProfiles={() => {}} />)
    expect(screen.queryByText(/Aucun profil au-dessus du seuil/)).not.toBeInTheDocument()
  })

  it('#3486 — des profils : le bouton « voir les profils » reste là et appelle', async () => {
    const onSee = vi.fn()
    verdictQuery.mockReturnValue(state())
    render(<NeedVerdictBanner needId="n-1" onSeeProfiles={onSee} />)
    await userEvent.click(screen.getByRole('button', { name: /profil/i }))
    expect(onSee).toHaveBeenCalledTimes(1)
  })
})
