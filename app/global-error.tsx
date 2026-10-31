"use client";

import { DemoBanner } from "@/components/demo-banner";
import en from "@/messages/en.json";

import "./globals.css";

// Replaces the root layout when it fails, so next-intl is not available here.
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <DemoBanner text={en.Demo.banner} />
        <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
          <h1 className="font-heading text-3xl font-semibold">
            {en.Error.title}
          </h1>
          <p className="text-muted-foreground mt-2">{en.Error.body}</p>
          <button className="mt-4 underline" onClick={reset}>
            {en.Error.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
