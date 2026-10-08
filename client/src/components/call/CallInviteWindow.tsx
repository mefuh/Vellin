import { useEffect, useRef } from 'react';
import { CallAvatar, EndCallButton, PulseDot } from './CallBits';
import { CallIcon } from './CallGlyph';

/** Один из трёх этапов до разговора. */
export type InvitePhase = 'incoming' | 'outgoing' | 'connecting';

/**
 * Что показывает окно вызова. Отдельный снимок, а не ссылка на стор: окно
 * доживает свою анимацию ухода уже после того, как звонка не стало, и
 * рисовать ему в этот момент нечего, кроме запомненного.
 */
export interface CallInviteData {
  phase: InvitePhase;
  username: string;
  avatarUrl: string | null;
  video: boolean;
}

/**
 * Окно вызова: входящий, дозвон и подключение — одной карточкой посреди
 * сайта. Перенос winapp/lib/widgets/call/call_invite_window.dart.
 *
 * Карточка над затемнённым сайтом честнее экрана во весь кадр: разговор ещё
 * не начался, с сайта никто не уходил.
 */
export function CallInviteWindow({
  data,
  state,
  rising,
  onDecline,
  onAccept,
}: {
  data: CallInviteData;
  state: 'in' | 'out';
  /**
   * Уходим не потому, что звонок кончился, а потому, что он начался: карточка
   * тогда раскрывается вверх, а не оседает вниз, как при отбое.
   */
  rising: boolean;
  onDecline: () => void;
  /** Ответить. У исходящего отвечать нечего — тогда не задан. */
  onAccept?: (video: boolean) => void;
}): React.ReactElement {
  const incoming = data.phase === 'incoming';

  // Мигание заголовка вкладки: звук может быть заглушён политикой браузера,
  // а пропускать звонок из-за этого нельзя.
  useEffect(() => {
    if (!incoming || state === 'out') return;
    const original = document.title;
    let on = false;
    const timer = window.setInterval(() => {
      on = !on;
      document.title = on ? `${data.username} звонит…` : original;
    }, 1000);
    return () => {
      window.clearInterval(timer);
      document.title = original;
    };
  }, [incoming, state, data.username]);

  // Фокус — внутрь карточки, на главное действие этапа: «Ответить» на
  // входящем, «Отменить» на дозвоне. Сайт под карточкой в это время инертен.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const canAnswer = incoming && !!onAccept;
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const target = card.querySelector<HTMLButtonElement>(
      canAnswer ? '.vc-answer:not([data-outline])' : '.vc-end',
    );
    target?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
  }, [canAnswer]);

  const title = incoming
    ? `${data.video ? 'Входящий видеозвонок' : 'Входящий звонок'} от ${data.username}`
    : `Звонок ${data.username}`;

  return (
    <div
      className="vc-invite"
      data-state={state}
      data-phase={data.phase}
      data-exit={rising ? 'rise' : 'sink'}
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="vc-invite-scrim" aria-hidden />
      <div className="vc-invite-card" ref={cardRef}>
        <PhaseLabel phase={data.phase} video={data.video} />
        <InviteAvatar
          username={data.username}
          avatarUrl={data.avatarUrl}
          connecting={data.phase === 'connecting'}
        />
        <div className="vc-display-name vc-ellipsis vc-invite-name">{data.username}</div>
        <StatusLine phase={data.phase} video={data.video} />
        <Actions
          key={incoming && onAccept ? 'answer' : 'wait'}
          incoming={incoming}
          video={data.video}
          onDecline={onDecline}
          onAccept={onAccept}
        />
      </div>
    </div>
  );
}

