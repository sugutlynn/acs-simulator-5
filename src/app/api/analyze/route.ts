import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { AnalyzeResponse, ExtractedElement } from '@/lib/types';

const SYSTEM_PROMPT = `You are an expert in cognitive science and HCI.
Extract a feature vector for each distinct UI element from the interface.
Output ONLY a valid JSON array — no markdown, no explanation.
Each object: {"name":string,"v":number,"p":number,"d":number,"n":number,"r":number} all 0-1.
Identify 4-10 elements. For screenshots, focus on visually distinct regions.
Dimensions: v=visual prominence, p=spatial position (1=top/centre 0=bottom/edge), d=dynamic/animated, n=notification/alert signal, r=task relevance.
Example: [{"name":"Search bar","v":0.6,"p":0.8,"d":0,"n":0,"r":0.9}]`;

function friendlyError(raw: string): string {
  if (raw.includes('credit balance') || raw.includes('billing'))
    return 'Insufficient API credits. Top up at console.anthropic.com → Plans & Billing.';
  if (raw.includes('invalid x-api-key') || raw.includes('401'))
    return 'Invalid API key. Check your key at console.anthropic.com.';
  if (raw.includes('overloaded') || raw.includes('529'))
    return 'Anthropic API temporarily overloaded. Try again in a moment.';
  if (raw.includes('rate limit') || raw.includes('429'))
    return 'Rate limit reached. Wait a few seconds and try again.';
  if (raw.includes('image') && raw.includes('size'))
    return 'Image too large. Try a smaller screenshot (under 5MB).';
  return raw.slice(0, 200);
}

function sanitize(el: Partial<ExtractedElement>): ExtractedElement {
  const clamp = (v: unknown, def: number) => {
    const n = Number(v);
    return isNaN(n) ? def : Math.max(0, Math.min(1, n));
  };
  return {
    name: String(el.name || 'UI element').slice(0, 60),
    v: clamp(el.v, 0.5),
    p: clamp(el.p, 0.5),
    d: clamp(el.d, 0.0),
    n: clamp(el.n, 0.0),
    r: clamp(el.r, 0.5),
  };
}

export async function POST(req: NextRequest): Promise<NextResponse<AnalyzeResponse>> {
  try {
    const body = await req.json();
    const apiKey = process.env.ANTHROPIC_API_KEY || body.apiKey;

    if (!apiKey) {
      return NextResponse.json(
        { elements: [], error: 'No API key. Set ANTHROPIC_API_KEY in environment or enter one in the UI.' },
        { status: 400 }
      );
    }

    const client = new Anthropic({ apiKey });

    // ── Image mode (screenshot) ──────────────────────────────────────────────
    if (body.imageBase64) {
      const base64 = (body.imageBase64 as string).replace(/^data:image\/\w+;base64,/, '');
      const mediaType = (body.mediaType as string) || 'image/png';

      const message = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp', data: base64 },
            },
            {
              type: 'text',
              text: 'Analyze this screenshot and extract feature vectors for all significant UI elements. Pay attention to: notification badges, animated indicators, task-relevant content areas, navigation bars, ads, and promotional elements.',
            },
          ],
        }],
      });

      const raw = message.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('');
      const parsed = JSON.parse(raw.replace(/```json|```/gi, '').trim()) as Partial<ExtractedElement>[];
      return NextResponse.json({ elements: parsed.map(sanitize) });
    }

    // ── Text / URL mode ──────────────────────────────────────────────────────
    if (!body.prompt?.trim()) {
      return NextResponse.json({ elements: [], error: 'Prompt or image is required.' }, { status: 400 });
    }

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: body.prompt }],
    });

    const raw = message.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('');
    const parsed = JSON.parse(raw.replace(/```json|```/gi, '').trim()) as Partial<ExtractedElement>[];
    return NextResponse.json({ elements: parsed.map(sanitize) });

  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    console.error('[ACS analyze]', raw);
    return NextResponse.json({ elements: [], error: friendlyError(raw) }, { status: 500 });
  }
}
