import { describe, expect, it } from 'vitest'
import {
  PROOF_EVIDENCE_FIELDS,
  PROOF_SOURCES,
  proofFieldsToPropose,
  proposeProofFields,
  validateProofFieldsSchema,
} from './proof.js'

/**
 * #2124.49 à .55 — les champs de preuve, PROPOSÉS puis validés par un humain.
 *
 * Décision de Louis du 14/09/2026 : « Laura les propose, l'humain valide ».
 * Ni saisie manuelle sèche, ni import ATS. Ce fichier garde les deux moitiés
 * de cette phrase : ce que le producteur a le droit de proposer (rien qui ne
 * soit déjà écrit quelque part), et ce qu'il n'a pas le droit de recouvrir
 * (une valeur déjà posée).
 */
describe('proposeProofFields', () => {
  it('reprend le libellé de la mission comme affirmation, et le rôle comme expertise', () => {
    const proposal = proposeProofFields({
      mission: { label: 'Migration du socle applicatif vers les conteneurs', role_title: 'Architecte plateforme' },
    })

    expect(proposal.claim).toEqual({ value: 'Migration du socle applicatif vers les conteneurs', from: 'mission' })
    expect(proposal.expertise).toEqual({ value: ['Architecte plateforme'], from: 'mission' })
    expect(proposal.source).toBe('mission')
  })

  it('reprend le besoin d’origine comme problème, et le retour de mission comme résultat', () => {
    const proposal = proposeProofFields({
      mission: { label: 'Lot 1', role_title: null },
      need: { title: 'Réduire le délai de mise en production', skills: ['Kubernetes', 'GitLab CI'] },
      rex: {
        summary: 'Mission close en février.',
        what_worked: 'Le délai de livraison est passé de 3 semaines à 2 jours.',
      },
    })

    expect(proposal.problem).toEqual({ value: 'Réduire le délai de mise en production', from: 'need' })
    expect(proposal.result).toEqual({
      value: 'Le délai de livraison est passé de 3 semaines à 2 jours.',
      from: 'rex',
    })
    expect(proposal.expertise).toEqual({ value: ['Kubernetes', 'GitLab CI'], from: 'need' })
    // Le retour existe : c'est LUI que la preuve cite, pas la fiche de mission.
    expect(proposal.source).toBe('rex')
  })

  it('n’invente RIEN : sans retour de mission, le résultat reste vide', () => {
    const proposal = proposeProofFields({
      mission: { label: 'Lot 1', role_title: null },
      rex: { summary: 'Mission close en février.', what_worked: null },
    })

    expect(proposal.result).toBeNull()
    expect(proposal.problem).toBeNull()
    expect(proposal.expertise).toBeNull()
  })

  it('ne rend que du texte présent dans son entrée', () => {
    const entrees = ['Migration vers les conteneurs', 'Réduire le délai', 'Deux jours au lieu de trois semaines', 'SRE']
    const proposal = proposeProofFields({
      mission: { label: entrees[0], role_title: entrees[3] },
      need: { title: entrees[1], skills: [] },
      rex: { summary: null, what_worked: entrees[2] },
    })

    const rendus = [
      proposal.claim?.value,
      proposal.problem?.value,
      proposal.result?.value,
      ...(proposal.expertise?.value ?? []),
    ]
    for (const rendu of rendus) expect(entrees).toContain(rendu)
  })

  it('ne propose jamais l’autorisation de citation — elle n’est écrite nulle part', () => {
    const proposal = proposeProofFields({ mission: { label: 'Lot 1', role_title: 'SRE' } })
    expect(Object.keys(proposal)).not.toContain('citation_allowed')
  })
})

describe('proofFieldsToPropose', () => {
  const proposal = proposeProofFields({
    mission: { label: 'Lot 1', role_title: 'SRE' },
    need: { title: 'Réduire le délai', skills: [] },
    rex: { summary: null, what_worked: 'Deux jours au lieu de trois semaines.' },
  })

  it('propose ce que la preuve n’a pas encore', () => {
    const reste = proofFieldsToPropose(proposal, { claim: 'Migration de 400 To', problem: null, result: null })

    // Le libellé est DÉJÀ posé : la proposition ne le recouvre pas.
    expect(reste.claim).toBeNull()
    expect(reste.problem?.value).toBe('Réduire le délai')
    expect(reste.result?.value).toBe('Deux jours au lieu de trois semaines.')
  })

  it('SAIT DIRE NON : une valeur déjà écrite n’est jamais recouverte par une proposition', () => {
    const reste = proofFieldsToPropose(proposal, {
      claim: 'Migration de 400 To',
      problem: 'Le client ne savait pas livrer',
      result: 'Deux jours',
      expertise: ['Architecte'],
    })

    expect(reste.claim).toBeNull()
    expect(reste.problem).toBeNull()
    expect(reste.result).toBeNull()
    expect(reste.expertise).toBeNull()
  })

  it('une valeur VIDE n’est pas une valeur : elle reste proposable', () => {
    const reste = proofFieldsToPropose(proposal, { claim: '   ', problem: '', expertise: [] })

    expect(reste.claim?.value).toBe('Lot 1')
    expect(reste.problem?.value).toBe('Réduire le délai')
    expect(reste.expertise?.value).toEqual(['SRE'])
  })
})

describe('validateProofFieldsSchema', () => {
  it('accepte la validation humaine champ par champ, et sait dire null', () => {
    const parsed = validateProofFieldsSchema.parse({
      problem: 'Le client ne savait pas livrer',
      result: null,
      expertise: ['SRE'],
      citation_allowed: true,
      source: 'rex',
      kept_from_proposal: ['problem'],
    })

    expect(parsed.problem).toBe('Le client ne savait pas livrer')
    expect(parsed.result).toBeNull()
    expect(parsed.kept_from_proposal).toEqual(['problem'])
  })

  it('refuse une source hors de la liste, et un champ hors des champs de preuve', () => {
    expect(validateProofFieldsSchema.safeParse({ source: 'linkedin' }).success).toBe(false)
    expect(validateProofFieldsSchema.safeParse({ kept_from_proposal: ['scope'] }).success).toBe(false)
  })

  it('les listes fermées portent leurs valeurs', () => {
    expect([...PROOF_SOURCES]).toEqual(['mission', 'need', 'rex', 'testimonial', 'manual'])
    expect([...PROOF_EVIDENCE_FIELDS]).toEqual([
      'claim',
      'problem',
      'result',
      'expertise',
      'citation_allowed',
      'source',
    ])
  })
})
