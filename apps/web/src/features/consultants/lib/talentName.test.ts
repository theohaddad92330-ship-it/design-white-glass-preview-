import { describe, expect, it } from 'vitest'
import { looksLikeAFileName } from '@bellum/contracts'
import { readTalentName, talentNameText } from './talentName'

/**
 * Le nom d'une fiche du vivier — et ce qu'on affiche quand il n'y en a pas.
 *
 * Mesuré en PRODUCTION le 30/08 : une fiche du vivier portait
 * `cv_anonyme_louis_ai-engineer-node_gw` à la place d'un nom de personne.
 * Ce n'est pas un nom, c'est le nom du FICHIER déposé, écrit dans
 * `consultants.full_name` par `cv-intake.service.ts` faute d'autre chose.
 *
 * ⚠️ « Ceci ressemble-t-il à un nom de fichier ? » ne se teste PLUS ici : la
 * question vit à un seul endroit depuis le 30/08 (D372), et ses cas — ceux des
 * deux faces, réunis — sont dans `packages/contracts/src/schemas/file-name.test.ts`.
 * Les rejouer ici referait le doublon qu'on vient de supprimer, en tests.
 * Ce qui se teste ici est ce que l'ÉCRAN fait du verdict.
 */
describe('readTalentName — ce que la fiche AFFICHE', () => {
  it('pose la question à la définition partagée, et à elle seule', () => {
    // Le branchement lui-même : si quelqu'un réintroduisait une détection
    // locale, ces deux lignes cesseraient d'être équivalentes sans prévenir.
    for (const value of ['cv_anonyme_louis_ai-engineer-node_gw', 'dossier.rtf', 'Yanis Berthier', 'C V Raman']) {
      expect(readTalentName(value).kind, value).toBe(looksLikeAFileName(value) ? 'unnamed' : 'named')
    }
  })

  it('rend le nom quand c’en est un', () => {
    expect(readTalentName('Yanis Berthier')).toEqual({ kind: 'named', name: 'Yanis Berthier' })
  })

  it('rend l’ABSENCE de nom, et garde le fichier comme repère assumé', () => {
    // Une fiche sans nom doit rester distinguable d'une autre fiche sans nom :
    // le fichier déposé tient ce rôle, ANNONCÉ comme un fichier.
    expect(readTalentName('cv_anonyme_louis_ai-engineer-node_gw')).toEqual({
      kind: 'unnamed',
      deposited: 'cv_anonyme_louis_ai-engineer-node_gw',
    })
  })

  it('rend l’absence sans repère quand la valeur est vide', () => {
    for (const empty of ['', '   ', null, undefined]) {
      expect(readTalentName(empty)).toEqual({ kind: 'unnamed', deposited: null })
    }
  })

  it('n’invente rien : le nom rendu est le nom stocké, espaces en moins', () => {
    expect(readTalentName('  Yanis Berthier  ')).toEqual({ kind: 'named', name: 'Yanis Berthier' })
  })
})

describe('talentNameText — pour les phrases qui interpolent un nom', () => {
  it('rend le nom, ou le libellé d’absence — jamais l’identifiant', () => {
    expect(talentNameText('Yanis Berthier', 'Nom non renseigné')).toBe('Yanis Berthier')
    expect(talentNameText('cv_anonyme_louis_ai-engineer-node_gw', 'Nom non renseigné')).toBe('Nom non renseigné')
    expect(talentNameText(null, 'Nom non renseigné')).toBe('Nom non renseigné')
  })
})
