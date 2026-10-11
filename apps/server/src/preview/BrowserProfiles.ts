import {
  BUILT_IN_BROWSER_PROFILES,
  DEFAULT_BROWSER_PROFILE_ID,
  findBrowserProfile,
  PreviewReportProfilesInput,
  resolveBrowserProfiles,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

const decode = Schema.decodeUnknownEffect(Schema.fromJsonString(PreviewReportProfilesInput));
const encode = Schema.encodeEffect(Schema.fromJsonString(PreviewReportProfilesInput));
const equivalent = Schema.toEquivalence(PreviewReportProfilesInput);

const normalize = (input: PreviewReportProfilesInput) => {
  const profiles = resolveBrowserProfiles(input.profiles);
  return {
    profiles,
    defaultProfileId:
      findBrowserProfile(profiles, input.defaultProfileId)?.id ?? DEFAULT_BROWSER_PROFILE_ID,
  };
};

/** Keep profile selection across server restarts, even before a client reconnects. */
export const make = Effect.fn("BrowserProfiles.make")(function* (filePath: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const lock = yield* Semaphore.make(1);
  let current = normalize({ profiles: [], defaultProfileId: DEFAULT_BROWSER_PROFILE_ID });
  const saved = yield* fs.readFileString(filePath).pipe(
    Effect.flatMap(decode),
    Effect.catchIf(
      (error) => error._tag === "PlatformError" && error.reason._tag === "NotFound",
      () => Effect.succeed(null),
    ),
    Effect.catch((cause) =>
      Effect.logWarning("Could not read saved browser profiles", { cause }).pipe(Effect.as(null)),
    ),
  );
  if (saved) current = normalize(saved);
  let persisted = saved ? current : null;

  const report = Effect.fn("BrowserProfiles.report")(function* (input: PreviewReportProfilesInput) {
    current = normalize(input);
    // Clients re-report on reconnect. Do not rewrite unchanged settings.
    if (persisted && equivalent(current, persisted)) return;
    const directory = path.dirname(filePath);
    yield* fs.makeDirectory(directory, { recursive: true });
    const temporary = yield* fs.makeTempFileScoped({ directory, prefix: ".profiles-" });
    // Store only custom profiles, as in the wire schema. Built-ins are added on read.
    const profiles = current.profiles.filter(
      (profile) => !BUILT_IN_BROWSER_PROFILES.some((builtin) => builtin.id === profile.id),
    );
    yield* fs.writeFileString(temporary, yield* encode({ ...current, profiles }));
    yield* fs.rename(temporary, filePath);
    persisted = current;
  });

  return {
    get: () => current,
    report: (input: PreviewReportProfilesInput) =>
      lock
        .withPermits(1)(report(input).pipe(Effect.scoped))
        .pipe(
          Effect.catch((cause) => Effect.logWarning("Could not save browser profiles", { cause })),
        ),
  };
});
