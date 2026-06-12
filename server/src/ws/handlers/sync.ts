import type { C2SSyncAll, C2SSyncConfig, C2SSyncReport } from '@vellin/shared';
import type { RoomRuntime } from '../../rooms/RoomRuntime.js';
import type { ConnectionContext } from '../connection.js';
import { sendError } from '../connection.js';

/** Управлять синхронизацией может владелец/админ комнаты (или главный админ). */
function isRoomController(runtime: RoomRuntime, userId: string): boolean {
  const role = runtime.getRole(userId);
  return role === 'owner' || role === 'admin' || role === 'superadmin';
}

/** Отчёт клиента о позиции/буфере — без проверок, просто фиксируем. */
export function handleSyncReport(
  runtime: RoomRuntime,
  ctx: ConnectionContext,
  msg: C2SSyncReport,
): void {
  runtime.recordSyncReport(ctx.principal.userId, msg.currentTime, msg.buffering, msg.buffered);
}

/** Хост/админ: мгновенно подтянуть всех к общей точке. */
export function handleSyncAll(
  runtime: RoomRuntime,
  ctx: ConnectionContext,
  _msg: C2SSyncAll,
): void {
  if (!isRoomController(runtime, ctx.principal.userId)) {
    sendError(ctx, 'no_permission', 'Только хост может синхронизировать всех');
    return;
  }
  runtime.syncAll(ctx.principal.userId);
}

/** Хост/админ: тумблер авто-синхронизации. */
export function handleSyncConfig(
  runtime: RoomRuntime,
  ctx: ConnectionContext,
  msg: C2SSyncConfig,
): void {
  if (!isRoomController(runtime, ctx.principal.userId)) {
    sendError(ctx, 'no_permission', 'Только хост может менять авто-синхронизацию');
    return;
  }
  runtime.setAutoSync(ctx.principal.userId, Boolean(msg.autoSync));
}
