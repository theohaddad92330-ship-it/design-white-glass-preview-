import { describe, expect, it } from 'vitest'
import frChatbot from '../../../../messages/fr/chatbot.json'
import { pageSegment, proactiveTopicFor, type ProactiveTopic } from './proactive'

describe('message proactif (§5)', () => {
  it('retire le préfixe de langue — le piège de production', () => {
    // `/en/pricing` et `/pricing` sont la même page pour Laura.
    expect(pageSegment('/en/pricing')).toBe('pricing')
    expect(pageSegment('/pricing')).toBe('pricing')
    expect(pageSegment('/de/')).toBe('')
    expect(pageSegment('/')).toBe('')
  })

  it('reconnaît les pages, dans les deux langues d’URL', () => {
    expect(proactiveTopicFor('/')).toBe('home')
    expect(proactiveTopicFor('/nl/pricing')).toBe('pricing')
    // `/tarifs` n'est PAS servi par le site — le français est rendu à la
    // racine, sans traduire les chemins. Il tombe donc dans le silence des
    // pages inconnues, ce qui est exactement ce qu'on veut sur un 404.
    expect(proactiveTopicFor('/tarifs')).toBeNull()
    expect(proactiveTopicFor('/en/use-cases')).toBe('useCases')
  })

  it('se TAIT sur les pages légales', () => {
    // Interrompre quelqu'un qui lit la politique de confidentialité pour lui
    // vendre quelque chose est le meilleur moyen de perdre sa confiance.
    for (const page of ['/privacy', '/en/legal', '/cgv', '/cookies', '/de/status']) {
      expect(proactiveTopicFor(page)).toBeNull()
    }
  })

  it('se tait sur une page inconnue plutôt que de dire une généralité', () => {
    expect(proactiveTopicFor('/blog/un-article')).toBeNull()
  })

  it('a une traduction pour CHAQUE sujet qu’il peut rendre', () => {
    // Une accroche sans traduction s'affiche comme sa clé, en clair, sur la
    // page d'accueil.
    const topics: ProactiveTopic[] = ['home', 'pricing', 'product', 'useCases', 'demo', 'beta', 'about', 'webinar']
    for (const topic of topics) {
      expect(frChatbot.proactive[topic], `accroche manquante : ${topic}`).toBeTruthy()
    }
  })
})
