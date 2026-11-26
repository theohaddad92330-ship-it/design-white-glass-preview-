// Décision Louis 12/10 revient sur c88, délibérément : un CV lu = fiche qualifiée (plus de revue obligatoire).
import { ServiceUnavailableException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { IaClient } from '../ia/ia.client'
import { CvParseService } from './cv-parse.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const TALENT = 'c0000000-0000-4000-8000-000000000001'
const CV = 'YANIS BERTHIER — Ingénieur plateforme. Kubernetes, Prometheus, Go. Lyon.'

function makeService(overrides: { talent?: Record<string, unknown>; parse?: unknown; parseThrows?: Error } = {}) {
  const saved: Record<string, unknown>[] = []
  const talent: Record<string, unknown> = {
    id: TALENT,
    workspace_id: WORKSPACE,
    cv_text: CV,
    full_name: null,
    title: null,
    stack: [],
    zones: [],
    review_status: 'needs_review',
    qualified_at: null,
    ...overrides.talent,
  }
  const consultants = {
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => talent),
    })),
    save: jest.fn(async (row: Record<string, unknown>) => {
      saved.push({ ...row })
      return row
    }),
    manager: { query: jest.fn(async () => undefined) },
  } as unknown as Repository<ConsultantEntity>
  const cvParse = jest.fn(async () => {
    if (overrides.parseThrows) throw overrides.parseThrows
    return overrides.parse ?? { data: { fields: [], source_chars: CV.length } }
  })
  const ia = { cvParse } as unknown as IaClient
  return { service: new CvParseService(consultants, ia), saved, cvParse, talent }
}

function field(detection: string, value: unknown) {
  return { detection, value, confidence: 0.9, source_excerpt: 'Kubernetes, Prometheus, Go.', excerpt_offset: 10 }
}

const PROPOSAL = {
  data: {
    fields: [
      field('identity', 'Yanis Berthier'),
      field('job_title', 'Ingénieur plateforme'),
      field('skills', ['Kubernetes', 'Go']),
      field('sectors', ['Banque']),
    ],
    source_chars: CV.length,
  },
}

/**
 * Lecture automatique des CV à l'import (04/10/2026, import ZIP de 688 CV —
 * `c88_lecture_auto_cv_import`, D366 levée pour CE chemin) : la proposition du
 * modèle s'ÉCRIT en provenance `model`, sans qualifier, sans jamais écraser un
 * humain.
 */
