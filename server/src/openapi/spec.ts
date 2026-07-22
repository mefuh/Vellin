import { APP_VERSION } from '../appMeta.js';

/**
 * Ручной OpenAPI-документ клиентской поверхности API (auth, config, друзья, ЛС,
 * гео, избранное, push). Админ- и комнатные (WS) эндпоинты сюда намеренно не
 * входят — приложения строятся сначала без комнат, а админка остаётся веб-only.
 *
 * Держится вручную (routes используют Zod-парсинг внутри хэндлеров, а не
 * Fastify-схемы, поэтому авто-генерация дала бы пустые тела). При добавлении
 * клиентского эндпоинта — дописать сюда. Источник истины по типам тел —
 * `@vellin/shared` (api.ts/domain.ts); здесь — навигация и контракт для команд
 * разработки нативных клиентов.
 */

const bearer = [{ bearerAuth: [] as string[] }];

const err = (desc: string) => ({
  description: desc,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
});

const jsonBody = (schemaRef: string, required = true) => ({
  required,
  content: { 'application/json': { schema: { $ref: schemaRef } } },
});

const jsonResp = (desc: string, schemaRef: string) => ({
  description: desc,
  content: { 'application/json': { schema: { $ref: schemaRef } } },
});

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Vellin API',
    version: APP_VERSION,
    description:
      'Клиентская поверхность API Vellin для нативных приложений (Windows/macOS/iOS/Android) ' +
      'и веб-клиента. Аутентификация — Bearer JWT (30 дней). Загруженные файлы отдаются ' +
      'абсолютными URL при заданном PUBLIC_BASE_URL. Версионный гейтинг: заголовки ' +
      '`X-App-Platform` и `X-App-Version`; устаревший клиент получает 426 Upgrade Required. ' +
      'Комнатные и админские эндпоинты в этот документ не включены.',
  },
  servers: [
    { url: '/api', description: 'Относительно текущего origin' },
  ],
  tags: [
    { name: 'Meta', description: 'Здоровье сервиса и дискавери-конфиг' },
    { name: 'Auth', description: 'Регистрация, вход, профиль, сессии' },
    { name: 'Friends', description: 'Друзья, заявки, уведомления' },
    { name: 'DM', description: 'Личные сообщения и вложения' },
    { name: 'Geo', description: 'Справочник городов' },
    { name: 'Titles', description: 'Избранные фильмы/сериалы' },
    { name: 'Push', description: 'Web-Push подписки и настройки' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    parameters: {
      AppPlatform: {
        name: 'X-App-Platform',
        in: 'header',
        required: false,
        schema: { type: 'string', enum: ['web', 'windows', 'macos', 'ios', 'android'] },
        description: 'Платформа клиента (для версионного гейтинга).',
      },
      AppVersion: {
        name: 'X-App-Version',
        in: 'header',
        required: false,
        schema: { type: 'string', example: '1.0.0' },
        description: 'Semver-версия приложения (для версионного гейтинга).',
      },
    },
    schemas: {
      ApiError: {
        type: 'object',
        required: ['error', 'message', 'statusCode'],
        properties: {
          error: { type: 'string', example: 'Unauthorized' },
          message: { type: 'string', example: 'Invalid or missing token' },
          statusCode: { type: 'integer', example: 401 },
        },
      },
      UpgradeRequired: {
        allOf: [
          { $ref: '#/components/schemas/ApiError' },
          {
            type: 'object',
            properties: {
              minVersion: { type: 'string', example: '1.2.0' },
              platform: { type: 'string', example: 'ios' },
            },
          },
        ],
      },
      AuthUser: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          publicId: { type: 'string' },
          email: { type: 'string', nullable: true },
          username: { type: 'string' },
          avatarSeed: { type: 'string' },
          avatarUrl: { type: 'string', nullable: true, description: 'Абсолютный URL при заданном PUBLIC_BASE_URL' },
          bio: { type: 'string', nullable: true },
          gender: { type: 'string', enum: ['male', 'female', 'other'], nullable: true },
          birthDate: { type: 'string', nullable: true, example: '1990-05-17' },
          city: { type: 'string', nullable: true },
          kind: { type: 'string', enum: ['user', 'guest'] },
          createdAt: { type: 'string', format: 'date-time' },
          isAdmin: { type: 'boolean' },
        },
      },
      AuthResponse: {
        type: 'object',
        required: ['token', 'user'],
        properties: {
          token: { type: 'string', description: 'Session JWT (Authorization: Bearer)' },
          user: { $ref: '#/components/schemas/AuthUser' },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['email', 'username', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          username: { type: 'string', minLength: 2, maxLength: 32 },
          password: { type: 'string', minLength: 8, maxLength: 128 },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
      GuestRequest: {
        type: 'object',
        required: ['username'],
        properties: { username: { type: 'string', minLength: 2, maxLength: 24 } },
      },
      AppConfigResponse: {
        type: 'object',
        properties: {
          version: { type: 'string' },
          minVersions: {
            type: 'object',
            properties: {
              web: { type: 'string' },
              windows: { type: 'string' },
              macos: { type: 'string' },
              ios: { type: 'string' },
              android: { type: 'string' },
            },
          },
          endpoints: {
            type: 'object',
            properties: {
              apiBaseUrl: { type: 'string' },
              uploadsBaseUrl: { type: 'string' },
              wsRoomUrl: { type: 'string' },
              wsUserUrl: { type: 'string' },
            },
          },
          features: { type: 'object', additionalProperties: { type: 'boolean' } },
          maintenance: {
            type: 'object',
            properties: { enabled: { type: 'boolean' }, message: { type: 'string' } },
          },
          limits: { type: 'object', additionalProperties: { type: 'number' } },
          push: {
            type: 'object',
            properties: {
              mode: { type: 'string', enum: ['webpush'] },
              vapidPublicKey: { type: 'string', nullable: true },
            },
          },
        },
      },
      PublicUser: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          publicId: { type: 'string' },
          username: { type: 'string' },
          avatarSeed: { type: 'string' },
          avatarUrl: { type: 'string', nullable: true },
          kind: { type: 'string', enum: ['user'] },
        },
      },
    },
  },
  security: [] as unknown[],
  paths: {
    '/health': {
      get: {
        tags: ['Meta'],
        summary: 'Проверка живости и версия сервера',
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { ok: { type: 'boolean' }, version: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
    '/config': {
      get: {
        tags: ['Meta'],
        summary: 'Публичный конфиг/дискавери (без авторизации, вне гейтинга)',
        description:
          'Единая точка для нативных клиентов: версия API, минимальные версии (force-update), ' +
          'абсолютные адреса REST/WS/загрузок, фиче-тумблеры, режим обслуживания, лимиты, push.',
        responses: { 200: jsonResp('Конфиг сервиса', '#/components/schemas/AppConfigResponse') },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Регистрация',
        requestBody: jsonBody('#/components/schemas/RegisterRequest'),
        responses: {
          201: jsonResp('Создан', '#/components/schemas/AuthResponse'),
          409: err('Email или username заняты'),
          403: err('Регистрация отключена / тех.работы'),
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Вход',
        requestBody: jsonBody('#/components/schemas/LoginRequest'),
        responses: {
          200: jsonResp('OK', '#/components/schemas/AuthResponse'),
          401: err('Неверные данные'),
          403: err('Аккаунт заблокирован / тех.работы'),
        },
      },
    },
    '/auth/guest': {
      post: {
        tags: ['Auth'],
        summary: 'Гостевой вход (эфемерный JWT, не сохраняется в БД)',
        requestBody: jsonBody('#/components/schemas/GuestRequest'),
        responses: {
          200: jsonResp('OK', '#/components/schemas/AuthResponse'),
          403: err('Гостевой вход отключён'),
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Текущий пользователь',
        security: bearer,
        responses: {
          200: jsonResp('Профиль (может вернуть новый token для легаси-сессий)', '#/components/schemas/AuthUser'),
          401: err('Не авторизован'),
        },
      },
    },
    '/auth/profile': {
      patch: {
        tags: ['Auth'],
        summary: 'Обновить профиль (ник/bio/пол/дата/город/сброс аватара)',
        security: bearer,
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: jsonResp('Обновлено (token + user)', '#/components/schemas/AuthResponse'), 409: err('Ник занят') },
      },
    },
    '/auth/privacy': {
      get: {
        tags: ['Auth'],
        summary: 'Настройки приватности',
        security: bearer,
        responses: { 200: { description: 'PrivacySettings' } },
      },
      patch: {
        tags: ['Auth'],
        summary: 'Обновить приватность',
        security: bearer,
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'Обновлено' } },
      },
    },
    '/auth/email': {
      post: {
        tags: ['Auth'],
        summary: 'Сменить email (подтверждение паролем)',
        security: bearer,
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: jsonResp('OK', '#/components/schemas/AuthResponse'), 401: err('Неверный пароль'), 409: err('Email занят') },
      },
    },
    '/auth/password': {
      post: {
        tags: ['Auth'],
        summary: 'Сменить пароль (завершает прочие сессии)',
        security: bearer,
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: jsonResp('OK', '#/components/schemas/AuthResponse'), 401: err('Неверный пароль') },
      },
    },
    '/auth/avatar': {
      post: {
        tags: ['Auth'],
        summary: 'Загрузить аватар (multipart/form-data, ≤5 МБ, JPEG/PNG/WebP)',
        security: bearer,
        requestBody: {
          required: true,
          content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } },
        },
        responses: { 200: jsonResp('OK', '#/components/schemas/AuthResponse'), 400: err('Плохой файл') },
      },
    },
    '/auth/realtime-ticket': {
      get: {
        tags: ['Auth'],
        summary: 'Короткоживущий тикет для WS /ws/user',
        security: bearer,
        responses: { 200: { description: '{ ticket: string }' } },
      },
    },
    '/auth/sessions': {
      get: { tags: ['Auth'], summary: 'Список устройств/сессий', security: bearer, responses: { 200: { description: 'ListSessionsResponse' } } },
      delete: { tags: ['Auth'], summary: 'Завершить все сессии кроме текущей', security: bearer, responses: { 200: { description: '{ revoked: number }' } } },
    },
    '/auth/sessions/{id}': {
      delete: {
        tags: ['Auth'],
        summary: 'Завершить конкретную сессию',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: '{ id }' }, 404: err('Не найдена') },
      },
    },
    '/friends': {
      get: { tags: ['Friends'], summary: 'Список друзей', security: bearer, responses: { 200: { description: 'FriendUser[]' } } },
    },
    '/friends/requests': {
      get: { tags: ['Friends'], summary: 'Входящие/исходящие заявки', security: bearer, responses: { 200: { description: 'FriendRequest[]' } } },
      post: {
        tags: ['Friends'],
        summary: 'Отправить/принять/отклонить заявку',
        security: bearer,
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'OK' } },
      },
    },
    '/notifications': {
      get: { tags: ['Friends'], summary: 'Уведомления', security: bearer, responses: { 200: { description: 'AppNotification[]' } } },
    },
    '/notifications/read': {
      post: { tags: ['Friends'], summary: 'Отметить уведомления прочитанными', security: bearer, responses: { 200: { description: 'OK' } } },
    },
    '/dm/conversations': {
      get: { tags: ['DM'], summary: 'Список диалогов', security: bearer, responses: { 200: { description: 'DmConversation[] + unreadTotal' } } },
    },
    '/dm/image': {
      post: {
        tags: ['DM'],
        summary: 'Загрузить картинку для ЛС (multipart, ≤10 МБ)',
        security: bearer,
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } },
        responses: { 200: { description: '{ url, width, height } — абсолютный URL при PUBLIC_BASE_URL' } },
      },
    },
    '/dm/voice': {
      post: {
        tags: ['DM'],
        summary: 'Загрузить голосовое для ЛС (multipart, ≤25 МБ)',
        security: bearer,
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } },
        responses: { 200: { description: '{ url }' } },
      },
    },
    '/dm/video-note': {
      post: {
        tags: ['DM'],
        summary: 'Загрузить видео-кружок (multipart, ≤128 МБ; транскод асинхронный)',
        security: bearer,
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } },
        responses: { 200: { description: '{ uploadId }' } },
      },
    },
    '/geo/cities': {
      get: {
        tags: ['Geo'],
        summary: 'Поиск городов (автодополнение)',
        security: bearer,
        parameters: [{ name: 'q', in: 'query', required: false, schema: { type: 'string' } }],
        responses: { 200: { description: 'City[]' } },
      },
    },
    '/titles/favorites': {
      get: { tags: ['Titles'], summary: 'Избранные фильмы/сериалы', security: bearer, responses: { 200: { description: 'FavoriteTitle[]' } } },
      put: {
        tags: ['Titles'],
        summary: 'Заменить список избранного',
        security: bearer,
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'OK' } },
      },
    },
    '/push/vapid-key': {
      get: { tags: ['Push'], summary: 'Публичный VAPID-ключ (null = push выключен)', security: bearer, responses: { 200: { description: '{ publicKey }' } } },
    },
    '/push/subscribe': {
      post: {
        tags: ['Push'],
        summary: 'Зарегистрировать web-push подписку устройства',
        security: bearer,
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: '{ ok, deviceId }' } },
      },
      delete: {
        tags: ['Push'],
        summary: 'Отписать устройство по endpoint',
        security: bearer,
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: '{ ok }' } },
      },
    },
    '/push/devices': {
      get: { tags: ['Push'], summary: 'Список push-устройств', security: bearer, responses: { 200: { description: 'DeviceDTO[]' } } },
    },
    '/push/preferences': {
      get: { tags: ['Push'], summary: 'Настройки уведомлений', security: bearer, responses: { 200: { description: 'PreferencesResponse' } } },
      put: {
        tags: ['Push'],
        summary: 'Обновить настройки уведомлений',
        security: bearer,
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'PreferencesResponse' } },
      },
    },
    '/push/test': {
      post: { tags: ['Push'], summary: 'Тестовое push самому себе', security: bearer, responses: { 200: { description: '{ ok, sent }' } } },
    },
  },
} as const;
