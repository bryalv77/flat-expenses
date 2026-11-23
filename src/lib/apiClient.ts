import { client } from './api/generated/client.gen';
import { API_URL, ApiError, authHeader } from './http';

// The one configured instance of the client generated from openapi.yaml. Importing this module is what points it at the Worker.
client.setConfig({ baseUrl: API_URL, throwOnError: true });

client.interceptors.request.use(async (request) => {
  for (const [name, value] of Object.entries(await authHeader())) request.headers.set(name, value);
  return request;
});

/** A non-2xx answer becomes an `ApiError` whose message is the server's error code, so callers compare `e.message`. */
client.interceptors.error.use((error, response) =>
  response ? new ApiError(response.status, (error as { error?: string } | null)?.error ?? `http_${response.status}`) : error,
);
