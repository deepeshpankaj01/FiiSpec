'use client';

import { ChevronDown, Download, FileText, FileType2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { api, downloadBase64, friendlyError } from '@/lib/firebase/callables';

export function ExportMenu({ analysisId }: { analysisId: string }) {
  const [busy, setBusy] = useState<'PDF' | 'DOCX' | null>(null);
  const exportAs = async (format: 'PDF' | 'DOCX') => {
    setBusy(format);
    try {
      const file = await api.exportReport({ analysisId, format });
      downloadBase64(file.fileName, file.mimeType, file.contentBase64);
      toast.success(`${format} report downloaded.`);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" disabled={busy !== null} />}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />} Export report <ChevronDown aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void exportAs('PDF')}>
          <FileText aria-hidden /> PDF report
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void exportAs('DOCX')}>
          <FileType2 aria-hidden /> Word (DOCX) report
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
