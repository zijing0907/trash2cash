import { createBrowserRouter } from "react-router";

import { Shell } from "./components/Shell";
import { GuidePage } from "./pages/GuidePage";
import { HistoryPage } from "./pages/HistoryPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage, SignupPage } from "./pages/AuthPages";
import { ModelPage } from "./pages/ModelPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ScanPage } from "./features/scan/ScanPage";

export const routes = [
  {
    element: <Shell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "scan", element: <ScanPage /> },
      { path: "guide", element: <GuidePage /> },
      { path: "model", element: <ModelPage /> },
      { path: "me", element: <HistoryPage /> },
      { path: "login", element: <LoginPage /> },
      { path: "signup", element: <SignupPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
