// ============================================================
// WelcomeEmail — example React Email template.
// Render it and pass the element to sendEmail():
//
//   import { WelcomeEmail } from '@/emails/welcome-email'
//   import { sendEmail } from '@/lib/email'
//
//   await sendEmail({
//     to: student.email,
//     subject: `歡迎加入 ${className}`,
//     react: <WelcomeEmail studentName={name} className={name} classCode={code} />,
//   })
// ============================================================
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import React from 'react'

export interface WelcomeEmailProps {
  studentName: string
  className: string
  classCode: string
  appUrl?: string
}

export function WelcomeEmail({
  studentName,
  className,
  classCode,
  appUrl = process.env.NEXT_PUBLIC_APP_URL,
}: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        歡迎加入 {className}！你的班級代碼：{classCode}
      </Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={h1}>歡迎，{studentName}！</Heading>
          <Text style={text}>
            你已成功加入 <strong>{className}</strong>。以下是你的班級代碼，請妥善保存：
          </Text>
          <Section style={codeBox}>
            <Text style={codeText}>{classCode}</Text>
          </Section>
          <Button style={button} href={appUrl || '#'}>
            開始學習
          </Button>
          <Hr style={hr} />
          <Text style={footer}>AI 大智若愚 · 香港中學智能學習平台</Text>
        </Container>
      </Body>
    </Html>
  )
}

export default WelcomeEmail

// React Email uses inline styles (no CSS classes — most clients strip them)
const body = { backgroundColor: '#f6f9fc', margin: 0 }
const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '24px',
  maxWidth: '560px',
}
const h1 = { color: '#1d1d1f', fontSize: '24px', fontWeight: 700, margin: '0 0 16px' }
const text = { color: '#425466', fontSize: '15px', lineHeight: '24px' }
const codeBox = {
  backgroundColor: '#f4f4f5',
  borderRadius: '8px',
  padding: '16px',
  textAlign: 'center' as const,
  margin: '16px 0',
}
const codeText = {
  fontSize: '22px',
  fontWeight: 700,
  letterSpacing: '2px',
  margin: 0,
  fontFamily: 'monospace',
}
const button = {
  backgroundColor: '#2563eb',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 600,
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '12px 20px',
}
const hr = { borderColor: '#e6ebf1', margin: '24px 0' }
const footer = { color: '#8898aa', fontSize: '12px' }