/** Метка этапа над аватаром — прописными, с точкой состояния. */
function PhaseLabel({ phase, video }: { phase: InvitePhase; video: boolean }) {
  const [text, color, period] =
    phase === 'incoming'
      ? [video ? 'Входящий видеозвонок' : 'Входящий звонок', '#e2c99b', 900]
      : phase === 'outgoing'
        ? [video ? 'Исходящий видеозвонок' : 'Исходящий звонок', '#e2c99b', 1400]
        : ['Соединение', 'rgba(255,255,255,0.6)', 700];
  return (
    // Живая область остаётся на месте, меняется только текст — иначе читалка
    // не объявит смену этапа.
    <div className="vc-phase" aria-live="polite">
      <span className="vc-phase-inner" key={text}>
        <PulseDot color={color} period={period} />
        <span className="vc-section vc-swap">{text}</span>
      </span>
    </div>
  );
}

/** Строка под именем: что сейчас происходит. */
function StatusLine({ phase, video }: { phase: InvitePhase; video: boolean }) {
  const text =
    phase === 'incoming'
      ? video
        ? 'Хочет поговорить с камерой'
        : 'Вызывает вас'
      : phase === 'outgoing'
        ? 'Ждём ответа'
        : 'Устанавливаем связь';
  return (
    <div key={text} className="vc-status vc-swap">
      <span className="vc-pill-text">{text}</span>
      {/* Троеточие живёт само: без него ожидание выглядит замершим. */}
      <span className="vc-pill-text vc-dots" aria-hidden>
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </div>
  );
}

/** Аватар вызова: кольца на дозвоне, бегущая дуга на подключении. */
function InviteAvatar({
  username,
  avatarUrl,
  connecting,
}: {
  username: string;
  avatarUrl: string | null;
  connecting: boolean;
}) {
  return (
    <div className="vc-invite-avatar" data-ringing={connecting ? undefined : ''}>
      {/* Кольца и дуга занимают одно место и сменяют друг друга: на ответе
          ожидание переходит в работу, а карточка не перестраивается. */}
      {connecting ? (
        <div className="vc-arc" key="arc" aria-hidden>
          <ConnectingArc />
        </div>
      ) : (
        <div className="vc-rings" key="rings" aria-hidden>
          <span className="vc-ring" />
          <span className="vc-ring" />
        </div>
      )}
      <CallAvatar username={username} avatarUrl={avatarUrl} size={118} />
    </div>
  );
}

/**
 * Дуга подключения: тонкий круг и бегущий по нему отрезок в 108°, который
 * проявляется к своему концу (как SweepGradient в приложении).
 */
function ConnectingArc() {
  return (
    <>
      <span className="vc-arc-track" />
      <span className="vc-arc-sweep" />
    </>
  );
}

/**
 * Кнопки этапа. Крупнее, чем в разговоре: в карточке они — главное, и
 * промахиваться по ним на входящем звонке человек не должен.
 */
function Actions({
  incoming,
  video,
  onDecline,
  onAccept,
}: {
  incoming: boolean;
  video: boolean;
  onDecline: () => void;
  onAccept?: (video: boolean) => void;
}) {
  return (
    <div className="vc-actions">
      <div className="vc-action">
        <EndCallButton
          size="invite"
          onClick={onDecline}
          label={incoming ? 'Отклонить звонок' : 'Отменить вызов'}
        />
        <span className="vc-section" aria-hidden>
          {incoming ? 'Отклонить' : 'Отменить'}
        </span>
      </div>
      {incoming && onAccept && (
        <>
          {video && (
            <div className="vc-action">
              <button
                type="button"
                className="vc-answer"
                data-outline
                onClick={() => onAccept(true)}
                title="Ответить с камерой"
                aria-label="Ответить с камерой"
              >
                <CallIcon name="camera" size={20} />
              </button>
              <span className="vc-section" aria-hidden>
                С камерой
              </span>
            </div>
          )}
          <div className="vc-action">
            <button
              type="button"
              className="vc-answer"
              onClick={() => onAccept(false)}
              title="Ответить"
              aria-label="Ответить"
            >
              <CallIcon name="answer" size={20} />
            </button>
            <span className="vc-section" aria-hidden>
              Ответить
            </span>
          </div>
        </>
      )}
    </div>
  );
}
