import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ScratchPad } from "./components/ScratchPad";
import { TodoAlertPane } from "./components/TodoAlert";
import "./styles.css";

const pane = new URLSearchParams(window.location.search).get("pane");
const tree =
  pane === "scratch" ? (
    <ScratchPad />
  ) : pane === "alert" ? (
    <TodoAlertPane />
  ) : (
    <App />
  );

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{tree}</React.StrictMode>,
);
