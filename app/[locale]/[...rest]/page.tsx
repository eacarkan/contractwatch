import { notFound } from "next/navigation";

// Sends unknown paths to the translated not-found page inside the locale layout.
export default function CatchAll() {
  notFound();
}
