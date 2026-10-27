interface Props {
  date: string;
  busy: boolean;
  loading: boolean;
  error: string;
  onDate: (date: string) => void;
  onOptimize: () => void;
}

export function TopBar({ date, busy, loading, error, onDate, onOptimize }: Props): React.JSX.Element {
  return (
    <>
      <input type="date" value={date} onChange={(e) => e.target.value && onDate(e.target.value)} />{' '}
      <button onClick={onOptimize} disabled={busy}>
        {busy ? 'Running...' : 'Run optimization'}
      </button>
      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading...</p>}
    </>
  );
}
