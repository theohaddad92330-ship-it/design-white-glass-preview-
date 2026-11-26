/**
 * #2118 — ce que la lecture du dossier montre, et ce qu'elle REFUSE de montrer.
 *
 * Les deux assertions qui portent la doctrine, et qui savent dire NON :
 *  - un axe « inconnu » qui porte une note n'est JAMAIS rendu comme mesuré ;
 *  - sous deux axes notés (#4016.L9.a, Louis 13/10 — c'était trois), il n'y a
 *    pas de chiffre à l'écran ; au-dessus, le score dit son nombre d'axes.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const { DossierWorthCard, DossierScopeCard, DossierEntryPointCard, DossierAccessPathCard, MainRiskCard } =
  await import('./DossierReadBlocks')
const { readDossierRead } = await import('../evaluation/dossierReadViewData')

const CINQ_AXES_NOTES = [
  { key: 'adequation_offre', state: 'measured', value: 4, impact: 'Ton domaine.', lever: 'Une référence citable.' },
  { key: 'potentiel_commercial', state: 'measured', value: 4 },
  { key: 'fraicheur', state: 'partial', value: 3 },
  { key: 'accessibilite', state: 'measured', value: 2 },
  { key: 'concurrence', state: 'measured', value: 2 },
  { key: 'capacite_achat_externe', state: 'unknown', impact: 'Processus d’achat non établi.' },
  { key: 'qualite_preuves', state: 'unknown' },
]

function lire(raw: unknown) {
  const view = readDossierRead(raw)
  if (!view) throw new Error('la lecture devrait exister')
  return view
}

describe('DossierWorthCard — « ce compte mérite-t-il ton temps ? »', () => {
  it('nomme les SEPT axes, même ceux qui n’ont pas pu être évalués (#2118.30-.36)', () => {
    render(<DossierWorthCard read={lire({ axes: CINQ_AXES_NOTES })} />)

    for (const nom of [
      'Adéquation de l’offre',
      'Potentiel commercial',
      'Fraîcheur actuelle',
      'Accessibilité',
      'Capacité d’achat externe',
      'Concurrence',
      'Qualité des preuves',
    ]) {
      expect(screen.getByText(nom)).toBeInTheDocument()
    }
  })

  it('chaque axe dit son ÉTAT, son impact et son levier (#2118.37/.39/.40)', () => {
    render(<DossierWorthCard read={lire({ axes: CINQ_AXES_NOTES })} />)

    expect(screen.getAllByText('Mesuré').length).toBe(4)
    expect(screen.getAllByText('Partiel').length).toBe(1)
    expect(screen.getAllByText('Inconnu').length).toBe(2)
    expect(screen.getByText(/Impact sur le verdict : Ton domaine\./)).toBeInTheDocument()
    expect(screen.getByText(/Levier : Une référence citable\./)).toBeInTheDocument()
  })

  it('⚠️ cinq axes notés se lisent 15/25 — jamais 15/35 (#2118.52)', () => {
    render(<DossierWorthCard read={lire({ axes: CINQ_AXES_NOTES })} />)

    expect(screen.getByText(/15\/25/)).toBeInTheDocument()
    expect(screen.queryByText(/15\/35/)).not.toBeInTheDocument()
    // Et les deux axes hors calcul sont NOMMÉS, pas comptés.
    expect(screen.getByText(/hors du calcul/)).toHaveTextContent('Capacité d’achat externe')
  })

  it('⚠️ SAIT DIRE NON — un axe « inconnu » portant une note n’est pas rendu comme mesuré', () => {
    const read = lire({
      axes: [
        ...CINQ_AXES_NOTES.slice(0, 3),
        // La ligne fautive : « on ne sait pas », et pourtant un 5.
        { key: 'accessibilite', state: 'unknown', value: 5 },
      ],
    })

    render(<DossierWorthCard read={read} />)

    expect(screen.queryByText('5/5')).not.toBeInTheDocument()
    expect(screen.getByText(/11\/15/)).toBeInTheDocument()
  })

  // ⚠️ #4016.L9.a revient sur le seuil de trois axes (c26, GA-58), délibérément —
  // Louis 13/10/2026 : un score de compte s'affiche dès DEUX axes évaluables,
  // toujours avec son nombre d'axes.
  it('⚠️ sous DEUX axes notés, AUCUN chiffre — le texte dit combien il en manque', () => {
    render(<DossierWorthCard read={lire({ axes: CINQ_AXES_NOTES.slice(0, 1) })} />)

    // 4 sur un seul axe : aucun total (ni « 4/35 »)… mais l'axe CONNU reste
    // visible, avec sa propre note sur 5.
    expect(screen.queryByText(/4\/35/)).not.toBeInTheDocument()
    expect(screen.getAllByText('4/5')).toHaveLength(1)
    expect(screen.getByTitle(/1 axe\(s\) noté\(s\) sur 7, il en faut au moins 2/)).toBeInTheDocument()
    expect(screen.queryByTestId('dossier-score-axes-count')).not.toBeInTheDocument()
  })

  it('#4016.L9.a — deux axes notés font un score, qui DIT sur combien d’axes il repose', () => {
    render(<DossierWorthCard read={lire({ axes: CINQ_AXES_NOTES.slice(0, 2) })} />)

    expect(screen.getByText(/8\/10/)).toBeInTheDocument()
    expect(screen.getByTestId('dossier-score-axes-count')).toHaveTextContent('2 axes sur 7 évalués')
    // …et les cinq autres restent NOMMÉS, hors du calcul.
    expect(screen.getByText(/hors du calcul/)).toHaveTextContent('Qualité des preuves')
  })

  // R12 (Thales, 15/10) — la Vue d'ensemble affichait 22/30 et l'onglet Score 15/25 : deux scores
  // DIFFÉRENTS (lecture en 7 axes vs grille à 5 critères) sans nom pour les distinguer. Chacun se nomme.
  it('échelle du score — la note de la Vue d’ensemble porte son NOM : la lecture du dossier en 7 axes', () => {
    render(<DossierWorthCard read={lire({ axes: CINQ_AXES_NOTES })} />)

    expect(screen.getByTestId('dossier-score-name')).toHaveTextContent('Lecture du dossier')
    expect(screen.getByTestId('dossier-score-name')).toHaveTextContent('7 axes')
  })

  it('#4016.L9.a — un score complet dit aussi son nombre d’axes', () => {
    render(<DossierWorthCard read={lire({ axes: CINQ_AXES_NOTES })} />)

    expect(screen.getByTestId('dossier-score-axes-count')).toHaveTextContent('5 axes sur 7 évalués')
  })

  it('#2306.12/.13/.30 — accès ou achat externe inconnu : le score PLAFONNE, avec sa vérification', () => {
    render(<DossierWorthCard read={lire({ axes: CINQ_AXES_NOTES })} />)

    expect(screen.getByText('Ce score ne dit rien de l’accès ou de l’achat externe')).toBeInTheDocument()
    expect(screen.getByText('Vérifier si ce compte achète de la prestation externe')).toBeInTheDocument()
    // `accessibilite` est MESURÉ dans cette fixture : sa vérification ne s'affiche pas.
    expect(screen.queryByText('Vérifier si un décideur est joignable')).not.toBeInTheDocument()
  })

  it('aucun axe de cap inconnu → aucune notice de plafond (#2306.30)', () => {
    render(
      <DossierWorthCard
        read={lire({
          axes: [
            ...CINQ_AXES_NOTES.slice(0, 5),
            { key: 'capacite_achat_externe', state: 'measured', value: 3 },
            { key: 'qualite_preuves', state: 'measured', value: 3 },
          ],
        })}
      />,
    )

    expect(screen.queryByText('Ce score ne dit rien de l’accès ou de l’achat externe')).not.toBeInTheDocument()
  })

  it('affiche les blocs rédigés, texte du modèle inclus (#2118.4/.22/.25/.26/.28)', () => {
    render(
      <DossierWorthCard
        read={lire({
          axes: CINQ_AXES_NOTES,
          why_for_your_esn: 'La conformité est l’un de tes trois domaines.',
          obstacles: [{ label: 'Aucune référence bancaire', why: 'Elle est demandée avant la réunion.' }],
          anti_advice: {
            what: 'N’envoie pas de dossier de référencement au groupe.',
            why: 'Le circuit exige des références que tu n’as pas.',
          },
          missing: [{ label: 'Le circuit fournisseur', why: 'Il n’est pas publié : il se demande.' }],
        })}
      />,
    )

    expect(screen.getByText('Pourquoi pour ton ESN')).toBeInTheDocument()
    expect(screen.getByText('La conformité est l’un de tes trois domaines.')).toBeInTheDocument()
    expect(screen.getByText('Freins')).toBeInTheDocument()
    expect(screen.getByText('Aucune référence bancaire')).toBeInTheDocument()
    // L'anti-conseil nomme l'approche ET sa raison — sans la raison, c'est un ordre.
    expect(screen.getByText('Anti-conseil')).toBeInTheDocument()
    expect(screen.getByText('N’envoie pas de dossier de référencement au groupe.')).toBeInTheDocument()
    expect(screen.getByText('Le circuit exige des références que tu n’as pas.')).toBeInTheDocument()
    // #2164.32 — section nommée littéralement « Ce qui reste inconnu ».
    expect(screen.getByText('Ce qui reste inconnu')).toBeInTheDocument()
    expect(screen.getByText('Le circuit fournisseur')).toBeInTheDocument()
  })

  it('la fiabilité est DITE en qualité / couverture / fraîcheur, et une dimension inconnue n’a pas de chiffre (#2118.44)', () => {
    render(
      <DossierWorthCard
        read={lire({
          axes: CINQ_AXES_NOTES,
          reliability: {
            quality: { state: 'partial', value: 61, note: 'Sources publiques solides.' },
            coverage: { state: 'measured', value: 40 },
            freshness: { state: 'unknown', note: 'Aucun fait daté.' },
          },
        })}
      />,
    )

    expect(screen.getByText(/Qualité des informations, couverture/)).toBeInTheDocument()
    expect(screen.getByText(/61\/100/)).toBeInTheDocument()
    // La fraîcheur est inconnue : elle ne s'écrit pas « 0/100 ».
    expect(screen.queryByText('0/100')).not.toBeInTheDocument()
    expect(screen.getByTitle('Aucun fait daté.')).toBeInTheDocument()
  })

  it('un no-go se lit TEMPORAIRE, avec son contexte et son déclencheur (#2118.45/.46/.47)', () => {
    render(
      <DossierWorthCard
        read={lire({
          axes: CINQ_AXES_NOTES,
          no_go: { temporary: true, context: 'Marché notifié en mars.', trigger: 'Sa fin en 2028.' },
        })}
      />,
    )

    expect(screen.getByText(/Ce verdict est temporaire/)).toBeInTheDocument()
    expect(screen.getByText(/Ce qui bloque aujourd’hui : Marché notifié en mars\./)).toBeInTheDocument()
    expect(screen.getByText(/Ce qui le ferait changer : Sa fin en 2028\./)).toBeInTheDocument()
  })

  it('un profil ESN incomplet dit que c’est le FIT qui est limité, pas l’analyse — et donne le lien (#2118.20)', () => {
    // #2592 — le moteur envoie les noms de champs bruts de PROFILE_FIT_FIELDS
    // (apps/ia/app/services/dossier_read.py), jamais des libellés déjà
    // rédigés : un test qui se donnait de jolis libellés français ne prouvait
    // rien du contrat réel, et a manqué le bug qu'il aurait dû attraper.
    render(
      <DossierWorthCard
        read={lire({
          axes: CINQ_AXES_NOTES,
          profile_incomplete: true,
          profile_incomplete_fields: ['sectors', 'references'],
        })}
      />,
    )

    expect(
      screen.getByText(
        'Mon analyse du compte est fiable, mais le fit avec ton ESN dépend de ton profil : Secteurs cibles, Références clients.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/sectors/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\breferences\b/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Compléter mon profil' })).toHaveAttribute('href', '/settings/profile')
  })

  it('un champ de profil absent du mappage tombe sur un libellé neutre, jamais son identifiant brut (#2592)', () => {
    render(
      <DossierWorthCard
        read={lire({
          axes: CINQ_AXES_NOTES,
          profile_incomplete: true,
          profile_incomplete_fields: ['un_champ_futur_inconnu'],
        })}
      />,
    )

    expect(
      screen.getByText(
        'Mon analyse du compte est fiable, mais le fit avec ton ESN dépend de ton profil : un champ de ton profil.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/un_champ_futur_inconnu/)).not.toBeInTheDocument()
  })
})

describe('Les blocs de la séquence de lecture', () => {
  it('le périmètre recommandé s’affiche, et se TAIT quand il est absent (#2118.23)', () => {
    const { rerender } = render(<DossierScopeCard scope="Une entité, jamais le groupe." />)
    expect(screen.getByText('Quel périmètre viser ?')).toBeInTheDocument()
    expect(screen.getByText('Une entité, jamais le groupe.')).toBeInTheDocument()

    rerender(<DossierScopeCard scope={null} />)
    expect(screen.queryByText('Quel périmètre viser ?')).not.toBeInTheDocument()
  })

  it('la porte d’entrée nomme le profil visé et la raison (#2118.24)', () => {
    render(
      <DossierEntryPointCard
        entryPoint={{
          label: 'Le responsable du programme',
          targetProfile: 'N-1, porteur du budget',
          why: 'Il a publié le besoin.',
        }}
      />,
    )

    expect(screen.getByText('Par quelle voie entrer ?')).toBeInTheDocument()
    expect(screen.getByText('Le responsable du programme')).toBeInTheDocument()
    expect(screen.getByText('Profil visé : N-1, porteur du budget')).toBeInTheDocument()
  })

  // #2304.7 (épopée #2932) — Q6, distincte de la porte d'entrée (QUI) : PAR
  // OÙ entrer commercialement (un programme déjà lancé, un appel d'offres…).
  it('la voie d’achat ou d’accès s’affiche, et se TAIT quand elle est absente (#2304.7)', () => {
    const { rerender } = render(
      <DossierAccessPathCard accessPath="Le programme Cloud Souverain est déjà en cours de sourcing." />,
    )
    expect(screen.getByText("Quelle voie d'achat ou d'accès ?")).toBeInTheDocument()
    expect(screen.getByText('Le programme Cloud Souverain est déjà en cours de sourcing.')).toBeInTheDocument()

    rerender(<DossierAccessPathCard accessPath={null} />)
    expect(screen.queryByText("Quelle voie d'achat ou d'accès ?")).not.toBeInTheDocument()
  })

  // #2304.8 (épopée #2932) — Q7, dérivé (mainRisk), jamais un second appel modèle.
  it('le risque principal s’affiche avec sa mitigation, et se TAIT sans risque lisible (#2304.8)', () => {
    const { rerender } = render(
      <MainRiskCard risk={{ risk: 'Panel fournisseur fermé', mitigation: 'Passer par une filiale autonome.' }} />,
    )
    expect(screen.getByText('Quel est le principal risque ?')).toBeInTheDocument()
    expect(screen.getByText('Panel fournisseur fermé')).toBeInTheDocument()
    expect(screen.getByText('Passer par une filiale autonome.')).toBeInTheDocument()

    rerender(<MainRiskCard risk={null} />)
    expect(screen.queryByText('Quel est le principal risque ?')).not.toBeInTheDocument()

    rerender(<MainRiskCard risk={{ risk: null }} />)
    expect(screen.queryByText('Quel est le principal risque ?')).not.toBeInTheDocument()
  })
})
