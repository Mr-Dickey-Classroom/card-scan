// js-aruco2@2.0.0 (MIT, see js-aruco2-LICENSE.txt), bundled so the app never loads it from the internet.
// cv.js and aruco.js are the untouched originals. They are old-style scripts that attach CV and AR to
// `this`, so they run here in their own function scope and we export what they attach.
import cvSource from "./cv.js?raw";
import arucoSource from "./aruco.js?raw";

const scope = {};
new Function(cvSource).call(scope);
new Function("require", arucoSource).call(scope, () => scope);

export const AR = scope.AR;
export const CV = scope.CV;
