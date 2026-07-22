import type { FastifyInstance } from 'fastify';
import type { OpenAPIV3 } from 'openapi-types';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { openApiDocument } from './spec.js';

/**
 * Подключает статическую OpenAPI-спеку клиентской поверхности API:
 *  - интерактивный Swagger UI на `/api/docs`;
 *  - сырой документ на `/api/openapi.json` (для кодогенерации клиентов).
 *
 * Режим `static`: документ ведётся вручную ({@link openApiDocument}), плагин его
 * лишь отдаёт (роуты используют Zod внутри хэндлеров, авто-генерация из
 * Fastify-схем не применима).
 */
export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    mode: 'static',
    specification: { document: openApiDocument as unknown as OpenAPIV3.Document },
  });

  await app.register(swaggerUi, {
    routePrefix: '/api/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  // Сырой JSON-документ отдельным стабильным адресом (кодогенерация клиентов).
  app.get('/api/openapi.json', async () => openApiDocument);
}
