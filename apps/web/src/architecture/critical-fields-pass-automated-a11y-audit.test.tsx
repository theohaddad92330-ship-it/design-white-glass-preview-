/**
 * GA-377 — les champs partagés passent un audit `axe-core` automatisé
 * (#2436.16, en appui de #2436.2).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI ÉTAIT MESURÉ AVANT CE LOT
 * ─────────────────────────────────────────────────────────────────────────
 * Aucun `axe-core`/`jest-axe`/`@axe-core/*` n'existait sur `origin/main`
 * (`apps/web/src/styles/registre-2026-09-20-chat-lot4.md`, ligne 2436.16) — le
 * dépôt n'avait AUCUN test qui rejoue un moteur d'audit d'accessibilité
 * réel, seulement des gardes qui LISENT le JSX à la regex (GA-32, GA-375…).
 * Les deux techniques sont complémentaires : la regex sait dire « ce motif de
 * source est interdit », `axe-core` sait dire « ce DOM rendu viole une règle
 * WCAG », y compris des combinaisons qu'aucune regex n'anticipe.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE `jsdom` NE PEUT PAS JUGER — nommé plutôt que caché
 * ─────────────────────────────────────────────────────────────────────────
 * `color-contrast` demande un CANVAS réel pour mesurer un pixel peint ;
 * `jsdom` n'implémente pas `getContext('2d')` (mesuré : `Not implemented:
 * HTMLCanvasElement.prototype.getContext`). La règle reste TOUJOURS
 * `incomplete`, jamais franchement verte — le contraste réel est couvert par
 * ailleurs, `apps/web/src/styles/contrast.test.ts` (#2436.9), qui calcule le
 * ratio WCAG directement depuis les jetons CSS. Cette garde-ci désactive donc
 * `color-contrast` explicitement, plutôt que de laisser un `incomplete`
 * ambigu polluer le résultat.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Elle ne rejoue pas une page complète (routeur, requêtes réseau) : les
 * fragments audités sont les PRIMITIVES partagées par tous les formulaires
 * critiques (`@bellum/ui`), pas un écran entier — un audit de page appartient
 * à une suite Playwright humaine/CI séparée (#2436.17/.18), hors de portée
 * d'un test unitaire jsdom.
 */
import { render } from '@testing-library/react'
import axe, { type RunOptions } from 'axe-core'
import { describe, expect, it, vi } from 'vitest'
import { Button, FormField, FormTextareaField } from '@bellum/ui'

// `color-contrast` : voir le docblock — toujours `incomplete` sous jsdom,
// jamais un verdict fiable. Les autres règles par défaut restent actives.
const AXE_OPTIONS: RunOptions = { rules: { 'color-contrast': { enabled: false } } }

describe('GA-377 — audit axe-core des champs partagés', () => {
  it('un `<input>` icône-seule SANS nom accessible est bien détecté par axe (sait dire NON)', async () => {
    const { container } = render(
      <button type="button">
        <svg aria-hidden focusable="false" />
      </button>,
    )

    const results = await axe.run(container, AXE_OPTIONS)
    const ids = results.violations.map(v => v.id)
    expect(ids).toContain('button-name')
  })

  it('`FormField` sans erreur ne remonte AUCUNE violation', async () => {
    const { container } = render(
      <FormField label="Adresse e-mail" inputProps={{ value: '', onChange: vi.fn(), name: 'email' }} />,
    )

    const results = await axe.run(container, AXE_OPTIONS)
    // Corpus non vide : sinon la garde serait verte parce qu'elle n'a rien
    // regardé (cf. la sonde de mise en page sur corpus vide).
    expect(results.passes.length).toBeGreaterThan(0)
    expect(results.violations).toEqual([])
  })

  it('`FormField` EN ERREUR (label + `aria-describedby` + `role="alert"`) ne remonte AUCUNE violation', async () => {
    const { container } = render(
      <FormField
        label="Adresse e-mail"
        error="Cette adresse n'est pas valide"
        inputProps={{ value: 'x', onChange: vi.fn(), name: 'email' }}
      />,
    )

    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.passes.length).toBeGreaterThan(0)
    expect(results.violations).toEqual([])
  })

  it('`FormTextareaField` ne remonte AUCUNE violation', async () => {
    const { container } = render(
      <FormTextareaField label="Message" inputProps={{ value: '', onChange: vi.fn(), name: 'message' }} />,
    )

    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.passes.length).toBeGreaterThan(0)
    expect(results.violations).toEqual([])
  })

  it('un `Button` texte ordinaire ne remonte AUCUNE violation', async () => {
    const { container } = render(<Button onClick={vi.fn()}>Envoyer</Button>)

    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.passes.length).toBeGreaterThan(0)
    expect(results.violations).toEqual([])
  })
})
