import { render } from "preact";
import { App } from "./App";
import "./styles.css";
import { keepFresh } from "./lib/freshness";

render(<App />, document.getElementById("app")!);
keepFresh();
