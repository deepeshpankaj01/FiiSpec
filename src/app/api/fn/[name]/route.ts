import { after } from 'next/server';
import { handleCallable } from '@server/http/handlers';
import { setBackgroundScheduler } from '@server/lib/runtime';

// Background work (the analysis pipeline) keeps this invocation alive until it finishes.
setBackgroundScheduler(after);

// Vercel Hobby's ceiling; the pipeline stops itself earlier (PIPELINE_DEADLINE_MS).
export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<'/api/fn/[name]'>) {
  const { name } = await ctx.params;
  return handleCallable(name, request);
}
