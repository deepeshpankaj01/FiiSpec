'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { friendlyError } from '@/lib/firebase/callables';

const SERVER_FIELDS = ['createdAt', 'updatedAt', 'updatedBy', 'ingestionId', 'lastRun'];

function toEditableJson(initial: unknown): string {
  const clean = initial && typeof initial === 'object' ? Object.fromEntries(Object.entries(initial as Record<string, unknown>).filter(([k]) => !SERVER_FIELDS.includes(k))) : initial;
  return JSON.stringify(clean, null, 2);
}

interface Props<T extends z.ZodType> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  schema: T;
  initial: unknown;
  onSave: (record: z.infer<T>) => Promise<void>;
}

/** Mounted fresh each time the dialog opens, so its state initialises from `initial`. */
function EditorBody<T extends z.ZodType>({ onOpenChange, title, description, schema, initial, onSave }: Omit<Props<T>, 'open'>) {
  const [text, setText] = useState(() => toEditableJson(initial));
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      setIssues(['The text is not valid JSON.']);
      return;
    }
    const parsed = schema.safeParse(parsedJson);
    if (!parsed.success) {
      setIssues(parsed.error.issues.slice(0, 12).map((i) => `${i.path.join('.') || 'record'}: ${i.message}`));
      return;
    }
    setBusy(true);
    try {
      await onSave(parsed.data);
      toast.success('Saved. Verification has been reset — verify the record again against the official source.');
      onOpenChange(false);
    } catch (e) {
      setIssues([friendlyError(e)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <Textarea aria-label="Record JSON" value={text} onChange={(e) => setText(e.target.value)} rows={22} className="font-mono text-xs" spellCheck={false} />
      {issues.length ? (
        <ul role="alert" className="list-disc space-y-0.5 rounded-lg bg-danger-bg p-3 pl-6 text-xs text-danger">
          {issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : null}
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={busy}>
          {busy ? 'Saving…' : 'Validate and save'}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Admin record editor: edits the full record as JSON and validates it with the
 * canonical schema before sending. The server validates again and resets the
 * verification status on any content change.
 */
export function JsonRecordDialog<T extends z.ZodType>({ open, ...rest }: Props<T>) {
  return (
    <Dialog open={open} onOpenChange={rest.onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">{open ? <EditorBody {...rest} /> : null}</DialogContent>
    </Dialog>
  );
}
