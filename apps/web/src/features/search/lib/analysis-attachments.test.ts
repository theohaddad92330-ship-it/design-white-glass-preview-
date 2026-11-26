import { RAG_UPLOAD_MAX_BYTES } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { ANALYSIS_ATTACHMENTS_MAX, ANALYSIS_ATTACHMENT_ACCEPT, planAttachments } from './analysis-attachments'

const file = (name: string, size = 10) => new File([new Uint8Array(size)], name)

describe('planAttachments (#3623)', () => {
  it('accepte CSV, ZIP et classeurs, et type chacun', () => {
    const plan = planAttachments([file('a.csv'), file('b.zip'), file('c.xlsx'), file('d.docx')], [])
    expect(plan.refused).toEqual([])
    expect(plan.accepted.map(a => a.kind)).toEqual(['text', 'zip', 'binary', 'binary'])
  })

  it('#3623.8 — tsv, log, xml, yaml partent comme du texte lu en UTF-8', () => {
    const plan = planAttachments([file('a.tsv'), file('b.log'), file('c.xml'), file('d.yml')], [])
    expect(plan.refused).toEqual([])
    expect(plan.accepted.map(a => a.kind)).toEqual(['text', 'text', 'text', 'text'])
    expect(ANALYSIS_ATTACHMENT_ACCEPT).toContain('.tsv')
  })

  it('refuse un format inconnu avec sa raison, sans bloquer les autres', () => {
    const plan = planAttachments([file('a.exe'), file('b.csv')], [])
    expect(plan.refused).toEqual([{ name: 'a.exe', reason: 'unsupported' }])
    expect(plan.accepted).toHaveLength(1)
  })

  it('refuse un fichier vide ou trop gros', () => {
    const big = { name: 'big.pdf', size: RAG_UPLOAD_MAX_BYTES + 1 } as File
    const plan = planAttachments([file('empty.csv', 0), big], [])
    expect(plan.refused.map(r => r.reason)).toEqual(['empty', 'too_large'])
  })

  it('refuse le doublon d’un fichier déjà joint', () => {
    const plan = planAttachments([file('a.csv', 10)], [{ name: 'a.csv', size: 10 }])
    expect(plan.refused).toEqual([{ name: 'a.csv', reason: 'duplicate' }])
  })

  it('borne le nombre de pièces et nomme celles qui dépassent', () => {
    const many = Array.from({ length: ANALYSIS_ATTACHMENTS_MAX + 2 }, (_, i) => file(`f${i}.csv`, i + 1))
    const plan = planAttachments(many, [])
    expect(plan.accepted).toHaveLength(ANALYSIS_ATTACHMENTS_MAX)
    expect(plan.refused.map(r => r.reason)).toEqual(['too_many', 'too_many'])
  })

  it('le sélecteur est dérivé du contrat (zip compris)', () => {
    expect(ANALYSIS_ATTACHMENT_ACCEPT).toContain('.zip')
    expect(ANALYSIS_ATTACHMENT_ACCEPT).toContain('.xlsx')
  })
})
