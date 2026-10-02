/**
 * Social sign-in behind feature flags (EXPO_PUBLIC_ENABLE_GOOGLE_SIGNIN / _APPLE_SIGNIN).
 * Email/password works without any of this. Native Google needs OAuth client ids and an EAS build;
 * Apple needs the "Sign in with Apple" capability. See README.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  signInWithPopup,
} from 'firebase/auth';
import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';

import { auth, featureFlags } from '@/lib/firebase';

WebBrowser.maybeCompleteAuthSession();

export interface SocialSignIn {
  enabled: boolean;
  signIn: () => Promise<void>;
}

const disabled: SocialSignIn = {
  enabled: false,
  signIn: async () => {
    throw new Error('Provider disabled');
  },
};

// ----- Google -----
function useGoogleWeb(): SocialSignIn {
  const signIn = useCallback(async () => {
    await signInWithPopup(auth, new GoogleAuthProvider());
  }, []);
  return { enabled: true, signIn };
}

function useGoogleNative(): SocialSignIn {
  const clientId = featureFlags.googleWebClientId;
  const [request, response, prompt] = Google.useIdTokenAuthRequest({
    clientId,
    webClientId: clientId,
    iosClientId: clientId,
    androidClientId: clientId,
  });
  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.params.id_token;
      if (idToken) void signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    }
  }, [response]);
  const signIn = useCallback(async () => {
    await prompt();
  }, [prompt]);
  return { enabled: Boolean(request), signIn };
}

const useGoogleDisabled = (): SocialSignIn => disabled;

export const useGoogleSignIn: () => SocialSignIn = !featureFlags.google
  ? useGoogleDisabled
  : Platform.OS === 'web'
    ? useGoogleWeb
    : useGoogleNative;

// ----- Apple -----
function useAppleWeb(): SocialSignIn {
  const signIn = useCallback(async () => {
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    await signInWithPopup(auth, provider);
  }, []);
  return { enabled: true, signIn };
}

function useAppleNative(): SocialSignIn {
  const signIn = useCallback(async () => {
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    const result = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!result.identityToken) throw new Error('Apple did not return an identity token');
    const credential = new OAuthProvider('apple.com').credential({ idToken: result.identityToken, rawNonce });
    await signInWithCredential(auth, credential);
  }, []);
  return { enabled: true, signIn };
}

const useAppleDisabled = (): SocialSignIn => disabled;

/** Apple is only offered on iOS and web. */
export const useAppleSignIn: () => SocialSignIn = !featureFlags.apple
  ? useAppleDisabled
  : Platform.OS === 'web'
    ? useAppleWeb
    : Platform.OS === 'ios'
      ? useAppleNative
      : useAppleDisabled;
