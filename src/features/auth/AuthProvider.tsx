import { USE_API } from '@/lib/http';

import { ApiAuthProvider } from './ApiAuthProvider';
import { FirebaseAuthProvider } from './FirebaseAuthProvider';

/** Better Auth (Worker) when EXPO_PUBLIC_API_URL is set, Firebase Auth otherwise (issue #7). Chosen once at startup. */
export const AuthProvider = USE_API ? ApiAuthProvider : FirebaseAuthProvider;
