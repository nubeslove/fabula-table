import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { InterfaceSoundProvider } from "./components/InterfaceSound";
import "./styles.css";
import "./styles/game-layout.css";
import "./styles/table-workspaces.css";
import "./styles/lobby-workspace.css";
import "./styles/adventure.css";
import "./styles/battle-workbench.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <InterfaceSoundProvider>
      <App />
    </InterfaceSoundProvider>
  </React.StrictMode>,
);
