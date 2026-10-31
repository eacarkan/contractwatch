// app/[locale]/layout.tsx renders <html>. This file exists because
// app/not-found.tsx requires a layout above it.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
