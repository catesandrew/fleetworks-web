'use client'

import { useState } from 'react'
import type { SubmitEvent } from 'react'

interface FormState {
  name: string
  email: string
  company: string
  message: string
}

const initialState: FormState = {
  name: '',
  email: '',
  company: '',
  message: '',
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error'

function validate(form: FormState): string | null {
  if (form.name.trim().length === 0) {
    return 'Name is required.'
  }
  if (!EMAIL_PATTERN.test(form.email.trim())) {
    return 'Enter a valid email address.'
  }
  return null
}

export default function RequestDemoPage() {
  const [form, setForm] = useState<FormState>(initialState)
  const [status, setStatus] = useState<SubmitStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleChange =
    (field: keyof FormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }))
    }

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()

    const validationError = validate(form)
    if (validationError) {
      setStatus('error')
      setErrorMessage(validationError)
      return
    }

    setStatus('submitting')
    setErrorMessage(null)

    try {
      const response = await fetch('/api/demo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = (await response.json()) as { error?: string }

      if (!response.ok) {
        setStatus('error')
        setErrorMessage(data.error ?? 'Something went wrong. Please try again.')
        return
      }

      setStatus('success')
      setForm(initialState)
    } catch {
      setStatus('error')
      setErrorMessage('Could not reach the server. Please try again.')
    }
  }

  if (status === 'success') {
    return (
      <main style={{ padding: 'var(--fw-space-6)', maxWidth: 480 }}>
        <h1>Thanks for reaching out</h1>
        <p>We received your demo request and will be in touch shortly.</p>
      </main>
    )
  }

  return (
    <main style={{ padding: 'var(--fw-space-6)', maxWidth: 480 }}>
      <h1>Request a demo</h1>
      <p>Tell us a bit about your team and we&apos;ll follow up.</p>

      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div style={{ marginBottom: 'var(--fw-space-4)' }}>
          <label htmlFor="name" style={{ display: 'block', marginBottom: 'var(--fw-space-1)' }}>
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            value={form.name}
            onChange={handleChange('name')}
            required
            style={{
              width: '100%',
              padding: 'var(--fw-space-2)',
              borderRadius: 'var(--fw-radius-sm)',
              border: '1px solid var(--fw-color-border)',
            }}
          />
        </div>

        <div style={{ marginBottom: 'var(--fw-space-4)' }}>
          <label htmlFor="email" style={{ display: 'block', marginBottom: 'var(--fw-space-1)' }}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange('email')}
            required
            style={{
              width: '100%',
              padding: 'var(--fw-space-2)',
              borderRadius: 'var(--fw-radius-sm)',
              border: '1px solid var(--fw-color-border)',
            }}
          />
        </div>

        <div style={{ marginBottom: 'var(--fw-space-4)' }}>
          <label
            htmlFor="company"
            style={{ display: 'block', marginBottom: 'var(--fw-space-1)' }}
          >
            Company
          </label>
          <input
            id="company"
            name="company"
            type="text"
            value={form.company}
            onChange={handleChange('company')}
            style={{
              width: '100%',
              padding: 'var(--fw-space-2)',
              borderRadius: 'var(--fw-radius-sm)',
              border: '1px solid var(--fw-color-border)',
            }}
          />
        </div>

        <div style={{ marginBottom: 'var(--fw-space-5)' }}>
          <label
            htmlFor="message"
            style={{ display: 'block', marginBottom: 'var(--fw-space-1)' }}
          >
            Message
          </label>
          <textarea
            id="message"
            name="message"
            value={form.message}
            onChange={handleChange('message')}
            rows={4}
            style={{
              width: '100%',
              padding: 'var(--fw-space-2)',
              borderRadius: 'var(--fw-radius-sm)',
              border: '1px solid var(--fw-color-border)',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {status === 'error' && errorMessage ? (
          <p role="alert" style={{ color: '#B91C1C', marginBottom: 'var(--fw-space-4)' }}>
            {errorMessage}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={status === 'submitting'}
          style={{
            padding: 'var(--fw-space-2) var(--fw-space-4)',
            borderRadius: 'var(--fw-radius-sm)',
            border: 'none',
            background: 'var(--fw-color-ink)',
            color: 'var(--fw-color-paper)',
            cursor: status === 'submitting' ? 'not-allowed' : 'pointer',
          }}
        >
          {status === 'submitting' ? 'Sending…' : 'Request demo'}
        </button>
      </form>
    </main>
  )
}
