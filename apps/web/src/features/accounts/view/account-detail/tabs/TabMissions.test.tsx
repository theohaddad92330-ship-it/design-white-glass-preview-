import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Account, AccountMissions } from '@bellum/contracts'

/**
 * L'ONGLET MISSIONS D'UN DOSSIER DE COMPTE (PDF 4 §3.3, BEL-BO-006).
 *
 * Ce que ces tests tiennent, et qui n'est pas décoratif :
 *
 *  1. **Aucune valeur absente ne s'affiche « 0 ».** Un compte sans mission n'a
 *     pas « rapporté 0 € » ; une mission sans date de fin n'a pas « 0 jour
 *     restant » ; un client dont aucune mission ne porte de tarif n'achète pas
 *     « à 0 € ». Chacun de ces trois zéros est une information FAUSSE.
 *  2. **« Pas ton périmètre » ≠ « pas mesuré ».** Les deux rendent `null` côté
 *     serveur ; c'est `canReadFinance` qui les distingue, et l'écran DOIT les
 *     dire différemment — sinon un commercial demande un droit qu'il a déjà, ou
 *     saisit un coût qu'il n'a pas le droit de voir.
 *  3. **§4.4 — rien ne s'édite sur place.** L'onglet porte un lien vers la
 *     source et AUCUN champ de saisie.
 *  4. **L'état vide porte une sortie.** Un cul-de-sac est une cause racine déjà
 *     payée dans ce dépôt.
 */

