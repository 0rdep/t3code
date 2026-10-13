/** Serialized into headless pages before site scripts, including popups and frames. */
export function disableServerPasskeys() {
  // Structural types keep DOM-only declarations out of the Node server's type environment.
  const { PublicKeyCredential, CredentialsContainer } = globalThis as unknown as {
    PublicKeyCredential?: object;
    CredentialsContainer?: {
      prototype: { get: (...args: unknown[]) => unknown; create: (...args: unknown[]) => unknown };
    };
  };
  if (!PublicKeyCredential || !CredentialsContainer) return;
  const marker = Symbol.for("t3.unsupported-server-passkeys");
  if (Reflect.get(CredentialsContainer.prototype, marker)) return;
  Reflect.set(CredentialsContainer.prototype, marker, true);
  const define = (object: object, key: string, value: unknown) =>
    Object.defineProperty(object, key, { value, configurable: true, writable: true });
  type Options = { publicKey?: unknown; signal?: AbortSignal | null };
  const unavailable = (options: Options) =>
    Promise.reject(
      new DOMException(
        options.signal?.aborted
          ? "Passkey request cancelled"
          : "Passkeys are not supported in the shared server browser. Choose another sign-in method or open this site on this computer.",
        options.signal?.aborted ? "AbortError" : "NotSupportedError",
      ),
    );
  const nativeGet = CredentialsContainer.prototype.get;
  const nativeCreate = CredentialsContainer.prototype.create;
  define(CredentialsContainer.prototype, "get", function (this: object, options?: Options) {
    return options?.publicKey ? unavailable(options) : Reflect.apply(nativeGet, this, [options]);
  });
  define(CredentialsContainer.prototype, "create", function (this: object, options?: Options) {
    return options?.publicKey ? unavailable(options) : Reflect.apply(nativeCreate, this, [options]);
  });
  define(PublicKeyCredential, "isUserVerifyingPlatformAuthenticatorAvailable", async () => false);
  define(PublicKeyCredential, "isConditionalMediationAvailable", async () => false);
  define(PublicKeyCredential, "getClientCapabilities", async () => ({
    conditionalCreate: false,
    conditionalGet: false,
    hybridTransport: false,
    passkeyPlatformAuthenticator: false,
    userVerifyingPlatformAuthenticator: false,
  }));
}
