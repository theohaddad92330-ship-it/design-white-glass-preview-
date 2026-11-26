import { useEffect, useState } from 'react'

/**
 * L'heure qu'il est, qui AVANCE.
 *
 * Un écran « Ma journée » calculé une fois au chargement vieillit sans le dire :
 * à 9 h 05 il annonce encore « dans 20 minutes » un rendez-vous qui a commencé,
 * et le bouton « Rejoindre » ne se met jamais en avant. Le rendu doit donc
 * dépendre d'une horloge, pas de l'instant du montage.
 *
 * Trente secondes par défaut : la seconde ne sert à rien pour des rendez-vous
 * et ferait rendre l'arbre soixante fois plus souvent pour un affichage
 * identique. Le compte à rebours d'un rendez-vous imminent peut demander un
 * pas plus court en passant `intervalMs`.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    // Un onglet laissé ouvert pendant une réunion revient au premier plan avec
    // une heure périmée : on la remet à jour au retour plutôt que d'attendre le
    // prochain battement.
    const onFocus = () => setNow(new Date())
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [intervalMs])

  return now
}
