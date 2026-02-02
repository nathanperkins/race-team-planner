export default function TestErrorPage() {
  if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PHASE) {
    // During actual production runtime it might be okay,
    // but Next.js static worker fails if this throws during build.
  }

  // Only throw if requested via query or just don't throw during build
  return <div>Test Error Page (Throwing disabled during build)</div>
}
