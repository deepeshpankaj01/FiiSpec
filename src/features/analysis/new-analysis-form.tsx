'use client';

import { ChevronDown, FileText, FileUp, Lock, MessageSquareText, Sparkles, UploadCloud, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CreateAnalysisSchema, type CreateAnalysisRequest } from '@shared/api';
import type { InputMode, SectorId } from '@shared/constants';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, SECTOR_LABELS, SECTORS, SUPPORTED_UPLOAD_TYPES } from '@shared/constants';
import { Field } from '@/components/fiispec/field';
import { NativeSelect } from '@/components/fiispec/native-select';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { api, friendlyError, uploadDocument } from '@/lib/firebase/callables';
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/utils';

const METHODS: { mode: InputMode; label: string; icon: typeof FileText; help: string }[] = [
  { mode: 'DESCRIPTION', label: 'Describe the product', icon: MessageSquareText, help: 'A sentence or two in plain language.' },
  { mode: 'SPECIFICATION', label: 'Paste a specification', icon: FileText, help: 'Technical specification or tender extract.' },
  { mode: 'DOCUMENT', label: 'Upload a document', icon: FileUp, help: `PDF or DOCX, up to ${MAX_UPLOAD_MB} MB.` },
];

const EXAMPLES = ['11 kW outdoor AC EV charger for public charging.', 'Mujhe public charging ke liye 11 kW EV charger ka tender banana hai.', '15 kW three phase induction motor, IE3, 415 V, 1500 rpm'];

export function validateFile(file: File): string | null {
  if (!(file.type in SUPPORTED_UPLOAD_TYPES)) return 'Unsupported format. Upload a PDF or DOCX file.';
  if (file.size === 0) return 'The file is empty.';
  if (file.size > MAX_UPLOAD_BYTES) return `The file is ${formatBytes(file.size)}; the limit is ${MAX_UPLOAD_MB} MB.`;
  return null;
}

