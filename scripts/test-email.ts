// ============================================================
// Test script — send a welcome email through src/lib/email
// to verify the Resend setup end-to-end.
//
// Usage:
//   npm run email:test                       # → default recipient below
//   npm run email:test -- someone@x.com      # → custom recipient
//
// Env: .env + .env.local are loaded by the npm script (see package.json).
// Note: tsconfig is "jsx": "preserve", so this file uses createElement
//       instead of JSX (Node can't run untransformed JSX).
// ============================================================
import { createElement } from 'react'
import { sendEmail } from '../src/lib/email'
import { WelcomeEmail } from '../src/emails/welcome-email'

const TO = process.argv[2] || 'cheungkaho90@gmail.com'

async function main() {
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev'
  console.log('→ sending test email')
  console.log(`  to:   ${TO}`)
  console.log(`  from: ${from}`)
  if (!process.env.RESEND_FROM) {
    console.log('  ⚠️  RESEND_FROM unset → using Resend test address,')
    console.log('     which only delivers to the account owner email.')
  }

  try {
    const result = await sendEmail({
      to: TO,
      subject: '[測試] 基智若愚 Email Service',
      react: createElement(WelcomeEmail, {
        studentName: '測試同學',
        className: '4A ICT',
        classCode: 'TEST01',
      }),
      tags: [{ name: 'env', value: 'test-script' }],
    })

    if (result.skipped) {
      console.log('\n⚠️  No-op — RESEND_API_KEY not set, nothing was sent.')
      console.log('    Set it in .env / .env.local and re-run.')
      return
    }

    console.log(`\n✅ Accepted by Resend — message id: ${result.id}`)
    console.log(`   Check ${TO} (incl. spam). Delivery may take a few seconds.`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`\n❌ Send failed: ${msg}`)
    if (/testing emails|own email|verified domain|from address|425|403/i.test(msg)) {
      console.error('\n💡 This almost always means:')
      console.error(`   - ${TO} is not the email registered on your Resend account, AND`)
      console.error('   - RESEND_FROM is unset → using onboarding@resend.dev,')
      console.error('     which Resend restricts to the account owner only.')
      console.error('   Fix: verify a sending domain in Resend and set RESEND_FROM,')
      console.error('   or test with your own Resend account email. See docs/email-service.md §2.')
    }
    process.exitCode = 1
  }
}

main()
