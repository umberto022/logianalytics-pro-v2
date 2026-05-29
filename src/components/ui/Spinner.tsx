export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <div
      className="border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin"
      style={{ width: size, height: size }}
    />
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <Spinner size={40} />
    </div>
  );
}
