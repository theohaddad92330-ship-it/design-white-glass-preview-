import { memo, type ReactNode } from 'react'
import { MenuLayout } from './menu-layout'
import { Page } from './page'

export type MenuPageProps = {
  /**
   * Displayed when the menu is open (always open on desktop).
   */
  menuBody: ReactNode
  /**
   * Content of the page.
   */
  pageContent: ReactNode
  /** Optional full-width banner pinned at the top of the content card. */
  banner?: ReactNode
  /** Optional full-width footer rendered under the content card. */
  footer?: ReactNode
}

/**
 * MenuPage — `Page` + `MenuLayout` composed together. The standard top-level
 * shell for authenticated screens that need a left-side navigation menu.
 */
export const MenuPage = memo<MenuPageProps>(function MenuPage({ menuBody, pageContent, banner, footer }) {
  return (
    <Page>
      <MenuLayout menuBody={menuBody} pageContent={pageContent} banner={banner} footer={footer} />
    </Page>
  )
})
