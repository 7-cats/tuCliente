/**
 * Store de la app. Mantiene la DB en memoria, la persiste en localStorage y expone
 * `run`, que ejecuta un caso de uso del dominio y muestra el error como toast si falla.
 *
 * Para pasar a un backend real basta con reemplazar este archivo por uno que llame a la API
 * (los casos de uso de src/domain ya están aislados de React).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DomainError } from '../domain/services';
import { DB_VERSION, type DB, type ID } from '../domain/types';
import { buildSeed } from './seed';

const KEY = 'tucliente:db';
const SESSION_KEY = 'tucliente:session';

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const db = JSON.parse(raw) as DB;
      if (db.version === DB_VERSION) return db;
    }
  } catch {
    /* storage no disponible o corrupto */
  }
  return buildSeed();
}

interface Session {
  businessId: ID;
  customerId?: ID;
}

function loadSession(db: DB): Session {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null;
    if (s && db.businesses.some((b) => b.id === s.businessId)) return s;
  } catch {
    /* noop */
  }
  return { businessId: db.businesses[0]?.id ?? '', customerId: db.customers[0]?.id };
}

export interface Toast {
  id: number;
  kind: 'ok' | 'error';
  text: string;
}

interface StoreValue {
  db: DB;
  session: Session;
  setSession: (patch: Partial<Session>) => void;
  /**
   * Ejecuta una transformación de la DB. Devuelve true si salió bien.
   * Si `ok` está presente, muestra ese mensaje de éxito.
   */
  run: (fn: (db: DB) => DB, ok?: string) => boolean;
  toast: (text: string, kind?: Toast['kind']) => void;
  toasts: Toast[];
  reset: () => void;
}

const Ctx = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(load);
  const [session, setSessionState] = useState<Session>(() => loadSession(db));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dbRef = useRef(db);
  dbRef.current = db;
  const seq = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      /* noop */
    }
  }, [db]);

  useEffect(() => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      /* noop */
    }
  }, [session]);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const run = useCallback(
    (fn: (db: DB) => DB, ok?: string) => {
      try {
        const next = fn(dbRef.current);
        dbRef.current = next;
        setDb(next);
        if (ok) toast(ok);
        return true;
      } catch (e) {
        if (e instanceof DomainError) toast(e.message, 'error');
        else {
          console.error(e);
          toast('Ocurrió un error inesperado', 'error');
        }
        return false;
      }
    },
    [toast],
  );

  const setSession = useCallback((patch: Partial<Session>) => setSessionState((s) => ({ ...s, ...patch })), []);

  const reset = useCallback(() => {
    const fresh = buildSeed();
    dbRef.current = fresh;
    setDb(fresh);
    setSessionState(loadSession(fresh));
    toast('Demo reiniciada con datos de ejemplo');
  }, [toast]);

  const value = useMemo(() => ({ db, session, setSession, run, toast, toasts, reset }), [db, session, setSession, run, toast, toasts, reset]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore fuera de StoreProvider');
  return v;
}

/** Comercio activo en el panel. */
export function useBusiness() {
  const { db, session } = useStore();
  const business = db.businesses.find((b) => b.id === session.businessId) ?? db.businesses[0]!;
  return business;
}
