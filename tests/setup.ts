import { afterEach } from "vitest";
import { resetIframeContentWindowStub } from "./test-utils";

// gga round 3, finding R3-003: a global, always-on reset — not something each test file
// has to remember to call in its own afterEach — so a test that never calls
// stubIframeContentWindow() itself can never inherit a stale fake window an earlier test
// installed.
afterEach(() => {
  resetIframeContentWindowStub();
});
