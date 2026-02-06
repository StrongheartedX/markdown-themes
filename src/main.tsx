import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppStoreProvider } from "./context/AppStoreContext";
import { WorkspaceProvider } from "./context/WorkspaceContext";
import { PageStateProvider } from "./context/PageStateContext";
import { AIChatProvider } from "./context/AIChatContext";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppStoreProvider>
        <WorkspaceProvider>
          <AIChatProvider>
            <PageStateProvider>
              <App />
            </PageStateProvider>
          </AIChatProvider>
        </WorkspaceProvider>
      </AppStoreProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
