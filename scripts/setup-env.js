const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const envPath = path.join(__dirname,'..','.env');
const examplePath = path.join(__dirname,'..','.env.example');

// Check if .env already exists
if (fs.existsSync(envPath)) {
    console.log('⚠️  .env already exists. Skipping generation to avoid overwriting your secrets.');
    console.log('   If you want to regenerate it, please delete .env first.');
    process.exit(0);
}

// Check if .env.example exists
if (!fs.existsSync(examplePath)) {
    console.error('❌ .env.example not found! Cannot generate .env.');
    process.exit(1);
}

console.log('Generating secure keys...');

// Generate AUTH_SECRET (32 bytes base64)
const authSecret = crypto.randomBytes(32).toString('base64');
console.log('✅ Generated AUTH_SECRET');

// Generate PRISMA_FIELD_ENCRYPTION_KEY using cloak
// We use npx cloak generate and parse the output because cloak uses a specific format (k1.aesgcm256...)
let cloakKey = '';
try {
    const cloakOutput = execSync('npx cloak generate',{ encoding: 'utf-8',stdio: 'pipe' });
    // Output format looks like: "Key:          k1.aesgcm256...."
    const match = cloakOutput.match(/Key:\s+(k1\.aesgcm256\.[a-zA-Z0-9+/=_-]+)/);
    if (match && match[1]) {
        cloakKey = match[1];
        console.log('✅ Generated PRISMA_FIELD_ENCRYPTION_KEY');
    } else {
        throw new Error('Could not parse cloak key from output');
    }
} catch (error) {
    console.error('❌ Failed to generate cloak key:',error.message);
    // Fallback or exit? Encrypted fields won't work without it.
    process.exit(1);
}

// Read .env.example and replace values
let content = fs.readFileSync(examplePath,'utf8');

content = content.replace(/^AUTH_SECRET=""/m,`AUTH_SECRET="${authSecret}"`);
content = content.replace(/^PRISMA_FIELD_ENCRYPTION_KEY=""/m,`PRISMA_FIELD_ENCRYPTION_KEY="${cloakKey}"`);

// Write to .env
fs.writeFileSync(envPath,content);

console.log('\n🚀 Successfully created .env with generated secrets!');
console.log('   You can now run "npm run dev" to start the application.');
