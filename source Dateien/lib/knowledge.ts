import { KNOWLEDGE, KNOWLEDGE_DATE } from './generated/knowledge';

export type DocChunk = { page: string; url: string; text: string };

let cache: DocChunk[] | null = null;
let cacheStamp = 0;

function splitPages(text: string): { page: string; url: string; body: string }[] {
  const parts = text.split(/\n---\n/);
  const pages: { page: string; url: string; body: string }[] = [];
  for (const part of parts) {
    const titleMatch = part.match(/^#\s+(.+)$/m);
    const urlMatch = part.match(/https:\/\/instabox\.sh\/docs\/[^\s)]+\.md/);
    pages.push({
      page: titleMatch ? titleMatch[1].trim() : 'InstaBox',
      url: urlMatch ? urlMatch[0] : 'https://instabox.sh/llms.txt',
      body: part,
    });
  }
  return pages;
}

function chunk(text: string, size = 1800): string[] {
  const out: string[] = [];
  const lines = text.split('\n');
  let buffer = '';
  for (const line of lines) {
    if ((buffer + line).length > size && buffer) {
      out.push(buffer);
      buffer = '';
    }
    buffer += `${line}\n`;
  }
  if (buffer.trim()) out.push(buffer);
  return out;
}

async function loadDocs(): Promise<DocChunk[]> {
  if (cache && Date.now() - cacheStamp < 1000 * 60 * 30) return cache;
  let text = KNOWLEDGE;
  try {
    const response = await fetch('https://instabox.sh/llms-full.txt', {
      headers: { Accept: 'text/plain' },
    });
    if (response.ok) {
      const full = await response.text();
      if (full && full.length > 5000) text = full;
    }
  } catch (e) {
    // offline / blocked: use the bundled snapshot
  }
  const pages = splitPages(text);
  const chunks: DocChunk[] = [];
  pages.forEach((page) => {
    chunk(page.body).forEach((part) => chunks.push({ page: page.page, url: page.url, text: part }));
  });
  cache = chunks;
  cacheStamp = Date.now();
  return chunks;
}

function score(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  let total = 0;
  terms.forEach((term) => {
    const needle = term.toLowerCase();
    let index = lower.indexOf(needle);
    let hits = 0;
    while (index !== -1 && hits < 5) {
      hits++;
      index = lower.indexOf(needle, index + needle.length);
    }
    total += hits * (needle.length > 5 ? 3 : 1);
  });
  return total;
}

/** Searches the InstaBox documentation and returns the best matching excerpts. */
export async function searchDocs(query: string, limit = 4): Promise<{ page: string; url: string; excerpt: string }[]> {
  const chunks = await loadDocs();
  const terms = query
    .split(/[\s,.]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);
  if (!terms.length) return [];
  const scored = chunks
    .map((chunk) => ({ chunk, s: score(chunk.text, terms) }))
    .filter((entry) => entry.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit);
  return scored.map(({ chunk }) => ({
    page: chunk.page,
    url: chunk.url,
    excerpt: chunk.text.replace(/\n{3,}/g, '\n\n').trim().slice(0, 1800),
  }));
}

export const KNOWLEDGE_SNAPSHOT_DATE = KNOWLEDGE_DATE;
