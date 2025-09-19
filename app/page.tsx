'use client';

import { useState } from 'react';
import UploadForm from '@/components/UploadForm';
import SummaryCard from '@/components/SummaryCard';
import ResultsTable from '@/components/ResultsTable';
import type { UploadResponse } from '@/lib/types';
import { Toaster } from 'sonner';
import { SECTION } from '@/lib/ui';
import ThemeToggle from '@/components/ThemeToggle';

export default function Page() {
  const [data, setData] = useState<UploadResponse | null>(null);

  return (
    <main className="mx-auto max-w-5xl p-6 md:p-10">
      <Toaster richColors position="top-right" />
      <div className={`${SECTION} flex items-start justify-between`}>
        <div>
          <h1 className="text-lg font-bold">Med Compare — Best Price by SKU</h1>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Drop supplier spreadsheets, enter a 13-digit SKU, and get the best MXN price.
          </p>
        </div>
        <ThemeToggle />
      </div>

      <div className="mt-6 grid gap-6">
        <UploadForm onResult={setData} />
        <SummaryCard data={data} />
        <ResultsTable data={data} />
      </div>
    </main>
  );
}
