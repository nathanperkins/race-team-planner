import fs from 'fs'
import path from 'path'
import { remark } from 'remark'
import html from 'remark-html'
import styles from './changelog.module.css'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function ChangelogPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const changelogPath = path.join(process.cwd(), 'CHANGELOG.md')
  const fileContents = fs.readFileSync(changelogPath, 'utf8')

  const processedContent = await remark().use(html).process(fileContents)
  const contentHtml = processedContent.toString()

  return (
    <main className={styles.main}>
      <div className={styles.content} dangerouslySetInnerHTML={{ __html: contentHtml }} />
    </main>
  )
}
