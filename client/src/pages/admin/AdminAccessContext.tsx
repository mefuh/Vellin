import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AdminMeResponse, AdminPermission } from '@vellin/shared';
import { adminAccessApi } from '../../api/adminAccess';

interface AdminAccessValue {
  me: AdminMeResponse | null;
  loading: boolean;
  error: string | null;
  /** Есть ли у текущего сотрудника указанное право. */
  can: (perm: AdminPermission) => boolean;
  /** Является ли текущий сотрудник Super Admin. */
  isSuperAdmin: boolean;
  reload: () => void;
}

const AdminAccessContext = createContext<AdminAccessValue | null>(null);

/**
 * Загружает `GET /admin/me` один раз и раздаёт роль + эффективный набор прав в
 * поддерево админки. Гейтинг на клиенте — только для UX; сервер перепроверяет
 * каждое действие независимо.
 */
export function AdminAccessProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<AdminMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    adminAccessApi
      .me()
      .then((data) => {
        setMe(data);
        setError(null);
      })
      .catch(() => setError('Не удалось загрузить права доступа'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => reload(), [reload]);

  const permSet = useMemo(() => new Set(me?.permissions ?? []), [me]);
  const can = useCallback((perm: AdminPermission) => permSet.has(perm), [permSet]);

  const value = useMemo<AdminAccessValue>(
    () => ({ me, loading, error, can, isSuperAdmin: me?.isSuperAdmin ?? false, reload }),
    [me, loading, error, can, reload],
  );

  return <AdminAccessContext.Provider value={value}>{children}</AdminAccessContext.Provider>;
}

export function useAdminAccess(): AdminAccessValue {
  const ctx = useContext(AdminAccessContext);
  if (!ctx) throw new Error('useAdminAccess must be used within AdminAccessProvider');
  return ctx;
}

/** Условный рендер по праву. fallback — что показать при отсутствии права. */
export function PermissionGate({
  perm,
  children,
  fallback = null,
}: {
  perm: AdminPermission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can } = useAdminAccess();
  return <>{can(perm) ? children : fallback}</>;
}
