import { customAlphabet, nanoid } from 'nanoid';

const slugAlphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
const generateSlugCore = customAlphabet(slugAlphabet, 8);

const adjectives = [
  'dusk', 'misty', 'amber', 'velvet', 'silver', 'crimson', 'azure',
  'mellow', 'crystal', 'gentle', 'wild', 'lunar', 'aurora', 'frost',
];
const nouns = [
  'alps', 'meadow', 'harbor', 'forest', 'river', 'canyon', 'summit',
  'lagoon', 'orchard', 'plateau', 'prairie', 'valley', 'glacier',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function generateRoomSlug(): string {
  return `${pick(adjectives)}-${pick(nouns)}-${generateSlugCore().slice(0, 4)}`;
}

export function generateInviteToken(): string {
  return nanoid(24);
}

export function generateGuestId(): string {
  return `guest_${nanoid(16)}`;
}

export function generateAvatarSeed(): string {
  return nanoid(12);
}

/** Публичный id пользователя для URL профиля/диалога (url-safe, ~12 симв.). */
export function generatePublicId(): string {
  return nanoid(12);
}
