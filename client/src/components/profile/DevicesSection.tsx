import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DeviceSession } from '@vellin/shared';
import { Icon } from '../../shared';
import { profileApi } from '../../api/profile';
import { ApiHttpError } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
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
  const user = useAuthStore((s) => s.user);
  const maintenanceActive = useAuthStore((s) => s.maintenanceActive);
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
    // Завершение своей текущей сессии = выход. Админу при тех.работах это
    // запрещено, иначе он не вернётся и не выключит режим обслуживания.
    if (s.current && maintenanceActive && user?.isAdmin) {
      setError('Во время технических работ нельзя завершить текущую сессию администратора — иначе вы потеряете доступ к админке.');
      return;
    }
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
    <Card title="Активные входы" desc="Где открыт ваш аккаунт прямо сейчас. Не узнаёте вход — завершите сессию." contained={false}>
      {sessions === null && !error && <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Загрузка…</span>}
      {sessions !== null && sessions.length === 0 && !error && (
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
          Активных сессий нет. Войдите в аккаунт заново, чтобы устройство появилось здесь.
        </span>
      )}
      <StatusLine error={error} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sessions?.map((s) => (
          <div
            key={s.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '18px 22px',
              borderRadius: 18,
              background: s.current ? 'color-mix(in srgb, var(--ok) 7%, var(--bg-1))' : 'var(--bg-1)',
              border: `1px solid ${s.current ? 'color-mix(in srgb, var(--ok) 22%, transparent)' : 'var(--line-1)'}`,
            }}
          >
            <div
              className={s.current ? 'hero-anim' : undefined}
              style={{
                flex: 'none',
                width: 44,
                height: 44,
                borderRadius: 13,
                display: 'grid',
                placeItems: 'center',
                background: s.current ? 'color-mix(in srgb, var(--ok) 16%, transparent)' : 'var(--bg-2)',
                color: s.current ? 'var(--ok)' : 'var(--text-2)',
                ...(s.current ? ({ ['--hero-pulse' as string]: 'color-mix(in srgb, var(--ok) 50%, transparent)', animation: 'heroDotPulse 2.4s infinite' } as React.CSSProperties) : {}),
              }}
            >
              <Icon name="cast" size={18} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{s.deviceLabel}</span>
                {s.current && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ok)', background: 'color-mix(in srgb, var(--ok) 15%, transparent)', padding: '2px 9px', borderRadius: 999 }}>
                    это устройство
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 4 }}>
                {s.ip ? `${s.ip} · ` : ''}активность {formatDate(s.lastSeenAt)} · вход {formatDate(s.createdAt)}
              </div>
            </div>

            {s.current ? (
              <span style={{ fontSize: 13, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>активно</span>
            ) : (
              <button
                onClick={() => void revoke(s)}
                disabled={busyId === s.id}
                className="hero-press"
                style={{
                  flex: 'none',
                  padding: '9px 16px',
                  borderRadius: 999,
                  border: '1px solid var(--accent-glow)',
                  background: 'var(--accent-soft)',
                  color: 'var(--accent-hi)',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: busyId === s.id ? 'not-allowed' : 'pointer',
                  opacity: busyId === s.id ? 0.6 : 1,
                }}
              >
                Выйти
              </button>
            )}
          </div>
        ))}
      </div>

      {hasOthers && (
        <button
          onClick={() => void revokeOthers()}
          disabled={busyOthers}
          className="hero-press"
          style={{
            marginTop: 20,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 9,
            padding: '12px 20px',
            borderRadius: 999,
            border: '1px solid var(--line-2)',
            background: 'var(--bg-3)',
            color: 'var(--text-0)',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: busyOthers ? 'not-allowed' : 'pointer',
            opacity: busyOthers ? 0.6 : 1,
          }}
        >
          <Icon name="lock" size={16} />
          {busyOthers ? 'Завершаем…' : 'Выйти со всех других устройств'}
        </button>
      )}
    </Card>
  );
}
