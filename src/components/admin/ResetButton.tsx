export function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      onClick={onClick}
    >
      Réinitialiser
    </button>
  );
}
