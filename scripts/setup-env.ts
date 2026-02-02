import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { generateKey } from '@47ng/cloak'

const envPath = path.join(process.cwd(), '.env')
const examplePath = path.join(process.cwd(), '.env.example')

// Check if .env already exists
if (fs.existsSync(envPath)) {
  console.log('⚠️  .env already exists. Skipping generation to avoid overwriting your secrets.')
  console.log('   If you want to regenerate it, please delete .env first.')
  process.exit(0)
}

// Check if .env.example exists
if (!fs.existsSync(examplePath)) {
  console.error('❌ .env.example not found! Cannot generate .env.')
  process.exit(1)
}

console.log('Generating secure keys...')
;(async () => {
  try {
    // Generate AUTH_SECRET (32 bytes base64)
    const authSecret = crypto.randomBytes(32).toString('base64')
    console.log('✅ Generated AUTH_SECRET')

    // Generate PRISMA_FIELD_ENCRYPTION_KEY using cloak library directly
    const cloakKey = await generateKey()
    console.log('✅ Generated PRISMA_FIELD_ENCRYPTION_KEY')

    // Generate CRON_SECRET (32 bytes base64)
    const cronSecret = crypto.randomBytes(32).toString('base64')
    console.log('✅ Generated CRON_SECRET')

    // Read .env.example and replace values
    let content = fs.readFileSync(examplePath, 'utf8')

    content = content.replace(/^AUTH_SECRET=""/m, `AUTH_SECRET="${authSecret}"`)
    content = content.replace(
      /^PRISMA_FIELD_ENCRYPTION_KEY=""/m,
      `PRISMA_FIELD_ENCRYPTION_KEY="${cloakKey}"`
    )
    content = content.replace(/^CRON_SECRET=""/m, `CRON_SECRET="${cronSecret}"`)

    // Write to .env
    fs.writeFileSync(envPath, content)

    console.log('\n🚀 Successfully created .env with generated secrets!')
    console.log('   You can now run "npm run dev" to start the application.')
  } catch (error) {
    console.error('❌ Failed to generate keys:', (error as Error).message)
    process.exit(1)
  }
})()
