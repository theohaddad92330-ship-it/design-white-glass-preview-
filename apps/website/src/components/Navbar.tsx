'use client'

import { Box, BrandMark, Button, Text, cn } from '@bellum/ui'
import { motion, useScroll, useTransform } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { Link, usePathname } from '@/i18n/navigation'
import { loginUrl, signupUrl } from '@/lib/app-url'

const NAV_LINKS = [
  { key: 'product', href: '/product' },
  { key: 'useCases', href: '/use-cases' },
  { key: 'pricing', href: '/pricing' },
  { key: 'about', href: '/about' },
] as const

const LOGIN_LINK =
  'h-auto text-neutral-300 text-sm rounded-full shadow-none transition-colors hover:!bg-white/10 hover:!text-white'
const CTA =
  'h-auto rounded-full px-5 py-2 text-sm font-semibold text-white bg-gradient-to-br from-violet-600 to-indigo-600 transition-all hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(124,58,237,0.35)] hover:opacity-100'

const goToLogin = loginUrl()
const goToSignup = signupUrl()

function navigateTo(url: string) {
  window.location.assign(url)
}

export function Navbar() {
  const t = useTranslations('common.nav')
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const activeHref = NAV_LINKS.find(link => link.href === pathname)?.href ?? null
  const { scrollY } = useScroll()
  const surfaceOpacity = useTransform(scrollY, [0, 64], [0, 1])

  return (
    <Box as="header" className="fixed inset-x-0 top-0 py-2 z-50">
      <motion.div
        aria-hidden
        style={{ opacity: open ? 1 : surfaceOpacity }}
        className="pointer-events-none absolute inset-0 border-b border-white/[0.06]  backdrop-blur-lg"
      />

      <Box className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="shrink-0">
          <BrandMark size="md" logoClassName="text-white" textClassName="[font-family:'Clash_Display',sans-serif]" />
        </Link>

        <Box as="nav" className="absolute left-1/2 hidden -translate-x-1/2 xl:block">
          <Box className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur">
            {NAV_LINKS.map(link => {
              const isActive = link.href === activeHref
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  prefetch
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'relative rounded-full px-4 py-1.5 text-sm transition-colors',
                    isActive ? 'text-white' : 'text-zinc-400 hover:text-white',
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="navbar-active-pill"
                      className="absolute inset-0 rounded-full bg-white/10"
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    />
                  )}
                  <Text element="span" size="sm" className="relative z-10">
                    {t(link.key)}
                  </Text>
                </Link>
              )
            })}
          </Box>
        </Box>

        <Box className="hidden items-center gap-3 xl:flex">
          <LanguageSwitcher />
          <Button variant="ghost" className={LOGIN_LINK} onClick={() => navigateTo(goToLogin)}>
            {t('login')}
          </Button>
          <Button className={CTA} onClick={() => navigateTo(goToSignup)}>
            {t('signup')}
          </Button>
        </Box>

        <Button
          variant="ghost"
          size="icon"
          className="p-2 text-zinc-300 hover:bg-transparent hover:text-white xl:hidden"
          onClick={() => setOpen(!open)}
          aria-label={t('menu')}
          aria-expanded={open}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </Button>
      </Box>

      {open && (
        <Box className="relative flex flex-col gap-3 border-t border-white/[0.06] bg-[rgba(13,13,20,0.97)] p-4 xl:hidden">
          {NAV_LINKS.map(({ key, href }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={cn(
                'py-2 text-sm transition-colors',
                href === activeHref ? 'text-white' : 'text-zinc-300 hover:text-white',
              )}
            >
              <Text element="span" size="sm">
                {t(key)}
              </Text>
            </Link>
          ))}
          <div className="py-1">
            <LanguageSwitcher />
          </div>
          <Button
            variant="ghost"
            className={cn(LOGIN_LINK, 'justify-center py-2')}
            onClick={() => {
              setOpen(false)
              navigateTo(goToLogin)
            }}
          >
            {t('login')}
          </Button>
          <Button
            className={cn(CTA, 'text-center')}
            onClick={() => {
              setOpen(false)
              navigateTo(goToSignup)
            }}
          >
            {t('signup')}
          </Button>
        </Box>
      )}
    </Box>
  )
}
