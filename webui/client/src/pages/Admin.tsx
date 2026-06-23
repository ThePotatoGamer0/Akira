import { CardPoolManager } from "../components/admin/CardPoolManager.js";
import { InitTrigger } from "../components/admin/InitTrigger.js";

export function AdminPage(props: {
  fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  return (
    <div>
      <h2 className="page-title">
        <span className="gradient-text">Admin</span>
      </h2>
      <InitTrigger fetchApi={props.fetchApi} />
      <CardPoolManager fetchApi={props.fetchApi} />
    </div>
  );
}
