import { useState } from "react";
import { Archive, ArchiveRestore, ArrowLeft, KeyRound, MailCheck, PackagePlus, Trash2, UserPlus, Users } from "lucide-react";
import { api } from "../services/api.js";
import { useAsync, useDebounced } from "../lib/hooks.js";
import { date, dateTime, formatBrazilianDateInput, money, parseBrazilianDateInput } from "../lib/format.js";
import { AccountDetailModal } from "../components/AccountDetail.jsx";
import { ItemFormModal } from "../components/AccountForms.jsx";
import { AccountFilters, AccountsTable } from "../components/AccountsList.jsx";
import { Badge, Button, EmptyState, ErrorState, Field, Modal, PageHeader, Pagination, Panel, Spinner, StatCard, useFeedback } from "../components/ui.jsx";

const emptyForm = { name: "", cpf: "", birthDate: "", phone: "", email: "", password: "", role: "user" };

export function AdminUsers({ navigate }) {
  const { toast, confirm } = useFeedback();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showArchived, setShowArchived] = useState(false);
  const debounced = useDebounced(search);
  const { data, loading, error, reload } = useAsync(() => api.adminUsers({ search: debounced, archived: showArchived, page, pageSize: 15 }), [debounced, page, showArchived]);
  const [creating, setCreating] = useState(false);
  const [addingFor, setAddingFor] = useState(null);

  async function confirmEmail(user) {
    try { await api.confirmUserEmail(user.id); toast.success(`E-mail de ${user.name} confirmado.`); reload(); } catch (confirmError) { toast.error(confirmError.message); }
  }

  async function archive(user) {
    const answer = await confirm({
      title: "Arquivar usuário",
      danger: true,
      confirmLabel: "Arquivar usuário",
      message: `Arquivar ${user.name}? O acesso será bloqueado e as sessões encerradas. O histórico de contas e pagamentos será preservado. Você poderá restaurar o usuário depois.`
    });
    if (!answer) return;
    try {
      await api.archiveUser(user.id);
      toast.success(`${user.name} foi arquivado.`);
      reload();
    } catch (archiveError) {
      toast.error(archiveError.message);
    }
  }

  async function restore(user) {
    try {
      await api.restoreUser(user.id);
      toast.success(`${user.name} foi restaurado.`);
      reload();
    } catch (restoreError) {
      toast.error(restoreError.message);
    }
  }

  async function permanentlyDelete(user) {
    const answer = await confirm({
      title: "Excluir usuário permanentemente",
      danger: true,
      confirmLabel: "Excluir permanentemente",
      message: `Excluir ${user.name}, suas contas e itens sem possibilidade de restauração? Pagamentos não pendentes serão preservados sem vínculo com usuário ou conta. A exclusão será bloqueada se houver pagamentos pendentes.`
    });
    if (!answer) return;
    try {
      await api.permanentlyDeleteUser(user.id);
      toast.success(`${user.name} foi excluído permanentemente. Os pagamentos foram mantidos sem vínculo pessoal.`);
      reload();
    } catch (deleteError) {
      toast.error(deleteError.message);
    }
  }

  return (
    <section>
      <PageHeader eyebrow="ADMINISTRAÇÃO" title={showArchived ? "Usuários arquivados" : "Usuários"} subtitle={showArchived ? "Contas arquivadas não podem entrar no sistema. O histórico financeiro permanece preservado." : "Cadastre clientes, consulte as contas de cada um e lance itens."}
        actions={<>
          <Button icon={showArchived ? Users : Archive} onClick={() => { setShowArchived(current => !current); setPage(1); setSearch(""); }}>{showArchived ? "Ver ativos" : "Ver arquivados"}</Button>
          {!showArchived && <Button variant="primary" icon={UserPlus} onClick={() => setCreating(true)}>Cadastrar usuário</Button>}
        </>} />
      <Panel>
        <div className="filters" role="search">
          <div className="field grow"><label htmlFor="user-search">Buscar usuário</label><input id="user-search" type="search" placeholder="Nome, e-mail ou telefone" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></div>
        </div>
        {loading && !data && <Spinner />}
        {error && !data && <ErrorState message={error} onRetry={reload} />}
        {data && !data.rows.length && <EmptyState icon={showArchived ? Archive : Users} title={showArchived ? "Nenhum usuário arquivado" : "Nenhum usuário encontrado"} />}
        {data?.rows.length > 0 && (
          <div className="table-wrap">
            <table className="table responsive">
              <thead><tr><th scope="col">Usuário</th><th scope="col">Perfil</th><th scope="col" className="num">Saldo em aberto</th><th scope="col" className="num">Total pago</th><th scope="col">Última movimentação</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
              <tbody>
                {data.rows.map(user => (
                  <tr key={user.id}>
                    <td data-label="Usuário"><button className="link strong" onClick={() => navigate(`admin/usuarios/${user.id}`)}>{user.name}</button><small>{user.email}</small><small>{user.phone}</small></td>
                    <td data-label="Perfil"><Badge tone={user.role === "admin" ? "accent" : "muted"}>{user.role === "admin" ? "Administrador" : "Cliente"}</Badge>{showArchived && <Badge tone="warn">Arquivado</Badge>}{!showArchived && !user.emailVerified && <Badge tone="warn">E-mail pendente</Badge>}</td>
                    <td data-label="Saldo em aberto" className="num money">{money(user.openBalance)}<small>{user.unpaidAccounts} conta(s) aberta(s)</small></td>
                    <td data-label="Total pago" className="num money text-ok">{money(user.totalPaid)}</td>
                    <td data-label="Última movimentação">{user.lastActivity ? dateTime(user.lastActivity) : "—"}</td>
                    <td className="actions">
                      {showArchived
                        ? <>
                            <Button size="sm" icon={ArchiveRestore} onClick={() => restore(user)}>Restaurar</Button>
                            <Button size="sm" variant="ghost-danger" icon={Trash2} onClick={() => permanentlyDelete(user)}>Excluir permanentemente</Button>
                          </>
                        : <>
                            <Button size="sm" onClick={() => navigate(`admin/usuarios/${user.id}`)}>Ver contas</Button>
                            <Button size="sm" icon={PackagePlus} onClick={() => setAddingFor(user)}>Lançar item</Button>
                            {!user.emailVerified && <Button size="sm" icon={MailCheck} onClick={() => confirmEmail(user)}>Confirmar e-mail</Button>}
                            <Button size="sm" variant="ghost-danger" icon={Trash2} onClick={() => archive(user)}>Excluir</Button>
                          </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} count={data.count} onChange={setPage} />}
      </Panel>
      {creating && <CreateUserModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload(); }} />}
      {addingFor && <ItemFormModal userId={addingFor.id} onClose={() => setAddingFor(null)} onSaved={() => { setAddingFor(null); reload(); }} />}
    </section>
  );
}

function CreateUserModal({ onClose, onCreated }) {
  const { toast } = useFeedback();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setError("");
    const birthDate = parseBrazilianDateInput(form.birthDate);
    if (!birthDate) {
      setError("Informe uma data válida no formato DD/MM/AAAA.");
      return;
    }
    setSaving(true);
    try {
      const result = await api.createUser({ ...form, birthDate });
      toast.success(result.emailSent
        ? "Usuário cadastrado. O e-mail de confirmação foi enviado."
        : "Cadastro salvo, mas o e-mail de confirmação não foi enviado. O usuário está na lista como pendente; confirme manualmente ou revise o SMTP.");
      onCreated();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Cadastrar usuário" onClose={onClose}>
      <form onSubmit={submit} className="form-stack">
        <div className="form-row">
          <Field label="Nome completo" htmlFor="u-name" wide><input id="u-name" name="name" value={form.name} onChange={set} required /></Field>
        </div>
        <div className="form-row">
          <Field label="CPF" htmlFor="u-cpf"><input id="u-cpf" name="cpf" value={form.cpf} onChange={set} inputMode="numeric" placeholder="000.000.000-00" required /></Field>
          <Field label="Data de nascimento" htmlFor="u-birth"><input id="u-birth" name="birthDate" type="text" inputMode="numeric" autoComplete="bday" placeholder="DD/MM/AAAA" maxLength={10} value={form.birthDate} onChange={event => setForm(current => ({ ...current, birthDate: formatBrazilianDateInput(event.target.value) }))} required /></Field>
        </div>
        <div className="form-row">
          <Field label="Telefone" htmlFor="u-phone"><input id="u-phone" name="phone" type="tel" value={form.phone} onChange={set} placeholder="(00) 00000-0000" required /></Field>
          <Field label="E-mail" htmlFor="u-email"><input id="u-email" name="email" type="email" value={form.email} onChange={set} autoComplete="off" required /></Field>
        </div>
        <Field label="Perfil do usuário" htmlFor="u-role" hint="Administradores têm acesso ao painel e às funções de gestão.">
          <select id="u-role" name="role" value={form.role} onChange={set}>
            <option value="user">Cliente</option>
            <option value="admin">Administrador</option>
          </select>
        </Field>
        <Field label="Senha inicial" htmlFor="u-pass" hint="Mínimo de 8 caracteres. Repasse a senha diretamente ao cliente: ela não é enviada por e-mail."><input id="u-pass" name="password" type="password" minLength="8" value={form.password} onChange={set} autoComplete="new-password" required /></Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" variant="primary" loading={saving}>Cadastrar</Button></div>
      </form>
    </Modal>
  );
}

export function AdminUserDetail({ userId, navigate }) {
  const { toast, confirm } = useFeedback();
  const [filters, setFilters] = useState({ page: 1 });
  const { data, loading, error, reload } = useAsync(() => api.adminUser(userId, { ...filters, pageSize: 10 }), [userId, JSON.stringify(filters)]);
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  const { profile, accounts } = data;

  async function archiveProfile() {
    const answer = await confirm({
      title: "Arquivar usuário",
      danger: true,
      confirmLabel: "Arquivar usuário",
      message: `Arquivar ${profile.name}? O acesso será bloqueado e as sessões encerradas. O histórico de contas e pagamentos será preservado. Você poderá restaurar o usuário depois.`
    });
    if (!answer) return;
    try {
      await api.archiveUser(profile.id);
      toast.success(`${profile.name} foi arquivado.`);
      navigate("admin/usuarios");
    } catch (archiveError) {
      toast.error(archiveError.message);
    }
  }

  async function restoreProfile() {
    try {
      await api.restoreUser(profile.id);
      toast.success(`${profile.name} foi restaurado.`);
      reload();
    } catch (restoreError) {
      toast.error(restoreError.message);
    }
  }

  async function permanentlyDeleteProfile() {
    const answer = await confirm({
      title: "Excluir usuário permanentemente",
      danger: true,
      confirmLabel: "Excluir permanentemente",
      message: `Excluir ${profile.name}, suas contas e itens sem possibilidade de restauração? Pagamentos não pendentes serão preservados sem vínculo com usuário ou conta. A exclusão será bloqueada se houver pagamentos pendentes.`
    });
    if (!answer) return;
    try {
      await api.permanentlyDeleteUser(profile.id);
      toast.success(`${profile.name} foi excluído permanentemente. Os pagamentos foram mantidos sem vínculo pessoal.`);
      navigate("admin/usuarios");
    } catch (deleteError) {
      toast.error(deleteError.message);
    }
  }

  return (
    <section>
      <PageHeader eyebrow="USUÁRIO" title={profile.name} subtitle={`${profile.email} · ${profile.phone} · ${profile.archived ? "arquivado" : `cliente desde ${date(profile.createdAt)}`}`}
        actions={<>
          <Button icon={ArrowLeft} onClick={() => navigate("admin/usuarios")}>Voltar</Button>
          {profile.archived
            ? <>
                <Button icon={ArchiveRestore} onClick={restoreProfile}>Restaurar usuário</Button>
                <Button variant="ghost-danger" icon={Trash2} onClick={permanentlyDeleteProfile}>Excluir permanentemente</Button>
              </>
            : <>
                <Button icon={KeyRound} onClick={() => setResettingPassword(true)}>Redefinir senha</Button>
                <Button variant="ghost-danger" icon={Trash2} onClick={archiveProfile}>Excluir usuário</Button>
                <Button variant="primary" icon={PackagePlus} onClick={() => setAdding(true)}>Lançar item</Button>
              </>}
        </>} />
      <div className="stat-grid">
        <StatCard label="Total faturado" value={money(profile.totalBilled)} />
        <StatCard label="Total pago" value={money(profile.totalPaid)} tone="ok" />
        <StatCard label="Saldo em aberto" value={money(profile.openBalance)} tone="accent" />
        <StatCard label="Contas" value={profile.accountsCount} />
      </div>
      <Panel title="Contas e histórico" subtitle="Nada é apagado: contas quitadas continuam aqui com seus itens e pagamentos.">
        <AccountFilters filters={filters} onChange={setFilters} />
        <AccountsTable rows={accounts.rows} onOpen={account => setOpen(account.id)} totals={accounts.rows.length ? accounts.totals : null} />
        <Pagination page={accounts.page} pageSize={accounts.pageSize} count={accounts.count} onChange={page => setFilters({ ...filters, page })} />
      </Panel>
      {open && <AccountDetailModal admin accountId={open} onClose={() => setOpen(null)} onChanged={reload} />}
      {adding && <ItemFormModal userId={userId} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
      {resettingPassword && <ResetPasswordModal user={profile} onClose={() => setResettingPassword(false)} onSaved={() => setResettingPassword(false)} />}
    </section>
  );
}

function ResetPasswordModal({ user, onClose, onSaved }) {
  const { toast } = useFeedback();
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.resetUserPassword(user.id, password);
      toast.success(`Senha de ${user.name} redefinida. As outras sessões foram encerradas.`);
      onSaved();
    } catch (resetError) {
      setError(resetError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Redefinir senha de ${user.name}`} onClose={onClose}>
      <form onSubmit={submit} className="form-stack">
        <p className="muted">Defina uma nova senha e repasse-a diretamente ao usuário. Por segurança, ela não será enviada por e-mail.</p>
        <Field label="Nova senha" htmlFor="reset-user-password" hint="Use de 8 a 128 caracteres. A senha não poderá ser consultada depois.">
          <input id="reset-user-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} required autoFocus />
        </Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" loading={saving}>Redefinir senha</Button>
        </div>
      </form>
    </Modal>
  );
}
