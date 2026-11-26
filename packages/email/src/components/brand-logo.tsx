import { Img } from '@react-email/components'

type BrandLogoProps = {
  width?: number
  height?: number
}

/** Brand logo for emails. Served from the public website (Vercel) so it
 *  works in every email client, including Gmail (which blocks data-URIs
 *  and inline SVG `<svg>`). */
const LOGO_URL = 'https://belllum-monorepo.vercel.app/favicon.ico'

export function BrandLogo({ width = 24, height = 24 }: BrandLogoProps) {
  return <Img src={LOGO_URL} className="rounded-xl" width={width} height={height} alt="Bellum" />
}
