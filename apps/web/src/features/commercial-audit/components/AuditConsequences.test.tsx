import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { AuditConsequence } from '../lib/build-audit'
import { AuditConsequences } from './AuditConsequences'

const LOAD_CONSEQUENCE: AuditConsequence = {
  key: 'load',
  origin: 'cadenceRecommendation',
  rule: { kind: 'load', analysesPerWeek: 3, messagesPerDay: 5, followUpsPerWeek: 8 },
}

const ACCOUNTS_CONSEQUENCE: AuditConsequence = {
  key: 'accounts',
  origin: 'idealAccountProfile',
  rule: { kind: 'accounts', size: 'eti', entryStrategy: 'bottomUp', sectors: [] },
}

const KPI_TARGETS_CONSEQUENCE: AuditConsequence = {
  key: 'kpiTargets',
  origin: 'kpiTargets',
  rule: { kind: 'kpiTargets', accountsPerMonth: 8, rdvPerMonth: 4, partnersPerMonth: null },
}

// #2067.2 — la cible partenaires suit l'archétype : le MÊME repère de volume,
// une ligne de plus, et seulement quand le moteur a su la calculer.
const KPI_TARGETS_WITH_PARTNERS: AuditConsequence = {
  key: 'kpiTargets',
  origin: 'kpiTargets',
  rule: { kind: 'kpiTargets', accountsPerMonth: 8, rdvPerMonth: 4, partnersPerMonth: 5 },
}

describe('AuditConsequences', () => {
  // #2067.7 à #2067.12 — un repère de VOLUME (ici la cadence recommandée)
  // n'est jamais présenté comme un fait acquis : c'est une hypothèse, elle
  // suppose une capacité, aucune conversion n'est démontrée, et elle se
  // recalibre — jamais à la hausse quand le temps disponible baisse.
  it('accompagne le repère de cadence de son hypothèse, sa capacité requise et sa possibilité de recalibrage', async () => {
    renderWithRouter(<AuditConsequences consequences={[LOAD_CONSEQUENCE]} />)
    await screen.findByText(/3 analyses par semaine/)
    const disclaimer = await screen.findByText(/hypothèse/i)
    expect(disclaimer.textContent).toMatch(/capacité/i)
    expect(disclaimer.textContent).toMatch(/aucune conversion|rien ne prouve/i)
    expect(disclaimer.textContent).toMatch(/recalibr/i)
  })

  // La mise en garde ne s'attache qu'aux REPÈRES DE VOLUME (#2067.8 : « tout
  // repère de volume… ») — une règle sans nombre (ex. « comptes ») n'a rien à
  // recalibrer et ne porte pas cette phrase.
  it('ne colle pas la mise en garde de volume à une règle qui ne porte pas de nombre', async () => {
    renderWithRouter(<AuditConsequences consequences={[ACCOUNTS_CONSEQUENCE]} />)
    await screen.findByText(/ETI/)
    expect(screen.queryByText(/hypothèse/i)).toBeNull()
  })

  // #2067.1 / #2067.3 — le rythme mensuel visé (comptes actifs, rendez-vous)
  // est aussi un repère de VOLUME : même mise en garde que la cadence, et
  // AUCUN taux de conversion — le champ n'existe même pas sur le type.
  it('affiche le rythme mensuel visé avec la même mise en garde', async () => {
    renderWithRouter(<AuditConsequences consequences={[KPI_TARGETS_CONSEQUENCE]} />)
    await screen.findByText(/8 comptes actifs et 4 rendez-vous/)
    expect(await screen.findByText(/hypothèse/i)).toBeInTheDocument()
    expect(screen.queryByText(/%/)).toBeNull()
  })

  // #2067.2 — la cible partenaires suit l'archétype.
  it('affiche la cible partenaires quand le moteur a su la calculer', async () => {
    renderWithRouter(<AuditConsequences consequences={[KPI_TARGETS_WITH_PARTNERS]} />)
    await screen.findByText(/8 comptes actifs et 4 rendez-vous/)
    await screen.findByText(/5 partenaires/)
  })

  // #2067.2 — GA-18 / GA-19 : une ESN sans porte partenaire n'a PAS de cible
  // partenaires. L'écran n'écrit alors ni « 0 partenaire », ni la ligne vide —
  // les deux autres repères, eux, restent entiers.
  it("n'écrit jamais « 0 partenaire » quand la cible est absente", async () => {
    renderWithRouter(<AuditConsequences consequences={[KPI_TARGETS_CONSEQUENCE]} />)
    await screen.findByText(/8 comptes actifs et 4 rendez-vous/)
    expect(screen.queryByText(/partenaire/i)).toBeNull()
    expect(screen.queryByText(/\b0\b/)).toBeNull()
  })
})
