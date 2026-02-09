'use client'

import { useState, useEffect } from 'react'
import styles from './changelog.module.css'

interface ChangelogContentProps {
  contentHtml: string
}

export default function ChangelogContent({ contentHtml }: ChangelogContentProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    if (copiedId) {
      const timer = setTimeout(() => setCopiedId(null), 2000)
      return () => clearTimeout(timer)
    }
  }, [copiedId])

  const handleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    const anchor = target.closest('.anchor-link') as HTMLAnchorElement

    if (anchor) {
      e.preventDefault()
      const url = new URL(window.location.host === '' ? 'http://localhost' : window.location.href)
      const href = anchor.getAttribute('href')
      if (href && href.startsWith('#')) {
        const id = href.replace('#', '')
        url.hash = id
        navigator.clipboard.writeText(url.toString())
        setCopiedId(id)

        // Show feedback
        const icon = anchor.querySelector('.icon')
        if (icon) {
          const original = icon.textContent
          icon.textContent = '✅'
          setTimeout(() => {
            if (icon) icon.textContent = original
          }, 2000)
        }
      }
    }
  }

  return (
    <div
      className={styles.content}
      dangerouslySetInnerHTML={{ __html: contentHtml }}
      onClick={handleClick}
    />
  )
}
