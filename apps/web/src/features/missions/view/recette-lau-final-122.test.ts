import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { auditMaturityAxisIdValues, missionRiskSchema } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'

import type { MissionView } from '../api'
import { businessUnitCounts } from '../filters'

/**
 * #2408 — LA RECETTE de LAU-FINAL-122 (cockpit missions), dix scénarios plus
 * un NO-GO, écrits.
 *
 * Le registre (`.claude/notes/registre-2026-09-17-lau-122-2408.md`) énumère
 * dix scénarios de recette (#2408.88 : 1 mission, 200 missions, données
 * complètes, connecteur finance absent, aucun CRA, multi-BU, manager,
 * commercial, ADV, mobile) et un NO-GO (#2408.89 : interdit de mettre toutes
 * les missions au même niveau ou d'ouvrir systématiquement le dossier).
 *
 * Même discipline que `apps/web/src/features/chat/voice/recette-lau-final-147.test.ts` :
 * la plupart de ces preuves existent déjà ailleurs, et ce fichier les RAPPELLE
 * plutôt que de les redupliquer (GA-26 — un réglage/une preuve vit à un seul
 * endroit). Une ne l'est pas : « multi-BU » n'était pas jouable avant
 * #2408.39 (filtre BU / agence, `businessUnitCounts`) ; il l'est désormais —
 * et #2408.20 (« consultant non sécurisé »), longtemps une NOTION NON CADRÉE
 * dont ce fichier prouvait l'absence, est cadrée depuis le 31/10/2026 (L15).
 */

const WEB_SRC = join(__dirname, '..', '..', '..')

function fileContains(path: string, needle: string): boolean {
  return readFileSync(path, 'utf8').includes(needle)
}

