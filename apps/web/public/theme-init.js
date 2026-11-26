// #4605.7 — le thème choisi se pose sur <html> AVANT le premier peint. Servi par nous (script-src 'self').
// Même clé et même règle que `features/theme/theme-provider.tsx` : « dark » | « light » | « system » (le système décide).
// Aucun choix mémorisé : le système décide, comme le provider. Stockage illisible : la page garde son défaut sombre
// (`class="dark"` d'index.html).
;(function () {
  try {
    var stored = window.localStorage.getItem('bellum-theme')
    if (stored !== 'dark' && stored !== 'light') stored = 'system' // le défaut du provider
    var dark = stored === 'dark' || (stored === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
  } catch (error) {
    /* pas de stockage : le défaut de la page tient */
  }
})()
