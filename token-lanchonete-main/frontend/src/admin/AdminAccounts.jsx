import { useState } from "react";
import { api } from "../services/api.js";
import { useAsync, useDebounced } from "../lib/hooks.js";
import { AccountDetailModal } from "../components/AccountDetail.jsx";
import { AccountFilters, AccountsTable } from "../components/AccountsList.jsx";
import { ErrorState, PageHeader, Pagination, Panel, Spinner } from "../components/ui.jsx";

export function AdminAccounts() {
  const [filters, setFilters] = useState({ page: 1 });
  const debouncedSearch = useDebounced(filters.search || "");
  const params = { ...filters, search: debouncedSearch, pageSize: 15 };
  const { data, loading, error, reload } = useAsync(() => api.adminAccounts(params), [JSON.stringify(params)]);
  const [open, setOpen] = useState(null);

  return (
    <section>
      <PageHeader eyebrow="ADMINISTRAÇÃO" title="Contas" subtitle="Todas as contas de todos os usuários: filtre por nome, período e situação." />
      <Panel>
        <AccountFilters filters={filters} onChange={setFilters} showSearch />
        {loading && !data && <Spinner />}
        {error && !data && <ErrorState message={error} onRetry={reload} />}
        {data && (
          <>
            <AccountsTable rows={data.rows} showUser onOpen={account => setOpen(account.id)} totals={data.rows.length ? data.totals : null} />
            <Pagination page={data.page} pageSize={data.pageSize} count={data.count} onChange={page => setFilters({ ...filters, page })} />
          </>
        )}
      </Panel>
      {open && <AccountDetailModal admin accountId={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </section>
  );
}
