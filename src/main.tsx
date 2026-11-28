import { render } from "preact";
import { App } from "./App";
import "./styles.css";
import { keepFresh } from "./lib/freshness";
import { setupPwa } from "./lib/pwa";

setupPwa();
render(<App />, document.getElementById("app")!);
keepFresh();
