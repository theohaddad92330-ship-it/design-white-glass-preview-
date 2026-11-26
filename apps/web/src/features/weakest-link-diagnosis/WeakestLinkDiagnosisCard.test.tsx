import { deriveWeakestLinkDiagnosis } from '@bellum/contracts'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { WeakestLinkDiagnosisCard } from './WeakestLinkDiagnosisCard'

describe('WeakestLinkDiagnosisCard', () => {
  it('affiche un état de chargement explicite — jamais un silence sur cette carte', async () => {
    renderWithRouter(<WeakestLinkDiagnosisCard diagnosis={undefined} isLoading isError={false} />)
    expect(await screen.findByText('Calcul du maillon faible en cours…')).toBeInTheDocument()
  })

  it('affiche un échec explicite plutôt qu’un silence', async () => {
    renderWithRouter(<WeakestLinkDiagnosisCard diagnosis={null} isLoading={false} isError />)
    expect(
      await screen.findByText('Le diagnostic du maillon faible n’a pas pu être calculé pour le moment.'),
    ).toBeInTheDocument()
  })

  it('dit honnêtement qu’il n’y a pas encore assez de signal — jamais un maillon inventé', async () => {
    const diagnosis = deriveWeakestLinkDiagnosis({
      accounts: [],
      pipeline: null,
      bench: null,
      commercialCapacity: null,
    })
    renderWithRouter(<WeakestLinkDiagnosisCard diagnosis={diagnosis} isLoading={false} isError={false} />)
    expect(
      await screen.findByText('Pas encore assez de signal pour désigner un maillon faible principal.'),
    ).toBeInTheDocument()
  })

  it('affiche le maillon principal, sa preuve, l’expérience recommandée et ce qu’on arrête (l’exemple du ticket)', async () => {
    const diagnosis = deriveWeakestLinkDiagnosis({
      accounts: [
        ...Array.from({ length: 7 }, (_, i) => ({
          account_id: `acc-${i}`,
          name: `Compte ${i}`,
          is_open: true,
          has_next_action: false,
          has_identified_sponsor: false,
        })),
        { account_id: 'acc-7', name: 'Compte 7', is_open: true, has_next_action: true, has_identified_sponsor: true },
        { account_id: 'acc-8', name: 'Compte 8', is_open: true, has_next_action: true, has_identified_sponsor: true },
      ],
      pipeline: null,
      bench: null,
      commercialCapacity: null,
    })

    renderWithRouter(<WeakestLinkDiagnosisCard diagnosis={diagnosis} isLoading={false} isError={false} />)

    expect(await screen.findByText('Le maillon faible')).toBeInTheDocument()
    expect(screen.getByText('Absence de suivi ou de prochaine action')).toBeInTheDocument()
    expect(screen.getByText(/7 compte\(s\) ouvert\(s\) sur 9/)).toBeInTheDocument()
    expect(screen.getByText('Ce qu’on te propose d’essayer')).toBeInTheDocument()
    expect(screen.getByText('Ce qu’on arrête, en attendant')).toBeInTheDocument()
    // #3253.b — deux comptes de l'exemple ont bien un suivi : la confrontation le nomme.
    expect(screen.getByText('Ce qui nuance')).toBeInTheDocument()
    expect(screen.getByText(/2 compte\(s\) ouvert\(s\) sur 9 ont bien/)).toBeInTheDocument()
  })

  it('ne montre AUCUNE section « ce qui nuance » quand la confrontation ne trouve rien à opposer', async () => {
    const diagnosis = deriveWeakestLinkDiagnosis({
      accounts: [
        { account_id: 'acc-1', name: 'Compte 1', is_open: true, has_next_action: false, has_identified_sponsor: false },
      ],
      pipeline: null,
      bench: null,
      commercialCapacity: null,
    })

    renderWithRouter(<WeakestLinkDiagnosisCard diagnosis={diagnosis} isLoading={false} isError={false} />)

    expect(await screen.findByText('Le maillon faible')).toBeInTheDocument()
    expect(screen.queryByText('Ce qui nuance')).not.toBeInTheDocument()
  })

  // #3294 — recette prod 02/10 : « la famille marge n'est pas observable ». Le
  // diagnostic CALCULAIT les autres maillons et les familles non évaluables, mais
  // la carte ne rendait que le principal : une famille sans mesure (onze missions,
  // aucune chiffrée) était invisible, donc indiscernable d'une famille « non câblée ».
  describe('les autres maillons et les familles non évaluables se nomment', () => {
    const openAccounts = Array.from({ length: 4 }, (_, i) => ({
      account_id: `acc-${i}`,
      name: `Compte ${i}`,
      is_open: true,
      has_next_action: false,
      has_identified_sponsor: false,
    }))

    it('nomme un maillon secondaire (la marge) sous le principal', async () => {
      const diagnosis = deriveWeakestLinkDiagnosis({
        accounts: openAccounts,
        pipeline: null,
        bench: null,
        commercialCapacity: null,
        margin: { measured_count: 3, below_floor_count: 2, unmeasured_count: 0, floor_percent: 25 },
      })
      renderWithRouter(<WeakestLinkDiagnosisCard diagnosis={diagnosis} isLoading={false} isError={false} />)
      expect(await screen.findByText('Les autres maillons à surveiller')).toBeInTheDocument()
      expect(screen.getByText('Marge trop faible')).toBeInTheDocument()
    })

    it('#3294 — le tiret ne commence JAMAIS une ligne : le maillon et son impact tiennent dans UN seul bloc de texte', async () => {
      const diagnosis = deriveWeakestLinkDiagnosis({
        accounts: openAccounts,
        pipeline: null,
        bench: null,
        commercialCapacity: null,
        margin: { measured_count: 3, below_floor_count: 2, unmeasured_count: 0, floor_percent: 25 },
      })
      renderWithRouter(<WeakestLinkDiagnosisCard diagnosis={diagnosis} isLoading={false} isError={false} />)
      const item = (await screen.findByText('Marge trop faible')).closest('li')
      expect(item).not.toBeNull()
      const blocks = Array.from(item!.children)
      expect(blocks).toHaveLength(1)
      expect(blocks[0]?.textContent).toMatch(/^Marge trop faible — .+/)
      for (const el of Array.from(item!.querySelectorAll('*'))) {
        expect(el.firstChild?.textContent?.trimStart().startsWith('—') ?? false).toBe(false)
      }
    })

    it('dit POURQUOI la marge n’est pas évaluée (missions non chiffrées), jamais un silence ni un zéro', async () => {
      const diagnosis = deriveWeakestLinkDiagnosis({
        accounts: openAccounts,
        pipeline: null,
        bench: null,
        commercialCapacity: null,
        margin: { measured_count: 0, below_floor_count: 0, unmeasured_count: 11, floor_percent: 25 },
      })
      renderWithRouter(<WeakestLinkDiagnosisCard diagnosis={diagnosis} isLoading={false} isError={false} />)
      const heading = await screen.findByText('Maillons non évalués')
      // #3737 (recette démo 06/10) — un maillon NON ÉVALUÉ porte son NOM neutre, jamais un titre de
      // verdict (« Marge trop faible ») que la donnée ne permet pas d'affirmer.
      const section = heading.parentElement as HTMLElement
      expect(section.textContent).not.toMatch(/trop faible/)
      expect(section.textContent).toMatch(/Marge — 11 mission/)
      expect(screen.getByText(/11 mission\(s\) active\(s\), aucune avec tarif et coût renseignés/)).toBeInTheDocument()
    })

    it('une réponse sans ces champs (API d’avant) ne casse pas la carte', async () => {
      const full = deriveWeakestLinkDiagnosis({
        accounts: openAccounts,
        pipeline: null,
        bench: null,
        commercialCapacity: null,
      })
      const partial = { ...full, secondary_bottlenecks: undefined, not_evaluable_families: undefined }
      renderWithRouter(
        <WeakestLinkDiagnosisCard diagnosis={partial as unknown as typeof full} isLoading={false} isError={false} />,
      )
      expect(await screen.findByText('Le maillon faible')).toBeInTheDocument()
    })

    it('aucun bloc secondaire quand il n’y a aucun autre maillon', async () => {
      const diagnosis = deriveWeakestLinkDiagnosis({
        accounts: openAccounts,
        pipeline: null,
        bench: null,
        commercialCapacity: null,
      })
      renderWithRouter(<WeakestLinkDiagnosisCard diagnosis={diagnosis} isLoading={false} isError={false} />)
      await screen.findByText('Le maillon faible')
      expect(screen.queryByText('Les autres maillons à surveiller')).toBeNull()
    })
  })
})
