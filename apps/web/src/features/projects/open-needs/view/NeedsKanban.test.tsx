import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenNeedRow } from '@bellum/contracts'

/**
 * Le kanban des besoins (BEL-BSN-004).
 *
 * Ce qui se teste : le montant AFFICHÉ est celui qui est saisi, jamais une
 * projection ; un besoin sans TJM est compté à part et le total le dit ; et un
 * besoin dont l'état n'est pas ouvert ne se range pas de force dans une
 * colonne.
 *
 * ⚠️ `useFinanceAccess` est MOQUÉ ici — le cumul par colonne en dépend depuis
 * le 31/08/2026 (voir plus bas). Par défaut le droit est ACCORDÉ
 * (`canReadFinance: true`) pour que les tests ci-dessus, qui datent d'avant ce
 * droit et vérifient la FORME du montant, continuent de le voir sans devoir
 * chacun le déclarer.
 */
let financeAccess = { canReadFinance: true, canReadPipeAmounts: true, denied: false, failed: false }
vi.mock('@/features/propagation/api', () => ({ useFinanceAccess: () => financeAccess }))

/**
 * ⚠️ `CompanyAvatar` est MOQUÉ, et pas par confort.
 *
 * `EntityAvatar` s'appuie sur l'`Avatar` de Radix, qui ne monte son `<img>`
 * qu'APRÈS un chargement réussi (il précharge par un `new Image()`). Sous jsdom
 * aucune image ne charge jamais : le vrai composant rendrait donc l'initiale
 * dans les DEUX cas, et un test écrit sur le DOM rendu passerait au vert en
 * ayant perdu exactement ce qu'il vérifie.
 *
 * Ce qui compte ici est ce que la carte DEMANDE : le logo persisté, et jamais le
 * site — la seconde piste que `companyLogoSrc` sait suivre pour reconstruire un
 * favicon depuis un domaine.
 */
vi.mock('@/components/ui/CompanyAvatar', () => ({
  CompanyAvatar: (props: { name: string; logoUrl?: string | null; website?: string | null }) => (
    <span
      data-testid="company-avatar"
      data-logo={props.logoUrl ?? ''}
      data-website={props.website ?? ''}
      data-has-website={props.website === undefined ? 'absent' : 'passed'}
    >
      {(props.name?.[0] ?? '?').toUpperCase()}
    </span>
  ),
}))

const { NeedsKanban } = await import('./NeedsKanban')

beforeEach(() => {
  financeAccess = { canReadFinance: true, canReadPipeAmounts: true, denied: false, failed: false }
})
function need(over: Partial<OpenNeedRow> = {}): OpenNeedRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Architecte plateforme',
    urgency: null,
    skills: [],
    seniority: null,
    headcount: 1,
    target_tjm_cents: 65000,
    start_on: null,
    duration_months: 6,
    location: null,
    contract_kind: 'regie',
    deadline_at: null,
    status: 'to_qualify',
    status_reason: null,
    status_changed_at: '2026-08-15T10:00:00.000Z',
    source: null,
    provenance: null,
    owner_id: null,
    shortlist_count: 0,
    staffable: 'unknown',
    staffable_reason: null,
    project_id: '22222222-2222-4222-8222-222222222222',
    project_label: 'Plateforme',
    project_stage: 'qualified',
    account_id: null,
    account_name: 'ACME',
    entity_id: null,
    entity_name: null,
    ...over,
  } as unknown as OpenNeedRow
}

