import { useCallback, useEffect, useRef, useState } from "react";

/** Carrega dados assíncronos com estados de carregamento/erro e recarga manual. */
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  const counter = useRef(0);
  const run = useCallback(() => {
    const id = ++counter.current;
    setState(current => ({ ...current, loading: true, error: "" }));
    return Promise.resolve()
      .then(loader)
      .then(data => { if (id === counter.current) setState({ data, loading: false, error: "" }); })
      .catch(error => { if (id === counter.current) setState(current => ({ data: current.data, loading: false, error: error.message })); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Rota baseada no hash da URL (#/admin/usuarios/123), sem dependências extras. */
export function useHashRoute(fallback) {
  const read = () => window.location.hash.replace(/^#\/?/, "") || fallback;
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const navigate = useCallback(next => { window.location.hash = `/${next}`; }, []);
  return [route, navigate];
}
