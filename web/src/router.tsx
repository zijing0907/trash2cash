import { createBrowserRouter } from "react-router";

import { Shell } from "./components/Shell";
import { AccountPage } from "./pages/AccountPage";
import { AdminBoardPage } from "./pages/AdminBoardPage";
import { AdminSetupPage } from "./pages/AdminSetupPage";
import { GuidePage } from "./pages/GuidePage";
import { HomePage } from "./pages/HomePage";
import { LoginPage, SignupPage } from "./pages/AuthPages";
import { ModelPage } from "./pages/ModelPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OperatorPage } from "./pages/OperatorPage";
import { RewardsPage } from "./pages/RewardsPage";
import { ScanPage } from "./features/scan/ScanPage";

export const routes = [
  {
    element: <Shell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "scan", element: <ScanPage /> },
      { path: "guide", element: <GuidePage /> },
      { path: "model", element: <ModelPage /> },
      { path: "me", element: <AccountPage /> },
      { path: "rewards", element: <RewardsPage /> },
      { path: "operator", element: <OperatorPage /> },
      { path: "admin", element: <AdminBoardPage /> },
      { path: "admin/setup", element: <AdminSetupPage /> },
      { path: "login", element: <LoginPage /> },
      { path: "signup", element: <SignupPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
