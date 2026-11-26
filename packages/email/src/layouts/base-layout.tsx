import { Body, Column, Container, Head, Html, Link, Preview, Row, Tailwind, Text } from '@react-email/components'
import * as React from 'react'

import { BrandHeader } from '../components/brand-header.js'
import { BrandLogo } from '../components/brand-logo.js'

type BaseLayoutProps = {
  previewText: string
  children: React.ReactNode
  unsubscribeUrl?: string
}

const SYSTEM_SANS_FALLBACK = [
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  'Roboto',
  '"Helvetica Neue"',
  'Arial',
  'sans-serif',
]
const SYSTEM_MONO_FALLBACK = ['ui-monospace', '"SF Mono"', 'Menlo', 'Consolas', '"Liberation Mono"', 'monospace']

const tailwindConfig = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', ...SYSTEM_SANS_FALLBACK],
        mono: ['"Geist Mono"', ...SYSTEM_MONO_FALLBACK],
      },
    },
  },
}

const FONT_FACE_CSS = `
@font-face {
  font-family: 'Geist';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('https://cdn.jsdelivr.net/npm/geist@1/dist/fonts/geist-sans/Geist-Variable.woff2') format('woff2');
}
@font-face {
  font-family: 'Geist Mono';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('https://cdn.jsdelivr.net/npm/geist@1/dist/fonts/geist-mono/GeistMono-Variable.woff2') format('woff2');
}
`

/** Linear-inspired wrapper. The `<Tailwind>` wrapper turns `className` into
 *  inline styles at render time. The `@font-face` declared in `<Head>` is
 *  honoured by Apple Mail and iOS Mail; other clients fall back through
 *  the Tailwind `fontFamily.sans` system stack. */
export function BaseLayout({ previewText, children, unsubscribeUrl }: BaseLayoutProps) {
  return (
    <Html>
      <Head>
        <style>{FONT_FACE_CSS}</style>
      </Head>
      <Preview>{previewText}</Preview>
      <Tailwind config={tailwindConfig}>
        <Body className="m-0 p-0 bg-zinc-50 text-zinc-900 font-sans">
          <Container className="max-w-[600px] mx-auto mt-10 bg-white border border-solid border-zinc-200 rounded-xl p-10">
            <BrandHeader />
            {children}
          </Container>

          <Container className="max-w-[600px] mx-auto mt-4 mb-10 px-2">
            <Row>
              <Column className="align-middle">
                <table cellPadding={0} cellSpacing={0} role="presentation">
                  <tbody>
                    <tr>
                      <td className="pl-2 align-middle">
                        <Text className="m-0 text-[13px] leading-4 text-zinc-500">Bellum AI.</Text>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Column>
              {unsubscribeUrl ? (
                <Column align="right" className="align-middle">
                  <Link href={unsubscribeUrl} className="text-[13px] text-violet-500 no-underline">
                    Se désabonner
                  </Link>
                </Column>
              ) : null}
            </Row>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
