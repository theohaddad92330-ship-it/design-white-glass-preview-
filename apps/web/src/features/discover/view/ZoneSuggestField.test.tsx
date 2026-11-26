import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { hasUnrecognizedZone, ZoneSuggestField } from './ZoneSuggestField'

function Harness({ kind, initial = '' }: { kind: 'city' | 'department'; initial?: string }) {
  const [value, setValue] = useState(initial)
  return <ZoneSuggestField kind={kind} value={value} onChange={setValue} placeholder="zone" />
}

// #4303 — taper « Lyon » => une liste ; une saisie bidon => « zone non reconnue », jamais une recherche muette.
describe('ZoneSuggestField', () => {
  it('#4303.1 — taper « Lyon » propose Lyon, et le choisir remplit le champ', async () => {
    render(<Harness kind="city" />)
    const input = screen.getByPlaceholderText('zone')
    await userEvent.type(input, 'Lyon')
    await userEvent.click(await screen.findByRole('option', { name: /^Lyon\s*69/ }))
    expect(input).toHaveValue('Lyon')
  })

  it('#4303.1 — département : « rhô » propose le Rhône, et choisir garde les codes déjà saisis', async () => {
    render(<Harness kind="department" initial="75, " />)
    const input = screen.getByPlaceholderText('zone')
    await userEvent.type(input, 'rhô')
    await userEvent.click(await screen.findByRole('option', { name: /^Rhône \(69\)/ }))
    expect(input).toHaveValue('75, 69')
  })

  it('#4303.2 — une ville inventée le DIT, sans proposition', async () => {
    render(<Harness kind="city" />)
    await userEvent.type(screen.getByPlaceholderText('zone'), 'Zorglubville')
    expect(screen.getByTestId('zone-unknown-city')).toHaveTextContent(/zone non reconnue/i)
  })

  it('#4303.2 — une ville du référentiel ne dit rien', async () => {
    render(<Harness kind="city" initial="Lyon" />)
    expect(screen.queryByTestId('zone-unknown-city')).toBeNull()
  })

  it('#4303.2 — hasUnrecognizedZone bloque la recherche sur une zone inventée, jamais sur un champ vide', () => {
    expect(hasUnrecognizedZone({ city: 'Zorglubville', department: '' })).toBe(true)
    expect(hasUnrecognizedZone({ city: '', department: '99' })).toBe(true)
    expect(hasUnrecognizedZone({ city: '', department: '' })).toBe(false)
    expect(hasUnrecognizedZone({ city: 'Lyon', department: '69, 75' })).toBe(false)
  })
})
