import { handleSweepCron } from '@server/http/handlers';

// Scheduled in vercel.json (daily, the Hobby plan limit).
export const maxDuration = 60;

export async function GET(request: Request) {
  return handleSweepCron(request);
}