export function NewAnalysisForm() {
  const router = useRouter();
  const ids = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<InputMode>('DESCRIPTION');
  const [description, setDescription] = useState('');
  const [specification, setSpecification] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [product, setProduct] = useState('');
  const [purpose, setPurpose] = useState('');
  const [categoryHint, setCategoryHint] = useState<SectorId | ''>('');
  const [procurementContext, setProcurementContext] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const pickFile = (f: File | undefined | null) => {
    if (!f) return;
    const problem = validateFile(f);
    setErrors((e) => ({ ...e, file: problem ?? '' }));
    setFile(problem ? null : f);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const request: CreateAnalysisRequest = {
      mode,
      form: {
        product: product.trim() || undefined,
        purpose: purpose.trim() || undefined,
        categoryHint: categoryHint || undefined,
        procurementContext: procurementContext.trim() || undefined,
        description: mode === 'DESCRIPTION' ? description.trim() : undefined,
        technicalSpecification: mode === 'SPECIFICATION' ? specification.trim() : undefined,
      },
      file: mode === 'DOCUMENT' && file ? { name: file.name, size: file.size, contentType: file.type as keyof typeof SUPPORTED_UPLOAD_TYPES } : undefined,
    };
    const parsed = CreateAnalysisSchema.safeParse(request);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.at(-1) === 'description' ? 'description' : issue.path.at(-1) === 'technicalSpecification' ? 'specification' : String(issue.path.at(-1) ?? 'form');
        next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitError(null);
    setSubmitting(true);
    try {
      const { analysisId, uploadPath } = await api.createAnalysis(parsed.data);
      if (mode === 'DOCUMENT' && file && uploadPath) {
        setUploadProgress(0);
        await uploadDocument(uploadPath, file, setUploadProgress);
      }
      router.push(`/analysis/${analysisId}`);
    } catch (e) {
      const message = friendlyError(e);
      toast.error(message);
      setSubmitError(uploadProgress !== null ? `The document upload failed: ${message}` : message);
      setSubmitting(false);
      setUploadProgress(null);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-navy-900">How would you like to provide the requirement?</legend>
        <div role="radiogroup" className="grid gap-3 sm:grid-cols-3">
          {METHODS.map((m) => {
            const selected = mode === m.mode;
            return (
              <button
                key={m.mode}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setMode(m.mode)}
                className={cn(
                  'flex items-start gap-3 rounded-xl border bg-white p-4 text-left transition-colors hover:border-navy-700/40',
                  selected && 'border-navy-900 ring-2 ring-navy-900/10',
                )}
              >
                <span className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-lg', selected ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-900')}>
                  <m.icon className="size-4" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-navy-900">{m.label}</span>
                  <span className="block text-xs text-muted-foreground">{m.help}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="rounded-xl border bg-white p-5">
        {mode === 'DESCRIPTION' ? (
          <Field id={`${ids}-description`} label="Describe what you need" hint="English, Hindi or Hinglish. Mention power, capacity, environment or use if you know them." error={errors.description}>
            <Textarea
              id={`${ids}-description`}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="I need an 11 kW outdoor EV charger for a public charging station."
              aria-invalid={Boolean(errors.description)}
              className="text-base"
            />
            <div className="flex flex-wrap gap-2 pt-1">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => setDescription(ex)} className="rounded-full border bg-muted/50 px-3 py-1 text-xs text-muted-foreground hover:border-navy-700/40 hover:text-navy-900">
                  {ex}
                </button>
              ))}
            </div>
          </Field>
        ) : null}

        {mode === 'SPECIFICATION' ? (
          <Field id={`${ids}-spec`} label="Technical specification" hint="Paste the technical section of the tender or your draft specification." error={errors.specification}>
            <Textarea
              id={`${ids}-spec`}
              rows={12}
              value={specification}
              onChange={(e) => setSpecification(e.target.value)}
              placeholder={'Supply of 60 kW DC fast charger…\nRated output: …\nEnclosure: …'}
              aria-invalid={Boolean(errors.specification)}
              className="font-mono text-sm"
            />
          </Field>
        ) : null}

        {mode === 'DOCUMENT' ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-navy-900">Tender or specification document</p>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pickFile(e.dataTransfer.files[0]);
              }}
              className={cn('flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors', dragging ? 'border-navy-700 bg-navy-50' : 'border-input bg-muted/30')}
            >
              <UploadCloud className="mb-2 size-8 text-navy-700" aria-hidden />
              <p className="text-sm font-medium">Drag and drop a PDF or DOCX here</p>
              <p className="text-xs text-muted-foreground">Text-based documents up to {MAX_UPLOAD_MB} MB. Scanned images are not yet supported.</p>
              <Button type="button" variant="outline" className="mt-4" onClick={() => fileInput.current?.click()}>
                Choose file
              </Button>
              <input
                ref={fileInput}
                type="file"
                className="sr-only"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => pickFile(e.target.files?.[0])}
                aria-label="Choose a PDF or DOCX file"
              />
            </div>
            {file ? (
              <div className="flex items-center justify-between rounded-lg border bg-white px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="size-4 shrink-0 text-navy-700" aria-hidden />
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                </span>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => setFile(null)} aria-label="Remove file">
                  <X />
                </Button>
              </div>
            ) : null}
            {errors.file ? (
              <p role="alert" className="text-xs font-medium text-danger">
                {errors.file}
              </p>
            ) : null}
          </div>
        ) : null}

        {mode !== 'DESCRIPTION' ? (
          <Field id={`${ids}-product`} label="Product" optional className="mt-5" hint="Helps FiiSpec identify the product category.">
            <Input id={`${ids}-product`} className="h-10" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="e.g. DC fast charger" />
          </Field>
        ) : null}

        <Collapsible className="mt-5">
          <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-medium text-navy-700 hover:underline">
            <ChevronDown className="size-4 transition-transform group-data-[panel-open]:rotate-180" aria-hidden /> Add context (optional)
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4 grid gap-4 sm:grid-cols-2">
            {mode === 'DESCRIPTION' ? (
              <Field id={`${ids}-product2`} label="Product" optional>
                <Input id={`${ids}-product2`} className="h-10" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="e.g. AC EV charger" />
              </Field>
            ) : null}
            <Field id={`${ids}-purpose`} label="Purpose" optional>
              <Input id={`${ids}-purpose`} className="h-10" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. public charging at municipal parking" />
            </Field>
            <Field id={`${ids}-category`} label="Industry / category" optional>
              <NativeSelect id={`${ids}-category`} value={categoryHint} onChange={(e) => setCategoryHint(e.target.value as SectorId | '')}>
                <option value="">Let FiiSpec decide</option>
                {SECTORS.map((s) => (
                  <option key={s} value={s}>
                    {SECTOR_LABELS[s]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id={`${ids}-context`} label="Procurement context" optional className="sm:col-span-2">
              <Input id={`${ids}-context`} className="h-10" value={procurementContext} onChange={(e) => setProcurementContext(e.target.value)} placeholder="e.g. open tender by a municipal corporation, supply-install-commission" />
            </Field>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div className="flex gap-3 rounded-xl border bg-muted/40 p-4 text-xs text-muted-foreground">
        <Lock className="mt-0.5 size-4 shrink-0 text-navy-700" aria-hidden />
        <p>
          Your input and any uploaded document are stored privately for your organisation and are visible only to its members. When AI assistance is enabled, the text is sent to the configured AI model provider for processing. Recommendations are decision support and must be verified against current official requirements.
        </p>
      </div>

      {uploadProgress !== null ? (
        <div className="space-y-1" role="status" aria-live="polite">
          <p className="text-sm font-medium">Uploading document… {uploadProgress}%</p>
          <Progress value={uploadProgress} />
        </div>
      ) : null}

      {submitError ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger">
          {submitError} You can adjust the input and try again.
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" size="lg" className="h-11 px-6 text-base" disabled={submitting}>
          <Sparkles aria-hidden /> {submitting ? (uploadProgress !== null ? 'Uploading…' : 'Starting analysis…') : 'Analyze with FiiSpec'}
        </Button>
      </div>
    </form>
  );
}
