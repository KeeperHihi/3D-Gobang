interface MatchPageProps {
  connectionStatus: "connecting" | "online" | "reconnecting" | "offline";
  isMatching: boolean;
  onStartMatch: () => void;
}

function statusText(status: MatchPageProps["connectionStatus"]): string {
  if (status === "online") {
    return "服务器在线，可立即匹配";
  }
  if (status === "reconnecting") {
    return "正在自动重连服务器";
  }
  if (status === "connecting") {
    return "正在连接服务器";
  }
  return "与服务器断开";
}

export function MatchPage({ connectionStatus, isMatching, onStartMatch }: MatchPageProps) {
  const disabled = connectionStatus !== "online" || isMatching;
  return (
    <main className="match-page">
      <div className="match-background-grid" />
      <div className="match-card">
        <p className="match-kicker">3D 联机对战</p>
        <h1>Nebula Cube 五子棋</h1>
        <p className="match-subtitle">
          旋转立方体，点击发光空位即可落子。任意空间方向连成 5 子立即获胜。
        </p>
        <p className="match-status">{statusText(connectionStatus)}</p>
        <button className="primary-button" type="button" onClick={onStartMatch} disabled={disabled}>
          {isMatching ? "正在匹配对手..." : "一键开始匹配"}
        </button>
      </div>
    </main>
  );
}
