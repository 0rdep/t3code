import type { EnvironmentId } from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  desktop: false,
  primary: null as string | null,
  serverBrowser: new Set<string>(),
  desktopBrowser: new Set<string>(),
}));

vi.mock("~/env", () => ({
  get isElectron() {
    return state.desktop;
  },
}));
vi.mock("~/previewStateStore", () => ({ isPreviewSupportedInRuntime: () => state.desktop }));
vi.mock("~/rpc/atomRegistry", () => ({ appAtomRegistry: { get: () => state.primary } }));
vi.mock("~/state/primaryEnvironment", () => ({ primaryEnvironmentIdAtom: {} }));
vi.mock("~/state/entities", () => ({
  readEnvironmentSupportsServerBrowser: (id: string) => state.serverBrowser.has(id),
  useEnvironmentSupportsServerBrowser: () => false,
  readEnvironmentSupportsDesktopBrowser: (id: string) => state.desktopBrowser.has(id),
  useEnvironmentSupportsDesktopBrowser: (id: string) => state.desktopBrowser.has(id),
}));

import {
  alternatePreviewRuntime,
  previewRuntimeFor,
  rendersServerTabNatively,
} from "./previewRuntime";

const local = "local" as EnvironmentId;
const remote = "remote" as EnvironmentId;

afterEach(() => {
  state.desktop = false;
  state.primary = null;
  state.serverBrowser = new Set();
  state.desktopBrowser = new Set();
});

describe("previewRuntimeFor", () => {
  it("opens remote tabs on the server so the desktop shares the agent's profile", () => {
    state.desktop = true;
    state.primary = local;
    state.serverBrowser = new Set([local, remote]);

    expect(previewRuntimeFor(remote)).toBe("server");
    expect(previewRuntimeFor(local)).toBe("server");
  });

  it("uses the environment's browser where the client has none of its own", () => {
    state.serverBrowser = new Set([remote]);

    expect(previewRuntimeFor(remote)).toBe("server");
  });

  it("retains the local fallback when an older server has no browser", () => {
    state.desktop = true;
    expect(previewRuntimeFor(remote)).toBeUndefined();
  });
});

describe("rendersServerTabNatively", () => {
  it("streams a WSL-only primary without a desktop browser channel", () => {
    state.desktop = true;
    expect(rendersServerTabNatively(local, local, { runtime: "server" })).toBe(false);
  });

  it("only renders the channel-owning primary natively", () => {
    state.desktop = true;
    state.desktopBrowser.add(local);
    state.desktopBrowser.add(remote);
    expect(rendersServerTabNatively(local, local, { runtime: "server" })).toBe(true);
    expect(rendersServerTabNatively(remote, local, { runtime: "server" })).toBe(false);
    expect(rendersServerTabNatively(local, local, { runtime: "desktop" })).toBe(false);
    expect(rendersServerTabNatively(local, null, { runtime: "server" })).toBe(false);
    state.desktop = false;
    expect(rendersServerTabNatively(local, local, { runtime: "server" })).toBe(false);
  });
});

describe("alternatePreviewRuntime", () => {
  it("moves a remote environment's tab between this computer and the environment", () => {
    state.desktop = true;

    expect(alternatePreviewRuntime(remote, local, true, {})).toBe("server");
    expect(alternatePreviewRuntime(remote, local, true, { runtime: "server" })).toBe("desktop");
    expect(alternatePreviewRuntime(local, local, true, {})).toBeNull();
    expect(alternatePreviewRuntime(remote, local, false, {})).toBeNull();
  });

  it("offers no move outside the desktop app", () => {
    expect(alternatePreviewRuntime(remote, null, true, { runtime: "server" })).toBeNull();
  });
});
