import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'BellumAI - Intelligence commerciale IA pour les ESN françaises'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '96px',
        background: 'linear-gradient(135deg, #2a1a5e 0%, #12101f 45%, #0a0a10 100%)',
        color: '#ffffff',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '40px' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '18px',
            background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
            display: 'flex',
          }}
        />
        <div style={{ fontSize: '40px', fontWeight: 700, letterSpacing: '-0.02em' }}>BellumAI</div>
      </div>
      <div style={{ fontSize: '68px', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.03em', maxWidth: '900px' }}>
        Intelligence commerciale IA pour les ESN
      </div>
      <div style={{ marginTop: '36px', fontSize: '32px', color: '#a1a1aa', maxWidth: '860px', lineHeight: 1.3 }}>
        Un nom d&apos;entreprise → dossier de conquête complet en 10 minutes.
      </div>
    </div>,
    size,
  )
}
