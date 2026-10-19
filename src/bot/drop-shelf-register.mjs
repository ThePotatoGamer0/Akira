import { register } from "tsx/esm/api";

// Worker threads on Node 22 load .ts files themselves and do not install
// tsx, so a .js import never becomes the .ts file beside it.
register();
