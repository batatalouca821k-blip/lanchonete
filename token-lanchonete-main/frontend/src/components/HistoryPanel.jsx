import { useState } from "react";
import { api } from "../services/api.js";
import { useAsync } from "../lib/hooks.js";
import { AccountDetailModal } from "./AccountDetail.jsx";
import { AccountFilters, AccountsTable } from "./AccountsList.jsx";
import { ErrorState, Pagination, PageHeader, Panel, Spinner } from "./ui.jsx";

/** Histórico do cliente: contas pagas, em aberto e parcialmente pagas (nunca é apagado). */
export function HistoryPanel() {
  const [filters, setFilters] = useState({ page: 1 });
  const [open, setOpen] = useState(null);
  const { data, loading, error, reload } = useAsync(() => api.getMyHistory({ ...filters, pageSize: 10 }), [JSON.stringify(filters)]);

  return (
    <section>
      <PageHeader eyebrow="HISTÓRICO" title="Minhas contas" subtitle="Todas as suas contas, pagas ou em aberto, com itens e pagamentos." />
      <Panel>
        <AccountFilters filters={filters} onChange={setFilters} />
        {loading && !data && <Spinner />}
        {error && !data && <ErrorState message={error} onRetry={reload} />}
        {data && (
          <>
            <AccountsTable rows={data.rows} onOpen={account => setOpen(account.id)} totals={data.rows.length ? data.totals : null} />
            <Pagination page={data.page} pageSize={data.pageSize} count={data.count} onChange={page => setFilters({ ...filters, page })} />
          </>
        )}
      </Panel>
      {open && <AccountDetailModal accountId={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </section>
  );
}
