import { Leaderboard } from "../components/leaderboard/Leaderboard.js";

export function LeaderboardPage(props: {
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  return (
    <div>
      <h2 className="page-title">
        <span className="gradient-text">Leaderboard</span>
      </h2>
      <Leaderboard fetchApi={props.fetchApi} />
    </div>
  );
}
