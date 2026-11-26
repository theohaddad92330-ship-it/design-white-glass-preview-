import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { isSupportedTimeZone } from '@bellum/contracts'
import { SelectField, Text } from '@bellum/ui'

/**
 * LE FUSEAU QUE CE NAVIGATEUR ANNONCE — décision de Louis du 14/09/2026.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OÙ LE REMPLISSAGE SE POSE, ET POURQUOI ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Le navigateur est le SEUL endroit du système qui connaisse le fuseau de la
 * personne. Restait à choisir QUAND le lire. Pas à la connexion : une écriture
 * de profil déclenchée par un chemin d'authentification est invisible pour
 * celle qu'elle décrit, et « une correction humaine gagne toujours » n'a plus
 * de sens si la détection s'écrit sans qu'on la voie — le jour où quelqu'un
 * travaille une semaine depuis un autre pays, son réglage serait réécrit dans
 * son dos. Ici, sur l'écran qui POSSÈDE le réglage : la valeur détectée est
 * PRÉ-REMPLIE et visible, le bouton « Enregistrer » est actif à l'arrivée, et
 * c'est un geste humain qui la confirme ou la remplace.
 *
 * Tant que personne n'a enregistré, la colonne reste `NULL` et le produit garde
 * son fuseau de référence nommé (Europe/Paris) — le comportement d'avant ce
 * lot, à l'identique, et non une devinette.
 *
 * ⚠️ `resolvedOptions()` peut lever (moteur dégradé, `Intl` amputé) : on rend
 * alors la chaîne vide, jamais « UTC » — un fuseau faux serait pire qu'un
 * fuseau absent, parce qu'il aurait l'air d'un choix.
 */
export function detectedTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return zone && isSupportedTimeZone(zone) ? zone : ''
  } catch {
    return ''
  }
}

/**
 * La liste des fuseaux proposés — celle de la PLATE-FORME, jamais une liste
 * écrite à la main (elle périmerait, et refuserait un jour un fuseau réel).
 *
 * ⚠️ `Intl.supportedValuesOf('timeZone')` ne rend que les fuseaux CANONIQUES :
 * mesuré le 14/09/2026, 418 entrées, et « America/Montreal » n'en fait PAS
 * partie — c'est un alias de « America/Toronto », que `Intl` accepte pourtant
 * parfaitement (`profile.timezone.test.ts`, contracts). D'où le `current` :
 * sans lui, un fuseau licite déjà enregistré disparaîtrait de l'écran qui le
 * montre, et le premier « Enregistrer » l'écraserait par un autre.
 */
function timeZoneOptions(current: string): { value: string; label: string }[] {
  let zones: string[] = []
  try {
    zones = [...Intl.supportedValuesOf('timeZone')]
  } catch {
    zones = []
  }
  if (current && !zones.includes(current)) zones.push(current)
  return zones.sort((a, b) => a.localeCompare(b)).map(zone => ({ value: zone, label: zone.replace(/_/g, ' ') }))
}

/**
 * Théo D settings-prefs.R3 — le fuseau, dans le bloc « Langue & dates » des
 * Préférences. Le champ ne sait ni lire ni écrire le profil : la vue qui le
 * monte porte l'état et l'enregistrement (un seul geste, « Enregistrer les
 * modifications »), le fuseau ENREGISTRÉ gagnant toujours sur la détection.
 */
export function TimezoneField({
  value,
  savedTimezone,
  onChange,
}: {
  value: string
  savedTimezone: string | null
  onChange: (next: string) => void
}) {
  const { t } = useTranslation('profile')
  const detected = detectedTimeZone()
  const options = useMemo(() => timeZoneOptions(value), [value])
  return (
    <div className="space-y-1.5">
      <SelectField
        value={value}
        onChange={onChange}
        options={options}
        ariaLabel={t('identity.timezoneLabel')}
        ariaDescribedBy="profile-timezone-hint"
        placeholder={t('identity.timezonePlaceholder')}
        className="max-w-xs"
      />
      <Text element="p" size="xs" id="profile-timezone-hint" className="text-[var(--bellum-text-secondary)]">
        {/* Deux phrases distinctes, et c'est voulu : « proposé d'après ton
            navigateur » n'est VRAI que tant que rien n'est enregistré. */}
        {savedTimezone === null && detected
          ? t('identity.timezoneDetectedHint', { timezone: detected })
          : t('identity.timezoneHint')}
      </Text>
    </div>
  )
}
