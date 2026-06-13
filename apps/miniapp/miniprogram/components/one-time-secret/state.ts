export interface OneTimeSecretState {
  acknowledged: boolean;
  copied: boolean;
  plaintext?: string;
  visible: boolean;
}

export function revealSecret(plaintext: string): OneTimeSecretState {
  return {
    acknowledged: false,
    copied: false,
    plaintext,
    visible: plaintext.trim().length > 0,
  };
}

export function markSecretCopied(
  state: OneTimeSecretState,
): OneTimeSecretState {
  if (!state.plaintext) {
    return state;
  }

  return {
    ...state,
    copied: true,
  };
}

export function acknowledgeSecret(
  state: OneTimeSecretState,
): OneTimeSecretState {
  return {
    acknowledged: true,
    copied: state.copied,
    visible: false,
  };
}
