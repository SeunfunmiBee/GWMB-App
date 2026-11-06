import type { CliqueSession } from '@/data/cliques';
import type { ContentItem } from '@/lib/admin-content';

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

function isCliqueProgramme(item: ContentItem) {
  const program = text(item.metadata.program).toLowerCase();
  return program === 'clique-fireside'
    || program === 'sister-circle'
    || Boolean(text(item.metadata.clique_id) || text(item.metadata.cliqueId));
}

export function publishedCliqueSessions(items: ContentItem[], now = new Date()): CliqueSession[] {
  return items
    .filter(item => item.content_type === 'event' && item.visible && item.starts_at && isCliqueProgramme(item))
    .filter(item => {
      const boundary = item.ends_at ?? item.starts_at;
      return Boolean(boundary && new Date(boundary).getTime() >= now.getTime());
    })
    .map(item => {
      const metadata = item.metadata ?? {};
      const program = text(metadata.program).toLowerCase();
      const format = text(metadata.format).toLowerCase();
      const inPerson = ['physical', 'in_person', 'in-person'].includes(format);
      const start = new Date(item.starts_at!);
      return {
        id: item.slug,
        cliqueId: text(metadata.clique_id) || text(metadata.cliqueId) || null,
        kind: program === 'sister-circle' ? 'Sister Circle' : 'National Fireside',
        title: item.title,
        topic: item.summary ?? '',
        startsAt: item.starts_at!,
        dateLabel: start.toLocaleString('en-NG', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
        }),
        location: text(metadata.venue) || text(metadata.location) || (inPerson ? 'Venue to be announced' : 'Online'),
        mode: inPerson ? 'In person' : 'Online',
        industry: text(metadata.industry) || text(metadata.career_field) || text(metadata.category) || 'GWMB Clique',
        tone: text(metadata.color) || text(metadata.tone) || '#A81455',
      } satisfies CliqueSession;
    })
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
}

export function nextCliqueSession(sessions: CliqueSession[], cliqueId: string) {
  return sessions.find(session => session.cliqueId === cliqueId) ?? null;
}
