
import crypto from 'node:crypto';

export interface IRacingEvent {
  externalId: string;
  name: string;
  startTime: string;
  track: string;
  description: string;
}

const MOCK_EVENTS: IRacingEvent[] = [
  {
    externalId: 'ir_12345',
    name: 'iRacing Bathurst 12 Hour (Mock)',
    startTime: '2026-02-07T12:00:00Z',
    track: 'Mount Panorama Circuit',
    description: 'Mock data. Set IRACING_CLIENT_ID/SECRET to sync real data.',
  }
];

function maskCredential(plain: string, salt: string): string {
  const normalizedSalt = salt.trim().toLowerCase();
  const combined = plain + normalizedSalt;
  const hash = crypto.createHash('sha256').update(combined).digest();
  return hash.toString('base64');
}

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.IRACING_CLIENT_ID;
  const clientSecret = process.env.IRACING_CLIENT_SECRET;
  const username = process.env.IRACING_USERNAME;
  const password = process.env.IRACING_PASSWORD;

  if (!clientId || !clientSecret || !username || !password) return null;

  try {
    const maskedSecret = maskCredential(clientSecret, clientId);
    const maskedPassword = maskCredential(password, username);

    const params = new URLSearchParams();
    params.append('grant_type', 'password_limited');
    params.append('username', username);
    params.append('password', maskedPassword);
    params.append('client_id', clientId);
    params.append('client_secret', maskedSecret);
    params.append('scope', 'iracing.auth');

    const response = await fetch('https://oauth.iracing.com/oauth2/token', {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.access_token;
  } catch (error) {
    return null;
  }
}

async function fetchFromIRacing(endpoint: string, token: string) {
  const response = await fetch(`https://members-ng.iracing.com${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) return null;
  const data = await response.json();
  if (data.link) {
    const dataResponse = await fetch(data.link);
    return dataResponse.json();
  }
  return data;
}

/**
 * Main entry point for fetching events.
 * Dispatches to real API if credentials are present, otherwise returns mock data.
 */
export async function fetchSpecialEvents(): Promise<IRacingEvent[]> {
  const token = await getAccessToken();

  if (!token) {
    return fetchMockEvents();
  }

  return fetchRealEvents(token);
}

async function fetchMockEvents(): Promise<IRacingEvent[]> {
  return [...MOCK_EVENTS];
}

async function fetchRealEvents(token: string): Promise<IRacingEvent[]> {
  try {
    const seasons = await fetchFromIRacing('/data/series/seasons', token);
    if (!seasons || !Array.isArray(seasons)) return [];

    const specialKeywords = [
      'special event', 'roar', '24h', '12h', '10h', '6h', '1000',
      'endurance', 'major', 'petit le mans', 'sebring 12',
      'bathurst 12', 'daytona 24', 'spa 24', 'nürburgring 24'
    ];

    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    const events: IRacingEvent[] = [];

    for (const season of seasons) {
      const name = season.season_name || '';
      const lowerName = name.toLowerCase();

      const isTeam = season.driver_changes || (season.max_team_drivers ?? 1) > 1;

      if (!isMatch(lowerName, isTeam, specialKeywords)) continue;
      if (!season.schedules) continue;

      for (const week of season.schedules) {
        const weekEnd = new Date(week.week_end_time || week.start_date);
        const weekStart = new Date(week.start_date);

        if (weekEnd > now && weekStart <= thirtyDaysFromNow) {
          let sessionStart = week.start_date;
          if (week.race_time_descriptors?.[0]?.session_times?.[0]) {
             sessionStart = week.race_time_descriptors[0].session_times[0];
          }

          events.push({
            externalId: `ir_${season.series_id}_${season.season_id}_w${week.race_week_num}`,
            name: week.race_week_num === 0 ? name : `${name} - Week ${week.race_week_num + 1}`,
            startTime: sessionStart,
            track: week.track?.track_name || 'TBA',
            description: season.schedule_description || name,
          });
        }
      }
    }

    return events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  } catch (error) {
    console.error('Failed to fetch from iRacing API:', error);
    return [];
  }
}

function isMatch(name: string, isTeam: boolean, keywords: string[]): boolean {
  if (name.includes('special event') || name.includes('roar before the 24')) return true;
  if (!isTeam) return false;
  return keywords.some(kw => name.includes(kw));
}
