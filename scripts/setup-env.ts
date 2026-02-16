import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { generateKey } from '@47ng/cloak'
import { logger } from '../lib/logger'

const envPath = path.join(process.cwd(), '.env')
const examplePath = path.join(process.cwd(), '.env.example')

// Check if .env already exists
if (fs.existsSync(envPath)) {
  logger.info('⚠️  .env already exists. Skipping generation to avoid overwriting your secrets.')
  logger.info('   If you want to regenerate it, please delete .env first.')
  process.exit(0)
}

// Check if .env.example exists
if (!fs.existsSync(examplePath)) {
  logger.error('❌ .env.example not found! Cannot generate .env.')
  process.exit(1)
}

logger.info('Generating secure keys...')
;(async () => {
  try {
    // Generate AUTH_SECRET (32 bytes base64)
    const authSecret = crypto.randomBytes(32).toString('base64')
    logger.info('✅ Generated AUTH_SECRET')

    // Generate PRISMA_FIELD_ENCRYPTION_KEY using cloak library directly
    const cloakKey = await generateKey()
    logger.info('✅ Generated PRISMA_FIELD_ENCRYPTION_KEY')

    // Generate CRON_SECRET (32 bytes base64)
    const cronSecret = crypto.randomBytes(32).toString('base64')
    logger.info('✅ Generated CRON_SECRET')

    // Generate BACKUP_ENCRYPTION_KEY (32 bytes hex for GPG passphrase)
    const backupKey = crypto.randomBytes(32).toString('hex')
    logger.info('✅ Generated BACKUP_ENCRYPTION_KEY')

    // Read .env.example and replace values
    let content = fs.readFileSync(examplePath, 'utf8')

    content = content.replace(/^AUTH_SECRET=""/m, `AUTH_SECRET="${authSecret}"`)
    content = content.replace(
      /^PRISMA_FIELD_ENCRYPTION_KEY=""/m,
      `PRISMA_FIELD_ENCRYPTION_KEY="${cloakKey}"`
    )
    content = content.replace(/^CRON_SECRET=""/m, `CRON_SECRET="${cronSecret}"`)
    content = content.replace(/^BACKUP_ENCRYPTION_KEY=""/m, `BACKUP_ENCRYPTION_KEY="${backupKey}"`)

    // Write to .env
    fs.writeFileSync(envPath, content)

    logger.info('\n🚀 Successfully created .env with generated secrets!')
    logger.info('   You can now run "npm run dev" to start the application.')
  } catch (error) {
    logger.error({ err: error }, '❌ Failed to generate keys')
    process.exit(1)
  }
})()
