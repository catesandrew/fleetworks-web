import { Resend } from 'resend'
import { z } from 'zod'

const demoRequestSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().email('Enter a valid email address'),
  company: z.string().trim().optional(),
  message: z.string().trim().optional(),
})

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'Request body must be valid JSON.' },
      { status: 400 },
    )
  }

  const parsed = demoRequestSchema.safeParse(body)
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request.'
    return Response.json({ error: message }, { status: 400 })
  }

  const { name, email, company, message } = parsed.data

  const toEmail = process.env.DEMO_REQUEST_TO_EMAIL
  const apiKey = process.env.RESEND_API_KEY
  if (!toEmail || !apiKey) {
    console.error(
      'Demo request misconfigured: missing DEMO_REQUEST_TO_EMAIL or RESEND_API_KEY',
    )
    return Response.json(
      { error: 'Demo requests are not accepting submissions right now.' },
      { status: 503 },
    )
  }

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    from: 'Fleetworks Demo Requests <onboarding@resend.dev>',
    to: toEmail,
    replyTo: email,
    subject: `New demo request from ${name}`,
    text: [
      `Name: ${name}`,
      `Email: ${email}`,
      `Company: ${company ?? '(not provided)'}`,
      '',
      'Message:',
      message ?? '(not provided)',
    ].join('\n'),
  })

  if (error) {
    console.error('Failed to send demo request email:', error)
    return Response.json(
      { error: 'Could not send your request. Please try again shortly.' },
      { status: 502 },
    )
  }

  return Response.json({ ok: true })
}
