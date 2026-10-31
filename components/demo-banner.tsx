/** Hatched like a "not for construction" stamp on a drawing. Required on every screen. */
export function DemoBanner({ text }: { text: string }) {
  return (
    <div role="note" className="demo-banner">
      <span className="demo-banner-text">{text}</span>
    </div>
  );
}
