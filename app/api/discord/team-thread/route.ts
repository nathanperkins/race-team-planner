import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    { message: 'Team threads are created on save. No action needed.' },
    { status: 410 }
  )
}
