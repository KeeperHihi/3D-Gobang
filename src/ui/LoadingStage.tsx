interface LoadingStageProps {
  title: string;
  detail: string;
}

export function LoadingStage({ title, detail }: LoadingStageProps) {
  return (
    <main className="loading-stage">
      <div className="loading-stage-grid" />
      <div className="loading-stage-card">
        <p className="loading-stage-kicker">NEBULA STREAM</p>
        <h2>{title}</h2>
        <p>{detail}</p>
        <div className="loading-stage-pulse-track">
          <span className="loading-stage-pulse-dot" />
          <span className="loading-stage-pulse-dot" />
          <span className="loading-stage-pulse-dot" />
        </div>
      </div>
    </main>
  );
}