describe('#2408 — recette LAU-FINAL-122 (cockpit missions)', () => {
  // ── 1. une mission ───────────────────────────────────────────────────────
  describe('1. une mission', () => {
    it('EST recettée — MissionsTable.test.tsx : une mission seule se rend (#2408.88)', () => {
      const path = join(WEB_SRC, 'features', 'missions', 'view', 'MissionsTable.test.tsx')
      expect(fileContains(path, 'l’échelle ne perd aucune ligne (#2408.88)')).toBe(true)
      expect(fileContains(path, 'rend une mission seule')).toBe(true)
    })
  })

  // ── 2. deux cents missions ───────────────────────────────────────────────
  describe('2. deux cents missions', () => {
    it('EST recettée — la même suite rend 200 lignes sans en perdre une (#2408.88)', () => {
      const path = join(WEB_SRC, 'features', 'missions', 'view', 'MissionsTable.test.tsx')
      expect(fileContains(path, 'rend deux cents missions, aucune de moins')).toBe(true)
    })
  })

  // ── 3. données complètes ─────────────────────────────────────────────────
  describe('3. données complètes', () => {
    it('EST recettée — aucun texte d’absence ne flotte quand tout est saisi (#2408.88)', () => {
      const path = join(WEB_SRC, 'features', 'missions', 'view', 'MissionsTable.test.tsx')
      expect(fileContains(path, 'une mission aux données complètes (#2408.88)')).toBe(true)
    })
  })

  // ── 4. connecteur finance absent ─────────────────────────────────────────
  describe('4. connecteur finance absent', () => {
    it('EST déjà recettée — la clé `marginPercent` est ABSENTE sans `finance:read` (#2408.88, D45)', () => {
      const path = join(WEB_SRC, 'features', 'missions', 'view', 'MissionsTable.test.tsx')
      expect(fileContains(path, 'distingue « pas le droit » de « pas renseigné »')).toBe(true)
    })
  })

  // ── 5. aucun CRA ─────────────────────────────────────────────────────────
  describe('5. aucun CRA', () => {
    it('EST déjà recettée — un relevé contesté/manquant se comporte comme tout autre risque, jamais un silence (#2408.88)', () => {
      const path = join(WEB_SRC, 'features', 'missions', 'view', 'MissionsTable.test.tsx')
      // « rien à signaler » sur une mission active sans risque — le même
      // mécanisme couvre l'absence de CRA : `timesheet_disputed` est un risque
      // parmi d'autres (`missionRiskSchema`), pas un axe à part.
      expect(fileContains(path, 'dit « rien à signaler » sur une mission EN COURS sans risque')).toBe(true)
      expect(missionRiskSchema.options).toContain('timesheet_disputed')
      expect(missionRiskSchema.options).toContain('timesheet_missing')
    })
  })

  // ── 6. multi-BU — JOUABLE depuis #2408.39 ───────────────────────────────
  describe('6. multi-BU', () => {
    it('EST recettée — deux BU sur le parc, le filtre BU resserre à l’une, `null` ne fait aucune ligne (#2408.88)', () => {
      const rows = [
        { id: 'a', label: 'TMA ACME', businessUnitName: 'Agence Lyon' },
        { id: 'b', label: 'Forfait Delta', businessUnitName: 'Agence Paris' },
        { id: 'c', label: 'Régie', businessUnitName: null },
      ] as unknown as MissionView[]
      const counts = businessUnitCounts(rows, '')
      expect([...counts.keys()].sort()).toEqual(['Agence Lyon', 'Agence Paris'])
      const page = join(WEB_SRC, 'features', 'missions', 'view', 'MissionsPage.test.tsx')
      expect(fileContains(page, 'filtre par BU / agence du compte porteur')).toBe(true)
    })
  })

  // ── 7. manager ───────────────────────────────────────────────────────────
  describe('7. manager', () => {
    it('EST déjà recettée — sous `finance:read`, la marge se lit (#2408.88)', () => {
      const path = join(WEB_SRC, 'features', 'missions', 'view', 'MissionsTable.test.tsx')
      expect(fileContains(path, 'affiche la marge quand le coût chargé est renseigné')).toBe(true)
    })
  })

  // ── 8. commercial ────────────────────────────────────────────────────────
  describe('8. commercial', () => {
    it('EST déjà recettée — sans `finance:read`, la marge se retire plutôt que de mentir (#2408.88)', () => {
      const path = join(WEB_SRC, 'features', 'missions', 'view', 'MissionsTable.test.tsx')
      expect(fileContains(path, 'distingue « pas le droit » de « pas renseigné »')).toBe(true)
    })
  })

  // ── 9. ADV ───────────────────────────────────────────────────────────────
  describe('9. ADV', () => {
    it('EST déjà recettée — l’ADV a son propre écran, ses propres motifs de blocage (#2408.88)', () => {
      const path = join(WEB_SRC, 'features', 'adv', 'view', 'AdvPage.test.tsx')
      expect(fileContains(path, 'aucun chiffre ne s’invente')).toBe(true)
    })
  })

  // ── 10. mobile ───────────────────────────────────────────────────────────
  describe('10. mobile', () => {
    it('EST déjà recettée — sous 768px la table devient une liste de cartes, composant PARTAGÉ (#2408.88, GA-28)', () => {
      const path = join(WEB_SRC, 'components', 'primitives', 'ResponsiveTable.test.tsx')
      expect(fileContains(path, 'rend des cartes sur un téléphone, sans tableau')).toBe(true)
    })
  })

  // ── NO-GO : jamais le même niveau ────────────────────────────────────────
  describe('NO-GO — jamais toutes les missions au même niveau (#2408.89)', () => {
    it('EST recettée — le tri par défaut différencie RÉELLEMENT l’ordre de rendu', () => {
      const path = join(WEB_SRC, 'features', 'missions', 'view', 'MissionsPage.test.tsx')
      expect(fileContains(path, 'le tri par défaut ne met jamais deux missions au même rang (#2408.89)')).toBe(true)
    })

    it('EST déjà recettée — la colonne Risques se lit SANS ouvrir le dossier (#2408.89)', () => {
      const path = join(WEB_SRC, 'features', 'missions', 'view', 'MissionsTable.test.tsx')
      expect(fileContains(path, 'nomme les risques quand il y en a')).toBe(true)
      expect(fileContains(path, 'dit « rien à signaler » sur une mission EN COURS sans risque')).toBe(true)
    })
  })

  // ── Design : table dense (#2408.82) ──────────────────────────────────────
  describe('design : table dense (#2408.82)', () => {
    it('la charpente STRUCTURELLE existe côté code (RAPPEL), mais le verdict de densité PERÇUE reste HUMAIN', () => {
      const path = join(WEB_SRC, 'features', 'missions', 'view', 'MissionsTable.test.tsx')
      // La contrainte qui rend une densité EXCESSIVE impossible : chaque
      // colonne porte une borne de largeur réelle, en rem (#1804).
      expect(fileContains(path, 'CHAQUE colonne affichée par défaut porte une borne de largeur réelle')).toBe(true)
      const protocol = join(WEB_SRC, '..', '..', '..', 'docs', 'missions-cockpit-recette-humaine.md')
      expect(fileContains(protocol, '#2408.82')).toBe(true)
      // Ce cas reste `retenu` tant qu'aucune session n'y est consignée.
      expect(fileContains(protocol, 'Aucune session consignée à ce jour')).toBe(true)
    })
  })

  // ── Design : couleur réservée aux exceptions, moitié ÉCRAN (#2408.85) ────
  describe('design : couleur réservée aux exceptions, moitié ÉCRAN ENTIER (#2408.85)', () => {
    it('la moitié CODABLE (cellule Risques) est prouvée ci-dessus ; la moitié ÉCRAN reste un protocole humain', () => {
      const protocol = join(WEB_SRC, '..', '..', '..', 'docs', 'missions-cockpit-recette-humaine.md')
      expect(fileContains(protocol, '#2408.85')).toBe(true)
      expect(fileContains(protocol, 'Couleur réservée aux exceptions')).toBe(true)
    })
  })

  // ── #2408.20 — notion CADRÉE par Louis le 31/10/2026 (L15) ─────────────────
  describe('exception « consultant non sécurisé » (#2408.20)', () => {
    it('EST une exception calculée : fin sous le seuil nommé, sans renouvellement ni placement', () => {
      // Revient sur la preuve d'ABSENCE d'avant le 31/10 : la notion n'était pas
      // cadrée. Elle l'est (arbitrage L15) — le calcul et ses NON vivent dans
      // `mission-exceptions-l15.test.ts` (contrats), jamais recopiés ici.
      expect(missionRiskSchema.options).toContain('consultant_unsecured')
      // `candidateSecurisation` reste un AUTRE objet (profils sourcés).
      expect(auditMaturityAxisIdValues).toContain('candidateSecurisation')
    })
  })
})
