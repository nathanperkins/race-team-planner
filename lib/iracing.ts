
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
    name: 'iRacing Bathurst 12 Hour',
    startTime: '2026-02-07T12:00:00Z',
    track: 'Mount Panorama Circuit',
    description: 'The premier GT3 endurance event in the land down under.',
  },
  {
    externalId: 'ir_67890',
    name: 'iRacing Nürburgring 24h',
    startTime: '2026-05-23T14:00:00Z',
    track: 'Nürburgring Combined',
    description: 'The ultimate test of man and machine on the Green Hell.',
  },
  {
    externalId: 'ir_99999',
    name: 'iRacing Petit Le Mans',
    startTime: '2026-10-10T15:00:00Z',
    track: 'Road Atlanta',
    description: '10 hours of intense multi-class racing at the classic Road Atlanta.',
  }
];

export async function fetchSpecialEvents(): Promise<IRacingEvent[]> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Later we can implement real OAuth/fetch logic here based on an ENV flag
  return MOCK_EVENTS;
}