describe('CvParseService.autoRead (c88, renversé 12/10 par c97)', () => {
  it('une lecture réussie mais PEU féconde qualifie quand même la fiche', async () => {
    const { service, saved } = makeService({
      parse: { data: { fields: [field('job_title', 'SRE')], source_chars: CV.length } },
    })
    const outcome = await service.autoRead(TALENT, WORKSPACE, USER, {})
    expect(saved.at(-1)!['review_status']).toBe('qualified')
    expect(outcome?.qualified).toBe(true)
  })

  it('sait dire NON : une fiche ARCHIVÉE n’est ni lue ni qualifiée', async () => {
    const { service, cvParse, saved } = makeService({
      talent: { archived_at: new Date('2026-09-01') },
      parse: PROPOSAL,
    })
    expect(await service.autoRead(TALENT, WORKSPACE, USER, {})).toBeNull()
    expect(cvParse).not.toHaveBeenCalled()
    expect(saved).toEqual([])
  })

  it('sait dire NON : une lecture EN ÉCHEC laisse la fiche à revoir (elle n’a pas été lue)', async () => {
    const { service, saved, talent } = makeService({ parseThrows: new Error('ECONNRESET') })
    await expect(service.autoRead(TALENT, WORKSPACE, USER, {})).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(saved).toEqual([])
    expect(talent['review_status']).toBe('needs_review')
    expect(talent['qualified_at']).toBeNull()
  })

  it('une correction humaine n’est pas écrasée ET la fiche est qualifiée', async () => {
    const { service, saved } = makeService({ talent: { title: 'SRE' }, parse: PROPOSAL })
    await service.autoRead(TALENT, WORKSPACE, USER, { title: 'human' })
    expect(saved.at(-1)!['title']).toBe('SRE')
    expect(saved.at(-1)!['review_status']).toBe('qualified')
  })

  it('écrit nom, intitulé et compétences en provenance `model` — et la fiche sort QUALIFIÉE (12/10)', async () => {
    const { service, saved } = makeService({ parse: PROPOSAL })
    const outcome = await service.autoRead(TALENT, WORKSPACE, USER, {})
    const row = saved.at(-1)!
    expect(row['full_name']).toBe('Yanis Berthier')
    expect(row['title']).toBe('Ingénieur plateforme')
    expect(row['stack']).toEqual(['Kubernetes', 'Go'])
    expect(row['review_status']).toBe('qualified')
    expect(row['qualified_at']).toBeInstanceOf(Date)
    expect(row['cv_auto_read_at']).toBeInstanceOf(Date)
    expect(outcome?.written.every(entry => entry.source === 'model')).toBe(true)
    expect(outcome?.written.map(entry => entry.column)).toEqual(expect.arrayContaining(['full_name', 'title', 'stack']))
  })

  it('n’écrit QUE les blocs de la lecture automatique — `sectors` attend la revue', async () => {
    const { service, saved } = makeService({ parse: PROPOSAL })
    await service.autoRead(TALENT, WORKSPACE, USER, {})
    expect(saved.at(-1)!['sectors']).toBeUndefined()
  })

  it('ne touche JAMAIS un champ corrigé à la main (provenance `human`)', async () => {
    const { service, saved } = makeService({
      talent: { full_name: 'Yanis Berthié', title: 'SRE' },
      parse: PROPOSAL,
    })
    const outcome = await service.autoRead(TALENT, WORKSPACE, USER, { full_name: 'human', title: 'human' })
    const row = saved.at(-1)!
    expect(row['full_name']).toBe('Yanis Berthié')
    expect(row['title']).toBe('SRE')
    expect(outcome?.written.map(entry => entry.column)).not.toContain('full_name')
  })

  it('une valeur en place SANS provenance (saisie d’avant le journal) n’est pas écrasée non plus', async () => {
    const { service, saved } = makeService({ talent: { title: 'Architecte cloud' }, parse: PROPOSAL })
    await service.autoRead(TALENT, WORKSPACE, USER, {})
    expect(saved.at(-1)!['title']).toBe('Architecte cloud')
  })

  // c97 (12/10) — `qualified` ne dit plus « humain » : une fiche AUTO-qualifiée dont le texte
  // a été recollé ou remplacé (rattrapage CV-OCR, réimport) se RELIT et reste qualifiée.
  it('c97 — une fiche AUTO-qualifiée se relit (texte recollé) et RESTE qualifiée', async () => {
    const { service, cvParse, saved } = makeService({ talent: { review_status: 'qualified' }, parse: PROPOSAL })
    const outcome = await service.autoRead(TALENT, WORKSPACE, USER, {})
    expect(cvParse).toHaveBeenCalledTimes(1)
    expect(saved.at(-1)!['full_name']).toBe('Yanis Berthier')
    expect(saved.at(-1)!['review_status']).toBe('qualified')
    // Déjà qualifiée : aucun PASSAGE à journaliser (`needs_review` → `qualified` serait faux).
    expect(outcome?.qualified).toBe(false)
  })

  it('sait dire NON : une fiche qualifiée relue garde ses champs HUMAINS', async () => {
    const { service, saved } = makeService({
      talent: { review_status: 'qualified', full_name: 'Lamis Mouloudj', title: 'Data engineer' },
      parse: PROPOSAL,
    })
    await service.autoRead(TALENT, WORKSPACE, USER, { full_name: 'human', title: 'human' })
    expect(saved.at(-1)!['full_name']).toBe('Lamis Mouloudj')
    expect(saved.at(-1)!['title']).toBe('Data engineer')
    expect(saved.at(-1)!['review_status']).toBe('qualified')
  })

  it('service IA indisponible : l’erreur REMONTE (la file réessaie), rien n’est écrit ni marqué lu', async () => {
    const { service, saved } = makeService({ parseThrows: new Error('ECONNRESET') })
    await expect(service.autoRead(TALENT, WORKSPACE, USER, {})).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(saved).toEqual([])
  })

  it('une lecture qui ne produit rien : aucune valeur inventée, la fiche est marquée lue', async () => {
    const { service, saved } = makeService({ parse: { data: { fields: [], source_chars: CV.length } } })
    const outcome = await service.autoRead(TALENT, WORKSPACE, USER, {})
    expect(outcome).toEqual({ written: [], qualified: true })
    expect(saved.at(-1)!['review_status']).toBe('qualified')
    expect(saved.at(-1)!['full_name']).toBeNull()
    expect(saved.at(-1)!['cv_auto_read_at']).toBeInstanceOf(Date)
  })

  it('salle de démonstration : lecture scriptée, zéro appel modèle', async () => {
    const { service, cvParse } = makeService({ parse: PROPOSAL })
    await service.autoRead(TALENT, WORKSPACE, USER, {}, { demo: true })
    expect(cvParse).not.toHaveBeenCalled()
  })
})

