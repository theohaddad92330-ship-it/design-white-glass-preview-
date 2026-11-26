import { contactEnrichmentJobId } from './contact-enrichment.queue'

/**
 * BullMQ REJETTE (`Error: Custom Id cannot contain :`) tout jobId contenant un
 * `:` sauf s'il a exactement 3 segments — le `:` est son séparateur de clés
 * Redis. Un `enrich:<uuid>` (2 segments) sortait en 500 nu au premier clic. Ce
 * test reproduit la contrainte réelle du package pour qu'un futur format ne
 * puisse pas la réintroduire (les autres specs mockent la queue, donc ne la
 * verraient pas).
 */
function bullmqRejectsJobId(jobId: string): boolean {
  if (`${parseInt(jobId, 10)}` === jobId) return true // « Custom Id cannot be integers »
  if (jobId.includes(':') && jobId.split(':').length !== 3) return true // « … cannot contain : »
  return false
}

describe('contactEnrichmentJobId — accepté par BullMQ', () => {
  it("ne contient pas de ':' (ou en a exactement 3 segments)", () => {
    const id = contactEnrichmentJobId('fb010fcc-da66-4010-a7a7-95a4651444d5')
    expect(bullmqRejectsJobId(id)).toBe(false)
  })

  it("n'est pas un entier pur (autre rejet BullMQ)", () => {
    expect(bullmqRejectsJobId(contactEnrichmentJobId('12345'))).toBe(false)
  })

  it('reste déterministe par contact — deux clics visent le même job', () => {
    expect(contactEnrichmentJobId('c1')).toBe(contactEnrichmentJobId('c1'))
    expect(contactEnrichmentJobId('c1')).not.toBe(contactEnrichmentJobId('c2'))
  })
})
