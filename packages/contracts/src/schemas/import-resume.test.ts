import { describe, expect, it } from 'vitest'
import {
  IMPORT_CHECKPOINT_ROWS,
  IMPORT_SESSION_STATES,
  importContentFingerprint,
  importResumeDecision,
} from '../index.js'

/**
 * La reprise d'un import interrompu — angle mort n°6 du tome 8 §33.
 *
 * « Le rollback est spécifié ; **la reprise ne l'est pas** — que fait-on des
 * 900 objets corrects ? »
 *
 * Ce fichier est la réponse, et il est écrit AVANT le code qui la calcule.
 */
describe('l’empreinte du fichier', () => {
  it('est stable pour un contenu identique', () => {
    const csv = 'societe;siren\nAcme;123456789\nBeta;987654321\n'
    expect(importContentFingerprint(csv)).toBe(importContentFingerprint(csv))
  })

  it('change dès qu’un octet change', () => {
    const a = 'societe;siren\nAcme;123456789\n'
    const b = 'societe;siren\nAcmf;123456789\n'
    expect(importContentFingerprint(a)).not.toBe(importContentFingerprint(b))
  })

  it('change quand une ligne est ajoutée, même à la fin', () => {
    const a = 'societe\nAcme\n'
    const b = 'societe\nAcme\nBeta\n'
    expect(importContentFingerprint(a)).not.toBe(importContentFingerprint(b))
  })

  it('change quand deux lignes sont PERMUTÉES — la reprise saute par NUMÉRO de ligne', () => {
    // La déduplication de reprise vaut « session + numéro de ligne ». Une
    // empreinte insensible à l'ordre laisserait sauter les 4 000 mauvaises.
    const a = 'societe\nAcme\nBeta\n'
    const b = 'societe\nBeta\nAcme\n'
    expect(importContentFingerprint(a)).not.toBe(importContentFingerprint(b))
  })

  it('accepte le contenu vide sans jeter', () => {
    expect(typeof importContentFingerprint('')).toBe('string')
  })
})

describe('la décision de reprise', () => {
  const fingerprint = importContentFingerprint('societe\nAcme\n')

  it('part de zéro quand rien n’a jamais été écrit', () => {
    expect(
      importResumeDecision({
        state: 'simulated',
        processedRows: null,
        failedAtRow: null,
        resumeOutcome: null,
        storedFingerprint: fingerprint,
        incomingFingerprint: fingerprint,
      }),
    ).toEqual({ kind: 'start' })
  })

  it('refuse de rejouer un import déjà exécuté', () => {
    expect(
      importResumeDecision({
        state: 'applied',
        processedRows: 17_000,
        failedAtRow: null,
        resumeOutcome: null,
        storedFingerprint: fingerprint,
        incomingFingerprint: fingerprint,
      }),
    ).toEqual({ kind: 'done' })
  })

  it('refuse de rejouer un import annulé', () => {
    expect(
      importResumeDecision({
        state: 'rolled_back',
        processedRows: 17_000,
        failedAtRow: null,
        resumeOutcome: null,
        storedFingerprint: fingerprint,
        incomingFingerprint: fingerprint,
      }),
    ).toEqual({ kind: 'done' })
  })

  it('reprend APRÈS la dernière ligne durable quand l’échec est rejouable', () => {
    // 4 000 lignes sur 17 000. La connexion n'a jamais abouti : la ligne 4 000
    // n'est certainement pas partie, on la rejoue.
    expect(
      importResumeDecision({
        state: 'partial',
        processedRows: 4_000,
        failedAtRow: 4_000,
        resumeOutcome: 'failed',
        storedFingerprint: fingerprint,
        incomingFingerprint: fingerprint,
      }),
    ).toEqual({ kind: 'resume', fromRow: 4_000 })
  })

  it('ARRÊTE la reprise quand la ligne est partie sans réponse', () => {
    // La doctrine, mot pour mot : « un timeout n'est pas un échec ; `unknown`
    // ARRÊTE la reprise ». Rejouer la ligne 4 000 la doublonnerait peut-être ;
    // la sauter perdrait peut-être une ligne. Seul un humain tranche.
    expect(
      importResumeDecision({
        state: 'partial',
        processedRows: 4_000,
        failedAtRow: 4_000,
        resumeOutcome: 'unknown',
        storedFingerprint: fingerprint,
        incomingFingerprint: fingerprint,
      }),
    ).toEqual({ kind: 'ask_unknown', uncertainRow: 4_000 })
  })

  it('refuse de sauter des lignes d’un AUTRE fichier', () => {
    // Sauter 4 000 lignes d'un fichier qui n'est pas celui qui a été écrit
    // perdrait 4 000 lignes réelles, en silence. C'est le pire des trois maux.
    expect(
      importResumeDecision({
        state: 'partial',
        processedRows: 4_000,
        failedAtRow: 4_000,
        resumeOutcome: 'failed',
        storedFingerprint: fingerprint,
        incomingFingerprint: importContentFingerprint('societe\nGamma\n'),
      }),
    ).toEqual({ kind: 'different_file' })
  })

  it('le contrôle du fichier passe AVANT celui de la ligne incertaine', () => {
    // Un numéro de ligne ne veut rien dire dans un autre fichier : le dire
    // dans le mauvais ordre demanderait à l'utilisateur de trancher sur une
    // ligne qui n'existe pas.
    expect(
      importResumeDecision({
        state: 'partial',
        processedRows: 4_000,
        failedAtRow: 4_000,
        resumeOutcome: 'unknown',
        storedFingerprint: fingerprint,
        incomingFingerprint: importContentFingerprint('autre'),
      }),
    ).toEqual({ kind: 'different_file' })
  })

  it('refuse quand aucune empreinte n’a été enregistrée — on ne PROUVE pas que c’est le même fichier', () => {
    // « On ne sait pas » n'est pas « c'est le même ». Une session écrite avant
    // que l'empreinte n'existe tombe ici, et elle ne saute rien.
    expect(
      importResumeDecision({
        state: 'partial',
        processedRows: 4_000,
        failedAtRow: 4_000,
        resumeOutcome: 'failed',
        storedFingerprint: null,
        incomingFingerprint: fingerprint,
      }),
    ).toEqual({ kind: 'unverifiable' })
  })

  it('ne saute rien quand le nombre de lignes durables est INCONNU', () => {
    // « On ne sait pas combien de lignes ont été écrites » n'est pas
    // « zéro ligne a été écrite ». Reprendre à 0 redoublonnerait ; on refuse.
    expect(
      importResumeDecision({
        state: 'partial',
        processedRows: null,
        failedAtRow: null,
        resumeOutcome: null,
        storedFingerprint: fingerprint,
        incomingFingerprint: fingerprint,
      }),
    ).toEqual({ kind: 'unknown_progress' })
  })
})

describe('les invariants du chantier', () => {
  it('`partial` est une valeur d’état, ajoutée EN FIN de taxonomie', () => {
    // GA-08 : un enum ne perd jamais de valeur et n'en insère jamais au milieu.
    expect(IMPORT_SESSION_STATES).toEqual(['draft', 'simulated', 'applied', 'rolled_back', 'failed', 'partial'])
  })

  it('le point de reprise est écrit régulièrement, pas seulement à la fin', () => {
    // Un point de reprise posé uniquement à la fin ne survit à rien : c'est
    // précisément la fin qui n'arrive pas.
    expect(IMPORT_CHECKPOINT_ROWS).toBeGreaterThan(0)
    expect(IMPORT_CHECKPOINT_ROWS).toBeLessThanOrEqual(1_000)
  })
})
