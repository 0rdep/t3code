import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, PreviewRuntime, PreviewSessionSnapshot } from "@t3tools/contracts";

import { isElectron } from "~/env";
import { isPreviewSupportedInRuntime } from "~/previewStateStore";
import { primaryEnvironmentIdAtom } from "~/state/primaryEnvironment";
import {
  readEnvironmentSupportsDesktopBrowser,
  readEnvironmentSupportsServerBrowser,
  useEnvironmentSupportsDesktopBrowser,
  useEnvironmentSupportsServerBrowser,
} from "~/state/entities";

/**
 * Open in the environment's browser when available, so people and agents on
 * different clients share its page and saved logins. A desktop-only tab is
 * still available through the explicit move action.
 */
export function previewRuntimeFor(environmentId: EnvironmentId): PreviewRuntime | undefined {
  if (!readEnvironmentSupportsServerBrowser(environmentId)) return undefined;
  return "server";
}

/**
 * The other browser a tab can move to, or null when it has none: a desktop
 * tab of a remote environment can move to that environment's browser, and back.
 */
export function alternatePreviewRuntime(
  environmentId: EnvironmentId,
  primaryEnvironmentId: EnvironmentId | null,
  serverBrowser: boolean,
  snapshot: Pick<PreviewSessionSnapshot, "runtime"> | null | undefined,
): PreviewRuntime | null {
  if (!snapshot || !serverBrowser || !isPreviewSupportedInRuntime()) return null;
  if (environmentId === primaryEnvironmentId) return null;
  return snapshot.runtime === "server" ? "desktop" : "server";
}

/** Electron hosts its own browser tabs; other clients need the environment to host them. */
export function isPreviewAvailableFor(environmentId: EnvironmentId): boolean {
  return isPreviewSupportedInRuntime() || readEnvironmentSupportsServerBrowser(environmentId);
}

export function usePreviewAvailable(environmentId: EnvironmentId | null): boolean {
  const serverBrowser = useEnvironmentSupportsServerBrowser(environmentId);
  return isPreviewSupportedInRuntime() || serverBrowser;
}

/**
 * Whether this client draws a server tab with its own `<webview>`. The desktop
 * app renders tabs of the server it launched, which drives them over the
 * desktop browser channel; every other client and environment streams them.
 */
export function rendersServerTabNatively(
  environmentId: EnvironmentId,
  primaryEnvironmentId: EnvironmentId | null,
  snapshot: Pick<PreviewSessionSnapshot, "runtime"> | null | undefined,
  desktopBrowser = readEnvironmentSupportsDesktopBrowser(environmentId),
): boolean {
  return (
    isElectron &&
    snapshot?.runtime === "server" &&
    primaryEnvironmentId !== null &&
    environmentId === primaryEnvironmentId &&
    desktopBrowser
  );
}

export function useRendersServerTabNatively(
  environmentId: EnvironmentId,
  snapshot: Pick<PreviewSessionSnapshot, "runtime"> | null | undefined,
): boolean {
  const primaryEnvironmentId = useAtomValue(primaryEnvironmentIdAtom);
  const desktopBrowser = useEnvironmentSupportsDesktopBrowser(environmentId);
  return rendersServerTabNatively(environmentId, primaryEnvironmentId, snapshot, desktopBrowser);
}