const mockFetch = vi.fn()
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => mockFetch(...args) }))
vi.mock('@tanstack/react-router', () => ({
  // #4424.6 — la création d'une mission propose « Préparer le RDV » : le hook de création lit la navigation.
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const { TabMissions } = await import('./TabMissions')

const ACCOUNT = { id: 'acc-1' } as Account

const SOURCE = { kind: 'missions' as const, href: '/missions?accountId=acc-1', label: 'Les missions de ce compte' }

const EMPTY: AccountMissions = {
  accountId: 'acc-1',
  canReadFinance: true,
  source: SOURCE,
  editable: false,
  active: [],
  past: [],
  placedConsultants: [],
  buying: null,
  notRenewed: [],
  // ⚠️ REQUIS, pas facultatif : le déclarer optionnel laisserait un appelant
  // l'oublier sans que rien ne s'en aperçoive — le défaut « un normaliseur
  // avale les champs neufs », qui produit une fonctionnalité invisible derrière
  // des tests verts. `null` ici veut dire « aucune mission, donc aucune
  // facture », pas « ce client paie bien ».
  paymentBehaviour: null,
  // #2124.26 — même raison : aucune mission, donc aucun revenu à sommer.
  historicalInvoicedRevenueCents: null,
}

function draw(payload: AccountMissions) {
  mockFetch.mockResolvedValue(payload)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TabMissions account={ACCOUNT} />
    </QueryClientProvider>,
  )
}

const activeRow = (over: Partial<AccountMissions['active'][number]> = {}): AccountMissions['active'][number] => ({
  missionId: 'm-1',
  label: 'Fiabilisation plateforme',
  roleTitle: 'Ingénieur d’exploitation',
  startedOn: '2026-01-05',
  endsOn: '2026-12-31',
  status: 'active',
  consultants: [{ consultantId: 'c-1', fullName: 'Yanis Berthier' }],
  daysRemaining: 68,
  renewal: 'far',
  soldDailyRateCents: 62000,
  marginPercent: 30.6,
  nextAction: 'none',
  // #2124.19 — `null` par défaut : la plupart des fixtures de ce fichier ne
  // testent pas le chargé d'affaires, et un défaut inventé s'y lirait comme
  // un nom réel.
  businessManagerName: null,
  clientManagerName: null,
  ...over,
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Le compte SANS mission — et sa sortie                                      */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('un compte sans mission dit qu’il n’y a rien, et ouvre une porte', () => {
  it('n’écrit ni « 0 € », ni « 0 mission », ni « 0 jour »', async () => {
    const { container } = draw(EMPTY)
    await screen.findByText('Aucune mission sur ce compte')
    // La question de la doctrine : si cette valeur est absente, « 0 » est-il
    // VRAI ? Non — ce client n'a pas acheté pour zéro euro, il n'a rien acheté.
    expect(container.textContent).not.toMatch(/\b0\s?€/)
    expect(container.textContent).not.toMatch(/\b0\s(mission|jour)/)
    expect(container.textContent).not.toMatch(/\b0\s?%/)
  })

  it('porte une SORTIE — un état vide sans action est un cul-de-sac', async () => {
    draw(EMPTY)
    const door = await screen.findByRole('link', { name: 'Voir toutes les missions' })
    // Cible PROUVÉE par son fichier de route : `apps/web/src/routes/missions/index.tsx`.
    expect(door).toHaveAttribute('href', '/missions')
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  §4.4 — le bloc porte sa source et ne s'édite jamais sur place              */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('§4.4 — ce qui se lit ici se corrige dans les missions', () => {
  it('affiche le lien vers la source, nommé, et dit qu’on ne corrige pas ici', async () => {
    draw({ ...EMPTY, active: [activeRow()] })
    const link = await screen.findByRole('link', { name: 'Les missions de ce compte' })
    expect(link).toHaveAttribute('href', '/missions?accountId=acc-1')
    expect(screen.getByText(/se corrigent là-bas, jamais ici/)).toBeInTheDocument()
  })

  it('n’offre AUCUN champ de saisie ni bouton d’enregistrement — c’est l’absence de code', async () => {
    const { container } = draw({ ...EMPTY, active: [activeRow()] })
    await screen.findByText('Fiabilisation plateforme')
    expect(container.querySelectorAll('input')).toHaveLength(0)
    expect(container.querySelectorAll('textarea')).toHaveLength(0)
    expect(container.querySelectorAll('select')).toHaveLength(0)
    // #2560 — « Créer depuis un document » est une action de CRÉATION dans la
    // barre d'actions rapides (`QuickActions`, toujours au-dessus, hors du
    // bloc propagé testé ici), pas un bouton d'ENREGISTREMENT en place. La
    // garde reste stricte : un SEUL bouton, et c'est celui-là — un second
    // bouton qui apparaîtrait ici romprait ce test.
    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Créer depuis un document'])
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Bloc 1 — le droit financier, et la valeur non mesurée                      */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('bloc 1 — « pas ton périmètre » et « non mesurée » ne se disent pas pareil', () => {
  it('sans le droit : « Pas ton périmètre », et le TARIF reste affiché', async () => {
    const { container } = draw({
      ...EMPTY,
      canReadFinance: false,
      // Le serveur rend `null` dans les deux cas : seule la réponse dit lequel.
      active: [activeRow({ marginPercent: null })],
    })
    await screen.findByText('Pas ton périmètre')
    expect(screen.queryByText('Marge non mesurée')).not.toBeInTheDocument()
    // Le prix de VENTE sort quand même : deux fausses alertes ont déjà été
    // levées là-dessus (doctrine de `mission.ts`, 28/08/2026).
    expect(container.textContent).toMatch(/620/)
    expect(container.textContent).not.toMatch(/\b0\s?%/)
  })

  it('avec le droit mais sans coût chargé : « Marge non mesurée », jamais « 0 % »', async () => {
    const { container } = draw({ ...EMPTY, canReadFinance: true, active: [activeRow({ marginPercent: null })] })
    // #2124.24 — la colonne Risques (lot M1-9) reprend le MÊME mot pour le
    // MÊME fait : deux cellules légitimes de la même ligne, pas un doublon.
    await screen.findAllByText('Marge non mesurée')
    expect(screen.queryByText('Pas ton périmètre')).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\b0\s?%/)
  })

  it('une mission sans date de fin dit « Sans date de fin », jamais « 0 jour »', async () => {
    const { container } = draw({
      ...EMPTY,
      active: [activeRow({ endsOn: null, daysRemaining: null, renewal: 'unknown', nextAction: 'set_end_date' })],
    })
    await screen.findAllByText('Sans date de fin')
    expect(container.textContent).not.toMatch(/\b0\s(jour|day)/)
    // Et la prochaine action est la SEULE possible : aucune fenêtre ne se
    // déclenchera jamais sur cette mission.
    expect(screen.getByText('Poser une date de fin')).toBeInTheDocument()
  })

  it('une mission sans personne dessus le DIT — « Personne d’affecté »', async () => {
    draw({ ...EMPTY, active: [activeRow({ consultants: [] })] })
    await screen.findByText('Personne d’affecté')
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  #2836 (#2124.20) — le manager client, par ligne                            */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('#2836 — le résumé affiche le manager client', () => {
  it('un manager client désigné est nommé, à côté du chargé d’affaires', async () => {
    draw({
      ...EMPTY,
      active: [activeRow({ businessManagerName: 'Sophie Martin', clientManagerName: 'Hélène Marchal' })],
    })
    await screen.findByText('Sophie Martin')
    expect(screen.getByText(/Manager client/)).toBeInTheDocument()
    expect(screen.getByText(/Hélène Marchal/)).toBeInTheDocument()
  })

  it('non désigné : AUCUNE ligne — ni « Manager client », ni tiret inventé', async () => {
    draw({ ...EMPTY, active: [activeRow({ businessManagerName: 'Sophie Martin', clientManagerName: null })] })
    await screen.findByText('Sophie Martin')
    expect(screen.queryByText(/Manager client/)).toBeNull()
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  #2124.19 — le chargé d'affaires, par ligne                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('#2124.19 — chaque ligne active affiche son chargé d’affaires', () => {
  it('un porteur renseigné affiche son nom', async () => {
    draw({ ...EMPTY, active: [activeRow({ businessManagerName: 'Sophie Martin' })] })
    await screen.findByText('Sophie Martin')
  })

  it('aucun porteur renseigné dit « Non désigné », jamais une ligne vide', async () => {
    draw({ ...EMPTY, active: [activeRow({ businessManagerName: null })] })
    await screen.findByText('Fiabilisation plateforme')
    expect(screen.getByText('Non désigné')).toBeInTheDocument()
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Bloc 2 — motif de fin et retour collecté                                   */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('bloc 2 — le motif absent est nommé, jamais inventé', () => {
  it('rend « Motif de fin non renseigné » et « Retour non collecté »', async () => {
    draw({
      ...EMPTY,
      past: [
        {
          missionId: 'm-9',
          label: 'Migration du socle applicatif',
          roleTitle: 'Architecte de plateforme',
          startedOn: '2025-01-06',
          endsOn: '2026-06-13',
          status: 'ended',
          consultants: [{ consultantId: 'c-9', fullName: 'Camille Roussel' }],
          businessManagerName: null,
          clientManagerName: null,
          endReason: null,
          feedbackCollected: false,
        },
      ],
    })
    await screen.findByText('Motif de fin non renseigné')
    expect(screen.getByText('Retour non collecté')).toBeInTheDocument()
    // Le retour LUI-MÊME ne se lit pas ici : loi 4, rien deux fois sous la même
    // forme. On dit où il vit.
    expect(screen.getByText(/onglet Preuves & REX/)).toBeInTheDocument()
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Bloc 3 — qui, quand, combien de fois                                       */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('bloc 3 — « Marc a fait 3 missions ici »', () => {
  it('nomme la personne, le nombre et la date, pas seulement un compteur', async () => {
    draw({
      ...EMPTY,
      placedConsultants: [
        {
          consultantId: 'c-1',
          fullName: 'Marc Lefèvre',
          missions: 3,
          firstStartedOn: '2024-01-08',
          lastEndedOn: null,
          stillOnSite: true,
        },
      ],
    })
    await screen.findByText('Marc Lefèvre')
    expect(screen.getByText('3 missions ici')).toBeInTheDocument()
    expect(screen.getByText('Encore sur place')).toBeInTheDocument()
  })

  it('dit « Dernière fin non renseignée » plutôt que d’inventer une date', async () => {
    draw({
      ...EMPTY,
      placedConsultants: [
        {
          consultantId: 'c-2',
          fullName: 'Camille Roussel',
          missions: 1,
          firstStartedOn: null,
          lastEndedOn: null,
          stillOnSite: false,
        },
      ],
    })
    await screen.findByText('Dernière fin non renseignée')
    expect(screen.getByText('Première mission sans date de début')).toBeInTheDocument()
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Bloc 4 — ce que ce client achète                                           */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('bloc 4 — une moyenne absente le dit, une moyenne partielle aussi', () => {
  // #3711.17 (doctrine 20/09, tranché 17/10) — « Non mesuré » ne s'écrit que sous un score ou un axe ; ici ce
  // sont des chiffres de liste : une absence ne fait AUCUNE ligne.
  it('sans aucun tarif ni aucune durée : ni ligne « non mesuré », ni zéro', async () => {
    const { container } = draw({
      ...EMPTY,
      buying: {
        averageSoldDailyRateCents: null,
        missions: 2,
        missionsWithoutRate: 2,
        averageDurationDays: null,
        missionsWithoutDuration: 2,
        roleTitles: [],
        missionsWithoutRoleTitle: 2,
      },
    })
    await screen.findByText(/Aucun rôle renseigné/)
    expect(screen.queryByText('Tarif vendu moyen')).not.toBeInTheDocument()
    expect(screen.queryByText('Durée moyenne')).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/non mesur/i)
    expect(container.textContent).not.toMatch(/\b0\s?€/)
    expect(container.textContent).not.toMatch(/\b0\s(jour|mission)/)
  })

  it('annonce qu’une moyenne est PARTIELLE plutôt que de la présenter comme complète', async () => {
    draw({
      ...EMPTY,
      buying: {
        averageSoldDailyRateCents: 64000,
        missions: 4,
        missionsWithoutRate: 1,
        averageDurationDays: 150,
        missionsWithoutDuration: 1,
        roleTitles: [{ roleTitle: 'Data engineer', missions: 2 }],
        missionsWithoutRoleTitle: 1,
      },
    })
    await screen.findByText('Moyenne partielle — 1 mission sans tarif.')
    expect(screen.getByText('Moyenne partielle — 1 mission sans ses deux dates.')).toBeInTheDocument()
    expect(screen.getByText('sur 4 missions')).toBeInTheDocument()
    expect(screen.getByText('150 jours')).toBeInTheDocument()
    expect(screen.getByText('Data engineer · 2 missions')).toBeInTheDocument()
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  #2124.26 — le revenu historique, réservé à un rôle autorisé                */
/* ══════════════════════════════════════════════════════════════════════════ */

const BUYING = {
  averageSoldDailyRateCents: 64000,
  missions: 4,
  missionsWithoutRate: 0,
  averageDurationDays: 150,
  missionsWithoutDuration: 0,
  roleTitles: [],
  missionsWithoutRoleTitle: 0,
}

describe('#2124.26 — le revenu historique du bloc « ce que ce client achète »', () => {
  it('avec le droit et un montant : la somme est affichée', async () => {
    draw({ ...EMPTY, canReadFinance: true, buying: BUYING, historicalInvoicedRevenueCents: 1050000 })
    await screen.findByText(/10.500/)
  })

  it('avec le droit mais AUCUNE facture : aucune ligne « Revenu historique », jamais 0 €', async () => {
    const { container } = draw({
      ...EMPTY,
      canReadFinance: true,
      buying: BUYING,
      historicalInvoicedRevenueCents: null,
    })
    await screen.findByText('Ce que ce client achète')
    expect(screen.queryByText('Revenu historique')).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/non mesur/i)
    expect(container.textContent).not.toMatch(/\b0\s?€/)
  })

  it('sans le droit : « Pas ton périmètre », même si un montant existe côté serveur', async () => {
    const { container } = draw({
      ...EMPTY,
      canReadFinance: false,
      buying: BUYING,
      historicalInvoicedRevenueCents: null,
    })
    await screen.findByText(/Pas ton périmètre — le revenu historique/)
    expect(container.textContent).not.toMatch(/\b0\s?€/)
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Bloc 5 — ce qu'il ne renouvelle pas                                        */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('bloc 5 — deux vides qui ne disent pas la même chose', () => {
  it('sans aucune mission terminée : « il n’y a pas encore de non-renouvellement à lire »', async () => {
    draw({ ...EMPTY, active: [activeRow()] })
    await screen.findByText(/pas encore de non-renouvellement à lire/)
  })

  it('avec un historique entièrement repris : la bonne nouvelle est DITE', async () => {
    draw({
      ...EMPTY,
      past: [
        {
          missionId: 'm-9',
          label: 'Lot 1',
          roleTitle: 'Data engineer',
          startedOn: '2025-01-06',
          endsOn: '2026-01-06',
          status: 'ended',
          consultants: [],
          businessManagerName: null,
          clientManagerName: null,
          endReason: null,
          feedbackCollected: true,
        },
      ],
      notRenewed: [],
    })
    await screen.findByText('Chaque mission terminée a vu son profil repris depuis.')
  })

  it('liste la mission non reprise avec son motif, et distingue « on ne sait pas »', async () => {
    draw({
      ...EMPTY,
      notRenewed: [
        {
          missionId: 'm-9',
          label: 'Migration du socle applicatif',
          roleTitle: 'Architecte de plateforme',
          startedOn: '2025-01-06',
          endsOn: '2026-06-13',
          status: 'ended',
          consultants: [],
          businessManagerName: null,
          clientManagerName: null,
          endReason: 'Internalisation de l’équipe',
          sameRoleResumed: false,
        },
        {
          missionId: 'm-10',
          label: 'Lot 2',
          roleTitle: null,
          startedOn: '2025-01-06',
          endsOn: '2026-06-13',
          status: 'terminated',
          consultants: [],
          businessManagerName: null,
          clientManagerName: null,
          endReason: null,
          sameRoleResumed: null,
        },
      ],
    })
    await screen.findByText('Internalisation de l’équipe')
    expect(screen.getByText(/Ce profil n’a pas repris depuis/)).toBeInTheDocument()
    // `null` n'est pas `false` : indécidable ne se dit pas comme « pas repris ».
    expect(screen.getByText(/le rôle n’est pas renseigné sur cette mission/)).toBeInTheDocument()
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Bloc 0 — « ce client paie mal » : un jugement qui se mesure ou pas         */
/* ══════════════════════════════════════════════════════════════════════════ */

const MEASURABLE: AccountMissions['paymentBehaviour'] = {
  measurability: { measurable: true, observed: 6, required: 5, missing: 0 },
  invoiceCount: 6,
  lateCount: 0,
  disputedCount: 0,
  withoutDueDate: 0,
  windowMonths: 12,
}

describe('bloc 0 — un jugement sur un client se mesure ou ne s’affiche pas', () => {
  // ⚠️ Chaque cas porte une mission ACTIVE : le tableau se rend « vide » dès
  // qu'aucun des cinq blocs n'a de contenu (`nothing`, plus haut), et ce n'est
  // PAS le sujet ici. Sans elle, le tiroir « ce client paie » ne se monte
  // jamais et tous ces tests liraient l'état vide au lieu du bloc 0.
  const WITH_MISSION = { ...EMPTY, active: [activeRow()] }

  it('sans le droit finance : « pas ton périmètre », jamais un décompte', async () => {
    draw({ ...WITH_MISSION, canReadFinance: false, paymentBehaviour: null })
    await screen.findByText('Comment ce client paie')
    // Le TEXTE COMPLET du bloc 0, distinct de la « Pas ton périmètre » que
    // porte aussi la cellule marge — les deux blocs répondent à la même
    // absence, sans se recopier l'un l'autre.
    expect(
      screen.getByText('Pas ton périmètre — le comportement de paiement demande le droit finance.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/retard/)).not.toBeInTheDocument()
  })

  it('une lecture en échec — AVEC le droit — dit qu’elle a échoué, jamais « pas d’historique »', async () => {
    draw({ ...WITH_MISSION, canReadFinance: true, paymentBehaviour: null })
    await screen.findByText(/n’ont pas pu être lues/)
    expect(
      screen.queryByText('Pas ton périmètre — le comportement de paiement demande le droit finance.'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/Pas assez d’historique pour mesurer/)).not.toBeInTheDocument()
  })

  it('sous le seuil : « pas assez d’historique », et aucun décompte n’est écrit', async () => {
    draw({
      ...WITH_MISSION,
      paymentBehaviour: {
        measurability: { measurable: false, observed: 2, required: 5, missing: 3 },
        invoiceCount: 2,
        lateCount: null,
        disputedCount: null,
        withoutDueDate: 0,
        windowMonths: 12,
      },
    })
    await screen.findByText(/Pas assez d’historique pour mesurer/)
    // ⚠️ Surtout pas « 0 retard » : rien n'a été mesuré, ce n'est pas une
    // bonne nouvelle tirée d'un silence.
    expect(screen.queryByText(/retard/)).not.toBeInTheDocument()
  })

  it('au-dessus du seuil, sans retard : « 0 » est une MESURE, et la bonne nouvelle est dite', async () => {
    draw({ ...WITH_MISSION, paymentBehaviour: MEASURABLE })
    await screen.findByText('Aucun retard sur les 6 factures de la période.')
    expect(
      screen.getByText('Compté sur les 12 derniers mois, sur les factures émises à échéance connue.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Aucune facture contestée sur la période.')).toBeInTheDocument()
  })

  it('un retard constaté se dit avec son dénominateur — jamais un score ni un rang', async () => {
    draw({ ...WITH_MISSION, paymentBehaviour: { ...MEASURABLE, lateCount: 3, invoiceCount: 11 } })
    // Le décompte se dit en jours et en factures entières — jamais un
    // pourcentage, une probabilité ni un rang (doctrine c26_probabilite).
    expect(await screen.findByText('3 factures réglées en retard sur 11.')).toBeInTheDocument()
    expect(screen.queryByText(/\d+\s?% de retard/)).not.toBeInTheDocument()
  })

  it('le LITIGE se dit à part du retard — les deux ne se fondent pas', async () => {
    draw({ ...WITH_MISSION, paymentBehaviour: { ...MEASURABLE, lateCount: 1, disputedCount: 1, invoiceCount: 6 } })
    await screen.findByText('1 facture contestée sur 6 — un litige n’est pas un retard.')
  })

  it('les factures sans échéance connue sont COMPTÉES, jamais absorbées dans le silence', async () => {
    draw({ ...WITH_MISSION, paymentBehaviour: { ...MEASURABLE, withoutDueDate: 2 } })
    await screen.findByText('2 factures écartées faute d’échéance connue — elles n’entrent dans aucun décompte.')
  })
})

/**
 * #2560 — « Créer depuis un document » comble le trou documenté par
 * #2124.30/.31 juste au-dessus de `QuickActions` : la seule des trois actions
 * qui écrit `POST /delivery/missions` avec l'`accountId` de CETTE fiche,
 * jamais deviné depuis un document.
 */
describe('QuickActions — « Créer depuis un document »', () => {
  it('ouvre le dialogue de création depuis un document, avec le COMPTE de la fiche', async () => {
    draw(EMPTY)
    await screen.findByText('Aucune mission sur ce compte')

    await userEvent.click(screen.getByRole('button', { name: 'Créer depuis un document' }))

    expect(await screen.findByText('Créer une mission depuis un document')).toBeInTheDocument()
  })
})
