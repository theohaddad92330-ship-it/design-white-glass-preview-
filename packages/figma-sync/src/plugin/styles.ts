import type { TokenSet } from '../extract/types'
import type { Log, SyncApi } from './api'
import { pickFont } from './plan'
import { findOrCreate } from './upsert'

/** Les sept styles de texte de tokens.css, nommés `text/<nom>`. */
export async function syncTextStyles(api: SyncApi, tokens: TokenSet, log: Log): Promise<void> {
  const available = await api.listAvailableFontsAsync()
  const existing = await api.getLocalTextStylesAsync()
  for (const t of tokens.textStyles) {
    const { fontName, fallback } = pickFont(available, t.fontFamily, t.fontWeight)
    if (fallback) log.warn(`text/${t.name} : ${fallback}`)
    await api.loadFontAsync(fontName)
    const style = findOrCreate(existing, `text/${t.name}`, () => api.createTextStyle())
    style.fontName = fontName
    style.fontSize = t.fontSize
    style.lineHeight = { unit: 'PERCENT', value: Math.round(t.lineHeight * 1000) / 10 }
    style.letterSpacing = { unit: 'PERCENT', value: Math.round(t.letterSpacingEm * 1000) / 10 }
    style.description = `${t.className} — ${t.fontFamily} ${t.fontWeight} ${t.fontSize}px/${t.lineHeight}, couleur var(${t.color})`
  }
  log.info(`Styles de texte : ${tokens.textStyles.length}`)
}

/**
 * Les ombres, une par MODE (`shadow/card/light`, `shadow/card/dark`) : un
 * style d'effet Figma n'a pas de modes, et les deux thèmes n'ont ni la même
 * opacité ni le même anneau de bordure.
 */
export async function syncEffectStyles(api: SyncApi, tokens: TokenSet, log: Log): Promise<void> {
  const existing = await api.getLocalEffectStylesAsync()
  for (const s of tokens.shadows) {
    for (const mode of ['light', 'dark'] as const) {
      const style = findOrCreate(existing, `shadow/${s.name}/${mode}`, () => api.createEffectStyle())
      style.effects = s[mode].map(
        (layer): DropShadowEffect => ({
          type: 'DROP_SHADOW',
          color: layer.color,
          offset: { x: layer.x, y: layer.y },
          radius: layer.blur,
          spread: layer.spread,
          visible: true,
          blendMode: 'NORMAL',
          showShadowBehindNode: false,
        }),
      )
      const refs = s[mode].flatMap(l => (l.ref ? [l.ref] : []))
      style.description = `${s.cssVar ?? s.className} (${mode})${refs.length ? ` — anneau résolu depuis ${refs.join(', ')}` : ''}`
    }
  }
  log.info(`Styles d'effet : ${tokens.shadows.length * 2} (${tokens.shadows.length} ombres × clair/sombre)`)
}
