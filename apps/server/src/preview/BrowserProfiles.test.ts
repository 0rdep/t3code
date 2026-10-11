import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import * as BrowserProfiles from "./BrowserProfiles.ts";

const location = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: "t3-browser-profiles-" });
  return path.join(directory, "server-browser", "profiles.json");
});

it.layer(NodeServices.layer)("saved browser profiles", (it) => {
  it.effect("uses a persistent default with no connected client or saved settings", () =>
    Effect.gen(function* () {
      const profiles = yield* BrowserProfiles.make(yield* location);
      expect(profiles.get().defaultProfileId).toBe("default");
      expect(profiles.get().profiles.map((profile) => profile.id)).toEqual([
        "default",
        "incognito",
      ]);
    }),
  );

  it.effect("restores a custom default before any client reports after restart", () =>
    Effect.gen(function* () {
      const filePath = yield* location;
      const profiles = yield* BrowserProfiles.make(filePath);
      yield* profiles.report({
        profiles: [{ id: "work", name: "Work", kind: "persistent" }],
        defaultProfileId: "work",
      });
      const restarted = yield* BrowserProfiles.make(filePath);
      expect(restarted.get()).toEqual(profiles.get());
      expect(restarted.get().defaultProfileId).toBe("work");
    }),
  );

  it.effect("remembers explicit incognito and allows switching back to the default", () =>
    Effect.gen(function* () {
      const filePath = yield* location;
      const profiles = yield* BrowserProfiles.make(filePath);
      yield* profiles.report({ profiles: [], defaultProfileId: "incognito" });
      const restarted = yield* BrowserProfiles.make(filePath);
      expect(restarted.get().defaultProfileId).toBe("incognito");
      yield* restarted.report({ profiles: [], defaultProfileId: "default" });
      expect((yield* BrowserProfiles.make(filePath)).get().defaultProfileId).toBe("default");
    }),
  );

  it.effect("does not rewrite unchanged reports when clients reconnect", () =>
    Effect.gen(function* () {
      const filePath = yield* location;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const input = { profiles: [], defaultProfileId: "default" };
      const original = `${JSON.stringify(input, null, 2)}\n`;
      yield* fs.makeDirectory(path.dirname(filePath), { recursive: true });
      yield* fs.writeFileString(filePath, original);
      const profiles = yield* BrowserProfiles.make(filePath);
      yield* profiles.report(input);
      expect(yield* fs.readFileString(filePath)).toBe(original);
    }),
  );

  it.effect("recovers invalid settings and replaces them with a complete report", () =>
    Effect.gen(function* () {
      const filePath = yield* location;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.makeDirectory(path.dirname(filePath), { recursive: true });
      yield* fs.writeFileString(filePath, "{truncated");
      const profiles = yield* BrowserProfiles.make(filePath);
      expect(profiles.get().defaultProfileId).toBe("default");
      yield* profiles.report({ profiles: [], defaultProfileId: "unknown" });
      expect((yield* BrowserProfiles.make(filePath)).get().defaultProfileId).toBe("default");
      expect(yield* fs.readDirectory(path.dirname(filePath))).toEqual(["profiles.json"]);
    }),
  );
});
