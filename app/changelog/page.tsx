import fs from 'fs'
import path from 'path'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import headingId from 'remark-heading-id'
import autolinkHeadings from 'rehype-autolink-headings'
import styles from './changelog.module.css'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ChangelogContent from './ChangelogContent'

export default async function ChangelogPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const changelogPath = path.join(process.cwd(), 'CHANGELOG.md')
  const fileContents = fs.readFileSync(changelogPath, 'utf8')

  const processedContent = await unified()
    .use(remarkParse)
    .use(headingId)
    .use(remarkRehype)
    .use(autolinkHeadings, {
      behavior: 'append',
      properties: {
        className: ['anchor-link'],
        title: 'Copy link to heading',
      },
      content: {
        type: 'element',
        tagName: 'span',
        properties: { className: ['icon'] },
        children: [{ type: 'text', value: '🔗' }],
      },
    })
    .use(rehypeStringify)
    .process(fileContents)
  const contentHtml = processedContent.toString()

  return (
    <main className={styles.main}>
      <ChangelogContent contentHtml={contentHtml} />
    </main>
  )
}
