import type { QueryRunner } from 'typeorm'
import {
  OUTREACH_PLAYBOOKS,
  OUTREACH_PLAYBOOK_KEYS,
  playbookSequenceName,
  playbookTemplateKey,
  outreachSequenceStatusSchema,
  outreachStepStatusSchema,
} from '@bellum/contracts'
import { OutreachMultichannelSteps1796489437261 } from '../../migrations/1796489437261-OutreachMultichannelSteps'
import { DEMO_PLAYBOOKS_COVERAGE } from './demo-coverage'
import { DEMO_CONSULTANTS, DEMO_DOSSIERS } from './demo-dataset'
import { DEMO_PLAYBOOK_SEQUENCES } from './demo-playbook-sequences'
import { DEMO_OUTREACH_PLAN } from './demo-seed.service'

/**
 * Lot L-C (#4166, craft rule n°9) — LES MODÈLES SONT REMPLIS EN DÉMONSTRATION.
 *
 * La bibliothèque « Partir d'un modèle » est statique (rien à semer) ; ce qui se
 * sème, c'est le RÉSULTAT d'un modèle : au moins une séquence créée depuis un
 * modèle, que le prospect voit dans la liste et dans le détail, avec les étapes
 * du modèle. Chaque valeur semée est confrontée au CHECK de la MIGRATION, pas à
 * une liste recopiée (le CHECK invisible aux specs mockées a cassé la démo le 11/10).
 */

const flat = async (): Promise<string> => {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  await new OutreachMultichannelSteps1796489437261().up(runner)
  return queries.map(sql => sql.replace(/\s+/g, ' ')).join(' ')
}

function checkValues(sql: string, constraint: string): string[] {
  const match = new RegExp(`CONSTRAINT ${constraint}\\s+CHECK \\(\\s*\\w+ IN \\(([^)]*)\\)`).exec(sql)
  if (!match) throw new Error(`contrainte ${constraint} introuvable dans la migration`)
  return [...(match[1] ?? '').matchAll(/'([^']+)'/g)].map(found => found[1] as string)
}

const names = new Set(DEMO_DOSSIERS.flatMap(dossier => dossier.contacts).map(contact => contact.full_name))

describe('séquences de démo créées depuis un modèle (lot L-C)', () => {
  it('est classée SEEDÉE, avec sa raison', () => {
    expect(DEMO_PLAYBOOKS_COVERAGE.state).toBe('seede')
    expect(DEMO_PLAYBOOKS_COVERAGE.reason).toContain('#4166')
  })

  it('LIT quelque chose : au moins une séquence, et des contacts à y chercher', () => {
    expect(DEMO_PLAYBOOK_SEQUENCES.length).toBeGreaterThanOrEqual(1)
    expect(names.size).toBeGreaterThan(10)
  })

  it('chaque séquence vise un contact qui EXISTE dans la salle, un modèle du contrat', () => {
    for (const entry of DEMO_PLAYBOOK_SEQUENCES) {
      expect({ contact: entry.contact, existe: names.has(entry.contact) }).toEqual({
        contact: entry.contact,
        existe: true,
      })
      expect(OUTREACH_PLAYBOOK_KEYS).toContain(entry.playbook)
    }
  })

  it('ne pose pas plus d’étapes que le modèle n’en porte (sinon séquence amputée en silence)', () => {
    for (const entry of DEMO_PLAYBOOK_SEQUENCES) {
      expect(entry.steps.length).toBeLessThanOrEqual(OUTREACH_PLAYBOOKS[entry.playbook].steps.length)
      expect(entry.steps.length).toBeGreaterThan(0)
    }
  })

  it('ne crée aucune collision : un contact du plan existant n’est pas ré-inscrit', () => {
    const already = new Set(DEMO_OUTREACH_PLAN.map(entry => entry.contact))
    for (const entry of DEMO_PLAYBOOK_SEQUENCES)
      expect({ contact: entry.contact, deja: already.has(entry.contact) }).toEqual({
        contact: entry.contact,
        deja: false,
      })
    const own = DEMO_PLAYBOOK_SEQUENCES.map(entry => entry.contact)
    expect(new Set(own).size).toBe(own.length)
  })

  it('reste active : aucune séquence terminée (la routine de clôture CRM compte ses terminées)', () => {
    for (const entry of DEMO_PLAYBOOK_SEQUENCES) expect(entry.status).toBe('active')
  })

  it('chaque modèle semé garde un gabarit d’origine : le badge de mode s’affiche en démo (#2798)', () => {
    for (const entry of DEMO_PLAYBOOK_SEQUENCES) {
      expect({ playbook: entry.playbook, key: playbookTemplateKey(entry.playbook) === null }).toEqual({
        playbook: entry.playbook,
        key: false,
      })
    }
  })

  it('le nom reprend celui du modèle et nomme le contact', () => {
    const [entry] = DEMO_PLAYBOOK_SEQUENCES
    expect(playbookSequenceName(entry!.playbook, entry!.contact)).toBe(`Signal de recrutement — ${entry!.contact}`)
  })

  it('toutes les natures d’étape des modèles passent le CHECK de kind de la migration', async () => {
    const allowed = checkValues(await flat(), 'outreach_sequence_steps_kind_check')
    for (const key of OUTREACH_PLAYBOOK_KEYS) {
      for (const step of OUTREACH_PLAYBOOKS[key].steps)
        expect({ key, kind: step.kind, ok: allowed.includes(step.kind) }).toEqual({ key, kind: step.kind, ok: true })
    }
  })

  it('les statuts semés sont des statuts du contrat, le délai est en jours ouvrés (CHECK delay_unit)', async () => {
    const allowedUnits = checkValues(await flat(), 'outreach_sequences_delay_unit_check')
    expect(allowedUnits).toContain('business_days')
    for (const entry of DEMO_PLAYBOOK_SEQUENCES) {
      expect(outreachSequenceStatusSchema.options).toContain(entry.status)
      for (const step of entry.steps) expect(outreachStepStatusSchema.options).toContain(step.status)
    }
  })
})

/**
 * #5029 (craft rule n°9) — « Proposer ce profil » est REMPLI en démo : un
 * consultant de la salle, disponible tout de suite (en intercontrat), proposé à
 * UN contact d'un compte par une séquence `bench_consultant` rattachée à lui —
 * le Reverse Market de ce consultant dit « Déjà proposé à ce compte ».
 */
describe('#5029 — un consultant en intercontrat proposé à un compte, semé', () => {
  const benches = DEMO_PLAYBOOK_SEQUENCES.filter(entry => entry.consultant)

  it('au moins une proposition, sur le playbook F', () => {
    expect(benches.length).toBeGreaterThanOrEqual(1)
    for (const entry of benches) expect(entry.playbook).toBe('bench_consultant')
  })

  it('le consultant EXISTE dans la salle et est disponible tout de suite (intercontrat)', () => {
    for (const entry of benches) {
      const consultant = DEMO_CONSULTANTS.find(candidate => candidate.full_name === entry.consultant)
      expect({ consultant: entry.consultant, availability: consultant?.availability }).toEqual({
        consultant: entry.consultant,
        availability: 'immediate',
      })
    }
  })

  it('le contact visé appartient à un compte de la salle', () => {
    for (const entry of benches) {
      const dossier = DEMO_DOSSIERS.find(candidate => candidate.contacts.some(c => c.full_name === entry.contact))
      expect({ contact: entry.contact, compte: Boolean(dossier) }).toEqual({ contact: entry.contact, compte: true })
    }
  })
})
