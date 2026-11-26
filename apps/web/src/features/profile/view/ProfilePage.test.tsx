import { screen } from '@testing-library/react'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ProfilePage } from './ProfilePage'

// NOTE: assertions are async — TanStack Router resolves the initial route after
// the synchronous tick `render()` returns, so we poll until the tree settles.
describe('ProfilePage', () => {
  it('renders the loading skeleton while answers load', async () => {
    renderWithRouter(<ProfilePage />)
    expect(await screen.findByRole('status')).toBeInTheDocument()
  })
})
