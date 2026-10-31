import { DemoBanner } from "@/components/demo-banner";
import en from "@/messages/en.json";

import "./globals.css";

// Only reached by paths the locale proxy skips, so there is no locale to translate into.
export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body>
        <DemoBanner text={en.Demo.banner} />
        <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
          <h1 className="font-heading text-3xl font-semibold">
            {en.NotFound.title}
          </h1>
          <p className="text-muted-foreground mt-2">{en.NotFound.body}</p>
        </main>
      </body>
    </html>
  );
}