describe('NeedsKanban — le montant est celui qui est SAISI', () => {
  it('affiche le TJM par jour et le nombre de postes, jamais un total de mission', () => {
    // « TJM × postes × durée » produirait un chiffre qui n'existera jamais : il
    // varierait selon qu'on compte vingt ou vingt-et-un jours par mois, et
    // quelqu'un finirait par le mettre dans un prévisionnel.
    render(
      <NeedsKanban rows={[need({ headcount: 2, target_tjm_cents: 65000, duration_months: 6 })]} onOpen={() => {}} />,
    )
    expect(screen.getByText(/2 postes à/)).toBeInTheDocument()
    // 650 × 2 × 6 × 20 = 156 000 € : le chiffre qu'on refuse de produire.
    expect(screen.queryByText(/156\s?000/)).not.toBeInTheDocument()
  })

  it('cumule le JOURNALIER de la colonne', () => {
    render(
      <NeedsKanban
        rows={[
          need({ headcount: 2, target_tjm_cents: 65000 }),
          need({ id: 'x', headcount: 1, target_tjm_cents: 50000 }),
        ]}
        onOpen={() => {}}
      />,
    )
    // (650 × 2) + 500 = 1 800 € / jour
    expect(screen.getByText(/1\s?800\s?€ \/ jour/)).toBeInTheDocument()
  })

  it('compte À PART les besoins sans TJM, et dit que le total est un PLANCHER', () => {
    render(
      <NeedsKanban
        rows={[need({ target_tjm_cents: 65000 }), need({ id: 'x', target_tjm_cents: null })]}
        onOpen={() => {}}
      />,
    )
    expect(screen.getByText(/1 sans TJM — le total est un plancher/)).toBeInTheDocument()
    expect(screen.getByText('TJM non communiqué')).toBeInTheDocument()
  })

  it('ne range PAS de force un besoin clos dans une colonne ouverte', () => {
    // L'écran s'appelle « besoins ouverts » : l'y montrer serait un mensonge
    // d'affichage.
    render(<NeedsKanban rows={[need({ status: 'lost', title: 'Perdu' })]} onOpen={() => {}} />)
    expect(screen.queryByText('Perdu')).not.toBeInTheDocument()
  })

  it('chaque carte est un BOUTON — ce qui se clique se tabule (GA-35)', () => {
    render(<NeedsKanban rows={[need()]} onOpen={() => {}} />)
    expect(screen.getByRole('button', { name: /Architecte plateforme/ })).toBeInTheDocument()
  })

  // Théo C projects-besoins.R3 — trois colonnes (À qualifier · Ouvert · Couvert) ;
  // l'état précis voyage en étiquette sur la carte (correspondance 8→3, contrats).
  it('Théo C projects-besoins.R3 — trois colonnes seulement, l’état précis en étiquette', () => {
    render(
      <NeedsKanban
        rows={[
          need({ id: '1', title: 'En entretien', status: 'interview' }),
          need({ id: '2', title: 'En matching', status: 'matching' }),
          need({ id: '3', title: 'Pourvu', status: 'won' }),
          need({ id: '4', title: 'Détecté', status: 'detected' }),
        ]}
        onOpen={() => {}}
      />,
    )
    const columns = screen.getAllByTestId('need-column')
    expect(columns.map(column => column.getAttribute('data-status'))).toEqual(['to_qualify', 'open', 'covered'])
    const [toQualify, open, covered] = columns
    expect(within(toQualify).getByRole('button', { name: /Détecté/ })).toBeInTheDocument()
    expect(within(open).getByRole('button', { name: /En entretien/ })).toBeInTheDocument()
    expect(within(open).getByRole('button', { name: /En matching/ })).toBeInTheDocument()
    expect(within(covered).getByRole('button', { name: /Pourvu/ })).toBeInTheDocument()
    // L'étiquette dit l'état précis ; « Couvert » n'en a pas besoin.
    expect(within(open).getByText('Matching en cours')).toBeInTheDocument()
    expect(within(covered).queryByTestId('need-tag')).not.toBeInTheDocument()
  })

  it('Théo C projects-besoins — la source d’origine est un lien visible sur la carte, hors du bouton', () => {
    render(<NeedsKanban rows={[need({ source_url: 'https://www.lesechos.fr/offre-1' })]} onOpen={() => {}} />)
    const link = screen.getByRole('link', { name: 'Ouvrir la source : lesechos.fr' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.closest('button')).toBeNull()
  })

  it('SAIT DIRE NON : un besoin perdu ou annulé n’est dans aucune des trois colonnes', () => {
    render(
      <NeedsKanban
        rows={[
          need({ id: '1', title: 'Perdu', status: 'lost' }),
          need({ id: '2', title: 'Annulé', status: 'cancelled' }),
        ]}
        onOpen={() => {}}
      />,
    )
    expect(screen.queryByRole('button', { name: /Perdu|Annulé/ })).not.toBeInTheDocument()
  })
})

/**
 * LE MONTANT DU PIPE EST DÉSORMAIS SOUS DROIT FINANCIER (revirement du
 * 31/08/2026, Louis — doctrine `c53_montant_du_pipe`,
 * `packages/contracts/src/schemas/doctrine-registry.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE TEST A CHANGÉ DE SENS
 * ─────────────────────────────────────────────────────────────────────────────
 * Jusqu'au 30/08/2026, ce fichier tenait l'INVERSE et le disait en toutes
 * lettres : « une demande a proposé de gater ce cumul, le dépôt a déjà tranché
 * l'inverse ». Louis a rouvert cette décision le 31/08/2026, EN CONNAISSANCE de
 * cette raison, et a tranché l'autre sens pour le cumul AGRÉGÉ de CE kanban :
 * le pipe des BESOINS n'est pas scopé « mon portefeuille » — il mélange des
 * besoins de comptes que le lecteur ne suit pas forcément — ce qui le distingue
 * du pipe des PROJETS (`c53`, `ProjectsController.pipelineSummary`, INCHANGÉ)
 * et du TJM porté par CHAQUE carte (`c54_tarif_cible`, INCHANGÉ lui aussi — le
 * test plus haut, « affiche le TJM par jour… », le vérifie déjà et continue de
 * passer sans droit financier particulier).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PREUVE QUE CETTE GARDE SAIT DIRE NON, DANS LES DEUX SENS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le premier test ci-dessous RETIRE `canReadFinance` et affirme le cumul
 * ABSENT : un lecteur qui réintroduirait le cumul inconditionnellement (comme
 * avant le 31/08) le ferait rougir. Le second l'ACCORDE et affirme le cumul
 * PRÉSENT : un lecteur qui gaterait le composant entier (masquant aussi le
 * nombre de besoins ou le pied de carte) le ferait rougir aussi — seul le
 * MONTANT est concerné.
 */
describe('NeedsKanban — le cumul de colonne est DERRIÈRE le droit financier (c53, 31/08/2026)', () => {
  it('RETIRE le cumul — jamais à 0 — quand le droit financier manque', () => {
    financeAccess = { canReadFinance: false, canReadPipeAmounts: false, denied: true, failed: false }
    render(<NeedsKanban rows={[need({ headcount: 1, target_tjm_cents: 65000 })]} onOpen={() => {}} />)
    // Le montant a disparu…
    expect(screen.queryByText(/650\s?€ \/ jour/)).not.toBeInTheDocument()
    // …et rien ne l'a remplacé par un zéro : « 0 € / jour » se lirait comme un
    // pipe vide, ce qui serait faux ET rassurant à tort.
    expect(screen.queryByText(/0\s?€ \/ jour/)).not.toBeInTheDocument()
    // Ce qui n'est PAS un montant reste visible : le nombre de besoins de la
    // colonne, lu ici via le titre de la carte.
    expect(screen.getByText('Architecte plateforme')).toBeInTheDocument()
  })

  it('affiche le cumul quand le droit financier est accordé', () => {
    financeAccess = { canReadFinance: true, canReadPipeAmounts: true, denied: false, failed: false }
    render(<NeedsKanban rows={[need({ headcount: 1, target_tjm_cents: 65000 })]} onOpen={() => {}} />)
    expect(screen.getByText(/650\s?€ \/ jour/)).toBeInTheDocument()
  })

  // #4016.8e (décision Louis 11/10, c53 renversée) — le commercial (`finance:read:own`) voit le CA potentiel
  // des besoins. La marge d'équipe (`canReadFinance`) reste hors de ce droit : seul le cumul s'ouvre.
  it('#4016.8e — affiche le cumul au commercial qui n’a que `finance:read:own`', () => {
    financeAccess = { canReadFinance: false, canReadPipeAmounts: true, denied: false, failed: false }
    render(<NeedsKanban rows={[need({ headcount: 1, target_tjm_cents: 65000 })]} onOpen={() => {}} />)
    expect(screen.getByText(/650\s?€ \/ jour/)).toBeInTheDocument()
  })

  it('#4016.8e — SAIT DIRE NON : droit inconnu (lecture pas arrivée) ⇒ cumul retiré, jamais à 0', () => {
    financeAccess = { canReadFinance: false, canReadPipeAmounts: false, denied: false, failed: false }
    render(<NeedsKanban rows={[need({ headcount: 1, target_tjm_cents: 65000 })]} onOpen={() => {}} />)
    expect(screen.queryByText(/\/ jour/)).not.toBeInTheDocument()
  })

  it('le TJM PAR CARTE reste public même SANS droit financier (c54, inchangé)', () => {
    financeAccess = { canReadFinance: false, canReadPipeAmounts: false, denied: true, failed: false }
    render(
      <NeedsKanban rows={[need({ headcount: 2, target_tjm_cents: 65000, duration_months: 6 })]} onOpen={() => {}} />,
    )
    expect(screen.getByText(/2 postes à/)).toBeInTheDocument()
  })
})

/**
 * LE PIED DE LA CARTE — celui qui CHANGE selon la colonne (PDF-03:169-170).
 *
 * Le défaut fermé ici : les onze colonnes affichaient le même pied. Un pied
 * identique partout occupe la place de la seule information qui, dans cette
 * colonne-là, décide du geste suivant.
 */
describe('NeedsKanban — le pied change selon la colonne', () => {
  it('dit le TEMPS là où rien ne bouge, et le NOMBRE là où des profils circulent', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-27T10:00:00.000Z'))
    try {
      render(
        <NeedsKanban
          rows={[
            need({
              id: 'a',
              title: 'À qualifier',
              status: 'to_qualify',
              status_changed_at: '2026-08-15T10:00:00.000Z',
            }),
            need({ id: 'b', title: 'Proposé', status: 'submitted', shortlist_count: 2 }),
          ]}
          onOpen={() => {}}
        />,
      )
      expect(screen.getByText('À qualifier depuis 12 j')).toBeInTheDocument()
      expect(screen.getByText('2 présentations en cours')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('« aucun profil positionné » est une VRAIE réponse, pas un « non mesuré »', () => {
    render(<NeedsKanban rows={[need({ status: 'submitted', shortlist_count: 0 })]} onOpen={() => {}} />)
    expect(screen.getByText('Aucune présentation en cours')).toBeInTheDocument()
    expect(screen.queryByText(/non mesuré/i)).not.toBeInTheDocument()
  })

  it('un besoin qui n’a jamais changé d’état ne dit PAS « 0 j »', () => {
    render(<NeedsKanban rows={[need({ status: 'on_hold', status_changed_at: null })]} onOpen={() => {}} />)
    expect(screen.getByText('Aucun changement d’état enregistré')).toBeInTheDocument()
    expect(screen.queryByText(/0 j/)).not.toBeInTheDocument()
  })

  it('ne peint AUCUNE alerte : la « durée type » de la source n’existe nulle part', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-27T10:00:00.000Z'))
    try {
      const { container } = render(
        <NeedsKanban rows={[need({ status_changed_at: '2025-01-01T10:00:00.000Z' })]} onOpen={() => {}} />,
      )
      const card = container.querySelector('[data-testid="need-card"]')
      // La carte doit EXISTER : sans cette ligne, l'assertion suivante passerait
      // sur du vide le jour où le sélecteur change — une garde borgne.
      expect(card).not.toBeNull()
      expect(card?.innerHTML).toContain('603 j')
      expect(card?.innerHTML ?? '').not.toMatch(/danger|warning|--destructive|text-red/)
    } finally {
      vi.useRealTimers()
    }
  })
})

/**
 * L'ANATOMIE DE LA CARTE (PDF-03:157-167, relevé C19 — « 8 éléments »).
 *
 * Trois y étaient : intitulé, client, tarif. Trois de plus sont livrés ici,
 * parce que leur donnée arrive DÉJÀ sur la ligne : le lieu, le mode
 * d'engagement, les compétences — plus le pied ci-dessus.
 */
describe('NeedsKanban — l’anatomie de la carte', () => {
  it('porte le lieu ET le mode d’engagement', () => {
    render(<NeedsKanban rows={[need({ location: 'Lyon', contract_kind: 'regie' })]} onOpen={() => {}} />)
    expect(screen.getByText('Lyon · Régie')).toBeInTheDocument()
  })

  it('n’invente pas un lieu quand personne ne l’a dit — il affiche le mode seul', () => {
    render(<NeedsKanban rows={[need({ location: null, contract_kind: 'forfait' })]} onOpen={() => {}} />)
    expect(screen.getByText('Forfait')).toBeInTheDocument()
    expect(screen.queryByText(/·/)).not.toBeInTheDocument()
  })

  it('porte les compétences, bornées à trois, et COMPTE le reste', () => {
    render(
      <NeedsKanban
        rows={[
          need({
            skills: [
              { term: 'Kubernetes', required: true },
              { term: 'Terraform', required: true },
              { term: 'Go', required: false },
              { term: 'Kafka', required: false },
              { term: 'Rust', required: false },
            ],
          }),
        ]}
        onOpen={() => {}}
      />,
    )
    expect(screen.getByText('Kubernetes · Terraform · Go +2')).toBeInTheDocument()
  })
})

/**
 * LE LOGO DU COMPTE — corrigé le 31/08/2026.
 *
 * La carte retombait sur l'INITIALE pour tous les comptes. La raison écrite
 * alors — « la ligne ne porte aucune URL de logo » — décrivait bien le fait et
 * en tirait la mauvaise conclusion : personne ne l'avait demandée au serveur.
 *
 * Les deux tests tiennent les deux moitiés de la règle : le vrai logo quand il
 * existe, et JAMAIS une image reconstruite depuis un domaine.
 */
describe('NeedsKanban — le logo du compte', () => {
  it('demande le logo RÉEL quand le compte en porte un', () => {
    render(
      <NeedsKanban
        rows={[need({ account_name: 'ACME', account_logo_url: 'https://cdn.example/acme.png' })]}
        onOpen={() => {}}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByTestId('company-avatar').getAttribute('data-logo')).toBe('https://cdn.example/acme.png')
  })

  it('ne DEVINE aucune image depuis un domaine — sans logo, l’initiale', () => {
    // `CompanyAvatar` sait aussi partir du site du compte pour afficher le
    // favicon réellement servi. Trente cartes portant trente favicons
    // approximatifs se liraient comme trente identités visuelles vérifiées.
    render(
      <NeedsKanban
        rows={[need({ account_name: 'ACME', account_logo_url: null })]}
        onOpen={() => {}}
        onToggle={() => {}}
      />,
    )
    const avatar = screen.getByTestId('company-avatar')
    expect(avatar.getAttribute('data-logo')).toBe('')
    expect(avatar).toHaveTextContent('A')
  })

  it('ne passe JAMAIS le site du compte — la seconde piste n’est pas empruntée', () => {
    render(
      <NeedsKanban
        rows={[need({ account_name: 'ACME', account_logo_url: 'https://cdn.example/acme.png' })]}
        onOpen={() => {}}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByTestId('company-avatar').getAttribute('data-has-website')).toBe('absent')
  })
})

/**
 * LE RAIL « LAURA PEUT TRAITER CES BESOINS » — les quatre cartes de la maquette
 * et le taux de conversion (31/08/2026).
 *
 * Ce qui se teste : la troisième carte porte un geste qui EXISTE (« Préparer un
 * devis » n'en avait aucun derrière), la quatrième dit à l'écran pourquoi elle
 * n'est pas là, et le taux distingue « pas encore de quoi mesurer » de « 0 % ».
 */
describe('NeedsLauraRail', () => {
  it('propose « besoins sans porteur » — le geste qui remplace « préparer un devis »', async () => {
    const { NeedsLauraRail } = await import('./NeedsKanban')
    render(
      <NeedsLauraRail
        rows={[need({ id: 'a', owner_id: null }), need({ id: 'b', owner_id: 'u-1' })]}
        onSelect={() => {}}
        onOpenAllActions={() => {}}
      />,
    )
    expect(screen.getByText(/sans porteur/i)).toBeInTheDocument()
    // Un seul besoin n'est porté par personne : le compte est RÉEL, ce n'est pas
    // le nombre de lignes affichées.
    expect(screen.getByText(/1 besoin n’est porté par personne/)).toBeInTheDocument()
  })

  it('n’offre AUCUN geste « préparer un devis » — le produit n’a pas de devis à préparer', async () => {
    const { NeedsLauraRail } = await import('./NeedsKanban')
    render(<NeedsLauraRail rows={[need()]} onSelect={() => {}} onOpenAllActions={() => {}} />)
    expect(screen.queryByText(/devis/i)).toBeNull()
  })

  it('ÉCRIT pourquoi « fiches à mettre à jour » n’est pas répétée ici', async () => {
    // Un écart entre la maquette et le produit qui ne se lit nulle part se
    // relit comme un oubli, et le prochain lecteur le « corrige ».
    const { NeedsLauraRail } = await import('./NeedsKanban')
    render(<NeedsLauraRail rows={[need()]} onSelect={() => {}} onOpenAllActions={() => {}} />)
    expect(screen.getByText(/Sans compétence typée/)).toBeInTheDocument()
  })

  it('rend le taux de conversion quand des besoins ont été TRANCHÉS', async () => {
    const { NeedsLauraRail } = await import('./NeedsKanban')
    render(
      <NeedsLauraRail
        rows={[need()]}
        outcomes={{ won: 3, lost: 1, cancelled: 0 }}
        onSelect={() => {}}
        onOpenAllActions={() => {}}
      />,
    )
    expect(screen.getByText('75 %')).toBeInTheDocument()
    // Et il dit SUR COMBIEN il est calculé : un taux nu laisse croire à une
    // mesure complète.
    expect(screen.getByText(/3 gagnés sur 4 besoins tranchés/)).toBeInTheDocument()
  })

  it('n’écrit JAMAIS « 0 % » quand rien n’a été tranché', async () => {
    // Un espace neuf n'a pas « 0 % de conversion » : il n'a pas de conversion à
    // mesurer, et les deux phrases appellent des gestes opposés.
    const { NeedsLauraRail } = await import('./NeedsKanban')
    render(
      <NeedsLauraRail
        rows={[need()]}
        outcomes={{ won: 0, lost: 0, cancelled: 0 }}
        onSelect={() => {}}
        onOpenAllActions={() => {}}
      />,
    )
    expect(screen.getByText(/non mesuré/)).toBeInTheDocument()
    expect(screen.queryByText(/%$/)).toBeNull()
  })

  it('un vrai ZÉRO de conversion reste « 0 % » — l’inverse mentirait tout autant', async () => {
    const { NeedsLauraRail } = await import('./NeedsKanban')
    render(
      <NeedsLauraRail
        rows={[need()]}
        outcomes={{ won: 0, lost: 5, cancelled: 2 }}
        onSelect={() => {}}
        onOpenAllActions={() => {}}
      />,
    )
    expect(screen.getByText('0 %')).toBeInTheDocument()
    expect(screen.queryByText(/non mesuré/)).toBeNull()
  })

  it('sans issues servies (API antérieure), il dit « non mesuré » plutôt que de planter', async () => {
    const { NeedsLauraRail } = await import('./NeedsKanban')
    render(<NeedsLauraRail rows={[need()]} onSelect={() => {}} onOpenAllActions={() => {}} />)
    expect(screen.getByText(/non mesuré/)).toBeInTheDocument()
  })
})

// #5025 — la colonne « À qualifier » dit ce qu'elle contient et passe la plus ancienne non regardée en premier.
describe('NeedsKanban — colonne « À qualifier » (#5025)', () => {
  const rows = [
    need({ id: '1', title: 'Récent', status: 'to_qualify', status_changed_at: '2026-10-25T10:00:00.000Z' }),
    need({ id: '2', title: 'Sans date', status: 'to_qualify', status_changed_at: null }),
    need({ id: '3', title: 'Ancien', status: 'to_qualify', status_changed_at: '2026-08-01T10:00:00.000Z' }),
    need({ id: '4', title: 'Ouvert', status: 'matching', status_changed_at: '2026-01-01T10:00:00.000Z' }),
  ]
  it('porte un sous-titre qui dit ce que sont ces cartes — et lui seul', () => {
    render(<NeedsKanban rows={rows} onOpen={() => {}} />)
    const [toQualify, open] = screen.getAllByTestId('need-column')
    expect(within(toQualify).getByTestId('need-column-hint')).toHaveTextContent(
      'Besoins remontés par Bellum, pas encore regardés',
    )
    expect(within(open).queryByTestId('need-column-hint')).toBeNull()
  })
  it('la plus ancienne d’abord, la date inconnue en dernier, aucune carte retirée', () => {
    render(<NeedsKanban rows={rows} onOpen={() => {}} />)
    const [toQualify] = screen.getAllByTestId('need-column')
    const titles = within(toQualify)
      .getAllByTestId('need-card')
      .map(card => card.textContent ?? '')
    expect(titles).toHaveLength(3)
    expect(titles[0]).toContain('Ancien')
    expect(titles[1]).toContain('Récent')
    expect(titles[2]).toContain('Sans date')
  })
})
