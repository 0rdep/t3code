import * as NodeVM from "node:vm";
import { describe, expect, it, vi } from "vite-plus/test";
import { disableServerPasskeys } from "./serverPasskeys.ts";

function install() {
  const get = vi.fn(async () => null);
  const create = vi.fn(async () => null);
  const Container = function () {};
  Object.assign(Container.prototype, { get, create });
  const publicKey = {};
  const context = { CredentialsContainer: Container, PublicKeyCredential: publicKey, DOMException };
  const script = `(${disableServerPasskeys.toString()})()`;
  NodeVM.runInNewContext(script, context);
  const credentials = Object.create(Container.prototype) as CredentialsContainer;
  return {
    get,
    create,
    credentials,
    context,
    publicKey: publicKey as typeof PublicKeyCredential,
    script,
  };
}

describe("headless passkey fallback", () => {
  it("rejects authentication immediately without attempting native WebAuthn", async () => {
    const { credentials, get } = install();
    await expect(
      credentials.get({ publicKey: { challenge: new Uint8Array([1]) } }),
    ).rejects.toMatchObject({ name: "NotSupportedError" });
    expect(get).not.toHaveBeenCalled();
  });

  it("rejects registration immediately without attempting native WebAuthn", async () => {
    const { credentials, create } = install();
    await expect(
      credentials.create({
        publicKey: {
          challenge: new Uint8Array([1]),
          rp: { name: "Example" },
          user: { id: new Uint8Array([2]), name: "User", displayName: "User" },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        },
      }),
    ).rejects.toMatchObject({ name: "NotSupportedError" });
    expect(create).not.toHaveBeenCalled();
  });

  it("reports unavailable platform authentication, autofill, and forwarding capabilities", async () => {
    const { publicKey } = install();
    expect(await publicKey.isUserVerifyingPlatformAuthenticatorAvailable()).toBe(false);
    expect(await publicKey.isConditionalMediationAvailable()).toBe(false);
    expect(await publicKey.getClientCapabilities()).toEqual({
      conditionalCreate: false,
      conditionalGet: false,
      hybridTransport: false,
      passkeyPlatformAuthenticator: false,
      userVerifyingPlatformAuthenticator: false,
    });
  });

  it("leaves non-public-key credentials on the browser's native path", async () => {
    const { credentials, get, create } = install();
    await credentials.get();
    await credentials.create();
    expect(get).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
  });

  it("preserves abort semantics for requests cancelled before they start", async () => {
    const { credentials } = install();
    await expect(
      credentials.get({
        signal: AbortSignal.abort(),
        publicKey: { challenge: new Uint8Array([1]) },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects conditional passkeys rather than starting an invisible request", async () => {
    const { credentials } = install();
    await expect(
      credentials.get({ mediation: "conditional", publicKey: { challenge: new Uint8Array([1]) } }),
    ).rejects.toMatchObject({ name: "NotSupportedError" });
  });

  it("is safe to install twice", async () => {
    const { credentials, context, script, get } = install();
    NodeVM.runInNewContext(script, context);
    await expect(
      credentials.get({ publicKey: { challenge: new Uint8Array([1]) } }),
    ).rejects.toMatchObject({ name: "NotSupportedError" });
    await credentials.get();
    expect(get).toHaveBeenCalledOnce();
  });

  it("does not add a passkey API to contexts that do not have one", () => {
    const context = {};
    NodeVM.runInNewContext(`(${disableServerPasskeys.toString()})()`, context);
    expect(context).not.toHaveProperty("PublicKeyCredential");
  });
});
