'use client';

import { Flag, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, friendlyError } from '@/lib/firebase/callables';

type Target = 'RECOMMENDATION' | 'GAP' | 'CERTIFICATION' | 'VERSION' | 'SPECIFICATION';

export function FeedbackButtons({ analysisId, targetType, targetId }: { analysisId: string; targetType: Target; targetId: string }) {
  const [sent, setSent] = useState<string | null>(null);
  const send = async (rating: 'HELPFUL' | 'NOT_HELPFUL' | 'INCORRECT') => {
    try {
      await api.submitFeedback({ analysisId, targetType, targetId, rating });
      setSent(rating);
      toast.success(rating === 'INCORRECT' ? 'Reported — an administrator will review it.' : 'Thanks for the feedback.');
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };
  if (sent) return <span className="text-xs text-muted-foreground">Feedback recorded</span>;
  return (
    <div className="flex items-center gap-1" aria-label="Feedback">
      <Button variant="ghost" size="icon-sm" onClick={() => void send('HELPFUL')} aria-label="Helpful" title="Helpful">
        <ThumbsUp />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={() => void send('NOT_HELPFUL')} aria-label="Not helpful" title="Not helpful">
        <ThumbsDown />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={() => void send('INCORRECT')} aria-label="Report as incorrect" title="Report as incorrect">
        <Flag />
      </Button>
    </div>
  );
}
