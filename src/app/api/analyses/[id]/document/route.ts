import { after } from 'next/server';
import { handleDocumentUpload } from '@server/http/handlers';
import { setBackgroundScheduler } from '@server/lib/runtime';

// Reading the document and the analysis pipeline run after the upload is acknowledged.
setBackgroundScheduler(after);

export const maxDuration = 300;

export async function PUT(request: Request, ctx: RouteContext<'/api/analyses/[id]/document'>) {
  const { id } = await ctx.params;
  return handleDocumentUpload(id, request);
}
