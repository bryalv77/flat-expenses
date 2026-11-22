/** Error codes that cross the Api boundary as `Error.message`; callers compare against these strings. */
export const ERR = {
  CATEGORY_HAS_BILLS: 'CATEGORY_HAS_BILLS',
  INVALID_MEMBER: 'invalid_member',
  USE_AUTH_DELETE_USER: 'USE_AUTH_DELETE_USER',
} as const;