/**
 * #3935.2a (lot M07, 09/10) — « lire tous les CV tout le temps automatiquement » :
 * la lecture automatique écrit aussi environnements, outils et certifications,
 * en `model`, jamais au-dessus d'une correction humaine.
 */
describe('CvParseService.autoRead — environnements, outils, certifications (#3935.2a)', () => {
  const FULL = {
    data: {
      fields: [
        field('environments', ['AWS', 'Kubernetes']),
        field('tools', ['Jira']),
        field('certifications', ['CKA — CNCF']),
      ],
      source_chars: CV.length,
    },
  }

  it('écrit les trois colonnes en provenance model', async () => {
    const { service, saved } = makeService({ parse: FULL })
    const outcome = await service.autoRead(TALENT, WORKSPACE, USER, {})
    const row = saved.at(-1)!
    expect(row['environments']).toEqual(['AWS', 'Kubernetes'])
    expect(row['tools']).toEqual(['Jira'])
    expect(row['certifications']).toEqual(['CKA — CNCF'])
    expect(outcome?.written.map(entry => entry.column)).toEqual(
      expect.arrayContaining(['environments', 'tools', 'certifications']),
    )
  })

  it('sait dire NON : une colonne corrigée à la main n’est pas réécrite', async () => {
    const { service, saved } = makeService({ parse: FULL, talent: { tools: ['Confluence'] } })
    await service.autoRead(TALENT, WORKSPACE, USER, { tools: 'human' })
    expect(saved.at(-1)!['tools']).toEqual(['Confluence'])
  })
})

/**
 * #3935 (décision Louis 15/10/2026, renverse celle du 31/08) — la séniorité (en ANNÉES) et le TJM
 * sont LUS dans le CV quand ils y figurent. Le TJM n'est jamais estimé ; une saisie humaine gagne.
 */
describe('CvParseService.autoRead — années d’expérience et TJM lus (#3935, 15/10)', () => {
  const READ = {
    data: {
      fields: [field('seniority', '8 ans'), field('daily_rate', 'TJM : 550 €/jour')],
      source_chars: CV.length,
    },
  }

  it('écrit les années et le TJM écrits dans le CV, en provenance model', async () => {
    const { service, saved } = makeService({ parse: READ })
    const outcome = await service.autoRead(TALENT, WORKSPACE, USER, {})
    const row = saved.at(-1)!
    expect(row['years_experience']).toBe(8)
    expect(row['tjm']).toBe(550)
    expect(outcome?.written.map(entry => entry.column)).toEqual(expect.arrayContaining(['years_experience', 'tjm']))
    expect(outcome?.written.every(entry => entry.source === 'model')).toBe(true)
  })

  it('ne devine pas le palier : la colonne `seniority` n’est jamais écrite par la lecture', async () => {
    const { service, saved } = makeService({ parse: READ })
    await service.autoRead(TALENT, WORKSPACE, USER, {})
    expect(saved.at(-1)!['seniority']).toBeUndefined()
  })

  it('sait dire NON : une saisie humaine gagne (années ET TJM)', async () => {
    const { service, saved } = makeService({ parse: READ, talent: { years_experience: 12, tjm: 700 } })
    await service.autoRead(TALENT, WORKSPACE, USER, { years_experience: 'human', tjm: 'human' })
    const row = saved.at(-1)!
    expect(row['years_experience']).toBe(12)
    expect(row['tjm']).toBe(700)
  })

  it('sait dire NON : un mot sans nombre, une valeur absurde ou nulle n’écrivent rien (jamais « 0 »)', async () => {
    const { service, saved } = makeService({
      parse: {
        data: {
          fields: [field('seniority', 'senior'), field('daily_rate', 'à négocier')],
          source_chars: CV.length,
        },
      },
    })
    await service.autoRead(TALENT, WORKSPACE, USER, {})
    expect(saved.at(-1)!['years_experience']).toBeUndefined()
    expect(saved.at(-1)!['tjm']).toBeUndefined()
    const absurd = makeService({
      parse: { data: { fields: [field('seniority', '120 ans'), field('daily_rate', '9 €')], source_chars: CV.length } },
    })
    await absurd.service.autoRead(TALENT, WORKSPACE, USER, {})
    expect(absurd.saved.at(-1)!['years_experience']).toBeUndefined()
    expect(absurd.saved.at(-1)!['tjm']).toBeUndefined()
  })

  it('« 0 an » lu dans le CV reste une vraie réponse (tout juste diplômé)', async () => {
    const { service, saved } = makeService({
      parse: { data: { fields: [field('seniority', '0 an')], source_chars: CV.length } },
    })
    await service.autoRead(TALENT, WORKSPACE, USER, {})
    expect(saved.at(-1)!['years_experience']).toBe(0)
  })
})
