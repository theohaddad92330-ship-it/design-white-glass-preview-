import { Section, Text } from '@react-email/components'

import { BrandLogo } from './brand-logo.js'

/** Brand mark — `BrandLogo` carries its own violet `fill`, so the `<td>`
 *  only handles vertical alignment and a fixed width to prevent collapse. */
export function BrandHeader() {
  return (
    <Section className="pb-8">
      <table cellPadding={0} cellSpacing={0} role="presentation">
        <tbody>
          <tr>
            <td width={32} className="align-middle leading-none">
              <BrandLogo width={32} height={32} />
            </td>
            <td className="pl-2.5 align-middle">
              <Text className="m-0 text-[18px] font-bold text-zinc-900 leading-8">Bellum</Text>
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  )
}
