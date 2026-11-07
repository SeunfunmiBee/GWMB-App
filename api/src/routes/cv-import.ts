// Reading CV text from an uploaded PDF/DOCX and from a public profile page
// (ports of the `parse-cv` and `parse-profile-url` Edge Functions). Nothing is stored here.
import { Buffer } from 'node:buffer';
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import { z } from 'zod';
import { body, HttpError, requireUser, router } from '../http';
import { enforceRateLimit } from '../rate-limit';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_PAGE_CHARS = 2_000_000;
const MAX_REDIRECTS = 5;

export const cvImport = router();
cvImport.use('*', requireUser);

cvImport.post('/file', async (c) => {
  await enforceRateLimit(c.env, c.get('userId'), 'cv_parse', 30, 3600);
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'Choose a PDF or DOCX file.');
  if (file.size > MAX_FILE_BYTES) throw new HttpError(413, 'Choose a file smaller than 10 MB.');
  const mime = file.type || mimeFromName(file.name);
  if (mime !== 'application/pdf' && mime !== DOCX) throw new HttpError(415, 'Only PDF and DOCX files are supported.');
  try {
    const text = cleanText(await readDocument(mime, await file.arrayBuffer()));
    if (text.length < 80) return c.json({ text, complete: false, warning: 'We could not confidently read enough text from this file. It may be scanned or image-based.' });
    return c.json({ text, complete: true });
  } catch (error) {
    console.warn('cv parse failed', error instanceof Error ? error.message : error);
    return c.json({ text: '', complete: false, warning: 'This file could not be read reliably. Paste the CV text so we do not analyse incomplete content.' });
  }
});

cvImport.post('/url', async (c) => {
  const input = await body(c, z.object({ url: z.string().trim().max(2048) }));
  await enforceRateLimit(c.env, c.get('userId'), 'cv_profile_url', 20, 3600);
  let url: URL;
  try { url = new URL(input.url); } catch { throw new HttpError(400, 'Enter a valid public URL.'); }
  if (/(^|\.)linkedin\.com$/i.test(url.hostname)) {
    return c.json({ error: 'LinkedIn does not allow reliable direct profile imports. Download your LinkedIn profile as a PDF and upload it instead.', linkedinPdfRequired: true }, 422);
  }
  const res = await fetchPublicPage(url);
  if (!res.ok) throw new HttpError(400, 'That page could not be opened.');
  if (!/text\/(html|plain)/i.test(res.headers.get('content-type') ?? '')) throw new HttpError(415, 'Use a public webpage containing your professional information.');
  const text = pageText((await res.text()).slice(0, MAX_PAGE_CHARS));
  if (text.length < 100) throw new HttpError(422, 'We could not find enough readable professional information on that page.');
  return c.json({ text: text.slice(0, 50_000) });
});

export async function readDocument(mime: string, bytes: ArrayBuffer) {
  if (mime === 'application/pdf') {
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: true });
    return text;
  }
  // mammoth's Node build reads `buffer`, its browser build `arrayBuffer`; give both so either bundle works.
  return (await mammoth.extractRawText({ buffer: Buffer.from(bytes), arrayBuffer: bytes } as { arrayBuffer: ArrayBuffer })).value;
}

export const cleanText = (text: string) => text.replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();

/** Follows redirects by hand so every hop is checked against private and local addresses. */
async function fetchPublicPage(start: URL) {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // Workers subrequests cannot reach private networks, so a name that resolves to a private address fails at fetch;
    // these checks also refuse literal IPs, local names and non-web ports on every hop.
    if (!['http:', 'https:'].includes(url.protocol) || (url.port && !['80', '443'].includes(url.port)) || url.username || url.password || isPrivateHost(url.hostname)) {
      throw new HttpError(400, 'Use a public website URL.');
    }
    let res: Response;
    try {
      res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { 'user-agent': 'GWMB-CV-Importer/1.0' } });
    } catch {
      throw new HttpError(400, 'That page could not be imported. Try an old CV or LinkedIn profile PDF instead.');
    }
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!location) return res;
    url = new URL(location, url);
  }
  throw new HttpError(400, 'That page redirects too many times.');
}

export function isPrivateHost(host: string) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')
    || /^\d+(\.\d+){3}$/.test(h) || h.includes(':') || !h.includes('.');
}

function pageText(html: string) {
  return decodeEntities(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
}

const decodeEntities = (value: string) =>
  value.replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&amp;/gi, '&');

const mimeFromName = (name: string) => (name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : name.toLowerCase().endsWith('.docx') ? DOCX : '');
