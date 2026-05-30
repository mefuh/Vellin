import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DeviceSession } from '@vellin/shared';
import { Button, Chip, Icon } from '../../shared';
import { profileApi } from '../../api/profile';
import { ApiHttpError } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { useIsNarrow } from '../../hooks/useMediaQuery';
import { Card, StatusLine } from './ProfilePrimitives';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function DevicesSection() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const isNarrow = useIsNarrow();
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyOthers, setBusyOthers] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { sessions: list } = await profileApi.listSessions();
      setSessions(list);
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось загрузить устройства');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (s: DeviceSession) => {
    setError(null);
    setBusyId(s.id);
    try {
      await profileApi.revokeSession(s.id);
      if (s.current) {
        logout();
        navigate('/login', { replace: true });
        return;
      }
      setSessions((prev) => prev?.filter((x) => x.id !== s.id) ?? null);
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось завершить сессию');
    } finally {
      setBusyId(null);
    }
  };

  const revokeOthers = async () => {
    setError(null);
    setBusyOthers(true);
    try {
      await profileApi.revokeOtherSessions();
      setSessions((prev) => prev?.filter((x) => x.current) ?? null);
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось завершить сессии');
    } finally {
      setBusyOthers(false);
    }
  };

  const hasOthers = (sessions ?? []).some((s) => !s.current);

  return (
    <Card title="Устройства и входы" desc="Активные сессии вашего аккаунта." icon="cast">
      {sessions === null && !error && <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Загрузка…</span>}
      {sessions !== null && sessions.length === 0 && !error && (
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
          Активных сессий нет. Войдите в аккаунт заново, чтобы устройство появилось здесь.
        </span>
      )}
      <StatusLine error={error} />

      {sessions?.map((s) => (
        <div
          key={s.id}
          style={{
            display: 'flex',
            alignItems: isNarrow ? 'flex-start' : 'center',
            flexDirection: isNarrow ? 'column' : 'row',
            gap: isNarrow ? 10 : 14,
            padding: '12px 0',
            borderBottom: '1px solid var(--line-1)',
          }}
        >
          <span style={{ color: 'var(--text-2)', display: 'grid', placeItems: 'center', width: 22 }}>
            <Icon name="cast" size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, color: 'var(--text-0)', fontWeight: 500 }}>{s.deviceLabel}</span>
              {s.current && <Chip tone="success">Текущее</Chip>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>
              {s.ip ? `${s.ip} · ` : ''}активность {formatDate(s.lastSeenAt)} · вход {formatDate(s.createdAt)}
            </div>
          </div>
          <Button
            variant={s.current ? 'ghost' : 'danger'}
            size="sm"
            disabled={busyId === s.id}
            onClick={() => void revoke(s)}
          >
            {s.current ? 'Выйти здесь' : 'Выйти'}
          </Button>
        </div>
      ))}

      {hasOthers && (
        <div style={{ marginTop: 6 }}>
          <Button variant="secondary" size="sm" icon="lock" disabled={busyOthers} onClick={revokeOthers}>
            {busyOthers ? 'Завершаем…' : 'Выйти со всех других устройств'}
          </Button>
        </div>
      )}
    </Card>
  );
}
