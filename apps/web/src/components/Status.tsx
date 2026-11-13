import { ApiError } from '../lib/api'

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <p className="muted status">{label}</p>
}

export function ErrorMessage({ error }: { error: unknown }) {
  const text =
    error instanceof ApiError
      ? error.status >= 500
        ? 'The server had a problem. Is the API running?'
        : error.message
      : 'Could not reach the API. Is it running on port 3000?'
  return (
    <p className="status error" role="alert">
      {text}
    </p>
  )
}
