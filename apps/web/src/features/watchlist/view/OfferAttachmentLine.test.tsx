import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { WatchlistItem } from '../model/watchlist'
import { OfferAttachmentLine } from './OfferAttachmentLine'

type Attachment = WatchlistItem['offerAttachment']

// #4437.5 — un intitulé inconnu (« Chargé de mission transverse ») ne reçoit AUCUN rattachement, et l'écran n'en affiche aucun.
describe('#4437.5 — OfferAttachmentLine', () => {
  it('SAIT DIRE NON : un intitulé non classé, sans type, ne fait aucune ligne', () => {
    const attachment: Attachment = {
      status: 'unclassified',
      fact_type: null,
      skills: [],
      job_family: null,
      extract: 'Chargé de mission transverse',
    }
    const { container } = render(<OfferAttachmentLine attachment={attachment} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByTestId('offer-attachment-chips')).toBeNull()
  })

  it('un intitulé reconnu montre sa compétence et sa famille', () => {
    const attachment: Attachment = {
      status: 'attached',
      fact_type: 'hiring',
      skills: ['AWS'],
      job_family: 'infrastructure_cloud',
      extract: 'Ingénieur Cloud AWS F/H',
    }
    render(<OfferAttachmentLine attachment={attachment} />)
    expect(screen.getByTestId('offer-attachment-chips')).toHaveTextContent('AWS')
  })
})
