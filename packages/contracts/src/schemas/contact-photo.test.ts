import { describe, expect, it } from 'vitest'
import { isPlaceholderPhotoUrl, usablePhotoUrl } from './contact-photo.js'

describe('contact photo — ce qui EST une photo', () => {
  it('refuse la silhouette générique servie par le CDN d’actifs', () => {
    // L'URL EXACTE remontée par le retour bêta « il manque les photos de profil
    // systématiquement » : une image bien réelle, mais celle de personne.
    const ghost = 'https://static.licdn.com/aero-v1/sc/h/9c8pery4andzj6ohjkjp54ma2'
    expect(isPlaceholderPhotoUrl(ghost)).toBe(true)
    expect(usablePhotoUrl(ghost)).toBeNull()
  })

  it('garde une vraie photo de membre', () => {
    const real = 'https://media.licdn.com/dms/image/v2/D4E03AQ/profile-displayphoto/0/1700000000000?e=1234'
    expect(isPlaceholderPhotoUrl(real)).toBe(false)
    expect(usablePhotoUrl(real)).toBe(real)
  })

  it('garde la photo servie par le stockage du fournisseur d’enrichissement', () => {
    const apollo = 'https://zenprospect-production.s3.amazonaws.com/uploads/pictures/abc/picture'
    expect(usablePhotoUrl(apollo)).toBe(apollo)
  })

  it('rend null sur une entrée vide, et ne prend pas une URL illisible pour une silhouette', () => {
    expect(usablePhotoUrl(null)).toBeNull()
    expect(usablePhotoUrl('   ')).toBeNull()
    // « je ne sais pas lire » n'est pas « c'est un remplaçant » : refuser ici
    // supprimerait des photos valides sur une simple faute de forme.
    expect(isPlaceholderPhotoUrl('pas-une-url')).toBe(false)
    expect(usablePhotoUrl('pas-une-url')).toBe('pas-une-url')
  })

  it('compare l’hôte, pas la chaîne — aucun sous-domaine ne peut se faire passer pour le CDN d’actifs', () => {
    expect(isPlaceholderPhotoUrl('https://static.licdn.com.evil.example/x')).toBe(false)
    expect(isPlaceholderPhotoUrl('https://evil.example/static.licdn.com/x')).toBe(false)
    expect(isPlaceholderPhotoUrl('https://STATIC.LICDN.COM/aero-v1/sc/h/abc')).toBe(true)
  })
})
