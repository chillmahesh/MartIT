/**
 * Validates the static syntax, security structures, and constraints of Supabase SQL migrations.
 * NOTE: This is a static structural validator. It does NOT substitute for live PostgreSQL execution validation.
 * Run with: node scripts/validate-migrations.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.resolve(__dirname, '../supabase/migrations')

console.log('🔍 Checking Supabase migrations in:', migrationsDir)
console.log('ℹ️  Note: Running static structural checks (not live SQL execution validation).')

if (!fs.existsSync(migrationsDir)) {
  console.error('❌ Migrations directory does not exist:', migrationsDir)
  process.exit(1)
}

const files = fs.readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()

if (files.length === 0) {
  console.error('❌ No SQL migration files found.')
  process.exit(1)
}

console.log(`Found ${files.length} migration file(s):`)

let hasErrors = false

for (const file of files) {
  const filePath = path.join(migrationsDir, file)
  const content = fs.readFileSync(filePath, 'utf8')

  // Basic sanity checks
  if (content.trim().length === 0) {
    console.error(`❌ [${file}] Migration file is empty.`)
    hasErrors = true
    continue
  }

  // Check matching parens count
  const openParens = (content.match(/\(/g) || []).length
  const closeParens = (content.match(/\)/g) || []).length
  if (openParens !== closeParens) {
    console.warn(`⚠️ [${file}] Potential mismatched parentheses count: ${openParens} open, ${closeParens} close.`)
  }

  // Strip comments for semantic checks
  const codeOnly = content
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')

  // Check for prohibited floating point monetary types
  if (/float|double precision|real/i.test(codeOnly)) {
    console.error(`❌ [${file}] Prohibited floating-point type found in migration. Always use numeric or integer for money!`)
    hasErrors = true
  }

  // Check that SECURITY DEFINER functions set explicit search_path
  const secDefMatches = codeOnly.match(/SECURITY\s+DEFINER/gi) || []
  const searchPathMatches = codeOnly.match(/SET\s+search_path\s*=/gi) || []
  if (secDefMatches.length > 0 && searchPathMatches.length < secDefMatches.length) {
    console.error(`❌ [${file}] Found SECURITY DEFINER function(s) without explicit SET search_path!`)
    hasErrors = true
  }

  console.log(`  ✓ ${file} (${(content.length / 1024).toFixed(1)} KB) - valid`)
}

if (hasErrors) {
  console.error('\n❌ Migration validation failed.')
  process.exit(1)
}

console.log('\n✅ All SQL migrations statically verified successfully!')
