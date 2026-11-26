import { createBrowserRouter } from "react-router";

import { Shell } from "./components/Shell";
import { AccountPage } from "./pages/AccountPage";
import { AdminBoardPage } from "./pages/AdminBoardPage";
import { CommunityPage } from "./pages/CommunityPage";
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
      { path: "community", element: <CommunityPage /> },
      // The map library is only downloaded by the screens that show a map
      { path: "map", lazy: () => import("./pages/MapPage").then((m) => ({ Component: m.MapPage })) },
      { path: "collect", lazy: () => import("./pages/CollectorPage").then((m) => ({ Component: m.CollectorPage })) },
      { path: "pickup", lazy: () => import("./pages/HomePickupPage").then((m) => ({ Component: m.HomePickupPage })) },
      { path: "model", element: <ModelPage /> },
      { path: "me", element: <AccountPage /> },
      { path: "rewards", element: <RewardsPage /> },
      { path: "operator", element: <OperatorPage /> },
      { path: "admin", element: <AdminBoardPage /> },
      {
        path: "admin/setup",
        lazy: () => import("./pages/AdminSetupPage").then((m) => ({ Component: m.AdminSetupPage })),
      },
      { path: "login", element: <LoginPage /> },
      { path: "signup", element: <SignupPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
